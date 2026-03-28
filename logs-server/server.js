const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const LOGS_DIR   = '/logs';
const SSH_DIR    = '/ssh-logs';
const PORT       = 3000;

function stripAnsi(s) {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
          .replace(/\x1B[()][AB012]/g, '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');
}

const LOG_FILES = {
  ximg:      'ximg.access.log',
  linux:     'linux.access.log',
  butterfly: 'butterfly.access.log',
  ascii:     'ascii.access.log',
  json:      'json.access.log',
  poker:     'poker.access.log',
  logs:      'logs.access.log',
};

// ── Read last N lines from end of file ───────────────────────────────────────
function lastLines(filePath, n) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.size) return [];
    const chunkSize = Math.min(65536, stat.size);
    const buf = Buffer.alloc(chunkSize);
    const fd  = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, chunkSize, stat.size - chunkSize);
    fs.closeSync(fd);
    return buf.toString('utf8').split('\n').filter(l => l.trim()).slice(-n);
  } catch (_) { return []; }
}

// ── Tail a file, call onLine for each new line ───────────────────────────────
function tailFile(filePath, onLine) {
  let pos = 0;
  try { pos = fs.statSync(filePath).size; } catch (_) {}

  function read() {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size < pos) pos = 0;
      if (stat.size === pos) return;
      const fd  = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - pos);
      fs.readSync(fd, buf, 0, buf.length, pos);
      fs.closeSync(fd);
      pos = stat.size;
      buf.toString('utf8').split('\n').forEach(l => { if (l.trim()) onLine(l); });
    } catch (_) {}
  }

  let watcher = null;
  try { watcher = fs.watch(filePath, read); watcher.on('error', () => {}); } catch (_) {}
  const interval = setInterval(read, 1000);
  return () => { try { watcher && watcher.close(); } catch (_) {} clearInterval(interval); };
}

// ── Parse nginx combined log line ────────────────────────────────────────────
function parseLine(raw) {
  const m = raw.match(
    /^(\S+)\s+-\s+-\s+\[([^\]]+)\]\s+"([^"]+)"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"/
  );
  if (!m) return { raw };
  const [, ip, ts, req, status, bytes, ref, ua] = m;
  const [method, urlPath] = req.split(' ');
  return { ip, ts, method, path: urlPath, status: +status, bytes: +bytes, ref, ua };
}

