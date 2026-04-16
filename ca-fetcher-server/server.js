'use strict';
const http = require('http');
const { execFile } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const PORT       = 3003;
const BINARY     = path.join(__dirname, 'tls-ca-fetch');
const TIMEOUT_MS = 15_000;
const RL_WINDOW  = 60_000;
const RL_MAX     = 10;

// ── Rate limiter ──────────────────────────────────────────────────────────────
const rlMap = new Map();
function checkRL(ip) {
  const now = Date.now();
  let e = rlMap.get(ip) || { n: 0, reset: now + RL_WINDOW };
  if (now > e.reset) { e.n = 0; e.reset = now + RL_WINDOW; }
  e.n++;
  rlMap.set(ip, e);
  return e.n <= RL_MAX;
}
setInterval(() => { const now = Date.now(); for (const [k,v] of rlMap) if (now > v.reset) rlMap.delete(k); }, 60_000);

// ── Validation ────────────────────────────────────────────────────────────────
function validHost(h) {
  return typeof h === 'string' && h.length > 0 && h.length <= 255 &&
    /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(h);
}
function validPort(p) {
  const n = parseInt(p, 10);
  return !isNaN(n) && n >= 1 && n <= 65535;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function json(res, status, obj) {
  setCORS(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  // Health check
  if (req.method === 'GET' && req.url === '/api/health') {
    return json(res, 200, { ok: true, binary: fs.existsSync(BINARY) });
  }

  // Run endpoint
  if (req.method === 'POST' && req.url === '/api/run') {
    if (!checkRL(ip)) {
      return json(res, 429, { error: 'Rate limit: max 10 requests per minute.' });
    }

    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2048) req.destroy(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

      const hostname  = String(data.hostname  || '').trim().toLowerCase();
      const port      = parseInt(data.port, 10) || 443;
      const fetchRoot = !!data.fetchRoot;
      const insecure  = !!data.insecure;

      if (!validHost(hostname)) return json(res, 400, { error: 'Invalid hostname' });
      if (!validPort(port))     return json(res, 400, { error: 'Invalid port (1–65535)' });

      // Build args
      const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-'));
      const outFile = path.join(tmpDir, 'ca.pem');
      const args    = ['-o', outFile, '-timeout', '12'];
      if (fetchRoot) args.push('-fetch-root');
      if (insecure)  args.push('-insecure');
      args.push(hostname, String(port));

      execFile(BINARY, args, { timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
        const output = (stdout + stderr).trim();
        let pem = null;
        try { pem = fs.readFileSync(outFile, 'utf8'); } catch {}
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

        json(res, 200, {
          success: !!pem,
          output,
          pem: pem || null,
          hostname,
          port,
        });
      });
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log(`ca-fetcher-server :${PORT}`));
