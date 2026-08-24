/* First-run wizard and the sign-in screen. */
(function (global) {
  "use strict";

  var t = function (k, p) { return global.I18N.t(k, p); };
  var esc = function (s) { return global.UI.esc(s); };
  var U = global.UI;

  var STEPS = 4;
  var draft = null;
  var step = 1;
  var error = "";

  function reset() {
    draft = {
      familyNames: {},
      lang: global.I18N.lang,
      startPoints: global.Store.START_POINTS,
      parent: { names: {}, nameLang: global.I18N.lang, username: "", password: "", password2: "", avatar: "p1" },
      childForm: { names: {}, nameLang: global.I18N.lang, avatar: "k1", birthday: "", pin: "" },
      children: []
    };
    step = 1;
    error = "";
  }

  /* ---------------- wizard ---------------- */

  function render() {
    if (!draft) reset();
    var body = step === 1 ? stepFamily()
             : step === 2 ? stepParent()
             : step === 3 ? stepChildren()
             : stepReview();

    return '<div class="wrap">' +
      '<div class="card">' +
        '<div class="steps">' +
          [1, 2, 3, 4].map(function (i) { return '<span class="' + (i <= step ? "on" : "") + '"></span>'; }).join("") +
        "</div>" +
        '<small>' + esc(t("setup.step", { n: step, total: STEPS })) + "</small>" +
        (error ? '<div class="error-msg">' + esc(error) + "</div>" : "") +
        body +
      "</div>" +
      '<p class="footer-note">' + esc(t("family.aboutText")) + "</p>" +
    "</div>";
  }

  function stepFamily() {
    return "<h1>" + esc(t("setup.welcome")) + "</h1>" +
      '<p class="lead">' + esc(t("setup.intro")) + "</p>" +
      '<div class="field"><span class="field-label">' + esc(t("common.language")) + "</span>" +
        '<div class="chips">' + global.I18N.langs.map(function (l) {
          var written = draft.familyNames[l.code];
          return '<button type="button" class="chip' + (l.code === draft.lang ? " on" : "") +
            '" data-act="setup.lang" data-lang="' + l.code + '">' + l.flag + " " + esc(l.label) +
            (written ? " ✓" : "") + "</button>";
        }).join("") + "</div></div>" +
      '<div class="field"><label for="fName">' + esc(t("setup.familyName")) + " · " +
        esc(t("name.writing", { lang: t("lang." + draft.lang) })) + "</label>" +
        '<input id="fName" type="text" value="' + esc(draft.familyNames[draft.lang] || "") +
        '" placeholder="' + esc(t("setup.familyNamePh")) + '">' +
        '<div class="hint">' + esc(t("name.hint")) + "</div></div>" +
      '<button class="btn block mt" data-act="setup.next">' + esc(t("common.next")) + " →</button>" +
      '<hr style="border:none;border-top:1px solid var(--line);margin:18px 0">' +
      '<p class="hint" style="margin-top:0">' + esc(t("setup.haveFamily")) + "</p>" +
      '<button class="btn ghost block" data-act="app.join">🔗 ' + esc(t("setup.joinFamily")) + "</button>" +
      '<button class="btn ghost block mt" data-act="app.restore">⬆️ ' + esc(t("setup.restore")) + "</button>";
  }

  function stepParent() {
    var p = draft.parent;
    return "<h1>" + esc(t("setup.parent")) + "</h1>" +
      '<p class="lead">' + esc(t("setup.parentIntro")) + "</p>" +
      U.nameField({ field: "pName", label: t("setup.displayName"),
                    names: p.names, lang: p.nameLang, action: "setup.parentNameLang" }) +
      '<div class="field"><label for="pUser">' + esc(t("setup.username")) + "</label>" +
        '<input id="pUser" type="text" autocomplete="username" value="' + esc(p.username) + '"></div>' +
      '<div class="grid-2">' +
        '<div class="field"><label for="pPass">' + esc(t("setup.password")) + "</label>" +
          '<input id="pPass" type="password" autocomplete="new-password" value="' + esc(p.password) + '"></div>' +
        '<div class="field"><label for="pPass2">' + esc(t("setup.password2")) + "</label>" +
          '<input id="pPass2" type="password" autocomplete="new-password" value="' + esc(p.password2) + '"></div>' +
      "</div>" +
      '<div class="field"><span class="field-label">' + esc(t("common.avatar")) + "</span>" +
        U.avatarPicker(global.AVATARS.parents, p.avatar, "setup.parentAvatar") + "</div>" +
      '<div class="row gap mt">' +
        '<button class="btn ghost" data-act="setup.back">←</button>' +
        '<button class="btn grow" data-act="setup.next">' + esc(t("common.next")) + " →</button>" +
      "</div>";
  }

  function stepChildren() {
    var f = draft.childForm;
    var list = draft.children.length
      ? '<ul class="list card flush">' + draft.children.map(function (c, i) {
          return "<li>" + U.avatar(c.avatar, 40) +
            '<div class="grow"><div class="title">' + U.name(c) + "</div>" +
            '<div class="sub">' + (c.birthday ? esc(U.fmtDate(c.birthday)) : "—") +
            (c.pin ? " · 🔒" : "") + "</div></div>" +
            '<button class="icon-btn" data-act="setup.removeChild" data-i="' + i + '">🗑️</button></li>';
        }).join("") + "</ul>"
      : '<p class="muted">' + esc(t("setup.noChildYet")) + "</p>";

    return "<h1>" + esc(t("setup.children")) + "</h1>" +
      '<p class="lead">' + esc(t("setup.childrenIntro")) + "</p>" +
      list +
      '<div class="card" style="background:var(--surface-2)">' +
        U.nameField({ field: "cName", label: t("setup.childName"),
                      names: f.names, lang: f.nameLang, action: "setup.childNameLang" }) +
        '<div class="grid-2">' +
          '<div class="field"><label for="cBday">' + esc(t("setup.birthday")) + "</label>" +
            '<input id="cBday" type="date" value="' + esc(f.birthday) + '"></div>' +
          '<div class="field"><label for="cPin">' + esc(t("setup.pin")) + " <small>(" + esc(t("common.optional")) + ")</small></label>" +
            '<input id="cPin" type="tel" inputmode="numeric" maxlength="4" class="pin-input" value="' + esc(f.pin) + '">' +
            '<div class="hint">' + esc(t("setup.pinHelp")) + "</div></div>" +
        "</div>" +
        '<div class="field"><span class="field-label">' + esc(t("common.avatar")) + "</span>" +
          U.avatarPicker(global.AVATARS.kids, f.avatar, "setup.childAvatar") + "</div>" +
        '<button class="btn soft block" data-act="setup.addChild">＋ ' + esc(t("setup.addChild")) + "</button>" +
      "</div>" +
      '<div class="row gap mt">' +
        '<button class="btn ghost" data-act="setup.back">←</button>' +
        '<button class="btn grow" data-act="setup.next">' + esc(t("common.next")) + " →</button>" +
      "</div>";
  }

  function stepReview() {
    return "<h1>" + esc(t("setup.review")) + " 🎉</h1>" +
      '<p class="lead">' + esc(t("setup.reviewIntro", { n: draft.startPoints })) + "</p>" +
      '<div class="kv"><span class="k">' + esc(t("setup.familyName")) + '</span><span>' +
        esc(draft.familyNames[draft.lang] || firstName(draft.familyNames)) + "</span></div>" +
      '<div class="kv"><span class="k">' + esc(t("common.parent")) + '</span><span>' +
        esc(draft.parent.names[draft.lang] || firstName(draft.parent.names)) +
        " (" + esc(draft.parent.username) + ")</span></div>" +
      '<div class="kv"><span class="k">' + esc(t("common.children")) + '</span><span>' +
        draft.children.map(function (c) { return esc(c.names[draft.lang] || c.name); }).join(", ") + "</span></div>" +
      '<div class="field"><label for="sPoints">' + esc(t("setup.startingPoints")) + "</label>" +
        '<input id="sPoints" type="number" min="0" step="10" value="' + draft.startPoints + '"></div>' +
      '<div class="row gap mt">' +
        '<button class="btn ghost" data-act="setup.back">←</button>' +
        '<button class="btn grow" data-act="setup.create">' + esc(t("setup.createFamily")) + "</button>" +
      "</div>";
  }

  function setNameFor(names, lang, value) {
    value = String(value || "").trim();
    if (value) names[lang] = value; else delete names[lang];
  }
  function firstName(names) {
    var keys = Object.keys(names || {});
    return keys.length ? names[keys[0]] : "";
  }

  /* Reads whatever is currently typed so a re-render (avatar pick, step change)
     never throws the parent's input away. */
  function capture() {
    var v = function (id) { var n = U.el("#" + id); return n ? n.value : null; };
    if (step === 1) {
      if (v("fName") !== null) setNameFor(draft.familyNames, draft.lang, v("fName"));
    } else if (step === 2) {
      if (v("pName") !== null) setNameFor(draft.parent.names, draft.parent.nameLang, v("pName"));
      if (v("pUser") !== null) draft.parent.username = v("pUser").trim();
      if (v("pPass") !== null) draft.parent.password = v("pPass");
      if (v("pPass2") !== null) draft.parent.password2 = v("pPass2");
    } else if (step === 3) {
      if (v("cName") !== null) setNameFor(draft.childForm.names, draft.childForm.nameLang, v("cName"));
      if (v("cBday") !== null) draft.childForm.birthday = v("cBday");
      if (v("cPin") !== null) draft.childForm.pin = v("cPin").replace(/\D/g, "");
    } else if (step === 4) {
      if (v("sPoints") !== null) draft.startPoints = Math.max(0, parseInt(v("sPoints"), 10) || 0);
    }
  }

  function validateStep() {
    if (step === 1) {
      if (!firstName(draft.familyNames)) return t("setup.errName");
    } else if (step === 2) {
      var p = draft.parent;
      if (!firstName(p.names) || !p.username || !p.password) return t("setup.errParent");
      if (p.password.length < 4) return t("setup.errPassShort");
      if (p.password !== p.password2) return t("setup.errPass2");
    } else if (step === 4) {
      if (v("sPoints") !== null) draft.startPoints = Math.max(0, parseInt(v("sPoints"), 10) || 0);
    } else if (step === 3) {
      if (!draft.children.length) return t("setup.errChildren");
    }
    return "";
  }

  /* Changing the language here also changes which spelling of the family name
     you are writing — the name in the box follows the language, and the one you
     were writing is kept. */
  U.on("setup.lang", function (d) {
    capture();                       // keep what was typed for the old language
    draft.lang = d.lang;
    draft.parent.nameLang = d.lang;  // every name field follows the language
    draft.childForm.nameLang = d.lang;
    global.I18N.setLang(d.lang);
    global.App.refresh();
  });
  U.on("setup.childNameLang", function (d, node) {
    capture();
    draft.childForm.nameLang = U.switchNameLang(node.dataset.field, draft.childForm.names,
                                                draft.childForm.nameLang, d.lang);
  });
  U.on("setup.parentAvatar", function (d) {
    capture(); draft.parent.avatar = d.avatar; global.App.refresh();
  });
  U.on("setup.parentNameLang", function (d, node) {
    capture();
    draft.parent.nameLang = U.switchNameLang(node.dataset.field, draft.parent.names,
                                             draft.parent.nameLang, d.lang);
  });
  U.on("setup.childAvatar", function (d) {
    capture(); draft.childForm.avatar = d.avatar; global.App.refresh();
  });
  U.on("setup.addChild", function () {
    capture();
    var f = draft.childForm;
    var name = f.names[f.nameLang] || firstName(f.names);
    if (!name) { error = t("setup.errChildName"); return global.App.refresh(); }
    if (f.pin && f.pin.length !== 4) { error = t("setup.errPin"); return global.App.refresh(); }
    draft.children.push({ name: name, names: JSON.parse(JSON.stringify(f.names)),
                          avatar: f.avatar, birthday: f.birthday, pin: f.pin, lang: draft.lang });
    var used = draft.children.map(function (c) { return c.avatar; });
    var free = global.AVATARS.kids.filter(function (a) { return used.indexOf(a.id) === -1; })[0];
    draft.childForm = { names: {}, nameLang: draft.lang, avatar: free ? free.id : "k1", birthday: "", pin: "" };
    error = "";
    global.App.refresh();
  });
  U.on("setup.removeChild", function (d) {
    capture();
    draft.children.splice(+d.i, 1);
    global.App.refresh();
  });
  U.on("setup.next", function () {
    capture();
    error = validateStep();
    if (!error) step = Math.min(STEPS, step + 1);
    global.App.refresh();
  });
  U.on("setup.back", function () {
    capture(); error = ""; step = Math.max(1, step - 1); global.App.refresh();
  });
  U.on("setup.create", function () {
    capture();                 // the starting points may have just been typed
    global.Store.createFamily({
      lang: draft.lang,
      familyName: draft.familyNames[draft.lang] || firstName(draft.familyNames),
      familyNames: draft.familyNames,
      startPoints: draft.startPoints,
      parent: {
        name: draft.parent.names[draft.lang] || firstName(draft.parent.names),
        names: draft.parent.names,
        username: draft.parent.username,
        password: draft.parent.password,
        avatar: draft.parent.avatar
      },
      children: draft.children
    });
    var parent = global.Store.get().parents[0];
    global.Store.setSession("parent", parent.id);
    reset();
    global.App.go({ screen: "parent", tab: "dashboard" });
    U.toast(t("auth.welcomeBack", { name: global.Store.nameOf(parent) }), "good");
  });

  /* ---------------- sign in ---------------- */

  var loginTab = "parent";
  var loginError = "";
  var pinChildId = null;

  function renderLogin() {
    var s = global.Store.get();
    return '<div class="wrap">' +
      '<div class="card center" style="padding-block:26px">' +
        '<div class="brand-mark" style="margin:0 auto 10px;width:52px;height:52px;font-size:1.5rem">🏆</div>' +
        "<h1>" + U.familyName() + "</h1>" +
        '<p class="lead">' + esc(t("app.tagline")) + "</p>" +
      "</div>" +
      '<div class="card">' +
        '<div class="seg mb">' +
          '<button class="' + (loginTab === "parent" ? "on" : "") + '" data-act="login.tab" data-tab="parent">' + esc(t("auth.parentTab")) + "</button>" +
          '<button class="' + (loginTab === "child" ? "on" : "") + '" data-act="login.tab" data-tab="child">' + esc(t("auth.childTab")) + "</button>" +
        "</div>" +
        (loginError ? '<div class="error-msg">' + esc(loginError) + "</div>" : "") +
        (loginTab === "parent" ? parentLoginForm() : childLoginGrid(s)) +
      "</div>" +
      '<div class="center">' +
        '<button class="btn ghost small" data-act="app.join">🔗 ' + esc(t("setup.joinFamily")) + "</button> " +
        '<button class="btn ghost small" data-act="app.restore">⬆️ ' + esc(t("setup.restore")) + "</button></div>" +
      '<div class="center"><div class="chips" style="justify-content:center">' +
        global.I18N.langs.map(function (l) {
          return '<button type="button" class="chip' + (l.code === global.I18N.lang ? " on" : "") +
            '" data-act="login.lang" data-lang="' + l.code + '">' + l.flag + " " + esc(l.label) + "</button>";
        }).join("") + "</div></div>" +
    "</div>";
  }

  function parentLoginForm() {
    return '<form data-act="login.parent">' +
      '<div class="field"><label for="lUser">' + esc(t("setup.username")) + "</label>" +
        '<input id="lUser" type="text" autocomplete="username" autocapitalize="none"></div>' +
      '<div class="field"><label for="lPass">' + esc(t("setup.password")) + "</label>" +
        '<input id="lPass" type="password" autocomplete="current-password"></div>' +
      '<button class="btn block" type="submit">' + esc(t("auth.signIn")) + "</button>" +
    "</form>";
  }

  function childLoginGrid(s) {
    if (!s.children.length) return U.emptyState(t("auth.noKids"), "🧒");
    return '<p class="lead">' + esc(t("auth.pickChild")) + "</p>" +
      '<div class="kid-grid">' + s.children.map(function (c) {
        return '<button class="kid-card" data-act="login.child" data-id="' + c.id + '">' +
          U.avatar(c.avatar, 56) + '<span class="nm">' + U.name(c) + "</span>" +
          (c.pin ? '<span class="tag">🔒</span>' : "") + "</button>";
      }).join("") + "</div>";
  }

  U.on("login.tab", function (d) { loginTab = d.tab; loginError = ""; global.App.refresh(); });
  U.on("login.lang", function (d) {
    global.I18N.setLang(d.lang);
    var s = global.Store.get();
    s.settings.lang = d.lang;
    global.Store.save();
    global.App.refresh();
  });
  U.on("login.parent", function (d, form) {
    var user = U.el("#lUser", form).value;
    var pass = U.el("#lPass", form).value;
    var p = global.Store.findParent(user);
    if (!p || !global.Store.checkSecret(p.secret, pass)) {
      loginError = t("auth.badLogin");
      return global.App.refresh();
    }
    loginError = "";
    global.Store.setSession("parent", p.id);
    global.App.applyUserLang();
    global.App.go({ screen: "parent", tab: "dashboard" });
    U.toast(t("auth.welcomeBack", { name: global.Store.nameOf(p) }), "good");
  });
  U.on("login.child", function (d) {
    var c = global.Store.child(d.id);
    if (!c) return;
    if (!c.pin) return enterAsChild(c);
    pinChildId = c.id;
    U.modal(global.Store.nameOf(c),
      '<form data-act="login.pin">' +
        '<p class="lead center">' + esc(t("auth.enterPin")) + "</p>" +
        '<div class="center">' + U.avatar(c.avatar, 64) + "</div>" +
        '<div class="field"><input id="pinBox" type="tel" inputmode="numeric" maxlength="4" class="pin-input" autocomplete="off"></div>' +
        '<button class="btn block" type="submit">' + esc(t("common.login")) + "</button>" +
      "</form>",
      function (body) { var i = U.el("#pinBox", body); if (i) i.focus(); });
  });
  U.on("login.pin", function (d, form) {
    var c = global.Store.child(pinChildId);
    // A PIN is stored as digits only, so read it back the same way: a keyboard
    // that slips in a space or a direction mark must not fail a correct code.
    var val = U.el("#pinBox", form).value.replace(/\D/g, "");
    if (!c || !global.Store.checkSecret(c.pin, val)) {
      U.toast(t("auth.badPin"), "bad");
      return;
    }
    U.closeModal();
    enterAsChild(c);
  });

  function enterAsChild(c) {
    loginError = "";
    global.Store.setSession("child", c.id);
    global.App.applyUserLang();
    global.App.go({ screen: "child", tab: "me" });
    U.toast(t("auth.welcomeBack", { name: global.Store.nameOf(c) }), "good");
  }

  global.Setup = { render: render, renderLogin: renderLogin, reset: reset };
})(window);
