/* HEMOPI Gantt hotfix v2 — carregar DEPOIS de gantt.js */
(function () {
  "use strict";
  var log = function () {
    try { console.log.apply(console, ["[HEMOPI hotfix]"].concat([].slice.call(arguments))); } catch (e) {}
  };
  log("loaded v2");

  window.placeMenu = function (menu, x, y) {
    if (!menu) return;
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
    menu.classList.remove("hidden");
    menu.style.display = "flex";
    menu.style.flexDirection = "column";
    menu.style.visibility = "hidden";
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.maxHeight = "none";
    var pad = 12, taskbar = 64;
    var maxH = Math.max(120, window.innerHeight - pad * 2 - taskbar);
    menu.style.maxHeight = maxH + "px";
    menu.style.overflowY = "auto";
    menu.style.overflowX = "hidden";
    void menu.offsetHeight;
    var mw = Math.max(menu.offsetWidth || 260, 240);
    var mh = Math.min(menu.scrollHeight || 200, maxH);
    var left = Math.max(pad, Math.min(x, window.innerWidth - mw - pad));
    var top = y;
    if (top + mh > window.innerHeight - pad - taskbar) top = window.innerHeight - mh - pad - taskbar;
    if (top < pad) top = pad;
    var avail = window.innerHeight - top - pad - taskbar;
    if (avail < mh) menu.style.maxHeight = Math.max(100, avail) + "px";
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "visible";
  };

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
      card.style.left = "0"; card.style.top = "0";
      card.style.width = "100vw"; card.style.height = "100vh";
      card.style.maxWidth = "100vw"; card.style.maxHeight = "100vh";
      card.style.margin = "0"; card.style.borderRadius = "0";
      card.style.zIndex = "10040";
    } else {
      card.style.left = ""; card.style.top = "";
      card.style.width = ""; card.style.height = "";
      card.style.position = ""; card.style.margin = "";
      card.style.maxWidth = ""; card.style.maxHeight = "";
      card.style.borderRadius = ""; card.style.zIndex = "";
    }
    log("fullscreen", on);
  }, true);

  document.addEventListener("click", function (ev) {
    if (!(ev.target.closest && ev.target.closest(".eye-btn"))) return;
    setTimeout(function () {
      ["statusMenu", "assigneeMenu"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.classList.add("hidden"); el.style.display = "none"; }
      });
    }, 0);
  }, true);

  var dragId = null;
  var STATUS_ID = {
    "Nova": 1,
    "Desenvolvimento: Planejamento": 12,
    "Desenvolvimento: Em Andamento": 11,
    "Desenvolvimento: Em Validação": 9,
    "Desenvolvimento: Em Deploy": 16,
    "Em Pagamento": 13,
    "Resolvida": 3,
    "Fechada": 5,
    "Rejeitada": 6
  };
  function resolveStatusId(stName) {
    if (!stName) return null;
    if (STATUS_ID[stName]) return STATUS_ID[stName];
    var low = String(stName).toLowerCase();
    if (low.indexOf("nova") >= 0) return 1;
    if (low.indexOf("planej") >= 0) return 12;
    if (low.indexOf("andamento") >= 0) return 11;
    if (low.indexOf("valida") >= 0) return 9;
    if (low.indexOf("deploy") >= 0) return 16;
    if (low.indexOf("pagamento") >= 0) return 13;
    if (low.indexOf("resolv") >= 0) return 3;
    if (low.indexOf("fechad") >= 0) return 5;
    if (low.indexOf("rejeit") >= 0) return 6;
    return null;
  }
  function statusClass(name) {
    var s = (name || "").toLowerCase();
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
  function refreshColCounts(board) {
    board.querySelectorAll(".kanban-col").forEach(function (c) {
      var b = c.querySelector(".kanban-col-body");
      var h = c.querySelector(".kanban-col-head");
      if (h && b) {
        var n = b.querySelectorAll(".kanban-card").length;
        var base = (h.textContent || "").replace(/\s*\(\d+\)\s*$/, "");
        h.textContent = base + " (" + n + ")";
      }
    });
  }
  function getApiKey() {
    var m = document.cookie.match(/(?:^|; )rd_key=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function getApiUrl() {
    var m = document.cookie.match(/(?:^|; )rd_url=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  document.addEventListener("dragstart", function (ev) {
    var card = ev.target.closest && ev.target.closest(".kanban-card");
    if (!card) return;
    if (ev.target.closest && ev.target.closest(".icon-btn")) { ev.preventDefault(); return; }
    dragId = +card.dataset.id;
    try {
      ev.dataTransfer.setData("text/plain", String(dragId));
      ev.dataTransfer.effectAllowed = "move";
    } catch (e) {}
    card.classList.add("dragging");
    card.style.opacity = ".55";
    log("dragstart", dragId);
  }, true);

  document.addEventListener("dragend", function (ev) {
    var card = ev.target.closest && ev.target.closest(".kanban-card");
    if (card) { card.classList.remove("dragging"); card.style.opacity = "1"; }
    setTimeout(function () { dragId = null; }, 120);
  }, true);

  document.addEventListener("dragover", function (ev) {
    var body = ev.target.closest && ev.target.closest(".kanban-col-body");
    if (!body) return;
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = "move"; } catch (e) {}
    body.classList.add("drag-over");
  }, true);

  document.addEventListener("dragleave", function (ev) {
    var body = ev.target.closest && ev.target.closest(".kanban-col-body");
    if (body) body.classList.remove("drag-over");
  }, true);

  document.addEventListener("drop", function (ev) {
    var body = ev.target.closest && ev.target.closest(".kanban-col-body");
    if (!body) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    body.classList.remove("drag-over");
    var movedId = dragId;
    try {
      var dt = ev.dataTransfer && ev.dataTransfer.getData("text/plain");
      if (dt) movedId = +dt;
    } catch (e) {}
    if (!movedId) { log("drop sem id"); return; }
    var col = body.parentElement;
    var stName = col && col.dataset.status;
    var sid = resolveStatusId(stName);
    log("drop", movedId, "->", stName, sid);
    var board = document.getElementById("kanbanBoard") || body.closest(".kanban-board");
    var cardEl = board
      ? board.querySelector('.kanban-card[data-id="' + movedId + '"]')
      : document.querySelector('.kanban-card[data-id="' + movedId + '"]');
    if (cardEl) {
      body.appendChild(cardEl);
      cardEl.style.opacity = "1";
      cardEl.classList.remove("dragging");
      cardEl.className = "kanban-card " + statusClass(stName);
      cardEl.setAttribute("draggable", "true");
      var stSpan = cardEl.querySelector(".kc-st");
      if (stSpan) stSpan.textContent = shortStatus(stName);
    }
    if (board) refreshColCounts(board);
    if (!sid) { log("status sem id", stName); return; }
    var key = getApiKey();
    var url = getApiUrl();
    if (!key) { log("sem API key"); return; }
    fetch("/api/issues/" + movedId + ".json", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Redmine-API-Key": key,
        "X-Redmine-URL": url
      },
      body: JSON.stringify({ issue: { status_id: sid } })
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        log("PUT ok", movedId, stName);
      })
      .catch(function (err) {
        log("PUT fail", err);
        alert("Erro ao mover task #" + movedId + ": " + err.message);
      });
  }, true);

  setInterval(function () {
    var el = document.getElementById("chipsAssignee");
    if (!el || el.querySelector('[data-v="none"]')) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.k = "assignee";
    btn.dataset.v = "none";
    btn.textContent = "Sem responsável";
    el.insertBefore(btn, el.firstChild);
    log("chip Sem responsável");
  }, 2000);

  var st = document.createElement("style");
  st.textContent =
    ".status-menu,.assignee-menu{position:fixed!important;z-index:10060!important;max-height:min(60vh,calc(100vh - 72px))!important;overflow-y:auto!important}" +
    ".status-menu.hidden,.assignee-menu.hidden{display:none!important}" +
    ".modal-card.is-fs{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:10040!important;border-radius:0!important;margin:0!important}" +
    ".kanban-card.dragging{opacity:.55;outline:2px dashed #67e8f9}" +
    ".kanban-col-body.drag-over{background:rgba(59,130,246,.15)!important;outline:2px dashed #67e8f9}" +
    ".kanban-card{cursor:grab}.kanban-card:active{cursor:grabbing}";
  document.head.appendChild(st);
  log("css injected");
})();
