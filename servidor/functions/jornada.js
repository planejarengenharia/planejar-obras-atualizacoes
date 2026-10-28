"use strict";
const N = require("./negocio");
const T = require("./textos");
const { avisar, avisarDono } = require("./avisar");

// rodada diária (9h, America/Fortaleza): jornada da cortesia, aviso de renovação e resumo para o dono
async function jornadaDiaria(deps) {
  const { store, agora } = deps, hoje = N.hojeFortaleza(agora()), r = { jornada: 0, renovacao: 0 };
  // 1) cortesia: dias 1, 3, 7, 30, 60, 83 a partir de contas.ini (cada marco só uma vez: o ID do aviso é fixo)
  for (const c of await store.consultar("contas", [["plano", "==", "cortesia3m"]])) {
    if (!c.ini || c.s === "suspenso" || c.s === "cancelado") continue;
    const dias = N.diasDesde(c.ini, hoje), marco = N.marcoDoDia(dias);
    if (!marco) continue;
    const j = T.JORNADA[marco];
    const x = await avisar(deps, { uid: c.id, conta: c, avisoId: "jornada-d" + marco, aviso: { titulo: j.titulo, texto: j.texto }, wa: { modelo: j.tpl, valores: {} } });
    if (x.novo) r.jornada++;
  }
  // 2) plano pago sem assinatura automática (ou cancelada) que vence em 7 dias
  for (const c of await store.consultar("contas", [["f", "==", N.somarDias(hoje, 7)]])) {
    if (!c.plano || c.plano === "cortesia3m" || (c.assin && (c.assin.status === "ativa" || c.assin.status === "atrasada" || c.assin.status === "pendente"))) continue;
    const av = T.T.renovacao({ plano: c.plano, f: c.f });
    const x = await avisar(deps, { uid: c.id, conta: c, avisoId: "renovacao-" + c.f, aviso: av, wa: { modelo: "renovacao_7_dias", valores: { validade: T.fData(c.f) } } });
    if (x.novo) r.renovacao++;
  }
  // 3) resumo do dia para o dono (e-mail; WhatsApp se configurado)
  const ontem = new Date(new Date(agora()).getTime() - 864e5);
  const novos = await store.consultar("contas", [["criadoEm", ">=", ontem]]);
  const pagos = await store.consultar("pagamentos", [["pagoEm", "==", hoje]]);
  const abertos = await store.consultar("chamados", [["status", "==", "aberto"]]);
  await avisarDono(deps, `Planejar Obras: resumo de ${T.fData(hoje)}`, [`Novos cadastros (24 h): ${novos.length}`, `Pagamentos hoje: ${pagos.length}` + (pagos.length ? ` (R$ ${pagos.reduce((s, p) => s + (+p.valor || 0), 0).toFixed(2)})` : ""), `Chamados abertos: ${abertos.length}`, `Avisos enviados: jornada ${r.jornada}, renovação ${r.renovacao}`]);
  r.resumo = { novos: novos.length, pagos: pagos.length, abertos: abertos.length };
  return r;
}
module.exports = { jornadaDiaria };
