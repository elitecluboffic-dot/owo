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
      'Cache-Control': 'no-cache'
    }
  });
};

function generatePreviewPage(data, createdDate) {
  const escapedHtml = escapeForJson(data.html || '');
  const escapedCss  = escapeForJson(data.css  || '');
  const escapedJs   = escapeForJson(data.js   || '');

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

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

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

  #clock {
    color: var(--green);
    font-size: 12px;
    text-shadow: 0 0 6px var(--green);
  }

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
    gap: 0;
  }

  /* CODE PANEL */
  #code-panel {
    width: 48%;
    display: flex;
    flex-direction: column;
    border-right: 2px solid var(--border);
    background: var(--dark);
    min-width: 200px;
    resize: horizontal;
    overflow: hidden;
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

  .tab.active {
    color: var(--tab-active);
    background: var(--dark);
    text-shadow: 0 0 8px var(--green);
  }

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

  /* CODE EDITOR */
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
    color: var(--green);
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    overflow-y: auto;
    white-space: pre;
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--green-dim) var(--darker);
  }

  .code-area::-webkit-scrollbar { width: 6px; height: 6px; }
  .code-area::-webkit-scrollbar-track { background: var(--darker); }
  .code-area::-webkit-scrollbar-thumb { background: var(--green-dim); border-radius: 3px; }

  /* syntax highlight colors */
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

  .btn-run {
    color: var(--green);
    border-color: var(--green);
  }
  .btn-run:hover {
    background: var(--green);
    color: var(--darker);
    box-shadow: 0 0 12px var(--green);
  }

  .btn-copy {
    color: var(--cyan);
    border-color: var(--cyan);
  }
  .btn-copy:hover {
    background: var(--cyan);
    color: var(--darker);
    box-shadow: 0 0 12px var(--cyan);
  }

  .btn-clear {
    color: var(--red);
    border-color: var(--red);
  }
  .btn-clear:hover {
    background: var(--red);
    color: #fff;
    box-shadow: 0 0 12px var(--red);
  }

  .char-count {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-dim);
  }

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

  .preview-status {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
  }

  .preview-status.ok  { color: var(--green); }
  .preview-status.err { color: var(--red);   }

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
    top: 50%;
    left: 50%;
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

  .log-line   { color: var(--green);   }
  .error-line { color: var(--red);     }
  .warn-line  { color: var(--amber);   }
  .info-line  { color: var(--cyan);    }
  .sys-line   { color: var(--text-dim);}

  /* FULLSCREEN */
  .btn-fullscreen {
    color: var(--amber);
    border-color: var(--amber);
  }
  .btn-fullscreen:hover {
    background: var(--amber);
    color: var(--darker);
    box-shadow: 0 0 12px var(--amber);
  }

  /* SCROLLBAR GLOBAL */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--darker); }
  ::-webkit-scrollbar-thumb { background: var(--green-dim); }

  /* MOBILE */
  @media (max-width: 768px) {
    #main { flex-direction: column; }
    #code-panel { width: 100%; height: 50%; border-right: none; border-bottom: 2px solid var(--border); }
    .resize-handle { display: none; }
  }
</style>
</head>
<body>

<!-- TOP BAR -->
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

<!-- META BAR -->
<div id="metabar">
  <span class="meta-item">🆔 <span>${data.id}</span></span>
  <span class="meta-item">📅 <span>${createdDate} WIB</span></span>
  <span class="meta-item">👁️ <span id="view-count">${data.views}</span> views</span>
  <span class="meta-item">📏 HTML:<span>${(data.html || '').length}</span> CSS:<span>${(data.css || '').length}</span> JS:<span>${(data.js || '').length}</span> chars</span>
</div>

