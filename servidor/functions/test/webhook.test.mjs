import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { criarDeps, semearConta, auth, CPF, evento, N, P } from "./dubles.mjs";
const require = createRequire(import.meta.url);
const { assinar } = require("../assinatura.js");
const { tratarWebhook } = require("../webhook.js");

const TOKEN = "tok-webhook-secreto-123456789012345678";
const enviar = (d, ev, token = TOKEN, metodo = "POST") => tratarWebhook(d, { metodo, token, corpo: ev });
// prepara conta com assinatura pendente criada de verdade por assinar()
async function preparar(plano, ciclo, extras, contaExtra = {}, fundadorCheio = false) {
  const d = criarDeps(); if (fundadorCheio) d.store.semear("vagas/fundador", { usadas: 100, total: 100, ate: P.VAGAS_PADRAO.fundador.ate }); semearConta(d, "u1", { whats: "(88) 99708-4754", whatsOk: true, ...contaExtra });
  const r = await assinar(d, auth(), { nome: "Maria da Silva", cpfCnpj: CPF, plano, ciclo, extras });
  const cob = [...d.asaas.cobr.values()][0];
  const pay = (over = {}) => ({ id: cob.id, customer: "cus_1", subscription: r.assinatura, externalReference: "u1", value: r.valor, dueDate: "2026-11-10", billingType: "PIX", invoiceUrl: cob.invoiceUrl, paymentDate: "2026-11-10", ...over });
  return { d, r, cob, pay };
}

