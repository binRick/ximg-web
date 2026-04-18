'use strict';
/**
 * honeypot-proxy — WebSocket ↔ SSH proxy for honeypot.ximg.app
 *
 * Connects to the real SSH honeypot (ssh:22), pre-warms the per-IP auth
 * counter to ≥ 10, then for each browser session:
 *   1. Sends timed auth_fail messages so the client can animate 9 failures.
 *   2. Simultaneously opens a real SSH shell (always succeeds after warm-up).
 *   3. When both the animation finishes AND SSH is ready, sends auth_ok
 *      and relays the live PTY bidirectionally over WebSocket.
 */

const http   = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Client: SSH }     = require('ssh2');

const SSH_HOST    = process.env.SSH_HOST || 'ssh';
const SSH_PORT    = +(process.env.SSH_PORT  || '22');
const LISTEN_PORT = +(process.env.PORT      || '3007');

// Passwords cycled through during retry attempts
const PASSWORDS = [
  'password123','admin','root1234','ubuntu22',
  'qwerty!1','P@ssw0rd','s3cur1ty!','n0t4hack3r',
  'honeypot99','h0n3yp0t!',
];

// Gaps between successive auth_fail display messages on the client (ms).
// 9 values → 9 failures → ~9.5 s total animation.
const FAIL_GAPS = [700, 650, 600, 550, 525, 500, 475, 450, 425];

// Stable per-process fingerprint (looks like a real RSA key hash)
const SESSION_FP =
  'SHA256:' +
  crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, c =>
    ({'+':'A','/':'B','=':''}[c])
  ).slice(0, 43) + '=';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Pre-warm honeypot counter ──────────────────────────────────────────────
// The honeypot allows any login only after ≥ 10 cumulative attempts from
// an IP.  We make up to 15 attempts at startup so every browser session
// gets a shell immediately (the 9-failure sequence is always simulated).
async function prewarm () {
  console.log('[proxy] pre-warming honeypot auth counter…');
  for (let i = 0; i < 15; i++) {
    const result = await new Promise(resolve => {
      const conn = new SSH();
      const guard = setTimeout(() => { try { conn.destroy(); } catch {} resolve('timeout'); }, 4500);
      conn.on('ready', () => { clearTimeout(guard); conn.end(); resolve('ok');   });
      conn.on('error', () => { clearTimeout(guard);             resolve('fail'); });
      conn.connect({
        host:         SSH_HOST,
        port:         SSH_PORT,
        username:     'probe',
        password:     `probe${i}`,
        readyTimeout: 4000,
      });
    });
    if (result === 'ok') {
      console.log(`[proxy] counter warmed after ${i + 1} attempt(s)`);
      return;
    }
    await sleep(500);
  }
  console.log('[proxy] pre-warm exhausted — will retry per browser session');
}

// ── Retry SSH until auth succeeds ─────────────────────────────────────────
function openShell ({ cols, rows, ip, onReady, onGiveUp }) {
  let alive   = true;
  let attempt = 0;

  function try_ () {
    if (!alive) return;
    attempt++;
    const conn = new SSH();

    conn.on('ready', () => {
      if (!alive) { conn.end(); return; }
      conn.shell({ term: 'xterm-256color', cols, rows, env: { X_REAL_IP: ip || '' } }, (err, stream) => {
        if (err || !alive) { conn.end(); setTimeout(try_, 400); return; }
        onReady(conn, stream);
      });
    });

    conn.on('error', () => {
      if (alive && attempt < 50) setTimeout(try_, 400);
      else if (alive) { alive = false; onGiveUp(); }
    });

    conn.connect({
      host:         SSH_HOST,
      port:         SSH_PORT,
      username:     ip ? 'user|' + ip : 'user',
      password:     PASSWORDS[attempt % PASSWORDS.length],
      readyTimeout: 5000,
    });
  }

  try_();
  return { abort () { alive = false; } };
}

// ── WebSocket server ───────────────────────────────────────────────────────
const httpSrv = http.createServer((_, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('WebSocket upgrade required');
});

const wss = new WebSocketServer({ server: httpSrv });

