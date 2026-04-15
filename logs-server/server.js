const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const geoip = require('geoip-lite');

const LOGS_DIR    = '/logs';
const SSH_DIR     = '/ssh-logs';
const DL_LOG_FILE = '/data/dockerimagedownloader.log';
const PORT        = 3000;

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
  vim:         'vim.access.log',
  http:        'http.access.log',
  ssh:         'ssh.access.log',
  sql:         'sql.access.log',
  space:       'space.access.log',
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
  physics:     'physics.access.log',
  chemistry:   'chemistry.access.log',
  biology:     'biology.access.log',
  math:        'math.access.log',
  evolution:   'evolution.access.log',
  dns:         'dns.access.log',
  suricata:    'suricata.access.log',
  crypto:      'crypto.access.log',

  'ximg-app':  'ximg-app.access.log',
  logs:        'logs.access.log',
  stats:       'stats.access.log',
  ids:         'ids.access.log',
  nagios:      'nagios.access.log',
  claudemd:    'claudemd.access.log',
  network:     'network.access.log',
  request:     'request.access.log',
  readme:      'readme.access.log',
  status:      'status.access.log',
  nav:         'nav.access.log',
  world:       'world.access.log',
  sandbox:     'sandbox.access.log',
  gravity:     'gravity.access.log',
  waves:       'waves.access.log',
  chaos:       'chaos.access.log',
  epidemic:    'epidemic.access.log',
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
  brain:          'brain.access.log',
  sleep:          'sleep.access.log',
  nutrition:      'nutrition.access.log',
  training:       'training.access.log',
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
  dna:            'dna.access.log',
  cell:           'cell.access.log',
  immune:         'immune.access.log',
  quantum:        'quantum.access.log',
  synth:          'synth.access.log',
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
  iso:              'iso.access.log',
  honeypot:         'honeypot.access.log',
  'bundler-info':   'bundler-info.access.log',
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
    return buf.toString('utf8').split('\n').filter(l => l.trim()).slice(-n);
  } catch (_) { return []; }
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

