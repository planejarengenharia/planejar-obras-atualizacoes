"use strict";
// Regras de negócio PURAS (sem Firebase, sem rede, sem relógio escondido): tudo recebe os dados e devolve o resultado.
const { PLANOS, VAGAS_PADRAO, CICLO_ASAAS, TOLERANCIA_DIAS, MAQ_MAXIMO } = require("./planos");

// ---------------------------------------------------------------- erro de negócio (o index.js converte em HttpsError)
class ErroNegocio extends Error {
  constructor(codigo, mensagem, detalhe) { super(mensagem); this.codigo = codigo; this.mensagem = mensagem; this.detalhe = detalhe || null; }   // detalhe: motivo de negócio (ex.: "sob_consulta")
}

// ---------------------------------------------------------------- datas (texto "AAAA-MM-DD"; fuso de Fortaleza, UTC-3 sem horário de verão)
const dataValida = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z"));
function hojeFortaleza(agora) { return new Date(new Date(agora).getTime() - 3 * 3600e3).toISOString().slice(0, 10); }
function somarDias(ymd, n) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function somarMeses(ymd, n) {   // dia 31 + 1 mês = último dia do mês seguinte (nunca "pula" de mês)
  const [a, m, d] = ymd.split("-").map(Number), alvo = new Date(Date.UTC(a, m - 1 + n, 1, 12));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo)); return alvo.toISOString().slice(0, 10);
}
const somarCiclo = (ymd, ciclo) => somarMeses(ymd, ciclo === "anual" ? 12 : 1);
const diasEntre = (de, ate) => Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 864e5);
const maiorData = (a, b) => (!a ? b : !b ? a : a >= b ? a : b);

// ---------------------------------------------------------------- CPF / CNPJ
const soDigitos = s => String(s == null ? "" : s).replace(/\D/g, "");
function cpfOk(c) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) { let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i); const dv = ((s * 10) % 11) % 10; if (dv !== +c[t]) return false; }
  return true;
}
function cnpjOk(c) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [12, 13]) { let s = 0, p = t - 7; for (let i = 0; i < t; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const dv = s % 11 < 2 ? 0 : 11 - (s % 11); if (dv !== +c[t]) return false; }
  return true;
}
function validarCpfCnpj(v) { const d = soDigitos(v); return (cpfOk(d) || cnpjOk(d)) ? d : null; }

// ---------------------------------------------------------------- oferta: preço, vaga e regras do Fundador / lançamento Empresas
// vagas = { fundador: {usadas,total,ate}|null, empresas: {...}|null }  (null = usa o padrão)
function vagaEstado(vagas, nome, hoje) {
  const v = Object.assign({}, VAGAS_PADRAO[nome], (vagas && vagas[nome]) || {});
  return { usadas: +v.usadas || 0, total: +v.total || 0, ate: v.ate, aberta: hoje <= v.ate && (+v.usadas || 0) < (+v.total || 0), noPrazo: hoje <= v.ate, restam: Math.max(0, (+v.total || 0) - (+v.usadas || 0)) };
}
function calcularOferta({ plano, ciclo, extras, hoje, vagas }) {
  const P = PLANOS[plano];
  if (!P || P.ativo === false) return { ok: false, codigo: P && P.sobConsulta ? "sob_consulta" : "plano_invalido", mensagem: P && P.sobConsulta ? `O ${P.nome} é sob consulta: fale com a gente pelo WhatsApp ou pelo suporte.` : "Esse plano não está à venda." };
  if (ciclo !== "mensal" && ciclo !== "anual") return { ok: false, codigo: "ciclo_invalido", mensagem: "Escolha o pagamento mensal ou anual." };
  if (!P.ciclos[ciclo]) return { ok: false, codigo: "ciclo_invalido", mensagem: `O plano ${P.nome} só tem pagamento ${ciclo === "mensal" ? "anual" : "mensal"}.` };
  const ex = extras == null || extras === "" ? 0 : Number(extras);
  if (!Number.isInteger(ex) || ex < 0) return { ok: false, codigo: "extras_invalidos", mensagem: "Quantidade de computadores extras inválida." };
  if (ex > 0 && !P.extra) return { ok: false, codigo: "extras_invalidos", mensagem: `O plano ${P.nome} não tem computador extra.` };
  if (P.extra && P.maq + ex > (P.maxMaq || MAQ_MAXIMO)) return { ok: false, codigo: "extras_invalidos", mensagem: `O máximo é ${P.maxMaq || MAQ_MAXIMO} computadores no total.` };
  if (P.depoisDe && vagaEstado(vagas, P.depoisDe, hoje).aberta) return { ok: false, codigo: "plano_indisponivel", mensagem: `O plano ${P.nome} ainda não está à venda: assine o plano de lançamento enquanto ele durar.` };
  let valor = P.ciclos[ciclo], vaga = null;
  if (P.vaga) {   // Fundador: só vende com vaga e dentro do prazo
    const v = vagaEstado(vagas, P.vaga, hoje);
    const fim = String(v.ate || "").split("-").reverse().join("/");
    if (!v.noPrazo) return { ok: false, codigo: "prazo_encerrado", mensagem: `O plano ${P.nome} foi encerrado em ${fim}. Veja os outros planos.` };
    if (!v.aberta) return { ok: false, codigo: "vagas_esgotadas", mensagem: `As vagas do plano ${P.nome} acabaram. Veja os outros planos.` };
    vaga = P.vaga;
  } else if (P.lancamento && ciclo === P.lancamento.ciclo) {   // Empresas anual: preço de lançamento enquanto houver vaga e prazo; depois, preço normal
    const v = vagaEstado(vagas, P.lancamento.vaga, hoje);
    if (v.aberta) { valor = P.lancamento.valor; vaga = P.lancamento.vaga; }
  }
  if (P.extra) valor += ex * P.extra[ciclo];
  valor = Math.round(valor * 100) / 100;
  return { ok: true, plano, ciclo, cicloAsaas: CICLO_ASAAS[ciclo], valor, vaga, extras: ex, maq: P.maq + ex, nome: P.nome, descricao: `Planejar Obras - ${P.nome} (${ciclo})${ex ? ` + ${ex} computador(es) extra` : ""}` };
}

