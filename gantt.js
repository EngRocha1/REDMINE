/* HEMOPI Gantt — chips UX, banda Backlog, #id na barra */
(function () {
  const COOKIE_OK = "rd_cookie_ok", C_EMAIL = "rd_email", C_URL = "rd_url", C_KEY = "rd_key", C_PROJ = "rd_project";
  const DAY_W = 28;
  const BACKLOG_DAYS = 7; // colunas iniciais = zona Backlog

  let allIssues = [], versions = [], statuses = [];
  let rangeStart = null, dayCount = 0, filtered = [];
  let sel = { scope: ["all"], sprint: null, mod: null, status: null }; // null = todos

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
    setTimeout(() => hide(t), 3200);
  }

  async function api(method, path, body) {
    const base = getCookie(C_URL).replace(/\/$/, "");
    const key = getCookie(C_KEY);
    const useProxy = location.port === "8787" || window.REDMINE_USE_PROXY;
    const opts = { method: method || "GET", headers: { Accept: "application/json", "X-Redmine-API-Key": key } };
    let url;
    if (useProxy) {
      url = "/api" + path;
      opts.headers["X-Redmine-Target"] = base;
    } else {
      url = base + path;
    }
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
  function sprintName(i) {
    return (i.fixed_version && i.fixed_version.name) || "Backlog";
  }
  function isBacklogIssue(i) {
    // sem sprint OU ainda Nova sem estar em andamento/validação
    const sp = sprintName(i);
    if (sp === "Backlog" || !i.fixed_version) return true;
    const st = (i.status.name || "").toLowerCase();
    if (st.indexOf("nova") >= 0 && !i.fixed_version) return true;
    return false;
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

  function renderChips(containerId, items, selectedSet, key, multi) {
    const el = document.getElementById(containerId);
    el.innerHTML = items.map((it) => {
      const val = typeof it === "string" ? it : it.v;
      const lab = typeof it === "string" ? it : it.l;
      const on = selectedSet === null || selectedSet.has(val);
      return '<button type="button" class="chip' + (on ? " on" : "") + '" data-k="' + key + '" data-v="' + val + '">' + lab + "</button>";
    }).join("");
    el.querySelectorAll(".chip").forEach((btn) => {
      btn.onclick = () => {
        const v = btn.dataset.v;
        const k = btn.dataset.k;
        if (k === "scope") {
          if (v === "all") {
            sel.scope = ["all"];
          } else {
            sel.scope = sel.scope.filter((x) => x !== "all");
            if (sel.scope.includes(v)) sel.scope = sel.scope.filter((x) => x !== v);
            else sel.scope.push(v);
            if (!sel.scope.length) sel.scope = ["all"];
          }
        } else {
          // toggle in Set stored as array; null = all selected
          let set = sel[k] === null ? new Set(items.map((x) => (typeof x === "string" ? x : x.v))) : new Set(sel[k]);
          if (set.has(v)) set.delete(v); else set.add(v);
          const allVals = items.map((x) => (typeof x === "string" ? x : x.v));
          if (set.size === 0 || set.size === allVals.length) sel[k] = null;
          else sel[k] = Array.from(set);
        }
        fillChips();
        applyFilters();
      };
    });
  }

  function fillChips() {
    const scopes = [
      { v: "all", l: "Todos" },
      { v: "2.0", l: "HEMOPI 2.0" },
      { v: "legado", l: "Legado" },
      { v: "inf", l: "INF" },
    ];
    const scopeSet = new Set(sel.scope);
    renderChips("chipsScope", scopes, scopeSet, "scope");

    const sprints = ["Backlog"].concat(
      versions.map((v) => v.name).filter((n, i, a) => a.indexOf(n) === i).sort()
    );
    // also any sprint names on issues
    allIssues.forEach((i) => {
      const n = sprintName(i);
      if (sprints.indexOf(n) < 0) sprints.push(n);
    });
    const sprintSet = sel.sprint === null ? null : new Set(sel.sprint);
    renderChips("chipsSprint", sprints, sprintSet, "sprint");

    const mods = Array.from(new Set(allIssues.map(getMod))).sort();
    const modSet = sel.mod === null ? null : new Set(sel.mod);
    renderChips("chipsMod", mods, modSet, "mod");

    const sts = Array.from(new Set(allIssues.map((i) => i.status.name))).sort();
    const stSet = sel.status === null ? null : new Set(sel.status);
    renderChips("chipsStatus", sts.map((s) => ({ v: s, l: shortStatus(s) })), stSet, "status");
  }

  function applyFilters() {
    filtered = allIssues.filter((i) => {
      if (!sel.scope.includes("all") && !sel.scope.includes(getScope(i))) return false;
      if (sel.sprint !== null && !sel.sprint.includes(sprintName(i))) return false;
      if (sel.mod !== null && !sel.mod.includes(getMod(i))) return false;
      if (sel.status !== null && !sel.status.includes(i.status.name)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      // backlog first, then by start
      const ab = isBacklogIssue(a) ? 0 : 1;
      const bb = isBacklogIssue(b) ? 0 : 1;
      if (ab !== bb) return ab - bb;
      const sa = a.start_date || a.due_date || "9999";
      const sb = b.start_date || b.due_date || "9999";
      if (sa !== sb) return sa < sb ? -1 : 1;
      return a.id - b.id;
    });
    document.getElementById("fltCount").textContent = filtered.length + " tasks";
    renderGantt();
  }

  function computeRange() {
    let min = null, max = null;
    filtered.forEach((i) => {
      if (isBacklogIssue(i)) return; // backlog fica na zona fixa
      const s = parseYMD(i.start_date);
      const e = parseYMD(i.due_date);
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
      if (s && (!max || s > max)) max = s;
    });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!min) min = addDays(today, -7);
    if (!max) max = addDays(today, 45);
    // rangeStart = início do calendário real (após banda backlog)
    // visual: days 0..BACKLOG_DAYS-1 = backlog, then real days
    rangeStart = addDays(min, -2);
    const rangeEnd = addDays(max, 10);
    dayCount = BACKLOG_DAYS + Math.max(14, dayIndex(rangeEnd) + 1);
  }

  function versionBands() {
    const sorted = versions.slice().filter((v) => v.due_date).sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    const bands = [{ name: "Backlog", from: 0, span: BACKLOG_DAYS, backlog: true }];
    let i = BACKLOG_DAYS;
    while (i < dayCount) {
      const d = addDays(rangeStart, i - BACKLOG_DAYS);
      let name = "";
      for (const v of sorted) {
        const due = parseYMD(v.due_date);
        const start = addDays(due, -4);
        if (d >= start && d <= due) { name = v.name; break; }
      }
      let j = i + 1;
      while (j < dayCount) {
        const d2 = addDays(rangeStart, j - BACKLOG_DAYS);
        let n2 = "";
        for (const v of sorted) {
          const due = parseYMD(v.due_date);
          const start = addDays(due, -4);
          if (d2 >= start && d2 <= due) { n2 = v.name; break; }
        }
        if (n2 !== name) break;
        j++;
      }
      bands.push({ name: name || "—", from: i, span: j - i, backlog: false });
      i = j;
    }
    return bands;
  }

  function renderGantt() {
    computeRange();
    const left = document.getElementById("leftBody");
    const head = document.getElementById("timeHead");
    const body = document.getElementById("timeBody");
    const baseUrl = getCookie(C_URL).replace(/\/$/, "");

    left.innerHTML = filtered.map((i) => {
      const name = cleanSubject(i.subject);
      return '<div class="gantt-row-label" title="' + name.replace(/"/g, "&quot;") + '"><a href="' + baseUrl + "/issues/" + i.id + '" target="_blank">#' + i.id + '</a><span class="name">' + name + "</span></div>";
    }).join("");

    const bands = versionBands();
    let sprintHtml = '<div class="sprint-band" style="width:' + dayCount * DAY_W + 'px">';
    bands.forEach((b) => {
      sprintHtml += '<div class="sprint-cell' + (b.backlog ? " backlog-band" : "") + '" style="width:' + b.span * DAY_W + 'px">' + b.name + "</div>";
    });
    sprintHtml += "</div>";

    let dayHtml = '<div class="day-band" style="width:' + dayCount * DAY_W + 'px">';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < dayCount; i++) {
      const cls = ["day-cell"];
      if (i < BACKLOG_DAYS) {
        cls.push("backlog-day");
        dayHtml += '<div class="' + cls.join(" ") + '">·</div>';
      } else {
        const d = addDays(rangeStart, i - BACKLOG_DAYS);
        if (isWeekend(d)) cls.push("weekend");
        if (fmtYMD(d) === fmtYMD(today)) cls.push("today");
        dayHtml += '<div class="' + cls.join(" ") + '">' + d.getDate() + "</div>";
      }
    }
    dayHtml += "</div>";
    head.innerHTML = sprintHtml + dayHtml;

    let rows = "";
    filtered.forEach((issue) => {
      let extras = '<div class="bl-zone" style="left:0;width:' + BACKLOG_DAYS * DAY_W + 'px"></div>';
      for (let i = BACKLOG_DAYS; i < dayCount; i++) {
        const d = addDays(rangeStart, i - BACKLOG_DAYS);
        if (isWeekend(d)) extras += '<div class="wknd" style="left:' + i * DAY_W + 'px;width:' + DAY_W + 'px"></div>';
      }

      let bar = "";
      const backlog = isBacklogIssue(issue);
      let i0, i1;
      if (backlog) {
        // centraliza na zona backlog
        i0 = 1;
        i1 = BACKLOG_DAYS - 2;
      } else {
        const s = parseYMD(issue.start_date) || parseYMD(issue.due_date);
        const e = parseYMD(issue.due_date) || s;
        if (s && e) {
          i0 = BACKLOG_DAYS + dayIndex(s);
          i1 = BACKLOG_DAYS + dayIndex(e);
          if (i1 < i0) { const t = i0; i0 = i1; i1 = t; }
        }
      }
      if (i0 != null) {
        const leftPx = i0 * DAY_W + 1;
        const widthPx = Math.max(DAY_W * 2 - 2, (i1 - i0 + 1) * DAY_W - 2);
        const sc = statusClass(issue.status.name);
        const label = "#" + issue.id + " · " + shortStatus(issue.status.name);
        bar =
          '<div class="bar ' + sc + '" data-id="' + issue.id + '" data-backlog="' + (backlog ? "1" : "0") + '" style="left:' + leftPx + 'px;width:' + widthPx + 'px" title="' + label + '">' +
          '<div class="handle left" data-edge="left"></div>' +
          '<span class="bar-label">' + label + "</span>" +
          '<button type="button" class="menu-btn" data-menu="' + issue.id + '">⋮</button>' +
          '<div class="handle right" data-edge="right"></div></div>';
      }
      rows += '<div class="gantt-row-track" style="width:' + dayCount * DAY_W + 'px">' + extras + bar + "</div>";
    });
    body.innerHTML = rows;
    bindBarEvents();
  }

  function bindBarEvents() {
    document.querySelectorAll(".bar").forEach((bar) => {
      const id = +bar.dataset.id;
      bar.querySelector(".menu-btn").addEventListener("click", (ev) => {
        ev.stopPropagation();
        openStatusMenu(id, ev.clientX, ev.clientY);
      });
      bar.addEventListener("mousedown", (ev) => {
        if (ev.target.classList.contains("menu-btn")) return;
        ev.preventDefault();
        const edge = ev.target.dataset.edge || null;
        const startX = ev.clientX;
        const origLeft = parseFloat(bar.style.left);
        const origW = parseFloat(bar.style.width);
        const issue = allIssues.find((x) => x.id === id);
        if (!issue) return;

        function onMove(e) {
          const dx = e.clientX - startX;
          if (edge === "left") {
            const newLeft = Math.max(0, origLeft + dx);
            const newW = origW - (newLeft - origLeft);
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
          const leftPx = parseFloat(bar.style.left);
          const widthPx = parseFloat(bar.style.width);
          const i0 = Math.round(leftPx / DAY_W);
          const span = Math.max(1, Math.round(widthPx / DAY_W));

          // se soltou na zona backlog → remove versão
          if (i0 + span <= BACKLOG_DAYS) {
            try {
              await api("PUT", "/issues/" + id + ".json", { issue: { fixed_version_id: "" } });
              issue.fixed_version = null;
              toast("#" + id + " → Backlog");
              applyFilters();
            } catch (err) {
              toast("Erro: " + err.message, true);
              applyFilters();
            }
            return;
          }

          const real0 = Math.max(0, i0 - BACKLOG_DAYS);
          const newStart = addDays(rangeStart, real0);
          const newDue = addDays(rangeStart, real0 + span - 1);
          try {
            await api("PUT", "/issues/" + id + ".json", {
              issue: { start_date: fmtYMD(newStart), due_date: fmtYMD(newDue) },
            });
            issue.start_date = fmtYMD(newStart);
            issue.due_date = fmtYMD(newDue);
            toast("#" + id + " → " + fmtYMD(newStart) + " … " + fmtYMD(newDue));
            applyFilters();
          } catch (err) {
            toast("Erro ao salvar datas: " + err.message, true);
            applyFilters();
          }
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }

  function openStatusMenu(issueId, x, y) {
    const menu = document.getElementById("statusMenu");
    const list = statuses.length ? statuses : [
      { id: 1, name: "Nova" }, { id: 12, name: "Desenvolvimento: Planejamento" },
      { id: 11, name: "Desenvolvimento: Em Andamento" }, { id: 9, name: "Desenvolvimento: Em Validação" },
      { id: 16, name: "Desenvolvimento: Em Deploy" }, { id: 13, name: "Em Pagamento" },
      { id: 4, name: "Resolvida" }, { id: 5, name: "Fechada" }, { id: 6, name: "Rejeitada" },
    ];
    menu.innerHTML = list.map((s) => '<button type="button" data-sid="' + s.id + '">' + s.name + "</button>").join("");
    menu.style.left = Math.min(x, window.innerWidth - 240) + "px";
    menu.style.top = Math.min(y, window.innerHeight - 300) + "px";
    show(menu);
    menu.querySelectorAll("button").forEach((btn) => {
      btn.onclick = async () => {
        hide(menu);
        try {
          await api("PUT", "/issues/" + issueId + ".json", { issue: { status_id: +btn.dataset.sid } });
          const issue = allIssues.find((x) => x.id === issueId);
          const st = list.find((s) => s.id === +btn.dataset.sid);
          if (issue && st) issue.status = { id: st.id, name: st.name };
          toast("#" + issueId + " → " + btn.textContent);
          applyFilters();
        } catch (err) {
          toast("Erro status: " + err.message, true);
        }
      };
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#statusMenu") && !e.target.closest(".menu-btn"))
      hide(document.getElementById("statusMenu"));
  });

  (function bindPan() {
    const right = document.getElementById("ganttRight");
    let panning = false, sx = 0, sy = 0, sl = 0, st = 0;
    right.addEventListener("mousedown", (e) => {
      if (e.target.closest(".bar")) return;
      panning = true; right.classList.add("panning");
      sx = e.clientX; sy = e.clientY; sl = right.scrollLeft; st = right.scrollTop;
    });
    window.addEventListener("mousemove", (e) => {
      if (!panning) return;
      right.scrollLeft = sl - (e.clientX - sx);
      right.scrollTop = st - (e.clientY - sy);
    });
    window.addEventListener("mouseup", () => { panning = false; right.classList.remove("panning"); });
  })();

  document.getElementById("ganttRight").addEventListener("scroll", () => {
    document.getElementById("leftBody").scrollTop = document.getElementById("ganttRight").scrollTop;
  });
  document.getElementById("leftBody").addEventListener("scroll", () => {
    document.getElementById("ganttRight").scrollTop = document.getElementById("leftBody").scrollTop;
  });

  async function loadAll() {
    const loading = document.getElementById("loading");
    show(loading);
    try {
      const projectId = getCookie(C_PROJ);
      if (!projectId) throw new Error("Projeto não informado");
      const issues = [];
      let offset = 0;
      for (;;) {
        const d = await api("GET", "/issues.json?project_id=" + projectId + "&status_id=*&limit=100&offset=" + offset + "&sort=start_date");
        issues.push(...(d.issues || []));
        if ((d.issues || []).length < 100) break;
        offset += 100;
      }
      allIssues = issues;
      versions = (await api("GET", "/projects/" + projectId + "/versions.json")).versions || [];
      try { statuses = (await api("GET", "/issue_statuses.json")).issue_statuses || []; } catch (_) {}
      fillChips();
      applyFilters();
    } catch (e) {
      toast("Falha: " + e.message + " — use npm run proxy em :8787", true);
      console.error(e);
    } finally {
      hide(loading);
    }
  }

  function goLogin() { hide(document.getElementById("ganttView")); show(document.getElementById("loginView")); }
  function goApp() { hide(document.getElementById("loginView")); show(document.getElementById("ganttView")); loadAll(); }

  document.getElementById("btnAcceptCookies").onclick = () => {
    setCookie(COOKIE_OK, "1", 365);
    hide(document.getElementById("cookieBanner"));
    if (getCookie(C_KEY) && getCookie(C_URL) && getCookie(C_PROJ)) goApp(); else goLogin();
  };
  document.getElementById("btnLogin").onclick = () => {
    const email = document.getElementById("inEmail").value.trim();
    const url = document.getElementById("inUrl").value.trim().replace(/\/$/, "");
    const key = document.getElementById("inKey").value.trim();
    const proj = document.getElementById("inProject").value.trim();
    const err = document.getElementById("loginError");
    err.textContent = "";
    if (!validEmail(email)) { err.textContent = "E-mail inválido"; return; }
    if (!url || !key || !proj) { err.textContent = "Preencha todos os campos"; return; }
    setCookie(C_EMAIL, email, 30); setCookie(C_URL, url, 30); setCookie(C_KEY, key, 30); setCookie(C_PROJ, proj, 30);
    goApp();
  };
  document.getElementById("btnLogout").onclick = () => { clearAuth(); goLogin(); };
  document.getElementById("btnRefresh").onclick = () => loadAll();
  document.getElementById("btnClear").onclick = () => {
    sel = { scope: ["all"], sprint: null, mod: null, status: null };
    fillChips(); applyFilters();
  };
  document.getElementById("btnToday").onclick = () => {
    const right = document.getElementById("ganttRight");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const idx = BACKLOG_DAYS + dayIndex(today);
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
