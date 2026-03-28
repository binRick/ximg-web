#!/usr/bin/env bash
set -euo pipefail

LOGS_DIR="$(cd "$(dirname "$0")/logs" && pwd)"
OUTPUT="${1:-$(dirname "$0")/LOG_SUMMARY.md}"
NOW=$(date '+%Y-%m-%d %H:%M:%S %Z')

# Parse nginx combined log line into fields
# Format: IP - - [timestamp] "METHOD path proto" status bytes "-" "UA"
parse_access_log() {
  local file="$1"
  [[ -f "$file" && -s "$file" ]] || return 0
  awk '
  {
    ip     = $1
    ts     = substr($4, 2)                         # strip leading [
    req    = $7
    status = $9
    bytes  = ($10 ~ /^[0-9]+$/) ? $10 : 0
    ua     = ""
    for (i=12; i<=NF; i++) ua = ua (i==12?"":FS) $i
    gsub(/"/, "", ua)

    total++
    status_count[status]++
    ip_count[ip]++
    if (bytes ~ /^[0-9]+$/) total_bytes += bytes
    if (req != "-") path_count[req]++
    if (ua != "-") ua_count[ua]++
  }
  END {
    print "total=" total
    print "bytes=" total_bytes
    for (s in status_count) print "status_" s "=" status_count[s]

    # top 5 IPs
    n=0
    for (ip in ip_count) { val[n]=ip_count[ip]; key[n]=ip; n++ }
    for (i=0; i<n-1; i++) for (j=i+1; j<n; j++) if (val[j]>val[i]) { t=val[i]; val[i]=val[j]; val[j]=t; t=key[i]; key[i]=key[j]; key[j]=t }
    for (i=0; i<(n<5?n:5); i++) print "top_ip_" i "=" key[i] "|" val[i]

    # top 5 paths
    n=0
    for (p in path_count) { pval[n]=path_count[p]; pkey[n]=p; n++ }
    for (i=0; i<n-1; i++) for (j=i+1; j<n; j++) if (pval[j]>pval[i]) { t=pval[i]; pval[i]=pval[j]; pval[j]=t; t=pkey[i]; pkey[i]=pkey[j]; pkey[j]=t }
    for (i=0; i<(n<5?n:5); i++) print "top_path_" i "=" pkey[i] "|" pval[i]

    # top 3 user agents
    n=0
    for (u in ua_count) { uval[n]=ua_count[u]; ukey[n]=u; n++ }
    for (i=0; i<n-1; i++) for (j=i+1; j<n; j++) if (uval[j]>uval[i]) { t=uval[i]; uval[i]=uval[j]; uval[j]=t; t=ukey[i]; ukey[i]=ukey[j]; ukey[j]=t }
    for (i=0; i<(n<3?n:3); i++) print "top_ua_" i "=" ukey[i] "|" uval[i]
  }
  ' "$file"
}

human_bytes() {
  awk -v b="$1" 'BEGIN {
    if      (b >= 1073741824) printf "%.2f GB", b/1073741824
    else if (b >= 1048576)    printf "%.2f MB", b/1048576
    else if (b >= 1024)       printf "%.2f KB", b/1024
    else                      printf "%d B",    b
  }'
}

section_for_log() {
  local label="$1" access="$2" error="$3"
  local data total bytes

  echo "## $label"
  echo ""

  # ── Access log stats ──
  if [[ -f "$access" && -s "$access" ]]; then
    data=$(parse_access_log "$access")

    total=$(echo "$data" | grep '^total='   | cut -d= -f2)
    bytes=$(echo "$data" | grep '^bytes='   | cut -d= -f2)
    total=${total:-0}; bytes=${bytes:-0}

    echo "### Requests"
    echo ""
    echo "| Metric | Value |"
    echo "|--------|-------|"
    echo "| Total requests | $total |"
    echo "| Total traffic  | $(human_bytes "$bytes") |"
    echo ""

    # Status codes
    local statuses
    statuses=$(echo "$data" | grep '^status_' | sort)
    if [[ -n "$statuses" ]]; then
      echo "### Status Codes"
      echo ""
      echo "| Status | Count |"
      echo "|--------|-------|"
      while IFS= read -r line; do
        local code count
        code=$(echo "$line"  | sed 's/status_//' | cut -d= -f1)
        count=$(echo "$line" | cut -d= -f2)
        echo "| $code | $count |"
      done <<< "$statuses"
      echo ""
    fi

    # Top IPs
    local top_ips
    top_ips=$(echo "$data" | grep '^top_ip_')
    if [[ -n "$top_ips" ]]; then
      echo "### Top IPs"
      echo ""
      echo "| IP | Requests |"
      echo "|----|----------|"
      while IFS= read -r line; do
        local val ip cnt
        val=$(echo "$line" | cut -d= -f2)
        ip=$(echo  "$val"  | cut -d'|' -f1)
        cnt=$(echo "$val"  | cut -d'|' -f2)
        echo "| \`$ip\` | $cnt |"
      done <<< "$top_ips"
      echo ""
    fi

    # Top paths
    local top_paths
    top_paths=$(echo "$data" | grep '^top_path_')
    if [[ -n "$top_paths" ]]; then
      echo "### Top Paths"
      echo ""
      echo "| Path | Requests |"
      echo "|------|----------|"
      while IFS= read -r line; do
        local val path cnt
        val=$(echo  "$line" | cut -d= -f2-)
        path=$(echo "$val"  | cut -d'|' -f1)
        cnt=$(echo  "$val"  | cut -d'|' -f2)
        echo "| \`$path\` | $cnt |"
      done <<< "$top_paths"
      echo ""
    fi

    # Top UAs
    local top_uas
    top_uas=$(echo "$data" | grep '^top_ua_')
    if [[ -n "$top_uas" ]]; then
      echo "### Top User Agents"
      echo ""
      echo "| User Agent | Requests |"
      echo "|------------|----------|"
      while IFS= read -r line; do
        local val ua cnt
        val=$(echo "$line" | cut -d= -f2-)
        ua=$(echo  "$val"  | cut -d'|' -f1)
        cnt=$(echo "$val"  | cut -d'|' -f2)
        # truncate long UAs
        [[ ${#ua} -gt 80 ]] && ua="${ua:0:80}…"
        echo "| $ua | $cnt |"
      done <<< "$top_uas"
      echo ""
    fi

  else
    echo "_No access log data._"
    echo ""
  fi

  # ── Error log ──
  echo "### Errors"
  echo ""
  if [[ -f "$error" && -s "$error" ]]; then
    local err_count
    err_count=$(wc -l < "$error")
    echo "**$err_count** error line(s) recorded."
    echo ""
    echo '```'
    tail -5 "$error"
    echo '```'
  else
    echo "_No errors._"
  fi
  echo ""
  echo "---"
  echo ""
}

# ── Build markdown ───────────────────────────────────────────────────────────
{
  echo "# nginx Log Summary"
  echo ""
  echo "> Generated: $NOW"
  echo ""
  echo "---"
  echo ""

  section_for_log "ximg.app"       "$LOGS_DIR/ximg.access.log"  "$LOGS_DIR/ximg.error.log"
  section_for_log "linux.ximg.app" "$LOGS_DIR/linux.access.log" "$LOGS_DIR/linux.error.log"

  # Combined fallback logs
  if [[ -f "$LOGS_DIR/access.log" && -s "$LOGS_DIR/access.log" ]]; then
    section_for_log "Combined (legacy)" "$LOGS_DIR/access.log" "$LOGS_DIR/error.log"
  fi

} > "$OUTPUT"

echo "Summary written to $OUTPUT"
