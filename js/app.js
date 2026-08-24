/* Router, chrome and boot. */
(function (global) {
  "use strict";

  var t = function (k, p) { return global.I18N.t(k, p); };
  var esc = function (s) { return global.UI.esc(s); };
  var U = global.UI, S = global.Store;

  var view = { screen: "login", tab: "dashboard", params: {} };

  var PARENT_TABS = [
    { id: "dashboard", icon: "🏠", key: "nav.dashboard" },
    { id: "tasks", icon: "📋", key: "nav.tasks" },
    { id: "rewards", icon: "🎁", key: "nav.rewards" },
    { id: "kids", icon: "🧒", key: "nav.kids" },
    { id: "approvals", icon: "✅", key: "nav.approvals" },
    { id: "family", icon: "⚙️", key: "nav.family" }
  ];
  var CHILD_TABS = [
    { id: "me", icon: "⭐", key: "nav.me" },
    { id: "tasks", icon: "📋", key: "nav.tasks" },
    { id: "rewards", icon: "🎁", key: "nav.rewards" },
    { id: "group", icon: "👨‍👩‍👧", key: "nav.group" },
    { id: "notes", icon: "📝", key: "nav.notes" }
  ];

  function session() { return S.getSession() || {}; }

  function resolveScreen() {
    if (!S.exists()) return "setup";
    var s = session();
    if (s.kind === "parent" && S.parent(s.id)) return "parent";
    if (s.kind === "child" && S.child(s.id)) return "child";
    return "login";
  }

  function go(patch) {
    Object.keys(patch).forEach(function (k) { view[k] = patch[k]; });
    if (patch.tab && !patch.params) view.params = {};
    refresh();
    global.scrollTo(0, 0);
  }

  function refresh() {
    var screen = view.screen === "setup" && !S.exists() ? "setup" : resolveScreen();
    view.screen = screen;

    var tabs = screen === "parent" ? PARENT_TABS : screen === "child" ? CHILD_TABS : null;
    if (tabs && !tabs.some(function (x) { return x.id === view.tab; })) view.tab = tabs[0].id;

    U.el("#header").innerHTML = header(screen);
    U.el("#view").innerHTML =
      screen === "setup" ? global.Setup.render()
      : screen === "login" ? global.Setup.renderLogin()
      : screen === "parent" ? global.ParentView.render(view.tab, view.params)
      : global.ChildView.render(view.tab);
    U.el("#tabs").innerHTML = tabs ? tabBar(tabs) : "";
    document.body.classList.toggle("no-tabs", !tabs);
  }

  function header(screen) {
    var s = S.exists() ? S.get() : null;
    var who = "";
    if (screen === "parent") {
      var p = S.parent(session().id);
      if (p) who = U.avatar(p.avatar, 34);
    } else if (screen === "child") {
      var c = S.child(session().id);
      if (c) who = U.avatar(c.avatar, 34);
    }
    var title = (s && S.familyName()) || t("app.name");
    var sub = screen === "parent" ? S.nameOf(S.parent(session().id))
            : screen === "child" ? S.nameOf(S.child(session().id))
            : t("app.tagline");

    return '<div class="wrap">' +
      '<div class="brand-mark">👪</div>' +
      '<div class="bar-title"><strong>' + esc(title) + "</strong><small>" + esc(sub || "") + "</small></div>" +
      '<div class="bar-actions">' +
        (global.Sync.connected()
          ? '<span id="syncDot" class="sync-dot" title="' + esc(t("sync.title")) + '">' + syncDot() + "</span>"
          : "") +
        '<button class="icon-btn" data-act="app.lang" aria-label="' + esc(t("common.language")) + '">🌐</button>' +
        (screen === "parent" || screen === "child"
          ? who + '<button class="icon-btn" data-act="app.logout" aria-label="' + esc(t("common.logout")) + '">⏻</button>'
          : "") +
      "</div></div>";
  }

  function syncDot() {
    var st = global.Sync.status();
    if (!st.connected) return "";
    return st.state === "syncing" ? "🔄" : st.state === "offline" ? "🟠" : st.state === "error" ? "🔴" : "🟢";
  }

  function tabBar(tabs) {
    var pending = S.pendingClaims().length;
    return tabs.map(function (tab) {
      var badge = tab.id === "approvals" && pending ? '<span class="badge">' + pending + "</span>" : "";
      return '<button class="' + (view.tab === tab.id ? "on" : "") + '" data-act="app.tab" data-tab="' + tab.id + '">' +
        '<span class="ic">' + tab.icon + "</span>" + badge +
        "<span>" + esc(t(tab.key)) + "</span></button>";
    }).join("");
  }

  U.on("app.tab", function (d) { go({ tab: d.tab, params: {} }); });
  U.on("app.logout", function () {
    S.clearSession();
    go({ screen: "login", tab: "dashboard", params: {} });
  });
  U.on("app.lang", function () {
    var signedIn = view.screen === "parent" || view.screen === "child";
    U.modal(signedIn ? t("tr.yourLang") : t("common.language"),
      '<div class="stack">' + global.I18N.langs.map(function (l) {
        return '<button class="btn ' + (l.code === global.I18N.lang ? "" : "ghost") +
          ' block" data-act="app.langPick" data-lang="' + l.code + '">' + l.flag + " " + esc(l.label) + "</button>";
      }).join("") + "</div>" +
      (signedIn ? '<p class="hint">' + esc(t("tr.userLangHint")) + "</p>" : ""));
  });
  /* Language is a personal setting: it changes what this account sees and
     leaves everyone else alone. Before anyone is signed in there is no account
     to attach it to, so it moves the family default instead. */
  U.on("app.langPick", function (d) {
    var s = session();
    if ((view.screen === "parent" || view.screen === "child") && s.id) {
      S.setUserLang(s.kind, s.id, d.lang);
    } else if (S.exists()) {
      S.get().settings.lang = d.lang;
      S.save();
    }
    global.I18N.setLang(d.lang);
    U.closeModal();
    refresh();
  });

  /* The language of whoever is signed in wins over the family default. */
  function applyUserLang() {
    if (!S.exists()) return;
    var s = session();
    var user = s.kind === "parent" ? S.parent(s.id) : s.kind === "child" ? S.child(s.id) : null;
    global.I18N.setLang((user && user.lang) || S.get().settings.lang || guessLang());
  }

  /* Joining a family from an invite link. Peek first so the person can see
     whose family they are about to join, since joining replaces this device. */
  function joinDialog(prefill) {
    U.modal(t("sync.join"),
      '<p class="hint">' + esc(t("sync.joinHint")) + "</p>" +
      '<textarea id="joinBox" style="min-height:80px;font-family:ui-monospace,monospace;font-size:.75rem">' +
        esc(prefill || "") + "</textarea>" +
      '<button class="btn block mt" data-act="app.joinGo">' + esc(t("sync.joinBtn")) + "</button>");
  }
  U.on("app.join", function () { joinDialog(""); });
  U.on("app.joinGo", function () {
    var box = U.el("#joinBox");
    if (!box) return;
    var text = box.value;
    U.toast(t("sync.syncing"));
    global.Sync.peek(text).then(function (res) {
      var set = (res && res.doc && res.doc.settings) || {};
      var name = (set.familyNames && set.familyNames[global.I18N.lang]) || set.familyName || t("app.name");
      U.confirmDialog(t("sync.joinReplace", { name: name }), function () {
        global.Sync.join(text).then(function () {
          applyUserLang();
          S.clearSession();
          go({ screen: "login", tab: "dashboard", params: {} });
          U.toast(t("sync.joined", { name: name }), "good");
        }).catch(function () { U.toast(t("sync.joinBad"), "bad"); });
      });
    }).catch(function () { U.toast(t("sync.joinBad"), "bad"); });
  });

  /* An invite link opened in a browser carries the family in its hash. */
  function invitationInUrl() {
    var hash = global.location.hash || "";
    if (hash.indexOf("#join=") !== 0) return null;
    var parsed = global.Sync.parseInvite(hash);
    if (!parsed) return null;
    try { global.history.replaceState(null, "", global.location.pathname + global.location.search); }
    catch (e) { global.location.hash = ""; }
    return hash;
  }

  function guessLang() {
    var nav = (global.navigator.language || "en").slice(0, 2).toLowerCase();
    return ["en", "nl", "he"].indexOf(nav) !== -1 ? nav : "en";
  }

  function boot() {
    S.load();
    var s = S.get();
    global.I18N.setLang(s && s.settings.lang ? s.settings.lang : guessLang());
    applyUserLang();
    view.screen = resolveScreen();
    view.tab = view.screen === "child" ? "me" : "dashboard";
    refresh();

    global.Sync.start();
    global.Sync.onChange(function () {
      var badge = U.el("#syncDot");
      if (badge) badge.textContent = syncDot();
    });

    var invitation = invitationInUrl();
    if (invitation) joinDialog(invitation);
  }

  global.App = {
    go: go, refresh: refresh, session: session, boot: boot,
    applyUserLang: applyUserLang,
    get view() { return view; }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
