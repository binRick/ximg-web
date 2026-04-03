const http = require('http');
const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PORT      = 3002;
const REPO      = '/repo';
const SHARED    = '/app/shared';
const PAGE      = path.join(__dirname, 'page.html');
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Read template once at startup
const PAGE_TEMPLATE = fs.readFileSync(PAGE, 'utf8');
const NAV_TAG = fs.existsSync(path.join(SHARED, 'nav.js'))
  ? '<script src="/shared/nav.js?v=2"></script>' : '';

let cachedHtml = null;
let cacheTime  = 0;
let inflight   = null; // pending git promise, shared across concurrent requests

function buildCommits() {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', REPO, 'log',
      '--pretty=format:XCOMMIT\t%H\t%h\t%an\t%ae\t%ai\t%s',
      '--patch'
    ], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      const blocks = ('\n' + stdout).split(/\nXCOMMIT\t/).filter(Boolean);
      const commits = blocks.map(block => {
        const nl = block.indexOf('\n');
        const parts = (nl >= 0 ? block.slice(0, nl) : block).split('\t');
        const rest  = nl >= 0 ? block.slice(nl + 1) : '';
        const hash = parts[0], short = parts[1], author = parts[2],
              email = parts[3], date = parts[4], subject = parts.slice(5).join('\t');
        let filesChanged = 0, linesAdded = 0, linesDeleted = 0, charsChanged = 0;
        rest.split('\n').forEach(line => {
          if (line.startsWith('diff --git '))                       { filesChanged++; }
          else if (line.startsWith('+') && !line.startsWith('+++')) { linesAdded++;   charsChanged += line.length - 1; }
          else if (line.startsWith('-') && !line.startsWith('---')) { linesDeleted++; charsChanged += line.length - 1; }
        });
        return { hash, short, author, email, date, subject, filesChanged, linesAdded, linesDeleted, charsChanged };
      });
      const html = PAGE_TEMPLATE
        .replace('/* DATA_PLACEHOLDER */', 'var COMMITS=' + JSON.stringify(commits) + ';')
        .replace('SHARED_NAV_PLACEHOLDER', NAV_TAG);
      cachedHtml = html;
      cacheTime  = Date.now();
      inflight   = null;
      resolve(html);
    });
  });
}

function getPage() {
  if (cachedHtml && Date.now() - cacheTime < CACHE_TTL) return Promise.resolve(cachedHtml);
  if (!inflight) inflight = buildCommits();
  return inflight;
}

// Warm cache at startup so first visitor gets a fast response
buildCommits().then(() => console.log('change-server cache warmed')).catch(console.error);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/shared/nav.js') {
    const f = path.join(SHARED, 'nav.js');
    if (fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(fs.readFileSync(f));
    } else {
      res.writeHead(404); res.end('not found');
    }
    return;
  }

  if (url === '/' || url === '/index.html') {
    getPage().then(html => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error reading git log: ' + err.message);
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => console.log('change-server listening on', PORT));
