const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const Database = require('better-sqlite3');

const PORT       = 3011;
const DATA_FILE  = '/data/scores.json';
const DB_FILE    = '/data/replays.db';
const REPLAY_DIR = '/data/replays';
const MAX_SCORES = 100;
const MAX_REPLAY = 1 * 1024 * 1024; // 1 MB
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'ironfist-admin-secret';

// --- SQLite setup ---
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS replays (
    id TEXT PRIMARY KEY,
    score_idx INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    build_hash TEXT,
    verified INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )
`);

// --- Scores (JSON, unchanged storage) ---
function loadScores() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function saveScores(scores) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(scores, null, 2));
}

// --- Helpers ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function genId() {
  // Time-sortable id: timestamp hex + random
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(6).toString('hex');
  return `${ts}-${rnd}`;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let fileBuffer = null;
    let fileName = null;

    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_REPLAY + 1024 } });

    busboy.on('field', (name, val) => { fields[name] = val; });
    busboy.on('file', (name, stream, info) => {
      if (name === 'replay') {
        fileName = info.filename;
        const chunks = [];
        stream.on('data', d => chunks.push(d));
        stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
      } else {
        stream.resume();
      }
    });
    busboy.on('finish', () => resolve({ fields, fileBuffer, fileName }));
    busboy.on('error', reject);

    req.pipe(busboy);
  });
}

function ensureReplayDir(id) {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dir = path.join(REPLAY_DIR, yyyy, mm);
  fs.mkdirSync(dir, { recursive: true });
  const key = `replays/${yyyy}/${mm}/${id}.ifr.zst`;
  const filePath = path.join(REPLAY_DIR, yyyy, mm, `${id}.ifr.zst`);
  return { key, filePath };
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// --- Prepared statements ---
const stmtInsertReplay = db.prepare(
  `INSERT INTO replays (id, score_idx, storage_key, size_bytes, build_hash, verified, created_at)
   VALUES (?, ?, ?, ?, ?, 0, ?)`
);
const stmtGetReplay = db.prepare('SELECT * FROM replays WHERE id = ?');
const stmtDeleteReplay = db.prepare('DELETE FROM replays WHERE id = ?');
const stmtGetReplayByScoreIdx = db.prepare('SELECT id, build_hash FROM replays WHERE score_idx = ?');

// --- Server ---
const server = http.createServer(async (req, res) => {
  // CORS for wasm builds
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // GET /api/scores — return top scores with replay_id
  if (req.method === 'GET' && pathname === '/api/scores') {
    const scores = loadScores();
    // Attach replay_id to each score
    const enriched = scores.map((s, idx) => {
      const replay = stmtGetReplayByScoreIdx.get(idx);
      return { ...s, replay_id: replay ? replay.id : null, build_hash: replay ? replay.build_hash : null };
    });
    return json(res, 200, { scores: enriched });
  }

  // POST /api/scores — submit a new score
  if (req.method === 'POST' && pathname === '/api/scores') {
    try {
      const body = JSON.parse(await readBody(req));

      const initials = String(body.initials || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      if (!initials) return json(res, 400, { error: 'initials required (1-3 chars)' });

      const score = parseInt(body.score, 10);
      if (!Number.isFinite(score) || score < 0) return json(res, 400, { error: 'invalid score' });

      const kills    = parseInt(body.kills, 10) || 0;
      const wave     = parseInt(body.wave, 10) || 0;
      const weapon   = String(body.weapon || '').slice(0, 20);
      const time     = parseFloat(body.time) || 0;
      const pickups  = parseInt(body.pickups, 10) || 0;
      const shots    = parseInt(body.shots, 10) || 0;
      const damage   = parseInt(body.damage, 10) || 0;

      const entry = {
        initials, score, kills, wave, weapon, time, pickups, shots, damage,
        ts: new Date().toISOString(),
      };

      const scores = loadScores();
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      const trimmed = scores.slice(0, MAX_SCORES);
      saveScores(trimmed);

      const rank = trimmed.findIndex(s => s === entry) + 1;
      const id = rank > 0 ? rank - 1 : -1;

      console.log(`[${entry.ts}] NEW SCORE: ${initials} ${score} (wave ${wave}, ${kills} kills, ${time.toFixed(0)}s, ${shots} shots, ${damage} dmg) — rank #${rank}`);

      return json(res, 201, { rank, entry, id });
    } catch (err) {
      return json(res, 400, { error: 'invalid JSON body' });
    }
  }

  // POST /api/replays — upload a replay for an existing score
  if (req.method === 'POST' && pathname === '/api/replays') {
    try {
      const { fields, fileBuffer } = await parseMultipart(req);

      const scoreIdx = parseInt(fields.score_id, 10);
      if (isNaN(scoreIdx) || scoreIdx < 0) return json(res, 400, { error: 'score_id required' });

      // Verify score exists
      const scores = loadScores();
      if (scoreIdx >= scores.length) return json(res, 404, { error: 'score not found' });

      // Check if replay already attached
      const existing = stmtGetReplayByScoreIdx.get(scoreIdx);
      if (existing) return json(res, 409, { error: 'replay already attached to this score' });

      if (!fileBuffer || fileBuffer.length === 0) return json(res, 400, { error: 'replay file required' });
      if (fileBuffer.length > MAX_REPLAY) return json(res, 413, { error: 'replay too large (max 1 MB)' });

      // Validate IFR1 magic (first 4 bytes)
      if (fileBuffer.length < 4 ||
          fileBuffer[0] !== 0x49 || // I
          fileBuffer[1] !== 0x46 || // F
          fileBuffer[2] !== 0x52 || // R
          fileBuffer[3] !== 0x31) { // 1
        return json(res, 400, { error: 'invalid replay file (bad magic, expected IFR1)' });
      }

      // Extract build_hash from bytes 24-27 (little-endian u32)
      let buildHash = null;
      if (fileBuffer.length >= 28) {
        const bh = fileBuffer.readUInt32LE(24);
        buildHash = bh.toString(16).padStart(8, '0');
      }

      // Store replay
      const replayId = genId();
      const { key, filePath } = ensureReplayDir(replayId);

      fs.writeFileSync(filePath, fileBuffer);

      stmtInsertReplay.run(
        replayId, scoreIdx, key, fileBuffer.length,
        buildHash, new Date().toISOString()
      );

      console.log(`[REPLAY] Stored ${replayId} for score #${scoreIdx} (${fileBuffer.length} bytes, build ${buildHash})`);

      return json(res, 201, { replay_id: replayId });
    } catch (err) {
      console.error('[REPLAY] Upload error:', err.message);
      return json(res, 400, { error: 'invalid multipart upload' });
    }
  }

  // GET /api/replays/:id — stream replay bytes
  const replayGetMatch = pathname.match(/^\/api\/replays\/([a-z0-9-]+)$/);
  if (req.method === 'GET' && replayGetMatch) {
    const replayId = replayGetMatch[1];
    const replay = stmtGetReplay.get(replayId);
    if (!replay) {
      res.writeHead(404);
      return res.end('not found');
    }

    const filePath = path.join('/data', replay.storage_key);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end('replay file missing');
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${replayId}.ifr"`,
      'Content-Length': replay.size_bytes,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // DELETE /api/replays/:id — admin-only takedown
  const replayDelMatch = pathname.match(/^\/api\/replays\/([a-z0-9-]+)$/);
  if (req.method === 'DELETE' && replayDelMatch) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) {
      return json(res, 401, { error: 'unauthorized' });
    }

    const replayId = replayDelMatch[1];
    const replay = stmtGetReplay.get(replayId);
    if (!replay) return json(res, 404, { error: 'replay not found' });

    // Delete blob from disk
    const filePath = path.join('/data', replay.storage_key);
    try { fs.unlinkSync(filePath); } catch {}

    // Delete from DB
    stmtDeleteReplay.run(replayId);

    console.log(`[REPLAY] Deleted ${replayId} (admin takedown)`);
    return json(res, 200, { deleted: replayId });
  }

  // Health check
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => console.log(`Iron Fist scores server on :${PORT}`));
