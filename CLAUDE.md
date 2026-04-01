# ximg-web

Multi-site web portfolio/demo stack hosted at ximg.app.

## Task Completion

After completing any task, always show a brief plain-language summary of what was done — what changed, what was added, and why — so the user understands the result without reading diffs.

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

Each subdomain has its own Apache container and `*-html/` directory for static files.

| Subdomain | Directory | Description |
|-----------|-----------|-------------|
| ximg.app | public-html/ | Landing page (animated grid, floating orbs, frosted-glass card) |
| linux.ximg.app | linux-html/ | Browser terminal (xterm.js + ~20-command mock shell, bouncing Tux) |
| butterfly.ximg.app | butterfly-html/ | Canvas particle animation (butterfly curve math) |
| ascii.ximg.app | ascii-html/ | ASCII art: spinning donut, matrix rain, sine plasma |
| json.ximg.app | json-html/ | JSON type reference card (syntax-highlighted, educational) |
| poker.ximg.app | poker-html/ | Texas Hold'em hand evaluator (card picker, probability bar chart) |
| logs.ximg.app | logs-server/ | Live nginx log viewer (WebSocket, tabs per subdomain) + SSH session browser |
| mario.ximg.app | mario-html/ | Mario-themed app |
| yaml.ximg.app | yaml-html/ | YAML reference |
| doom.ximg.app | doom-html/ | Doom-themed app |
| monkey.ximg.app | monkey-html/ | Monkey-themed app |
| docker.ximg.app | docker-html/ | Docker-themed app |
| pizza.ximg.app | pizza-html/ | Pizza app |
| kombat.ximg.app | kombat-html/ | Mortal Kombat app |
| chinese.ximg.app | chinese-html/ | Chinese-themed app |
| wargames.ximg.app | wargames-html/ | Wargames app |
| moto.ximg.app | moto-html/ | Moto app |
| india.ximg.app | india-html/ | India app |
| wood.ximg.app | wood-html/ | Wood app |
| guns.ximg.app | guns-html/ | Guns app |
| tampa.ximg.app | tampa-html/ | Tampa app |
| florida.ximg.app | florida-html/ | Florida app |
| america.ximg.app | america-html/ | America app |
| computers.ximg.app | computers-html/ | Computers app |
| trump.ximg.app | trump-html/ | Trump app |
| cnc.ximg.app | cnc-html/ | Command & Conquer app — games, vehicles, buildings, lore |

`logs.ximg.app` is special: nginx routes `/ws` to Node.js for WebSocket upgrades; all other traffic also hits Node (not Apache).

## Shared Nav

`shared-html/nav.js` — shared navigation bar (IIFE), volume-mounted into all containers. Brand "ximg.app" is a clickable link.

**IMPORTANT:** The nav script MUST be loaded at the end of `<body>`, NOT in `<head>`. It calls `document.body.prepend()` and will silently fail if the body doesn't exist yet. Always place it as the last `<script>` before `</body>`.

## Images

**All images must be hosted on the website — never reference images from external URLs (no CDNs, no Wikipedia, no third-party hosts).** Download images locally and serve them from the app's own directory (e.g., `cnc-html/images/`, `mario-html/images/`).

## Adding a New App (Checklist)

Every new app must be wired into **four places** in addition to its own files:

1. **Nav bar** — add an entry to `shared-html/nav.js`
2. **Landing page** — add a card/link on `public-html/index.html` (ximg.app)
3. **Logs app** — add the subdomain to the tab list in `logs-server/server.js` so its nginx logs are streamed
4. **Apps directory** — add a row to the `APPS` array in `apps-html/index.html` (apps.ximg.app) with name, domain, date added, and description

Missing any of these four means the app is invisible or incomplete.

## New App Verification

After creating a new app, always verify all of the following before considering the task done:

1. **Cert acquired** — confirm the new subdomain is covered by the cert: `certbot certificates | grep <subdomain>`
2. **Container up** — confirm the Docker container is running: `docker compose ps <service>`
3. **Website works** — confirm the site returns HTTP 200: `curl -sk https://<subdomain>.ximg.app | head -5`
4. **App is unique** — confirm the page HTML is NOT identical to the main landing page (`ximg.app`): compare `<title>` tags and page content to ensure the new app loaded its own page, not the default

If any check fails, fix it before finishing.

## SSL / Adding a New Subdomain

Cert covers all subdomains via Let's Encrypt HTTP-01. Steps to add a new subdomain:
1. DNS A record → 172.238.205.61
2. `certbot --expand` to add the new domain
3. New `server { }` block in `nginx/nginx.conf`
4. New Apache service in `compose.yaml`
5. New `*-html/` directory with static files
6. **Add entry to `shared-html/nav.js`** (don't forget this — every app needs a nav entry)
7. **Add a card to `public-html/index.html`** (landing page)
8. **Add subdomain to `logs-server/server.js`** tab list
9. **Add a row to the `APPS` array in `apps-html/index.html`** (apps.ximg.app directory)
10. In the new app's `index.html`, add `<script src="/shared/nav.js?v=2"></script>` as the last script before `</body>`

## SSH Honeypot

- Accepts any password, drops user into `/bin/bash` as non-root `user` inside isolated container
- Outbound traffic blocked via iptables; runs on separate `ssh-net` Docker network
- Sessions recorded to `ssh-logs/YYYYMMDD-HHMMSS-IP-PID.log` (root:root 600, gitignored)
- Browsable in `logs.ximg.app` under "SSH Sessions" tab

## Key Paths

- `nginx/nginx.conf` — reverse proxy + virtual hosting config
- `compose.yaml` — all Docker services
- `logs/` — per-site nginx access/error logs
- `ssh-logs/` — SSH session recordings (gitignored)
