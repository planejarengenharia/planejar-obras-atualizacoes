/* Planejar Obras 5.0 - site de divulgação. JS puro, sem dependências, sem estilo escrito no HTML (compatível com CSP).
   Tudo aqui é melhoria: sem JavaScript, a página continua legível, os links de baixar e de WhatsApp funcionam. */
document.documentElement.setAttribute("data-js-ok", "");

const PRECOS = { essencial: { m: 49, a: 490 }, profissional: { m: 89, a: 890 }, fundador: { a: 690 }, empresas: { m: 249, a: 2490, lanc: 1990 } };
const reduz = window.matchMedia("(prefers-reduced-motion: reduce)");
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const brl = n => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const num1 = n => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/* ---------- abas acessíveis (lista de botões role=tab): clique, setas, Home e End ---------- */
function abas(lista, aoMudar) {
  const bts = $$("[role=tab]", lista);
  const sel = (k, foco) => {
    bts.forEach((a, n) => { a.setAttribute("aria-selected", n === k ? "true" : "false"); a.tabIndex = n === k ? 0 : -1; });
    if (foco) bts[k].focus();
    aoMudar(k, bts[k]);
  };
  bts.forEach((a, k) => {
    a.addEventListener("click", () => sel(k));
    a.addEventListener("keydown", e => {
      const n = bts.length; let t = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") t = (k + 1) % n;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") t = (k - 1 + n) % n;
      else if (e.key === "Home") t = 0;
      else if (e.key === "End") t = n - 1;
      if (t !== null) { e.preventDefault(); sel(t, true); }
    });
  });
  return { bts, sel };
}

