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
const VIDEO_DIR  = '/data/videos';
const MAX_SCORES = 100;
const MAX_REPLAY = 1 * 1024 * 1024;  // 1 MB
const MAX_VIDEO  = 200 * 1024 * 1024; // 200 MB
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'ironfist-admin-secret';

// --- SQLite setup ---
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS replays (
    id TEXT PRIMARY KEY,
    score_id TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    build_hash TEXT,
    verified INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    score_id TEXT NOT NULL UNIQUE,
    storage_key TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'video/webm',
    created_at TEXT NOT NULL
  )
`);

// --- Scores (JSON storage) ---
function loadScores() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function saveScores(scores) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(scores, null, 2));
}

function ensureScoreIds() {
  const scores = loadScores();
  let changed = false;
  for (const s of scores) {
    if (!s.id) {
      s.id = genId();
      changed = true;
    }
  }
  if (changed) saveScores(scores);
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
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(6).toString('hex');
  return `${ts}-${rnd}`;
}

function parseMultipart(req, maxSize) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = {};

    const busboy = Busboy({ headers: req.headers, limits: { fileSize: maxSize + 1024 } });

    busboy.on('field', (name, val) => { fields[name] = val; });
    busboy.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', d => chunks.push(d));
      stream.on('end', () => { files[name] = { buffer: Buffer.concat(chunks), info }; });
    });
    busboy.on('finish', () => resolve({ fields, files }));
    busboy.on('error', reject);

    req.pipe(busboy);
  });
}

function ensureDir(base, id) {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dir = path.join(base, yyyy, mm);
  fs.mkdirSync(dir, { recursive: true });
  return { yyyy, mm, dir };
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// --- Prepared statements: replays ---
const stmtInsertReplay = db.prepare(
  `INSERT INTO replays (id, score_id, storage_key, size_bytes, build_hash, verified, created_at)
   VALUES (?, ?, ?, ?, ?, 0, ?)`
);
const stmtGetReplay = db.prepare('SELECT * FROM replays WHERE id = ?');
const stmtDeleteReplay = db.prepare('DELETE FROM replays WHERE id = ?');
const stmtGetReplayByScoreId = db.prepare('SELECT id, build_hash FROM replays WHERE score_id = ?');

// --- Prepared statements: videos ---
const stmtInsertVideo = db.prepare(
  `INSERT INTO videos (id, score_id, storage_key, size_bytes, mime_type, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const stmtGetVideo = db.prepare('SELECT * FROM videos WHERE id = ?');
const stmtDeleteVideo = db.prepare('DELETE FROM videos WHERE id = ?');
const stmtGetVideoByScoreId = db.prepare('SELECT id FROM videos WHERE score_id = ?');

// Backfill score ids on startup
ensureScoreIds();

// --- Server ---
const server = http.createServer(async (req, res) => {
  // CORS for wasm builds
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // GET /api/scores — return top scores with replay_id + video_id
  if (req.method === 'GET' && pathname === '/api/scores') {
    const scores = loadScores();
    const enriched = scores.map(s => {
      const replay = s.id ? stmtGetReplayByScoreId.get(s.id) : null;
      const video = s.id ? stmtGetVideoByScoreId.get(s.id) : null;
      return {
        ...s,
        replay_id: replay ? replay.id : null,
        build_hash: replay ? replay.build_hash : null,
        video_id: video ? video.id : null,
      };
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

      const id = genId();
      const entry = {
        id,
        initials, score, kills, wave, weapon, time, pickups, shots, damage,
        ts: new Date().toISOString(),
      };

      const scores = loadScores();
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      saveScores(scores);

      const rank = scores.findIndex(s => s.id === id) + 1;

      console.log(`[${entry.ts}] NEW SCORE: ${initials} ${score} (wave ${wave}, ${kills} kills, ${time.toFixed(0)}s, ${shots} shots, ${damage} dmg) — rank #${rank}, id=${id}`);

      return json(res, 201, { rank, entry, id });
    } catch (err) {
      return json(res, 400, { error: 'invalid JSON body' });
    }
  }

  // POST /api/replays — upload a replay for an existing score
  if (req.method === 'POST' && pathname === '/api/replays') {
    try {
      const { fields, files } = await parseMultipart(req, MAX_REPLAY);
      const fileBuffer = files.replay ? files.replay.buffer : null;

      const scoreId = fields.score_id;
      if (!scoreId) return json(res, 400, { error: 'score_id required' });

      const scores = loadScores();
      const scoreEntry = scores.find(s => s.id === scoreId);
      if (!scoreEntry) return json(res, 404, { error: 'score not found' });

      const existing = stmtGetReplayByScoreId.get(scoreId);
      if (existing) return json(res, 409, { error: 'replay already attached to this score' });

      if (!fileBuffer || fileBuffer.length === 0) return json(res, 400, { error: 'replay file required' });
      if (fileBuffer.length > MAX_REPLAY) return json(res, 413, { error: 'replay too large (max 1 MB)' });

      // Validate IFR magic (first 4 bytes: IFR1, IFR2, or IFR3)
      if (fileBuffer.length < 4 ||
          fileBuffer[0] !== 0x49 || fileBuffer[1] !== 0x46 ||
          fileBuffer[2] !== 0x52 || (fileBuffer[3] < 0x31 || fileBuffer[3] > 0x33)) {
        return json(res, 400, { error: 'invalid replay file (bad magic, expected IFR1/IFR2/IFR3)' });
      }

      let buildHash = null;
      if (fileBuffer.length >= 28) {
        const bh = fileBuffer.readUInt32LE(24);
        buildHash = bh.toString(16).padStart(8, '0');
      }

      const replayId = genId();
      const { yyyy, mm, dir } = ensureDir(REPLAY_DIR, replayId);
      const key = `replays/${yyyy}/${mm}/${replayId}.ifr.zst`;
      const filePath = path.join(dir, `${replayId}.ifr.zst`);

      fs.writeFileSync(filePath, fileBuffer);
      stmtInsertReplay.run(replayId, scoreId, key, fileBuffer.length, buildHash, new Date().toISOString());

      console.log(`[REPLAY] Stored ${replayId} for score ${scoreId} (${fileBuffer.length} bytes, build ${buildHash})`);
      return json(res, 201, { replay_id: replayId });
    } catch (err) {
      console.error('[REPLAY] Upload error:', err.message);
      return json(res, 400, { error: 'invalid multipart upload' });
    }
  }

  // POST /api/videos — upload a video for an existing score
  if (req.method === 'POST' && pathname === '/api/videos') {
    try {
      const { fields, files } = await parseMultipart(req, MAX_VIDEO);
      const fileBuffer = files.video ? files.video.buffer : null;

      const scoreId = fields.score_id;
      if (!scoreId) return json(res, 400, { error: 'score_id required' });

      const scores = loadScores();
      const scoreEntry = scores.find(s => s.id === scoreId);
      if (!scoreEntry) return json(res, 404, { error: 'score not found' });

      const existing = stmtGetVideoByScoreId.get(scoreId);
      if (existing) return json(res, 409, { error: 'video already attached to this score' });

      if (!fileBuffer || fileBuffer.length === 0) return json(res, 400, { error: 'video file required' });
      if (fileBuffer.length > MAX_VIDEO) return json(res, 413, { error: 'video too large (max 20 MB)' });

      // Validate video magic: WebM (1A 45 DF A3 at byte 0) or MP4 ('ftyp' at byte 4)
      const isWebM = fileBuffer.length >= 4 &&
        fileBuffer[0] === 0x1A && fileBuffer[1] === 0x45 &&
        fileBuffer[2] === 0xDF && fileBuffer[3] === 0xA3;
      const isMp4 = fileBuffer.length >= 8 &&
        fileBuffer[4] === 0x66 && fileBuffer[5] === 0x74 &&
        fileBuffer[6] === 0x79 && fileBuffer[7] === 0x70; // 'ftyp'
      if (!isWebM && !isMp4) {
        // Log the first 16 bytes hex so client-side magic-byte bugs are
        // diagnosable from server logs without round-tripping a fix.
        const head = fileBuffer.slice(0, Math.min(16, fileBuffer.length)).toString('hex');
        console.warn('[VIDEO] REJECTED bad magic for score', scoreId, 'size=', fileBuffer.length, 'head=', head);
        return json(res, 400, { error: 'invalid video file (expected WebM or MP4)' });
      }
      const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
      const ext = isMp4 ? 'mp4' : 'webm';

      const videoId = genId();
      const { yyyy, mm, dir } = ensureDir(VIDEO_DIR, videoId);
      const key = `videos/${yyyy}/${mm}/${videoId}.${ext}`;
      const filePath = path.join(dir, `${videoId}.${ext}`);

      fs.writeFileSync(filePath, fileBuffer);
      stmtInsertVideo.run(videoId, scoreId, key, fileBuffer.length, mimeType, new Date().toISOString());

      console.log(`[VIDEO] Stored ${videoId} for score ${scoreId} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
      return json(res, 201, { video_id: videoId });
    } catch (err) {
      console.error('[VIDEO] Upload error:', err.message);
      return json(res, 400, { error: 'invalid multipart upload' });
    }
  }

  // GET /api/replays/:id — stream replay bytes
  const replayGetMatch = pathname.match(/^\/api\/replays\/([a-z0-9-]+)$/);
  if (req.method === 'GET' && replayGetMatch) {
    const replayId = replayGetMatch[1];
    const replay = stmtGetReplay.get(replayId);
    if (!replay) { res.writeHead(404); return res.end('not found'); }

    const filePath = path.join('/data', replay.storage_key);
    if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('replay file missing'); }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${replayId}.ifr"`,
      'Content-Length': replay.size_bytes,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // GET /api/videos/:id — stream video with range support
  const videoGetMatch = pathname.match(/^\/api\/videos\/([a-z0-9-]+)$/);
  if (req.method === 'GET' && videoGetMatch) {
    const videoId = videoGetMatch[1];
    const video = stmtGetVideo.get(videoId);
    if (!video) { res.writeHead(404); return res.end('not found'); }

    const filePath = path.join('/data', video.storage_key);
    if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('video file missing'); }

    const totalSize = video.size_bytes;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.mime_type,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': video.mime_type,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // DELETE /api/replays/:id — admin-only takedown
  const replayDelMatch = pathname.match(/^\/api\/replays\/([a-z0-9-]+)$/);
  if (req.method === 'DELETE' && replayDelMatch) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) return json(res, 401, { error: 'unauthorized' });

    const replayId = replayDelMatch[1];
    const replay = stmtGetReplay.get(replayId);
    if (!replay) return json(res, 404, { error: 'replay not found' });

    try { fs.unlinkSync(path.join('/data', replay.storage_key)); } catch {}
    stmtDeleteReplay.run(replayId);

    console.log(`[REPLAY] Deleted ${replayId} (admin takedown)`);
    return json(res, 200, { deleted: replayId });
  }

  // DELETE /api/videos/:id — admin-only takedown
  const videoDelMatch = pathname.match(/^\/api\/videos\/([a-z0-9-]+)$/);
  if (req.method === 'DELETE' && videoDelMatch) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) return json(res, 401, { error: 'unauthorized' });

    const videoId = videoDelMatch[1];
    const video = stmtGetVideo.get(videoId);
    if (!video) return json(res, 404, { error: 'video not found' });

    try { fs.unlinkSync(path.join('/data', video.storage_key)); } catch {}
    stmtDeleteVideo.run(videoId);

    console.log(`[VIDEO] Deleted ${videoId} (admin takedown)`);
    return json(res, 200, { deleted: videoId });
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
