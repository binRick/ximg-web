#!/usr/bin/env bash
# install/setup.sh — bootstrap ximg-web on a fresh CentOS Stream 10 / RHEL 10 server
#
# Usage: sudo bash install/setup.sh   (from repo root)
#        sudo bash setup.sh           (from install/)
#
# Prerequisites (complete before running):
#   • DNS A records for ximg.app, *.ximg.app, dockerimage.dev, www.dockerimage.dev → this server
#   • GoDaddy API credentials for DNS-01 wildcard cert (https://developer.godaddy.com/keys)
#       export GD_Key="your_api_key"
#       export GD_Secret="your_api_secret"
#
# Steps:
#   1.  Docker CE + Compose plugin
#   2.  System packages  (EPEL · certbot · Suricata)
#   3.  Runtime directories
#   4.  Logrotate config
#   5.  Suricata IDS
#   6.  Firewall  (firewalld — open 80/443/22/25)
#   7.  systemd unit  (ximg-web.service)
#   8a. SSL: *.ximg.app wildcard via acme.sh + GoDaddy DNS-01
#   8b. SSL: dockerimage.dev via certbot standalone
#   9.  Start Docker Compose stack
#  10.  SSH honeypot outbound iptables isolation
#  11.  proc-trace-dns-logger  (systemd — DNS → SQLite)
#  12.  Verification

set -euo pipefail

# ── Resolve repo root regardless of where script is called from ───────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(basename "$SCRIPT_DIR")" == "install" ]]; then
  REPO="$(dirname "$SCRIPT_DIR")"
else
  REPO="$SCRIPT_DIR"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; BLU='\033[0;34m'; DIM='\033[2m'; RST='\033[0m'

section() { echo -e "\n${BLU}══ $* ══${RST}"; }
ok()      { echo -e "  ${GRN}✓${RST}  $*"; }
info()    { echo -e "  ${DIM}→${RST}  $*"; }
warn()    { echo -e "  ${YEL}⚠${RST}  $*"; }
die()     { echo -e "\n${RED}error:${RST} $*" >&2; exit 1; }

confirm() {
  local prompt="${1:-continue?} [Y/n] "
  read -rp "$(echo -e "  ${YEL}?${RST}  ${prompt}")" ans
  [[ "${ans:-Y}" =~ ^[Yy] ]]
}

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "run as root:  sudo bash install/setup.sh"

# ── OS check ─────────────────────────────────────────────────────────────────
. /etc/os-release 2>/dev/null || true
if [[ "${ID:-}" != "centos" && "${ID_LIKE:-}" != *"rhel"* ]]; then
  warn "this script targets CentOS Stream 10 / RHEL 10 — current OS: ${PRETTY_NAME:-unknown}"
  confirm "continue anyway?" || exit 1
fi

SERVER_IP="$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || echo '')"
[[ -n "$SERVER_IP" ]] || die "could not determine server IP (is networking up?)"

echo -e "\n${GRN}ximg-web installer${RST}"
echo -e "  repo:      ${REPO}"
echo -e "  server IP: ${SERVER_IP}"

# ─────────────────────────────────────────────────────────────────────────────
section "1/11  Docker CE + Compose plugin"
# ─────────────────────────────────────────────────────────────────────────────

if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  ok "docker $(docker --version | grep -oP '[\d.]+' | head -1) already installed"
else
  info "adding Docker CE repo and installing..."
  dnf -y install dnf-plugins-core &>/dev/null
  dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo &>/dev/null
  dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin &>/dev/null
  systemctl enable --now docker
  ok "docker installed and running"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "2/11  System packages  (EPEL · certbot · Suricata)"
# ─────────────────────────────────────────────────────────────────────────────

if ! dnf list installed epel-release &>/dev/null 2>&1; then
  info "installing EPEL..."
  dnf -y install epel-release &>/dev/null
fi
ok "EPEL enabled"

PKGS=()
command -v certbot  &>/dev/null || PKGS+=(certbot)
command -v suricata &>/dev/null || PKGS+=(suricata)

