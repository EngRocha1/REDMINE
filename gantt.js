/* HEMOPI Gantt boot — reconstrói a partir de gantt.part*.b64 */
(function () {
  var PARTS = 6;
  var texts = [];
  var done = 0;
  function finish() {
    try {
      var b64 = texts.join("");
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var code = new TextDecoder("utf-8").decode(bytes);
      var s = document.createElement("script");
      s.textContent = code;
      document.head.appendChild(s);
    } catch (e) {
      console.error(e);
      document.body.innerHTML = "<pre style='color:#f87171;padding:24px'>Falha ao carregar Gantt: " + e.message + "</pre>";
    }
  }
  for (var i = 0; i < PARTS; i++) {
    (function (idx) {
      fetch("gantt.part" + idx + ".b64?t=" + Date.now())
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status + " em gantt.part" + idx + ".b64");
          return r.text();
        })
        .then(function (t) {
          texts[idx] = t.trim();
          done++;
          if (done === PARTS) finish();
        })
        .catch(function (e) {
          document.body.innerHTML = "<pre style='color:#f87171;padding:24px'>Falha parte " + idx + ": " + e + "</pre>";
        });
    })(i);
  }
})();