wss.on('connection', (ws, req) => {
  const clientIP =
    (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim();
  console.log(`[proxy] connect  ${clientIP}`);

  let phase     = 'init';   // init | seq | shell
  let cols      = 120;
  let rows      = 30;
  let sshConn   = null;
  let sshStream = null;
  let sshReady  = false;
  let animDone  = false;
  let ptyBuf    = [];
  let handle    = null;

  const sendJ = obj => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  const sendB = buf => { if (ws.readyState === 1) ws.send(buf, { binary: true }); };

  // Called when both animation is done and SSH shell is open
  function activateShell () {
    if (phase === 'shell') return;
    phase = 'shell';

    sendJ({ t: 'auth_ok' });

    // Drain any PTY output that arrived before we were ready
    for (const chunk of ptyBuf) sendB(chunk);
    ptyBuf = [];

    // onReady already has stream.on('data') that checks phase === 'shell';
    // no second listener needed — adding one would double-send every byte.
    sshStream.on('close', ()   => ws.close());
    sshConn.on('error',   ()   => ws.close());
  }

  function maybeActivate () {
    if (sshReady && animDone) activateShell();
  }

  function startSequence () {
    phase = 'seq';

    // Start SSH in background — will succeed immediately if pre-warmed
    handle = openShell({
      cols, rows, ip: clientIP,
      onReady (conn, stream) {
        if (ws.readyState !== 1) { stream.end(); conn.end(); return; }
        sshConn   = conn;
        sshStream = stream;

        // Buffer output until activateShell() is called
        stream.on('data', data => {
          if (phase === 'shell') sendB(data);
          else ptyBuf.push(Buffer.from(data));
        });
        stream.stderr?.on('data', data => {
          if (phase === 'shell') sendB(data);
          else ptyBuf.push(Buffer.from(data));
        });
        stream.on('close', () => ws.close());

        sshReady = true;
        maybeActivate();
      },
      onGiveUp () {
        sendJ({ t: 'error', msg: 'Could not connect to honeypot — is the SSH service running?' });
        ws.close();
      },
    });

    // Send SSH banner immediately
    sendJ({ t: 'banner', fp: SESSION_FP });

    // Schedule the 9 failure messages
    let elapsed = 0;
    for (let i = 0; i < 9; i++) {
      elapsed += FAIL_GAPS[i];
      const n = i + 1;
      setTimeout(() => {
        if (ws.readyState === 1) sendJ({ t: 'auth_fail', n });
      }, elapsed);
    }

    // Mark animation complete ~700 ms after last failure
    setTimeout(() => {
      animDone = true;
      maybeActivate();
    }, elapsed + 700);
  }

  ws.on('message', (raw, isBinary) => {
    // Shell phase: relay input directly to SSH
    if (phase === 'shell') {
      if (!sshStream) return;
      if (isBinary) {
        sshStream.write(Buffer.from(raw));
      } else {
        try {
          const obj = JSON.parse(raw.toString());
          if (obj && obj.t === 'resize') {
            cols = obj.cols;
            rows = obj.rows;
            sshStream.setWindow?.(rows, cols, 0, 0);
          } else {
            sshStream.write(raw.toString());
          }
        } catch {
          sshStream.write(raw.toString());
        }
      }
      return;
    }

    // Init phase: wait for the browser to send dimensions and kick off
    if (phase === 'init') {
      try {
        const obj = JSON.parse(raw.toString());
        if (obj.t === 'init') {
          cols = +(obj.cols) || 120;
          rows = +(obj.rows) || 30;
          startSequence();
        }
      } catch {}
    }
  });

  ws.on('close', () => {
    console.log(`[proxy] disconnect ${clientIP}`);
    handle?.abort();
    try { sshStream?.end();  } catch {}
    try { sshConn?.end();    } catch {}
  });

  ws.on('error', err => console.error(`[proxy] ws error (${clientIP}): ${err.message}`));
});

httpSrv.listen(LISTEN_PORT, async () => {
  console.log(`[proxy] WebSocket proxy listening on :${LISTEN_PORT}`);
  await prewarm();
});
