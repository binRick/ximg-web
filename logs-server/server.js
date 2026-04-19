const http = require('http');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const geoip = require('geoip-lite');

const LOGS_DIR       = '/logs';
const SSH_DIR        = '/ssh-logs';
const DL_LOG_FILE    = '/data/dockerimagedownloader.log';
const BUNDLER_LOG_FILE = '/data/bundler-downloads.log';
const MAP_ALLTIME_FILE = '/data/map-alltime.json';
const PORT           = 3000;

function stripAnsi(s) {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
          .replace(/\x1B[()][AB012]/g, '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');
}

// ── GeoIP lookup via local geoip-lite database ────────────────────────────────
const ipGeoCache = new Map(); // ip -> { countryCode, country, city, lat, lon }

function lookupGeo(ip) {
  if (ipGeoCache.has(ip)) return Promise.resolve(ipGeoCache.get(ip));
  const result = geoip.lookup(ip);
  const geo = result
    ? { countryCode: result.country || '', country: result.country || '', city: result.city || '', lat: result.ll[0] || 0, lon: result.ll[1] || 0 }
    : { countryCode: '', country: '', city: '', lat: 0, lon: 0 };
  ipGeoCache.set(ip, geo);
  return Promise.resolve(geo);
}

// ── All-time IP map (persisted across log rotations) ─────────────────────────
let mapAlltimeStore = { processedFiles: [], ips: {} };
const INTERNAL_IPS = new Set(['172.18.0.1', '127.0.0.1', '::1']);

function loadAlltimeStore() {
  try {
    const raw = fs.readFileSync(MAP_ALLTIME_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    mapAlltimeStore.processedFiles = parsed.processedFiles || [];
    mapAlltimeStore.ips = parsed.ips || {};
  } catch (_) {}
}

function saveAlltimeStore() {
  try { fs.writeFileSync(MAP_ALLTIME_FILE, JSON.stringify(mapAlltimeStore)); } catch (_) {}
}

loadAlltimeStore();

function harvestLogFile(filepath) {
  try {
    let content;
    if (filepath.endsWith('.gz')) {
      content = zlib.gunzipSync(fs.readFileSync(filepath)).toString('utf8');
    } else {
      content = fs.readFileSync(filepath, 'utf8');
    }
    for (const line of content.split('\n')) {
      const m = line.match(/^(\S+)\s/);
      if (!m) continue;
      const ip = m[1];
      if (INTERNAL_IPS.has(ip)) continue;
      mapAlltimeStore.ips[ip] = (mapAlltimeStore.ips[ip] || 0) + 1;
    }
  } catch (_) {}
}

async function scanAndHarvest() {
  const processed = new Set(mapAlltimeStore.processedFiles);
  let files;
  try {
    files = fs.readdirSync(LOGS_DIR).filter(f => /\.log-\d{8}(\.gz)?$/.test(f));
  } catch (_) { return 0; }
  let newCount = 0;
  for (const fname of files) {
    if (processed.has(fname)) continue;
    await new Promise(resolve => setImmediate(resolve));
    harvestLogFile(path.join(LOGS_DIR, fname));
    mapAlltimeStore.processedFiles.push(fname);
    newCount++;
    if (newCount % 50 === 0) saveAlltimeStore();
  }
  if (newCount > 0) saveAlltimeStore();
  return newCount;
}

function ipFromFilename(filename) {
  // filename: YYYYMMDD-HHMMSS-<ip>-<pid>.log  (IPv6 colons replaced with _)
  const parts = filename.replace(/\.log$/, '').split('-');
  return parts.slice(2, -1).join('-').replace(/_/g, ':');
}

const MARIO_SCORES_FILE = '/data/mario-scores.json';

function readScores() {
  try { return JSON.parse(fs.readFileSync(MARIO_SCORES_FILE, 'utf8')); }
  catch (_) { return []; }
}
function writeScores(scores) {
  try { fs.writeFileSync(MARIO_SCORES_FILE, JSON.stringify(scores)); } catch (_) {}
}

const MARIO_SCORES_SMB2_FILE = '/data/mario-scores-smb2.json';

function readScoresSMB2() {
  try { return JSON.parse(fs.readFileSync(MARIO_SCORES_SMB2_FILE, 'utf8')); }
  catch (_) { return []; }
}
function writeScoresSMB2(scores) {
  try { fs.writeFileSync(MARIO_SCORES_SMB2_FILE, JSON.stringify(scores)); } catch (_) {}
}

const LOG_FILES = {
  ximg:      'ximg.access.log',
  linux:     'linux.access.log',
  ai:        'ai.access.log',
  claude:    'claude.access.log',
  bash:      'bash.access.log',
  zsh:       'zsh.access.log',
  vt101:     'vt101.access.log',
  mac:       'mac.access.log',
  butterfly: 'butterfly.access.log',
  ascii:     'ascii.access.log',
  json:      'json.access.log',
  poker:     'poker.access.log',
  mario:     'mario.access.log',
  monkey:    'monkey.access.log',
  doom:      'doom.access.log',
  grilling:  'grilling.access.log',
  pizza:     'pizza.access.log',
  sushi:     'sushi.access.log',
  tacos:     'tacos.access.log',
  bbq:       'bbq.access.log',
  ramen:     'ramen.access.log',
  pasta:     'pasta.access.log',
  thai:      'thai.access.log',
  baking:    'baking.access.log',
  smoker:    'smoker.access.log',
  knife:     'knife.access.log',
  ferment:   'ferment.access.log',
  wine:      'wine.access.log',
  beer:      'beer.access.log',
  cocktails: 'cocktails.access.log',
  tea:       'tea.access.log',
  calories:  'calories.access.log',
  recipe:    'recipe.access.log',
  spice:     'spice.access.log',
  market:    'market.access.log',
  docker:    'docker.access.log',
  yaml:      'yaml.access.log',
  kart:      'kart.access.log',
  kombat:    'kombat.access.log',
  wargames:  'wargames.access.log',
  warcraft:  'warcraft.access.log',
  moto:      'moto.access.log',
  india:     'india.access.log',
  chinese:   'chinese.access.log',
  wood:      'wood.access.log',
  guns:      'guns.access.log',
  america:   'america.access.log',
  florida:   'florida.access.log',
  tampa:     'tampa.access.log',
  computers: 'computers.access.log',
  trump:     'trump.access.log',
  clamav:    'clamav.access.log',
  cnc:       'cnc.access.log',
  simcity:   'simcity.access.log',
  rx:        'rx.access.log',
  mail:      'mail.access.log',
  internet:  'internet.access.log',
  fidonet:   'fidonet.access.log',
  cia:       'cia.access.log',
  coldwar:   'coldwar.access.log',
  cuba:      'cuba.access.log',
  communism: 'communism.access.log',
  passwords: 'passwords.access.log',
  change:    'change.access.log',
  apps:      'apps.access.log',
  tmux:      'tmux.access.log',
  ansible:   'ansible.access.log',
  crypto:      'crypto.access.log',
  git:         'git.access.log',
  chess:       'chess.access.log',
  programming: 'programming.access.log',
  ps1:         'ps1.access.log',
  dockerimage:  'dockerimage.access.log',
  'dockerimage.dev': 'dockerimage.dev.access.log',
  dockerimagedownloader: 'dockerimagedownloader.access.log',
  githubstars:           'githubstars.access.log',
  templeos:              'templeos.access.log',
  smtp:                  'smtp.access.log',
  video:                 'video.access.log',
  chmod:                 'chmod.access.log',
  iptables:              'iptables.access.log',
  tls:                   'tls.access.log',
  bgp:                   'bgp.access.log',
  makefile:              'makefile.access.log',
  utf8:                  'utf8.access.log',
  french:                'french.access.log',
  russianrev:            'russianrev.access.log',
  napoleon:              'napoleon.access.log',
  british:               'british.access.log',
  spacerace:             'spacerace.access.log',
  systemd:     'systemd.access.log',
  vr:          'vr.access.log',
  unix:        'unix.access.log',
  bsd:         'bsd.access.log',
  gentoo:      'gentoo.access.log',
  esp32:       'esp32.access.log',
  'ca-fetcher': 'ca-fetcher.access.log',
  'proc-trace-exec': 'proc-trace-exec.access.log',
  'proc-trace-dns': 'proc-trace-dns.access.log',
  'proc-trace-net': 'proc-trace-net.access.log',
  'proc-trace-tls': 'proc-trace-tls.access.log',
  'esp32-s3-lcd': 'esp32-s3-lcd.access.log',
  'tls-ca-fetch': 'tls-ca-fetch.access.log',
  'github-stats': 'github-stats.access.log',
  ip:            'ip.access.log',
  pal:           'pal.access.log',
  conway:       'conway.access.log',
  vim:         'vim.access.log',
  http:        'http.access.log',
  ssh:         'ssh.access.log',
  sql:         'sql.access.log',
  coffee:      'coffee.access.log',
  japan:       'japan.access.log',
  quake:       'quake.access.log',
  nintendo:    'nintendo.access.log',
  pirates:     'pirates.access.log',
  medieval:    'medieval.access.log',
  rome:        'rome.access.log',
  bbs:         'bbs.access.log',
  dos:         'dos.access.log',
  modem:       'modem.access.log',
  commodore:   'commodore.access.log',
  dns:         'dns.access.log',
  suricata:    'suricata.access.log',
  crypto:      'crypto.access.log',

  'ximg-app':  'ximg-app.access.log',
  logs:        'logs.access.log',
  stats:       'stats.access.log',
  ids:         'ids.access.log',
  claudemd:    'claudemd.access.log',
  network:     'network.access.log',
  request:     'request.access.log',
  readme:      'readme.access.log',
  nav:         'nav.access.log',
  algorithms:  'algorithms.access.log',
  os:          'os.access.log',
  security:    'security.access.log',
  database:    'database.access.log',
  playground:  'playground.access.log',
  tokens:      'tokens.access.log',
  temperature: 'temperature.access.log',
  embeddings:  'embeddings.access.log',
  agents:      'agents.access.log',
  visualize:   'visualize.access.log',
  statslab:    'statslab.access.log',
  regression:  'regression.access.log',
  probability:    'probability.access.log',
  systemdesign:   'systemdesign.access.log',
  loadbalancer:   'loadbalancer.access.log',
  cdn:            'cdn.access.log',
  queue:          'queue.access.log',
  punch:          'punch.access.log',
  terminal:       'terminal.access.log',
  circuit:        'circuit.access.log',
  compiler:       'compiler.access.log',
  logic:          'logic.access.log',
  protocol:       'protocol.access.log',
  mainframe:      'mainframe.access.log',
  arpanet:        'arpanet.access.log',
  regex:          'regex.access.log',
  binary:         'binary.access.log',
  jwt:            'jwt.access.log',
  cron:           'cron.access.log',
  color:          'color.access.log',
  compound:       'compound.access.log',
  savings:        'savings.access.log',
  tax:            'tax.access.log',
  stocks:         'stocks.access.log',
  options:        'options.access.log',
  forex:          'forex.access.log',
  dcf:            'dcf.access.log',
  mortgage:       'mortgage.access.log',
  retire:         'retire.access.log',
  inflation:      'inflation.access.log',
  debt:           'debt.access.log',
  budget:         'budget.access.log',
  base64:         'base64.access.log',
  hash:           'hash.access.log',
  diff:           'diff.access.log',
  url:            'url.access.log',
  curl:           'curl.access.log',
  cidr:           'cidr.access.log',
  uuid:           'uuid.access.log',
  lorem:          'lorem.access.log',
  csv:            'csv.access.log',
  markdown:       'markdown.access.log',
  password:       'password.access.log',
  ssl:            'ssl.access.log',
  epoch:          'epoch.access.log',
  timespan:       'timespan.access.log',
  '555timer':     '555timer.access.log',
  arduino:        'arduino.access.log',
  battery:        'battery.access.log',
  capacitor:      'capacitor.access.log',
  fpga:           'fpga.access.log',
  impedance:      'impedance.access.log',
  ohms:           'ohms.access.log',
  opamp:          'opamp.access.log',
  oscilloscope:   'oscilloscope.access.log',
  pcb:            'pcb.access.log',
  pinout:         'pinout.access.log',
  psu:            'psu.access.log',
  pwm:            'pwm.access.log',
  resistor:       'resistor.access.log',
  spectrum:       'spectrum.access.log',
  spi:            'spi.access.log',
  uart:           'uart.access.log',
  voltage:        'voltage.access.log',
  antenna:        'antenna.access.log',
  'python-bundler': 'python-bundler.access.log',
  'nodejs-bundler': 'nodejs-bundler.access.log',
  'go-bundler':     'go-bundler.access.log',
  'ansible-bundler':'ansible-bundler.access.log',
  'apt-bundler':    'apt-bundler.access.log',
  'rpm-bundler':    'rpm-bundler.access.log',
  'nuget-bundler':  'nuget-bundler.access.log',
  iso:              'iso.access.log',
  honeypot:         'honeypot.access.log',
  'bundler-info':   'bundler-info.access.log',
  'devtools-info':  'devtools-info.access.log',
  'projects-info':  'projects-info.access.log',
  aztec:            'aztec.access.log',
  babylon:          'babylon.access.log',
  civilwar:         'civilwar.access.log',
  colonial:         'colonial.access.log',
  crusades:         'crusades.access.log',
  egypt:            'egypt.access.log',
  greece:           'greece.access.log',
  industrial:       'industrial.access.log',
  mongols:          'mongols.access.log',
  ottoman:          'ottoman.access.log',
  renaissance:      'renaissance.access.log',
  revolution:       'revolution.access.log',
  samurai:          'samurai.access.log',
  silkroad:         'silkroad.access.log',
  vikings:          'vikings.access.log',
  ww1:              'ww1.access.log',
  ww2:              'ww2.access.log',
  architecture:     'architecture.access.log',
  bourbon:          'bourbon.access.log',
  tetris:           'tetris.access.log',
};

// ── IDS (Suricata EVE JSON) data layer ───────────────────────────────────────
const IDS_EVE_LOG    = '/var/log/suricata/eve.json';
const IDS_MAX_ALERTS = 1000;

const idsAlerts     = [];
const idsByProto    = {};
const idsBySeverity = { 1: 0, 2: 0, 3: 0 };
const idsBySig      = {};
const idsByCategory = {};
const idsBySrcIp    = {};
const idsHourly     = new Array(24).fill(0);
let   idsTotalCount = 0;
const idsWsClients  = new Set();

function parseEveAlert(line) {
  try {
    const ev = JSON.parse(line);
    if (ev.event_type !== 'alert') return null;
    const a = ev.alert || {};
    return {
      ts:       ev.timestamp ? ev.timestamp.slice(0, 19).replace('T', ' ') : '',
      srcIp:    ev.src_ip    || '',
      srcPort:  ev.src_port  || 0,
      dstIp:    ev.dest_ip   || '',
      dstPort:  ev.dest_port || 0,
      proto:    ev.proto     || '',
      sig:      a.signature  || '',
      sigId:    a.signature_id || 0,
      category: a.category   || '',
      severity: Math.min(3, Math.max(1, a.severity || 3)),
      action:   a.action     || 'allowed',
    };
  } catch (_) { return null; }
}

function idsIngestAlert(alert) {
  idsByProto[alert.proto]       = (idsByProto[alert.proto]       || 0) + 1;
  idsBySeverity[alert.severity] = (idsBySeverity[alert.severity] || 0) + 1;
  if (alert.sig)      idsBySig[alert.sig]           = (idsBySig[alert.sig]           || 0) + 1;
  if (alert.category) idsByCategory[alert.category] = (idsByCategory[alert.category] || 0) + 1;
  idsTotalCount++;
  if (alert.srcIp) {
    if (!idsBySrcIp[alert.srcIp]) idsBySrcIp[alert.srcIp] = { count: 0, lastSeen: '', geo: {} };
    idsBySrcIp[alert.srcIp].count++;
    idsBySrcIp[alert.srcIp].lastSeen = alert.ts;
  }
  idsHourly[new Date().getHours()] = (idsHourly[new Date().getHours()] || 0) + 1;
  idsAlerts.push(alert);
  if (idsAlerts.length > IDS_MAX_ALERTS) idsAlerts.shift();
}

async function idsEnrichAndBroadcast(alert) {
  if (alert.srcIp) {
    const geo = await lookupGeo(alert.srcIp);
    alert.countryCode = geo.countryCode;
    alert.country     = geo.country;
    alert.city        = geo.city;
    alert.lat         = geo.lat;
    alert.lon         = geo.lon;
    if (idsBySrcIp[alert.srcIp]) idsBySrcIp[alert.srcIp].geo = geo;
  }
  const msg = JSON.stringify(alert);
  idsWsClients.forEach(ws => { try { if (ws.readyState === ws.OPEN) ws.send(msg); } catch(_) {} });
}

// Startup: seed IDS stats from recent EVE log history
(function seedIdsHistory() {
  try {
    lastLines(IDS_EVE_LOG, 500).forEach(line => {
      const a = parseEveAlert(line); if (a) idsIngestAlert(a);
    });
    const uniqueIps = [...new Set(idsAlerts.map(a => a.srcIp).filter(Boolean))];
    Promise.all(uniqueIps.map(ip => lookupGeo(ip).then(geo => {
      idsAlerts.filter(a => a.srcIp === ip).forEach(a => {
        a.countryCode = geo.countryCode; a.country = geo.country;
        a.city = geo.city; a.lat = geo.lat; a.lon = geo.lon;
      });
      if (idsBySrcIp[ip]) idsBySrcIp[ip].geo = geo;
    }))).catch(() => {});
  } catch (_) {}
})();

// Background scan for any unprocessed rotated log files
setImmediate(() => { scanAndHarvest().catch(() => {}); });

// ── Read last N lines from end of file ───────────────────────────────────────
function lastLines(filePath, n) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.size) return [];
    const chunkSize = Math.min(65536, stat.size);
    const buf = Buffer.alloc(chunkSize);
    const fd  = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, chunkSize, stat.size - chunkSize);
    fs.closeSync(fd);
    const parts = buf.toString('utf8').split('\n');
    // Drop the first element — it is likely a truncated partial line from the chunk boundary
    const lines = (stat.size > chunkSize ? parts.slice(1) : parts);
    return lines.filter(l => l.trim()).slice(-n);
  } catch (_) { return []; }
}

