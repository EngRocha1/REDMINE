/* HEMOPI Gantt — loader 6 packs */
(function () {
  var N = 6, parts = new Array(N), left = N, failed = false;
  function fail(msg) {
    if (failed) return; failed = true;
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#e8eef7;font:14px system-ui;padding:24px;text-align:center";
    el.innerHTML = "<div style='max-width:520px'><h1 style='color:#f87171'>Gantt — falha ao carregar</h1><p style='color:#94a3b8'>" + msg + "</p><p style='font-size:12px;color:#64748b'>git pull origin main</p></div>";
    document.body.appendChild(el);
  }
  function run() {
    try {
      var bin = atob(parts.join(""));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var src = new TextDecoder("utf-8").decode(bytes);
      if (src.indexOf("openIssueDetail") < 0) { fail("Fonte incompleta"); return; }
      var s = document.createElement("script"); s.text = src;
      document.documentElement.appendChild(s);
    } catch (e) { fail(String(e.message || e)); }
  }
  function loadOne(i) {
    fetch("gantt.pack" + i + ".b64?v=20261016f", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " pack" + i); return r.text(); })
      .then(function (t) { parts[i] = t.replace(/\s/g, ""); left--; if (left === 0) run(); })
      .catch(function (e) { fail(String(e.message || e)); });
  }
  for (var k = 0; k < N; k++) loadOne(k);
})();
