const http       = require('http');
const { spawn, execFile } = require('child_process');
const fs         = require('fs');
const path       = require('path');
const url        = require('url');

const PORT     = 3001;
const LOG_FILE = '/data/dockerimagedownloader.log';

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

  // ── Serve static files ────────────────────────────────────────────────────
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
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

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => console.log('downloader server listening on :' + PORT));
