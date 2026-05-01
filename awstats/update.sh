#!/bin/sh
# Update AWStats data files from nginx logs and regenerate static HTML output
# Reports are generated for 3 top-level domains only:
#   ximg-all      → ximg.app (all subdomains merged)
#   dockerimage-dev → dockerimage.dev
#   swaudit       → swaudit.net

SITES="ximg-all dockerimage-dev swaudit"

CONFDIR=/configs
DATADIR=/data
OUTDIR=/output

echo "[$(date)] Starting AWStats update..."

# ── Dark mode + nav injection ─────────────────────────────────────────────────
inject_theme() {
    local f="$1"
    [ -f "$f" ] || return
    perl -i -pe '
        s|</head>|<link rel="stylesheet" href="/dark.css"></head>|;
        s|</body>|<script src="/shared/nav.js?v=2"></script></body>|;
    ' "$f"
    # Strip the When/Who/Navigation/Referrers/Others nav table
    perl -i -0777 -pe 's|<table>\s*<tr><td class="awsm"[^>]*><b>When:</b>.*?</table>\s*<br />||s' "$f"
    # Strip the AWStats footer branding
    perl -i -pe 's|<span dir="ltr"[^>]*>.*?Advanced Web Statistics.*?</span><br />||' "$f"
}

# ── Display names for index page ──────────────────────────────────────────────
display_name() {
    case "$1" in
        ximg-all)        echo "ximg.app" ;;
        dockerimage-dev) echo "dockerimage.dev" ;;
        swaudit)         echo "swaudit.net" ;;
        *)               echo "$1" ;;
    esac
}

display_desc() {
    case "$1" in
        ximg-all)        echo "All ximg.app subdomains combined" ;;
        dockerimage-dev) echo "Docker image tools" ;;
        swaudit)         echo "Software audit platform" ;;
        *)               echo "$1" ;;
    esac
}

# ── Per-site update ───────────────────────────────────────────────────────────
for site in $SITES; do
    datadir="${DATADIR}/${site}"
    outdir="${OUTDIR}/${site}"
    mkdir -p "$datadir" "$outdir"

    # Update data files from log
    awstats.pl -update -config="$site" -configdir="$CONFDIR" > /dev/null 2>&1 || true

    # Generate static HTML for current month
    awstats.pl -config="$site" -configdir="$CONFDIR" \
        -output -staticlinks > "${outdir}/index.html" 2>/dev/null || true
    inject_theme "${outdir}/index.html"

    # Generate sub-report pages
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

# ── Regenerate index page ─────────────────────────────────────────────────────
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
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem}
.site-card{display:block;padding:1.2rem 1.4rem;background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.07);border-radius:8px;
  color:#c9d1d9;text-decoration:none;transition:all .18s}
.site-card:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.15);color:#fff}
.site-name{font-size:1rem;font-weight:700;margin-bottom:.3rem}
.site-desc{font-size:.78rem;color:#8b949e}
.updated{margin-top:2rem;font-size:.72rem;color:#4a5568}
</style>
</head>
<body>
<script src="/shared/nav.js?v=2"></script>
<div class="container">
  <h1>Site Statistics</h1>
  <p class="subtitle">AWStats traffic reports by domain — updated hourly</p>
  <div class="grid">
HTML

for site in $SITES; do
    outfile="${OUTDIR}/${site}/index.html"
    [ -f "$outfile" ] || continue
    name=$(display_name "$site")
    desc=$(display_desc "$site")
    echo "    <a class=\"site-card\" href=\"/${site}/\">" >> "${OUTDIR}/index.html"
    echo "      <div class=\"site-name\">${name}</div>" >> "${OUTDIR}/index.html"
    echo "      <div class=\"site-desc\">${desc}</div>" >> "${OUTDIR}/index.html"
    echo "    </a>" >> "${OUTDIR}/index.html"
done

cat >> "${OUTDIR}/index.html" << HTML2
  </div>
  <p class="updated">Last updated: $(date -u '+%Y-%m-%d %H:%M UTC')</p>
</div>
</body>
</html>
HTML2

echo "[$(date)] AWStats update complete."
