"use strict";
const crypto = require("crypto");
const N = require("./negocio");
const { PLANOS } = require("./planos");
const { avisar, avisarDono } = require("./avisar");
const T = require("./textos");

const ErroNegocio = N.ErroNegocio;
function exigirLogin(auth) {
  if (!auth || !auth.uid) throw new ErroNegocio("unauthenticated", "Entre na sua conta para continuar.");
  if (auth.emailVerificado !== true) throw new ErroNegocio("failed-precondition", "Confirme o seu e-mail antes de assinar.");
}
async function lerVagas(store) {
  return { fundador: await store.get("vagas/fundador") };
}
const hashCpf = cpf => crypto.createHash("sha256").update("planejar:" + cpf).digest("hex");

// ---------------------------------------------------------------- assinar
async function assinar(deps, auth, dados) {
  exigirLogin(auth);
  const { store, asaas, agora } = deps, hoje = N.hojeFortaleza(agora());
  dados = dados || {};
  const cpf = N.validarCpfCnpj(dados.cpfCnpj);
  if (!cpf) throw new ErroNegocio("invalid-argument", "CPF ou CNPJ inválido. Confira os números.");
  const nome = String(dados.nome || "").trim();
  if (nome.length < 3 || nome.length > 120) throw new ErroNegocio("invalid-argument", "Informe o seu nome completo.");
  const conta = await store.get("contas/" + auth.uid);
  if (!conta) throw new ErroNegocio("failed-precondition", "Sua conta ainda não foi criada. Abra o programa e conclua o cadastro.");
  if (conta.assin && (conta.assin.status === "ativa" || conta.assin.status === "atrasada")) throw new ErroNegocio("already-exists", "Você já tem uma assinatura. Para mudar, use 'Trocar plano' em Minha conta.");

  const oferta = N.calcularOferta({ plano: dados.plano, ciclo: dados.ciclo, extras: dados.extras, hoje, vagas: await lerVagas(store) });
  if (!oferta.ok) throw new ErroNegocio("failed-precondition", oferta.mensagem, oferta.codigo);
  if (PLANOS[dados.plano].unicoPorCpf) {   // 1 por CPF
    const h = hashCpf(cpf), reg = await store.get("fundadores/" + h);
    if (reg && reg.uid !== auth.uid) throw new ErroNegocio("already-exists", "Já existe uma assinatura deste plano para este CPF. Escolha outro plano.");
  }
  // cliente Asaas (reaproveita)
  let cliente = conta.asaasCliente;
  if (!cliente) {
    const ex = await asaas.buscarClientePorReferencia(auth.uid);
    cliente = ex ? ex.id : (await asaas.criarCliente({ name: nome, cpfCnpj: cpf, email: auth.email || conta.email, externalReference: auth.uid, notificationDisabled: false })).id;
  }
  // assinatura pendente antiga (outro plano escolhido antes): cancela para não sobrar cobrança
  if (conta.assin && conta.assin.id && conta.assin.status === "pendente") { try { await asaas.cancelarAssinatura(conta.assin.id); } catch (e) { /* já removida */ } }
  const sub = await asaas.criarAssinatura({ customer: cliente, billingType: "UNDEFINED", value: oferta.valor, nextDueDate: hoje, cycle: oferta.cicloAsaas, description: oferta.descricao, externalReference: auth.uid });
  // link da 1ª cobrança (o Asaas a cria junto com a assinatura; tenta algumas vezes)
  let cob = null;
  for (let i = 0; i < 4 && !cob; i++) {
    const L = await asaas.cobrancasDaAssinatura(sub.id);
    cob = L.find(x => x.invoiceUrl) || null;
    if (!cob && i < 3) await deps.sleep(1000);
  }
  if (PLANOS[dados.plano].unicoPorCpf) await store.set("fundadores/" + hashCpf(cpf), { uid: auth.uid, em: new Date(agora()) });
  await store.set("contas/" + auth.uid, { asaasCliente: cliente, assin: { id: sub.id, plano: oferta.plano, ciclo: oferta.ciclo, status: "pendente", prox: hoje, metodo: "UNDEFINED", desde: null, valor: oferta.valor, extras: oferta.extras, vaga: oferta.vaga, vagaContada: false } }, { merge: true });
  if (cob) await store.set("pagamentos/" + cob.id, { uid: auth.uid, plano: oferta.plano, ciclo: oferta.ciclo, valor: oferta.valor, status: "pendente", venc: cob.dueDate || hoje, pagoEm: null, link: cob.invoiceUrl, nf: null, assinatura: sub.id }, { merge: true });
  return { ok: true, link: cob ? cob.invoiceUrl : null, valor: oferta.valor, plano: oferta.plano, ciclo: oferta.ciclo, assinatura: sub.id, aviso: cob ? null : "O link ainda não ficou pronto. Abra Minha conta em alguns instantes." };
}

