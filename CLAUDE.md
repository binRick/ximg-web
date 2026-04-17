# ximg-web

Multi-site web portfolio/demo stack hosted at ximg.app.

## Task Completion

After completing any task, show a one or two sentence summary of what changed and why. Keep it brief.

## Landing Page

**Every app must have a card on the landing page (`public-html/index.html`).** When adding a new app, always add its card to the landing page as part of the checklist — not just to `apps-html/index.html`. If an app exists in the apps directory but has no card on the landing page, that is a bug.

## ESP32

Whenever the conversation involves ESP32 topics, always run the following before proceeding to ensure the submodule is up to date:

```bash
git -C esp32-dev-001 pull origin main
```

This ensures you have access to the latest content in the `esp32-dev-001` submodule.

The `esp32.ximg.app` web app (`esp32-html/`) is directly based on the `esp32-dev-001` submodule. Each sketch in `esp32-dev-001/sketches/` should have a corresponding page in `esp32-html/`. The mapping is:

| Sketch (submodule) | Web page (`esp32-html/`) |
|--------------------|--------------------------|
| `beep_button` | `button-beep.html` ✓ |
| `lie_detector` | `truth-detector.html` ✓ |
| `dvd_screensaver` | `dvd-screensaver.html` ✓ |
| `heartbeat_viz` | `heartbeat-viz.html` ✓ |
| `pixel_canvas` | `pixel-canvas.html` ✓ |
| `wifi_scanner` | `wifi-scanner.html` ✓ |

**When adding a new sketch**, always do all of the following as part of the same task:
1. Create `esp32-html/<sketch-name>.html` (session page) and `esp32-html/<sketch-name>-source.html` (source viewer)
2. Add the sketch to the `#subnav` on **every** existing ESP32 page (`index.html`, `hardware.html`, and all session + source pages)
3. Add a card to the **"What We Built"** session grid in `esp32-html/index.html`
4. Update this table in `CLAUDE.md` to mark the new sketch as ✓

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
- **nginx:alpine (`static`)** — single container serving all static sites; uses `root /sites/$host` to route each request to the correct `*-html/` directory mounted at `/sites/<subdomain>.ximg.app`
- **Node.js 22 Alpine** — WebSocket log streaming server (`logs-server/server.js`, port 3000)
- **Python 3.12 Alpine + paramiko** — SSH honeypot (`ssh-server/`), host port 22
- **Docker Compose** (`compose.yaml`) orchestrates all services
- **systemd** (`ximg-web.service`) manages the stack on boot

Frontend: vanilla JS only, no frameworks. Canvas API for visualizations. WebSockets for log streaming.

## Subdomains & Containers

All static sites share a single `static` nginx container. Each subdomain's files live in a `*-html/` directory, volume-mounted into the `static` container at `/sites/<subdomain>.ximg.app`. Dynamic services (logs, change, nagios, awstats, mail, ssh) keep their own containers. The table below lists representative subdomains — the full list of 232+ is in `README.md` and `apps-html/index.html`.

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

`shared-html/nav.js` — shared navigation bar (IIFE), volume-mounted read-only into the `static` container at `/sites/shared/` and served at `/shared/nav.js` on every subdomain.

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
| Static file change (HTML/CSS/JS in `*-html/`) | No restart needed — nginx `static` serves files live |
| nginx config change (`nginx/nginx.conf`) | `docker compose exec nginx nginx -s reload` |
| Node.js server change (`logs-server/`, `change-server/`, etc.) | `docker compose restart <service>` |
| compose.yaml change (new volume mount to `static`) | `docker compose up -d` |
| Dockerfile or build context change | `docker compose up -d --build <service>` |

After any nginx config change, always test first: `docker compose exec nginx nginx -t`

## Sub-Navigation Pattern

Apps with multiple sections **must use separate HTML pages per section**, not anchor links within a single page. Each sub-nav item links to its own `.html` file (e.g., `process.html`, `history.html`). The sub-nav is reproduced identically on every page of the app, with the current page's link highlighted as active.

