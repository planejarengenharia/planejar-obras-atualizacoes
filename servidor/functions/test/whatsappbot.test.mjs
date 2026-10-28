import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { criarDeps, semearConta } from "./dubles.mjs";
const require = createRequire(import.meta.url);
const { tratarWhatsapp, assinaturaOk } = require("../whatsappbot.js");

const msg = (from, texto, id) => ({ entry: [{ changes: [{ value: { messages: [{ from, id: id || "wamid." + Math.random(), type: "text", text: { body: texto } }] } }] }] });
const post = (d, corpo, extra = {}) => tratarWhatsapp(d, { metodo: "POST", corpo, raw: JSON.stringify(corpo), ...extra });
const ultimo = d => d.wa.enviados.at(-1).texto;
const cliente = d => semearConta(d, "u1", { whats: "(88) 99708-4754", whatsN: "5588997084754", whatsOk: true, plano: "fundador", f: "2026-12-15" });

test("verificação GET: token certo devolve o desafio; errado 403", async () => {
  const d = criarDeps();
  assert.deepEqual(await tratarWhatsapp(d, { metodo: "GET", query: { "hub.mode": "subscribe", "hub.verify_token": "verif123", "hub.challenge": "987" } }), { status: 200, texto: "987" });
  assert.equal((await tratarWhatsapp(d, { metodo: "GET", query: { "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" } })).status, 403);
  assert.equal((await tratarWhatsapp(d, { metodo: "GET", query: {} })).status, 403);
});
test("assinatura X-Hub-Signature-256: confere com o segredo do app; sem segredo configurado aceita", () => {
  const raw = '{"a":1}', sig = "sha256=" + crypto.createHmac("sha256", "seg").update(raw).digest("hex");
  assert.equal(assinaturaOk(raw, sig, "seg"), true); assert.equal(assinaturaOk(raw, sig.slice(0, -1) + "0", "seg"), false); assert.equal(assinaturaOk(raw, undefined, "seg"), false); assert.equal(assinaturaOk(raw, "", ""), true);
});
test("POST com assinatura errada: 401 e nada é respondido", async () => {
  const d = criarDeps({}); d.config.waAppSecret = "seg"; const r = await post(d, msg("5588997084754", "oi"), { assinatura: "sha256=00" });
  assert.equal(r.status, 401); assert.equal(d.wa.enviados.length, 0);
});
test("menu: mensagem qualquer devolve o menu; 1 mostra os planos montados de planos.js", async () => {
  const d = criarDeps(); await post(d, msg("5588911112222", "oi")); assert.match(ultimo(d), /1 - Planos e preços/);
  await post(d, msg("5588911112222", "1")); assert.match(ultimo(d), /Essencial: R\$ 39,00\/mês ou R\$ 390,00\/ano/);
});
test("cliente reconhecido pelo número (também sem o 9): opção 2 mostra plano, validade e link da 2ª via", async () => {
  const d = criarDeps(); cliente(d); semearConta(d, "u9", { whatsN: "5588900000000" });
  d.store.semear("pagamentos/p1", { uid: "u1", status: "pendente", venc: "2026-11-10", link: "https://sandbox.asaas.com/i/1" });
  await post(d, msg("558897084754", "2"));   // a Meta entregou sem o 9
  assert.match(ultimo(d), /Plano: Fundador/); assert.match(ultimo(d), /15\/12\/2026/); assert.match(ultimo(d), /https:\/\/sandbox\.asaas\.com\/i\/1/); assert.match(ultimo(d), /Maria/);
});
test("não reconhecido: opção 2 explica como assinar, sem dados de ninguém", async () => {
  const d = criarDeps(); cliente(d); await post(d, msg("5511999990000", "2")); assert.match(ultimo(d), /Minha conta, Planos/); assert.ok(!/Fundador|Maria/.test(ultimo(d)));
});
test("3 Suporte: pede a descrição e a próxima mensagem abre chamado (origem whatsapp) e avisa o dono", async () => {
  const d = criarDeps(); cliente(d);
  await post(d, msg("5588997084754", "3")); assert.match(ultimo(d), /Descreva/);
  await post(d, msg("5588997084754", "O programa fecha ao exportar o Excel"));
  const c = (await d.store.consultar("chamados"))[0];
  assert.equal(c.origem, "whatsapp"); assert.equal(c.uid, "u1"); assert.equal(c.status, "aberto"); assert.equal(c.msgs[0].texto, "O programa fecha ao exportar o Excel"); assert.equal(c.whats, "5588997084754");
  assert.ok(d.enviarEmail.enviados.some(m => m.to === "dono@teste.com" && /WhatsApp/.test(m.subject)));
  assert.match(ultimo(d), /Abri o chamado/);
  await post(d, msg("5588997084754", "xyz")); assert.equal((await d.store.consultar("chamados")).length, 1, "depois do chamado volta ao normal");
});
test("4 Falar com o Júnior: chamado humano e aviso ao dono por e-mail e WhatsApp", async () => {
  const d = criarDeps(); d.config.donoWhats = "88999990000"; await post(d, msg("5511999990000", "4")); await post(d, msg("5511999990000", "Quero fechar contrato para a empresa"));
  const c = (await d.store.consultar("chamados"))[0]; assert.equal(c.humano, true); assert.equal(c.uid, null); assert.equal(c.origem, "whatsapp");
  assert.ok(d.enviarEmail.enviados.some(m => m.to === "dono@teste.com")); assert.ok(d.wa.enviados.some(m => m.para === "88999990000" && /Júnior|fechar contrato/.test(m.texto)));
});
test("dúvidas frequentes por palavra-chave (com ou sem acento) e sem cair no menu", async () => {
  const d = criarDeps();
  await post(d, msg("5588911112222", "Esqueci minha SENHA")); assert.match(ultimo(d), /Esqueci a senha/);
  await post(d, msg("5588911112222", "como faço para trocar de computador?")); assert.match(ultimo(d), /Liberar este computador/);
  await post(d, msg("5588911112222", "quero cancelar")); assert.match(ultimo(d), /Cancelar/);
});
test("mensagem repetida pela Meta (mesmo id) responde uma vez só", async () => {
  const d = criarDeps(); const c = msg("5588911112222", "oi", "wamid.fixo"); await post(d, c); await post(d, c);
  assert.equal(d.wa.enviados.length, 1);
});
test("WA_ATIVO=nao: confirma 200 e ignora sem criar nada", async () => {
  const d = criarDeps(); d.wa.ativo = false; const r = await post(d, msg("5588911112222", "3")); assert.equal(r.status, 200); assert.equal(d.wa.enviados.length, 0); assert.equal(d.store.docs.size, 0);
});
test("mensagens de status/entrega (sem messages) e número inválido são ignorados", async () => {
  const d = criarDeps(); const r = await post(d, { entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "delivered" }] } }] }] }); assert.equal(r.status, 200);
  await post(d, msg("123", "oi")); assert.equal(d.wa.enviados.length, 0);
});

