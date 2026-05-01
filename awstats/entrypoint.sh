#!/bin/sh
set -e

AWSTATS_CONFDIR=/configs
AWSTATS_DATADIR=/data
AWSTATS_OUTDIR=/output
AWSTATS_LOGDIR=/logs

# All ximg.app subdomain log files (for merging into one report)
XIMG_SITES="555timer agents ai algorithms america ansible ansible-bundler antenna app-audit apps apt-bundler architecture arduino arpanet ascii aztec babylon baking base64 bash battery bbq bbs beer bgp binary biology bourbon brain british bsd budget bundler bundler-info butterfly c99 ca-fetcher calories capacitor cdn cell change chaos chemistry chess chinese chmod cia cidr circuit civilwar clamav claude claudemd cnc cocktails coffee coldwar colonial color commodore communism compiler compound computers conway cron crusades crypto csv cuba curl database dcf debt devtools-info diff dna dns docker dockerimage dockerimagedownloader doom dos downloader egypt embeddings epidemic epoch esp32 esp32-s3-lcd evolution ferment fidonet florida forex fpga french gentoo git githubstars github-stats go-bundler golang gravity greece grilling guns hash honeypot http ids immune impedance india industrial inflation internet ip iptables ironfist iso japan json jwt kart knife kombat linux loadbalancer logic logs lorem mac mail mainframe makefile mario markdown market math medieval modem mongols monkey mortgage moto nagios napoleon nav netdata network nintendo nodejs nodejs-bundler nuget-bundler nutrition ohms opamp options os oscilloscope ottoman pal password passwords pasta pcb php physics pinout pirates pizza playground poker probability proc-trace-dns proc-trace-exec proc-trace-net proc-trace-tls programming projects-info protocol ps1 psu punch pwm python python-bundler quake quantum queue ramen raylib rbterm readme recipe regex regression renaissance request resistor retire revolution rome rpm-bundler russianrev rx samurai sandbox savings scumm security silkroad simcity sleep smoker space spacerace spectrum spi spice sql ssh ssl stats statslab status stocks suricata sushi synth systemd systemdesign tacos tampa tax tea temperature templeos terminal tetris thai timespan tls tls-ca-fetch tmux tokens training trump uart unix url utf8 uuid video vikings vim visualize voltage vr vt101 warcraft wargames waves wine wood world ww1 ww2 ximg ximg-app yaml zsh"

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

# ── Run initial stats update ──────────────────────────────────────────────────
/usr/local/bin/awstats-update.sh

# ── Set up cron ───────────────────────────────────────────────────────────────
mkdir -p /etc/crontabs
cat > /etc/crontabs/root << 'CRONEOF'
# Update AWStats stats every hour
0 * * * * /usr/local/bin/awstats-update.sh >> /var/log/awstats.log 2>&1
CRONEOF

exec crond -f -l 6
