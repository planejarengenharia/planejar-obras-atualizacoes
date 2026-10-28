"use strict";
// Planejar Obras - Cloud Functions 2ª geração (Node 20), região southamerica-east1.
// Aqui só existe a "fiação" (Firebase, segredos, nodemailer). Toda a regra está em módulos testados sem rede:
// negocio.js, planos.js, assinatura.js, chamados.js, jornada.js, webhook.js, whatsappbot.js, emails.js, textos.js, asaas.js, whatsapp.js.
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

const REGIAO = "southamerica-east1";
setGlobalOptions({ region: REGIAO, maxInstances: 10 });
admin.initializeApp();
admin.firestore().settings({ ignoreUndefinedProperties: true });

const ASAAS_API_KEY = defineSecret("ASAAS_API_KEY"), ASAAS_WEBHOOK_TOKEN = defineSecret("ASAAS_WEBHOOK_TOKEN"), ASAAS_AMBIENTE = defineSecret("ASAAS_AMBIENTE");
const SMTP_USUARIO = defineSecret("SMTP_USUARIO"), SMTP_SENHA = defineSecret("SMTP_SENHA");
const WA_TOKEN = defineSecret("WA_TOKEN"), WA_PHONE_ID = defineSecret("WA_PHONE_ID"), WA_VERIFY_TOKEN = defineSecret("WA_VERIFY_TOKEN"), WA_ATIVO = defineSecret("WA_ATIVO"), WA_APP_SECRET = defineSecret("WA_APP_SECRET");
const SEGREDOS_TODOS = [ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, ASAAS_AMBIENTE, SMTP_USUARIO, SMTP_SENHA, WA_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN, WA_ATIVO, WA_APP_SECRET];

const EMAIL_DONO = "planejarobrascentral@gmail.com";
const { criarArmazem } = require("./armazem");
const { criarAsaas } = require("./asaas");
const { criarEnviador } = require("./emails");
const { criarWhatsapp, normalizarNumero } = require("./whatsapp");
const { ErroNegocio } = require("./negocio");
const { assinar, minhaAssinatura } = require("./assinatura");
const { chamado, responderChamado } = require("./chamados");
const { jornadaDiaria } = require("./jornada");
const { tratarWebhook } = require("./webhook");
const { tratarWhatsapp } = require("./whatsappbot");

function montarDeps() {
  const nodemailer = require("nodemailer");
  const transporte = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: SMTP_USUARIO.value().trim(), pass: SMTP_SENHA.value().trim() } });
  return {
    store: criarArmazem(admin),
    asaas: ASAAS_API_KEY.value() ? criarAsaas({ apiKey: ASAAS_API_KEY.value().trim(), ambiente: ASAAS_AMBIENTE.value() }) : null,
    enviarEmail: criarEnviador({ transporte, de: `Planejar Obras <${SMTP_USUARIO.value().trim()}>` }),
    wa: criarWhatsapp({ token: WA_TOKEN.value().trim(), phoneId: WA_PHONE_ID.value().trim(), ativo: WA_ATIVO.value() }),
    agora: () => Date.now(),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    config: { emailDono: EMAIL_DONO, donoWhats: "", tokenWebhook: ASAAS_WEBHOOK_TOKEN.value().trim(), waVerify: WA_VERIFY_TOKEN.value().trim(), waAppSecret: (WA_APP_SECRET.value() || "").trim() }
  };
}
const authDe = req => (req.auth ? { uid: req.auth.uid, email: req.auth.token.email || "", emailVerificado: req.auth.token.email_verified === true } : null);
// converte erro de negócio em erro do Firebase (mensagem em português para o cliente); o resto vira "internal" sem vazar detalhe
function envolver(fn) {
  return async req => {
    try { return await fn(montarDeps(), authDe(req), req.data || {}); }
    catch (e) {
      if (e instanceof ErroNegocio) throw new HttpsError(e.codigo, e.mensagem, e.detalhe ? { motivo: e.detalhe } : undefined);
      console.error(e && e.stack);
      if (e && e.name === "AsaasErro") throw new HttpsError("unavailable", "O sistema de pagamento não respondeu. Tente de novo em alguns minutos.");
      throw new HttpsError("internal", "Não foi possível concluir. Tente de novo.");
    }
  };
}
const opcoes = { secrets: SEGREDOS_TODOS, cors: true };

exports.assinar = onCall(opcoes, envolver(assinar));
exports.minhaAssinatura = onCall(opcoes, envolver(minhaAssinatura));
exports.chamado = onCall(opcoes, envolver(chamado));
exports.responderChamado = onCall(opcoes, envolver(responderChamado));

exports.webhookAsaas = onRequest({ secrets: SEGREDOS_TODOS, cors: false }, async (req, res) => {
  const r = await tratarWebhook(montarDeps(), { metodo: req.method, token: req.get("asaas-access-token"), corpo: req.body });
  res.status(r.status).json(r.corpo);
});

exports.whatsappWebhook = onRequest({ secrets: SEGREDOS_TODOS, cors: false }, async (req, res) => {
  const r = await tratarWhatsapp(montarDeps(), { metodo: req.method, query: req.query, corpo: req.body, raw: req.rawBody, assinatura: req.get("x-hub-signature-256") });
  res.status(r.status).type("text/plain").send(r.texto || "");
});

exports.jornadaDiaria = onSchedule({ schedule: "0 9 * * *", timeZone: "America/Fortaleza", secrets: SEGREDOS_TODOS }, async () => { await jornadaDiaria(montarDeps()); });

// mantém contas.whatsN (número só com dígitos, DDI 55) igual a contas.whats: o robô do WhatsApp reconhece o cliente por ele.
// O cliente não consegue gravar whatsN (as regras só deixam whats e whatsOk).
exports.normalizarWhats = onDocumentWritten("contas/{uid}", async ev => {
  const dep = ev.data && ev.data.after;
  if (!dep || !dep.exists) return;
  const d = dep.data(), n = normalizarNumero(d.whats) || null;
  if ((d.whatsN || null) !== n) await dep.ref.set({ whatsN: n }, { merge: true });
});