**Do NOT use `href="#section"` anchor jumps for sub-nav.** Each tab is a real page load.

Example structure for a multi-section app at `bourbon.ximg.app`:
```
bourbon-html/
  index.html        ← hero / overview (default landing)
  process.html      ← Production tab
  distilleries.html ← Distilleries tab
  tasting.html      ← Tasting tab
  history.html      ← History tab
```

Sub-nav HTML pattern (repeat on every page, mark active with a class):
```html
<nav class="subnav">
  <a href="index.html">Overview</a>
  <a href="process.html" class="active">Production</a>
  <a href="distilleries.html">Distilleries</a>
</nav>
```

Use a JS snippet or inline logic to auto-detect the active page from `location.pathname` so you don't have to hard-code the active class per-page:
```js
document.querySelectorAll('.subnav a').forEach(a => {
  if (a.href === location.href || location.pathname.endsWith(a.getAttribute('href'))) {
    a.classList.add('active');
  }
});
```

## Sub-Nav Pages (Multi-Page Apps)

When an app has enough content to warrant multiple pages, split it into separate HTML files with a sticky sub-nav bar. Each sub-page is its own `.html` file in the `*-html/` directory. **Do not use anchor-based single-page navigation — each tab must be a real page load.**

### Pattern

Every sub-page must include:

1. **The same `<style>` block** as the main page (CSS variables, layout, component classes). Copy it in full — no shared CSS file.

2. **A `<nav id="subnav">` sticky bar** positioned below the main nav:
```html
<nav id="subnav">
  <a href="index.html">Overview</a>
  <a href="chapter2.html">Chapter 2</a>
  <!-- ... -->
</nav>
<script>
  document.querySelectorAll('#subnav a').forEach(function(a) {
    var href = a.getAttribute('href');
    var path = location.pathname;
    if (path.endsWith(href) || (href === 'index.html' && (path.endsWith('/') || path.endsWith('/appname') || path.endsWith('index.html')))) {
      a.classList.add('active');
    }
  });
</script>
```

3. **Sub-nav CSS** (add to the `<style>` block of every page):
```css
#subnav {
  position: sticky;
  top: 52px;          /* sits flush under the main nav */
  z-index: 150;
  background: rgba(8,11,14,.97);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255,255,255,.07);
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: .2rem;
  padding: .4rem 1rem;
}
#subnav a {
  font-size: .72rem;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #5a6070;
  padding: .3rem .65rem;
  border-radius: 3px;
  text-decoration: none;
  transition: color .2s, background .2s;
  font-family: 'Courier New', monospace;
}
#subnav a:hover, #subnav a.active {
  color: var(--accent);          /* use the app's accent color */
  background: rgba(255,255,255,.06);
}
```

4. **All links use relative paths** — `href="index.html"`, `href="chapter2.html"` — not absolute URLs.

5. **Shared nav at end of body**: `<script src="/shared/nav.js?v=2"></script>`

### index.html for multi-page apps

The `index.html` of a multi-page app should serve as a **landing/overview page** that introduces the topic and shows a preview grid linking to each sub-page. It should NOT contain all the content — that goes in the sub-pages.

### Real examples

- `cia-html/` — 9 pages: index, origins, coups, spying, mkultra, jfk, reckoning, endgame, directors
- `bourbon-html/` — multiple pages: index, law, process, mashbill, distilleries, etc.
- `moto-html/` — index + individual bike pages

---

## Adding a New App (Canonical Checklist)

This is the single authoritative checklist. Follow every step in order.

### Files & Config

