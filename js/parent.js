/* Parent (admin) screens: dashboard, tasks, kids, approvals, settings. */
(function (global) {
  "use strict";

  var t = function (k, p) { return global.I18N.t(k, p); };
  var esc = function (s) { return global.UI.esc(s); };
  var U = global.UI, S = global.Store;

  var showInactive = false;
  var taskDraft = null;
  var awardCtx = null;

  function me() { return S.parent(global.App.session().id); }

  function render(tab, params) {
    if (tab === "dashboard") return dashboard();
    if (tab === "tasks") return tasksTab();
    if (tab === "rewards") return rewardsTab();
    if (tab === "kids") return params && params.childId ? childDetail(params.childId) : kidsTab();
    if (tab === "approvals") return approvalsTab();
    return familyTab();
  }

  /* ================= dashboard ================= */

  function dashboard() {
    var s = S.get();
    var gp = S.goalProgress();
    var rows = S.standings();
    var pending = S.pendingClaims();

    var html = '<div class="wrap">';

    html += bankCard(gp);

    if (pending.length) {
      html += '<div class="card tappable" data-act="p.goApprovals">' +
        '<div class="row between"><strong>🔔 ' + esc(t("dash.pending", { n: U.iso(pending.length) })) + "</strong><span>→</span></div></div>";
    }

    html += movieCard();

    html += '<div class="section-title">' + esc(t("dash.standings")) + "</div>";
    html += '<div class="card flush">' + (rows.length
      ? '<ul class="list">' + rows.map(function (r, i) {
          return '<li class="tappable" data-act="p.openChild" data-id="' + r.child.id + '">' +
            '<span class="rank-badge' + (i === 0 && r.earned > 0 ? " gold" : "") + '">' + (i + 1) + "</span>" +
            U.avatar(r.child.avatar, 40) +
            '<div class="grow"><div class="title">' + U.name(r.child) + "</div>" +
            '<div class="sub">' + esc(t("dash.earnedThisWeek", { n: U.signed(r.earned) })) + "</div></div>" +
            '<strong class="score" style="font-size:1.15rem">' + r.balance + "</strong></li>";
        }).join("") + "</ul>"
      : U.emptyState(t("common.empty"), "🧒")) + "</div>";

    html += birthdaysCard();
    html += activityCard();
    html += "</div>";
    return html;
  }

  function movieCard() {
    var s = S.get();
    var winner = S.weekWinner();
    var todays = S.movieNightToday();
    var isDay = S.isMovieDay();
    // whatever is already shown as tonight's pick should not repeat in history
    var history = s.movieNights.filter(function (m) {
      return !todays || m.id !== todays.id;
    }).slice(0, 3);

    if (!isDay && !history.length && !todays) return "";

    var body = "";
    if (todays) {
      body = "<p><strong>🍿 " + esc(todays.movie) + "</strong><br><small>" +
        esc(t("movie.pickedBy", { name: nameOf(todays.winnerId) })) + "</small></p>";
    } else if (isDay && winner) {
      body = "<p><strong>" + U.name(winner.child) + "</strong> · " + esc(weeklyPrize()) + "</p>" +
        '<button class="btn block" data-act="p.movie">' + esc(t("movie.record")) + "</button>";
    } else if (isDay) {
      body = '<p class="lead">' + esc(t("movie.noWinner")) + "</p>";
    }

    var past = history.length
      ? '<div class="section-title" style="margin-top:14px">' + esc(t("movie.history")) + "</div>" +
        history.map(function (m) {
          return '<div class="kv"><span class="k">' + esc(U.fmtDate(m.ts)) + "</span><span>" +
            esc(m.movie) + " · " + esc(nameOf(m.winnerId)) + "</span></div>";
        }).join("")
      : "";

    return '<div class="card">' +
      '<div class="eyebrow">' + esc(weeklyPrize()) + (isDay ? " · " + esc(t("movie.tonight")) : "") + "</div>" +
      body + past + "</div>";
  }

  /* The weekly winner's prize is a family decision, so the label is editable
     and "picks tonight's film" is only the default. */
  function weeklyPrize() {
    var custom = (S.get().settings.weeklyPrize || "").trim();
    return custom || t("movie.prizeDefault");
  }

  function birthdaysCard() {
    var s = S.get();
    var rows = s.children.map(function (c) { return { child: c, bd: S.birthdayInfo(c) }; })
      .filter(function (r) { return r.bd; })
      .sort(function (a, b) { return a.bd.days - b.bd.days; });
    if (!rows.length) return "";
    return '<div class="section-title">' + esc(t("dash.birthdays")) + "</div>" +
      '<div class="card">' + rows.map(function (r) {
        var label = r.bd.days === 0 ? t("dash.birthdayToday")
                  : r.bd.days === 1 ? t("dash.tomorrow")
                  : t("dash.daysLeft", { n: r.bd.days });
        return '<div class="countdown' + (r.bd.days === 0 ? " today" : "") + '">' +
          '<span class="days">' + (r.bd.days === 0 ? "🎂" : r.bd.days) + "</span>" +
          U.avatar(r.child.avatar, 36) +
          '<div class="grow"><div class="title">' + U.name(r.child) + "</div>" +
          '<div class="sub">' + esc(label) + " · " + esc(t("dash.turns", { n: r.bd.turning })) + "</div></div></div>";
      }).join("") + "</div>";
  }

  function activityCard() {
    var s = S.get();
    var rows = s.ledger.slice().reverse().filter(function (l) { return l.kind !== "start"; }).slice(0, 8);
    if (!rows.length) return "";
    return '<div class="section-title">' + esc(t("dash.activity")) + "</div>" +
      '<div class="card flush"><ul class="list">' + rows.map(function (l) {
        return "<li>" + (l.childId ? U.avatar((S.child(l.childId) || {}).avatar, 34) : '<span class="rank-badge">👨‍👩‍👧</span>') +
          '<div class="grow"><div class="title">' + ledgerLabelHtml(l) + "</div>" +
          '<div class="sub">' + esc(l.childId ? nameOf(l.childId) : t("rewards.family")) + " · " + esc(U.relTime(l.ts)) + "</div></div>" +
          '<div class="pts-cell">' + (l.self ? U.points(l.self) : "") +
          (l.group ? '<small>' + esc(t("tasks.groupPts")) + " " + U.points(l.group) + "</small>" : "") + "</div></li>";
      }).join("") + "</ul></div>";
  }

  function ledgerLabel(l) {
    if (l.kind === "award" || l.kind === "penalty") {
      var task = S.task(l.taskId);
      return (task ? U.taskTitle(task) : t(l.kind === "award" ? "ledger.award" : "ledger.penalty"));
    }
    if (l.kind === "reward" || l.kind === "redeem") {
      var rw = S.reward(l.rewardId);
      return (rw ? U.keyedTitle(rw) : t("ledger.reward")) + (l.note ? " · " + U.trValue(l, "note") : "");
    }
    if (l.kind === "start") return t("ledger.start");
    return l.note || t("ledger.manual");
  }
  function ledgerLabelHtml(l) {
    if (l.kind === "award" || l.kind === "penalty") {
      var task = S.task(l.taskId);
      return task ? U.taskTitleHtml(task) : esc(t(l.kind === "award" ? "ledger.award" : "ledger.penalty"));
    }
    if (l.kind === "reward" || l.kind === "redeem") {
      var rw = S.reward(l.rewardId);
      return (rw ? U.keyedTitleHtml(rw) : esc(t("ledger.reward"))) + (l.note ? " · " + U.trHtml(l, "note") : "");
    }
    if (l.kind === "start") return esc(t("ledger.start"));
    return l.note ? U.trHtml(l, "note") : esc(t("ledger.manual"));
  }
  function nameOf(childId) { var c = S.child(childId); return c ? c.name : "—"; }

  /* ================= tasks ================= */

  function tasksTab() {
    var s = S.get();
    var html = '<div class="wrap">' +
      '<div class="row between"><h1>' + esc(t("tasks.title")) + "</h1>" +
      '<button class="btn small" data-act="p.taskNew">＋ ' + esc(t("tasks.add")) + "</button></div>" +
      '<label class="row tight" style="font-size:.85rem;color:var(--ink-soft)">' +
        '<input type="checkbox" style="width:auto" ' + (showInactive ? "checked" : "") +
        ' data-act="p.toggleInactive"> ' + esc(t("tasks.showInactive")) + "</label>";

    s.categories.forEach(function (cat) {
      var list = s.tasks.filter(function (t2) {
        return t2.categoryId === cat.id && (showInactive || t2.active);
      });
      if (!list.length) return;
      html += '<div class="section-title">' + cat.icon + " " + U.categoryNameHtml(cat) + "</div>" +
        '<div class="card flush">' + list.map(taskRow).join("") + "</div>";
    });

    var orphans = s.tasks.filter(function (t2) {
      return !S.category(t2.categoryId) && (showInactive || t2.active);
    });
    if (orphans.length) {
      html += '<div class="section-title">' + esc(t("cat.other")) + "</div>" +
        '<div class="card flush">' + orphans.map(taskRow).join("") + "</div>";
    }
    if (!s.tasks.length) html += U.emptyState(t("tasks.empty"), "📋");
    return html + "</div>";
  }

  function taskRow(task) {
    var scopeTag = task.scope === "both" ? t("tasks.scopeBoth")
                 : task.scope === "group" ? t("tasks.scopeGroup") : t("tasks.scopePersonal");
    var assignTag = task.assign === "all" ? t("tasks.assignAll")
      : (task.assignIds || []).map(nameOf).join(", ");
    var pts = "";
    if (task.scope !== "group") {
      pts += '<div class="sub">' + esc(t("tasks.selfPts")) + " " +
        U.points(task.onDoneSelf) + " / " + U.points(task.onMissSelf) + "</div>";
    }
    if (task.scope !== "personal") {
      pts += '<div class="sub">' + esc(t("tasks.groupPts")) + " " +
        U.points(task.onDoneGroup) + " / " + U.points(task.onMissGroup) + "</div>";
    }

    return '<div class="task-row' + (task.active ? "" : " paused") + '">' +
      '<div class="grow">' +
        '<div class="title">' + U.taskTitleHtml(task) + "</div>" +
        '<div class="sub">' + esc(scopeTag) + " · " + esc(assignTag) + " · " + esc(t("tasks.repeat" + cap(task.repeat))) +
        (task.active ? "" : " · " + esc(t("tasks.inactive"))) + "</div>" +
        pts +
      "</div>" +
      '<div class="row tight nowrap">' +
        '<button class="btn small good" data-act="p.award" data-id="' + task.id + '" data-outcome="done">✓</button>' +
        '<button class="btn small danger" data-act="p.award" data-id="' + task.id + '" data-outcome="missed">✗</button>' +
        '<button class="icon-btn" data-act="p.taskEdit" data-id="' + task.id + '">✏️</button>' +
      "</div></div>";
  }

  function cap(s) { return String(s || "once").charAt(0).toUpperCase() + String(s || "once").slice(1); }

  function taskEditor(task) {
    var s = S.get();
    taskDraft = task ? S.clone(task) : {
      id: "", title: "", titleKey: "", categoryId: s.categories[0] ? s.categories[0].id : "cat_other",
      scope: "personal", onDoneSelf: 10, onMissSelf: -5, onDoneGroup: 0, onMissGroup: 0,
      assign: "all", assignIds: [], repeat: "daily", active: true
    };
    U.modal(task ? t("tasks.edit") : t("tasks.add"), taskEditorBody());
  }

  function taskEditorBody() {
    var s = S.get();
    var d = taskDraft;
    var withSelf = d.scope !== "group";
    var withGroup = d.scope !== "personal";

    return '<form data-act="p.taskSave">' +
      '<div class="field"><label for="tTitle">' + esc(t("tasks.name")) + "</label>" +
        '<input id="tTitle" type="text" value="' + esc(d.titleKey ? t(d.titleKey) : d.title) + '"></div>' +
      '<div class="grid-2">' +
        '<div class="field"><label for="tCat">' + esc(t("tasks.category")) + "</label><select id=\"tCat\">" +
          s.categories.map(function (c) {
            return '<option value="' + c.id + '"' + (c.id === d.categoryId ? " selected" : "") + ">" +
              c.icon + " " + esc(U.categoryName(c)) + "</option>";
          }).join("") + "</select></div>" +
        '<div class="field"><label for="tRep">' + esc(t("tasks.repeat")) + "</label><select id=\"tRep\">" +
          ["daily", "weekly", "once"].map(function (r) {
            return '<option value="' + r + '"' + (r === d.repeat ? " selected" : "") + ">" + esc(t("tasks.repeat" + cap(r))) + "</option>";
          }).join("") + "</select></div>" +
      "</div>" +
      '<div class="field"><span class="field-label">' + esc(t("tasks.scope")) + "</span>" +
        '<div class="seg">' + ["personal", "group", "both"].map(function (sc) {
          return '<button type="button" class="' + (d.scope === sc ? "on" : "") + '" data-act="p.taskScope" data-scope="' + sc + '">' +
            esc(t("tasks.scope" + cap(sc))) + "</button>";
        }).join("") + "</div></div>" +
      (withSelf ? '<div class="field"><span class="field-label">' + esc(t("tasks.selfPts")) + "</span>" +
        '<div class="grid-2 keep">' +
          '<div><small>' + esc(t("tasks.onDone")) + '</small><input id="tDoneSelf" type="number" value="' + S.num(d.onDoneSelf) + '"></div>' +
          '<div><small>' + esc(t("tasks.onMiss")) + '</small><input id="tMissSelf" type="number" value="' + S.num(d.onMissSelf) + '"></div>' +
        '</div><div class="hint">' + esc(t("tasks.hint")) + "</div></div>" : "") +
      (withGroup ? '<div class="field"><span class="field-label">' + esc(t("tasks.groupPts")) + "</span>" +
        '<div class="grid-2 keep">' +
          '<div><small>' + esc(t("tasks.onDone")) + '</small><input id="tDoneGroup" type="number" value="' + S.num(d.onDoneGroup) + '"></div>' +
          '<div><small>' + esc(t("tasks.onMiss")) + '</small><input id="tMissGroup" type="number" value="' + S.num(d.onMissGroup) + '"></div>' +
        "</div></div>" : "") +
      '<div class="field"><span class="field-label">' + esc(t("tasks.assign")) + "</span>" +
        '<div class="seg mb">' +
          '<button type="button" class="' + (d.assign === "all" ? "on" : "") + '" data-act="p.taskAssign" data-mode="all">' + esc(t("tasks.assignAll")) + "</button>" +
          '<button type="button" class="' + (d.assign === "some" ? "on" : "") + '" data-act="p.taskAssign" data-mode="some">' + esc(t("tasks.assignSome")) + "</button>" +
        "</div>" +
        (d.assign === "some" ? '<div class="chips">' + s.children.map(function (c) {
          var on = (d.assignIds || []).indexOf(c.id) !== -1;
          return '<button type="button" class="chip' + (on ? " on" : "") + '" data-act="p.taskChild" data-id="' + c.id + '">' +
            U.name(c) + "</button>";
        }).join("") + "</div>" : "") +
      "</div>" +
      '<label class="row tight"><input type="checkbox" id="tActive" style="width:auto" ' + (d.active ? "checked" : "") + "> " +
        esc(t("tasks.active")) + "</label>" +
      '<div class="row gap mt">' +
        (d.id ? '<button type="button" class="btn danger small" data-act="p.taskDelete" data-id="' + d.id + '">🗑️</button>' : "") +
        '<button class="btn grow" type="submit">' + esc(t("common.save")) + "</button>" +
      "</div></form>";
  }

  function captureTask() {
    var v = function (id) { var n = U.el("#" + id); return n ? n.value : null; };
    if (v("tTitle") !== null) {
      taskDraft.title = v("tTitle").trim();
      if (taskDraft.titleKey && taskDraft.title !== t(taskDraft.titleKey)) taskDraft.titleKey = "";
    }
    if (v("tCat") !== null) taskDraft.categoryId = v("tCat");
    if (v("tRep") !== null) taskDraft.repeat = v("tRep");
    if (v("tDoneSelf") !== null) taskDraft.onDoneSelf = S.num(v("tDoneSelf"));
    if (v("tMissSelf") !== null) taskDraft.onMissSelf = S.num(v("tMissSelf"));
    if (v("tDoneGroup") !== null) taskDraft.onDoneGroup = S.num(v("tDoneGroup"));
    if (v("tMissGroup") !== null) taskDraft.onMissGroup = S.num(v("tMissGroup"));
    var a = U.el("#tActive");
    if (a) taskDraft.active = a.checked;
  }
  function redrawTaskEditor() {
    captureTask();
    var body = U.el(".modal-body");
    if (body) body.innerHTML = taskEditorBody();
  }

  /* ================= rewards ================= */

  function rewardsTab() {
    var s = S.get();
    var gp = S.goalProgress();
    var family = S.familyRewards(true);
    var kidPrizes = s.rewards.filter(function (r) { return r.kind === "child"; });

    var html = '<div class="wrap">' +
      '<div class="row between"><h1>' + esc(t("rewards.title")) + "</h1>" +
      '<button class="btn small" data-act="p.rewardNew">＋ ' + esc(t("rewards.add")) + "</button></div>" +
      bankCard(gp);

    html += '<div class="section-title">' + esc(t("rewards.family")) + "</div>" +
      '<div class="card flush">' + (family.length
        ? family.map(function (r) { return rewardRow(r, gp); }).join("")
        : U.emptyState(t("rewards.empty"), "🎁")) + "</div>" +
      '<p class="hint">' + esc(t("rewards.familyHint")) + "</p>";

    html += '<div class="section-title">' + esc(t("rewards.child")) + "</div>" +
      '<div class="card flush">' + (kidPrizes.length
        ? kidPrizes.map(function (r) { return rewardRow(r, gp); }).join("")
        : U.emptyState(t("rewards.empty"), "🎁")) + "</div>" +
      '<p class="hint">' + esc(t("rewards.childHint")) + "</p>";

    html += redemptionHistory(8);
    return html + "</div>";
  }

  function bankCard(gp) {
    return '<div class="card hero">' +
      '<div class="eyebrow">' + esc(t("dash.groupBank")) + "</div>" +
      '<div class="row between nowrap"><div class="score">' + gp.total + "</div>" +
      '<div class="tag" style="background:rgba(255,255,255,.2);color:#fff">' +
        esc(gp.next ? t("rewards.nextGoal", { name: U.keyedTitle(gp.next) }) : t("dash.goal", { n: U.iso(gp.goal) })) +
      "</div></div>" +
      U.progressBar(gp.pct) +
      (gp.reached
        ? '<p style="margin-top:6px">🎉 ' + esc(t("rewards.unlockedCount", { n: U.iso(gp.unlocked.length) })) + "</p>" +
          '<button class="btn ghost block mt" data-act="p.redeemFamily">' + esc(t("dash.redeem")) + "</button>"
        : '<small>' + esc(t("rewards.short", { n: U.iso(gp.missing) })) + "</small>") +
    "</div>";
  }

  function rewardRow(r, gp) {
    var family = r.kind === "family";
    var affordable = family && S.num(r.cost) <= gp.total;
    var who = family ? t("common.everyone")
      : r.assign === "all" ? t("tasks.assignAll") : (r.assignIds || []).map(nameOf).join(", ");

    var tag = family
      ? (affordable ? '<span class="tag good">' + esc(t("rewards.unlocked")) + "</span>"
                    : '<span class="tag">' + esc(t("rewards.short", { n: U.iso(S.num(r.cost) - gp.total) })) + "</span>")
      : "";

    return '<div class="task-row' + (r.active ? "" : " paused") + '">' +
      '<span class="rank-badge" style="font-size:1.1rem">' + (r.icon || "🎁") + "</span>" +
      '<div class="grow"><div class="title">' + U.keyedTitleHtml(r) + "</div>" +
        '<div class="sub">' + esc(t("rewards.cost")) + " " + U.points(-S.num(r.cost)) + " · " + esc(who) +
        (r.active ? "" : " · " + esc(t("tasks.inactive"))) + "</div>" +
        (tag ? '<div class="sub">' + tag + "</div>" : "") +
      "</div>" +
      '<div class="row tight nowrap">' +
        '<button class="btn small good" data-act="p.giveReward" data-id="' + r.id + '"' +
          (family && !affordable ? " disabled" : "") + ">🎁</button>" +
        '<button class="icon-btn" data-act="p.rewardEdit" data-id="' + r.id + '">✏️</button>' +
      "</div></div>";
  }

  function redemptionHistory(limit) {
    var rows = S.get().redemptions.slice(0, limit);
    return '<div class="section-title">' + esc(t("rewards.history")) + "</div>" +
      '<div class="card">' + (rows.length
        ? rows.map(function (r) {
            return '<div class="kv"><span class="k">' + esc(U.fmtDate(r.ts)) + "</span><span>" +
              (r.icon || "🎁") + " " + U.keyedTitleHtml(r) +
              (r.note ? " · " + U.trHtml(r, "note") : "") +
              (r.childId ? " · " + esc(nameOf(r.childId)) : "") + "</span></div>";
          }).join("")
        : '<p class="muted">' + esc(t("common.empty")) + "</p>") + "</div>";
  }

  var rewardDraft = null;

  function rewardEditor(r) {
    var s = S.get();
    rewardDraft = r ? S.clone(r) : {
      id: "", title: "", titleKey: "", icon: "🎁", kind: "child", cost: 100,
      assign: "all", assignIds: [], active: true
    };
    U.modal(r ? t("rewards.edit") : t("rewards.add"), rewardEditorBody());
  }

  function rewardEditorBody() {
    var s = S.get();
    var d = rewardDraft;
    return '<form data-act="p.rewardSave">' +
      '<div class="field"><label for="rTitle">' + esc(t("rewards.name")) + "</label>" +
        '<input id="rTitle" type="text" value="' + esc(d.titleKey ? t(d.titleKey) : d.title) + '"></div>' +
      '<div class="field"><span class="field-label">' + esc(t("rewards.icon")) + "</span>" +
        '<div class="chips">' + global.AVATARS.rewardIcons.map(function (ic) {
          return '<button type="button" class="chip' + (ic === d.icon ? " on" : "") +
            '" data-act="p.rewardIcon" data-icon="' + ic + '">' + ic + "</button>";
        }).join("") + "</div></div>" +
      '<div class="field"><span class="field-label">' + esc(t("rewards.kind")) + "</span>" +
        '<div class="seg">' + ["child", "family"].map(function (k) {
          return '<button type="button" class="' + (d.kind === k ? "on" : "") + '" data-act="p.rewardKind" data-kind="' + k + '">' +
            esc(t(k === "child" ? "rewards.kindChild" : "rewards.kindFamily")) + "</button>";
        }).join("") + "</div>" +
        '<div class="hint">' + esc(t(d.kind === "child" ? "rewards.childHint" : "rewards.familyHint")) + "</div></div>" +
      '<div class="field"><label for="rCost">' + esc(t("rewards.cost")) + "</label>" +
        '<input id="rCost" type="number" min="0" value="' + S.num(d.cost) + '"></div>' +
      (d.kind === "child"
        ? '<div class="field"><span class="field-label">' + esc(t("tasks.assign")) + "</span>" +
          '<div class="seg mb">' +
            '<button type="button" class="' + (d.assign === "all" ? "on" : "") + '" data-act="p.rewardAssign" data-mode="all">' +
              esc(t("tasks.assignAll")) + "</button>" +
            '<button type="button" class="' + (d.assign === "some" ? "on" : "") + '" data-act="p.rewardAssign" data-mode="some">' +
              esc(t("tasks.assignSome")) + "</button>" +
          "</div>" +
          (d.assign === "some" ? '<div class="chips">' + s.children.map(function (c) {
            var on = (d.assignIds || []).indexOf(c.id) !== -1;
            return '<button type="button" class="chip' + (on ? " on" : "") + '" data-act="p.rewardChild" data-id="' + c.id + '">' +
              U.name(c) + "</button>";
          }).join("") + "</div>" : "") + "</div>"
        : "") +
      '<label class="row tight"><input type="checkbox" id="rActive" style="width:auto" ' + (d.active ? "checked" : "") + "> " +
        esc(t("tasks.active")) + "</label>" +
      '<div class="row gap mt">' +
        (d.id ? '<button type="button" class="btn danger small" data-act="p.rewardDelete" data-id="' + d.id + '">🗑️</button>' : "") +
        '<button class="btn grow" type="submit">' + esc(t("common.save")) + "</button>" +
      "</div></form>";
  }

  function captureReward() {
    var v = function (id) { var n = U.el("#" + id); return n ? n.value : null; };
    if (v("rTitle") !== null) {
      rewardDraft.title = v("rTitle").trim();
      if (rewardDraft.titleKey && rewardDraft.title !== t(rewardDraft.titleKey)) rewardDraft.titleKey = "";
    }
    if (v("rCost") !== null) rewardDraft.cost = S.num(v("rCost"));
    var a = U.el("#rActive");
    if (a) rewardDraft.active = a.checked;
  }
  function redrawRewardEditor() {
    captureReward();
    var body = U.el(".modal-body");
    if (body) body.innerHTML = rewardEditorBody();
  }

  /* ================= kids ================= */

  function kidsTab() {
    var s = S.get();
    var html = '<div class="wrap"><div class="row between"><h1>' + esc(t("kids.title")) + "</h1>" +
      '<button class="btn small" data-act="p.childNew">＋ ' + esc(t("kids.add")) + "</button></div>";
    html += s.children.length
      ? '<div class="card flush"><ul class="list">' + s.children.map(function (c) {
          return '<li class="tappable" data-act="p.openChild" data-id="' + c.id + '">' +
            U.avatar(c.avatar, 44) +
            '<div class="grow"><div class="title">' + U.name(c) + "</div>" +
            '<div class="sub">' + esc(t("kids.week")) + " " + U.points(S.weekEarned(c.id)) +
            " · " + esc(t("lang." + (c.lang || S.get().settings.lang))) + "</div></div>" +
            '<strong class="score" style="font-size:1.15rem">' + S.balance(c.id) + "</strong></li>";
        }).join("") + "</ul></div>"
      : U.emptyState(t("common.empty"), "🧒");
    return html + "</div>";
  }

  function childDetail(childId) {
    var c = S.child(childId);
    if (!c) return kidsTab();
    var bd = S.birthdayInfo(c);
    var rank = S.standings().findIndex(function (r) { return r.child.id === c.id; }) + 1;

    var html = '<div class="wrap">' +
      '<button class="btn ghost small mb" data-act="p.backKids">← ' + esc(t("common.back")) + "</button>" +
      '<div class="card center">' + U.avatar(c.avatar, 76) +
        "<h1 style=\"margin-top:8px\">" + U.name(c) + "</h1>" +
        '<div class="score" style="font-size:2.4rem">' + S.balance(c.id) + "</div>" +
        '<small>' + esc(t("kids.balance")) + " · " + esc(t("common.rank")) + " " + rank + "</small>" +
        '<div class="row gap mt" style="justify-content:center">' +
          '<button class="btn good small" data-act="p.adjust" data-id="' + c.id + '" data-sign="1">＋ ' + esc(t("common.points")) + "</button>" +
          '<button class="btn danger small" data-act="p.adjust" data-id="' + c.id + '" data-sign="-1">－ ' + esc(t("common.points")) + "</button>" +
          '<button class="btn ghost small" data-act="p.childEdit" data-id="' + c.id + '">✏️ ' + esc(t("kids.profile")) + "</button>" +
        "</div>" +
        '<div class="row gap mt" style="justify-content:center">' +
          '<span class="tag">' + esc(t("kids.week")) + " " + esc(U.signed(S.weekEarned(c.id))) + "</span>" +
          (bd ? '<span class="tag brand">🎂 ' + esc(bd.days === 0 ? t("dash.birthdayToday") : t("dash.daysLeft", { n: U.iso(bd.days) })) + "</span>" : "") +
          (bd ? '<span class="tag">' + esc(t("kids.age", { n: U.iso(bd.age) })) + "</span>" : "") +
          '<span class="tag">' + (c.pin ? "🔒 " + esc(t("kids.pin")) : "🔓 " + esc(t("kids.pinNone"))) + "</span>" +
        "</div>" +
      "</div>";

    html += listCard(c, "gifts", "🎁 " + t("kids.gifts"), t("kids.giftsHint"), t("kids.addGift"), false);
    html += listCard(c, "outings", "🎡 " + t("kids.outings"), t("kids.outingsHint"), t("kids.addOuting"), true);
    html += listCard(c, "notes", "📝 " + t("kids.notes"), t("kids.notesHint"), t("kids.addNote"), false);

    var entries = S.get().ledger.filter(function (l) { return l.childId === c.id; }).slice().reverse();
    html += '<div class="section-title">' + esc(t("kids.history")) + "</div>" +
      '<div class="card flush">' + (entries.length
        ? '<ul class="list">' + entries.slice(0, 40).map(function (l) {
            return "<li><div class=\"grow\"><div class=\"title\">" + ledgerLabelHtml(l) + "</div>" +
              '<div class="sub">' + esc(U.fmtDateTime(l.ts)) + (l.by && S.parent(l.by) ? " · " + esc(S.parent(l.by).name) : "") + "</div></div>" +
              '<div class="pts-cell">' + U.points(l.self) +
              (l.group ? "<small>" + esc(t("tasks.groupPts")) + " " + U.points(l.group) + "</small>" : "") + "</div></li>";
          }).join("") + "</ul>"
        : U.emptyState(t("kids.noHistory"), "📈")) + "</div>";

    html += '<button class="btn danger block mt" data-act="p.childDelete" data-id="' + c.id + '">' +
      esc(t("common.remove")) + " " + U.name(c) + "</button>";
    return html + "</div>";
  }

  function listCard(child, field, title, hint, addLabel, ordered) {
    var items = child[field] || [];
    return '<div class="section-title">' + esc(title) + "</div>" +
      '<div class="card">' +
        '<small>' + esc(hint) + "</small>" +
        (items.length
          ? '<ul class="list" style="margin-top:8px">' + items.map(function (it, i) {
              return "<li>" + (ordered ? '<span class="rank-badge">' + (i + 1) + "</span>" : "") +
                '<div class="grow"><div class="title" style="white-space:pre-wrap">' + U.trHtml(it, "text") + "</div>" +
                '<div class="sub">' + esc(U.fmtDate(it.ts)) + "</div></div>" +
                (ordered && i > 0 ? '<button class="icon-btn" data-act="p.itemMove" data-id="' + child.id + '" data-field="' + field +
                  '" data-item="' + it.id + '" data-dir="-1" aria-label="' + esc(t("kids.moveUp")) + '">↑</button>' : "") +
                '<button class="icon-btn" data-act="p.itemEdit" data-id="' + child.id + '" data-field="' + field +
                  '" data-item="' + it.id + '">✏️</button>' +
                '<button class="icon-btn" data-act="p.itemRemove" data-id="' + child.id + '" data-field="' + field +
                  '" data-item="' + it.id + '">🗑️</button></li>';
            }).join("") + "</ul>"
          : '<p class="muted">' + esc(t("common.empty")) + "</p>") +
        '<form data-act="p.itemAdd" data-id="' + child.id + '" data-field="' + field + '" class="row tight nowrap mt">' +
          '<input type="text" class="grow" name="text" placeholder="' + esc(addLabel) + '">' +
          '<button class="btn small" type="submit">＋</button>' +
        "</form>" +
      "</div>";
  }

  function childEditor(child) {
    var isNew = !child;
    var c = child || { id: "", name: "", avatar: nextFreeAvatar(), birthday: "", pin: null };
    editingNameLang = global.I18N.lang;
    editingNames = S.clone(c.names || {});
    if (c.name && !editingNames[editingNameLang] && !Object.keys(editingNames).length) {
      editingNames[editingNameLang] = c.name;
    }
    U.modal(isNew ? t("kids.add") : t("kids.profile"),
      '<form data-act="p.childSave" data-id="' + (c.id || "") + '">' +
        U.nameField({ field: "cnName", label: t("setup.childName"),
                      names: editingNames, lang: editingNameLang, action: "p.nameLang" }) +
        '<div class="grid-2">' +
          '<div class="field"><label for="cnBday">' + esc(t("setup.birthday")) + "</label>" +
            '<input id="cnBday" type="date" value="' + esc(c.birthday || "") + '"></div>' +
          '<div class="field"><label for="cnPin">' + esc(t("kids.pin")) + " <small>(" + esc(t("common.optional")) + ")</small></label>" +
            '<input id="cnPin" type="tel" inputmode="numeric" maxlength="4" class="pin-input" placeholder="' +
              (c.pin ? "••••" : "") + '"><div class="hint">' + esc(t("setup.pinHelp")) + "</div>" +
              (c.pin
                ? '<label class="row tight" style="margin-top:6px"><input type="checkbox" id="cnPinClear" style="width:auto"> ' +
                  esc(t("kids.pinRemove")) + "</label>"
                : "") + "</div>" +
        (isNew ? '<p class="hint">' + esc(t("kids.willStartWith", { n: U.iso(S.num(S.get().settings.startPoints)) })) + "</p>" : "") +
        '<div class="field"><span class="field-label">' + esc(t("tr.childLang")) + "</span>" +
          langChips(c.lang || S.get().settings.lang, "p.childLang") + "</div>" +
        '<div class="field"><span class="field-label">' + esc(t("common.avatar")) + "</span>" +
          U.avatarPicker(global.AVATARS.kids, c.avatar, "p.childAvatar") + "</div>" +
        '<button class="btn block" type="submit">' + esc(t("common.save")) + "</button>" +
      "</form>");
    editingAvatar = c.avatar;
    editingLang = c.lang || S.get().settings.lang;
  }
  var editingNames = {}, editingNameLang = "en";
  var editingAvatar = "k1";
  var editingLang = "en";
  function nextFreeAvatar() {
    var used = S.get().children.map(function (c) { return c.avatar; });
    var free = global.AVATARS.kids.filter(function (a) { return used.indexOf(a.id) === -1; })[0];
    return free ? free.id : "k1";
  }

  /* ================= approvals ================= */

  function approvalsTab() {
    var pending = S.pendingClaims();
    var html = '<div class="wrap"><h1>' + esc(t("appr.title")) + "</h1>";
    if (!pending.length) return html + U.emptyState(t("appr.empty"), "✅") + "</div>";

    html += '<div class="card flush"><ul class="list">' + pending.map(function (cl) {
      var c = S.child(cl.childId);
      if (!c) return "";
      var isReward = cl.kind === "reward";
      var item = isReward ? S.reward(cl.rewardId) : S.task(cl.taskId);
      if (!item) return "";
      var cost = isReward ? S.num(item.cost) : 0;
      var afford = !isReward || S.balance(c.id) >= cost;

      var value = isReward
        ? U.points(-cost) + ' <small>' + esc(t("rewards.balanceAfter", { n: U.iso(S.balance(c.id) - cost) })) + "</small>"
        : (item.scope !== "group" ? U.points(item.onDoneSelf) : "") +
          (item.scope !== "personal" ? " <small>" + esc(t("tasks.groupPts")) + "</small> " + U.points(item.onDoneGroup) : "");

      return "<li>" + U.avatar(c.avatar, 40) +
        '<div class="grow"><div class="title">' + (isReward ? (item.icon || "🎁") + " " : "") + U.keyedTitleHtml(item) + "</div>" +
        '<div class="sub" title="' + esc(t("appr.claimedAt", { when: U.fmtDateTime(cl.ts) })) + '">' +
          U.name(c) + " · " +
          esc(isReward ? t("appr.wantsReward") : t("appr.claimedAt", { when: U.relTime(cl.ts) })) + "</div>" +
        '<div class="sub">' + value +
          (afford ? "" : ' <span class="tag bad">' + esc(t("rewards.short", { n: U.iso(cost - S.balance(c.id)) })) + "</span>") +
        "</div></div>" +
        '<div class="row tight nowrap">' +
          '<button class="btn small good" data-act="p.claim" data-id="' + cl.id + '" data-ok="1"' +
            (afford ? "" : " disabled") + ">✓</button>" +
          '<button class="btn small ghost" data-act="p.claim" data-id="' + cl.id + '" data-ok="0">✗</button>' +
        "</div></li>";
    }).join("") + "</ul></div>";

    return html + "</div>";
  }

  /* ================= family settings ================= */

  function familyTab() {
    var s = S.get();
    var html = '<div class="wrap"><h1>' + esc(t("family.title")) + "</h1>";

    var mine = me();
    html += '<form data-act="p.settingsSave" class="card">' +
      U.nameField({ field: "sName", label: t("setup.familyName"),
                    names: familyNames(), lang: familyNameLang, action: "p.familyNameLang" }) +
      '<div class="field"><span class="field-label">' + esc(t("tr.yourLang")) + "</span>" +
        langChips(mine.lang || s.settings.lang, "p.myLang") +
        '<div class="hint">' + esc(t("tr.userLangHint")) + "</div></div>" +
      '<div class="field"><span class="field-label">' + esc(t("tr.defaultLang")) + "</span>" +
        langChips(s.settings.lang, "p.lang") + "</div>" +
      '<div class="field"><label for="sStart">' + esc(t("family.startPoints")) + "</label>" +
        '<input id="sStart" type="number" min="0" step="10" value="' + S.num(s.settings.startPoints) + '">' +
        '<div class="hint">' + esc(t("family.startPointsHint")) + "</div></div>" +
      '<div class="field"><label for="sPrize">' + esc(t("family.weeklyPrize")) + "</label>" +
        '<input id="sPrize" type="text" value="' + esc(s.settings.weeklyPrize || "") +
        '" placeholder="' + esc(t("movie.prizeDefault")) + '">' +
        '<div class="hint">' + esc(t("family.weeklyPrizeHint")) + "</div></div>" +
      '<div class="grid-2">' +
        '<div class="field"><label for="sWeek">' + esc(t("family.weekStart")) + "</label><select id=\"sWeek\">" +
          [0, 1, 2, 3, 4, 5, 6].map(function (d) {
            return '<option value="' + d + '"' + (d === S.num(s.settings.weekStart) ? " selected" : "") + ">" + esc(U.weekdayName(d)) + "</option>";
          }).join("") + "</select></div>" +
        '<div class="field"><label for="sMovie">' + esc(t("family.movieDay")) + "</label><select id=\"sMovie\">" +
          [0, 1, 2, 3, 4, 5, 6].map(function (d) {
            return '<option value="' + d + '"' + (d === S.num(s.settings.movieDay) ? " selected" : "") + ">" + esc(U.weekdayName(d)) + "</option>";
          }).join("") + '</select><div class="hint">' + esc(t("family.movieDayHint")) + "</div></div>" +
      "</div>" +
      '<button class="btn block" type="submit">' + esc(t("common.save")) + "</button></form>";

    html += '<div class="section-title">' + esc(t("family.parents")) +
      '<button class="btn small soft" data-act="p.parentNew">＋</button></div>' +
      '<div class="card flush"><ul class="list">' + s.parents.map(function (p) {
        return "<li>" + U.avatar(p.avatar, 40) +
          '<div class="grow"><div class="title">' + U.name(p) + "</div>" +
          '<div class="sub">' + esc(p.username) + " · " + esc(t("lang." + (p.lang || s.settings.lang))) + "</div></div>" +
          '<button class="icon-btn" data-act="p.parentEdit" data-id="' + p.id + '">✏️</button>' +
          (s.parents.length > 1 ? '<button class="icon-btn" data-act="p.parentDelete" data-id="' + p.id + '">🗑️</button>' : "") +
          "</li>";
      }).join("") + "</ul></div>";

    html += '<div class="section-title">' + esc(t("family.categories")) +
      '<button class="btn small soft" data-act="p.catNew">＋</button></div>' +
      '<div class="card flush"><ul class="list">' + s.categories.map(function (c) {
        return "<li><span class=\"rank-badge\">" + c.icon + "</span>" +
          '<div class="grow"><div class="title">' + U.categoryNameHtml(c) + "</div>" +
          '<div class="sub">' + s.tasks.filter(function (t2) { return t2.categoryId === c.id; }).length + " " + esc(t("tasks.title")) + "</div></div>" +
          '<button class="icon-btn" data-act="p.catEdit" data-id="' + c.id + '">✏️</button>' +
          '<button class="icon-btn" data-act="p.catDelete" data-id="' + c.id + '">🗑️</button></li>';
      }).join("") + "</ul></div>";

    html += syncCard();
    html += translationCard();

    html += '<div class="section-title">' + esc(t("family.data")) + "</div>" +
      '<div class="card stack">' +
        '<button class="btn ghost block" data-act="p.export">⬇️ ' + esc(t("family.export")) + "</button>" +
        '<button class="btn ghost block" data-act="p.import">⬆️ ' + esc(t("family.import")) + "</button>" +
        '<button class="btn danger block" data-act="p.reset">🗑️ ' + esc(t("family.reset")) + "</button>" +
        '<small>' + esc(t("family.aboutText")) + "</small>" +
      "</div>";

    return html + "</div>";
  }

  /* The family's own name, written per language, edited in settings. */
  var familyNameLang = "en", familyNamesDraft = null;
  function familyNames() {
    var set = S.get().settings;
    if (!familyNamesDraft) {
      familyNamesDraft = S.clone(set.familyNames || {});
      familyNameLang = global.I18N.lang;
      if (set.familyName && !Object.keys(familyNamesDraft).length) {
        familyNamesDraft[familyNameLang] = set.familyName;
      }
    }
    return familyNamesDraft;
  }

  function langChips(active, action, extra) {
    return '<div class="chips">' + global.I18N.langs.map(function (l) {
      return '<button type="button" class="chip' + (l.code === active ? " on" : "") +
        '" data-act="' + action + '" data-lang="' + l.code + '"' + (extra || "") + ">" +
        l.flag + " " + esc(l.label) + "</button>";
    }).join("") + "</div>";
  }

  function syncCard() {
    var st = global.Sync.status();
    var line = !st.connected ? t("sync.off") : t("sync." + (st.state === "off" ? "idle" : st.state));
    var dot = !st.connected ? "⚪"
            : st.state === "syncing" ? "🔄"
            : st.state === "offline" ? "🟠"
            : st.state === "error" ? "🔴" : "🟢";

    var body = '<small>' + esc(t("sync.hint")) + "</small>" +
      '<div class="kv"><span class="k">' + esc(t("common.status")) + "</span><span>" +
        dot + " " + esc(line) + "</span></div>";

    if (st.connected) {
      body += '<div class="kv"><span class="k">' + esc(t("sync.lastSync", { when: "" }).replace("{when}", "")) +
        "</span><span>" + esc(st.lastSyncAt ? U.fmtDateTime(st.lastSyncAt) : t("sync.never")) + "</span></div>" +
        '<div class="row gap mt">' +
          '<button class="btn grow" data-act="p.syncInvite">🔗 ' + esc(t("sync.invite")) + "</button>" +
          '<button class="btn ghost" data-act="p.syncNow">' + esc(t("sync.now")) + "</button>" +
        "</div>" +
        '<button class="btn ghost block mt" data-act="p.syncOff">' + esc(t("sync.disconnect")) + "</button>";
    } else {
      body += '<button class="btn block mt" data-act="p.syncOn">☁️ ' + esc(t("sync.connect")) + "</button>" +
        '<button class="btn ghost block mt" data-act="app.join">' + esc(t("sync.join")) + "</button>";
    }

    return '<div class="section-title">' + esc(t("sync.title")) + "</div>" +
      '<div class="card">' + body + '<div class="hint">' + esc(t("sync.privacy")) + "</div></div>";
  }

  function translationCard() {
    var s = S.get();
    var on = s.settings.translate !== false;
    var st = global.Translate.status();
    var line = !st.supported ? t("tr.unsupported")
             : st.state === "working" ? t("tr.working")
             : st.state === "needs-download" ? t("tr.prepare")
             : t("tr.ready");

    return '<div class="section-title">' + esc(t("tr.title")) + "</div>" +
      '<div class="card">' +
        '<small>' + esc(t("tr.hint")) + "</small>" +
        '<label class="row tight mt"><input type="checkbox" style="width:auto"' + (on ? " checked" : "") +
          ' data-act="p.trToggle"> ' + esc(t("tr.enabled")) + "</label>" +
        '<div class="kv"><span class="k">' + esc(t("common.status")) + "</span><span>" +
          (st.supported ? "" : "⚠️ ") + esc(line) + "</span></div>" +
        (st.supported && on
          ? '<button class="btn ghost block mt" data-act="p.trPrepare">⬇️ ' + esc(t("tr.prepare")) + "</button>"
          : "") +
        '<div class="hint">' + esc(t("tr.privacy")) + "</div>" +
      "</div>";
  }

  /* ================= actions ================= */

  U.on("p.goApprovals", function () { global.App.go({ tab: "approvals" }); });
  U.on("p.openChild", function (d) { global.App.go({ tab: "kids", params: { childId: d.id } }); });
  U.on("p.backKids", function () { global.App.go({ tab: "kids", params: {} }); });
  U.on("p.toggleInactive", function (d, node) { showInactive = node.checked; global.App.refresh(); });

  U.on("p.taskNew", function () { taskEditor(null); });
  U.on("p.taskEdit", function (d) { taskEditor(S.task(d.id)); });
  U.on("p.taskScope", function (d) { taskDraft.scope = d.scope; redrawTaskEditor(); });
  U.on("p.taskAssign", function (d) { taskDraft.assign = d.mode; redrawTaskEditor(); });
  U.on("p.taskChild", function (d) {
    captureTask();
    var ids = taskDraft.assignIds || [];
    var i = ids.indexOf(d.id);
    if (i === -1) ids.push(d.id); else ids.splice(i, 1);
    taskDraft.assignIds = ids;
    redrawTaskEditor();
  });
  U.on("p.taskSave", function () {
    captureTask();
    if (!taskDraft.title) { U.toast(t("common.required"), "bad"); return; }
    if (taskDraft.assign === "some" && !(taskDraft.assignIds || []).length) taskDraft.assign = "all";
    // A renamed seed task keeps the literal title instead of the translation key.
    if (taskDraft.titleKey && taskDraft.title !== t(taskDraft.titleKey)) taskDraft.titleKey = "";
    if (taskDraft.titleKey) taskDraft.title = "";
    S.saveTask(taskDraft);
    U.closeModal();
    U.toast(t("common.saved"), "good");
    global.App.refresh();
  });
  U.on("p.taskDelete", function (d) {
    U.confirmDialog(t("tasks.deleteConfirm"), function () {
      S.deleteTask(d.id);
      U.toast(t("common.saved"), "good");
      global.App.refresh();
    });
  });

  U.on("p.award", function (d) {
    var task = S.task(d.id);
    if (!task) return;
    var kids = S.get().children.filter(function (c) {
      return task.assign === "all" || (task.assignIds || []).indexOf(c.id) !== -1;
    });
    if (!kids.length) return U.toast(t("common.empty"), "bad");
    if (kids.length === 1) return applyAward(kids[0].id, task, d.outcome);
    awardCtx = { taskId: task.id, outcome: d.outcome };
    U.modal(t("tasks.pickChild"),
      '<p class="lead">' + esc(U.taskTitle(task)) + " · " +
        esc(d.outcome === "done" ? t("tasks.markDone") : t("tasks.markMissed")) + "</p>" +
      '<div class="kid-grid">' + kids.map(function (c) {
        return '<button class="kid-card" data-act="p.awardPick" data-id="' + c.id + '">' +
          U.avatar(c.avatar, 52) + '<span class="nm">' + U.name(c) + "</span></button>";
      }).join("") + "</div>");
  });
  U.on("p.awardPick", function (d) {
    var task = S.task(awardCtx.taskId);
    U.closeModal();
    applyAward(d.id, task, awardCtx.outcome);
  });
  function applyAward(childId, task, outcome) {
    var entry = S.awardTask(childId, task.id, outcome, me().id);
    var c = S.child(childId);
    U.toast(t("tasks.awarded", { name: S.nameOf(c), sign: "", n: U.signed(entry.self) }),
      entry.self >= 0 ? "good" : "bad");
    global.App.refresh();
  }

  U.on("p.adjust", function (d) {
    var c = S.child(d.id);
    var sign = S.num(d.sign) < 0 ? -1 : 1;
    U.modal(t("kids.adjust") + " · " + c.name,
      '<form data-act="p.adjustSave" data-id="' + c.id + '" data-sign="' + sign + '">' +
        '<div class="field"><label for="aAmount">' + esc(t("kids.amount")) + "</label>" +
          '<input id="aAmount" type="number" min="1" value="10"></div>' +
        '<div class="field"><label for="aReason">' + esc(t("kids.reason")) + "</label>" +
          '<input id="aReason" type="text"></div>' +
        '<label class="row tight"><input id="aGroup" type="checkbox" style="width:auto"> ' +
          esc(t("tasks.groupPts")) + "</label>" +
        '<button class="btn block mt" type="submit">' + esc(t("common.save")) + "</button>" +
      "</form>");
  });
  U.on("p.adjustSave", function (d, form) {
    var amount = Math.abs(S.num(U.el("#aAmount", form).value)) * S.num(d.sign);
    var reason = U.el("#aReason", form).value.trim();
    var toGroup = U.el("#aGroup", form).checked;
    S.adjust(d.id, toGroup ? 0 : amount, toGroup ? amount : 0, reason, me().id);
    U.closeModal();
    U.toast(t("common.saved"), "good");
    global.App.refresh();
  });

  U.on("p.childNew", function () { childEditor(null); });
  U.on("p.childEdit", function (d) { childEditor(S.child(d.id)); });
  U.on("p.childAvatar", function (d) {
    editingAvatar = d.avatar;
    U.els(".modal-body .avatar-pick").forEach(function (b) {
      b.classList.toggle("sel", b.dataset.avatar === d.avatar);
    });
  });
  U.on("p.childSave", function (d, form) {
    var typed = U.el("#cnName", form).value.trim();
    if (typed) editingNames[editingNameLang] = typed; else delete editingNames[editingNameLang];
    var name = editingNames[editingNameLang] ||
      Object.keys(editingNames).map(function (k) { return editingNames[k]; })[0] || "";
    if (!name) return U.toast(t("setup.errChildName"), "bad");
    var birthday = U.el("#cnBday", form).value;
    var pin = U.el("#cnPin", form).value.replace(/\D/g, "");
    if (pin && pin.length !== 4) return U.toast(t("setup.errPin"), "bad");
    var clearPin = U.el("#cnPinClear", form);
    if (d.id) {
      S.updateChild(d.id, { name: name, names: S.clone(editingNames), birthday: birthday,
                            avatar: editingAvatar, lang: editingLang });
      if (clearPin && clearPin.checked) S.setChildPin(d.id, null);
      else if (pin) S.setChildPin(d.id, pin);
    } else {
      S.addChild({ name: name, names: S.clone(editingNames), birthday: birthday,
                   avatar: editingAvatar, pin: pin, lang: editingLang }, me().id);
    }
    U.closeModal();
    U.toast(t("common.saved"), "good");
    global.App.refresh();
  });
  U.on("p.childDelete", function (d) {
    var c = S.child(d.id);
    U.confirmDialog(t("kids.deleteConfirm", { name: S.nameOf(c) }), function () {
      S.removeChild(d.id);
      global.App.go({ tab: "kids", params: {} });
    });
  });

  U.on("p.itemAdd", function (d, form) {
    var input = form.querySelector('input[name="text"]');
    var text = input.value.trim();
    if (!text) return;
    S.addListItem(d.id, d.field, text);
    input.value = "";
    global.App.refresh();
  });
  U.on("p.itemEdit", function (d) {
    var c = S.child(d.id);
    var item = (c[d.field] || []).filter(function (i) { return i.id === d.item; })[0];
    if (!item) return;
    U.modal(t("common.edit"),
      '<form data-act="p.itemSave" data-id="' + d.id + '" data-field="' + d.field + '" data-item="' + d.item + '">' +
        '<div class="field"><textarea name="text">' + esc(item.text) + "</textarea></div>" +
        '<button class="btn block" type="submit">' + esc(t("common.save")) + "</button></form>");
  });
  U.on("p.itemSave", function (d, form) {
    var text = form.querySelector('[name="text"]').value.trim();
    if (!text) return U.toast(t("common.required"), "bad");
    S.updateListItem(d.id, d.field, d.item, text);
    U.closeModal();
    U.toast(t("common.saved"), "good");
    global.App.refresh();
  });
  U.on("p.itemRemove", function (d) {
    S.removeListItem(d.id, d.field, d.item);
    global.App.refresh();
  });
  U.on("p.itemMove", function (d) {
    S.moveListItem(d.id, d.field, d.item, S.num(d.dir));
    global.App.refresh();
  });

  U.on("p.rewardNew", function () { rewardEditor(null); });
  U.on("p.rewardEdit", function (d) { rewardEditor(S.reward(d.id)); });
  U.on("p.rewardKind", function (d) { rewardDraft.kind = d.kind; redrawRewardEditor(); });
  U.on("p.rewardAssign", function (d) { rewardDraft.assign = d.mode; redrawRewardEditor(); });
  U.on("p.rewardIcon", function (d) { rewardDraft.icon = d.icon; redrawRewardEditor(); });
  U.on("p.rewardChild", function (d) {
    captureReward();
    var ids = rewardDraft.assignIds || [];
    var i = ids.indexOf(d.id);
    if (i === -1) ids.push(d.id); else ids.splice(i, 1);
    rewardDraft.assignIds = ids;
    redrawRewardEditor();
  });
  U.on("p.rewardSave", function () {
    captureReward();
    if (!rewardDraft.title) return U.toast(t("common.required"), "bad");
    if (rewardDraft.assign === "some" && !(rewardDraft.assignIds || []).length) rewardDraft.assign = "all";
    if (rewardDraft.titleKey && rewardDraft.title !== t(rewardDraft.titleKey)) rewardDraft.titleKey = "";
    if (rewardDraft.titleKey) rewardDraft.title = "";
    S.saveReward(rewardDraft);
    U.closeModal();
    U.toast(t("common.saved"), "good");
    global.App.refresh();
  });
  U.on("p.rewardDelete", function (d) {
    U.confirmDialog(t("rewards.deleteConfirm"), function () {
      S.deleteReward(d.id);
      U.closeModal();
      global.App.refresh();
    });
  });

  /* Handing over a reward: family ones name the chooser, child ones ask which
     child is spending their points. */
  U.on("p.giveReward", function (d) {
    var r = S.reward(d.id);
    if (!r) return;
    if (r.kind === "family") return familyRedeemModal(r);
    var kids = S.get().children.filter(function (c) {
      return r.assign === "all" || (r.assignIds || []).indexOf(c.id) !== -1;
    });
    if (!kids.length) return U.toast(t("common.empty"), "bad");
    U.modal(U.keyedTitle(r),
      '<p class="lead">' + esc(t("rewards.cost")) + " " + S.num(r.cost) + " " + esc(t("common.points")) + "</p>" +
      '<div class="kid-grid">' + kids.map(function (c) {
        var left = S.balance(c.id) - S.num(r.cost);
        return '<button class="kid-card" data-act="p.giveRewardTo" data-reward="' + r.id + '" data-id="' + c.id + '"' +
          (left < 0 ? " disabled" : "") + ">" +
          U.avatar(c.avatar, 52) + '<span class="nm">' + U.name(c) + "</span>" +
          '<span class="tag">' + (left < 0 ? esc(t("rewards.short", { n: U.iso(-left) }))
                                           : esc(t("rewards.balanceAfter", { n: U.iso(left) }))) + "</span></button>";
      }).join("") + "</div>");
  });
  U.on("p.giveRewardTo", function (d) {
    var r = S.reward(d.reward);
    var c = S.child(d.id);
    if (!S.redeem(r.id, c.id, "", me().id)) return U.toast(t("rewards.tooExpensive", { name: S.nameOf(c) }), "bad");
    U.closeModal();
    U.toast(t("rewards.redeemed", { name: U.keyedTitle(r), n: U.iso(S.num(r.cost)) }), "good");
    global.App.refresh();
  });

  U.on("p.redeemFamily", function () {
    var gp = S.goalProgress();
    if (!gp.reached) return U.toast(t("rewards.short", { n: U.iso(gp.missing) }), "bad");
    if (gp.unlocked.length === 1) return familyRedeemModal(gp.unlocked[0]);
    U.modal(t("rewards.pick"),
      '<div class="stack">' + gp.unlocked.map(function (r) {
        return '<button class="btn ghost block" data-act="p.giveReward" data-id="' + r.id + '">' +
          (r.icon || "🎁") + " " + esc(U.keyedTitle(r)) + " · " + S.num(r.cost) + "</button>";
      }).join("") + "</div>");
  });

  function familyRedeemModal(r) {
    var top = S.topScorer();
    if (!top) return U.toast(t("common.empty"), "bad");
    var wishes = top.child.outings || [];
    U.modal(U.keyedTitle(r),
      '<div class="center">' + U.avatar(top.child.avatar, 64) + "</div>" +
      '<p class="lead center">' + esc(t("rewards.chooser", { name: S.nameOf(top.child) })) + "</p>" +
      '<form data-act="p.redeemSave" data-reward="' + r.id + '" data-id="' + top.child.id + '">' +
        (wishes.length
          ? '<div class="field"><span class="field-label">' + esc(t("kids.outings")) + "</span>" +
            '<div class="chips">' + wishes.map(function (w) {
              return '<button type="button" class="chip" data-act="p.pickWish" data-text="' + esc(w.text) + '">' +
                esc(U.trValue(w, "text")) + "</button>";
            }).join("") + "</div></div>"
          : "") +
        '<div class="field"><label for="ouName">' + esc(t("rewards.detail")) + "</label>" +
          '<input id="ouName" type="text">' +
          '<div class="hint">' + esc(t("rewards.detailHint")) + "</div></div>" +
        '<button class="btn block" type="submit">' + esc(t("rewards.redeem")) + " · " + S.num(r.cost) + "</button>" +
      "</form>");
  }

  U.on("p.claim", function (d) {
    var approve = d.ok === "1";
    var decided = S.decideClaim(d.id, approve, me().id);
    if (!decided && approve) return U.toast(t("rewards.tooExpensive", { name: "" }).trim(), "bad");
    U.toast(approve ? t("appr.approved") : t("appr.rejected"), approve ? "good" : "");
    global.App.refresh();
  });

  U.on("p.movie", function () {
    var winner = S.weekWinner();
    if (!winner) return U.toast(t("movie.noWinner"), "bad");
    U.modal(weeklyPrize(),
      '<div class="center">' + U.avatar(winner.child.avatar, 64) + "</div>" +
      '<p class="lead center">' + U.name(winner.child) + " · " + esc(weeklyPrize()) + "</p>" +
      '<form data-act="p.movieSave" data-id="' + winner.child.id + '">' +
        '<div class="field"><label for="mvName">' + esc(t("movie.movieName")) + "</label>" +
          '<input id="mvName" type="text"></div>' +
        '<div class="field"><label for="mvNote">' + esc(t("common.note")) + "</label>" +
          '<input id="mvNote" type="text"></div>' +
        '<button class="btn block" type="submit">' + esc(t("common.save")) + "</button>" +
      "</form>");
  });
  U.on("p.movieSave", function (d, form) {
    var movie = U.el("#mvName", form).value.trim();
    if (!movie) return U.toast(t("common.required"), "bad");
    S.recordMovieNight(d.id, movie, U.el("#mvNote", form).value.trim(), me().id);
    U.closeModal();
    U.toast(t("movie.recorded"), "good");
    global.App.refresh();
  });

  U.on("p.pickWish", function (d) { U.el("#ouName").value = d.text; });
  U.on("p.redeemSave", function (d, form) {
    var r = S.reward(d.reward);
    var detail = U.el("#ouName", form).value.trim();
    if (!S.redeem(r.id, d.id, detail, me().id)) return U.toast(t("rewards.groupShort"), "bad");
    U.closeModal();
    U.toast(t("rewards.redeemed", { name: detail || U.keyedTitle(r), n: U.iso(S.num(r.cost)) }), "good");
    global.App.refresh();
  });

  U.on("p.lang", function (d) {
    S.get().settings.lang = d.lang;   // only the default for accounts made later
    S.save();
    global.App.refresh();
  });
  U.on("p.myLang", function (d) {
    S.setUserLang("parent", me().id, d.lang);
    global.I18N.setLang(d.lang);
    familyNamesDraft = null;      // re-read the family's names for the new language
    global.App.refresh();
  });
  U.on("p.nameLang", function (d, node) {
    editingNameLang = U.switchNameLang(node.dataset.field, editingNames, editingNameLang, d.lang);
  });
  U.on("p.familyNameLang", function (d, node) {
    familyNameLang = U.switchNameLang(node.dataset.field, familyNames(), familyNameLang, d.lang);
  });
  U.on("p.childLang", function (d, node) {
    editingLang = d.lang;
    U.els(".modal-body [data-act='p.childLang']").forEach(function (b) { b.classList.remove("on"); });
    node.classList.add("on");
  });
  U.on("p.syncOn", function () {
    U.toast(t("sync.working"));
    global.Sync.connect().then(function () {
      global.App.refresh();
      inviteDialog();
    }).catch(function () { U.toast(t("sync.offline"), "bad"); });
  });
  U.on("p.syncNow", function () {
    U.toast(t("sync.syncing"));
    global.Sync.syncNow().then(function () { global.App.refresh(); });
  });
  U.on("p.syncOff", function () {
    U.confirmDialog(t("sync.disconnectWarn"), function () {
      global.Sync.disconnect();
      global.App.refresh();
    });
  });
  U.on("p.syncInvite", inviteDialog);

  function inviteDialog() {
    var link = global.Sync.invite();
    U.modal(t("sync.invite"),
      '<p class="hint">' + esc(t("sync.inviteHint")) + "</p>" +
      '<textarea id="inviteBox" readonly style="min-height:90px;font-family:ui-monospace,monospace;font-size:.75rem">' +
        esc(link) + "</textarea>" +
      '<button class="btn block mt" data-act="p.inviteCopy">📋 ' + esc(t("sync.copyLink")) + "</button>",
      function (body) { var box = U.el("#inviteBox", body); if (box) { box.focus(); box.select(); } });
  }
  U.on("p.inviteCopy", function () {
    var box = U.el("#inviteBox");
    if (!box) return;
    box.select();
    box.setSelectionRange(0, box.value.length);
    var done = false;
    try { done = document.execCommand("copy"); } catch (e) {}
    if (!done && global.navigator.clipboard) {
      return global.navigator.clipboard.writeText(box.value)
        .then(function () { U.toast(t("sync.linkCopied"), "good"); })
        .catch(function () {});
    }
    if (done) U.toast(t("sync.linkCopied"), "good");
  });

  U.on("p.trToggle", function (d, node) {
    S.get().settings.translate = node.checked;
    S.save();
    global.App.refresh();
  });
  U.on("p.trPrepare", function () {
    U.toast(t("tr.working"));
    global.Translate.prepare(function () {
      var st = global.Translate.status();
      U.toast(st.state === "ready" ? t("tr.ready") : t("tr.unsupported"), st.state === "ready" ? "good" : "bad");
      global.App.refresh();
    });
  });
  U.on("p.settingsSave", function (d, form) {
    var s = S.get();
    var names = familyNames();
    var typed = U.el("#sName", form).value.trim();
    if (typed) names[familyNameLang] = typed; else delete names[familyNameLang];
    s.settings.familyNames = names;
    s.settings.familyName = names[familyNameLang] || s.settings.familyName ||
      Object.keys(names).map(function (k) { return names[k]; })[0] || "";
    s.settings.startPoints = Math.max(0, S.num(U.el("#sStart", form).value));
    s.settings.weeklyPrize = U.el("#sPrize", form).value.trim();
    s.settings.weekStart = S.num(U.el("#sWeek", form).value);
    s.settings.movieDay = S.num(U.el("#sMovie", form).value);
    S.save();
    U.toast(t("common.saved"), "good");
    global.App.refresh();
  });

  /* Adding and editing a parent are the same form; editing simply arrives with
     the fields filled in and leaves the password alone unless one is typed. */
  function parentDialog(existing) {
    var s2 = S.get();
    editingNames = existing ? S.clone(existing.names || {}) : {};
    editingNameLang = global.I18N.lang;
    if (existing && existing.name && !Object.keys(editingNames).length) {
      editingNames[editingNameLang] = existing.name;
    }
    parentAvatar = existing ? existing.avatar : "p2";
    parentLang = (existing && existing.lang) || s2.settings.lang;

    U.modal(existing ? t("family.editParent") : t("family.addParent"),
      '<form data-act="p.parentSave" data-id="' + (existing ? existing.id : "") + '">' +
        U.nameField({ field: "npName", label: t("setup.displayName"),
                      names: editingNames, lang: editingNameLang, action: "p.nameLang" }) +
        '<div class="field"><label for="npUser">' + esc(t("setup.username")) + "</label>" +
          '<input id="npUser" type="text" autocapitalize="none" value="' +
            esc(existing ? existing.username : "") + '"></div>' +
        '<div class="field"><label for="npPass">' + esc(existing ? t("family.newPass") : t("setup.password")) + "</label>" +
          '<input id="npPass" type="password" autocomplete="new-password">' +
          (existing ? '<div class="hint">' + esc(t("family.keepPassword")) + "</div>" : "") + "</div>" +
        '<div class="field"><span class="field-label">' + esc(t("tr.yourLang")) + "</span>" +
          langChips(parentLang, "p.parentLang") + "</div>" +
        '<div class="field"><span class="field-label">' + esc(t("common.avatar")) + "</span>" +
          U.avatarPicker(global.AVATARS.parents, parentAvatar, "p.parentAvatar") + "</div>" +
        '<button class="btn block" type="submit">' + esc(t("common.save")) + "</button>" +
      "</form>");
  }
  U.on("p.parentNew", function () { parentDialog(null); });
  U.on("p.parentEdit", function (d) { parentDialog(S.parent(d.id)); });

  var parentAvatar = "p2", parentLang = "en";
  U.on("p.parentAvatar", function (d) {
    parentAvatar = d.avatar;
    U.els(".modal-body .avatar-pick").forEach(function (b) {
      b.classList.toggle("sel", b.dataset.avatar === d.avatar);
    });
  });
  U.on("p.parentLang", function (d, node) {
    parentLang = d.lang;
    U.els(".modal-body [data-act='p.parentLang']").forEach(function (b) {
      b.classList.toggle("on", b.dataset.lang === d.lang);
    });
  });

  U.on("p.parentSave", function (d, form) {
    var typed = U.el("#npName", form).value.trim();
    if (typed) editingNames[editingNameLang] = typed; else delete editingNames[editingNameLang];
    var name = editingNames[editingNameLang] ||
      Object.keys(editingNames).map(function (k) { return editingNames[k]; })[0] || "";
    var user = U.el("#npUser", form).value.trim();
    var pass = U.el("#npPass", form).value;

    if (!name || !user) return U.toast(t("setup.errParent"), "bad");

    if (d.id) {
      var saved = S.updateParent(d.id, {
        name: name, names: S.clone(editingNames),
        username: user, avatar: parentAvatar, lang: parentLang
      });
      if (saved === false) return U.toast(t("family.usernameTaken"), "bad");
      if (!saved) return U.toast(t("common.required"), "bad");
      if (pass) {
        if (pass.length < 4) return U.toast(t("setup.errPassShort"), "bad");
        S.setParentPassword(d.id, pass);
      }
      // editing yourself changes the language you are reading in
      if (d.id === me().id) global.I18N.setLang(parentLang);
    } else {
      if (pass.length < 4) return U.toast(t("setup.errPassShort"), "bad");
      if (S.findParent(user)) return U.toast(t("family.usernameTaken"), "bad");
      var added = S.addParent(name, user, pass, parentAvatar);
      if (!added) return U.toast(t("family.usernameTaken"), "bad");
      added.names = S.clone(editingNames);
      added.lang = parentLang;
      S.save();
    }
    U.closeModal();
    U.toast(t("common.saved"), "good");
    global.App.refresh();
  });

  U.on("p.parentDelete", function (d) {
    if (d.id === me().id) return U.toast(t("family.lastParent"), "bad");
    U.confirmDialog(t("family.deleteParentConfirm"), function () {
      if (!S.removeParent(d.id)) return U.toast(t("family.lastParent"), "bad");
      global.App.refresh();
    });
  });

  U.on("p.catNew", function () {
    U.modal(t("family.addCategory"),
      '<form data-act="p.catSave">' +
        '<div class="field"><label for="ncName">' + esc(t("family.categoryName")) + "</label><input id=\"ncName\" type=\"text\"></div>" +
        '<div class="field"><span class="field-label">' + esc(t("family.icon")) + "</span>" +
          '<div class="chips">' + global.AVATARS.icons.map(function (ic, i) {
            return '<button type="button" class="chip' + (i === 0 ? " on" : "") + '" data-act="p.catIcon" data-icon="' + ic + '">' + ic + "</button>";
          }).join("") + "</div></div>" +
        '<button class="btn block" type="submit">' + esc(t("common.save")) + "</button></form>");
    catIcon = global.AVATARS.icons[0];
  });
  var catIcon = "⭐";
  U.on("p.catIcon", function (d, node) {
    catIcon = d.icon;
    U.els(".modal-body .chips .chip").forEach(function (b) { b.classList.remove("on"); });
    node.classList.add("on");
  });
  U.on("p.catSave", function (d, form) {
    var name = U.el("#ncName", form).value.trim();
    if (!name) return U.toast(t("common.required"), "bad");
    if (d.id) S.saveCategory(d.id, name, catIcon); else S.addCategory(name, catIcon);
    U.closeModal();
    U.toast(t("common.saved"), "good");
    global.App.refresh();
  });
  U.on("p.catEdit", function (d) {
    var cat = S.category(d.id);
    if (!cat) return;
    catIcon = cat.icon;
    U.modal(t("family.editCategory"),
      '<form data-act="p.catSave" data-id="' + cat.id + '">' +
        '<div class="field"><label for="ncName">' + esc(t("family.categoryName")) + "</label>" +
          '<input id="ncName" type="text" value="' + esc(U.categoryName(cat)) + '"></div>' +
        '<div class="field"><span class="field-label">' + esc(t("family.icon")) + "</span>" +
          '<div class="chips">' + global.AVATARS.icons.map(function (ic) {
            return '<button type="button" class="chip' + (ic === cat.icon ? " on" : "") +
              '" data-act="p.catIcon" data-icon="' + ic + '">' + ic + "</button>";
          }).join("") + "</div></div>" +
        '<button class="btn block" type="submit">' + esc(t("common.save")) + "</button></form>");
  });
  U.on("p.catDelete", function (d) {
    var used = S.get().tasks.some(function (t2) { return t2.categoryId === d.id; });
    if (used) return U.toast(t("family.categoryInUse"), "bad");
    S.forget(d.id);
    S.get().categories = S.get().categories.filter(function (c) { return c.id !== d.id; });
    S.save();
    global.App.refresh();
  });

  /* Some places the app runs (an embedded page, a locked-down browser) block a
     page from starting a download, so the backup is always readable as text and
     the file is only a bonus. */
  U.on("p.export", function () {
    var data = JSON.stringify(S.get(), null, 2);
    U.modal(t("family.export"),
      '<p class="hint">' + esc(t("family.exportHint")) + "</p>" +
      '<textarea id="exportBox" readonly style="min-height:170px;font-family:ui-monospace,monospace;font-size:.72rem">' +
        esc(data) + "</textarea>" +
      '<div class="row gap mt">' +
        '<button class="btn grow" data-act="p.exportCopy">📋 ' + esc(t("family.copy")) + "</button>" +
        '<button class="btn ghost grow" data-act="p.exportFile">⬇️ ' + esc(t("family.download")) + "</button>" +
      "</div>",
      function (body) {
        var box = U.el("#exportBox", body);
        if (box) { box.focus(); box.select(); }
      });
  });
  U.on("p.exportCopy", function () {
    var box = U.el("#exportBox");
    if (!box) return;
    box.select();
    box.setSelectionRange(0, box.value.length);
    var done = false;
    try { done = document.execCommand("copy"); } catch (e) { done = false; }
    if (!done && global.navigator.clipboard) {
      return global.navigator.clipboard.writeText(box.value)
        .then(function () { U.toast(t("family.copied"), "good"); })
        .catch(function () { U.toast(t("common.required"), "bad"); });
    }
    U.toast(done ? t("family.copied") : t("family.exportHint"), done ? "good" : "");
  });
  U.on("p.exportFile", function () {
    saveBackupFile("family-points-" + S.dayKey() + ".json", JSON.stringify(S.get(), null, 2));
  });

  /* Saving a file works differently depending on where the app is running. On
     an ordinary page a link does it; inside a viewer that mediates saves, the
     viewer has to be asked and is free to say no. Either way the backup is
     also on screen as text, so nothing is lost if a save is unavailable. */
  function saveBackupFile(filename, data) {
    var host = global.claude;
    if (host && typeof host.use === "function") {
      return host.use("downloads").then(function (downloads) {
        if (!downloads) return U.toast(t("family.exportHint"), "");
        return downloads.save({ filename: filename, data: data })
          .then(function () { U.toast(t("common.saved"), "good"); })
          .catch(function (err) {
            if (err && err.code === "declined") return;   // the viewer said no
            U.toast(t("family.exportHint"), "bad");
          });
      }).catch(function () { U.toast(t("family.exportHint"), "bad"); });
    }
    try {
      var blob = new Blob([data], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) {
      U.toast(t("family.exportHint"), "bad");
    }
  }

  /* Restoring is also how a second device joins a family that already exists,
     so the same dialog is reachable before anyone has signed in. */
  function importDialog() {
    U.modal(t("family.import"),
      '<p class="hint">' + esc(t("family.pasteHint")) + "</p>" +
      '<label class="btn ghost block mb" style="cursor:pointer">📂 ' + esc(t("family.pickFile")) +
        '<input type="file" accept="application/json,.json" id="importFile" style="display:none"></label>' +
      '<textarea id="importBox" style="min-height:150px;font-family:ui-monospace,monospace;font-size:.72rem"></textarea>' +
      '<button class="btn block mt" data-act="p.importText">' + esc(t("family.restore")) + "</button>",
      function () { bindImport(); });
  }
  U.on("p.import", importDialog);
  U.on("app.restore", importDialog);
  U.on("p.importText", function () {
    var box = U.el("#importBox");
    if (box) applyBackup(box.value);
  });

  /* One place decides whether a pasted or uploaded blob is really a backup. */
  function applyBackup(raw) {
    var parsed;
    try {
      parsed = JSON.parse(raw);
      if (!parsed || !parsed.settings || !parsed.children || !parsed.ledger) throw new Error("bad");
    } catch (e) {
      return U.toast(t("family.importBad"), "bad");
    }
    S.replace(parsed);
    global.App.applyUserLang();
    U.closeModal();
    U.toast(t("family.importOk"), "good");
    global.App.refresh();
  }

  U.on("p.reset", function () {
    U.confirmDialog(t("family.resetWarn"), function () {
      S.wipe();
      global.Setup.reset();
      global.App.go({ screen: "setup" });
    });
  });

  /* The file input lives inside a <label> in the import dialog. */
  function bindImport() {
    var input = U.el("#importFile");
    if (!input || input._bound) return;
    input._bound = true;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { applyBackup(reader.result); };
      reader.onerror = function () { U.toast(t("family.importBad"), "bad"); };
      reader.readAsText(file);
    });
  }

  global.ParentView = { render: render };
})(window);
