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
  cnc:       'cnc.access.log',
  simcity:   'simcity.access.log',
  rx:        'rx.access.log',
  mail:      'mail.access.log',
  internet:  'internet.access.log',
  fidonet:   'fidonet.access.log',
  coldwar:   'coldwar.access.log',
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
  dockerimagedownloader: 'dockerimagedownloader.access.log',
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
    .dl-num{color:#ffa657;text-align:right}
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
          <button class="site-opt" data-site="coldwar">coldwar</button>
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
          <button class="site-opt" data-site="dockerimagedownloader">dockerimagedownloader</button>
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
          <button class="site-opt" data-site="yaml">yaml</button>
          <button class="site-opt" data-site="zsh">zsh</button>
        </div>
      </div>
    </div>
    <button class="tab" id="ssh-tab">ssh sessions</button>
    <button class="tab" id="dl-tab">docker downloads</button>
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
            <th>Pull&nbsp;time</th>
            <th>Size</th>
            <th>Wait</th>
            <th>Download&nbsp;time</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody id="dl-tbody"><tr><td colspan="8" class="dl-empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </div>

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

    document.querySelectorAll('.tab:not(#ssh-tab):not(#dl-tab)').forEach(btn => {
      btn.addEventListener('click', () => {
        if (sshMode) leaveSshMode();
        if (dlMode) leaveDlMode();
      });
    });

    // ── Docker downloads viewer ───────────────────────────────────────────────
    const dlTab       = document.getElementById('dl-tab');
    const dlContainer = document.getElementById('dl-container');
    let dlMode = false;
    let dlPollTimer = null;

    function enterDlMode() {
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
              '<td class="dl-num" style="text-align:right">' + fmtSecs(e.pullSecs) + '</td>' +
              '<td class="dl-num" style="text-align:right">' + fmtMB(e.sizeMB) + '</td>' +
              '<td class="dl-num" style="text-align:right">' + fmtSecs(e.waitSecs) + '</td>' +
              '<td class="dl-num" style="text-align:right">' + fmtSecs(e.downloadSecs) + '</td>' +
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
