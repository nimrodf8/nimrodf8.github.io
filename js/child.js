/* Child screens: own account, own tasks, the group account, own notebook. */
(function (global) {
  "use strict";

  var t = function (k, p) { return global.I18N.t(k, p); };
  var esc = function (s) { return global.UI.esc(s); };
  var U = global.UI, S = global.Store;

  function me() { return S.child(global.App.session().id); }

  function render(tab) {
    var c = me();
    if (!c) { S.clearSession(); return ""; }
    if (tab === "tasks") return tasksTab(c);
    if (tab === "rewards") return rewardsTab(c);
    if (tab === "group") return groupTab(c);
    if (tab === "notes") return notesTab(c);
    return meTab(c);
  }

  /* ================= me ================= */

  function meTab(c) {
    var bd = S.birthdayInfo(c);
    var recent = S.get().ledger.filter(function (l) { return l.childId === c.id; }).slice().reverse().slice(0, 8);

    var html = '<div class="wrap">' +
      '<div class="card hero kid center" style="--kid:' + S.childColor(c) + '">' +
        U.childAvatar(c, 84) +
        "<h1 style=\"margin-top:10px\">" + U.name(c) + "</h1>" +
        /* The one number the child came to see. `cheer` means that when it has
           gone up since they last looked — a parent approved something while
           the app was shut — arriving is a small celebration. */
        U.scoreEl("me:" + c.id, S.balance(c.id), { cls: "hero", cheer: true }) +
        '<small>' + esc(t("common.points")) + "</small>" +
        '<div class="row gap mt" style="justify-content:center">' +
          '<span class="tag" style="background:rgba(255,255,255,.22);color:#fff">' +
            esc(t("dash.earnedThisWeek", { n: U.signed(S.weekEarned(c.id)) })) + "</span>" +
        "</div>" +
      "</div>";

    if (bd) {
      var label = bd.days === 0 ? t("dash.birthdayToday")
                : bd.days === 1 ? t("dash.tomorrow")
                : t("dash.daysLeft", { n: U.iso(bd.days) });
      html += '<div class="card"><div class="eyebrow">' + esc(t("dash.birthdays")) + "</div>" +
        '<div class="row between"><strong style="font-size:1.1rem">🎂 ' + esc(label) + "</strong>" +
        '<span class="tag brand">' + esc(t("dash.turns", { n: U.iso(bd.turning) })) + "</span></div></div>";
    }

    var winner = S.weekWinner();
    if (winner && winner.child.id === c.id && S.isMovieDay()) {
      var todays = S.movieNightToday();
      var prize = (S.get().settings.weeklyPrize || "").trim() || t("movie.prizeDefault");
      html += '<div class="card good"><div class="eyebrow">' + esc(prize) + "</div>" +
        "<p><strong>🍿 " + esc(todays ? todays.movie : prize) + "</strong></p></div>";
    }

    html += '<div class="section-title">' + esc(t("dash.activity")) + "</div>" +
      '<div class="card flush">' + (recent.length
        ? '<ul class="list">' + recent.map(function (l) {
            var task = S.task(l.taskId);
            var label2 = task ? U.taskTitleHtml(task)
              : l.kind === "start" ? esc(t("ledger.start"))
              : l.note ? U.trHtml(l, "note") : esc(t("ledger.manual"));
            return "<li><div class=\"grow\"><div class=\"title\">" + label2 + "</div>" +
              '<div class="sub">' + esc(U.fmtDateTime(l.ts)) + "</div></div>" +
              U.points(l.self) + "</li>";
          }).join("") + "</ul>"
        : U.emptyState(t("kids.noHistory"), "📈", t("empty.history"))) + "</div>";

    return html + "</div>";
  }

  /* ================= my tasks ================= */

  function tasksTab(c) {
    var s = S.get();
    var mine = S.tasksForChild(c.id);
    var html = '<div class="wrap"><h1>' + esc(t("tasks.mine")) + "</h1>";
    if (!mine.length) return html + U.emptyState(t("tasks.noneForChild"), "📋", t("empty.tasksChild")) + "</div>";

    s.categories.forEach(function (cat) {
      var list = mine.filter(function (task) { return task.categoryId === cat.id; });
      if (!list.length) return;
      html += '<div class="section-title">' + cat.icon + " " + U.categoryNameHtml(cat) + "</div>" +
        '<div class="card flush">' + list.map(function (task) { return taskRow(c, task); }).join("") + "</div>";
    });
    var orphans = mine.filter(function (task) { return !S.category(task.categoryId); });
    if (orphans.length) {
      html += '<div class="section-title">' + esc(t("cat.other")) + "</div>" +
        '<div class="card flush">' + orphans.map(function (task) { return taskRow(c, task); }).join("") + "</div>";
    }
    return html + "</div>";
  }

  function taskRow(c, task) {
    var claim = S.claimFor(c.id, task.id);
    var status = "";
    if (claim && claim.status === "pending") {
      status = '<span class="tag" title="' + esc(t("child.reportedAt", { when: U.fmtDateTime(claim.ts) })) +
        '">⏳ ' + esc(t("tasks.claimed")) + "</span>";
    }
    else if (claim && claim.status === "approved") status = '<span class="tag good">✓ ' + esc(t("tasks.doneToday")) + "</span>";
    else if (claim && claim.status === "rejected") status = '<span class="tag bad">✗ ' + esc(t("appr.rejected")) + "</span>";

    var reward = [];
    if (task.scope !== "group") reward.push(U.points(task.onDoneSelf));
    if (task.scope !== "personal") reward.push('<small>' + esc(t("nav.group")) + "</small> " + U.points(task.onDoneGroup));

    return '<div class="task-row" data-task-row="' + task.id + '">' +
      '<div class="grow"><div class="title">' + U.taskTitleHtml(task) + "</div>" +
        '<div class="sub">' + reward.join(" · ") +
        (S.num(task.onMissSelf) < 0 ? " · <small>" + esc(t("tasks.onMiss")) + " " + U.points(task.onMissSelf) + "</small>" : "") +
        "</div>" + (status ? '<div class="sub">' + status + "</div>" : "") + "</div>" +
      (claim && claim.status === "pending"
        ? '<button class="btn small ghost" disabled>⏳</button>'
        : '<button class="btn small good" data-act="c.claim" data-id="' + task.id + '">' + esc(t("tasks.iDidIt")) + "</button>") +
      "</div>";
  }

  /* ================= rewards ================= */

  function rewardsTab(c) {
    var balance = S.balance(c.id);
    var mine = S.rewardsFor(c.id).sort(function (a, b) { return S.num(a.cost) - S.num(b.cost); });
    var gp = S.goalProgress();

    var html = '<div class="wrap"><h1>' + esc(t("rewards.title")) + "</h1>" +
      '<div class="card hero kid center" style="--kid:' + S.childColor(c) + '">' +
        U.scoreEl("rewards:" + c.id, balance, { cls: "hero" }) +
        '<small>' + esc(t("common.points")) + "</small></div>";

    html += '<div class="section-title">' + esc(t("rewards.child")) + "</div>";
    html += mine.length
      ? '<div class="card flush">' + mine.map(function (r) { return rewardRow(c, r, balance); }).join("") + "</div>"
      : U.emptyState(t("rewards.noneForChild"), "🎁", t("empty.rewardsChild"));

    html += '<div class="section-title">' + esc(t("rewards.family")) + "</div>" +
      '<div class="card">' +
        '<div class="row between nowrap"><strong>' + esc(t("dash.groupBank")) + "</strong>" +
        U.scoreEl("bank", gp.total, { style: "font-size:1.2rem" }) + "</div>" +
        U.progressBar(gp.pct) +
        '<small>' + esc(gp.next
          ? t("rewards.nextGoal", { name: U.keyedTitle(gp.next) }) + " · " + t("rewards.short", { n: U.iso(gp.missing) })
          : t("rewards.unlockedCount", { n: U.iso(gp.unlocked.length) })) + "</small>" +
        (gp.unlocked.length
          ? '<ul class="list" style="margin-top:8px">' + gp.unlocked.map(function (r) {
              return "<li><span class=\"rank-badge\">" + (r.icon || "🎁") + "</span>" +
                '<div class="grow"><div class="title">' + U.keyedTitleHtml(r) + "</div></div>" +
                '<span class="tag good">' + esc(t("rewards.unlocked")) + "</span></li>";
            }).join("") + "</ul>"
          : "") +
      "</div>";

    return html + "</div>";
  }

  function rewardRow(c, r, balance) {
    var cost = S.num(r.cost);
    var claim = S.rewardClaimFor(c.id, r.id);
    var short = cost - balance;
    var status = "";
    if (claim && claim.status === "pending") {
      status = '<span class="tag" title="' + esc(t("child.requestedAt", { when: U.fmtDateTime(claim.ts) })) +
        '">⏳ ' + esc(t("rewards.requested")) + "</span>";
    }
    else if (claim && claim.status === "approved") status = '<span class="tag good">✓ ' + esc(t("common.done")) + "</span>";
    else if (claim && claim.status === "rejected") status = '<span class="tag bad">✗ ' + esc(t("appr.rejected")) + "</span>";

    return '<div class="task-row' + (short > 0 ? " paused" : "") + '">' +
      '<span class="rank-badge" style="font-size:1.1rem">' + (r.icon || "🎁") + "</span>" +
      '<div class="grow"><div class="title">' + U.keyedTitleHtml(r) + "</div>" +
        '<div class="sub">' + U.points(-cost) + " · " +
          esc(short > 0 ? t("rewards.short", { n: U.iso(short) }) : t("rewards.affordable")) + "</div>" +
        (status ? '<div class="sub">' + status + "</div>" : "") +
      "</div>" +
      (claim && claim.status === "pending"
        ? '<button class="btn small ghost" disabled>⏳</button>'
        : '<button class="btn small' + (short > 0 ? " ghost" : " good") + '" data-act="c.wantReward" data-id="' + r.id + '"' +
          (short > 0 ? " disabled" : "") + ">" + esc(t("rewards.want")) + "</button>") +
      "</div>";
  }

  /* ================= group ================= */

  function groupTab(c) {
    var s = S.get();
    var gp = S.goalProgress();
    var top = S.topScorer();

    var html = '<div class="wrap">' +
      '<div class="card hero">' +
        '<div class="eyebrow">' + esc(t("dash.groupBank")) + "</div>" +
        '<div class="row between nowrap">' + U.scoreEl("bankTop", gp.total) +
        '<div class="tag" style="background:rgba(255,255,255,.2);color:#fff">' + esc(t("dash.goal", { n: U.iso(gp.goal) })) + "</div></div>" +
        U.progressBar(gp.pct) +
        (gp.reached
          ? "<p>🎉 " + esc(t("rewards.unlockedCount", { n: U.iso(gp.unlocked.length) })) + "</p>" +
            (top ? "<small>" + esc(t("rewards.chooser", { name: top.child.id === c.id ? t("common.you") : S.nameOf(top.child) })) + "</small>" : "")
          : "<small>" + esc(gp.next
              ? t("rewards.nextGoal", { name: U.keyedTitle(gp.next) }) + " · " + t("rewards.short", { n: U.iso(gp.missing) })
              : t("rewards.short", { n: U.iso(gp.missing) })) + "</small>") +
      "</div>";

    html += '<div class="section-title">' + esc(t("movie.history")) + "</div>" +
      '<div class="card">' + (s.movieNights.length
        ? s.movieNights.slice(0, 8).map(function (m) {
            return '<div class="kv"><span class="k">' + esc(U.fmtDate(m.ts)) + "</span><span>🍿 " +
              esc(m.movie) + " · " + esc(nameOf(m.winnerId)) + "</span></div>";
          }).join("")
        : U.emptyState(t("movie.empty"), "🍿", t("empty.movie"))) + "</div>";

    html += '<div class="section-title">' + esc(t("rewards.history")) + "</div>" +
      '<div class="card">' + (s.redemptions.length
        ? s.redemptions.slice(0, 8).map(function (r) {
            return '<div class="kv"><span class="k">' + esc(U.fmtDate(r.ts)) + "</span><span>" +
              (r.icon || "🎁") + " " + U.keyedTitleHtml(r) +
              (r.note ? " · " + U.trHtml(r, "note") : "") +
              (r.childId ? " · " + esc(nameOf(r.childId)) : "") + "</span></div>";
          }).join("")
        : U.emptyState(t("common.empty"), "🎁", t("empty.redemptions"))) + "</div>";

    return html + "</div>";
  }

  function nameOf(id) { var c = S.child(id); return c ? c.name : "—"; }

  /* ================= notes ================= */

  function notesTab(c) {
    return '<div class="wrap"><h1>' + esc(t("nav.notes")) + "</h1>" +
      listCard(c, "notes", "📝 " + t("kids.notes"), t("kids.notesHint"), t("kids.addNote"), false, true) +
      listCard(c, "gifts", "🎁 " + t("kids.gifts"), t("kids.giftsHint"), t("kids.addGift"), false, false) +
      listCard(c, "outings", "🎡 " + t("kids.outings"), t("kids.outingsHint"), t("kids.addOuting"), true, false) +
      "</div>";
  }

  function listCard(child, field, title, hint, addLabel, ordered, multiline) {
    var items = child[field] || [];
    return '<div class="section-title">' + esc(title) + "</div>" +
      '<div class="card">' +
        '<small>' + esc(hint) + "</small>" +
        '<form data-act="c.itemAdd" data-field="' + field + '" class="row tight nowrap mt">' +
          (multiline
            ? '<textarea name="text" class="grow" placeholder="' + esc(addLabel) + '" style="min-height:64px"></textarea>'
            : '<input type="text" name="text" class="grow" placeholder="' + esc(addLabel) + '">') +
          '<button class="btn small" type="submit">＋</button>' +
        "</form>" +
        (items.length
          ? '<ul class="list" style="margin-top:10px">' + items.map(function (it, i) {
              return "<li>" + (ordered ? '<span class="rank-badge">' + (i + 1) + "</span>" : "") +
                '<div class="grow"><div class="title" style="white-space:pre-wrap">' + U.trHtml(it, "text") + "</div>" +
                '<div class="sub">' + esc(U.fmtDate(it.ts)) + "</div></div></li>";
            }).join("") + "</ul>"
          : U.emptyState(t("common.empty"), "✏️", t("empty.list"))) +
        '<div class="hint">' + esc(t("child.readOnly")) + "</div>" +
      "</div>";
  }

  /* ================= actions ================= */

  U.on("c.claim", function (d) {
    var c = me();
    S.claimTask(c.id, d.id);
    U.toast(t("tasks.claimSent"), "good");
    global.App.refresh();
    /* No confetti here: nothing has been earned yet, only reported. The row
       lights up instead, so the child can see which one they just sent. */
    U.flash('[data-task-row="' + d.id + '"]');
  });
  U.on("c.itemAdd", function (d, form) {
    var input = form.querySelector('[name="text"]');
    var text = input.value.trim();
    if (!text) return;
    S.addListItem(me().id, d.field, text);
    input.value = "";
    global.App.refresh();
  });
  U.on("c.wantReward", function (d) {
    var c = me();
    var r = S.reward(d.id);
    if (!r) return;
    if (S.balance(c.id) < S.num(r.cost)) {
      return U.toast(t("rewards.short", { n: U.iso(S.num(r.cost) - S.balance(c.id)) }), "bad");
    }
    S.claimReward(c.id, r.id);
    U.toast(t("tasks.claimSent"), "good");
    global.App.refresh();
  });

  global.ChildView = { render: render };
})(window);
