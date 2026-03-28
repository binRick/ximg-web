const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const LOGS_DIR = '/logs';
const PORT     = 3000;

const LOG_FILES = {
  ximg:      'ximg.access.log',
  linux:     'linux.access.log',
  butterfly: 'butterfly.access.log',
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
      min-height:100vh;display:flex;flex-direction:column;overflow:hidden}
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
    .log-line{display:grid;grid-template-columns:180px 90px 55px 1fr;gap:.5rem;
      padding:.1rem .25rem;border-radius:3px;transition:background .15s;white-space:nowrap;overflow:hidden}
    .log-line:hover{background:rgba(255,255,255,.03)}
    .log-line.new{animation:flashIn .4s ease}
    @keyframes flashIn{from{background:rgba(0,255,65,.08)}to{background:transparent}}
    .col-ts{color:var(--dim);overflow:hidden;text-overflow:ellipsis}
    .col-ip{color:#79c0ff}
    .col-path{color:var(--text);overflow:hidden;text-overflow:ellipsis}
    .s2xx{color:#00ff41}.s3xx{color:#06b6d4}.s4xx{color:#facc15}.s5xx{color:#ff7b72}.s0{color:var(--dim)}
    .raw-line{color:var(--dim);font-size:.75rem;padding:.1rem .25rem}
    .connecting{color:var(--dim);padding:1rem;animation:blink2 1s step-end infinite}
    @keyframes blink2{0%,100%{opacity:1}50%{opacity:.3}}
  </style>
</head>
<body>
  <script src="/nav.js"></script>

  <div class="toolbar">
    <button class="tab active" data-site="ximg">ximg.app</button>
    <button class="tab"        data-site="linux">linux.ximg.app</button>
    <button class="tab"        data-site="butterfly">butterfly.ximg.app</button>
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
      container.appendChild(el);
      while (container.children.length > MAX_LINES) container.removeChild(container.firstChild);
      container.scrollTop = container.scrollHeight;
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
  </script>
</body>
</html>`;

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (req.url === '/nav.js') {
    try {
      const js = fs.readFileSync('/app/nav.js', 'utf8');
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
