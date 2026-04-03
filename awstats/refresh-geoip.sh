#!/bin/sh
# Download the latest db-ip.com free country lite database (no registration required)
# Runs monthly via cron

DB_FILE="/data/country.mmdb"
YEAR=$(date +%Y)
MONTH=$(date +%m)
MONTH_NUM=$(echo "$MONTH" | sed 's/^0//')

# Try current month first, then previous month (in case current isn't published yet)
for attempt in 0 1; do
    if [ "$attempt" -eq 1 ]; then
        if [ "$MONTH_NUM" -gt 1 ]; then
            MONTH=$(printf "%02d" $((MONTH_NUM - 1)))
        else
            MONTH="12"
            YEAR=$((YEAR - 1))
        fi
    fi
    URL="https://download.db-ip.com/free/dbip-country-lite-${YEAR}-${MONTH}.mmdb.gz"
    echo "[$(date)] Downloading GeoIP database: $URL"
    if wget -q -O /tmp/country.mmdb.gz "$URL" 2>/dev/null; then
        gunzip -f /tmp/country.mmdb.gz && mv /tmp/country.mmdb "$DB_FILE"
        echo "[$(date)] GeoIP database updated: ${YEAR}-${MONTH}"
        exit 0
    fi
done

echo "[$(date)] Warning: could not download GeoIP database. Country stats will be unavailable."
exit 1
