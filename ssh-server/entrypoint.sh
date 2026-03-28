#!/bin/sh
set -e

# Block all new outbound connections; allow only replies to inbound SSH
iptables -P OUTPUT DROP
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
echo "[entrypoint] outbound traffic blocked"

exec python3 /usr/lib/openssh/session-handler
