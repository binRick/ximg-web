const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3016;
const DATA_FILE = '/data/scores.json';
const MAX_SCORES = 10000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'uapd-admin-secret';

const ALLOWED_PLATFORMS = new Set(['macos', 'ios', 'windows', 'web']);
const ALLOWED_UFOS = new Set(['hornet', 'starlight', 'greyhound', 'unknown']);

function loadScores() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function saveScores(scores) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(scores, null, 2));
}

function genId() {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(6).toString('hex');
  return `${ts}-${rnd}`;
}

function ensureScoreIds() {
  const scores = loadScores();
  let changed = false;
  for (const s of scores) {
    if (!s.id) { s.id = genId(); changed = true; }
  }
  if (changed) saveScores(scores);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

ensureScoreIds();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // GET /api/scores — top scores
  if (req.method === 'GET' && pathname === '/api/scores') {
    return json(res, 200, { scores: loadScores() });
  }

  // POST /api/scores — submit a new score
  if (req.method === 'POST' && pathname === '/api/scores') {
    try {
      const body = JSON.parse(await readBody(req));

      const initials = String(body.initials || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      if (!initials) return json(res, 400, { error: 'initials required (1-3 chars)' });

      const score = parseInt(body.score, 10);
      if (!Number.isFinite(score) || score < 0) return json(res, 400, { error: 'invalid score' });

      const level = parseInt(body.level, 10) || 1;
      const cows = parseInt(body.cows, 10) || 0;
      const time = parseFloat(body.time) || 0;
      const photos = parseInt(body.photos, 10) || 0;
      const cropCircles = parseInt(body.cropCircles, 10) || 0;

      const ufoRaw = String(body.ufo || '').toLowerCase();
      const ufo = ALLOWED_UFOS.has(ufoRaw) ? ufoRaw : 'unknown';

      const platformRaw = String(body.platform || '').toLowerCase();
      const platform = ALLOWED_PLATFORMS.has(platformRaw) ? platformRaw : 'unknown';

      const id = genId();
      const entry = {
        id, initials, score, level, cows, time, photos, cropCircles, ufo, platform,
        ts: new Date().toISOString(),
      };

      const scores = loadScores();
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      if (scores.length > MAX_SCORES) scores.length = MAX_SCORES;
      saveScores(scores);

      const rank = scores.findIndex(s => s.id === id) + 1;
      console.log(`[${entry.ts}] NEW SCORE: ${initials} ${score} (lvl ${level}, ${cows} cows, ${time.toFixed(0)}s, ${ufo}/${platform}) — rank #${rank}, id=${id}`);
      return json(res, 201, { rank, entry, id });
    } catch (err) {
      return json(res, 400, { error: 'invalid JSON body' });
    }
  }

  // DELETE /api/scores/:id — admin takedown
  const delMatch = pathname.match(/^\/api\/scores\/([a-z0-9-]+)$/);
  if (req.method === 'DELETE' && delMatch) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) return json(res, 401, { error: 'unauthorized' });
    const id = delMatch[1];
    const scores = loadScores();
    const idx = scores.findIndex(s => s.id === id);
    if (idx < 0) return json(res, 404, { error: 'score not found' });
    const removed = scores.splice(idx, 1)[0];
    saveScores(scores);
    console.log(`[ADMIN] Deleted score ${id} (${removed.initials} ${removed.score})`);
    return json(res, 200, { deleted: id });
  }

  // Health check
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => console.log(`UAP/D scores server on :${PORT}`));
