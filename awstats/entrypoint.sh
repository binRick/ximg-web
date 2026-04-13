#!/bin/sh
set -e

AWSTATS_CONFDIR=/configs
AWSTATS_DATADIR=/data
AWSTATS_OUTDIR=/output
AWSTATS_LOGDIR=/logs

# All sites (matches LOG_FILES in logs-server/server.js)
SITES="555timer agents ai algorithms america ansible apps arduino arpanet ascii base64 bash battery binary biology brain bsd budget butterfly capacitor cdn cell change chaos chemistry chess chinese circuit claude claudemd cnc coffee coldwar color compiler compound computers cron crypto database debt diff dna dns docker doom embeddings epidemic evolution fidonet florida fpga git gravity grilling guns hash http ids immune impedance india inflation internet japan json jwt kart kombat linux loadbalancer logic logs mac mail mainframe mario math medieval monkey mortgage moto nagios nav netdata network nintendo nutrition ohms opamp os oscilloscope passwords pcb physics pinout pirates pizza playground poker probability programming protocol psu punch pwm quake quantum queue readme regex regression request resistor retire rx sandbox security simcity sleep space spectrum spi sql ssh stats statslab status suricata synth systemd systemdesign tampa temperature terminal tmux tokens training trump uart unix url vim visualize voltage vr vt101 warcraft wargames waves wood world ximg ximg-app yaml zsh"

# ── GeoIP plugin config ───────────────────────────────────────────────────────
# Uses AWStats' built-in geoipfree plugin + Geo::IPfree bundled IP database
# No external database file needed
GEOIP_PLUGIN='LoadPlugin="geoipfree"'

# ── Generate per-site AWStats configs ────────────────────────────────────────
mkdir -p "$AWSTATS_CONFDIR"

for site in $SITES; do
    logfile="${AWSTATS_LOGDIR}/${site}.access.log"
    mkdir -p "${AWSTATS_DATADIR}/${site}"

    # Domain: ximg -> ximg.app, others -> SITE.ximg.app
    if [ "$site" = "ximg" ]; then
        domain="ximg.app"
        aliases="ximg.app www.ximg.app"
    else
        domain="${site}.ximg.app"
        aliases="${site}.ximg.app"
    fi

    cat > "${AWSTATS_CONFDIR}/awstats.${site}.conf" << EOF
LogType=W
LogFormat=1
LogFile=${logfile}
SiteDomain=${domain}
HostAliases=${aliases}
DirData=${AWSTATS_DATADIR}/${site}
DirCgi=/usr/lib/awstats/cgi-bin
DirIcons=/icons
AllowToUpdateStatsFromBrowser=0
DNSLookup=0
SkipHosts="127.0.0.1 ::1 172.238.205.61 172.17.0.1 172.18.0.1 172.19.0.1 2a01:7e04::2000:30ff:fed5:d413"
DefaultFile="index.html"
${GEOIP_PLUGIN}
EOF
done

# ── Generate combined config (all sites merged) ───────────────────────────────
ALL_LOGS=""
for site in $SITES; do
    logfile="${AWSTATS_LOGDIR}/${site}.access.log"
    if [ -f "$logfile" ]; then
        ALL_LOGS="$ALL_LOGS $logfile"
    fi
done

mkdir -p "${AWSTATS_DATADIR}/combined"
MERGE_CMD="/usr/bin/logresolvemerge.pl${ALL_LOGS} |"

cat > "${AWSTATS_CONFDIR}/awstats.combined.conf" << EOF
LogType=W
LogFormat=1
LogFile="${MERGE_CMD}"
SiteDomain=ximg.app
HostAliases=ximg.app
DirData=${AWSTATS_DATADIR}/combined
DirCgi=/usr/lib/awstats/cgi-bin
DirIcons=/icons
AllowToUpdateStatsFromBrowser=0
DNSLookup=0
SkipHosts="127.0.0.1 ::1 172.238.205.61 172.17.0.1 172.18.0.1 172.19.0.1 2a01:7e04::2000:30ff:fed5:d413"
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
