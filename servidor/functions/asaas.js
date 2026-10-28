"use strict";
// Cliente HTTP do Asaas (API v3) com fetch nativo. Header de autenticação: access_token. Sem biblioteca.
// Ambiente: "sandbox" (testes, dinheiro de mentira) ou "producao". Qualquer outro valor cai no SANDBOX (nunca cobra de verdade por engano).
const URLS = { sandbox: "https://sandbox.asaas.com/api/v3", producao: "https://api.asaas.com/v3" };

class AsaasErro extends Error {
  constructor(status, corpo, mensagem) { super(mensagem); this.status = status; this.corpo = corpo; this.name = "AsaasErro"; }
}
const ambienteDe = v => (String(v || "").trim().toLowerCase() === "producao" ? "producao" : "sandbox");

function criarAsaas({ apiKey, ambiente, fetchImpl, baseUrl, timeoutMs }) {
  const amb = ambienteDe(ambiente), base = (baseUrl || URLS[amb]).replace(/\/$/, ""), f = fetchImpl || globalThis.fetch;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada");
  async function chamar(metodo, caminho, { corpo, consulta } = {}) {
    let url = base + caminho;
    if (consulta) { const q = new URLSearchParams(); for (const [k, v] of Object.entries(consulta)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v)); const s = q.toString(); if (s) url += "?" + s; }
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null, t = ac ? setTimeout(() => ac.abort(), timeoutMs || 20000) : null;
    let r;
    try {
      r = await f(url, {
        method: metodo, signal: ac ? ac.signal : undefined,
        headers: { "Content-Type": "application/json", access_token: apiKey, "User-Agent": "PlanejarObras-Servidor/1.0" },   // o Asaas exige User-Agent
        body: corpo ? JSON.stringify(corpo) : undefined
      });
    } catch (e) { throw new AsaasErro(0, null, "Sem resposta do Asaas: " + (e && e.message)); } finally { if (t) clearTimeout(t); }
    let j = null; try { j = await r.json(); } catch (e) { /* corpo vazio */ }
    if (!r.ok) {
      const msg = j && Array.isArray(j.errors) && j.errors.length ? j.errors.map(x => x.description).join("; ") : "Erro " + r.status + " do Asaas";
      throw new AsaasErro(r.status, j, msg);
    }
    return j || {};
  }
  return {
    ambiente: amb, base,
    // clientes (customers)
    async buscarClientePorReferencia(ref) { const r = await chamar("GET", "/customers", { consulta: { externalReference: ref, limit: 1 } }); return (r.data && r.data[0]) || null; },
    criarCliente: d => chamar("POST", "/customers", { corpo: d }),
    atualizarCliente: (id, d) => chamar("PUT", "/customers/" + encodeURIComponent(id), { corpo: d }),
    // assinaturas (subscriptions)
    criarAssinatura: d => chamar("POST", "/subscriptions", { corpo: d }),
    obterAssinatura: id => chamar("GET", "/subscriptions/" + encodeURIComponent(id)),
    atualizarAssinatura: (id, d) => chamar("PUT", "/subscriptions/" + encodeURIComponent(id), { corpo: d }),
    cancelarAssinatura: id => chamar("DELETE", "/subscriptions/" + encodeURIComponent(id)),
    async cobrancasDaAssinatura(id) { const r = await chamar("GET", "/subscriptions/" + encodeURIComponent(id) + "/payments", { consulta: { limit: 20 } }); return r.data || []; },
    // cobranças (payments)
    obterCobranca: id => chamar("GET", "/payments/" + encodeURIComponent(id))
  };
}
module.exports = { criarAsaas, AsaasErro, ambienteDe, URLS };
