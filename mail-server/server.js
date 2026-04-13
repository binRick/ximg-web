const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const crypto  = require('crypto');
const { SMTPServer }  = require('smtp-server');
const { simpleParser } = require('mailparser');

const MAIL_DIR  = '/mail-data';
const HTTP_PORT = 3001;
const SMTP_PORT = 25;

// ── Ensure mail-data dir exists ───────────────────────────────────────────────
if (!fs.existsSync(MAIL_DIR)) fs.mkdirSync(MAIL_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function listEmails() {
  try {
    return fs.readdirSync(MAIL_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), 'utf8')); }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch { return []; }
}

function getEmail(id) {
  const file = path.join(MAIL_DIR, id + '.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function markRead(id) {
  const email = getEmail(id);
  if (!email) return false;
  email.read = true;
  fs.writeFileSync(path.join(MAIL_DIR, id + '.json'), JSON.stringify(email));
  return true;
}

function deleteEmail(id) {
  const file = path.join(MAIL_DIR, id + '.json');
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

// ── SMTP Server ───────────────────────────────────────────────────────────────
const smtp = new SMTPServer({
  name:           'mail.ximg.app',
  banner:         'ximg.app mail server',
  authOptional:   true,
  disabledCommands: ['AUTH'],
  size:           25 * 1024 * 1024, // 25 MB max

  onRcptTo(address, session, cb) {
    // Accept mail for @ximg.app and @dockerimage.dev
    const addr = address.address.toLowerCase();
    if (addr.endsWith('@ximg.app') || addr.endsWith('@dockerimage.dev')) return cb();
    return cb(new Error('Only @ximg.app and @dockerimage.dev recipients accepted'));
  },

  onData(stream, session, cb) {
    const chunks = [];
    stream.on('data', d => chunks.push(d));
    stream.on('end', async () => {
      const raw = Buffer.concat(chunks);
      try {
        const parsed = await simpleParser(raw);
        const id = crypto.randomUUID();
        const email = {
          id,
          date:    (parsed.date || new Date()).toISOString(),
          from:    parsed.from?.text || session.envelope.mailFrom.address || '(unknown)',
          to:      (parsed.to?.text || session.envelope.rcptTo.map(r => r.address).join(', ')),
          subject: parsed.subject || '(no subject)',
          text:    parsed.text    || '',
          html:    parsed.html    || '',
          read:    false,
          attachments: (parsed.attachments || []).map(a => ({
            filename: a.filename || 'attachment',
            contentType: a.contentType,
            size: a.size,
          })),
        };
        fs.writeFileSync(path.join(MAIL_DIR, id + '.json'), JSON.stringify(email, null, 2));
        console.log(`[SMTP] Received: "${email.subject}" from ${email.from}`);
        cb();
      } catch (err) {
        console.error('[SMTP] Parse error:', err.message);
        cb(err);
      }
    });
    stream.on('error', cb);
  },
});

smtp.on('error', err => console.error('[SMTP Error]', err.message));
smtp.listen(SMTP_PORT, '0.0.0.0', () => console.log(`[SMTP] Listening on port ${SMTP_PORT}`));

// ── HTTP Server ───────────────────────────────────────────────────────────────
const NAV_PATH = path.join(__dirname, 'shared', 'nav.js');

function serveNav(res) {
  try {
    const js = fs.readFileSync(NAV_PATH, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(js);
  } catch {
    res.writeHead(404); res.end();
  }
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

const PAGE = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/favicon.svg') {
    const f = path.join(__dirname, 'favicon.svg');
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(fs.readFileSync(f));
    return;
  }

  if (url.pathname === '/shared/nav.js') return serveNav(res);

  if (url.pathname === '/api/emails') {
    return json(res, listEmails());
  }

  if (url.pathname.startsWith('/api/read/') && req.method === 'POST') {
    const id = path.basename(url.pathname);
    markRead(id);
    return json(res, { ok: true });
  }

  if (url.pathname.startsWith('/api/delete/') && req.method === 'POST') {
    const id = path.basename(url.pathname);
    deleteEmail(id);
    return json(res, { ok: true });
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return html(res, PAGE);
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(HTTP_PORT, () => console.log(`[HTTP] Listening on port ${HTTP_PORT}`));
