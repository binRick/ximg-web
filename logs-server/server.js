const http = require('http');
const fs   = require('fs');
const path = require('path');

const LOGS_DIR = '/logs';
const PORT     = 3000;

// ── Log file map ─────────────────────────────────────────────────────────────
const LOG_FILES = {
  ximg:  { access: 'ximg.access.log',  error: 'ximg.error.log'  },
  linux: { access: 'linux.access.log', error: 'linux.error.log' },
};

// ── Read the last N lines of a file ──────────────────────────────────────────
function lastLines(filePath, n) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.size) return [];
    // Read up to 64KB from the end — enough for ~200 lines
    const chunkSize = Math.min(65536, stat.size);
    const buf = Buffer.alloc(chunkSize);
    const fd  = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, chunkSize, stat.size - chunkSize);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(l => l.trim());
    return lines.slice(-n);
  } catch (_) { return []; }
}

// ── Tail a file, emit new lines as they arrive ────────────────────────────────
function tailFile(filePath, onLine) {
  let pos = 0;

  function read() {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size < pos) pos = 0; // rotated
      if (stat.size === pos) return;
      const fd  = fs.openSync(filePath, 'r');
      const len = stat.size - pos;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, pos);
      fs.closeSync(fd);
      pos = stat.size;
      buf.toString('utf8').split('\n').forEach(l => { if (l.trim()) onLine(l); });
    } catch (_) {}
  }

  // Start from current EOF so we only stream new lines going forward
  try { pos = fs.statSync(filePath).size; } catch (_) { pos = 0; }

  const watcher  = fs.watch(filePath, read);
  const interval = setInterval(read, 2000);
  return () => { watcher.close(); clearInterval(interval); };
}

