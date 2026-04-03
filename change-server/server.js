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
  execFile('git', ['-C', REPO, 'log',
    '--pretty=format:XCOMMIT\t%H\t%h\t%an\t%ae\t%ai\t%s',
    '--patch'
  ], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
    if (err) return cb(err);
    const blocks = ('\n' + stdout).split(/\nXCOMMIT\t/).filter(Boolean);
    const commits = blocks.map(block => {
      const nl = block.indexOf('\n');
      const parts = (nl >= 0 ? block.slice(0, nl) : block).split('\t');
      const rest  = nl >= 0 ? block.slice(nl + 1) : '';
      const hash = parts[0], short = parts[1], author = parts[2],
            email = parts[3], date = parts[4], subject = parts.slice(5).join('\t');
      let filesChanged = 0, linesAdded = 0, linesDeleted = 0, charsChanged = 0;
      rest.split('\n').forEach(line => {
        if (line.startsWith('diff --git '))                  { filesChanged++; }
        else if (line.startsWith('+') && !line.startsWith('+++')) { linesAdded++;   charsChanged += line.length - 1; }
        else if (line.startsWith('-') && !line.startsWith('---')) { linesDeleted++; charsChanged += line.length - 1; }
      });
      return { hash, short, author, email, date, subject, filesChanged, linesAdded, linesDeleted, charsChanged };
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
