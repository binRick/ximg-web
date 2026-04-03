#!/bin/bash
# Nagios check: verify Suricata eve.json is being written to recently
EVE_LOG="/var/log/suricata/eve.json"
WARN_MIN=5
CRIT_MIN=10

if [ ! -f "$EVE_LOG" ]; then
    echo "CRITICAL: $EVE_LOG not found"
    exit 2
fi

LAST_MOD=$(stat -c %Y "$EVE_LOG" 2>/dev/null)
NOW=$(date +%s)
AGE_SEC=$(( NOW - LAST_MOD ))
AGE_MIN=$(( AGE_SEC / 60 ))

if [ "$AGE_SEC" -gt $(( CRIT_MIN * 60 )) ]; then
    echo "CRITICAL: eve.json last updated ${AGE_MIN}m ago (threshold ${CRIT_MIN}m)"
    exit 2
elif [ "$AGE_SEC" -gt $(( WARN_MIN * 60 )) ]; then
    echo "WARNING: eve.json last updated ${AGE_MIN}m ago (threshold ${WARN_MIN}m)"
    exit 1
else
    echo "OK: eve.json updated ${AGE_MIN}m ago"
    exit 0
fi