const MONTH_NUM = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
function logLineSortKey(line) {
  const m = line.match(/\[(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+)/);
  if (!m) return '';
  return m[3] + (MONTH_NUM[m[2]] || '00') + m[1].padStart(2, '0') + m[4] + m[5] + m[6];
}

// ── Tail a file, call onLine for each new line ───────────────────────────────
function tailFile(filePath, onLine) {
  let pos = 0;
  try { pos = fs.statSync(filePath).size; } catch (_) {}

  function read() {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size < pos) pos = 0;
      if (stat.size === pos) return;
      const fd  = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - pos);
      fs.readSync(fd, buf, 0, buf.length, pos);
      fs.closeSync(fd);
      pos = stat.size;
      buf.toString('utf8').split('\n').forEach(l => { if (l.trim()) onLine(l); });
    } catch (_) {}
  }

  let watcher = null;
  try { watcher = fs.watch(filePath, read); watcher.on('error', () => {}); } catch (_) {}
  const interval = setInterval(read, 1000);
  return () => { try { watcher && watcher.close(); } catch (_) {} clearInterval(interval); };
}

// ── UA parser (shared by IP page and bot-data endpoint) ─────────────────────
function parseUA(ua) {
  if (!ua || ua === '-') return { browser: '—', version: '', os: '', bot: false, tool: false };
  const low = ua.toLowerCase();
  const isBot  = /bot|spider|crawler|slurp|scraper|headless|python-requests|python\/|go-http-client|curl\/|wget\/|java\/|okhttp|axios|scrapy|mechanize|libwww|facebookexternalhit|twitterbot|linkedinbot|discordbot|whatsapp|telegram|oai-|gptbot|anthropic|claude|openai|semrush|ahrefs|moz\.com|dotbot|bingpreview|yandex|baidu|duckduck|petalbot|applebot|pingdom|uptimerobot|newrelic|datadog|nagios|masscan|zgrab|nmap|nuclei|sqlmap|nikto|dirbuster|gobuster/.test(low);
  const isTool = !isBot && /curl\/|wget\/|python|go-http|java\/|okhttp|axios|libwww|httpclient/.test(low);
  let browser = '', version = '', os = '';
  if (isBot || isTool) {
    const m = ua.match(/([A-Za-z][A-Za-z0-9_\-]*(?:[Bb]ot|[Ss]pider|[Cc]rawler|[Ss]craper))[\/\s]?([\d.]*)/i)
           || ua.match(/(OAI-[A-Za-z]+|GPTBot|anthropic-ai|ClaudeBot)[\/\s]?([\d.]*)/i)
           || ua.match(/(python-requests|curl|wget|Go-http-client|axios|java)[\/\s]?([\d.]*)/i)
           || ua.match(/^([A-Za-z][A-Za-z0-9_\-]+)[\/\s]?([\d.]+)/);
    browser = m ? m[1] : ua.slice(0, 32);
    version = m ? (m[2]||'').split('.')[0] : '';
  }
  if (!browser) {
    if      (/Edg\//.test(ua))     { const m=ua.match(/Edg\/([\d]+)/);        browser='Edge';    version=m?m[1]:''; }
    else if (/OPR\//.test(ua))     { const m=ua.match(/OPR\/([\d]+)/);         browser='Opera';   version=m?m[1]:''; }
    else if (/YaBrowser/.test(ua)) { const m=ua.match(/YaBrowser\/([\d]+)/);   browser='Yandex';  version=m?m[1]:''; }
    else if (/SamsungBrowser/.test(ua)) { const m=ua.match(/SamsungBrowser\/([\d]+)/); browser='Samsung'; version=m?m[1]:''; }
    else if (/Firefox\//.test(ua)) { const m=ua.match(/Firefox\/([\d]+)/);     browser='Firefox'; version=m?m[1]:''; }
    else if (/Chrome\//.test(ua))  { const m=ua.match(/Chrome\/([\d]+)/);      browser='Chrome';  version=m?m[1]:''; }
    else if (/Safari\//.test(ua))  { const m=ua.match(/Version\/([\d]+)/);     browser='Safari';  version=m?m[1]:''; }
    else if (/MSIE|Trident/.test(ua)) { browser='IE'; }
    else { browser = ua.slice(0,28); }
  }
  if      (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT/.test(ua))    os = 'Windows';
  else if (/iPhone/.test(ua))        os = 'iOS';
  else if (/iPad/.test(ua))          os = 'iPadOS';
  else if (/Android/.test(ua))       { const m=ua.match(/Android ([\d.]+)/); os='Android'+(m?' '+m[1]:''); }
  else if (/Macintosh/.test(ua))     { const m=ua.match(/Mac OS X ([\d_]+)/); const v=m?m[1].replace(/_/g,'.'):''; os='macOS'+(v?' '+v:''); }
  else if (/Linux/.test(ua))         os = 'Linux';
  else if (/CrOS/.test(ua))          os = 'ChromeOS';
  return { browser, version, os, bot: isBot, tool: isTool };
}

// ── Parse nginx combined log line ────────────────────────────────────────────
function parseLine(raw) {
  const m = raw.match(
    /^(\S+)\s+-\s+\S+\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"/
  );
  if (!m) return { raw };
  const [, ip, ts, req, status, bytes, ref, ua] = m;
  const [method, urlPath] = req ? req.split(' ') : ['-', '-'];
  return { ip, ts, method, path: urlPath, status: +status, bytes: +bytes, ref, ua };
}

// ── HTML ─────────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>logs.ximg.app</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%230d1117'/><text x='16' y='22' font-size='18' text-anchor='middle' fill='%2300ff41' font-family='monospace' font-weight='bold'>▶</text></svg>">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0d1117;--green:#00ff41;--dim:#484f58;--text:#c9d1d9}
    body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;
      height:100vh;display:flex;flex-direction:column;overflow:hidden}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:100;
      background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)}

    .toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:.4rem;padding:.5rem 1rem;
      background:rgba(0,0,0,.3);border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
    .tab{font-size:.75rem;padding:.25rem .65rem;border-radius:6px;cursor:pointer;
      border:1px solid rgba(255,255,255,.08);background:transparent;color:var(--dim);
      font-family:'Courier New',monospace;transition:all .2s;white-space:nowrap}
    .tab.active{color:var(--green);border-color:rgba(0,255,65,.4);background:rgba(0,255,65,.07)}
    .tab:hover:not(.active){color:var(--text);border-color:rgba(255,255,255,.15)}
    .stats{margin-left:auto;display:flex;gap:1.25rem;font-size:.75rem;color:var(--dim)}
    .stat-val{color:var(--text)}
    #pause-btn{font-size:.75rem;padding:.25rem .7rem;border-radius:5px;cursor:pointer;
      border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);
      color:var(--dim);font-family:'Courier New',monospace;transition:all .2s}
    #pause-btn:hover{color:var(--text);border-color:rgba(255,255,255,.2)}
    #pause-btn.paused{color:#facc15;border-color:rgba(250,204,21,.4);background:rgba(250,204,21,.07)}

    #log-container{flex:1;overflow-y:auto;padding:.75rem 1rem 1rem;font-size:.78rem;
      line-height:1.7;scroll-behavior:smooth}
    #log-container::-webkit-scrollbar{width:6px}
    #log-container::-webkit-scrollbar-track{background:transparent}
    #log-container::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}

    #ssh-container{flex:1;overflow:hidden;display:none;flex-direction:row}
    #ssh-list{width:280px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.06);
      overflow-y:auto;padding:.5rem}
    #ssh-list::-webkit-scrollbar{width:4px}
    #ssh-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
    .ssh-session-item{padding:.45rem .7rem;border-radius:5px;cursor:pointer;font-size:.75rem;
      border:1px solid transparent;transition:all .15s;margin-bottom:3px}
    .ssh-session-item:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)}
    .ssh-session-item.active{background:rgba(0,255,65,.06);border-color:rgba(0,255,65,.3);color:var(--green)}
    .ssh-session-name{color:var(--text);word-break:break-all;display:flex;align-items:baseline;gap:.4rem}
    .ssh-flag{font-size:1rem;line-height:1;flex-shrink:0}
    .ssh-session-meta{color:var(--dim);font-size:.68rem;margin-top:1px}
    #ssh-right{flex:1;overflow:hidden;display:flex;flex-direction:column}
    #ssh-content{flex:1;overflow-y:auto;padding:1rem;font-size:.76rem;line-height:1.6;
      white-space:pre-wrap;word-break:break-all}
    #ssh-content::-webkit-scrollbar{width:6px}
    #ssh-content::-webkit-scrollbar-track{background:transparent}
    #ssh-content::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
    .ssh-placeholder{color:var(--dim);padding:2rem;text-align:center}
    .ssh-empty{color:var(--dim);padding:1rem;font-size:.75rem}

    #dl-container{flex:1;overflow:hidden;display:none;flex-direction:column}
    #dl-toolbar{display:flex;align-items:center;gap:.75rem;padding:.5rem .75rem;border-bottom:1px solid rgba(255,255,255,.06);font-size:.75rem;flex-shrink:0}
    #dl-count{color:var(--dim)}
    #dl-table-wrap{flex:1;overflow-y:auto;padding:.5rem .75rem}
    #dl-table-wrap::-webkit-scrollbar{width:6px}
    #dl-table-wrap::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
    .dl-table{width:100%;border-collapse:collapse;font-size:.76rem}
    .dl-table th{color:var(--dim);font-weight:600;text-align:left;padding:.3rem .5rem;border-bottom:1px solid rgba(255,255,255,.08);white-space:nowrap;position:sticky;top:0;background:#0d0d16;z-index:1}
    .dl-table td{padding:.35rem .5rem;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:top;word-break:break-word}
    .dl-table tr:hover td{background:rgba(255,255,255,.025)}
    .dl-table tr.new-row td{animation:flashIn .5s ease}
    .dl-img{color:#38bdf8;font-family:\'Courier New\',monospace}
    .dl-ip{color:var(--dim)}
    .dl-num{color:#ffa657;text-align:center}
    .dl-table th.dl-num-h{text-align:center}
    .dl-outcome-downloaded{color:var(--green)}
    .dl-outcome-ttl{color:var(--dim)}
    .dl-empty{color:var(--dim);padding:2rem;text-align:center;font-size:.8rem}
    .log-line{display:grid;grid-template-columns:215px 130px 160px 48px 55px 72px 1fr;gap:.75rem;
      padding:.1rem .25rem;border-radius:3px;transition:background .15s;overflow:hidden}
    .log-line > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .log-line:hover{background:rgba(255,255,255,.03)}
    .log-line.new{animation:flashIn .4s ease}
    @keyframes flashIn{from{background:rgba(0,255,65,.08)}to{background:transparent}}
    .col-ts{color:var(--dim)}
    .col-ip{color:#79c0ff}
    .ip-link{color:inherit;text-decoration:none}
    .ip-link:hover{text-decoration:underline;color:#fff}
    .col-geo{color:#a5b4fc;font-size:.75rem}
    .col-bytes{color:#94a3b8;text-align:right;font-size:.74rem}
    .col-path{color:var(--text)}
    .s2xx{color:#00ff41}.s3xx{color:#06b6d4}.s4xx{color:#facc15}.s5xx{color:#ff7b72}.s0{color:var(--dim)}
    .col-app{color:var(--dim);font-size:.72rem}
    .raw-line{color:var(--dim);font-size:.75rem;padding:.1rem .25rem}
    .connecting{color:var(--dim);padding:1rem;animation:blink2 1s step-end infinite}
    @keyframes blink2{0%,100%{opacity:1}50%{opacity:.3}}

    /* ── Global Map ─────────────────────────────────────────────────────── */
    /* ── Bots tab ───────────────────────────────────────────────────────── */
    #bot-container{flex:1;overflow:hidden;display:none;flex-direction:column}
    #bot-header{display:flex;align-items:center;gap:.75rem;padding:.45rem .75rem;
      border-bottom:1px solid rgba(255,255,255,.06);font-size:.73rem;color:var(--dim);flex-shrink:0;flex-wrap:wrap}
    #bot-header .bh-val{color:var(--text);font-weight:700}
    #bot-body{flex:1;display:flex;overflow:hidden;gap:0}
    #bot-left{width:220px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.06);
      overflow-y:auto;padding:.5rem .4rem}
    #bot-left::-webkit-scrollbar{width:4px}
    #bot-left::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
    #bot-right{flex:1;overflow-y:auto;padding:.5rem .75rem}
    #bot-right::-webkit-scrollbar{width:6px}
    #bot-right::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
    .bot-type-item{padding:.3rem .5rem;border-radius:5px;font-size:.73rem;display:flex;justify-content:space-between;
      align-items:center;cursor:pointer;transition:background .12s;border:1px solid transparent;margin-bottom:2px}
    .bot-type-item:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.07)}
    .bot-type-item.active{background:rgba(251,146,60,.08);border-color:rgba(251,146,60,.3)}
    .bot-type-name{color:#fb923c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
    .bot-type-count{color:var(--dim);font-size:.68rem;flex-shrink:0;margin-left:.4rem}
    .bot-section-label{font-size:.62rem;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);
      padding:.4rem .5rem .2rem;margin-top:.3rem}
    .bot-table{width:100%;border-collapse:collapse;font-size:.76rem}
    .bot-table th{color:var(--dim);font-size:.67rem;text-transform:uppercase;letter-spacing:.07em;
      text-align:left;padding:.3rem .4rem;border-bottom:1px solid rgba(255,255,255,.07);
      position:sticky;top:0;background:#0d1117;z-index:1}
    .bot-table td{padding:.38rem .4rem;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
    .bot-table tr:hover td{background:rgba(255,255,255,.025)}
    .bot-ip{color:#79c0ff;text-decoration:none;font-size:.76rem}
    .bot-ip:hover{text-decoration:underline;color:#fff}
    .bot-geo{color:#a5b4fc;font-size:.71rem}
    .bot-badge{display:inline-block;border-radius:4px;padding:.08rem .38rem;font-size:.68rem;white-space:nowrap}
    .bot-badge.isbot{color:#fb923c;background:rgba(251,146,60,.12);border:1px solid rgba(251,146,60,.2)}
    .bot-badge.istool{color:#facc15;background:rgba(250,204,21,.1);border:1px solid rgba(250,204,21,.2)}
    .bot-hits{color:#c9d1d9;text-align:right;font-size:.74rem}
    .bot-sites{color:var(--dim);font-size:.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}
    .bot-empty{color:var(--dim);padding:2rem;text-align:center;font-size:.8rem}

#map-container{flex:1;overflow:hidden;display:none;flex-direction:column;position:relative}
    #map-header{display:flex;align-items:center;gap:.9rem;padding:.4rem .75rem;
      border-bottom:1px solid rgba(255,255,255,.06);font-size:.73rem;color:var(--dim);flex-shrink:0;flex-wrap:wrap}
    #map-header .mh-stat{color:var(--text);font-weight:700}
    #map-refresh{background:none;border:1px solid rgba(255,255,255,.12);border-radius:4px;
      color:var(--dim);font-family:\'Courier New\',monospace;font-size:.72rem;
      padding:.2rem .55rem;cursor:pointer;margin-left:.25rem}
    #map-refresh:hover{color:var(--text);border-color:rgba(255,255,255,.2)}
    #mh-ts{color:var(--dim);font-size:.68rem;margin-left:auto}
    #map-body{flex:1;display:flex;overflow:hidden;position:relative}
    #map-canvas{flex:1;cursor:crosshair;display:block;min-width:0}
    #map-detail{width:300px;flex-shrink:0;border-left:1px solid rgba(0,255,65,.12);
      overflow-y:auto;padding:1rem .9rem;display:none;flex-direction:column;gap:.8rem;
      background:rgba(0,0,0,.25)}
    #map-detail::-webkit-scrollbar{width:4px}
    #map-detail::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
    .md-ip{font-size:1rem;color:var(--green);font-weight:700;margin-bottom:.1rem;word-break:break-all}
    .md-location{font-size:.8rem;color:#a5b4fc;margin-bottom:.4rem}
    .md-count{font-size:.75rem;color:var(--dim)}
    .md-section{font-size:.65rem;color:var(--dim);text-transform:uppercase;letter-spacing:.07em;
      margin-bottom:.35rem;padding-bottom:.25rem;border-bottom:1px solid rgba(255,255,255,.06)}
    .md-app-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.22rem;font-size:.72rem}
    .md-app-name{width:84px;flex-shrink:0;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .md-app-bar-wrap{flex:1;height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden}
    .md-app-bar{height:100%;background:var(--green);border-radius:3px}
    .md-app-count{width:28px;text-align:right;color:var(--dim);font-size:.67rem;flex-shrink:0}
    .md-url{font-size:.67rem;color:#79c0ff;word-break:break-all;padding:.12rem 0;
      border-bottom:1px solid rgba(255,255,255,.04)}
    .md-url:last-child{border-bottom:none}
    #map-tooltip{position:fixed;pointer-events:none;display:none;
      background:rgba(5,12,22,.96);border:1px solid rgba(0,255,65,.2);
      border-radius:8px;padding:.5rem .75rem;font-size:.72rem;z-index:500;
      max-width:230px;box-shadow:0 8px 32px rgba(0,0,0,.7)}
    .tt-ip{color:var(--green);font-weight:700;font-size:.76rem}
    .tt-loc{color:#a5b4fc;margin-top:.1rem}
    .tt-count{color:var(--dim);margin-top:.1rem;font-size:.68rem}
    #map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      color:var(--dim);font-size:.85rem;pointer-events:none;animation:blink2 1.2s step-end infinite}
    #map-zoom-btns{position:absolute;bottom:12px;right:12px;display:flex;flex-direction:column;gap:4px;z-index:10}
    .mz-btn{width:28px;height:28px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.12);
      border-radius:5px;color:var(--dim);cursor:pointer;font-size:1rem;line-height:1;
      display:flex;align-items:center;justify-content:center}
    .mz-btn:hover{color:var(--text);border-color:rgba(255,255,255,.25)}

    .site-picker{position:relative}
    #site-picker-btn{font-size:.75rem;padding:.25rem .65rem;border-radius:6px;cursor:pointer;
      border:1px solid rgba(255,255,255,.08);background:transparent;color:var(--dim);
      font-family:'Courier New',monospace;transition:all .2s;white-space:nowrap}
    #site-picker-btn:hover{color:var(--text);border-color:rgba(255,255,255,.15)}
    #site-picker-btn.has-selection{color:var(--green);border-color:rgba(0,255,65,.4);background:rgba(0,255,65,.07)}
    .site-dropdown{display:none;position:absolute;top:calc(100% + 5px);left:0;z-index:400;
      background:#0d0d16;border:1px solid rgba(255,255,255,.1);border-radius:10px;
      padding:.35rem;box-shadow:0 16px 40px rgba(0,0,0,.75);min-width:160px}
    .site-dropdown.open{display:block}
    .site-search{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
      border-radius:6px;color:var(--text);font-family:'Courier New',monospace;font-size:.73rem;
      padding:.25rem .5rem;margin-bottom:.3rem;outline:none}
    .site-search::placeholder{color:var(--dim)}
    .site-list{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:1px}
    .site-list::-webkit-scrollbar{width:4px}
    .site-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
    .site-opt{display:block;width:100%;text-align:left;background:transparent;border:none;
      color:var(--dim);font-family:'Courier New',monospace;font-size:.73rem;font-weight:600;
      padding:.3rem .6rem;border-radius:6px;cursor:pointer;white-space:nowrap;transition:background .1s}
    .site-opt:hover{background:rgba(255,255,255,.08);color:#fff}
    .site-opt.active{color:var(--green)}
    .site-opt.hidden{display:none}
  </style>
</head>
<body>
  <script src="/shared/nav.js?v=2"></script>

  <div class="toolbar">
    <button class="tab active" data-site="all">[all]</button>
    <div class="site-picker" id="site-picker">
      <button class="tab" id="site-picker-btn">☰ app ▾</button>
      <div class="site-dropdown" id="site-dropdown">
        <input class="site-search" id="site-search" type="text" placeholder="filter…" autocomplete="off">
        <div class="site-list" id="site-list">
          <button class="site-opt" data-site="ai">ai</button>
          <button class="site-opt" data-site="america">america</button>
          <button class="site-opt" data-site="ansible">ansible</button>
          <button class="site-opt" data-site="apps">apps</button>
          <button class="site-opt" data-site="ascii">ascii</button>
          <button class="site-opt" data-site="aztec">aztec</button>
          <button class="site-opt" data-site="babylon">babylon</button>
          <button class="site-opt" data-site="bash">bash</button>
          <button class="site-opt" data-site="bsd">bsd</button>
          <button class="site-opt" data-site="gentoo">gentoo</button>
          <button class="site-opt" data-site="esp32">esp32</button>
          <button class="site-opt" data-site="ca-fetcher">ca-fetcher</button>
          <button class="site-opt" data-site="proc-trace-exec">proc-trace-exec</button>
          <button class="site-opt" data-site="proc-trace-dns">proc-trace-dns</button>
          <button class="site-opt" data-site="proc-trace-net">proc-trace-net</button>
          <button class="site-opt" data-site="proc-trace-tls">proc-trace-tls</button>
          <button class="site-opt" data-site="esp32-s3-lcd">esp32-s3-lcd</button>
          <button class="site-opt" data-site="tls-ca-fetch">tls-ca-fetch</button>
          <button class="site-opt" data-site="github-stats">github-stats</button>
          <button class="site-opt" data-site="ip">ip intel</button>
          <button class="site-opt" data-site="conway">conway</button>
          <button class="site-opt" data-site="butterfly">butterfly</button>
          <button class="site-opt" data-site="change">change</button>
          <button class="site-opt" data-site="clamav">clamav</button>
          <button class="site-opt" data-site="chess">chess</button>
          <button class="site-opt" data-site="chinese">chinese</button>
          <button class="site-opt" data-site="claude">claude</button>
          <button class="site-opt" data-site="cnc">cnc</button>
          <button class="site-opt" data-site="coffee">coffee</button>
          <button class="site-opt" data-site="cia">cia</button>
          <button class="site-opt" data-site="coldwar">coldwar</button>
          <button class="site-opt" data-site="cuba">cuba</button>
          <button class="site-opt" data-site="communism">communism</button>
          <button class="site-opt" data-site="computers">computers</button>
          <button class="site-opt" data-site="crypto">crypto</button>
          <button class="site-opt" data-site="dns">dns</button>
          <button class="site-opt" data-site="docker">docker</button>
          <button class="site-opt" data-site="doom">doom</button>
          <button class="site-opt" data-site="fidonet">fidonet</button>
          <button class="site-opt" data-site="florida">florida</button>
          <button class="site-opt" data-site="git">git</button>
          <button class="site-opt" data-site="grilling">grilling</button>
          <button class="site-opt" data-site="guns">guns</button>
          <button class="site-opt" data-site="http">http</button>
          <button class="site-opt" data-site="ids">ids</button>
          <button class="site-opt" data-site="india">india</button>
          <button class="site-opt" data-site="internet">internet</button>
          <button class="site-opt" data-site="japan">japan</button>
          <button class="site-opt" data-site="json">json</button>
          <button class="site-opt" data-site="kart">kart</button>
          <button class="site-opt" data-site="kombat">kombat</button>
          <button class="site-opt" data-site="linux">linux</button>
          <button class="site-opt" data-site="logs">logs</button>
          <button class="site-opt" data-site="mac">mac</button>
          <button class="site-opt" data-site="mail">mail</button>
          <button class="site-opt" data-site="mario">mario</button>
          <button class="site-opt" data-site="medieval">medieval</button>
          <button class="site-opt" data-site="monkey">monkey</button>
          <button class="site-opt" data-site="moto">moto</button>
          <button class="site-opt" data-site="nav">nav</button>
          <button class="site-opt" data-site="nintendo">nintendo</button>
          <button class="site-opt" data-site="pal">pal</button>
          <button class="site-opt" data-site="passwords">passwords</button>
          <button class="site-opt" data-site="pirates">pirates</button>
          <button class="site-opt" data-site="pizza">pizza</button>
          <button class="site-opt" data-site="sushi">sushi</button>
          <button class="site-opt" data-site="tacos">tacos</button>
          <button class="site-opt" data-site="bbq">bbq</button>
          <button class="site-opt" data-site="ramen">ramen</button>
          <button class="site-opt" data-site="pasta">pasta</button>
          <button class="site-opt" data-site="thai">thai</button>
          <button class="site-opt" data-site="baking">baking</button>
          <button class="site-opt" data-site="smoker">smoker</button>
          <button class="site-opt" data-site="knife">knife</button>
          <button class="site-opt" data-site="ferment">ferment</button>
          <button class="site-opt" data-site="wine">wine</button>
          <button class="site-opt" data-site="beer">beer</button>
          <button class="site-opt" data-site="cocktails">cocktails</button>
          <button class="site-opt" data-site="tea">tea</button>
          <button class="site-opt" data-site="calories">calories</button>
          <button class="site-opt" data-site="recipe">recipe</button>
          <button class="site-opt" data-site="spice">spice</button>
          <button class="site-opt" data-site="market">market</button>
          <button class="site-opt" data-site="poker">poker</button>
          <button class="site-opt" data-site="programming">programming</button>
          <button class="site-opt" data-site="ps1">ps1</button>
          <button class="site-opt" data-site="dockerimage">dockerimage</button>
          <button class="site-opt" data-site="dockerimage.dev">dockerimage.dev</button>
          <button class="site-opt" data-site="dockerimagedownloader">dockerimagedownloader</button>
          <button class="site-opt" data-site="githubstars">githubstars</button>
          <button class="site-opt" data-site="templeos">templeos</button>
          <button class="site-opt" data-site="smtp">smtp</button>
          <button class="site-opt" data-site="video">video</button>
          <button class="site-opt" data-site="chmod">chmod</button>
          <button class="site-opt" data-site="iptables">iptables</button>
          <button class="site-opt" data-site="tls">tls</button>
          <button class="site-opt" data-site="bgp">bgp</button>
          <button class="site-opt" data-site="makefile">makefile</button>
          <button class="site-opt" data-site="utf8">utf8</button>
          <button class="site-opt" data-site="french">french</button>
          <button class="site-opt" data-site="russianrev">russianrev</button>
          <button class="site-opt" data-site="napoleon">napoleon</button>
          <button class="site-opt" data-site="british">british</button>
          <button class="site-opt" data-site="spacerace">spacerace</button>
          <button class="site-opt" data-site="quake">quake</button>
          <button class="site-opt" data-site="claudemd">claudemd</button>
          <button class="site-opt" data-site="network">network</button>
          <button class="site-opt" data-site="request">request</button>
          <button class="site-opt" data-site="readme">readme</button>
          <button class="site-opt" data-site="rx">rx</button>
          <button class="site-opt" data-site="simcity">simcity</button>
          <button class="site-opt" data-site="sql">sql</button>
          <button class="site-opt" data-site="ssh">ssh</button>
          <button class="site-opt" data-site="stats">stats</button>
          <button class="site-opt" data-site="suricata">suricata</button>
          <button class="site-opt" data-site="systemd">systemd</button>
          <button class="site-opt" data-site="tampa">tampa</button>
          <button class="site-opt" data-site="tmux">tmux</button>
          <button class="site-opt" data-site="trump">trump</button>
          <button class="site-opt" data-site="unix">unix</button>
          <button class="site-opt" data-site="vim">vim</button>
          <button class="site-opt" data-site="vr">vr</button>
          <button class="site-opt" data-site="vt101">vt101</button>
          <button class="site-opt" data-site="warcraft">warcraft</button>
          <button class="site-opt" data-site="wargames">wargames</button>
          <button class="site-opt" data-site="wood">wood</button>
          <button class="site-opt" data-site="ximg">ximg</button>
          <button class="site-opt" data-site="ximg-app">ximg-app</button>
          <button class="site-opt" data-site="algorithms">algorithms</button>
          <button class="site-opt" data-site="os">os</button>
          <button class="site-opt" data-site="security">security</button>
          <button class="site-opt" data-site="database">database</button>
          <button class="site-opt" data-site="playground">playground</button>
          <button class="site-opt" data-site="tokens">tokens</button>
          <button class="site-opt" data-site="temperature">temperature</button>
          <button class="site-opt" data-site="embeddings">embeddings</button>
          <button class="site-opt" data-site="agents">agents</button>
          <button class="site-opt" data-site="visualize">visualize</button>
          <button class="site-opt" data-site="statslab">statslab</button>
          <button class="site-opt" data-site="regression">regression</button>
          <button class="site-opt" data-site="probability">probability</button>
          <button class="site-opt" data-site="systemdesign">systemdesign</button>
          <button class="site-opt" data-site="loadbalancer">loadbalancer</button>
          <button class="site-opt" data-site="cdn">cdn</button>
          <button class="site-opt" data-site="queue">queue</button>
          <button class="site-opt" data-site="terminal">terminal</button>
          <button class="site-opt" data-site="punch">punch</button>
          <button class="site-opt" data-site="circuit">circuit</button>
          <button class="site-opt" data-site="compiler">compiler</button>
          <button class="site-opt" data-site="logic">logic</button>
          <button class="site-opt" data-site="protocol">protocol</button>
          <button class="site-opt" data-site="mainframe">mainframe</button>
          <button class="site-opt" data-site="arpanet">arpanet</button>
          <button class="site-opt" data-site="regex">regex</button>
          <button class="site-opt" data-site="binary">binary</button>
          <button class="site-opt" data-site="jwt">jwt</button>
          <button class="site-opt" data-site="cron">cron</button>
          <button class="site-opt" data-site="color">color</button>
          <button class="site-opt" data-site="compound">compound</button>
          <button class="site-opt" data-site="savings">savings</button>
          <button class="site-opt" data-site="tax">tax</button>
          <button class="site-opt" data-site="stocks">stocks</button>
          <button class="site-opt" data-site="options">options</button>
          <button class="site-opt" data-site="forex">forex</button>
          <button class="site-opt" data-site="dcf">dcf</button>
          <button class="site-opt" data-site="mortgage">mortgage</button>
          <button class="site-opt" data-site="retire">retire</button>
          <button class="site-opt" data-site="inflation">inflation</button>
          <button class="site-opt" data-site="debt">debt</button>
          <button class="site-opt" data-site="budget">budget</button>
          <button class="site-opt" data-site="base64">base64</button>
          <button class="site-opt" data-site="hash">hash</button>
          <button class="site-opt" data-site="diff">diff</button>
          <button class="site-opt" data-site="url">url</button>
          <button class="site-opt" data-site="curl">curl</button>
          <button class="site-opt" data-site="cidr">cidr</button>
          <button class="site-opt" data-site="uuid">uuid</button>
          <button class="site-opt" data-site="lorem">lorem</button>
          <button class="site-opt" data-site="csv">csv</button>
          <button class="site-opt" data-site="markdown">markdown</button>
          <button class="site-opt" data-site="password">password</button>
          <button class="site-opt" data-site="ssl">ssl</button>
          <button class="site-opt" data-site="epoch">epoch</button>
          <button class="site-opt" data-site="timespan">timespan</button>
          <button class="site-opt" data-site="555timer">555timer</button>
          <button class="site-opt" data-site="arduino">arduino</button>
          <button class="site-opt" data-site="battery">battery</button>
          <button class="site-opt" data-site="capacitor">capacitor</button>
          <button class="site-opt" data-site="fpga">fpga</button>
          <button class="site-opt" data-site="impedance">impedance</button>
          <button class="site-opt" data-site="ohms">ohms</button>
          <button class="site-opt" data-site="opamp">opamp</button>
          <button class="site-opt" data-site="oscilloscope">oscilloscope</button>
          <button class="site-opt" data-site="pcb">pcb</button>
          <button class="site-opt" data-site="pinout">pinout</button>
          <button class="site-opt" data-site="psu">psu</button>
          <button class="site-opt" data-site="pwm">pwm</button>
          <button class="site-opt" data-site="resistor">resistor</button>
          <button class="site-opt" data-site="spectrum">spectrum</button>
          <button class="site-opt" data-site="spi">spi</button>
          <button class="site-opt" data-site="uart">uart</button>
          <button class="site-opt" data-site="voltage">voltage</button>
          <button class="site-opt" data-site="antenna">antenna</button>
          <button class="site-opt" data-site="aztec">aztec</button>
          <button class="site-opt" data-site="babylon">babylon</button>
          <button class="site-opt" data-site="bbs">bbs</button>
          <button class="site-opt" data-site="civilwar">civilwar</button>
          <button class="site-opt" data-site="colonial">colonial</button>
          <button class="site-opt" data-site="commodore">commodore</button>
          <button class="site-opt" data-site="crusades">crusades</button>
          <button class="site-opt" data-site="dos">dos</button>
          <button class="site-opt" data-site="egypt">egypt</button>
          <button class="site-opt" data-site="greece">greece</button>
          <button class="site-opt" data-site="industrial">industrial</button>
          <button class="site-opt" data-site="modem">modem</button>
          <button class="site-opt" data-site="mongols">mongols</button>
          <button class="site-opt" data-site="ottoman">ottoman</button>
          <button class="site-opt" data-site="renaissance">renaissance</button>
          <button class="site-opt" data-site="revolution">revolution</button>
          <button class="site-opt" data-site="rome">rome</button>
          <button class="site-opt" data-site="samurai">samurai</button>
          <button class="site-opt" data-site="silkroad">silkroad</button>
          <button class="site-opt" data-site="vikings">vikings</button>
          <button class="site-opt" data-site="ww1">ww1</button>
          <button class="site-opt" data-site="ww2">ww2</button>
          <button class="site-opt" data-site="architecture">architecture</button>
          <button class="site-opt" data-site="bourbon">bourbon</button>
          <button class="site-opt" data-site="tetris">tetris</button>
          <button class="site-opt" data-site="python-bundler">python-bundler</button>
          <button class="site-opt" data-site="nodejs-bundler">nodejs-bundler</button>
          <button class="site-opt" data-site="go-bundler">go-bundler</button>
          <button class="site-opt" data-site="ansible-bundler">ansible-bundler</button>
          <button class="site-opt" data-site="apt-bundler">apt-bundler</button>
          <button class="site-opt" data-site="rpm-bundler">rpm-bundler</button>
          <button class="site-opt" data-site="nuget-bundler">nuget-bundler</button>
          <button class="site-opt" data-site="iso">iso</button>
          <button class="site-opt" data-site="honeypot">honeypot</button>
          <button class="site-opt" data-site="bundler-info">bundler-info</button>
          <button class="site-opt" data-site="devtools-info">devtools-info</button>
          <button class="site-opt" data-site="projects-info">projects-info</button>
          <button class="site-opt" data-site="yaml">yaml</button>
          <button class="site-opt" data-site="zsh">zsh</button>
        </div>
      </div>
    </div>
    <button class="tab" id="ssh-tab">honeypot sessions</button>
    <button class="tab" id="dl-tab">bundler downloads</button>
    <button class="tab" id="bot-tab">🤖 bots</button>
    <button class="tab" id="map-tab">🌍 global map</button>
<div class="stats">
      <span>total <span class="stat-val" id="st-total">0</span></span>
      <span>2xx <span class="stat-val s2xx" id="st-2xx">0</span></span>
      <span>3xx <span class="stat-val s3xx" id="st-3xx">0</span></span>
      <span>4xx <span class="stat-val s4xx" id="st-4xx">0</span></span>
      <span>5xx <span class="stat-val s5xx" id="st-5xx">0</span></span>
    </div>
    <button id="pause-btn">⏸ pause</button>
    <span id="ip-filter-wrap" style="display:inline-flex;align-items:center;gap:.3rem;margin-left:.3rem">
      <input id="ip-filter" type="text" placeholder="filter IP…" autocomplete="off" spellcheck="false"
        style="font-family:'Courier New',monospace;font-size:.75rem;background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:.25rem .55rem;color:var(--green);
        width:130px;outline:none;transition:border-color .2s" onfocus="this.style.borderColor='rgba(0,255,65,.4)'" onblur="this.style.borderColor='rgba(255,255,255,.1)'">
      <button id="ip-filter-clear" style="display:none;font-size:.7rem;padding:.2rem .45rem;border-radius:4px;
        cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
        color:#586069;font-family:'Courier New',monospace" title="Clear filter">✕</button>
    </span>
  </div>

  <div id="log-container">
    <div class="connecting">connecting…</div>
  </div>

  <div id="ssh-container">
    <div id="ssh-list"><div class="ssh-empty">Loading sessions…</div></div>
    <div id="ssh-right">
      <div id="ssh-content"><div class="ssh-placeholder">← Select a session to view</div></div>
    </div>
  </div>

  <div id="dl-container">
    <div id="dl-toolbar">
      <span id="dl-count">—</span>
      <button onclick="loadBundlerDownloads()" style="background:none;border:1px solid rgba(255,255,255,.12);border-radius:4px;color:#586069;font-family:\'Courier New\',monospace;font-size:.72rem;padding:.2rem .55rem;cursor:pointer">↺ refresh</button>
    </div>
    <div id="dl-table-wrap">
      <table class="dl-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>IP</th>
            <th>Bundler</th>
            <th>Package</th>
            <th>Platform / Distro</th>
            <th class="dl-num-h">Size</th>
          </tr>
        </thead>
        <tbody id="dl-tbody"><tr><td colspan="6" class="dl-empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>

  <div id="bot-container">
    <div id="bot-header">
      <span>bot hits</span> <span class="bh-val" id="bh-hits">—</span>
      <span>unique IPs</span> <span class="bh-val" id="bh-ips">—</span>
      <span>bot types</span> <span class="bh-val" id="bh-types">—</span>
      <button id="bot-refresh" style="margin-left:.5rem;background:none;border:1px solid rgba(255,255,255,.12);border-radius:4px;color:#586069;font-family:\'Courier New\',monospace;font-size:.72rem;padding:.2rem .55rem;cursor:pointer">↺ refresh</button>
    </div>
    <div id="bot-body">
      <div id="bot-left">
        <div class="bot-section-label">bot types</div>
        <div id="bot-type-list"></div>
      </div>
      <div id="bot-right">
        <table class="bot-table">
          <thead><tr>
            <th>IP</th><th>location</th><th>bot / tool</th><th>sites</th><th style="text-align:right">hits</th><th>last seen</th>
          </tr></thead>
          <tbody id="bot-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="map-container">
    <div id="map-header">
      <span class="mh-label">unique IPs</span> <span class="mh-stat" id="mh-ips">—</span>
      <span class="mh-label">countries</span> <span class="mh-stat" id="mh-countries">—</span>
      <span class="mh-label">all-time requests</span> <span class="mh-stat" id="mh-reqs">—</span>
      <button id="map-refresh" onclick="loadMapData()">↺ refresh</button>
      <span id="mh-ts"></span>
    </div>
    <div id="map-body">
      <canvas id="map-canvas"></canvas>
      <div id="map-detail"></div>
      <div id="map-zoom-btns">
        <button class="mz-btn" onclick="mapZoomBtn(1.25)" title="Zoom in">+</button>
        <button class="mz-btn" onclick="mapZoomBtn(0.8)" title="Zoom out">−</button>
        <button class="mz-btn" onclick="mapResetView()" title="Reset view">⌂</button>
      </div>
      <div id="map-loading">Loading…</div>
    </div>
  </div>
  <div id="map-tooltip"></div>


<script>
    const MAX_LINES = 500;
    let currentSite = 'all';
    let ws = null;
    let paused = false;
    let reconnectTimer = null;
    const stats = { total:0, '2xx':0, '3xx':0, '4xx':0, '5xx':0 };

    const container = document.getElementById('log-container');
    const stTotal   = document.getElementById('st-total');
    const st2xx     = document.getElementById('st-2xx');
    const st3xx     = document.getElementById('st-3xx');
    const st4xx     = document.getElementById('st-4xx');
    const st5xx     = document.getElementById('st-5xx');

    function fmtBytes(b) {
      if (!b && b !== 0) return '-';
      if (b < 1024) return b + 'B';
      if (b < 1048576) return (b / 1024).toFixed(1) + 'K';
      return (b / 1048576).toFixed(1) + 'M';
    }

    function esc(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    function fmtLogTs(ts) {
      const m = ts && ts.match(/^(\\d+)\\/(\\w+)\\/(\\d+):(\\d+):(\\d+):(\\d+)\\s+([+-]\\d{4})$/);
      if (!m) return ts || '';
      const [,d,mon,y,hh,mm,ss,tz] = m;
      const off = (parseInt(tz.slice(0,3))*60 + parseInt(tz[0]+tz.slice(3)))*60000;
      const utc = Date.UTC(+y, MONTHS[mon]||0, +d, +hh, +mm, +ss) - off;
      return new Date(utc).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month:'short', day:'numeric',
        hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
      });
    }

    function countryFlag(code) {
      if (!code || code.length !== 2) return '';
      return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)));
    }

    function geoLabel(data) {
      if (!data.countryCode) return '';
      const flag = countryFlag(data.countryCode);
      const place = data.city ? data.city + ', ' + data.country : (data.country || data.countryCode);
      return flag + ' ' + place;
    }

    function statusClass(s) {
      if (!s) return 's0';
      if (s < 300) return 's2xx';
      if (s < 400) return 's3xx';
      if (s < 500) return 's4xx';
      return 's5xx';
    }

    var ipFilter = '';
    var ipFilterEl = document.getElementById('ip-filter');
    var ipFilterClear = document.getElementById('ip-filter-clear');

    ipFilterEl.addEventListener('input', function() {
      ipFilter = this.value.trim();
      ipFilterClear.style.display = ipFilter ? '' : 'none';
      // Re-filter existing lines
      var lines = container.querySelectorAll('.log-line');
      lines.forEach(function(el) {
        var ipSpan = el.querySelector('.col-ip');
        if (!ipSpan) return;
        var lineIp = ipSpan.textContent.trim();
        el.style.display = (!ipFilter || lineIp.indexOf(ipFilter) !== -1) ? '' : 'none';
      });
    });

    ipFilterClear.addEventListener('click', function() {
      ipFilterEl.value = '';
      ipFilter = '';
      this.style.display = 'none';
      container.querySelectorAll('.log-line').forEach(function(el) { el.style.display = ''; });
    });

    // Click IP to filter by it
    container.addEventListener('click', function(e) {
      var link = e.target.closest('.ip-link');
      if (link && e.shiftKey) {
        e.preventDefault();
        var ip = link.textContent.trim();
        ipFilterEl.value = ip;
        ipFilterEl.dispatchEvent(new Event('input'));
      }
    });

    function addLine(data) {
      if (paused) return;
      if (container.querySelector('.connecting')) container.innerHTML = '';
      const el = document.createElement('div');
      if (data.path) {
        const sc = statusClass(data.status);
        el.className = 'log-line new';
        el.innerHTML =
          '<span class="col-ts">'  + esc(fmtLogTs(data.ts))                    + '</span>' +
          '<span class="col-ip"><a class="ip-link" href="/ip/' + encodeURIComponent(data.ip||'') + '">' + esc(data.ip) + '</a></span>' +
          '<span class="col-geo">' + esc(geoLabel(data))                      + '</span>' +
          '<span class="' + sc + '">' + esc(data.status)                      + '</span>' +
          '<span class="col-bytes">' + fmtBytes(data.bytes)                   + '</span>' +
          '<span class="col-app">'  + esc(data.site || '')                    + '</span>' +
          '<span class="col-path">' + esc((data.method||'') + ' ' + (data.path||'')) + '</span>';
        stats.total++;
        const key = Math.floor(data.status / 100) + 'xx';
        if (stats[key] !== undefined) stats[key]++;
        stTotal.textContent = stats.total;
        st2xx.textContent = stats['2xx']; st3xx.textContent = stats['3xx'];
        st4xx.textContent = stats['4xx']; st5xx.textContent = stats['5xx'];
      } else {
        el.className = 'raw-line';
        el.textContent = data.raw || '';
      }
      if (ipFilter && data.ip && data.ip.indexOf(ipFilter) === -1) el.style.display = 'none';
      container.prepend(el);
      while (container.children.length > MAX_LINES) container.removeChild(container.lastChild);
    }

    function connect(site) {
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.close(); }
      container.innerHTML = '<div class="connecting">connecting…</div>';
      stats.total = stats['2xx'] = stats['3xx'] = stats['4xx'] = stats['5xx'] = 0;
      stTotal.textContent = st2xx.textContent = st3xx.textContent = st4xx.textContent = st5xx.textContent = '0';

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host + '/ws?site=' + site);

      ws.onmessage = e => { try { const d = JSON.parse(e.data); if (!d.ping) addLine(d); } catch(_) {} };
      ws.onclose   = ()  => { reconnectTimer = setTimeout(() => connect(site), 3000); };
      ws.onerror   = ()  => { try { ws && ws.close(); } catch(_) {} };
    }

    // [all] button
    document.querySelector('.tab[data-site="all"]').addEventListener('click', () => {
      if (sshMode) leaveSshMode();
      selectSite('all');
    });

    // hamburger site picker
    const pickerBtn  = document.getElementById('site-picker-btn');
    const dropdown   = document.getElementById('site-dropdown');
    const siteSearch = document.getElementById('site-search');
    const siteList   = document.getElementById('site-list');

    pickerBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = dropdown.classList.toggle('open');
      if (open) { siteSearch.value = ''; filterSites(''); siteSearch.focus(); }
    });

    document.addEventListener('click', () => dropdown.classList.remove('open'));
    dropdown.addEventListener('click', e => e.stopPropagation());

    siteSearch.addEventListener('input', () => filterSites(siteSearch.value));

    function filterSites(q) {
      const lq = q.toLowerCase();
      siteList.querySelectorAll('.site-opt').forEach(opt => {
        opt.classList.toggle('hidden', lq && !opt.dataset.site.includes(lq));
      });
    }

    siteList.addEventListener('click', e => {
      const opt = e.target.closest('.site-opt');
      if (!opt) return;
      if (sshMode) leaveSshMode();
      dropdown.classList.remove('open');
      selectSite(opt.dataset.site);
    });

    function selectSite(site) {
      currentSite = site;
      const isAll = site === 'all';
      document.querySelector('.tab[data-site="all"]').classList.toggle('active', isAll);
      pickerBtn.classList.toggle('has-selection', !isAll);
      pickerBtn.textContent = isAll ? '☰ app ▾' : '☰ ' + site + ' ▾';
      siteList.querySelectorAll('.site-opt').forEach(o => o.classList.toggle('active', o.dataset.site === site));
      history.replaceState(null, '', isAll ? location.pathname : '#' + site);
      connect(site);
    }

    document.getElementById('pause-btn').addEventListener('click', function() {
      paused = !paused;
      this.textContent = paused ? '▶ resume' : '⏸ pause';
      this.classList.toggle('paused', paused);
    });

    // ── SSH session viewer ────────────────────────────────────────────────────
    const sshTab       = document.getElementById('ssh-tab');
    const sshContainer = document.getElementById('ssh-container');
    const logContainer = document.getElementById('log-container');
    const sshList      = document.getElementById('ssh-list');
    const sshContent   = document.getElementById('ssh-content');
    let sshMode = false;

    function enterSshMode() {
      if (typeof mapMode !== 'undefined' && mapMode) leaveMapMode();
      sshMode = true;
      history.replaceState(null, '', '#ssh');
      sshTab.classList.add('active');
      document.querySelector('.tab[data-site="all"]').classList.remove('active');
      pickerBtn.classList.remove('has-selection');
      pickerBtn.textContent = '☰ app ▾';
      siteList.querySelectorAll('.site-opt').forEach(o => o.classList.remove('active'));
      document.getElementById('pause-btn').style.display = 'none'; document.getElementById('ip-filter-wrap').style.display = 'none';
      document.querySelector('.stats').style.display = 'none';
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      logContainer.style.display = 'none';
      if (typeof botContainer !== 'undefined') botContainer.style.display = 'none';
      sshContainer.style.display = 'flex';
      loadSshSessions();
    }

    function leaveSshMode() {
      sshMode = false;
      history.replaceState(null, '', location.pathname);
      sshTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = ''; document.getElementById('ip-filter-wrap').style.display = '';
      document.querySelector('.stats').style.display = '';
      sshContainer.style.display = 'none';
      logContainer.style.display = '';
      selectSite('all');
    }

    function countryFlag(code) {
      if (!code || code.length !== 2) return '';
      const base = 0x1F1E6 - 65;
      return String.fromCodePoint(code.charCodeAt(0) + base, code.charCodeAt(1) + base);
    }

    const sessionGeo = new Map(); // filename -> {lat, lon}

    function loadSshSessions() {
      sshList.innerHTML = '<div class="ssh-empty">Loading…</div>';
      fetch('/ssh-sessions')
        .then(r => r.json())
        .then(files => {
          if (!files.length) {
            sshList.innerHTML = '<div class="ssh-empty">No sessions yet.</div>';
            return;
          }
          sshList.innerHTML = '';
          files.forEach(f => {
            sessionGeo.set(f.name, { lat: f.lat || 0, lon: f.lon || 0 });
            const el = document.createElement('div');
            el.className = 'ssh-session-item';
            const kb = (f.size / 1024).toFixed(1);
            const flag = f.countryCode ? '<span class="ssh-flag">' + countryFlag(f.countryCode) + '</span>' : '';
            el.innerHTML =
              '<div class="ssh-session-name">' + flag + '<span>' + esc(f.name) + '</span></div>' +
              '<div class="ssh-session-meta">' + kb + ' KB</div>';
            el.addEventListener('click', () => {
              document.querySelectorAll('.ssh-session-item').forEach(i => i.classList.remove('active'));
              el.classList.add('active');
              loadSession(f.name);
            });
            sshList.appendChild(el);
          });
        })
        .catch(() => { sshList.innerHTML = '<div class="ssh-empty">Failed to load sessions.</div>'; });
    }

    function loadSession(filename) {
      sshContent.textContent = 'Loading…';
      fetch('/ssh-session?file=' + encodeURIComponent(filename))
        .then(r => r.text())
        .then(text => {
          sshContent.textContent = text;
          sshContent.scrollTop = 0;
        })
        .catch(() => { sshContent.textContent = 'Failed to load session.'; });
    }

    sshTab.addEventListener('click', () => {
      if (!sshMode) {
        if (dlMode) leaveDlMode();
        if (botMode) leaveBotMode();
        enterSshMode();
      }
    });

    document.querySelectorAll('.tab:not(#ssh-tab):not(#dl-tab):not(#bot-tab):not(#map-tab)').forEach(btn => {
      btn.addEventListener('click', () => {
        if (sshMode) leaveSshMode();
        if (dlMode) leaveDlMode();
        if (botMode) leaveBotMode();
        if (typeof mapMode !== 'undefined' && mapMode) leaveMapMode();
      });
    });

    // ── Docker downloads viewer ───────────────────────────────────────────────
    const dlTab       = document.getElementById('dl-tab');
    const dlContainer = document.getElementById('dl-container');
    let dlMode = false;
    let dlPollTimer = null;

    function enterDlMode() {
      if (typeof mapMode !== 'undefined' && mapMode) leaveMapMode();
      dlMode = true;
      history.replaceState(null, '', '#dl');
      dlTab.classList.add('active');
      document.querySelector('.tab[data-site="all"]').classList.remove('active');
      pickerBtn.classList.remove('has-selection');
      pickerBtn.textContent = '☰ app ▾';
      siteList.querySelectorAll('.site-opt').forEach(o => o.classList.remove('active'));
      document.getElementById('pause-btn').style.display = 'none'; document.getElementById('ip-filter-wrap').style.display = 'none';
      document.querySelector('.stats').style.display = 'none';
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      logContainer.style.display = 'none';
      sshContainer.style.display = 'none';
      if (typeof botContainer !== 'undefined') botContainer.style.display = 'none';
      dlContainer.style.display = 'flex';
      loadBundlerDownloads();
      dlPollTimer = setInterval(loadBundlerDownloads, 15000);
    }

    function leaveDlMode() {
      dlMode = false;
      history.replaceState(null, '', location.pathname);
      dlTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = ''; document.getElementById('ip-filter-wrap').style.display = '';
      document.querySelector('.stats').style.display = '';
      dlContainer.style.display = 'none';
      logContainer.style.display = '';
      clearInterval(dlPollTimer);
      selectSite('all');
    }

    function fmtSecs(v) {
      if (v === null || v === undefined) return '—';
      if (v < 60) return v.toFixed(1) + 's';
      return (v / 60).toFixed(1) + 'm';
    }
    function fmtMB(v) {
      if (!v) return '—';
      if (v >= 1024) return (v / 1024).toFixed(1) + ' GB';
      return v.toFixed(0) + ' MB';
    }
    function fmtTs(ts) {
      try {
        const d = new Date(ts);
        return d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
      } catch(_) { return ts; }
    }

    function loadBundlerDownloads() {
      fetch('/bundler-downloads')
        .then(r => r.json())
        .then(entries => {
          const tbody = document.getElementById('dl-tbody');
          const count = document.getElementById('dl-count');
          count.textContent = entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies');
          if (!entries.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="dl-empty">No bundler downloads recorded yet.</td></tr>';
            return;
          }
          tbody.innerHTML = entries.map(e => {
            return '<tr>' +
              '<td class="dl-ip">' + esc(fmtTs(e.ts)) + '</td>' +
              '<td class="dl-ip"><a class="bot-ip" href="/ip/' + encodeURIComponent(e.ip || '') + '">' + esc(e.ip || '—') + '</a></td>' +
              '<td class="dl-img">' + esc(e.bundler || '—') + '</td>' +
              '<td>' + esc(e.package || '—') + '</td>' +
              '<td class="dl-ip">' + esc(e.extra || '—') + '</td>' +
              '<td class="dl-num">' + fmtMB(e.sizeMB) + '</td>' +
            '</tr>';
          }).join('');
        })
        .catch(() => {
          document.getElementById('dl-tbody').innerHTML =
            '<tr><td colspan="6" class="dl-empty">Failed to load bundler download log.</td></tr>';
        });
    }

    dlTab.addEventListener('click', () => {
      if (!dlMode) { if (sshMode) leaveSshMode(); if (botMode) leaveBotMode(); enterDlMode(); }
    });

    // ── Bots tab ──────────────────────────────────────────────────────────────
    const botTab       = document.getElementById('bot-tab');
    const botContainer = document.getElementById('bot-container');
    let botMode = false;
    let botAllIps = [];
    let activeBotType = null;

    function uaBadge(entry) {
      const cls = entry.tool ? 'istool' : 'isbot';
      return '<span class="bot-badge ' + cls + '">' + esc(entry.botName || '—') + '</span>';
    }
    function flag(cc) {
      if (!cc) return '';
      try { return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) + ' '; } catch(_) { return ''; }
    }

    function renderBotRows(ips) {
      const tbody = document.getElementById('bot-tbody');
      if (!ips.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="bot-empty">No bots found in recent logs.</td></tr>';
        return;
      }
      tbody.innerHTML = ips.map(e => {
        const geo = [e.city, e.country].filter(Boolean).join(', ');
        const sitesStr = (e.sites||[]).map(s=>s.n).join(', ');
        return '<tr>' +
          '<td><a class="bot-ip" href="/ip/' + encodeURIComponent(e.ip) + '">' + esc(e.ip) + '</a></td>' +
          '<td class="bot-geo">' + flag(e.countryCode) + esc(geo || '—') + '</td>' +
          '<td>' + uaBadge(e) + '</td>' +
          '<td class="bot-sites" title="' + esc(sitesStr) + '">' + esc(sitesStr || '—') + '</td>' +
          '<td class="bot-hits">' + e.hits + '</td>' +
          '<td style="color:#484f58;font-size:.71rem;white-space:nowrap">' + esc((e.lastSeen||'').slice(0,20)) + '</td>' +
          '</tr>';
      }).join('');
    }

    function renderBotTypes(types) {
      const list = document.getElementById('bot-type-list');
      list.innerHTML = '<div class="bot-type-item' + (!activeBotType ? ' active' : '') + '" data-type="">' +
        '<span class="bot-type-name">all bots</span>' +
        '<span class="bot-type-count">' + botAllIps.length + '</span></div>' +
        types.map(([name, count]) =>
          '<div class="bot-type-item' + (activeBotType === name ? ' active' : '') + '" data-type="' + esc(name) + '">' +
          '<span class="bot-type-name">' + esc(name) + '</span>' +
          '<span class="bot-type-count">' + count + '</span></div>'
        ).join('');
      list.querySelectorAll('.bot-type-item').forEach(item => {
        item.addEventListener('click', () => {
          activeBotType = item.dataset.type || null;
          list.querySelectorAll('.bot-type-item').forEach(i => i.classList.toggle('active', i === item));
          const filtered = activeBotType
            ? botAllIps.filter(e => e.botName === activeBotType)
            : botAllIps;
          renderBotRows(filtered);
        });
      });
    }

    function loadBotData() {
      fetch('/bot-data')
        .then(r => r.json())
        .then(data => {
          document.getElementById('bh-hits').textContent  = data.totalBotHits;
          document.getElementById('bh-ips').textContent   = data.uniqueBotIps;
          document.getElementById('bh-types').textContent = data.topBotTypes.length;
          botAllIps = data.ips || [];
          activeBotType = null;
          renderBotTypes(data.topBotTypes || []);
          renderBotRows(botAllIps);
        })
        .catch(() => {
          document.getElementById('bot-tbody').innerHTML =
            '<tr><td colspan="6" class="bot-empty">Failed to load bot data.</td></tr>';
        });
    }

    function enterBotMode() {
      if (typeof mapMode !== 'undefined' && mapMode) leaveMapMode();
      if (dlMode) leaveDlMode();
      if (sshMode) leaveSshMode();
      botMode = true;
      history.replaceState(null, '', '#bot');
      botTab.classList.add('active');
      document.querySelector('.tab[data-site="all"]').classList.remove('active');
      pickerBtn.classList.remove('has-selection');
      pickerBtn.textContent = '☰ app ▾';
      siteList.querySelectorAll('.site-opt').forEach(o => o.classList.remove('active'));
      document.getElementById('pause-btn').style.display = 'none'; document.getElementById('ip-filter-wrap').style.display = 'none';
      document.querySelector('.stats').style.display = 'none';
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      logContainer.style.display = 'none';
      sshContainer.style.display = 'none';
      dlContainer.style.display = 'none';
      botContainer.style.display = 'flex';
      loadBotData();
    }

    function leaveBotMode() {
      botMode = false;
      history.replaceState(null, '', location.pathname);
      botTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = ''; document.getElementById('ip-filter-wrap').style.display = '';
      document.querySelector('.stats').style.display = '';
      botContainer.style.display = 'none';
      logContainer.style.display = '';
    }

    botTab.addEventListener('click', () => { if (!botMode) enterBotMode(); });
    document.getElementById('bot-refresh').addEventListener('click', loadBotData);

    // ── Global IP Map ─────────────────────────────────────────────────────────
    const mapTab       = document.getElementById('map-tab');
    const mapContainer = document.getElementById('map-container');
    const mapCanvas    = document.getElementById('map-canvas');
    const mapDetail    = document.getElementById('map-detail');
    const mapTooltip   = document.getElementById('map-tooltip');
    const mapLoading   = document.getElementById('map-loading');
    let mapMode = false;
    let mapData = [];
    let landRings = null;
    let mapAutoRefreshTimer = null;
    let mapAnimFrame = null;
    let hoveredIp = null;
    let selectedIp = null;
    let pulsePhase = 0;
    let mapZoom = 1, mapOffX = 0, mapOffY = 0;
    let dragging = false, dragStart = null, dragOffset = null;

    function enterMapMode() {
      if (botMode) leaveBotMode();
      mapMode = true;
      history.replaceState(null, '', '#map');
      mapTab.classList.add('active');
      document.querySelector('.tab[data-site="all"]').classList.remove('active');
      pickerBtn.classList.remove('has-selection');
      pickerBtn.textContent = '☰ app ▾';
      siteList.querySelectorAll('.site-opt').forEach(o => o.classList.remove('active'));
      document.getElementById('pause-btn').style.display = 'none'; document.getElementById('ip-filter-wrap').style.display = 'none';
      document.querySelector('.stats').style.display = 'none';
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      logContainer.style.display = 'none';
      sshContainer.style.display = 'none';
      dlContainer.style.display = 'none';
      botContainer.style.display = 'none';
      mapContainer.style.display = 'flex';
      if (!landRings) loadLand(); else loadMapData();
      mapAutoRefreshTimer = setInterval(loadMapData, 60000);
      resizeMapCanvas();
      startMapAnim();
    }

    function leaveMapMode() {
      mapMode = false;
      history.replaceState(null, '', location.pathname);
      mapTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = ''; document.getElementById('ip-filter-wrap').style.display = '';
      document.querySelector('.stats').style.display = '';
      clearInterval(mapAutoRefreshTimer);
      if (mapAnimFrame) { cancelAnimationFrame(mapAnimFrame); mapAnimFrame = null; }
      mapContainer.style.display = 'none';
      mapTooltip.style.display = 'none';
      logContainer.style.display = '';
    }

    // ── TopoJSON decoder (no external library) ────────────────────────────────
    function decodeTopoRings(topo) {
      const sc = topo.transform.scale, tr = topo.transform.translate;
      const decoded = topo.arcs.map(arc => {
        let x = 0, y = 0;
        return arc.map(p => { x += p[0]; y += p[1]; return [x * sc[0] + tr[0], y * sc[1] + tr[1]]; });
      });
      function resolve(refs) {
        const pts = [];
        for (const ref of refs) {
          const rev = ref < 0, arc = decoded[rev ? ~ref : ref];
          const seg = rev ? arc.slice().reverse() : arc;
          pts.push(...(pts.length ? seg.slice(1) : seg));
        }
        return pts;
      }
      function collect(g, out) {
        if (g.type === 'GeometryCollection') g.geometries.forEach(x => collect(x, out));
        else if (g.type === 'Polygon') g.arcs.forEach(r => out.push(resolve(r)));
        else if (g.type === 'MultiPolygon') g.arcs.forEach(p => p.forEach(r => out.push(resolve(r))));
      }
      const out = [];
      collect(topo.objects.land, out);
      return out;
    }

    function loadLand() {
      fetch('/land-110m.json')
        .then(r => r.json())
        .then(topo => { landRings = decodeTopoRings(topo); loadMapData(); })
        .catch(() => { mapLoading.textContent = 'Failed to load land data.'; mapLoading.style.animation = 'none'; });
    }

    function loadMapData() {
      mapLoading.style.display = 'flex';
      mapLoading.textContent = 'Loading…';
      mapLoading.style.animation = 'blink2 1.2s step-end infinite';
      fetch('/map-data')
        .then(r => r.json())
        .then(data => {
          mapData = data.ips || [];
          document.getElementById('mh-ips').textContent = (data.total_ips || 0).toLocaleString();
          document.getElementById('mh-countries').textContent = data.total_countries || 0;
          document.getElementById('mh-reqs').textContent = (data.total_requests || 0).toLocaleString();
          document.getElementById('mh-ts').textContent = 'updated ' + new Date(data.ts).toLocaleTimeString();
          mapLoading.style.display = 'none';
        })
        .catch(() => {
          mapLoading.textContent = 'Failed to load data.';
          mapLoading.style.animation = 'none';
        });
    }

    // ── Projection ────────────────────────────────────────────────────────────
    function proj(lon, lat) {
      const W = mapCanvas.width, H = mapCanvas.height;
      const x = ((lon + 180) / 360) * W;
      const y = ((90 - lat) / 180) * H;
      return [(x - W/2) * mapZoom + W/2 + mapOffX, (y - H/2) * mapZoom + H/2 + mapOffY];
    }

    // ── Rendering ─────────────────────────────────────────────────────────────
    function dotColor(t) {
      // t in [0,1]: green → yellow → orange → red
      if (t < 0.33) {
        const u = t / 0.33;
        return \`rgb(\${Math.round(u*250)},255,65)\`;
      } else if (t < 0.66) {
        const u = (t - 0.33) / 0.33;
        return \`rgb(255,\${Math.round(255 - u * 51)},65)\`;
      } else {
        const u = (t - 0.66) / 0.34;
        return \`rgb(255,\${Math.round(204 - u * 180)},0)\`;
      }
    }

    function dotRadius(count, maxCount) {
      return 3 + (Math.log(count + 1) / Math.log(maxCount + 1)) * 11;
    }

    function drawMap() {
      if (!mapMode) return;
      const ctx = mapCanvas.getContext('2d');
      const W = mapCanvas.width, H = mapCanvas.height;

      // Ocean
      ctx.fillStyle = '#050d1a';
      ctx.fillRect(0, 0, W, H);

      // Graticule
      ctx.strokeStyle = 'rgba(0,180,255,0.06)';
      ctx.lineWidth = 0.5;
      for (let lon = -180; lon <= 180; lon += 30) {
        const [x1, y1] = proj(lon, 85), [x2, y2] = proj(lon, -85);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const [x1, y1] = proj(-180, lat), [x2, y2] = proj(180, lat);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }

      // Land
      if (landRings) {
        ctx.beginPath();
        for (const ring of landRings) {
          if (!ring.length) continue;
          const [sx, sy] = proj(ring[0][0], ring[0][1]);
          ctx.moveTo(sx, sy);
          for (let i = 1; i < ring.length; i++) {
            const [px, py] = proj(ring[i][0], ring[i][1]);
            ctx.lineTo(px, py);
          }
          ctx.closePath();
        }
        ctx.fillStyle = '#0d2235';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,200,100,0.15)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      if (!mapData.length) return;
      const maxCount = mapData[0].count;

      // Pulse rings for top IPs
      for (let i = 0; i < Math.min(20, mapData.length); i++) {
        const e = mapData[i];
        const [cx, cy] = proj(e.lon, e.lat);
        const r = dotRadius(e.count, maxCount);
        const phase = pulsePhase + i * 0.55;
        const fade = (Math.sin(phase) * 0.5 + 0.5);
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5 + fade * 14, 0, Math.PI * 2);
        ctx.strokeStyle = \`rgba(0,255,65,\${0.04 + fade * 0.14})\`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // second ring offset
        const fade2 = (Math.sin(phase + 1.5) * 0.5 + 0.5);
        ctx.beginPath();
        ctx.arc(cx, cy, r + 2 + fade2 * 8, 0, Math.PI * 2);
        ctx.strokeStyle = \`rgba(0,200,255,\${0.03 + fade2 * 0.08})\`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // All dots (smallest first so largest renders on top)
      const sorted = [...mapData].sort((a,b) => a.count - b.count);
      for (const entry of sorted) {
        const [cx, cy] = proj(entry.lon, entry.lat);
        const r = dotRadius(entry.count, maxCount);
        const t = Math.log(entry.count + 1) / Math.log(maxCount + 1);
        const color = dotColor(t);
        const isActive = hoveredIp === entry.ip || selectedIp === entry.ip;

        // Glow
        const gR = r * 2.8;
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, gR);
        const [rr,gg,bb] = color.match(/\\d+/g).map(Number);
        grd.addColorStop(0, \`rgba(\${rr},\${gg},\${bb},0.45)\`);
        grd.addColorStop(1, \`rgba(\${rr},\${gg},\${bb},0)\`);
        ctx.beginPath(); ctx.arc(cx, cy, gR, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();

        // Core dot
        const dr = r * (isActive ? 1.4 : 1);
        ctx.beginPath(); ctx.arc(cx, cy, dr, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#ffffff' : color;
        ctx.fill();

        if (isActive) {
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    function startMapAnim() {
      function frame() {
        if (!mapMode) return;
        pulsePhase += 0.035;
        drawMap();
        mapAnimFrame = requestAnimationFrame(frame);
      }
      if (mapAnimFrame) cancelAnimationFrame(mapAnimFrame);
      mapAnimFrame = requestAnimationFrame(frame);
    }

    function resizeMapCanvas() {
      const body = document.getElementById('map-body');
      const dw = mapDetail.style.display === 'flex' ? mapDetail.offsetWidth : 0;
      mapCanvas.width  = Math.max(1, body.offsetWidth - dw);
      mapCanvas.height = Math.max(1, body.offsetHeight);
    }

    window.addEventListener('resize', () => { if (mapMode) resizeMapCanvas(); });

    // ── Zoom controls ─────────────────────────────────────────────────────────
    function mapZoomBtn(factor) {
      const W = mapCanvas.width, H = mapCanvas.height;
      const cx = W/2, cy = H/2;
      mapOffX = cx - (cx - mapOffX) * factor;
      mapOffY = cy - (cy - mapOffY) * factor;
      mapZoom = Math.max(0.4, Math.min(25, mapZoom * factor));
    }

    function mapResetView() {
      mapZoom = 1; mapOffX = 0; mapOffY = 0;
    }

    // ── Hit testing ───────────────────────────────────────────────────────────
    function getIpAtPoint(px, py) {
      if (!mapData.length) return null;
      const maxCount = mapData[0].count;
      let best = null, bestDist = Infinity;
      for (const e of mapData) {
        const [cx, cy] = proj(e.lon, e.lat);
        const r = dotRadius(e.count, maxCount);
        const dist = Math.hypot(px - cx, py - cy);
        if (dist <= r + 5 && dist < bestDist) { bestDist = dist; best = e; }
      }
      return best;
    }

    // ── Mouse events ──────────────────────────────────────────────────────────
    mapCanvas.addEventListener('mousemove', e => {
      const rect = mapCanvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;

      if (dragging) {
        mapOffX = dragOffset[0] + (e.clientX - dragStart[0]);
        mapOffY = dragOffset[1] + (e.clientY - dragStart[1]);
        mapTooltip.style.display = 'none';
        hoveredIp = null;
        return;
      }

      const hit = getIpAtPoint(px, py);
      if (hit) {
        hoveredIp = hit.ip;
        mapCanvas.style.cursor = 'pointer';
        const flag = hit.countryCode ? countryFlag(hit.countryCode) + ' ' : '';
        const loc  = hit.city ? hit.city + ', ' + hit.country : (hit.country || hit.countryCode || 'Unknown');
        mapTooltip.innerHTML =
          '<div class="tt-ip">' + esc(hit.ip) + '</div>' +
          '<div class="tt-loc">' + flag + esc(loc) + '</div>' +
          '<div class="tt-count">' + hit.count.toLocaleString() + ' requests</div>';
        mapTooltip.style.display = 'block';
        mapTooltip.style.left = Math.min(e.clientX + 14, window.innerWidth - 250) + 'px';
        mapTooltip.style.top  = Math.min(e.clientY - 8,  window.innerHeight - 110) + 'px';
      } else {
        hoveredIp = null;
        mapCanvas.style.cursor = 'crosshair';
        mapTooltip.style.display = 'none';
      }
    });

    mapCanvas.addEventListener('mouseleave', () => {
      if (!dragging) { hoveredIp = null; mapTooltip.style.display = 'none'; }
    });

    mapCanvas.addEventListener('mousedown', e => {
      dragging = true;
      dragStart  = [e.clientX, e.clientY];
      dragOffset = [mapOffX, mapOffY];
      mapCanvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', e => {
      if (!dragging) return;
      const dx = Math.abs(e.clientX - dragStart[0]);
      const dy = Math.abs(e.clientY - dragStart[1]);
      dragging = false;
      mapCanvas.style.cursor = 'crosshair';
      if (dx < 5 && dy < 5 && mapMode) {
        const rect = mapCanvas.getBoundingClientRect();
        const hit = getIpAtPoint(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) showMapDetail(hit); else hideMapDetail();
      }
    });

    mapCanvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
      const rect = mapCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      mapOffX = mx - (mx - mapOffX) * factor;
      mapOffY = my - (my - mapOffY) * factor;
      mapZoom = Math.max(0.4, Math.min(25, mapZoom * factor));
    }, { passive: false });

    // ── Detail panel ──────────────────────────────────────────────────────────
    function showMapDetail(entry) {
      selectedIp = entry.ip;
      mapDetail.style.display = 'flex';
      resizeMapCanvas();
      const flag = entry.countryCode ? countryFlag(entry.countryCode) + ' ' : '';
      const loc  = entry.city ? entry.city + ', ' + entry.country : (entry.country || entry.countryCode || 'Unknown');
      const maxApp = entry.apps.length ? entry.apps[0].count : 1;
      const appsHtml = entry.apps.map(a =>
        '<div class="md-app-row">' +
          '<span class="md-app-name" title="' + esc(a.name) + '">' + esc(a.name) + '</span>' +
          '<div class="md-app-bar-wrap"><div class="md-app-bar" style="width:' + Math.round(a.count/maxApp*100) + '%"></div></div>' +
          '<span class="md-app-count">' + a.count + '</span>' +
        '</div>'
      ).join('');
      const urlsHtml = entry.urls.map(u => '<div class="md-url">' + esc(u) + '</div>').join('');
      mapDetail.innerHTML =
        '<div>' +
          '<div class="md-ip">' + esc(entry.ip) + '</div>' +
          '<div class="md-location">' + flag + esc(loc) + '</div>' +
          '<div class="md-count">' + entry.count.toLocaleString() + ' requests sampled</div>' +
        '</div>' +
        (entry.apps.length ? '<div><div class="md-section">Apps visited</div>' + appsHtml + '</div>' : '') +
        (entry.urls.length  ? '<div><div class="md-section">URLs</div>' + urlsHtml + '</div>' : '') +
        '<button onclick="hideMapDetail()" style="background:none;border:1px solid rgba(255,255,255,.1);' +
          'border-radius:4px;color:#586069;font-size:.72rem;' +
          'padding:.3rem .55rem;cursor:pointer;align-self:flex-start;margin-top:.25rem">✕ close</button>';
    }

    function hideMapDetail() {
      selectedIp = null;
      mapDetail.style.display = 'none';
      resizeMapCanvas();
    }

    mapTab.addEventListener('click', () => {
      if (!mapMode) {
        if (sshMode) leaveSshMode();
        if (dlMode) leaveDlMode();
        if (botMode) leaveBotMode();
        enterMapMode();
      }
    });

    // ── Restore state from URL hash on page load ───────────────────────────────
    (function restoreHash() {
      const h = location.hash.slice(1);
      if (h === 'ssh') { enterSshMode(); return; }
      if (h === 'dl')  { enterDlMode();  return; }
      if (h === 'bot') { enterBotMode(); return; }
      if (h === 'map') { enterMapMode(); return; }
      if (h && h !== 'all') { selectSite(h); return; }
      connect(currentSite);
    })();
  </script>
</body>
</html>`;

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }

  if (req.url === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('User-agent: *\nDisallow: /\n');
    return;
  }

  if (req.url === '/ssh-sessions') {
    try {
      const files = fs.readdirSync(SSH_DIR)
        .filter(f => f.endsWith('.log'))
        .sort().reverse()
        .map(f => {
          const st = fs.statSync(path.join(SSH_DIR, f));
          return { name: f, size: st.size, ip: ipFromFilename(f) };
        });
      const uniqueIps = [...new Set(files.map(f => f.ip))];
      await Promise.all(uniqueIps.map(lookupGeo));
      const result = files.map(f => {
        const g = ipGeoCache.get(f.ip) || {};
        return { name: f.name, size: f.size, countryCode: g.countryCode || '', country: g.country || '', city: g.city || '', lat: g.lat || 0, lon: g.lon || 0 };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (_) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); }
    return;
  }

  const sm = req.url.match(/^\/ssh-session\?file=([^&]+)$/);
  if (sm) {
    const filename = decodeURIComponent(sm[1]);
    if (!/^[\w.-]+\.log$/.test(filename)) { res.writeHead(400); res.end(); return; }
    try {
      const raw = fs.readFileSync(path.join(SSH_DIR, filename), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(stripAnsi(raw));
    } catch (_) { res.writeHead(404); res.end(); }
    return;
  }
  if (req.url === '/map-data') {
    const LINES_PER_FILE = 300;
    const ipMap = new Map();
    // Seed with all-time historical counts from harvested rotated logs
    for (const [ip, count] of Object.entries(mapAlltimeStore.ips)) {
      ipMap.set(ip, { count, apps: new Map(), urls: new Set() });
    }
    // Merge current live log data (today's traffic not yet rotated)
    for (const [siteName, logFilename] of Object.entries(LOG_FILES)) {
      const lines = lastLines(path.join(LOGS_DIR, logFilename), LINES_PER_FILE);
      for (const line of lines) {
        const p = parseLine(line);
        if (!p.ip || INTERNAL_IPS.has(p.ip)) continue;
        if (!ipMap.has(p.ip)) ipMap.set(p.ip, { count: 0, apps: new Map(), urls: new Set() });
        const e = ipMap.get(p.ip);
        e.count++;
        e.apps.set(siteName, (e.apps.get(siteName) || 0) + 1);
        if (p.path && e.urls.size < 50) e.urls.add(p.path);
      }
    }
    const uniqueIps = [...ipMap.keys()];
    await Promise.all(uniqueIps.map(ip => lookupGeo(ip)));
    const ips = [...ipMap.entries()]
      .map(([ip, d]) => {
        const g = ipGeoCache.get(ip) || {};
        return {
          ip, count: d.count,
          lat: g.lat || 0, lon: g.lon || 0,
          countryCode: g.countryCode || '', country: g.country || '', city: g.city || '',
          apps: [...d.apps.entries()].sort((a,b) => b[1]-a[1]).slice(0,15).map(([name,count]) => ({name,count})),
          urls: [...d.urls].slice(0, 20),
        };
      })
      .filter(e => e.lat !== 0 || e.lon !== 0)
      .sort((a,b) => b.count - a.count)
      .slice(0, 200);
    const totalCountries = new Set(ips.map(e => e.countryCode).filter(Boolean)).size;
    const totalRequests  = ips.reduce((s, e) => s + e.count, 0);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ts: new Date().toISOString(), total_ips: ips.length, total_requests: totalRequests, total_countries: totalCountries, ips }));
    return;
  }

  if (req.url === '/map-harvest') {
    const newCount = await scanAndHarvest();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, newFiles: newCount, totalIps: Object.keys(mapAlltimeStore.ips).length }));
    return;
  }

  if (req.url === '/docker-downloads') {
    try {
      const lines = fs.existsSync(DL_LOG_FILE)
        ? fs.readFileSync(DL_LOG_FILE, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      const entries = lines.map(l => { try { return JSON.parse(l); } catch(_) { return null; } })
                           .filter(Boolean)
                           .reverse(); // newest first
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entries));
    } catch(e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  if (req.url === '/bundler-downloads') {
    try {
      const lines = fs.existsSync(BUNDLER_LOG_FILE)
        ? fs.readFileSync(BUNDLER_LOG_FILE, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      const entries = lines.map(l => { try { return JSON.parse(l); } catch(_) { return null; } })
                           .filter(Boolean)
                           .reverse(); // newest first
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entries));
    } catch(e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  if (req.url === '/mario-scores') {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

    if (req.method === 'GET') {
      const top = readScores().sort((a, b) => b.score - a.score).slice(0, 10);
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(top)); return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 512) req.destroy(); });
      req.on('end', () => {
        try {
          const { initials, score } = JSON.parse(body);
          if (!/^[A-Z0-9]{1,3}$/.test(String(initials)) ||
              !Number.isFinite(score) || score < 0 || score > 999999) {
            res.writeHead(400, cors); res.end(); return;
          }
          const scores = readScores();
          scores.push({ initials: String(initials), score: Math.floor(score), ts: new Date().toISOString() });
          scores.sort((a, b) => b.score - a.score);
          writeScores(scores.slice(0, 200));
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (_) { res.writeHead(400, cors); res.end(); }
      });
      return;
    }
    res.writeHead(405, cors); res.end(); return;
  }

  if (req.url === '/mario-scores-smb2') {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

    if (req.method === 'GET') {
      const top = readScoresSMB2().sort((a, b) => b.score - a.score).slice(0, 10);
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(top)); return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', d => { body += d; if (body.length > 512) req.destroy(); });
      req.on('end', () => {
        try {
          const { initials, score } = JSON.parse(body);
          if (!/^[A-Z0-9]{1,3}$/.test(String(initials)) ||
              !Number.isFinite(score) || score < 0 || score > 999999) {
            res.writeHead(400, cors); res.end(); return;
          }
          const scores = readScoresSMB2();
          scores.push({ initials: String(initials), score: Math.floor(score), ts: new Date().toISOString() });
          scores.sort((a, b) => b.score - a.score);
          writeScoresSMB2(scores.slice(0, 200));
          res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (_) { res.writeHead(400, cors); res.end(); }
      });
      return;
    }
    res.writeHead(405, cors); res.end(); return;
  }

  if (req.url.startsWith('/shared/nav.js')) {
    try {
      const js = fs.readFileSync('/app/shared/nav.js', 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(js);
    } catch (_) { res.writeHead(404); res.end(); }
    return;
  }

  // ── IDS endpoints ──────────────────────────────────────────────────────────
  if (req.url === '/land-110m.json') {
    try {
      const data = fs.readFileSync(path.join(__dirname, 'vendor/land-110m.json'));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    } catch (_) { res.writeHead(404); res.end(); }
    return;
  }

  if (req.url === '/ids-stats') {
    const now = Date.now();
    const last1h = idsAlerts.filter(a => {
      try { return (now - new Date(a.ts.replace(' ', 'T') + 'Z').getTime()) < 3600000; } catch(_) { return false; }
    }).length;
    const topSigs     = Object.entries(idsBySig).sort((a,b) => b[1]-a[1]).slice(0, 15);
    const topCats     = Object.entries(idsByCategory).sort((a,b) => b[1]-a[1]).slice(0, 10);
    const topSrcIps   = Object.entries(idsBySrcIp).sort((a,b) => b[1].count-a[1].count).slice(0, 20)
                          .map(([ip, d]) => ({ ip, count: d.count, lastSeen: d.lastSeen, ...d.geo }));
    const recent      = idsAlerts.slice(-100).reverse();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      total: idsTotalCount,
      last1h,
      inMemory: idsAlerts.length,
      uniqueIps: Object.keys(idsBySrcIp).length,
      highSev: idsBySeverity[1] || 0,
      byProto: idsByProto,
      bySeverity: idsBySeverity,
      topSigs,
      topCats,
      topSrcIps,
      hourlyBuckets: idsHourly,
      recent,
    }));
    return;
  }

  // ── Bot summary data ─────────────────────────────────────────────────────────
  if (req.url === '/bot-data') {
    const ipMap = new Map(); // ip -> { hits, sites: Map, botName, ua, lastSeen }
    const botTypes = new Map(); // botName -> count
    let totalBotHits = 0;
    for (const [siteName, logFilename] of Object.entries(LOG_FILES)) {
      const lines = lastLines(path.join(LOGS_DIR, logFilename), 500);
      for (const line of lines) {
        const p = parseLine(line);
        if (!p.ip || !p.ua) continue;
        const u = parseUA(p.ua);
        if (!u.bot && !u.tool) continue;
        totalBotHits++;
        const botLabel = u.version ? u.browser + '/' + u.version : u.browser;
        botTypes.set(botLabel, (botTypes.get(botLabel) || 0) + 1);
        if (!ipMap.has(p.ip)) ipMap.set(p.ip, { hits: 0, sites: new Map(), botName: botLabel, ua: p.ua, lastSeen: '', tool: u.tool });
        const e = ipMap.get(p.ip);
        e.hits++;
        e.sites.set(siteName, (e.sites.get(siteName) || 0) + 1);
        if (!e.lastSeen || p.ts > e.lastSeen) e.lastSeen = p.ts;
      }
    }
    const uniqueIps = [...ipMap.keys()];
    await Promise.all(uniqueIps.map(ip => lookupGeo(ip)));
    const ips = [...ipMap.entries()]
      .sort((a,b) => b[1].hits - a[1].hits)
      .slice(0, 200)
      .map(([ip, d]) => {
        const g = ipGeoCache.get(ip) || {};
        return {
          ip, hits: d.hits, botName: d.botName, ua: d.ua, tool: d.tool, lastSeen: d.lastSeen,
          lat: g.lat||0, lon: g.lon||0, countryCode: g.countryCode||'', country: g.country||'', city: g.city||'',
          sites: [...d.sites.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([n,c])=>({n,c})),
        };
      });
    const topBotTypes = [...botTypes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ totalBotHits, uniqueBotIps: ipMap.size, topBotTypes, ips }));
    return;
  }

  // ── IP profile page ─────────────────────────────────────────────────────────
  const ipRouteM = req.url.match(/^\/ip\/([^/?]+)/);
  if (ipRouteM) {
    const targetIp = decodeURIComponent(ipRouteM[1]);
    if (!/^[0-9a-fA-F.:]+$/.test(targetIp) || targetIp.length > 45) {
      res.writeHead(400); res.end('invalid IP'); return;
    }
    const DAYS_BACK = 7;
    const hits = [];
    const now = Date.now();
    for (const [siteName, logFilename] of Object.entries(LOG_FILES)) {
      const readLines = (buf) => {
        buf.toString('utf8').split('\n').forEach(line => {
          if (!line.startsWith(targetIp + ' ')) return;
          const p = parseLine(line);
          if (p.ip) hits.push({ ...p, site: siteName });
        });
      };
      try { readLines(fs.readFileSync(path.join(LOGS_DIR, logFilename))); } catch (_) {}
      for (let d = 1; d <= DAYS_BACK; d++) {
        const dt = new Date(now - d * 86400000);
        const ds = dt.toISOString().slice(0,10).replace(/-/g,'');
        const gzp = path.join(LOGS_DIR, logFilename + '-' + ds + '.gz');
        const rp  = path.join(LOGS_DIR, logFilename + '-' + ds);
        try { readLines(zlib.gunzipSync(fs.readFileSync(gzp))); } catch (_) {}
        try { readLines(fs.readFileSync(rp)); } catch (_) {}
      }
    }
    const geo = await lookupGeo(targetIp);
    const bySite = {}, byPath = {}, byStatus = {}, byDay = {}, byUA = {};
    let firstSeen = '', lastSeen = '';
    for (const h of hits) {
      bySite[h.site]   = (bySite[h.site]   || 0) + 1;
      if (h.path)   byPath[h.path]   = (byPath[h.path]   || 0) + 1;
      if (h.ua)     byUA[h.ua]       = (byUA[h.ua]       || 0) + 1;
      const sc = Math.floor((h.status||0)/100)+'xx';
      byStatus[sc]     = (byStatus[sc]     || 0) + 1;
      if (h.ts) {
        if (!firstSeen || h.ts < firstSeen) firstSeen = h.ts;
        if (!lastSeen  || h.ts > lastSeen)  lastSeen  = h.ts;
        const dayKey = h.ts.slice(0,11);
        byDay[dayKey] = (byDay[dayKey] || 0) + 1;
      }
    }
    const topSites   = Object.entries(bySite).sort((a,b)=>b[1]-a[1]).slice(0,20);
    const topPaths   = Object.entries(byPath).sort((a,b)=>b[1]-a[1]).slice(0,20);
    const topUA      = Object.entries(byUA).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const recentHits = hits.slice(-100).reverse();
    const esc2 = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const sc   = s => { const c=Math.floor((s||0)/100); return c===2?'s2xx':c===3?'s3xx':c===4?'s4xx':c===5?'s5xx':'s0'; };
    const flag = cc => cc ? String.fromCodePoint(...[...cc.toUpperCase()].map(c=>0x1F1E6+c.charCodeAt(0)-65)) : '';
    const geoLabel2 = (geo2) => [geo2.city, geo2.country].filter(Boolean).join(', ');

    function renderUA(ua) {
      if (!ua || ua === '-') return '<span style="color:#484f58">—</span>';
      const p = parseUA(ua);
      const badges = [];
      const browserColor = p.bot ? '#fb923c' : p.tool ? '#facc15' : '#00ff41';
      const browserBg    = p.bot ? 'rgba(251,146,60,.12)' : p.tool ? 'rgba(250,204,21,.1)' : 'rgba(0,255,65,.1)';
      const label = p.version ? p.browser + ' ' + p.version : p.browser;
      badges.push(`<span style="color:${browserColor};background:${browserBg};border:1px solid ${browserColor}33;border-radius:4px;padding:.1rem .4rem;font-size:.7rem;white-space:nowrap">${esc2(label)}</span>`);
      if (p.os) badges.push(`<span style="color:#a5b4fc;background:rgba(165,180,252,.08);border:1px solid rgba(165,180,252,.2);border-radius:4px;padding:.1rem .4rem;font-size:.7rem;white-space:nowrap">${esc2(p.os)}</span>`);
      return `<div style="display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;margin-bottom:.25rem">${badges.join('')}</div>`
           + `<div style="color:#484f58;font-size:.66rem;word-break:break-all;line-height:1.4">${esc2(ua)}</div>`;
    }

    // Group hits by day for expandable detail
    const hitsByDay = {};
    for (const h of hits) {
      if (h.ts) {
        const dk = h.ts.slice(0,11);
        if (!hitsByDay[dk]) hitsByDay[dk] = [];
        hitsByDay[dk].push(h);
      }
    }
    const dayRows = Object.entries(byDay).sort((a,b)=>a[0]<b[0]?-1:1)
      .map(([day,n]) => {
        const dayHits = (hitsByDay[day]||[]).slice(-200).reverse();
        const detailRows = dayHits.map(h =>
          `<tr><td class="col-ts">${esc2(h.ts)}</td><td style="color:#a5b4fc;font-size:.72rem">${esc2(h.site||'')}</td><td class="${sc(h.status)}">${esc2(h.status)}</td><td style="color:#c9d1d9;word-break:break-all">${esc2((h.method||'')+' '+(h.path||''))}</td></tr>`
        ).join('');
        const detailId = 'day-' + day.replace(/[^a-zA-Z0-9]/g,'');
        return `<tr class="day-row" style="cursor:pointer" onclick="var d=document.getElementById('${detailId}');d.style.display=d.style.display==='none'?'':'none';this.querySelector('.day-arrow').textContent=d.style.display==='none'?'▸':'▾'"><td style="white-space:nowrap"><span class="day-arrow" style="display:inline-block;width:1em;color:var(--dim)">▸</span> ${esc2(day)}</td><td style="color:#c9d1d9">${n}</td></tr>`
             + `<tr id="${detailId}" style="display:none"><td colspan="2" style="padding:0"><table style="width:100%;margin:.2rem 0 .5rem;background:rgba(255,255,255,.02);border-radius:6px"><thead><tr><th>timestamp</th><th>site</th><th>status</th><th>request</th></tr></thead><tbody>${detailRows}</tbody></table></td></tr>`;
      }).join('');
    const siteRows = topSites.map(([s,n])=>`<tr><td><a href="/?site=${esc2(s)}" style="color:#79c0ff;text-decoration:none">${esc2(s)}</a></td><td style="color:#c9d1d9">${n}</td></tr>`).join('');
    const pathRows = topPaths.map(([p,n])=>`<tr><td style="color:#c9d1d9;word-break:break-all">${esc2(p)}</td><td style="color:#c9d1d9">${n}</td></tr>`).join('');
    const uaRows   = topUA.map(([u,n])=>`<tr><td style="padding:.45rem .4rem">${renderUA(u)}</td><td style="color:#c9d1d9;vertical-align:top;padding:.45rem .4rem;white-space:nowrap">${n}</td></tr>`).join('');
    const recentRows = recentHits.map(h=>`<tr>
      <td class="col-ts">${esc2(h.ts)}</td>
      <td style="color:#a5b4fc;font-size:.72rem">${esc2(h.site||'')}</td>
      <td class="${sc(h.status)}">${esc2(h.status)}</td>
      <td style="color:#c9d1d9;word-break:break-all">${esc2((h.method||'')+' '+(h.path||''))}</td>
      <td style="min-width:160px">${renderUA(h.ua||'')}</td>
    </tr>`).join('');
    const statusSummary = ['2xx','3xx','4xx','5xx'].map(k=>`<span class="${sc(parseInt(k)+'00')}">${k}: ${byStatus[k]||0}</span>`).join('  ');

    const hasGeo = !!(geo.lat || geo.lon);
    const mapLinkTag = hasGeo ? '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>' : '';
    const mapDivCard = hasGeo ? '<div class="card" style="grid-column:1/-1;padding:0;overflow:hidden"><div id="ip-map" style="height:260px;width:100%"></div></div>' : '';
    const mapScript  = hasGeo
      ? '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>' +
        '<script>' +
        `var _m=L.map('ip-map',{zoomControl:true,attributionControl:false}).setView([${geo.lat},${geo.lon}],5);` +
        `L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(_m);` +
        `L.circleMarker([${geo.lat},${geo.lon}],{radius:9,color:'#00ff41',fillColor:'#00ff41',fillOpacity:.75,weight:2}).addTo(_m);` +
        '</script>'
      : '';

    const IP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc2(targetIp)} — logs.ximg.app</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%230d1117'/><text x='16' y='22' font-size='18' text-anchor='middle' fill='%2300ff41' font-family='monospace' font-weight='bold'>▶</text></svg>">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0d1117;--green:#00ff41;--dim:#484f58;--text:#c9d1d9}
    body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;padding:0 0 3rem}
    body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:100;
      background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)}
    .page{max-width:1100px;margin:0 auto;padding:1.5rem 1.25rem}
    .back{display:inline-block;color:var(--dim);text-decoration:none;font-size:.75rem;margin-bottom:1.25rem;
      border:1px solid rgba(255,255,255,.07);padding:.25rem .65rem;border-radius:5px;transition:color .2s}
    .back:hover{color:var(--text)}
    h1{font-size:1.35rem;color:var(--green);font-weight:700;margin-bottom:.2rem;word-break:break-all}
    .geo{color:#a5b4fc;font-size:.85rem;margin-bottom:.25rem}
    .summary-stats{display:flex;flex-wrap:wrap;gap:.6rem;margin:1rem 0 1.5rem;font-size:.78rem}
    .stat-pill{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:6px;
      padding:.35rem .75rem;display:flex;flex-direction:column;gap:.1rem}
    .stat-pill .label{color:var(--dim);font-size:.65rem;text-transform:uppercase;letter-spacing:.08em}
    .stat-pill .value{color:var(--text)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:1.25rem;margin-top:1.25rem}
    .card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:1rem}
    .card h2{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);margin-bottom:.75rem}
    table{width:100%;border-collapse:collapse;font-size:.76rem}
    th{color:var(--dim);font-weight:600;text-align:left;padding:.25rem .4rem;border-bottom:1px solid rgba(255,255,255,.07);font-size:.68rem;text-transform:uppercase;letter-spacing:.06em}
    td{padding:.3rem .4rem;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:top}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:rgba(255,255,255,.02)}
    .col-ts{color:var(--dim);white-space:nowrap;font-size:.72rem}
    .s2xx{color:#00ff41}.s3xx{color:#06b6d4}.s4xx{color:#facc15}.s5xx{color:#ff7b72}.s0{color:var(--dim)}
    .empty{color:var(--dim);padding:1rem;text-align:center;font-size:.8rem}
    .recent-card{grid-column:1/-1}
  </style>
  ${mapLinkTag}
</head>
<body>
  <div class="page">
    <a class="back" href="/">← back to logs</a>
    <h1>${flag(geo.countryCode)} ${esc2(targetIp)}</h1>
    <div class="geo">${esc2(geoLabel2(geo)) || 'location unknown'}</div>
    <div style="font-size:.75rem;color:var(--dim)">last ${DAYS_BACK} days of logs</div>
    <div class="summary-stats">
      <div class="stat-pill"><span class="label">total hits</span><span class="value">${hits.length}</span></div>
      <div class="stat-pill"><span class="label">sites visited</span><span class="value">${Object.keys(bySite).length}</span></div>
      <div class="stat-pill"><span class="label">unique paths</span><span class="value">${Object.keys(byPath).length}</span></div>
      <div class="stat-pill"><span class="label">first seen</span><span class="value">${esc2(firstSeen||'—')}</span></div>
      <div class="stat-pill"><span class="label">last seen</span><span class="value">${esc2(lastSeen||'—')}</span></div>
      <div class="stat-pill"><span class="label">status codes</span><span class="value">${statusSummary}</span></div>
    </div>
    ${hits.length===0 ? '<div class="empty">no hits found for this IP in the last '+DAYS_BACK+' days</div>' : ''}
    <div class="grid">
      ${mapDivCard}
      <div class="card">
        <h2>hits by site</h2>
        ${topSites.length ? '<table><thead><tr><th>site</th><th>hits</th></tr></thead><tbody>'+siteRows+'</tbody></table>' : '<div class="empty">—</div>'}
      </div>
      <div class="card">
        <h2>hits by day</h2>
        ${dayRows ? '<table><thead><tr><th>day</th><th>hits</th></tr></thead><tbody>'+dayRows+'</tbody></table>' : '<div class="empty">—</div>'}
      </div>
      <div class="card">
        <h2>top paths</h2>
        ${topPaths.length ? '<table><thead><tr><th>path</th><th>hits</th></tr></thead><tbody>'+pathRows+'</tbody></table>' : '<div class="empty">—</div>'}
      </div>
      <div class="card">
        <h2>user agents</h2>
        ${topUA.length ? '<table><thead><tr><th>ua</th><th>hits</th></tr></thead><tbody>'+uaRows+'</tbody></table>' : '<div class="empty">—</div>'}
      </div>
      <div class="card recent-card">
        <h2>recent requests (last 100)</h2>
        ${recentRows ? '<table><thead><tr><th>timestamp</th><th>site</th><th>status</th><th>request</th><th>client</th></tr></thead><tbody>'+recentRows+'</tbody></table>' : '<div class="empty">—</div>'}
      </div>
    </div>
  </div>
  ${mapScript}
  <script src="/shared/nav.js?v=2"></script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(IP_HTML);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

const wss    = new WebSocketServer({ noServer: true });
const idsWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = req.url ? req.url.split('?')[0] : '';
  if (pathname === '/ids-ws') {
    idsWss.handleUpgrade(req, socket, head, ws => idsWss.emit('connection', ws, req));
  } else {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  }
});

