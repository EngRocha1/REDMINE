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

  function show(el) {
    el.classList.remove("hidden");
  }
  function hide(el) {
    el.classList.add("hidden");
  }

  function validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  /** API fetch — usa proxy /api se estiver em localhost:8787, senão direto */
  async function redmineGet(path) {
    const base = getCookie(C_URL).replace(/\/$/, "");
    const key = getCookie(C_KEY);
    const useProxy = location.port === "8787" || location.pathname.indexOf("proxy") >= 0 || window.REDMINE_USE_PROXY;
    let url, headers;
    if (useProxy || location.port === "8787") {
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

  function renderGlossary() {
    const el = document.getElementById("glossary");
    el.innerHTML = GLOSSARY.map(
      ([k, v]) => "<div><dt>" + k + "</dt><dd>" + v + "</dd></div>"
    ).join("");
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
          '<div class="kpi ' +
          c +
          '"><div class="label">' +
          l +
          '</div><div class="value">' +
          v +
          "</div></div>"
      )
      .join("");

    const verStatus = {};
    versions.forEach((v) => {
      verStatus[v.name] = v.status;
    });

    const sprintOrder = [
      "Sprint 1",
      "Sprint 2",
      "Sprint 3",
      "Sprint 4",
      "Sprint 5",
      "Sprint 6",
      "Sprint 7",
      "Backlog",
    ];
    document.getElementById("sprintCards").innerHTML = sprintOrder
      .map((s) => {
        const n = bySprint[s] || 0;
        const st = sprintStatus[s] || {};
        if (s === "Backlog") {
          return (
            '<div class="sc backlog"><h3>Backlog</h3><div class="period">não alocado</div><div class="num" style="color:#fcd34d">' +
            n +
            '</div><div class="breakdown">Nova ' +
            (st["Nova"] || 0) +
            "</div></div>"
          );
        }
        const vs = verStatus[s] || "open";
        const badge = vs === "closed" ? "fechada" : "aberta";
        const bc = vs === "closed" ? "#86efac" : "#93c5fd";
        return (
          '<div class="sc"><h3>' +
          s +
          ' <span style="font-size:.65rem;color:' +
          bc +
          '">· ' +
          badge +
          '</span></h3><div class="period">' +
          (PERIODS[s] || "") +
          ' · seg–sex</div><div class="num">' +
          n +
          '</div><div class="breakdown">Val ' +
          (st["Em Validação"] || 0) +
          " · Plan " +
          (st["Planejamento"] || 0) +
          " · Res " +
          ((st["Resolvida"] || 0) + (st["Fechada"] || 0)) +
          " · Nova " +
          (st["Nova"] || 0) +
          "</div></div>"
        );
      })
      .join("");

    document.getElementById("banner").innerHTML =
      "<strong>Sprints (seg–sex)</strong> · Resolvida = conclusão visual do squad · Backlog: <strong style='color:#fcd34d'>" +
      backlog +
      "</strong> · Em Validação: <strong style='color:#86efac'>" +
      valid +
      "</strong> · Resolvidas: <strong>" +
      done +
      "</strong>.";

    // matrix
    const statusCols = ["Nova", "Em Validação", "Planejamento", "Resolvida", "Fechada"];
    let mx =
      '<table class="matrix"><thead><tr><th>Sprint</th>' +
      statusCols.map((c) => "<th>" + c + "</th>").join("") +
      "<th>Total</th></tr></thead><tbody>";
    sprintOrder.forEach((s) => {
      if (!(bySprint[s] > 0) && s !== "Backlog" && !String(s).startsWith("Sprint")) return;
      const st = sprintStatus[s] || {};
      mx +=
        "<tr><td>" +
        s +
        "</td>" +
        statusCols.map((c) => "<td>" + (st[c] || 0) + "</td>").join("") +
        "<td><strong>" +
        (bySprint[s] || 0) +
        "</strong></td></tr>";
    });
    mx += "</tbody></table>";
    document.getElementById("matrix").innerHTML = mx;

    // table
    const modsOrder = ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "INF", "LEG", "OUT"];
    const spPri = Object.fromEntries(sprintOrder.map((s, i) => [s, i]));
    const modPri = Object.fromEntries(modsOrder.map((m, i) => [m, i]));
    const sorted = issues.slice().sort((a, b) => {
      const sa = spPri[sprintName(a)] ?? 99;
      const sb = spPri[sprintName(b)] ?? 99;
      if (sa !== sb) return sa - sb;
      return (modPri[getMod(a)] ?? 99) - (modPri[getMod(b)] ?? 99) || b.id - a.id;
    });

    const baseUrl = getCookie(C_URL).replace(/\/$/, "");
    const tbody = sorted
      .map((i) => {
        const mod = getMod(i);
        const f = ["M01", "M02", "M03", "INF", "LEG"].includes(mod)
          ? mod
          : mod.startsWith("M")
          ? "EP"
          : mod;
        const [tc, tl] = statusTag(i.status.name);
        const sp = sprintName(i);
        const spf = sp.replace(/ /g, "");
        const subj = (i.subject || "").replace(/\[HEMOPI\]\s*/g, "");
        return (
          '<tr data-f="' +
          f +
          '" data-mod="' +
          mod +
          '" data-st="' +
          statusKey(i.status.name) +
          '" data-sp="' +
          spf +
          '"><td><a href="' +
          baseUrl +
          "/issues/" +
          i.id +
          '" target="_blank">#' +
          i.id +
          "</a></td><td>" +
          sp +
          "</td><td>" +
          mod +
          "</td><td>" +
          escapeHtml(subj) +
          '</td><td><span class="tag ' +
          tc +
          '">' +
          tl +
          "</span></td><td>" +
          escapeHtml((i.assigned_to && i.assigned_to.name) || "—") +
          "</td><td>" +
          (i.start_date || "—") +
          "</td><td>" +
          (i.due_date || "—") +
          "</td></tr>"
        );
      })
      .join("");
    document.querySelector("#tbl tbody").innerHTML = tbody;

    // filters
    const filters = [
      ["all", "Todos"],
      ["M01", "M01"],
      ["M02", "M02"],
      ["M03", "M03"],
      ["EP", "M04–09"],
      ["LEG", "Legado"],
      ["INF", "INF"],
      ["sp:Backlog", "Backlog"],
      ["sp:Sprint5", "Sprint 5"],
      ["sp:Sprint3", "Sprint 3"],
      ["st:Em Validação", "Em Validação"],
      ["st:Resolvida", "Resolvida"],
    ];
    document.getElementById("filters").innerHTML = filters
      .map(
        ([k, lab], idx) =>
          '<button class="' +
          (idx === 0 ? "active" : "") +
          '" data-k="' +
          k +
          '">' +
          lab +
          "</button>"
      )
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
            show =
              tr.dataset.st === st ||
              (st === "Resolvida" && (tr.dataset.st === "Resolvida" || tr.dataset.st === "Fechada"));
          } else show = tr.dataset.f === k || tr.dataset.mod === k;
          tr.style.display = show ? "" : "none";
        });
      };
    });

    // charts
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
    const col = { nova: "#3b82f6", valid: "#22c55e", plan: "#a78bfa", done: "#94a3b8" };
    charts.status = new Chart(document.getElementById("chartStatus"), {
      type: "doughnut",
      data: {
        labels: ["Nova", "Em Validação", "Planejamento", "Resolvida"],
        datasets: [
          {
            data: [nova, valid, plan, done],
            backgroundColor: [col.nova, col.valid, col.plan, col.done],
            borderWidth: 0,
          },
        ],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } } },
        maintainAspectRatio: false,
      },
    });
    const modLabels = modsOrder.filter((m) => byMod[m] > 0);
    charts.mod = new Chart(document.getElementById("chartMod"), {
      type: "bar",
      data: {
        labels: modLabels,
        datasets: [
          {
            data: modLabels.map((m) => byMod[m]),
            backgroundColor: "#3b82f6",
            borderRadius: 6,
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true },
        },
        maintainAspectRatio: false,
      },
    });
    charts.sprint = new Chart(document.getElementById("chartSprint"), {
      type: "bar",
      data: {
        labels: sprintOrder,
        datasets: [
          {
            label: "Nova",
            data: sprintOrder.map((s) => (sprintStatus[s] || {})["Nova"] || 0),
            backgroundColor: col.nova,
            stack: "s",
          },
          {
            label: "Em Validação",
            data: sprintOrder.map((s) => (sprintStatus[s] || {})["Em Validação"] || 0),
            backgroundColor: col.valid,
            stack: "s",
          },
          {
            label: "Planejamento",
            data: sprintOrder.map((s) => (sprintStatus[s] || {})["Planejamento"] || 0),
            backgroundColor: col.plan,
            stack: "s",
          },
          {
            label: "Resolvida",
            data: sprintOrder.map(
              (s) =>
                ((sprintStatus[s] || {})["Resolvida"] || 0) +
                ((sprintStatus[s] || {})["Fechada"] || 0)
            ),
            backgroundColor: col.done,
            stack: "s",
          },
        ],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } } },
        scales: {
          x: { stacked: true, ticks: { color: "#94a3b8" }, grid: { display: false } },
          y: { stacked: true, ticks: { color: "#94a3b8" }, grid: { color: "#2d3a4f" }, beginAtZero: true },
        },
        maintainAspectRatio: false,
      },
    });

    const now = new Date().toLocaleString("pt-BR");
    document.getElementById("hdrMeta").textContent =
      "Sprints + backlog · " + getCookie(C_EMAIL) + " · " + now;
    document.getElementById("footLeft").textContent =
      "Fonte: Redmine REST · projeto " + getCookie(C_PROJ) + " + subprojetos · " + total + " issues";
    document.getElementById("footRight").textContent =
      "Atualizado " + now + " · cookies locais · sem chave no código";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadData() {
    const loading = document.getElementById("loading");
    show(loading);
    try {
      const projectId = getCookie(C_PROJ) || "414";
      const [issues, versions] = await Promise.all([
        fetchAllIssues(projectId),
        fetchVersions(projectId),
      ]);
      renderDashboard(issues, versions);
    } catch (e) {
      alert(
        "Falha ao carregar Redmine.\n" +
          e.message +
          "\n\nSe for erro de CORS, rode: npm install && npm run proxy e abra http://localhost:8787"
      );
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

  // init
  document.getElementById("btnAcceptCookies").onclick = () => {
    setCookie(COOKIE_OK, "1", 365);
    hide(document.getElementById("cookieBanner"));
    if (getCookie(C_KEY) && getCookie(C_URL)) goDash();
    else goLogin();
  };

  document.getElementById("btnLogin").onclick = async () => {
    const email = document.getElementById("inEmail").value.trim();
    const url = document.getElementById("inUrl").value.trim().replace(/\/$/, "");
    const key = document.getElementById("inKey").value.trim();
    const proj = document.getElementById("inProject").value.trim() || "414";
    const err = document.getElementById("loginError");
    err.textContent = "";
    if (!validEmail(email)) {
      err.textContent = "Informe um e-mail válido.";
      return;
    }
    if (!url || !key) {
      err.textContent = "URL e API key são obrigatórios.";
      return;
    }
    setCookie(C_EMAIL, email, 30);
    setCookie(C_URL, url, 30);
    setCookie(C_KEY, key, 30);
    setCookie(C_PROJ, proj, 30);
    goDash();
  };

  document.getElementById("btnLogout").onclick = () => {
    clearAuth();
    goLogin();
  };
  document.getElementById("btnRefresh").onclick = () => loadData();

  // boot
  if (!getCookie(COOKIE_OK)) {
    show(document.getElementById("cookieBanner"));
    hide(document.getElementById("loginView"));
    hide(document.getElementById("dashView"));
  } else if (getCookie(C_KEY) && getCookie(C_URL)) {
    goDash();
  } else {
    goLogin();
  }
})();
