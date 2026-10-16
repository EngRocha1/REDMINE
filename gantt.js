/* HEMOPI Gantt — loader: monta a partir de gantt.b64.00..16 */
(function () {
  var N = 17;
  var parts = new Array(N);
  var left = N;
  var failed = false;
  function fail(msg) {
    if (failed) return;
    failed = true;
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#e8eef7;font:14px system-ui;padding:24px;text-align:center";
    el.innerHTML = "<div style='max-width:520px'><h1 style='color:#f87171;margin:0 0 12px'>Gantt — falha ao carregar</h1><p style='color:#94a3b8'>" + msg + "</p><p style='color:#64748b;font-size:12px'>git pull origin main</p></div>";
    document.body.appendChild(el);
  }
  function run() {
    try {
      var b64 = parts.join("");
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var src = new TextDecoder("utf-8").decode(bytes);
      if (src.indexOf("openIssueDetail") < 0) {
        fail("Fonte incompleta.");
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
    var name = "gantt.b64." + (i < 10 ? "0" + i : "" + i);
    fetch(name + "?v=20261016e", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " " + name);
        return r.text();
      })
      .then(function (t) {
        parts[i] = t.replace(/\s/g, "");
        left--;
        if (left === 0) run();
      })
      .catch(function (e) {
        fail(String(e && e.message ? e.message : e));
      });
  }
  for (var k = 0; k < N; k++) loadOne(k);
})();
