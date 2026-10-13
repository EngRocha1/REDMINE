/* HEMOPI Gantt — use o arquivo do chat (gantt-update.zip) ou:
   curl -sL https://cdn.jsdelivr.net/gh/EngRocha1/REDMINE@ed365ee418e6ced65c319d0c0987ac4e7f508973/gantt.js -o gantt.js
   Depois aplique as correções locais descritas no README.
*/
(function () {
  console.error("[Gantt] Substitua este gantt.js pelo arquivo completo (gantt-update.zip no chat ou ed365ee + patch).");
  document.addEventListener("DOMContentLoaded", function () {
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#e8eef7;font:14px system-ui;padding:24px;text-align:center";
    el.innerHTML = "<div style='max-width:520px'><h1 style='color:#06b6d4'>Gantt</h1><p>O <code>gantt.js</code> no GitHub main ainda n\u00e3o tem o bin\u00e1rio completo (limite de push).</p><p style='color:#94a3b8'>No D:/REDMINE, copie o <b>gantt.js</b> e <b>gantt.css</b> enviados no chat (gantt-update.zip), depois:</p><pre style='background:#121a28;padding:12px;border-radius:8px;text-align:left'>npm run proxy</pre><p>Ctrl+Shift+R em localhost:8787/gantt.html</p></div>";
    document.body.appendChild(el);
  });
})();
