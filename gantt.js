(function () {
  /* —— HEMOPI Gantt diagnostics —— */
  var GLOG = {
    t0: (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(),
    step: function (msg, data) {
      var ms = ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - GLOG.t0;
      var line = "[HEMOPI Gantt +" + Math.round(ms) + "ms] " + msg;
      if (data !== undefined) console.log(line, data);
      else console.log(line);
    },
    err: function (msg, err) {
      console.error("[HEMOPI Gantt ERROR] " + msg, err || "");
    }
  };
  window.__HEMOPI_GLOG = GLOG;
  GLOG.step("boot: IIFE start");
  /* ========================================================================
   * PHASE2 MODULE MAP (logic still in this file — do not split until UX hybrid OK)
   * - core/state          : sel, allIssues, versions, filtered
   * - core/api            : api(), loadAll
   * - core/dates          : parseYMD, addDays, isWeekend, versionPeriod
   * - core/filters-engine : applyFilters
   * - filters/filters-ui  : fillChips, filter panel handlers
   * - sidebar/sidebar-ui  : left labels / tree render
   * - timeline/model      : versionBands, colDates
   * - timeline/ui         : head HTML (sprint/day bands), sticky actions
   * - cards/ui            : bar HTML, bindBarEvents, kanban cards
   * - gantt-app           : renderGantt orchestration
   * ======================================================================== */

  window.onerror = function (m, s, l, c, e) {
    GLOG.err("window.onerror: " + m + " @" + s + ":" + l + ":" + c, e);
  };
  window.addEventListener("unhandledrejection", function (ev) {
    GLOG.err("unhandledrejection", ev.reason);
  });
  const COOKIE_OK = "rd_cookie_ok", C_EMAIL = "rd_email", C_URL = "rd_url", C_KEY = "rd_key", C_PROJ = "rd_project";
  const LS_FILTERS = "hemopi_shared_filters";
  function loadSharedFilters() {
    try {
      var raw = localStorage.getItem(LS_FILTERS);
      if (!raw) return { projects: null, assignee: null, mod: null };
      var o = JSON.parse(raw);
      return {
        projects: o.projects == null ? null : o.projects.map(String),
        assignee: o.assignee == null ? null : o.assignee.map(String),
        mod: o.mod == null ? null : o.mod.map(String)
      };
    } catch (e) { return { projects: null, assignee: null, mod: null }; }
  }
  function saveSharedFilters(partial) {
    var cur = loadSharedFilters();
    if (partial.projects !== undefined) cur.projects = partial.projects;
    if (partial.assignee !== undefined) cur.assignee = partial.assignee;
    if (partial.mod !== undefined) cur.mod = partial.mod;
    try { localStorage.setItem(LS_FILTERS, JSON.stringify(cur)); } catch (e) {}
  }
  function clearSharedFilters() {
    try { localStorage.removeItem(LS_FILTERS); } catch (e) {}
  }
  const DAY_W = 48, BACKLOG_DAYS = 7;
  /* DEFAULT_MENU_HIDE removido — status unificado no filtro Status (Visão + Kanban) */

  let allIssues = [], versions = [], statuses = [], projectMembers = [];
  let allProjects = []; /* árvore plana do Redmine */
  let rangeStart = null, dayCount = 0, filtered = [];
  let sel = { scope: ["all"], sprint: null, mod: null, status: null, projects: null, assignee: null, completeness: null };
  /* completeness: null = todas | ["incomplete"] | ["complete"] */
  let collapsedProjects = {};
  try {
    collapsedProjects = JSON.parse(localStorage.getItem("hemopi_collapsed_proj") || "{}") || {};
  } catch (e) { collapsedProjects = {}; }

  (function restoreSharedFilters() {
    var sf = loadSharedFilters();
    if (sf.projects && sf.projects.length) {
      sel.projects = new Set(sf.projects.concat(sf.projects.map(Number)));
    } else if (Array.isArray(sf.projects) && sf.projects.length === 0) {
      sel.projects = new Set([-1]);
    }
    if (sf.assignee && sf.assignee.length) {
      sel.assignee = sf.assignee.map(String).concat(sf.assignee.map(Number));
    } else if (Array.isArray(sf.assignee) && sf.assignee.length === 0) {
      sel.assignee = [];
    }
    if (sf.mod && sf.mod.length) {
      sel.mod = sf.mod.map(String);
    } else if (Array.isArray(sf.mod) && sf.mod.length === 0) {
      sel.mod = [];
    }
  })();
  /* projects: null = todos sob a raiz; Set de ids selecionados */
  /* menuVisible removido — unificado em sel.status */

  function setCookie(n, v, days) {
    const d = new Date(); d.setTime(d.getTime() + (days || 30) * 864e5);
    document.cookie = n + "=" + encodeURIComponent(v) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Strict";
  }
  function getCookie(n) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function delCookie(n) { document.cookie = n + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Strict"; }
  function clearAuth() {
    try { clearSharedFilters(); } catch (e) {}
    [C_EMAIL, C_URL, C_KEY, C_PROJ].forEach(delCookie);
  }
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function toast(msg, err) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.toggle("err", !!err); show(t);
    setTimeout(() => hide(t), 3500);
  }

  async function api(method, path, body) {
    GLOG.step("api " + (method || "GET") + " " + path);
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
  function projectIdOf(i) {
    return i.project && i.project.id != null ? i.project.id : null;
  }
  /** Caminho hierárquico do projeto da issue (raiz → … → folha) usando allProjects */
  function projectPath(i) {
    var tree = window.__projTreeCache || buildProjectTree(allProjects);
    window.__projTreeCache = tree;
    var pid = projectIdOf(i);
    var path = [];
    var guard = 0;
    while (pid != null && tree.byId[pid] && guard++ < 12) {
      var n = tree.byId[pid];
      path.unshift({ id: n.id, name: n.name });
      pid = n.parentId;
    }
    if (!path.length) path.push({ id: pid, name: projectLabel(i) });
    return path;
  }
  /** Filhos (não-folha de issues) dos projetos selecionados — para filtro Módulo dinâmico */
  function moduleOptionsFromSelection() {
    var tree = buildProjectTree(allProjects);
    window.__projTreeCache = tree;
    var selectedIds = null;
    if (sel.projects !== null) {
      selectedIds = new Set();
      sel.projects.forEach(function (x) { selectedIds.add(+x); selectedIds.add(String(x)); });
    }
    var rootCookie = getCookie(C_PROJ);
    var startNodes = [];
    Object.keys(tree.byId).forEach(function (id) {
      var n = tree.byId[id];
      if (selectedIds) {
        if (selectedIds.has(n.id) || selectedIds.has(String(n.id))) startNodes.push(n);
      } else if (String(n.id) === String(rootCookie) || n.identifier === rootCookie) {
        startNodes.push(n);
      }
    });
    if (!startNodes.length) {
      /* fallback: qualquer projeto que aparece nas issues */
      var seen = {};
      allIssues.forEach(function (i) {
        var id = projectIdOf(i);
        if (id != null && tree.byId[id] && !seen[id]) { seen[id] = true; startNodes.push(tree.byId[id]); }
      });
    }
    var opts = [];
    var seenOpt = {};
    function addDescendants(node, depth) {
      (node.children || []).forEach(function (ch) {
        if (!seenOpt[ch.id]) {
          seenOpt[ch.id] = true;
          opts.push({ id: ch.id, name: ch.name, depth: depth });
        }
        addDescendants(ch, depth + 1);
      });
    }
    startNodes.forEach(function (n) {
      /* se o nó selecionado tem filhos, lista os filhos; senão o próprio como folha de filtro */
      if (n.children && n.children.length) addDescendants(n, 0);
      else if (!seenOpt[n.id]) {
        seenOpt[n.id] = true;
        opts.push({ id: n.id, name: n.name, depth: 0 });
      }
    });
    opts.sort(function (a, b) {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.name < b.name ? -1 : 1;
    });
    return opts;
  }
  function assigneeOptionsFromIssues() {
    var map = {};
    allIssues.forEach(function (i) {
      if (sel.projects !== null) {
        var pid = projectIdOf(i);
        if (pid == null || (!sel.projects.has(pid) && !sel.projects.has(String(pid)))) return;
      }
      var a = i.assigned_to;
      if (a && a.id != null && a.name) map[a.id] = a.name;
    });
    return Object.keys(map).map(function (id) {
      return { id: +id, name: map[id] };
    }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  }
  function shortProject(name) {
    var n = String(name || "");
    if (n.length <= 18) return n;
    return n.slice(0, 16) + "…";
  }
  /** Ordena issues por projeto → módulo → id (visão master hierárquica) */
  function sortByHierarchy(list) {
    return list.slice().sort(function (a, b) {
      var pa = projectPath(a), pb = projectPath(b);
      var n = Math.max(pa.length, pb.length);
      for (var i = 0; i < n; i++) {
        var na = pa[i] ? pa[i].name : "";
        var nb = pb[i] ? pb[i].name : "";
        if (na !== nb) return na < nb ? -1 : 1;
      }
      return a.id - b.id;
    });
  }
  function neonIndex(str, mod) {
    var h = 0;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % (mod || 6);
  }
  /** Versões pertencentes a um conjunto de project ids (ou todas se projectIds for null) */
  function versionsForProjects(projectIds) {
    if (!projectIds || !projectIds.length) return versions.slice();
    var set = {};
    projectIds.forEach(function (id) { set[String(id)] = true; });
    return versions.filter(function (v) {
      var pid = v.project && v.project.id != null ? String(v.project.id) : null;
      /* se a API não trouxe project, considera (compatibilidade) */
      if (pid == null) return true;
      return !!set[pid];
    });
  }

  function nextSprintNameForProject(projectId) {
    var list = versionsForProjects(projectId != null ? [projectId] : null);
    var max = 0;
    list.forEach(function (v) {
      var m = String(v.name || "").match(/sprint\s*(\d+)/i);
      if (m) max = Math.max(max, +m[1]);
    });
    return "Sprint " + (max + 1);
  }

  /** Última sprint "real" (com data) do(s) projeto(s) para herdar padrão Mon–Sex + descrição Wxx */
  function lastSprintTemplate(projectIds) {
    var list = versionsForProjects(projectIds).filter(function (v) {
      return /sprint\s*\d+/i.test(v.name || "") && v.due_date;
    });
    list.sort(function (a, b) {
      if (a.due_date < b.due_date) return -1;
      if (a.due_date > b.due_date) return 1;
      return 0;
    });
    return list.length ? list[list.length - 1] : null;
  }
  function isoWeekNum(d) {
    var dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    return Math.ceil((((dt - yearStart) / 864e5) + 1) / 7);
  }
  function fmtBR(d) {
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }
  /** Deduz próxima semana útil (seg–sex) a partir da due_date da última sprint do projeto */
  function inferNextSprintMeta(projectId) {
    var pids = projectId != null ? [projectId] : null;
    var last = lastSprintTemplate(pids);
    var name = nextSprintNameForProject(projectId);
    var start, end, desc, sharing;
    sharing = (last && last.sharing) ? last.sharing : "tree";
    if (last && last.due_date) {
      var due = parseYMD(last.due_date);
      /* próxima segunda após o fim da última */
      var nextMon = addDays(due, 1);
      while (nextMon.getDay() !== 1) nextMon = addDays(nextMon, 1);
      start = nextMon;
      end = addDays(start, 4); /* sexta */
      desc = fmtBR(start) + "–" + fmtBR(end) + " | W" + isoWeekNum(start);
    } else {
      var today = new Date(); today.setHours(0, 0, 0, 0);
      start = addDays(today, (1 - today.getDay() + 7) % 7 || 7);
      if (today.getDay() === 1) start = today;
      else if (today.getDay() === 0) start = addDays(today, 1);
      else start = addDays(today, 8 - today.getDay());
      end = addDays(start, 4);
      desc = fmtBR(start) + "–" + fmtBR(end) + " | W" + isoWeekNum(start);
    }
    if (last && last.description && /\d{2}\/\d{2}/.test(last.description)) {
      desc = fmtBR(start) + "–" + fmtBR(end) + " | W" + isoWeekNum(start);
    }
    return {
      name: name,
      description: desc,
      due_date: fmtYMD(end),
      sharing: sharing,
      status: "open",
      projectId: projectId
    };
  }

  /** Projetos candidatos para nova task (filtro aberto / filhos) */
  function candidateProjectsForNewTask() {
    var tree = buildProjectTree(allProjects);
    var opts = [];
    var seen = {};
    function add(n) {
      if (!n || seen[n.id]) return;
      seen[n.id] = true;
      opts.push({ id: n.id, name: n.name });
    }
    if (sel.projects !== null) {
      sel.projects.forEach(function (x) {
        var id = +x;
        if (tree.byId[id]) add(tree.byId[id]);
      });
    } else {
      var root = getCookie(C_PROJ);
      Object.keys(tree.byId).forEach(function (id) {
        var n = tree.byId[id];
        if (String(n.id) === String(root) || n.identifier === root) add(n);
      });
      if (!opts.length) {
        Object.keys(tree.byId).forEach(function (id) { add(tree.byId[id]); });
      }
    }
    /* se só um nó tem filhos, oferecer os filhos (onde as tasks nascem) */
    if (opts.length === 1 && tree.byId[opts[0].id] && tree.byId[opts[0].id].children && tree.byId[opts[0].id].children.length) {
      var kids = [];
      tree.byId[opts[0].id].children.forEach(function (ch) { kids.push({ id: ch.id, name: ch.name }); });
      if (kids.length) return kids;
    }
    opts.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return opts;
  }

  window.openNewTaskDialog = function openNewTaskDialog(ctx) {
    GLOG.step("openNewTaskDialog", ctx || {});
    ctx = ctx || {};
    var modal = document.getElementById("newTaskModal");
    if (!modal) { toast("Modal de nova task ausente", true); return; }
    var projects = candidateProjectsForNewTask();
    var projSel = document.getElementById("ntProject");
    projSel.innerHTML = projects.map(function (p) {
      return '<option value="' + p.id + '">' + escapeHtml(p.name) + "</option>";
    }).join("") || '<option value="">(nenhum projeto)</option>';
    if (projects.length === 1) projSel.value = String(projects[0].id);

    var asg = document.getElementById("ntAssignee");
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
    asg.innerHTML = '<option value="">— Sem responsável —</option>' + members.map(function (m) {
      return '<option value="' + m.id + '">' + escapeHtml(m.name || ("#" + m.id)) + "</option>";
    }).join("");

    document.getElementById("ntSubject").value = "";
    document.getElementById("ntDescription").value = "";
    document.getElementById("ntSprintLabel").textContent = ctx.backlog || !ctx.versionId
      ? "Backlog (sem sprint)"
      : (ctx.versionName || ("Sprint #" + ctx.versionId));
    modal.dataset.versionId = ctx.versionId || "";
    modal.dataset.backlog = ctx.backlog ? "1" : "0";
    show(modal);
    document.getElementById("ntSubject").focus();
  }

  function markFieldError(el, on) {
    if (!el) return;
    if (on) el.classList.add("field-error");
    else el.classList.remove("field-error");
  }

  async function submitNewTask() {
    var modal = document.getElementById("newTaskModal");
    var subjectEl = document.getElementById("ntSubject");
    var projectEl = document.getElementById("ntProject");
    var descEl = document.getElementById("ntDescription");
    var assigneeEl = document.getElementById("ntAssignee");
    var subject = (subjectEl && subjectEl.value || "").trim();
    var description = (descEl && descEl.value || "").trim();
    var projectId = projectEl && projectEl.value;
    var assigneeId = assigneeEl && assigneeEl.value;
    var versionId = modal.dataset.versionId;
    var backlog = modal.dataset.backlog === "1";

    /* Validação de campos obrigatórios */
    var errors = [];
    markFieldError(subjectEl, false);
    markFieldError(projectEl, false);
    markFieldError(descEl, false);
    markFieldError(assigneeEl, false);

    if (!subject) {
      errors.push("Título");
      markFieldError(subjectEl, true);
    }
    if (!projectId) {
      errors.push("Projeto");
      markFieldError(projectEl, true);
    }
    if (!description) {
      errors.push("Descrição");
      markFieldError(descEl, true);
    }
    if (!assigneeId) {
      errors.push("Responsável");
      markFieldError(assigneeEl, true);
    }
    if (errors.length) {
      toast("Campos obrigatórios: " + errors.join(", "), true);
      if (subjectEl && !subject) subjectEl.focus();
      else if (projectEl && !projectId) projectEl.focus();
      else if (assigneeEl && !assigneeId) assigneeEl.focus();
      else if (descEl) descEl.focus();
      return;
    }

    var payload = {
      issue: {
        project_id: +projectId,
        subject: subject,
        description: description,
        tracker_id: 2 /* Desenvolvimento — fallback se API exigir */
      }
    };
    if (assigneeId) payload.issue.assigned_to_id = +assigneeId;
    if (!backlog && versionId) payload.issue.fixed_version_id = +versionId;
    /* datas: se sprint com due_date, alinhar início/fim da semana */
    if (!backlog && versionId) {
      var ver = versions.find(function (v) { return +v.id === +versionId; });
      if (ver && ver.due_date) {
        var due = parseYMD(ver.due_date);
        var start = ver.start_date ? parseYMD(ver.start_date) : addDays(due, -4);
        payload.issue.start_date = fmtYMD(start);
        payload.issue.due_date = fmtYMD(due);
      }
    }
    try {
      var res = await api("POST", "/issues.json", payload);
      var created = res.issue || res;
      toast("Task #" + (created.id || "?") + " criada");
      hide(modal);
      /* reload issues */
      document.getElementById("btnRefresh").click();
    } catch (err) {
      /* retry sem tracker_id se falhar */
      if (String(err.message).indexOf("tracker") >= 0 || String(err.message).indexOf("422") >= 0) {
        try {
          delete payload.issue.tracker_id;
          var res2 = await api("POST", "/issues.json", payload);
          var created2 = res2.issue || res2;
          toast("Task #" + (created2.id || "?") + " criada");
          hide(modal);
          document.getElementById("btnRefresh").click();
          return;
        } catch (err2) {
          toast("Erro ao criar task: " + err2.message, true);
          return;
        }
      }
      toast("Erro ao criar task: " + err.message, true);
    }
  }

  /** Projetos candidatos para criar sprint (respeita filtro de projetos selecionados) */
  function candidateProjectsForNewSprint() {
    var tree = buildProjectTree(allProjects);
    var opts = [];
    var seen = {};
    function addNode(n) {
      if (!n || seen[n.id]) return;
      seen[n.id] = true;
      opts.push({ id: n.id, name: n.name || ("#" + n.id) });
    }
    if (sel.projects !== null) {
      sel.projects.forEach(function (x) {
        var id = +x;
        if (isNaN(id) || id < 0) return;
        var node = tree.byId[id];
        if (node) addNode(node);
        else addNode({ id: id, name: "Projeto #" + id });
      });
    } else {
      /* todos / raiz de login */
      var rootId = getCookie(C_PROJ);
      if (rootId) {
        var rootNode = tree.byId[+rootId] || tree.byId[rootId];
        if (rootNode) {
          addNode(rootNode);
          (rootNode.children || []).forEach(addNode);
        } else {
          addNode({ id: +rootId || rootId, name: "Projeto login" });
        }
      }
      /* também inclui candidatos já carregados */
      allProjects.forEach(function (p) {
        if (p && p.id != null) addNode({ id: p.id, name: p.name });
      });
    }
    /* dedupe por id e ordena por nome */
    var byId = {};
    opts.forEach(function (o) { byId[o.id] = o; });
    return Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }

  function openNewSprintDialog() {
    var candidates = candidateProjectsForNewSprint();
    if (!candidates.length) {
      toast("Nenhum projeto disponível para criar sprint. Selecione ao menos um projeto no filtro.", true);
      return;
    }

    var chosenProjectId = null;
    var chosenName = null;

    if (candidates.length === 1) {
      chosenProjectId = candidates[0].id;
      chosenName = candidates[0].name;
    } else {
      /* Popup simples: lista numerada para o usuário escolher em qual projeto criar */
      var lines = candidates.map(function (p, i) {
        return (i + 1) + ") " + p.name + " (id " + p.id + ")";
      });
      var answer = window.prompt(
        "Vários projetos selecionados.\nEm qual projeto a nova Sprint deve ser criada?\n\n" +
        lines.join("\n") +
        "\n\nDigite o número da opção:"
      );
      if (answer == null) return;
      var idx = parseInt(String(answer).trim(), 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
        toast("Opção inválida", true);
        return;
      }
      chosenProjectId = candidates[idx].id;
      chosenName = candidates[idx].name;
    }

    var meta = inferNextSprintMeta(chosenProjectId);
    var name = window.prompt(
      "Nova sprint no projeto \"" + chosenName + "\":\n" +
      "Será criada com datas " + meta.description + "\n" +
      "e compartilhamento: " + meta.sharing +
      "\n\nNome sugerido (próxima numeração deste projeto):",
      meta.name
    );
    if (name == null) return;
    name = String(name).trim();
    if (!name) { toast("Informe um nome", true); return; }
    meta.name = name;
    meta.projectId = chosenProjectId;
    createSprint(meta);
  }

  async function createSprint(meta) {
    var projectId = meta && meta.projectId != null ? meta.projectId : getCookie(C_PROJ);
    if (!projectId) { toast("Projeto não configurado", true); return; }
    if (typeof meta === "string") meta = { name: meta, status: "open", sharing: "tree", projectId: projectId };
    try {
      var payload = {
        version: {
          name: meta.name,
          status: meta.status || "open",
          description: meta.description || "",
          due_date: meta.due_date || null,
          sharing: meta.sharing || "tree"
        }
      };
      await api("POST", "/projects/" + projectId + "/versions.json", payload);

      /* recarrega versões deste projeto e mescla no array global (sem perder as de outros) */
      var fresh = (await api("GET", "/projects/" + projectId + "/versions.json")).versions || [];
      var byId = {};
      versions.forEach(function (v) { byId[v.id] = v; });
      fresh.forEach(function (v) {
        /* garante que a versão saiba a qual projeto pertence */
        if (!v.project) v.project = { id: +projectId };
        byId[v.id] = v;
      });
      versions = Object.keys(byId).map(function (id) { return byId[id]; });

      toast("Sprint criada em #" + projectId + ": " + meta.name + (meta.description ? " · " + meta.description : ""));
      fillChips();
      applyFilters();
    } catch (err) {
      toast("Erro ao criar sprint: " + err.message, true);
    }
  }
  /** Data de referência da issue: start → due → created_on */
  function issueRefDate(i) {
    var d = parseYMD(i.start_date) || parseYMD(i.due_date);
    if (d) return d;
    var c = (i.created_on || "").slice(0, 10);
    return parseYMD(c);
  }

  /** @deprecated membership: não usar para sprint — só fixed_version. Mantido se algum helper de data precisar. */
  function versionCoveringDate(d) {
    if (!d || !versions || !versions.length) return null;
    var best = null;
    for (var i = 0; i < versions.length; i++) {
      var p = versionPeriod(versions[i]);
      if (!p || !p.start || !p.due) continue;
      if (d >= p.start && d <= p.due) {
        if (!best) best = versions[i];
      }
    }
    return best;
  }

  /**
   * Sprint efetiva:
   * 1) fixed_version se existir
   * 2) senão, sprint cujo período cobre created_on/start
   * 3) senão Backlog
   */
  /**
   * Sprint efetiva — SOMENTE fixed_version do Redmine.
   * "Backlog" NÃO é versão do projeto: é coluna sintética para:
   *   - issue SEM fixed_version
   *   - issue com versão nomeada "Backlog"
   *   - issue com versão de OUTRO projeto (quando filtro de projetos está ativo)
   *     → fica no Backlog do projeto dono da task, sem sumir da visão
   */
  function isBacklogVersionName(name) {
    if (!name) return true;
    var n = String(name).trim().toLowerCase();
    return n === "backlog" || n === "back-log" || n === "sem sprint" || n === "sem versão";
  }

  /** IDs de versão válidos para o filtro de projetos atual (sem hardcode) */
  function selectedProjectIdsList() {
    if (sel.projects === null) return null;
    var ids = [];
    sel.projects.forEach(function (x) {
      var n = +x;
      if (!isNaN(n) && n > 0) ids.push(n);
    });
    return ids;
  }

  /** A versão da issue pertence a algum dos projetos selecionados? */
  function versionBelongsToSelectedProjects(fixedVersion) {
    if (!fixedVersion || fixedVersion.id == null) return false;
    var projIds = selectedProjectIdsList();
    /* sem filtro de projeto → qualquer versão "real" é válida */
    if (projIds === null) {
      return !isBacklogVersionName(fixedVersion.name);
    }
    var allowed = versionsForProjects(projIds);
    for (var i = 0; i < allowed.length; i++) {
      if (String(allowed[i].id) === String(fixedVersion.id)) return true;
    }
    /* fallback: se a versão carrega project.id e ele está no filtro */
    if (fixedVersion.project && fixedVersion.project.id != null) {
      var pid = fixedVersion.project.id;
      if (sel.projects.has(pid) || sel.projects.has(String(pid))) return true;
    }
    return false;
  }

  function isBacklogIssue(i) {
    if (!(i.fixed_version && i.fixed_version.id != null)) return true;
    if (isBacklogVersionName(i.fixed_version.name)) return true;
    /* Versão de outro projeto / fora do filtro → trata como Backlog do projeto da task */
    if (!versionBelongsToSelectedProjects(i.fixed_version)) return true;
    return false;
  }

  function sprintName(i) {
    if (isBacklogIssue(i)) return "Backlog";
    if (i.fixed_version && i.fixed_version.name) return i.fixed_version.name;
    return "Backlog";
  }

  /**
   * Campos obrigatórios para uma task "completa" na visão Gantt.
   * Retorna lista de labels faltantes (vazia = ok).
   */
  function getMissingRequired(i) {
    var missing = [];
    if (!(i.subject && String(i.subject).trim())) missing.push("Título");
    if (!(i.start_date && String(i.start_date).trim())) missing.push("Data início");
    if (!(i.due_date && String(i.due_date).trim())) missing.push("Data fim");
    if (!(i.assigned_to && i.assigned_to.id != null)) missing.push("Responsável");
    var desc = (i.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!desc) missing.push("Descrição");
    return missing;
  }

  function isIncompleteIssue(i) {
    return getMissingRequired(i).length > 0;
  }

  /** Issue na sprint apenas se fixed_version_id/name corresponder — nunca por data de criação.
   *  Versões "Backlog" nunca contam como sprint real. */
  function issueInSprint(i, versionId, versionName) {
    if (!i.fixed_version) return false;
    if (isBacklogVersionName(i.fixed_version.name)) return false;
    if (versionId != null && String(i.fixed_version.id) === String(versionId)) return true;
    if (versionName && i.fixed_version.name === versionName) return true;
    return false;
  }

  /** Dias civis inclusivos entre duas Dates (00:00) */
  function daysInclusive(a, b) {
    if (!a || !b) return 0;
    var ms = b.getTime() - a.getTime();
    return Math.max(1, Math.round(ms / 864e5) + 1);
  }

  /**
   * Cor da barra temporal vs período da sprint (fixed_version):
   * - span-slack (azul neon): dentro da sprint com folga
   * - span-fit   (verde neon): duração ≈ duração da sprint
   * - span-warn  (amarelo neon): estouro 1–3 dias além do fim da sprint
   * - span-over  (vermelho neon): estouro > 3 dias
   */
  function spanBarClass(issue, sprintPeriod) {
    var s = parseYMD(issue.start_date) || parseYMD(issue.due_date);
    var e = parseYMD(issue.due_date) || s;
    if (!s || !e) return "span-unknown";
    if (!sprintPeriod || !sprintPeriod.start || !sprintPeriod.due) return "span-unknown";
    var spDue = new Date(sprintPeriod.due.getTime()); spDue.setHours(0, 0, 0, 0);
    var e0 = new Date(e.getTime()); e0.setHours(0, 0, 0, 0);
    var overrun = Math.round((e0 - spDue) / 864e5);
    if (overrun > 3) return "span-over";
    if (overrun > 0) return "span-warn";
    var sprintDays = daysInclusive(sprintPeriod.start, sprintPeriod.due);
    var taskDays = daysInclusive(s, e);
    if (taskDays >= sprintDays) return "span-fit";
    return "span-slack";
  }

  function findSprintBand(bands, issue) {
    if (!issue.fixed_version || issue.fixed_version.id == null) return null;
    for (var i = 0; i < bands.length; i++) {
      if (!bands[i].backlog && String(bands[i].versionId) === String(issue.fixed_version.id)) return bands[i];
    }
    return null;
  }

  function statusClass(name) {
    const s = (name || "").toLowerCase();
    if (s.indexOf("nova") >= 0) return "st-nova";
    if (s.indexOf("valida") >= 0) return "st-validacao";
    if (s.indexOf("planej") >= 0) return "st-planejamento";
    if (s.indexOf("andamento") >= 0) return "st-andamento";
    if (s.indexOf("pagamento") >= 0) return "st-pagamento";
    if (s.indexOf("deploy") >= 0) return "st-andamento";
    if (s.indexOf("resolv") >= 0) return "st-resolvida";
    if (s.indexOf("fechad") >= 0 || s.indexOf("finaliz") >= 0) return "st-finalizado";
    return "st-other";
  }
  function fmtDateBR(ymd) {
    if (!ymd) return "—";
    var m = String(ymd).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(ymd);
    return m[3] + "/" + m[2] + "/" + m[1];
  }
  function lastCommentText(issue) {
    if (issue.__lastComment) return issue.__lastComment;
    var d = (issue.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (d) return d.length > 120 ? d.slice(0, 117) + "…" : d;
    return "Sem comentários ainda.";
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

  /** Versão na data — prefere versões do projectId da issue (evita atrelar sprint de outro projeto) */
  function versionAtDate(d, preferProjectId) {
    var list = versions;
    if (preferProjectId != null) {
      var own = versions.filter(function (v) {
        return v.project && String(v.project.id) === String(preferProjectId);
      });
      if (own.length) list = own;
    } else {
      var projIds = selectedProjectIdsList();
      if (projIds && projIds.length) list = versionsForProjects(projIds);
    }
    for (var i = 0; i < list.length; i++) {
      var p = versionPeriod(list[i]);
      if (p && d >= p.start && d <= p.due) return p;
    }
    return null;
  }

  function renderChips(containerId, items, selectedSet, key) {
    const el = document.getElementById(containerId);
    if (!el) return;
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
          if (k === "assignee" || k === "mod") {
            saveSharedFilters(k === "assignee" ? { assignee: sel.assignee } : { mod: sel.mod });
          }
        }
        fillChips();
        applyFilters();
        if (k === "status") {
          var km = document.getElementById("kanbanModal");
          if (km && !km.classList.contains("hidden") && window.__kanbanVersion) {
            openKanban(window.__kanbanVersion.id, window.__kanbanVersion.name);
          }
        }
      };
    });
  }

  function renderModDropdown() {
    var el = document.getElementById("modMs");
    if (!el) return;
    var modOpts = moduleOptionsFromSelection();
    function isOn(id) {
      if (sel.mod === null) return true;
      return sel.mod.indexOf(String(id)) >= 0 || sel.mod.indexOf(id) >= 0;
    }
    var nOn = 0;
    modOpts.forEach(function (m) { if (isOn(m.id)) nOn++; });
    var summary = !modOpts.length ? "Sem subprojetos" :
      (sel.mod === null ? "Todos (" + modOpts.length + ")" :
        (nOn === 0 ? "Nenhum" : nOn + " de " + modOpts.length));
    var body = modOpts.map(function (m) {
      return '<label class="ms-option" style="padding-left:' + (10 + (m.depth || 0) * 12) + 'px">' +
        '<input type="checkbox" data-mid="' + m.id + '"' + (isOn(m.id) ? " checked" : "") + '/>' +
        '<span class="ms-dot neon-p' + neonIndex(m.name, 6) + '"></span>' +
        '<span class="ms-label" title="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + "</span></label>";
    }).join("") || '<div class="muted" style="padding:8px;font-size:.75rem">Nenhum filho no projeto selecionado</div>';
    el.innerHTML =
      '<button type="button" class="ms-trigger" id="modMsTrigger" aria-expanded="false">' +
        '<span class="ms-trigger-ico">⊞</span>' +
        '<span class="ms-trigger-text">' + escapeHtml(summary) + "</span>" +
        '<span class="ms-trigger-chev">▾</span></button>' +
      '<div class="ms-panel hidden" id="modMsPanel">' +
        '<div class="ms-panel-head"><span>Subprojetos</span>' +
          '<span class="ms-panel-acts">' +
            '<button type="button" class="ms-mini" id="modAll">Todos</button>' +
            '<button type="button" class="ms-mini" id="modNone">Limpar</button>' +
          "</span></div>" +
        '<div class="ms-panel-body" style="max-height:180px;overflow-y:auto">' + body + "</div></div>";
    var trigger = document.getElementById("modMsTrigger");
    var panel = document.getElementById("modMsPanel");
    if (trigger) trigger.onclick = function (e) {
      e.stopPropagation();
      if (panel.classList.contains("hidden")) { panel.classList.remove("hidden"); trigger.setAttribute("aria-expanded", "true"); }
      else { panel.classList.add("hidden"); trigger.setAttribute("aria-expanded", "false"); }
    };
    if (!window.__modMsDocClose) {
      window.__modMsDocClose = true;
      document.addEventListener("click", function (e) {
        var t = document.getElementById("modMs");
        if (t && !t.contains(e.target)) {
          var p = document.getElementById("modMsPanel");
          if (p) p.classList.add("hidden");
        }
      });
    }
    function sync() {
      var boxes = el.querySelectorAll("input[data-mid]");
      var arr = [];
      boxes.forEach(function (b) { if (b.checked) arr.push(String(b.dataset.mid)); });
      if (arr.length === 0) sel.mod = [];
      else if (arr.length === boxes.length) sel.mod = null;
      else sel.mod = arr;
      saveSharedFilters({ mod: sel.mod });
      applyFilters();
      var txt = el.querySelector(".ms-trigger-text");
      if (txt) {
        var n = arr.length;
        txt.textContent = sel.mod === null ? "Todos (" + boxes.length + ")" : (n === 0 ? "Nenhum" : n + " de " + boxes.length);
      }
    }
    el.querySelectorAll("input[data-mid]").forEach(function (inp) {
      inp.onchange = function (e) { e.stopPropagation(); sync(); };
      inp.onclick = function (e) { e.stopPropagation(); };
    });
    var a = document.getElementById("modAll");
    var n = document.getElementById("modNone");
    if (a) a.onclick = function (e) { e.stopPropagation(); el.querySelectorAll("input[data-mid]").forEach(function (b) { b.checked = true; }); sel.mod = null; sync(); };
    if (n) n.onclick = function (e) { e.stopPropagation(); el.querySelectorAll("input[data-mid]").forEach(function (b) { b.checked = false; }); sel.mod = []; sync(); };
  }

  function fillChips() {
    GLOG.step("fillChips");
    renderChips("chipsScope", [
      { v: "all", l: "Todos" }, { v: "2.0", l: "HEMOPI 2.0" },
      { v: "legado", l: "Legado" }, { v: "inf", l: "INF" }
    ], new Set(sel.scope), "scope");

    /* Sprints dinâmicos: APENAS versões dos projetos selecionados.
       Se o projeto selecionado não tiver nenhuma versão, só "Backlog" aparece. */
    var sprints = ["Backlog"];
    var seenSprint = { "Backlog": true };
    var projIds = null;
    if (sel.projects !== null) {
      projIds = [];
      sel.projects.forEach(function (x) {
        var n = +x;
        if (!isNaN(n) && n > 0) projIds.push(n);
      });
    }
    versionsForProjects(projIds).forEach(function (v) {
      var nm = v.name || "";
      if (!nm || seenSprint[nm] || isBacklogVersionName(nm)) return;
      seenSprint[nm] = true;
      sprints.push(nm);
    });
    /* Também inclui nomes de fixed_version das issues dos projetos selecionados
       (exceto Backlog — esse é sempre sintético) */
    allIssues.forEach(function (i) {
      if (sel.projects !== null) {
        var pid = i.project && i.project.id;
        if (pid == null || (!sel.projects.has(pid) && !sel.projects.has(String(pid)))) return;
      }
      var n = sprintName(i);
      if (n && n !== "Backlog" && !isBacklogVersionName(n) && !seenSprint[n]) {
        seenSprint[n] = true;
        sprints.push(n);
      }
    });
    renderChips("chipsSprint", sprints, sel.sprint === null ? null : new Set(sel.sprint), "sprint");

    renderModDropdown();

    var stsSet = {};
    allIssues.forEach(function (i) {
      if (sel.projects !== null) {
        var pid = i.project && i.project.id;
        if (pid == null || (!sel.projects.has(pid) && !sel.projects.has(String(pid)))) return;
      }
      if (i.status && i.status.name) stsSet[i.status.name] = true;
    });
    var sts = Object.keys(stsSet).sort();
    renderChips("chipsStatus", sts.map(function (s) { return { v: s, l: shortStatus(s) }; }), sel.status === null ? null : new Set(sel.status), "status");

    var devs = assigneeOptionsFromIssues();
    var assigneeItems = [{ v: "none", l: "Sem responsável" }].concat(
      devs.map(function (d) { return { v: String(d.id), l: d.name }; })
    );
    renderChips(
      "chipsAssignee",
      assigneeItems,
      sel.assignee === null ? null : new Set(sel.assignee.map(String)),
      "assignee"
    );

    renderChips("chipsCompleteness", [
      { v: "incomplete", l: "⚠ Incompletas" },
      { v: "complete", l: "✓ Completas" }
    ], sel.completeness === null ? null : new Set(sel.completeness), "completeness");
  }

  function applyFilters() {
    GLOG.step("applyFilters", { issues: allIssues.length, sel: sel });
    filtered = allIssues.filter(function (i) {
      if (sel.projects !== null) {
        var pid = i.project && i.project.id;
        if (pid == null) return false;
        if (!sel.projects.has(pid) && !sel.projects.has(String(pid))) return false;
      }
      if (sel.scope.indexOf("all") < 0 && sel.scope.indexOf(getScope(i)) < 0) return false;
      if (sel.sprint !== null && sel.sprint.indexOf(sprintName(i)) < 0) return false;
      /* módulo dinâmico: id de projeto filho (ou ancestral na path) */
      if (sel.mod !== null) {
        var path = projectPath(i);
        var hit = path.some(function (p) {
          return sel.mod.indexOf(String(p.id)) >= 0 || sel.mod.indexOf(p.id) >= 0 || sel.mod.indexOf(p.name) >= 0;
        });
        if (!hit) return false;
      }
      if (sel.status !== null) {
        var sn = (i.status && i.status.name) || "";
        var ok = sel.status.some(function (s) {
          var a = String(s), b = sn;
          var as = a.replace(/^Desenvolvimento:\s*/i, "");
          var bs = b.replace(/^Desenvolvimento:\s*/i, "");
          return a === b || as === bs || a === bs || as === b;
        });
        if (!ok) return false;
      }
      if (sel.assignee !== null) {
        var aid = i.assigned_to && i.assigned_to.id;
        var wantNone = sel.assignee.indexOf("none") >= 0 || sel.assignee.indexOf(null) >= 0;
        var matchId = aid != null && (sel.assignee.indexOf(aid) >= 0 || sel.assignee.indexOf(String(aid)) >= 0);
        var matchNone = wantNone && aid == null;
        if (!matchId && !matchNone) return false;
      }
      /* Completude: campos obrigatórios (início, fim, responsável, descrição) */
      if (sel.completeness !== null && sel.completeness.length) {
        var incomplete = isIncompleteIssue(i);
        var wantInc = sel.completeness.indexOf("incomplete") >= 0;
        var wantOk = sel.completeness.indexOf("complete") >= 0;
        if (wantInc && !wantOk && !incomplete) return false;
        if (wantOk && !wantInc && incomplete) return false;
      }
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
    var projIdsForRange = null;
    if (sel.projects !== null) {
      projIdsForRange = [];
      sel.projects.forEach(function (x) {
        var n = +x;
        if (!isNaN(n) && n > 0) projIdsForRange.push(n);
      });
    }
    versionsForProjects(projIdsForRange).forEach(function (v) {
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
    /* Apenas versões dos projetos selecionados — se nenhum projeto tiver versão, só Backlog */
    var projIds = null;
    if (sel.projects !== null) {
      projIds = [];
      sel.projects.forEach(function (x) {
        var n = +x;
        if (!isNaN(n) && n > 0) projIds.push(n);
      });
    }
    var sorted = versionsForProjects(projIds).filter(function (v) { return v.due_date; }).sort(function (a, b) {
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
    GLOG.step("renderGantt", { filtered: filtered.length });
    computeRange();
    var left = document.getElementById("leftBody");
    var head = document.getElementById("timeHead");
    var body = document.getElementById("timeBody");
    var baseUrl = getCookie(C_URL).replace(/\/$/, "");

    var ROW_H = 240;
    
    var ROW_H = 240;
    
    var ROW_H = 240;
    function isIssueCollapsed(issue) {
      var path = projectPath(issue);
      for (var ci = 0; ci < path.length; ci++) {
        if (path[ci] && collapsedProjects[String(path[ci].id)]) return true;
      }
      return false;
    }
    var visibleIssues = filtered.filter(function (i) { return !isIssueCollapsed(i); });
    window.__ganttVisibleIssues = visibleIssues;

    /* Esquerda: 1 linha por task, mesma altura do card — alinhamento perfeito */
    var rowsHtml = visibleIssues.map(function (i) {
      var name = cleanSubject(i.subject || "");
      var path = projectPath(i);
      var leaf = path.length ? path[path.length - 1] : null;
      var tint = leaf ? "neon-p" + neonIndex(leaf.name, 6) : "neon-p0";
      var proj = leaf ? leaf.name : (i.project && i.project.name) || "";
      return '<div class="gantt-row-label row-tint ' + tint + '" data-issue="' + i.id + '" title="' + escapeHtml(proj + " · " + name) + '">' +
        '<div class="rl-id">#' + i.id + '</div>' +
        '<div class="rl-body">' +
          '<div class="rl-name">' + escapeHtml(name) + '</div>' +
          '<div class="rl-proj">' + escapeHtml(proj) + '</div>' +
        '</div></div>';
    }).join("");
    left.innerHTML = '<div class="left-rows" id="leftRows">' + rowsHtml + '</div>';
    /* clique na label → destaca card */
    left.querySelectorAll(".gantt-row-label").forEach(function (lab) {
      lab.onclick = function () {
        var id = lab.getAttribute("data-issue");
        var el = document.querySelector('.bar[data-id="' + id + '"]');
        if (el) {
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          el.style.outline = "2px solid #0052cc";
          setTimeout(function () { el.style.outline = ""; }, 1200);
        }
      };
    });

var bands = versionBands();
    var visualDays = window.__ganttVisualDays || dayCount;
    var sprintHtml = '<div class="sprint-band" id="sprintBand" style="width:' + (visualDays * DAY_W + 36) + 'px">';
    bands.forEach(function (b) {
      var eye = b.backlog || !b.versionId ? "" :
        '<button type="button" class="eye" data-vid="' + b.versionId + '" data-vname="' + escapeHtml(b.name) + '" title="Kanban">👁</button>';
      var plus =
        '<button type="button" class="sprint-task-add" data-vid="' + (b.versionId || "") +
        '" data-vname="' + escapeHtml(b.name || "Backlog") +
        '" data-backlog="' + (b.backlog ? "1" : "0") +
        '" title="Nova task nesta coluna">+</button>';
      sprintHtml +=
        '<div class="sprint-cell' + (b.backlog ? " backlog-band" : "") +
        '" data-days="' + b.span + '" style="width:' + (b.span * DAY_W) + 'px;flex:0 0 ' + (b.span * DAY_W) + 'px"><span>' + escapeHtml(b.name) +
        "</span>" + eye + plus + "</div>";
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

    /* largura da day-band = exatamente colDates (1:1 com spans das sprints) */
    var dayCols = colDates.length || visualDays || 1;
    var dayHtml = '<div class="day-band" style="width:' + (dayCols * DAY_W) + 'px">';
    for (var di = 0; di < colDates.length; di++) {
      var d = colDates[di];
      if (!d) {
        dayHtml += '<div class="day-cell backlog-day" style="width:' + DAY_W + 'px;flex:0 0 ' + DAY_W + 'px">·</div>';
      } else {
        var cls = ["day-cell"];
        if (isWeekend(d)) cls.push("weekend");
        if (fmtYMD(d) === fmtYMD(today)) cls.push("today");
        dayHtml += '<div class="' + cls.join(" ") + '" style="width:' + DAY_W + 'px;flex:0 0 ' + DAY_W + 'px">' + d.getDate() + "</div>";
      }
    }
    dayHtml += "</div>";
    /* sincroniza visualDays com colunas reais geradas */
    window.__ganttVisualDays = dayCols;
    visualDays = dayCols;
    head.innerHTML = sprintHtml + dayHtml;
    var sb = document.getElementById("sprintBand");
    if (sb) sb.style.width = (dayCols * DAY_W + 36) + "px";

    head.querySelectorAll(".eye").forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openKanban(+btn.dataset.vid, btn.dataset.vname);
      };
    });
    head.querySelectorAll(".sprint-task-add").forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openNewTaskDialog({
          versionId: btn.dataset.vid ? +btn.dataset.vid : null,
          versionName: btn.dataset.vname || "Backlog",
          backlog: btn.dataset.backlog === "1"
        });
      };
    });
    var btnNs = document.getElementById("btnNewSprint");
    if (btnNs) btnNs.onclick = function (e) { e.stopPropagation(); openNewSprintDialog(); };

var rows = "";
    visibleIssues.forEach(function (issue) {
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
        /* sem datas: bar CURTA (2 dias) no início da banda da sprint para o user ajustar */
        var shortOnSprint = false;
        if (!s || !e) {
          if (issue.fixed_version && issue.fixed_version.id != null) {
            for (var bb2 = 0; bb2 < bands.length; bb2++) {
              if (!bands[bb2].backlog && String(bands[bb2].versionId) === String(issue.fixed_version.id)) {
                i0 = bands[bb2].from + 1;
                i1 = Math.min(i0 + 1, bands[bb2].from + bands[bb2].span - 1); /* ~2 colunas */
                if (i1 < i0) i1 = i0;
                shortOnSprint = true;
                break;
              }
            }
            /* se banda ainda não existe no range, usa período da versão (só 2 dias a partir do start) */
            if (!shortOnSprint) {
              var ver = null;
              for (var vi = 0; vi < versions.length; vi++) {
                if (String(versions[vi].id) === String(issue.fixed_version.id)) { ver = versions[vi]; break; }
              }
              if (ver) {
                var vp = versionPeriod(ver);
                if (vp && vp.start) {
                  s = vp.start;
                  e = addDays(vp.start, 1); /* 2 dias úteis visuais */
                }
              }
            }
          }
        }
        if (!shortOnSprint && s && e) {
          i0 = findCol(s);
          i1 = findCol(e);
          if (i0 < 0) i0 = findCol(e);
          if (i1 < 0) i1 = i0;
          if (i1 < i0) { var t = i0; i0 = i1; i1 = t; }
        }
      }
      if (i0 != null && i0 >= 0) {
        var who = (issue.assigned_to && issue.assigned_to.name) ? issue.assigned_to.name : "sem responsável";
        var whoShort = who.length > 22 ? who.slice(0, 20) + "…" : who;
        var subj = cleanSubject(issue.subject || "");
        var stLab = shortStatus((issue.status && issue.status.name) || "");
        var dStart = fmtDateBR(issue.start_date);
        var dEnd = fmtDateBR(issue.due_date);
        var lastC = lastCommentText(issue);

        /* span temporal = start..due (pode atravessar sprints) */
        var spanLeft = i0 * DAY_W;
        var spanWidth = Math.max(1, (i1 - i0 + 1)) * DAY_W - 2;

        /* card = largura da banda da sprint (fixed_version) ou backlog */
        var sprintBand = findSprintBand(bands, issue);
        var cardLeft = spanLeft;
        var cardWidth = spanWidth;
        var sprintPeriod = null;
        if (sprintBand && !isBacklogIssue(issue)) {
          cardLeft = sprintBand.from * DAY_W;
          cardWidth = Math.max(DAY_W, sprintBand.span * DAY_W) - 2;
          if (issue.fixed_version) {
            for (var vi2 = 0; vi2 < versions.length; vi2++) {
              if (String(versions[vi2].id) === String(issue.fixed_version.id)) {
                sprintPeriod = versionPeriod(versions[vi2]);
                break;
              }
            }
          }
        } else if (isBacklogIssue(issue)) {
          var blB = null;
          for (var bb3 = 0; bb3 < bands.length; bb3++) if (bands[bb3].backlog) blB = bands[bb3];
          if (blB) {
            cardLeft = blB.from * DAY_W;
            cardWidth = Math.max(DAY_W, blB.span * DAY_W) - 2;
          }
        }
        var tone = spanBarClass(issue, sprintPeriod);
        var missingReq = getMissingRequired(issue);
        var incompleteCls = missingReq.length ? " bar-incomplete" : "";
        var incompleteBadge = missingReq.length
          ? '<span class="bar-incomplete-badge" title="Campos faltando: ' + escapeHtml(missingReq.join(", ")) + '">⚠</span>'
          : "";
        var incompleteTitle = missingReq.length ? " · Faltam: " + missingReq.join(", ") : "";

        bar =
          '<div class="bar ' + statusClass(issue.status.name) + incompleteCls + '" data-id="' + issue.id +
          '" style="left:' + cardLeft + 'px;width:' + cardWidth + 'px" title="' +
          escapeHtml(subj) + ' · ' + who.replace(/"/g, "") + escapeHtml(incompleteTitle) + '">' +
            '<div class="handle left" data-edge="left"></div>' +
            '<div class="bar-header">' +
              '<span class="bar-task-id">#' + issue.id + incompleteBadge + '</span>' +
              '<div class="bar-project-name" title="' + escapeHtml(subj) + '">' + escapeHtml(subj) + '</div>' +
            '</div>' +
            '<div class="comment-header-row">' +
              '<span class="comment-title">Último Comentário:</span>' +
              '<button type="button" class="add-comment-btn" data-comment="' + issue.id + '" title="Adicionar comentário">+</button>' +
            '</div>' +
            '<div class="bar-last-comment" title="' + escapeHtml(lastC) + '">' + escapeHtml(lastC) + '</div>' +
            '<div class="bar-dates-row">' +
              '<span>Início: <strong class="val-start">' + dStart + '</strong></span>' +
              '<span>Fim: <strong class="val-end">' + dEnd + '</strong></span>' +
            '</div>' +
            '<div class="bar-status-row">Status: ' + escapeHtml(stLab) + '</div>' +
            '<div class="bar-content-bottom">' +
              '<span class="bar-who" title="' + escapeHtml(who) + '">' + escapeHtml(whoShort) + '</span>' +
              '<span class="bar-actions">' +
                '<button type="button" class="icon-btn eye-btn" title="Ver descrição">👁</button>' +
                '<button type="button" class="icon-btn status-btn" title="Alterar status">☰</button>' +
                '<button type="button" class="icon-btn person-btn" title="Responsável: ' + who.replace(/"/g, "") + '">👤</button>' +
              '</span>' +
            '</div>' +
            '<div class="handle right" data-edge="right"></div>' +
          '</div>' +
          '<div class="span-bar ' + tone + '" data-issue="' + issue.id +
          '" style="left:' + spanLeft + 'px;width:' + spanWidth + 'px" title="#' + issue.id +
          ' · ' + dStart + ' → ' + dEnd + ' · ' + tone + '"></div>';
      }
      rows += '<div class="gantt-row-track" style="width:' + visualDays * DAY_W + 'px">' + extras + bar + "</div>";
    });
    body.innerHTML = rows;
    bindBarEvents();
  }


  var __commentIssueId = null;
  function openCommentModal(issueId) {
    var issue = allIssues.find(function (x) { return String(x.id) === String(issueId); });
    if (!issue) { toast("Task #" + issueId + " não encontrada", true); return; }
    __commentIssueId = issue.id;
    var modal = document.getElementById("commentModal");
    var title = document.getElementById("cmTitle");
    var sub = document.getElementById("cmSubheader");
    var ta = document.getElementById("cmText");
    if (!modal || !title || !sub || !ta) return;
    title.textContent = "Adicionar Comentário à Task #" + issue.id;
    var who = (issue.assigned_to && issue.assigned_to.name) || "Sem responsável";
    sub.innerHTML =
      "<strong>Projeto:</strong> " + escapeHtml(cleanSubject(issue.subject || "")) + "<br>" +
      "<strong>Período:</strong> " + fmtDateBR(issue.start_date) + " até " + fmtDateBR(issue.due_date) + "<br>" +
      "<strong>Status:</strong> " + escapeHtml(shortStatus((issue.status && issue.status.name) || "")) +
      " | <strong>Responsável:</strong> " + escapeHtml(who);
    ta.value = "";
    modal.classList.add("open");
    ta.focus();
  }
  function closeCommentModal() {
    var modal = document.getElementById("commentModal");
    if (modal) modal.classList.remove("open");
    __commentIssueId = null;
  }
  async function submitComment() {
    var ta = document.getElementById("cmText");
    var texto = ta ? ta.value.trim() : "";
    if (!texto) { toast("Digite um comentário", true); return; }
    if (!__commentIssueId) return;
    try {
      await api("PUT", "/issues/" + __commentIssueId + ".json", { issue: { notes: texto } });
      var issue = allIssues.find(function (x) { return x.id === __commentIssueId; });
      if (issue) issue.__lastComment = texto;
      toast("Comentário salvo em #" + __commentIssueId);
      closeCommentModal();
      applyFilters();
    } catch (e) {
      toast("Falha ao comentar: " + e.message, true);
    }
  }
  function bindCommentButtons(root) {
    (root || document).querySelectorAll("[data-comment]").forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        openCommentModal(btn.getAttribute("data-comment"));
      };
    });
  }

  function bindBarEvents() {
    bindCommentButtons(document);
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
            /* Backlog sintético: só remove fixed_version. NUNCA altera project_id. */
            try {
              await api("PUT", "/issues/" + id + ".json", {
                issue: { fixed_version_id: "" }
              });
              issue.fixed_version = null;
              /* garante que o filtro de Sprint mostre Backlog (senão a task "some") */
              if (sel.sprint !== null && sel.sprint.indexOf("Backlog") < 0) {
                sel.sprint = sel.sprint.concat(["Backlog"]);
              }
              toast("#" + id + " → Backlog do projeto (versão removida, projeto inalterado)");
              fillChips();
              applyFilters();
            } catch (err) {
              toast("Erro ao mover para Backlog: " + err.message, true);
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
          /* Preferir versão do MESMO projeto da issue — não herdar sprint de outro projeto */
          var issueProjId = issue.project && issue.project.id != null ? issue.project.id : null;
          var ver = versionAtDate(newStart, issueProjId);
          var payload = { start_date: fmtYMD(newStart), due_date: fmtYMD(newDue) };
          if (ver) payload.fixed_version_id = ver.id;

          try {
            await api("PUT", "/issues/" + id + ".json", { issue: payload });
            issue.start_date = payload.start_date;
            issue.due_date = payload.due_date;
            if (ver) {
              issue.fixed_version = {
                id: ver.id,
                name: ver.name,
                project: issue.project ? { id: issue.project.id } : undefined
              };
              toast("#" + id + " → " + ver.name + " · " + payload.start_date + " … " + payload.due_date);
            } else {
              /* Sem versão do próprio projeto na data → fica só com datas, sem sprint alheia */
              toast("#" + id + " → " + payload.start_date + " … " + payload.due_date + " (sem sprint do projeto)");
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

  function placeMenu(menu, x, y) {
    if (!menu) return;
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
    menu.classList.remove("hidden");
    menu.style.display = "flex";
    menu.style.flexDirection = "column";
    menu.style.visibility = "hidden";
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.maxHeight = "none";
    var pad = 12;
    var taskbar = 56; /* folga barra do Windows / dock */
    var maxH = Math.max(120, window.innerHeight - pad * 2 - taskbar);
    menu.style.maxHeight = maxH + "px";
    menu.style.overflowY = "auto";
    menu.style.overflowX = "hidden";
    /* reflow */
    void menu.offsetHeight;
    var mw = Math.max(menu.offsetWidth || 260, 240);
    var mh = Math.min(menu.scrollHeight || 200, maxH);
    var left = Math.max(pad, Math.min(x, window.innerWidth - mw - pad));
    var top = y;
    if (top + mh > window.innerHeight - pad - taskbar) {
      top = window.innerHeight - mh - pad - taskbar;
    }
    if (top < pad) top = pad;
    /* altura final = espaço disponível a partir de top */
    var avail = window.innerHeight - top - pad - taskbar;
    if (avail < mh) {
      menu.style.maxHeight = Math.max(100, avail) + "px";
    }
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "visible";
    if (window.__HEMOPI_GLOG) GLOG.step("placeMenu", { left: left, top: top, maxH: menu.style.maxHeight });
  }

  function openStatusMenu(issueId, x, y) {
    GLOG.step("openStatusMenu", { issueId: issueId, x: x, y: y });
    var menu = document.getElementById("statusMenu");
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
    var list = (statuses.length ? statuses : [
      { id: 1, name: "Nova" }, { id: 12, name: "Desenvolvimento: Planejamento" },
      { id: 11, name: "Desenvolvimento: Em Andamento" }, { id: 9, name: "Desenvolvimento: Em Validação" },
      { id: 16, name: "Desenvolvimento: Em Deploy" }, { id: 13, name: "Em Pagamento" },
      { id: 4, name: "Resolvida" }, { id: 5, name: "Fechada" }, { id: 6, name: "Rejeitada" }
    ]).filter(function (s) {
      if (sel.status === null) return true;
      return sel.status.some(function (selS) {
        var a = String(selS), b = s.name;
        var as = a.replace(/^Desenvolvimento:\s*/i, "");
        var bs = b.replace(/^Desenvolvimento:\s*/i, "");
        return a === b || as === bs || a === bs || as === b;
      });
    });

    menu.innerHTML = list.map(function (s) {
      return '<button type="button" data-sid="' + s.id + '">' + s.name + "</button>";
    }).join("") || '<div style="padding:8px;color:#94a3b8;font-size:.8rem">Nenhum status marcado</div>';
    var am = document.getElementById("assigneeMenu");
    if (am) hide(am);
    placeMenu(menu, x, y);
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
    GLOG.step("openAssigneeMenu", { issueId: issueId, x: x, y: y });
    var menu = document.getElementById("assigneeMenu");
    if (!menu) return;
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
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
    hide(document.getElementById("statusMenu"));
    placeMenu(menu, x, y);
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
        e.preventDefault();
        e.stopPropagation();
        var on = card.classList.toggle("is-fs");
        fsBtn.textContent = on ? "❐" : "⛶";
        fsBtn.title = on ? "Sair da tela cheia" : "Tela cheia";
        if (on) {
          card.style.position = "fixed";
          card.style.left = "0";
          card.style.top = "0";
          card.style.width = "100vw";
          card.style.height = "100vh";
          card.style.maxWidth = "100vw";
          card.style.maxHeight = "100vh";
          card.style.margin = "0";
          card.style.borderRadius = "0";
          card.style.zIndex = "10040";
        } else {
          card.style.left = "";
          card.style.top = "";
          card.style.width = "";
          card.style.height = "";
          card.style.position = "";
          card.style.margin = "";
          card.style.maxWidth = "";
          card.style.maxHeight = "";
          card.style.borderRadius = "";
          card.style.zIndex = "";
        }
        GLOG.step("modal fullscreen", { cardId: cardId, on: on });
      });
    }
  }

  
  /* Fullscreen por delegação — funciona mesmo se enhanceModal já rodou */
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest(".modal-fs");
    if (!btn) return;
    var card = btn.closest(".modal-card");
    if (!card) return;
    ev.preventDefault();
    ev.stopPropagation();
    var on = card.classList.toggle("is-fs");
    btn.textContent = on ? "❐" : "⛶";
    btn.title = on ? "Sair da tela cheia" : "Tela cheia";
    if (on) {
      card.style.position = "fixed";
      card.style.left = "0";
      card.style.top = "0";
      card.style.width = "100vw";
      card.style.height = "100vh";
      card.style.maxWidth = "100vw";
      card.style.maxHeight = "100vh";
      card.style.margin = "0";
      card.style.borderRadius = "0";
      card.style.zIndex = "10040";
    } else {
      card.style.left = "";
      card.style.top = "";
      card.style.width = "";
      card.style.height = "";
      card.style.position = "";
      card.style.margin = "";
      card.style.maxWidth = "";
      card.style.maxHeight = "";
      card.style.borderRadius = "";
      card.style.zIndex = "";
    }
    if (window.__HEMOPI_GLOG) GLOG.step("fullscreen toggle", { on: on, id: card.id });
  }, true);

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

  var __issueDescRaw = "";
  var __issueDescId = null;

  function setDescEditMode(on) {
    var bodyEl = document.getElementById("issueBody");
    var editEl = document.getElementById("issueBodyEdit");
    var btnEdit = document.getElementById("btnEditDesc");
    var btnSave = document.getElementById("btnSaveDesc");
    var btnCancel = document.getElementById("btnCancelDesc");
    if (!bodyEl || !editEl) return;
    if (on) {
      editEl.value = __issueDescRaw || "";
      bodyEl.classList.add("hidden");
      editEl.classList.remove("hidden");
      if (btnEdit) btnEdit.classList.add("hidden");
      if (btnSave) btnSave.classList.remove("hidden");
      if (btnCancel) btnCancel.classList.remove("hidden");
      editEl.focus();
    } else {
      bodyEl.classList.remove("hidden");
      editEl.classList.add("hidden");
      if (btnEdit) btnEdit.classList.remove("hidden");
      if (btnSave) btnSave.classList.add("hidden");
      if (btnCancel) btnCancel.classList.add("hidden");
    }
  }

  function renderIssueDescription(desc) {
    var bodyEl = document.getElementById("issueBody");
    if (!bodyEl) return;
    if (!desc || !String(desc).trim()) {
      bodyEl.innerHTML = '<span class="muted">Sem descrição cadastrada nesta issue.</span>';
    } else if (looksLikeHtml(desc)) {
      bodyEl.innerHTML = safeHtml(desc);
    } else {
      bodyEl.innerHTML = escapeHtml(desc).replace(/\n/g, "<br>");
    }
  }

  async function saveIssueDescription() {
    if (!__issueDescId) return;
    var editEl = document.getElementById("issueBodyEdit");
    if (!editEl) return;
    var newDesc = editEl.value;
    try {
      await api("PUT", "/issues/" + __issueDescId + ".json", { issue: { description: newDesc } });
      __issueDescRaw = newDesc;
      /* atualiza em memória */
      var local = allIssues.find(function (x) { return x.id === __issueDescId; });
      if (local) local.description = newDesc;
      renderIssueDescription(newDesc);
      setDescEditMode(false);
      toast("Descrição salva em #" + __issueDescId);
    } catch (err) {
      toast("Erro ao salvar descrição: " + err.message, true);
    }
  }

  async function openIssueDetail(issueId) {
    hide(document.getElementById("statusMenu"));
    hide(document.getElementById("assigneeMenu"));

    var modal = document.getElementById("issueModal");
    var titleEl = document.getElementById("issueTitle");
    var metaEl = document.getElementById("issueMeta");
    var bodyEl = document.getElementById("issueBody");
    var commentsEl = document.getElementById("issueComments");
    var baseUrl = getCookie(C_URL).replace(/\/$/, "");
    enhanceModal("issueCard");
    resetModalPosition("issueCard");
    titleEl.textContent = "#" + issueId + " · carregando…";
    metaEl.innerHTML = "";
    bodyEl.textContent = "Carregando descrição…";
    if (commentsEl) commentsEl.innerHTML = '<div class="issue-comment-empty">Carregando comentários…</div>';
    __issueDescId = issueId;
    __issueDescRaw = "";
    setDescEditMode(false);
    show(modal);
    try {
      var data = await api("GET", "/issues/" + issueId + ".json?include=journals");
      var issue = data.issue || {};
      var local = allIssues.find(function (x) { return x.id === issueId; }) || issue;
      titleEl.textContent = "#" + issueId + " · " + cleanSubject(issue.subject || local.subject || "");
      var who = (issue.assigned_to && issue.assigned_to.name) || (local.assigned_to && local.assigned_to.name) || "—";
      var st = (issue.status && issue.status.name) || (local.status && local.status.name) || "—";
      var spName = (issue.fixed_version && issue.fixed_version.name) || (local.fixed_version && local.fixed_version.name) || "";
      var sp = isBacklogVersionName(spName) || !spName ? "Backlog" : spName;
      var missingModal = getMissingRequired(Object.assign({}, local, issue));
      var missingHtml = missingModal.length
        ? '<span class="issue-missing-warn" title="Preencha estes campos"><strong>⚠ Faltam:</strong> ' + escapeHtml(missingModal.join(", ")) + "</span>"
        : "";
      metaEl.innerHTML =
        "<span><strong>Status:</strong> " + escapeHtml(shortStatus(st)) + "</span>" +
        "<span><strong>Sprint:</strong> " + escapeHtml(sp) + "</span>" +
        "<span><strong>Responsável:</strong> " + escapeHtml(who) + "</span>" +
        "<span><strong>Início:</strong> " + escapeHtml(issue.start_date || local.start_date || "—") + "</span>" +
        "<span><strong>Fim:</strong> " + escapeHtml(issue.due_date || local.due_date || "—") + "</span>" +
        missingHtml +
        '<span><a href="' + baseUrl + "/issues/" + issueId + '" target="_blank">Abrir no Redmine ↗</a></span>';
      var desc = issue.description || "";
      __issueDescRaw = desc;
      renderIssueDescription(desc);

      /* Comentários / journals ordenados por data de criação (mais antigos primeiro) */
      if (commentsEl) {
        var journals = (issue.journals || []).slice().filter(function (j) {
          return (j.notes && String(j.notes).trim()) || (j.details && j.details.length);
        });
        journals.sort(function (a, b) {
          var ta = a.created_on || "";
          var tb = b.created_on || "";
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        });
        if (!journals.length) {
          commentsEl.innerHTML = '<div class="issue-comment-empty">Nenhum comentário ou alteração registrada.</div>';
        } else {
          commentsEl.innerHTML = journals.map(function (j) {
            var author = (j.user && j.user.name) || "Sistema";
            var dt = j.created_on ? formatJournalDate(j.created_on) : "—";
            var notes = (j.notes && String(j.notes).trim()) ? j.notes : "";
            var notesHtml = notes
              ? (looksLikeHtml(notes) ? safeHtml(notes) : escapeHtml(notes).replace(/\n/g, "<br>"))
              : "";
            var detailsHtml = "";
            if (j.details && j.details.length) {
              detailsHtml = '<div class="issue-comment-details" style="margin-top:6px;font-size:.75rem;color:var(--muted)">' +
                j.details.map(function (d) {
                  var prop = d.name || d.property || "campo";
                  var oldV = d.old_value != null ? String(d.old_value) : "—";
                  var newV = d.new_value != null ? String(d.new_value) : "—";
                  return "<div>• " + escapeHtml(prop) + ": " + escapeHtml(oldV) + " → " + escapeHtml(newV) + "</div>";
                }).join("") + "</div>";
            }
            return '<div class="issue-comment">' +
              '<div class="issue-comment-head">' +
                '<span class="issue-comment-author">' + escapeHtml(author) + '</span>' +
                '<span class="issue-comment-date">' + escapeHtml(dt) + '</span>' +
              '</div>' +
              (notesHtml ? '<div class="issue-comment-notes">' + notesHtml + '</div>' : '') +
              detailsHtml +
            '</div>';
          }).join("");
        }
      }
    } catch (err) {
      bodyEl.textContent = "Erro ao carregar: " + err.message;
      if (commentsEl) commentsEl.innerHTML = '<div class="issue-comment-empty">Erro ao carregar comentários.</div>';
      toast("Erro descrição: " + err.message, true);
    }
  }

  function formatJournalDate(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
        " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    } catch (e) { return iso; }
  }

  function openKanban(versionId, versionName) {
    hide(document.getElementById("statusMenu"));
    hide(document.getElementById("assigneeMenu"));
    GLOG.step("openKanban", { versionId: versionId, versionName: versionName });
    var modal = document.getElementById("kanbanModal");
    document.getElementById("kanbanTitle").textContent = versionName + " · Kanban";
    var board = document.getElementById("kanbanBoard");
    window.__kanbanVersion = { id: versionId, name: versionName };
    enhanceModal("kanbanCard");
    resetModalPosition("kanbanCard");

    // Colunas = status selecionados no filtro unificado "Status (Visão + Kanban)" (mesmo vazios se selecionados)
    var order = ["Nova", "Desenvolvimento: Planejamento", "Desenvolvimento: Em Andamento", "Desenvolvimento: Em Validação", "Desenvolvimento: Em Deploy", "Em Pagamento", "Resolvida", "Fechada", "Rejeitada"];
    var colNames;
    if (sel.status !== null && sel.status.length > 0) {
      colNames = sel.status.slice();
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
      /* versão explícita OU data de criação/start dentro da semana da sprint */
      if (!issueInSprint(i, versionId, versionName)) return false;
      /* projetos (multi) — qualquer projeto marcado */
      if (sel.projects !== null) {
        var pid = i.project && i.project.id;
        if (pid == null || (!sel.projects.has(pid) && !sel.projects.has(String(pid)))) return false;
      }
      /* subprojetos/módulos dinâmicos (ids da árvore, não getMod M01) */
      if (sel.mod !== null) {
        var path = projectPath(i);
        var hit = path.some(function (p) {
          return sel.mod.indexOf(String(p.id)) >= 0 || sel.mod.indexOf(p.id) >= 0 || sel.mod.indexOf(p.name) >= 0;
        });
        if (!hit) return false;
      }
      /* desenvolvedor */
      if (sel.assignee !== null) {
        var aid = i.assigned_to && i.assigned_to.id;
        var wantNone = sel.assignee.indexOf("none") >= 0 || sel.assignee.indexOf(null) >= 0;
        var matchId = aid != null && (sel.assignee.indexOf(aid) >= 0 || sel.assignee.indexOf(String(aid)) >= 0);
        var matchNone = wantNone && aid == null;
        if (!matchId && !matchNone) return false;
      }
      /* NÃO filtrar por sel.status: colunas do Kanban SÃO os status */
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
      var cards = issuesInSprint.filter(function (i) {
        var sn = (i.status && i.status.name) || "";
        return sn === st || sn.toLowerCase() === String(st).toLowerCase();
      });
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
          var subjK = cleanSubject(i.subject || "");
          var lastCK = lastCommentText(i);
          return '<div class="kanban-card ' + statusClass(stName) + '" draggable="true" data-id="' + i.id + '">' +
            '<div class="bar-header">' +
              '<span class="bar-task-id">#' + i.id + '</span>' +
              '<div class="bar-project-name" title="' + escapeHtml(subjK) + '">' + escapeHtml(subjK) + '</div>' +
            '</div>' +
            '<div class="comment-header-row">' +
              '<span class="comment-title">Último Comentário:</span>' +
              '<button type="button" class="add-comment-btn" data-comment="' + i.id + '" title="Adicionar comentário">+</button>' +
            '</div>' +
            '<div class="bar-last-comment" title="' + escapeHtml(lastCK) + '">' + escapeHtml(lastCK) + '</div>' +
            '<div class="bar-dates-row">' +
              '<span>Início: <strong class="val-start">' + fmtDateBR(i.start_date) + '</strong></span>' +
              '<span>Fim: <strong class="val-end">' + fmtDateBR(i.due_date) + '</strong></span>' +
            '</div>' +
            '<div class="bar-status-row">Status: ' + escapeHtml(shortStatus(stName)) + '</div>' +
            '<div class="bar-content-bottom">' +
              '<span class="bar-who" title="' + escapeHtml(who) + '">' + escapeHtml(whoShort) + '</span>' +
              '<span class="bar-actions">' +
                '<button type="button" class="icon-btn eye-btn" title="Ver descrição">👁</button>' +
                '<button type="button" class="icon-btn status-btn" title="Alterar status">☰</button>' +
                '<button type="button" class="icon-btn person-btn" title="Responsável: ' + escapeHtml(who) + '">👤</button>' +
              '</span>' +
            '</div></div>';
        }).join("") + "</div></div>";
    }).join("");

    /* —— Kanban DnD (mesma estratégia do Gantt: dataTransfer + optimistic DOM + api PUT) —— */
    function refreshKanbanCounts(boardEl) {
      if (!boardEl) return;
      boardEl.querySelectorAll(".kanban-col").forEach(function (col) {
        var body = col.querySelector(".kanban-col-body");
        var head = col.querySelector(".kanban-col-head");
        if (!body || !head) return;
        var n = body.querySelectorAll(".kanban-card").length;
        var base = (head.textContent || "").replace(/\s*\(\d+\)\s*$/, "");
        head.textContent = base + " (" + n + ")";
      });
    }

    var dragId = null;
    bindCommentButtons(board);
    board.querySelectorAll(".kanban-card").forEach(function (card) {
      card.addEventListener("dragstart", function (ev) {
        if (ev.target.closest && ev.target.closest(".icon-btn")) { ev.preventDefault(); return; }
        dragId = +card.dataset.id;
        try {
          ev.dataTransfer.setData("text/plain", String(dragId));
          ev.dataTransfer.effectAllowed = "move";
        } catch (err) { GLOG.err("dragstart setData", err); }
        card.classList.add("dragging");
        card.style.opacity = ".55";
        GLOG.step("kanban dragstart", { id: dragId });
      });
      card.addEventListener("dragend", function () {
        card.classList.remove("dragging");
        card.style.opacity = "1";
        setTimeout(function () { dragId = null; }, 80);
      });
      var id = +card.dataset.id;
      var eye = card.querySelector(".eye-btn");
      if (eye) eye.addEventListener("click", function (ev) { ev.stopPropagation(); openIssueDetail(id); });
      var stBtn = card.querySelector(".status-btn");
      if (stBtn) stBtn.addEventListener("click", function (ev) { ev.stopPropagation(); openStatusMenu(id, ev.clientX, ev.clientY); });
      var pBtn = card.querySelector(".person-btn");
      if (pBtn) pBtn.addEventListener("click", function (ev) { ev.stopPropagation(); openAssigneeMenu(id, ev.clientX, ev.clientY); });
    });
    board.querySelectorAll(".kanban-col-body").forEach(function (colBody) {
      colBody.addEventListener("dragover", function (e) {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = "move"; } catch (err) {}
        colBody.classList.add("drag-over");
      });
      colBody.addEventListener("dragleave", function (e) {
        if (e.relatedTarget && colBody.contains(e.relatedTarget)) return;
        colBody.classList.remove("drag-over");
      });
      colBody.addEventListener("drop", async function (e) {
        e.preventDefault();
        e.stopPropagation();
        colBody.classList.remove("drag-over");
        /* prioridade: dataTransfer (padrão HTML5) — fallback: dragId em memória */
        var movedId = null;
        try {
          var dt = e.dataTransfer && e.dataTransfer.getData("text/plain");
          if (dt) movedId = +dt;
        } catch (err) {}
        if (!movedId) movedId = dragId;
        if (!movedId) { GLOG.err("kanban drop sem id"); return; }
        var stName = colBody.parentElement && colBody.parentElement.dataset.status;
        var sid = statusIdByName[stName] || FALLBACK[stName];
        if (!sid) { toast("Status sem id: " + stName, true); return; }
        GLOG.step("kanban drop", { id: movedId, status: stName, sid: sid });
        /* optimistic UI — move imediatamente, sem reabrir o modal */
        var cardEl = board.querySelector('.kanban-card[data-id="' + movedId + '"]');
        if (cardEl) {
          colBody.appendChild(cardEl);
          cardEl.style.opacity = "1";
          cardEl.classList.remove("dragging");
          cardEl.className = "kanban-card " + statusClass(stName);
          cardEl.setAttribute("draggable", "true");
          var stSpan = cardEl.querySelector(".kc-st");
          if (stSpan) stSpan.textContent = shortStatus(stName);
        }
        refreshKanbanCounts(board);
        try {
          await api("PUT", "/issues/" + movedId + ".json", { issue: { status_id: sid } });
          var issue = allIssues.find(function (x) { return x.id === movedId; });
          if (issue) issue.status = { id: sid, name: stName };
          toast("#" + movedId + " → " + shortStatus(stName));
          /* atualiza barras do Gantt sem fechar o Kanban */
          applyFilters();
        } catch (err) {
          toast("Erro ao mover #" + movedId + ": " + err.message, true);
          GLOG.err("kanban PUT fail", err);
          /* rollback visual: reabre o board a partir da memória */
          openKanban(versionId, versionName);
        }
      });
    });

    show(modal);
  }

  document.getElementById("kanbanClose").onclick = function () { hide(document.getElementById("kanbanModal")); };
  document.getElementById("kanbanBackdrop").onclick = function () { hide(document.getElementById("kanbanModal")); };
  document.getElementById("issueClose").onclick = function () { hide(document.getElementById("issueModal")); setDescEditMode(false); };
  document.getElementById("issueBackdrop").onclick = function () { hide(document.getElementById("issueModal")); setDescEditMode(false); };

  (function wireDescEdit() {
    var btnEdit = document.getElementById("btnEditDesc");
    var btnSave = document.getElementById("btnSaveDesc");
    var btnCancel = document.getElementById("btnCancelDesc");
    if (btnEdit) btnEdit.onclick = function (e) { e.stopPropagation(); setDescEditMode(true); };
    if (btnSave) btnSave.onclick = function (e) { e.stopPropagation(); saveIssueDescription(); };
    if (btnCancel) btnCancel.onclick = function (e) { e.stopPropagation(); setDescEditMode(false); };
  })();

  /* Filter group: select all / clear */
  document.querySelectorAll(".flt-act").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var box = btn.closest(".filter-box");
      if (!box) return;
      var key = box.dataset.filter;
      var act = btn.dataset.act;
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

  var ntCancel = document.getElementById("ntCancel");
  if (ntCancel) ntCancel.onclick = function () { hide(document.getElementById("newTaskModal")); };
  var ntCancel2 = document.getElementById("ntCancel2");
  if (ntCancel2) ntCancel2.onclick = function () { hide(document.getElementById("newTaskModal")); };
  var ntSave = document.getElementById("ntSave");
  if (ntSave) ntSave.onclick = function () { submitNewTask(); };
  var ntBackdrop = document.getElementById("newTaskBackdrop");
  if (ntBackdrop) ntBackdrop.onclick = function () { hide(document.getElementById("newTaskModal")); };

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
    var lb = document.getElementById("leftBody");
    if (lb) lb.scrollTop = document.getElementById("ganttRight").scrollTop;
  });
  /* sidebar NÃO tem scroll próprio — só acompanha o Gantt à direita */

  function buildProjectTree(flat) {
    var byId = {};
    flat.forEach(function (p) { byId[p.id] = { id: p.id, name: p.name, identifier: p.identifier, parentId: p.parent && p.parent.id, children: [] }; });
    var roots = [];
    Object.keys(byId).forEach(function (id) {
      var n = byId[id];
      if (n.parentId && byId[n.parentId]) byId[n.parentId].children.push(n);
      else roots.push(n);
    });
    function sortRec(nodes) {
      nodes.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
      nodes.forEach(function (c) { sortRec(c.children); });
    }
    sortRec(roots);
    return { byId: byId, roots: roots };
  }
  function collectDescendantIds(node, out) {
    out.push(node.id);
    (node.children || []).forEach(function (c) { collectDescendantIds(c, out); });
    return out;
  }
    function renderProjTree() {
    var el = document.getElementById("projTree");
    if (!el) return;
    var tree = buildProjectTree(allProjects);
    var rootCookie = getCookie(C_PROJ);
    var rootNode = null;
    Object.keys(tree.byId).forEach(function (id) {
      var n = tree.byId[id];
      if (String(n.id) === String(rootCookie) || n.identifier === rootCookie) rootNode = n;
    });
    /* mostra raiz + filhos; se não achar, árvore completa acessível */
    var nodes = rootNode ? [rootNode] : tree.roots;
    /* se a raiz tem parent, inclui irmãos do portfólio no dropdown */
    if (rootNode && rootNode.parentId && tree.byId[rootNode.parentId]) {
      nodes = tree.byId[rootNode.parentId].children.slice() || nodes;
    }

    function isChecked(id) {
      return sel.projects === null || sel.projects.has(id) || sel.projects.has(String(id));
    }
    function countChecked(list) {
      var c = 0;
      function walk(arr) {
        arr.forEach(function (n) {
          if (isChecked(n.id)) c++;
          walk(n.children || []);
        });
      }
      walk(list);
      return c;
    }
    function countAll(list) {
      var c = 0;
      function walk(arr) {
        arr.forEach(function (n) { c++; walk(n.children || []); });
      }
      walk(list);
      return c;
    }
    var total = countAll(nodes);
    var nSel = sel.projects === null ? total : countChecked(nodes);
    var summary = sel.projects === null ? "Todos os projetos" :
      (nSel === 0 ? "Nenhum projeto" : nSel === 1 ? "1 projeto" : nSel + " projetos");

    function walkOptions(list, depth) {
      return list.map(function (n) {
        var pad = depth * 14;
        var hasKids = n.children && n.children.length;
        var checked = isChecked(n.id);
        var row =
          '<label class="ms-option" style="padding-left:' + (10 + pad) + 'px">' +
            '<input type="checkbox" data-pid="' + n.id + '"' + (checked ? " checked" : "") + '/>' +
            '<span class="ms-dot neon-p' + neonIndex(n.name, 6) + '"></span>' +
            '<span class="ms-label" title="' + escapeHtml(n.name) + '">' + escapeHtml(n.name) + "</span>" +
          "</label>";
        return row + walkOptions(n.children || [], depth + 1);
      }).join("");
    }

    el.innerHTML =
      '<button type="button" class="ms-trigger" id="projMsTrigger" aria-expanded="false">' +
        '<span class="ms-trigger-ico">▣</span>' +
        '<span class="ms-trigger-text">' + escapeHtml(summary) + "</span>" +
        '<span class="ms-trigger-chev">▾</span>' +
      "</button>" +
      '<div class="ms-panel hidden" id="projMsPanel">' +
        '<div class="ms-panel-head">' +
          '<span>Projetos</span>' +
          '<span class="ms-panel-acts">' +
            '<button type="button" class="ms-mini" id="projAll" title="Selecionar todos">Todos</button>' +
            '<button type="button" class="ms-mini" id="projNone" title="Limpar">Limpar</button>' +
          "</span>" +
        "</div>" +
        '<div class="ms-panel-body">' + walkOptions(nodes, 0) + "</div>" +
      "</div>";

    var trigger = document.getElementById("projMsTrigger");
    var panel = document.getElementById("projMsPanel");
    function closePanel() {
      if (panel) panel.classList.add("hidden");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    }
    function openPanel() {
      if (panel) panel.classList.remove("hidden");
      if (trigger) trigger.setAttribute("aria-expanded", "true");
    }
    if (trigger) {
      trigger.onclick = function (e) {
        e.stopPropagation();
        if (panel && panel.classList.contains("hidden")) openPanel();
        else closePanel();
      };
    }
    if (!window.__projMsDocClose) {
      window.__projMsDocClose = true;
      document.addEventListener("click", function (e) {
        var t = document.getElementById("projTree");
        if (t && !t.contains(e.target)) {
          var p = document.getElementById("projMsPanel");
          if (p) p.classList.add("hidden");
          var tr = document.getElementById("projMsTrigger");
          if (tr) tr.setAttribute("aria-expanded", "false");
        }
      });
    }
    function syncFromBoxes() {
      var boxes = el.querySelectorAll("input[data-pid]");
      var set = new Set();
      var n = 0;
      boxes.forEach(function (b) {
        if (b.checked) { set.add(+b.dataset.pid); set.add(String(b.dataset.pid)); n++; }
      });
      if (n === 0) sel.projects = new Set([-1]);
      else if (n === boxes.length) sel.projects = null;
      else sel.projects = set;
      (function () {
        var projArr = null;
        if (sel.projects === null) projArr = null;
        else if (sel.projects.has(-1)) projArr = [];
        else projArr = Array.from(sel.projects).filter(function (x) { return String(+x) === String(x); }).map(String);
        saveSharedFilters({ projects: projArr });
      })();
      var txt = el.querySelector(".ms-trigger-text");
      if (txt) {
        var label = sel.projects === null ? "Todos os projetos" :
          (n === 0 ? "Nenhum projeto" : n === 1 ? "1 projeto" : n + " projetos");
        txt.textContent = label;
      }
      /* Busca issues/versões dos projetos marcados (ex.: CREDSUS) se ainda não carregados */
      ensureIssuesForSelectedProjects().then(function () {
        fillChips();
        applyFilters();
      }).catch(function () {
        fillChips();
        applyFilters();
      });
    }
    el.querySelectorAll("input[data-pid]").forEach(function (inp) {
      inp.onchange = function (e) {
        e.stopPropagation();
        var pid = +inp.dataset.pid;
        var node = tree.byId[pid];
        if (node && node.children && node.children.length) {
          var ids = [];
          collectDescendantIds(node, ids);
          var on = inp.checked;
          el.querySelectorAll("input[data-pid]").forEach(function (b) {
            if (ids.indexOf(+b.dataset.pid) >= 0) b.checked = on;
          });
        }
        syncFromBoxes();
      };
      inp.onclick = function (e) { e.stopPropagation(); };
    });
    var btnAll = document.getElementById("projAll");
    var btnNone = document.getElementById("projNone");
    if (btnAll) btnAll.onclick = function (e) {
      e.stopPropagation();
      el.querySelectorAll("input[data-pid]").forEach(function (b) { b.checked = true; });
      sel.projects = null;
      syncFromBoxes();
    };
    if (btnNone) btnNone.onclick = function (e) {
      e.stopPropagation();
      el.querySelectorAll("input[data-pid]").forEach(function (b) { b.checked = false; });
      sel.projects = new Set([-1]);
      syncFromBoxes();
    };
  }

  /* Projetos cujas issues/versões já foram buscadas nesta sessão */
  var loadedProjectIds = {};

  async function fetchIssuesForProject(projectId) {
    var issues = [];
    var offset = 0;
    for (;;) {
      /* subproject_id=* inclui filhos quando a API permitir; senão lista o próprio */
      var d = await api("GET", "/issues.json?project_id=" + encodeURIComponent(projectId) +
        "&subproject_id=*&status_id=*&limit=100&offset=" + offset + "&sort=start_date");
      issues = issues.concat(d.issues || []);
      if ((d.issues || []).length < 100) break;
      offset += 100;
    }
    return issues;
  }

  async function fetchAndMergeVersionsForProject(projectId) {
    try {
      var list = (await api("GET", "/projects/" + projectId + "/versions.json")).versions || [];
      var byId = {};
      versions.forEach(function (v) { byId[v.id] = v; });
      list.forEach(function (v) {
        if (!v.project) v.project = { id: +projectId };
        byId[v.id] = v;
      });
      versions = Object.keys(byId).map(function (id) { return byId[id]; });
    } catch (e) {
      console.warn("[Gantt] versions project", projectId, e);
    }
  }

  /**
   * Garante issues + versões dos projetos selecionados no filtro (sem hardcode de nomes).
   * Se o usuário marca CREDSUS e ele ainda não foi carregado, busca agora.
   */
  async function ensureIssuesForSelectedProjects() {
    var ids = [];
    if (sel.projects === null) {
      /* "todos": carrega irmãos do portfólio + filhos já listados na árvore */
      allProjects.forEach(function (p) {
        if (p && p.id != null) ids.push(+p.id);
      });
    } else if (sel.projects.has(-1)) {
      return; /* nenhum selecionado */
    } else {
      sel.projects.forEach(function (x) {
        var n = +x;
        if (!isNaN(n) && n > 0) ids.push(n);
      });
    }
    /* dedupe */
    var uniq = {};
    ids.forEach(function (id) { uniq[id] = true; });
    ids = Object.keys(uniq).map(Number);

    var seen = {};
    allIssues.forEach(function (i) { seen[i.id] = true; });
    var added = 0;
    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      if (loadedProjectIds[pid]) continue;
      try {
        var extra = await fetchIssuesForProject(pid);
        extra.forEach(function (iss) {
          if (!seen[iss.id]) {
            seen[iss.id] = true;
            allIssues.push(iss);
            added++;
          }
        });
        await fetchAndMergeVersionsForProject(pid);
        loadedProjectIds[pid] = true;
      } catch (e) {
        console.warn("[Gantt] ensure project", pid, e);
      }
    }
    if (added > 0) {
      console.log("[Gantt] ensureIssuesForSelectedProjects +", added, "issues; total", allIssues.length);
    }
    return added;
  }
  async function loadAll() {
    GLOG.step("loadAll start");
    var loading = document.getElementById("loading");
    show(loading);
    try {
      if (!getCookie(C_URL) || !getCookie(C_KEY)) throw new Error("Sessão incompleta (URL + API key)");
      /* Entrada leve: só metadados de projetos. Issues/versões sob demanda no filtro. */
      try {
        var projs = [];
        var poff = 0;
        for (;;) {
          var pd = await api("GET", "/projects.json?limit=100&offset=" + poff);
          projs = projs.concat(pd.projects || []);
          if ((pd.projects || []).length < 100) break;
          poff += 100;
        }
        allProjects = projs;
      } catch (e) {
        console.warn("[Gantt] projects", e);
        allProjects = [];
        throw new Error("Falha ao listar projetos. Verifique URL e API key.");
      }
      allIssues = [];
      versions = [];
      loadedProjectIds = {};
      var seen = {};

      try { statuses = (await api("GET", "/issue_statuses.json")).issue_statuses || []; } catch (e) {}
      projectMembers = [];
      /* memberships sob demanda quando houver projeto selecionado */
      window.__ganttAllIssues = allIssues;
      window.__ganttVersions = versions;
      /* synthetic dates for undated issues */
      allIssues.forEach(function (iss) {
        if (iss.start_date || iss.due_date) return;
        if (iss.fixed_version && iss.fixed_version.id != null) {
          for (var vi = 0; vi < versions.length; vi++) {
            if (String(versions[vi].id) === String(iss.fixed_version.id) && versions[vi].start_date) {
              iss.start_date = versions[vi].start_date;
              iss.due_date = iss.due_date || versions[vi].start_date;
              return;
            }
          }
        }
        var cd = (iss.created_on || "").slice(0, 10);
        if (cd && parseYMD(cd)) {
          var d = parseYMD(cd);
          var day = d.getDay();
          var diff = day === 0 ? -6 : 1 - day;
          d.setDate(d.getDate() + diff);
          var y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), da = String(d.getDate()).padStart(2,"0");
          iss.start_date = y + "-" + m + "-" + da;
          d.setDate(d.getDate() + 4);
          iss.due_date = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
        }
      });
      /* Sem seleção de projeto → não puxa issues (entrada leve) */
      if (sel.projects === null) {
        sel.projects = new Set([-1]);
      }
      renderProjTree();
      try { await ensureIssuesForSelectedProjects(); } catch (eEns) {}
      fillChips();
      applyFilters();
      if (filtered.length === 0 && allIssues.length > 0) {
        console.warn("[Gantt] 0 filtered of", allIssues.length, "— soft reset filters (mantém projetos)");
        sel.assignee = null; sel.mod = null; sel.status = null; sel.completeness = null; sel.sprint = null;
        fillChips();
        applyFilters();
      }
      if (!allIssues.length) {
        toast("Selecione projetos no filtro para carregar tasks", false);
      }
    } catch (e) {
      toast("Falha: " + e.message, true);
      console.error(e);
    } finally {
      hide(loading);
    }
  }

  /** Sem login próprio: usa cookies do dashboard; se faltar, volta para index.html */
  
  function applyTheme(theme) {
    var t = theme === "light" ? "light" : "dark";
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("hemopi_theme", t); } catch (e) {}
    var b = document.getElementById("btnTheme");
    if (b) {
      b.textContent = t === "light" ? "🌙" : "☀️";
      b.title = t === "light" ? "Modo escuro" : "Modo claro";
    }
  }
  function initTheme() {
    var t = "dark";
    try { t = localStorage.getItem("hemopi_theme") || "dark"; } catch (e) {}
    applyTheme(t);
    var b = document.getElementById("btnTheme");
    if (b) b.onclick = function () {
      var cur = "dark";
      try { cur = localStorage.getItem("hemopi_theme") || "dark"; } catch (e) {}
      applyTheme(cur === "light" ? "dark" : "light");
    };
  }

  function goLogin() {
    console.log("[Gantt] sem sessão → index.html");
    window.location.href = "index.html";
  }
  function goApp() {
    GLOG.step("goApp");
    console.log("[Gantt] goApp");
    var gv = document.getElementById("ganttView");
    if (gv) show(gv);
    loadAll();
  }

  var btnCookie = document.getElementById("btnAcceptCookies");
  if (btnCookie) {
    btnCookie.onclick = function () {
      setCookie(COOKIE_OK, "1", 365);
      hide(document.getElementById("cookieBanner"));
      if (getCookie(C_KEY) && getCookie(C_URL)) goApp();
      else window.location.href = "index.html";
      else goLogin();
    };
  }
  var btnLogout = document.getElementById("btnLogout");
  if (btnLogout) btnLogout.onclick = function () { clearAuth(); goLogin(); };
  var btnRefresh = document.getElementById("btnRefresh");
  if (btnRefresh) btnRefresh.onclick = function () { loadAll(); };

  /* Phase 3.1 UI-only: expand/collapse filter boxes (CSS classes only — no applyFilters) */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".box-toggle");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var box = btn.closest(".filter-box");
    if (!box) return;
    var rowTop = box.offsetTop;
    var expand = box.classList.contains("minimized");
    document.querySelectorAll(".filter-box").forEach(function (b) {
      if (b.offsetTop !== rowTop) return;
      if (expand) {
        b.classList.remove("minimized");
        b.classList.add("expanded");
      } else {
        b.classList.add("minimized");
        b.classList.remove("expanded");
      }
    });
  }, true);

  var btnClear = document.getElementById("btnClear");
  if (btnClear) {
    btnClear.onclick = function () {
      sel = { scope: ["all"], sprint: null, mod: null, status: null, projects: null, assignee: null, completeness: null };
      renderProjTree();
      fillChips(); applyFilters();
    };
  }

  /* Modo cards minimizados — visão linha temporal (# + span-bar) */
  (function bindMinCards() {
    var btn = document.getElementById("btnMinCards");
    if (!btn) return;
    var on = false;
    try { on = localStorage.getItem("hemopi_cards_min") === "1"; } catch (e) {}
    function apply() {
      document.body.classList.toggle("cards-minimized", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "▣ Expandir cards" : "▬ Minimizar cards";
    }
    apply();
    btn.onclick = function () {
      on = !on;
      try { localStorage.setItem("hemopi_cards_min", on ? "1" : "0"); } catch (e) {}
      apply();
    };
  })();

  var btnToday = document.getElementById("btnToday");
  if (btnToday) {
    btnToday.onclick = function () {
      var right = document.getElementById("ganttRight");
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var idx = BACKLOG_DAYS + dayIndex(today);
      right.scrollLeft = Math.max(0, idx * DAY_W - 200);
    };
  }

  if (!getCookie(COOKIE_OK) || !getCookie(C_KEY) || !getCookie(C_URL)) {
    goLogin();
  } else {
    hide(document.getElementById("cookieBanner"));
    goApp();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var c = document.getElementById("cmCancel");
    var s = document.getElementById("cmSave");
    var m = document.getElementById("commentModal");
    if (c) c.onclick = closeCommentModal;
    if (s) s.onclick = function () { submitComment(); };
    if (m) m.addEventListener("click", function (e) { if (e.target === m) closeCommentModal(); });
  });

})();