1. **Create `*-html/` directory** with `index.html` as the entry point
2. **Favicon** — download a thematically appropriate image, save as `favicon.ico` or `favicon.png`, reference it in `<head>`. Download a real image; don't use a generic placeholder.
3. **Nav script** — add `<script src="/shared/nav.js?v=2"></script>` as the last `<script>` before `</body>`
4. **compose.yaml** — add a new volume mount to the `static` service: `- ./<name>-html:/sites/<subdomain>.ximg.app:ro`
5. **nginx.conf (HTTP block)** — add the new subdomain to the HTTP→HTTPS redirect `server_name` list (the block at the top of the HTTPS server section that redirects port 80)
6. **nginx.conf (HTTPS block)** — add a new `server { listen 443 ssl; server_name <subdomain>.ximg.app; ... }` block proxying to `static` (`set $upstream static`)
7. **SSL cert** — no new cert needed. The wildcard cert at `/etc/letsencrypt/live/wildcard.ximg.app/` covers all `*.ximg.app` subdomains. Reference it in the nginx server block:
   ```nginx
   ssl_certificate     /etc/letsencrypt/live/wildcard.ximg.app/fullchain.pem;
   ssl_certificate_key /etc/letsencrypt/live/wildcard.ximg.app/privkey.pem;
   ```

### Wiring

8. **Nav bar** — add an entry to `shared-html/nav.js`; if it belongs to the **Bundlers** group, also add a button to the CTA section of `bundler-info-html/index.html` (the "Ready to bundle something?" footer); if it belongs to the **Dev Tools** group, also add a card to `devtools-info-html/index.html` (the `TOOLS` array in the `<script>` block)
9. **Landing page** — add a card to `public-html/index.html` (ximg.app)
10. **Apps directory** — add a row to the `APPS` array in `apps-html/index.html` with name, domain, date added, and description
11. **Logs app** — add the subdomain to the tab list in `logs-server/server.js` (both the log file map and the button list in the HTML)

> **If the new app is a bundler** (i.e. serves downloadable zip bundles): add `./logs-data:/data` to its service in `compose.yaml`, add `_log_bundle_download()` logging to its `/download/<token>` endpoint (writing JSON lines to `/data/bundler-downloads.log`), and store `ip`, `package`, and `extra` (platform/distro/arch) in the bundle token dict. This feeds the "bundler downloads" tab in `logs.ximg.app`.
12. **Nagios** — add the subdomain to the `members` list in `nagios-server/ximg-hosts.cfg` and add a `define host {}` entry in the same file
13. **README** — add a row to the `## Live Sites` table in `README.md`
14. **Install script** — add the subdomain to the `DOMAINS` array in `install/setup.sh`

### Stats

15. **AWStats** — AWStats auto-generates config per subdomain from nginx logs; no manual config needed. Verify the new subdomain appears at `stats.ximg.app` after the next hourly cron run.

### App Count Updates

Whenever a new app is added, update the hardcoded app/site counts in all of the following locations:

16. **`public-html/index.html`** — update the "N interactive apps" count in the hero tagline (search for "interactive apps")
17. **`README.md`** — update "N virtual hosts (root + N-1 subdomains)" on the line below `## Live Sites`
18. **`CLAUDE.md`** — update the "N+" count in the Subdomains & Containers section ("the full list of N+ is in README.md")

Missing any of these means the app is invisible, unmonitored, or incomplete.

## New App Verification

After creating a new app, always verify all of the following before considering the task done:

1. **Container up** — `docker compose ps <service>`
3. **Website works** — `curl -sk https://<subdomain>.ximg.app | head -5`
4. **App is unique** — confirm `<title>` tag is NOT `ximg.app` (which would mean nginx is routing to the wrong upstream)

If any check fails, fix it before finishing.

## SSL / Adding a New Subdomain

**Do NOT issue a new cert per subdomain.** A wildcard cert covering all `*.ximg.app` subdomains is already in place, issued via acme.sh + GoDaddy DNS-01 challenge and stored at:

```
/etc/letsencrypt/live/wildcard.ximg.app/fullchain.pem
/etc/letsencrypt/live/wildcard.ximg.app/privkey.pem
```

Auto-renewal is handled by acme.sh's cron job (renews ~day 60, reloads nginx automatically).

Every new nginx `server {}` block should reference the wildcard cert:

```nginx
ssl_certificate     /etc/letsencrypt/live/wildcard.ximg.app/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/wildcard.ximg.app/privkey.pem;
```

After adding a server block, reload nginx:

```bash
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
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