<!-- MAIN AREA -->
<div id="main">

  <!-- CODE PANEL -->
  <div id="code-panel">
    <!-- TABS -->
    <div class="tabs">
      <button class="tab tab-html active" onclick="switchTab('html', this)">🌐 HTML</button>
      <button class="tab tab-css"         onclick="switchTab('css', this)">🎨 CSS</button>
      <button class="tab tab-js"          onclick="switchTab('js', this)">⚡ JS</button>
    </div>

    <!-- HTML PANE -->
    <div id="pane-html" class="code-pane active">
      <div class="line-numbers" id="ln-html"></div>
      <textarea class="code-area html" id="code-html" spellcheck="false" placeholder="<!-- HTML code here -->">${escapeHtml(data.html || '')}</textarea>
    </div>

    <!-- CSS PANE -->
    <div id="pane-css" class="code-pane">
      <div class="line-numbers" id="ln-css"></div>
      <textarea class="code-area css" id="code-css" spellcheck="false" placeholder="/* CSS code here */">${escapeHtml(data.css || '')}</textarea>
    </div>

    <!-- JS PANE -->
    <div id="pane-js" class="code-pane">
      <div class="line-numbers" id="ln-js"></div>
      <textarea class="code-area js" id="code-js" spellcheck="false" placeholder="// JavaScript code here">${escapeHtml(data.js || '')}</textarea>
    </div>

    <!-- ACTION BAR -->
    <div class="action-bar">
      <button class="btn btn-run"       onclick="runPreview()">▶ RUN</button>
      <button class="btn btn-copy"      onclick="copyCode()">⎘ COPY</button>
      <button class="btn btn-clear"     onclick="clearConsole()">✕ CLEAR LOG</button>
      <button class="btn btn-fullscreen" onclick="toggleFullscreen()">⛶ FULLSCREEN</button>
      <span class="char-count" id="char-count">0 chars</span>
    </div>
  </div>

  <!-- RESIZE HANDLE -->
  <div class="resize-handle" id="resize-handle"></div>

  <!-- PREVIEW PANEL -->
  <div id="preview-panel">
    <div class="preview-header">
      <span>▶ PREVIEW</span>
      <span id="preview-url" style="color: var(--text-dim); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px;">localhost/preview</span>
      <div class="preview-status ok" id="preview-status">
        <span class="status-dot"></span> READY
      </div>
    </div>
    <iframe id="preview-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-modals" title="Preview"></iframe>
  </div>

</div>

<!-- CONSOLE PANEL -->
<div id="console-panel">
  <div class="console-header" onclick="toggleConsole()">
    <span>⌨ CONSOLE</span>
    <span id="console-toggle" style="margin-left: auto;">▼</span>
  </div>
  <div id="console-output">
    <div class="sys-line">[ OwoBim Preview Console — ${data.id} ]</div>
    <div class="sys-line">[ By: ${escapeHtml(data.ownerName)} | ${createdDate} WIB ]</div>
  </div>
</div>

<script>
// ── DATA ──
const INITIAL_HTML = ${JSON.stringify(escapedHtml)};
const INITIAL_CSS  = ${JSON.stringify(escapedCss)};
const INITIAL_JS   = ${JSON.stringify(escapedJs)};