for (const [plano, def] of Object.entries(P.PLANOS)) for (const ciclo of Object.keys(def.ciclos)) {
  test(`webhook pago ${plano} ${ciclo}: aplica plano, mod, maq e f = próximo vencimento + ${P.TOLERANCIA_DIAS} dias`, async () => {
    const { d, pay, cob } = await preparar(plano, ciclo, 0, {}, !!def.depoisDe);
    const r = await enviar(d, evento("PAYMENT_RECEIVED", pay()));
    assert.equal(r.status, 200);
    const c = await d.store.get("contas/u1");
    const prox = N.somarCiclo("2026-11-10", ciclo);
    assert.equal(c.plano, plano); assert.equal(c.f, N.somarDias(prox, P.TOLERANCIA_DIAS)); assert.equal(c.maq, def.maq);
    assert.deepEqual(c.mod, def.mod); assert.equal(c.lim, null);
    assert.equal(c.assin.status, "ativa"); assert.equal(c.assin.prox, prox); assert.equal(c.assin.desde, "2026-11-10");
    const pg = await d.store.get("pagamentos/" + cob.id); assert.equal(pg.status, "pago"); assert.equal(pg.pagoEm, "2026-11-10");
    const av = await d.store.consultar("avisos/u1/itens"); assert.equal(av.length, 1); assert.equal(av[0].lido, false);
    assert.equal(d.enviarEmail.enviados.length, 1); assert.match(d.enviarEmail.enviados[0].subject, /Pagamento confirmado/);
    assert.equal(d.wa.enviados[0].modelo, "pagamento_confirmado");
  });
}
test("Essencial usa exatamente os módulos do programa (obras + sem_licitacao); Fundador e Profissional = tudo (mod null)", async () => {
  let x = await preparar("essencial", "mensal"); await enviar(x.d, evento("PAYMENT_CONFIRMED", x.pay()));
  assert.deepEqual((await x.d.store.get("contas/u1")).mod, ["obras", "sem_licitacao"]); assert.equal((await x.d.store.get("contas/u1")).maq, 1);
  x = await preparar("profissional", "mensal", 0, {}, true); await enviar(x.d, evento("PAYMENT_CONFIRMED", x.pay()));
  assert.equal((await x.d.store.get("contas/u1")).mod, null); assert.equal((await x.d.store.get("contas/u1")).maq, 2);
});
test("webhook pago Fundador (mensal e anual): maq 3, mod null, plano fundador, vaga contada uma vez", async () => {
  for (const ciclo of ["mensal", "anual"]) {
    const { d, pay } = await preparar("fundador", ciclo); await enviar(d, evento("PAYMENT_RECEIVED", pay()));
    const c = await d.store.get("contas/u1");
    assert.equal(c.plano, "fundador"); assert.equal(c.maq, 3); assert.equal(c.mod, null); assert.equal(c.assin.status, "ativa"); assert.equal(c.f, N.somarDias(N.somarCiclo("2026-11-10", ciclo), P.TOLERANCIA_DIAS));
    assert.equal((await d.store.get("vagas/fundador")).usadas, 1);
  }
});
test("Empresas aplicada pela Central (5 computadores) não depende de venda: preset do plano é 5, sem extra pago", () => {
  assert.equal(P.PLANOS.empresas.maq, 5); assert.equal(P.PLANOS.empresas.maxMaq, 10); assert.equal(N.camposDoPlano({ plano: "empresas", ciclo: "anual", venc: "2026-11-10", extras: 3 }).conta.maq, 5);
});
test("CONFIRMED depois RECEIVED (cartão) aplica uma vez só: 1 aviso, 1 e-mail, f igual", async () => {
  const { d, pay } = await preparar("fundador", "anual");
  await enviar(d, evento("PAYMENT_CONFIRMED", pay())); const f1 = (await d.store.get("contas/u1")).f;
  await enviar(d, evento("PAYMENT_RECEIVED", pay({ paymentDate: "2026-12-12" })));
  assert.equal((await d.store.get("contas/u1")).f, f1);
  assert.equal((await d.store.consultar("avisos/u1/itens")).length, 1); assert.equal(d.enviarEmail.enviados.length, 1);
  assert.equal((await d.store.get("pagamentos/" + pay().id)).pagoEm, "2026-11-10");
});
test("renovação paga estende f a partir do vencimento seguinte (e não encolhe)", async () => {
  const { d, pay, r } = await preparar("fundador", "mensal");
  await enviar(d, evento("PAYMENT_RECEIVED", pay()));
  const f1 = (await d.store.get("contas/u1")).f; assert.equal(f1, "2026-12-15");
  const r2 = await enviar(d, evento("PAYMENT_RECEIVED", { ...pay({ id: "pay_renov", dueDate: "2026-12-10", paymentDate: "2026-12-10" }) }));
  assert.equal(r2.status, 200);
  const c = await d.store.get("contas/u1");
  assert.equal(c.f, "2027-01-15"); assert.equal(c.assin.prox, "2027-01-10"); assert.equal(c.assin.desde, "2026-11-10");
  assert.match(d.enviarEmail.enviados[1].subject, /Renovação confirmada/);
  // pagamento antigo reenviado depois (outro id de evento) não encolhe a validade
  await enviar(d, evento("PAYMENT_RECEIVED", pay()));
  assert.equal((await d.store.get("contas/u1")).f, "2027-01-15");
});
test("vaga do Fundador/lançamento é contada uma vez, mesmo com renovação", async () => {
  const comVaga = Object.entries(P.PLANOS).find(([, x]) => x.vaga); if (!comVaga) return;
  const [pl, def] = comVaga, ciclo = Object.keys(def.ciclos)[0];
  const { d, pay } = await preparar(pl, ciclo);
  await enviar(d, evento("PAYMENT_CONFIRMED", pay())); await enviar(d, evento("PAYMENT_RECEIVED", pay()));
  await enviar(d, evento("PAYMENT_RECEIVED", pay({ id: "pay_2", dueDate: "2027-11-10" })));
  assert.equal((await d.store.get("vagas/" + def.vaga)).usadas, 1);
});
test("atrasado: marca assinatura e pagamento, avisa, NÃO mexe no plano nem em f", async () => {
  const { d, pay } = await preparar("fundador", "mensal");
  await enviar(d, evento("PAYMENT_RECEIVED", pay()));
  const antes = await d.store.get("contas/u1");
  await enviar(d, evento("PAYMENT_OVERDUE", pay({ id: "pay_2", dueDate: "2026-12-10" })));
  const c = await d.store.get("contas/u1");
  assert.equal(c.assin.status, "atrasada"); assert.equal(c.plano, antes.plano); assert.equal(c.f, antes.f); assert.equal(c.maq, antes.maq);
  assert.equal((await d.store.get("pagamentos/pay_2")).status, "atrasado");
  assert.ok(d.enviarEmail.enviados.some(m => /atraso/i.test(m.subject)));
  assert.ok(d.wa.enviados.some(m => m.modelo === "pagamento_atrasado" && m.v.link));
  await enviar(d, evento("PAYMENT_RECEIVED", pay({ id: "pay_2", dueDate: "2026-12-10" })));   // pagou depois: volta a ativa
  assert.equal((await d.store.get("contas/u1")).assin.status, "ativa");
});
test("overdue de cobrança já paga é ignorado", async () => {
  const { d, pay } = await preparar("fundador", "mensal");
  await enviar(d, evento("PAYMENT_RECEIVED", pay())); const r = await enviar(d, evento("PAYMENT_OVERDUE", pay()));
  assert.equal(r.corpo.acao, "ja_pago"); assert.equal((await d.store.get("contas/u1")).assin.status, "ativa");
});
for (const ev of ["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"]) test(`${ev}: volta à regra da cortesia e cancela a assinatura`, async () => {
  const { d, pay, cob, r } = await preparar("fundador", "anual");
  await enviar(d, evento("PAYMENT_RECEIVED", pay()));
  await enviar(d, evento(ev, pay()));
  const c = await d.store.get("contas/u1");
  assert.equal(c.plano, "cortesia3m"); assert.equal(c.f, null); assert.equal(c.mod, null); assert.equal(c.maq, null); assert.equal(c.assin.status, "cancelada");
  assert.equal((await d.store.get("pagamentos/" + cob.id)).status, "estornado");
  assert.ok(d.asaas.chamadas.some(x => x[0] === "cancelarAssinatura" && x[1] === r.assinatura));
  assert.ok(d.enviarEmail.enviados.some(m => /estornado/i.test(m.subject)) && d.enviarEmail.enviados.some(m => m.to === "dono@teste.com"));
  await enviar(d, evento("PAYMENT_RECEIVED", pay()));   // CONFIRMED tardio depois do estorno não reativa
  assert.equal((await d.store.get("contas/u1")).plano, "cortesia3m");
});
test("estorno de pagamento antigo com pagamento mais novo pago mantém o plano", async () => {
  const { d, pay } = await preparar("fundador", "mensal");
  await enviar(d, evento("PAYMENT_RECEIVED", pay())); await enviar(d, evento("PAYMENT_RECEIVED", pay({ id: "pay_2", dueDate: "2026-12-10" })));
  const r = await enviar(d, evento("PAYMENT_REFUNDED", pay()));
  assert.equal(r.corpo.acao, "estornado_plano_mantido"); assert.equal((await d.store.get("contas/u1")).plano, "fundador");
});
for (const ev of ["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]) test(`${ev}: assinatura cancelada, plano vale até f`, async () => {
  const { d, pay, r } = await preparar("fundador", "mensal");
  await enviar(d, evento("PAYMENT_RECEIVED", pay())); const antes = await d.store.get("contas/u1");
  const e = { id: "evt_sub", event: ev, subscription: { id: r.assinatura, customer: "cus_1", externalReference: "u1" } };
  assert.equal((await enviar(d, e)).status, 200);
  const c = await d.store.get("contas/u1"); assert.equal(c.assin.status, "cancelada"); assert.equal(c.plano, "fundador"); assert.equal(c.f, antes.f);
  assert.ok(d.enviarEmail.enviados.some(m => /cancelada/i.test(m.subject)));
});
test("assinatura antiga (trocada) cancelada não derruba a assinatura atual", async () => {
  const { d, pay } = await preparar("fundador", "mensal");
  const r = await enviar(d, { id: "evt_old", event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_antiga", externalReference: "u1" } });
  assert.equal(r.corpo.acao, "assinatura_antiga"); assert.equal((await d.store.get("contas/u1")).assin.status, "pendente");
});

// ---- idempotência, segurança
test("evento repetido: processa uma vez (200 duplicado) e não duplica e-mail/aviso", async () => {
  const { d, pay } = await preparar("essencial", "mensal"); const ev = evento("PAYMENT_RECEIVED", pay(), "evt_fixo");
  const a = await enviar(d, ev), b = await enviar(d, ev);
  assert.equal(a.corpo.duplicado, undefined); assert.equal(b.status, 200); assert.equal(b.corpo.duplicado, true);
  assert.equal(d.enviarEmail.enviados.length, 1); assert.equal((await d.store.get("eventos/evt_fixo")).estado, "ok");
});
test("falha no meio devolve 500, guarda o erro e o reenvio do mesmo evento termina o serviço", async () => {
  const { d, pay } = await preparar("essencial", "mensal"); const ev = evento("PAYMENT_RECEIVED", pay(), "evt_falha");
  const orig = d.store.transacao; d.store.set = (o => async function (p, ...r) { if (p === "contas/u1" && d._quebrar) { d._quebrar = false; throw new Error("firestore"); } return o.call(this, p, ...r); })(d.store.set);
  d._quebrar = true;
  const a = await enviar(d, ev); assert.equal(a.status, 500); assert.equal((await d.store.get("eventos/evt_falha")).estado, "erro");
  const b = await enviar(d, ev); assert.equal(b.status, 200); assert.equal((await d.store.get("contas/u1")).plano, "essencial");
  assert.equal((await d.store.get("eventos/evt_falha")).tentativas, 2);
});
test("token errado, ausente ou vazio: 401 e nada é gravado", async () => {
  const { d, pay } = await preparar("essencial", "mensal"); const antes = d.store.docs.size;
  for (const t of ["errado", "", null, TOKEN + "x"]) assert.equal((await enviar(d, evento("PAYMENT_RECEIVED", pay()), t)).status, 401);
  d.config.tokenWebhook = ""; assert.equal((await enviar(d, evento("PAYMENT_RECEIVED", pay()), "")).status, 401);
  assert.equal(d.store.docs.size, antes); assert.equal((await d.store.get("contas/u1")).plano, "cortesia3m");
});
test("método errado 405; corpo sem id/event 400; evento desconhecido 200 ignorado", async () => {
  const { d } = await preparar("essencial", "mensal");
  assert.equal((await enviar(d, {}, TOKEN, "GET")).status, 405); assert.equal((await enviar(d, { foo: 1 })).status, 400);
  const r = await enviar(d, { id: "evt_x", event: "PAYMENT_BANK_SLIP_VIEWED", payment: { id: "pay_z", externalReference: "u1" } });
  assert.equal(r.status, 200); assert.equal(r.corpo.acao, "ignorado");
});
test("cobrança de conta desconhecida: 200, avisa o dono, não inventa plano", async () => {
  const d = criarDeps(); const r = await enviar(d, evento("PAYMENT_RECEIVED", { id: "pay_1", customer: "cus_9", externalReference: "ninguem", value: 10 }));
  assert.equal(r.status, 200); assert.equal(r.corpo.acao, "sem_conta"); assert.equal(d.enviarEmail.enviados[0].to, "dono@teste.com");
});
test("sem WhatsApp consentido ou com WA_ATIVO=nao: só e-mail, nada quebra", async () => {
  let x = await preparar("essencial", "mensal", 0, { whatsOk: false }); await enviar(x.d, evento("PAYMENT_RECEIVED", x.pay()));
  assert.equal(x.d.wa.enviados.length, 0); assert.equal(x.d.enviarEmail.enviados.length, 1);
  x = await preparar("essencial", "mensal"); x.d.wa.ativo = false; await enviar(x.d, evento("PAYMENT_RECEIVED", x.pay()));
  assert.equal(x.d.wa.enviados.length, 0); assert.equal(x.d.enviarEmail.enviados.length, 1);
});
test("e-mail ou WhatsApp com erro não derruba o webhook (plano já aplicado)", async () => {
  const { d, pay } = await preparar("essencial", "mensal"); d.enviarEmail.quebrar = true; d.wa.enviarModelo = async () => { throw new Error("meta"); };
  assert.equal((await enviar(d, evento("PAYMENT_RECEIVED", pay()))).status, 200); assert.equal((await d.store.get("contas/u1")).plano, "essencial");
});
test("nota fiscal autorizada grava o link no pagamento", async () => {
  const { d, pay, cob } = await preparar("essencial", "mensal"); await enviar(d, evento("PAYMENT_RECEIVED", pay()));
  await enviar(d, { id: "evt_nf", event: "INVOICE_AUTHORIZED", invoice: { id: "inv_1", payment: cob.id, pdfUrl: "https://nf/1.pdf" } });
  assert.equal((await d.store.get("pagamentos/" + cob.id)).nf, "https://nf/1.pdf");
});
test("resolve a conta pelo id da assinatura quando a cobrança não traz externalReference", async () => {
  const { d, pay } = await preparar("essencial", "mensal"); await enviar(d, evento("PAYMENT_RECEIVED", pay({ externalReference: undefined, customer: "outro" })));
  assert.equal((await d.store.get("contas/u1")).plano, "essencial");
});
test("PAYMENT_CREATED registra pendente; PAYMENT_DELETED remove pendente", async () => {
  const { d, pay } = await preparar("fundador", "mensal");
  await enviar(d, evento("PAYMENT_CREATED", pay({ id: "pay_n", dueDate: "2026-12-10" })));
  assert.equal((await d.store.get("pagamentos/pay_n")).status, "pendente");
  await enviar(d, evento("PAYMENT_DELETED", pay({ id: "pay_n" }))); assert.equal((await d.store.get("pagamentos/pay_n")).status, "removido");
});
