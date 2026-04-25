const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 3011;
const DATA_FILE = '/data/scores.json';
const MAX_SCORES = 100;    // keep top 100

function loadScores() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function saveScores(scores) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(scores, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS for wasm builds
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // GET /api/scores — return top scores
  if (req.method === 'GET' && req.url === '/api/scores') {
    const scores = loadScores();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ scores }));
  }

  // POST /api/scores — submit a new score
  if (req.method === 'POST' && req.url === '/api/scores') {
    try {
      const body = JSON.parse(await readBody(req));

      // Validate initials: 1-3 uppercase alphanumeric chars
      const initials = String(body.initials || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      if (!initials) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'initials required (1-3 chars)' }));
      }

      const score = parseInt(body.score, 10);
      if (!Number.isFinite(score) || score < 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'invalid score' }));
      }

      const kills    = parseInt(body.kills, 10) || 0;
      const wave     = parseInt(body.wave, 10) || 0;
      const weapon   = String(body.weapon || '').slice(0, 20);
      const time     = parseFloat(body.time) || 0;        // seconds played
      const pickups  = parseInt(body.pickups, 10) || 0;
      const shots    = parseInt(body.shots, 10) || 0;
      const damage   = parseInt(body.damage, 10) || 0;    // total damage dealt

      const entry = {
        initials,
        score,
        kills,
        wave,
        weapon,
        time,
        pickups,
        shots,
        damage,
        ts: new Date().toISOString(),
      };

      const scores = loadScores();
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      const trimmed = scores.slice(0, MAX_SCORES);
      saveScores(trimmed);

      const rank = trimmed.findIndex(s => s === entry) + 1;
      console.log(`[${entry.ts}] NEW SCORE: ${initials} ${score} (wave ${wave}, ${kills} kills, ${time.toFixed(0)}s, ${shots} shots, ${damage} dmg) — rank #${rank}`);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ rank, entry }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid JSON body' }));
    }
  }

  // Health check
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => console.log(`Iron Fist scores server on :${PORT}`));
