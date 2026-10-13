/* HEMOPI Gantt interativo — cookies + proxy localhost:8787 */
(function () {
  const COOKIE_OK = "rd_cookie_ok", C_EMAIL = "rd_email", C_URL = "rd_url", C_KEY = "rd_key", C_PROJ = "rd_project";
  const DAY_W = 28;
  const ROW_H = 36;

  let allIssues = [];
  let versions = [];
  let statuses = [];
  let rangeStart = null;
  let dayCount = 0;
  let filtered = [];

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
    t.textContent = msg;
    t.classList.toggle("err", !!err);
    show(t);
    setTimeout(() => hide(t), 3200);
  }

  async function api(method, path, body) {
    const base = getCookie(C_URL).replace(/\/$/, "");
    const key = getCookie(C_KEY);
    const useProxy = location.port === "8787" || window.REDMINE_USE_PROXY;
    const opts = {
      method: method || "GET",
      headers: { Accept: "application/json", "X-Redmine-API-Key": key },
    };
    let url;
    if (useProxy) {
      url = "/api" + path;
      opts.headers["X-Redmine-Target"] = base;
      if (body) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
    } else {
      url = base + path;
      if (body) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const t = await res.text();
      throw new Error("HTTP " + res.status + ": " + t.slice(0, 180));
    }
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
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
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
  function isWeekend(d) {
    const w = d.getDay();
    return w === 0 || w === 6;
  }

  function getMod(i) {
    const sub = i.subject || "";
    for (const m of ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "INF"]) {
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

  function sprintName(i) {
    return (i.fixed_version && i.fixed_version.name) || "Backlog";
  }

  function cleanSubject(s) {
    return (s || "").replace(/\[HEMOPI\]\s*/g, "").replace(/\[(M0[1-9]|INF|US|TS|EP)\]\s*/g, "").trim();
  }

  function selectedValues(sel) {
    return Array.from(sel.selectedOptions).map((o) => o.value);
  }

  function fillFilters() {
    const sprints = new Set(["Backlog"]);
    versions.forEach((v) => sprints.add(v.name));
    allIssues.forEach((i) => sprints.add(sprintName(i)));
    const mods = new Set();
    allIssues.forEach((i) => mods.add(getMod(i)));
    const stSet = new Set();
    allIssues.forEach((i) => stSet.add(i.status.name));

    const fltS = document.getElementById("fltSprint");
    fltS.innerHTML = Array.from(sprints).sort().map((s) => '<option value="' + s + '" selected>' + s + "</option>").join("");
    const fltM = document.getElementById("fltMod");
    fltM.innerHTML = Array.from(mods).sort().map((m) => '<option value="' + m + '" selected>' + m + "</option>").join("");
    const fltSt = document.getElementById("fltStatus");
    fltSt.innerHTML = Array.from(stSet).sort().map((s) => '<option value="' + s + '" selected>' + s + "</option>").join("");
  }

  function applyFilters() {
    const scopes = selectedValues(document.getElementById("fltScope"));
    const sprints = selectedValues(document.getElementById("fltSprint"));
    const mods = selectedValues(document.getElementById("fltMod"));
    const sts = selectedValues(document.getElementById("fltStatus"));
    const allScope = scopes.includes("all") || scopes.length === 0;

    filtered = allIssues.filter((i) => {
      if (!allScope && !scopes.includes(getScope(i))) return false;
      if (sprints.length && !sprints.includes(sprintName(i))) return false;
      if (mods.length && !mods.includes(getMod(i))) return false;
      if (sts.length && !sts.includes(i.status.name)) return false;
      return true;
    });

    // ordenar por start, sprint, id
    filtered.sort((a, b) => {
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
      const s = parseYMD(i.start_date);
      const e = parseYMD(i.due_date);
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
      if (s && (!max || s > max)) max = s;
      if (e && (!min || e < min)) min = e;
    });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!min) min = addDays(today, -14);
    if (!max) max = addDays(today, 45);
    // padding
    rangeStart = addDays(min, -3);
    const rangeEnd = addDays(max, 10);
    dayCount = Math.max(21, dayIndex(rangeEnd) + 1);
  }

  function versionBands() {
    // map each day to sprint name by due_date proximity / version due
    const sorted = versions.slice().filter((v) => v.due_date).sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    const bands = [];
    let i = 0;
    while (i < dayCount) {
      const d = addDays(rangeStart, i);
      const ymd = fmtYMD(d);
      // find version whose period covers this day (by sequential week Mon-Fri from due)
      let name = "";
      for (const v of sorted) {
        const due = parseYMD(v.due_date);
        const start = addDays(due, -4); // Mon if due is Fri
        if (d >= start && d <= due) { name = v.name; break; }
      }
      let j = i + 1;
      while (j < dayCount) {
        const d2 = addDays(rangeStart, j);
        let n2 = "";
        for (const v of sorted) {
          const due = parseYMD(v.due_date);
          const start = addDays(due, -4);
          if (d2 >= start && d2 <= due) { n2 = v.name; break; }
        }
        if (n2 !== name) break;
        j++;
      }
      bands.push({ name: name || "—", from: i, span: j - i });
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

    // left labels
    left.innerHTML = filtered.map((i) => {
      const name = cleanSubject(i.subject);
      return '<div class="gantt-row-label" title="' + name.replace(/"/g, "&quot;") + '"><a href="' + baseUrl + "/issues/" + i.id + '" target="_blank">#' + i.id + '</a><span class="name">' + name + "</span></div>";
    }).join("");

    // timeline header: sprint band + days
    const bands = versionBands();
    let sprintHtml = '<div class="sprint-band" style="width:' + dayCount * DAY_W + 'px">';
    bands.forEach((b) => {
      sprintHtml += '<div class="sprint-cell" style="width:' + b.span * DAY_W + 'px">' + b.name + "</div>";
    });
    sprintHtml += "</div>";

    let dayHtml = '<div class="day-band" style="width:' + dayCount * DAY_W + 'px">';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < dayCount; i++) {
      const d = addDays(rangeStart, i);
      const cls = ["day-cell"];
      if (isWeekend(d)) cls.push("weekend");
      if (fmtYMD(d) === fmtYMD(today)) cls.push("today");
      dayHtml += '<div class="' + cls.join(" ") + '">' + d.getDate() + "</div>";
    }
    dayHtml += "</div>";
    head.innerHTML = sprintHtml + dayHtml;

    // body tracks + bars
    let rows = "";
    filtered.forEach((issue, idx) => {
      let wknd = "";
      for (let i = 0; i < dayCount; i++) {
        const d = addDays(rangeStart, i);
        if (isWeekend(d)) wknd += '<div class="wknd" style="left:' + i * DAY_W + 'px;width:' + DAY_W + 'px"></div>';
      }
      let bar = "";
      const s = parseYMD(issue.start_date) || parseYMD(issue.due_date);
      const e = parseYMD(issue.due_date) || s;
      if (s && e) {
        let i0 = dayIndex(s);
        let i1 = dayIndex(e);
        if (i1 < i0) { const t = i0; i0 = i1; i1 = t; }
        const leftPx = i0 * DAY_W + 1;
        const widthPx = Math.max(DAY_W - 2, (i1 - i0 + 1) * DAY_W - 2);
        const sc = statusClass(issue.status.name);
        bar =
          '<div class="bar ' + sc + '" data-id="' + issue.id + '" data-idx="' + idx + '" style="left:' + leftPx + 'px;width:' + widthPx + 'px" title="#' + issue.id + " · " + issue.status.name + '">' +
          '<div class="handle left" data-edge="left"></div>' +
          '<span class="bar-label">' + issue.status.name.replace(/^Desenvolvimento:\s*/, "") + "</span>" +
          '<button type="button" class="menu-btn" data-menu="' + issue.id + '">⋮</button>' +
          '<div class="handle right" data-edge="right"></div></div>';
      }
      rows += '<div class="gantt-row-track" style="width:' + dayCount * DAY_W + 'px">' + wknd + bar + "</div>";
    });
    body.innerHTML = rows;
    bindBarEvents();
  }

  function bindBarEvents() {
    document.querySelectorAll(".bar").forEach((bar) => {
      const id = +bar.dataset.id;
      // menu
      bar.querySelector(".menu-btn").addEventListener("click", (ev) => {
        ev.stopPropagation();
        openStatusMenu(id, ev.clientX, ev.clientY);
      });
      // drag move / resize
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
            if (newW >= DAY_W / 2) {
              bar.style.left = newLeft + "px";
              bar.style.width = newW + "px";
            }
          } else if (edge === "right") {
            const newW = Math.max(DAY_W / 2, origW + dx);
            bar.style.width = newW + "px";
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
          const newStart = addDays(rangeStart, i0);
          const newDue = addDays(rangeStart, i0 + span - 1);
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
    const list = statuses.length
      ? statuses
      : [
          { id: 1, name: "Nova" },
          { id: 12, name: "Desenvolvimento: Planejamento" },
          { id: 11, name: "Desenvolvimento: Em Andamento" },
          { id: 9, name: "Desenvolvimento: Em Validação" },
          { id: 16, name: "Desenvolvimento: Em Deploy" },
          { id: 13, name: "Em Pagamento" },
          { id: 4, name: "Resolvida" },
          { id: 5, name: "Fechada" },
          { id: 6, name: "Rejeitada" },
        ];
    menu.innerHTML = list
      .map((s) => '<button type="button" data-sid="' + s.id + '">' + s.name + "</button>")
      .join("");
    menu.style.left = Math.min(x, window.innerWidth - 220) + "px";
    menu.style.top = Math.min(y, window.innerHeight - 280) + "px";
    show(menu);
    menu.querySelectorAll("button").forEach((btn) => {
      btn.onclick = async () => {
        hide(menu);
        try {
          await api("PUT", "/issues/" + issueId + ".json", { issue: { status_id: +btn.dataset.sid } });
          const issue = allIssues.find((x) => x.id === issueId);
          if (issue) {
            const st = list.find((s) => s.id === +btn.dataset.sid);
            if (st) issue.status = { id: st.id, name: st.name };
          }
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

  // pan timeline
  (function bindPan() {
    const right = document.getElementById("ganttRight");
    let panning = false, sx = 0, sy = 0, sl = 0, st = 0;
    right.addEventListener("mousedown", (e) => {
      if (e.target.closest(".bar")) return;
      panning = true;
      right.classList.add("panning");
      sx = e.clientX; sy = e.clientY; sl = right.scrollLeft; st = right.scrollTop;
    });
    window.addEventListener("mousemove", (e) => {
      if (!panning) return;
      right.scrollLeft = sl - (e.clientX - sx);
      right.scrollTop = st - (e.clientY - sy);
    });
    window.addEventListener("mouseup", () => {
      panning = false;
      right.classList.remove("panning");
    });
  })();

  // sync vertical scroll left/right
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
      const vd = await api("GET", "/projects/" + projectId + "/versions.json");
      versions = vd.versions || [];
      try {
        const sd = await api("GET", "/issue_statuses.json");
        statuses = sd.issue_statuses || [];
      } catch (_) {}
      fillFilters();
      applyFilters();
    } catch (e) {
      toast("Falha: " + e.message + " — use npm run proxy em :8787", true);
      console.error(e);
    } finally {
      hide(loading);
    }
  }

  function goLogin() {
    hide(document.getElementById("ganttView"));
    show(document.getElementById("loginView"));
  }
  function goApp() {
    hide(document.getElementById("loginView"));
    show(document.getElementById("ganttView"));
    loadAll();
  }

  document.getElementById("btnAcceptCookies").onclick = () => {
    setCookie(COOKIE_OK, "1", 365);
    hide(document.getElementById("cookieBanner"));
    if (getCookie(C_KEY) && getCookie(C_URL) && getCookie(C_PROJ)) goApp();
    else goLogin();
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
    setCookie(C_EMAIL, email, 30);
    setCookie(C_URL, url, 30);
    setCookie(C_KEY, key, 30);
    setCookie(C_PROJ, proj, 30);
    goApp();
  };
  document.getElementById("btnLogout").onclick = () => { clearAuth(); goLogin(); };
  document.getElementById("btnRefresh").onclick = () => loadAll();
  document.getElementById("btnApply").onclick = () => applyFilters();
  document.getElementById("btnClear").onclick = () => {
    document.querySelectorAll(".gantt-filters select option").forEach((o) => (o.selected = true));
    const sc = document.getElementById("fltScope");
    Array.from(sc.options).forEach((o) => (o.selected = o.value === "all"));
    applyFilters();
  };
  document.getElementById("btnToday").onclick = () => {
    const right = document.getElementById("ganttRight");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const idx = dayIndex(today);
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
