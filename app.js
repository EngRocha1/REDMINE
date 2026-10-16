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

  const PERIODS = {
    "Sprint 1": "14–18/09",
    "Sprint 2": "21–25/09",
    "Sprint 3": "28/09–02/10",
    "Sprint 4": "05–09/10",
    "Sprint 5": "12–16/10",
    "Sprint 6": "19–23/10",
    "Sprint 7": "26–30/10",
    Backlog: "—",
  };

  let charts = {};

  const valueLabelsPlugin = {
    id: "valueLabels",
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      chart.data.datasets.forEach(function (dataset, i) {
        if (dataset.type === "line") return;
        var meta = chart.getDatasetMeta(i);
        if (!meta || meta.hidden) return;
        meta.data.forEach(function (el, idx) {
          var val = dataset.data[idx];
          if (val == null) return;
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
          "&status_id=*&limit=100&offset=" +
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
    if (s.indexOf("valida") >= 0) return "Em Validação";
    if (s.indexOf("planej") >= 0) return "Planejamento";
    if (s.indexOf("fechad") >= 0) return "Fechada";
    if (s.indexOf("resolv") >= 0) return "Resolvida";
    return s || "—";
  }

  function statusTag(status) {
    const sk = statusKey(status);
    const map = {
      Nova: ["tag-nova", "Nova"],
      "Em Validação": ["tag-valid", "Em Validação"],
      Planejamento: ["tag-plan", "Planejamento"],
      Fechada: ["tag-done", "Fechada"],
      Resolvida: ["tag-done", "Resolvida"],
    };
    return map[sk] || ["tag-and", sk];
  }

  function sprintName(i) {
    return (i.fixed_version && i.fixed_version.name) || "Backlog";
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
      if (window.__lastDashIssues && window.__lastDashVersions) {
        renderDashboard(window.__lastDashIssues, window.__lastDashVersions);
      }
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
      return dashDevFilter.has(id) || dashDevFilter.has(String(id));
    }
    var nOn = 0;
    devList.forEach(function (d) { if (isOn(d.id)) nOn++; });
    var summary = !devList.length ? "Nenhum dev com tasks" :
      (!dashDevFilter ? "Todos (" + devList.length + ")" :
        (nOn === 0 ? "Nenhum" : nOn + " de " + devList.length));
    var body = devList.map(function (d) {
      return '<label class="ms-option">' +
        '<input type="checkbox" data-did="' + d.id + '"' + (isOn(d.id) ? " checked" : "") + "/>" +
        '<span class="ms-label">' + d.name + " (" + d.done + " entregues)</span></label>";
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
      else dashDevFilter = new Set(arr.concat(arr.map(Number)));
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

  function renderDashboard(issues, versions) {
    window.__lastDashIssues = issues;
    window.__lastDashVersions = versions;
    if (dashProjFilter && dashProjFilter.size) {
      issues = issues.filter(function (i) {
        var pid = i.project && i.project.id;
        if (pid == null) return false;
        return dashProjFilter.has(pid) || dashProjFilter.has(String(pid));
      });
    }
    const byStatus = countBy(issues, (i) => statusKey(i.status.name));
    const byMod = countBy(issues, getMod);
    const bySprint = countBy(issues, sprintName);
    const sprintStatus = {};
    issues.forEach((i) => {
      const sp = sprintName(i);
      const st = statusKey(i.status.name);
      if (!sprintStatus[sp]) sprintStatus[sp] = {};
      sprintStatus[sp][st] = (sprintStatus[sp][st] || 0) + 1;
    });

    const total = issues.length;
    const nova = byStatus["Nova"] || 0;
    const valid = byStatus["Em Validação"] || 0;
    const plan = byStatus["Planejamento"] || 0;
    const done = (byStatus["Resolvida"] || 0) + (byStatus["Fechada"] || 0);
    const backlog = bySprint["Backlog"] || 0;

    document.getElementById("kpis").innerHTML = [
      ["Total", total, "info"],
      ["Nova", nova, ""],
      ["Em Validação", valid, "ok"],
      ["Planejamento", plan, ""],
      ["Resolvida", done, "ok"],
      ["Backlog", backlog, "warn"],
    ]
      .map(
        ([l, v, c]) =>
          '<div class="kpi ' + c + '"><div class="label">' + l + '</div><div class="value">' + v + "</div></div>"
      )
      .join("");

    const verStatus = {};
    versions.forEach((v) => { verStatus[v.name] = v.status; });

    const sprintOrder = ["Sprint 1","Sprint 2","Sprint 3","Sprint 4","Sprint 5","Sprint 6","Sprint 7","Backlog"];
    document.getElementById("sprintCards").innerHTML = sprintOrder
      .map((s) => {
        const n = bySprint[s] || 0;
        const st = sprintStatus[s] || {};
        if (s === "Backlog") {
          return '<div class="sc backlog"><h3>Backlog</h3><div class="period">não alocado</div><div class="num" style="color:#fcd34d">' + n + '</div><div class="breakdown">Nova ' + (st["Nova"] || 0) + "</div></div>";
        }
        const vs = verStatus[s] || "open";
        const badge = vs === "closed" ? "fechada" : "aberta";
        const bc = vs === "closed" ? "#86efac" : "#93c5fd";
        return '<div class="sc"><h3>' + s + ' <span style="font-size:.65rem;color:' + bc + '">· ' + badge + '</span></h3><div class="period">' + (PERIODS[s] || "") + ' · seg–sex</div><div class="num">' + n + '</div><div class="breakdown">Val ' + (st["Em Validação"] || 0) + " · Plan " + (st["Planejamento"] || 0) + " · Res " + ((st["Resolvida"] || 0) + (st["Fechada"] || 0)) + " · Nova " + (st["Nova"] || 0) + "</div></div>";
      })
      .join("");

    document.getElementById("banner").innerHTML =
      "<strong>Sprints (seg–sex)</strong> · Resolvida = conclusão visual do squad · Backlog: <strong style='color:#fcd34d'>" +
      backlog + "</strong> · Em Validação: <strong style='color:#86efac'>" + valid +
      "</strong> · Resolvidas: <strong>" + done + "</strong>.";

    const statusCols = ["Nova", "Em Validação", "Planejamento", "Resolvida", "Fechada"];
    let mx = '<table class="matrix"><thead><tr><th>Sprint</th>' + statusCols.map((c) => "<th>" + c + "</th>").join("") + "<th>Total</th></tr></thead><tbody>";
    sprintOrder.forEach((s) => {
      const st = sprintStatus[s] || {};
      mx += "<tr><td>" + s + "</td>" + statusCols.map((c) => "<td>" + (st[c] || 0) + "</td>").join("") + "<td><strong>" + (bySprint[s] || 0) + "</strong></td></tr>";
    });
    mx += "</tbody></table>";
    document.getElementById("matrix").innerHTML = mx;

    const modsOrder = ["M01","M02","M03","M04","M05","M06","M07","M08","M09","INF","LEG","OUT"];
    const spPri = Object.fromEntries(sprintOrder.map((s, i) => [s, i]));
    const modPri = Object.fromEntries(modsOrder.map((m, i) => [m, i]));
    const sorted = issues.slice().sort((a, b) => {
      const sa = spPri[sprintName(a)] ?? 99;
      const sb = spPri[sprintName(b)] ?? 99;
      if (sa !== sb) return sa - sb;
      return (modPri[getMod(a)] ?? 99) - (modPri[getMod(b)] ?? 99) || b.id - a.id;
    });

    const baseUrl = getCookie(C_URL).replace(/\/$/, "");
    document.querySelector("#tbl tbody").innerHTML = sorted
      .map((i) => {
        const mod = getMod(i);
        const f = ["M01","M02","M03","INF","LEG"].includes(mod) ? mod : mod.startsWith("M") ? "EP" : mod;
        const [tc, tl] = statusTag(i.status.name);
        const sp = sprintName(i);
        const spf = sp.replace(/ /g, "");
        const subj = (i.subject || "").replace(/\[HEMOPI\]\s*/g, "");
        return '<tr data-f="' + f + '" data-mod="' + mod + '" data-st="' + statusKey(i.status.name) + '" data-sp="' + spf + '"><td><a href="' + baseUrl + "/issues/" + i.id + '" target="_blank">#' + i.id + "</a></td><td>" + sp + "</td><td>" + mod + "</td><td>" + escapeHtml(subj) + '</td><td><span class="tag ' + tc + '">' + tl + "</span></td><td>" + escapeHtml((i.assigned_to && i.assigned_to.name) || "—") + "</td><td>" + (i.start_date || "—") + "</td><td>" + (i.due_date || "—") + "</td></tr>";
      })
      .join("");

    const filters = [
      ["all","Todos"],["M01","M01"],["M02","M02"],["M03","M03"],["EP","M04–09"],
      ["LEG","Legado"],["INF","INF"],["sp:Backlog","Backlog"],["sp:Sprint5","Sprint 5"],
      ["sp:Sprint3","Sprint 3"],["st:Em Validação","Em Validação"],["st:Resolvida","Resolvida"],
    ];
    document.getElementById("filters").innerHTML = filters
      .map(([k, lab], idx) => '<button class="' + (idx === 0 ? "active" : "") + '" data-k="' + k + '">' + lab + "</button>")
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

    try {
      charts.status = new Chart(document.getElementById("chartStatus"), {
        type: "doughnut",
        data: {
          labels: ["Nova", "Em Validação", "Planejamento", "Resolvida"],
          datasets: [{ data: [nova, valid, plan, done], backgroundColor: [col.nova, col.valid, col.plan, col.done], borderWidth: 0 }]
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
      charts.sprint = new Chart(document.getElementById("chartSprint"), {
        type: "bar",
        data: {
          labels: sprintOrder,
          datasets: [
            { label: "Nova", data: sprintOrder.map((s) => (sprintStatus[s] || {})["Nova"] || 0), backgroundColor: col.nova, stack: "s" },
            { label: "Em Validação", data: sprintOrder.map((s) => (sprintStatus[s] || {})["Em Validação"] || 0), backgroundColor: col.valid, stack: "s" },
            { label: "Planejamento", data: sprintOrder.map((s) => (sprintStatus[s] || {})["Planejamento"] || 0), backgroundColor: col.plan, stack: "s" },
            { label: "Resolvida", data: sprintOrder.map((s) => ((sprintStatus[s] || {})["Resolvida"] || 0) + ((sprintStatus[s] || {})["Fechada"] || 0)), backgroundColor: col.done, stack: "s" }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } } },
          scales: {
            x: { stacked: true, ticks: { color: "#94a3b8" }, grid: { display: false } },
            y: { stacked: true, ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true }
          }
        }
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
    document.getElementById("hdrMeta").textContent = "Sprints + backlog · " + getCookie(C_EMAIL) + " · " + now;
    document.getElementById("footLeft").textContent = "Fonte: Redmine REST · projeto " + getCookie(C_PROJ) + " + subprojetos · " + total + " issues";
    document.getElementById("footRight").textContent = "Atualizado " + now + " · cookies locais · sem chave no código";
  }

  let dashDevFilter = null;
  let dashProjFilter = null;
  let allProjectsDash = [];
  (function initSharedFromLS() {
    try {
      var sf = loadSharedFilters();
      if (sf.assignee) dashDevFilter = new Set(sf.assignee.concat(sf.assignee.map(Number)));
      if (sf.projects) dashProjFilter = new Set(sf.projects.concat(sf.projects.map(Number)));
    } catch (e) {}
  })();


  async function loadData() {
    const loading = document.getElementById("loading");
    show(loading);
    try {
      const projectId = getCookie(C_PROJ);
      if (!projectId) throw new Error("ID do projeto não informado. Faça login novamente.");
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
      }
      renderDashProjFilter();
      var issues = await fetchAllIssues(projectId);
      try {
        var root = allProjectsDash.find(function (p) {
          return String(p.id) === String(projectId) || p.identifier === projectId;
        });
        var parentId = root && root.parent && root.parent.id;
        if (parentId) {
          var siblings = allProjectsDash.filter(function (p) {
            return p.parent && p.parent.id === parentId && String(p.id) !== String(root.id);
          });
          var seen = {};
          issues.forEach(function (i) { seen[i.id] = true; });
          for (var si = 0; si < siblings.length; si++) {
            var nm = (siblings[si].name || "").toLowerCase();
            if (!/(hemopi|mv|legado|inf|sesapi)/i.test(nm)) continue;
            try {
              var extra = await fetchAllIssues(siblings[si].id);
              extra.forEach(function (i) {
                if (!seen[i.id]) { seen[i.id] = true; issues.push(i); }
              });
            } catch (e2) {}
          }
        }
      } catch (e3) {}
      var versions = await fetchVersions(projectId);
      renderDashboard(issues, versions);
    } catch (e) {
      alert("Falha ao carregar Redmine.\n" + e.message + "\n\nSe for CORS, rode: npm install && npm run proxy → http://localhost:8787");
      console.error(e);
    } finally {
      hide(loading);
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
    if (getCookie(C_KEY) && getCookie(C_URL) && getCookie(C_PROJ)) goDash();
    else goLogin();
  };

  document.getElementById("btnLogin").onclick = () => {
    const email = document.getElementById("inEmail").value.trim();
    const url = document.getElementById("inUrl").value.trim().replace(/\/$/, "");
    const key = document.getElementById("inKey").value.trim();
    const proj = document.getElementById("inProject").value.trim();
    const err = document.getElementById("loginError");
    err.textContent = "";
    if (!validEmail(email)) { err.textContent = "Informe um e-mail válido."; return; }
    if (!url) { err.textContent = "Informe a URL do Redmine."; return; }
    if (!key) { err.textContent = "Informe a API key."; return; }
    if (!proj) { err.textContent = "Informe o ID do projeto raiz."; return; }
    setCookie(C_EMAIL, email, 30);
    setCookie(C_URL, url, 30);
    setCookie(C_KEY, key, 30);
    setCookie(C_PROJ, proj, 30);
    goDash();
  };

  document.getElementById("btnLogout").onclick = () => { clearAuth(); goLogin(); };
  document.getElementById("btnRefresh").onclick = () => loadData();

  if (!getCookie(COOKIE_OK)) {
    show(document.getElementById("cookieBanner"));
    hide(document.getElementById("loginView"));
    hide(document.getElementById("dashView"));
  } else if (getCookie(C_KEY) && getCookie(C_URL) && getCookie(C_PROJ)) {
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
