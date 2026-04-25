#!/bin/sh
# Update AWStats data files from nginx logs and regenerate static HTML output

SITES="555timer agents ai algorithms america ansible apps arduino arpanet ascii base64 bash battery binary biology brain bsd budget butterfly capacitor cdn cell change chaos chemistry chess chinese circuit claude claudemd cnc coffee coldwar color compiler compound computers cron crypto database debt diff dna dns docker doom embeddings epidemic evolution fidonet florida fpga git gravity grilling guns hash http ids immune impedance india inflation internet japan json jwt kart kombat linux loadbalancer logic logs mac mail mainframe mario math medieval monkey mortgage moto nagios nav netdata network nintendo nutrition ohms opamp os oscilloscope passwords pcb physics pinout pirates pizza playground poker probability programming protocol psu punch pwm quake quantum queue readme regex regression request resistor retire rx sandbox security simcity sleep space spectrum spi sql ssh stats statslab status suricata synth systemd systemdesign tampa temperature terminal tmux tokens training trump uart unix url vim visualize voltage vr vt101 warcraft wargames waves wood world ximg ximg-app yaml zsh"

CONFDIR=/configs
DATADIR=/data
OUTDIR=/output
LOGDIR=/logs

echo "[$(date)] Starting AWStats update..."

# ── Dark mode + nav injection ─────────────────────────────────────────────────
# Inject dark.css link and shared nav bar into an AWStats-generated HTML file
inject_theme() {
    local f="$1"
    [ -f "$f" ] || return
    perl -i -pe '
        s|</head>|<link rel="stylesheet" href="/dark.css"></head>|;
        s|</body>|<script src="/shared/nav.js?v=2"></script></body>|;
    ' "$f"
}

