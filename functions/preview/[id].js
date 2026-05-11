// functions/preview/[id].js — Cloudflare Pages Function

export const onRequestGet = async ({ params, env }) => {
  const id = params.id;

  if (!id) {
    return new Response('Preview ID required', { status: 400 });
  }

  const raw = await env.USERS_KV.get(`codepreview:${id}`);

  if (!raw) {
    return new Response(notFoundPage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 404
    });
  }

  const data = JSON.parse(raw);

  // Update view count
  data.views = (data.views || 0) + 1;
  await env.USERS_KV.put(`codepreview:${id}`, JSON.stringify(data), {
    expirationTtl: 86400 * 30
  });

  const createdDate = new Date(data.createdAt).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  });

  const html = generatePreviewPage(data, createdDate);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-cache',
      // CSP: iframe sandbox handles isolation, parent page tetap aman
      'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com; frame-src blob:;"
    }
  });
};

// ─────────────────────────────────────────────────────────────
//  GENERATE PREVIEW PAGE
//  FIX UTAMA:
//  1. Tidak pakai escapeForJson — cukup JSON.stringify() langsung
//     karena JSON.stringify sudah handle semua special chars dengan benar
//  2. Iframe sandbox TANPA allow-same-origin supaya script
//     di dalam iframe tidak bisa akses parent/cookies
//  3. postMessage console intercept tetap jalan tanpa allow-same-origin
// ─────────────────────────────────────────────────────────────
function generatePreviewPage(data, createdDate) {

  // FIX: JSON.stringify langsung, tanpa escapeForJson
  // Ini yang bikin double-escape sebelumnya → raw \n muncul di textarea
  const safeHtml = JSON.stringify(data.html || '');
  const safeCss  = JSON.stringify(data.css  || '');
  const safeJs   = JSON.stringify(data.js   || '');

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
    --panel: #001500;
    --border: #00ff4133;
    --amber: #ffb000;
    --red: #ff2222;
    --cyan: #00ffff;
    --blue: #5865f2;
    --text-dim: #005500;
    --tab-active: #00ff41;
    --tab-inactive: #005500;
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

  /* TOP BAR */
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
    color: var(--amber);
    font-size: 13px;
    text-shadow: 0 0 8px var(--amber);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 11px;
    color: var(--text-dim);
  }
  .status-dot {
    width: 8px; height: 8px;
    background: var(--green);
    border-radius: 50%;
    display: inline-block;
    box-shadow: 0 0 8px var(--green);
    animation: pulse 2s infinite;
    margin-right: 4px;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  #clock { color: var(--green); font-size: 12px; text-shadow: 0 0 6px var(--green); }

  /* META BAR */
  #metabar {
    background: var(--mid);
    border-bottom: 1px solid var(--border);
    padding: 5px 16px;
    display: flex;
    align-items: center;
    gap: 20px;
    font-size: 11px;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .meta-item span { color: var(--green-dim); }

  /* MAIN LAYOUT */
  #main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* CODE PANEL */
  #code-panel {
    width: 48%;
    display: flex;
    flex-direction: column;
    border-right: 2px solid var(--border);
    background: var(--dark);
    min-width: 200px;
    max-width: 80%;
  }

  /* TABS */
  .tabs {
    display: flex;
    background: var(--darker);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .tab {
    padding: 8px 18px;
    cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    border: none;
    background: transparent;
    color: var(--tab-inactive);
    border-right: 1px solid var(--border);
    transition: all 0.2s;
    position: relative;
    letter-spacing: 1px;
  }
  .tab:hover { color: var(--green-dim); background: var(--mid); }
  .tab.active { color: var(--tab-active); background: var(--dark); text-shadow: 0 0 8px var(--green); }
  .tab.active::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 2px;
    background: var(--green);
    box-shadow: 0 0 8px var(--green);
  }
  .tab-html.active { color: #ff6b6b; text-shadow: 0 0 8px #ff6b6b; }
  .tab-html.active::after { background: #ff6b6b; box-shadow: 0 0 8px #ff6b6b; }
  .tab-css.active  { color: #6b9fff; text-shadow: 0 0 8px #6b9fff; }
  .tab-css.active::after  { background: #6b9fff; box-shadow: 0 0 8px #6b9fff; }
  .tab-js.active   { color: #ffdf6b; text-shadow: 0 0 8px #ffdf6b; }
  .tab-js.active::after   { background: #ffdf6b; box-shadow: 0 0 8px #ffdf6b; }

  /* CODE PANE */
  .code-pane {
    display: none;
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  .code-pane.active { display: flex; }

  .line-numbers {
    padding: 12px 8px;
    text-align: right;
    color: var(--text-dim);
    font-size: 12px;
    line-height: 1.6;
    border-right: 1px solid var(--border);
    user-select: none;
    background: var(--darker);
    min-width: 40px;
    overflow: hidden;
  }

  .code-area {
    flex: 1;
    padding: 12px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 12px;
    line-height: 1.6;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    overflow-y: auto;
    white-space: pre;
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--green-dim) var(--darker);
    /* READ-ONLY STYLE supaya user tau ini view-mode */
    cursor: text;
  }
  .code-area::-webkit-scrollbar { width: 6px; height: 6px; }
  .code-area::-webkit-scrollbar-track { background: var(--darker); }
  .code-area::-webkit-scrollbar-thumb { background: var(--green-dim); border-radius: 3px; }
  .code-area.html { color: #ff9999; }
  .code-area.css  { color: #9fb3ff; }
  .code-area.js   { color: #ffe08a; }

  /* ACTION BAR */
  .action-bar {
    background: var(--darker);
    border-top: 1px solid var(--border);
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .btn {
    padding: 4px 14px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    cursor: pointer;
    border: 1px solid;
    border-radius: 2px;
    background: transparent;
    transition: all 0.2s;
    letter-spacing: 1px;
  }
  .btn-run    { color: var(--green); border-color: var(--green); }
  .btn-run:hover { background: var(--green); color: var(--darker); box-shadow: 0 0 12px var(--green); }
  .btn-copy   { color: var(--cyan);  border-color: var(--cyan); }
  .btn-copy:hover { background: var(--cyan); color: var(--darker); box-shadow: 0 0 12px var(--cyan); }
  .btn-clear  { color: var(--red);   border-color: var(--red); }
  .btn-clear:hover { background: var(--red); color: #fff; box-shadow: 0 0 12px var(--red); }
  .btn-fullscreen { color: var(--amber); border-color: var(--amber); }
  .btn-fullscreen:hover { background: var(--amber); color: var(--darker); box-shadow: 0 0 12px var(--amber); }
  .char-count { margin-left: auto; font-size: 10px; color: var(--text-dim); }

  /* PREVIEW PANEL */
  #preview-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--dark);
    min-width: 200px;
  }
  .preview-header {
    background: var(--darker);
    border-bottom: 1px solid var(--border);
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .preview-url-text {
    color: var(--text-dim);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 300px;
  }
  .preview-status { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 10px; }
  .preview-status.ok  { color: var(--green); }
  .preview-status.err { color: var(--red); }

  #preview-frame {
    flex: 1;
    border: none;
    width: 100%;
    background: #fff;
  }

  /* RESIZE HANDLE */
  .resize-handle {
    width: 6px;
    background: var(--border);
    cursor: col-resize;
    flex-shrink: 0;
    position: relative;
    transition: background 0.2s;
  }
  .resize-handle:hover { background: var(--green-dim); }
  .resize-handle::after {
    content: '⠿';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    color: var(--green-dim);
    font-size: 14px;
  }

  /* CONSOLE */
  #console-panel {
    background: var(--darker);
    border-top: 2px solid var(--border);
    height: 120px;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .console-header {
    background: var(--dark);
    border-bottom: 1px solid var(--border);
    padding: 4px 14px;
    font-size: 11px;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }
  .console-header:hover { color: var(--green-dim); }
  #console-output {
    flex: 1;
    overflow-y: auto;
    padding: 6px 14px;
    font-size: 11px;
    line-height: 1.6;
    scrollbar-width: thin;
    scrollbar-color: var(--green-dim) var(--darker);
  }
  .log-line   { color: var(--green); }
  .error-line { color: var(--red); }
  .warn-line  { color: var(--amber); }
  .info-line  { color: var(--cyan); }
  .sys-line   { color: var(--text-dim); }

  /* MOBILE */
  @media (max-width: 768px) {
    #main { flex-direction: column; }
    #code-panel { width: 100% !important; height: 50%; border-right: none; border-bottom: 2px solid var(--border); }
    .resize-handle { display: none; }
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
  <span class="meta-item">👁️ <span id="view-count">${data.views}</span> views</span>
  <span class="meta-item">📏 HTML:<span>${(data.html || '').length}</span> CSS:<span>${(data.css || '').length}</span> JS:<span>${(data.js || '').length}</span> chars</span>
</div>

<div id="main">

  <div id="code-panel">
    <div class="tabs">
      <button class="tab tab-html active" onclick="switchTab('html', this)">🌐 HTML</button>
      <button class="tab tab-css"         onclick="switchTab('css',  this)">🎨 CSS</button>
      <button class="tab tab-js"          onclick="switchTab('js',   this)">⚡ JS</button>
    </div>

    <div id="pane-html" class="code-pane active">
      <div class="line-numbers" id="ln-html"></div>
      <textarea class="code-area html" id="code-html" spellcheck="false" placeholder="<!-- HTML code here -->"></textarea>
    </div>
    <div id="pane-css" class="code-pane">
      <div class="line-numbers" id="ln-css"></div>
      <textarea class="code-area css" id="code-css" spellcheck="false" placeholder="/* CSS code here */"></textarea>
    </div>
    <div id="pane-js" class="code-pane">
      <div class="line-numbers" id="ln-js"></div>
      <textarea class="code-area js" id="code-js" spellcheck="false" placeholder="// JavaScript code here"></textarea>
    </div>

    <div class="action-bar">
      <button class="btn btn-run"        onclick="runPreview()">▶ RUN</button>
      <button class="btn btn-copy"       onclick="copyCode()">⎘ COPY</button>
      <button class="btn btn-clear"      onclick="clearConsole()">✕ CLEAR LOG</button>
      <button class="btn btn-fullscreen" onclick="toggleFullscreen()">⛶ FULLSCREEN</button>
      <span class="char-count" id="char-count">0 chars</span>
    </div>
  </div>

  <div class="resize-handle" id="resize-handle"></div>

  <div id="preview-panel">
    <div class="preview-header">
      <span>▶ PREVIEW</span>
      <span class="preview-url-text" id="preview-url">blob:preview</span>
      <div class="preview-status ok" id="preview-status">
        <span class="status-dot"></span> READY
      </div>
    </div>
    <!--
      FIX KEAMANAN:
      - HAPUS allow-same-origin dari sandbox
      - Dengan begitu script di dalam iframe TIDAK BISA akses:
        window.parent, document.cookie, localStorage domain utama
      - postMessage dari iframe ke parent TETAP BISA karena itu
        mekanisme cross-origin, bukan same-origin
    -->
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
    <span id="console-toggle" style="margin-left: auto;">▼</span>
  </div>
  <div id="console-output">
    <div class="sys-line">[ OwoBim Preview Console — ${escapeHtml(data.id)} ]</div>
    <div class="sys-line">[ By: ${escapeHtml(data.ownerName)} | ${createdDate} WIB ]</div>
  </div>
</div>

<script>
// ── DATA ──
// FIX: JSON.stringify langsung di server-side (lihat safeHtml/safeCss/safeJs)
// Nilai ini sudah berupa JSON string yang valid, tinggal assign
const INITIAL_HTML = ${safeHtml};
const INITIAL_CSS  = ${safeCss};
const INITIAL_JS   = ${safeJs};

// ── INIT ──
window.addEventListener('DOMContentLoaded', () => {
  // Set nilai textarea dari data asli (sudah di-parse dengan benar)
  document.getElementById('code-html').value = INITIAL_HTML;
  document.getElementById('code-css').value  = INITIAL_CSS;
  document.getElementById('code-js').value   = INITIAL_JS;

  updateLineNumbers('html');
  updateLineNumbers('css');
  updateLineNumbers('js');
  updateCharCount();

  // Auto-run saat halaman dibuka
  runPreview();

  // Clock
  setInterval(() => {
    const now = new Date();
    document.getElementById('clock').textContent =
      now.toLocaleTimeString('id-ID', { hour12: false });
  }, 1000);

  // Textarea events
  ['html','css','js'].forEach(lang => {
    const ta = document.getElementById('code-' + lang);
    ta.addEventListener('input', () => {
      updateLineNumbers(lang);
      updateCharCount();
    });
    ta.addEventListener('scroll', () => syncScroll(lang));
    ta.addEventListener('keydown', handleTab);
  });

  initResize();

  // Terima pesan console dari iframe
  window.addEventListener('message', (e) => {
    // Hanya terima pesan dengan format yang kita kenal
    if (e.data && e.data.type === 'console') {
      appendConsole(e.data.level, e.data.msg);
    }
  });
});

// ── TABS ──
let currentTab = 'html';
function switchTab(lang, btn) {
  currentTab = lang;
  document.querySelectorAll('.code-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('pane-' + lang).classList.add('active');
  btn.classList.add('active');
  updateLineNumbers(lang);
  updateCharCount();
}

// ── LINE NUMBERS ──
function updateLineNumbers(lang) {
  const ta    = document.getElementById('code-' + lang);
  const ln    = document.getElementById('ln-' + lang);
  const lines = ta.value.split('\\n').length || 1;
  ln.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
}

function syncScroll(lang) {
  const ta = document.getElementById('code-' + lang);
  const ln = document.getElementById('ln-' + lang);
  ln.scrollTop = ta.scrollTop;
}

// ── CHAR COUNT ──
function updateCharCount() {
  const ta = document.getElementById('code-' + currentTab);
  document.getElementById('char-count').textContent = (ta?.value?.length || 0) + ' chars';
}

// ── TAB KEY ──
function handleTab(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const ta    = e.target;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 2;
    updateLineNumbers(currentTab);
  }
}

// ── RUN PREVIEW ──
// Cara yang benar: build full HTML → buat Blob URL → set ke iframe src
// Ini aman karena Blob punya origin null, tidak bisa akses domain utama
function runPreview() {
  const html = document.getElementById('code-html').value;
  const css  = document.getElementById('code-css').value;
  const js   = document.getElementById('code-js').value;

  const statusEl = document.getElementById('preview-status');
  statusEl.className = 'preview-status ok';
  statusEl.innerHTML = '<span class="status-dot"></span> RUNNING...';

  // Inject console intercept ke dalam iframe
  // postMessage ke parent tetap jalan meski tanpa allow-same-origin
  const consoleIntercept = \`
<script>
(function() {
  var _send = function(level, args) {
    try {
      window.parent.postMessage({
        type: 'console',
        level: level,
        msg: Array.prototype.slice.call(args).map(function(a) {
          try { return (typeof a === 'object') ? JSON.stringify(a) : String(a); }
          catch(e) { return String(a); }
        }).join(' ')
      }, '*');
    } catch(e) {}
  };
  var _log   = console.log.bind(console);
  var _error = console.error.bind(console);
  var _warn  = console.warn.bind(console);
  var _info  = console.info.bind(console);
  console.log   = function() { _log.apply(console, arguments);   _send('log',   arguments); };
  console.error = function() { _error.apply(console, arguments); _send('error', arguments); };
  console.warn  = function() { _warn.apply(console, arguments);  _send('warn',  arguments); };
  console.info  = function() { _info.apply(console, arguments);  _send('info',  arguments); };
  window.onerror = function(msg, src, line, col) {
    _send('error', ['[Runtime Error] ' + msg + ' (line ' + line + ')']);
    return false;
  };
  window.addEventListener('unhandledrejection', function(e) {
    _send('error', ['[Unhandled Promise] ' + (e.reason || e)]);
  });
})();
<\\/script>\`;

  const fullHtml = buildHtml(html, css, js, consoleIntercept);

  // Revoke URL lama kalau ada
  const frame = document.getElementById('preview-frame');
  if (frame._blobUrl) {
    URL.revokeObjectURL(frame._blobUrl);
  }

  const blob   = new Blob([fullHtml], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  frame._blobUrl = blobUrl;

  frame.onload = () => {
    statusEl.className = 'preview-status ok';
    statusEl.innerHTML = '<span class="status-dot"></span> READY';
  };
  frame.onerror = () => {
    statusEl.className = 'preview-status err';
    statusEl.innerHTML = '<span class="status-dot"></span> ERROR';
  };

  frame.src = blobUrl;
  document.getElementById('preview-url').textContent =
    'blob:preview@' + new Date().toLocaleTimeString('id-ID');
  appendConsole('sys', '▶ Preview refreshed at ' + new Date().toLocaleTimeString('id-ID'));
}

function buildHtml(html, css, js, consoleIntercept) {
  return '<!DOCTYPE html>\\n' +
    '<html>\\n<head>\\n' +
    '<meta charset="UTF-8">\\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\\n' +
    consoleIntercept + '\\n' +
    '<style>' + css + '</style>\\n' +
    '</head>\\n<body>\\n' +
    html + '\\n' +
    '<script>' + js + '<\\/script>\\n' +
    '</body>\\n</html>';
}

// ── CONSOLE ──
function appendConsole(level, msg) {
  const out    = document.getElementById('console-output');
  const line   = document.createElement('div');
  const time   = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const prefix = { log: '▸', error: '✖', warn: '⚠', info: 'ℹ', sys: '□' }[level] || '▸';
  line.className   = (level || 'log') + '-line';
  line.textContent = '[' + time + '] ' + prefix + ' ' + msg;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function clearConsole() {
  document.getElementById('console-output').innerHTML =
    '<div class="sys-line">[ Console cleared ]</div>';
}

let consoleVisible = true;
function toggleConsole() {
  const panel  = document.getElementById('console-panel');
  const toggle = document.getElementById('console-toggle');
  const output = document.getElementById('console-output');
  consoleVisible = !consoleVisible;
  output.style.display = consoleVisible ? '' : 'none';
  toggle.textContent   = consoleVisible ? '▼' : '▲';
  panel.style.height   = consoleVisible ? '120px' : '28px';
}

// ── COPY ──
function copyCode() {
  const ta = document.getElementById('code-' + currentTab);
  navigator.clipboard.writeText(ta.value).then(() => {
    appendConsole('sys', '✓ ' + currentTab.toUpperCase() + ' code copied!');
  }).catch(() => {
    // Fallback untuk browser yang tidak support clipboard API
    ta.select();
    document.execCommand('copy');
    appendConsole('sys', '✓ ' + currentTab.toUpperCase() + ' code copied! (fallback)');
  });
}

// ── FULLSCREEN ──
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ── RESIZE (drag panel) ──
function initResize() {
  const handle    = document.getElementById('resize-handle');
  const codePanel = document.getElementById('code-panel');
  const main      = document.getElementById('main');
  let isResizing  = false;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    // Overlay iframe supaya drag tidak terblokir oleh iframe
    document.getElementById('preview-frame').style.pointerEvents = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const rect    = main.getBoundingClientRect();
    const pct     = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    codePanel.style.width = clamped + '%';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    document.getElementById('preview-frame').style.pointerEvents = '';
  });

  // Touch support
  handle.addEventListener('touchstart', (e) => {
    isResizing = true;
    document.getElementById('preview-frame').style.pointerEvents = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isResizing) return;
    const touch   = e.touches[0];
    const rect    = main.getBoundingClientRect();
    const pct     = ((touch.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    codePanel.style.width = clamped + '%';
  }, { passive: true });

  document.addEventListener('touchend', () => {
    isResizing = false;
    document.getElementById('preview-frame').style.pointerEvents = '';
  });
}
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
//  404 PAGE
// ─────────────────────────────────────────────────────────────
function notFoundPage() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>404 — Preview Not Found</title>
<style>
  body {
    background: #000800;
    color: #00ff41;
    font-family: monospace;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    flex-direction: column;
    gap: 16px;
  }
  h1 { font-size: 48px; text-shadow: 0 0 20px #00ff41; }
  p  { color: #005500; }
  a  { color: #00ff41; text-decoration: none; }
  a:hover { text-shadow: 0 0 8px #00ff41; }
</style>
</head>
<body>
  <h1>[ 404 ]</h1>
  <p>Preview tidak ditemukan atau sudah expired (30 hari).</p>
  <a href="/">← Kembali</a>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
//  escapeHtml: untuk output ke HTML attribute/content (XSS prevention)
//  TIDAK dipakai untuk kode JS — gunakan JSON.stringify() untuk itu
// ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