// ── Parse nginx combined log line ────────────────────────────────────────────
function parseLine(raw) {
  const m = raw.match(
    /^(\S+)\s+-\s+-\s+\[([^\]]+)\]\s+"([^"]+)"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"/
  );
  if (!m) return { raw };
  const [, ip, ts, req, status, bytes, ref, ua] = m;
  const [method, urlPath] = req.split(' ');
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
    .col-geo{color:#a5b4fc;font-size:.75rem}
    .col-bytes{color:#94a3b8;text-align:right;font-size:.74rem}
    .col-path{color:var(--text)}
    .s2xx{color:#00ff41}.s3xx{color:#06b6d4}.s4xx{color:#facc15}.s5xx{color:#ff7b72}.s0{color:var(--dim)}
    .col-app{color:var(--dim);font-size:.72rem}
    .raw-line{color:var(--dim);font-size:.75rem;padding:.1rem .25rem}
    .connecting{color:var(--dim);padding:1rem;animation:blink2 1s step-end infinite}
    @keyframes blink2{0%,100%{opacity:1}50%{opacity:.3}}

    /* ── Global Map ─────────────────────────────────────────────────────── */
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
          <button class="site-opt" data-site="biology">biology</button>
          <button class="site-opt" data-site="bsd">bsd</button>
          <button class="site-opt" data-site="butterfly">butterfly</button>
          <button class="site-opt" data-site="change">change</button>
          <button class="site-opt" data-site="chemistry">chemistry</button>
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
          <button class="site-opt" data-site="evolution">evolution</button>
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
          <button class="site-opt" data-site="math">math</button>
          <button class="site-opt" data-site="medieval">medieval</button>
          <button class="site-opt" data-site="monkey">monkey</button>
          <button class="site-opt" data-site="moto">moto</button>
          <button class="site-opt" data-site="nagios">nagios</button>
          <button class="site-opt" data-site="nav">nav</button>
          <button class="site-opt" data-site="nintendo">nintendo</button>
          <button class="site-opt" data-site="passwords">passwords</button>
          <button class="site-opt" data-site="physics">physics</button>
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
          <button class="site-opt" data-site="space">space</button>
          <button class="site-opt" data-site="sql">sql</button>
          <button class="site-opt" data-site="ssh">ssh</button>
          <button class="site-opt" data-site="status">status</button>
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
          <button class="site-opt" data-site="world">world</button>
          <button class="site-opt" data-site="sandbox">sandbox</button>
          <button class="site-opt" data-site="gravity">gravity</button>
          <button class="site-opt" data-site="waves">waves</button>
          <button class="site-opt" data-site="chaos">chaos</button>
          <button class="site-opt" data-site="epidemic">epidemic</button>
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
          <button class="site-opt" data-site="brain">brain</button>
          <button class="site-opt" data-site="sleep">sleep</button>
          <button class="site-opt" data-site="nutrition">nutrition</button>
          <button class="site-opt" data-site="training">training</button>
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
          <button class="site-opt" data-site="dna">dna</button>
          <button class="site-opt" data-site="cell">cell</button>
          <button class="site-opt" data-site="immune">immune</button>
          <button class="site-opt" data-site="quantum">quantum</button>
          <button class="site-opt" data-site="synth">synth</button>
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
          <button class="site-opt" data-site="iso">iso</button>
          <button class="site-opt" data-site="honeypot">honeypot</button>
          <button class="site-opt" data-site="bundler-info">bundler-info</button>
          <button class="site-opt" data-site="yaml">yaml</button>
          <button class="site-opt" data-site="zsh">zsh</button>
        </div>
      </div>
    </div>
    <button class="tab" id="ssh-tab">honeypot sessions</button>
    <button class="tab" id="dl-tab">docker downloads</button>
    <button class="tab" id="map-tab">🌍 global map</button>
    <div class="stats">
      <span>total <span class="stat-val" id="st-total">0</span></span>
      <span>2xx <span class="stat-val s2xx" id="st-2xx">0</span></span>
      <span>3xx <span class="stat-val s3xx" id="st-3xx">0</span></span>
      <span>4xx <span class="stat-val s4xx" id="st-4xx">0</span></span>
      <span>5xx <span class="stat-val s5xx" id="st-5xx">0</span></span>
    </div>
    <button id="pause-btn">⏸ pause</button>
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
      <button onclick="loadDockerDownloads()" style="background:none;border:1px solid rgba(255,255,255,.12);border-radius:4px;color:#586069;font-family:\'Courier New\',monospace;font-size:.72rem;padding:.2rem .55rem;cursor:pointer">↺ refresh</button>
    </div>
    <div id="dl-table-wrap">
      <table class="dl-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>IP</th>
            <th>Image</th>
            <th class="dl-num-h">Pull&nbsp;time</th>
            <th class="dl-num-h">Size</th>
            <th class="dl-num-h">Wait</th>
            <th class="dl-num-h">Download&nbsp;time</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody id="dl-tbody"><tr><td colspan="8" class="dl-empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>

  <div id="map-container">
    <div id="map-header">
      <span class="mh-label">unique IPs</span> <span class="mh-stat" id="mh-ips">—</span>
      <span class="mh-label">countries</span> <span class="mh-stat" id="mh-countries">—</span>
      <span class="mh-label">requests sampled</span> <span class="mh-stat" id="mh-reqs">—</span>
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

    function addLine(data) {
      if (paused) return;
      if (container.querySelector('.connecting')) container.innerHTML = '';
      const el = document.createElement('div');
      if (data.path) {
        const sc = statusClass(data.status);
        el.className = 'log-line new';
        el.innerHTML =
          '<span class="col-ts">'  + esc(data.ts)                             + '</span>' +
          '<span class="col-ip">'  + esc(data.ip)                             + '</span>' +
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
      container.prepend(el);
      while (container.children.length > MAX_LINES) container.removeChild(container.lastChild);
    }

    function connect(site) {
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
      container.innerHTML = '<div class="connecting">connecting…</div>';
      stats.total = stats['2xx'] = stats['3xx'] = stats['4xx'] = stats['5xx'] = 0;
      stTotal.textContent = st2xx.textContent = st3xx.textContent = st4xx.textContent = st5xx.textContent = '0';

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host + '/ws?site=' + site);

      ws.onmessage = e => { try { addLine(JSON.parse(e.data)); } catch(_) {} };
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
      connect(site);
    }

    document.getElementById('pause-btn').addEventListener('click', function() {
      paused = !paused;
      this.textContent = paused ? '▶ resume' : '⏸ pause';
      this.classList.toggle('paused', paused);
    });

    connect(currentSite);

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
      sshTab.classList.add('active');
      document.querySelector('.tab[data-site="all"]').classList.remove('active');
      pickerBtn.classList.remove('has-selection');
      pickerBtn.textContent = '☰ app ▾';
      siteList.querySelectorAll('.site-opt').forEach(o => o.classList.remove('active'));
      document.getElementById('pause-btn').style.display = 'none';
      document.querySelector('.stats').style.display = 'none';
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      logContainer.style.display = 'none';
      sshContainer.style.display = 'flex';
      loadSshSessions();
    }

    function leaveSshMode() {
      sshMode = false;
      sshTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = '';
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
      if (!sshMode) enterSshMode();
      if (dlMode) leaveDlMode();
    });

    document.querySelectorAll('.tab:not(#ssh-tab):not(#dl-tab):not(#map-tab)').forEach(btn => {
      btn.addEventListener('click', () => {
        if (sshMode) leaveSshMode();
        if (dlMode) leaveDlMode();
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
      dlTab.classList.add('active');
      document.querySelector('.tab[data-site="all"]').classList.remove('active');
      pickerBtn.classList.remove('has-selection');
      pickerBtn.textContent = '☰ app ▾';
      siteList.querySelectorAll('.site-opt').forEach(o => o.classList.remove('active'));
      document.getElementById('pause-btn').style.display = 'none';
      document.querySelector('.stats').style.display = 'none';
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      logContainer.style.display = 'none';
      sshContainer.style.display = 'none';
      dlContainer.style.display = 'flex';
      loadDockerDownloads();
      dlPollTimer = setInterval(loadDockerDownloads, 15000);
    }

    function leaveDlMode() {
      dlMode = false;
      dlTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = '';
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

    function loadDockerDownloads() {
      fetch('/docker-downloads')
        .then(r => r.json())
        .then(entries => {
          const tbody = document.getElementById('dl-tbody');
          const count = document.getElementById('dl-count');
          count.textContent = entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies');
          if (!entries.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="dl-empty">No downloads recorded yet.</td></tr>';
            return;
          }
          tbody.innerHTML = entries.map(e => {
            const outcomeClass = e.outcome === 'downloaded' ? 'dl-outcome-downloaded' : 'dl-outcome-ttl';
            const outcomeLabel = e.outcome === 'downloaded' ? '✓ downloaded' : '⏱ ttl expired';
            return '<tr>' +
              '<td class="dl-ip">' + esc(fmtTs(e.ts)) + '</td>' +
              '<td class="dl-ip">' + esc(e.ip || '—') + '</td>' +
              '<td class="dl-img">' + esc(e.image) + '</td>' +
              '<td class="dl-num">' + fmtSecs(e.pullSecs) + '</td>' +
              '<td class="dl-num">' + fmtMB(e.sizeMB) + '</td>' +
              '<td class="dl-num">' + fmtSecs(e.waitSecs) + '</td>' +
              '<td class="dl-num">' + fmtSecs(e.downloadSecs) + '</td>' +
              '<td class="' + outcomeClass + '">' + outcomeLabel + '</td>' +
            '</tr>';
          }).join('');
        })
        .catch(() => {
          document.getElementById('dl-tbody').innerHTML =
            '<tr><td colspan="8" class="dl-empty">Failed to load download log.</td></tr>';
        });
    }

    dlTab.addEventListener('click', () => {
      if (!dlMode) { if (sshMode) leaveSshMode(); enterDlMode(); }
    });

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
      mapMode = true;
      mapTab.classList.add('active');
      document.querySelector('.tab[data-site="all"]').classList.remove('active');
      pickerBtn.classList.remove('has-selection');
      pickerBtn.textContent = '☰ app ▾';
      siteList.querySelectorAll('.site-opt').forEach(o => o.classList.remove('active'));
      document.getElementById('pause-btn').style.display = 'none';
      document.querySelector('.stats').style.display = 'none';
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); ws = null; }
      logContainer.style.display = 'none';
      sshContainer.style.display = 'none';
      dlContainer.style.display = 'none';
      mapContainer.style.display = 'flex';
      if (!landRings) loadLand(); else loadMapData();
      mapAutoRefreshTimer = setInterval(loadMapData, 60000);
      resizeMapCanvas();
      startMapAnim();
    }

    function leaveMapMode() {
      mapMode = false;
      mapTab.classList.remove('active');
      document.getElementById('pause-btn').style.display = '';
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
        enterMapMode();
      }
    });
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
    for (const [siteName, logFilename] of Object.entries(LOG_FILES)) {
      const lines = lastLines(path.join(LOGS_DIR, logFilename), LINES_PER_FILE);
      for (const line of lines) {
        const p = parseLine(line);
        if (!p.ip || p.ip === '172.18.0.1' || p.ip === '127.0.0.1' || p.ip === '::1') continue;
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
    for (const [siteName, logFilename] of Object.entries(LOG_FILES)) {
      const logFile = path.join(LOGS_DIR, logFilename);
      const send = makeSend(siteName);
      lastLines(logFile, 10).forEach(send);
      stopFns.push(tailFile(logFile, send));
    }
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
