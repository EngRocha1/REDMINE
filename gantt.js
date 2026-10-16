/* HEMOPI Gantt loader — monta gantt.js a partir de gantt.part0-3.b64 (mesmo origin) */
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
    el.innerHTML = "<div style='max-width:520px'><h1 style='color:#f87171;margin:0 0 12px'>Gantt — falha ao carregar</h1><p style='color:#94a3b8'>" + msg + "</p><p style='color:#64748b;font-size:12px'>Rode: bash INSTALL_GANTT.sh && npm run proxy</p></div>";
    document.body.appendChild(el);
  }

  function decodeB64(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function run() {
    try {
      var total = 0;
      for (var i = 0; i < N; i++) total += parts[i].length;
      var all = new Uint8Array(total);
      var off = 0;
      for (var j = 0; j < N; j++) {
        all.set(parts[j], off);
        off += parts[j].length;
      }
      var src = new TextDecoder("utf-8").decode(all);
      if (src.indexOf("openIssueDetail") < 0) {
        fail("Fonte incompleta (sem openIssueDetail). Rode INSTALL_GANTT.sh");
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
    fetch("gantt.part" + i + ".b64?v=20261016", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " em gantt.part" + i + ".b64");
        return r.text();
      })
      .then(function (t) {
        parts[i] = decodeB64(t.trim());
        left--;
        if (left === 0) run();
      })
      .catch(function (e) {
        fail(String(e && e.message ? e.message : e));
      });
  }

  for (var k = 0; k < N; k++) loadOne(k);
})();