/* ---------- topo: sombra ao rolar, menu no celular, seção atual ---------- */
(function () {
  const topo = $(".topo"), menu = $("#menu"), bt = $("#menu-bt");
  const sombra = () => topo.classList.toggle("rolou", window.scrollY > 8);
  window.addEventListener("scroll", sombra, { passive: true }); sombra();
  if (menu && bt) {
    const fecha = () => { menu.classList.remove("aberto"); bt.setAttribute("aria-expanded", "false"); };
    bt.addEventListener("click", () => { const a = menu.classList.toggle("aberto"); bt.setAttribute("aria-expanded", a ? "true" : "false"); });
    $$("a", menu).forEach(a => a.addEventListener("click", fecha));
    document.addEventListener("keydown", e => { if (e.key === "Escape" && menu.classList.contains("aberto")) { fecha(); bt.focus(); } });
    document.addEventListener("click", e => { if (!menu.contains(e.target) && !bt.contains(e.target)) fecha(); });
    window.matchMedia("(min-width:1101px)").addEventListener("change", fecha);
  }
  const links = $$("#menu a"), secoes = $$("main > section[id]");
  if (!links.length || !secoes.length) return;
  const porId = new Map(links.map(a => [a.hash.slice(1), a]));
  let pendente = false;
  const marca = () => {
    pendente = false;
    const y = window.scrollY + 160; let atual = null;
    secoes.forEach(s => { if (s.offsetTop <= y) atual = s; });
    const alvo = atual ? porId.get(atual.id) : null;
    links.forEach(a => { if (a === alvo) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  };
  window.addEventListener("scroll", () => { if (!pendente) { pendente = true; requestAnimationFrame(marca); } }, { passive: true });
  marca();
})();

/* ---------- download: aviso depois do clique ---------- */
(function () {
  const aviso = $("#aviso-baixando"); let t;
  $$("[data-baixar]").forEach(a => a.addEventListener("click", () => {
    if (!aviso) return; aviso.hidden = false; clearTimeout(t); t = setTimeout(() => { aviso.hidden = true; }, 9000);
  }));
})();

/* ---------- copiar o link (quem está no celular) ---------- */
(function () {
  const b = $("#enviar-link"); if (!b) return;
  b.addEventListener("click", async () => {
    const url = (document.querySelector('link[rel=canonical]') || {}).href || location.href.split("#")[0];
    try {
      if (navigator.share) { await navigator.share({ title: "Planejar Obras 5.0", url }); return; }
      await navigator.clipboard.writeText(url); b.textContent = "Link copiado. Cole no computador.";
    } catch (e) { b.textContent = "Endereço desta página: " + url; }
  });
})();

/* ---------- barra fixa de download (celular) ---------- */
(function () {
  const barra = $("#barra-fixa"), alvo = $("#hero-acoes"); if (!barra || !alvo || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(([e]) => barra.classList.toggle("on", !e.isIntersecting && e.boundingClientRect.top < 0)).observe(alvo);
  const fim = $("#baixar");
  if (fim) new IntersectionObserver(([e]) => { if (e.isIntersecting) barra.classList.remove("on"); }, { threshold: .25 }).observe(fim);
})();

/* ---------- hero: demonstração animada com cursor e balão ---------- */
(function () {
  const tela = $("#tour-tela"), bts = $$("#tour-abas [role=tab]"), pausaBt = $("#tour-pausa"); if (!tela || !bts.length) return;
  const imgs = $$("img", tela), cur = $("#tour-cursor"), bal = $("#tour-balao"), DUR = 7000;
  let i = 0, t0 = 0, raf = 0, parado = false, visivel = true, sobre = false, timers = [];
  const rodando = () => !reduz.matches && !parado && visivel && !sobre && !document.hidden;

  function posiciona(el) {
    const W = tela.clientWidth;
    cur.style.setProperty("--x", el.dataset.x + "%"); cur.style.setProperty("--y", el.dataset.y + "%");
    bal.textContent = el.dataset.t;
    let x = parseFloat(el.dataset.bx) / 100 * W; x = Math.max(8, Math.min(x, W - bal.offsetWidth - 8));
    bal.style.setProperty("--bx", x + "px"); bal.style.setProperty("--by", el.dataset.by + "%");
  }
  function mostra(n) {
    timers.forEach(clearTimeout); timers = [];
    i = (n + imgs.length) % imgs.length; tela.classList.add("perto");
    imgs.forEach((im, k) => { im.classList.toggle("on", k === i); im.setAttribute("aria-hidden", k === i ? "false" : "true"); });
    bts.forEach((a, k) => { a.setAttribute("aria-selected", k === i ? "true" : "false"); a.style.setProperty("--p", 0); });
    cur.classList.remove("clica"); bal.classList.remove("on");
    cur.classList.add("on"); posiciona(imgs[i]);
    if (reduz.matches) { bal.classList.add("on"); return; }
    timers.push(setTimeout(() => { cur.classList.remove("clica"); void cur.getBoundingClientRect(); cur.classList.add("clica"); bal.classList.add("on"); }, 1250));
    t0 = performance.now();
  }
  function passo(agora) {
    raf = requestAnimationFrame(passo);
    if (!rodando()) { t0 += 16; return; }
    const p = Math.min(1, (agora - t0) / DUR); bts[i].style.setProperty("--p", p);
    if (p >= 1) mostra(i + 1);
  }
  document.addEventListener("tour", e => mostra(e.detail));
  bts.forEach((a, k) => {
    a.addEventListener("click", () => mostra(k));
    a.addEventListener("keydown", e => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = (k + (e.key === "ArrowRight" ? 1 : -1) + bts.length) % bts.length; mostra(n); bts[n].focus(); }
    });
  });
  pausaBt.addEventListener("click", () => {
    parado = !parado; pausaBt.setAttribute("aria-pressed", parado ? "true" : "false"); pausaBt.setAttribute("aria-label", parado ? "Retomar a demonstração" : "Pausar a demonstração");
    pausaBt.innerHTML = '<svg aria-hidden="true"><use href="#' + (parado ? "i-toca" : "i-pausa") + '"/></svg>';
  });
  const janela = tela.closest(".hero-mock");
  janela.addEventListener("mouseenter", () => { sobre = true; }); janela.addEventListener("mouseleave", () => { sobre = false; });
  janela.addEventListener("focusin", () => { sobre = true; }); janela.addEventListener("focusout", () => { sobre = false; });
  if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(tela);
  window.addEventListener("resize", () => posiciona(imgs[i]));
  const aplicaMovimento = () => { cancelAnimationFrame(raf); mostra(i); if (reduz.matches) { pausaBt.hidden = true; } else { pausaBt.hidden = false; t0 = performance.now(); raf = requestAnimationFrame(passo); } };
  if (reduz.addEventListener) reduz.addEventListener("change", aplicaMovimento);
  const inicia = () => aplicaMovimento();
  if (document.readyState === "complete") inicia(); else window.addEventListener("load", inicia);
})();

/* ---------- palcos: tela do programa + lista de itens (Orçamentos, Medição, Projetos, Licitação) ---------- */
(function () {
  let seq = 0;
  $$("[data-palco]").forEach(p => {
    const lista = $(".itens", p), painel = $(".tela-multi", p), imgs = $$(".tela-multi img", p), leg = $(".leg", p); if (!lista || !painel) return;
    const n = ++seq; painel.id = "palco-" + n;
    const libera = () => painel.classList.add("perto");
    let iniciado = false;
    if ("IntersectionObserver" in window) new IntersectionObserver((es, ob) => { if (es.some(e => e.isIntersecting)) { libera(); ob.disconnect(); } }, { rootMargin: "700px 0px" }).observe(painel); else libera();
    $$("[role=tab]", lista).forEach((a, k) => { a.id = "palco-" + n + "-aba-" + k; a.setAttribute("aria-controls", painel.id); });
    const t = abas(lista, (k, a) => {
      imgs.forEach((im, m) => { im.classList.toggle("on", m === k); im.setAttribute("aria-hidden", m === k ? "false" : "true"); });
      painel.setAttribute("aria-labelledby", a.id);
      if (iniciado) libera();
      const d = $(".d", a); if (leg && d) leg.textContent = d.textContent;
    });
    p._abas = t; t.sel(0); iniciado = true;
  });
  /* links "Ver ..." dos cartões abrem a aba certa: data-aba="secao|indice" */
  $$("[data-aba]").forEach(a => a.addEventListener("click", () => {
    const [id, k] = a.dataset.aba.split("|"), s = document.getElementById(id), p = s && $("[data-palco]", s);
    if (p && p._abas) p._abas.sel(+k);
  }));
})();

/* ---------- "Eu sou" no topo e "Para quem é": o mesmo caso nos dois lugares ---------- */
(function () {
  const wrap = $("#eusou"), lista = $("#quem-abas"), sub = $("#hero-sub"), nota = $("#eusou-nota"); if (!wrap || !lista || !sub) return;
  const chips = $$("button[data-quem]", wrap), paineis = $$(".quem-painel");
  chips.forEach(c => { c.setAttribute("aria-pressed", "false"); });
  $$("[role=tab]", lista).forEach((a, k) => { a.setAttribute("aria-controls", paineis[k].id); });
  const hero = chave => {
    const c = chips.find(x => x.dataset.quem === chave);
    chips.forEach(x => x.setAttribute("aria-pressed", x === c ? "true" : "false"));
    sub.textContent = c ? c.dataset.sub : sub.dataset.padrao;
    if (c) document.dispatchEvent(new CustomEvent("tour", { detail: +c.dataset.tour }));
    return c;
  };
  const t = abas(lista, (k, a) => {
    paineis.forEach((p, n) => p.classList.toggle("on", n === k));
    if (a.dataset.vindoDoTopo !== "1") { hero(a.dataset.quem); if (nota) nota.textContent = ""; }
  });
  chips.forEach(c => c.addEventListener("click", () => {
    if (c.getAttribute("aria-pressed") === "true") { hero(null); if (nota) nota.textContent = ""; return; }
    const k = $$("[role=tab]", lista).findIndex(a => a.dataset.quem === c.dataset.quem);
    const a = t.bts[k]; a.dataset.vindoDoTopo = "1"; t.sel(k); delete a.dataset.vindoDoTopo;
    hero(c.dataset.quem);
    if (nota) {
      nota.textContent = "Mostrando as telas para: " + c.textContent.trim() + ". ";
      const l = document.createElement("a"); l.href = "#para-quem"; l.textContent = "Ver o que o programa faz por você"; nota.append(l);
    }
  }));
})();

/* ---------- celular do mestre: passos destacam o aparelho ---------- */
(function () {
  const bts = $$("#fluxo button"), cels = $$("#celulares .celular"); if (!bts.length) return;
  const foco = k => {
    bts.forEach((b, n) => b.setAttribute("aria-pressed", n === k ? "true" : "false"));
    cels.forEach((c, n) => { c.classList.toggle("foco", n === k); c.classList.toggle("dim", n !== k); });
  };
  bts.forEach((b, k) => { b.addEventListener("click", () => foco(k)); b.addEventListener("mouseenter", () => foco(k)); b.addEventListener("focus", () => foco(k)); });
  cels.forEach((c, k) => c.addEventListener("click", () => foco(k)));
  foco(0);
})();

/* ---------- revelar ao rolar (só os blocos de imagem e de etapas, uma vez) ---------- */
(function () {
  const els = $$(".rev"); if (!els.length) return;
  if (reduz.matches || !("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("vis")); return; }
  const grupos = new Map();
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    const pai = e.target.parentElement; const n = grupos.get(pai) || 0; grupos.set(pai, n + 1);
    setTimeout(() => e.target.classList.add("vis"), Math.min(n, 4) * 90);
  }), { rootMargin: "0px 0px -8% 0px" });
  els.forEach(el => io.observe(el));
})();