// ── HTML ─────────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>logs.ximg.app</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%230d1117'/><text x='16' y='22' font-size='18' text-anchor='middle' fill='%2300ff41' font-family='monospace' font-weight='bold'>▶</text></svg>">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0d1117;--green:#00ff41;--dim:#484f58;--text:#c9d1d9}
    body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;
      height:100vh;display:flex;flex-direction:column;overflow:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:100;
      background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)}

    .toolbar{display:flex;align-items:center;gap:.5rem;padding:.6rem 1.5rem;
      background:rgba(0,0,0,.3);border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
    .tab{font-size:.8rem;padding:.3rem .9rem;border-radius:6px;cursor:pointer;
      border:1px solid rgba(255,255,255,.08);background:transparent;color:var(--dim);
      font-family:'Courier New',monospace;transition:all .2s}
    .tab.active{color:var(--green);border-color:rgba(0,255,65,.4);background:rgba(0,255,65,.07)}
    .tab:hover:not(.active){color:var(--text);border-color:rgba(255,255,255,.15)}
    .stats{margin-left:auto;display:flex;gap:1.25rem;font-size:.75rem;color:var(--dim)}
    .stat-val{color:var(--text)}
    #pause-btn{font-size:.75rem;padding:.25rem .7rem;border-radius:5px;cursor:pointer;
      border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);
      color:var(--dim);font-family:'Courier New',monospace;transition:all .2s}
    #pause-btn:hover{color:var(--text);border-color:rgba(255,255,255,.2)}
    #pause-btn.paused{color:#facc15;border-color:rgba(250,204,21,.4);background:rgba(250,204,21,.07)}

    #log-container{flex:1;overflow-y:auto;padding:.75rem 1rem 1rem;font-size:.78rem;
      line-height:1.7;scroll-behavior:smooth}
    #log-container::-webkit-scrollbar{width:6px}
    #log-container::-webkit-scrollbar-track{background:transparent}
    #log-container::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}

    #ssh-container{flex:1;overflow:hidden;display:none;flex-direction:row}
    #ssh-list{width:280px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.06);
      overflow-y:auto;padding:.5rem}
    #ssh-list::-webkit-scrollbar{width:4px}
    #ssh-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
    .ssh-session-item{padding:.45rem .7rem;border-radius:5px;cursor:pointer;font-size:.75rem;
      border:1px solid transparent;transition:all .15s;margin-bottom:3px}
    .ssh-session-item:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)}
    .ssh-session-item.active{background:rgba(0,255,65,.06);border-color:rgba(0,255,65,.3);color:var(--green)}
    .ssh-session-name{color:var(--text);word-break:break-all}
    .ssh-session-meta{color:var(--dim);font-size:.68rem;margin-top:1px}
    #ssh-content{flex:1;overflow-y:auto;padding:1rem;font-size:.76rem;line-height:1.6;
      white-space:pre-wrap;word-break:break-all}
    #ssh-content::-webkit-scrollbar{width:6px}
    #ssh-content::-webkit-scrollbar-track{background:transparent}
    #ssh-content::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
    .ssh-placeholder{color:var(--dim);padding:2rem;text-align:center}
    .ssh-empty{color:var(--dim);padding:1rem;font-size:.75rem}
    .log-line{display:grid;grid-template-columns:180px 130px 48px 1fr;gap:.75rem;
      padding:.1rem .25rem;border-radius:3px;transition:background .15s;overflow:hidden}
    .log-line > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .log-line:hover{background:rgba(255,255,255,.03)}
    .log-line.new{animation:flashIn .4s ease}
    @keyframes flashIn{from{background:rgba(0,255,65,.08)}to{background:transparent}}
    .col-ts{color:var(--dim)}
    .col-ip{color:#79c0ff}
    .col-path{color:var(--text)}
    .s2xx{color:#00ff41}.s3xx{color:#06b6d4}.s4xx{color:#facc15}.s5xx{color:#ff7b72}.s0{color:var(--dim)}
    .raw-line{color:var(--dim);font-size:.75rem;padding:.1rem .25rem}
    .connecting{color:var(--dim);padding:1rem;animation:blink2 1s step-end infinite}
    @keyframes blink2{0%,100%{opacity:1}50%{opacity:.3}}
  </style>
</head>
<body>
  <script src="/shared/nav.js"></script>

  <div class="toolbar">
    <button class="tab active" data-site="ximg">ximg.app</button>
    <button class="tab"        data-site="linux">linux.ximg.app</button>
    <button class="tab"        data-site="butterfly">butterfly.ximg.app</button>
    <button class="tab"        data-site="ascii">ascii.ximg.app</button>
    <button class="tab"        data-site="json">json.ximg.app</button>
    <button class="tab"        data-site="poker">poker.ximg.app</button>
    <button class="tab"        data-site="logs">logs.ximg.app</button>
    <button class="tab" id="ssh-tab">ssh sessions</button>
    <div class="stats">
      <span>total <span class="stat-val" id="st-total">0</span></span>
      <span>2xx <span class="stat-val s2xx" id="st-2xx">0</span></span>
      <span>3xx <span class="stat-val s3xx" id="st-3xx">0</span></span>
      <span>4xx <span class="stat-val s4xx" id="st-4xx">0</span></span>
      <span>5xx <span class="stat-val s5xx" id="st-5xx">0</span></span>
    </div>
    <button id="pause-btn">⏸ pause</button>
  </div>

  <div id="log-container">
    <div class="connecting">connecting…</div>
  </div>

  <div id="ssh-container">
    <div id="ssh-list"><div class="ssh-empty">Loading sessions…</div></div>
    <div id="ssh-content"><div class="ssh-placeholder">← Select a session to view</div></div>
  </div>

  <script>
    const MAX_LINES = 500;
    let currentSite = 'ximg';
    let ws = null;
    let paused = false;
    let reconnectTimer = null;
    const stats = { total:0, '2xx':0, '3xx':0, '4xx':0, '5xx':0 };

    const container = document.getElementById('log-container');
    const stTotal   = document.getElementById('st-total');
    const st2xx     = document.getElementById('st-2xx');
    const st3xx     = document.getElementById('st-3xx');
    const st4xx     = document.getElementById('st-4xx');
    const st5xx     = document.getElementById('st-5xx');

    function esc(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function statusClass(s) {
      if (!s) return 's0';
      if (s < 300) return 's2xx';
      if (s < 400) return 's3xx';
      if (s < 500) return 's4xx';
      return 's5xx';
    }

    function addLine(data) {
      if (paused) return;
      if (container.querySelector('.connecting')) container.innerHTML = '';
      const el = document.createElement('div');
      if (data.path) {
        const sc = statusClass(data.status);
        el.className = 'log-line new';
        el.innerHTML =
          '<span class="col-ts">'  + esc(data.ts)                             + '</span>' +
          '<span class="col-ip">'  + esc(data.ip)                             + '</span>' +
          '<span class="' + sc + '">' + esc(data.status)                      + '</span>' +
          '<span class="col-path">' + esc((data.method||'') + ' ' + (data.path||'')) + '</span>';
        stats.total++;
        const key = Math.floor(data.status / 100) + 'xx';
        if (stats[key] !== undefined) stats[key]++;
        stTotal.textContent = stats.total;
        st2xx.textContent = stats['2xx']; st3xx.textContent = stats['3xx'];
        st4xx.textContent = stats['4xx']; st5xx.textContent = stats['5xx'];
      } else {
        el.className = 'raw-line';
        el.textContent = data.raw || '';
      }
      container.prepend(el);
      while (container.children.length > MAX_LINES) container.removeChild(container.lastChild);
    }

    function connect(site) {
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
      container.innerHTML = '<div class="connecting">connecting…</div>';
      stats.total = stats['2xx'] = stats['3xx'] = stats['4xx'] = stats['5xx'] = 0;
      stTotal.textContent = st2xx.textContent = st3xx.textContent = st4xx.textContent = st5xx.textContent = '0';

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host + '/ws?site=' + site);

      ws.onmessage = e => { try { addLine(JSON.parse(e.data)); } catch(_) {} };
      ws.onclose   = ()  => { reconnectTimer = setTimeout(() => connect(site), 3000); };
      ws.onerror   = ()  => { ws.close(); };
    }

    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSite = btn.dataset.site;
        connect(currentSite);
      });
    });

    document.getElementById('pause-btn').addEventListener('click', function() {
      paused = !paused;
      this.textContent = paused ? '▶ resume' : '⏸ pause';
      this.classList.toggle('paused', paused);
    });

    connect(currentSite);

    // ── SSH session viewer ────────────────────────────────────────────────────
    const sshTab       = document.getElementById('ssh-tab');
    const sshContainer = document.getElementById('ssh-container');
    const logContainer = document.getElementById('log-container');
    const sshList      = document.getElementById('ssh-list');
    const sshContent   = document.getElementById('ssh-content');
    let sshMode = false;

    function enterSshMode() {
      sshMode = true;
      sshTab.classList.add('active');
      document.querySelectorAll('.tab:not(#ssh-tab)').forEach(b => b.classList.remove('active'));
      document.getElementById('pause-btn').style.display = 'none';
      document.querySelector('.stats').style.display = 'none';
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      logContainer.style.display = 'none';
      sshContainer.style.display = 'flex';
      loadSshSessions();
    }

    function leaveSshMode() {
      sshMode = false;
      sshTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = '';
      document.querySelector('.stats').style.display = '';
      sshContainer.style.display = 'none';
      logContainer.style.display = '';
    }

    function loadSshSessions() {
      sshList.innerHTML = '<div class="ssh-empty">Loading…</div>';
      fetch('/ssh-sessions')
        .then(r => r.json())
        .then(files => {
          if (!files.length) {
            sshList.innerHTML = '<div class="ssh-empty">No sessions yet.</div>';
            return;
          }
          sshList.innerHTML = '';
          files.forEach(f => {
            const el = document.createElement('div');
            el.className = 'ssh-session-item';
            const kb = (f.size / 1024).toFixed(1);
            el.innerHTML =
              '<div class="ssh-session-name">' + esc(f.name) + '</div>' +
              '<div class="ssh-session-meta">' + kb + ' KB</div>';
            el.addEventListener('click', () => {
              document.querySelectorAll('.ssh-session-item').forEach(i => i.classList.remove('active'));
              el.classList.add('active');
              loadSession(f.name);
            });
            sshList.appendChild(el);
          });
        })
        .catch(() => { sshList.innerHTML = '<div class="ssh-empty">Failed to load sessions.</div>'; });
    }

    function loadSession(filename) {
      sshContent.textContent = 'Loading…';
      fetch('/ssh-session?file=' + encodeURIComponent(filename))
        .then(r => r.text())
        .then(text => { sshContent.textContent = text; sshContent.scrollTop = 0; })
        .catch(() => { sshContent.textContent = 'Failed to load session.'; });
    }

    sshTab.addEventListener('click', () => {
      if (!sshMode) enterSshMode();
    });

    document.querySelectorAll('.tab:not(#ssh-tab)').forEach(btn => {
      btn.addEventListener('click', () => {
        if (sshMode) leaveSshMode();
      });
    });
  </script>
