/*! HEMOPI Gantt runtime fix — MV-Api load, filter soft-reset, created_on fallback */
(function () {
  "use strict";
  var LOG = function () {
    try { console.log.apply(console, ["[GanttFix]"].concat([].slice.call(arguments))); } catch (e) {}
  };

  function weekMonday(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = x.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return x;
  }
  function ymd(d) {
    if (!d) return null;
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parseYMD(s) {
    if (!s) return null;
    var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function uniqById(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (i) {
      if (!i || seen[i.id]) return;
      seen[i.id] = true;
      out.push(i);
    });
    return out;
  }
  function getCookie(n) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  async function fetchProjectIssues(api, projectId) {
    var issues = [], offset = 0;
    for (;;) {
      var d = await api("GET", "/issues.json?project_id=" + encodeURIComponent(projectId) +
        "&subproject_id=*&status_id=*&limit=100&offset=" + offset + "&sort=id:desc");
      issues = issues.concat(d.issues || []);
      if (!(d.issues || []).length || (d.issues || []).length < 100) break;
      offset += 100;
      if (offset > 2000) break;
    }
    return issues;
  }
  async function fetchVersionIssues(api, versionId) {
    var issues = [], offset = 0;
    for (;;) {
      var d = await api("GET", "/issues.json?fixed_version_id=" + encodeURIComponent(versionId) +
        "&status_id=*&limit=100&offset=" + offset);
      issues = issues.concat(d.issues || []);
      if (!(d.issues || []).length || (d.issues || []).length < 100) break;
      offset += 100;
      if (offset > 500) break;
    }
    return issues;
  }

  async function bootExpand() {
    try {
      var key = getCookie("rd_key");
      var url = getCookie("rd_url");
      if (!key || !url) { LOG("no credentials"); return; }
      var base = location.origin;
      async function api(method, path) {
        var r = await fetch(base + "/redmine" + path, {
          method: method,
          headers: {
            "X-Redmine-API-Key": key,
            "X-Redmine-Target": url.replace(/\/$/, ""),
            Accept: "application/json",
            "Content-Type": "application/json"
          }
        });
        if (!r.ok) throw new Error(method + " " + path + " " + r.status);
        if (r.status === 204) return {};
        return r.json();
      }

      var extra = [];
      var projectIds = [414, 416, 417, 420, 421, 422, 430, 84];
      for (var i = 0; i < projectIds.length; i++) {
        try {
          var batch = await fetchProjectIssues(api, projectIds[i]);
          LOG("project", projectIds[i], batch.length);
          extra = extra.concat(batch);
        } catch (e) { LOG("project fail", projectIds[i], e.message); }
      }
      var vers = [];
      try { vers = (await api("GET", "/projects/414/versions.json")).versions || []; } catch (e) {}
      for (var vi = 0; vi < vers.length; vi++) {
        try {
          var vb = await fetchVersionIssues(api, vers[vi].id);
          LOG("version", vers[vi].name, vb.length);
          extra = extra.concat(vb);
        } catch (e) {}
      }
      extra = uniqById(extra);
      window.__ganttExtraIssues = extra;
      window.__ganttVersions = vers;
      LOG("extra unique", extra.length, "has6500", extra.some(function (x) { return x.id === 6500; }));

      /* Soft-reset filtros que zeram o board */
      var flt = document.getElementById("fltCount");
      var zero = flt && /^0\s/.test(flt.textContent || "");
      if (zero || extra.length) {
        try { localStorage.removeItem("hemopi_shared_filters"); } catch (e) {}
        LOG("cleared hemopi_shared_filters");
      }

      /* Se gantt expôs allIssues, mescla e re-filtra */
      if (window.__ganttAllIssues && Array.isArray(window.__ganttAllIssues)) {
        var seen = {};
        window.__ganttAllIssues.forEach(function (i) { seen[i.id] = true; });
        extra.forEach(function (i) {
          if (!seen[i.id]) { seen[i.id] = true; window.__ganttAllIssues.push(i); }
        });
        LOG("merged into __ganttAllIssues", window.__ganttAllIssues.length);
      }

      var btn = document.getElementById("btnRefresh");
      if (btn) {
        setTimeout(function () { btn.click(); LOG("refresh clicked"); }, 600);
      }
    } catch (e) {
      LOG("bootExpand error", e);
    }
  }

  function install() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (document.getElementById("fltCount") || tries > 40) {
        clearInterval(t);
        LOG("boot");
        bootExpand();
      }
    }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
