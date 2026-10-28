import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { criarDeps, semearConta, AGORA } from "./dubles.mjs";
const require = createRequire(import.meta.url);
const { jornadaDiaria } = require("../jornada.js");
const T = require("../textos.js");
const dia = 864e5;

test("jornada: avisos nos dias 1, 3, 7, 30, 60 e 83, e só neles", async () => {
  const esperado = []; 
  for (let n = 0; n <= 90; n++) {
    const d = criarDeps(); d._agora = AGORA; semearConta(d, "u1", { ini: AGORA - n * dia, whats: "88997084754", whatsOk: true });
    const r = await jornadaDiaria(d); const av = await d.store.consultar("avisos/u1/itens");
    if ([1, 3, 7, 30, 60, 83].includes(n)) { assert.equal(av.length, 1, "dia " + n); assert.equal(av[0].id, "jornada-d" + n); assert.equal(d.wa.enviados[0].modelo, T.JORNADA[n].tpl); esperado.push(n); }
    else assert.equal(av.length, 0, "dia " + n);
  }
  assert.deepEqual(esperado, [1, 3, 7, 30, 60, 83]);
});
test("jornada: rodar duas vezes no mesmo dia não repete aviso nem e-mail", async () => {
  const d = criarDeps(); semearConta(d, "u1", { ini: AGORA - 3 * dia });
  await jornadaDiaria(d); const e1 = d.enviarEmail.enviados.length; const r = await jornadaDiaria(d);
  assert.equal(r.jornada, 0); assert.equal((await d.store.consultar("avisos/u1/itens")).length, 1);
  assert.equal(d.enviarEmail.enviados.filter(m => m.to === "u1@teste.com").length, 1); assert.ok(e1 >= 1);
});
test("jornada: não avisa plano pago nem conta suspensa; WhatsApp só com consentimento", async () => {
  const d = criarDeps(); semearConta(d, "pago", { plano: "profissional", ini: AGORA - 7 * dia }); semearConta(d, "susp", { s: "suspenso", ini: AGORA - 7 * dia });
  semearConta(d, "sem", { ini: AGORA - 7 * dia, whats: "88997084754", whatsOk: false });
  await jornadaDiaria(d);
  assert.equal((await d.store.consultar("avisos/pago/itens")).length, 0); assert.equal((await d.store.consultar("avisos/susp/itens")).length, 0);
  assert.equal((await d.store.consultar("avisos/sem/itens")).length, 1); assert.equal(d.wa.enviados.length, 0);
});
test("aviso de renovação 7 dias antes de f, só para plano sem assinatura automática ativa", async () => {
  const d = criarDeps(); // hoje 10/11 -> f 17/11
  semearConta(d, "a", { plano: "essencial", f: "2026-11-17" });
  semearConta(d, "b", { plano: "essencial", f: "2026-11-17", assin: { status: "ativa" } });
  semearConta(d, "c", { plano: "essencial", f: "2026-11-17", assin: { status: "cancelada" } });
  semearConta(d, "e", { plano: "essencial", f: "2026-11-18" });
  const r = await jornadaDiaria(d);
  assert.equal(r.renovacao, 2);
  assert.equal((await d.store.consultar("avisos/a/itens")).length, 1); assert.equal((await d.store.consultar("avisos/c/itens")).length, 1);
  assert.equal((await d.store.consultar("avisos/b/itens")).length, 0); assert.equal((await d.store.consultar("avisos/e/itens")).length, 0);
  await jornadaDiaria(d); assert.equal((await d.store.consultar("avisos/a/itens")).length, 1);
});
test("resumo diário ao dono: novos cadastros, pagamentos de hoje, chamados abertos", async () => {
  const d = criarDeps(); semearConta(d, "n1", { criadoEm: AGORA - 3600e3, ini: AGORA - 40 * dia }); semearConta(d, "velho", { criadoEm: AGORA - 5 * dia, ini: AGORA - 40 * dia });
  d.store.semear("pagamentos/p1", { uid: "n1", status: "pago", pagoEm: "2026-11-10", valor: 89 });
  d.store.semear("chamados/c1", { status: "aberto" }); d.store.semear("chamados/c2", { status: "respondido" });
  const r = await jornadaDiaria(d);
  assert.deepEqual(r.resumo, { novos: 1, pagos: 1, abertos: 1 });
  const m = d.enviarEmail.enviados.find(x => x.to === "dono@teste.com"); assert.match(m.text, /Pagamentos hoje: 1/);
});