/* ---------- cortesia: medidor de orçamentos e de projetos (5 orçamentos e 3 projetos) ---------- */
(function () {
  const r = $("#m-orc"), q = $("#m-prj"); if (!r) return;
  const pl = (n, um, mais) => n + " " + (n === 1 ? um : mais);
  const t = (n, p) => {
    const o = n === 0 ? "Você ainda tem os 5 orçamentos" : n < 5 ? "Faltam " + pl(5 - n, "orçamento", "orçamentos") : "Os 5 orçamentos foram usados";
    const j = !q ? "" : p === 0 ? " e os 3 projetos" : p < 3 ? " e faltam " + pl(3 - p, "projeto", "projetos") : " e os 3 projetos foram usados";
    const fim = n >= 5 || (q && p >= 3) ? ". O programa deixa de criar " + (n >= 5 && q && p >= 3 ? "orçamentos e projetos novos" : n >= 5 ? "orçamentos novos" : "projetos novos") + " até você contratar um plano; as obras continuam abertas para leitura, impressão, exportação e backup (os projetos ficam guardados, com o preço da casa à vista)." : ", dentro dos 3 meses. Tudo continua liberado.";
    return o + j + fim;
  };
  const f = () => { const n = +r.value, p = q ? +q.value : 0; $("#m-o").textContent = n + " de 5"; if (q) $("#m-p").textContent = p + " de 3"; $("#m-txt").textContent = t(n, p); };
  r.addEventListener("input", f); if (q) q.addEventListener("input", f); f();
})();