// ---- tabela de 27/10/2026 no robô
const planosTexto = async d => { await post(d, msg("5588911112222", "1")); return ultimo(d); };
test("robô: com Fundador aberto mostra Essencial, Fundador (100 vagas até 31/03/2027) e Empresas sob consulta; não mostra Profissional nem preços antigos", async () => {
  const t = await planosTexto(criarDeps());
  assert.match(t, /Essencial: R\$ 39,00\/mês ou R\$ 390,00\/ano/); assert.match(t, /Fundador: R\$ 59,00\/mês ou R\$ 590,00\/ano/); assert.match(t, /3 computadores/); assert.match(t, /100 vagas até 31\/03\/2027/);
  assert.match(t, /Planejar Empresas: sob consulta/i); assert.ok(!/Profissional/.test(t)); assert.ok(!/restam/.test(t));
  assert.ok(!/1\.990|2\.490|249|R\$ 89|R\$ 49,|R\$ 490/.test(t), t);
});
test('robô: "restam N vagas" só quando restarem 30 ou menos', async () => {
  const com = async usadas => { const d = criarDeps(); d.store.semear("vagas/fundador", { usadas, total: 100, ate: "2027-03-31" }); return planosTexto(d); };
  assert.ok(!/restam/.test(await com(0))); assert.ok(!/restam/.test(await com(69)), "restam 31");
  assert.match(await com(70), /restam 30 vagas/); assert.match(await com(99), /restam 1 vagas/);
});
test("robô: com o Fundador encerrado (vagas ou prazo) mostra o Profissional 69/690 e some o Fundador", async () => {
  let d = criarDeps(); d.store.semear("vagas/fundador", { usadas: 100, total: 100, ate: "2027-03-31" }); let t = await planosTexto(d);
  assert.match(t, /Profissional: R\$ 69,00\/mês ou R\$ 690,00\/ano/); assert.match(t, /2 computadores/); assert.ok(!/Fundador:/.test(t)); assert.match(t, /Empresas: sob consulta/i);
  d = criarDeps(); d._agora = Date.parse("2027-04-01T15:00:00Z"); t = await planosTexto(d); assert.match(t, /Profissional: R\$ 69,00/); assert.ok(!/Fundador:/.test(t));
});
test('robô: pergunta de preço por palavra-chave também usa a tabela nova e Empresas "sob consulta"', async () => {
  const d = criarDeps(); await post(d, msg("5588911112222", "quanto custa?")); assert.match(ultimo(d), /Essencial: R\$ 39,00/); assert.match(ultimo(d), /sob consulta/);
});
test("chamado aberto pelo WhatsApp por conta Fundador sai com prioridade; conta comum não", async () => {
  const d = criarDeps(); cliente(d); semearConta(d, "u2", { whatsN: "5588911112222", plano: "essencial" });
  await post(d, msg("5588997084754", "3")); await post(d, msg("5588997084754", "problema"));
  await post(d, msg("5588911112222", "3")); await post(d, msg("5588911112222", "outro problema"));
  const L = await d.store.consultar("chamados"); assert.equal(L.find(c => c.uid === "u1").prioridade, true); assert.equal(L.find(c => c.uid === "u2").prioridade, false);
});