// ── INIT ──
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('code-html').value = INITIAL_HTML;
  document.getElementById('code-css').value  = INITIAL_CSS;
  document.getElementById('code-js').value   = INITIAL_JS;

  updateLineNumbers('html');
  updateLineNumbers('css');
  updateLineNumbers('js');
  updateCharCount();

  runPreview();

  // Clock
  setInterval(() => {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('id-ID', { hour12: false });
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

  // Resize
  initResize();
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
  const ta = document.getElementById('code-' + lang);
  const ln = document.getElementById('ln-' + lang);
  const lines = (ta.value.split('\\n').length || 1);
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
function runPreview() {
  const html = document.getElementById('code-html').value;
  const css  = document.getElementById('code-css').value;
  const js   = document.getElementById('code-js').value;

  const statusEl = document.getElementById('preview-status');
  statusEl.className = 'preview-status ok';
  statusEl.innerHTML = '<span class="status-dot"></span> RUNNING...';

  const fullHtml = buildHtml(html, css, js);
  const frame    = document.getElementById('preview-frame');

  // Intercept console from iframe
  const consoleScript = \`
    <script>
      const origLog   = console.log.bind(console);
      const origError = console.error.bind(console);
      const origWarn  = console.warn.bind(console);
      const origInfo  = console.info.bind(console);
      const send = (type, args) => {
        window.parent.postMessage({ type: 'console', level: type, msg: args.map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); }
        }).join(' ') }, '*');
      };
      console.log   = (...a) => { origLog(...a);   send('log',   a); };
      console.error = (...a) => { origError(...a); send('error', a); };
      console.warn  = (...a) => { origWarn(...a);  send('warn',  a); };
      console.info  = (...a) => { origInfo(...a);  send('info',  a); };
      window.onerror = (msg, src, line, col) => {
        window.parent.postMessage({ type: 'console', level: 'error', msg: '[Runtime Error] ' + msg + ' (line ' + line + ')' }, '*');
      };
    <\\/script>
  \`;

  const blobContent = fullHtml.replace('</head>', consoleScript + '</head>');
  const blob = new Blob([blobContent], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);

  frame.onload = () => {
    statusEl.className = 'preview-status ok';
    statusEl.innerHTML = '<span class="status-dot"></span> READY';
    URL.revokeObjectURL(url);
  };

  frame.onerror = () => {
    statusEl.className = 'preview-status err';
    statusEl.innerHTML = '<span class="status-dot"></span> ERROR';
  };

  frame.src = url;
  document.getElementById('preview-url').textContent = 'data:preview/' + new Date().toISOString().slice(11,19);
  appendConsole('sys', '▶ Preview refreshed at ' + new Date().toLocaleTimeString('id-ID'));
}

function buildHtml(html, css, js) {
  return \`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>\${css}</style>
</head>
<body>
\${html}
<script>\${js}<\\/script>
</body>
</html>\`;
}

// ── CONSOLE ──
window.addEventListener('message', (e) => {
  if (e.data?.type === 'console') {
    appendConsole(e.data.level, e.data.msg);
  }
});

function appendConsole(level, msg) {
  const out  = document.getElementById('console-output');
  const line = document.createElement('div');
  const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const prefix = { log: '▸', error: '✖', warn: '⚠', info: 'ℹ', sys: '□' }[level] || '▸';
  line.className = level + '-line';
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
  const panel   = document.getElementById('console-panel');
  const toggle  = document.getElementById('console-toggle');
  const output  = document.getElementById('console-output');
  consoleVisible = !consoleVisible;
  output.style.display  = consoleVisible ? '' : 'none';
  toggle.textContent    = consoleVisible ? '▼' : '▲';
  panel.style.height    = consoleVisible ? '120px' : '28px';
}

// ── COPY ──
function copyCode() {
  const ta = document.getElementById('code-' + currentTab);
  navigator.clipboard.writeText(ta.value).then(() => {
    appendConsole('sys', '✓ ' + currentTab.toUpperCase() + ' code copied to clipboard!');
  });
}

// ── FULLSCREEN ──
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

// ── RESIZE ──
function initResize() {
  const handle     = document.getElementById('resize-handle');
  const codePanel  = document.getElementById('code-panel');
  const main       = document.getElementById('main');
  let isResizing   = false;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor   = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const rect  = main.getBoundingClientRect();
    const pct   = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    codePanel.style.width = clamped + '%';
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor    = '';
    document.body.style.userSelect = '';
  });
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
<title>404 — Preview Not Found</title>
<style>
  body { background: #000800; color: #00ff41; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 16px; }
  h1 { font-size: 48px; text-shadow: 0 0 20px #00ff41; }
  p  { color: #005500; }
  a  { color: #00ff41; }
</style>
</head>
<body>
  <h1>[ 404 ]</h1>
  <p>Preview not found or has expired (30 days).</p>
  <a href="/">← Back</a>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeForJson(str) {
  return String(str).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t');
}
