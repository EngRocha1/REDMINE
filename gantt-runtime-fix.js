/*! HEMOPI — load by project+version, soft-reset filters, creation-week helper */
(function () {
  "use strict";
  function log() {
    try { console.log.apply(console, ["[GanttFix]"].concat([].slice.call(arguments))); } catch (e) {}
  }
  function cookie(n) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  async function api(method, path) {
    var key = cookie("rd_key");
    var url = cookie("rd_url");
    if (!key || !url) throw new Error("no credentials");
    var r = await fetch(location.origin + "/redmine" + path, {
      method: method,
      headers: {
        "X-Redmine-API-Key": key,
        "X-Redmine-Target": url.replace(/\/$/, ""),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    if (!r.ok) throw new Error(method + " " + path + " " + r.status);
    if (r.status === 204) return {};
    return r.json();
  }
  async function allPages(pathBase) {
    var out = [], offset = 0;
    for (;;) {
      var sep = pathBase.indexOf("?") >= 0 ? "&" : "?";
      var d = await api("GET", pathBase + sep + "limit=100&offset=" + offset);
      var batch = d.issues || d.projects || d.versions || [];
      out = out.concat(batch);
      if (batch.length < 100) break;
      offset += 100;
      if (offset > 3000) break;
    }
    return out;
  }
  function uniq(arr) {
    var s = {}, o = [];
    (arr || []).forEach(function (i) {
      if (!i || s[i.id]) return;
      s[i.id] = 1;
      o.push(i);
    });
    return o;
  }
  async function boot() {
    try {
      try { localStorage.removeItem("hemopi_shared_filters"); } catch (e) {}
      log("cleared shared filters");
      var extra = [];
      var pids = [414, 416, 417, 420, 421, 422, 430, 84];
      for (var i = 0; i < pids.length; i++) {
        try {
          var batch = await allPages(
            "/issues.json?project_id=" + pids[i] + "&subproject_id=*&status_id=*&sort=id:desc"
          );
          log("project", pids[i], batch.length);
          extra = extra.concat(batch);
        } catch (e) {
          log("project fail", pids[i], e.message);
        }
      }
      var vers = [];
      try {
        vers = (await api("GET", "/projects/414/versions.json")).versions || [];
      } catch (e) {}
      for (var v = 0; v < vers.length; v++) {
        try {
          var vb = await allPages("/issues.json?fixed_version_id=" + vers[v].id + "&status_id=*");
          log("version", vers[v].name, vb.length);
          extra = extra.concat(vb);
        } catch (e) {}
      }
      extra = uniq(extra);
      window.__ganttExtraIssues = extra;
      log("extra", extra.length, "has6500", extra.some(function (x) { return x.id === 6500; }));
      if (window.__ganttAllIssues) {
        var seen = {};
        window.__ganttAllIssues.forEach(function (i) { seen[i.id] = 1; });
        extra.forEach(function (i) {
          if (!seen[i.id]) {
            seen[i.id] = 1;
            window.__ganttAllIssues.push(i);
          }
        });
        log("merged", window.__ganttAllIssues.length);
      }
      var btn = document.getElementById("btnRefresh");
      if (btn) setTimeout(function () { btn.click(); }, 500);
    } catch (e) {
      log("error", e);
    }
  }
  function wait() {
    var n = 0;
    var t = setInterval(function () {
      n++;
      if (document.getElementById("fltCount") || n > 50) {
        clearInterval(t);
        boot();
      }
    }, 200);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait);
  else wait();
})();
