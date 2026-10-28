"use strict";
// WhatsApp Business Cloud API (oficial, Meta). Modelos aprovados (fora da janela de 24 h) e texto livre (dentro da janela).
// WA_ATIVO diferente de "sim" = tudo vira "ignorado" e nada quebra (só e-mail).
const { WA_MODELOS, WA_IDIOMA, preencherModelo } = require("./textos");

const soDigitos = s => String(s == null ? "" : s).replace(/\D/g, "");
// número no formato da Meta: só dígitos com DDI 55. Aceita "(88) 99708-4754", "88997084754", "5588997084754".
function normalizarNumero(v) {
  let d = soDigitos(v); if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.length >= 12 && d.length <= 13 && d.startsWith("55") ? d : null;
}
// o WhatsApp do Brasil às vezes entrega o número sem o 9 (55 88 9708-4754): aceita as duas formas ao reconhecer o cliente
function variantesNumero(v) {
  const n = normalizarNumero(v); if (!n) return [];
  const ddd = n.slice(2, 4), resto = n.slice(4), s = new Set([n]);
  if (resto.length === 9 && resto[0] === "9") s.add("55" + ddd + resto.slice(1));
  if (resto.length === 8) s.add("55" + ddd + "9" + resto);
  return [...s];
}
function criarWhatsapp({ token, phoneId, ativo, fetchImpl, versao }) {
  const on = String(ativo || "").trim().toLowerCase() === "sim" && !!token && !!phoneId, f = fetchImpl || globalThis.fetch;
  async function postar(corpo) {
    const r = await f(`https://graph.facebook.com/${versao || "v21.0"}/${encodeURIComponent(phoneId)}/messages`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ messaging_product: "whatsapp", recipient_type: "individual" }, corpo)) });
    let j = null; try { j = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok) throw new Error("WhatsApp " + r.status + ": " + ((j && j.error && j.error.message) || ""));
    return j || {};
  }
  return {
    ativo: on,
    // valores = objeto {nome, plano, ...}; a ordem vem de WA_MODELOS[modelo].params
    async enviarModelo(para, modelo, valores) {
      if (!on) return { ignorado: true };
      const m = WA_MODELOS[modelo], to = normalizarNumero(para);
      if (!m) throw new Error("modelo desconhecido: " + modelo);
      if (!to) return { ignorado: true, motivo: "numero_invalido" };
      return postar({ to, type: "template", template: { name: modelo, language: { code: WA_IDIOMA }, components: [{ type: "body", parameters: m.params.map(p => ({ type: "text", text: String(valores[p] ?? "-").slice(0, 1000) })) }] } });
    },
    async enviarTexto(para, texto) {
      if (!on) return { ignorado: true };
      const to = normalizarNumero(para); if (!to) return { ignorado: true, motivo: "numero_invalido" };
      return postar({ to, type: "text", text: { body: String(texto).slice(0, 4000), preview_url: true } });
    }
  };
}
module.exports = { criarWhatsapp, normalizarNumero, variantesNumero, preencherModelo };
