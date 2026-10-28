"use strict";
// ============================================================================================================
// ÚNICO LUGAR com planos, preços, ciclos, computadores, módulos, vagas e datas. Para mudar a tabela, mude SÓ AQUI.
// (nenhum outro arquivo tem valor, data ou nome de plano escrito; os textos de planos do robô são montados daqui)
// ============================================================================================================
// Campos de cada plano:
//   nome        nome mostrado ao cliente
//   ciclos      { mensal: preço, anual: preço }  (só os ciclos que existem; valores em reais)
//   maq         computadores incluídos
//   mod         módulos da conta (null = tudo liberado). Nomes iguais aos da Central v5 / programa:
//               Essencial = ["obras","sem_licitacao"] (sem Projetos e sem licitação)
//   resumo      frase curta usada nos textos do robô
//   vaga        (opcional) nome do contador em VAGAS: o plano só vende com vaga e dentro do prazo
//   unicoPorCpf (opcional) true = 1 plano por CPF/CNPJ
//   travado     (opcional) true = preço travado na renovação; o cliente não troca de plano sozinho
//   lancamento  (opcional) { ciclo, valor, vaga }: preço de lançamento enquanto houver vaga e prazo; depois vale o preço normal
//   extra       (opcional) { mensal, anual }: preço de cada computador extra; maxMaq = limite total de computadores
//   ativo       (opcional) false = deixa de vender (quem já assina continua)
//   depoisDe    (opcional) nome de vaga: o plano só vende quando aquela oferta de lançamento ENCERRAR (prazo ou vagas)
//   sobConsulta (opcional) true = não vende pelo programa; proposta pelo WhatsApp e o dono aplica pela Central
//   prioridade  (opcional) true = chamados deste plano aparecem primeiro na Central
const PLANOS = {
  // Tabela aprovada pelo dono em 27/10/2026.
  essencial: { nome: "Essencial", ciclos: { mensal: 39, anual: 390 }, maq: 1, mod: ["obras", "sem_licitacao"], resumo: "orçamento + medição + celular, 1 computador, sem licitação e sem Projetos" },
  fundador: { nome: "Fundador", ciclos: { mensal: 59, anual: 590 }, maq: 3, mod: null, vaga: "fundador", unicoPorCpf: true, travado: true, prioridade: true,
    resumo: "tudo liberado (licitação e Projetos), 3 computadores, preço travado para sempre, suporte prioritário e novidades primeiro" },
  // Profissional: só vende depois que o Fundador encerrar (prazo ou 100 vagas). Antes disso não aparece para venda.
  profissional: { nome: "Profissional", ciclos: { mensal: 69, anual: 690 }, maq: 2, mod: null, depoisDe: "fundador", resumo: "tudo liberado (licitação e Projetos), 2 computadores" },
  // Planejar Empresas: SOB CONSULTA. Não vende pelo "assinar"; o dono aplica pela Central (5 computadores, até 10).
  empresas: { nome: "Planejar Empresas", ciclos: {}, maq: 5, mod: null, ativo: false, sobConsulta: true, maxMaq: 10, resumo: "sob consulta: 5 computadores ou mais, proposta pelo WhatsApp" }
};

// Vagas e prazos de lançamento. O documento vagas/{nome} {usadas,total,ate} do Firestore manda; se não existir, vale este padrão.
// "ate" = último dia de venda (inclusive), "AAAA-MM-DD".
const VAGAS_PADRAO = {
  fundador: { usadas: 0, total: 100, ate: "2027-03-31" }
};

const CICLO_ASAAS = { mensal: "MONTHLY", anual: "YEARLY" };   // não é preço: tradução para o Asaas
const TOLERANCIA_DIAS = 5;          // validade (f) = próximo vencimento + estes dias
const MAQ_MAXIMO = 10;              // teto geral de computadores (regras do Firestore também limitam em 10)
const PLANOS_PAGOS = Object.keys(PLANOS);

module.exports = { PLANOS, VAGAS_PADRAO, CICLO_ASAAS, TOLERANCIA_DIAS, MAQ_MAXIMO, PLANOS_PAGOS };
