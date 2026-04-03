#!/bin/sh
set -e

AWSTATS_CONFDIR=/configs
AWSTATS_DATADIR=/data
AWSTATS_OUTDIR=/output
AWSTATS_LOGDIR=/logs

# All sites (matches LOG_FILES in logs-server/server.js)
SITES="ximg linux ai mac butterfly ascii json poker mario monkey doom grilling pizza docker yaml kart kombat wargames warcraft moto india chinese wood guns america florida tampa computers trump cnc simcity rx mail internet fidonet coldwar passwords change apps tmux ansible git chess programming systemd vr nav ximg-app logs stats"

# ── Download GeoIP database ───────────────────────────────────────────────────
/usr/local/bin/refresh-geoip.sh || true

# ── Generate per-site AWStats configs ────────────────────────────────────────
GEOIP_PLUGIN=""
if [ -f /data/country.mmdb ]; then
    GEOIP_PLUGIN='LoadPlugin="geoip2_country GEOIP2_COUNTRY /data/country.mmdb"'
fi

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
DirIcons=/icons
AllowToUpdateStatsFromBrowser=0
DNSLookup=0
SkipHosts="127.0.0.1 ::1"
SkipUserAgents=""
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
MERGE_CMD="/opt/awstats/tools/logresolvemerge.pl${ALL_LOGS} |"

cat > "${AWSTATS_CONFDIR}/awstats.combined.conf" << EOF
LogType=W
LogFormat=1
LogFile="${MERGE_CMD}"
SiteDomain=ximg.app
HostAliases=ximg.app
DirData=${AWSTATS_DATADIR}/combined
DirIcons=/icons
AllowToUpdateStatsFromBrowser=0
DNSLookup=0
SkipHosts="127.0.0.1 ::1"
DefaultFile="index.html"
${GEOIP_PLUGIN}
EOF

# ── Copy AWStats icons to output ──────────────────────────────────────────────
mkdir -p "${AWSTATS_OUTDIR}/icons"
if [ -d /opt/awstats/wwwroot/icon ]; then
    cp -r /opt/awstats/wwwroot/icon/* "${AWSTATS_OUTDIR}/icons/"
fi

# ── Run initial stats update ──────────────────────────────────────────────────
/usr/local/bin/awstats-update.sh

# ── Set up cron ───────────────────────────────────────────────────────────────
mkdir -p /etc/crontabs
cat > /etc/crontabs/root << 'CRONEOF'
# Update AWStats stats every hour
0 * * * * /usr/local/bin/awstats-update.sh >> /var/log/awstats.log 2>&1
# Refresh GeoIP database on the 2nd of each month
0 3 2 * * /usr/local/bin/refresh-geoip.sh >> /var/log/awstats.log 2>&1
CRONEOF

exec crond -f -l 6