if [[ ${#PKGS[@]} -gt 0 ]]; then
  info "installing: ${PKGS[*]}"
  dnf -y install "${PKGS[@]}" &>/dev/null
fi
ok "certbot $(certbot --version 2>&1 | grep -oP '[\d.]+' | head -1) installed"
ok "suricata $(suricata --version 2>&1 | grep -oP '[\d.]+' | head -1) installed"

# ─────────────────────────────────────────────────────────────────────────────
section "3/11  Runtime directories"
# ─────────────────────────────────────────────────────────────────────────────

for d in logs ssh-logs mail-data logs-data; do
  install -d -m 755 "$REPO/$d"
  ok "$REPO/$d"
done

touch "$REPO/logs/.keep"
ok "log stub files created"

install -d -m 755 /var/log/suricata
chmod 755 /var/log/suricata
ok "/var/log/suricata writable"

# Pre-create cert directories so nginx can start after certs are placed
for cert_dir in /etc/letsencrypt/live/wildcard.ximg.app /etc/letsencrypt/live/dockerimage.dev; do
  install -d -m 755 "$cert_dir"
  ok "$cert_dir"
done

# ─────────────────────────────────────────────────────────────────────────────
section "4/11  Log rotation  (logrotate)"
# ─────────────────────────────────────────────────────────────────────────────

sed "s|__REPO__|$REPO|g" "$REPO/install/ximg-web.logrotate" \
  > /etc/logrotate.d/ximg-web
chmod 644 /etc/logrotate.d/ximg-web
ok "logrotate config installed → /etc/logrotate.d/ximg-web"
info "daily rotation, 14-day retention, compressed, nginx reopen signal"

# ─────────────────────────────────────────────────────────────────────────────
section "5/11  Suricata IDS"
# ─────────────────────────────────────────────────────────────────────────────

if grep -q '192\.168\.0\.0/16,10\.0\.0\.0/8,172\.16\.0\.0/12' /etc/suricata/suricata.yaml 2>/dev/null; then
  sed -i "s|HOME_NET: \"\[192\.168\.0\.0/16,10\.0\.0\.0/8,172\.16\.0\.0/12\]\"|HOME_NET: \"[${SERVER_IP}/32,10.0.0.0/8,172.16.0.0/12]\"|" \
      /etc/suricata/suricata.yaml
  ok "HOME_NET set to ${SERVER_IP}/32"
else
  if grep -q "HOME_NET:" /etc/suricata/suricata.yaml 2>/dev/null; then
    warn "HOME_NET already customised — verify /etc/suricata/suricata.yaml manually"
  fi
fi

info "running suricata-update (downloads ~50k community rules — takes ~1 min)..."
suricata-update >/dev/null 2>&1 && ok "community rules downloaded" || warn "suricata-update failed — check network"

systemctl enable --now suricata
ok "suricata.service enabled and running"

sleep 2
if [[ -f /var/log/suricata/eve.json ]]; then
  ok "eve.json exists — IDS is writing events"
else
  warn "eve.json not found yet — suricata may still be loading rules"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "6/11  Firewall  (firewalld)"
# ─────────────────────────────────────────────────────────────────────────────

if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http  &>/dev/null
  firewall-cmd --permanent --add-service=https &>/dev/null
  firewall-cmd --permanent --add-service=ssh   &>/dev/null
  firewall-cmd --permanent --add-port=25/tcp   &>/dev/null  # mail receiver
  firewall-cmd --reload                        &>/dev/null
  ok "firewalld: http, https, ssh, smtp(25) opened"
else
  warn "firewalld not active — verify ports 80/443/22/25 are reachable manually"
fi

# SELinux: allow Docker containers to read bind-mounted cert files
if [[ "$(getenforce 2>/dev/null || echo Disabled)" != "Disabled" ]]; then
  chcon -Rt container_file_t /etc/letsencrypt/ 2>/dev/null \
    && ok "SELinux: /etc/letsencrypt context set to container_file_t" \
    || warn "SELinux: could not set context on /etc/letsencrypt — containers may not read certs"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "7/11  systemd unit  (ximg-web.service)"
# ─────────────────────────────────────────────────────────────────────────────

sed "s|WorkingDirectory=.*|WorkingDirectory=$REPO|" "$REPO/ximg-web.service" \
  > /etc/systemd/system/ximg-web.service
chmod 644 /etc/systemd/system/ximg-web.service
systemctl daemon-reload
systemctl enable ximg-web.service
ok "ximg-web.service installed and enabled"

# ─────────────────────────────────────────────────────────────────────────────
section "8a/11  SSL: *.ximg.app wildcard  (acme.sh + GoDaddy DNS-01)"
# ─────────────────────────────────────────────────────────────────────────────

WILDCARD_CERT="/etc/letsencrypt/live/wildcard.ximg.app/fullchain.pem"
ACME=/root/.acme.sh/acme.sh

if [[ -f "$WILDCARD_CERT" ]]; then
  ok "wildcard cert already exists at $WILDCARD_CERT"
else
  # Prompt for GoDaddy credentials if not exported
  if [[ -z "${GD_Key:-}" || -z "${GD_Secret:-}" ]]; then
    echo
    warn "GoDaddy API credentials required for DNS-01 wildcard cert"
    warn "Get them at: https://developer.godaddy.com/keys"
    echo
    read -rp "$(echo -e "  ${YEL}?${RST}  GD_Key:    ")" GD_Key
    read -rp "$(echo -e "  ${YEL}?${RST}  GD_Secret: ")" GD_Secret
    export GD_Key GD_Secret
  fi

  # Install acme.sh if not present
  if [[ ! -f "$ACME" ]]; then
    info "installing acme.sh..."
    curl -sSL https://get.acme.sh | bash -s -- --home /root/.acme.sh --nocron &>/dev/null
    ok "acme.sh installed to /root/.acme.sh"
  else
    ok "acme.sh already installed"
  fi

  echo
  warn "DNS A records for ximg.app and *.ximg.app must resolve to ${SERVER_IP}"
  echo
  if confirm "DNS is ready — issue wildcard cert now?"; then
    info "issuing *.ximg.app wildcard via GoDaddy DNS-01 (propagation may take ~30s)..."
    GD_Key="$GD_Key" GD_Secret="$GD_Secret" \
      "$ACME" --issue --dns dns_gd \
        -d ximg.app -d '*.ximg.app' \
        --server letsencrypt 2>&1 | tail -8

    info "deploying cert to /etc/letsencrypt/live/wildcard.ximg.app/..."
    "$ACME" --install-cert -d ximg.app \
      --cert-file      /etc/letsencrypt/live/wildcard.ximg.app/cert.pem \
      --key-file       /etc/letsencrypt/live/wildcard.ximg.app/privkey.pem \
      --fullchain-file /etc/letsencrypt/live/wildcard.ximg.app/fullchain.pem \
      --reloadcmd      "docker compose -f $REPO/compose.yaml exec nginx nginx -s reload"

    "$ACME" --install-cronjob
    ok "wildcard cert obtained; acme.sh renewal cron installed"
  else
    warn "skipping wildcard cert — nginx HTTPS will not start"
    warn "run manually: GD_Key=... GD_Secret=... $ACME --issue --dns dns_gd -d ximg.app -d '*.ximg.app' --server letsencrypt"
  fi
fi

# Write authoritative domain list from nginx.conf (not the DOMAINS array above)
grep -oP 'server_name\s+\K[\w.-]+\.ximg\.app' "$REPO/nginx/nginx.conf" | sort -u \
  > "$REPO/install/domains.txt"
ok "domain list written to install/domains.txt ($(wc -l < "$REPO/install/domains.txt") subdomains, sourced from nginx.conf)"

# ─────────────────────────────────────────────────────────────────────────────
section "8b/11  SSL: dockerimage.dev  (certbot standalone)"
# ─────────────────────────────────────────────────────────────────────────────

DOCKERDEV_CERT="/etc/letsencrypt/live/dockerimage.dev/fullchain.pem"

if [[ -f "$DOCKERDEV_CERT" ]]; then
  ok "dockerimage.dev cert already exists"
else
  echo
  warn "DNS A records for dockerimage.dev and www.dockerimage.dev must resolve to ${SERVER_IP}"
  warn "certbot standalone binds to port 80 — nothing else should be listening yet"
  echo
  if confirm "DNS is ready — obtain dockerimage.dev cert now?"; then
    certbot certonly --standalone \
      -d dockerimage.dev -d www.dockerimage.dev \
      --non-interactive \
      --agree-tos \
      --register-unsafely-without-email 2>&1 | tail -8
    ok "dockerimage.dev cert obtained"
  else
    warn "skipping dockerimage.dev cert — its nginx server block will not start"
    warn "run manually once DNS is ready: certbot certonly --standalone -d dockerimage.dev -d www.dockerimage.dev"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "9/11  Start Docker Compose stack"
# ─────────────────────────────────────────────────────────────────────────────

cd "$REPO"
info "pulling base images and building custom services..."
docker compose pull --quiet 2>/dev/null || true
docker compose build --quiet 2>/dev/null
docker compose up -d --remove-orphans
ok "stack started"

# ─────────────────────────────────────────────────────────────────────────────
section "10/11  SSH honeypot — outbound iptables isolation"
# ─────────────────────────────────────────────────────────────────────────────

# Wait for Docker to create the ssh-net bridge
sleep 3

SSH_NET_ID=$(docker network inspect ximg-web_ssh-net --format '{{.Id}}' 2>/dev/null || echo '')
if [[ -n "$SSH_NET_ID" ]]; then
  SSH_BRIDGE="br-${SSH_NET_ID:0:12}"
  if ip link show "$SSH_BRIDGE" &>/dev/null; then
    # Allow return traffic for inbound SSH sessions (attacker → honeypot replies)
    iptables -I DOCKER-USER -i "$SSH_BRIDGE" -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
    # Drop all other outbound traffic initiated by honeypot containers
    iptables -I DOCKER-USER -i "$SSH_BRIDGE" ! -o "$SSH_BRIDGE" -j DROP 2>/dev/null || true
    ok "iptables: outbound blocked from ssh-net bridge ($SSH_BRIDGE)"

    # Write a helper script that can re-apply these rules after reboot
    # (bridge name is stable as long as the Docker network exists)
    cat > /usr/local/sbin/ximg-ssh-isolation.sh <<ISOLATION
#!/usr/bin/env bash
# Re-apply SSH honeypot outbound iptables isolation
# Called by ximg-ssh-isolation.service after ximg-web.service starts
set -euo pipefail
NET_ID=\$(docker network inspect ximg-web_ssh-net --format '{{.Id}}' 2>/dev/null || echo '')
[[ -n "\$NET_ID" ]] || { echo "ssh-net not found"; exit 1; }
BRIDGE="br-\${NET_ID:0:12}"
ip link show "\$BRIDGE" &>/dev/null || { echo "bridge \$BRIDGE not found"; exit 1; }
iptables -I DOCKER-USER -i "\$BRIDGE" -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
iptables -I DOCKER-USER -i "\$BRIDGE" ! -o "\$BRIDGE" -j DROP 2>/dev/null || true
echo "SSH honeypot isolation applied on \$BRIDGE"
ISOLATION
    chmod 755 /usr/local/sbin/ximg-ssh-isolation.sh

    # Install a systemd oneshot that runs after ximg-web on every boot
    cat > /etc/systemd/system/ximg-ssh-isolation.service <<UNIT
[Unit]
Description=ximg-web SSH honeypot outbound isolation
After=ximg-web.service
Requires=ximg-web.service

[Service]
Type=oneshot
ExecStartPre=/bin/sleep 5
ExecStart=/usr/local/sbin/ximg-ssh-isolation.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable ximg-ssh-isolation.service
    ok "ximg-ssh-isolation.service installed — rules will reapply on each boot"
  else
    warn "bridge $SSH_BRIDGE not found — isolation not applied"
    warn "run manually after stack is up: /usr/local/sbin/ximg-ssh-isolation.sh"
  fi
else
  warn "ximg-web_ssh-net network not found — ssh honeypot isolation not applied"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "11/12  proc-trace-dns-logger  (DNS → SQLite)"
# ─────────────────────────────────────────────────────────────────────────────

# Detect architecture for selecting the right pre-built binary.
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  LOGGER_ARCH="amd64" ;;
  aarch64) LOGGER_ARCH="arm64" ;;
  *)        warn "unsupported arch $ARCH — skipping proc-trace-dns-logger install"; LOGGER_ARCH="" ;;
esac

if [[ -n "$LOGGER_ARCH" ]]; then
  LOGGER_BIN="$REPO/proc-trace-logger/dist/proc-trace-logger-linux-${LOGGER_ARCH}"
  DNS_BIN="$REPO/proc-trace-dns/proc-trace-dns"

  if [[ ! -f "$LOGGER_BIN" ]]; then
    warn "logger binary not found: $LOGGER_BIN"
    warn "run: cd $REPO/proc-trace-logger && bash build.sh"
  elif [[ ! -f "$DNS_BIN" ]]; then
    warn "proc-trace-dns binary not found: $DNS_BIN"
    warn "run: cd $REPO/proc-trace-dns && bash build.sh"
  else
    install -m 755 "$LOGGER_BIN" /usr/local/bin/proc-trace-logger
    install -m 755 "$DNS_BIN"    /usr/local/bin/proc-trace-dns
    ok "installed /usr/local/bin/proc-trace-dns and /usr/local/bin/proc-trace-logger"

    # Grant CAP_NET_RAW so the binary can be run without sudo (optional; service runs as root).
    setcap cap_net_raw+eip /usr/local/bin/proc-trace-dns 2>/dev/null \
      && ok "CAP_NET_RAW granted on proc-trace-dns" \
      || warn "setcap failed — proc-trace-dns will require root (service already runs as root)"

    cp "$REPO/install/proc-trace-dns-logger.service" /etc/systemd/system/
    chmod 644 /etc/systemd/system/proc-trace-dns-logger.service
    systemctl daemon-reload
    systemctl enable --now proc-trace-dns-logger.service
    ok "proc-trace-dns-logger.service enabled and started"
    info "DB: /var/lib/proc-trace/dns.db"
    info "logs: journalctl -fu proc-trace-dns-logger"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
section "12/12  Verification"
# ─────────────────────────────────────────────────────────────────────────────

sleep 4

PASS=0; FAIL=0

check_http() {
  local url="$1" label="${2:-$1}"
  local code
  code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo 000)
  if [[ "$code" == "200" ]]; then
    ok "$label → HTTP $code"
    ((PASS++)) || true
  else
    warn "$label → HTTP $code"
    ((FAIL++)) || true
  fi
}

