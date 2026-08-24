/* Simultaneous translation of whatever the family writes.
   Everyone reads in their own language, so a note written in Hebrew shows up in
   Dutch for the parent who chose Dutch.

   The translation runs inside the browser (Chrome's on-device Translator API),
   never through a server: a child's notebook should not leave the house to be
   readable. When the browser cannot do it, text is shown exactly as written and
   tagged with the language it came from — it is never silently dropped.

   Results are cached on the record itself (`tr`), so a translated note renders
   instantly on every later visit and keeps working offline. */
(function (global) {
  "use strict";

  var SESSION_WAIT = 12000;   // how long a render waits for a language pack
  var TRANSLATE_WAIT = 20000;

  var sessions = {};     // "he>nl" -> translator instance
  var creating = {};     // "he>nl" -> in-flight create promise
  var broken = {};       // "he>nl" -> true, this pair is not available here
  var inflight = {};     // "<record id>|nl" -> true, avoid queueing twice
  var state = "idle";    // idle | working | ready | needs-download | unsupported
  var refreshTimer = null;
  var detector = null;

  function langs() { return global.I18N.langs.map(function (l) { return l.code; }); }

  /* Chrome ships this as the global `Translator`; the origin-trial builds put the
     same thing under `ai.translator`, so both shapes are accepted. */
  function engine() {
    if (global.Translator && typeof global.Translator.create === "function") {
      return {
        create: function (o) { return global.Translator.create(o); },
        availability: function (o) {
          return typeof global.Translator.availability === "function"
            ? global.Translator.availability(o) : Promise.resolve("available");
        }
      };
    }
    var legacy = global.ai && global.ai.translator;
    if (legacy && typeof legacy.create === "function") {
      return {
        create: function (o) { return legacy.create(o); },
        availability: function () { return Promise.resolve("available"); }
      };
    }
    return null;
  }

  function supported() { return !!engine(); }
  function enabled() {
    var s = global.Store.exists() ? global.Store.get() : null;
    return !!s && s.settings.translate !== false;
  }

  function key(from, to) { return from + ">" + to; }

  /* Waits for a promise, but not forever. A language pack that is still
     downloading must not hold a note hostage: the caller shows the original
     now and picks the translation up on a later round. */
  function withTimeout(promise, ms, onTimeout) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(onTimeout ? onTimeout() : null);
      }, ms);
      promise.then(function (value) {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(value);
      }, function (err) {
        if (settled) return;
        settled = true; clearTimeout(timer); reject(err);
      });
    });
  }

  function startSession(from, to, k) {
    var api = engine();
    if (!api) { state = "unsupported"; return Promise.resolve(null); }
    return api.availability({ sourceLanguage: from, targetLanguage: to })
      .then(function (availability) {
        if (availability === "unavailable") { broken[k] = true; return null; }
        return api.create({ sourceLanguage: from, targetLanguage: to });
      })
      .then(function (instance) {
        if (instance) {
          sessions[k] = instance;
          state = "ready";
          scheduleRefresh();     // anything that gave up earlier can try again
        }
        return instance;
      })
      .catch(function (err) {
        delete creating[k];      // let a later attempt start afresh
        // A pack that still has to be downloaded needs a real click to start.
        if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
          if (state !== "ready") state = "needs-download";
        } else {
          broken[k] = true;
        }
        return null;
      });
  }

  function session(from, to) {
    var k = key(from, to);
    if (sessions[k]) return Promise.resolve(sessions[k]);
    if (broken[k]) return Promise.resolve(null);
    if (!engine()) { state = "unsupported"; return Promise.resolve(null); }
    if (!creating[k]) creating[k] = startSession(from, to, k);
    return withTimeout(creating[k], SESSION_WAIT, function () {
      if (state !== "ready") state = "needs-download";
      return null;
    });
  }

  /* Downloading a language pack has to start from a user gesture, so settings
     offers a button that walks every pair the family actually needs. */
  function prepare(onDone) {
    if (!supported()) { state = "unsupported"; return onDone && onDone(); }
    var wanted = pairsInUse();
    if (!wanted.length) { state = "ready"; return onDone && onDone(); }
    state = "working";
    scheduleRefresh();
    var pending = wanted.length;
    inflight = {};   // anything that gave up waiting may ask again
    wanted.forEach(function (pair) {
      var k = key(pair[0], pair[1]);
      delete broken[k];            // give a pair that failed another go
      if (!creating[k]) creating[k] = startSession(pair[0], pair[1], k);
      creating[k].then(function () {
        if (--pending === 0) {
          if (state === "working") state = "ready";
          inflight = {};
          scheduleRefresh();
          if (onDone) onDone();
        }
      });
    });
  }

  /* Only the language pairs the household really uses: the languages people
     chose, crossed with the languages things were written in. */
  function pairsInUse() {
    if (!global.Store.exists()) return [];
    var s = global.Store.get();
    var readers = {}, writers = {};
    s.parents.concat(s.children).forEach(function (u) {
      readers[u.lang || s.settings.lang] = true;
    });
    collectSources(s).forEach(function (l) { writers[l] = true; });
    var out = [];
    Object.keys(writers).forEach(function (from) {
      Object.keys(readers).forEach(function (to) {
        if (from !== to && langs().indexOf(from) !== -1 && langs().indexOf(to) !== -1) out.push([from, to]);
      });
    });
    return out;
  }

  function collectSources(s) {
    var found = {};
    var note = function (o) { if (o && o.srcLang) found[o.srcLang] = true; };
    s.children.forEach(function (c) {
      (c.notes || []).forEach(note);
      (c.gifts || []).forEach(note);
      (c.outings || []).forEach(note);
    });
    s.tasks.forEach(note);
    s.categories.forEach(note);
    s.ledger.forEach(note);
    s.redemptions.forEach(note);
    // Assume every reader language is also a writing language, so the packs are
    // ready before the first note is typed.
    s.parents.concat(s.children).forEach(function (u) { found[u.lang || s.settings.lang] = true; });
    return Object.keys(found);
  }

  /* Reads a translatable field. Synchronous by design — the screens build HTML
     strings — so it answers with what it has and fills the gap in later. */
  function of(owner, field, target) {
    var original = owner ? owner[field] : "";
    var source = (owner && owner.srcLang) || null;
    var plain = { value: original, translated: false, pending: false, source: source };
    if (!original || !target) return plain;
    if (!source || source === target) return plain;
    if (!enabled()) return plain;

    if (owner.tr && owner.tr[target]) {
      return { value: owner.tr[target], translated: true, pending: false, source: source };
    }
    if (broken[key(source, target)] || !supported()) return plain;

    request(owner, field, target, source);
    return { value: original, translated: false, pending: true, source: source };
  }

  function request(owner, field, target, source) {
    var mark = (owner.id || owner[field]) + "|" + target;
    if (inflight[mark]) return;
    inflight[mark] = true;
    session(source, target).then(function (instance) {
      if (!instance) { delete inflight[mark]; return; }
      return withTimeout(instance.translate(owner[field]), TRANSLATE_WAIT).then(function (text) {
        delete inflight[mark];
        if (!text) return;
        if (!owner.tr) owner.tr = {};
        owner.tr[target] = text;
        global.Store.save();
        scheduleRefresh();
      });
    }).catch(function () {
      delete inflight[mark];
      broken[key(source, target)] = true;
      scheduleRefresh();
    });
  }

  /* Many cells finish within a few milliseconds of each other; redraw once. */
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      if (global.App && global.App.refresh) global.App.refresh();
    }, 120);
  }

  /* Best guess at the language something was typed in. The writer's own
     language is the fallback, which is right almost every time. */
  function detect(text, fallback, done) {
    var Detector = global.LanguageDetector || (global.ai && global.ai.languageDetector);
    if (!text || !Detector || typeof Detector.create !== "function") return done(fallback);
    var ready = detector || (detector = Detector.create().catch(function () { return null; }));
    Promise.resolve(ready).then(function (instance) {
      if (!instance || !instance.detect) return done(fallback);
      return instance.detect(text).then(function (results) {
        var best = (results || [])[0];
        if (best && best.confidence > 0.6 && langs().indexOf(best.detectedLanguage) !== -1) {
          return done(best.detectedLanguage);
        }
        done(fallback);
      });
    }).catch(function () { done(fallback); });
  }

  function status() {
    if (!supported()) return { state: "unsupported", supported: false };
    return { state: state === "idle" ? "ready" : state, supported: true };
  }

  /* Forget the cached translations of one record — used when its text changes. */
  function invalidate(owner) { if (owner) delete owner.tr; }

  global.Translate = {
    of: of, detect: detect, prepare: prepare, status: status,
    supported: supported, enabled: enabled, invalidate: invalidate,
    pairsInUse: pairsInUse
  };
})(window);
