#!/bin/sh
set -e

AWSTATS_CONFDIR=/configs
AWSTATS_DATADIR=/data
AWSTATS_OUTDIR=/output
AWSTATS_LOGDIR=/logs

# All ximg.app subdomain log files (for merging into one report)
XIMG_SITES="555timer agents ai algorithms america ansible ansible-bundler antenna app-audit apps apt-bundler architecture arduino arpanet ascii aztec babylon baking base64 bash battery bbq bbs beer bgp binary biology bourbon brain british bsd budget bundler bundler-info butterfly c99 ca-fetcher calories capacitor cdn cell change chaos chemistry chess chinese chmod cia cidr circuit civilwar clamav claude claudemd cnc cocktails coffee coldwar colonial color commodore communism compiler compound computers conway cron crusades crypto csv cuba curl database dcf debt devtools-info diff dna dns docker dockerimage dockerimagedownloader doom dos downloader egypt embeddings epidemic epoch esp32 esp32-s3-lcd evolution ferment fidonet florida forex fpga french gentoo git githubstars github-stats go-bundler golang gravity greece grilling guns hash honeypot httpimmune impedance india industrial inflation internet ip iptables ironfist iso japan json jwt kart knife kombat linux loadbalancer logic logs lorem mac mail mainframe makefile mario markdown market math medieval modem mongols monkey mortgage moto nagios napoleon nav netdata network nintendo nodejs nodejs-bundler nuget-bundler nutrition ohms opamp options os oscilloscope ottoman pal password passwords pasta pcb php physics pinout pirates pizza playground poker probability proc-trace-dns proc-trace-exec proc-trace-net proc-trace-tls programming projects-info protocol ps1 psu punch pwm python python-bundler quake quantum queue ramen raylib rbterm readme recipe regex regression renaissance request resistor retire revolution rome rpm-bundler russianrev rx samurai sandbox savings scumm security silkroad simcity sleep smoker space spacerace spectrum spi spice sql ssh ssl stats statslab status stockssushi synth systemd systemdesign tacos tampa tax tea temperature templeos terminal tetris thai timespan tls tls-ca-fetch tmux tokens training trump uart unix url utf8 uuid video vikings vim visualize voltage vr vt101 warcraft wargames waves wine wood world ww1 ww2 ximg ximg-app yaml zsh"

# ── GeoIP plugin config ───────────────────────────────────────────────────────
GEOIP_PLUGIN='LoadPlugin="geoipfree"'

SKIP_HOSTS="127.0.0.1 ::1 172.238.205.61 172.17.0.1 172.18.0.1 172.19.0.1 2a01:7e04::2000:30ff:fed5:d413"

# ── Generate configs ─────────────────────────────────────────────────────────
mkdir -p "$AWSTATS_CONFDIR"

# 1. ximg.app — merge all subdomain logs into one report
XIMG_LOGS=""
for site in $XIMG_SITES; do
    logfile="${AWSTATS_LOGDIR}/${site}.access.log"
    if [ -f "$logfile" ]; then
        XIMG_LOGS="$XIMG_LOGS $logfile"
    fi
done

mkdir -p "${AWSTATS_DATADIR}/ximg-all"
MERGE_CMD="/usr/bin/logresolvemerge.pl${XIMG_LOGS} |"

cat > "${AWSTATS_CONFDIR}/awstats.ximg-all.conf" << EOF
LogType=W
LogFormat=1
LogFile="${MERGE_CMD}"
SiteDomain=ximg.app
HostAliases=ximg.app *.ximg.app
DirData=${AWSTATS_DATADIR}/ximg-all
DirCgi=/usr/lib/awstats/cgi-bin
DirIcons=/icons
AllowToUpdateStatsFromBrowser=0
DNSLookup=0
SkipHosts="${SKIP_HOSTS}"
DefaultFile="index.html"
${GEOIP_PLUGIN}
EOF

