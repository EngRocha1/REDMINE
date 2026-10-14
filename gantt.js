/* HEMOPI Gantt — STUB temporario
 * O arquivo completo (~36KB) nao cabe de forma estavel no push via API.
 * INSTALE LOCALMENTE:
 *   1) Baixe gantt-completo.zip do chat do Grok
 *   2) Extraia em D:/REDMINE (sobrescreve gantt.js, gantt.css, gantt.html)
 *   3) npm run proxy
 *   4) http://localhost:8787/gantt.html  + Ctrl+Shift+R
 *
 * Confira: wc -c gantt.js  deve ser > 30000
 * head -n 1 gantt.js  deve ser: (function () {
 */
(function () {
  function show() {
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#e8eef7;font:14px system-ui;padding:24px;text-align:center";
    el.innerHTML = "<div style='max-width:560px'><h1 style='color:#06b6d4;margin:0 0 12px'>Gantt — arquivo incompleto</h1>" +
      "<p>O <code>gantt.js</code> deste clone ainda e o <b>stub</b> do GitHub.</p>" +
      "<p style='color:#94a3b8'>Baixe <b>gantt-completo.zip</b> no chat do Grok, extraia em <code>D:/REDMINE</code> e rode:</p>" +
      "<pre style='background:#121a28;padding:12px;border-radius:8px;text-align:left'>cd /d/REDMINE\nnpm run proxy</pre>" +
      "<p>Depois <b>Ctrl+Shift+R</b> em <code>localhost:8787/gantt.html</code></p>" +
      "<p style='color:#64748b;font-size:12px'>Confira: <code>wc -c gantt.js</code> deve ser &gt; 30000 e comecar com <code>(function () {</code></p></div>";
    document.body.appendChild(el);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();
