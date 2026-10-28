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
  const DAY_W = 36, BACKLOG_DAYS = 3;
  const DEFAULT_MENU_HIDE = ["Desenvolvimento: Em Deploy", "Fechada"];

  let allIssues = [], versions = [], statuses = [], projectMembers = [];
  let allProjects = []; /* árvore plana do Redmine */
  let rangeStart = null, dayCount = 0, filtered = [];
  let sel = { scope: ["all"], sprint: null, mod: null, status: null, projects: null, assignee: null };
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
  let menuVisible = null;
  let hideWeekends = true;
  try {
    var hw = localStorage.getItem("hemopi_hide_weekends");
    if (hw === "0") hideWeekends = false;
    else if (hw === "1") hideWeekends = true;
  } catch (e) {}


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
  function nextSprintName() {
    var max = 0;
    versions.forEach(function (v) {
      var m = String(v.name || "").match(/sprint\s*(\d+)/i);
      if (m) max = Math.max(max, +m[1]);
    });
    return "Sprint " + (max + 1);
  }
  /** Última sprint "real" (com data) para herdar padrão Mon–Sex + descrição Wxx + sharing tree */
  function lastSprintTemplate() {
    var list = versions.slice().filter(function (v) {
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
  /** Deduz próxima semana útil (seg–sex) a partir da due_date da última sprint */
  function inferNextSprintMeta() {
    var last = lastSprintTemplate();
    var name = nextSprintName();
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
    /* se a última descrição tinha padrão, mantém o estilo */
    if (last && last.description && /\d{2}\/\d{2}/.test(last.description)) {
      desc = fmtBR(start) + "–" + fmtBR(end) + " | W" + isoWeekNum(start);
    }
    return {
      name: name,
      description: desc,
      due_date: fmtYMD(end),
      sharing: sharing,
      status: "open"
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

  async function submitNewTask() {
    var modal = document.getElementById("newTaskModal");
    var subject = (document.getElementById("ntSubject").value || "").trim();
    var description = document.getElementById("ntDescription").value || "";
    var projectId = document.getElementById("ntProject").value;
    var assigneeId = document.getElementById("ntAssignee").value;
    var versionId = modal.dataset.versionId;
    var backlog = modal.dataset.backlog === "1";
    if (!subject) { toast("Informe o título da task", true); return; }
    if (!projectId) { toast("Selecione o projeto/filho", true); return; }
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

  function openNewSprintDialog() {
    var meta = inferNextSprintMeta();
    var name = window.prompt(
      "Nova sprint (nome):\nSerá criada com datas " + meta.description + "\ne compartilhamento: " + meta.sharing,
      meta.name
    );
    if (name == null) return;
    name = String(name).trim();
    if (!name) { toast("Informe um nome", true); return; }
    meta.name = name;
    createSprint(meta);
  }
  async function createSprint(meta) {
    var projectId = getCookie(C_PROJ);
    if (!projectId) { toast("Projeto não configurado", true); return; }
    if (typeof meta === "string") meta = { name: meta, status: "open", sharing: "tree" };
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
      versions = (await api("GET", "/projects/" + projectId + "/versions.json")).versions || [];
      toast("Sprint criada: " + meta.name + (meta.description ? " · " + meta.description : ""));
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

  /** Versão cujo período cobre a data (para issues sem fixed_version) */
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
  function sprintName(i) {
    if (i.fixed_version && i.fixed_version.name) return i.fixed_version.name;
    var d = issueRefDate(i);
    var v = versionCoveringDate(d);
    if (v && v.name) return v.name;
    return "Backlog";
  }

  function isBacklogIssue(i) {
    var st = ((i.status && i.status.name) || "").toLowerCase().replace(/^desenvolvimento:\s*/, "");
    /* Status Nova (puro) → Backlog */
    if (st === "nova") return true;
    /* Sem datas E sem versão → Backlog */
    if (!i.start_date && !i.due_date && !(i.fixed_version && i.fixed_version.id)) return true;
    /* Sprint efetiva Backlog */
    if (sprintName(i) === "Backlog" && !i.start_date && !i.due_date) return true;
    return false;
  }

  /** Issue pertence à sprint (versionId) por versão explícita OU data na semana da sprint */
  function issueInSprint(i, versionId, versionName) {
    if (i.fixed_version && String(i.fixed_version.id) === String(versionId)) return true;
    if (i.fixed_version && versionName && i.fixed_version.name === versionName) return true;
    var ver = null;
    for (var k = 0; k < versions.length; k++) {
      if (String(versions[k].id) === String(versionId)) { ver = versions[k]; break; }
    }
    if (!ver) return false;
    var p = versionPeriod(ver);
    if (!p) return false;
    var d = issueRefDate(i);
    if (!d) return false;
    return d >= p.start && d <= p.due;
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
    var due = parseYMD(v.due_date);
    if (!due) return null;
    var start;
    if (v.start_date) {
      start = parseYMD(v.start_date);
    } else {
      /* sem start: do dia seguinte à sprint anterior até o due (dinâmico) */
      start = null;
      var sorted = versions.slice().filter(function (x) { return x.due_date; }).sort(function (a, b) {
        return a.due_date < b.due_date ? -1 : 1;
      });
      for (var i = 0; i < sorted.length; i++) {
        if (String(sorted[i].id) === String(v.id) && i > 0) {
          var prevDue = parseYMD(sorted[i - 1].due_date);
          if (prevDue) start = addDays(prevDue, 1);
          break;
        }
      }
      if (!start) start = addDays(due, -4);
    }
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
    if (!el) return;
    el.innerHTML = items.map(function (it) {
      const val = typeof it === "string" ? it : it.v;
      const lab = typeof it === "string" ? it : it.l;
      const on = selectedSet !== null && selectedSet.has(val); /* vazio por default */
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
          /* null / vazio = nenhum selecionado (mostra tudo no Gantt) */
          var set = (sel[k] === null || !sel[k] || !sel[k].length) ? new Set() : new Set(sel[k].map(String));
          var vs = String(v);
          if (set.has(vs)) set.delete(vs); else set.add(vs);
          if (set.size === 0) sel[k] = null; /* nenhum chip = sem restrição */
          else sel[k] = Array.from(set);
          if (k === "assignee" || k === "mod") {
            saveSharedFilters(k === "assignee" ? { assignee: sel.assignee } : { mod: sel.mod });
          }
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

    var sprints = ["Backlog"].concat(versions.map(function (v) { return v.name; }));
    allIssues.forEach(function (i) {
      var n = sprintName(i);
      if (sprints.indexOf(n) < 0) sprints.push(n);
    });
    renderChips("chipsSprint", sprints, sel.sprint === null ? null : new Set(sel.sprint), "sprint");

    renderModDropdown();

    var sts = Array.from(new Set(allIssues.map(function (i) { return i.status.name; }))).sort();
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

    fillMenuChecks();
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
      if (sel.sprint !== null && sel.sprint.length && sel.sprint.indexOf(sprintName(i)) < 0) return false;
      /* módulo dinâmico: id de projeto filho (ou ancestral na path) */
      if (sel.mod !== null && sel.mod.length) {
        var path = projectPath(i);
        var hit = path.some(function (p) {
          return sel.mod.indexOf(String(p.id)) >= 0 || sel.mod.indexOf(p.id) >= 0 || sel.mod.indexOf(p.name) >= 0;
        });
        if (!hit) return false;
      }
      if (sel.status !== null && sel.status.length) {
        var sn = (i.status && i.status.name) || "";
        var ok = sel.status.some(function (s) {
          var a = String(s), b = sn;
          var as = a.replace(/^Desenvolvimento:\s*/i, "");
          var bs = b.replace(/^Desenvolvimento:\s*/i, "");
          return a === b || as === bs || a === bs || as === b;
        });
        if (!ok) return false;
      }
      if (sel.assignee !== null && sel.assignee.length) {
        var aid = i.assigned_to && i.assigned_to.id;
        var wantNone = sel.assignee.indexOf("none") >= 0 || sel.assignee.indexOf(null) >= 0;
        var matchId = aid != null && (sel.assignee.indexOf(aid) >= 0 || sel.assignee.indexOf(String(aid)) >= 0);
        var matchNone = wantNone && aid == null;
        if (!matchId && !matchNone) return false;
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
    versions.forEach(function (v) {
      if (sel.sprint !== null && sel.sprint.length && sel.sprint.indexOf(v.name) < 0) return;
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
    /* Dinâmico: só sprints do filtro (ou todas se nenhum chip marcado) */
    var sorted = versions.slice().filter(function (v) { return v.due_date; }).sort(function (a, b) {
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    });
    if (sel.sprint !== null && sel.sprint.length) {
      sorted = sorted.filter(function (v) { return sel.sprint.indexOf(v.name) >= 0; });
    }

    function daysInPeriod(start, due) {
      /* lista de datas (Date) no período, respeitando FN */
      var out = [];
      if (!start || !due) return out;
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      var end = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      while (d <= end) {
        if (!(hideWeekends && isWeekend(d))) out.push(new Date(d.getTime()));
        d.setDate(d.getDate() + 1);
      }
      return out;
    }

    var bands = [];
    var cols = []; /* { date|null, backlog, weekend } */
    var cursor = 0;

    /* Backlog (se filtro permitir) */
    var includeBacklog = !sel.sprint || !sel.sprint.length || sel.sprint.indexOf("Backlog") >= 0;
    if (includeBacklog) {
      for (var bi = 0; bi < BACKLOG_DAYS; bi++) {
        cols.push({ date: null, backlog: true, weekend: false });
      }
      bands.push({
        name: "Backlog",
        from: 0,
        span: BACKLOG_DAYS,
        backlog: true,
        versionId: null,
        startDay: null,
        spacer: false
      });
      cursor = BACKLOG_DAYS;
    }

    /* Uma banda por sprint filtrada — span = dias reais (úteis se FN) */
    sorted.forEach(function (v) {
      var p = versionPeriod(v);
      if (!p) return;
      var days = daysInPeriod(p.start, p.due);
      if (!days.length) {
        /* fallback: pelo menos 1 coluna no due */
        days = [p.due];
        if (hideWeekends && isWeekend(p.due)) {
          var d = new Date(p.due.getTime());
          while (isWeekend(d)) d.setDate(d.getDate() - 1);
          days = [d];
        }
      }
      var from = cursor;
      days.forEach(function (d) {
        cols.push({ date: d, backlog: false, weekend: isWeekend(d) });
      });
      cursor += days.length;
      bands.push({
        name: v.name,
        from: from,
        span: days.length,
        backlog: false,
        versionId: v.id,
        startDay: null,
        spacer: false
      });
    });

    if (!cols.length) {
      cols.push({ date: null, backlog: true, weekend: false });
      bands.push({ name: "Backlog", from: 0, span: 1, backlog: true, versionId: null, startDay: null, spacer: false });
    }

    window.__ganttCols = cols;
    window.__ganttVisualDays = cols.length;
    window.__ganttBands = bands;
    window.__ganttColDates = cols.map(function (c) { return c.date; });
    return bands;
  }


  /** HTML interno do card (Gantt + Kanban) — fonte única */
  function buildCardInnerHTML(issue) {
    var who = (issue.assigned_to && issue.assigned_to.name) ? issue.assigned_to.name : "sem responsável";
    var whoShort = who.length > 22 ? who.slice(0, 20) + "…" : who;
    var subj = cleanSubject(issue.subject || "");
    var stLab = shortStatus((issue.status && issue.status.name) || "");
    var dStart = fmtDateBR(issue.start_date);
    var dEnd = fmtDateBR(issue.due_date);
    var lastC = lastCommentText(issue);
    return (
      '<div class="bar-header">' +
        '<span class="bar-task-id">#' + issue.id + '</span>' +
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
          '<button type="button" class="icon-btn person-btn" title="Responsável: ' + escapeHtml(who) + '">👤</button>' +
        '</span>' +
      '</div>'
    );
  }
  function buildGanttBarHTML(issue, leftPx, widthPx) {
    var who = (issue.assigned_to && issue.assigned_to.name) || "sem responsável";
    var subj = cleanSubject(issue.subject || "");
    var w = Math.max(widthPx, DAY_W * 2 - 2);
    return (
      '<div class="bar ' + statusClass(issue.status && issue.status.name) + '" data-id="' + issue.id +
      '" style="left:' + leftPx + 'px;width:' + w + 'px" title="' + escapeHtml(subj) + ' · ' + escapeHtml(who) + '">' +
        '<div class="handle left" data-edge="left"></div>' +
        buildCardInnerHTML(issue) +
        '<div class="handle right" data-edge="right"></div>' +
      '</div>'
    );
  }
  function buildKanbanCardHTML(issue) {
    return (
      '<div class="kanban-card bar ' + statusClass(issue.status && issue.status.name) +
      '" draggable="true" data-id="' + issue.id + '">' +
        buildCardInnerHTML(issue) +
      '</div>'
    );
  }

  var __renderingGantt = false;
  function renderGantt() {
    if (__renderingGantt) return;
    __renderingGantt = true;
    try {
    GLOG.step("renderGantt", { filtered: filtered.length });
    computeRange();
    var left = document.getElementById("leftBody");
    var head = document.getElementById("timeHead");
    var body = document.getElementById("timeBody");
    var baseUrl = getCookie(C_URL).replace(/\/$/, "");

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

    /* Sidebar árvore hierárquica recolhível (Portfólio → projetos → módulos → tasks) */
    function buildIssueTree(list) {
      var root = { id: "root", name: "Portfólio", children: {}, issues: [] };
      list.forEach(function (iss) {
        var path = projectPath(iss);
        if (!path.length) {
          root.issues.push(iss);
          return;
        }
        var node = root;
        path.forEach(function (p) {
          var id = String(p.id);
          if (!node.children[id]) {
            node.children[id] = { id: id, name: p.name || id, children: {}, issues: [] };
          }
          node = node.children[id];
        });
        node.issues.push(iss);
      });
      return root;
    }
    function childrenArr(node) {
      return Object.keys(node.children).map(function (k) { return node.children[k]; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    }
    function renderTreeNode(node, depth) {
      var kids = childrenArr(node);
      var html = "";
      kids.forEach(function (ch) {
        var neon = "neon-p" + neonIndex(ch.name, 6);
        var open = !collapsedProjects[String(ch.id)];
        html += '<details data-pid="' + ch.id + '"' + (open ? " open" : "") + ">";
        html += '<summary class="' + neon + '" title="' + escapeHtml(ch.name) + '">' + escapeHtml(ch.name) + "</summary>";
        html += '<div class="ux-task-list">';
        html += renderTreeNode(ch, depth + 1);
        if (open) {
          (ch.issues || []).forEach(function (iss) {
            var title = cleanSubject(iss.subject || "");
            html +=
              '<button type="button" class="ux-task-item" data-jump="' + iss.id + '" title="' + escapeHtml(title) + '">' +
              '<span class="task-id">#' + iss.id + "</span>" +
              '<span class="task-title">' + escapeHtml(title) + "</span></button>";
          });
        }
        html += "</div></details>";
      });
      if (depth === 0 && node.issues && node.issues.length) {
        html += '<div class="ux-task-list">';
        node.issues.forEach(function (iss) {
          var title = cleanSubject(iss.subject || "");
          html +=
            '<button type="button" class="ux-task-item" data-jump="' + iss.id + '" title="' + escapeHtml(title) + '">' +
            '<span class="task-id">#' + iss.id + "</span>" +
            '<span class="task-title">' + escapeHtml(title) + "</span></button>";
        });
        html += "</div>";
      }
      return html;
    }
    var tree = buildIssueTree(filtered);
    left.innerHTML =
      '<div class="ux-sidebar" id="leftRows">' +
        '<details open data-pid="portfolio">' +
          '<summary class="neon-p0" title="Portfólio de Projetos">Portfólio de Projetos</summary>' +
          '<div class="ux-task-list">' + renderTreeNode(tree, 0) + "</div>" +
        "</details>" +
      "</div>";

    left.querySelectorAll("details[data-pid]").forEach(function (det) {
      det.addEventListener("toggle", function () {
        if (__renderingGantt) return;
        var pid = det.getAttribute("data-pid");
        if (!pid || pid === "portfolio") return;
        if (det.open) delete collapsedProjects[pid];
        else collapsedProjects[pid] = true;
        try { localStorage.setItem("hemopi_collapsed_proj", JSON.stringify(collapsedProjects)); } catch (e) {}
        /* re-render assíncrono para não concorrer com o evento toggle */
        setTimeout(function () { renderGantt(); }, 0);
      });
    });
    left.querySelectorAll("[data-jump]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-jump");
        var el = document.querySelector('.bar[data-id="' + id + '"]');
        if (el) {
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          el.style.outline = "2px solid #0052cc";
          setTimeout(function () { el.style.outline = ""; }, 1500);
        }
        left.querySelectorAll(".ux-task-item").forEach(function (x) { x.classList.remove("active"); });
        btn.classList.add("active");
      };
    });

var bands = versionBands();
    var cols = window.__ganttCols || [];
    var visualDays = cols.length || window.__ganttVisualDays || 1;
    var totalW = visualDays * DAY_W;

    /* —— MONTH BAND —— */
    var monthHtml = '<div class="month-band" style="width:' + totalW + 'px">';
    /* checkbox FN na primeira fatia (backlog width or first month) */
    var blSpan = 0;
    for (var mi = 0; mi < cols.length; mi++) {
      if (cols[mi].backlog) blSpan++;
      else break;
    }
    if (blSpan < 1) blSpan = 1;
    monthHtml +=
      '<div class="month-group-header month-fn" style="width:' + (blSpan * DAY_W) + 'px" data-days="' + blSpan + '">' +
        '<label title="Ocultar finais de semana (só dias úteis)">' +
          '<input type="checkbox" id="chkHideWeekends"' + (hideWeekends ? " checked" : "") + '> FN' +
        "</label></div>";
    var mStart = blSpan;
    while (mStart < cols.length) {
      if (!cols[mStart].date) { mStart++; continue; }
      var y = cols[mStart].date.getFullYear();
      var m = cols[mStart].date.getMonth();
      var mEnd = mStart + 1;
      while (mEnd < cols.length && cols[mEnd].date &&
             cols[mEnd].date.getFullYear() === y && cols[mEnd].date.getMonth() === m) {
        mEnd++;
      }
      var mNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
      var label = mNames[m] + " / " + y;
      var spanM = mEnd - mStart;
      monthHtml +=
        '<div class="month-group-header" style="width:' + (spanM * DAY_W) + 'px" data-days="' + spanM + '">' +
        escapeHtml(label) + "</div>";
      mStart = mEnd;
    }
    monthHtml += "</div>";

    /* —— SPRINT BAND —— */
    var sprintHtml = '<div class="sprint-band" style="width:' + (totalW + 36) + 'px">';
    bands.forEach(function (b) {
      var w = b.span * DAY_W;
      if (b.spacer) {
        sprintHtml +=
          '<div class="sprint-cell weekend-spacer" style="width:' + w + 'px" data-days="' + b.span + '">' +
          '<div class="sprint-actions"><button type="button" class="sprint-task-add" data-vid="" data-vname="Backlog" data-backlog="1" title="Nova task">+</button></div></div>';
        return;
      }
      var eye = b.backlog || !b.versionId ? "" :
        '<button type="button" class="eye" data-vid="' + b.versionId + '" data-vname="' + escapeHtml(b.name) + '" title="Kanban">👁</button>';
      var plus =
        '<button type="button" class="sprint-task-add" data-vid="' + (b.versionId || "") +
        '" data-vname="' + escapeHtml(b.name || "Backlog") +
        '" data-backlog="' + (b.backlog ? "1" : "0") +
        '" title="Nova task nesta coluna">+</button>';
      var title = b.backlog ? "Backlog" : (b.name + (b.span ? " (" + b.span + "d)" : ""));
      sprintHtml +=
        '<div class="sprint-cell' + (b.backlog ? " backlog-band" : "") +
        '" style="width:' + w + 'px" data-days="' + b.span + '">' +
        '<span class="sprint-title">' + escapeHtml(title) + "</span>" +
        '<div class="sprint-actions">' + eye + plus + "</div></div>";
    });
    sprintHtml += '<button type="button" class="sprint-add" id="btnNewSprint" title="Nova sprint">＋</button></div>';

    /* —— DAY BAND —— */
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dayHtml = '<div class="day-band" style="width:' + totalW + 'px">';
    for (var di = 0; di < cols.length; di++) {
      var col = cols[di];
      if (!col.date) {
        dayHtml += '<div class="day-cell backlog-day" data-is-weekend="false">·</div>';
      } else {
        var cls = ["day-cell"];
        if (col.weekend) cls.push("weekend");
        if (fmtYMD(col.date) === fmtYMD(today)) cls.push("today");
        dayHtml +=
          '<div class="' + cls.join(" ") + '" data-is-weekend="' + (col.weekend ? "true" : "false") + '">' +
          col.date.getDate() + "</div>";
      }
    }
    dayHtml += "</div>";

    head.innerHTML = monthHtml + sprintHtml + dayHtml;
    bindTimelineHeadActions();

    /* FN checkbox */
    var chk = document.getElementById("chkHideWeekends");
    if (chk) {
      chk.onchange = function () {
        hideWeekends = !!chk.checked;
        try { localStorage.setItem("hemopi_hide_weekends", hideWeekends ? "1" : "0"); } catch (e) {}
        renderGantt();
      };
    }


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

var colDates = window.__ganttColDates || [];
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
        var first = -1;
        for (var ci = 0; ci < colDates.length; ci++) {
          if (!colDates[ci]) continue;
          if (first < 0) first = ci;
          if (fmtYMD(colDates[ci]) === fmtYMD(date)) return ci;
          if (colDates[ci] <= date) best = ci;
        }
        if (best >= 0) return best;
        /* data antes do range → primeira coluna com data */
        return first;
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
      /* fallback: nunca deixar card sem posição */
      if (i0 == null || i0 < 0) { i0 = 0; i1 = Math.max(1, (i1 > 0 ? i1 : 2)); }
      if (i1 == null || i1 < i0) i1 = i0 + 1;
      if (i0 != null && i0 >= 0) {
        var leftPx = i0 * DAY_W + 1;
        var widthPx = Math.max(DAY_W * 2 - 2, (i1 - i0 + 1) * DAY_W - 2);
        var label = "#" + issue.id + " · " + shortStatus(issue.status.name);
        var who = (issue.assigned_to && issue.assigned_to.name) ? issue.assigned_to.name : "sem responsável";
        var whoShort = who.length > 22 ? who.slice(0, 20) + "…" : who;
        var subj = cleanSubject(issue.subject || "");
        var stLab = shortStatus((issue.status && issue.status.name) || "");
        var dStart = fmtDateBR(issue.start_date);
        var dEnd = fmtDateBR(issue.due_date);
        var lastC = lastCommentText(issue);
        bar = buildGanttBarHTML(issue, leftPx, widthPx);
      }
      rows += '<div class="gantt-row-track" style="width:' + visualDays * DAY_W + 'px">' + extras + bar + "</div>";
    });
    body.innerHTML = rows;
    bindBarEvents();
    } finally { __renderingGantt = false; }
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
    ]).filter(function (s) { return !menuVisible || menuVisible.has(s.name); });

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

  async function openIssueDetail(issueId) {
    hide(document.getElementById("statusMenu"));
    hide(document.getElementById("assigneeMenu"));

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


  /** Delegação única: eye / + task / nova sprint (sobrevive a head.innerHTML) */
  function bindTimelineHeadActions() {
    var head = document.getElementById("timeHead");
    if (!head || head.dataset.boundActions === "1") return;
    head.dataset.boundActions = "1";
    head.addEventListener("click", function (e) {
      var eye = e.target.closest(".eye");
      if (eye) {
        e.preventDefault();
        e.stopPropagation();
        var vid = eye.getAttribute("data-vid");
        var vname = eye.getAttribute("data-vname") || "";
        if (vid) openKanban(+vid, vname);
        return;
      }
      var addTask = e.target.closest(".sprint-task-add");
      if (addTask) {
        e.preventDefault();
        e.stopPropagation();
        openNewTaskDialog({
          versionId: addTask.getAttribute("data-vid") ? +addTask.getAttribute("data-vid") : null,
          versionName: addTask.getAttribute("data-vname") || "Backlog",
          backlog: addTask.getAttribute("data-backlog") === "1"
        });
        return;
      }
      var addSprint = e.target.closest(".sprint-add, #btnNewSprint");
      if (addSprint) {
        e.preventDefault();
        e.stopPropagation();
        openNewSprintDialog();
        return;
      }
    });
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
      /* versão explícita OU data de criação/start dentro da semana da sprint */
      if (!issueInSprint(i, versionId, versionName)) return false;
      /* projetos (multi) — qualquer projeto marcado */
      if (sel.projects !== null) {
        var pid = i.project && i.project.id;
        if (pid == null || (!sel.projects.has(pid) && !sel.projects.has(String(pid)))) return false;
      }
      /* subprojetos/módulos dinâmicos (ids da árvore, não getMod M01) */
      if (sel.mod !== null && sel.mod.length) {
        var path = projectPath(i);
        var hit = path.some(function (p) {
          return sel.mod.indexOf(String(p.id)) >= 0 || sel.mod.indexOf(p.id) >= 0 || sel.mod.indexOf(p.name) >= 0;
        });
        if (!hit) return false;
      }
      /* desenvolvedor */
      if (sel.assignee !== null && sel.assignee.length) {
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
  document.getElementById("issueClose").onclick = function () { hide(document.getElementById("issueModal")); };
  document.getElementById("issueBackdrop").onclick = function () { hide(document.getElementById("issueModal")); };

  /* Filter group: select all / clear (ignora box-toggle) */
  document.querySelectorAll(".flt-act[data-act]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (btn.classList.contains("box-toggle")) return;
      var box = btn.closest(".filter-box");
      if (!box) return;
      var key = box.dataset.filter;
      var act = btn.dataset.act;
      if (!act) return;
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
      if (key === "mod") {
        /* checkboxes de projeto/módulo */
        box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
          cb.checked = act === "all";
        });
        /* projAll / projNone se existirem */
        var pa = document.getElementById(act === "all" ? "projAll" : "projNone");
        if (pa) pa.click();
        return;
      }
      /* sprint / status / assignee: all = seleciona todos os chips; none = vazio (sem restrição visual off) */
      if (act === "all") {
        var chips = box.querySelectorAll(".chip");
        var vals = [];
        chips.forEach(function (c) { if (c.dataset.v) vals.push(c.dataset.v); });
        sel[key] = vals.length ? vals : null;
      } else {
        sel[key] = null; /* limpo = chips off, sem filtro */
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

  /* btnToggleFilters: ver initFilterPanelUX */


  (function bindPan() {
    var right = document.getElementById("ganttRight");
    var panning = false, sx = 0, sy = 0, sl = 0, st = 0;
    right.addEventListener("mousedown", function (e) {
      /* não iniciar pan em botões/controles da timeline */
      if (e.target.closest("button, a, input, select, textarea, .bar, .eye, .sprint-task-add, .sprint-add, .handle, label")) return;
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
      fillChips();
      applyFilters();
      /* atualiza só o texto do trigger sem fechar o painel */
      var txt = el.querySelector(".ms-trigger-text");
      if (txt) {
        var label = sel.projects === null ? "Todos os projetos" :
          (n === 0 ? "Nenhum projeto" : n === 1 ? "1 projeto" : n + " projetos");
        txt.textContent = label;
      }
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
  async function loadAll() {
    GLOG.step("loadAll start");
    var loading = document.getElementById("loading");
    show(loading);
    try {
      var projectId = getCookie(C_PROJ);
      if (!projectId) throw new Error("Projeto não informado");
      /* árvore de projetos (para filtro multi + MV / módulos) */
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
      }
      /* issues: raiz + subprojetos */
      var issues = await fetchIssuesForProject(projectId);
      var seen = {};
      allIssues = issues.filter(function (i) {
        if (seen[i.id]) return false;
        seen[i.id] = true;
        return true;
      });
      /* Portfólio correlato: Legado, MV, MV-Api (ex. #6500), SUGAD — não só irmãos diretos */
      try {
        var RELATED = /(hemopi|legado|inf|\bmv\b|mv-api|mv api|sesapi|sugad|workflow|m0[1-9]|administra|atendimento|doaç|doac|cuidar)/i;
        var candidateIds = {};
        var rootMeta = allProjects.find(function (p) {
          return String(p.id) === String(projectId) || p.identifier === projectId;
        });
        var portfolioId = rootMeta && rootMeta.parent && rootMeta.parent.id;
        allProjects.forEach(function (p) {
          if (String(p.id) === String(projectId)) return;
          var nm = p.name || "";
          if (!RELATED.test(nm)) return;
          /* filho da raiz, irmão no portfólio, ou filho de projeto correlato (MV → MV-Api) */
          if (p.parent && String(p.parent.id) === String(projectId)) {
            candidateIds[p.id] = nm;
            return;
          }
          if (portfolioId && p.parent && String(p.parent.id) === String(portfolioId)) {
            candidateIds[p.id] = nm;
            return;
          }
          if (p.parent) {
            var par = allProjects.find(function (x) { return String(x.id) === String(p.parent.id); });
            var parName = (par && par.name) || (p.parent.name || "");
            if (RELATED.test(parName)) candidateIds[p.id] = nm;
          }
        });
        var ids = Object.keys(candidateIds);
        for (var si = 0; si < ids.length; si++) {
          try {
            var extra = await fetchIssuesForProject(ids[si]);
            extra.forEach(function (i) {
              if (!seen[i.id]) { seen[i.id] = true; allIssues.push(i); }
            });
          } catch (e2) {
            console.warn("[Gantt] expand", candidateIds[ids[si]], e2);
          }
        }
      } catch (e3) { console.warn("[Gantt] portfolio expand", e3); }
      versions = (await api("GET", "/projects/" + projectId + "/versions.json")).versions || [];
      /* safety: issues by each version (pega #6500 mesmo fora da árvore de login) */
      try {
        for (var vx = 0; vx < versions.length; vx++) {
          try {
            var voff = 0;
            for (;;) {
              var vd = await api("GET", "/issues.json?fixed_version_id=" + versions[vx].id + "&status_id=*&limit=100&offset=" + voff);
              (vd.issues || []).forEach(function (i) {
                if (!seen[i.id]) { seen[i.id] = true; allIssues.push(i); }
              });
              if (!(vd.issues || []).length || (vd.issues || []).length < 100) break;
              voff += 100;
            }
          } catch (ev) {}
        }
        console.log("[Gantt] after version fetch", allIssues.length);
      } catch (ev2) {}

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
      renderProjTree();
      fillChips();
      try { initFilterPanelUX(); } catch (e) {}
      applyFilters();
      if (filtered.length === 0 && allIssues.length > 0) {
        console.warn("[Gantt] 0 filtered of", allIssues.length, "— soft reset filters");
        sel.projects = null; sel.assignee = null; sel.mod = null; sel.status = null;
        try { localStorage.removeItem("hemopi_shared_filters"); } catch (e) {}
        fillChips();
        applyFilters();
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
  
  function initFilterPanelUX() {
    var btnToggle = document.getElementById("btnToggleFilters");
    var filterBody = document.getElementById("filterBody");
    var panel = document.getElementById("filterPanel");
    if (!btnToggle || !filterBody) return;

    /* Mobile: painel fechado por default */
    if (window.innerWidth < 1024) {
      btnToggle.setAttribute("aria-expanded", "false");
      btnToggle.classList.add("closed");
      filterBody.classList.add("hidden");
    }

    btnToggle.onclick = function () {
      var open = btnToggle.getAttribute("aria-expanded") === "true";
      btnToggle.setAttribute("aria-expanded", open ? "false" : "true");
      btnToggle.classList.toggle("closed", open);
      filterBody.classList.toggle("hidden", open);
      if (panel) panel.classList.toggle("collapsed", open);
    };

    /* Minimizar/expandir em sincronia na mesma linha (offsetTop) */
    document.querySelectorAll(".box-toggle").forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var currentBox = btn.closest(".filter-box");
        if (!currentBox) return;
        var isMin = currentBox.classList.contains("minimized");
        var rowTop = currentBox.offsetTop;
        document.querySelectorAll(".filter-box").forEach(function (box) {
          if (box.offsetTop !== rowTop) return;
          if (isMin) {
            box.classList.remove("minimized");
            box.classList.add("expanded");
          } else {
            box.classList.add("minimized");
            box.classList.remove("expanded");
          }
        });
      };
    });

    /* data-act all/none por caixa — delegação */
    document.querySelectorAll(".filter-box").forEach(function (box) {
      var btnAll = box.querySelector('[data-act="all"]');
      var btnNone = box.querySelector('[data-act="none"]');
      var key = box.getAttribute("data-filter");
      if (btnAll) {
        btnAll.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (key === "menuStatus") {
            box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
              cb.checked = true;
              if (cb.dataset.sname && menuVisible) menuVisible.add(cb.dataset.sname);
            });
            return;
          }
          if (key === "mod") {
            box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
            /* dispara lógica existente se houver */
            var ev = box.querySelector('[data-act="all"]');
            return;
          }
          /* chips: seleciona todos os valores e aplica */
          var chips = box.querySelectorAll(".chip");
          var vals = [];
          chips.forEach(function (c) { if (c.dataset.v) vals.push(c.dataset.v); });
          if (key === "sprint") sel.sprint = vals.length ? vals : null;
          else if (key === "status") sel.status = vals.length ? vals : null;
          else if (key === "assignee") sel.assignee = vals.length ? vals : null;
          fillChips();
          applyFilters();
        };
      }
      if (btnNone) {
        btnNone.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (key === "menuStatus") {
            box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
              cb.checked = false;
              if (cb.dataset.sname && menuVisible) menuVisible.delete(cb.dataset.sname);
            });
            return;
          }
          if (key === "sprint") sel.sprint = null;
          else if (key === "status") sel.status = null;
          else if (key === "assignee") sel.assignee = null;
          else if (key === "mod") {
            box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
          }
          fillChips();
          applyFilters();
        };
      }
    });

    var btnClear = document.getElementById("btnClear");
    if (btnClear) {
      btnClear.onclick = function () {
        sel.sprint = null;
        sel.status = null;
        sel.assignee = null;
        sel.mod = null;
        sel.scope = ["all"];
        try { clearSharedFilters(); } catch (err) {}
        document.querySelectorAll(".filter-box input[type='checkbox']").forEach(function (cb) {
          if (cb.closest('[data-filter="menuStatus"]')) return; /* menu status independente */
          cb.checked = false;
        });
        fillChips();
        applyFilters();
        toast("Filtros limpos");
      };
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
    bindTimelineHeadActions();
    loadAll();
  }

  var btnCookie = document.getElementById("btnAcceptCookies");
  if (btnCookie) {
    btnCookie.onclick = function () {
      setCookie(COOKIE_OK, "1", 365);
      hide(document.getElementById("cookieBanner"));
      if (getCookie(C_KEY) && getCookie(C_URL) && getCookie(C_PROJ)) goApp();
      else goLogin();
    };
  }
  var btnLogout = document.getElementById("btnLogout");
  if (btnLogout) btnLogout.onclick = function () { clearAuth(); goLogin(); };
  var btnRefresh = document.getElementById("btnRefresh");
  if (btnRefresh) btnRefresh.onclick = function () { loadAll(); };
  /* btnClear: tratado em initFilterPanelUX (única fonte) */
  var btnToday = document.getElementById("btnToday");
  if (btnToday) {
    btnToday.onclick = function () {
      var right = document.getElementById("ganttRight");
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var idx = BACKLOG_DAYS + dayIndex(today);
      right.scrollLeft = Math.max(0, idx * DAY_W - 200);
    };
  }

  if (!getCookie(COOKIE_OK) || !getCookie(C_KEY) || !getCookie(C_URL) || !getCookie(C_PROJ)) {
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