check_service() {
  local svc="$1"
  if systemctl is-active --quiet "$svc"; then
    ok "systemd: $svc active"
    ((PASS++)) || true
  else
    warn "systemd: $svc NOT active"
    ((FAIL++)) || true
  fi
}

check_container() {
  local name="$1"
  if docker compose ps "$name" 2>/dev/null | grep -q "Up"; then
    ok "container: $name running"
    ((PASS++)) || true
  else
    warn "container: $name NOT running"
    ((FAIL++)) || true
  fi
}

check_service  suricata
check_service  ximg-web
check_service  proc-trace-dns-logger
check_container nginx
check_container logs
check_container ids

if [[ -f "$WILDCARD_CERT" ]]; then
  check_http "https://ximg.app"               "ximg.app"
  check_http "https://ids.ximg.app"           "ids.ximg.app"
  check_http "https://logs.ximg.app"          "logs.ximg.app"
  check_http "https://logs.ximg.app/ids-stats" "ids-stats endpoint"
fi

echo
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GRN}All checks passed (${PASS}/${PASS})${RST}"
else
  echo -e "${YEL}${PASS} passed, ${FAIL} failed — review warnings above${RST}"
fi

echo
echo -e "${DIM}Useful commands:${RST}"
echo -e "  systemctl status ximg-web                          # stack status"
echo -e "  docker compose ps                                  # container status"
echo -e "  docker compose logs -f logs                        # IDS + nginx log stream"
echo -e "  systemctl status suricata                          # IDS engine status"
echo -e "  journalctl -fu suricata                            # IDS live logs"
echo -e "  suricata-update && systemctl reload suricata       # refresh rules"
echo -e "  /root/.acme.sh/acme.sh --renew -d ximg.app        # force cert renewal"
echo -e "  certbot renew --standalone                         # renew dockerimage.dev cert"
echo -e "  journalctl -fu proc-trace-dns-logger               # DNS logger live output"
echo -e "  sqlite3 /var/lib/proc-trace/dns.db                 # query DNS event history"
echo