// ---------------------------------------------------------------- minhaAssinatura: ver | cancelar | trocarPlano
async function minhaAssinatura(deps, auth, dados) {
  if (!auth || !auth.uid) throw new ErroNegocio("unauthenticated", "Entre na sua conta para continuar.");
  const { store, asaas, agora } = deps, acao = (dados && dados.acao) || "ver";
  const conta = await store.get("contas/" + auth.uid);
  if (!conta) throw new ErroNegocio("not-found", "Conta não encontrada.");
  const a = conta.assin || null;
  if (acao === "ver") {
    const L = (await store.consultar("pagamentos", [["uid", "==", auth.uid]])).sort((x, y) => String(y.venc || "").localeCompare(String(x.venc || ""))).slice(0, 12);
    return { plano: conta.plano || "cortesia3m", f: conta.f || null, assinatura: a ? { plano: a.plano, ciclo: a.ciclo, status: a.status, prox: a.prox, metodo: a.metodo, valor: a.valor, desde: a.desde } : null, faturas: L.map(p => ({ id: p.id, valor: p.valor, status: p.status, venc: p.venc, pagoEm: p.pagoEm || null, link: p.link || null, nf: p.nf || null })) };
  }
  exigirLogin(auth);
  if (!a || !a.id) throw new ErroNegocio("failed-precondition", "Você não tem assinatura.");
  if (acao === "cancelar") {
    if (a.status === "cancelada") return { ok: true, status: "cancelada", f: conta.f || null };
    try { await asaas.cancelarAssinatura(a.id); } catch (e) { if (!(e && e.status === 404)) throw e; }
    await store.set("contas/" + auth.uid, { assin: { status: "cancelada" } }, { merge: true });
    const av = T.T.cancelada({ f: conta.f });
    await avisar(deps, { uid: auth.uid, conta, avisoId: "cancelada-" + a.id, aviso: av, wa: { modelo: "assinatura_cancelada", valores: { validade: T.fData(conta.f) } } });
    return { ok: true, status: "cancelada", f: conta.f || null };
  }
  if (acao === "trocarPlano") {
    if (a.status === "pendente" || a.status === "cancelada") throw new ErroNegocio("failed-precondition", "Para mudar de plano agora, faça uma nova assinatura.");
    if ((PLANOS[a.plano] && PLANOS[a.plano].travado) || a.vaga) throw new ErroNegocio("failed-precondition", "Seu plano tem preço travado de lançamento e não pode ser trocado por aqui. Fale com o suporte.");
    if (PLANOS[dados.plano] && PLANOS[dados.plano].vaga) throw new ErroNegocio("failed-precondition", "Esse plano de lançamento só vale para quem assina agora, em 'Assinar'.");
    const hoje = N.hojeFortaleza(agora());
    const o = N.calcularOferta({ plano: dados.plano, ciclo: dados.ciclo, extras: dados.extras, hoje, vagas: await lerVagas(store) });
    if (!o.ok) throw new ErroNegocio("failed-precondition", o.mensagem, o.codigo);
    if (o.vaga) throw new ErroNegocio("failed-precondition", "O preço de lançamento só vale para quem assina agora, em 'Assinar'.");
    await asaas.atualizarAssinatura(a.id, { value: o.valor, cycle: o.cicloAsaas, description: o.descricao, updatePendingPayments: true });
    await store.set("contas/" + auth.uid, { assin: { plano: o.plano, ciclo: o.ciclo, valor: o.valor, extras: o.extras } }, { merge: true });
    return { ok: true, plano: o.plano, ciclo: o.ciclo, valor: o.valor, aviso: "A troca vale a partir do próximo pagamento." };
  }
  throw new ErroNegocio("invalid-argument", "Ação desconhecida.");
}
module.exports = { assinar, minhaAssinatura, exigirLogin, lerVagas, hashCpf };
