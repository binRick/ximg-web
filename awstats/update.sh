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

# ── 7-day sparkline ───────────────────────────────────────────────────────────
# Builds an inline SVG polyline from the last 7 days of BEGIN_DAY hits in the
# site's AWStats data files. Missing days default to 0 so the window is always
# exactly 7 points wide ending today (UTC).
sparkline_svg() {
    local site="$1"
    local datadir="${DATADIR}/${site}"
    perl - "$datadir" "$site" << 'PERL'
use strict;
use warnings;
use POSIX qw(strftime);
my ($datadir, $site) = @ARGV;
my $now = time;
my @days = map { strftime("%Y%m%d", gmtime($now - $_ * 86400)) } reverse(0..6);
my %hits;
for my $f (glob "$datadir/awstats*.$site.txt") {
    open my $fh, "<", $f or next;
    my $in_day = 0;
    while (<$fh>) {
        if (/^BEGIN_DAY/) { $in_day = 1; next; }
        if (/^END_DAY/)   { $in_day = 0; next; }
        if ($in_day && /^(\d{8})\s+\d+\s+(\d+)/) { $hits{$1} = $2; }
    }
    close $fh;
}
my @vals = map { $hits{$_} // 0 } @days;
my $max = 1;
for (@vals) { $max = $_ if $_ > $max; }
my @pts;
my @pretty = map {
    my ($y,$m,$d) = ($_ =~ /^(\d{4})(\d{2})(\d{2})$/);
    my @mn = qw(Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec);
    "$mn[$m-1] $d";
} @days;
my $points_html = "";
for my $i (0 .. $#vals) {
    my $x = $i * 100 / 6;
    my $y = 95 - ($vals[$i] * 85 / $max);
    push @pts, sprintf("%.1f,%.1f", $x, $y);
    $points_html .= sprintf(
        qq{<span class="sparkpoint" style="left:%.1f%%;top:%.1f%%" data-date="%s" data-hits="%d"></span>},
        $x, $y, $pretty[$i], $vals[$i]
    );
}
my $line  = join(" ", @pts);
my $area  = "0,100 " . $line . " 100,100";
my $title = "Last 7 days hits: " . join(", ", map { "$pretty[$_]=$vals[$_]" } 0..$#days);
print qq{<svg class="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><title>$title</title><polygon points="$area" fill="rgba(88,166,255,.12)"/><polyline points="$line" fill="none" stroke="#58a6ff" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg><div class="sparkpoints">$points_html</div>};
PERL
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
.site-card{position:relative;overflow:hidden;display:block;padding:1.2rem 1.4rem;background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.07);border-radius:8px;
  color:#c9d1d9;text-decoration:none;transition:all .18s}
.site-card:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.15);color:#fff}
.site-card:hover .sparkline{opacity:.65}
.site-card>*{position:relative;z-index:1}
.site-card .sparkline{position:absolute;inset:0;width:100%;height:100%;z-index:0;
  opacity:.45;pointer-events:none;transition:opacity .18s}
.sparkpoints{position:absolute;inset:0;z-index:2;pointer-events:none}
.sparkpoint{position:absolute;width:9px;height:9px;border-radius:50%;
  background:#58a6ff;box-shadow:0 0 0 2px rgba(88,166,255,.18);
  transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;
  opacity:0;transition:opacity .15s,box-shadow .15s,background .15s}
.site-card:hover .sparkpoint{opacity:.85}
.sparkpoint:hover{opacity:1;background:#79c0ff;box-shadow:0 0 0 4px rgba(121,192,255,.28)}
#spark-tip{position:fixed;pointer-events:none;background:#161b22;color:#e6edf3;
  padding:.4rem .6rem;border:1px solid #30363d;border-radius:4px;
  font-size:.74rem;font-family:'Courier New',monospace;
  opacity:0;transition:opacity .12s;z-index:1000;white-space:nowrap;
  box-shadow:0 4px 12px rgba(0,0,0,.4)}
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
    spark=$(sparkline_svg "$site")
    echo "    <a class=\"site-card\" href=\"/${site}/\">" >> "${OUTDIR}/index.html"
    echo "      ${spark}" >> "${OUTDIR}/index.html"
    echo "      <div class=\"site-name\">${name}</div>" >> "${OUTDIR}/index.html"
    echo "      <div class=\"site-desc\">${desc}</div>" >> "${OUTDIR}/index.html"
    echo "    </a>" >> "${OUTDIR}/index.html"
done

cat >> "${OUTDIR}/index.html" << HTML2
  </div>
  <p class="updated">Last updated: $(date -u '+%Y-%m-%d %H:%M UTC')</p>
</div>
<div id="spark-tip"></div>
<script>
(function(){
  var tip = document.getElementById('spark-tip');
  function show(e){
    var el = e.currentTarget;
    var n = parseInt(el.dataset.hits, 10);
    tip.textContent = el.dataset.date + ' — ' + n.toLocaleString() + ' hit' + (n === 1 ? '' : 's');
    tip.style.opacity = '1';
    move(e);
  }
  function move(e){
    var pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    var x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth)  x = e.clientX - pad - w;
    if (y + h > window.innerHeight) y = e.clientY - pad - h;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }
  function hide(){ tip.style.opacity = '0'; }
  document.querySelectorAll('.sparkpoint').forEach(function(p){
    p.addEventListener('mouseenter', show);
    p.addEventListener('mousemove',  move);
    p.addEventListener('mouseleave', hide);
    p.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); });
  });
})();
</script>
</body>
</html>
HTML2

echo "[$(date)] AWStats update complete."
