/* Keeping one family on several devices.

   The server holds a single document per family and hands out a revision
   number with it. A device may only write onto the revision it started from;
   if it is behind, the server refuses and returns what it has, the device
   merges the two and tries again. Nothing is ever overwritten blind.

   The merge is built around what a family app actually does: points, claims and
   rewards are append-only, so both sides' entries are kept. Editable things
   (tasks, rewards, children, settings) take the more recently saved side, and
   deletions are remembered as tombstones so a deleted task cannot crawl back
   from a device that still had it.

   Syncing is off until someone turns it on. Until then nothing leaves the
   device, exactly as before. */
(function (global) {
  "use strict";

  /* Point this somewhere else — before the script loads, or by editing here —
     to run the family on your own server instead. */
  var SERVER = global.FP_SYNC_SERVER || {
    url: "https://dmvpelpnboqwrrviihjo.supabase.co",
    // A publishable key. It permits nothing on its own: the table is not
    // reachable through the API, and every function demands the family's id
    // together with its secret.
    key: "sb_publishable_kcboCR6GKmQ9DsPjFfiTAw_ViFPQAVl"
  };

  var CONF_KEY = "familyPoints.sync";
  var PUSH_DELAY = 1500;      // let a burst of edits settle before sending
  var POLL_EVERY = 20000;

  var conf = null;            // {id, secret, rev, lastSyncAt}
  var state = "off";          // off | idle | syncing | offline | error
  var pushTimer = null, pollTimer = null;
  var busy = false, again = false;
  var listeners = [];

  /* ---------------- configuration ---------------- */

  function loadConf() {
    try { conf = JSON.parse(global.localStorage.getItem(CONF_KEY) || "null"); }
    catch (e) { conf = null; }
    state = conf ? "idle" : "off";
    return conf;
  }
  function saveConf() {
    try {
      if (conf) global.localStorage.setItem(CONF_KEY, JSON.stringify(conf));
      else global.localStorage.removeItem(CONF_KEY);
    } catch (e) {}
  }
  function connected() { return !!(conf && conf.id && conf.secret); }
  function status() {
    return { state: state, connected: connected(), lastSyncAt: conf && conf.lastSyncAt };
  }
  function onChange(fn) { listeners.push(fn); }
  function announce() { listeners.forEach(function (fn) { try { fn(status()); } catch (e) {} }); }
  function setState(s) { if (state !== s) { state = s; announce(); } }

  /* ---------------- talking to the server ---------------- */

  function rpc(name, params) {
    return global.fetch(SERVER.url + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        "apikey": SERVER.key,
        "Authorization": "Bearer " + SERVER.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params)
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) {}
        if (!res.ok) {
          var err = new Error((body && body.message) || ("http_" + res.status));
          err.code = (body && body.message) || String(res.status);
          throw err;
        }
        return Array.isArray(body) ? body[0] : body;
      });
    });
  }

  /* ---------------- merging two versions of a family ---------------- */

  function tombstones(a, b) {
    var out = {};
    [a && a.deleted, b && b.deleted].forEach(function (map) {
      if (map) Object.keys(map).forEach(function (id) { out[id] = map[id]; });
    });
    return out;
  }

  /* First list wins on ids present in both; anything deleted anywhere is left
     out. Order follows the first list, with the second's extras appended. */
  function unionById(first, second, gone) {
    var out = [], seen = {};
    (first || []).concat(second || []).forEach(function (item) {
      if (!item || !item.id || seen[item.id] || gone[item.id]) return;
      seen[item.id] = true;
      out.push(item);
    });
    return out;
  }

  /* A claim that has been decided beats the same claim still pending, whichever
     side it came from — an approval must never be undone by a stale copy. */
  function mergeClaims(a, b, gone) {
    var by = {}, order = [];
    (a || []).concat(b || []).forEach(function (c) {
      if (!c || !c.id || gone[c.id]) return;
      var held = by[c.id];
      if (!held) { by[c.id] = c; order.push(c.id); return; }
      if (held.status === "pending" && c.status !== "pending") by[c.id] = c;
    });
    return order.map(function (id) { return by[id]; });
  }

  /* Children are edited in place, but the lists they carry are written to from
     any device, so those are unioned rather than taken from one side. */
  function mergeChildren(base, other, gone) {
    var others = {};
    (other || []).forEach(function (c) { others[c.id] = c; });
    return unionById(base, other, gone).map(function (c) {
      var twin = others[c.id];
      if (!twin || twin === c) return c;
      var merged = JSON.parse(JSON.stringify(c));
      ["notes", "gifts", "outings"].forEach(function (field) {
        merged[field] = unionById(c[field], twin[field], gone);
      });
      return merged;
    });
  }

  /* The more recently saved side is the base for everything that is edited in
     place; the append-only collections then take entries from both. */
  function merge(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    var base = (local.savedAt || "") >= (remote.savedAt || "") ? local : remote;
    var other = base === local ? remote : local;
    var gone = tombstones(local, remote);

    var out = JSON.parse(JSON.stringify(base));
    out.deleted = gone;
    out.parents = unionById(base.parents, other.parents, gone);
    out.children = mergeChildren(base.children, other.children, gone);
    out.categories = unionById(base.categories, other.categories, gone);
    out.tasks = unionById(base.tasks, other.tasks, gone);
    out.rewards = unionById(base.rewards, other.rewards, gone);
    out.claims = mergeClaims(local.claims, remote.claims, gone);
    out.movieNights = unionById(base.movieNights, other.movieNights, gone);
    out.redemptions = unionById(base.redemptions, other.redemptions, gone);
    /* The money ledger merges exactly like the points one: append-only, keyed
       by id, so two phones banking at once end up with both rows and neither
       overwrites the other. Deposits carry mutable status, so the later write
       wins there, as it does for children. */
    out.money = unionById(local.money, remote.money, gone);
    out.deposits = unionById(base.deposits, other.deposits, gone);

    out.ledger = unionById(local.ledger, remote.ledger, gone).filter(function (l) {
      return !l.childId || !gone[l.childId];
    }).sort(function (x, y) { return x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : 0; });

    return out;
  }

  /* ---------------- the sync itself ---------------- */

  function docNow() { return global.Store.get(); }

  /* One round: push what we have; if the server has moved on, merge its
     version in and push again. Three attempts is plenty for a family. */
  function sync(attempt) {
    if (!connected()) return Promise.resolve(false);
    attempt = attempt || 1;
    setState("syncing");

    var mine = docNow();
    return rpc("fp_push", {
      p_id: conf.id, p_secret: conf.secret,
      p_doc: mine, p_base_rev: conf.rev || 0
    }).then(function (res) {
      if (!res) throw new Error("empty_response");
      if (res.ok) {
        conf.rev = res.rev;
        conf.lastSyncAt = new Date().toISOString();
        saveConf();
        setState("idle");
        return true;
      }
      // Behind: fold the server's version into ours and try once more.
      var merged = merge(mine, res.doc);
      conf.rev = res.rev;
      saveConf();
      global.Store.replace(merged);
      if (global.App && global.App.refresh) global.App.refresh();
      if (attempt >= 3) { setState("error"); return false; }
      return sync(attempt + 1);
    }).catch(function (err) {
      setState(err && err.code === "no_such_family" ? "error" : "offline");
      return false;
    });
  }

  /* Pull on its own, for when this device has been sitting idle. */
  function refresh() {
    if (!connected()) return Promise.resolve(false);
    setState("syncing");
    return rpc("fp_pull", { p_id: conf.id, p_secret: conf.secret })
      .then(function (res) {
        if (!res) throw new Error("empty_response");
        var mine = docNow();
        var merged = merge(mine, res.doc);
        var changed = JSON.stringify(merged) !== JSON.stringify(mine);
        conf.rev = res.rev;
        conf.lastSyncAt = new Date().toISOString();
        saveConf();
        if (changed) {
          global.Store.replace(merged);
          if (global.App && global.App.refresh) global.App.refresh();
        }
        setState("idle");
        // Our side may hold entries the server has not seen.
        if (JSON.stringify(merged) !== JSON.stringify(res.doc)) return sync();
        return changed;
      })
      .catch(function (err) {
        setState(err && err.code === "no_such_family" ? "error" : "offline");
        return false;
      });
  }

  /* One round at a time. A round that arrives while another is in flight is
     remembered and run afterwards — but only if the server is actually
     reachable, otherwise a device with no signal would spin instead of waiting
     for the next poll. */
  function run(fn) {
    if (busy) { again = true; return Promise.resolve(false); }
    busy = true;
    return fn().then(function (r) {
      busy = false;
      var reachable = state !== "offline" && state !== "error";
      if (again) { again = false; if (reachable) run(fn); }
      return r;
    }, function () { busy = false; again = false; return false; });
  }

  function schedulePush() {
    if (!connected()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { run(function () { return sync(); }); }, PUSH_DELAY);
  }

  /* A poll that lands mid-edit would yank the ground from under a dialog, so
     it waits for the dialog to close. */
  function pollNow() {
    var modal = global.document && global.document.getElementById("modal");
    if (modal && modal.classList.contains("open")) return;
    run(refresh);
  }

  function startTimers() {
    clearInterval(pollTimer);
    if (!connected()) return;
    pollTimer = setInterval(pollNow, POLL_EVERY);
  }

  /* ---------------- turning it on ---------------- */

  function makeSecret() {
    var alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
    var out = "";
    var bytes = new Uint8Array(24);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(bytes);
    else for (var j = 0; j < bytes.length; j++) bytes[j] = Math.floor(Math.random() * 256);
    for (var i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function connect() {
    var secret = makeSecret();
    return rpc("fp_create", { p_secret: secret, p_doc: docNow() })
      .then(function (res) {
        conf = { id: res.id, secret: secret, rev: res.rev, lastSyncAt: new Date().toISOString() };
        saveConf();
        setState("idle");
        startTimers();
        return invite();
      });
  }

  function invite() {
    if (!connected()) return "";
    var base = global.location.href.split("#")[0];
    return base + "#join=" + conf.id + "." + conf.secret;
  }

  function parseInvite(text) {
    var raw = String(text || "").trim();
    var at = raw.indexOf("#join=");
    if (at !== -1) raw = raw.slice(at + 6);
    var dot = raw.indexOf(".");
    if (dot < 1) return null;
    var id = raw.slice(0, dot).trim(), secret = raw.slice(dot + 1).trim();
    if (!/^[0-9a-f-]{36}$/i.test(id) || secret.length < 12) return null;
    return { id: id, secret: secret };
  }

  /* Joining replaces what is on this device, so the caller confirms first. */
  function join(text) {
    var parsed = parseInvite(text);
    if (!parsed) return Promise.reject(new Error("bad_invite"));
    return rpc("fp_pull", { p_id: parsed.id, p_secret: parsed.secret })
      .then(function (res) {
        if (!res || !res.doc) throw new Error("bad_invite");
        conf = { id: parsed.id, secret: parsed.secret, rev: res.rev, lastSyncAt: new Date().toISOString() };
        saveConf();
        global.Store.replace(res.doc);
        setState("idle");
        startTimers();
        return res.doc;
      });
  }

  function peek(text) {
    var parsed = parseInvite(text);
    if (!parsed) return Promise.reject(new Error("bad_invite"));
    return rpc("fp_pull", { p_id: parsed.id, p_secret: parsed.secret });
  }

  function disconnect() {
    conf = null;
    saveConf();
    clearInterval(pollTimer);
    clearTimeout(pushTimer);
    setState("off");
  }

  /* ---------------- wiring ---------------- */

  function start() {
    loadConf();
    global.Store.onSave(schedulePush);
    startTimers();
    if (connected()) run(refresh);
    if (global.document) {
      global.document.addEventListener("visibilitychange", function () {
        if (!global.document.hidden) pollNow();
      });
      global.addEventListener("online", pollNow);
    }
  }

  global.Sync = {
    start: start, connect: connect, join: join, peek: peek, disconnect: disconnect,
    invite: invite, parseInvite: parseInvite, status: status, onChange: onChange,
    syncNow: function () { return run(refresh); },
    merge: merge, connected: connected
  };
})(window);
