// Dublês para os testes: Firestore em memória, Asaas falso, e-mail e WhatsApp que só anotam. Nada de rede.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const N = require("../negocio.js"), P = require("../planos.js");

const clonar = v => (v instanceof Date ? new Date(v.getTime()) : Array.isArray(v) ? v.map(clonar) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clonar(x)])) : v);
const plano = v => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
function mesclar(a, b) { const r = clonar(a || {}); for (const [k, v] of Object.entries(b)) { if (v === undefined) continue; r[k] = plano(v) && plano(r[k]) ? mesclar(r[k], v) : clonar(v); } return r; }
const ms = v => (v instanceof Date ? v.getTime() : v);
const caminho = (o, c) => c.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);

export function criarStore() {
  const docs = new Map(); let seq = 0;
  const leitura = d => { const o = clonar(d); const conv = x => (x instanceof Date ? x.getTime() : Array.isArray(x) ? x.map(conv) : plano(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, conv(v)])) : x); return conv(o); };
  const s = {
    docs,
    async get(p) { return docs.has(p) ? leitura(docs.get(p)) : null; },
    async set(p, d, o) { docs.set(p, o && o.merge ? mesclar(docs.get(p), d) : clonar(d)); },
    async criar(p, d) { if (docs.has(p)) return false; docs.set(p, clonar(d)); return true; },
    async apagar(p) { docs.delete(p); },
    async consultar(col, filtros = [], o = {}) {
      const L = [];
      for (const [p, d] of docs) {
        const i = p.lastIndexOf("/"); if (p.slice(0, i) !== col) continue;
        const ok = filtros.every(([c, op, v]) => { const x = ms(caminho(d, c)), y = ms(v); return op === "==" ? x === y : op === ">=" ? x >= y : op === ">" ? x > y : op === "<" ? x < y : op === "<=" ? x <= y : op === "!=" ? x !== y : false; });
        if (ok) L.push(Object.assign({ id: p.slice(i + 1) }, leitura(d)));
      }
      return o.limite ? L.slice(0, o.limite) : L;
    },
    async transacao(fn) { return fn({ get: p => s.get(p), set: (p, d, o) => { docs.set(p, o && o.merge ? mesclar(docs.get(p), d) : clonar(d)); } }); },
    novoId(col) { return col.replace(/\W/g, "") + "_" + ++seq; },
    semear(p, d) { docs.set(p, clonar(d)); return s; }
  };
  return s;
}

export function criarAsaasFalso() {
  const chamadas = []; let n = 0; const subs = new Map(), cobr = new Map(), clientes = new Map();
  return {
    chamadas, subs, cobr, clientes,
    falhar: null,
    async buscarClientePorReferencia(ref) { chamadas.push(["buscarCliente", ref]); return clientes.get(ref) || null; },
    async criarCliente(d) { chamadas.push(["criarCliente", d]); const c = { id: "cus_" + ++n, ...d }; clientes.set(d.externalReference, c); return c; },
    async criarAssinatura(d) {
      chamadas.push(["criarAssinatura", d]); if (this.falhar) throw this.falhar;
      const s = { id: "sub_" + ++n, ...d }; subs.set(s.id, s);
      const c = { id: "pay_" + ++n, subscription: s.id, dueDate: d.nextDueDate, value: d.value, invoiceUrl: "https://sandbox.asaas.com/i/" + n }; cobr.set(c.id, c); return s;
    },
    async cobrancasDaAssinatura(id) { chamadas.push(["cobrancas", id]); return [...cobr.values()].filter(c => c.subscription === id); },
    async atualizarAssinatura(id, d) { chamadas.push(["atualizarAssinatura", id, d]); Object.assign(subs.get(id) || {}, d); return {}; },
    async cancelarAssinatura(id) { chamadas.push(["cancelarAssinatura", id]); subs.delete(id); return { deleted: true }; },
    async obterCobranca(id) { return cobr.get(id); }
  };
}
export function criarEmailFalso() { const enviados = []; const f = async m => { if (f.quebrar) throw new Error("smtp"); enviados.push(m); return { enviado: true }; }; f.enviados = enviados; return f; }
export function criarWaFalso(ativo = true) {
  const e = [];
  return { ativo, enviados: e, async enviarModelo(para, modelo, v) { if (!ativo) return { ignorado: true }; e.push({ tipo: "modelo", para, modelo, v }); return {}; }, async enviarTexto(para, texto) { if (!ativo) return { ignorado: true }; e.push({ tipo: "texto", para, texto }); return {}; } };
}
export const AGORA = Date.parse("2026-11-10T15:00:00Z");   // 10/11/2026 12h em Fortaleza
export function criarDeps(extra = {}) {
  const store = criarStore(), asaas = criarAsaasFalso(), enviarEmail = criarEmailFalso(), wa = criarWaFalso(true);
  const d = { store, asaas, enviarEmail, wa, agora: () => d._agora, _agora: AGORA, sleep: async () => {}, config: { emailDono: "dono@teste.com", donoWhats: "", tokenWebhook: "tok-webhook-secreto-123456789012345678", waVerify: "verif123", waAppSecret: "" }, ...extra };
  return d;
}
export const auth = (uid = "u1", extra = {}) => ({ uid, email: uid + "@teste.com", emailVerificado: true, ...extra });
export const CPF = "529.982.247-25";
export function semearConta(deps, uid = "u1", extra = {}) {
  deps.store.semear("contas/" + uid, { email: uid + "@teste.com", nome: "Maria da Silva", plano: "cortesia3m", criados: 0, maquinas: [], ini: Date.parse("2026-11-09T12:00:00Z"), ...extra });
}
export function evento(event, payment, id) { return { id: id || "evt_" + Math.random().toString(36).slice(2), event, dateCreated: "2026-11-10 12:00:00", payment }; }
