import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { P } from "./dubles.mjs";
const require = createRequire(import.meta.url);
const N = require("../negocio.js"), E = require("../emails.js"), T = require("../textos.js");
const { criarAsaas, AsaasErro } = require("../asaas.js");
const W = require("../whatsapp.js");

test("datas: fuso de Fortaleza, fim de mês e ciclos", () => {
  assert.equal(N.hojeFortaleza(Date.parse("2026-10-28T02:59:00Z")), "2026-10-27"); assert.equal(N.hojeFortaleza(Date.parse("2026-10-28T03:00:00Z")), "2026-10-28");
  assert.equal(N.somarMeses("2026-01-31", 1), "2026-02-28"); assert.equal(N.somarMeses("2026-12-15", 1), "2027-01-15"); assert.equal(N.somarCiclo("2026-11-10", "anual"), "2027-11-10");
  assert.equal(N.somarDias("2026-12-28", 5), "2027-01-02"); assert.equal(N.diasEntre("2026-11-09", "2026-11-10"), 1);
});
test("CPF e CNPJ", () => {
  assert.equal(N.validarCpfCnpj("529.982.247-25"), "52998224725"); assert.equal(N.validarCpfCnpj("11.222.333/0001-81"), "11222333000181");
  for (const x of ["", "123", "111.111.111-11", "529.982.247-26", "11.222.333/0001-80"]) assert.equal(N.validarCpfCnpj(x), null);
});
test("camposDoPlano: f nunca diminui", () => {
  const a = N.camposDoPlano({ plano: "essencial", ciclo: "mensal", venc: "2026-11-10", fAtual: "2030-01-01" }); assert.equal(a.conta.f, "2030-01-01");
  assert.equal(N.camposDoPlano({ plano: "inexistente", ciclo: "mensal", venc: "2026-11-10" }), null);
});
test("planos.js é a única fonte: nenhum outro arquivo tem preço ou data de venda escritos", () => {
  const fs = require("node:fs"), dir = new URL("..", import.meta.url).pathname;
  const precos = new Set(); for (const p of Object.values(P.PLANOS)) { Object.values(p.ciclos).forEach(v => precos.add(String(v))); if (p.lancamento) precos.add(String(p.lancamento.valor)); }
  const datas = Object.values(P.VAGAS_PADRAO).map(v => v.ate);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js") && x !== "planos.js")) {
    const src = fs.readFileSync(dir + f, "utf8").split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
    for (const v of precos) assert.ok(!new RegExp("(?<![\\w.])" + v + "(?![\\w])").test(src.replace(/&#\d+;/g, "").replace(/"[^"]*"/g, m => (/R\$/.test(m) ? "" : m))), `${f} tem o valor ${v}`);
    for (const d of datas) assert.ok(!src.includes(d), `${f} tem a data ${d}`);
  }
});
test("e-mail montado (sem enviar): assunto, texto, html escapado e link só https", () => {
  const m = E.montar({ para: "a@b.com", nome: "Maria da Silva", titulo: "Pagamento <confirmado>", texto: "Linha 1\n\nLinha 2 & mais", link: "https://exemplo.com/pagar?x=1&y=2" });
  assert.equal(m.to, "a@b.com"); assert.equal(m.subject, "Pagamento <confirmado>"); assert.match(m.text, /Olá, Maria!/); assert.match(m.text, /https:\/\/exemplo.com/);
  assert.ok(!m.html.includes("<confirmado>")); assert.match(m.html, /&lt;confirmado&gt;/); assert.match(m.html, /&amp; mais/); assert.match(m.html, /href="https:/);
  assert.ok(!E.montar({ para: "a@b.com", titulo: "t", texto: "x", link: "javascript:alert(1)" }).html.includes("javascript:"));
  const d = E.paraDono("dono@x.com", "Resumo", ["a", "b"]); assert.equal(d.to, "dono@x.com");
});
test("enviador chama sendMail uma vez com remetente; sem destinatário ignora", async () => {
  const log = []; const env = E.criarEnviador({ transporte: { sendMail: async m => log.push(m) }, de: "Planejar <x@gmail.com>" });
  await env(E.montar({ para: "a@b.com", titulo: "t", texto: "x" })); await env({ to: "" });
  assert.equal(log.length, 1); assert.equal(log[0].from, "Planejar <x@gmail.com>");
});
test("textos: todo marco da jornada tem modelo de WhatsApp com todos os parâmetros", () => {
  for (const [dia, j] of Object.entries(T.JORNADA)) { assert.ok(T.WA_MODELOS[j.tpl], "dia " + dia); assert.ok(j.titulo && j.texto); }
  for (const [n, m] of Object.entries(T.WA_MODELOS)) { assert.match(n, /^[a-z0-9_]+$/); const q = (m.corpo.match(/\{\{\d+\}\}/g) || []).length; assert.equal(q, m.params.length, n); }
  assert.match(T.preencherModelo("pagamento_confirmado", { nome: "Ana", plano: "Essencial", validade: "15/12/2026" }), /Ana.*Essencial.*15\/12\/2026/);
});

// ---- cliente Asaas com fetch falso
test("asaas: sandbox por padrão, header access_token, corpo JSON e consulta", async () => {
  const log = []; const f = async (url, o) => { log.push([url, o]); return { ok: true, status: 200, json: async () => ({ data: [{ id: "cus_1" }] }) }; };
  const a = criarAsaas({ apiKey: "KEY", ambiente: "qualquer", fetchImpl: f });
  assert.equal(a.ambiente, "sandbox"); assert.equal((await a.buscarClientePorReferencia("u1")).id, "cus_1");
  assert.match(log[0][0], /^https:\/\/sandbox\.asaas\.com\/api\/v3\/customers\?externalReference=u1/); assert.equal(log[0][1].headers.access_token, "KEY"); assert.ok(log[0][1].headers["User-Agent"]);
  await a.criarAssinatura({ customer: "cus_1", value: 49 }); assert.equal(log[1][1].method, "POST"); assert.equal(JSON.parse(log[1][1].body).value, 49);
  const p = criarAsaas({ apiKey: "K", ambiente: "producao", fetchImpl: f }); await p.cancelarAssinatura("sub_1");
  assert.equal(log[2][0], "https://api.asaas.com/v3/subscriptions/sub_1"); assert.equal(log[2][1].method, "DELETE");
});
test("asaas: erro HTTP vira AsaasErro com a descrição; rede fora vira status 0; sem chave falha", async () => {
  const a = criarAsaas({ apiKey: "K", fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ errors: [{ description: "CPF inválido" }] }) }) });
  await assert.rejects(a.criarCliente({}), e => e instanceof AsaasErro && e.status === 400 && /CPF inválido/.test(e.message));
  const b = criarAsaas({ apiKey: "K", fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  await assert.rejects(b.obterCobranca("x"), e => e.status === 0);
  assert.throws(() => criarAsaas({ apiKey: "", fetchImpl: () => {} }));
});

// ---- WhatsApp (cliente da Meta)
test("whatsapp: números, variantes com/sem o 9 e envio de modelo no formato da Meta", async () => {
  assert.equal(W.normalizarNumero("(88) 99708-4754"), "5588997084754"); assert.equal(W.normalizarNumero("5588997084754"), "5588997084754"); assert.equal(W.normalizarNumero("123"), null);
  assert.deepEqual(W.variantesNumero("558897084754").sort(), ["558897084754", "5588997084754"].sort());
  const log = []; const wa = W.criarWhatsapp({ token: "T", phoneId: "123", ativo: "sim", fetchImpl: async (u, o) => { log.push([u, o]); return { ok: true, json: async () => ({}) }; } });
  await wa.enviarModelo("(88) 99708-4754", "pagamento_confirmado", { nome: "Ana", plano: "Essencial", validade: "15/12/2026" });
  const c = JSON.parse(log[0][1].body); assert.match(log[0][0], /graph\.facebook\.com\/v21\.0\/123\/messages/); assert.equal(log[0][1].headers.Authorization, "Bearer T");
  assert.equal(c.to, "5588997084754"); assert.equal(c.template.name, "pagamento_confirmado"); assert.equal(c.template.language.code, "pt_BR"); assert.deepEqual(c.template.components[0].parameters.map(x => x.text), ["Ana", "Essencial", "15/12/2026"]);
});
test("whatsapp: WA_ATIVO diferente de sim não envia nada nem quebra", async () => {
  let chamou = 0; const wa = W.criarWhatsapp({ token: "T", phoneId: "1", ativo: "nao", fetchImpl: async () => { chamou++; } });
  assert.equal(wa.ativo, false); assert.equal((await wa.enviarModelo("88997084754", "dica_dia3", {})).ignorado, true); assert.equal((await wa.enviarTexto("88997084754", "oi")).ignorado, true); assert.equal(chamou, 0);
  const sem = W.criarWhatsapp({ ativo: "sim" }); assert.equal(sem.ativo, false);
});