/* ---------- escolha do plano ---------- */
(function () {
  const cks = $$("[data-nec]"), res = $("#escolha-res"); if (!res) return;
  const f = () => {
    const n = Object.fromEntries(cks.map(c => [c.dataset.nec, c.checked]));
    const pro = n.lic || n.proj || n.pc2;
    $$("[data-plano]").forEach(p => p.classList.remove("realce"));
    $$("tr[data-r]").forEach(tr => tr.classList.toggle("dest-linha", !!n[tr.dataset.r]));
    let k, t, s;
    if (n.emp) { k = "empresas"; t = "Planejar Empresas."; s = "Tudo liberado em 5 computadores com uma conta só (cada computador guarda as suas obras), suporte prioritário pelo WhatsApp e orientação de início. Lançamento: " + brl(PRECOS.empresas.lanc) + " por ano para as 20 primeiras empresas (depois " + brl(PRECOS.empresas.m) + " por mês ou " + brl(PRECOS.empresas.a) + " por ano)."; }
    else if (n.casa && !n.lic) { k = "profissional"; t = "Cortesia agora; Profissional por 1 mês depois."; s = "A cortesia deixa criar até 3 projetos e ver o preço da casa. Para fechar o projeto, o mês avulso do Profissional custa " + brl(PRECOS.profissional.m) + " e cancela quando você quiser."; }
    else if (n.ano && !pro) { k = "essencial"; t = "Essencial, no pagamento anual."; s = "Anual: " + brl(PRECOS.essencial.a) + " por ano. O Fundador (" + brl(PRECOS.fundador.a) + " por ano, até 31/03/2027 ou 100 vagas, individual) inclui licitação e projetos."; }
    else if (pro && n.ano) { k = "profissional"; t = "Profissional anual, ou o Fundador."; s = brl(PRECOS.profissional.a) + " por ano no Profissional. O Fundador custa " + brl(PRECOS.fundador.a) + " por ano, com o preço travado, enquanto houver vagas."; }
    else if (pro) { k = "profissional"; t = "Profissional."; s = "Inclui licitação, Planejar Projetos e 2 computadores. " + brl(PRECOS.profissional.m) + " por mês."; }
    else if (cks.some(c => c.checked)) { k = "essencial"; t = "Essencial."; s = "Orçamento e medição sem limite, com celular e diário. " + brl(PRECOS.essencial.m) + " por mês."; }
    else { k = "cortesia"; t = "Comece pela cortesia."; s = "Marque o que você precisa para ver a sugestão. A cortesia libera tudo por 3 meses."; }
    const el = $('[data-plano="' + k + '"]'); if (el && cks.some(c => c.checked)) el.classList.add("realce");
    res.textContent = ""; const b = document.createElement("b"); b.textContent = t; const sp = document.createElement("span"); sp.textContent = s; res.append(b, sp);
  };
  cks.forEach(c => c.addEventListener("change", f)); f();
})();

