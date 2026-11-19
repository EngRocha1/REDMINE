/* HEMOPI Redmine Dashboard — credenciais apenas em cookies */
(function () {
  const COOKIE_OK = "rd_cookie_ok";
  const C_EMAIL = "rd_email";
  const C_URL = "rd_url";
  const C_KEY = "rd_key";
  const C_PROJ = "rd_project";
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
    } catch (e) {
      return { projects: null, assignee: null, mod: null };
    }
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


  const GLOSSARY = [
    ["M01", "Módulo Administração — catálogos, IAM, hospitais, locais, impedimentos."],
    ["M02", "Módulo Gestão de Doadores e Relacionamento — cadastro, campanhas, impedimentos."],
    ["M03", "Módulo Atendimento e Doação — recepção, triagem, coleta, postos, VAE."],
    ["M04–M09", "Módulos posteriores: Laboratório, Processamento, Estoque, Distribuição, Transfusão, Hemovigilância."],
    ["INF", "Infraestrutura e DevOps — ambientes, backups, pipelines."],
    ["LEG / Legado", "Projeto Hemopi-Legado — sessões e rotinas do sistema anterior (Hemovida)."],
    ["[US]", "User Story — requisito de negócio do ponto de vista do usuário (padrão DUTEC)."],
    ["[TS]", "Technical Story / Task técnica — trabalho técnico de suporte à US."],
    ["[EP]", "Épico — agrupamento maior de histórias (quando usado no subject)."],
    ["Sprint", "Ciclo de trabalho de 1 semana (segunda a sexta, órgão público). No Redmine = Versão nativa."],
    ["Backlog", "Itens ainda não alocados a nenhuma sprint/versão."],
    ["Scrum", "Framework ágil: sprints, backlog, revisão e melhoria contínua."],
    ["Planejamento", "Status de desenvolvimento: item em planejamento de execução."],
    ["Em Validação", "Status: entregue ao squad/PO para validação funcional."],
    ["Resolvida", "Status de conclusão funcional (controle visual do squad)."],
    ["Nova", "Issue aberta, ainda não iniciada."],
  ];

  /* Períodos derivados dinamicamente das versões (sem hardcode de datas de sprint) */
  function periodLabelForVersion(v) {
    if (!v) return "—";
    if (v.description && String(v.description).trim()) return String(v.description).trim();
    if (v.due_date) {
      var due = v.due_date;
      var start = v.start_date || "";
      return start ? start + " → " + due : due;
    }
    return "—";
  }

  let charts = {};

    const valueLabelsPlugin = {
    id: "valueLabels",
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      var isStackedBar = chart.config.type === "bar" && chart.data.datasets.length > 1 &&
        chart.data.datasets.some(function (d) { return d.stack; });
      if (isStackedBar) {
        var n = (chart.data.labels || []).length;
        for (var idx = 0; idx < n; idx++) {
          var total = 0, topY = null, x = null;
          chart.data.datasets.forEach(function (dataset, di) {
            var meta = chart.getDatasetMeta(di);
            if (!meta || meta.hidden) return;
            var val = dataset.data[idx];
            if (val) total += val;
            var el = meta.data[idx];
            if (el) {
              x = el.x;
              var y = el.y;
              if (topY == null || y < topY) topY = y;
              if (val >= 1) {
                ctx.save();
                ctx.fillStyle = "#f8fafc";
                ctx.font = "600 10px system-ui,sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                var midY = (el.base + el.y) / 2;
                ctx.fillText(String(val), el.x, midY);
                ctx.restore();
              }
            }
          });
          if (total > 0 && topY != null && x != null) {
            ctx.save();
            ctx.fillStyle = "#e2e8f0";
            ctx.font = "700 11px system-ui,sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(String(total), x, topY - 3);
            ctx.restore();
          }
        }
        return;
      }
      chart.data.datasets.forEach(function (dataset, i) {
        if (dataset.type === "line") return;
        var meta = chart.getDatasetMeta(i);
        if (!meta || meta.hidden) return;
        meta.data.forEach(function (el, idx) {
          var val = dataset.data[idx];
          if (val == null || val === 0) return;
          var pos = el.tooltipPosition ? el.tooltipPosition() : { x: el.x, y: el.y };
          ctx.save();
          ctx.fillStyle = "#e2e8f0";
          ctx.font = "600 11px system-ui,sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = chart.config.type === "doughnut" ? "middle" : "bottom";
          ctx.fillText(String(val), pos.x, chart.config.type === "doughnut" ? pos.y : pos.y - 4);
          ctx.restore();
        });
      });
    }
  };

  const ALL_STATUSES = [
    "Nova",
    "Planejamento",
    "Em Andamento",
    "Em Validação",
    "Em Deploy",
    "Em Pagamento",
    "Resolvida",
    "Fechada",
    "Rejeitada"
  ];

  const STATUS_COLORS = {
    "Nova": "#3b82f6",
    "Planejamento": "#a78bfa",
    "Em Andamento": "#38bdf8",
    "Em Validação": "#4ade80",
    "Em Deploy": "#f59e0b",
    "Em Pagamento": "#f472b6",
    "Resolvida": "#94a3b8",
    "Fechada": "#64748b",
    "Rejeitada": "#f87171"
  };

  function setCookie(n, v, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days || 30) * 864e5);
    document.cookie = n + "=" + encodeURIComponent(v) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Strict";
  }
  function getCookie(n) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function delCookie(n) {
    document.cookie = n + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Strict";
  }
  function clearAuth() {
    [C_EMAIL, C_URL, C_KEY, C_PROJ].forEach(delCookie);
    clearSharedFilters();
    dashDevFilter = null;
    dashProjFilter = null;
  }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  async function redmineGet(path) {
    const base = getCookie(C_URL).replace(/\/$/, "");
    const key = getCookie(C_KEY);
    const useProxy = location.port === "8787" || window.REDMINE_USE_PROXY;
    let url, headers;
    if (useProxy) {
      url = "/api" + path;
      headers = {
        "X-Redmine-API-Key": key,
        "X-Redmine-Target": base,
        Accept: "application/json",
      };
    } else {
      url = base + path;
      headers = { "X-Redmine-API-Key": key, Accept: "application/json" };
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const t = await res.text();
      throw new Error("HTTP " + res.status + ": " + t.slice(0, 200));
    }
    return res.json();
  }

  async function fetchAllIssues(projectId) {
    const all = [];
    let offset = 0;
    for (;;) {
      const d = await redmineGet(
        "/issues.json?project_id=" +
          encodeURIComponent(projectId) +
          "&subproject_id=*&status_id=*&limit=100&offset=" +
          offset +
          "&sort=id:desc"
      );
      all.push(...(d.issues || []));
      if ((d.issues || []).length < 100) break;
      offset += 100;
    }
    return all;
  }

  async function fetchVersions(projectId) {
    const d = await redmineGet("/projects/" + projectId + "/versions.json");
    return d.versions || [];
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

  function statusKey(s) {
    s = (s || "").toLowerCase();
    if (s.indexOf("nova") >= 0) return "Nova";
    if (s.indexOf("planej") >= 0) return "Planejamento";
    if (s.indexOf("andamento") >= 0) return "Em Andamento";
    if (s.indexOf("valida") >= 0) return "Em Validação";
    if (s.indexOf("deploy") >= 0) return "Em Deploy";
    if (s.indexOf("pagamento") >= 0) return "Em Pagamento";
    if (s.indexOf("resolv") >= 0) return "Resolvida";
    if (s.indexOf("fechad") >= 0) return "Fechada";
    if (s.indexOf("rejeit") >= 0) return "Rejeitada";
    return s || "—";
  }

  function statusTag(status) {
    const sk = statusKey(status);
    const map = {
      Nova: ["tag-nova", "Nova"],
      Planejamento: ["tag-plan", "Planejamento"],
      "Em Andamento": ["tag-and", "Em Andamento"],
      "Em Validação": ["tag-valid", "Em Validação"],
      "Em Deploy": ["tag-deploy", "Em Deploy"],
      "Em Pagamento": ["tag-pag", "Em Pagamento"],
      Resolvida: ["tag-done", "Resolvida"],
      Fechada: ["tag-done", "Fechada"],
      Rejeitada: ["tag-rej", "Rejeitada"],
    };
    return map[sk] || ["tag-and", sk];
  }

  function isBacklogVersionName(name) {
    if (!name) return true;
    var n = String(name).trim().toLowerCase();
    return n === "backlog" || n === "back-log" || n === "sem sprint" || n === "sem versão";
  }

  /** Versões disponíveis no contexto do filtro de projetos do dashboard */
  function versionsForDashFilter(allVersions) {
    var list = allVersions || window.__lastDashVersions || [];
    if (!dashProjFilter || dashProjFilter.has(-1)) return list;
    return list.filter(function (v) {
      if (!v.project || v.project.id == null) return true;
      var pid = v.project.id;
      return dashProjFilter.has(pid) || dashProjFilter.has(String(pid));
    });
  }

  /**
   * Mesmo algoritmo do Gantt:
   * - sem fixed_version → Backlog
   * - nome "Backlog" → Backlog
   * - versão de outro projeto (fora do filtro) → Backlog do projeto da task
   */
  function isBacklogIssue(i, allVersions) {
    if (!(i.fixed_version && i.fixed_version.id != null)) return true;
    if (isBacklogVersionName(i.fixed_version.name)) return true;
    if (dashProjFilter && dashProjFilter.size && !dashProjFilter.has(-1)) {
      var allowed = versionsForDashFilter(allVersions);
      var hit = allowed.some(function (v) {
        return String(v.id) === String(i.fixed_version.id);
      });
      if (!hit) {
        /* versão não pertence aos projetos filtrados → Backlog visual */
        if (i.fixed_version.project && i.fixed_version.project.id != null) {
          var vpid = i.fixed_version.project.id;
          if (!dashProjFilter.has(vpid) && !dashProjFilter.has(String(vpid))) return true;
        } else {
          return true;
        }
      }
    }
    return false;
  }

  function sprintName(i, allVersions) {
    if (isBacklogIssue(i, allVersions)) return "Backlog";
    if (i.fixed_version && i.fixed_version.name) return i.fixed_version.name;
    return "Backlog";
  }

  function countBy(arr, fn) {
    const c = {};
    arr.forEach((x) => {
      const k = fn(x);
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderGlossary() {
    document.getElementById("glossary").innerHTML = GLOSSARY.map(
      ([k, v]) => "<div><dt>" + k + "</dt><dd>" + v + "</dd></div>"
    ).join("");
  }



  function neonIndex(str, mod) {
    var h = 0;
    var s = String(str || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % (mod || 6);
  }
  function buildProjectTree(flat) {
    var byId = {};
    (flat || []).forEach(function (p) {
      byId[p.id] = {
        id: p.id,
        name: p.name,
        identifier: p.identifier,
        parentId: p.parent && p.parent.id,
        children: []
      };
    });
    var roots = [];
    Object.keys(byId).forEach(function (id) {
      var n = byId[id];
      if (n.parentId && byId[n.parentId]) byId[n.parentId].children.push(n);
      else roots.push(n);
    });
    function sortRec(nodes) {
      nodes.sort(function (a, b) { return (a.name || "") < (b.name || "") ? -1 : 1; });
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

  function renderDashProjFilter() {
    var el = document.getElementById("dashProjMs");
    if (!el) return;
    var tree = buildProjectTree(allProjectsDash);
    var rootCookie = getCookie(C_PROJ);
    var rootNode = null;
    Object.keys(tree.byId).forEach(function (id) {
      var n = tree.byId[id];
      if (String(n.id) === String(rootCookie) || n.identifier === rootCookie) rootNode = n;
    });
    var nodes = rootNode ? [rootNode] : tree.roots;
    if (rootNode && rootNode.parentId && tree.byId[rootNode.parentId]) {
      nodes = tree.byId[rootNode.parentId].children.slice() || nodes;
    }
    if (!nodes.length) nodes = tree.roots;

    function isOn(id) {
      if (!dashProjFilter) return true;
      return dashProjFilter.has(id) || dashProjFilter.has(String(id));
    }
    function countAll(list) {
      var c = 0;
      function walk(arr) {
        (arr || []).forEach(function (n) { c++; walk(n.children); });
      }
      walk(list);
      return c;
    }
    function countOn(list) {
      var c = 0;
      function walk(arr) {
        (arr || []).forEach(function (n) {
          if (isOn(n.id)) c++;
          walk(n.children);
        });
      }
      walk(list);
      return c;
    }
    var total = countAll(nodes);
    var nOn = !dashProjFilter ? total : countOn(nodes);
    var summary = !total ? "Nenhum projeto" :
      (!dashProjFilter ? "Todos os projetos" :
        (nOn === 0 ? "Nenhum projeto" : nOn === 1 ? "1 projeto" : nOn + " projetos"));

    function walkOptions(list, depth) {
      return (list || []).map(function (n) {
        var pad = depth * 14;
        var checked = isOn(n.id);
        var row =
          '<label class="ms-option" style="padding-left:' + (10 + pad) + 'px">' +
            '<input type="checkbox" data-pid="' + n.id + '"' + (checked ? " checked" : "") + "/>" +
            '<span class="ms-dot neon-p' + neonIndex(n.name, 6) + '"></span>' +
            '<span class="ms-label" title="' + (n.name || "") + '">' + (n.name || n.identifier || n.id) + "</span></label>";
        return row + walkOptions(n.children || [], depth + 1);
      }).join("");
    }

    el.innerHTML =
      '<button type="button" class="ms-trigger" id="dashProjTrigger">' +
        '<span class="ms-trigger-ico">▣</span>' +
        '<span class="ms-trigger-text">' + summary + "</span>" +
        '<span class="ms-trigger-chev">▾</span></button>' +
      '<div class="ms-panel hidden" id="dashProjPanel">' +
        '<div class="ms-panel-head"><span>Projetos</span>' +
          '<span class="ms-panel-acts">' +
            '<button type="button" class="ms-mini" id="dashProjAll">Todos</button> ' +
            '<button type="button" class="ms-mini" id="dashProjNone">Limpar</button></span></div>' +
        '<div class="ms-panel-body">' + walkOptions(nodes, 0) + "</div></div>";

    var trigger = document.getElementById("dashProjTrigger");
    var panel = document.getElementById("dashProjPanel");
    if (trigger && panel) {
      trigger.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        panel.classList.toggle("hidden");
        var other = document.getElementById("dashDevPanel");
        if (other) other.classList.add("hidden");
      };
    }

    function allIdsUnder(node) {
      return collectDescendantIds(node, []);
    }

    function syncFromBoxes() {
      var boxes = el.querySelectorAll("input[data-pid]");
      var arr = [];
      boxes.forEach(function (b) {
        if (b.checked) arr.push(String(b.dataset.pid));
      });
      if (arr.length === 0) dashProjFilter = new Set([-1]);
      else if (arr.length === boxes.length) dashProjFilter = null;
      else dashProjFilter = new Set(arr.concat(arr.map(Number)));
      saveSharedFilters({
        projects: dashProjFilter === null ? null : (dashProjFilter.has(-1) ? [] : arr)
      });
      var txt = el.querySelector(".ms-trigger-text");
      if (txt) {
        var n = arr.length;
        txt.textContent = dashProjFilter === null ? "Todos os projetos" :
          (n === 0 ? "Nenhum projeto" : n === 1 ? "1 projeto" : n + " projetos");
      }
      ensureDashProjectsLoaded().then(function () {
        renderDashboard(window.__lastDashIssues || [], window.__lastDashVersions || []);
      }).catch(function () {
        renderDashboard(window.__lastDashIssues || [], window.__lastDashVersions || []);
      });
    }

    el.querySelectorAll("input[data-pid]").forEach(function (inp) {
      inp.onchange = function (e) {
        e.stopPropagation();
        var pid = +inp.dataset.pid;
        var node = tree.byId[pid];
        /* pai marca/desmarca todos os descendentes */
        if (node && node.children && node.children.length) {
          var ids = allIdsUnder(node);
          var on = inp.checked;
          el.querySelectorAll("input[data-pid]").forEach(function (b) {
            if (ids.indexOf(+b.dataset.pid) >= 0) b.checked = on;
          });
        }
        syncFromBoxes();
      };
      inp.onclick = function (e) { e.stopPropagation(); };
    });

    var a = document.getElementById("dashProjAll");
    var nbtn = document.getElementById("dashProjNone");
    if (a) a.onclick = function (e) {
      e.stopPropagation();
      el.querySelectorAll("input[data-pid]").forEach(function (b) { b.checked = true; });
      dashProjFilter = null;
      saveSharedFilters({ projects: null });
      syncFromBoxes();
    };
    if (nbtn) nbtn.onclick = function (e) {
      e.stopPropagation();
      el.querySelectorAll("input[data-pid]").forEach(function (b) { b.checked = false; });
      dashProjFilter = new Set([-1]);
      saveSharedFilters({ projects: [] });
      syncFromBoxes();
    };
  }

  function renderDashDevFilter(devList) {
    var el = document.getElementById("dashDevMs");
    if (!el) return;
    function isOn(id) {
      if (!dashDevFilter) return true;
      if (id === "none") return dashDevFilter.has("none") || dashDevFilter.has(null);
      return dashDevFilter.has(id) || dashDevFilter.has(String(id));
    }
    var nOn = 0;
    if (isOn("none")) nOn++;
    devList.forEach(function (d) { if (isOn(d.id)) nOn++; });
    var totalOpts = devList.length + 1;
    var summary = !dashDevFilter ? "Todos (" + totalOpts + ")" :
      (nOn === 0 ? "Nenhum" : nOn + " de " + totalOpts);
    var body = '<label class="ms-option">' +
      '<input type="checkbox" data-did="none"' + (isOn("none") ? " checked" : "") + "/>" +
      '<span class="ms-label">Sem responsável</span></label>' +
      devList.map(function (d) {
        return '<label class="ms-option">' +
          '<input type="checkbox" data-did="' + d.id + '"' + (isOn(d.id) ? " checked" : "") + "/>" +
          '<span class="ms-label">' + escapeHtml(d.name) + (d.done != null ? " (" + d.done + " entregues)" : "") + "</span></label>";
      }).join("");
    el.innerHTML =
      '<button type="button" class="ms-trigger" id="dashDevTrigger">' +
        '<span class="ms-trigger-text">' + summary + "</span>" +
        '<span class="ms-trigger-chev">▾</span></button>' +
      '<div class="ms-panel hidden" id="dashDevPanel">' +
        '<div class="ms-panel-head"><span>Devs com atividades</span>' +
          '<span class="ms-panel-acts">' +
            '<button type="button" class="ms-mini" id="dashDevAll">Todos</button> ' +
            '<button type="button" class="ms-mini" id="dashDevNone">Limpar</button></span></div>' +
        '<div class="ms-panel-body">' + body + "</div></div>";
    var trigger = document.getElementById("dashDevTrigger");
    var panel = document.getElementById("dashDevPanel");
    if (trigger && panel) {
      trigger.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        panel.classList.toggle("hidden");
        var other = document.getElementById("dashProjPanel");
        if (other) other.classList.add("hidden");
      };
    }
    if (!window.__dashMsClose) {
      window.__dashMsClose = true;
      document.addEventListener("click", function (ev) {
        ["dashDevMs", "dashProjMs"].forEach(function (id) {
          var t = document.getElementById(id);
          if (t && !t.contains(ev.target)) {
            var p = t.querySelector(".ms-panel");
            if (p) p.classList.add("hidden");
          }
        });
      });
    }
    function sync() {
      var boxes = el.querySelectorAll("input[data-did]");
      var arr = [];
      boxes.forEach(function (b) { if (b.checked) arr.push(String(b.dataset.did)); });
      if (arr.length === 0) dashDevFilter = new Set([-1]);
      else if (arr.length === boxes.length) dashDevFilter = null;
      else {
        dashDevFilter = new Set();
        arr.forEach(function (x) {
          dashDevFilter.add(x);
          if (x !== "none" && !isNaN(+x)) dashDevFilter.add(+x);
        });
      }
      saveSharedFilters({ assignee: dashDevFilter && dashDevFilter.has(-1) ? [] : (dashDevFilter ? arr : null) });
      if (window.__lastDashIssues && window.__lastDashVersions) {
        renderDashboard(window.__lastDashIssues, window.__lastDashVersions);
      }
    }
    el.querySelectorAll("input[data-did]").forEach(function (inp) {
      inp.onchange = function (e) { e.stopPropagation(); sync(); };
      inp.onclick = function (e) { e.stopPropagation(); };
    });
    var a = document.getElementById("dashDevAll");
    var nbtn = document.getElementById("dashDevNone");
    if (a) a.onclick = function (e) {
      e.stopPropagation();
      el.querySelectorAll("input[data-did]").forEach(function (b) { b.checked = true; });
      dashDevFilter = null;
      saveSharedFilters({ assignee: null });
      if (window.__lastDashIssues) renderDashboard(window.__lastDashIssues, window.__lastDashVersions);
    };
    if (nbtn) nbtn.onclick = function (e) {
      e.stopPropagation();
      el.querySelectorAll("input[data-did]").forEach(function (b) { b.checked = false; });
      dashDevFilter = new Set([-1]);
      saveSharedFilters({ assignee: [] });
      if (window.__lastDashIssues) renderDashboard(window.__lastDashIssues, window.__lastDashVersions);
    };
  }

  function daysBetween(a, b) {
    if (!a || !b) return null;
    var ms = b.getTime() - a.getTime();
    return Math.floor(ms / 864e5);
  }

  function parseIssueDate(s) {
    if (!s) return null;
    var d = new Date(String(s).slice(0, 10) + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  function isOpenIssue(i) {
    var sk = statusKey(i.status && i.status.name);
    return sk !== "Resolvida" && sk !== "Fechada" && sk !== "Rejeitada";
  }

  /**
   * Painel executivo de entregáveis:
   * aging, prazo, pipeline, saúde por projeto — sem depender de responsável.
   * Precedente de mercado: vendor delivery / MSP — on-time, aging, throughput, WIP.
   */
  function renderDeliveryAnalytics(issues, versions) {
    var today = new Date();
    today.setHours(12, 0, 0, 0);

    var open = issues.filter(isOpenIssue);
    var done = issues.filter(function (i) {
      var sk = statusKey(i.status && i.status.name);
      return sk === "Resolvida" || sk === "Fechada";
    });
    var rejected = issues.filter(function (i) {
      return statusKey(i.status && i.status.name) === "Rejeitada";
    });

    /* Aging buckets for open issues (from created_on or start_date) */
    var aging = { "0–7d": 0, "8–14d": 0, "15–30d": 0, "31–60d": 0, ">60d": 0, "s/ data": 0 };
    open.forEach(function (i) {
      var ref = parseIssueDate(i.start_date) || parseIssueDate(i.created_on);
      if (!ref) { aging["s/ data"]++; return; }
      var age = daysBetween(ref, today);
      if (age == null || age < 0) age = 0;
      if (age <= 7) aging["0–7d"]++;
      else if (age <= 14) aging["8–14d"]++;
      else if (age <= 30) aging["15–30d"]++;
      else if (age <= 60) aging["31–60d"]++;
      else aging[">60d"]++;
    });

    /* Deadline: on track / due soon / overdue / no due */
    var deadline = { "No prazo": 0, "Vence em 7d": 0, "Atrasada": 0, "Sem due date": 0 };
    open.forEach(function (i) {
      var due = parseIssueDate(i.due_date);
      if (!due) { deadline["Sem due date"]++; return; }
      var d = daysBetween(today, due);
      if (d == null) { deadline["Sem due date"]++; return; }
      if (d < 0) deadline["Atrasada"]++;
      else if (d <= 7) deadline["Vence em 7d"]++;
      else deadline["No prazo"]++;
    });

    var total = issues.length || 1;
    var pctDone = Math.round((done.length / total) * 100);
    var pctOpen = Math.round((open.length / total) * 100);
    var overdueN = deadline["Atrasada"] || 0;
    var noDueN = deadline["Sem due date"] || 0;
    var backlogN = issues.filter(function (i) { return isBacklogIssue(i, versions); }).length;

    var kpisEl = document.getElementById("deliveryKpis");
    if (kpisEl) {
      kpisEl.innerHTML = [
        ["Abertas", open.length, ""],
        ["Concluídas", done.length, "ok"],
        ["% Concluído", pctDone + "%", pctDone >= 50 ? "ok" : ""],
        ["Atrasadas", overdueN, overdueN ? "warn" : "ok"],
        ["Sem due date", noDueN, noDueN ? "warn" : ""],
        ["Backlog", backlogN, backlogN ? "warn" : ""],
        ["Rejeitadas", rejected.length, rejected.length ? "warn" : ""]
      ].map(function (row) {
        return '<div class="kpi ' + row[2] + '"><div class="label">' + row[0] + '</div><div class="value">' + row[1] + "</div></div>";
      }).join("");
    }

    var agingLabels = Object.keys(aging);
    var agingData = agingLabels.map(function (k) { return aging[k]; });
    if (document.getElementById("chartAging")) {
      charts.aging = new Chart(document.getElementById("chartAging"), {
        type: "bar",
        data: {
          labels: agingLabels,
          datasets: [{
            data: agingData,
            backgroundColor: ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#64748b"],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
            y: { ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true }
          }
        },
        plugins: [valueLabelsPlugin]
      });
    }

    var dlLabels = Object.keys(deadline);
    if (document.getElementById("chartDeadline")) {
      charts.deadline = new Chart(document.getElementById("chartDeadline"), {
        type: "doughnut",
        data: {
          labels: dlLabels,
          datasets: [{
            data: dlLabels.map(function (k) { return deadline[k]; }),
            backgroundColor: ["#22c55e", "#eab308", "#ef4444", "#64748b"],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } } }
        },
        plugins: [valueLabelsPlugin]
      });
    }

    /* Pipeline: all statuses present (WIP view) */
    var pipeLabels = [];
    var pipeData = [];
    ALL_STATUSES.forEach(function (st) {
      var n = issues.filter(function (i) { return statusKey(i.status && i.status.name) === st; }).length;
      if (n > 0) { pipeLabels.push(st); pipeData.push(n); }
    });
    Object.keys(countBy(issues, function (i) { return statusKey(i.status && i.status.name); })).forEach(function (st) {
      if (pipeLabels.indexOf(st) < 0) {
        var n = issues.filter(function (i) { return statusKey(i.status && i.status.name) === st; }).length;
        if (n > 0) { pipeLabels.push(st); pipeData.push(n); }
      }
    });
    if (document.getElementById("chartPipeline")) {
      charts.pipeline = new Chart(document.getElementById("chartPipeline"), {
        type: "bar",
        data: {
          labels: pipeLabels,
          datasets: [{
            data: pipeData,
            backgroundColor: pipeLabels.map(function (s) { return STATUS_COLORS[s] || "#475569"; }),
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true },
            y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { display: false } }
          }
        },
        plugins: [valueLabelsPlugin]
      });
    }

    /* Saúde por projeto: open / done / overdue stacked */
    var byProj = {};
    issues.forEach(function (i) {
      var pname = (i.project && i.project.name) || "Sem projeto";
      var pid = i.project && i.project.id != null ? i.project.id : pname;
      if (!byProj[pid]) byProj[pid] = { name: pname, open: 0, done: 0, overdue: 0, backlog: 0 };
      if (isBacklogIssue(i, versions)) byProj[pid].backlog++;
      if (!isOpenIssue(i)) {
        if (statusKey(i.status && i.status.name) === "Rejeitada") { /* skip from done */ }
        else byProj[pid].done++;
      } else {
        byProj[pid].open++;
        var due = parseIssueDate(i.due_date);
        if (due && daysBetween(today, due) < 0) byProj[pid].overdue++;
      }
    });
    var projList = Object.keys(byProj).map(function (k) { return byProj[k]; })
      .sort(function (a, b) { return (b.open + b.done) - (a.open + a.done); })
      .slice(0, 12);
    if (document.getElementById("chartProjHealth")) {
      charts.projHealth = new Chart(document.getElementById("chartProjHealth"), {
        type: "bar",
        data: {
          labels: projList.map(function (p) {
            var n = p.name || "";
            return n.length > 22 ? n.slice(0, 20) + "…" : n;
          }),
          datasets: [
            { label: "Abertas", data: projList.map(function (p) { return p.open; }), backgroundColor: "#3b82f6", stack: "h" },
            { label: "Concluídas", data: projList.map(function (p) { return p.done; }), backgroundColor: "#22c55e", stack: "h" },
            { label: "Atrasadas", data: projList.map(function (p) { return p.overdue; }), backgroundColor: "#ef4444", stack: "h" }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } }
          },
          scales: {
            x: { stacked: true, ticks: { color: "#94a3b8", maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
            y: { stacked: true, ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true }
          }
        },
        plugins: [valueLabelsPlugin]
      });
    }
  }

  function renderDashboard(issues, versions) {
    window.__lastDashIssues = issues;
    window.__lastDashVersions = versions;
    /* Filtro projetos: null = todos; Set([-1]) = nenhum; Set(ids) = só esses */
    if (dashProjFilter && dashProjFilter.has(-1)) {
      issues = [];
    } else if (dashProjFilter && dashProjFilter.size) {
      issues = issues.filter(function (i) {
        var pid = i.project && i.project.id;
        if (pid == null) return false;
        return dashProjFilter.has(pid) || dashProjFilter.has(String(pid));
      });
    }
    /* Filtro desenvolvedor: null = todos (com e sem responsável); "none" = sem responsável */
    if (dashDevFilter && dashDevFilter.has(-1)) {
      issues = [];
    } else if (dashDevFilter && dashDevFilter.size) {
      issues = issues.filter(function (i) {
        var aid = i.assigned_to && i.assigned_to.id;
        var wantNone = dashDevFilter.has("none") || dashDevFilter.has(null);
        var matchId = aid != null && (dashDevFilter.has(aid) || dashDevFilter.has(String(aid)));
        var matchNone = wantNone && aid == null;
        return matchId || matchNone;
      });
    }

    var byStatus = countBy(issues, function (i) { return statusKey(i.status.name); });
    var byMod = countBy(issues, getMod);
    var bySprint = countBy(issues, function (i) { return sprintName(i, versions); });
    var sprintStatus = {};
    issues.forEach(function (i) {
      var sp = sprintName(i, versions);
      var st = statusKey(i.status.name);
      if (!sprintStatus[sp]) sprintStatus[sp] = {};
      sprintStatus[sp][st] = (sprintStatus[sp][st] || 0) + 1;
    });

    var total = issues.length;
    var backlog = bySprint["Backlog"] || 0;
    var kpiItems = [["Total", total, "info"]];
    ALL_STATUSES.forEach(function (st) {
      var n = byStatus[st] || 0;
      if (n > 0) kpiItems.push([st, n, st === "Em Validação" || st === "Resolvida" ? "ok" : (st === "Rejeitada" ? "warn" : "")]);
    });
    Object.keys(byStatus).forEach(function (st) {
      if (ALL_STATUSES.indexOf(st) < 0 && st !== "—") {
        kpiItems.push([st, byStatus[st], ""]);
      }
    });
    kpiItems.push(["Backlog", backlog, "warn"]);
    document.getElementById("kpis").innerHTML = kpiItems
      .map(function (row) {
        var l = row[0], v = row[1], c = row[2];
        return '<div class="kpi ' + c + '"><div class="label">' + l + '</div><div class="value">' + v + "</div></div>";
      })
      .join("");
    var valid = byStatus["Em Validação"] || 0;
    var done = (byStatus["Resolvida"] || 0) + (byStatus["Fechada"] || 0);

    var verByName = {};
    (versions || []).forEach(function (v) { verByName[v.name] = v; });

    /* Ordem dinâmica: sprints presentes nos dados + versões dos projetos filtrados + Backlog no fim */
    var sprintOrder = [];
    var seenSp = {};
    Object.keys(bySprint).forEach(function (s) {
      if (s !== "Backlog" && !seenSp[s]) { seenSp[s] = true; sprintOrder.push(s); }
    });
    versionsForDashFilter(versions).forEach(function (v) {
      var nm = v.name || "";
      if (nm && !isBacklogVersionName(nm) && !seenSp[nm]) {
        seenSp[nm] = true;
        sprintOrder.push(nm);
      }
    });
    sprintOrder.sort(function (a, b) {
      var va = verByName[a], vb = verByName[b];
      var da = (va && va.due_date) || "9999";
      var db = (vb && vb.due_date) || "9999";
      if (da !== db) return da < db ? -1 : 1;
      return String(a).localeCompare(String(b));
    });
    sprintOrder.push("Backlog");

    document.getElementById("sprintCards").innerHTML = sprintOrder
      .map(function (s) {
        var n = bySprint[s] || 0;
        var st = sprintStatus[s] || {};
        if (s === "Backlog") {
          return '<div class="sc backlog"><h3>Backlog</h3><div class="period">sem versão / versão de outro projeto</div><div class="num" style="color:#fcd34d">' + n + '</div><div class="breakdown">Nova ' + (st["Nova"] || 0) + "</div></div>";
        }
        var ver = verByName[s];
        var vs = (ver && ver.status) || "open";
        var badge = vs === "closed" ? "fechada" : "aberta";
        var bc = vs === "closed" ? "#86efac" : "#93c5fd";
        var parts = [];
        ALL_STATUSES.forEach(function (k) {
          var vv = st[k] || 0;
          if (vv) parts.push(k.replace("Desenvolvimento: ", "").replace("Em ", "") + " " + vv);
        });
        return '<div class="sc"><h3>' + escapeHtml(s) + ' <span style="font-size:.65rem;color:' + bc + '">· ' + badge + '</span></h3><div class="period">' + escapeHtml(periodLabelForVersion(ver)) + '</div><div class="num">' + n + '</div><div class="breakdown">' + (parts.join(" · ") || "—") + "</div></div>";
      })
      .join("");

    var metaEl = document.getElementById("dashFilterMeta");
    if (metaEl) metaEl.textContent = total + " tasks · Backlog " + backlog;

    document.getElementById("banner").innerHTML =
      "<strong>Filtros alinhados ao Gantt</strong> · Backlog (mesmo algoritmo): <strong style='color:#fcd34d'>" +
      backlog + "</strong> · Em Validação: <strong style='color:#86efac'>" + valid +
      "</strong> · Resolvidas/Fechadas: <strong>" + done + "</strong> · Total filtrado: <strong>" + total + "</strong>.";

    var statusCols = ALL_STATUSES.slice();
    var mx = '<table class="matrix"><thead><tr><th>Sprint</th>' + statusCols.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "<th>Total</th></tr></thead><tbody>";
    sprintOrder.forEach(function (s) {
      var st = sprintStatus[s] || {};
      mx += "<tr><td>" + escapeHtml(s) + "</td>" + statusCols.map(function (c) { return "<td>" + (st[c] || 0) + "</td>"; }).join("") + "<td><strong>" + (bySprint[s] || 0) + "</strong></td></tr>";
    });
    mx += "</tbody></table>";
    document.getElementById("matrix").innerHTML = mx;

    var modsOrder = ["M01","M02","M03","M04","M05","M06","M07","M08","M09","INF","LEG","OUT"];
    var spPri = {};
    sprintOrder.forEach(function (s, i) { spPri[s] = i; });
    var modPri = {};
    modsOrder.forEach(function (m, i) { modPri[m] = i; });
    var sorted = issues.slice().sort(function (a, b) {
      var sa = spPri[sprintName(a, versions)];
      var sb = spPri[sprintName(b, versions)];
      if (sa == null) sa = 99;
      if (sb == null) sb = 99;
      if (sa !== sb) return sa - sb;
      var ma = modPri[getMod(a)]; if (ma == null) ma = 99;
      var mb = modPri[getMod(b)]; if (mb == null) mb = 99;
      return ma - mb || b.id - a.id;
    });

    var baseUrl = getCookie(C_URL).replace(/\/$/, "");
    document.querySelector("#tbl tbody").innerHTML = sorted
      .map(function (i) {
        var mod = getMod(i);
        var f = ["M01","M02","M03","INF","LEG"].indexOf(mod) >= 0 ? mod : (mod.indexOf("M") === 0 ? "EP" : mod);
        var tag = statusTag(i.status.name);
        var tc = tag[0], tl = tag[1];
        var sp = sprintName(i, versions);
        var spf = sp.replace(/ /g, "");
        var subj = (i.subject || "").replace(/\[[^\]]+\]\s*/g, "");
        return '<tr data-f="' + f + '" data-mod="' + mod + '" data-st="' + statusKey(i.status.name) + '" data-sp="' + spf + '"><td><a href="' + baseUrl + "/issues/" + i.id + '" target="_blank">#' + i.id + "</a></td><td>" + escapeHtml(sp) + "</td><td>" + escapeHtml(mod) + "</td><td>" + escapeHtml(subj) + '</td><td><span class="tag ' + tc + '">' + tl + "</span></td><td>" + escapeHtml((i.assigned_to && i.assigned_to.name) || "—") + "</td><td>" + (i.start_date || "—") + "</td><td>" + (i.due_date || "—") + "</td></tr>";
      })
      .join("");

    /* Chips de tabela dinâmicos a partir dos dados filtrados */
    var filters = [["all", "Todos"], ["sp:Backlog", "Backlog"]];
    sprintOrder.forEach(function (s) {
      if (s !== "Backlog") filters.push(["sp:" + s.replace(/ /g, ""), s]);
    });
    Object.keys(byStatus).forEach(function (st) {
      if (st && st !== "—") filters.push(["st:" + st, st]);
    });
    document.getElementById("filters").innerHTML = filters
      .map(function (pair, idx) {
        return '<button class="' + (idx === 0 ? "active" : "") + '" data-k="' + escapeHtml(pair[0]) + '">' + escapeHtml(pair[1]) + "</button>";
      })
      .join("");
    document.querySelectorAll("#filters button").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll("#filters button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const k = btn.dataset.k;
        document.querySelectorAll("#tbl tbody tr").forEach((tr) => {
          let show = true;
          if (k === "all") show = true;
          else if (k.startsWith("sp:")) show = tr.dataset.sp === k.slice(3);
          else if (k.startsWith("st:")) {
            const st = k.slice(3);
            show = tr.dataset.st === st || (st === "Resolvida" && (tr.dataset.st === "Resolvida" || tr.dataset.st === "Fechada"));
          } else show = tr.dataset.f === k || tr.dataset.mod === k;
          tr.style.display = show ? "" : "none";
        });
      };
    });

    Object.keys(charts || {}).forEach(function (k) { try { charts[k].destroy(); } catch (e) {} });
    charts = {};
    const col = { nova: "#3b82f6", valid: "#22c55e", plan: "#a78bfa", done: "#94a3b8" };

    /* —— Entregas e prazos (independente de assignee) —— */
    try {
      renderDeliveryAnalytics(issues, versions);
    } catch (eDel) {
      console.warn("[Dash] delivery analytics", eDel);
    }

    try {
      var stLabels = ALL_STATUSES.filter(function (s) { return (byStatus[s] || 0) > 0; });
      Object.keys(byStatus).forEach(function (s) {
        if (stLabels.indexOf(s) < 0 && (byStatus[s] || 0) > 0) stLabels.push(s);
      });
      charts.status = new Chart(document.getElementById("chartStatus"), {
        type: "doughnut",
        data: {
          labels: stLabels,
          datasets: [{
            data: stLabels.map(function (s) { return byStatus[s] || 0; }),
            backgroundColor: stLabels.map(function (s) { return STATUS_COLORS[s] || "#475569"; }),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } } }
        },
        plugins: [valueLabelsPlugin]
      });
    } catch (e) { console.error("[Dash] chartStatus", e); }

    try {
      const modLabels = modsOrder.filter((m) => byMod[m] > 0);
      charts.mod = new Chart(document.getElementById("chartMod"), {
        type: "bar",
        data: {
          labels: modLabels,
          datasets: [{ data: modLabels.map((m) => byMod[m]), backgroundColor: "#3b82f6", borderRadius: 6 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 16 } },
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
            y: { ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true }
          }
        },
        plugins: [valueLabelsPlugin]
      });
    } catch (e) { console.error("[Dash] chartMod", e); }

    try {
      var sprintLabels = sprintOrder.map(function (s) {
        if (s === "Backlog") return s;
        var per = periodLabelForVersion(verByName[s]);
        return per && per !== "—" ? [s, per] : s;
      });
      var sprintDatasets = ALL_STATUSES.map(function (st) {
        return {
          label: st,
          data: sprintOrder.map(function (s) { return (sprintStatus[s] || {})[st] || 0; }),
          backgroundColor: STATUS_COLORS[st] || "#475569",
          stack: "s"
        };
      }).filter(function (ds) {
        return ds.data.some(function (v) { return v > 0; });
      });
      charts.sprint = new Chart(document.getElementById("chartSprint"), {
        type: "bar",
        data: {
          labels: sprintLabels,
          datasets: sprintDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 18 } },
          plugins: {
            legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } },
            tooltip: {
              callbacks: {
                title: function (items) {
                  var i = items[0] && items[0].dataIndex;
                  var s = sprintOrder[i];
                  if (s === "Backlog") return s;
                  var per = periodLabelForVersion(verByName[s]);
                  return per && per !== "—" ? s + " (" + per + ")" : s;
                }
              }
            }
          },
          scales: {
            x: {
              stacked: true,
              ticks: { color: "#94a3b8", maxRotation: 0, minRotation: 0, font: { size: 11 } },
              grid: { display: false }
            },
            y: { stacked: true, ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true }
          }
        },
        plugins: [valueLabelsPlugin]
      });
    } catch (e) { console.error("[Dash] chartSprint", e); }

    /* ===== Produtividade por desenvolvedor ===== */
    function isDoneStatus(st) {
      var s = (st || "").toLowerCase();
      return s.indexOf("resolv") >= 0 || s.indexOf("fechad") >= 0;
    }
    var byDev = {};
    issues.forEach(function (i) {
      var a = i.assigned_to;
      if (!a || a.id == null) return;
      if (!byDev[a.id]) byDev[a.id] = { id: a.id, name: a.name, done: 0, open: 0, total: 0 };
      byDev[a.id].total++;
      if (isDoneStatus(i.status && i.status.name)) byDev[a.id].done++;
      else byDev[a.id].open++;
    });
    var devList = Object.keys(byDev).map(function (k) { return byDev[k]; })
      .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    window.__dashDevList = devList;
    if (typeof renderDashDevFilter === "function") renderDashDevFilter(devList);
    var shown = devList;
    if (dashDevFilter && dashDevFilter.size) {
      shown = devList.filter(function (d) {
        return dashDevFilter.has(d.id) || dashDevFilter.has(String(d.id));
      });
    }
    var teamAvgDone = devList.length
      ? devList.reduce(function (s, d) { return s + d.done; }, 0) / devList.length
      : 0;
    var teamAvgOpen = devList.length
      ? devList.reduce(function (s, d) { return s + d.open; }, 0) / devList.length
      : 0;
    var metaEl = document.getElementById("dashFilterMeta");
    if (metaEl) {
      metaEl.textContent =
        shown.length + " dev(s) · média entregas " + teamAvgDone.toFixed(1) +
        " · média abertas " + teamAvgOpen.toFixed(1);
    }
    var neonPalette = ["#3b82f6","#a855f7","#22c55e","#f59e0b","#06b6d4","#f43f5e","#6366f1","#14b8a6","#eab308","#ec4899"];
    function shortName(n) {
      var parts = String(n || "").trim().split(/\s+/);
      if (parts.length <= 1) return parts[0] || "";
      return parts[0] + " " + parts[parts.length - 1].charAt(0) + ".";
    }
    try {
      var prodCanvas = document.getElementById("chartProd");
      if (prodCanvas && shown.length) {
        charts.prod = new Chart(prodCanvas, {
          type: "bar",
          data: {
            labels: shown.map(function (d) { return shortName(d.name); }),
            datasets: [
              {
                label: "Entregas",
                data: shown.map(function (d) { return d.done; }),
                backgroundColor: shown.map(function (_, i) { return neonPalette[i % neonPalette.length]; }),
                borderRadius: 6,
                barPercentage: 0.7
              },
              {
                label: "Média equipe (" + teamAvgDone.toFixed(1) + ")",
                data: shown.map(function () { return Math.round(teamAvgDone * 10) / 10; }),
                type: "line",
                borderColor: "#f472b6",
                backgroundColor: "#f472b6",
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 3,
                pointBackgroundColor: "#f472b6",
                fill: false,
                tension: 0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 18 } },
            plugins: {
              legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } }
            },
            scales: {
              x: { ticks: { color: "#94a3b8", maxRotation: 40 }, grid: { display: false } },
              y: { beginAtZero: true, ticks: { color: "#94a3b8", precision: 0 }, grid: { color: "#2d3a4f" } }
            }
          },
          plugins: [valueLabelsPlugin]
        });
      }
      var loadCanvas = document.getElementById("chartLoad");
      if (loadCanvas && shown.length) {
        charts.load = new Chart(loadCanvas, {
          type: "bar",
          data: {
            labels: shown.map(function (d) { return shortName(d.name); }),
            datasets: [{
              label: "Abertas",
              data: shown.map(function (d) { return d.open; }),
              backgroundColor: shown.map(function (_, i) { return neonPalette[i % neonPalette.length]; }),
              borderRadius: 6,
              barPercentage: 0.7
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 18 } },
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: "#94a3b8", maxRotation: 40 }, grid: { display: false } },
              y: { beginAtZero: true, ticks: { color: "#94a3b8", precision: 0 }, grid: { color: "#2d3a4f" } }
            }
          },
          plugins: [valueLabelsPlugin]
        });
      }
    } catch (chartErr) {
      console.error("[Dashboard] charts produtividade", chartErr);
    }
    var prodTable = document.getElementById("prodTable");
    if (prodTable) {
      var rows = shown.map(function (d) {
        var delta = d.done - teamAvgDone;
        var sign = delta >= 0 ? "+" : "";
        return "<tr><td>" + d.name + "</td><td>" + d.done + "</td><td>" + d.open + "</td><td>" + d.total +
          "</td><td>" + sign + delta.toFixed(1) + "</td></tr>";
      }).join("");
      prodTable.innerHTML =
        "<table><thead><tr><th>Dev</th><th>Entregas</th><th>Abertas</th><th>Total</th><th>vs média</th></tr></thead>" +
        "<tbody>" + rows +
        '<tr class="avg-row"><td>Média equipe</td><td>' + teamAvgDone.toFixed(1) +
        "</td><td>" + teamAvgOpen.toFixed(1) + "</td><td>—</td><td>—</td></tr>" +
        "</tbody></table>";
    }

