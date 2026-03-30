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

// ── GeoIP lookup via ip-api.com (free, no key) ───────────────────────────────
const ipGeoCache = new Map(); // ip -> { countryCode, country, city, lat, lon }

function lookupGeo(ip) {
  if (ipGeoCache.has(ip)) return Promise.resolve(ipGeoCache.get(ip));
  return new Promise(resolve => {
    const done = g => { ipGeoCache.set(ip, g); resolve(g); };
    const req = http.get(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=countryCode,country,city,lat,lon`,
      res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const { countryCode = '', country = '', city = '', lat = 0, lon = 0 } = JSON.parse(data);
            done({ countryCode, country, city, lat, lon });
          } catch { done({ countryCode: '', country: '', city: '', lat: 0, lon: 0 }); }
        });
      }
    );
    req.setTimeout(4000, () => { req.destroy(); done({ countryCode: '', country: '', city: '', lat: 0, lon: 0 }); });
    req.on('error', () => done({ countryCode: '', country: '', city: '', lat: 0, lon: 0 }));
  });
}

function ipFromFilename(filename) {
  // filename: YYYYMMDD-HHMMSS-<ip>-<pid>.log  (IPv6 colons replaced with _)
  const parts = filename.replace(/\.log$/, '').split('-');
  return parts.slice(2, -1).join('-').replace(/_/g, ':');
}

const MARIO_SCORES_FILE = '/data/mario-scores.json';

function readScores() {
  try { return JSON.parse(fs.readFileSync(MARIO_SCORES_FILE, 'utf8')); }
  catch (_) { return []; }
}
function writeScores(scores) {
  try { fs.writeFileSync(MARIO_SCORES_FILE, JSON.stringify(scores)); } catch (_) {}
}

const LOG_FILES = {
  ximg:      'ximg.access.log',
  linux:     'linux.access.log',
  butterfly: 'butterfly.access.log',
  ascii:     'ascii.access.log',
  json:      'json.access.log',
  poker:     'poker.access.log',
  mario:     'mario.access.log',
  monkey:    'monkey.access.log',
  doom:      'doom.access.log',
  pizza:     'pizza.access.log',
  docker:    'docker.access.log',
  yaml:      'yaml.access.log',
  kombat:    'kombat.access.log',
  wargames:  'wargames.access.log',
  moto:      'moto.access.log',
  india:     'india.access.log',
  chinese:   'chinese.access.log',
  wood:      'wood.access.log',
  guns:      'guns.access.log',
  america:   'america.access.log',
  florida:   'florida.access.log',
  tampa:     'tampa.access.log',
  computers: 'computers.access.log',
  trump:     'trump.access.log',
  cnc:       'cnc.access.log',
  rx:        'rx.access.log',
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

    .toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:.4rem;padding:.5rem 1rem;
      background:rgba(0,0,0,.3);border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
    .tab{font-size:.75rem;padding:.25rem .65rem;border-radius:6px;cursor:pointer;
      border:1px solid rgba(255,255,255,.08);background:transparent;color:var(--dim);
      font-family:'Courier New',monospace;transition:all .2s;white-space:nowrap}
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
    .ssh-session-name{color:var(--text);word-break:break-all;display:flex;align-items:baseline;gap:.4rem}
    .ssh-flag{font-size:1rem;line-height:1;flex-shrink:0}
    .ssh-session-meta{color:var(--dim);font-size:.68rem;margin-top:1px}
    #ssh-right{flex:1;position:relative;overflow:hidden;display:flex;flex-direction:column}
    #ssh-content{flex:1;overflow-y:auto;padding:1rem;font-size:.76rem;line-height:1.6;
      white-space:pre-wrap;word-break:break-all}
    #ssh-content::-webkit-scrollbar{width:6px}
    #ssh-content::-webkit-scrollbar-track{background:transparent}
    #ssh-content::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
    #ssh-map-widget{position:absolute;top:.75rem;right:.75rem;width:320px;display:none;
      border:1px solid rgba(0,255,65,.45);border-radius:2px;
      box-shadow:0 0 24px rgba(0,255,65,.1),0 0 0 1px rgba(0,255,65,.06);
      background:#010901;overflow:hidden;z-index:5}
    #ssh-map-canvas{display:block;width:320px;height:200px}
    .ssh-placeholder{color:var(--dim);padding:2rem;text-align:center}
    .ssh-empty{color:var(--dim);padding:1rem;font-size:.75rem}
    .log-line{display:grid;grid-template-columns:180px 130px 160px 48px 1fr;gap:.75rem;
      padding:.1rem .25rem;border-radius:3px;transition:background .15s;overflow:hidden}
    .log-line > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .log-line:hover{background:rgba(255,255,255,.03)}
    .log-line.new{animation:flashIn .4s ease}
    @keyframes flashIn{from{background:rgba(0,255,65,.08)}to{background:transparent}}
    .col-ts{color:var(--dim)}
    .col-ip{color:#79c0ff}
    .col-geo{color:#a5b4fc;font-size:.75rem}
    .col-path{color:var(--text)}
    .s2xx{color:#00ff41}.s3xx{color:#06b6d4}.s4xx{color:#facc15}.s5xx{color:#ff7b72}.s0{color:var(--dim)}
    .raw-line{color:var(--dim);font-size:.75rem;padding:.1rem .25rem}
    .connecting{color:var(--dim);padding:1rem;animation:blink2 1s step-end infinite}
    @keyframes blink2{0%,100%{opacity:1}50%{opacity:.3}}
  </style>
</head>
<body>
  <script src="/shared/nav.js?v=2"></script>

  <div class="toolbar">
    <button class="tab active" data-site="ximg">ximg</button>
    <button class="tab"        data-site="linux">linux</button>
    <button class="tab"        data-site="butterfly">butterfly</button>
    <button class="tab"        data-site="ascii">ascii</button>
    <button class="tab"        data-site="json">json</button>
    <button class="tab"        data-site="poker">poker</button>
    <button class="tab"        data-site="mario">mario</button>
    <button class="tab"        data-site="monkey">monkey</button>
    <button class="tab"        data-site="doom">doom</button>
    <button class="tab"        data-site="pizza">pizza</button>
    <button class="tab"        data-site="docker">docker</button>
    <button class="tab"        data-site="yaml">yaml</button>
    <button class="tab"        data-site="kombat">kombat</button>
    <button class="tab"        data-site="wargames">wargames</button>
    <button class="tab"        data-site="moto">moto</button>
    <button class="tab"        data-site="india">india</button>
    <button class="tab"        data-site="chinese">chinese</button>
    <button class="tab"        data-site="wood">wood</button>
    <button class="tab"        data-site="guns">guns</button>
    <button class="tab"        data-site="america">america</button>
    <button class="tab"        data-site="florida">florida</button>
    <button class="tab"        data-site="tampa">tampa</button>
    <button class="tab"        data-site="computers">computers</button>
    <button class="tab"        data-site="trump">trump</button>
    <button class="tab"        data-site="cnc">cnc</button>
    <button class="tab"        data-site="rx">RxFitt</button>
    <button class="tab"        data-site="logs">logs</button>
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
    <div id="ssh-right">
      <div id="ssh-content"><div class="ssh-placeholder">← Select a session to view</div></div>
      <div id="ssh-map-widget"><canvas id="ssh-map-canvas" width="640" height="400"></canvas></div>
    </div>
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

    function countryFlag(code) {
      if (!code || code.length !== 2) return '';
      return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)));
    }

    function geoLabel(data) {
      if (!data.countryCode) return '';
      const flag = countryFlag(data.countryCode);
      const place = data.city ? data.city + ', ' + data.country : (data.country || data.countryCode);
      return flag + ' ' + place;
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
          '<span class="col-geo">' + esc(geoLabel(data))                      + '</span>' +
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
      ws.onerror   = ()  => { try { ws && ws.close(); } catch(_) {} };
    }

    document.querySelectorAll('.tab:not(#ssh-tab)').forEach(btn => {
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
    const sshMapWidget = document.getElementById('ssh-map-widget');
    const sshMapCanvas = document.getElementById('ssh-map-canvas');
    let sshMode = false;
    let mapAnimId = null;

    // ── World map: load Natural Earth 110m topojson, decode to [lon,lat] rings ─
    let worldRings = null;

    async function loadWorldMap() {
      if (worldRings) return worldRings;
      try {
        const topo = JSON.parse(fs.readFileSync(path.join(__dirname, 'vendor/land-110m.json'), 'utf8'));
        const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;

        // Delta-decode arcs → geographic [lon, lat]
        const arcs = topo.arcs.map(arc => {
          let x = 0, y = 0;
          return arc.map(([dx, dy]) => [x += dx, y += dy]).map(([ix, iy]) => [ix * sx + tx, iy * sy + ty]);
        });

        // Build rings from land MultiPolygon (outer ring of every polygon only)
        const rings = [];
        function addGeom(geom) {
          const polys = geom.type === 'MultiPolygon' ? geom.arcs : [geom.arcs];
          polys.forEach(poly => {
            const pts = [];
            poly[0].forEach(i => { // outer ring only
              const arc = i >= 0 ? arcs[i] : [...arcs[~i]].reverse();
              pts.push(...arc);
            });
            if (pts.length) rings.push(pts);
          });
        }
        const land = topo.objects.land;
        if (land.type === 'GeometryCollection') land.geometries.forEach(addGeom);
        else addGeom(land);

        worldRings = rings;
        return rings;
      } catch(e) {
        return [];
      }
    }

    function drawMapFrame(ctx, W, H, lat, lon, phase, rings) {
      // Mercator projection, fitted to canvas height (shows ~±83°)
      const mercMax = Math.log(Math.tan(Math.PI / 4 + 83 * Math.PI / 360));
      function proj(plon, plat) {
        const x = (plon + 180) / 360 * W;
        const latC = Math.max(-83, Math.min(83, plat));
        const mercY = Math.log(Math.tan(Math.PI / 4 + latC * Math.PI / 360));
        const y = H / 2 - (H / (2 * mercMax)) * mercY;
        return [x, y];
      }

      // Background
      ctx.fillStyle = '#010901';
      ctx.fillRect(0, 0, W, H);

      // Graticule grid (every 30°)
      ctx.lineWidth = 0.4;
      ctx.strokeStyle = 'rgba(0,255,65,.07)';
      for (let g = -180; g <= 180; g += 30) {
        const [x] = proj(g, 0);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let g = -80; g <= 80; g += 30) {
        ctx.beginPath();
        for (let lon2 = -180; lon2 <= 180; lon2 += 2) {
          const [x, y] = proj(lon2, g);
          lon2 === -180 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Equator & prime meridian brighter
      ctx.strokeStyle = 'rgba(0,255,65,.2)';
      ctx.lineWidth = 0.6;
      const [mx] = proj(0, 0);
      ctx.beginPath();
      for (let lon2 = -180; lon2 <= 180; lon2 += 2) {
        const [x, y] = proj(lon2, 0);
        lon2 === -180 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, H); ctx.stroke();

      // Land
      ctx.fillStyle = 'rgba(0,255,65,.18)';
      ctx.strokeStyle = 'rgba(0,255,65,.65)';
      ctx.lineWidth = 0.6;
      (rings || []).forEach(ring => {
        ctx.beginPath();
        ring.forEach(([plon, plat], i) => {
          const [x, y] = proj(plon, plat);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // Target
      const [tx2, ty2] = proj(lon, lat);

      // Pulsing rings
      for (let i = 0; i < 3; i++) {
        const p = (phase + i / 3) % 1;
        ctx.strokeStyle = \`rgba(0,255,65,\${(1 - p) * 0.75})\`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(tx2, ty2, p * 18, 0, Math.PI * 2); ctx.stroke();
      }

      // Crosshair
      ctx.strokeStyle = 'rgba(0,255,65,.9)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(tx2 - 22, ty2); ctx.lineTo(tx2 - 5, ty2);
      ctx.moveTo(tx2 + 5,  ty2); ctx.lineTo(tx2 + 22, ty2);
      ctx.moveTo(tx2, ty2 - 22); ctx.lineTo(tx2, ty2 - 5);
      ctx.moveTo(tx2, ty2 + 5);  ctx.lineTo(tx2, ty2 + 22);
      ctx.stroke();

      // Center dot (glowing)
      ctx.shadowColor = '#00ff41';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#00ff41';
      ctx.beginPath(); ctx.arc(tx2, ty2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // Corner brackets
      ctx.strokeStyle = 'rgba(0,255,65,.5)';
      ctx.lineWidth = 1.5;
      const b = 8;
      [[0,0],[W,0],[0,H],[W,H]].forEach(([cx, cy]) => {
        const sx2 = cx === 0 ? 1 : -1, sy2 = cy === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx + sx2 * b, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy2 * b);
        ctx.stroke();
      });

      // Coordinate label
      const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = 'rgba(0,255,65,.8)';
      ctx.textAlign = 'left';
      ctx.fillText(Math.abs(lat).toFixed(2) + '°' + ns + '  ' + Math.abs(lon).toFixed(2) + '°' + ew, 5, H - 5);

      // Title
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(0,255,65,.35)';
      ctx.textAlign = 'center';
      ctx.fillText('THREAT ORIGIN // TACTICAL OVERLAY', W / 2, 8);
      ctx.textAlign = 'left';
    }

    async function startMapAnim(lat, lon) {
      stopMapAnim();
      const rings = await loadWorldMap();
      const ctx = sshMapCanvas.getContext('2d');
      const W = sshMapCanvas.width, H = sshMapCanvas.height;
      let phase = 0;
      // Draw static background once (land doesn't move)
      drawMapFrame(ctx, W, H, lat, lon, 0, rings);
      // Only animate the target overlay on a separate pass
      function frame() {
        drawMapFrame(ctx, W, H, lat, lon, phase, rings);
        phase = (phase + 0.018) % 1;
        mapAnimId = requestAnimationFrame(frame);
      }
      sshMapWidget.style.display = 'block';
      frame();
    }

    function stopMapAnim() {
      if (mapAnimId) { cancelAnimationFrame(mapAnimId); mapAnimId = null; }
      sshMapWidget.style.display = 'none';
    }

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
      stopMapAnim();
      sshTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = '';
      document.querySelector('.stats').style.display = '';
      sshContainer.style.display = 'none';
      logContainer.style.display = '';
    }

    function countryFlag(code) {
      if (!code || code.length !== 2) return '';
      const base = 0x1F1E6 - 65;
      return String.fromCodePoint(code.charCodeAt(0) + base, code.charCodeAt(1) + base);
    }

    const sessionGeo = new Map(); // filename -> {lat, lon}

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
            sessionGeo.set(f.name, { lat: f.lat || 0, lon: f.lon || 0 });
            const el = document.createElement('div');
            el.className = 'ssh-session-item';
            const kb = (f.size / 1024).toFixed(1);
            const flag = f.countryCode ? '<span class="ssh-flag">' + countryFlag(f.countryCode) + '</span>' : '';
            el.innerHTML =
              '<div class="ssh-session-name">' + flag + '<span>' + esc(f.name) + '</span></div>' +
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
        .then(text => {
          sshContent.textContent = text;
          sshContent.scrollTop = 0;
          const geo = sessionGeo.get(filename);
          if (geo && (geo.lat || geo.lon)) startMapAnim(geo.lat, geo.lon);
          else stopMapAnim();
        })
        .catch(() => { sshContent.textContent = 'Failed to load session.'; stopMapAnim(); });
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
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }

  if (req.url === '/ssh-sessions') {
    try {
      const files = fs.readdirSync(SSH_DIR)
        .filter(f => f.endsWith('.log'))
        .sort().reverse()
        .map(f => {
          const st = fs.statSync(path.join(SSH_DIR, f));
          return { name: f, size: st.size, ip: ipFromFilename(f) };
        });
      const uniqueIps = [...new Set(files.map(f => f.ip))];
      await Promise.all(uniqueIps.map(lookupGeo));
      const result = files.map(f => {
        const g = ipGeoCache.get(f.ip) || {};
        return { name: f.name, size: f.size, countryCode: g.countryCode || '', country: g.country || '', city: g.city || '', lat: g.lat || 0, lon: g.lon || 0 };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
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
  if (req.url === '/mario-scores') {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

    if (req.method === 'GET') {
      const top = readScores().sort((a, b) => b.score - a.score).slice(0, 10);
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(top)); return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 512) req.destroy(); });
      req.on('end', () => {
        try {
          const { initials, score } = JSON.parse(body);
          if (!/^[A-Z0-9]{1,3}$/.test(String(initials)) ||
              !Number.isFinite(score) || score < 0 || score > 999999) {
            res.writeHead(400, cors); res.end(); return;
          }
          const scores = readScores();
          scores.push({ initials: String(initials), score: Math.floor(score), ts: new Date().toISOString() });
          scores.sort((a, b) => b.score - a.score);
          writeScores(scores.slice(0, 200));
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (_) { res.writeHead(400, cors); res.end(); }
      });
      return;
    }
    res.writeHead(405, cors); res.end(); return;
  }

  if (req.url.startsWith('/shared/nav.js')) {
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

  const send = async line => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      const parsed = parseLine(line);
      if (parsed.ip) {
        const geo = await lookupGeo(parsed.ip);
        parsed.countryCode = geo.countryCode;
        parsed.country = geo.country;
        parsed.city = geo.city;
      }
      ws.send(JSON.stringify(parsed));
    } catch (_) {}
  };

  // Replay last 100 lines on connect
  lastLines(logFile, 100).forEach(send);

  const stop = tailFile(logFile, send);
  ws.on('close', stop);
  ws.on('error', stop);
});

server.listen(PORT, () => console.log('logs server listening on :' + PORT));
