/* Family Points — data model.
   Everything lives in one localStorage record. Balances are never stored:
   they are replayed from the ledger, so a wrong award can be traced and
   corrected instead of silently drifting. */
(function (global) {
  "use strict";

  var KEY = "familyPoints.v1";
  var SESSION_KEY = "familyPoints.session";
  var START_POINTS = 500;
  var HASH_ROUNDS = 15000;

  var state = null;

  /* ---------------- small helpers ---------------- */

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }
  function now() { return new Date().toISOString(); }
  function dayKey(d) {
    var x = d ? new Date(d) : new Date();
    return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function salt() {
    var s = "";
    for (var i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function hash(secret, saltValue) {
    var h = global.SHA256(saltValue + "|" + secret);
    for (var i = 0; i < HASH_ROUNDS; i++) h = global.SHA256(h + saltValue);
    return h;
  }
  function makeSecret(secret) {
    var s = salt();
    return { salt: s, hash: hash(secret, s), algo: "sha256x" + HASH_ROUNDS };
  }
  function checkSecret(record, secret) {
    if (!record || !record.salt) return false;
    return hash(secret, record.salt) === record.hash;
  }

  /* ---------------- defaults ---------------- */

  function defaultCategories() {
    return [
      { id: "cat_cleaning", key: "cat.cleaning", icon: "🧽" },
      { id: "cat_tidy", key: "cat.tidy", icon: "🧺" },
      { id: "cat_school", key: "cat.school", icon: "📚" },
      { id: "cat_play", key: "cat.play", icon: "🎲" },
      { id: "cat_dutch", key: "cat.dutch", icon: "🇳🇱" },
      { id: "cat_other", key: "cat.other", icon: "⭐" }
    ];
  }

  /* onDone / onMiss are the point changes themselves, so a task can reward,
     punish, or stay neutral (0 on done, negative on miss) with one shape. */
  function defaultTasks() {
    var t = [
      ["seed.makeBed",     "cat_tidy",     "personal", 10,  -5,   0,  0, "daily"],
      ["seed.tidyRoom",    "cat_tidy",     "personal", 15, -10,   0,  0, "weekly"],
      ["seed.laundry",     "cat_tidy",     "personal",  0,  -5,   0,  0, "daily"],
      ["seed.brushTeeth",  "cat_tidy",     "personal",  0, -10,   0,  0, "daily"],
      ["seed.clearTable",  "cat_cleaning", "both",     15,  -5,  10,  0, "daily"],
      ["seed.helpCook",    "cat_cleaning", "both",     20,   0,  10,  0, "weekly"],
      ["seed.homework",    "cat_school",   "personal", 20, -20,   0,  0, "daily"],
      ["seed.read20",      "cat_school",   "personal", 15,   0,   0,  0, "daily"],
      ["seed.dutch15",     "cat_dutch",    "both",     25,   0,  10,  0, "daily"],
      ["seed.familyGame",  "cat_play",     "both",     10,   0,  10,  0, "weekly"]
    ];
    return t.map(function (r) {
      return {
        id: uid("task"),
        titleKey: r[0],
        title: "",
        categoryId: r[1],
        scope: r[2],
        onDoneSelf: r[3],
        onMissSelf: r[4],
        onDoneGroup: r[5],
        onMissGroup: r[6],
        repeat: r[7],
        assign: "all",
        assignIds: [],
        active: true
      };
    });
  }

  /* Starting points for the family to edit — a reward list is personal, so
     these are examples that can be renamed, repriced or deleted outright. */
  function defaultRewards() {
    var seeds = [
      ["reward.screen",    "🎮", "child",  150],
      ["reward.treat",     "🍦", "child",  100],
      ["reward.latenight", "🌙", "child",  200],
      ["reward.dinner",    "🍽️", "child",  250],
      ["reward.friend",    "🧑‍🤝‍🧑", "child",  400],
      ["reward.present",   "🎁", "child",  500],
      ["reward.pizza",     "🍕", "family", 400],
      ["reward.cinema",    "🎬", "family", 800],
      ["reward.outing",    "🎡", "family", 1000]
    ];
    return seeds.map(function (r) {
      return {
        id: uid("rw"), titleKey: r[0], title: "", icon: r[1],
        kind: r[2], cost: r[3], assign: "all", assignIds: [], active: true
      };
    });
  }

  function emptyState(lang) {
    return {
      version: 1,
      createdAt: now(),
      settings: {
        familyName: "",
        lang: lang || "en",
        startPoints: START_POINTS,
        groupGoal: 1000,
        weekStart: 0,
        movieDay: 6,
        translate: true,
        /* the bank */
        currency: "EUR",
        pointsPerUnit: 0,          /* 0 = points cannot be turned into money */
        depositTypes: []
      },
      parents: [],
      children: [],
      categories: defaultCategories(),
      tasks: [],
      rewards: [],
      ledger: [],
      claims: [],
      movieNights: [],
      redemptions: [],
      money: [],
      deposits: [],
      deleted: {},
      savedAt: now()
    };
  }

  /* ---------------- persistence ---------------- */

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : null;
    } catch (e) { state = null; }
    if (state) migrate(state);
    return state;
  }
  var saveHooks = [];
  function onSave(fn) { saveHooks.push(fn); }

  function save() {
    state.savedAt = now();
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* quota or private mode — the UI stays usable for this session */ }
    saveHooks.forEach(function (fn) { try { fn(state); } catch (e) {} });
    return state;
  }

  /* Deleting has to be remembered, not just done: another device still holds
     the thing, and without a record of the deletion a merge would bring it
     back. The id is enough — what it pointed at is already gone. */
  function forget(id) {
    if (!id) return;
    if (!state.deleted) state.deleted = {};
    state.deleted[id] = now();
  }
  function migrate(s) {
    if (!s.claims) s.claims = [];
    if (!s.movieNights) s.movieNights = [];
    if (!s.rewards) s.rewards = defaultRewards();
    if (!s.redemptions) s.redemptions = [];
    if (!s.deleted) s.deleted = {};
    if (!s.savedAt) s.savedAt = s.createdAt || now();
    s.claims.forEach(function (c) { if (!c.kind) c.kind = "task"; });
    /* Family outings used to be the only reward, driven by one goal number.
       They become entries in the rewards catalogue so they can be edited. */
    if (s.outings) {
      s.outings.forEach(function (o) {
        s.redemptions.push({
          id: o.id, ts: o.ts, date: o.date, kind: "family", rewardId: null,
          title: o.label, cost: o.spent, childId: o.chooserId, by: o.by, note: o.note || "",
          srcLang: o.srcLang, tr: o.tr
        });
      });
      delete s.outings;
    }
    if (!s.money) s.money = [];
    if (!s.deposits) s.deposits = [];
    if (s.settings) {
      if (!s.settings.currency) s.settings.currency = "EUR";
      if (s.settings.pointsPerUnit === undefined) s.settings.pointsPerUnit = 0;
      if (!s.settings.depositTypes) s.settings.depositTypes = [];
    }
    if (!s.categories || !s.categories.length) s.categories = defaultCategories();
    if (s.settings && s.settings.movieDay === undefined) s.settings.movieDay = 6;
    if (s.settings && s.settings.weekStart === undefined) s.settings.weekStart = 0;
    if (s.settings && s.settings.translate === undefined) s.settings.translate = true;
    var fallback = (s.settings && s.settings.lang) || "en";
    (s.parents || []).concat(s.children || []).forEach(function (u) {
      if (!u.lang) u.lang = fallback;
    });
  }

  function setUserLang(kind, id, lang) {
    var user = kind === "parent" ? parent(id) : child(id);
    if (!user) return null;
    user.lang = lang;
    save();
    return user;
  }
  function exists() { return !!state; }
  function get() { return state; }
  function replace(next) {
    state = next; migrate(state); save(); return state;
  }
  function wipe() {
    try {
      global.localStorage.removeItem(KEY);
      global.localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    state = null;
  }

  /* ---------------- setup ---------------- */

  function createFamily(opts) {
    state = emptyState(opts.lang);
    state.settings.familyName = opts.familyName || "";
    state.settings.familyNames = opts.familyNames || {};
    if (opts.startPoints) state.settings.startPoints = opts.startPoints;

    var parent = addParentRecord(opts.parent.name, opts.parent.username, opts.parent.password,
                                 opts.parent.avatar, state.settings.lang);
    if (opts.parent.names) parent.names = opts.parent.names;
    (opts.children || []).forEach(function (c) { addChild(c, parent.id); });
    if (opts.seedTasks !== false) {
      state.tasks = defaultTasks();
      state.rewards = defaultRewards();
      state.settings.depositTypes = defaultDepositTypes();
    }
    save();
    return state;
  }

  function addParentRecord(name, username, password, avatar, lang) {
    var p = {
      id: uid("par"),
      name: name,
      username: String(username || "").trim().toLowerCase(),
      avatar: avatar || "p1",
      names: {},
      lang: lang || authorLang(),
      secret: makeSecret(password),
      createdAt: now()
    };
    state.parents.push(p);
    return p;
  }
  function addParent(name, username, password, avatar) {
    if (findParent(username)) return null;
    var p = addParentRecord(name, username, password, avatar);
    save();
    return p;
  }
  function findParent(username) {
    var u = String(username || "").trim().toLowerCase();
    return state.parents.filter(function (p) { return p.username === u; })[0] || null;
  }
  function removeParent(id) {
    if (state.parents.length <= 1) return false;
    forget(id);
    state.parents = state.parents.filter(function (p) { return p.id !== id; });
    save();
    return true;
  }
  /* Editing a parent. A username has to stay unique, so a clash is reported
     rather than quietly overwriting whoever holds it. */
  function updateParent(id, patch) {
    var p = parent(id);
    if (!p) return null;
    if (patch.username !== undefined) {
      var wanted = String(patch.username || "").trim().toLowerCase();
      if (!wanted) return null;
      var holder = findParent(wanted);
      if (holder && holder.id !== id) return false;
      patch.username = wanted;
    }
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    save();
    return p;
  }

  function setParentPassword(id, password) {
    var p = byId(state.parents, id);
    if (!p) return false;
    p.secret = makeSecret(password);
    save();
    return true;
  }

  function addChild(data, byParentId) {
    var c = {
      id: uid("kid"),
      name: data.name,
      avatar: data.avatar || "k1",
      color: data.color || "",
      names: data.names || {},
      lang: data.lang || state.settings.lang,
      birthday: data.birthday || "",
      pin: data.pin ? makeSecret(String(data.pin)) : null,
      notes: [],
      gifts: [],
      outings: [],
      createdAt: now()
    };
    state.children.push(c);
    state.ledger.push({
      id: uid("led"), ts: now(), childId: c.id, kind: "start",
      self: state.settings.startPoints, group: 0, note: "", by: byParentId || null
    });
    save();
    return c;
  }
  function removeChild(id) {
    forget(id);
    (child(id) || { notes: [] }).notes.concat((child(id) || {}).gifts || [], (child(id) || {}).outings || [])
      .forEach(function (i) { forget(i.id); });
    state.ledger.forEach(function (l) { if (l.childId === id) forget(l.id); });
    state.children = state.children.filter(function (c) { return c.id !== id; });
    state.ledger = state.ledger.filter(function (l) { return l.childId !== id; });
    state.claims = state.claims.filter(function (c) { return c.childId !== id; });
    save();
  }
  function updateChild(id, patch) {
    var c = byId(state.children, id);
    if (!c) return null;
    Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
    save();
    return c;
  }
  function setChildPin(id, pin) {
    var c = byId(state.children, id);
    if (!c) return;
    c.pin = pin ? makeSecret(String(pin)) : null;
    save();
  }

  /* The language a piece of text was written in, so a reader in another
     language can be shown a translation of it. */
  function authorLang() {
    return global.I18N ? global.I18N.lang : "en";
  }
  function stamp(owner, field) {
    owner.srcLang = authorLang();
    if (global.Translate && global.Translate.detect) {
      global.Translate.detect(owner[field], owner.srcLang, function (lang) {
        if (lang && lang !== owner.srcLang) { owner.srcLang = lang; save(); }
      });
    }
    return owner;
  }

  /* Names of people and of the family are never translated — a person's name
     is not a phrase. What a family can do instead is write the name once per
     language, so "משפחת כהן" and "Familie Cohen" are the same family seen from
     two languages. `name` is the fallback for a language nobody filled in. */
  function pickName(names, fallback) {
    var lang = global.I18N ? global.I18N.lang : "en";
    var home = state && state.settings ? state.settings.lang : "en";
    if (!names) return fallback || "";
    // the reader's language, then the family's own, then whatever was written
    if (names[lang]) return names[lang];
    if (names[home]) return names[home];
    if (fallback) return fallback;
    var written = Object.keys(names).map(function (k) { return names[k]; }).filter(Boolean);
    return written[0] || "";
  }
  function nameOf(entity) {
    if (!entity) return "";
    return pickName(entity.names, entity.name);
  }
  function setName(entity, lang, value) {
    if (!entity) return entity;
    value = String(value || "").trim();
    if (!entity.names) entity.names = {};
    if (value) entity.names[lang] = value; else delete entity.names[lang];
    if (!entity.name) entity.name = value;
    return entity;
  }
  function familyName() {
    var set = state && state.settings;
    return set ? pickName(set.familyNames, set.familyName) : "";
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function child(id) { return byId(state.children, id); }

  /* The colour a child is known by. A parent can pick one; when nobody has,
     it is worked out from the order the children were added — which every
     device agrees on, so two phones never show the same child in two colours,
     and no stored field has to be migrated onto families that already exist.
     Colours a parent chose explicitly are taken out of the pool first, so an
     automatic one never lands on a deliberate one. */
  function childColor(c) {
    var TONES = global.AVATARS.tones;
    if (!c) return TONES[0].hex;
    var chosen = global.AVATARS.toneHex(c.color);
    if (chosen) return chosen;

    var kids = state && state.children ? state.children : [];
    var taken = kids.map(function (k) { return global.AVATARS.toneHex(k.color); })
                    .filter(function (h) { return h; });
    var pool = TONES.map(function (tone) { return tone.hex; })
                    .filter(function (h) { return taken.indexOf(h) === -1; });
    if (!pool.length) pool = TONES.map(function (tone) { return tone.hex; });

    var auto = kids.filter(function (k) { return !global.AVATARS.toneHex(k.color); })
      .slice().sort(function (a, b) {
        return String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
               String(a.id).localeCompare(String(b.id));
      });
    var i = 0;
    for (var n = 0; n < auto.length; n++) if (auto[n].id === c.id) { i = n; break; }
    return pool[i % pool.length];
  }

  function parent(id) { return byId(state.parents, id); }
  function task(id) { return byId(state.tasks, id); }
  function category(id) { return byId(state.categories, id); }

  /* ---------------- tasks ---------------- */

  function saveTask(data) {
    // A task named by a parent is translated for anyone reading in another
    // language; the built-in ones already have a key for every language.
    if (data.title && !data.titleKey) {
      var previous = data.id ? byId(state.tasks, data.id) : null;
      if (!previous || previous.title !== data.title) {
        delete data.tr;
        stamp(data, "title");
      }
    } else {
      delete data.srcLang;
      delete data.tr;
    }
    if (data.id) {
      var t = byId(state.tasks, data.id);
      if (t) {
        delete t.tr;
        Object.keys(data).forEach(function (k) { t[k] = data[k]; });
      }
    } else {
      data.id = uid("task");
      state.tasks.push(data);
    }
    save();
    return data;
  }

  function saveCategory(id, name, icon) {
    var cat = byId(state.categories, id);
    if (!cat) return null;
    if (cat.key) {                       // a built-in name becomes a custom one
      delete cat.key;
      cat.name = name;
      stamp(cat, "name");
    } else if (cat.name !== name) {
      cat.name = name;
      delete cat.tr;
      stamp(cat, "name");
    }
    cat.icon = icon;
    save();
    return cat;
  }

  function addCategory(name, icon) {
    var cat = stamp({ id: uid("cat"), name: name, icon: icon }, "name");
    state.categories.push(cat);
    save();
    return cat;
  }
  function deleteTask(id) {
    forget(id);
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    state.claims = state.claims.filter(function (c) { return c.taskId !== id; });
    save();
  }
  function tasksForChild(childId, includeInactive) {
    return state.tasks.filter(function (t) {
      if (!t.active && !includeInactive) return false;
      if (t.assign === "all") return true;
      return (t.assignIds || []).indexOf(childId) !== -1;
    });
  }

  function reward(id) { return byId(state.rewards, id); }

  function saveReward(data) {
    if (data.title && !data.titleKey) {
      var previous = data.id ? byId(state.rewards, data.id) : null;
      if (!previous || previous.title !== data.title) {
        delete data.tr;
        stamp(data, "title");
      }
    } else {
      delete data.srcLang;
      delete data.tr;
    }
    data.cost = Math.max(0, num(data.cost));
    if (data.id) {
      var r = byId(state.rewards, data.id);
      if (r) {
        delete r.tr;
        Object.keys(data).forEach(function (k) { r[k] = data[k]; });
      }
    } else {
      data.id = uid("rw");
      state.rewards.push(data);
    }
    save();
    return data;
  }
  function deleteReward(id) {
    forget(id);
    state.rewards = state.rewards.filter(function (r) { return r.id !== id; });
    state.claims = state.claims.filter(function (c) { return c.rewardId !== id; });
    save();
  }
  function rewardsFor(childId, includeInactive) {
    return state.rewards.filter(function (r) {
      if (r.kind !== "child") return false;
      if (!r.active && !includeInactive) return false;
      if (r.assign === "all") return true;
      return (r.assignIds || []).indexOf(childId) !== -1;
    });
  }
  function familyRewards(includeInactive) {
    return state.rewards.filter(function (r) {
      return r.kind === "family" && (r.active || includeInactive);
    }).sort(function (a, b) { return num(a.cost) - num(b.cost); });
  }

  /* ---------------- points ---------------- */

  function record(entry) {
    entry.id = uid("led");
    entry.ts = entry.ts || now();
    state.ledger.push(entry);
    save();
    return entry;
  }

  function awardTask(childId, taskId, outcome, byParentId) {
    var t = task(taskId);
    if (!t) return null;
    var done = outcome === "done";
    var self = 0, group = 0;
    if (t.scope === "personal" || t.scope === "both") self = done ? num(t.onDoneSelf) : num(t.onMissSelf);
    if (t.scope === "group" || t.scope === "both") group = done ? num(t.onDoneGroup) : num(t.onMissGroup);
    return record({
      childId: childId, taskId: taskId, kind: done ? "award" : "penalty",
      self: self, group: group, note: "", by: byParentId || null
    });
  }

  function adjust(childId, self, group, note, byParentId) {
    var entry = {
      childId: childId, taskId: null, kind: "manual",
      self: num(self), group: num(group), note: note || "", by: byParentId || null
    };
    if (entry.note) stamp(entry, "note");
    return record(entry);
  }

  /* Points are whole numbers everywhere — half a point would be meaningless —
     so `num` truncates on purpose. Money and interest rates are not: they need
     `dec`, and using `num` on either quietly loses the cents. */
  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function dec(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function balance(childId) {
    return state.ledger.reduce(function (sum, l) {
      return l.childId === childId ? sum + num(l.self) : sum;
    }, 0);
  }
  /* A reversal is a row of its own carrying the opposite amounts, so every
     total that simply adds the ledger up already accounts for it. Nothing else
     has to know. */
  function groupTotal() {
    return state.ledger.reduce(function (sum, l) { return sum + num(l.group); }, 0);
  }
  function earnedBetween(childId, fromTs, toTs) {
    return state.ledger.reduce(function (sum, l) {
      if (l.childId !== childId || l.kind === "start") return sum;
      if (l.ts < fromTs || l.ts > toTs) return sum;
      return sum + num(l.self);
    }, 0);
  }

  /* ---------------- weeks, birthdays ---------------- */

  function weekRange(ref) {
    var d = ref ? new Date(ref) : new Date();
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = (start.getDay() - state.settings.weekStart + 7) % 7;
    start.setDate(start.getDate() - diff);
    var end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: start, end: end, startTs: start.toISOString(), endTs: end.toISOString() };
  }

  function weekEarned(childId, ref) {
    var w = weekRange(ref);
    return earnedBetween(childId, w.startTs, w.endTs);
  }

  /* Winner of the week: most points earned since the week started.
     Ties break on the overall balance, then on name, so the result is stable. */
  function weekWinner(ref) {
    var rows = state.children.map(function (c) {
      return { child: c, earned: weekEarned(c.id, ref), balance: balance(c.id) };
    }).filter(function (r) { return r.earned > 0; });
    if (!rows.length) return null;
    rows.sort(cmpRows);
    return rows[0];
  }

  function standings() {
    return state.children.map(function (c) {
      return { child: c, balance: balance(c.id), earned: weekEarned(c.id) };
    }).sort(cmpRows);
  }

  function cmpRows(a, b) {
    if (b.earned !== a.earned) return b.earned - a.earned;
    if (b.balance !== a.balance) return b.balance - a.balance;
    return a.child.name.localeCompare(b.child.name);
  }

  function topScorer() {
    var rows = state.children.map(function (c) {
      return { child: c, balance: balance(c.id), earned: weekEarned(c.id) };
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) {
      if (b.balance !== a.balance) return b.balance - a.balance;
      return a.child.name.localeCompare(b.child.name);
    });
    return rows[0];
  }

  function birthdayInfo(c) {
    if (!c.birthday) return null;
    var parts = String(c.birthday).split("-");
    if (parts.length < 3) return null;
    var by = +parts[0], bm = +parts[1] - 1, bd = +parts[2];
    var today = new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var next = new Date(today.getFullYear(), bm, bd);
    if (next < today) next = new Date(today.getFullYear() + 1, bm, bd);
    var days = Math.round((next - today) / 86400000);
    return { date: next, days: days, turning: next.getFullYear() - by, age: today.getFullYear() - by - (next.getFullYear() > today.getFullYear() ? 0 : 1) };
  }

  /* ---------------- claims ---------------- */

  function claimTask(childId, taskId) {
    var open = state.claims.filter(function (c) {
      return c.childId === childId && c.taskId === taskId && c.status === "pending";
    })[0];
    if (open) return open;
    var claim = {
      id: uid("clm"), kind: "task", childId: childId, taskId: taskId, rewardId: null,
      ts: now(), dayKey: dayKey(), status: "pending", decidedBy: null, decidedTs: null
    };
    state.claims.push(claim);
    save();
    return claim;
  }

  function claimReward(childId, rewardId) {
    var open = state.claims.filter(function (c) {
      return c.childId === childId && c.rewardId === rewardId && c.status === "pending";
    })[0];
    if (open) return open;
    var claim = {
      id: uid("clm"), kind: "reward", childId: childId, taskId: null, rewardId: rewardId,
      ts: now(), dayKey: dayKey(), status: "pending", decidedBy: null, decidedTs: null
    };
    state.claims.push(claim);
    save();
    return claim;
  }
  function rewardClaimFor(childId, rewardId) {
    var mine = state.claims.filter(function (c) {
      return c.childId === childId && c.rewardId === rewardId &&
             (c.status === "pending" || c.dayKey === dayKey());
    });
    return mine[mine.length - 1] || null;
  }
  function pendingClaims() {
    return state.claims.filter(function (c) { return c.status === "pending"; })
      .sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
  }
  function decideClaim(claimId, approve, byParentId) {
    var c = byId(state.claims, claimId);
    if (!c || c.status !== "pending") return null;
    if (approve && c.kind === "reward") {
      // Points may have been spent since the child asked; do not go negative.
      if (!redeem(c.rewardId, c.childId, "", byParentId)) return null;
    }
    if (approve && (c.kind === "deposit" || c.kind === "withdraw")) {
      var moved = c.kind === "deposit"
        ? deposit(c.childId, c.amount, c.note, byParentId)
        : withdraw(c.childId, c.amount, c.note, byParentId);
      if (!moved) return null;          // a withdrawal the account cannot cover
      c.moneyId = moved.id;
    }
    c.status = approve ? "approved" : "rejected";
    c.decidedBy = byParentId || null;
    c.decidedTs = now();
    if (approve && c.kind !== "reward" && c.kind !== "deposit" && c.kind !== "withdraw") {
      awardTask(c.childId, c.taskId, "done", byParentId);
    }
    save();
    return c;
  }
  function claimFor(childId, taskId) {
    var today = dayKey();
    var mine = state.claims.filter(function (c) {
      return c.childId === childId && c.taskId === taskId &&
             (c.status === "pending" || c.dayKey === today);
    });
    return mine[mine.length - 1] || null;
  }

  /* ---------------- rewards ---------------- */

  /* The group bank aims at the cheapest family reward it cannot afford yet, so
     the goal moves with the catalogue instead of being one fixed number. */
  function goalProgress() {
    var total = groupTotal();
    var list = familyRewards();
    var unlocked = list.filter(function (r) { return num(r.cost) <= total; });
    var next = list.filter(function (r) { return num(r.cost) > total; })[0] || null;
    var goal = next ? num(next.cost)
             : list.length ? num(list[list.length - 1].cost)
             : num(state.settings.groupGoal) || 1000;
    return {
      total: total, goal: goal, next: next, unlocked: unlocked,
      reached: unlocked.length > 0,
      missing: Math.max(0, goal - total),
      pct: goal > 0 ? Math.max(0, Math.min(100, Math.round(total / goal * 100))) : 100
    };
  }

  /* Spending points on a reward. Family rewards come out of the group bank,
     child rewards out of that child's own balance; neither may go negative. */
  function redeem(rewardId, childId, note, byParentId) {
    var r = reward(rewardId);
    if (!r) return null;
    var cost = num(r.cost);
    var family = r.kind === "family";
    if (family && groupTotal() < cost) return null;
    if (!family && (!childId || balance(childId) < cost)) return null;

    var entry = {
      id: uid("red"), ts: now(), date: dayKey(), rewardId: r.id, kind: r.kind,
      title: r.titleKey ? "" : r.title, titleKey: r.titleKey || "",
      icon: r.icon, cost: cost, childId: childId || null, note: note || "",
      by: byParentId || null, srcLang: r.srcLang, tr: r.tr ? clone(r.tr) : undefined
    };
    if (entry.note) stamp(entry, "note");
    state.redemptions.unshift(entry);
    record({
      childId: family ? null : childId, taskId: null, kind: "reward",
      self: family ? 0 : -cost, group: family ? -cost : 0,
      note: note || "", rewardId: r.id, by: byParentId || null
    });
    save();
    return entry;
  }

  function recordMovieNight(winnerId, movie, note, byParentId) {
    var entry = {
      id: uid("mov"), ts: now(), date: dayKey(),
      winnerId: winnerId, movie: movie, note: note || "", by: byParentId || null
    };
    state.movieNights.unshift(entry);
    save();
    return entry;
  }
  function movieNightToday() {
    var today = dayKey();
    return state.movieNights.filter(function (m) { return m.date === today; })[0] || null;
  }
  function isMovieDay() {
    return new Date().getDay() === num(state.settings.movieDay);
  }

  /* ---------------- child content ---------------- */

  function addListItem(childId, field, text) {
    var c = child(childId);
    if (!c || !text) return null;
    if (!c[field]) c[field] = [];
    var item = stamp({ id: uid(field), text: text, ts: now() }, "text");
    c[field].unshift(item);
    save();
    return item;
  }
  function updateListItem(childId, field, itemId, text) {
    var c = child(childId);
    if (!c || !c[field] || !text) return null;
    var item = byId(c[field], itemId);
    if (!item || item.text === text) return item;
    item.text = text;
    item.editedAt = now();
    delete item.tr;
    stamp(item, "text");
    save();
    return item;
  }

  function removeListItem(childId, field, itemId) {
    var c = child(childId);
    if (!c || !c[field]) return;
    forget(itemId);
    c[field] = c[field].filter(function (i) { return i.id !== itemId; });
    save();
  }
  function moveListItem(childId, field, itemId, dir) {
    var c = child(childId);
    if (!c || !c[field]) return;
    var list = c[field];
    var i = list.findIndex(function (x) { return x.id === itemId; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    save();
  }


  /* ================= the Bank of Mum and Dad =================

     Real money a child has handed a parent to look after, kept in its own
     append-only ledger beside the points one. The two never mix: points are
     earned and spent inside the app, money is a record of what a parent is
     actually holding. The one bridge between them is `convert`, and it is the
     parent who sets the rate.

     Everything a child does here is a request. Approving it is what moves
     money, exactly as with chores and rewards. */

  function moneyLedger() { return (state.money = state.money || []); }
  function depositList() { return (state.deposits = state.deposits || []); }

  function currency() { return (state.settings && state.settings.currency) || "EUR"; }

  /* Money is held to the cent so a rate like 137 points to the euro cannot
     leak fractions into a balance nobody can hand over. */
  function money(v) { return Math.round(dec(v) * 100) / 100; }

  function moneyRecord(entry) {
    entry.id = entry.id || uid("mny");
    entry.ts = entry.ts || now();
    entry.amount = money(entry.amount);
    moneyLedger().push(entry);
    save();
    return entry;
  }

  /* A balance is what is on hand — money inside an open deposit is locked away
     and is reported separately, so a child can see both. */
  function cashBalance(childId) {
    return money(moneyLedger().reduce(function (sum, m) {
      return m.childId === childId && !m.void ? sum + dec(m.amount) : sum;
    }, 0));
  }
  function lockedBalance(childId) {
    return money(depositList().reduce(function (sum, d) {
      return d.childId === childId && d.status === "open" ? sum + dec(d.amount) : sum;
    }, 0));
  }
  function moneyTotal(childId) { return money(cashBalance(childId) + lockedBalance(childId)); }

  function moneyFor(childId) {
    return moneyLedger().filter(function (m) { return m.childId === childId; })
      .slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  }

  /* ---- what a parent does directly ---- */

  function deposit(childId, amount, note, byParentId) {
    var v = money(Math.abs(dec(amount)));
    if (!v) return null;
    var entry = { childId: childId, kind: "deposit", amount: v, note: note || "", by: byParentId || null };
    if (entry.note) stamp(entry, "note");
    return moneyRecord(entry);
  }

  function withdraw(childId, amount, note, byParentId) {
    var v = money(Math.abs(dec(amount)));
    if (!v) return null;
    if (v > cashBalance(childId)) return null;      // never let an account go under
    var entry = { childId: childId, kind: "withdraw", amount: -v, note: note || "", by: byParentId || null };
    if (entry.note) stamp(entry, "note");
    return moneyRecord(entry);
  }

  /* ---- points into money ----
     `pointsPerUnit` is how many points buy one euro or one shekel. Zero or
     blank means the family has not opened that door, and the button is not
     offered at all. */
  function conversionRate() { return Math.max(0, Math.round(num(state.settings.pointsPerUnit))); }
  function pointsToMoney(points) {
    var rate = conversionRate();
    return rate ? money(num(points) / rate) : 0;
  }
  function convert(childId, points, byParentId) {
    var rate = conversionRate();
    var p = Math.abs(Math.round(num(points)));
    if (!rate || !p) return null;
    if (p > balance(childId)) return null;
    var value = pointsToMoney(p);
    if (!value) return null;
    /* Two entries, one act: the points leave the points ledger and the money
       arrives in the money ledger, each carrying the other's id so the pair can
       be undone together. */
    var cash = moneyRecord({ childId: childId, kind: "convert", amount: value,
                             points: p, note: "", by: byParentId || null });
    var spent = record({ childId: childId, taskId: null, kind: "convert",
                         self: -p, group: 0, note: "", by: byParentId || null, moneyId: cash.id });
    cash.ledgerId = spent.id;
    save();
    return { cash: cash, points: spent };
  }

  /* ---- deposit products ----
     A family writes its own: a term in days, a yearly rate, and whether the
     money can be taken out before the term is up. A year at 5% with the door
     locked, or a day at 0.5% with the door always open. */
  function depositTypes() { return (state.settings.depositTypes = state.settings.depositTypes || []); }
  function depositType(id) { return byId(depositTypes(), id); }

  function saveDepositType(data) {
    var list = depositTypes();
    var existing = data.id ? byId(list, data.id) : null;
    var type = existing || { id: uid("dpt") };
    type.name = data.name || "";
    type.termDays = Math.max(1, Math.round(num(data.termDays)) || 1);
    type.ratePct = Math.max(0, dec(data.ratePct));
    type.earlyExit = !!data.earlyExit;
    type.active = data.active !== false;
    if (type.name) stamp(type, "name");
    if (!existing) list.push(type);
    save();
    return type;
  }
  function deleteDepositType(id) {
    forget(id);
    state.settings.depositTypes = depositTypes().filter(function (d) { return d.id !== id; });
    save();
  }

  function defaultDepositTypes() {
    /* Named by key so each reads in the family's own language until a parent
       renames one. Rates rise with the term, which is the whole lesson. */
    return [
      { id: uid("dpt"), nameKey: "bank.type.daily",   name: "", termDays: 1,   ratePct: 0.5, earlyExit: true,  active: true },
      { id: uid("dpt"), nameKey: "bank.type.month",   name: "", termDays: 30,  ratePct: 2,   earlyExit: true,  active: true },
      { id: uid("dpt"), nameKey: "bank.type.quarter", name: "", termDays: 90,  ratePct: 4,   earlyExit: false, active: true },
      { id: uid("dpt"), nameKey: "bank.type.year",    name: "", termDays: 365, ratePct: 8,   earlyExit: false, active: true }
    ];
  }

  /* ---- deposits ---- */

  function deposits(childId) {
    return depositList().filter(function (d) { return !childId || d.childId === childId; })
      .slice().sort(function (a, b) { return a.openedTs < b.openedTs ? 1 : -1; });
  }
  function depositById(id) { return byId(depositList(), id); }

  function openDeposit(childId, typeId, amount, byParentId) {
    var type = depositType(typeId);
    var v = money(Math.abs(dec(amount)));
    if (!type || !v || v > cashBalance(childId)) return null;
    var opened = now();
    var d = {
      id: uid("dep"), childId: childId, typeId: type.id,
      /* The terms are copied onto the deposit, not looked up later: changing a
         product must never rewrite an agreement already made with a child. */
      termDays: type.termDays, ratePct: type.ratePct, earlyExit: !!type.earlyExit,
      amount: v, openedTs: opened,
      maturesTs: new Date(new Date(opened).getTime() + type.termDays * 86400000).toISOString(),
      status: "open", closedTs: null, interestPaid: 0, by: byParentId || null
    };
    depositList().push(d);
    moneyRecord({ childId: childId, kind: "lock", amount: -v, note: "", by: byParentId || null, depositId: d.id });
    return d;
  }

  function matured(d, at) {
    return new Date(at || now()).getTime() >= new Date(d.maturesTs).getTime();
  }
  function daysHeld(d, at) {
    var ms = new Date(at || now()).getTime() - new Date(d.openedTs).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }
  /* A yearly rate, paid for the days the money actually sat there. Simple, not
     compound: a child can check it with a calculator, which matters more here
     than being a real bank. */
  function interestOn(d, at) {
    return money(dec(d.amount) * (dec(d.ratePct) / 100) * (daysHeld(d, at) / 365));
  }

  function closeDeposit(id, byParentId) {
    var d = depositById(id);
    if (!d || d.status !== "open") return null;
    var full = matured(d);
    if (!full && !d.earlyExit) return null;          // the door is locked until the term is up
    var at = now();
    /* Breaking a term early returns the money but not the reward for waiting. */
    var gain = full ? interestOn(d, d.maturesTs) : 0;
    d.status = full ? "matured" : "broken";
    d.closedTs = at;
    d.interestPaid = gain;
    moneyRecord({ childId: d.childId, kind: "unlock", amount: dec(d.amount), ts: at,
                  note: "", by: byParentId || null, depositId: d.id });
    if (gain) {
      /* A fixed id, derived from the deposit, so two phones closing the same
         deposit write the same row and the merge keeps one, not two. */
      moneyRecord({ id: "int_" + d.id, childId: d.childId, kind: "interest", amount: gain,
                    ts: at, note: "", by: byParentId || null, depositId: d.id });
    }
    save();
    return d;
  }

  /* Deposits that have come to term pay out on their own the next time anybody
     opens the app. The ids are derived from the deposit, so it does not matter
     which device gets there first. */
  function settleMatured() {
    var moved = 0;
    depositList().forEach(function (d) {
      if (d.status === "open" && matured(d)) { if (closeDeposit(d.id, d.by)) moved++; }
    });
    return moved;
  }

  /* ---- what a child asks for ---- */

  function requestMoney(childId, kind, amount, note) {
    var v = money(Math.abs(dec(amount)));
    if (!v || (kind !== "deposit" && kind !== "withdraw")) return null;
    var claim = {
      id: uid("clm"), kind: kind, childId: childId, taskId: null, rewardId: null,
      amount: v, note: note || "", ts: now(), dayKey: dayKey(),
      status: "pending", decidedBy: null, decidedTs: null
    };
    if (claim.note) stamp(claim, "note");
    state.claims.push(claim);
    save();
    return claim;
  }
  function moneyRequests(childId) {
    return state.claims.filter(function (c) {
      return (c.kind === "deposit" || c.kind === "withdraw") &&
             (!childId || c.childId === childId);
    }).slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  }

  /* ---- undoing something ----
     Nothing is ever deleted. A reversal is its own row, pointing back at the
     one it cancels, and the original is marked rather than removed — on real
     money especially, a child has to be able to see that a deposit was taken
     back, when, and by whom. */
  function reverseEntry(entryId, byParentId) {
    var led = byId(state.ledger, entryId);
    if (led) return reversePoints(led, byParentId);
    var mny = byId(moneyLedger(), entryId);
    if (mny) return reverseMoney(mny, byParentId);
    return null;
  }
  function reversePoints(led, byParentId) {
    if (led.void || led.reversedBy || led.kind === "start") return null;
    var back = record({
      childId: led.childId, taskId: led.taskId || null, kind: "reversal",
      self: -num(led.self), group: -num(led.group), note: "",
      by: byParentId || null, reverses: led.id
    });
    led.reversedBy = back.id;
    /* A conversion is one act in two ledgers; undoing it has to undo both. */
    if (led.moneyId) {
      var cash = byId(moneyLedger(), led.moneyId);
      if (cash && !cash.reversedBy) {
        var pair = moneyRecord({ childId: cash.childId, kind: "reversal", amount: -dec(cash.amount),
                                 note: "", by: byParentId || null, reverses: cash.id });
        cash.reversedBy = pair.id;
      }
    }
    save();
    return back;
  }
  function reverseMoney(mny, byParentId) {
    if (mny.reversedBy || mny.kind === "lock" || mny.kind === "unlock") return null;
    var back = moneyRecord({ childId: mny.childId, kind: "reversal", amount: -dec(mny.amount),
                             note: "", by: byParentId || null, reverses: mny.id });
    mny.reversedBy = back.id;
    if (mny.ledgerId) {
      var pts = byId(state.ledger, mny.ledgerId);
      if (pts && !pts.reversedBy) {
        var pair = record({ childId: pts.childId, taskId: null, kind: "reversal",
                            self: -num(pts.self), group: -num(pts.group), note: "",
                            by: byParentId || null, reverses: pts.id });
        pts.reversedBy = pair.id;
      }
    }
    save();
    return back;
  }
  function canReverse(entry) {
    if (!entry || entry.reversedBy || entry.kind === "reversal") return false;
    return entry.kind !== "start" && entry.kind !== "lock" && entry.kind !== "unlock";
  }

  /* ---- what one child is saving for ----
     A reward to aim at, and a line in their own words about why. The reward is
     held by id, so renaming or repricing it moves the goal with it. */
  /* Free text a child writes about their saving is translated for whoever
     reads it, like every other line the family types. */
  function setSavingsNote(childId, text) {
    var c = child(childId);
    if (!c) return null;
    c.savingsNote = text || "";
    if (c.savingsNote) stamp(c, "savingsNote"); else { delete c.srcLang; delete c.tr; }
    save();
    return c;
  }

  function setGoal(childId, rewardId) {
    var c = child(childId);
    if (!c) return null;
    c.goalRewardId = rewardId || "";
    save();
    return c;
  }
  function childGoal(childId) {
    var c = child(childId);
    if (!c || !c.goalRewardId) return null;
    var r = reward(c.goalRewardId);
    if (!r) return null;
    var have = balance(childId), cost = num(r.cost);
    return {
      reward: r, cost: cost, have: have,
      missing: Math.max(0, cost - have),
      pct: cost > 0 ? Math.min(100, Math.round((have / cost) * 100)) : 100,
      reached: have >= cost
    };
  }

  /* ---------------- session ---------------- */

  function setSession(kind, id) {
    try { global.localStorage.setItem(SESSION_KEY, JSON.stringify({ kind: kind, id: id, ts: now() })); } catch (e) {}
  }
  function getSession() {
    try { return JSON.parse(global.localStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }
  function clearSession() {
    try { global.localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  global.Store = {
    KEY: KEY, START_POINTS: START_POINTS,
    load: load, save: save, get: get, exists: exists, replace: replace, wipe: wipe,
    onSave: onSave, forget: forget,
    createFamily: createFamily, emptyState: emptyState, defaultTasks: defaultTasks,
    addParent: addParent, findParent: findParent, removeParent: removeParent,
    setParentPassword: setParentPassword, updateParent: updateParent, parent: parent,
    addChild: addChild, removeChild: removeChild, updateChild: updateChild,
    setUserLang: setUserLang, addCategory: addCategory, authorLang: authorLang,
    setChildPin: setChildPin, child: child, childColor: childColor,
    saveTask: saveTask, deleteTask: deleteTask, tasksForChild: tasksForChild, task: task,
    saveReward: saveReward, deleteReward: deleteReward, reward: reward,
    rewardsFor: rewardsFor, familyRewards: familyRewards, defaultRewards: defaultRewards,
    category: category, saveCategory: saveCategory,
    awardTask: awardTask, adjust: adjust, record: record,
    balance: balance, groupTotal: groupTotal, weekEarned: weekEarned, weekRange: weekRange,
    weekWinner: weekWinner, standings: standings, topScorer: topScorer,
    birthdayInfo: birthdayInfo,
    claimTask: claimTask, pendingClaims: pendingClaims, decideClaim: decideClaim, claimFor: claimFor,
    claimReward: claimReward, rewardClaimFor: rewardClaimFor,
    goalProgress: goalProgress, redeem: redeem,
    recordMovieNight: recordMovieNight, movieNightToday: movieNightToday, isMovieDay: isMovieDay,
    addListItem: addListItem, updateListItem: updateListItem,
    removeListItem: removeListItem, moveListItem: moveListItem,
    setSession: setSession, getSession: getSession, clearSession: clearSession,
    checkSecret: checkSecret, makeSecret: makeSecret,
    nameOf: nameOf, setName: setName, familyName: familyName,
    uid: uid, now: now, dayKey: dayKey, clone: clone, num: num, dec: dec,

    /* the bank */
    currency: currency, money: money, moneyFor: moneyFor,
    cashBalance: cashBalance, lockedBalance: lockedBalance, moneyTotal: moneyTotal,
    deposit: deposit, withdraw: withdraw,
    conversionRate: conversionRate, pointsToMoney: pointsToMoney, convert: convert,
    depositTypes: depositTypes, depositType: depositType, saveDepositType: saveDepositType,
    deleteDepositType: deleteDepositType, defaultDepositTypes: defaultDepositTypes,
    deposits: deposits, depositById: depositById, openDeposit: openDeposit,
    closeDeposit: closeDeposit, settleMatured: settleMatured,
    matured: matured, daysHeld: daysHeld, interestOn: interestOn,
    requestMoney: requestMoney, moneyRequests: moneyRequests,
    reverseEntry: reverseEntry, canReverse: canReverse,
    setGoal: setGoal, childGoal: childGoal, setSavingsNote: setSavingsNote
  };
})(window);
