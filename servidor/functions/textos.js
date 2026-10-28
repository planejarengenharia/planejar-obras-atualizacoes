"use strict";
// Todos os textos que o cliente recebe (aviso dentro do programa, e-mail e WhatsApp). Linguagem simples.
const { PLANOS, VAGAS_PADRAO } = require("./planos");
const { vagaEstado } = require("./negocio");

const SITE = "https://planejarengenharia.github.io/planejar-obras-atualizacoes/";
const AJUDA_URL = SITE;
const SUPORTE_EMAIL = "planejarobrascentral@gmail.com";
const nomePlano = p => (PLANOS[p] ? PLANOS[p].nome : p || "");
const fData = d => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split("-").reverse().join("/") : "");
const fBRL = v => "R$ " + (+v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const primeiroNome = n => String(n || "").trim().split(/\s+/)[0] || "";

// ---------------------------------------------------------------- jornada da cortesia de 3 meses (dias 1, 3, 7, 30, 60, 83)
// tpl = nome do modelo (template) do WhatsApp; o texto do WhatsApp está em WA_MODELOS abaixo.
const JORNADA = {
  1: { tpl: "boas_vindas_cortesia", titulo: "Bem-vindo ao Planejar Obras!", texto: "Sua cortesia de 3 meses já está valendo: até 5 orçamentos e tudo liberado, inclusive o Planejar Projetos. Comece criando uma obra e deixe o programa montar o orçamento para você. Qualquer dúvida, é só abrir um chamado em Minha conta." },
  3: { tpl: "dica_dia3", titulo: "Dica: orçamento com a tabela de preços certa", texto: "Escolha a tabela (SINAPI, SEINFRA, ORSE...) e o estado da sua obra logo no início. O programa atualiza os preços e avisa quando uma composição mudar. Veja a Ajuda para o passo a passo." },
  7: { tpl: "dica_dia7", titulo: "Dica: medição e celular", texto: "Já fez a primeira medição? Use o celular na obra para registrar os serviços executados e o programa calcula o boletim para você. Se travar em alguma etapa, abra um chamado." },
  30: { tpl: "meio_cortesia_dia30", titulo: "Você já usou um terço da cortesia", texto: "Faltam cerca de 60 dias da sua cortesia. Aproveite para testar o Planejar Projetos e a medição. Quando quiser continuar sem pausa, veja os planos em Minha conta." },
  60: { tpl: "faltam_30_dias", titulo: "Faltam 30 dias da sua cortesia", texto: "Sua cortesia termina em cerca de 30 dias. Depois disso o programa fica só para consulta (você continua vendo e baixando suas obras). Para seguir criando e editando, escolha um plano em Minha conta." },
  83: { tpl: "faltam_7_dias", titulo: "Faltam 7 dias da sua cortesia", texto: "Sua cortesia acaba em 7 dias. Escolha o plano em Minha conta (PIX, boleto ou cartão) para não parar o trabalho. Suas obras continuam guardadas no seu computador." }
};

// ---------------------------------------------------------------- avisos de pagamento e assistência
const T = {
  pagamento(d) {   // d: {plano, f, primeira}
    return { titulo: d.primeira ? "Pagamento confirmado: bem-vindo ao plano " + nomePlano(d.plano) : "Renovação confirmada: plano " + nomePlano(d.plano), texto: `Recebemos o seu pagamento. O plano ${nomePlano(d.plano)} está liberado até ${fData(d.f)}. Obrigado por usar o Planejar Obras!` };
  },
  atraso(d) { return { titulo: "Pagamento em atraso", texto: `Não identificamos o pagamento do plano ${nomePlano(d.plano)}. Seu plano continua valendo até ${fData(d.f)}. Para pagar agora (ou pegar a 2ª via), use este link: ${d.link || "veja em Minha conta"}` }; },
  cancelada(d) { return { titulo: "Assinatura cancelada", texto: `Sua assinatura foi cancelada e não será renovada. Você continua usando o plano normalmente até ${fData(d.f)}. Para voltar, assine de novo em Minha conta.` }; },
  estorno() { return { titulo: "Pagamento estornado", texto: "O pagamento foi estornado e o plano voltou às regras da cortesia. Suas obras continuam no seu computador. Dúvidas? Abra um chamado em Minha conta." }; },
  renovacao(d) { return { titulo: "Seu plano vence em 7 dias", texto: `O plano ${nomePlano(d.plano)} vale até ${fData(d.f)} e não renova sozinho. Assine em Minha conta para continuar sem pausa.` }; },
  resposta(d) { return { titulo: "Resposta ao seu chamado", texto: `Respondemos ao seu chamado "${d.assunto}". Abra Minha conta, aba Suporte, para ler.` }; },
  chamadoRecebido(d) { return { titulo: "Recebemos o seu chamado", texto: `Seu chamado "${d.assunto}" foi aberto. Respondemos em até 1 dia útil.` }; }
};

// ---------------------------------------------------------------- modelos (templates) do WhatsApp: cadastrar no Meta Business EXATAMENTE assim
// idioma pt_BR. "corpo" usa {{1}}, {{2}}... na ordem de "params". categoria: UTILITY (aviso de conta) ou MARKETING (dicas).
const WA_MODELOS = {
  boas_vindas_cortesia: { categoria: "UTILITY", params: ["nome"], corpo: "Olá, {{1}}! Sua conta no Planejar Obras foi criada e a cortesia de 3 meses já está valendo: até 5 orçamentos e tudo liberado. Qualquer dúvida, é só responder esta mensagem." },
  dica_dia3: { categoria: "MARKETING", params: ["nome"], corpo: "Olá, {{1}}! Dica do Planejar Obras: escolha a tabela de preços (SINAPI, SEINFRA, ORSE) e o estado da obra logo no início, que o orçamento sai certo. Dúvidas? Responda esta mensagem." },
  dica_dia7: { categoria: "MARKETING", params: ["nome"], corpo: "Olá, {{1}}! Já fez a primeira medição? Use o celular na obra para registrar os serviços e o Planejar Obras calcula o boletim para você. Precisa de ajuda? Responda esta mensagem." },
  meio_cortesia_dia30: { categoria: "MARKETING", params: ["nome"], corpo: "Olá, {{1}}! Sua cortesia do Planejar Obras está na metade do caminho. Aproveite para testar o Planejar Projetos e a medição. Se precisar de ajuda, responda esta mensagem." },
  faltam_30_dias: { categoria: "UTILITY", params: ["nome"], corpo: "Olá, {{1}}! Faltam cerca de 30 dias para terminar a sua cortesia do Planejar Obras. Para continuar sem pausa, escolha um plano em Minha conta. Responda 2 para receber o link." },
  faltam_7_dias: { categoria: "UTILITY", params: ["nome"], corpo: "Olá, {{1}}! Faltam 7 dias para terminar a sua cortesia do Planejar Obras. Escolha um plano em Minha conta (PIX, boleto ou cartão) para não parar o trabalho. Suas obras continuam no seu computador." },
  pagamento_confirmado: { categoria: "UTILITY", params: ["nome", "plano", "validade"], corpo: "Olá, {{1}}! Recebemos o seu pagamento. O plano {{2}} do Planejar Obras está liberado até {{3}}. Obrigado!" },
  pagamento_atrasado: { categoria: "UTILITY", params: ["nome", "plano", "link"], corpo: "Olá, {{1}}! Não identificamos o pagamento do plano {{2}} do Planejar Obras. Para pagar ou pegar a 2ª via, use este link: {{3}}" },
  assinatura_cancelada: { categoria: "UTILITY", params: ["nome", "validade"], corpo: "Olá, {{1}}! Sua assinatura do Planejar Obras foi cancelada e não será renovada. Você continua usando o plano até {{2}}." },
  renovacao_7_dias: { categoria: "UTILITY", params: ["nome", "validade"], corpo: "Olá, {{1}}! Seu plano do Planejar Obras vence em 7 dias, em {{2}}, e não renova sozinho. Assine em Minha conta para continuar sem pausa." },
  chamado_respondido: { categoria: "UTILITY", params: ["nome", "assunto"], corpo: "Olá, {{1}}! Respondemos ao seu chamado \"{{2}}\" no Planejar Obras. Abra Minha conta, aba Suporte, para ler a resposta." }
};
const WA_IDIOMA = "pt_BR";
function preencherModelo(nome, valores) {   // texto final do modelo (para conferir/registrar)
  const m = WA_MODELOS[nome]; if (!m) return null;
  return m.corpo.replace(/\{\{(\d+)\}\}/g, (_, i) => String(valores[m.params[+i - 1]] ?? ""));
}

// ---------------------------------------------------------------- robô do WhatsApp
function textoPlanos(vagas, hoje) {   // montado de planos.js (+ vagas reais): mudou a tabela, muda o robô
  const L = ["Planos do Planejar Obras:"];
  for (const [k, P] of Object.entries(PLANOS)) {
    if (P.sobConsulta) { L.push(`- ${P.nome}: sob consulta (${P.resumo})`); continue; }
    if (P.ativo === false) continue;
    if (P.depoisDe && hoje && vagaEstado(vagas, P.depoisDe, hoje).aberta) continue;   // Profissional só aparece quando o Fundador encerra
    if (P.vaga && hoje && !vagaEstado(vagas, P.vaga, hoje).aberta) continue;   // oferta de lançamento encerrada (prazo ou vagas): não aparece
    const preco = Object.entries(P.ciclos).map(([c, v]) => `${fBRL(v)}/${c === "mensal" ? "mês" : "ano"}`).join(" ou ");
    let x = `- ${P.nome}: ${preco} (${P.resumo})`;
    if (P.vaga && VAGAS_PADRAO[P.vaga]) {
      const v = vagaEstado(vagas, P.vaga, hoje || "0000-00-00");
      x += v.restam <= LIMITE_RESTAM ? `; restam ${v.restam} vagas, vendas até ${fData(v.ate)}` : `; ${v.total} vagas até ${fData(v.ate)}`;
    }
    L.push(x);
  }
  L.push("Para assinar: abra o programa, Minha conta, Planos. Pague por PIX, boleto ou cartão. Veja mais: " + AJUDA_URL);
  return L.join("\n");
}
const LIMITE_RESTAM = 30;   // "restam N vagas" só aparece quando restarem 30 ou menos
const MENU = "Olá! Eu sou o assistente do Planejar Obras. Responda com um número:\n1 - Planos e preços\n2 - Assinar ou 2ª via de pagamento\n3 - Suporte técnico\n4 - Falar com o Júnior";
const FAQ = [   // palavras-chave (sem acento, minúsculas) -> resposta pronta
  { chaves: ["preco", "valor", "quanto custa", "plano"], resposta: (vagas, hoje) => textoPlanos(vagas, hoje) },
  { chaves: ["senha", "esqueci"], resposta: () => "Para trocar a senha, na tela de entrada do programa toque em 'Esqueci a senha' e siga o e-mail que enviamos. Veja também: " + AJUDA_URL },
  { chaves: ["computador", "maquina", "trocar de pc", "liberar"], resposta: () => "Para trocar de computador: em Minha conta, ao lado do computador antigo, use 'Liberar este computador' (1 vez a cada 30 dias). Veja: " + AJUDA_URL },
  { chaves: ["nota fiscal", "nf"], resposta: () => "A nota fiscal é emitida automaticamente depois do pagamento e o link aparece nas suas faturas em Minha conta." },
  { chaves: ["cancelar"], resposta: () => "Para cancelar a assinatura: Minha conta, Assinatura, Cancelar. Você continua usando até o fim do período pago." },
  { chaves: ["cortesia", "gratis", "teste"], resposta: () => "A cortesia de 3 meses vale para todo mundo que cria a conta: até 5 orçamentos e tudo liberado, sem cartão. Veja: " + AJUDA_URL },
  { chaves: ["instalar", "baixar", "download"], resposta: () => "Baixe o instalador no site e dê dois cliques: " + AJUDA_URL }
];

module.exports = { SITE, AJUDA_URL, SUPORTE_EMAIL, nomePlano, fData, fBRL, primeiroNome, JORNADA, T, WA_MODELOS, WA_IDIOMA, preencherModelo, textoPlanos, LIMITE_RESTAM, MENU, FAQ };