/* ---------- preenchimento dos sliders ---------- */
(function () {
  $$("input[type=range]").forEach(r => {
    const f = () => r.style.setProperty("--pct", ((r.value - r.min) / (r.max - r.min) * 100) + "%");
    r.addEventListener("input", f); f();
  });
})();

/* ---------- calculadora (estimativa) ---------- */
(function () {
  const c = { orc: $("#c-orc"), hor: $("#c-hor"), red: $("#c-red"), val: $("#c-val") }; if (!c.orc) return;
  const horasTxt = h => h < 1.05 ? "1 hora" : num1(Math.ceil(h * 10) / 10) + " horas";
  function calc() {
    const o = +c.orc.value, h = +c.hor.value, r = +c.red.value, v = +c.val.value;
    $("#o-orc").textContent = o; $("#o-hor").textContent = h + " h"; $("#o-red").textContent = r + "%"; $("#o-val").textContent = brl(v);
    const ganho = o * h * r / 100, valor = ganho * v;
    const rh = $("#r-horas"); rh.textContent = num1(ganho); const un = document.createElement("small"); un.textContent = "horas"; rh.append(un);
    $("#r-valor").textContent = brl(Math.round(valor));
    $("#r-ess").textContent = "bastam " + horasTxt(PRECOS.essencial.m / v) + " por mês";
    $("#r-pro").textContent = "bastam " + horasTxt(PRECOS.profissional.m / v) + " por mês";
  }
  Object.values(c).forEach(el => el.addEventListener("input", calc)); calc();
  $(".p-ess").textContent = brl(PRECOS.essencial.m); $(".p-pro").textContent = brl(PRECOS.profissional.m);
})();