# 2. dockerimage.dev
mkdir -p "${AWSTATS_DATADIR}/dockerimage-dev"
cat > "${AWSTATS_CONFDIR}/awstats.dockerimage-dev.conf" << EOF
LogType=W
LogFormat=1
LogFile=${AWSTATS_LOGDIR}/dockerimage.dev.access.log
SiteDomain=dockerimage.dev
HostAliases=dockerimage.dev www.dockerimage.dev
DirData=${AWSTATS_DATADIR}/dockerimage-dev
DirCgi=/usr/lib/awstats/cgi-bin
DirIcons=/icons
AllowToUpdateStatsFromBrowser=0
DNSLookup=0
SkipHosts="${SKIP_HOSTS}"
DefaultFile="index.html"
${GEOIP_PLUGIN}
EOF

# 3. swaudit.net
mkdir -p "${AWSTATS_DATADIR}/swaudit"
cat > "${AWSTATS_CONFDIR}/awstats.swaudit.conf" << EOF
LogType=W
LogFormat=1
LogFile=${AWSTATS_LOGDIR}/swaudit.access.log
SiteDomain=swaudit.net
HostAliases=swaudit.net www.swaudit.net
DirData=${AWSTATS_DATADIR}/swaudit
DirCgi=/usr/lib/awstats/cgi-bin
DirIcons=/icons
AllowToUpdateStatsFromBrowser=0
DNSLookup=0
SkipHosts="${SKIP_HOSTS}"
DefaultFile="index.html"
${GEOIP_PLUGIN}
EOF

# 4. tmpfs.tech
mkdir -p "${AWSTATS_DATADIR}/tmpfs"
cat > "${AWSTATS_CONFDIR}/awstats.tmpfs.conf" << EOF
LogType=W
LogFormat=1
LogFile=${AWSTATS_LOGDIR}/tmpfs-academy.access.log
SiteDomain=tmpfs.tech
HostAliases=tmpfs.tech www.tmpfs.tech tmpfs-academy.ximg.app
DirData=${AWSTATS_DATADIR}/tmpfs
DirCgi=/usr/lib/awstats/cgi-bin
DirIcons=/icons
AllowToUpdateStatsFromBrowser=0
DNSLookup=0
SkipHosts="${SKIP_HOSTS}"
DefaultFile="index.html"
${GEOIP_PLUGIN}
EOF

