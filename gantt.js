/* HEMOPI Gantt — loader permanente: concatena gantt.src.part0-3.js */
(function () {
  var N = 4;
  var parts = new Array(N);
  var left = N;
  var failed = false;
  function fail(msg) {
    if (failed) return;
    failed = true;
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#e8eef7;font:14px system-ui;padding:24px;text-align:center";
    el.innerHTML = "<div style='max-width:520px'><h1 style='color:#f87171;margin:0 0 12px'>Gantt — falha ao carregar</h1><p style='color:#94a3b8'>" + msg + "</p><p style='color:#64748b;font-size:12px'>git pull && bash INSTALL_GANTT.sh</p></div>";
    document.body.appendChild(el);
  }
  function run() {
    try {
      var src = parts.join("");
      if (src.indexOf("openIssueDetail") < 0) {
        fail("Fonte incompleta. Rode: bash INSTALL_GANTT.sh");
        return;
      }
      var s = document.createElement("script");
      s.text = src;
      document.documentElement.appendChild(s);
    } catch (e) {
      fail(String(e && e.message ? e.message : e));
    }
  }
  function loadOne(i) {
    fetch("gantt.src.part" + i + ".js?v=20261016b", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " gantt.src.part" + i + ".js");
        return r.text();
      })
      .then(function (t) {
        parts[i] = t;
        left--;
        if (left === 0) run();
      })
      .catch(function (e) {
        fail(String(e && e.message ? e.message : e));
      });
  }
  for (var k = 0; k < N; k++) loadOne(k);
})();