wss.on('connection', (ws, req) => {
  const site = new URL(req.url, 'http://x').searchParams.get('site') || 'ximg';

  const makeSend = (siteName) => async line => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      const parsed = parseLine(line);
      if (parsed.ip === '172.18.0.1') return;
      if (siteName) parsed.site = siteName;
      if (parsed.ip) {
        const geo = await lookupGeo(parsed.ip);
        parsed.countryCode = geo.countryCode;
        parsed.country = geo.country;
        parsed.city = geo.city;
      }
      ws.send(JSON.stringify(parsed));
    } catch (_) {}
  };

  if (site === 'all') {
    const stopFns = [];
    const seedLines = [];
    for (const [siteName, logFilename] of Object.entries(LOG_FILES)) {
      const logFile = path.join(LOGS_DIR, logFilename);
      const send = makeSend(siteName);
      for (const line of lastLines(logFile, 30)) {
        seedLines.push({ ts: logLineSortKey(line), line, send });
      }
      stopFns.push(tailFile(logFile, send));
    }
    // Send oldest-first so newest lands at top (client prepends)
    seedLines.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
    seedLines.slice(-500).forEach(({ line, send }) => send(line));
    const stopAll = () => stopFns.forEach(fn => fn());
    ws.on('close', stopAll);
    ws.on('error', stopAll);
    return;
  }

  const logFile = path.join(LOGS_DIR, LOG_FILES[site] || LOG_FILES.ximg);
  const send = makeSend(null);

  // Replay last 100 lines on connect
  lastLines(logFile, 100).forEach(send);

  const stop = tailFile(logFile, send);
  ws.on('close', stop);
  ws.on('error', stop);
});

// ── WebSocket keepalive pings ─────────────────────────────────────────────────
setInterval(() => {
  const ping = JSON.stringify({ ping: true });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      try { client.send(ping); } catch(_) {}
    }
  }
}, 30000);

// ── IDS WebSocket (/ids-ws) ───────────────────────────────────────────────────
idsWss.on('connection', (ws) => {
  idsWsClients.add(ws);
  // Replay last 100 geo-enriched alerts on connect
  const recent = idsAlerts.slice(-100);
  for (const alert of recent) {
    try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(alert)); } catch(_) {}
  }
  ws.on('close', () => idsWsClients.delete(ws));
  ws.on('error', () => idsWsClients.delete(ws));
});

// Tail EVE log for live alerts (started after server is ready)
tailFile(IDS_EVE_LOG, async line => {
  const alert = parseEveAlert(line);
  if (!alert) return;
  idsIngestAlert(alert);
  await idsEnrichAndBroadcast(alert);
});

server.listen(PORT, () => console.log('logs server listening on :' + PORT));
