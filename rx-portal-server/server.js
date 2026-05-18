'use strict';

// RxFitt Client Progress Portal — backend API
// Node + better-sqlite3. Per-client scrypt-hashed PINs, date-stamped
// progress entries, session tokens. Served at rx.ximg.app/api/* (nginx
// proxies /api/ here; the static page is served separately).

const http     = require('http');
const crypto   = require('crypto');
const Database = require('better-sqlite3');

const PORT    = 3021;
const DB_FILE = '/data/rx-portal.db';

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    program      TEXT,
    start_weight REAL,
    goal_weight  REAL,
    pin_salt     TEXT,
    pin_hash     TEXT,
    created      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entries (
    client_id INTEGER NOT NULL,
    date      TEXT NOT NULL,
    weight    REAL,
    bodyfat   REAL,
    energy    INTEGER,
    sleep     REAL,
    mood      TEXT,
    workouts  INTEGER,
    calories  INTEGER,
    notes     TEXT,
    updated   TEXT NOT NULL,
    PRIMARY KEY (client_id, date)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token     TEXT PRIMARY KEY,
    client_id INTEGER NOT NULL,
    created   TEXT NOT NULL
  );
`);

// ── PIN hashing ──────────────────────────────────────────────
function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 64).toString('hex');
}
function setPin(clientId, pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPin(pin, salt);
  db.prepare('UPDATE clients SET pin_salt=?, pin_hash=? WHERE id=?')
    .run(salt, hash, clientId);
}
function verifyPin(client, pin) {
  if (!client.pin_hash) return false;
  const got = Buffer.from(hashPin(pin, client.pin_salt), 'hex');
  const want = Buffer.from(client.pin_hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// ── Sessions ─────────────────────────────────────────────────
function newSession(clientId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, client_id, created) VALUES (?,?,?)')
    .run(token, clientId, new Date().toISOString());
  return token;
}
function sessionClientId(token) {
  if (!token) return null;
  const row = db.prepare('SELECT client_id FROM sessions WHERE token=?').get(token);
  return row ? row.client_id : null;
}

// ── Helpers ──────────────────────────────────────────────────
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 1e6) { req.destroy(); reject(new Error('body too large')); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function clientPublic(c) {
  return {
    id: c.id, name: c.name, program: c.program,
    startWeight: c.start_weight, goalWeight: c.goal_weight,
    hasPin: !!c.pin_hash, created: c.created,
  };
}
const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);

// ── Router ───────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const url   = req.url.split('?')[0].replace(/\/+$/, '') || '/';
    const parts = url.split('/').filter(Boolean); // e.g. ['api','clients','3','entries']
    const method = req.method;

    if (parts[0] !== 'api') return send(res, 404, { error: 'not found' });

    // GET /api/health
    if (parts[1] === 'health') return send(res, 200, { ok: true });

    // /api/clients ...
    if (parts[1] === 'clients') {

      // GET /api/clients  — roster (no PIN data)
      if (parts.length === 2 && method === 'GET') {
        const rows = db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE').all();
        return send(res, 200, { clients: rows.map(clientPublic) });
      }

      // POST /api/clients  — create a client profile
      if (parts.length === 2 && method === 'POST') {
        const b = await readBody(req);
        const name = (b.name || '').toString().trim();
        if (!name) return send(res, 400, { error: 'name required' });
        const info = db.prepare(
          'INSERT INTO clients (name, program, start_weight, goal_weight, created) VALUES (?,?,?,?,?)'
        ).run(name, (b.program || '').toString().trim() || null,
              num(b.startWeight), num(b.goalWeight), new Date().toISOString());
        const c = db.prepare('SELECT * FROM clients WHERE id=?').get(info.lastInsertRowid);
        return send(res, 201, { client: clientPublic(c) });
      }

      const clientId = parseInt(parts[2], 10);
      const client = Number.isInteger(clientId)
        ? db.prepare('SELECT * FROM clients WHERE id=?').get(clientId) : null;
      if (!client) return send(res, 404, { error: 'client not found' });

      // POST /api/clients/:id/set-pin  — first-time PIN (or after reset)
      if (parts[3] === 'set-pin' && method === 'POST') {
        if (client.pin_hash) return send(res, 409, { error: 'PIN already set' });
        const b = await readBody(req);
        const pin = (b.pin || '').toString();
        if (!/^\d{4,8}$/.test(pin)) return send(res, 400, { error: 'PIN must be 4–8 digits' });
        setPin(client.id, pin);
        return send(res, 200, { token: newSession(client.id), client: clientPublic({ ...client, pin_hash: 'x' }) });
      }

      // POST /api/clients/:id/login
      if (parts[3] === 'login' && method === 'POST') {
        const b = await readBody(req);
        if (!client.pin_hash) return send(res, 409, { error: 'no PIN set', needsPin: true });
        if (!verifyPin(client, (b.pin || '').toString()))
          return send(res, 401, { error: 'Incorrect PIN' });
        return send(res, 200, { token: newSession(client.id), client: clientPublic(client) });
      }

      // POST /api/clients/:id/reset-pin  — "Forgot PIN": clear so a new one can be set
      if (parts[3] === 'reset-pin' && method === 'POST') {
        db.prepare('UPDATE clients SET pin_salt=NULL, pin_hash=NULL WHERE id=?').run(client.id);
        db.prepare('DELETE FROM sessions WHERE client_id=?').run(client.id);
        return send(res, 200, { ok: true });
      }

      // Everything below requires a valid session token for THIS client
      const token = req.headers['x-token'];
      if (sessionClientId(token) !== client.id)
        return send(res, 401, { error: 'unauthorized' });

      // GET /api/clients/:id/entries
      if (parts[3] === 'entries' && parts.length === 4 && method === 'GET') {
        const rows = db.prepare(
          'SELECT * FROM entries WHERE client_id=? ORDER BY date DESC'
        ).all(client.id);
        return send(res, 200, { client: clientPublic(client), entries: rows });
      }

      // POST /api/clients/:id/entries  — upsert one date's check-in
      if (parts[3] === 'entries' && parts.length === 4 && method === 'POST') {
        const b = await readBody(req);
        const date = (b.date || '').toString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
          return send(res, 400, { error: 'valid date (YYYY-MM-DD) required' });
        db.prepare(`
          INSERT INTO entries (client_id,date,weight,bodyfat,energy,sleep,mood,workouts,calories,notes,updated)
          VALUES (@cid,@date,@weight,@bodyfat,@energy,@sleep,@mood,@workouts,@calories,@notes,@updated)
          ON CONFLICT(client_id,date) DO UPDATE SET
            weight=@weight, bodyfat=@bodyfat, energy=@energy, sleep=@sleep,
            mood=@mood, workouts=@workouts, calories=@calories, notes=@notes, updated=@updated
        `).run({
          cid: client.id, date,
          weight: num(b.weight), bodyfat: num(b.bodyfat), energy: num(b.energy),
          sleep: num(b.sleep), mood: (b.mood || '').toString().slice(0, 40) || null,
          workouts: num(b.workouts), calories: num(b.calories),
          notes: (b.notes || '').toString().slice(0, 2000) || null,
          updated: new Date().toISOString(),
        });
        return send(res, 200, { ok: true });
      }

      // DELETE /api/clients/:id/entries/:date
      if (parts[3] === 'entries' && parts.length === 5 && method === 'DELETE') {
        db.prepare('DELETE FROM entries WHERE client_id=? AND date=?').run(client.id, parts[4]);
        return send(res, 200, { ok: true });
      }
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 400, { error: e.message || 'bad request' });
  }
});

server.listen(PORT, () => console.log('rx-portal-server listening on', PORT));
