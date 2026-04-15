const http       = require('http');
const https      = require('https');
const { spawn, execFile } = require('child_process');
const fs         = require('fs');
const path       = require('path');
const url        = require('url');

const PORT     = 3001;
const LOG_FILE = '/data/dockerimagedownloader.log';
let imagesCache = null;

// ── Geo lookup (server-side, avoids browser CORS) ─────────────────────────────
const geoCache = new Map();

function geoLookup(ip) {
  return new Promise((resolve) => {
    if (geoCache.has(ip)) { resolve(geoCache.get(ip)); return; }
    http.get('http://ip-api.com/json/' + encodeURIComponent(ip) + '?fields=countryCode', (r) => {
      let body = '';
      r.on('data', d => { body += d; });
      r.on('end', () => {
        try {
          const code = JSON.parse(body).countryCode || '';
          geoCache.set(ip, code);
          resolve(code);
        } catch (_) { geoCache.set(ip, ''); resolve(''); }
      });
    }).on('error', () => { geoCache.set(ip, ''); resolve(''); });
  });
}

// ── Download log ──────────────────────────────────────────────────────────────
function appendLog(entry) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('[log write error]', e.message);
  }
}

function getImageSizeBytes(image, cb) {
  execFile('docker', ['image', 'inspect', '--format', '{{.Size}}', image], (err, stdout) => {
    cb(err ? 0 : parseInt(stdout.trim(), 10) || 0);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

// ── Validation ────────────────────────────────────────────────────────────────
function validImageRef(ref) {
  if (!ref || typeof ref !== 'string') return false;
  if (ref.length > 256) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/.test(ref);
}

function safeFilename(ref) {
  return ref.replace(/[/:@]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '.tar.gz';
}

// ── In-flight pull tracking ───────────────────────────────────────────────────
// Maps image ref → { status, ttlTimer, pullStarted, pullEnded, ip, sizeMB }
const pulls = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function scheduleCleanup(image) {
  const entry = pulls.get(image);
  if (!entry) return;
  if (entry.ttlTimer) clearTimeout(entry.ttlTimer);
  entry.ttlTimer = setTimeout(() => {
    console.log('[ttl] cleaning up unpulled image:', image);
    appendLog({
      ts:          new Date().toISOString(),
      ip:          entry.ip || '',
      image,
      pullSecs:    entry.pullSecs || 0,
      sizeMB:      entry.sizeMB || 0,
      waitSecs:    null,
      downloadSecs: null,
      outcome:     'ttl_expired',
    });
    execFile('docker', ['rmi', '-f', image], (err) => {
      if (err) console.error('[ttl rmi error]', err.message);
    });
    pulls.delete(image);
  }, TTL_MS);
}

function sendSSE(res, obj) {
  res.write('data: ' + JSON.stringify(obj) + '\n\n');
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── POST /pull ────────────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/pull') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      let image;
      try { image = JSON.parse(body).image; } catch (_) {}

      if (!validImageRef(image)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid image reference' }));
        return;
      }

      const ip = clientIp(req);

      res.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      sendSSE(res, { type: 'start', image });

      const existing = pulls.get(image);
      if (existing && existing.status === 'ready') {
        // Update ip in case it's a different user re-pulling
        existing.ip = ip;
        sendSSE(res, { type: 'log', text: 'Image already cached on server.\n' });
        sendSSE(res, { type: 'done', image });
        res.end();
        return;
      }

      const pullStarted = Date.now();
      const pull = spawn('docker', ['pull', image], { stdio: ['ignore', 'pipe', 'pipe'] });

      pulls.set(image, { status: 'pulling', ip, pullStarted });

      let resClosed = false;
      res.on('close', () => { resClosed = true; });

      const safeWrite = obj => { if (!resClosed) sendSSE(res, obj); };

      pull.stdout.on('data', chunk => safeWrite({ type: 'log', text: chunk.toString() }));
      pull.stderr.on('data', chunk => safeWrite({ type: 'log', text: chunk.toString() }));

      pull.on('close', (code, signal) => {
        const pullSecs = parseFloat(((Date.now() - pullStarted) / 1000).toFixed(1));

        if (code === 0 || (code === null && signal === null)) {
          // Get image size, then mark ready
          getImageSizeBytes(image, (sizeBytes) => {
            const sizeMB = parseFloat((sizeBytes / 1048576).toFixed(1));
            const pullEnded = Date.now();
            pulls.set(image, { status: 'ready', ip, pullStarted, pullEnded, pullSecs, sizeMB });
            scheduleCleanup(image);
            safeWrite({ type: 'done', image });
            if (!resClosed) res.end();
          });
        } else {
          pulls.set(image, { status: 'failed', ip, pullStarted, pullSecs });
          safeWrite({ type: 'error', text: 'docker pull exited (code=' + code + ' signal=' + signal + ')' });
          if (!resClosed) res.end();
        }
      });

      pull.on('error', err => {
        pulls.set(image, { status: 'failed' });
        safeWrite({ type: 'error', text: 'Failed to spawn docker: ' + err.message });
        if (!resClosed) res.end();
      });
    });
    return;
  }

  // ── GET /download ─────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/download') {
    const image = query.image;

    if (!validImageRef(image)) {
      res.writeHead(400);
      res.end('Invalid image reference');
      return;
    }

    const ip = clientIp(req);
    const filename = safeFilename(image);
    const downloadStarted = Date.now();

    const entry = pulls.get(image);
    if (entry && entry.ttlTimer) clearTimeout(entry.ttlTimer);

    const waitSecs = entry && entry.pullEnded
      ? parseFloat(((downloadStarted - entry.pullEnded) / 1000).toFixed(1))
      : null;

    res.writeHead(200, {
      'Content-Type':        'application/gzip',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Transfer-Encoding':   'chunked',
      'X-Accel-Buffering':   'no',
    });

    const save = spawn('docker', ['save', image], { stdio: ['ignore', 'pipe', 'pipe'] });
    const gz   = spawn('gzip',   ['-c'],          { stdio: ['pipe',   'pipe', 'pipe'] });

    save.stdout.pipe(gz.stdin);
    gz.stdout.pipe(res);

    save.stderr.on('data', d => console.error('[save stderr]', d.toString().trim()));
    gz.stderr.on('data',   d => console.error('[gzip stderr]', d.toString().trim()));
    save.on('error', err => { console.error('[save error]', err.message); res.destroy(); });
    gz.on('error',   err => { console.error('[gzip error]', err.message); res.destroy(); });

    res.on('close', () => {
      save.kill();
      gz.kill();

      const downloadSecs = parseFloat(((Date.now() - downloadStarted) / 1000).toFixed(1));

      appendLog({
        ts:           new Date().toISOString(),
        ip:           entry ? (entry.ip || ip) : ip,
        image,
        pullSecs:     entry ? (entry.pullSecs || 0) : 0,
        sizeMB:       entry ? (entry.sizeMB || 0) : 0,
        waitSecs,
        downloadSecs,
        outcome:      'downloaded',
      });

      execFile('docker', ['rmi', '-f', image], (err) => {
        if (err) console.error('[rmi error]', err.message);
        else { pulls.delete(image); console.log('[rmi] cleaned up', image); }
      });
    });
    return;
  }

  // ── GET /status ───────────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/status') {
    const image = query.image;
    if (!validImageRef(image)) { res.writeHead(400); res.end('Invalid image reference'); return; }
    const entry = pulls.get(image);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: entry ? entry.status : 'unknown' }));
    return;
  }

  // ── GET /docker-downloads ─────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/docker-downloads') {
    try {
      const lines = fs.existsSync(LOG_FILE)
        ? fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      const entries = lines.map(l => { try { return JSON.parse(l); } catch(_) { return null; } })
                           .filter(Boolean)
                           .reverse();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entries));
    } catch(e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  // ── GET /logos/:name.svg ──────────────────────────────────────────────────
  if (req.method === 'GET' && pathname.startsWith('/logos/') && pathname.endsWith('.svg')) {
    const name = path.basename(pathname, '.svg').replace(/[^a-z0-9._-]/gi, '');
    const file = path.join(__dirname, 'logos', name + '.svg');
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public,max-age=86400' });
      res.end(fs.readFileSync(file));
    } else {
      res.writeHead(404); res.end();
    }
    return;
  }

  // ── GET /api/images ───────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/images') {
    const cached = imagesCache;
    if (cached && Date.now() - cached.ts < 3600000) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public,max-age=3600' });
      res.end(JSON.stringify(cached.data));
      return;
    }

    function hubGet(urlStr) {
      return new Promise((resolve, reject) => {
        https.get(urlStr, { headers: { 'User-Agent': 'dockerimage.dev/1.0' } }, (r) => {
          let body = '';
          r.on('data', d => { body += d; });
          r.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
        }).on('error', reject);
      });
    }

    async function fetchAll() {
      // Paginate all official library images
      let libraryImages = [];
      let nextUrl = 'https://hub.docker.com/v2/repositories/library/?page_size=100&ordering=-pull_count';
      while (nextUrl) {
        const data = await hubGet(nextUrl);
        if (!data.results) break;
        for (const r of data.results) {
          libraryImages.push({ name: r.name, pulls: r.pull_count || 0, stars: r.star_count || 0, official: true, desc: r.description || '' });
        }
        nextUrl = data.next || null;
      }

      // Fetch popular community images (5 pages × 100)
      let communityImages = [];
      const communityFetches = [];
      for (let p = 1; p <= 5; p++) {
        communityFetches.push(hubGet('https://hub.docker.com/v2/search/repositories/?query=&page_size=100&page=' + p + '&ordering=-pull_count').catch(() => ({ results: [] })));
      }
      const pages = await Promise.all(communityFetches);
      for (const page of pages) {
        for (const r of (page.results || [])) {
          communityImages.push({ name: r.repo_name || r.name || '', pulls: r.pull_count || 0, stars: r.star_count || 0, official: !!r.is_official, desc: r.short_description || r.description || '' });
        }
      }

      // Merge: official wins on duplicates
      const seen = new Set();
      const merged = [];
      for (const img of libraryImages) { seen.add(img.name); merged.push(img); }
      for (const img of communityImages) { if (!seen.has(img.name)) { seen.add(img.name); merged.push(img); } }
      return merged;
    }

    fetchAll()
      .then(data => {
        imagesCache = { ts: Date.now(), data };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public,max-age=3600' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        console.error('[api/images error]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
      });
    return;
  }

  // ── Serve static files ────────────────────────────────────────────────────
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const host = (req.headers['x-forwarded-host'] || req.headers['host'] || '').split(':')[0];
    const showNav = host === 'dockerimagedownloader.ximg.app';
    const navScript = showNav ? '<script src="/shared/nav.js?v=2"></script>' : '';
    const isDockerImageDev = host === 'dockerimage.dev' || host === 'www.dockerimage.dev';
    const xref = isDockerImageDev ? '' : ' &mdash; also check out <a href="https://dockerimage.dev/" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:none">dockerimage.dev</a>';
    const html = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8')
      .replace('%%NAV_SCRIPT%%', navScript)
      .replace('%%XREF%%', xref);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && pathname === '/favicon.png') {
    const ico = fs.readFileSync(path.join(__dirname, 'favicon.png'));
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(ico);
    return;
  }

  if (req.method === 'GET' && pathname === '/world.json') {
    const wf = path.join(__dirname, 'world.json');
    if (!fs.existsSync(wf)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public,max-age=86400' });
    res.end(fs.readFileSync(wf));
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/shared/')) {
    const sharedPath = path.join('/app/shared', pathname.slice('/shared/'.length).split('?')[0]);
    try {
      const data = fs.readFileSync(sharedPath);
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // ── GET /geo?ips=1.2.3.4,5.6.7.8 ────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/geo') {
    const raw = (query.ips || '').slice(0, 2000);
    const ips = raw.split(',').map(s => s.trim()).filter(s => /^[0-9a-fA-F.:]+$/.test(s)).slice(0, 50);
    Promise.all(ips.map(ip => geoLookup(ip).then(code => [ip, code])))
      .then(pairs => {
        const result = {};
        pairs.forEach(([ip, code]) => { if (code) result[ip] = code; });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public,max-age=86400' });
        res.end(JSON.stringify(result));
      });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => console.log('downloader server listening on :' + PORT));
