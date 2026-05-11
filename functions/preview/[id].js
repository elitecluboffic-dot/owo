// functions/preview/[id].js — Cloudflare Pages Function
// VERSI FINAL — fix root cause: unicode escape di JSON payload

export const onRequestGet = async ({ params, env }) => {
  const id = params.id;
  if (!id) return new Response('Preview ID required', { status: 400 });

  const raw = await env.USERS_KV.get(`codepreview:${id}`);
  if (!raw) {
    return new Response(notFoundPage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 404
    });
  }

  const data = JSON.parse(raw);
  data.views = (data.views || 0) + 1;
  await env.USERS_KV.put(`codepreview:${id}`, JSON.stringify(data), {
    expirationTtl: 86400 * 30
  });

  const createdDate = new Date(data.createdAt).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  });

  return new Response(generatePreviewPage(data, createdDate), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-cache'
    }
  });
};

// ─────────────────────────────────────────────────────────────
// jsonForHtml(obj)
// Escape semua karakter yang bisa merusak konteks HTML/JS:
//   lt   ->  \u003c   (cegah tag script ditutup HTML parser)
//   gt   ->  \u003e
//   amp  ->  \u0026
//   sq   ->  \u0027   (cegah putusnya single-quoted JS string)  <- FIX UTAMA
//   bt   ->  \u0060   (cegah putusnya template literal)
// ─────────────────────────────────────────────────────────────
function jsonForHtml(obj) {
  return JSON.stringify(obj)
    .replace(/\\/g,  '\\\\')   // harus PERTAMA sebelum escape lain
    .replace(/</g,   '\\u003c')
    .replace(/>/g,   '\\u003e')
    .replace(/&/g,   '\\u0026')
    .replace(/'/g,   '\\u0027')
    .replace(/`/g,   '\\u0060');
}

function generatePreviewPage(data, createdDate) {
  const safeJson = jsonForHtml({
    html: data.html || '',
    css:  data.css  || '',
    js:   data.js   || ''
  });

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>💻 ${escapeHtml(data.title)} — OwoBim Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --green: #00ff41;
    --green-dim: #00aa2b;
    --green-glow: #00ff4155;
    --dark: #000d00;
    --darker: #000800;
    --mid: #001a00;
    --border: #00ff4133;
    --amber: #ffb000;
    --red: #ff2222;
    --cyan: #00ffff;
    --text-dim: #005500;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--darker);
    color: var(--green);
    font-family: 'Share Tech Mono', monospace;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #topbar {
    background: var(--dark);
    border-bottom: 1px solid var(--border);
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    box-shadow: 0 0 20px var(--green-glow);
  }
  .topbar-left { display: flex; align-items: center; gap: 12px; }
  .logo {
    font-family: 'Orbitron', monospace;
    font-size: 13px;
    color: var(--green);
    text-shadow: 0 0 10px var(--green);
    letter-spacing: 2px;
  }
  .separator { color: var(--text-dim); }
  .preview-title {
    color: var(--amber); font-size: 13px;
    text-shadow: 0 0 8px var(--amber);
    max-width: 300px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .topbar-right {
    display: flex; align-items: center;
    gap: 16px; font-size: 11px; color: var(--text-dim);
  }
  .status-dot {
    width: 8px; height: 8px; background: var(--green);
    border-radius: 50%; display: inline-block;
    box-shadow: 0 0 8px var(--green);
    animation: pulse 2s infinite; margin-right: 4px;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  #clock { color: var(--green); font-size: 12px; text-shadow: 0 0 6px var(--green); }

  #metabar {
    background: var(--mid); border-bottom: 1px solid var(--border);
    padding: 5px 16px; display: flex; align-items: center;
    gap: 20px; font-size: 11px; color: var(--text-dim);
    flex-shrink: 0; flex-wrap: wrap;
  }
  .meta-item span { color: var(--green-dim); }

  #main { display: flex; flex: 1; overflow: hidden; }

  #code-panel {
    width: 48%; display: flex; flex-direction: column;
    border-right: 2px solid var(--border);
    background: var(--dark); min-width: 180px; max-width: 80%;
  }
  .tabs {
    display: flex; background: var(--darker);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .tab {
    padding: 8px 18px; cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px; border: none; background: transparent;
    color: var(--text-dim); border-right: 1px solid var(--border);
    transition: all .2s; position: relative; letter-spacing: 1px;
  }
  .tab:hover { color: var(--green-dim); background: var(--mid); }
  .tab.active { background: var(--dark); }
  .tab.active::after {
    content: ''; position: absolute;
    bottom: 0; left: 0; right: 0; height: 2px;
  }
  .tab-html.active { color: #ff6b6b; text-shadow: 0 0 8px #ff6b6b; }
  .tab-html.active::after { background: #ff6b6b; box-shadow: 0 0 8px #ff6b6b; }
  .tab-css.active  { color: #6b9fff; text-shadow: 0 0 8px #6b9fff; }
  .tab-css.active::after  { background: #6b9fff; box-shadow: 0 0 8px #6b9fff; }
  .tab-js.active   { color: #ffdf6b; text-shadow: 0 0 8px #ffdf6b; }
  .tab-js.active::after   { background: #ffdf6b; box-shadow: 0 0 8px #ffdf6b; }

  .code-pane { display: none; flex: 1; overflow: hidden; }
  .code-pane.active { display: flex; }
  .line-numbers {
    padding: 12px 8px; text-align: right;
    color: var(--text-dim); font-size: 12px; line-height: 1.6;
    border-right: 1px solid var(--border); user-select: none;
    background: var(--darker); min-width: 40px; overflow: hidden;
  }
  .code-area {
    flex: 1; padding: 12px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px; line-height: 1.6;
    background: transparent; border: none; outline: none;
    resize: none; overflow-y: auto; white-space: pre;
    overflow-x: auto; scrollbar-width: thin;
    scrollbar-color: var(--green-dim) var(--darker);
  }
  .code-area::-webkit-scrollbar { width: 6px; height: 6px; }
  .code-area::-webkit-scrollbar-track { background: var(--darker); }
  .code-area::-webkit-scrollbar-thumb { background: var(--green-dim); border-radius: 3px; }
  .code-area.html { color: #ff9999; }
  .code-area.css  { color: #9fb3ff; }
  .code-area.js   { color: #ffe08a; }

  .action-bar {
    background: var(--darker); border-top: 1px solid var(--border);
    padding: 6px 12px; display: flex; align-items: center;
    gap: 8px; flex-shrink: 0; flex-wrap: wrap;
  }
  .btn {
    padding: 4px 14px; font-family: 'Share Tech Mono', monospace;
    font-size: 11px; cursor: pointer; border: 1px solid;
    border-radius: 2px; background: transparent;
    transition: all .2s; letter-spacing: 1px;
  }
  .btn-run         { color: var(--green); border-color: var(--green); }
  .btn-run:hover   { background: var(--green);  color: var(--darker); box-shadow: 0 0 12px var(--green); }
  .btn-copy        { color: var(--cyan);  border-color: var(--cyan);  }
  .btn-copy:hover  { background: var(--cyan);   color: var(--darker); box-shadow: 0 0 12px var(--cyan); }
  .btn-clear       { color: var(--red);   border-color: var(--red);   }
  .btn-clear:hover { background: var(--red);    color: #fff;          box-shadow: 0 0 12px var(--red); }
  .btn-fs          { color: var(--amber); border-color: var(--amber); }
  .btn-fs:hover    { background: var(--amber);  color: var(--darker); box-shadow: 0 0 12px var(--amber); }
  .char-count { margin-left: auto; font-size: 10px; color: var(--text-dim); }

  #preview-panel { flex: 1; display: flex; flex-direction: column; background: var(--dark); min-width: 180px; }
  .preview-header {
    background: var(--darker); border-bottom: 1px solid var(--border);
    padding: 8px 14px; display: flex; align-items: center;
    gap: 10px; font-size: 11px; color: var(--text-dim); flex-shrink: 0;
  }
  #preview-url {
    color: var(--text-dim); font-size: 10px;
    overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; max-width: 260px;
  }
  .preview-status { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 10px; }
  .preview-status.ok  { color: var(--green); }
  .preview-status.err { color: var(--red); }
  #preview-frame { flex: 1; border: none; width: 100%; background: #fff; }

  .resize-handle {
    width: 6px; background: var(--border); cursor: col-resize;
    flex-shrink: 0; position: relative; transition: background .2s;
  }
  .resize-handle:hover { background: var(--green-dim); }
  .resize-handle::after {
    content: '⠿'; position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%); color: var(--green-dim); font-size: 14px;
  }

  #console-panel {
    background: var(--darker); border-top: 2px solid var(--border);
    height: 120px; display: flex; flex-direction: column;
    flex-shrink: 0; transition: height .2s;
  }
  .console-header {
    background: var(--dark); border-bottom: 1px solid var(--border);
    padding: 4px 14px; font-size: 11px; color: var(--text-dim);
    display: flex; align-items: center; gap: 8px;
    cursor: pointer; user-select: none;
  }
  .console-header:hover { color: var(--green-dim); }
  #console-output {
    flex: 1; overflow-y: auto; padding: 6px 14px;
    font-size: 11px; line-height: 1.6;
    scrollbar-width: thin; scrollbar-color: var(--green-dim) var(--darker);
  }
  .log-line   { color: var(--green); }
  .error-line { color: var(--red); }
  .warn-line  { color: var(--amber); }
  .info-line  { color: var(--cyan); }
  .sys-line   { color: var(--text-dim); }

  @media (max-width: 768px) {
    #main { flex-direction: column; }
    #code-panel { width: 100% !important; height: 50%; border-right: none; border-bottom: 2px solid var(--border); }
    .resize-handle { display: none; }
    #metabar { gap: 10px; }
  }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--darker); }
  ::-webkit-scrollbar-thumb { background: var(--green-dim); }
</style>
</head>
<body>

<div id="topbar">
  <div class="topbar-left">
    <span class="logo">[ OWOBIM ]</span>
    <span class="separator">//</span>
    <span class="preview-title">${escapeHtml(data.title)}</span>
  </div>
  <div class="topbar-right">
    <span><span class="status-dot"></span> LIVE PREVIEW</span>
    <span>BY: ${escapeHtml(data.ownerName)}</span>
    <span id="clock">--:--:--</span>
  </div>
</div>

<div id="metabar">
  <span class="meta-item">🆔 <span>${escapeHtml(data.id)}</span></span>
  <span class="meta-item">📅 <span>${createdDate} WIB</span></span>
  <span class="meta-item">👁️ <span>${data.views}</span> views</span>
  <span class="meta-item">📏 HTML:<span>${(data.html||'').length}</span> CSS:<span>${(data.css||'').length}</span> JS:<span>${(data.js||'').length}</span> chars</span>
</div>

<div id="main">
  <div id="code-panel">
    <div class="tabs">
      <button class="tab tab-html active" onclick="switchTab('html',this)">🌐 HTML</button>
      <button class="tab tab-css"         onclick="switchTab('css', this)">🎨 CSS</button>
      <button class="tab tab-js"          onclick="switchTab('js',  this)">⚡ JS</button>
    </div>
    <div id="pane-html" class="code-pane active">
      <div class="line-numbers" id="ln-html"></div>
      <textarea class="code-area html" id="code-html" spellcheck="false" placeholder="&lt;!-- HTML --&gt;"></textarea>
    </div>
    <div id="pane-css" class="code-pane">
      <div class="line-numbers" id="ln-css"></div>
      <textarea class="code-area css" id="code-css" spellcheck="false" placeholder="/* CSS */"></textarea>
    </div>
    <div id="pane-js" class="code-pane">
      <div class="line-numbers" id="ln-js"></div>
      <textarea class="code-area js" id="code-js" spellcheck="false" placeholder="// JS"></textarea>
    </div>
    <div class="action-bar">
      <button class="btn btn-run"   onclick="runPreview()">▶ RUN</button>
      <button class="btn btn-copy"  onclick="copyCode()">⎘ COPY</button>
      <button class="btn btn-clear" onclick="clearConsole()">✕ CLEAR LOG</button>
      <button class="btn btn-fs"    onclick="toggleFullscreen()">⛶ FULLSCREEN</button>
      <span class="char-count" id="char-count">0 chars</span>
    </div>
  </div>

  <div class="resize-handle" id="resize-handle"></div>

  <div id="preview-panel">
    <div class="preview-header">
      <span>▶ PREVIEW</span>
      <span id="preview-url">blob:preview</span>
      <div class="preview-status ok" id="preview-status">
        <span class="status-dot"></span> READY
      </div>
    </div>
    <iframe
      id="preview-frame"
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      title="Preview"
    ></iframe>
  </div>
</div>

<div id="console-panel">
  <div class="console-header" onclick="toggleConsole()">
    <span>⌨ CONSOLE</span>
    <span id="console-toggle" style="margin-left:auto">▼</span>
  </div>
  <div id="console-output">
    <div class="sys-line">[ OwoBim Preview Console — ${escapeHtml(data.id)} ]</div>
    <div class="sys-line">[ By: ${escapeHtml(data.ownerName)} | ${createdDate} WIB ]</div>
  </div>
</div>

<script>
// ─── INJECT DATA — assign langsung sebagai JS object, bukan JSON.parse(string) ───
// safeJson sudah escape semua karakter berbahaya termasuk single-quote, backtick, lt, gt, amp
// sehingga aman ditaruh di dalam <script> tag tanpa pembungkus string apapun.
var _d = ${safeJson};
var INITIAL_HTML = _d.html;
var INITIAL_CSS  = _d.css;
var INITIAL_JS   = _d.js;

window.addEventListener('DOMContentLoaded', function() {
  document.getElementById('code-html').value = INITIAL_HTML;
  document.getElementById('code-css').value  = INITIAL_CSS;
  document.getElementById('code-js').value   = INITIAL_JS;

  ['html','css','js'].forEach(function(lang) {
    updateLineNumbers(lang);
    var ta = document.getElementById('code-' + lang);
    ta.addEventListener('input',   function() { updateLineNumbers(lang); updateCharCount(); });
    ta.addEventListener('scroll',  function() { syncScroll(lang); });
    ta.addEventListener('keydown', handleTab);
  });

  updateCharCount();
  runPreview();

  setInterval(function() {
    document.getElementById('clock').textContent =
      new Date().toLocaleTimeString('id-ID', { hour12: false });
  }, 1000);

  initResize();

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'console') {
      appendConsole(e.data.level, e.data.msg);
    }
  });
});

var currentTab = 'html';
function switchTab(lang, btn) {
  currentTab = lang;
  document.querySelectorAll('.code-pane').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('pane-' + lang).classList.add('active');
  btn.classList.add('active');
  updateLineNumbers(lang);
  updateCharCount();
}

function updateLineNumbers(lang) {
  var ta    = document.getElementById('code-' + lang);
  var ln    = document.getElementById('ln-' + lang);
  var count = ta.value.split('\n').length || 1;
  var arr   = [];
  for (var i = 1; i <= count; i++) arr.push(i);
  ln.innerHTML = arr.join('<br>');
}
function syncScroll(lang) {
  document.getElementById('ln-' + lang).scrollTop =
    document.getElementById('code-' + lang).scrollTop;
}
function updateCharCount() {
  var ta = document.getElementById('code-' + currentTab);
  document.getElementById('char-count').textContent =
    ((ta && ta.value) ? ta.value.length : 0) + ' chars';
}
function handleTab(e) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  var ta = e.target, s = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = s + 2;
  updateLineNumbers(currentTab);
}

function runPreview() {
  var html = document.getElementById('code-html').value;
  var css  = document.getElementById('code-css').value;
  var js   = document.getElementById('code-js').value;

  var statusEl = document.getElementById('preview-status');
  statusEl.className = 'preview-status ok';
  statusEl.innerHTML = '<span class="status-dot"></span> RUNNING...';

  var ic = [
    '<script>',
    '(function(){',
    'var s=function(lv,a){try{window.parent.postMessage({type:"console",level:lv,',
    'msg:Array.prototype.slice.call(a).map(function(x){',
    'try{return typeof x==="object"?JSON.stringify(x):String(x);}catch(e){return String(x);}',
    '}).join(" ")},"*");}catch(e){}};',
    '["log","error","warn","info"].forEach(function(m){',
    'var o=console[m].bind(console);',
    'console[m]=function(){o.apply(console,arguments);s(m,arguments);};});',
    'window.onerror=function(msg,src,line){s("error",["[Error] "+msg+" (line "+line+")"]);return false;};',
    'window.addEventListener("unhandledrejection",function(e){s("error",["[Promise] "+(e.reason||e)]);});',
    '})();',
    '<' + '/script>'
  ].join('\n');

  var parts = [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1.0">',
    ic,
    '<style>',
    css,
    '</style>',
    '</head>',
    '<body>',
    html,
    '<script>',
    js,
    '<' + '/script>',
    '</body>',
    '</html>'
  ];
  var fullHtml = parts.join('\n');

  var frame = document.getElementById('preview-frame');
  if (frame._blobUrl) { try { URL.revokeObjectURL(frame._blobUrl); } catch(e) {} }

  var blob = new Blob([fullHtml], { type: 'text/html' });
  frame._blobUrl = URL.createObjectURL(blob);

  frame.onload  = function() {
    statusEl.className = 'preview-status ok';
    statusEl.innerHTML = '<span class="status-dot"></span> READY';
  };
  frame.onerror = function() {
    statusEl.className = 'preview-status err';
    statusEl.innerHTML = '<span class="status-dot"></span> ERROR';
  };

  frame.src = frame._blobUrl;
  document.getElementById('preview-url').textContent =
    'blob:preview@' + new Date().toLocaleTimeString('id-ID');
  appendConsole('sys', '▶ Refreshed at ' + new Date().toLocaleTimeString('id-ID'));
}

function appendConsole(level, msg) {
  var out    = document.getElementById('console-output');
  var line   = document.createElement('div');
  var time   = new Date().toLocaleTimeString('id-ID', { hour12: false });
  var map    = { log:'▸', error:'✖', warn:'⚠', info:'ℹ', sys:'□' };
  line.className   = (level || 'log') + '-line';
  line.textContent = '[' + time + '] ' + (map[level] || '▸') + ' ' + msg;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}
function clearConsole() {
  document.getElementById('console-output').innerHTML =
    '<div class="sys-line">[ Console cleared ]</div>';
}
var consoleVisible = true;
function toggleConsole() {
  var panel  = document.getElementById('console-panel');
  var output = document.getElementById('console-output');
  var toggle = document.getElementById('console-toggle');
  consoleVisible = !consoleVisible;
  output.style.display = consoleVisible ? '' : 'none';
  toggle.textContent   = consoleVisible ? '▼' : '▲';
  panel.style.height   = consoleVisible ? '120px' : '28px';
}
function copyCode() {
  var ta = document.getElementById('code-' + currentTab);
  if (!ta) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value).then(function() {
      appendConsole('sys', '✓ ' + currentTab.toUpperCase() + ' copied!');
    });
  } else {
    ta.select();
    document.execCommand('copy');
    appendConsole('sys', '✓ ' + currentTab.toUpperCase() + ' copied! (fallback)');
  }
}
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function(){});
  } else {
    document.exitFullscreen().catch(function(){});
  }
}
function initResize() {
  var handle    = document.getElementById('resize-handle');
  var codePanel = document.getElementById('code-panel');
  var main      = document.getElementById('main');
  var resizing  = false;
  function start() {
    resizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.getElementById('preview-frame').style.pointerEvents = 'none';
  }
  function stop() {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.getElementById('preview-frame').style.pointerEvents = '';
  }
  function move(x) {
    if (!resizing) return;
    var rect = main.getBoundingClientRect();
    var pct  = ((x - rect.left) / rect.width) * 100;
    codePanel.style.width = Math.max(20, Math.min(80, pct)) + '%';
  }
  handle.addEventListener('mousedown', start);
  document.addEventListener('mousemove', function(e) { move(e.clientX); });
  document.addEventListener('mouseup', stop);
  handle.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', function(e) { move(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchend', stop);
}
</script>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>404 — Not Found</title>
<style>
  body { background:#000800; color:#00ff41; font-family:monospace;
    display:flex; align-items:center; justify-content:center;
    height:100vh; flex-direction:column; gap:16px; }
  h1 { font-size:48px; text-shadow:0 0 20px #00ff41; }
  p  { color:#005500; }
  a  { color:#00ff41; text-decoration:none; }
  a:hover { text-shadow:0 0 8px #00ff41; }
</style>
</head>
<body>
  <h1>[ 404 ]</h1>
  <p>Preview tidak ditemukan atau sudah expired (30 hari).</p>
  <a href="/">← Kembali</a>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
