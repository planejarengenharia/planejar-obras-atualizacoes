"use strict";
// Adaptador do Firestore (firebase-admin) para a interface "store" usada pela lógica. Timestamps viram milissegundos ao ler.
function criarArmazem(admin) {
  const db = admin.firestore(), ts = admin.firestore.Timestamp;
  const conv = v => {
    if (v && typeof v.toMillis === "function" && v instanceof ts) return v.toMillis();
    if (Array.isArray(v)) return v.map(conv);
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) { const o = {}; for (const k of Object.keys(v)) o[k] = conv(v[k]); return o; }
    return v;
  };
  const lerSnap = s => (s.exists ? conv(s.data()) : null);
  return {
    async get(p) { return lerSnap(await db.doc(p).get()); },
    async set(p, d, o) { await db.doc(p).set(d, o && o.merge ? { merge: true } : {}); },
    async criar(p, d) { try { await db.doc(p).create(d); return true; } catch (e) { if (e && (e.code === 6 || /ALREADY_EXISTS/.test(String(e.message)))) return false; throw e; } },
    async apagar(p) { await db.doc(p).delete(); },
    async consultar(col, filtros, o) {
      let q = db.collection(col); for (const [c, op, v] of filtros || []) q = q.where(c, op, v); if (o && o.limite) q = q.limit(o.limite);
      return (await q.get()).docs.map(d => Object.assign({ id: d.id }, conv(d.data())));
    },
    async transacao(fn) {
      return db.runTransaction(async t => fn({ get: async p => lerSnap(await t.get(db.doc(p))), set: (p, d, o) => { t.set(db.doc(p), d, o && o.merge ? { merge: true } : {}); } }));
    },
    novoId(col) { return db.collection(col).doc().id; }
  };
}
module.exports = { criarArmazem };
