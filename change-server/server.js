const http = require('http');
const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PORT   = 3002;
const REPO   = '/repo';
const SHARED = '/app/shared';
const PAGE   = path.join(__dirname, 'page.html');

// Cache git log for 15 seconds
let commitCache = null;
let cacheTime   = 0;

function getCommits(cb) {
  const now = Date.now();
  if (commitCache && now - cacheTime < 15000) return cb(null, commitCache);
  execFile('git', ['-C', REPO, 'log', '--pretty=format:%H\x1f%h\x1f%an\x1f%ae\x1f%ai\x1f%s'],
    { maxBuffer: 4 * 1024 * 1024 },
    (err, stdout) => {
      if (err) return cb(err);
      const commits = stdout.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split('\x1f');
        return { hash: parts[0], short: parts[1], author: parts[2], email: parts[3], date: parts[4], subject: parts.slice(5).join('\x1f') };
      });
      commitCache = commits;
      cacheTime = now;
      cb(null, commits);
    });
}

function renderPage(commits) {
  const template = fs.readFileSync(PAGE, 'utf8');
  const jsonData = JSON.stringify(commits);
  const navTag = fs.existsSync(path.join(SHARED, 'nav.js'))
    ? '<script src="/shared/nav.js?v=2"></script>' : '';
  return template
    .replace('/* DATA_PLACEHOLDER */', 'var COMMITS=' + jsonData + ';')
    .replace('SHARED_NAV_PLACEHOLDER', navTag);
}

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
    getCommits((err, commits) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error reading git log: ' + err.message);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderPage(commits));
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => console.log('change-server listening on', PORT));
