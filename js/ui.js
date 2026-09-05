/* Rendering helpers shared by every screen. */
(function (global) {
  "use strict";

  var t = function (k, p) { return global.I18N.t(k, p); };

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function el(sel, root) { return (root || document).querySelector(sel); }
  function els(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* Delegated clicks: every handler is looked up from data-act, so re-rendering
     a screen never leaves stale listeners behind. */
  var handlers = {};
  function on(action, fn) { handlers[action] = fn; }
  function dispatch(ev) {
    var node = ev.target.closest("[data-act]");
    if (!node || node.tagName === "FORM") return;
    var fn = handlers[node.getAttribute("data-act")];
    if (!fn) return;
    ev.preventDefault();
    fn(node.dataset, node, ev);
  }
  document.addEventListener("click", dispatch);
  document.addEventListener("submit", function (ev) {
    var form = ev.target.closest("form[data-act]");
    if (!form) return;
    ev.preventDefault();
    var fn = handlers[form.getAttribute("data-act")];
    if (fn) fn(form.dataset, form, ev);
  });

  /* The app's own mark, drawn rather than borrowed from the emoji font, so it
     is the same family on every phone and matches the icon on the home screen.
     Sized in ems off the box it sits in. */
  var markSeq = 0;
  function brandMark(size, extraClass) {
    var g = "bm" + (++markSeq);
    return '<span class="brand-mark ' + (extraClass || "") + '" style="--bm:' + (size || 38) +
      'px" aria-hidden="true">' +
      '<svg viewBox="0 0 512 512" focusable="false">' +
        '<defs><linearGradient id="' + g + '" gradientUnits="userSpaceOnUse" x1="40" y1="24" x2="472" y2="500">' +
          '<stop offset="0" stop-color="#7c5cff"/><stop offset=".55" stop-color="#a855f7"/>' +
          '<stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>' +
        '<rect width="512" height="512" rx="116" fill="url(#' + g + ')"/>' +
        '<g fill="#fff" opacity=".55">' +
          '<circle cx="144" cy="158" r="44"/>' +
          '<path d="M88 396 L88 288 A56 56 0 0 1 200 288 L200 396 Z"/>' +
          '<circle cx="368" cy="158" r="44"/>' +
          '<path d="M312 396 L312 288 A56 56 0 0 1 424 288 L424 396 Z"/>' +
        "</g>" +
        '<g fill="#fff" stroke="url(#' + g + ')" stroke-width="16" stroke-linejoin="round">' +
          '<circle cx="208" cy="240" r="32"/>' +
          '<path d="M166 396 L166 340 A42 42 0 0 1 250 340 L250 396 Z"/>' +
          '<circle cx="304" cy="240" r="32"/>' +
          '<path d="M262 396 L262 340 A42 42 0 0 1 346 340 L346 396 Z"/>' +
        "</g>" +
      "</svg></span>";
  }

  /* `color` overrides the disc the character normally comes with — that is how
     a child's own colour follows them around the app. */
  function avatar(id, size, extraClass, color) {
    var a = global.AVATARS.byId(id);
    return '<span class="avatar ' + (extraClass || "") + '" style="--av:' + (color || a.color) +
      ';--avs:' + (size || 44) + 'px">' + a.emoji + "</span>";
  }
  function childAvatar(child, size, extraClass) {
    if (!child) return "";
    return avatar(child.avatar, size, extraClass, global.Store.childColor(child));
  }

  /* A row of swatches. Deliberately not an <input type=color>: the point is a
     small set that stays legible on both themes, not any colour at all. */
  function colorPicker(selected, actionName) {
    var current = global.AVATARS.toneHex(selected);
    return '<div class="tone-row">' + global.AVATARS.tones.map(function (tone) {
      var on = tone.hex === current;
      return '<button type="button" class="tone' + (on ? " sel" : "") +
        '" data-act="' + actionName + '" data-tone="' + tone.id +
        '" style="--tone:' + tone.hex + '" aria-pressed="' + on +
        '" title="' + esc(t(tone.key)) + '" aria-label="' + esc(t(tone.key)) + '"></button>';
    }).join("") + "</div>";
  }

  function avatarPicker(list, selectedId, actionName) {
    return '<div class="avatar-grid">' + list.map(function (a) {
      return '<button type="button" class="avatar-pick' + (a.id === selectedId ? " sel" : "") +
        '" data-act="' + actionName + '" data-avatar="' + a.id +
        '" style="--av:' + a.color + '" aria-pressed="' + (a.id === selectedId) + '">' +
        a.emoji + "</button>";
    }).join("") + "</div>";
  }

  /* Names go straight to the screen — escaped, never translated. */
  function name(entity) { return esc(global.Store.nameOf(entity)); }
  function familyName() { return esc(global.Store.familyName()); }

  /* The row of languages above a name field: pick one, write the name the way
     it belongs in that language. A dot marks the ones already written. */
  function nameLangChips(names, action, active, field) {
    return global.I18N.langs.map(function (l) {
      var written = names && names[l.code];
      return '<button type="button" class="chip' + (l.code === active ? " on" : "") +
        '" data-act="' + action + '" data-lang="' + l.code + '" data-field="' + (field || "") +
        '" title="' + esc(written ? t("name.filled") : t("name.perLang")) + '">' +
        l.flag + " " + esc(l.label) + (written ? " ✓" : "") + "</button>";
    }).join("");
  }

  /* A name input with the language row above it. Switching language keeps what
     was typed for the language you are leaving, so a family can write its name
     once per language without losing any of them. */
  function nameField(opts) {
    return '<div class="field"><label for="' + opts.field + '">' + esc(opts.label) + "</label>" +
      '<div class="chips mb" id="nameLangs-' + opts.field + '">' +
        nameLangChips(opts.names, opts.action, opts.lang, opts.field) + "</div>" +
      '<input id="' + opts.field + '" type="text" value="' +
        esc((opts.names && opts.names[opts.lang]) || "") + '">' +
      '<div class="hint">' + esc(t("name.hint")) + "</div></div>";
  }

  /* Moves what is typed into the language being left, then shows the language
     being entered. Returns the language now in the box. */
  function switchNameLang(field, names, from, to) {
    var input = el("#" + field);
    if (input) {
      var typed = input.value.trim();
      if (typed) names[from] = typed; else delete names[from];
      input.value = names[to] || "";
    }
    var row = el("#nameLangs-" + field);
    if (row && input) {
      row.innerHTML = nameLangChips(names, row.querySelector("[data-act]").getAttribute("data-act"), to, field);
      input.focus();
    }
    return to;
  }

  function points(n, opts) {
    n = global.Store.num(n);
    var cls = n > 0 ? "pos" : n < 0 ? "neg" : "zero";
    var sign = n > 0 ? "+" : "";
    return '<span class="pts ' + cls + (opts && opts.big ? " big" : "") + '">' + sign + n + "</span>";
  }

  /* A signed number dropped into an RTL sentence renders as "10+" unless it is
     isolated, so every interpolated number goes through here first. */
  function iso(value) { return "\u2066" + value + "\u2069"; }
  function signed(n) { n = global.Store.num(n); return iso((n > 0 ? "+" : "") + n); }

  function fmtDate(iso2) {
    var iso3 = iso2;
    if (!iso3) return "";
    try {
      return new Intl.DateTimeFormat(global.I18N.lang, { day: "numeric", month: "short", year: "numeric" })
        .format(new Date(iso3));
    } catch (e) { return String(iso3).slice(0, 10); }
  }
  function fmtDateTime(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(global.I18N.lang, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      }).format(new Date(iso));
    } catch (e) { return String(iso).slice(0, 16).replace("T", " "); }
  }
  function weekdayName(index) {
    try {
      var d = new Date(2024, 0, 7 + index); // 2024-01-07 was a Sunday
      return new Intl.DateTimeFormat(global.I18N.lang, { weekday: "long" }).format(d);
    } catch (e) { return String(index); }
  }
  function relTime(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.round(diff / 60000);
    if (mins < 1) return t("common.today");
    if (mins < 60) return mins + "m";
    if (mins < 60 * 24) return Math.round(mins / 60) + "h";
    return fmtDate(iso);
  }

  /* ---- text somebody in the family typed ----
     Two flavours of every getter: a plain one for sentences and toasts, and an
     Html one for lists, which escapes the text and tags it as a translation so
     the reader can always get back to the words that were actually written. */

  function trValue(owner, field) {
    return global.Translate.of(owner, field, global.I18N.lang).value;
  }

  function trHtml(owner, field) {
    var r = global.Translate.of(owner, field, global.I18N.lang);
    var html = esc(r.value);
    if (r.translated) {
      html += ' <button class="tr-badge" data-act="tr.original" data-original="' + esc(owner[field]) +
        '" data-src="' + esc(r.source) + '" title="' +
        esc(t("tr.badge", { lang: t("lang." + r.source) })) + '">🌐</button>';
    } else if (r.pending) {
      html += ' <span class="tr-badge pending" title="' + esc(t("tr.pending")) + '">⋯</span>';
    } else if (r.source && r.source !== global.I18N.lang) {
      html += ' <span class="tr-badge lang" title="' + esc(t("tr.pairMissing", {
        a: t("lang." + r.source), b: t("lang." + global.I18N.lang)
      })) + '">' + esc(r.source.toUpperCase()) + "</span>";
    }
    return html;
  }

  on("tr.original", function (d) {
    modal(t("tr.original"),
      '<p class="lead"><span class="tag">' + esc(t("lang." + d.src)) + "</span></p>" +
      '<p style="white-space:pre-wrap">' + esc(d.original) + "</p>" +
      '<button class="btn block mt" data-act="modal.close">' + esc(t("common.close")) + "</button>");
  });

  function categoryName(cat) {
    if (!cat) return t("cat.other");
    return cat.key ? t(cat.key) : trValue(cat, "name");
  }
  function categoryNameHtml(cat) {
    if (!cat) return esc(t("cat.other"));
    return cat.key ? esc(t(cat.key)) : trHtml(cat, "name");
  }
  /* Tasks, rewards and history entries all name themselves the same way: a
     translation key when it came with the app, free text when a parent typed
     it — and free text gets translated for whoever is reading. */
  function keyedTitle(obj) {
    if (!obj) return "";
    return obj.titleKey ? t(obj.titleKey) : trValue(obj, "title");
  }
  function keyedTitleHtml(obj) {
    if (!obj) return "";
    return obj.titleKey ? esc(t(obj.titleKey)) : trHtml(obj, "title");
  }
  function taskTitle(task) { return keyedTitle(task); }
  function taskTitleHtml(task) { return keyedTitleHtml(task); }

  function toast(msg, kind) {
    var box = el("#toast");
    box.textContent = msg;
    box.className = "toast show " + (kind || "");
    clearTimeout(box._timer);
    box._timer = setTimeout(function () { box.className = "toast"; }, 2600);
  }

  /* One modal element, reused. `onOpen` receives the body so a screen can wire
     up focus or extra listeners after the markup lands. */
  function modal(title, bodyHtml, onOpen) {
    var host = el("#modal");
    host.innerHTML =
      '<div class="modal-backdrop" data-act="modal.close"></div>' +
      '<div class="modal-card" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="modal-head"><h2>' + esc(title) + "</h2>" +
        '<button class="icon-btn" data-act="modal.close" aria-label="' + esc(t("common.close")) + '">✕</button></div>' +
        '<div class="modal-body">' + bodyHtml + "</div>" +
      "</div>";
    host.classList.add("open");
    if (onOpen) onOpen(el(".modal-body", host));
  }
  function closeModal() {
    var host = el("#modal");
    host.classList.remove("open");
    host.innerHTML = "";
  }
  on("modal.close", closeModal);

  function confirmDialog(message, onYes) {
    modal(t("common.confirm"),
      '<p class="lead">' + esc(message) + "</p>" +
      '<div class="row end gap">' +
        '<button class="btn ghost" data-act="modal.close">' + esc(t("common.cancel")) + "</button>" +
        '<button class="btn danger" data-act="confirm.yes">' + esc(t("common.yes")) + "</button>" +
      "</div>");
    handlers["confirm.yes"] = function () { closeModal(); onYes(); };
  }

  /* ---- real money ----
     Two decimal places always, the symbol before the number, and the whole
     thing isolated so a euro amount keeps its own direction inside a Hebrew
     sentence instead of coming out back to front. */
  var SYMBOL = { EUR: "\u20ac", ILS: "\u20aa" };
  function currencySymbol(code) { return SYMBOL[code || global.Store.currency()] || "\u20ac"; }
  function cash(value, opts) {
    var n = global.Store.money(value);
    var sign = n < 0 ? "-" : (opts && opts.sign && n > 0 ? "+" : "");
    var body = currencySymbol(opts && opts.currency) + Math.abs(n).toFixed(2);
    var text = iso(sign + body);
    if (opts && opts.plain) return text;
    var cls = n > 0 ? "pos" : n < 0 ? "neg" : "zero";
    return '<span class="pts ' + cls + (opts && opts.big ? " big" : "") + '">' + text + "</span>";
  }

  /* ---- a balance that moves when it changes ----
     Every big number on screen is tagged with a key and its value. After a
     re-render, `animateScores` counts each one from where the reader last saw
     it to where it is now, so an approval upstairs shows up down here as the
     number climbing rather than as different text on a page that blinked. */
  function scoreEl(key, value, opts) {
    opts = opts || {};
    var n = opts.money ? global.Store.money(value) : global.Store.num(value);
    return '<span class="score' + (opts.cls ? " " + opts.cls : "") + '"' +
      (opts.style ? ' style="' + opts.style + '"' : "") +
      ' data-score="' + esc(key) + '" data-value="' + n + '"' +
      (opts.money ? ' data-money="1"' : "") +
      (opts.cheer ? ' data-cheer="1"' : "") + ">" +
      (opts.money ? cash(n, { plain: true }) : n) + "</span>";
  }

  var lastScores = {};
  var calm = null;
  function reducedMotion() {
    if (calm === null) {
      try { calm = global.matchMedia("(prefers-reduced-motion: reduce)").matches; }
      catch (e) { calm = false; }
    }
    return calm;
  }

  function animateScores() {
    els("[data-score]").forEach(function (node) {
      var key = node.getAttribute("data-score");
      var to = Number(node.getAttribute("data-value")) || 0;
      var from = lastScores[key];
      lastScores[key] = to;
      if (from === undefined || from === to) return;
      var asMoney = !!node.getAttribute("data-money");

      node.classList.add(to > from ? "up" : "down");
      setTimeout(function () { node.classList.remove("up", "down"); }, 900);
      if (node.getAttribute("data-cheer") && to > from) celebrate();
      if (reducedMotion()) return;
      countTo(node, from, to, asMoney);
    });
  }

  function countTo(node, from, to, asMoney) {
    var span = 620, started = null;
    var show = asMoney
      ? function (v) { return cash(v, { plain: true }); }
      : function (v) { return Math.round(v); };
    if (node._count) global.cancelAnimationFrame(node._count);
    function frame(ts) {
      if (started === null) started = ts;
      var p = Math.min(1, (ts - started) / span);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = show(from + (to - from) * eased);
      if (p < 1) node._count = global.requestAnimationFrame(frame);
      else { node.textContent = show(to); node._count = null; }
    }
    node._count = global.requestAnimationFrame(frame);
  }

  /* Forget a number so the next render treats it as first sight — used when
     signing out, so the next person does not inherit someone else's total and
     watch it "fall". */
  function forgetScores() { lastScores = {}; }

  /* ---- the moment something good happens ----
     Paper, not a library: a couple of dozen divs that fall and are thrown away
     again. Skipped entirely for anyone who asked for less motion. */
  var CHEER = ["#ff8a3d", "#6b4dfb", "#16a06a", "#f0b429", "#e05580", "#3089d4"];
  function celebrate(opts) {
    if (reducedMotion()) return;
    var host = el("#cheer");
    if (!host) return;
    opts = opts || {};
    var n = opts.pieces || 26;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var bit = document.createElement("i");
      bit.className = "bit" + (i % 3 === 0 ? " round" : "");
      bit.style.setProperty("--x", (Math.random() * 100).toFixed(2) + "vw");
      bit.style.setProperty("--drift", (Math.random() * 120 - 60).toFixed(0) + "px");
      bit.style.setProperty("--spin", (Math.random() * 720 - 360).toFixed(0) + "deg");
      bit.style.setProperty("--delay", (Math.random() * 260).toFixed(0) + "ms");
      bit.style.setProperty("--life", (1500 + Math.random() * 900).toFixed(0) + "ms");
      /* When we know whose points moved, their colour leads — every other
         piece — so the burst still says who it is for without going flat. */
      bit.style.setProperty("--c", opts.color && i % 2 ? opts.color : CHEER[i % CHEER.length]);
      frag.appendChild(bit);
    }
    host.appendChild(frag);
    host.classList.add("on");
    clearTimeout(host._sweep);
    host._sweep = setTimeout(function () {
      host.innerHTML = "";
      host.classList.remove("on");
    }, 2800);
  }

  /* Points at the thing that just changed. The screen has usually been
     re-rendered by now, so this runs against the new node, not the one that
     was clicked. */
  function flash(selector) {
    if (reducedMotion()) return;
    var node = el(selector);
    if (!node) return;
    node.classList.remove("just");
    void node.offsetWidth;      // restart the animation if it is still running
    node.classList.add("just");
    setTimeout(function () { node.classList.remove("just"); }, 1200);
  }

  /* An empty list is a place someone has not got to yet, so it says what would
     fill it — and, where there is one, offers the button that does. */
  function emptyState(msg, icon, hint, actionHtml) {
    return '<div class="empty"><span class="empty-ic">' + (icon || "🌱") + "</span>" +
      "<p>" + esc(msg) + "</p>" +
      (hint ? '<p class="empty-hint">' + esc(hint) + "</p>" : "") +
      (actionHtml ? '<div class="empty-act">' + actionHtml + "</div>" : "") +
      "</div>";
  }

  function progressBar(pct) {
    return '<div class="meter"><div class="meter-fill" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></div></div>';
  }

  global.UI = {
    esc: esc, el: el, els: els, on: on, avatar: avatar, avatarPicker: avatarPicker,
    brandMark: brandMark, childAvatar: childAvatar, colorPicker: colorPicker,
    scoreEl: scoreEl, animateScores: animateScores, forgetScores: forgetScores,
    celebrate: celebrate, reducedMotion: reducedMotion, flash: flash,
    cash: cash, currencySymbol: currencySymbol,
    name: name, familyName: familyName, nameLangChips: nameLangChips,
    nameField: nameField, switchNameLang: switchNameLang,
    iso: iso, signed: signed,
    points: points, fmtDate: fmtDate, fmtDateTime: fmtDateTime, weekdayName: weekdayName,
    relTime: relTime, categoryName: categoryName, categoryNameHtml: categoryNameHtml,
    taskTitle: taskTitle, taskTitleHtml: taskTitleHtml,
    keyedTitle: keyedTitle, keyedTitleHtml: keyedTitleHtml,
    trValue: trValue, trHtml: trHtml,
    toast: toast, modal: modal, closeModal: closeModal, confirmDialog: confirmDialog,
    emptyState: emptyState, progressBar: progressBar
  };
})(window);