// ---------------------------------------------------------------- o que o pagamento grava na conta
// prox = próximo vencimento; f = prox + 5 dias; nunca diminui a validade que a conta já tem.
function proximoVencimento(venc, ciclo) { return somarCiclo(venc, ciclo); }
function camposDoPlano({ plano, ciclo, venc, extras, fAtual }) {
  const P = PLANOS[plano]; if (!P) return null;
  const prox = proximoVencimento(venc, ciclo), novoF = somarDias(prox, TOLERANCIA_DIAS);
  const ex = P.extra ? Math.max(0, Math.min((P.maxMaq || MAQ_MAXIMO) - P.maq, Math.floor(+extras) || 0)) : 0;
  return { prox, conta: { plano, f: maiorData(fAtual, novoF), lim: null, mod: P.mod ? P.mod.slice() : null, maq: P.maq + ex } };
}
// estorno / chargeback: volta à regra da cortesia de 3 meses (o programa trata o resto pelo início da conta)
const camposCortesia = () => ({ plano: "cortesia3m", f: null, lim: null, mod: null, maq: null });

// ---------------------------------------------------------------- jornada da cortesia (dias a partir de contas.ini)
const MARCOS_JORNADA = [1, 3, 7, 30, 60, 83];
function diasDesde(iniMs, hoje) { return diasEntre(hojeFortaleza(iniMs), hoje); }
const marcoDoDia = dias => (MARCOS_JORNADA.includes(dias) ? dias : null);

// ---------------------------------------------------------------- suporte prioritário (plano com prioridade:true e dentro da validade)
function contaPrioritaria(conta, hoje) {
  const P = conta && PLANOS[conta.plano];
  return !!(P && P.prioridade && (!conta.f || !hoje || conta.f >= hoje));
}

// ---------------------------------------------------------------- texto de chamado
function validarTexto(t, max, rotulo) {
  const s = String(t == null ? "" : t).replace(/\r/g, "").trim();
  if (!s) throw new ErroNegocio("invalid-argument", `Escreva ${rotulo}.`);
  if (s.length > max) throw new ErroNegocio("invalid-argument", `${rotulo[0].toUpperCase()}${rotulo.slice(1)} está muito longo (máximo ${max} letras).`);
  return s;
}

module.exports = { ErroNegocio, dataValida, hojeFortaleza, somarDias, somarMeses, somarCiclo, diasEntre, maiorData, soDigitos, validarCpfCnpj, vagaEstado, calcularOferta, proximoVencimento, camposDoPlano, camposCortesia, contaPrioritaria, MARCOS_JORNADA, diasDesde, marcoDoDia, validarTexto };
