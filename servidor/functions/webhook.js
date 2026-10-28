"use strict";
const crypto = require("crypto");
const N = require("./negocio");
const T = require("./textos");
const { avisar, avisarDono } = require("./avisar");

const PAGOS_EV = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"];
const ESTORNO_EV = ["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"];
const SUB_FIM_EV = ["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"];

function tokenOk(recebido, esperado) {
  if (!esperado || typeof recebido !== "string") return false;
  const a = crypto.createHash("sha256").update(recebido).digest(), b = crypto.createHash("sha256").update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}
const limpo = o => { const r = {}; for (const k of Object.keys(o)) if (o[k] !== undefined) r[k] = o[k]; return r; };

// req = { metodo, token, corpo }  ->  { status, corpo }. Responde 200 só depois de gravar o evento; erro de processamento = 500 (o Asaas reenvia).
async function tratarWebhook(deps, req) {
  if (req.metodo !== "POST") return { status: 405, corpo: { erro: "metodo" } };
  if (!tokenOk(req.token, deps.config.tokenWebhook)) return { status: 401, corpo: { erro: "token" } };
  const ev = req.corpo;
  if (!ev || typeof ev !== "object" || !ev.id || !ev.event) return { status: 400, corpo: { erro: "evento_invalido" } };
  const { store, agora } = deps, ref = "eventos/" + String(ev.id).replace(/\//g, "_");
  const criou = await store.criar(ref, { event: ev.event, em: new Date(agora()), estado: "processando", tentativas: 1 });
  if (!criou) {
    const ex = (await store.get(ref)) || {};
    if (ex.estado === "ok") return { status: 200, corpo: { ok: true, duplicado: true } };
    await store.set(ref, { estado: "processando", tentativas: (ex.tentativas || 1) + 1 }, { merge: true });
  }
  try {
    const r = await processar(deps, ev);
    await store.set(ref, { estado: "ok", acao: r.acao }, { merge: true });
    return { status: 200, corpo: { ok: true, acao: r.acao } };
  } catch (e) {
    console.error("webhook", ev.id, e && e.stack);
    await store.set(ref, { estado: "erro", erro: String(e && e.message).slice(0, 300) }, { merge: true });
    return { status: 500, corpo: { erro: "processamento" } };
  }
}

async function acharConta(deps, { ref, subscription, customer }) {
  const { store } = deps;
  if (ref && !String(ref).includes("/")) { const c = await store.get("contas/" + ref); if (c) return { uid: ref, conta: c }; }
  if (subscription) { const L = await store.consultar("contas", [["assin.id", "==", subscription]]); if (L[0]) return { uid: L[0].id, conta: L[0] }; }
  if (customer) { const L = await store.consultar("contas", [["asaasCliente", "==", customer]]); if (L[0]) return { uid: L[0].id, conta: L[0] }; }
  return null;
}

async function processar(deps, ev) {
  const t = ev.event;
  if (t.startsWith("PAYMENT_") && ev.payment) return processarCobranca(deps, ev);
  if (SUB_FIM_EV.includes(t) && ev.subscription) return processarAssinaturaFim(deps, ev);
  if (t === "INVOICE_AUTHORIZED" && ev.invoice && ev.invoice.payment) {
    const p = await deps.store.get("pagamentos/" + ev.invoice.payment);
    if (p && ev.invoice.pdfUrl) await deps.store.set("pagamentos/" + ev.invoice.payment, { nf: ev.invoice.pdfUrl }, { merge: true });
    return { acao: p ? "nf" : "nf_sem_pagamento" };
  }
  return { acao: "ignorado" };
}

async function processarCobranca(deps, ev) {
  const { store, agora } = deps, p = ev.payment, t = ev.event, hoje = N.hojeFortaleza(agora());
  const achou = await acharConta(deps, { ref: p.externalReference, subscription: p.subscription, customer: p.customer });
  if (!achou) { await avisarDono(deps, "Webhook Asaas: cobrança sem conta", [`Evento ${t}, cobrança ${p.id}, cliente ${p.customer}. Conferir no painel do Asaas.`]); return { acao: "sem_conta" }; }
  const { uid } = achou; let conta = achou.conta; const a = conta.assin || null;
  const pagRef = "pagamentos/" + p.id, pag = await store.get(pagRef);
  // cobrança de uma assinatura que não é mais a atual (troca antes de pagar): só registra e avisa o dono
  if (!a || (p.subscription && a.id && a.id !== p.subscription)) {
    await store.set(pagRef, limpo({ uid, status: PAGOS_EV.includes(t) ? "pago" : "pendente", valor: p.value, venc: p.dueDate, link: p.invoiceUrl, assinatura: p.subscription || null }), { merge: true });
    if (PAGOS_EV.includes(t)) await avisarDono(deps, "Pagamento de assinatura antiga/sem plano", [`Conta ${uid}, cobrança ${p.id}, R$ ${p.value}. Conferir e liberar o plano à mão se for o caso.`]);
    return { acao: "assinatura_diferente" };
  }
  const base = limpo({ uid, plano: a.plano, ciclo: a.ciclo, valor: p.value, venc: p.dueDate, link: p.invoiceUrl, metodo: p.billingType, assinatura: p.subscription || a.id });

  if (pag && pag.status === "estornado" && !ESTORNO_EV.includes(t)) return { acao: "ja_estornado" };

  if (PAGOS_EV.includes(t)) {
    const pagoEm = (pag && pag.pagoEm) || p.paymentDate || p.confirmedDate || hoje;
    await store.set(pagRef, Object.assign(base, { status: "pago", pagoEm }), { merge: true });
    const cp = N.camposDoPlano({ plano: a.plano, ciclo: a.ciclo, venc: p.dueDate || hoje, extras: a.extras, fAtual: conta.f });
    if (!cp) return { acao: "plano_desconhecido" };
    const primeira = !a.desde;
    // vaga do Fundador / lançamento Empresas: conta uma vez, na 1ª confirmação (transação)
    if (a.vaga && !a.vagaContada) {
      await store.transacao(async tx => {
        const v = (await tx.get("vagas/" + a.vaga)) || {}, c = await tx.get("contas/" + uid);
        if (c && c.assin && c.assin.vagaContada) return;
        tx.set("vagas/" + a.vaga, { usadas: (+v.usadas || 0) + 1 }, { merge: true });
        tx.set("contas/" + uid, { assin: { vagaContada: true } }, { merge: true });
      });
    }
    await store.set("contas/" + uid, { plano: cp.conta.plano, f: cp.conta.f, lim: null, mod: cp.conta.mod, maq: cp.conta.maq, assin: { status: "ativa", prox: cp.prox, metodo: p.billingType || a.metodo, desde: a.desde || hoje } }, { merge: true });
    conta = Object.assign({}, conta, { plano: cp.conta.plano, f: cp.conta.f });
    const av = T.T.pagamento({ plano: a.plano, f: cp.conta.f, primeira });
    await avisar(deps, { uid, conta, avisoId: "pg-" + p.id, aviso: av, link: p.invoiceUrl, wa: { modelo: "pagamento_confirmado", valores: { plano: T.nomePlano(a.plano), validade: T.fData(cp.conta.f) } } });
    return { acao: "pago" };
  }

  if (t === "PAYMENT_OVERDUE") {
    if (pag && (pag.status === "pago" || pag.status === "estornado")) return { acao: "ja_pago" };
    await store.set(pagRef, Object.assign(base, { status: "atrasado" }), { merge: true });
    if (a.status !== "cancelada") await store.set("contas/" + uid, { assin: { status: "atrasada" } }, { merge: true });
    const av = T.T.atraso({ plano: a.plano, f: conta.f, link: p.invoiceUrl });
    await avisar(deps, { uid, conta, avisoId: "atraso-" + p.id, aviso: av, link: p.invoiceUrl, wa: { modelo: "pagamento_atrasado", valores: { plano: T.nomePlano(a.plano), link: p.invoiceUrl || "Minha conta" } } });
    return { acao: "atrasado" };
  }

  if (ESTORNO_EV.includes(t)) {
    if (pag && pag.status === "estornado") return { acao: "ja_estornado" };
    await store.set(pagRef, Object.assign(base, { status: "estornado" }), { merge: true });
    // se há outro pagamento pago mais recente, o plano continua; senão volta à regra da cortesia
    const outros = (await store.consultar("pagamentos", [["uid", "==", uid], ["status", "==", "pago"]])).filter(x => x.id !== p.id && String(x.venc || "") > String(p.dueDate || ""));
    if (outros.length) return { acao: "estornado_plano_mantido" };
    await store.set("contas/" + uid, Object.assign(N.camposCortesia(), { assin: { status: "cancelada" } }), { merge: true });
    if (a.id) { try { await deps.asaas.cancelarAssinatura(a.id); } catch (e) { /* já cancelada */ } }
    await avisar(deps, { uid, conta, avisoId: "estorno-" + p.id, aviso: T.T.estorno() });
    await avisarDono(deps, "Estorno/chargeback no Planejar Obras", [`Conta ${uid}, cobrança ${p.id}, evento ${t}. Plano voltou à cortesia.`]);
    return { acao: "estornado" };
  }

  if (t === "PAYMENT_CREATED" || t === "PAYMENT_UPDATED") {
    if (!pag || (pag.status !== "pago" && pag.status !== "estornado")) await store.set(pagRef, Object.assign(base, { status: pag && pag.status === "atrasado" && t === "PAYMENT_UPDATED" ? "atrasado" : "pendente", pagoEm: null }), { merge: true });
    return { acao: "registrado" };
  }
  if (t === "PAYMENT_DELETED") {
    if (pag && pag.status === "pendente") await store.set(pagRef, { status: "removido" }, { merge: true });
    return { acao: "removido" };
  }
  return { acao: "ignorado" };
}

async function processarAssinaturaFim(deps, ev) {
  const s = ev.subscription, achou = await acharConta(deps, { ref: s.externalReference, subscription: s.id, customer: s.customer });
  if (!achou || !achou.conta.assin) return { acao: "sem_conta" };
  const { uid, conta } = achou;
  if (conta.assin.id && conta.assin.id !== s.id) return { acao: "assinatura_antiga" };   // a antiga foi trocada: a atual não muda
  if (conta.assin.status === "cancelada") return { acao: "ja_cancelada" };
  await deps.store.set("contas/" + uid, { assin: { status: "cancelada" } }, { merge: true });
  await avisar(deps, { uid, conta, avisoId: "cancelada-" + s.id, aviso: T.T.cancelada({ f: conta.f }), wa: { modelo: "assinatura_cancelada", valores: { validade: T.fData(conta.f) } } });
  return { acao: "cancelada" };
}
module.exports = { tratarWebhook, tokenOk };
