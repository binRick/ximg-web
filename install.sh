#!/usr/bin/env bash
# install.sh — set up ximg-web on a fresh system
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Checks ────────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "error: run as root (sudo ./install.sh)" >&2
  exit 1
fi

command -v docker        >/dev/null 2>&1 || { echo "error: docker not found"; exit 1; }
docker compose version   >/dev/null 2>&1 || { echo "error: docker compose plugin not found"; exit 1; }

# ── Nav.js placeholder files ─────────────────────────────────────────────────
# These empty files are needed so Docker can bind-mount shared-html/nav.js
# over them.  They are gitignored and must be recreated after a fresh clone.
echo "creating nav.js placeholder files..."
for dir in public-html linux-html butterfly-html ascii-html json-html; do
  touch "$REPO_DIR/$dir/nav.js"
done

# ── Systemd unit ──────────────────────────────────────────────────────────────
echo "installing systemd unit..."
install -m 644 "$REPO_DIR/ximg-web.service" /etc/systemd/system/ximg-web.service

systemctl daemon-reload
systemctl enable ximg-web.service
echo "ximg-web.service enabled (will start on next boot)"

# ── Optional: start now ───────────────────────────────────────────────────────
read -rp "start the stack now? [Y/n] " ans
ans="${ans:-Y}"
if [[ "$ans" =~ ^[Yy] ]]; then
  systemctl start ximg-web.service
  echo "stack started — check status with: systemctl status ximg-web"
fi

echo "done."