</body>
</html>`;

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }

  if (req.url === '/ssh-sessions') {
    try {
      const files = fs.readdirSync(SSH_DIR)
        .filter(f => f.endsWith('.log'))
        .sort().reverse()
        .map(f => { const st = fs.statSync(path.join(SSH_DIR, f)); return { name: f, size: st.size }; });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
    } catch (_) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); }
    return;
  }

  const sm = req.url.match(/^\/ssh-session\?file=([^&]+)$/);
  if (sm) {
    const filename = decodeURIComponent(sm[1]);
    if (!/^[\w.-]+\.log$/.test(filename)) { res.writeHead(400); res.end(); return; }
    try {
      const raw = fs.readFileSync(path.join(SSH_DIR, filename), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(stripAnsi(raw));
    } catch (_) { res.writeHead(404); res.end(); }
    return;
  }
  if (req.url === '/shared/nav.js') {
    try {
      const js = fs.readFileSync('/app/shared/nav.js', 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(js);
    } catch (_) { res.writeHead(404); res.end(); }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const site    = new URL(req.url, 'http://x').searchParams.get('site') || 'ximg';
  const logFile = path.join(LOGS_DIR, LOG_FILES[site] || LOG_FILES.ximg);

  const send = line => {
    if (ws.readyState !== ws.OPEN) return;
    try { ws.send(JSON.stringify(parseLine(line))); } catch (_) {}
  };

  // Replay last 100 lines on connect
  lastLines(logFile, 100).forEach(send);

  const stop = tailFile(logFile, send);
  ws.on('close', stop);
  ws.on('error', stop);
});

server.listen(PORT, () => console.log('logs server listening on :' + PORT));