// ── Parse a combined-format nginx log line into JSON ─────────────────────────
function parseLine(raw) {
  const m = raw.match(
    /^(\S+)\s+-\s+-\s+\[([^\]]+)\]\s+"([^"]+)"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"/
  );
  if (!m) return { raw };
  const [, ip, ts, req, status, bytes, ref, ua] = m;
  const [method, path, proto] = req.split(' ');
  return { ip, ts, method, path, proto, status: +status, bytes: +bytes, ref, ua, raw };
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

    /* scanlines */
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:100;
      background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)}

    nav{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:.25rem;
      padding:.75rem 1.5rem;background:rgba(13,17,23,.9);backdrop-filter:blur(16px);
      border-bottom:1px solid rgba(0,255,65,.1);flex-shrink:0}
    .nav-brand{font-weight:700;font-size:.95rem;color:var(--text);margin-right:auto}
    .nav-item{display:inline-flex;align-items:center;gap:.45rem;font-size:.85rem;
      font-family:'Courier New',monospace;font-weight:600;text-decoration:none;
      padding:.4rem 1rem;border-radius:6px;transition:all .2s;border:1px solid transparent}
    .nav-item.link{color:var(--text);border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.04)}
    .nav-item.link:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2)}
    .nav-item.active{color:var(--green);background:rgba(0,255,65,.08);border-color:rgba(0,255,65,.3);pointer-events:none}
    .nav-dot{width:7px;height:7px;border-radius:50%;background:var(--green);
      box-shadow:0 0 6px var(--green);animation:pulse 2s ease-in-out infinite;flex-shrink:0}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

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

    .log-line{display:grid;grid-template-columns:180px 60px 55px 1fr;gap:.5rem;
      padding:.1rem .25rem;border-radius:3px;transition:background .15s;white-space:nowrap;overflow:hidden}
    .log-line:hover{background:rgba(255,255,255,.03)}
    .log-line.new{animation:flashIn .4s ease}
    @keyframes flashIn{from{background:rgba(0,255,65,.08)}to{background:transparent}}

    .col-ts    {color:var(--dim);overflow:hidden;text-overflow:ellipsis}
    .col-ip    {color:#79c0ff}
    .col-status{}
    .col-path  {color:var(--text);overflow:hidden;text-overflow:ellipsis}
    .col-ua    {color:var(--dim);overflow:hidden;text-overflow:ellipsis;font-size:.72rem}
    .s2xx{color:#00ff41}.s3xx{color:#06b6d4}.s4xx{color:#facc15}.s5xx{color:#ff7b72}.s0{color:var(--dim)}

    .raw-line{color:var(--dim);font-size:.75rem;padding:.1rem .25rem}

    .empty{color:var(--dim);text-align:center;padding:3rem;font-size:.85rem}
    .connecting{color:var(--dim);padding:1rem;animation:blink2 1s step-end infinite}
    @keyframes blink2{0%,100%{opacity:1}50%{opacity:.3}}
  </style>
</head>
<body>
  <nav>
    <span class="nav-brand">ximg.app</span>
    <a class="nav-item link" href="https://ximg.app"><div class="nav-dot"></div>ximg.app</a>
    <a class="nav-item link" href="https://linux.ximg.app">
      <div class="nav-dot"></div>linux.ximg.app
    </a>
    <span class="nav-item active">
      <div class="nav-dot"></div>logs.ximg.app
    </span>
  </nav>

  <div class="toolbar">
    <button class="tab active" data-site="ximg">ximg.app</button>
    <button class="tab"        data-site="linux">linux.ximg.app</button>
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
    <div class="connecting">connecting to log stream…</div>
  </div>

  <script>
    const MAX_LINES = 500;
    let currentSite = 'ximg';
    let es = null;
    let paused = false;
    const stats = { total:0, '2xx':0, '3xx':0, '4xx':0, '5xx':0 };

    const container  = document.getElementById('log-container');
    const pauseBtn   = document.getElementById('pause-btn');
    const stTotal    = document.getElementById('st-total');
    const st2xx      = document.getElementById('st-2xx');
    const st3xx      = document.getElementById('st-3xx');
    const st4xx      = document.getElementById('st-4xx');
    const st5xx      = document.getElementById('st-5xx');

    function statusClass(s) {
      if (!s) return 's0';
      if (s < 300) return 's2xx';
      if (s < 400) return 's3xx';
      if (s < 500) return 's4xx';
      return 's5xx';
    }

    function addLine(data) {
      if (paused) return;
      const el = document.createElement('div');

      if (data.path) {
        el.className = 'log-line new';
        const sc = statusClass(data.status);
        el.innerHTML =
          '<span class="col-ts">'     + escHtml(data.ts)                        + '</span>' +
          '<span class="col-ip">'     + escHtml(data.ip)                        + '</span>' +
          '<span class="col-status ' + sc + '">' + data.status                 + '</span>' +
          '<span class="col-path">'   + escHtml((data.method||'') + ' ' + (data.path||'')) + '</span>';
      } else {
        el.className = 'raw-line';
        el.textContent = data.raw || JSON.stringify(data);
      }

      container.appendChild(el);

      // prune
      while (container.children.length > MAX_LINES) container.removeChild(container.firstChild);

      // auto-scroll
      container.scrollTop = container.scrollHeight;

      // stats
      if (data.status) {
        stats.total++;
        const key = Math.floor(data.status / 100) + 'xx';
        if (stats[key] !== undefined) stats[key]++;
        stTotal.textContent = stats.total;
        st2xx.textContent   = stats['2xx'];
        st3xx.textContent   = stats['3xx'];
        st4xx.textContent   = stats['4xx'];
        st5xx.textContent   = stats['5xx'];
      }
    }

    function escHtml(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function connect(site) {
      if (es) es.close();
      container.innerHTML = '<div class="connecting">connecting to ' + site + ' log stream…</div>';
      stats.total = stats['2xx'] = stats['3xx'] = stats['4xx'] = stats['5xx'] = 0;
      stTotal.textContent = st2xx.textContent = st3xx.textContent = st4xx.textContent = st5xx.textContent = '0';

      es = new EventSource('/stream?site=' + site);

      es.addEventListener('log', e => {
        if (container.querySelector('.connecting')) container.innerHTML = '';
        try { addLine(JSON.parse(e.data)); } catch(_) {}
      });

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          setTimeout(() => connect(site), 3000);
        }
      };
    }

    // tabs
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSite = btn.dataset.site;
        connect(currentSite);
      });
    });

    // pause
    pauseBtn.addEventListener('click', () => {
      paused = !paused;
      pauseBtn.textContent = paused ? '▶ resume' : '⏸ pause';
      pauseBtn.classList.toggle('paused', paused);
    });

    connect(currentSite);
  </script>
</body>
</html>`;

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname === '/health') {
    res.writeHead(200); res.end('ok'); return;
  }

  if (url.pathname === '/stream') {
    const site = url.searchParams.get('site') || 'ximg';
    const cfg  = LOG_FILES[site] || LOG_FILES.ximg;
    const file = path.join(LOGS_DIR, cfg.access);

    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const send = line => {
      const parsed = parseLine(line);
      res.write(`event: log\ndata: ${JSON.stringify(parsed)}\n\n`);
    };

    // Send last 100 lines immediately so the screen isn't empty on connect
    lastLines(file, 100).forEach(send);

    const stop = tailFile(file, send);

    req.on('close', stop);
    req.on('error', stop);
    return;
  }

  // Serve HTML for all other routes
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(PORT, () => console.log(`logs server listening on :${PORT}`));
