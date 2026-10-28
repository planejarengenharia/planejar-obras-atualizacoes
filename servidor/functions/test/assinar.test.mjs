import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { criarDeps, semearConta, auth, CPF, N, P } from "./dubles.mjs";
const require = createRequire(import.meta.url);
const { assinar, minhaAssinatura } = require("../assinatura.js");

const base = { nome: "Maria da Silva", cpfCnpj: CPF };
async function erroDe(p) { try { await p; } catch (e) { return e; } return null; }

// cada plano e ciclo: valor certo, ciclo do Asaas certo, billingType UNDEFINED, referência = uid, link devolvido
const fundadorEncerrado = d => (d.store.semear("vagas/fundador", { usadas: 100, total: 100, ate: P.VAGAS_PADRAO.fundador.ate }), d);   // 100 vagas usadas: o Profissional passa a vender
for (const [plano, def] of Object.entries(P.PLANOS)) for (const [ciclo, preco] of Object.entries(def.ciclos)) {
  test(`assinar ${plano} ${ciclo}: cria cliente + assinatura UNDEFINED e devolve o link`, async () => {
    const d = criarDeps(); semearConta(d); if (def.depoisDe) fundadorEncerrado(d);
    const r = await assinar(d, auth(), { ...base, plano, ciclo });
    const lancamento = def.lancamento && def.lancamento.ciclo === ciclo ? def.lancamento.valor : null;
    assert.equal(r.valor, lancamento ?? preco);
    const c = d.asaas.chamadas.find(x => x[0] === "criarAssinatura")[1];
    assert.equal(c.billingType, "UNDEFINED"); assert.equal(c.cycle, P.CICLO_ASAAS[ciclo]); assert.equal(c.externalReference, "u1");
    assert.equal(c.nextDueDate, "2026-11-10"); assert.equal(c.value, r.valor);
    assert.match(r.link, /^https:\/\//);
    const conta = await d.store.get("contas/u1");
    assert.equal(conta.assin.status, "pendente"); assert.equal(conta.assin.plano, plano); assert.match(conta.asaasCliente, /^cus_/);
    assert.equal(conta.plano, "cortesia3m", "assinar NÃO libera o plano: só o pagamento libera");
    const pg = await d.store.consultar("pagamentos", [["uid", "==", "u1"]]);
    assert.equal(pg.length, 1); assert.equal(pg[0].status, "pendente");
  });
}

test("assinar exige login e e-mail verificado", async () => {
  const d = criarDeps(); semearConta(d);
  assert.equal((await erroDe(assinar(d, null, { ...base, plano: "essencial", ciclo: "mensal" }))).codigo, "unauthenticated");
  assert.equal((await erroDe(assinar(d, auth("u1", { emailVerificado: false }), { ...base, plano: "essencial", ciclo: "mensal" }))).codigo, "failed-precondition");
  assert.equal(d.asaas.chamadas.length, 0);
});
test("assinar recusa CPF inválido, nome curto, plano e ciclo inexistentes", async () => {
  const d = criarDeps(); semearConta(d);
  for (const [x, cod] of [[{ cpfCnpj: "111.111.111-11" }, "invalid-argument"], [{ nome: "Ma" }, "invalid-argument"], [{ plano: "xyz" }, "failed-precondition"], [{ ciclo: "semanal" }, "failed-precondition"], [{ plano: "empresas", ciclo: "anual" }, "failed-precondition"], [{ plano: "profissional", ciclo: "anual" }, "failed-precondition"]]) {
    const e = await erroDe(assinar(d, auth(), { ...base, plano: "essencial", ciclo: "mensal", ...x }));
    assert.equal(e.codigo, cod, JSON.stringify(x));
  }
  assert.equal(d.asaas.chamadas.length, 0);
});
test("assinar reaproveita o cliente Asaas e não duplica assinatura ativa", async () => {
  const d = criarDeps(); semearConta(d, "u1", { asaasCliente: "cus_antigo" });
  await assinar(d, auth(), { ...base, plano: "essencial", ciclo: "mensal" });
  assert.equal(d.asaas.chamadas.filter(x => x[0] === "criarCliente").length, 0);
  await d.store.set("contas/u1", { assin: { status: "ativa" } }, { merge: true });
  assert.equal((await erroDe(assinar(d, auth(), { ...base, plano: "fundador", ciclo: "mensal" }))).codigo, "already-exists");
});
test("assinar de novo com pendente cancela a pendente antiga no Asaas", async () => {
  const d = criarDeps(); semearConta(d);
  const r1 = await assinar(d, auth(), { ...base, plano: "essencial", ciclo: "mensal" });
  await assinar(d, auth(), { ...base, plano: "fundador", ciclo: "anual" });
  assert.ok(d.asaas.chamadas.some(x => x[0] === "cancelarAssinatura" && x[1] === r1.assinatura));
  assert.equal((await d.store.get("contas/u1")).assin.plano, "fundador");
});
test("Asaas fora do ar: erro propagado e conta intacta", async () => {
  const d = criarDeps(); semearConta(d); d.asaas.falhar = new Error("fora");
  await assert.rejects(assinar(d, auth(), { ...base, plano: "essencial", ciclo: "mensal" }));
  assert.equal((await d.store.get("contas/u1")).assin, undefined);
});

// ---- vagas e datas
const comVagas = (nome, v) => (d => (d.store.semear("vagas/" + nome, v), d));
const vagaPlano = Object.entries(P.PLANOS).find(([, x]) => x.vaga);
if (vagaPlano) {
  const [pl, def] = vagaPlano, ciclo = Object.keys(def.ciclos)[0], padrao = P.VAGAS_PADRAO[def.vaga];
  test(`${pl}: vagas esgotadas recusa`, async () => {
    const d = comVagas(def.vaga, { usadas: padrao.total, total: padrao.total, ate: padrao.ate })(criarDeps()); semearConta(d);
    const e = await erroDe(assinar(d, auth(), { ...base, plano: pl, ciclo }));
    assert.equal(e.codigo, "failed-precondition"); assert.match(e.mensagem, /vagas/i); assert.equal(d.asaas.chamadas.length, 0);
  });
  test(`${pl}: data passada recusa`, async () => {
    const d = criarDeps(); d._agora = Date.parse(padrao.ate + "T12:00:00Z") + 2 * 864e5; semearConta(d);
    const e = await erroDe(assinar(d, auth(), { ...base, plano: pl, ciclo }));
    assert.match(e.mensagem, /encerrado/); assert.equal(d.asaas.chamadas.length, 0);
  });
  test(`${pl}: no último dia de venda ainda vende; 1 CPF só para uma conta`, async () => {
    const d = criarDeps(); d._agora = Date.parse(padrao.ate + "T20:00:00Z"); semearConta(d); semearConta(d, "u2");
    await assinar(d, auth(), { ...base, plano: pl, ciclo });
    if (def.unicoPorCpf) assert.equal((await erroDe(assinar(d, auth("u2"), { ...base, plano: pl, ciclo }))).codigo, "already-exists");
  });
}
test("extras em plano sem extra é recusado", async () => {
  const d = criarDeps(); semearConta(d);
  assert.equal((await erroDe(assinar(d, auth(), { ...base, plano: "essencial", ciclo: "mensal", extras: 1 }))).codigo, "failed-precondition");
});

// ---- minhaAssinatura
test("minhaAssinatura ver: status, validade e faturas com link", async () => {
  const d = criarDeps(); semearConta(d); await assinar(d, auth(), { ...base, plano: "essencial", ciclo: "mensal" });
  const r = await minhaAssinatura(d, auth(), { acao: "ver" });
  assert.equal(r.assinatura.status, "pendente"); assert.equal(r.faturas.length, 1); assert.match(r.faturas[0].link, /^https/);
  const so = await minhaAssinatura(d, auth("u2"), { acao: "ver" }).catch(e => e.codigo); assert.equal(so, "not-found");
});
test("minhaAssinatura cancelar: cancela no Asaas, mantém plano e f, avisa, e repetir não duplica", async () => {
  const d = criarDeps(); semearConta(d, "u1", { plano: "profissional", f: "2026-12-15", maq: 2, whats: "(88) 99708-4754", whatsOk: true });
  await d.store.set("contas/u1", { assin: { id: "sub_x", plano: "profissional", ciclo: "mensal", status: "ativa" } }, { merge: true });
  const r = await minhaAssinatura(d, auth(), { acao: "cancelar" });
  assert.equal(r.status, "cancelada"); assert.equal(r.f, "2026-12-15");
  const c = await d.store.get("contas/u1"); assert.equal(c.assin.status, "cancelada"); assert.equal(c.plano, "profissional"); assert.equal(c.f, "2026-12-15");
  await minhaAssinatura(d, auth(), { acao: "cancelar" });
  assert.equal(d.enviarEmail.enviados.length, 1);
  assert.equal(d.wa.enviados.length, 1);
});
test("minhaAssinatura trocarPlano: atualiza valor/ciclo no Asaas; lançamento travado não troca", async () => {
  const d = criarDeps(); semearConta(d);
  await d.store.set("contas/u1", { assin: { id: "sub_x", plano: "essencial", ciclo: "mensal", status: "ativa" } }, { merge: true });
  assert.equal((await erroDe(minhaAssinatura(d, auth(), { acao: "trocarPlano", plano: "profissional", ciclo: "anual" }))).detalhe, "plano_indisponivel", "Profissional não vende com o Fundador aberto");
  assert.equal((await erroDe(minhaAssinatura(d, auth(), { acao: "trocarPlano", plano: "fundador", ciclo: "anual" }))).codigo, "failed-precondition", "Fundador só em Assinar");
  fundadorEncerrado(d);
  const r = await minhaAssinatura(d, auth(), { acao: "trocarPlano", plano: "profissional", ciclo: "anual" });
  assert.equal(r.valor, P.PLANOS.profissional.ciclos.anual);
  const ch = d.asaas.chamadas.find(x => x[0] === "atualizarAssinatura"); assert.equal(ch[2].value, r.valor); assert.equal(ch[2].cycle, "YEARLY");
  await d.store.set("contas/u1", { assin: { vaga: "x" } }, { merge: true });
  assert.equal((await erroDe(minhaAssinatura(d, auth(), { acao: "trocarPlano", plano: "essencial", ciclo: "mensal" }))).codigo, "failed-precondition");
});

// ---- tabela de 27/10/2026: Fundador, Profissional (só depois do Fundador) e Empresas (sob consulta)
test("tabela nova: valores e regras de planos.js", () => {
  const p = P.PLANOS;
  assert.deepEqual(p.essencial.ciclos, { mensal: 39, anual: 390 }); assert.equal(p.essencial.maq, 1); assert.deepEqual(p.essencial.mod, ["obras", "sem_licitacao"]);
  assert.deepEqual(p.fundador.ciclos, { mensal: 59, anual: 590 }); assert.equal(p.fundador.maq, 3); assert.equal(p.fundador.mod, null); assert.equal(p.fundador.travado, true); assert.equal(p.fundador.vaga, "fundador");
  assert.deepEqual(p.profissional.ciclos, { mensal: 69, anual: 690 }); assert.equal(p.profissional.maq, 2); assert.equal(p.profissional.mod, null); assert.equal(p.profissional.depoisDe, "fundador");
  assert.equal(P.VAGAS_PADRAO.fundador.total, 100); assert.equal(P.VAGAS_PADRAO.fundador.ate, "2027-03-31");
  assert.ok(p.empresas.sobConsulta);
});
test("Profissional é recusado enquanto o Fundador está aberto (nenhuma chamada ao Asaas)", async () => {
  const d = criarDeps(); semearConta(d);
  for (const ciclo of ["mensal", "anual"]) { const e = await erroDe(assinar(d, auth(), { ...base, plano: "profissional", ciclo })); assert.equal(e.codigo, "failed-precondition"); assert.equal(e.detalhe, "plano_indisponivel"); }
  assert.equal(d.asaas.chamadas.length, 0);
});
test("Profissional vende (69/690, 2 computadores) depois de 31/03/2027", async () => {
  for (const [ciclo, valor] of [["mensal", 69], ["anual", 690]]) {
    const d = criarDeps(); d._agora = Date.parse("2027-04-01T15:00:00Z"); semearConta(d);
    const r = await assinar(d, auth(), { ...base, plano: "profissional", ciclo }); assert.equal(r.valor, valor);
    assert.equal((await d.store.get("contas/u1")).assin.extras, 0); assert.equal(N.calcularOferta({ plano: "profissional", ciclo, hoje: "2027-04-01", vagas: {} }).maq, 2);
  }
});
test("Profissional vende com as 100 vagas do Fundador usadas, mesmo dentro do prazo; e o Fundador passa a ser recusado", async () => {
  const d = fundadorEncerrado(criarDeps()); semearConta(d);
  assert.equal((await assinar(d, auth(), { ...base, plano: "profissional", ciclo: "mensal" })).valor, 69);
  const e = await erroDe(assinar(d, auth("u1"), { ...base, plano: "fundador", ciclo: "mensal" })); assert.equal(e.detalhe, "vagas_esgotadas");
  const h = criarDeps(); h._agora = Date.parse("2027-03-31T20:00:00Z"); semearConta(h);   // último dia: Fundador ainda vende, Profissional ainda não
  assert.equal((await erroDe(assinar(h, auth(), { ...base, plano: "profissional", ciclo: "mensal" }))).detalhe, "plano_indisponivel");
  assert.equal((await assinar(h, auth(), { ...base, plano: "fundador", ciclo: "mensal" })).valor, 59);
});
test("Fundador depois de 31/03/2027 devolve prazo_encerrado", async () => {
  const d = criarDeps(); d._agora = Date.parse("2027-04-01T15:00:00Z"); semearConta(d);
  assert.equal((await erroDe(assinar(d, auth(), { ...base, plano: "fundador", ciclo: "anual" }))).detalhe, "prazo_encerrado");
});
test("Empresas: assinar devolve sob_consulta (também depois do Fundador) e não chama o Asaas", async () => {
  for (const d of [criarDeps(), fundadorEncerrado(criarDeps())]) {
    semearConta(d);
    for (const ciclo of ["mensal", "anual"]) { const e = await erroDe(assinar(d, auth(), { ...base, plano: "empresas", ciclo })); assert.equal(e.codigo, "failed-precondition"); assert.equal(e.detalhe, "sob_consulta"); assert.match(e.mensagem, /sob consulta/i); }
    assert.equal(d.asaas.chamadas.length, 0);
  }
  assert.equal(N.calcularOferta({ plano: "empresas", ciclo: "anual", hoje: "2026-11-10", vagas: {} }).codigo, "sob_consulta");
});
test("Fundador: 1 por CPF, vale para mensal e anual, e outro CPF assina normalmente", async () => {
  const d = criarDeps(); semearConta(d); semearConta(d, "u2"); semearConta(d, "u3");
  await assinar(d, auth(), { ...base, plano: "fundador", ciclo: "mensal" });
  assert.equal((await erroDe(assinar(d, auth("u2"), { ...base, plano: "fundador", ciclo: "anual" }))).codigo, "already-exists");
  assert.equal(await erroDe(assinar(d, auth("u1"), { ...base, plano: "fundador", ciclo: "anual" })), null, "o mesmo dono do CPF pode refazer a própria assinatura pendente");
  assert.equal((await assinar(d, auth("u3"), { ...base, cpfCnpj: "11.222.333/0001-81", plano: "fundador", ciclo: "anual" })).valor, 590);
});
test("o computador extra pago deixou de existir", async () => {
  assert.ok(Object.values(P.PLANOS).every(x => !x.extra && !x.lancamento));
  const d = criarDeps(); semearConta(d);
  assert.equal((await erroDe(assinar(d, auth(), { ...base, plano: "fundador", ciclo: "mensal", extras: 1 }))).codigo, "failed-precondition");
});