/* ---------- planos: mensal / anual ---------- */
(function () {
  const bts = $$("[data-ciclo]"); if (!bts.length) return;
  const EMP_SUB = ($('[data-sub="empresas"]') || {}).textContent;
  function aplica(ciclo) {
    bts.forEach(b => { const s = b.dataset.ciclo === ciclo; b.setAttribute("aria-checked", s ? "true" : "false"); b.tabIndex = s ? 0 : -1; });
    ["essencial", "profissional"].forEach(k => {
      const p = PRECOS[k], el = $('[data-preco="' + k + '"]'), sub = $('[data-sub="' + k + '"]');
      const un = document.createElement("small");
      if (ciclo === "m") { el.textContent = brl(p.m); un.textContent = "por mês"; sub.textContent = "ou " + brl(p.a) + " por ano"; }
      else { el.textContent = brl(p.a); un.textContent = "por ano"; sub.textContent = "equivale a " + brl(Math.round(p.a / 12 * 100) / 100) + " por mês"; }
      el.append(un);
    });
    const av = $("[data-fundador-aviso]"); if (av) av.textContent = ciclo === "m" ? "O Fundador é cobrado só por ano." : "";
    // Empresas: igual ao programa. Anual = R$ 2.490 riscado e R$ 1.990 (lançamento); mensal = R$ 249 por mês
    const ee = $('[data-preco="empresas"]'), es = $('[data-sub="empresas"]');
    if (ee && es) {
      const e = PRECOS.empresas, un = document.createElement("small"); ee.textContent = "";
      if (ciclo === "m") { ee.append(brl(e.m)); un.textContent = "por mês"; es.textContent = "No anual de lançamento: " + brl(e.lanc) + " por ano (de " + brl(e.a) + "), para as 20 primeiras empresas ou até 31/03/2027, travado enquanto renovar."; }
      else { const c = document.createElement("s"); c.className = "de"; c.textContent = brl(e.a); ee.append(c, " " + brl(e.lanc)); un.textContent = "por ano"; es.textContent = EMP_SUB; }
      ee.append(un);
    }
  }
  bts.forEach(b => b.addEventListener("click", () => aplica(b.dataset.ciclo)));
  $(".alterna").addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault(); const k = bts.findIndex(b => b.getAttribute("aria-checked") === "true"), n = bts[(k + 1) % bts.length];
    aplica(n.dataset.ciclo); n.focus();
  });
  aplica("a");
})();

/* ---------- tabela dos planos no celular: seta e sombra na borda enquanto houver mais colunas para a direita ---------- */
(function () {
  const rol = $(".tabela-rolar"), cx = rol && rol.parentElement; if (!rol || !cx || !cx.classList.contains("tabela-caixa")) return;
  const f = () => { const fim = rol.scrollLeft + rol.clientWidth >= rol.scrollWidth - 4; cx.toggleAttribute("data-fim", fim); };
  rol.addEventListener("scroll", f, { passive: true }); window.addEventListener("resize", f); f();
})();

/* ---------- ampliar a tela: janela com a imagem grande (no celular, dá para arrastar para os lados) ---------- */
(function () {
  if (!window.HTMLDialogElement) return;
  const palcos = $$("[data-palco] .janela .tela"); if (!palcos.length) return;
  const dlg = document.createElement("dialog"); dlg.className = "lupa"; dlg.setAttribute("aria-label", "Tela do programa ampliada");
  dlg.innerHTML = '<div class="lupa-in"><div class="lupa-topo"><p class="lupa-tit"></p><button type="button" class="lupa-x">Fechar</button></div><div class="lupa-rolagem" tabindex="0"><img alt="Tela do programa ampliada" width="1600" height="1000"></div></div>';
  document.body.append(dlg);
  const img = $("img", dlg), tit = $(".lupa-tit", dlg), x = $(".lupa-x", dlg); let volta = null;
  x.addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (!e.target.closest(".lupa-rolagem, .lupa-topo")) dlg.close(); });
  dlg.addEventListener("close", () => { img.removeAttribute("src"); if (volta) volta.focus(); });
  palcos.forEach(t => {
    const b = document.createElement("button"); b.type = "button"; b.className = "ampliar"; b.setAttribute("aria-label", "Ampliar a tela do programa");
    b.innerHTML = '<svg aria-hidden="true"><use href="#i-lupa"/></svg>Ampliar'; t.append(b);
    b.addEventListener("click", () => {
      const on = $("img.on", t); if (!on) return;
      img.src = on.currentSrc || on.src; img.alt = on.alt; tit.textContent = on.alt; volta = b; dlg.showModal(); x.focus();
    });
  });
})();
