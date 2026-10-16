(function () {
  const COOKIE_OK = "rd_cookie_ok", C_EMAIL = "rd_email", C_URL = "rd_url", C_KEY = "rd_key", C_PROJ = "rd_project";
  const DAY_W = 28, BACKLOG_DAYS = 7;
  const DEFAULT_MENU_HIDE = ["Desenvolvimento: Em Deploy", "Fechada"];

  let allIssues = [], versions = [], statuses = [], projectMembers = [];
  let rangeStart = null, dayCount = 0, filtered = [];
  let sel = { scope: ["all"], sprint: null, mod: null, status: null };
  let menuVisible = null;

  function setCookie(n, v, days) {
    const d = new Date(); d.setTime(d.getTime() + (days || 30) * 864e5);
    document.cookie = n + "=" + encodeURIComponent(v) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Strict";
  }
  function getCookie(n) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function delCookie(n) { document.cookie = n + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Strict"; }
  function clearAuth() { [C_EMAIL, C_URL, C_KEY, C_PROJ].forEach(delCookie); }
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function toast(msg, err) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.toggle("err", !!err); show(t);
    setTimeout(() => hide(t), 3500);
  }

  async function api(method, path, body) {
    const base = getCookie(C_URL).replace(/\/$/, "");
    const key = getCookie(C_KEY);
    const useProxy = location.port === "8787" || window.REDMINE_USE_PROXY;
    const opts = { method: method || "GET", headers: { Accept: "application/json", "X-Redmine-API-Key": key } };
    const url = useProxy ? "/api" + path : base + path;
    if (useProxy) opts.headers["X-Redmine-Target"] = base;
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error("HTTP " + res.status + ": " + (await res.text()).slice(0, 180));
    if (res.status === 204) return {};
    const txt = await res.text();
    return txt ? JSON.parse(txt) : {};
  }

  function parseYMD(s) {
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function fmtYMD(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function dayIndex(d) {
    if (!d || !rangeStart) return 0;
    return Math.round((d - rangeStart) / 864e5);
  }
  function isWeekend(d) { const w = d.getDay(); return w === 0 || w === 6; }

  function getMod(i) {
    const sub = i.subject || "";
    for (const m of ["M01","M02","M03","M04","M05","M06","M07","M08","M09","INF"]) {
      if (sub.indexOf("[" + m + "]") >= 0) return m;
    }
    const p = (i.project && i.project.name) || "";
    if (p.indexOf("M01") === 0) return "M01";
    if (p.indexOf("M02") === 0) return "M02";
    if (p.indexOf("M03") === 0) return "M03";
    if (/^M0[4-9]/.test(p)) return p.slice(0, 3);
    if (p.indexOf("INF") >= 0) return "INF";
    if (p.indexOf("Legado") >= 0) return "LEG";
    return "OUT";
  }
  function getScope(i) {
    const p = (i.project && i.project.name) || "";
    if (p.indexOf("Legado") >= 0) return "legado";
    if (p.indexOf("INF") >= 0) return "inf";
    return "2.0";
  }
  function projectLabel(i) {
    return ((i.project && i.project.name) || "Sem projeto").trim();
  }
  function shortProject(name) {
    var n = String(name || "");
    if (n.length <= 18) return n;
    return n.slice(0, 16) + "…";
  }
  /** Ordena issues por projeto → módulo → id (visão master hierárquica) */
  function sortByHierarchy(list) {
    return list.slice().sort(function (a, b) {
      var pa = projectLabel(a), pb = projectLabel(b);
      if (pa !== pb) return pa < pb ? -1 : 1;
      var ma = getMod(a), mb = getMod(b);
      if (ma !== mb) return ma < mb ? -1 : 1;
      return a.id - b.id;
    });
  }
  function neonIndex(str, mod) {
    var h = 0;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % (mod || 6);
  }
  function nextSprintName() {
    var max = 0;
    versions.forEach(function (v) {
      var m = String(v.name || "").match(/sprint\s*(\d+)/i);
      if (m) max = Math.max(max, +m[1]);
    });
    return "Sprint " + (max + 1);
  }
  function openNewSprintDialog() {
    var suggested = nextSprintName();
    var name = window.prompt("Nome da nova sprint:", suggested);
    if (name == null) return;
    name = String(name).trim();
    if (!name) { toast("Informe um nome", true); return; }
    createSprint(name);
  }
  async function createSprint(name) {
    var projectId = getCookie(C_PROJ);
    if (!projectId) { toast("Projeto não configurado", true); return; }
    try {
      await api("POST", "/projects/" + projectId + "/versions.json", {
        version: { name: name, status: "open" }
      });
      versions = (await api("GET", "/projects/" + projectId + "/versions.json")).versions || [];
      toast("Sprint criada: " + name);
      fillChips();
      applyFilters();
    } catch (err) {
      toast("Erro ao criar sprint: " + err.message, true);
    }
  }
  function sprintName(i) {
    return (i.fixed_version && i.fixed_version.name) || "Backlog";
  }
  function isBacklogIssue(i) {
    return !i.fixed_version || sprintName(i) === "Backlog";
  }
  function statusClass(name) {
    const s = (name || "").toLowerCase();
    if (s.indexOf("nova") >= 0) return "st-nova";
    if (s.indexOf("valida") >= 0) return "st-valid";
    if (s.indexOf("planej") >= 0) return "st-plan";
    if (s.indexOf("andamento") >= 0) return "st-and";
    if (s.indexOf("pagamento") >= 0) return "st-pag";
    if (s.indexOf("deploy") >= 0) return "st-and";
    if (s.indexOf("resolv") >= 0 || s.indexOf("fechad") >= 0) return "st-done";
    return "st-other";
  }
  function shortStatus(name) {
    return (name || "").replace(/^Desenvolvimento:\s*/, "");
  }
  function cleanSubject(s) {
    return (s || "").replace(/\[HEMOPI\]\s*/g, "").replace(/\[(M0[1-9]|INF|US|TS|EP)\]\s*/g, "").trim();
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /** Renderiza HTML da descrição do Redmine (Textile/HTML rico) de forma segura */
  function safeHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html == null ? "" : html);
    d.querySelectorAll("script,iframe,object,embed,link,meta").forEach(function (el) { el.remove(); });
    d.querySelectorAll("*").forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        if (/^on/i.test(a.name) || (a.name === "href" && /^\s*javascript:/i.test(a.value))) {
          el.removeAttribute(a.name);
        }
      });
    });
    return d.innerHTML;
  }
  /** Detecta se a string parece HTML (tags) */
  function looksLikeHtml(s) {
    return /<[a-z][\s\S]*>/i.test(String(s || ""));
  }

  function versionPeriod(v) {
    if (!v || !v.due_date) return null;
    const due = parseYMD(v.due_date);
    const start = v.start_date ? parseYMD(v.start_date) : addDays(due, -4);
    return { id: v.id, name: v.name, start: start, due: due };
  }

  function versionAtDate(d) {
    for (const v of versions) {
      const p = versionPeriod(v);
      if (p && d >= p.start && d <= p.due) return p;
    }
    return null;
  }

  function renderChips(containerId, items, selectedSet, key) {
    const el = document.getElementById(containerId);
    el.innerHTML = items.map(function (it) {
      const val = typeof it === "string" ? it : it.v;
      const lab = typeof it === "string" ? it : it.l;
      const on = selectedSet === null || selectedSet.has(val);
      return '<button type="button" class="chip' + (on ? " on" : "") + '" data-k="' + key + '" data-v="' + val + '">' + lab + "</button>";
    }).join("");
    el.querySelectorAll(".chip").forEach(function (btn) {
      btn.onclick = function () {
        const v = btn.dataset.v;
        const k = btn.dataset.k;
        if (k === "scope") {
          if (v === "all") sel.scope = ["all"];
          else {
            sel.scope = sel.scope.filter(function (x) { return x !== "all"; });
            if (sel.scope.indexOf(v) >= 0) sel.scope = sel.scope.filter(function (x) { return x !== v; });
            else sel.scope.push(v);
            if (!sel.scope.length) sel.scope = ["all"];
          }
        } else {
          const allVals = items.map(function (x) { return typeof x === "string" ? x : x.v; });
          var set = sel[k] === null ? new Set(allVals) : new Set(sel[k]);
          if (set.has(v)) set.delete(v); else set.add(v);
          if (set.size === 0 || set.size === allVals.length) sel[k] = null;
          else sel[k] = Array.from(set);
        }
        fillChips();
        applyFilters();
      };
    });
  }

  function fillMenuChecks() {
    const el = document.getElementById("menuStatusChecks");
    const list = statuses.length ? statuses : [
      { id: 1, name: "Nova" }, { id: 12, name: "Desenvolvimento: Planejamento" },
      { id: 11, name: "Desenvolvimento: Em Andamento" }, { id: 9, name: "Desenvolvimento: Em Validação" },
      { id: 16, name: "Desenvolvimento: Em Deploy" }, { id: 13, name: "Em Pagamento" },
      { id: 4, name: "Resolvida" }, { id: 5, name: "Fechada" }, { id: 6, name: "Rejeitada" }
    ];
    if (!menuVisible) {
      menuVisible = new Set(list.map(function (s) { return s.name; }).filter(function (n) {
        return DEFAULT_MENU_HIDE.indexOf(n) < 0;
      }));
    }
    el.innerHTML = list.map(function (s) {
      var checked = menuVisible.has(s.name) ? " checked" : "";
      return "<label><input type=\"checkbox\" data-sname=\"" + s.name + "\"" + checked + "/> " + s.name + "</label>";
    }).join("");
    el.querySelectorAll("input").forEach(function (inp) {
      inp.onchange = function () {
        if (inp.checked) menuVisible.add(inp.dataset.sname);
        else menuVisible.delete(inp.dataset.sname);
        var km = document.getElementById("kanbanModal");
        if (km && !km.classList.contains("hidden") && window.__kanbanVersion) {
          openKanban(window.__kanbanVersion.id, window.__kanbanVersion.name);
        }
      };
    });
  }

  function fillChips() {
    renderChips("chipsScope", [
      { v: "all", l: "Todos" }, { v: "2.0", l: "HEMOPI 2.0" },
      { v: "legado", l: "Legado" }, { v: "inf", l: "INF" }
    ], new Set(sel.scope), "scope");

    var sprints = ["Backlog"].concat(versions.map(function (v) { return v.name; }));
    allIssues.forEach(function (i) {
      var n = sprintName(i);
      if (sprints.indexOf(n) < 0) sprints.push(n);
    });
    renderChips("chipsSprint", sprints, sel.sprint === null ? null : new Set(sel.sprint), "sprint");

    var mods = Array.from(new Set(allIssues.map(getMod))).sort();
    renderChips("chipsMod", mods, sel.mod === null ? null : new Set(sel.mod), "mod");

    var sts = Array.from(new Set(allIssues.map(function (i) { return i.status.name; }))).sort();
    renderChips("chipsStatus", sts.map(function (s) { return { v: s, l: shortStatus(s) }; }), sel.status === null ? null : new Set(sel.status), "status");

    fillMenuChecks();
  }

  function applyFilters() {
    filtered = allIssues.filter(function (i) {
      if (sel.scope.indexOf("all") < 0 && sel.scope.indexOf(getScope(i)) < 0) return false;
      if (sel.sprint !== null && sel.sprint.indexOf(sprintName(i)) < 0) return false;
      if (sel.mod !== null && sel.mod.indexOf(getMod(i)) < 0) return false;
      if (sel.status !== null && sel.status.indexOf(i.status.name) < 0) return false;
      return true;
    });
    filtered.sort(function (a, b) {
      var ab = isBacklogIssue(a) ? 0 : 1;
      var bb = isBacklogIssue(b) ? 0 : 1;
      if (ab !== bb) return ab - bb;
      var sa = a.start_date || a.due_date || "9999";
      var sb = b.start_date || b.due_date || "9999";
      if (sa !== sb) return sa < sb ? -1 : 1;
      return a.id - b.id;
    });
    filtered = sortByHierarchy(filtered);
    document.getElementById("fltCount").textContent = filtered.length + " tasks";
    renderGantt();
  }

  function computeRange() {
    var min = null, max = null;
    filtered.forEach(function (i) {
      if (isBacklogIssue(i)) return;
      var s = parseYMD(i.start_date);
      var e = parseYMD(i.due_date);
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
      if (s && (!max || s > max)) max = s;
    });
    versions.forEach(function (v) {
      if (sel.sprint !== null && sel.sprint.indexOf(v.name) < 0) return;
      var p = versionPeriod(v);
      if (!p) return;
      if (!min || p.start < min) min = p.start;
      if (!max || p.due > max) max = p.due;
    });
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (!min) min = addDays(today, -7);
    if (!max) max = addDays(today, 45);
    rangeStart = addDays(min, -2);
    var rangeEnd = addDays(max, 10);
    dayCount = BACKLOG_DAYS + Math.max(14, Math.round((rangeEnd - rangeStart) / 864e5) + 1);
  }

  function versionBands() {
    var sorted = versions.slice().filter(function (v) { return v.due_date; }).sort(function (a, b) {
      return a.due_date < b.due_date ? -1 : 1;
    });
    if (sel.sprint !== null) {
      sorted = sorted.filter(function (v) { return sel.sprint.indexOf(v.name) >= 0; });
    }

    // raw segments in real calendar days (0 = first day after backlog offset)
    var raw = [];
    if (sel.sprint === null || sel.sprint.indexOf("Backlog") >= 0) {
      raw.push({ name: "Backlog", span: BACKLOG_DAYS, backlog: true, versionId: null, startDay: null });
    }

    var day = 0;
    var maxReal = Math.max(0, dayCount - BACKLOG_DAYS);
    while (day < maxReal) {
      var d = addDays(rangeStart, day);
      var hit = null;
      for (var vi = 0; vi < sorted.length; vi++) {
        var p = versionPeriod(sorted[vi]);
        if (p && d >= p.start && d <= p.due) { hit = p; break; }
      }
      if (!hit) {
        if (sel.sprint === null) {
          var j0 = day + 1;
          while (j0 < maxReal) {
            var d0 = addDays(rangeStart, j0);
            var h0 = null;
            for (var k = 0; k < sorted.length; k++) {
              var p0 = versionPeriod(sorted[k]);
              if (p0 && d0 >= p0.start && d0 <= p0.due) { h0 = p0; break; }
            }
            if (h0) break;
            j0++;
          }
          raw.push({ name: "—", span: j0 - day, backlog: false, versionId: null, startDay: day });
          day = j0;
        } else {
          day++;
        }
        continue;
      }
      var j = day + 1;
      while (j < maxReal) {
        var d2 = addDays(rangeStart, j);
        var hit2 = null;
        for (var vj = 0; vj < sorted.length; vj++) {
          var p2 = versionPeriod(sorted[vj]);
          if (p2 && d2 >= p2.start && d2 <= p2.due) { hit2 = p2; break; }
        }
        if (!hit2 || hit2.name !== hit.name) break;
        j++;
      }
      raw.push({ name: hit.name, span: j - day, backlog: false, versionId: hit.id, startDay: day });
      day = j;
    }

    var bands = [];
    var cursor = 0;
    raw.forEach(function (b) {
      bands.push({
        name: b.name,
        from: cursor,
        span: b.span,
        backlog: !!b.backlog,
        versionId: b.versionId || null,
        startDay: b.startDay
      });
      cursor += b.span;
    });
    window.__ganttVisualDays = cursor || 1;
    window.__ganttBands = bands;
    return bands;
  }

  function renderGantt() {
    computeRange();
    var left = document.getElementById("leftBody");
    var head = document.getElementById("timeHead");
    var body = document.getElementById("timeBody");
    var baseUrl = getCookie(C_URL).replace(/\/$/, "");

    var prevP = null, prevM = null;
    left.innerHTML = filtered.map(function (i) {
      var name = cleanSubject(i.subject);
      var proj = projectLabel(i);
      var mod = getMod(i);
      var pCont = prevP === proj;
      var mCont = pCont && prevM === mod;
      prevP = proj;
      prevM = mod;
      var pNeon = "neon-p" + neonIndex(proj, 6);
      var mNeon = "neon-m" + neonIndex(mod, 6);
      return '<div class="gantt-row-label" title="' + escapeHtml(proj + " · " + mod + " · " + name) + '">' +
        '<span class="rail-p ' + pNeon + (pCont ? " rail-cont" : "") + '" title="' + escapeHtml(proj) + '"><span class="rail-txt">' + escapeHtml(shortProject(proj)) + "</span></span>" +
        '<span class="rail-m ' + mNeon + (mCont ? " rail-cont" : "") + '" title="' + escapeHtml(mod) + '"><span class="rail-txt">' + escapeHtml(mod) + "</span></span>" +
        '<a href="' + baseUrl + "/issues/" + i.id + '" target="_blank">#' + i.id + "</a>" +
        '<span class="name">' + escapeHtml(name) + "</span></div>";
    }).join("");

    var bands = versionBands();
    var visualDays = window.__ganttVisualDays || dayCount;
    var sprintHtml = '<div class="sprint-band" style="width:' + (visualDays * DAY_W + 36) + 'px">';
    bands.forEach(function (b) {
      var eye = b.backlog || !b.versionId ? "" :
        '<button type="button" class="eye" data-vid="' + b.versionId + '" data-vname="' + b.name + '" title="Kanban">👁</button>';
      sprintHtml += '<div class="sprint-cell' + (b.backlog ? " backlog-band" : "") + '" style="width:' + b.span * DAY_W + 'px"><span>' + b.name + "</span>" + eye + "</div>";
    });
    sprintHtml += '<button type="button" class="sprint-add" id="btnNewSprint" title="Nova sprint">＋</button></div>';

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var colDates = [];
    bands.forEach(function (b) {
      if (b.backlog) {
        for (var bi = 0; bi < b.span; bi++) colDates.push(null);
      } else {
        for (var si = 0; si < b.span; si++) {
          colDates.push(b.startDay != null ? addDays(rangeStart, b.startDay + si) : null);
        }
      }
    });
    window.__ganttColDates = colDates;

    var dayHtml = '<div class="day-band" style="width:' + visualDays * DAY_W + 'px">';
    for (var di = 0; di < colDates.length; di++) {
      var d = colDates[di];
      if (!d) dayHtml += '<div class="day-cell backlog-day">·</div>';
      else {
        var cls = ["day-cell"];
        if (isWeekend(d)) cls.push("weekend");
        if (fmtYMD(d) === fmtYMD(today)) cls.push("today");
        dayHtml += '<div class="' + cls.join(" ") + '">' + d.getDate() + "</div>";
      }
    }
    dayHtml += "</div>";
    head.innerHTML = sprintHtml + dayHtml;

    head.querySelectorAll(".eye").forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openKanban(+btn.dataset.vid, btn.dataset.vname);
      };
    });
    var btnNs = document.getElementById("btnNewSprint");
    if (btnNs) btnNs.onclick = function (e) { e.stopPropagation(); openNewSprintDialog(); };

    var rows = "";
    filtered.forEach(function (issue) {
      var extras = "";
      bands.forEach(function (b) {
        if (b.backlog) extras += '<div class="bl-zone" style="left:' + b.from * DAY_W + 'px;width:' + b.span * DAY_W + 'px"></div>';
      });
      for (var wi = 0; wi < colDates.length; wi++) {
        if (colDates[wi] && isWeekend(colDates[wi]))
          extras += '<div class="wknd" style="left:' + wi * DAY_W + 'px;width:' + DAY_W + 'px"></div>';
      }
      var bar = "", i0, i1;
      function findCol(date) {
        if (!date) return -1;
        var best = -1;
        for (var ci = 0; ci < colDates.length; ci++) {
          if (colDates[ci] && fmtYMD(colDates[ci]) === fmtYMD(date)) return ci;
          if (colDates[ci] && colDates[ci] <= date) best = ci;
        }
        return best;
      }
      if (isBacklogIssue(issue)) {
        var bl = null;
        for (var bb = 0; bb < bands.length; bb++) if (bands[bb].backlog) bl = bands[bb];
        if (bl) { i0 = bl.from + 1; i1 = bl.from + Math.max(2, bl.span - 2); }
        else { i0 = 0; i1 = 1; }
      } else {
        var s = parseYMD(issue.start_date) || parseYMD(issue.due_date);
        var e = parseYMD(issue.due_date) || s;
        if (s && e) {
          i0 = findCol(s);
          i1 = findCol(e);
          if (i0 < 0) i0 = findCol(e);
          if (i1 < 0) i1 = i0;
          if (i1 < i0) { var t = i0; i0 = i1; i1 = t; }
        }
      }
      if (i0 != null && i0 >= 0) {
        var leftPx = i0 * DAY_W + 1;
        var widthPx = Math.max(DAY_W * 2 - 2, (i1 - i0 + 1) * DAY_W - 2);
        var label = "#" + issue.id + " · " + shortStatus(issue.status.name);
        var who = (issue.assigned_to && issue.assigned_to.name) ? issue.assigned_to.name : "sem responsável";
        var whoShort = who.length > 22 ? who.slice(0, 20) + "…" : who;
        bar = '<div class="bar ' + statusClass(issue.status.name) + '" data-id="' + issue.id + '" style="left:' + leftPx + 'px;width:' + widthPx + 'px" title="' + label + " · " + who.replace(/"/g, "") + '">' +
          '<div class="handle left" data-edge="left"></div>' +
          '<span class="bar-label">' + label + '</span>' +
          '<span class="bar-who"><span class="who-name">' + escapeHtml(whoShort) + '</span></span>' +
          '<span class="bar-actions">' +
          '<button type="button" class="icon-btn eye-btn" title="Ver descrição">👁</button>' +
          '<button type="button" class="icon-btn status-btn" title="Alterar status">☰</button>' +
          '<button type="button" class="icon-btn person-btn" title="Responsável: ' + who.replace(/"/g, "") + '">👤</button>' +
          '</span><div class="handle right" data-edge="right"></div></div>';
      }
      rows += '<div class="gantt-row-track" style="width:' + visualDays * DAY_W + 'px">' + extras + bar + "</div>";
    });
    body.innerHTML = rows;
    bindBarEvents();
  }

  function bindBarEvents() {
    document.querySelectorAll(".bar").forEach(function (bar) {
      var id = +bar.dataset.id;
      var eyeBtn = bar.querySelector(".eye-btn");
      if (eyeBtn) eyeBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openIssueDetail(id);
      });
      var stBtn = bar.querySelector(".status-btn");
      if (stBtn) stBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openStatusMenu(id, ev.clientX, ev.clientY);
      });
      var pBtn = bar.querySelector(".person-btn");
      if (pBtn) pBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openAssigneeMenu(id, ev.clientX, ev.clientY);
      });
      bar.addEventListener("mousedown", function (ev) {
        if (ev.target.closest(".icon-btn")) return;
        ev.preventDefault();
        var edge = ev.target.dataset.edge || null;
        var startX = ev.clientX;
        var origLeft = parseFloat(bar.style.left);
        var origW = parseFloat(bar.style.width);
        var issue = allIssues.find(function (x) { return x.id === id; });
        if (!issue) return;

        function onMove(e) {
          var dx = e.clientX - startX;
          if (edge === "left") {
            var newLeft = Math.max(0, origLeft + dx);
            var newW = origW - (newLeft - origLeft);
            if (newW >= DAY_W) { bar.style.left = newLeft + "px"; bar.style.width = newW + "px"; }
          } else if (edge === "right") {
            bar.style.width = Math.max(DAY_W, origW + dx) + "px";
          } else {
            bar.style.left = Math.max(0, origLeft + dx) + "px";
          }
        }

        async function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          var leftPx = parseFloat(bar.style.left);
          var widthPx = parseFloat(bar.style.width);
          var i0 = Math.round(leftPx / DAY_W);
          var span = Math.max(1, Math.round(widthPx / DAY_W));
          var colDates = window.__ganttColDates || [];
          var bandsNow = window.__ganttBands || [];
          var mid = i0 + Math.floor(span / 2);
          var inBacklog = false;
          for (var bi = 0; bi < bandsNow.length; bi++) {
            if (bandsNow[bi].backlog && mid >= bandsNow[bi].from && mid < bandsNow[bi].from + bandsNow[bi].span) inBacklog = true;
          }
          if (inBacklog) {
            try {
              await api("PUT", "/issues/" + id + ".json", { issue: { fixed_version_id: "" } });
              issue.fixed_version = null;
              toast("#" + id + " → Backlog (sem sprint)");
              applyFilters();
            } catch (err) {
              toast("Erro: " + err.message, true);
              applyFilters();
            }
            return;
          }

          var d0 = colDates[i0];
          var d1 = colDates[Math.min(i0 + span - 1, colDates.length - 1)];
          if (!d0) {
            for (var xi = i0; xi < colDates.length; xi++) if (colDates[xi]) { d0 = colDates[xi]; break; }
          }
          if (!d1) d1 = d0;
          if (!d0) { toast("Solte sobre dias de uma sprint", true); applyFilters(); return; }
          var newStart = d0;
          var newDue = d1 >= d0 ? d1 : d0;
          var ver = versionAtDate(newStart);
          var payload = { start_date: fmtYMD(newStart), due_date: fmtYMD(newDue) };
          if (ver) payload.fixed_version_id = ver.id;

          try {
            await api("PUT", "/issues/" + id + ".json", { issue: payload });
            issue.start_date = payload.start_date;
            issue.due_date = payload.due_date;
            if (ver) {
              issue.fixed_version = { id: ver.id, name: ver.name };
              toast("#" + id + " → " + ver.name + " · " + payload.start_date + " … " + payload.due_date);
            } else {
              toast("#" + id + " → " + payload.start_date + " … " + payload.due_date);
            }
            applyFilters();
          } catch (err) {
            toast("Erro ao salvar: " + err.message, true);
            applyFilters();
          }
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }

  function openStatusMenu(issueId, x, y) {
    var menu = document.getElementById("statusMenu");
    var list = (statuses.length ? statuses : [
      { id: 1, name: "Nova" }, { id: 12, name: "Desenvolvimento: Planejamento" },
      { id: 11, name: "Desenvolvimento: Em Andamento" }, { id: 9, name: "Desenvolvimento: Em Validação" },
      { id: 16, name: "Desenvolvimento: Em Deploy" }, { id: 13, name: "Em Pagamento" },
      { id: 4, name: "Resolvida" }, { id: 5, name: "Fechada" }, { id: 6, name: "Rejeitada" }
    ]).filter(function (s) { return !menuVisible || menuVisible.has(s.name); });

    menu.innerHTML = list.map(function (s) {
      return '<button type="button" data-sid="' + s.id + '">' + s.name + "</button>";
    }).join("") || '<div style="padding:8px;color:#94a3b8;font-size:.8rem">Nenhum status marcado</div>';
    menu.style.left = Math.min(x, window.innerWidth - 240) + "px";
    menu.style.top = Math.min(y, window.innerHeight - 280) + "px";
    show(menu);
    var am = document.getElementById("assigneeMenu");
    if (am) hide(am);
    menu.querySelectorAll("button").forEach(function (btn) {
      btn.onclick = async function () {
        hide(menu);
        try {
          await api("PUT", "/issues/" + issueId + ".json", { issue: { status_id: +btn.dataset.sid } });
          var issue = allIssues.find(function (x) { return x.id === issueId; });
          var st = list.find(function (s) { return s.id === +btn.dataset.sid; });
          if (issue && st) issue.status = { id: st.id, name: st.name };
          toast("#" + issueId + " → " + btn.textContent);
          applyFilters();
        } catch (err) {
          toast("Erro status: " + err.message, true);
        }
      };
    });
  }

  function openAssigneeMenu(issueId, x, y) {
    var menu = document.getElementById("assigneeMenu");
    if (!menu) return;
    var members = projectMembers.slice();
    if (!members.length) {
      members = allIssues.reduce(function (acc, i) {
        if (i.assigned_to && !acc.find(function (m) { return m.id === i.assigned_to.id; })) {
          acc.push({ id: i.assigned_to.id, name: i.assigned_to.name });
        }
        return acc;
      }, []);
    }
    members.sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
    var html = '<button type="button" data-uid="">— Sem responsável —</button>';
    html += members.map(function (m) {
      return '<button type="button" data-uid="' + m.id + '">' + (m.name || ("#" + m.id)) + "</button>";
    }).join("");
    menu.innerHTML = html || '<div style="padding:8px;color:#94a3b8;font-size:.8rem">Nenhum membro encontrado</div>';
    menu.style.left = Math.min(x, window.innerWidth - 240) + "px";
    menu.style.top = Math.min(y, window.innerHeight - 280) + "px";
    show(menu);
    hide(document.getElementById("statusMenu"));
    menu.querySelectorAll("button").forEach(function (btn) {
      btn.onclick = async function () {
        hide(menu);
        var uid = btn.dataset.uid;
        try {
          var payload = { assigned_to_id: uid === "" ? "" : +uid };
          await api("PUT", "/issues/" + issueId + ".json", { issue: payload });
          var issue = allIssues.find(function (x) { return x.id === issueId; });
          if (issue) {
            if (uid === "") issue.assigned_to = null;
            else {
              var m = members.find(function (x) { return String(x.id) === String(uid); });
              issue.assigned_to = m ? { id: m.id, name: m.name } : { id: +uid, name: btn.textContent };
            }
          }
          toast("#" + issueId + " → " + btn.textContent.trim());
          applyFilters();
        } catch (err) {
          toast("Erro responsável: " + err.message, true);
        }
      };
    });
  }

  /* —— Universal modal: drag / resize / fullscreen —— */
  function enhanceModal(cardId) {
    var card = document.getElementById(cardId);
    if (!card || card.dataset.enhanced === "1") return;
    card.dataset.enhanced = "1";
    var head = card.querySelector(".modal-drag");
    var rs = card.querySelector(".modal-resize");
    var fsBtn = card.querySelector(".modal-fs");

    if (head) {
      head.addEventListener("mousedown", function (e) {
        if (e.target.closest("button") || card.classList.contains("is-fs")) return;
        e.preventDefault();
        var r = card.getBoundingClientRect();
        var ox = e.clientX - r.left, oy = e.clientY - r.top;
        card.style.position = "fixed";
        card.style.margin = "0";
        card.style.left = r.left + "px";
        card.style.top = r.top + "px";
        card.style.width = r.width + "px";
        card.style.height = r.height + "px";
        function move(ev) {
          card.style.left = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - ox)) + "px";
          card.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - oy)) + "px";
        }
        function up() {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    }

    if (rs) {
      rs.addEventListener("mousedown", function (e) {
        if (card.classList.contains("is-fs")) return;
        e.preventDefault();
        e.stopPropagation();
        var startX = e.clientX, startY = e.clientY;
        var startW = card.offsetWidth, startH = card.offsetHeight;
        function move(ev) {
          var nw = Math.max(360, startW + (ev.clientX - startX));
          var nh = Math.max(240, startH + (ev.clientY - startY));
          card.style.width = nw + "px";
          card.style.height = nh + "px";
          card.style.maxWidth = "none";
          card.style.maxHeight = "none";
        }
        function up() {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    }

    if (fsBtn) {
      fsBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var on = card.classList.toggle("is-fs");
        fsBtn.textContent = on ? "⛶" : "⛶";
        fsBtn.title = on ? "Sair da tela cheia" : "Tela cheia";
        if (!on) {
          card.style.left = "";
          card.style.top = "";
          card.style.width = "";
          card.style.height = "";
          card.style.position = "";
          card.style.margin = "";
        }
      });
    }
  }

  function resetModalPosition(cardId) {
    var card = document.getElementById(cardId);
    if (!card) return;
    card.classList.remove("is-fs");
    card.style.left = "";
    card.style.top = "";
    card.style.width = "";
    card.style.height = "";
    card.style.position = "";
    card.style.margin = "";
    card.style.maxWidth = "";
    card.style.maxHeight = "";
  }

  async function openIssueDetail(issueId) {
    var modal = document.getElementById("issueModal");
    var titleEl = document.getElementById("issueTitle");
    var metaEl = document.getElementById("issueMeta");
    var bodyEl = document.getElementById("issueBody");
    var baseUrl = getCookie(C_URL).replace(/\/$/, "");
    enhanceModal("issueCard");
    resetModalPosition("issueCard");
    titleEl.textContent = "#" + issueId + " · carregando…";
    metaEl.innerHTML = "";
    bodyEl.textContent = "Carregando descrição…";
    show(modal);
    try {
      var data = await api("GET", "/issues/" + issueId + ".json");
      var issue = data.issue || {};
      var local = allIssues.find(function (x) { return x.id === issueId; }) || issue;
      titleEl.textContent = "#" + issueId + " · " + cleanSubject(issue.subject || local.subject || "");
      var who = (issue.assigned_to && issue.assigned_to.name) || (local.assigned_to && local.assigned_to.name) || "—";
      var st = (issue.status && issue.status.name) || (local.status && local.status.name) || "—";
      var sp = (issue.fixed_version && issue.fixed_version.name) || (local.fixed_version && local.fixed_version.name) || "Backlog";
      metaEl.innerHTML =
        "<span><strong>Status:</strong> " + escapeHtml(shortStatus(st)) + "</span>" +
        "<span><strong>Sprint:</strong> " + escapeHtml(sp) + "</span>" +
        "<span><strong>Responsável:</strong> " + escapeHtml(who) + "</span>" +
        "<span><strong>Início:</strong> " + escapeHtml(issue.start_date || local.start_date || "—") + "</span>" +
        "<span><strong>Fim:</strong> " + escapeHtml(issue.due_date || local.due_date || "—") + "</span>" +
        '<span><a href="' + baseUrl + "/issues/" + issueId + '" target="_blank">Abrir no Redmine ↗</a></span>';
      var desc = issue.description || "";
      if (!desc.trim()) {
        bodyEl.innerHTML = '<span class="muted">Sem descrição cadastrada nesta issue.</span>';
      } else if (looksLikeHtml(desc)) {
        bodyEl.innerHTML = safeHtml(desc);
      } else {
        /* Textile/plain: preserva quebras e escapa */
        bodyEl.innerHTML = escapeHtml(desc).replace(/\n/g, "<br>");
      }
    } catch (err) {
      bodyEl.textContent = "Erro ao carregar: " + err.message;
      toast("Erro descrição: " + err.message, true);
    }
  }

  function openKanban(versionId, versionName) {
    var modal = document.getElementById("kanbanModal");
    document.getElementById("kanbanTitle").textContent = versionName + " · Kanban";
    var board = document.getElementById("kanbanBoard");
    window.__kanbanVersion = { id: versionId, name: versionName };
    enhanceModal("kanbanCard");
    resetModalPosition("kanbanCard");

    // Colunas = EXATAMENTE os status marcados em "Menu — status visíveis" (mesmo vazios)
    var order = ["Nova", "Desenvolvimento: Planejamento", "Desenvolvimento: Em Andamento", "Desenvolvimento: Em Validação", "Desenvolvimento: Em Deploy", "Em Pagamento", "Resolvida", "Fechada", "Rejeitada"];
    var colNames;
    if (menuVisible && menuVisible.size > 0) {
      colNames = Array.from(menuVisible);
    } else if (statuses.length) {
      colNames = statuses.map(function (s) { return s.name; });
    } else {
      colNames = order.slice();
    }
    colNames.sort(function (a, b) {
      var ia = order.indexOf(a); var ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    var issuesInSprint = allIssues.filter(function (i) {
      if (!i.fixed_version || i.fixed_version.id !== versionId) return false;
      if (sel.scope.indexOf("all") < 0 && sel.scope.indexOf(getScope(i)) < 0) return false;
      if (sel.mod !== null && sel.mod.indexOf(getMod(i)) < 0) return false;
      return true;
    });

    var statusIdByName = {};
    statuses.forEach(function (s) { statusIdByName[s.name] = s.id; });
    var FALLBACK = {
      "Nova": 1, "Desenvolvimento: Planejamento": 12, "Desenvolvimento: Em Andamento": 11,
      "Desenvolvimento: Em Validação": 9, "Desenvolvimento: Em Deploy": 16,
      "Em Pagamento": 13, "Resolvida": 4, "Fechada": 5, "Rejeitada": 6
    };

    board.innerHTML = colNames.map(function (st) {
      var cards = issuesInSprint.filter(function (i) { return i.status.name === st; });
      var neon = "neon-other";
      var sl = (st || "").toLowerCase();
      if (sl.indexOf("nova") >= 0) neon = "neon-nova";
      else if (sl.indexOf("planej") >= 0) neon = "neon-plan";
      else if (sl.indexOf("andamento") >= 0) neon = "neon-and";
      else if (sl.indexOf("valida") >= 0) neon = "neon-valid";
      else if (sl.indexOf("deploy") >= 0) neon = "neon-deploy";
      else if (sl.indexOf("pagamento") >= 0) neon = "neon-pag";
      else if (sl.indexOf("resolv") >= 0) neon = "neon-done";
      else if (sl.indexOf("fechad") >= 0) neon = "neon-closed";
      else if (sl.indexOf("rejeit") >= 0) neon = "neon-rej";
      return '<div class="kanban-col ' + neon + '" data-status="' + st + '">' +
        '<div class="kanban-col-head">' + shortStatus(st) + " (" + cards.length + ")</div>" +
        '<div class="kanban-col-body">' +
        cards.map(function (i) {
          var who = (i.assigned_to && i.assigned_to.name) || "sem responsável";
          var whoShort = who.length > 22 ? who.slice(0, 20) + "…" : who;
          var stName = (i.status && i.status.name) || "";
          return '<div class="kanban-card ' + statusClass(stName) + '" draggable="true" data-id="' + i.id + '">' +
            '<div class="kc-top">' +
              '<span class="kc-id">#' + i.id + '</span>' +
              '<span class="kc-st">' + escapeHtml(shortStatus(stName)) + '</span>' +
            '</div>' +
            '<div class="kc-subject">' + escapeHtml(cleanSubject(i.subject)) + '</div>' +
            '<div class="kc-footer">' +
              '<span class="kc-who" title="' + escapeHtml(who) + '">' + escapeHtml(whoShort) + '</span>' +
              '<span class="kc-actions">' +
                '<button type="button" class="icon-btn eye-btn" title="Ver descrição">👁</button>' +
                '<button type="button" class="icon-btn status-btn" title="Alterar status">☰</button>' +
                '<button type="button" class="icon-btn person-btn" title="Responsável: ' + escapeHtml(who) + '">👤</button>' +
              '</span>' +
            '</div></div>';
        }).join("") + "</div></div>";
    }).join("");

    var dragId = null;
    board.querySelectorAll(".kanban-card").forEach(function (card) {
      card.addEventListener("dragstart", function (ev) {
        if (ev.target.closest && ev.target.closest(".icon-btn")) { ev.preventDefault(); return; }
        dragId = +card.dataset.id; card.style.opacity = ".5";
      });
      card.addEventListener("dragend", function () { card.style.opacity = "1"; dragId = null; });
      var id = +card.dataset.id;
      var eye = card.querySelector(".eye-btn");
      if (eye) eye.addEventListener("click", function (ev) { ev.stopPropagation(); openIssueDetail(id); });
      var stBtn = card.querySelector(".status-btn");
      if (stBtn) stBtn.addEventListener("click", function (ev) { ev.stopPropagation(); openStatusMenu(id, ev.clientX, ev.clientY); });
      var pBtn = card.querySelector(".person-btn");
      if (pBtn) pBtn.addEventListener("click", function (ev) { ev.stopPropagation(); openAssigneeMenu(id, ev.clientX, ev.clientY); });
    });
    board.querySelectorAll(".kanban-col-body").forEach(function (colBody) {
      colBody.addEventListener("dragover", function (e) { e.preventDefault(); colBody.classList.add("drag-over"); });
      colBody.addEventListener("dragleave", function () { colBody.classList.remove("drag-over"); });
      colBody.addEventListener("drop", async function (e) {
        e.preventDefault();
        colBody.classList.remove("drag-over");
        if (!dragId) return;
        var stName = colBody.parentElement.dataset.status;
        var sid = statusIdByName[stName] || FALLBACK[stName];
        if (!sid) { toast("Status sem id: " + stName, true); return; }
        try {
          await api("PUT", "/issues/" + dragId + ".json", { issue: { status_id: sid } });
          var issue = allIssues.find(function (x) { return x.id === dragId; });
          if (issue) issue.status = { id: sid, name: stName };
          toast("#" + dragId + " → " + stName);
          openKanban(versionId, versionName);
          applyFilters();
        } catch (err) {
          toast("Erro: " + err.message, true);
        }
      });
    });

    show(modal);
  }

  document.getElementById("kanbanClose").onclick = function () { hide(document.getElementById("kanbanModal")); };
  document.getElementById("kanbanBackdrop").onclick = function () { hide(document.getElementById("kanbanModal")); };
  document.getElementById("issueClose").onclick = function () { hide(document.getElementById("issueModal")); };
  document.getElementById("issueBackdrop").onclick = function () { hide(document.getElementById("issueModal")); };

  /* Filter group: select all / clear */
  document.querySelectorAll(".flt-act").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var box = btn.closest(".filter-box");
      if (!box) return;
      var key = box.dataset.filter;
      var act = btn.dataset.act;
      if (key === "menuStatus") {
        var inputs = document.querySelectorAll("#menuStatusChecks input");
        inputs.forEach(function (inp) {
          inp.checked = act === "all";
          if (act === "all") menuVisible.add(inp.dataset.sname);
          else menuVisible.delete(inp.dataset.sname);
        });
        if (act === "all" && !menuVisible.size) {
          statuses.forEach(function (s) { menuVisible.add(s.name); });
        }
        var km = document.getElementById("kanbanModal");
        if (km && !km.classList.contains("hidden") && window.__kanbanVersion) {
          openKanban(window.__kanbanVersion.id, window.__kanbanVersion.name);
        }
        return;
      }
      if (key === "scope") {
        if (act === "all") sel.scope = ["all"];
        else sel.scope = ["2.0"];
        fillChips();
        applyFilters();
        return;
      }
      /* sprint / mod / status: null = all selected */
      if (act === "all") {
        sel[key] = null;
      } else {
        /* keep one item so filter doesn't go empty oddly — use empty set meaning none */
        sel[key] = [];
      }
      fillChips();
      applyFilters();
    });
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest("#statusMenu") && !e.target.closest(".status-btn"))
      hide(document.getElementById("statusMenu"));
    if (!e.target.closest("#assigneeMenu") && !e.target.closest(".person-btn"))
      hide(document.getElementById("assigneeMenu"));
  });

  document.getElementById("btnToggleFilters").onclick = function () {
    document.getElementById("filterPanel").classList.toggle("collapsed");
  };

  (function bindPan() {
    var right = document.getElementById("ganttRight");
    var panning = false, sx = 0, sy = 0, sl = 0, st = 0;
    right.addEventListener("mousedown", function (e) {
      if (e.target.closest(".bar") || e.target.closest(".eye")) return;
      panning = true; right.classList.add("panning");
      sx = e.clientX; sy = e.clientY; sl = right.scrollLeft; st = right.scrollTop;
    });
    window.addEventListener("mousemove", function (e) {
      if (!panning) return;
      right.scrollLeft = sl - (e.clientX - sx);
      right.scrollTop = st - (e.clientY - sy);
    });
    window.addEventListener("mouseup", function () { panning = false; right.classList.remove("panning"); });
  })();

  document.getElementById("ganttRight").addEventListener("scroll", function () {
    document.getElementById("leftBody").scrollTop = document.getElementById("ganttRight").scrollTop;
  });
  document.getElementById("leftBody").addEventListener("scroll", function () {
    document.getElementById("ganttRight").scrollTop = document.getElementById("leftBody").scrollTop;
  });

  async function loadAll() {
    var loading = document.getElementById("loading");
    show(loading);
    try {
      var projectId = getCookie(C_PROJ);
      if (!projectId) throw new Error("Projeto não informado");
      var issues = [];
      var offset = 0;
      for (;;) {
        var d = await api("GET", "/issues.json?project_id=" + projectId + "&status_id=*&limit=100&offset=" + offset + "&sort=start_date");
        issues = issues.concat(d.issues || []);
        if ((d.issues || []).length < 100) break;
        offset += 100;
      }
      allIssues = issues;
      versions = (await api("GET", "/projects/" + projectId + "/versions.json")).versions || [];
      try { statuses = (await api("GET", "/issue_statuses.json")).issue_statuses || []; } catch (e) {}
      projectMembers = [];
      try {
        var memOff = 0;
        for (;;) {
          var mem = await api("GET", "/projects/" + projectId + "/memberships.json?limit=100&offset=" + memOff);
          var rows = mem.memberships || [];
          rows.forEach(function (row) {
            if (row.user) projectMembers.push({ id: row.user.id, name: row.user.name });
          });
          if (rows.length < 100) break;
          memOff += 100;
        }
      } catch (e) { console.warn("[Gantt] memberships", e); }
      fillChips();
      applyFilters();
    } catch (e) {
      toast("Falha: " + e.message, true);
      console.error(e);
    } finally {
      hide(loading);
    }
  }

  function goLogin() { console.log("[Gantt] goLogin"); hide(document.getElementById("ganttView")); show(document.getElementById("loginView")); }
  function goApp() { console.log("[Gantt] goApp"); hide(document.getElementById("loginView")); show(document.getElementById("ganttView")); loadAll(); }

  document.getElementById("btnAcceptCookies").onclick = function () {
    setCookie(COOKIE_OK, "1", 365);
    hide(document.getElementById("cookieBanner"));
    if (getCookie(C_KEY) && getCookie(C_URL) && getCookie(C_PROJ)) goApp(); else goLogin();
  };
  document.getElementById("btnLogin").onclick = function () {
    var email = document.getElementById("inEmail").value.trim();
    var url = document.getElementById("inUrl").value.trim().replace(/\/$/, "");
    var key = document.getElementById("inKey").value.trim();
    var proj = document.getElementById("inProject").value.trim();
    var err = document.getElementById("loginError");
    err.textContent = "";
    if (!validEmail(email)) { err.textContent = "E-mail inválido"; return; }
    if (!url || !key || !proj) { err.textContent = "Preencha todos os campos"; return; }
    setCookie(C_EMAIL, email, 30); setCookie(C_URL, url, 30); setCookie(C_KEY, key, 30); setCookie(C_PROJ, proj, 30);
    goApp();
  };
  document.getElementById("btnLogout").onclick = function () { clearAuth(); goLogin(); };
  document.getElementById("btnRefresh").onclick = function () { loadAll(); };
  document.getElementById("btnClear").onclick = function () {
    sel = { scope: ["all"], sprint: null, mod: null, status: null };
    fillChips(); applyFilters();
  };
  document.getElementById("btnToday").onclick = function () {
    var right = document.getElementById("ganttRight");
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var idx = BACKLOG_DAYS + dayIndex(today);
    right.scrollLeft = Math.max(0, idx * DAY_W - 200);
  };

  if (!getCookie(COOKIE_OK)) {
    show(document.getElementById("cookieBanner"));
    hide(document.getElementById("loginView"));
    hide(document.getElementById("ganttView"));
  } else if (getCookie(C_KEY) && getCookie(C_URL) && getCookie(C_PROJ)) {
    goApp();
  } else {
    goLogin();
  }
})();
