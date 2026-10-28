"use strict";
const N = require("./negocio");
const { avisar, avisarDono } = require("./avisar");
const emails = require("./emails");
const T = require("./textos");
const ErroNegocio = N.ErroNegocio;
const MAX_ABERTOS = 10;

// 27/10 (CEO): datas em texto ISO na resposta (o Timestamp do Firestore não vira data no programa); origem "programa" como a Central espera
const iso = v => { try { if (!v) return null; if (typeof v.toDate === "function") return v.toDate().toISOString(); if (v instanceof Date) return v.toISOString(); if (typeof v === "object" && (v.seconds != null || v._seconds != null)) return new Date(1000 * (v.seconds != null ? v.seconds : v._seconds)).toISOString(); return String(v); } catch (e) { return null; } };
const publico = c => ({ id: c.id, assunto: c.assunto, status: c.status, msgs: (c.msgs || []).map(m => Object.assign({}, m, { em: iso(m.em) })), criadoEm: iso(c.criadoEm), atualizadoEm: iso(c.atualizadoEm), origem: c.origem || "programa" });

// chamado do CLIENTE: abrir | responder | listar
async function chamado(deps, auth, dados) {
  if (!auth || !auth.uid) throw new ErroNegocio("unauthenticated", "Entre na sua conta para continuar.");
  const { store, agora } = deps, acao = (dados && dados.acao) || "listar", em = new Date(agora());
  const conta = (await store.get("contas/" + auth.uid)) || {};
  if (acao === "listar") {
    const L = (await store.consultar("chamados", [["uid", "==", auth.uid]])).sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
    return { chamados: L.map(publico) };
  }
  if (auth.emailVerificado !== true) throw new ErroNegocio("failed-precondition", "Confirme o seu e-mail para usar o suporte.");
  if (acao === "abrir") {
    const assunto = N.validarTexto(dados.assunto, 120, "o assunto"), texto = N.validarTexto(dados.texto, 4000, "a mensagem");
    const abertos = await store.consultar("chamados", [["uid", "==", auth.uid], ["status", "==", "aberto"]]);
    if (abertos.length >= MAX_ABERTOS) throw new ErroNegocio("resource-exhausted", "Você já tem muitos chamados abertos. Aguarde a resposta.");
    const id = store.novoId("chamados");
    await store.set("chamados/" + id, { uid: auth.uid, email: auth.email || conta.email || "", nome: conta.nome || "", assunto, msgs: [{ de: "cliente", texto, em }], status: "aberto", criadoEm: em, atualizadoEm: em, versao: String(dados.versao || "").slice(0, 20), maq: String(dados.maq || "").slice(0, 20), origem: "app", prioridade: N.contaPrioritaria(conta, N.hojeFortaleza(agora())) });
    await avisarDono(deps, "Novo chamado: " + assunto, [`De: ${conta.nome || ""} <${auth.email || conta.email || ""}>`, `Plano: ${conta.plano || "cortesia3m"}${N.contaPrioritaria(conta, N.hojeFortaleza(agora())) ? " (SUPORTE PRIORITÁRIO)" : ""} · versão ${dados.versao || "-"}`, "", texto, "", "Responda pela Central v5 (aba Suporte)."]);
    return { ok: true, id };
  }
  if (acao === "responder") {
    const id = String(dados.id || ""), texto = N.validarTexto(dados.texto, 4000, "a mensagem");
    const c = id ? await store.get("chamados/" + id) : null;
    if (!c || c.uid !== auth.uid) throw new ErroNegocio("not-found", "Chamado não encontrado.");
    await store.set("chamados/" + id, { msgs: c.msgs.concat([{ de: "cliente", texto, em }]), status: "aberto", atualizadoEm: em, prioridade: N.contaPrioritaria(conta, N.hojeFortaleza(agora())) }, { merge: true });
    await avisarDono(deps, "Nova mensagem no chamado: " + c.assunto, [`De: ${c.nome || ""} <${c.email || ""}>`, "", texto]);
    return { ok: true, id };
  }
  throw new ErroNegocio("invalid-argument", "Ação desconhecida.");
}

// resposta do DONO (só administrador = existe admins/{uid})
async function responderChamado(deps, auth, dados) {
  if (!auth || !auth.uid) throw new ErroNegocio("unauthenticated", "Entre para continuar.");
  const { store, agora } = deps;
  if (!(await store.get("admins/" + auth.uid))) throw new ErroNegocio("permission-denied", "Só o administrador pode responder.");
  const id = String((dados && dados.id) || ""), texto = N.validarTexto(dados && dados.texto, 4000, "a resposta");
  const c = id ? await store.get("chamados/" + id) : null;
  if (!c) throw new ErroNegocio("not-found", "Chamado não encontrado.");
  const em = new Date(agora());
  await store.set("chamados/" + id, { msgs: c.msgs.concat([{ de: "planejar", texto, em }]), status: "respondido", atualizadoEm: em }, { merge: true });
  const conta = c.uid ? await store.get("contas/" + c.uid) : null;
  const av = T.T.resposta({ assunto: c.assunto });
  if (c.origem === "whatsapp" && c.whats && deps.wa && deps.wa.ativo) {   // conversa do WhatsApp: responde no próprio WhatsApp (janela de 24 h) e, se não der, por modelo
    try { await deps.wa.enviarTexto(c.whats, texto); } catch (e) { try { if (conta) await deps.wa.enviarModelo(c.whats, "chamado_respondido", { nome: (conta.nome || "").split(" ")[0] || "cliente", assunto: c.assunto }); } catch (e2) { console.error("wa", e2 && e2.message); } }
  }
  const destino = c.email || (conta && conta.email);
  if (destino) { try { await deps.enviarEmail(emails.montar({ para: destino, nome: c.nome, titulo: "Resposta ao seu chamado: " + c.assunto, texto })); } catch (e) { console.error("email", e && e.message); } }
  if (c.uid && c.origem !== "whatsapp") await avisar(deps, { uid: c.uid, conta: Object.assign({}, conta, { email: null }), avisoId: "resp-" + id + "-" + c.msgs.length, aviso: av, wa: { modelo: "chamado_respondido", valores: { assunto: c.assunto } } });
  else if (c.uid) await store.criar(`avisos/${c.uid}/itens/resp-${id}-${c.msgs.length}`, { titulo: av.titulo, texto: av.texto, em, lido: false });
  return { ok: true };
}
module.exports = { chamado, responderChamado, publico };
