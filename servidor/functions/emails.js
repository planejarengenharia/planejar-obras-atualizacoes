"use strict";
// Montagem (sem enviar) e envio dos e-mails. nodemailer entra por injeção: aqui só existe "transporte.sendMail".
const { SUPORTE_EMAIL, primeiroNome } = require("./textos");

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const urlSegura = u => (/^https:\/\//.test(u || "") ? u : "");

function moldura(titulo, paragrafos, link) {
  const corpo = paragrafos.map(p => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const botao = urlSegura(link) ? `<p><a href="${esc(link)}" style="background:#1f5fbf;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Abrir</a></p>` : "";
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px"><h2 style="color:#1f5fbf;margin:0 0 14px">${esc(titulo)}</h2>${corpo}${botao}<hr style="border:0;border-top:1px solid #ddd"><p style="font-size:12px;color:#666">Planejar Engenharia · Planejar Obras · ${esc(SUPORTE_EMAIL)}</p></div>`;
}
// montar({para, nome, titulo, texto, link}) -> {to, subject, text, html}
function montar({ para, nome, titulo, texto, link, assunto }) {
  const saud = nome ? `Olá, ${primeiroNome(nome)}!` : "Olá!";
  const par = [saud, ...String(texto || "").split("\n\n")];
  const text = par.join("\n\n") + (urlSegura(link) ? "\n\n" + link : "") + `\n\nPlanejar Obras · ${SUPORTE_EMAIL}`;
  return { to: para, subject: assunto || titulo, text, html: moldura(titulo, par, link) };
}
function paraDono(dono, assunto, linhas) {
  return { to: dono, subject: assunto, text: linhas.join("\n"), html: moldura(assunto, linhas) };
}
function criarEnviador({ transporte, de }) {
  return async msg => {
    if (!msg || !msg.to) return { ignorado: true };
    await transporte.sendMail({ from: de, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    return { enviado: true };
  };
}
module.exports = { esc, montar, paraDono, criarEnviador };
