"use strict";
// Um aviso = aviso dentro do programa (avisos/{uid}/itens/{id}) + e-mail + WhatsApp (se a conta consentiu). ID fixo = nunca repete.
const emails = require("./emails");

async function avisar(deps, { uid, conta, avisoId, aviso, link, wa }) {
  const { store, agora } = deps;
  const criou = await store.criar(`avisos/${uid}/itens/${avisoId}`, { titulo: aviso.titulo, texto: aviso.texto, em: new Date(agora()), lido: false });
  if (!criou) return { novo: false };
  const r = { novo: true, email: false, wa: false };
  if (conta && conta.email) {
    try { await deps.enviarEmail(emails.montar({ para: conta.email, nome: conta.nome, titulo: aviso.titulo, texto: aviso.texto, link })); r.email = true; } catch (e) { console.error("email", e && e.message); }
  }
  if (wa && conta && conta.whatsOk === true && conta.whats && deps.wa && deps.wa.ativo) {
    try { const x = await deps.wa.enviarModelo(conta.whats, wa.modelo, Object.assign({ nome: String(conta.nome || "").trim().split(/\s+/)[0] || "cliente" }, wa.valores || {})); r.wa = !x.ignorado; } catch (e) { console.error("whatsapp", e && e.message); }
  }
  return r;
}
async function avisarDono(deps, assunto, linhas) {
  try { await deps.enviarEmail(emails.paraDono(deps.config.emailDono, assunto, linhas)); } catch (e) { console.error("email dono", e && e.message); }
  try { if (deps.wa && deps.wa.ativo && deps.config.donoWhats) await deps.wa.enviarTexto(deps.config.donoWhats, assunto + "\n" + linhas.join("\n")); } catch (e) { console.error("wa dono", e && e.message); }
}
module.exports = { avisar, avisarDono };
