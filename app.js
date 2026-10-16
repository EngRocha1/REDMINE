/* HEMOPI Redmine Dashboard — credenciais apenas em cookies */
(function () {
  const COOKIE_OK = "rd_cookie_ok";
  const C_EMAIL = "rd_email";
  const C_URL = "rd_url";
  const C_KEY = "rd_key";
  const C_PROJ = "rd_project";

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
        '<span class="ms-trigger-text">' + summary + "</span><span class=\"ms-trigger-chev\">▾</span></button>" +
      '<div class="ms-panel hidden" id="dashDevPanel">' +
        '<div class="ms-panel-head"><span>Devs com atividades</span>' +
          '<span><button type="button" class="ms-mini" id="dashDevAll">Todos</button> ' +
          '<button type="button" class="ms-mini" id="dashDevNone">Limpar</button></span></div>' +
        '<div class="ms-panel-body">' + body + "</div></div>";
    var trigger = document.getElementById("dashDevTrigger");
    var panel = document.getElementById("dashDevPanel");
    if (trigger) trigger.onclick = function (e) {
      e.stopPropagation();
      panel.classList.toggle("hidden");
    };
    if (!window.__dashDevClose) {
      window.__dashDevClose = true;
      document.addEventListener("click", function (e) {
        var t = document.getElementById("dashDevMs");
        if (t && !t.contains(e.target)) {
          var p = document.getElementById("dashDevPanel");
          if (p) p.classList.add("hidden");
        }
      });
    }
    function sync() {
      var boxes = el.querySelectorAll("input[data-did]");
      var set = new Set();
      var n = 0;
      boxes.forEach(function (b) {
        if (b.checked) { set.add(+b.dataset.did); set.add(String(b.dataset.did)); n++; }
      });
      if (n === 0) dashDevFilter = new Set([-1]);
      else if (n === boxes.length) dashDevFilter = null;
      else dashDevFilter = set;
      /* re-render dashboard with same cached issues */
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
      sync();
    };
    if (nbtn) nbtn.onclick = function (e) {
      e.stopPropagation();
      el.querySelectorAll("input[data-did]").forEach(function (b) { b.checked = false; });
      dashDevFilter = new Set([-1]);
      sync();
    };
  }

  function renderDashboard(issues, versions) {
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

    Object.values(charts || {}).forEach((c) => { try { c.destroy(); } catch (e) {} });
    charts = {};
    const col = { nova: "#3b82f6", valid: "#22c55e", plan: "#a78bfa", done: "#94a3b8" };
    charts.status = new Chart(document.getElementById("chartStatus"), {
      type: "doughnut",
      data: { labels: ["Nova","Em Validação","Planejamento","Resolvida"], datasets: [{ data: [nova, valid, plan, done], backgroundColor: [col.nova, col.valid, col.plan, col.done], borderWidth: 0 }] },
      options: { plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } } }, maintainAspectRatio: false },
    });
    const modLabels = modsOrder.filter((m) => byMod[m] > 0);
    charts.mod = new Chart(document.getElementById("chartMod"), {
      type: "bar",
      data: { labels: modLabels, datasets: [{ data: modLabels.map((m) => byMod[m]), backgroundColor: "#3b82f6", borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#94a3b8" }, grid: { display: false } }, y: { ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true } }, maintainAspectRatio: false },
    });
    charts.sprint = new Chart(document.getElementById("chartSprint"), {
      type: "bar",
      data: {
        labels: sprintOrder,
        datasets: [
          { label: "Nova", data: sprintOrder.map((s) => (sprintStatus[s] || {})["Nova"] || 0), backgroundColor: col.nova, stack: "s" },
          { label: "Em Validação", data: sprintOrder.map((s) => (sprintStatus[s] || {})["Em Validação"] || 0), backgroundColor: col.valid, stack: "s" },
          { label: "Planejamento", data: sprintOrder.map((s) => (sprintStatus[s] || {})["Planejamento"] || 0), backgroundColor: col.plan, stack: "s" },
          { label: "Resolvida", data: sprintOrder.map((s) => ((sprintStatus[s] || {})["Resolvida"] || 0) + ((sprintStatus[s] || {})["Fechada"] || 0)), backgroundColor: col.done, stack: "s" },
        ],
      },
      options: { plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } } }, scales: { x: { stacked: true, ticks: { color: "#94a3b8" }, grid: { display: false } }, y: { stacked: true, ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true } }, maintainAspectRatio: false },
    });

    
    /* ===== Produtividade por desenvolvedor ===== */
    if (window.ChartDataLabels && !window.__dlRegistered) {
      try { Chart.register(ChartDataLabels); window.__dlRegistered = true; } catch (e) {}
    }
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
    var prodCanvas = document.getElementById("chartProd");
    var loadCanvas = document.getElementById("chartLoad");
    if (prodCanvas) {
      charts.prod = new Chart(prodCanvas, {
        type: "bar",
        data: {
          labels: shown.map(function (d) { return d.name.split(" ")[0]; }),
          datasets: [
            {
              label: "Entregas",
              data: shown.map(function (d) { return d.done; }),
              backgroundColor: shown.map(function (_, i) { return neonPalette[i % neonPalette.length]; }),
              borderRadius: 6,
              order: 2
            },
            {
              label: "Média equipe",
              data: shown.map(function () { return Math.round(teamAvgDone * 10) / 10; }),
              type: "line",
              borderColor: "#f472b6",
              borderWidth: 2,
              borderDash: [6, 4],
              pointRadius: 0,
              fill: false,
              order: 1
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } },
            datalabels: {
              color: "#e2e8f0",
              anchor: "end",
              align: "top",
              font: { size: 11, weight: "600" },
              formatter: function (v, ctx) {
                return ctx.dataset.type === "line" ? "" : v;
              }
            }
          },
          scales: {
            x: { ticks: { color: "#94a3b8", maxRotation: 45 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" } }
          }
        }
      });
    }
    if (loadCanvas) {
      charts.load = new Chart(loadCanvas, {
        type: "bar",
        data: {
          labels: shown.map(function (d) { return d.name.split(" ")[0]; }),
          datasets: [{
            label: "Abertas",
            data: shown.map(function (d) { return d.open; }),
            backgroundColor: shown.map(function (_, i) { return neonPalette[i % neonPalette.length]; }),
            borderRadius: 6
          }]
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              color: "#e2e8f0",
              anchor: "end",
              align: "top",
              font: { size: 11, weight: "600" },
              formatter: function (v) { return v; }
            }
          },
          scales: {
            x: { ticks: { color: "#94a3b8", maxRotation: 45 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" } }
          }
        }
      });
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

  async function loadData() {

    const loading = document.getElementById("loading");
    show(loading);
    try {
      const projectId = getCookie(C_PROJ);
      if (!projectId) throw new Error("ID do projeto não informado. Faça login novamente.");
      const [issues, versions] = await Promise.all([fetchAllIssues(projectId), fetchVersions(projectId)]);
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
})();
