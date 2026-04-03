#!/bin/sh
set -e

# Block all new outbound connections; allow only replies to inbound SSH
iptables -P OUTPUT DROP
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
echo "[entrypoint] outbound traffic blocked"

# Generate realistic motd each startup so timestamps are current
NOW=$(date -u +'%a %b %d %H:%M:%S UTC %Y')
LAST_LOGIN=$(python3 -c "import datetime; t=datetime.datetime.utcnow()-datetime.timedelta(hours=2); print(t.strftime('%a %b %d %H:%M:%S %Y'))")
cat > /etc/motd <<EOF
Welcome to Ubuntu 22.04.3 LTS (GNU/Linux 5.15.0-91-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/advantage

  System information as of $NOW

Last login: $LAST_LOGIN from 10.0.0.1
EOF

exec python3 /usr/lib/openssh/session-handler
