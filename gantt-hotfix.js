/* HEMOPI Gantt hotfix — carregar DEPOIS de gantt.js
 * Corrige: menus viewport, fullscreen, Kanban DnD visual, fechar menu no modal
 */
(function () {
  "use strict";
  var log = function () {
    try { console.log.apply(console, ["[HEMOPI hotfix]"].concat([].slice.call(arguments))); } catch (e) {}
  };
  log("loaded");

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
    var pad = 12;
    var taskbar = 64;
    var maxH = Math.max(120, window.innerHeight - pad * 2 - taskbar);
    menu.style.maxHeight = maxH + "px";
    menu.style.overflowY = "auto";
    menu.style.overflowX = "hidden";
    void menu.offsetHeight;
    var mw = Math.max(menu.offsetWidth || 260, 240);
    var mh = Math.min(menu.scrollHeight || 200, maxH);
    var left = Math.max(pad, Math.min(x, window.innerWidth - mw - pad));
    var top = y;
    if (top + mh > window.innerHeight - pad - taskbar) {
      top = window.innerHeight - mh - pad - taskbar;
    }
    if (top < pad) top = pad;
    var avail = window.innerHeight - top - pad - taskbar;
    if (avail < mh) menu.style.maxHeight = Math.max(100, avail) + "px";
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "visible";
    log("placeMenu", left, top, menu.style.maxHeight);
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
    log("fullscreen", on);
  }, true);

  document.addEventListener("click", function (ev) {
    var eye = ev.target.closest && ev.target.closest(".eye-btn");
    if (!eye) return;
    setTimeout(function () {
      ["statusMenu", "assigneeMenu"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.classList.add("hidden"); el.style.display = "none"; }
      });
    }, 0);
  }, true);

  function patchKanbanBoard() {
    var board = document.getElementById("kanbanBoard");
    if (!board || board.dataset.hotfixDnd === "1") return;
    board.dataset.hotfixDnd = "1";
    var dragId = null;

    board.addEventListener("dragstart", function (ev) {
      var card = ev.target.closest && ev.target.closest(".kanban-card");
      if (!card || (ev.target.closest && ev.target.closest(".icon-btn"))) return;
      dragId = +card.dataset.id;
      try {
        ev.dataTransfer.setData("text/plain", String(dragId));
        ev.dataTransfer.effectAllowed = "move";
      } catch (e) {}
      card.classList.add("dragging");
      card.style.opacity = ".55";
      log("dragstart", dragId);
    });

    board.addEventListener("dragend", function (ev) {
      var card = ev.target.closest && ev.target.closest(".kanban-card");
      if (card) { card.classList.remove("dragging"); card.style.opacity = "1"; }
      setTimeout(function () { dragId = null; }, 100);
    });

    board.addEventListener("dragover", function (ev) {
      var body = ev.target.closest && ev.target.closest(".kanban-col-body");
      if (!body) return;
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = "move"; } catch (e) {}
      body.classList.add("drag-over");
    });

    board.addEventListener("dragleave", function (ev) {
      var body = ev.target.closest && ev.target.closest(".kanban-col-body");
      if (body) body.classList.remove("drag-over");
    });

    board.addEventListener("drop", function (ev) {
      var body = ev.target.closest && ev.target.closest(".kanban-col-body");
      if (!body) return;
      ev.preventDefault();
      ev.stopPropagation();
      body.classList.remove("drag-over");
      var movedId = dragId;
      try {
        var dt = ev.dataTransfer && ev.dataTransfer.getData("text/plain");
        if (dt) movedId = +dt;
      } catch (e) {}
      if (!movedId) return;
      var col = body.parentElement;
      var stName = col && col.dataset.status;
      log("drop", movedId, stName);

      var cardEl = board.querySelector('.kanban-card[data-id="' + movedId + '"]');
      if (cardEl) {
        body.appendChild(cardEl);
        cardEl.style.opacity = "1";
        cardEl.classList.remove("dragging");
      }

      var FALLBACK = {
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
      var sid = FALLBACK[stName];
      if (!sid && stName) {
        var low = stName.toLowerCase();
        if (low.indexOf("nova") >= 0) sid = 1;
        else if (low.indexOf("planej") >= 0) sid = 12;
        else if (low.indexOf("andamento") >= 0) sid = 11;
        else if (low.indexOf("valida") >= 0) sid = 9;
        else if (low.indexOf("deploy") >= 0) sid = 16;
        else if (low.indexOf("pagamento") >= 0) sid = 13;
        else if (low.indexOf("resolv") >= 0) sid = 3;
        else if (low.indexOf("fechad") >= 0) sid = 5;
        else if (low.indexOf("rejeit") >= 0) sid = 6;
      }
      if (!sid) { log("status sem id", stName); return; }

      try {
        var key = document.cookie.match(/(?:^|; )rd_key=([^;]*)/);
        var url = document.cookie.match(/(?:^|; )rd_url=([^;]*)/);
        key = key ? decodeURIComponent(key[1]) : "";
        url = url ? decodeURIComponent(url[1]) : "";
        if (!key) { log("sem api key nos cookies"); return; }
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
            document.querySelectorAll(".kanban-col").forEach(function (c) {
              var b = c.querySelector(".kanban-col-body");
              var h = c.querySelector(".kanban-col-head");
              if (h && b) {
                var n = b.querySelectorAll(".kanban-card").length;
                var base = (h.textContent || "").replace(/\s*\(\d+\)\s*$/, "");
                h.textContent = base + " (" + n + ")";
              }
            });
          })
          .catch(function (err) {
            log("PUT fail", err);
            alert("Erro ao mover task: " + err.message);
          });
      } catch (err) { log("drop error", err); }
    });
    log("kanban DnD patched");
  }

  var obs = new MutationObserver(function () {
    var board = document.getElementById("kanbanBoard");
    if (board && board.children.length && board.dataset.hotfixDnd !== "1") {
      board.dataset.hotfixDnd = "";
      patchKanbanBoard();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(patchKanbanBoard, 500);

  function ensureNoneChip() {
    var el = document.getElementById("chipsAssignee");
    if (!el) return;
    if (el.querySelector('[data-v="none"]')) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.k = "assignee";
    btn.dataset.v = "none";
    btn.textContent = "Sem responsável";
    el.insertBefore(btn, el.firstChild);
    log("Sem responsável chip inserted");
  }
  setInterval(ensureNoneChip, 2000);

  var st = document.createElement("style");
  st.textContent =
    ".status-menu,.assignee-menu{position:fixed!important;z-index:10060!important;max-height:min(60vh,calc(100vh - 72px))!important;overflow-y:auto!important;}" +
    ".status-menu.hidden,.assignee-menu.hidden{display:none!important}" +
    ".modal-card.is-fs{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:10040!important;border-radius:0!important;margin:0!important}" +
    ".kanban-card.dragging{opacity:.55;outline:2px dashed #67e8f9}" +
    ".kanban-col-body.drag-over{background:rgba(59,130,246,.15)!important;outline:2px dashed #67e8f9}";
  document.head.appendChild(st);
  log("css injected");
})();
