# ximg-web

Production multi-site web stack running on a single Linux VM at `172.238.205.61`. nginx sits in front of all services as a reverse proxy, handles SSL termination via Let's Encrypt, and enforces HTTPS across four subdomains. Apache serves static content on the internal Docker network — all public traffic enters through nginx only.

## Live Sites

| URL | Description |
|-----|-------------|
| [ximg.app](https://ximg.app) | Main landing page |
| [linux.ximg.app](https://linux.ximg.app) | Interactive Linux terminal emulator in the browser |
| [butterfly.ximg.app](https://butterfly.ximg.app) | Interactive parametric butterfly particle simulation |
| [logs.ximg.app](https://logs.ximg.app) | Live nginx log viewer (WebSocket streaming) |

## Architecture

```mermaid
flowchart LR
    client(["Browser"])

    subgraph host ["Linux VM — 172.238.205.61"]
        nginx["nginx\n:80 / :443\nSSL termination\nHTTP→HTTPS\nVirtual hosting"]
        web["Apache httpd\nximg.app\nstatic HTML"]
        linux["Apache httpd\nlinux.ximg.app\nxterm.js terminal"]
        butterfly["Apache httpd\nbutterfly.ximg.app\ncanvas animation"]
        logs["Node.js\nlogs.ximg.app\nWebSocket log streamer"]
        certs["/etc/letsencrypt\nLet's Encrypt cert\n(ximg.app + subdomains)"]
        logfiles["./logs/\nper-site access\n& error logs"]
    end

    client -->|"HTTPS :443"| nginx
    nginx -->|"proxy_pass"| web
    nginx -->|"proxy_pass"| linux
    nginx -->|"proxy_pass"| butterfly
    nginx -->|"proxy_pass\n(WebSocket)"| logs
    certs -->|"mounted read-only"| nginx
    nginx -->|"writes"| logfiles
    logfiles -->|"mounted read-only"| logs
```

## Stack

| Component | Image / Runtime | Role |
|-----------|----------------|------|
| nginx | `nginx:alpine` | Reverse proxy, SSL termination, HTTP→HTTPS redirect, virtual hosting |
| Apache (ximg) | `httpd:2.4-alpine` | Serves `ximg.app` static files |
| Apache (linux) | `httpd:2.4-alpine` | Serves `linux.ximg.app` — xterm.js terminal + Tux DVD screensaver |
| Apache (butterfly) | `httpd:2.4-alpine` | Serves `butterfly.ximg.app` — interactive canvas animation |
| Node.js (logs) | `node:22-alpine` | WebSocket server that tails nginx logs and streams them to the browser |

All containers run on an internal Docker bridge network. Only nginx has public ports (80, 443).

## Technologies

| Technology | Usage |
|-----------|-------|
| **nginx** | Reverse proxy, virtual hosting, SSL termination, HSTS |
| **Apache httpd** | Static file serving for three subdomains |
| **Docker** | Containerisation for all services |
| **Docker Compose** | Multi-service orchestration |
| **Alpine Linux** | Base image for all containers (minimal footprint) |
| **Let's Encrypt / Certbot** | Free TLS certificates via HTTP-01 webroot challenge |
| **Node.js** | WebSocket log-streaming server |
| **ws** | WebSocket library for Node.js |
| **xterm.js** | Browser-based terminal emulation (`linux.ximg.app`) |
| **xterm-addon-fit** | Auto-resize xterm.js to viewport |
| **Canvas API** | Parametric butterfly particle animation (`butterfly.ximg.app`) |
| **SELinux** | Disabled on host (permissive → disabled in `/etc/selinux/config`) |

## Subdomains & Virtual Hosting

nginx routes incoming requests by `server_name`:

| Domain | Backend | Notes |
|--------|---------|-------|
| `ximg.app`, `www.ximg.app` | `web:80` | Main site |
| `linux.ximg.app` | `linux:80` | Terminal page |
| `butterfly.ximg.app` | `butterfly:80` | Canvas animation page |
| `logs.ximg.app` | `logs:3000` | WebSocket — Upgrade/Connection headers forwarded, HTTP/1.1 required |

HTTP requests on port 80 are redirected to HTTPS. ACME challenge paths (`.well-known/acme-challenge/`) are exempt so certbot renewals work without stopping nginx.

## SSL

Certificates are issued and auto-renewed via [Certbot](https://certbot.eff.org/) using the webroot HTTP-01 challenge method.

- Cert covers `ximg.app`, `www.ximg.app`, `linux.ximg.app`, `logs.ximg.app`, `butterfly.ximg.app`
- Stored at `/etc/letsencrypt/live/ximg.app/` and mounted read-only into nginx
- Auto-renewed by the certbot systemd timer; a deploy hook reloads nginx on renewal
- TLS 1.2 / 1.3 only, HSTS enforced (`max-age=63072000`)

Manual renewal test:
```bash
certbot renew --dry-run
```

## Logging

nginx writes per-site logs to `./logs/` on the host, mounted read-only into the logs container:

```
logs/
├── ximg.access.log           # ximg.app requests
├── ximg.error.log
├── linux.access.log          # linux.ximg.app requests
├── linux.error.log
├── butterfly.access.log      # butterfly.ximg.app requests
├── butterfly.error.log
├── logs.access.log           # logs.ximg.app requests
├── logs.error.log
└── error.log
```

Generate a markdown summary report:
```bash
bash log-summary.sh
```

## Live Log Viewer (`logs.ximg.app`)

A Node.js server (`logs-server/server.js`) tails the per-site nginx access logs and streams new lines to the browser over **WebSockets**. On connect it immediately replays the last 100 lines, then streams live updates as they are written. Uses `fs.watch` with a 1 s polling fallback.

The frontend features:
- Tab switcher between `ximg.app`, `linux.ximg.app`, and `butterfly.ximg.app` logs
- Color-coded status codes (green 2xx, cyan 3xx, yellow 4xx, red 5xx)
- Live per-class request counters
- Pause/resume without disconnecting
- Auto-reconnect on connection drop

## Interactive Terminal (`linux.ximg.app`)

Built with [xterm.js](https://xtermjs.org/). A mock shell runs entirely in the browser — no server-side execution. Supported commands: `ls`, `cd`, `cat`, `pwd`, `echo`, `uname`, `whoami`, `hostname`, `date`, `uptime`, `free`, `df`, `ps`, `docker`, `curl`, `env`, `history`, `neofetch`, `clear`, `exit`, `help`. Features arrow-key history, Tab completion, and Ctrl+C/L. A Tux SVG bounces around the background DVD-screensaver style.

## Butterfly Simulation (`butterfly.ximg.app`)

Canvas-based interactive particle system built on the [butterfly curve](https://en.wikipedia.org/wiki/Butterfly_curve_(transcendental)) parametric equation. Particles trace butterfly-shaped paths and drift gently toward the mouse cursor. Click or tap anywhere to spawn a burst of new particles.

## Usage

**Start all services:**
```bash
docker compose up -d
```

**Rebuild after changes:**
```bash
docker compose up -d --build
```

**View live logs on the terminal:**
```bash
tail -f logs/ximg.access.log
```

**Stop:**
```bash
docker compose down
```
