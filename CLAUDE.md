# ximg-web

Multi-site web portfolio/demo stack hosted at ximg.app.

## Task Completion

After completing any task, show a one or two sentence summary of what changed and why. Keep it brief.

## Git Workflow

**All new and modified code must be committed and pushed to the repo.** After completing any set of changes, run:
```
git add <files>
git commit -m "description"
git push
```
Never leave finished work uncommitted.

## Architecture

- **nginx:alpine** — SSL termination (Let's Encrypt, single cert covering all subdomains), HTTP→HTTPS redirect, reverse proxy
- **Apache httpd:2.4-alpine** — one container per static site, serves on port 80 internally
- **Node.js 22 Alpine** — WebSocket log streaming server (`logs-server/server.js`, port 3000)
- **Python 3.12 Alpine + paramiko** — SSH honeypot (`ssh-server/`), host port 22
- **Docker Compose** (`compose.yaml`) orchestrates all services
- **systemd** (`ximg-web.service`) manages the stack on boot

Frontend: vanilla JS only, no frameworks. Canvas API for visualizations. WebSockets for log streaming.

## Subdomains & Containers

Each subdomain has its own Apache container and `*-html/` directory for static files. The table below lists representative subdomains — the full list of 54+ is in `README.md` and `apps-html/index.html`.

| Subdomain | Directory | Description |
|-----------|-----------|-------------|
| ximg.app | public-html/ | Landing page (animated grid, floating orbs, frosted-glass card) |
| logs.ximg.app | logs-server/ | Live nginx log viewer (WebSocket, tabs per subdomain) + SSH session browser |
| apps.ximg.app | apps-html/ | Searchable directory of every app in the stack |
| readme.ximg.app | readme-html/ | README.md rendered as a styled web page |
| claudemd.ximg.app | claudemd-html/ | CLAUDE.md rendered as a styled web page |
| nagios.ximg.app | nagios-server/ | Nagios Core monitoring — HTTPS checks for every subdomain |
| stats.ximg.app | awstats/ | AWStats traffic analytics per subdomain |
| ids.ximg.app | ids-html/ | Suricata IDS live alert feed |
| netdata.ximg.app | netdata/ | Real-time server metrics (CPU, memory, network, Docker) |
| change.ximg.app | change-server/ | Live git commit history viewer |
| mail.ximg.app | mail-server/ | Webmail inbox for @ximg.app |

`logs.ximg.app` is special: nginx routes `/ws` to Node.js for WebSocket upgrades; all other traffic also hits Node (not Apache).

## Shared Nav

`shared-html/nav.js` — shared navigation bar (IIFE), volume-mounted read-only into every Apache container at `/usr/local/apache2/htdocs/shared/`.

**IMPORTANT:** The nav script MUST be loaded at the end of `<body>`, NOT in `<head>`. It calls `document.body.prepend()` and will silently fail if the body doesn't exist yet. Always place it as the last `<script>` before `</body>`:
```html
<script src="/shared/nav.js?v=2"></script>
```

**Version bump:** If nav.js is significantly changed (new groups, layout changes), increment the `?v=2` query string to bust browser caches across all sites.

## Images

**All images must be hosted on the website — never reference images from external URLs (no CDNs, no Wikipedia, no third-party hosts).** Download images locally and serve them from the app's own directory (e.g., `cnc-html/images/`, `mario-html/images/`).

## Container Operations

Use the right command for the situation:

| Situation | Command |
|-----------|---------|
| Static file change (HTML/CSS/JS in `*-html/`) | No restart needed — Apache serves files live |
| nginx config change (`nginx/nginx.conf`) | `docker compose exec nginx nginx -s reload` |
| Node.js server change (`logs-server/`, `change-server/`, etc.) | `docker compose restart <service>` |
| compose.yaml change (new service, new volume mount) | `docker compose up -d` |
| Dockerfile or build context change | `docker compose up -d --build <service>` |
| New container added | `docker compose up -d <service>` |

After any nginx config change, always test first: `docker compose exec nginx nginx -t`

## Adding a New App (Canonical Checklist)

This is the single authoritative checklist. Follow every step in order.

### Files & Config

1. **Create `*-html/` directory** with `index.html` as the entry point
2. **Favicon** — download a thematically appropriate image, save as `favicon.ico` or `favicon.png`, reference it in `<head>`. Download a real image; don't use a generic placeholder.
3. **Nav script** — add `<script src="/shared/nav.js?v=2"></script>` as the last `<script>` before `</body>`
4. **compose.yaml** — add a new `httpd:2.4-alpine` service with volumes for the html dir and `shared-html`
5. **nginx.conf (HTTP block)** — add the new subdomain to the HTTP→HTTPS redirect `server_name` list (the block at the top of the HTTPS server section that redirects port 80)
6. **nginx.conf (HTTPS block)** — add a new `server { listen 443 ssl; server_name <subdomain>.ximg.app; ... }` block proxying to the new service
7. **SSL cert** — issue an individual cert: `certbot certonly --webroot -d <subdomain>.ximg.app -w /root/ximg-web/public-html --non-interactive`; reference it in the nginx server block (see SSL section below)

### Wiring

8. **Nav bar** — add an entry to `shared-html/nav.js`
9. **Landing page** — add a card to `public-html/index.html` (ximg.app)
10. **Apps directory** — add a row to the `APPS` array in `apps-html/index.html` with name, domain, date added, and description
11. **Logs app** — add the subdomain to the tab list in `logs-server/server.js` (both the log file map and the button list in the HTML)
12. **Nagios** — add the subdomain to the `members` list in `nagios-server/ximg-hosts.cfg` and add a `define host {}` entry in the same file
13. **README** — add a row to the `## Live Sites` table in `README.md`
14. **Install script** — add the subdomain to the `DOMAINS` array in `install/setup.sh`

### Stats

15. **AWStats** — AWStats auto-generates config per subdomain from nginx logs; no manual config needed. Verify the new subdomain appears at `stats.ximg.app` after the next hourly cron run.

Missing any of these means the app is invisible, unmonitored, or incomplete.

## New App Verification

After creating a new app, always verify all of the following before considering the task done:

1. **Cert acquired** — `certbot certificates | grep <subdomain>`
2. **Container up** — `docker compose ps <service>`
3. **Website works** — `curl -sk https://<subdomain>.ximg.app | head -5`
4. **App is unique** — confirm `<title>` tag is NOT `ximg.app` (which would mean nginx is routing to the wrong upstream)

If any check fails, fix it before finishing.

## SSL / Adding a New Subdomain

Each subdomain gets its own individual cert. Issue it with:

```bash
# Step 1 — DNS A record must already point to 172.238.205.61

# Step 2 — issue cert for the new subdomain:
certbot certonly --webroot -d newsubdomain.ximg.app \
  -w /root/ximg-web/public-html \
  --non-interactive

# Step 3 — reference the cert in the nginx server block:
#   ssl_certificate     /etc/letsencrypt/live/newsubdomain.ximg.app/fullchain.pem;
#   ssl_certificate_key /etc/letsencrypt/live/newsubdomain.ximg.app/privkey.pem;

# Step 4 — reload nginx:
docker compose exec nginx nginx -s reload
```

## SSH Honeypot

- Accepts any password, drops user into `/bin/bash` as non-root `user` inside isolated container
- Outbound traffic blocked via iptables; runs on separate `ssh-net` Docker network
- Sessions recorded to `ssh-logs/YYYYMMDD-HHMMSS-IP-PID.log` (root:root 600, gitignored)
- Browsable in `logs.ximg.app` under "SSH Sessions" tab

## Key Paths

- `nginx/nginx.conf` — reverse proxy + virtual hosting config
- `compose.yaml` — all Docker services
- `shared-html/nav.js` — shared navigation bar
- `nagios-server/ximg-hosts.cfg` — Nagios host definitions and hostgroup membership
- `nagios-server/ximg-services.cfg` — Nagios service check definitions
- `logs/` — per-site nginx access/error logs (one file per subdomain)
- `ssh-logs/` — SSH session recordings (gitignored)
