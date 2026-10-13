/* TEMP — use curl restore until full push lands */
(function(){
  console.error('[Gantt] Baixe o arquivo completo: curl -sL https://raw.githubusercontent.com/EngRocha1/REDMINE/ed365ee418e6ced65c319d0c0987ac4e7f508973/gantt.js -o gantt.js');
  document.addEventListener('DOMContentLoaded', function(){
    var d=document.createElement('div');
    d.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#e8eef7;font:14px system-ui;padding:24px;text-align:center';
    d.innerHTML='<div><h1 style="color:#06b6d4">Gantt</h1><p>Arquivo incompleto no repositório.</p><p style="color:#94a3b8">No terminal em D:/REDMINE:</p><pre style="background:#121a28;padding:12px;border-radius:8px;text-align:left;overflow:auto">curl -sL "https://raw.githubusercontent.com/EngRocha1/REDMINE/ed365ee418e6ced65c319d0c0987ac4e7f508973/gantt.js" -o gantt.js\nnpm run proxy</pre><p>Depois Ctrl+Shift+R em localhost:8787/gantt.html</p></div>';
    document.body.appendChild(d);
  });
})();
