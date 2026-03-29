const http         = require('http');
const https        = require('https');
const fs           = require('fs');
const path         = require('path');
const { execFile } = require('child_process');

const PORT        = 3001;
const HTML_DIR    = '/app/html';
const SHARED_DIR  = '/app/shared';
const COOKIES_FILE = '/cookies/cookies.txt';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function isValidYouTubeUrl(raw) {
  try {
    const u = new URL(raw);
    const isYT   = u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com';
    const isShort = u.hostname === 'youtu.be';
    if (isYT)    return u.pathname === '/watch' || u.pathname.startsWith('/shorts/');
    if (isShort) return u.pathname.length > 1;
    return false;
  } catch { return false; }
}

// Ask yt-dlp for the direct CDN URL only — no download occurs
function resolveStreamUrl(ytUrl, cb) {
  const args = [
    '--get-url',
    '-f', 'best[height<=720][ext=mp4]/best[height<=720]/best',
    '--no-playlist',
    '--no-warnings',
  ];
  if (fs.existsSync(COOKIES_FILE)) args.push('--cookies', COOKIES_FILE);
  args.push(ytUrl);

  execFile(
    'yt-dlp',
    args,
    { timeout: 20000 },
    (err, stdout, stderr) => {
      if (err) return cb(new Error(stderr.trim() || err.message));
      const url = stdout.trim().split('\n')[0];
      if (!url.startsWith('http')) return cb(new Error('unexpected yt-dlp output'));
      cb(null, url);
    }
  );
}

function proxyStream(directUrl, req, res) {
  const mod  = directUrl.startsWith('https') ? https : http;
  const opts = new URL(directUrl);

  const upReq = mod.get(
    { hostname: opts.hostname, path: opts.pathname + opts.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; yt-dlp)',
        ...(req.headers.range ? { 'Range': req.headers.range } : {}),
      }
    },
    upRes => {
      const headers = { 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
      ['content-type','content-length','content-range'].forEach(h => {
        if (upRes.headers[h]) headers[h] = upRes.headers[h];
      });
      if (!headers['content-type']) headers['content-type'] = 'video/mp4';
      res.writeHead(upRes.statusCode, headers);
      upRes.pipe(res);
      res.on('close', () => upRes.destroy());
    }
  );
  upReq.on('error', err => { if (!res.headersSent) { res.writeHead(502); res.end(); } });
  res.on('close', () => upReq.destroy());
}

function serveFile(filePath, res) {
  const safe = path.resolve(filePath);
  if (!safe.startsWith('/app/')) { res.writeHead(403); res.end(); return; }
  fs.readFile(safe, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(safe)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const qIdx     = req.url.indexOf('?');
  const pathname = qIdx >= 0 ? req.url.slice(0, qIdx) : req.url;
  const search   = qIdx >= 0 ? req.url.slice(qIdx) : '';

  if (pathname === '/health') { res.writeHead(200); res.end('ok'); return; }

  if (pathname.startsWith('/shared/')) {
    serveFile(path.join(SHARED_DIR, path.basename(pathname)), res);
    return;
  }

  if (pathname === '/stream') {
    const params = new URLSearchParams(search.slice(1));
    const ytUrl  = params.get('url') || '';
    if (!isValidYouTubeUrl(ytUrl)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('invalid url'); return;
    }
    resolveStreamUrl(ytUrl, (err, directUrl) => {
      if (err) {
        console.error('yt-dlp error:', err.message);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('stream error: ' + err.message);
        return;
      }
      proxyStream(directUrl, req, res);
    });
    return;
  }

  serveFile(
    pathname === '/' ? path.join(HTML_DIR, 'index.html') : path.join(HTML_DIR, pathname),
    res
  );
});

server.listen(PORT, () => console.log('ascii-server listening on :' + PORT));
