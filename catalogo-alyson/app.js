(function () {
  "use strict";

  var C = window.CATALOGO;
  var M = C.marca;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Símbolo Veritas (vetor oficial do pacote de identidade).
  function sym(cor, estrela) {
    cor = cor || "currentColor";
    return '<svg class="sym" viewBox="10 30 200 165" aria-hidden="true"><g transform="translate(10,12)">' +
      '<polygon fill="' + (estrela || "#B8935A") + '" points="100,23 102,29.86 108.6,27.14 104.48,32.98 110.72,36.45 103.6,36.87 104.77,43.91 100,38.6 95.23,43.91 96.4,36.87 89.28,36.45 95.52,32.98 91.4,27.14 98,29.86"/>' +
      '<path fill="' + cor + '" d="M26 64 Q60 46 94 70 L100 172 Z"/><path fill="' + cor + '" d="M174 64 Q140 46 106 70 L100 172 Z"/></g></svg>';
  }

  var CAT_NOME = { ebook: "Ebook", curso: "Curso", preparatorio: "Preparatório", produto: "Produto" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function brl(n) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function brlCurto(n) {
    return Number.isInteger(n) ? n.toLocaleString("pt-BR") : brl(n);
  }

  /* ---------------- UTM / origem ---------------- */
  var params = new URLSearchParams(location.search);
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var utm = {};
  try {
    var saved = JSON.parse(sessionStorage.getItem("utm") || "{}");
    UTM_KEYS.forEach(function (k) { utm[k] = params.get(k) || saved[k] || ""; });
    if (!utm.utm_source && /instagram/i.test(navigator.userAgent)) utm.utm_source = "instagram";
    sessionStorage.setItem("utm", JSON.stringify(utm));
  } catch (e) {
    UTM_KEYS.forEach(function (k) { utm[k] = params.get(k) || ""; });
  }

  function checkoutUrl(link) {
    try {
      var u = new URL(link);
      UTM_KEYS.forEach(function (k) { if (utm[k] && !u.searchParams.has(k)) u.searchParams.set(k, utm[k]); });
      if (!u.searchParams.has("src")) u.searchParams.set("src", utm.utm_source || "catalogo");
      return u.toString();
    } catch (e) { return link; }
  }
  function waUrl(texto) {
    return "https://wa.me/" + M.whatsapp + "?text=" + encodeURIComponent(texto);
  }

  /* ---------------- Meta Pixel (opcional) ---------------- */
  if (M.metaPixelId) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq("init", M.metaPixelId);
    window.fbq("track", "PageView");
  }
  function track(evento, dados) {
    if (window.fbq) window.fbq("track", evento, dados || {});
  }

  /* ---------------- Envio de lead ---------------- */
  function enviarLead(dados) {
    var payload = Object.assign({}, dados, utm, {
      pagina: location.href,
      referrer: document.referrer || ""
    });
    return fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.erro || "Não foi possível enviar agora.");
        return j;
      });
    });
  }
  // Registro silencioso de intenção de compra (aparece na aba "Cliques" da planilha).
  function registrarClique(p) {
    try {
      var body = JSON.stringify(Object.assign({ tipo: "clique", produto: p.titulo, produtoId: p.id, valor: p.preco, pagina: location.href }, utm));
      if (navigator.sendBeacon) navigator.sendBeacon("/api/lead", new Blob([body], { type: "application/json" }));
    } catch (e) { /* noop */ }
  }

  /* ---------------- Capas 3D ---------------- */
  function book(p, extra) {
    var estilo = typeof p.capa === "string" ? p.capa : "azul"; // azul | vinho | pergaminho
    var premium = estilo === "vinho";
    var front = p.imagem
      ? '<img src="' + esc(p.imagem) + '" alt="" loading="lazy" />'
      : '<div>' + (premium ? '<div class="book__kicker">Coleção premium</div>' : sym("var(--ac)", "var(--ac)")) + '</div>' +
        '<div>' + (premium ? sym("var(--ac)", "var(--ac)") : "") + '<h3 class="book__title">' + esc(p.titulo) + '</h3><div class="book__rule"></div><div class="book__sub">' + esc(p.subtitulo || "") + '</div></div>' +
        '<div class="book__author">' + esc(M.autor) + '<small>' + esc(M.nome) + '</small></div>';
    return (
      '<div class="book book--' + esc(estilo) + " " + (extra || "") + '" aria-hidden="true">' +
      '<div class="book__inner"><div class="book__back"></div><div class="book__pages"></div><div class="book__front">' + front + "</div></div>" +
      '<div class="book__shadow"></div></div>'
    );
  }

  function priceHtml(p, opts) {
    opts = opts || {};
    if (p.emBreve) return '<div class="price"><span class="price__inst">Lista de espera aberta</span><span class="price__now" style="font-size:22px">Em breve</span></div>';
    var off = p.precoDe ? Math.round((1 - p.preco / p.precoDe) * 100) : 0;
    var inst = p.parcelas > 1 ? '<span class="price__inst">ou <b>' + p.parcelas + "x de R$ " + brl(parcela(p.preco, p.parcelas)) + "</b></span>" : "";
    return (
      '<div class="price">' +
      (p.precoDe ? '<span><span class="price__from">R$ ' + brlCurto(p.precoDe) + "</span>" + (opts.off !== false && off > 0 ? '<span class="off">-' + off + "%</span>" : "") + "</span>" : "") +
      '<span class="price__now"><small>R$</small>' + brlCurto(p.preco) + "</span>" + inst + "</div>"
    );
  }
  // Estimativa simples sem juros. Ajuste se a plataforma repassar juros.
  function parcela(v, n) { return Math.ceil((v / n) * 100) / 100; }

  /* ---------------- Marca / hero ---------------- */
  document.documentElement.classList.remove("no-js");
  $$("[data-sym]").forEach(function (el) {
    el.outerHTML = el.dataset.sym === "ouro" ? sym("#B8935A") : el.closest(".avatar") ? sym("#B8935A", "#D4B27A") : sym("#0E1B2E");
  });
  $("#footNome").textContent = M.nome;
  $("#footSlogan").textContent = M.slogan;
  var avatar = $("#avatar");
  if (M.foto) avatar.innerHTML = '<img src="' + esc(M.foto) + '" alt="' + esc(M.autor) + '" />';
  ["#topInsta", "#footInsta"].forEach(function (s) { $(s).href = M.instagram; });
  $("#footMail").href = "mailto:" + M.email;
  $("#wa").href = waUrl(M.mensagemWhatsapp + " os materiais.");
  $("#ano").textContent = new Date().getFullYear();
  $("#heroSelo").textContent = C.hero.selo;
  $("#heroTitulo").innerHTML = C.hero.titulo; // aceita <em> intencionalmente
  $("#heroSub").textContent = C.hero.subtitulo;
  $("#heroBy").textContent = C.hero.assinatura || "";

  var tk = C.faixaTopo.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
  $("#ticker").innerHTML = tk + tk + tk + tk;

  $("#provas").innerHTML = (C.hero.provas || []).map(function (p) {
    return '<li><strong data-count="' + p.valor + '" data-casas="' + (p.casas || 0) + '" data-pre="' + esc(p.prefixo || "") + '" data-suf="' + esc(p.sufixo || "") + '">' +
      esc(p.prefixo || "") + "0" + esc(p.sufixo || "") + "</strong><span>" + esc(p.rotulo) + "</span></li>";
  }).join("");

  /* ---------------- Destaque ---------------- */
  var produtos = C.produtos;
  var destaque = produtos.find(function (p) { return p.destaque; }) || produtos[0];
  var fim = C.ofertaTerminaEm ? new Date(C.ofertaTerminaEm) : null;
  var mostrarTimer = fim && !isNaN(fim) && fim > new Date();

  $("#destaque").innerHTML =
    '<div class="featured__card reveal">' +
    '<div class="featured__cover">' + book(destaque) + "</div>" +
    '<div class="featured__content">' +
    (destaque.selo ? '<span class="badge">★ ' + esc(destaque.selo) + "</span>" : "") +
    "<h2>" + esc(destaque.titulo) + "</h2>" +
    "<p>" + esc(destaque.subtitulo) + "</p>" +
    '<ul class="featured__list">' + (destaque.beneficios || []).map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" +
    (mostrarTimer ? '<div class="countdown"><span>A oferta termina em</span><div class="countdown__boxes" id="timer"></div></div>' : "") +
    '<div class="featured__buy">' + priceHtml(destaque) +
    '<button class="btn btn--gold" data-buy="' + esc(destaque.id) + '">Quero o meu agora <span class="btn__arrow" aria-hidden="true">→</span></button></div>' +
    '<div class="trust"><span>Acesso imediato</span><span>Garantia de 7 dias</span><span>Compra segura</span></div>' +
    '<button class="btn btn--ghost btn--sm" style="margin-top:18px" data-open="' + esc(destaque.id) + '">Ver detalhes</button>' +
    "</div></div>";

  if (mostrarTimer) {
    var timer = $("#timer");
    var tick = function () {
      var d = Math.max(0, fim - new Date());
      var parts = [Math.floor(d / 864e5), Math.floor(d / 36e5) % 24, Math.floor(d / 6e4) % 60, Math.floor(d / 1e3) % 60];
      var lbl = ["dias", "horas", "min", "seg"];
      timer.innerHTML = parts.map(function (v, i) { return "<span>" + String(v).padStart(2, "0") + "<small>" + lbl[i] + "</small></span>"; }).join("");
    };
    tick(); setInterval(tick, 1000);
  }
  $("#stickyNome").textContent = destaque.titulo + (destaque.preco ? " · R$ " + brlCurto(destaque.preco) : "");
  $("#stickyBtn").addEventListener("click", function () { abrir(destaque.id); });

  /* ---------------- Catálogo ---------------- */
  var contagem = {};
  produtos.forEach(function (p) { contagem[p.categoria] = (contagem[p.categoria] || 0) + 1; });
  var cats = C.categorias.filter(function (c) { return c.id === "todos" || contagem[c.id]; });
  $("#filtros").innerHTML = cats.map(function (c, i) {
    var n = c.id === "todos" ? produtos.length : contagem[c.id];
    return '<button class="chip" role="tab" aria-selected="' + (i === 0) + '" data-cat="' + c.id + '">' + esc(c.nome) + "<sup>" + n + "</sup></button>";
  }).join("");

  $("#grade").innerHTML = produtos.map(function (p, i) {
    return (
      '<button class="card reveal" style="--d:' + (i % 4) * 0.08 + 's" data-open="' + esc(p.id) + '" data-cat="' + p.categoria + '" aria-label="' + esc(p.titulo) + '">' +
      (p.selo ? '<span class="card__badge"><span class="badge' + (p.emBreve ? " badge--soft" : "") + '">' + esc(p.selo) + "</span></span>" : "") +
      '<div class="card__stage">' + book(p) + "</div>" +
      '<div class="card__body"><span class="card__cat">' + esc(CAT_NOME[p.categoria]) + "</span>" +
      '<span class="card__title">' + esc(p.titulo) + "</span>" +
      '<span class="card__sub">' + esc(p.subtitulo || "") + "</span>" +
      '<span class="card__foot">' + priceHtml(p, { off: false }) + '<span class="card__go" aria-hidden="true">→</span></span></div></button>'
    );
  }).join("");

  $("#filtros").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    $$(".chip").forEach(function (c) { c.setAttribute("aria-selected", String(c === b)); });
    var cat = b.dataset.cat;
    var k = 0;
    $$(".card").forEach(function (card) {
      var show = cat === "todos" || card.dataset.cat === cat;
      card.classList.toggle("is-hidden", !show);
      card.classList.remove("pop");
      if (show && !reduce) {
        card.style.animationDelay = k++ * 0.06 + "s";
        void card.offsetWidth; card.classList.add("pop");
      }
    });
  });

  /* ---------------- Combo ---------------- */
  var ebooks = produtos.filter(function (p) { return p.categoria === "ebook" && !p.emBreve; });
  if (C.combo && C.combo.ativo && ebooks.length >= 2) {
    var soma = ebooks.reduce(function (s, p) { return s + p.preco; }, 0);
    var combo = { id: "__combo", titulo: C.combo.titulo, preco: C.combo.preco, precoDe: soma, parcelas: C.combo.parcelas, checkout: C.combo.checkout };
    var stack = ebooks.slice(0, 3).map(function (p, i) {
      var pos = [["8%", "-8deg", 1], ["31%", "0deg", 3], ["54%", "8deg", 2]][i];
      return '<div style="position:absolute;left:' + pos[0] + ";top:" + (i === 1 ? "0" : "18px") + ";width:40%;transform:rotate(" + pos[1] + ");z-index:" + pos[2] + '">' + book(p) + "</div>";
    }).join("");
    var el = $("#combo");
    el.hidden = false;
    el.innerHTML =
      '<div class="combo__card reveal"><div class="combo__stack">' + stack + "</div><div>" +
      '<span class="badge">Melhor custo-benefício</span><h2>' + esc(C.combo.titulo) + "</h2><p>" + esc(C.combo.subtitulo) + "</p>" +
      '<span class="combo__save">' + ebooks.length + " ebooks · economia de R$ " + brlCurto(soma - C.combo.preco) + "</span>" +
      '<div class="featured__buy">' + priceHtml(combo) + '<button class="btn btn--gold" data-buy="__combo">Quero a biblioteca</button></div></div></div>';
    produtos = produtos.concat([Object.assign(combo, { categoria: "ebook", interno: true })]);
  }

  /* ---------------- Depoimentos ---------------- */
  if (C.depoimentos && C.depoimentos.length) {
    $("#depoimentos").hidden = false;
    var v = C.depoimentos.map(function (d) {
      return '<blockquote class="voice"><div class="voice__stars">★★★★★</div><p>“' + esc(d.texto) + '”</p><footer><b>' + esc(d.nome) + "</b>" + esc(d.detalhe || "") + "</footer></blockquote>";
    }).join("");
    $("#vozes").innerHTML = v + v;
  }

  /* ---------------- Isca / formulário ---------------- */
  $("#iscaTitulo").textContent = C.isca.titulo;
  $("#iscaSub").textContent = C.isca.subtitulo;
  $("#iscaBotao").textContent = C.isca.botao;
  $("#interesse").innerHTML = '<option value="">Selecione</option>' +
    C.categorias.filter(function (c) { return c.id !== "todos"; }).map(function (c) { return "<option>" + esc(c.nome) + "</option>"; }).join("") +
    "<option>Tudo um pouco</option>";

  function maskPhone(input) {
    input.addEventListener("input", function () {
      var d = input.value.replace(/\D/g, "").slice(0, 11);
      var out = d;
      if (d.length > 2) out = "(" + d.slice(0, 2) + ") " + d.slice(2);
      if (d.length > 7) out = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
      input.value = out;
    });
  }

  function validar(form) {
    var ok = true;
    $$(".is-invalid", form).forEach(function (el) { el.classList.remove("is-invalid"); });
    var f = form.elements;
    function bad(name) { var el = f[name]; (el.closest(".field") || el.closest(".check")).classList.add("is-invalid"); if (ok) el.focus(); ok = false; }
    if (f.nome && f.nome.value.trim().length < 2) bad("nome");
    if (f.whatsapp && f.whatsapp.value.replace(/\D/g, "").length < 10) bad("whatsapp");
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) bad("email");
    if (f.consentimento && !f.consentimento.checked) bad("consentimento");
    return ok;
  }

  function ligarForm(form, onOk) {
    maskPhone(form.elements.whatsapp);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $(".form__msg", form);
      msg.className = "form__msg"; msg.textContent = "";
      if (!validar(form)) { msg.className = "form__msg is-err"; msg.textContent = "Confira os campos destacados."; return; }
      var btn = $("button[type=submit]", form);
      var label = btn.textContent;
      btn.disabled = true; btn.textContent = "Enviando…";
      var f = form.elements;
      var dados = {
        tipo: "lead",
        nome: f.nome.value.trim(),
        whatsapp: f.whatsapp.value.replace(/\D/g, ""),
        email: f.email.value.trim().toLowerCase(),
        interesse: f.interesse ? f.interesse.value : "",
        origem: f.origem ? f.origem.value : "",
        produto: f.produto ? f.produto.value : "",
        consentimento: true,
        site: f.site ? f.site.value : ""
      };
      enviarLead(dados).then(function () {
        track("Lead", { content_name: dados.produto || dados.origem });
        sparkle(btn);
        onOk(dados);
      }).catch(function (err) {
        msg.className = "form__msg is-err";
        msg.textContent = err.message || "Falha de conexão. Tente novamente.";
        btn.disabled = false; btn.textContent = label;
      });
    });
  }

  var leadForm = $("#leadForm");
  ligarForm(leadForm, function (d) {
    var html = '<div class="success"><div class="success__icon"><svg width="30" height="30" viewBox="0 0 20 20"><path d="M5 10.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      "<h3>Prontinho, " + esc(d.nome.split(" ")[0]) + "!</h3><p>Seu presente já está liberado. Também enviamos novidades para o seu WhatsApp e e-mail.</p>";
    if (C.isca.linkMaterial) html += '<a class="btn btn--gold btn--block" href="' + esc(C.isca.linkMaterial) + '" target="_blank" rel="noopener">Baixar meu material</a>';
    if (C.isca.linkGrupo) html += '<a class="btn btn--ghost btn--block" href="' + esc(C.isca.linkGrupo) + '" target="_blank" rel="noopener">Entrar no grupo VIP</a>';
    if (!C.isca.linkMaterial && !C.isca.linkGrupo) html += '<a class="btn btn--gold btn--block" href="#catalogo">Ver o catálogo</a>';
    leadForm.innerHTML = html + "</div>";
  });

  /* ---------------- FAQ ---------------- */
  $("#faqLista").innerHTML = C.faq.map(function (f, i) {
    return '<div class="faq__item reveal"><button class="faq__q" aria-expanded="false" aria-controls="fa' + i + '">' + esc(f.p) + '<i aria-hidden="true"></i></button>' +
      '<div class="faq__a" id="fa' + i + '" role="region"><div><p>' + esc(f.r) + "</p></div></div></div>";
  }).join("");
  $("#faqLista").addEventListener("click", function (e) {
    var q = e.target.closest(".faq__q");
    if (!q) return;
    var item = q.parentElement, open = !item.classList.contains("is-open");
    $$(".faq__item").forEach(function (i) { i.classList.remove("is-open"); $(".faq__q", i).setAttribute("aria-expanded", "false"); });
    item.classList.toggle("is-open", open);
    q.setAttribute("aria-expanded", String(open));
  });

  /* ---------------- Modal de produto ---------------- */
  var modal = $("#modal"), body = $("#modalBody"), ultimoFoco = null;
  function porId(id) { return produtos.find(function (p) { return p.id === id; }); }

  function abrir(id) {
    var p = porId(id);
    if (!p || p.interno) { if (p) comprar(p); return; }
    ultimoFoco = document.activeElement;
    var lista = function (arr) { return '<ul class="featured__list">' + arr.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>"; };
    var buy = p.emBreve
      ? '<form class="form" id="esperaForm" novalidate><input type="hidden" name="origem" value="lista-de-espera" /><input type="hidden" name="produto" value="' + esc(p.titulo) + '" />' +
        '<div class="hp" aria-hidden="true"><input name="site" tabindex="-1" autocomplete="off" /></div>' +
        '<label class="field"><span>Seu nome</span><input name="nome" autocomplete="given-name" /></label>' +
        '<label class="field"><span>WhatsApp</span><input name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" /></label>' +
        '<label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" /></label>' +
        '<label class="check"><input type="checkbox" name="consentimento" /><span>Quero ser avisado(a) da abertura por WhatsApp e e-mail.</span></label>' +
        '<button class="btn btn--gold btn--block" type="submit">Entrar na lista de espera</button><p class="form__msg" role="status" aria-live="polite"></p></form>'
      : '<div class="modal__buy">' + priceHtml(p) + '<button class="btn btn--gold" data-buy="' + esc(p.id) + '">' + (p.checkout ? "Comprar agora" : "Quero este — falar no WhatsApp") + "</button></div>";

    body.innerHTML =
      '<div class="modal__cover">' + book(p) + "</div><div>" +
      '<div class="modal__meta"><span class="badge badge--soft">' + esc(CAT_NOME[p.categoria]) + "</span>" + (p.selo ? '<span class="badge">' + esc(p.selo) + "</span>" : "") + "</div>" +
      '<h2 id="mTitulo">' + esc(p.titulo) + '</h2><p class="lede">' + esc(p.descricao || p.subtitulo || "") + "</p>" +
      (p.beneficios && p.beneficios.length ? "<h4>O que você vai encontrar</h4>" + lista(p.beneficios) : "") +
      (p.paraQuem ? "<h4>Para quem é</h4><p class=\"lede\">" + esc(p.paraQuem) + "</p>" : "") +
      (p.inclusos && p.inclusos.length ? "<h4>Incluso</h4>" + lista(p.inclusos) : "") +
      (p.formato ? '<p class="price__inst" style="margin-top:10px">' + esc(p.formato) + "</p>" : "") +
      (p.emBreve ? "" : '<div class="trust"><span>Acesso imediato</span><span>Garantia de 7 dias</span><span>Pix, cartão ou boleto</span></div>') +
      buy + "</div>";

    modal.hidden = false;
    modal.classList.remove("is-closing");
    document.body.style.overflow = "hidden";
    $(".modal__close", modal).focus();
    track("ViewContent", { content_name: p.titulo, content_ids: [p.id], value: p.preco, currency: "BRL" });
    try { history.replaceState(null, "", "?p=" + encodeURIComponent(p.id) + location.hash); } catch (e) { /* noop */ }

    var ef = $("#esperaForm");
    if (ef) ligarForm(ef, function (d) {
      ef.innerHTML = '<div class="success"><div class="success__icon">✓</div><h3>Você está na lista, ' + esc(d.nome.split(" ")[0]) + "!</h3><p>Assim que as vagas abrirem, você recebe primeiro — com a condição especial.</p></div>";
    });
  }

  function fechar() {
    if (modal.hidden) return;
    modal.classList.add("is-closing");
    setTimeout(function () { modal.hidden = true; document.body.style.overflow = ""; }, reduce ? 0 : 320);
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* noop */ }
    if (ultimoFoco) ultimoFoco.focus();
  }

  function comprar(p) {
    track("InitiateCheckout", { content_name: p.titulo, content_ids: [p.id], value: p.preco, currency: "BRL" });
    registrarClique(p);
    var url = p.checkout ? checkoutUrl(p.checkout) : waUrl(M.mensagemWhatsapp + " o " + p.titulo + ".");
    window.open(url, "_blank", "noopener");
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-buy]");
    if (b) { e.preventDefault(); comprar(porId(b.dataset.buy)); return; }
    var o = e.target.closest("[data-open]");
    if (o) { e.preventDefault(); abrir(o.dataset.open); return; }
    if (e.target.closest("[data-close]")) fechar();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") fechar();
    if (e.key === "Tab" && !modal.hidden) {
      var f = $$("button, a[href], input, select", modal).filter(function (x) { return !x.disabled && x.offsetParent; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  if (params.get("p") && porId(params.get("p"))) setTimeout(function () { abrir(params.get("p")); }, 400);

  /* ---------------- Animações ---------------- */
  function countUp(el) {
    var alvo = parseFloat(el.dataset.count), casas = +el.dataset.casas, pre = el.dataset.pre, suf = el.dataset.suf;
    var fmt = function (v) { return pre + v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + suf; };
    if (reduce) { el.textContent = fmt(alvo); return; }
    var t0 = performance.now(), dur = 1800;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(casas ? Math.round(alvo * e * 10) / 10 : Math.round(alvo * e));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        $$("[data-count]", en.target).forEach(countUp);
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$(".reveal").forEach(function (el, i) {
      if (!el.style.getPropertyValue("--d") && el.parentElement.closest(".hero")) el.style.setProperty("--d", i * 0.09 + "s");
      io.observe(el);
    });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("is-in"); });
    $$("[data-count]").forEach(countUp);
  }

  // Header + CTA fixo
  var top = $(".top"), sticky = $("#sticky"), hero = $(".hero"), lead = $("#gratis");
  var onScroll = function () {
    var y = window.scrollY;
    top.classList.toggle("is-scrolled", y > 10);
    var leadR = lead.getBoundingClientRect();
    var sobreLead = leadR.top < innerHeight && leadR.bottom > 0;
    var on = y > hero.offsetHeight * 0.8 && !sobreLead;
    sticky.classList.toggle("is-on", on);
    sticky.setAttribute("aria-hidden", String(!on));
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Inclinação 3D da capa em destaque (desktop)
  if (!reduce && window.matchMedia("(hover: hover)").matches) {
    $$(".featured__cover").forEach(function (wrap) {
      var inner = $(".book__inner", wrap);
      wrap.addEventListener("mousemove", function (e) {
        var r = wrap.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        inner.style.transform = "rotateY(" + (-12 + x * 24) + "deg) rotateX(" + (4 - y * 14) + "deg) translateY(-6px)";
      });
      wrap.addEventListener("mouseleave", function () { inner.style.transform = ""; });
    });
  }

  function sparkle(origin) {
    if (reduce) return;
    var r = origin.getBoundingClientRect();
    for (var i = 0; i < 18; i++) {
      var s = document.createElement("span");
      s.className = "spark";
      s.style.left = r.left + r.width / 2 + "px";
      s.style.top = r.top + r.height / 2 + "px";
      document.body.appendChild(s);
      var a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
      s.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: "translate(" + Math.cos(a) * d + "px," + Math.sin(a) * d + "px) scale(0)", opacity: 0 }],
        { duration: 900 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.1,1)" }).onfinish = (function (el) { return function () { el.remove(); }; })(s);
    }
  }
})();