const now = new Date().toLocaleString("pt-BR");
    var nProj = 0;
    if (dashProjFilter && !dashProjFilter.has(-1)) {
      dashProjFilter.forEach(function (x) { if (+x > 0 && String(+x) === String(x)) nProj++; });
    }
    document.getElementById("hdrMeta").textContent = total + " issues · " + (nProj || "filtro") + " proj · " + now;
    document.getElementById("footLeft").textContent = "Redmine Lens · API REST · " + total + " issues filtradas";
    document.getElementById("footRight").textContent = "Atualizado " + now + " · cookies locais · sem chave no código";
  }

  let dashDevFilter = null;
  let dashProjFilter = null;
  let allProjectsDash = [];
  var loadedProjectIdsDash = {};
  (function initSharedFromLS() {
    try {
      var sf = loadSharedFilters();
      if (sf.assignee && sf.assignee.length) {
        dashDevFilter = new Set(sf.assignee.concat(sf.assignee.map(Number)));
      } else if (Array.isArray(sf.assignee) && sf.assignee.length === 0) {
        dashDevFilter = new Set([-1]);
      }
      if (sf.projects && sf.projects.length) {
        dashProjFilter = new Set(sf.projects.concat(sf.projects.map(Number)));
      } else if (Array.isArray(sf.projects) && sf.projects.length === 0) {
        dashProjFilter = new Set([-1]);
      }
    } catch (e) {}
  })();

  async function mergeVersionsDash(projectId, versionById) {
    try {
      var list = await fetchVersions(projectId);
      list.forEach(function (v) {
        if (!v.project) v.project = { id: +projectId };
        versionById[v.id] = v;
      });
    } catch (e) {
      console.warn("[Dash] versions", projectId, e);
    }
  }

  /** Carrega issues+versões dos projetos do filtro se ainda não estiverem em memória */
  async function ensureDashProjectsLoaded() {
    var ids = [];
    if (!dashProjFilter || dashProjFilter.has(-1)) {
      if (dashProjFilter && dashProjFilter.has(-1)) return 0;
      /* todos: não força carga de centenas; usa o que já veio do loadData */
      return 0;
    }
    dashProjFilter.forEach(function (x) {
      var n = +x;
      if (!isNaN(n) && n > 0) ids.push(n);
    });
    var issues = window.__lastDashIssues || [];
    var versions = window.__lastDashVersions || [];
    var seen = {};
    issues.forEach(function (i) { seen[i.id] = true; });
    var versionById = {};
    versions.forEach(function (v) { versionById[v.id] = v; });
    var added = 0;
    for (var i = 0; i < ids.length; i++) {
      var pid = ids[i];
      if (loadedProjectIdsDash[pid]) continue;
      try {
        var extra = await fetchAllIssues(pid);
        extra.forEach(function (iss) {
          if (!seen[iss.id]) { seen[iss.id] = true; issues.push(iss); added++; }
        });
        await mergeVersionsDash(pid, versionById);
        loadedProjectIdsDash[pid] = true;
      } catch (e) {
        console.warn("[Dash] ensure project", pid, e);
      }
    }
    window.__lastDashIssues = issues;
    window.__lastDashVersions = Object.keys(versionById).map(function (id) { return versionById[id]; });
    return added;
  }

  async function loadData() {
    const loading = document.getElementById("loading");
    show(loading);
    try {
      if (!getCookie(C_URL) || !getCookie(C_KEY)) {
        throw new Error("Sessão incompleta. Informe URL e API key.");
      }
      /* Entrada leve: só lista de projetos (metadados). Issues sob demanda no filtro. */
      try {
        var projs = [];
        var poff = 0;
        for (;;) {
          var pd = await redmineGet("/projects.json?limit=100&offset=" + poff);
          projs = projs.concat(pd.projects || []);
          if ((pd.projects || []).length < 100) break;
          poff += 100;
        }
        allProjectsDash = projs;
      } catch (ep) {
        console.warn("[Dash] projects", ep);
        allProjectsDash = [];
        throw new Error("Não foi possível listar projetos. Verifique URL e API key.\n" + (ep.message || ep));
      }
      loadedProjectIdsDash = {};
      window.__lastDashIssues = [];
      window.__lastDashVersions = [];

      /* Restaura filtro de projetos só se o usuário já tinha seleção válida */
      var sf = loadSharedFilters();
      if (sf.projects && sf.projects.length) {
        dashProjFilter = new Set(sf.projects.concat(sf.projects.map(Number)));
      } else {
        /* Nenhum projeto selecionado na entrada — evita carga massiva */
        dashProjFilter = new Set([-1]);
      }

      renderDashProjFilter();

      if (dashProjFilter && !dashProjFilter.has(-1) && dashProjFilter.size) {
        try { await ensureDashProjectsLoaded(); } catch (eEns) {}
      }

      renderDashboard(window.__lastDashIssues || [], window.__lastDashVersions || []);
      try {
        var devMap = {};
        (window.__lastDashIssues || []).forEach(function (i) {
          if (i.assigned_to && i.assigned_to.id != null) {
            devMap[i.assigned_to.id] = i.assigned_to.name;
          }
        });
        var devList = Object.keys(devMap).map(function (id) {
          return { id: +id, name: devMap[id] };
        }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
        renderDashDevFilter(devList);
      } catch (eDev) {}

      var meta = document.getElementById("hdrMeta");
      if (meta) {
        meta.textContent = (allProjectsDash.length || 0) + " projetos visíveis · selecione no filtro para carregar issues";
      }
      var banner = document.getElementById("banner");
      if (banner && (!window.__lastDashIssues || !window.__lastDashIssues.length)) {
        banner.innerHTML = "<strong>Sessão conectada</strong> · escolha um ou mais <strong>Projetos</strong> no filtro para carregar entregas (entrada leve, sem puxar tudo de uma vez).";
      }
    } catch (e) {
      alert("Falha ao carregar Redmine.\n" + e.message + "\n\nSe for CORS, rode: npm install && npm run proxy → http://localhost:8787");
      console.error(e);
    } finally {
      hide(loading);
      var btn = document.getElementById("btnLogin");
      if (btn) btn.classList.remove("is-loading");
    }
  }

  function goLogin() {
    hide(document.getElementById("dashView"));
    show(document.getElementById("loginView"));
  }
  function goDash() {
    hide(document.getElementById("loginView"));
    show(document.getElementById("dashView"));
    renderGlossary();
    loadData();
  }

  document.getElementById("btnAcceptCookies").onclick = () => {
    setCookie(COOKIE_OK, "1", 365);
    hide(document.getElementById("cookieBanner"));
    if (getCookie(C_KEY) && getCookie(C_URL)) goDash();
    else goLogin();
  };

  function doLogin(ev) {
    if (ev) ev.preventDefault();
    var urlEl = document.getElementById("inUrl");
    var keyEl = document.getElementById("inKey");
    var url = (urlEl && urlEl.value || "").trim().replace(/\/$/, "");
    var key = (keyEl && keyEl.value || "").trim();
    var err = document.getElementById("loginError");
    var btn = document.getElementById("btnLogin");
    if (err) err.textContent = "";
    if (!url) { if (err) err.textContent = "Informe a URL do Redmine."; return; }
    if (!/^https?:\/\//i.test(url)) { if (err) err.textContent = "URL deve começar com http:// ou https://"; return; }
    if (!key) { if (err) err.textContent = "Informe a API key."; return; }
    if (btn) btn.classList.add("is-loading");
    setCookie(C_URL, url, 30);
    setCookie(C_KEY, key, 30);
    /* Sem e-mail e sem projeto na entrada — sessão leve */
    try { delCookie(C_PROJ); } catch (e) {}
    try { delCookie(C_EMAIL); } catch (e) {}
    /* limpa filtros sticky de projeto para não forçar carga pesada */
    try {
      var sf = loadSharedFilters();
      sf.projects = [];
      localStorage.setItem(LS_FILTERS, JSON.stringify(sf));
    } catch (e2) {}
    dashProjFilter = new Set([-1]);
    goDash();
  }

  var loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", doLogin);
  var btnLogin = document.getElementById("btnLogin");
  if (btnLogin && !loginForm) btnLogin.onclick = doLogin;

  var btnToggleKey = document.getElementById("btnToggleKey");
  if (btnToggleKey) {
    btnToggleKey.onclick = function () {
      var keyEl = document.getElementById("inKey");
      if (!keyEl) return;
      keyEl.type = keyEl.type === "password" ? "text" : "password";
    };
  }

  document.getElementById("btnLogout").onclick = () => { clearAuth(); goLogin(); };
  document.getElementById("btnRefresh").onclick = () => loadData();

  if (!getCookie(COOKIE_OK)) {
    show(document.getElementById("cookieBanner"));
    hide(document.getElementById("loginView"));
    hide(document.getElementById("dashView"));
  } else if (getCookie(C_KEY) && getCookie(C_URL)) {
    goDash();
  } else {
    goLogin();
  }

  var btnGloss = document.getElementById("btnGlossary");
  if (btnGloss) {
    btnGloss.onclick = function () {
      var sec = document.getElementById("glossarySection");
      if (!sec) return;
      var collapsed = sec.classList.toggle("collapsed");
      btnGloss.setAttribute("aria-expanded", collapsed ? "false" : "true");
      var body = document.getElementById("glossary");
      if (body) {
        if (collapsed) body.setAttribute("hidden", "");
        else body.removeAttribute("hidden");
      }
    };
  }

})();
