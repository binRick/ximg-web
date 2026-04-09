const http       = require('http');
const { spawn, execFile } = require('child_process');
const fs         = require('fs');
const path       = require('path');
const url        = require('url');

const PORT = 3001;

// ── Validation ────────────────────────────────────────────────────────────────
// Allow valid Docker image references:
//   name[:tag][@digest]
//   registry/name[:tag]
//   registry:port/name[:tag]
// No shell metacharacters, max 256 chars.
function validImageRef(ref) {
  if (!ref || typeof ref !== 'string') return false;
  if (ref.length > 256) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/.test(ref);
}

// Produce a safe filename from an image ref, e.g. "nginx:1.25.3" → "nginx-1.25.3.tar.gz"
function safeFilename(ref) {
  return ref.replace(/[/:@]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '.tar.gz';
}

// ── In-flight pull tracking ───────────────────────────────────────────────────
// Maps image ref → { status: 'pulling'|'ready'|'failed', ttlTimer }
const pulls = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function scheduleCleanup(image) {
  const entry = pulls.get(image);
  if (!entry) return;
  if (entry.ttlTimer) clearTimeout(entry.ttlTimer);
  entry.ttlTimer = setTimeout(() => {
    console.log('[ttl] cleaning up unpulled image:', image);
    execFile('docker', ['rmi', '-f', image], (err) => {
      if (err) console.error('[ttl rmi error]', err.message);
      else console.log('[ttl] removed', image);
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

  // CORS — allow the frontend origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── POST /pull  — stream docker pull output via SSE ──────────────────────────
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

      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',   // tell nginx not to buffer SSE
      });

      sendSSE(res, { type: 'start', image });

      // If already pulled and ready, skip re-pull
      const existing = pulls.get(image);
      if (existing && existing.status === 'ready') {
        sendSSE(res, { type: 'log', text: 'Image already cached on server.\n' });
        sendSSE(res, { type: 'done', image });
        res.end();
        return;
      }

      // Spawn docker pull
      const pull = spawn('docker', ['pull', image], { stdio: ['ignore', 'pipe', 'pipe'] });

      pulls.set(image, { status: 'pulling' });

      let resClosed = false;
      res.on('close', () => { resClosed = true; });

      const safeWrite = obj => { if (!resClosed) sendSSE(res, obj); };

      const onData = chunk => safeWrite({ type: 'log', text: chunk.toString() });
      pull.stdout.on('data', onData);
      pull.stderr.on('data', onData);

      pull.on('close', (code, signal) => {
        if (code === 0 || (code === null && signal === null)) {
          pulls.set(image, { status: 'ready' });
          scheduleCleanup(image);
          safeWrite({ type: 'done', image });
        } else {
          pulls.set(image, { status: 'failed' });
          safeWrite({ type: 'error', text: 'docker pull exited (code=' + code + ' signal=' + signal + ')' });
        }
        if (!resClosed) res.end();
      });

      pull.on('error', err => {
        pulls.set(image, { status: 'failed' });
        safeWrite({ type: 'error', text: 'Failed to spawn docker: ' + err.message });
        if (!resClosed) res.end();
      });
    });
    return;
  }

  // ── GET /download  — stream docker save | gzip → client ─────────────────────
  if (req.method === 'GET' && pathname === '/download') {
    const image = query.image;

    if (!validImageRef(image)) {
      res.writeHead(400);
      res.end('Invalid image reference');
      return;
    }

    const filename = safeFilename(image);

    res.writeHead(200, {
      'Content-Type':        'application/gzip',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Transfer-Encoding':   'chunked',
      'X-Accel-Buffering':   'no',
    });

    // Cancel TTL cleanup — download handles its own cleanup on close
    const entry = pulls.get(image);
    if (entry && entry.ttlTimer) clearTimeout(entry.ttlTimer);

    // docker save <image> | gzip -c → response
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
      // Remove image from server after download to reclaim disk space
      execFile('docker', ['rmi', '-f', image], (err) => {
        if (err) console.error('[rmi error]', err.message);
        else { pulls.delete(image); console.log('[rmi] cleaned up', image); }
      });
    });
    return;
  }

  // ── GET /status  — check if an image is ready ─────────────────────────────
  if (req.method === 'GET' && pathname === '/status') {
    const image = query.image;
    if (!validImageRef(image)) {
      res.writeHead(400);
      res.end('Invalid image reference');
      return;
    }
    const entry = pulls.get(image);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: entry ? entry.status : 'unknown' }));
    return;
  }

  // ── Serve the frontend HTML ───────────────────────────────────────────────
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
