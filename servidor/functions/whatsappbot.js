"use strict";
// Webhook do WhatsApp (Meta): GET = verificação, POST = mensagens recebidas -> menu automático.
const crypto = require("crypto");
const T = require("./textos");
const N = require("./negocio");
const { lerVagas } = require("./assinatura");
const { variantesNumero, normalizarNumero } = require("./whatsapp");
const { avisarDono } = require("./avisar");

const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function assinaturaOk(raw, cabecalho, segredo) {
  if (!segredo) return true;   // sem segredo configurado (testes/desenvolvimento) não confere; em produção WA_APP_SECRET existe
  if (typeof cabecalho !== "string" || !cabecalho.startsWith("sha256=")) return false;
  const esp = crypto.createHmac("sha256", segredo).update(raw || "").digest("hex"), rec = cabecalho.slice(7);
  return rec.length === esp.length && crypto.timingSafeEqual(Buffer.from(rec), Buffer.from(esp));
}
// acha a conta pelo número (contas.whatsN é gravado pelo servidor a partir de contas.whats)
async function acharPorNumero(store, numero) {
  for (const v of variantesNumero(numero)) { const L = await store.consultar("contas", [["whatsN", "==", v]], { limite: 1 }); if (L[0]) return L[0]; }
  return null;
}
function textoDaMensagem(m) {
  if (m.type === "text" && m.text) return String(m.text.body || "").trim();
  if (m.type === "button" && m.button) return String(m.button.text || "").trim();
  if (m.type === "interactive" && m.interactive) { const i = m.interactive; return String((i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || "").trim(); }
  return "";
}
async function abrirChamado(deps, { conta, numero, assunto, texto, humano }) {
  const { store, agora } = deps, em = new Date(agora()), id = store.novoId("chamados");
  await store.set("chamados/" + id, { uid: conta ? conta.id : null, email: conta ? conta.email || "" : "", nome: conta ? conta.nome || "" : "", assunto, msgs: [{ de: "cliente", texto, em }], status: "aberto", criadoEm: em, atualizadoEm: em, versao: "", maq: "", origem: "whatsapp", whats: numero, humano: !!humano, prioridade: N.contaPrioritaria(conta, N.hojeFortaleza(agora())) });
  return id;
}
function dadosDaConta(conta, faturas) {
  const linhas = [`Olá, ${T.primeiroNome(conta.nome) || "cliente"}! Sua conta:`, `Plano: ${conta.plano === "cortesia3m" || !conta.plano ? "Cortesia de 3 meses" : T.nomePlano(conta.plano)}`];
  if (conta.f) linhas.push("Válido até: " + T.fData(conta.f));
  if (conta.assin) linhas.push("Assinatura: " + ({ ativa: "ativa", atrasada: "com pagamento em atraso", cancelada: "cancelada", pendente: "aguardando o primeiro pagamento" }[conta.assin.status] || conta.assin.status));
  const pend = (faturas || []).filter(x => x.status === "pendente" || x.status === "atrasado").sort((a, b) => String(b.venc).localeCompare(String(a.venc)))[0];
  if (pend && pend.link) linhas.push("Link para pagar / 2ª via: " + pend.link);
  return linhas;
}

// responde a UMA mensagem recebida
async function responder(deps, m) {
  const { store, wa, agora } = deps, numero = m.from, texto = textoDaMensagem(m), t = semAcento(texto);
  const conta = await acharPorNumero(store, numero);
  const conv = (await store.get("wa_conversas/" + numero)) || {};
  const enviar = x => wa.enviarTexto(numero, x);
  const marca = estado => store.set("wa_conversas/" + numero, { estado, em: new Date(agora()) }, { merge: true });

  if (!texto) { await enviar(T.MENU); return "menu"; }
  if (conv.estado === "suporte" && t !== "0" && t !== "menu") {
    const id = await abrirChamado(deps, { conta, numero, assunto: "WhatsApp: suporte técnico", texto });
    await marca(null);
    await avisarDono(deps, "Novo chamado pelo WhatsApp", [`Número: ${numero}${conta ? " · " + (conta.nome || "") + " <" + (conta.email || "") + ">" : " (não reconhecido)"}`, "", texto]);
    await enviar("Recebi! Abri o chamado e respondemos em até 1 dia útil aqui mesmo. Para voltar ao menu, escreva MENU.");
    return "chamado:" + id;
  }
  if (conv.estado === "humano" && t !== "0" && t !== "menu") {
    const id = await abrirChamado(deps, { conta, numero, assunto: "WhatsApp: falar com o Júnior", texto, humano: true });
    await marca(null);
    await avisarDono(deps, "WhatsApp: cliente quer falar com você", [`Número: ${numero}${conta ? " · " + (conta.nome || "") : " (não reconhecido)"}`, "", texto]);
    await enviar("Avisei o Júnior. Ele responde assim que puder, aqui mesmo.");
    return "humano:" + id;
  }
  if (t === "1") { await marca(null); await enviar(T.textoPlanos(await lerVagas(store), N.hojeFortaleza(agora()))); return "planos"; }
  if (t === "2") {
    await marca(null);
    if (conta) { const fat = await store.consultar("pagamentos", [["uid", "==", conta.id]]); await enviar(dadosDaConta(conta, fat).join("\n") + (fat.some(x => (x.status === "pendente" || x.status === "atrasado") && x.link) ? "" : "\nPara assinar: abra o programa, Minha conta, Planos.")); }
    else await enviar("Para assinar: abra o programa Planejar Obras, entre na sua conta e vá em Minha conta, Planos. Pague por PIX, boleto ou cartão. Se o seu número não está no cadastro, escreva o e-mail da sua conta no chamado (opção 3).\n" + T.AJUDA_URL);
    return "assinar";
  }
  if (t === "3") { await marca("suporte"); await enviar("Certo. Descreva o problema em uma mensagem (o que você tentou fazer e o que aconteceu) que eu abro o chamado."); return "suporte"; }
  if (t === "4") { await marca("humano"); await enviar("Pode escrever o que você precisa em uma mensagem que eu aviso o Júnior."); return "humano_pedido"; }
  for (const q of T.FAQ) if (q.chaves.some(c => t.includes(c))) { await enviar(q.resposta(await lerVagas(store), N.hojeFortaleza(agora()))); return "faq"; }
  if (conta && /(minha conta|validade|vence|meu plano|situacao)/.test(t)) { await enviar(dadosDaConta(conta, await store.consultar("pagamentos", [["uid", "==", conta.id]])).join("\n")); return "conta"; }
  await enviar((conta ? `Olá, ${T.primeiroNome(conta.nome)}! ` : "") + T.MENU);
  return "menu";
}

// req = { metodo, query, corpo, raw, assinatura } -> { status, corpo, texto? }
async function tratarWhatsapp(deps, req) {
  const cfg = deps.config;
  if (req.metodo === "GET") {
    const q = req.query || {};
    if (q["hub.mode"] === "subscribe" && cfg.waVerify && q["hub.verify_token"] === cfg.waVerify) return { status: 200, texto: String(q["hub.challenge"] || "") };
    return { status: 403, texto: "negado" };
  }
  if (req.metodo !== "POST") return { status: 405, texto: "metodo" };
  if (!assinaturaOk(req.raw, req.assinatura, cfg.waAppSecret)) return { status: 401, texto: "assinatura" };
  if (!deps.wa || !deps.wa.ativo) return { status: 200, texto: "desligado" };   // WA_ATIVO=nao: confirma e ignora
  const resultados = [];
  try {
    for (const ent of (req.corpo && req.corpo.entry) || []) for (const ch of ent.changes || []) for (const m of (ch.value && ch.value.messages) || []) {
      if (!m.id || !m.from || !normalizarNumero(m.from)) continue;
      const criou = await deps.store.criar("eventos/wa-" + m.id, { event: "WA_MSG", em: new Date(deps.agora()), estado: "ok" });
      if (!criou) { resultados.push("duplicada"); continue; }   // a Meta reenvia: idempotente
      try { resultados.push(await responder(deps, m)); } catch (e) { console.error("wa responder", e && e.message); await deps.store.apagar("eventos/wa-" + m.id); throw e; }
    }
  } catch (e) { return { status: 500, texto: "erro" }; }
  return { status: 200, texto: "ok", resultados };
}
module.exports = { tratarWhatsapp, assinaturaOk, acharPorNumero };