# ── Copy AWStats icons to output ──────────────────────────────────────────────
mkdir -p "${AWSTATS_OUTDIR}/icons"
if [ -d /usr/lib/awstats/icon ]; then
    cp -r /usr/lib/awstats/icon/* "${AWSTATS_OUTDIR}/icons/"
fi

# ── Write dark mode CSS ───────────────────────────────────────────────────────
cat > "${AWSTATS_OUTDIR}/dark.css" << 'DARKCSS'
/* AWStats dark mode override */
body {
  background: #0d1117 !important;
  color: #c9d1d9 !important;
}
.aws_border { background: #161b22 !important; }
.aws_title  { background: #21262d !important; color: #c9d1d9 !important; }
.aws_blank  { background: #0d1117 !important; color: #c9d1d9 !important; }
.aws_data   { background: #0d1117 !important; }
th {
  background: #21262d !important;
  color: #c9d1d9 !important;
  border-color: #30363d !important;
}
td, td.aws, td.awsm {
  color: #c9d1d9 !important;
  border-color: #30363d !important;
}
a:link, a:visited { color: #58a6ff !important; }
a:hover { color: #79c0ff !important; }
b { color: #e6edf3 !important; }

/* Structural bgcolor attributes (layout, not chart bars) */
[bgcolor="#FFFFFF"] { background: #0d1117 !important; }
[bgcolor="#CCCCDD"] { background: #21262d !important; }
[bgcolor="#ECECEC"] { background: #1c2128 !important; }
/* Weekend rows — keep light background, force black text for readability */
[bgcolor="#EAEAEA"], tr[bgcolor="#EAEAEA"] td { background: #EAEAEA !important; color: #000000 !important; }

/* Inline text color overrides */
[color="#000000"] { color: #c9d1d9 !important; }
span[style*="color: #000000"] { color: #c9d1d9 !important; }

/* Form / button */
input, select {
  background: #1c2128 !important;
  color: #c9d1d9 !important;
  border: 1px solid #30363d !important;
}
.aws_button {
  background: #21262d !important;
  color: #c9d1d9 !important;
  border-color: #30363d !important;
}
DARKCSS

# ── Write swaudit PIN entry page ──────────────────────────────────────────────
# Server-side gate lives in nginx/nginx.conf (location /swaudit/ checks the
# swaudit_pin cookie). This page is what the gate redirects to when the cookie
# is missing or wrong; on correct PIN it sets the cookie and forwards to /swaudit/.
cat > "${AWSTATS_OUTDIR}/swaudit-pin.html" << 'PINHTML'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>swaudit.net stats — PIN required</title>
<link rel="stylesheet" href="/dark.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;background:#0a0a0f;color:#c9d1d9;min-height:100vh;
  display:flex;align-items:center;justify-content:center;padding:1.5rem}
.box{width:100%;max-width:380px;padding:2rem 2rem 1.6rem;
  background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
  border-radius:8px;text-align:center}
h1{font-size:1rem;color:#f1f5f9;margin-bottom:.4rem;letter-spacing:.05em}
p.sub{color:#8b949e;font-size:.78rem;margin-bottom:1.4rem}
input[type=password]{width:100%;padding:.7rem .9rem;font-family:inherit;font-size:1.1rem;
  letter-spacing:.4em;text-align:center;color:#e6edf3;
  background:#161b22;border:1px solid #30363d;border-radius:4px;outline:none;
  transition:border-color .15s}
input[type=password]:focus{border-color:#58a6ff}
button{margin-top:.9rem;width:100%;padding:.65rem;font-family:inherit;font-size:.82rem;
  letter-spacing:.18em;text-transform:uppercase;color:#0a0a0f;background:#58a6ff;
  border:0;border-radius:4px;cursor:pointer;transition:background .15s}
button:hover{background:#79c0ff}
.err{margin-top:.8rem;min-height:1.1rem;font-size:.74rem;color:#f87171;letter-spacing:.05em}
.back{margin-top:1.2rem;font-size:.72rem}
.back a{color:#5a6070;text-decoration:none}
.back a:hover{color:#8b949e}
</style>
</head>
<body>
<div class="box">
  <h1>swaudit.net stats</h1>
  <p class="sub">Enter PIN to view this report</p>
  <form id="f" autocomplete="off">
    <input id="pin" type="password" inputmode="numeric" pattern="[0-9]*"
           maxlength="8" autofocus aria-label="PIN">
    <button type="submit">Unlock</button>
    <div id="err" class="err"></div>
  </form>
  <div class="back"><a href="/">&larr; back to all stats</a></div>
</div>
<script src="/shared/nav.js?v=2"></script>
<script>
(function(){
  var PIN = '666';
  if (document.cookie.split(';').some(function(c){
    return c.trim() === 'swaudit_pin=' + PIN;
  })) {
    location.replace('/swaudit/');
    return;
  }
  var f = document.getElementById('f');
  var pin = document.getElementById('pin');
  var err = document.getElementById('err');
  f.addEventListener('submit', function(e){
    e.preventDefault();
    if (pin.value === PIN) {
      var d = new Date(Date.now() + 7*24*3600*1000).toUTCString();
      document.cookie = 'swaudit_pin=' + PIN + '; path=/; expires=' + d + '; SameSite=Lax';
      location.replace('/swaudit/');
    } else {
      err.textContent = 'Incorrect PIN';
      pin.value = '';
      pin.focus();
    }
  });
})();
</script>
</body>
</html>
PINHTML

# ── Write tmpfs.tech PIN entry page ───────────────────────────────────────────
# Mirrors the swaudit gate: nginx (location /tmpfs/) checks the tmpfs_pin
# cookie and bounces here when it is missing or wrong; correct PIN sets the
# cookie and forwards to /tmpfs/.
cat > "${AWSTATS_OUTDIR}/tmpfs-pin.html" << 'PINHTML'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>tmpfs.tech stats — PIN required</title>
<link rel="stylesheet" href="/dark.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;background:#0a0a0f;color:#c9d1d9;min-height:100vh;
  display:flex;align-items:center;justify-content:center;padding:1.5rem}
.box{width:100%;max-width:380px;padding:2rem 2rem 1.6rem;
  background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
  border-radius:8px;text-align:center}
h1{font-size:1rem;color:#f1f5f9;margin-bottom:.4rem;letter-spacing:.05em}
p.sub{color:#8b949e;font-size:.78rem;margin-bottom:1.4rem}
input[type=password]{width:100%;padding:.7rem .9rem;font-family:inherit;font-size:1.1rem;
  letter-spacing:.4em;text-align:center;color:#e6edf3;
  background:#161b22;border:1px solid #30363d;border-radius:4px;outline:none;
  transition:border-color .15s}
input[type=password]:focus{border-color:#58a6ff}
button{margin-top:.9rem;width:100%;padding:.65rem;font-family:inherit;font-size:.82rem;
  letter-spacing:.18em;text-transform:uppercase;color:#0a0a0f;background:#58a6ff;
  border:0;border-radius:4px;cursor:pointer;transition:background .15s}
button:hover{background:#79c0ff}
.err{margin-top:.8rem;min-height:1.1rem;font-size:.74rem;color:#f87171;letter-spacing:.05em}
.back{margin-top:1.2rem;font-size:.72rem}
.back a{color:#5a6070;text-decoration:none}
.back a:hover{color:#8b949e}
</style>
</head>
<body>
<div class="box">
  <h1>tmpfs.tech stats</h1>
  <p class="sub">Enter PIN to view this report</p>
  <form id="f" autocomplete="off">
    <input id="pin" type="password" inputmode="numeric" pattern="[0-9]*"
           maxlength="8" autofocus aria-label="PIN">
    <button type="submit">Unlock</button>
    <div id="err" class="err"></div>
  </form>
  <div class="back"><a href="/">&larr; back to all stats</a></div>
</div>
<script src="/shared/nav.js?v=2"></script>
<script>
(function(){
  var PIN = '31337';
  if (document.cookie.split(';').some(function(c){
    return c.trim() === 'tmpfs_pin=' + PIN;
  })) {
    location.replace('/tmpfs/');
    return;
  }
  var f = document.getElementById('f');
  var pin = document.getElementById('pin');
  var err = document.getElementById('err');
  f.addEventListener('submit', function(e){
    e.preventDefault();
    if (pin.value === PIN) {
      var d = new Date(Date.now() + 7*24*3600*1000).toUTCString();
      document.cookie = 'tmpfs_pin=' + PIN + '; path=/; expires=' + d + '; SameSite=Lax';
      location.replace('/tmpfs/');
    } else {
      err.textContent = 'Incorrect PIN';
      pin.value = '';
      pin.focus();
    }
  });
})();
</script>
</body>
</html>
PINHTML

# ── Run initial stats update ──────────────────────────────────────────────────
/usr/local/bin/awstats-update.sh

# ── Set up cron ───────────────────────────────────────────────────────────────
mkdir -p /etc/crontabs
cat > /etc/crontabs/root << 'CRONEOF'
# Update AWStats stats every hour
0 * * * * /usr/local/bin/awstats-update.sh >> /var/log/awstats.log 2>&1
CRONEOF

exec crond -f -l 6
