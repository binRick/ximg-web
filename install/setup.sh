#!/usr/bin/env bash
# install/setup.sh — bootstrap ximg-web on a fresh CentOS Stream 10 / RHEL 10 server
#
# Usage: sudo bash install/setup.sh   (from repo root)
#        sudo bash setup.sh           (from install/)
#
# What this does (in order):
#   1. Install Docker CE + Compose plugin
#   2. Install EPEL, certbot, Suricata
#   3. Create required runtime directories
#   4. Install logrotate config
#   5. Configure Suricata and download community rules
#   6. Install and enable the systemd unit (ximg-web.service)
#   7. Obtain the SSL certificate for all subdomains
#   8. Start Docker Compose stack
#   9. Verify deployment

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
section "1/8  Docker CE + Compose plugin"
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
section "2/8  System packages  (EPEL · certbot · Suricata)"
# ─────────────────────────────────────────────────────────────────────────────

if ! dnf list installed epel-release &>/dev/null 2>&1; then
  info "installing EPEL..."
  dnf -y install epel-release &>/dev/null
fi
ok "EPEL enabled"

PKGS=()
command -v certbot   &>/dev/null || PKGS+=(certbot python3-certbot-apache)
command -v suricata  &>/dev/null || PKGS+=(suricata)

if [[ ${#PKGS[@]} -gt 0 ]]; then
  info "installing: ${PKGS[*]}"
  dnf -y install "${PKGS[@]}" &>/dev/null
fi
ok "certbot $(certbot --version 2>&1 | grep -oP '[\d.]+' | head -1) installed"
ok "suricata $(suricata --version 2>&1 | grep -oP '[\d.]+' | head -1) installed"

# ─────────────────────────────────────────────────────────────────────────────
section "3/8  Runtime directories"
# ─────────────────────────────────────────────────────────────────────────────

# Directories that are gitignored must be created on fresh clone
for d in logs ssh-logs mail-data logs-data; do
  install -d -m 755 "$REPO/$d"
  ok "$REPO/$d"
done

# Touch log files that nginx/services expect on first start
# (nginx won't start if the log bind-mount is missing)
touch "$REPO/logs/.keep"
ok "log stub files created"

# Suricata log dir (package creates it, but ensure correct perms for Docker)
install -d -m 755 /var/log/suricata
chmod 755 /var/log/suricata
ok "/var/log/suricata writable"

# ─────────────────────────────────────────────────────────────────────────────
section "4/8  Log rotation  (logrotate)"
# ─────────────────────────────────────────────────────────────────────────────

sed "s|__REPO__|$REPO|g" "$REPO/install/ximg-web.logrotate" \
  > /etc/logrotate.d/ximg-web
chmod 644 /etc/logrotate.d/ximg-web
ok "logrotate config installed → /etc/logrotate.d/ximg-web"
info "daily rotation, 14-day retention, compressed, nginx reopen signal"

# ─────────────────────────────────────────────────────────────────────────────
section "5/9  Suricata IDS"
# ─────────────────────────────────────────────────────────────────────────────

# Set HOME_NET to this server's IP
if grep -q '192\.168\.0\.0/16,10\.0\.0\.0/8,172\.16\.0\.0/12' /etc/suricata/suricata.yaml 2>/dev/null; then
  sed -i "s|HOME_NET: \"\[192\.168\.0\.0/16,10\.0\.0\.0/8,172\.16\.0\.0/12\]\"|HOME_NET: \"[${SERVER_IP}/32,10.0.0.0/8,172.16.0.0/12]\"|" \
      /etc/suricata/suricata.yaml
  ok "HOME_NET set to ${SERVER_IP}/32"
else
  # Already customised or different format; just verify HOME_NET is present
  if grep -q "HOME_NET:" /etc/suricata/suricata.yaml 2>/dev/null; then
    warn "HOME_NET already customised — verify /etc/suricata/suricata.yaml manually"
  fi
fi

# Download / update community rules
info "running suricata-update (downloads ~50k community rules — takes ~1 min)..."
suricata-update >/dev/null 2>&1 && ok "community rules downloaded" || warn "suricata-update failed — check network"

systemctl enable --now suricata
ok "suricata.service enabled and running"

# Wait a moment and confirm EVE log is being written
sleep 2
if [[ -f /var/log/suricata/eve.json ]]; then
  ok "eve.json exists — IDS is writing events"
else
  warn "eve.json not found yet — suricata may still be loading rules"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "6/9  systemd unit  (ximg-web.service)"
# ─────────────────────────────────────────────────────────────────────────────

sed "s|WorkingDirectory=.*|WorkingDirectory=$REPO|" "$REPO/ximg-web.service" \
  > /etc/systemd/system/ximg-web.service
chmod 644 /etc/systemd/system/ximg-web.service
systemctl daemon-reload
systemctl enable ximg-web.service
ok "ximg-web.service installed and enabled"

# ─────────────────────────────────────────────────────────────────────────────
section "7/9  SSL certificate  (Let's Encrypt)"
# ─────────────────────────────────────────────────────────────────────────────

# All subdomains in one cert (must all have DNS A records → this server)
DOMAINS=(
  ximg.app www.ximg.app
  ai.ximg.app america.ximg.app ansible.ximg.app apps.ximg.app
  ascii.ximg.app bash.ximg.app butterfly.ximg.app change.ximg.app
  chess.ximg.app chinese.ximg.app claude.ximg.app cnc.ximg.app
  coldwar.ximg.app computers.ximg.app docker.ximg.app doom.ximg.app
  fidonet.ximg.app florida.ximg.app git.ximg.app grilling.ximg.app
  guns.ximg.app ids.ximg.app india.ximg.app internet.ximg.app
  json.ximg.app kart.ximg.app kombat.ximg.app linux.ximg.app
  logs.ximg.app mac.ximg.app mail.ximg.app mario.ximg.app
  monkey.ximg.app moto.ximg.app nav.ximg.app passwords.ximg.app
  pizza.ximg.app poker.ximg.app programming.ximg.app rx.ximg.app
  simcity.ximg.app stats.ximg.app systemd.ximg.app tampa.ximg.app
  tmux.ximg.app trump.ximg.app vr.ximg.app vt101.ximg.app
  warcraft.ximg.app wargames.ximg.app wood.ximg.app
  unix.ximg.app bsd.ximg.app
  ximg.ximg.app yaml.ximg.app zsh.ximg.app
  nagios.ximg.app status.ximg.app
  vim.ximg.app http.ximg.app ssh.ximg.app sql.ximg.app
  space.ximg.app coffee.ximg.app japan.ximg.app quake.ximg.app nintendo.ximg.app
  pirates.ximg.app medieval.ximg.app
  physics.ximg.app chemistry.ximg.app biology.ximg.app math.ximg.app evolution.ximg.app
  dns.ximg.app suricata.ximg.app crypto.ximg.app
  readme.ximg.app
  claudemd.ximg.app
  world.ximg.app
  sandbox.ximg.app
  gravity.ximg.app
  waves.ximg.app
  chaos.ximg.app
  epidemic.ximg.app
  algorithms.ximg.app os.ximg.app security.ximg.app database.ximg.app
)

CERT_PATH="/etc/letsencrypt/live/ximg.app/fullchain.pem"

if [[ -f "$CERT_PATH" ]]; then
  ok "certificate already exists at $CERT_PATH"
  warn "to expand to new domains:  certbot certonly --expand --webroot -w $REPO/public-html -d \$(paste -sd, install/domains.txt)"
else
  echo
  warn "before running certbot, ALL DNS A records must point to ${SERVER_IP}"
  warn "domains: ${DOMAINS[*]}"
  echo
  if confirm "all DNS records are set — obtain certificate now?"; then
    # Build -d flags
    D_FLAGS=()
    for d in "${DOMAINS[@]}"; do D_FLAGS+=(-d "$d"); done

    certbot certonly --webroot \
      -w "$REPO/public-html" \
      "${D_FLAGS[@]}" \
      --cert-name ximg.app \
      --non-interactive \
      --agree-tos \
      --register-unsafely-without-email \
      2>&1 | tail -10
    ok "certificate obtained"
  else
    warn "skipping certbot — nginx will not start without a cert"
    warn "run certbot manually when DNS is ready, then: systemctl start ximg-web"
  fi
fi

# Write domains list for future certbot --expand commands
printf '%s\n' "${DOMAINS[@]}" > "$REPO/install/domains.txt"
ok "domain list written to install/domains.txt"

# ─────────────────────────────────────────────────────────────────────────────
section "8/9  Start Docker Compose stack"
# ─────────────────────────────────────────────────────────────────────────────

cd "$REPO"
info "pulling base images and building custom services..."
docker compose pull --quiet 2>/dev/null || true
docker compose build --quiet 2>/dev/null
docker compose up -d --remove-orphans
ok "stack started"

# ─────────────────────────────────────────────────────────────────────────────
section "9/9  Verification"
# ─────────────────────────────────────────────────────────────────────────────

sleep 4  # give containers a moment to bind

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
check_container nginx
check_container logs
check_container ids

if [[ -f "$CERT_PATH" ]]; then
  check_http "https://ximg.app"        "ximg.app"
  check_http "https://ids.ximg.app"    "ids.ximg.app"
  check_http "https://logs.ximg.app"   "logs.ximg.app"
  check_http "https://logs.ximg.app/ids-stats"  "ids-stats endpoint"
fi

echo
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GRN}All checks passed (${PASS}/${PASS})${RST}"
else
  echo -e "${YEL}${PASS} passed, ${FAIL} failed — review warnings above${RST}"
fi

echo
echo -e "${DIM}Useful commands:${RST}"
echo -e "  systemctl status ximg-web          # stack status"
echo -e "  docker compose ps                  # container status"
echo -e "  docker compose logs -f logs        # IDS + nginx log stream"
echo -e "  systemctl status suricata          # IDS engine status"
echo -e "  journalctl -fu suricata            # IDS live logs"
echo -e "  suricata-update && systemctl reload suricata  # refresh rules"
echo