# ── Per-site update ───────────────────────────────────────────────────────────
for site in $SITES; do
    logfile="${LOGDIR}/${site}.access.log"
    [ -f "$logfile" ] || continue

    datadir="${DATADIR}/${site}"
    outdir="${OUTDIR}/${site}"
    mkdir -p "$datadir" "$outdir"

    # Update data files from log
    awstats.pl -update -config="$site" -configdir="$CONFDIR" > /dev/null 2>&1 || true

    # Generate static HTML for current month (no -month/-year = current)
    awstats.pl -config="$site" -configdir="$CONFDIR" \
        -output -staticlinks > "${outdir}/index.html" 2>/dev/null || true
    inject_theme "${outdir}/index.html"

    # Generate sub-report pages (linked from the main page via -staticlinks)
    for report in alldomains allhosts allrobots browserdetail downloads errors404 \
        keyphrases keywords lasthosts lastrobots osdetail refererpages refererse \
        unknownbrowser unknownip unknownos urldetail urlentry urlexit; do
        outfile="${outdir}/awstats.${site}.${report}.html"
        awstats.pl -config="$site" -configdir="$CONFDIR" \
            -output="$report" -staticlinks > "$outfile" 2>/dev/null || true
        inject_theme "$outfile"
    done

    # Generate one HTML file per historical data file
    for datafile in "${datadir}"/awstats[0-9]*.${site}.txt; do
        [ -f "$datafile" ] || continue
        base=$(basename "$datafile")
        # Filename: awstatsMMYYYY.site.txt  e.g. awstats042026.ximg.txt
        mmyyyy=$(echo "$base" | sed "s/awstats//" | sed "s/\\.${site}\\.txt//")
        mm=$(echo "$mmyyyy" | cut -c1-2)
        yyyy=$(echo "$mmyyyy" | cut -c3-6)
        [ ${#yyyy} -eq 4 ] || continue
        awstats.pl -config="$site" -configdir="$CONFDIR" \
            -month="$mm" -year="$yyyy" \
            -output -staticlinks > "${outdir}/${yyyy}-${mm}.html" 2>/dev/null || true
        inject_theme "${outdir}/${yyyy}-${mm}.html"
    done
done

# ── Combined update ───────────────────────────────────────────────────────────
mkdir -p "${DATADIR}/combined" "${OUTDIR}/combined"
awstats.pl -update -config=combined -configdir="$CONFDIR" > /dev/null 2>&1 || true
awstats.pl -config=combined -configdir="$CONFDIR" \
    -output -staticlinks > "${OUTDIR}/combined/index.html" 2>/dev/null || true
inject_theme "${OUTDIR}/combined/index.html"

# Generate combined sub-report pages
for report in alldomains allhosts allrobots browserdetail downloads errors404 \
    keyphrases keywords lasthosts lastrobots osdetail refererpages refererse \
    unknownbrowser unknownip unknownos urldetail urlentry urlexit; do
    outfile="${OUTDIR}/combined/awstats.combined.${report}.html"
    awstats.pl -config=combined -configdir="$CONFDIR" \
        -output="$report" -staticlinks > "$outfile" 2>/dev/null || true
    inject_theme "$outfile"
done

for datafile in "${DATADIR}/combined"/awstats[0-9]*.combined.txt; do
    [ -f "$datafile" ] || continue
    base=$(basename "$datafile")
    mmyyyy=$(echo "$base" | sed "s/awstats//" | sed "s/\\.combined\\.txt//")
    mm=$(echo "$mmyyyy" | cut -c1-2)
    yyyy=$(echo "$mmyyyy" | cut -c3-6)
    [ ${#yyyy} -eq 4 ] || continue
    awstats.pl -config=combined -configdir="$CONFDIR" \
        -month="$mm" -year="$yyyy" \
        -output -staticlinks > "${OUTDIR}/combined/${yyyy}-${mm}.html" 2>/dev/null || true
    inject_theme "${OUTDIR}/combined/${yyyy}-${mm}.html"
done

# ── Regenerate index page ─────────────────────────────────────────────────────
generate_index() {
cat > "${OUTDIR}/index.html" << 'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site Statistics — ximg.app</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;background:#0a0a0f;color:#c9d1d9;min-height:100vh}
.container{max-width:960px;margin:0 auto;padding:2rem 1.5rem}
h1{font-size:1.4rem;color:#f1f5f9;margin-bottom:.35rem}
.subtitle{color:#8b949e;font-size:.82rem;margin-bottom:2rem}
.combined-link{display:inline-block;padding:.55rem 1.2rem;background:rgba(0,255,65,.08);
  border:1px solid rgba(0,255,65,.3);border-radius:8px;color:#00ff41;
  text-decoration:none;font-size:.85rem;font-weight:700;margin-bottom:2rem;
  transition:background .18s}
.combined-link:hover{background:rgba(0,255,65,.15)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.6rem}
.site-card{display:block;padding:.65rem .85rem;background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.07);border-radius:8px;
  color:#c9d1d9;text-decoration:none;transition:all .18s}
.site-card:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.15);color:#fff}
.site-name{font-size:.8rem;font-weight:700;margin-bottom:.2rem}
.site-domain{font-size:.7rem;color:#8b949e}
.updated{margin-top:2rem;font-size:.72rem;color:#4a5568}
</style>
</head>
<body>
HTML

# Nav bar
echo '<script src="/shared/nav.js?v=2"></script>' >> "${OUTDIR}/index.html"

cat >> "${OUTDIR}/index.html" << 'HTML2'
<div class="container">
  <h1>Site Statistics</h1>
  <p class="subtitle">AWStats reports for all ximg.app subdomains — updated hourly</p>
  <a class="combined-link" href="/combined/">&#9656; All Sites Combined Report</a>
  <div class="grid">
HTML2

    # Add a card per site that has output
    for site in $SITES; do
        outfile="${OUTDIR}/${site}/index.html"
        [ -f "$outfile" ] || continue
        if [ "$site" = "ximg" ]; then
            domain="ximg.app"
        else
            domain="${site}.ximg.app"
        fi
        echo "    <a class=\"site-card\" href=\"/${site}/\">" >> "${OUTDIR}/index.html"
        echo "      <div class=\"site-name\">${site}</div>" >> "${OUTDIR}/index.html"
        echo "      <div class=\"site-domain\">${domain}</div>" >> "${OUTDIR}/index.html"
        echo "    </a>" >> "${OUTDIR}/index.html"
    done

cat >> "${OUTDIR}/index.html" << HTML3
  </div>
  <p class="updated">Last updated: $(date -u '+%Y-%m-%d %H:%M UTC')</p>
</div>
</body>
</html>
HTML3
}

generate_index

echo "[$(date)] AWStats update complete."
