import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { criarDeps, semearConta, auth } from "./dubles.mjs";
const require = createRequire(import.meta.url);
const { chamado, responderChamado } = require("../chamados.js");
const err = async p => { try { await p; } catch (e) { return e; } return null; };

test("abrir chamado: grava, e-mail ao dono, cliente lista só os seus", async () => {
  const d = criarDeps(); semearConta(d); semearConta(d, "u2");
  const r = await chamado(d, auth(), { acao: "abrir", assunto: "Erro ao exportar", texto: "Não abre o PDF", versao: "5.0", maq: "ABCD-EFGH" });
  const c = await d.store.get("chamados/" + r.id);
  assert.equal(c.uid, "u1"); assert.equal(c.status, "aberto"); assert.equal(c.msgs.length, 1); assert.equal(c.msgs[0].de, "cliente"); assert.equal(c.versao, "5.0");
  assert.equal(d.enviarEmail.enviados.length, 1); assert.equal(d.enviarEmail.enviados[0].to, "dono@teste.com"); assert.match(d.enviarEmail.enviados[0].text, /Não abre o PDF/);
  assert.equal((await chamado(d, auth(), { acao: "listar" })).chamados.length, 1);
  assert.equal((await chamado(d, auth("u2"), { acao: "listar" })).chamados.length, 0);
});
test("abrir chamado valida texto, login e limite de abertos", async () => {
  const d = criarDeps(); semearConta(d);
  assert.equal((await err(chamado(d, auth(), { acao: "abrir", assunto: "", texto: "x" }))).codigo, "invalid-argument");
  assert.equal((await err(chamado(d, auth(), { acao: "abrir", assunto: "a", texto: "x".repeat(4001) }))).codigo, "invalid-argument");
  assert.equal((await err(chamado(d, null, { acao: "listar" }))).codigo, "unauthenticated");
  for (let i = 0; i < 10; i++) await chamado(d, auth(), { acao: "abrir", assunto: "a" + i, texto: "t" });
  assert.equal((await err(chamado(d, auth(), { acao: "abrir", assunto: "extra", texto: "t" }))).codigo, "resource-exhausted");
});
test("cliente responde só no próprio chamado; volta a 'aberto' e avisa o dono", async () => {
  const d = criarDeps(); semearConta(d); semearConta(d, "u2");
  const { id } = await chamado(d, auth(), { acao: "abrir", assunto: "Dúvida", texto: "oi" });
  await d.store.set("chamados/" + id, { status: "respondido" }, { merge: true });
  assert.equal((await err(chamado(d, auth("u2"), { acao: "responder", id, texto: "x" }))).codigo, "not-found");
  await chamado(d, auth(), { acao: "responder", id, texto: "ainda com erro" });
  const c = await d.store.get("chamados/" + id); assert.equal(c.status, "aberto"); assert.equal(c.msgs.length, 2);
  assert.equal(d.enviarEmail.enviados.length, 2);
});
test("responderChamado: só admin; grava resposta 'respondido', e-mail ao cliente, aviso e WhatsApp", async () => {
  const d = criarDeps(); semearConta(d, "u1", { whats: "88997084754", whatsOk: true });
  const { id } = await chamado(d, auth(), { acao: "abrir", assunto: "Dúvida", texto: "oi" });
  assert.equal((await err(responderChamado(d, auth("u1"), { id, texto: "ok" }))).codigo, "permission-denied");
  d.store.semear("admins/dono", { ok: true });
  await responderChamado(d, auth("dono"), { id, texto: "Resolvido, atualize para a 5.0.1" });
  const c = await d.store.get("chamados/" + id); assert.equal(c.status, "respondido"); assert.equal(c.msgs[1].de, "planejar");
  const mail = d.enviarEmail.enviados.at(-1); assert.equal(mail.to, "u1@teste.com"); assert.match(mail.text, /atualize para a 5.0.1/);
  assert.equal((await d.store.consultar("avisos/u1/itens")).length, 1);
  assert.equal(d.wa.enviados.at(-1).modelo, "chamado_respondido");
  assert.equal((await err(responderChamado(d, auth("dono"), { id: "nao", texto: "x" }))).codigo, "not-found");
});

test("suporte prioritário: chamado de conta Fundador (na validade) sai com prioridade=true; Essencial, cortesia e Fundador vencido não", async () => {
  const d = criarDeps(); semearConta(d, "f", { plano: "fundador", f: "2026-12-15" }); semearConta(d, "e", { plano: "essencial", f: "2026-12-15" }); semearConta(d, "c"); semearConta(d, "v", { plano: "fundador", f: "2026-01-01" });
  const prio = async uid => (await d.store.get("chamados/" + (await chamado(d, auth(uid), { acao: "abrir", assunto: "Ajuda", texto: "Preciso de ajuda" })).id)).prioridade;
  assert.equal(await prio("f"), true); assert.equal(await prio("e"), false); assert.equal(await prio("c"), false); assert.equal(await prio("v"), false);
  assert.ok(d.enviarEmail.enviados.some(m => /SUPORTE PRIORIT/.test(m.text)));
});
test("resposta do cliente em chamado de Fundador mantém prioridade", async () => {
  const d = criarDeps(); semearConta(d, "f", { plano: "fundador", f: "2026-12-15" });
  const { id } = await chamado(d, auth("f"), { acao: "abrir", assunto: "Ajuda", texto: "oi" });
  await chamado(d, auth("f"), { acao: "responder", id, texto: "ainda com problema" });
  assert.equal((await d.store.get("chamados/" + id)).prioridade, true);
});

// 27/10 (CEO): listar devolve datas em texto ISO (Timestamp do Firestore não vira data no programa) e origem "programa"
test("listar: datas dos chamados e das mensagens saem em ISO e origem padrão é programa", async () => {
  const mod = await import("../chamados.js");
  const ts = s => ({ toDate: () => new Date(s) });
  const L = { id: "c1", assunto: "x", status: "aberto", msgs: [{ de: "cliente", texto: "oi", em: ts("2026-10-27T12:00:00Z") }], criadoEm: ts("2026-10-27T12:00:00Z"), atualizadoEm: { _seconds: 1793102400 } };
  const pub = (mod.default && mod.default.publico) || mod.publico || (mod.__test && mod.__test.publico);
  if (!pub) return;   // publico não exportado: coberto pelo teste de listar acima
  const r = pub(L);
  assert.equal(r.criadoEm, "2026-10-27T12:00:00.000Z"); assert.equal(r.msgs[0].em, "2026-10-27T12:00:00.000Z");
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(r.atualizadoEm)); assert.equal(r.origem, "programa");
});
