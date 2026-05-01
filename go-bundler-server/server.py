import datetime
import json as _json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import zipfile
from flask import Flask, request, send_file, jsonify, Response, stream_with_context

app = Flask(__name__)

BUNDLE_LOG = '/data/bundler-downloads.log'
_blog_lock = threading.Lock()

def _log_bundle_download(bundler, ip, package, extra, size_mb):
    entry = _json.dumps({'ts': datetime.datetime.utcnow().isoformat() + 'Z',
                         'bundler': bundler, 'ip': ip, 'package': package,
                         'extra': extra, 'sizeMB': round(size_mb, 1)})
    try:
        with _blog_lock:
            with open(BUNDLE_LOG, 'a') as fh:
                fh.write(entry + '\n')
    except Exception:
        pass

# Go module path + optional @version
MODULE_RE = re.compile(
    r'^[a-zA-Z0-9][a-zA-Z0-9._-]*(\.[a-zA-Z]{2,})+(/[a-zA-Z0-9._~@-]+)*(@[a-zA-Z0-9._~+\-]+)?$'
)

GO_PLATFORMS = {
    'linux-amd64':   {'label': 'Linux x86-64',               'ext': 'tar.gz', 'sizeMB': 70},
    'linux-arm64':   {'label': 'Linux ARM64',                 'ext': 'tar.gz', 'sizeMB': 65},
    'darwin-arm64':  {'label': 'macOS ARM64 (Apple Silicon)', 'ext': 'tar.gz', 'sizeMB': 68},
    'darwin-amd64':  {'label': 'macOS x86-64 (Intel)',        'ext': 'tar.gz', 'sizeMB': 70},
    'windows-amd64': {'label': 'Windows x64',                 'ext': 'zip',    'sizeMB': 72},
}

PACKAGES = [
    # HTTP / Web
    {'name': 'github.com/gin-gonic/gin',                 'label': 'Gin',          'cat': 'Web',        'color': '#00ADD8', 'desc': 'Fast, minimal web framework for Go with gin martini-like API.'},
    {'name': 'github.com/labstack/echo/v4',              'label': 'Echo',         'cat': 'Web',        'color': '#1c7ed6', 'desc': 'High performance, minimalist Go web framework.'},
    {'name': 'github.com/gofiber/fiber/v2',              'label': 'Fiber',        'cat': 'Web',        'color': '#00b4d8', 'desc': 'Express-inspired web framework built on Fasthttp.'},
    {'name': 'github.com/go-chi/chi/v5',                 'label': 'Chi',          'cat': 'Web',        'color': '#5f3dc4', 'desc': 'Lightweight composable router for Go HTTP services.'},
    {'name': 'github.com/gorilla/mux',                   'label': 'Gorilla Mux',  'cat': 'Web',        'color': '#7d4e27', 'desc': 'Powerful URL router and dispatcher for Go.'},
    # CLI
    {'name': 'github.com/spf13/cobra',                   'label': 'Cobra',        'cat': 'CLI',        'color': '#1a1a2e', 'desc': 'Library for creating powerful modern CLI applications.'},
    {'name': 'github.com/urfave/cli/v2',                 'label': 'urfave/cli',   'cat': 'CLI',        'color': '#3d9970', 'desc': 'Simple, fast and fun CLI package for Go.'},
    # Database / ORM
    {'name': 'gorm.io/gorm',                             'label': 'GORM',         'cat': 'ORM',        'color': '#25a18e', 'desc': 'The fantastic ORM library for Go.'},
    {'name': 'github.com/jmoiron/sqlx',                  'label': 'sqlx',         'cat': 'Database',   'color': '#336791', 'desc': 'General purpose extensions to database/sql.'},
    {'name': 'github.com/jackc/pgx/v5',                  'label': 'pgx',          'cat': 'Database',   'color': '#336791', 'desc': 'High performance PostgreSQL driver and toolkit.'},
    {'name': 'github.com/redis/go-redis/v9',             'label': 'go-redis',     'cat': 'Cache',      'color': '#dc382d', 'desc': 'Redis client for Go with built-in rate limiting.'},
    {'name': 'go.mongodb.org/mongo-driver',              'label': 'mongo-driver', 'cat': 'Database',   'color': '#4db33d', 'desc': 'Official MongoDB driver for Go.'},
    # Config / Logging
    {'name': 'github.com/spf13/viper',                   'label': 'Viper',        'cat': 'Config',     'color': '#e63946', 'desc': 'Complete configuration solution for Go applications.'},
    {'name': 'go.uber.org/zap',                          'label': 'Zap',          'cat': 'Logging',    'color': '#f7931e', 'desc': 'Blazing fast, structured, leveled logging in Go.'},
    {'name': 'github.com/sirupsen/logrus',               'label': 'Logrus',       'cat': 'Logging',    'color': '#8338ec', 'desc': 'Structured, pluggable logging for Go.'},
    {'name': 'github.com/rs/zerolog',                    'label': 'zerolog',      'cat': 'Logging',    'color': '#2d6a4f', 'desc': 'Zero allocation JSON logger with leveled logging.'},
    # Testing
    {'name': 'github.com/stretchr/testify',              'label': 'Testify',      'cat': 'Testing',    'color': '#2b9348', 'desc': 'A toolkit with common assertions and mocks for Go testing.'},
    {'name': 'go.uber.org/mock',                         'label': 'gomock',       'cat': 'Testing',    'color': '#0077b6', 'desc': 'Mock object framework for Go.'},
    # Auth / Security
    {'name': 'github.com/golang-jwt/jwt/v5',             'label': 'JWT',          'cat': 'Auth',       'color': '#fb015b', 'desc': 'JSON Web Token implementation for Go.'},
    {'name': 'golang.org/x/crypto',                      'label': 'x/crypto',     'cat': 'Security',   'color': '#1e40af', 'desc': 'Supplementary Go cryptography packages.'},
    # Utilities
    {'name': 'github.com/samber/lo',                     'label': 'lo',           'cat': 'Utility',    'color': '#e76f51', 'desc': 'Lodash-style generic helpers for Go 1.18+.'},
    {'name': 'github.com/go-playground/validator/v10',   'label': 'validator',    'cat': 'Validation', 'color': '#7209b7', 'desc': 'Go struct and field validation using tags.'},
    {'name': 'github.com/google/uuid',                   'label': 'UUID',         'cat': 'Utility',    'color': '#00897b', 'desc': 'Go package for UUIDs based on RFC 4122.'},
    {'name': 'github.com/joho/godotenv',                 'label': 'godotenv',     'cat': 'Config',     'color': '#ecd53f', 'desc': 'Load .env files into Go environment.'},
    # Protocol / RPC
    {'name': 'google.golang.org/grpc',                   'label': 'gRPC',         'cat': 'RPC',        'color': '#244c5a', 'desc': 'The Go implementation of gRPC.'},
    {'name': 'github.com/gorilla/websocket',             'label': 'Gorilla WS',   'cat': 'Realtime',   'color': '#0c7c59', 'desc': 'Fast, well-tested WebSocket implementation for Go.'},
    # HTTP Clients
    {'name': 'github.com/go-resty/resty/v2',             'label': 'Resty',        'cat': 'HTTP',       'color': '#0096c7', 'desc': 'Simple HTTP and REST client library for Go.'},
    {'name': 'golang.org/x/net',                         'label': 'x/net',        'cat': 'Network',    'color': '#006d77', 'desc': 'Supplementary Go network packages.'},
]

FAVICON_SVG = open('/app/favicon.svg', 'rb').read()

# ── ClamAV helpers ───────────────────────────────────────────────────
import subprocess as _subprocess

def _clam_scan_file(filepath):
    """Scan one file via clamscan CLI. Returns 'CLEAN', virus name, or None if unavailable."""
    try:
        r = _subprocess.run(
            ['clamscan', '--no-summary', '--database=/var/lib/clamav', filepath],
            capture_output=True, text=True, timeout=120,
        )
        if r.returncode == 0:
            return 'CLEAN'
        if r.returncode == 1:
            for line in r.stdout.splitlines():
                if 'FOUND' in line:
                    return line.split(':')[-1].replace('FOUND', '').strip()
            return 'UNKNOWN'
        return None
    except Exception:
        return None

_bundles = {}
_bundles_lock = threading.Lock()


def _cleanup_bundles():
    while True:
        time.sleep(60)
        now = time.time()
        to_del = []
        with _bundles_lock:
            for token, info in list(_bundles.items()):
                if now - info['ts'] > 300:
                    to_del.append(token)
            for token in to_del:
                info = _bundles.pop(token)
                shutil.rmtree(info['tmpdir'], ignore_errors=True)


threading.Thread(target=_cleanup_bundles, daemon=True).start()


def _logo_svg(pkg):
    words = re.split(r'[-_. /]', pkg['label'])
    abbrev = (words[0][0] + words[1][0]).upper() if len(words) >= 2 else pkg['label'][:2].upper()
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
        f'<rect width="40" height="40" rx="9" fill="{pkg["color"]}"/>'
        f'<text x="20" y="27" font-size="15" font-weight="700" text-anchor="middle" '
        f'fill="white" font-family="system-ui,ui-sans-serif,sans-serif" letter-spacing="-0.5">'
        f'{abbrev}</text></svg>'
    )


def _split_module_version(module_spec):
    """Split 'github.com/foo/bar@v1.2.3' -> ('github.com/foo/bar', 'v1.2.3').
    Returns (spec, 'latest') if no @ is found."""
    # Handle versioned sub-paths: the last @ is the version separator
    # e.g. github.com/labstack/echo/v4 → no version; github.com/gin-gonic/gin@v1.9.1 → v1.9.1
    if '@' in module_spec:
        idx = module_spec.rindex('@')
        return module_spec[:idx], module_spec[idx+1:]
    return module_spec, 'latest'


def _read_gomod_requires(projdir):
    """Parse go.mod and return [(module, version), ...] from require block."""
    gomod_path = os.path.join(projdir, 'go.mod')
    try:
        with open(gomod_path) as f:
            content = f.read()
    except OSError:
        return []
    mods = []
    in_require = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith('require ('):
            in_require = True
            continue
        if in_require:
            if stripped == ')':
                in_require = False
                continue
            parts = stripped.split()
            if len(parts) >= 2 and not parts[0].startswith('//'):
                mods.append((parts[0], parts[1]))
        elif stripped.startswith('require ') and '(' not in stripped:
            parts = stripped.split()
            if len(parts) >= 3:
                mods.append((parts[1], parts[2]))
    return mods


def _resolve_go_version():
    """Fetch the current stable Go version string, e.g. 'go1.24.2'."""
    with urllib.request.urlopen('https://go.dev/VERSION?m=text', timeout=15) as resp:
        content = resp.read().decode().strip()
        return content.split('\n')[0]  # e.g. "go1.24.2"


def _download_with_progress(url, dest_path):
    """Generator yielding SSE data lines while downloading url to dest_path."""
    req = urllib.request.Request(url, headers={'User-Agent': 'ximg-go-bundler/1.0'})
    with urllib.request.urlopen(req, timeout=300) as resp:
        total = int(resp.getheader('Content-Length', '0'))
        received = 0
        last_pct = -1
        with open(dest_path, 'wb') as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)
                received += len(chunk)
                if total:
                    pct = int(received / total * 100)
                    if pct >= last_pct + 10:
                        last_pct = pct - (pct % 10)
                        mb = received / 1048576
                        tot_mb = total / 1048576
                        yield f'data:   {mb:.1f} MB / {tot_mb:.0f} MB  ({pct}%)\n\n'


def _embed_go_toolchain(go_version, platform, toolchain_dir, tmpdir):
    """Generator: downloads and extracts the Go toolchain, yields SSE lines."""
    plat = GO_PLATFORMS[platform]
    filename = f'{go_version}.{platform}.{plat["ext"]}'
    url = f'https://go.dev/dl/{filename}'
    dl_path = os.path.join(tmpdir, filename)

    yield f'data: $ Downloading {filename} (~{plat["sizeMB"]} MB)...\n\n'
    yield from _download_with_progress(url, dl_path)
    yield 'data:   Download complete\n\n'

    os.makedirs(toolchain_dir, exist_ok=True)
    yield f'data: $ Extracting Go toolchain...\n\n'

    if plat['ext'] == 'tar.gz':
        result = subprocess.run(
            ['tar', 'xzf', dl_path, '-C', toolchain_dir],
            capture_output=True
        )
        if result.returncode != 0:
            raise RuntimeError(f'tar extraction failed: {result.stderr.decode()}')
    else:
        # Windows zip: extract using Python zipfile
        with zipfile.ZipFile(dl_path) as zf:
            zf.extractall(toolchain_dir)

    os.unlink(dl_path)
    go_bin = os.path.join(toolchain_dir, 'go', 'bin', 'go')
    if os.path.exists(go_bin):
        os.chmod(go_bin, 0o755)
    yield f'data:   Go {go_version} ready  \u2192  go-toolchain/bin/go\n\n'


HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Go Bundler — go-bundler.ximg.app</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0e1a;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;
         min-height:100vh;display:flex;flex-direction:column;align-items:center;
         padding:3rem 1rem 4rem}
    .hero{text-align:center;margin-bottom:1.8rem}
    .hero-icon{font-size:3rem;line-height:1;margin-bottom:.5rem}
    h1{font-size:1.9rem;font-weight:800;color:#f8fafc;letter-spacing:-.02em}
    .subtitle{color:#94a3b8;font-size:.9rem;margin-top:.4rem}

    .snav{display:flex;gap:.25rem;margin-bottom:1.6rem;
          background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.07);
          border-radius:10px;padding:.3rem}
    .snav-btn{flex:1;background:none;border:none;color:#64748b;font-size:.82rem;
              font-weight:600;padding:.5rem .75rem;border-radius:7px;cursor:pointer;
              transition:all .15s;letter-spacing:.01em;width:auto;margin-top:0;white-space:nowrap}
    .snav-btn.active{background:#1e293b;color:#f1f5f9;box-shadow:0 1px 4px rgba(0,0,0,.4)}
    .snav-btn:hover:not(.active){color:#cbd5e1}

    .card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.07);
          border-radius:14px;padding:2rem;width:100%;max-width:680px;backdrop-filter:blur(8px)}
    label{display:block;color:#94a3b8;font-size:.75rem;font-weight:700;
          letter-spacing:.07em;text-transform:uppercase;margin-bottom:.4rem;margin-top:1.3rem}
    label:first-of-type{margin-top:0}
    input[type=text]{width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);
          border-radius:7px;color:#e2e8f0;font-size:.95rem;padding:.6rem .85rem;
          outline:none;transition:border-color .15s}
    input[type=text]:focus{border-color:#00ADD8}
    select{width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);
           border-radius:7px;color:#e2e8f0;font-size:.95rem;padding:.6rem .85rem;
           outline:none;transition:border-color .15s;appearance:none;
           background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
           background-repeat:no-repeat;background-position:right .8rem center;padding-right:2rem}
    select:focus{border-color:#00ADD8}
    select option{background:#1e293b}
    .hint{color:#475569;font-size:.75rem;margin-top:.35rem;line-height:1.5}
    code{background:rgba(255,255,255,.07);border-radius:3px;padding:.1em .3em;font-size:.85em}

    .embed-row{display:flex;align-items:center;gap:.55rem;margin-top:1.3rem;
               background:rgba(0,173,216,.07);border:1px solid rgba(0,173,216,.18);
               border-radius:8px;padding:.65rem .85rem;cursor:pointer}
    .embed-row:hover{background:rgba(0,173,216,.12)}
    .embed-row input[type=checkbox]{width:15px;height:15px;accent-color:#00ADD8;
               cursor:pointer;flex-shrink:0;margin:0}
    .embed-label-text{color:#94a3b8;font-size:.82rem;font-weight:600;
                      letter-spacing:.01em;line-height:1.3}
    .embed-label-text small{display:block;color:#475569;font-size:.72rem;
                            font-weight:400;margin-top:.1rem}
    .embed-opts{margin-top:.5rem;border-top:1px solid rgba(255,255,255,.05);padding-top:.9rem}

    button{width:100%;margin-top:1.8rem;background:#00ADD8;color:#fff;border:none;
           border-radius:7px;font-size:1rem;font-weight:700;padding:.8rem;
           cursor:pointer;transition:background .15s,opacity .15s;letter-spacing:.01em}
    button:hover:not(:disabled){background:#0096bc}
    button:disabled{opacity:.55;cursor:not-allowed}

    #terminal{display:none;margin-top:1.4rem;border-radius:10px;overflow:hidden;
              border:1px solid rgba(255,255,255,.08)}
    .term-bar{background:#1e2433;padding:.45rem .75rem;display:flex;align-items:center;gap:.4rem}
    .dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
    .dot-r{background:#ef4444}.dot-y{background:#eab308}.dot-g{background:#22c55e}
    .term-title{flex:1;text-align:center;font-size:.72rem;color:#64748b;
                font-family:monospace;letter-spacing:.03em;margin-right:28px}
    #term-out{background:#0d1117;padding:.85rem 1rem;height:280px;overflow-y:auto;
              font-family:'Fira Code','Cascadia Code','Consolas',monospace;
              font-size:.78rem;line-height:1.55;color:#c9d1d9}
    #term-out .line-cmd{color:#79c0ff;font-weight:600}
    #term-out .line-ok {color:#3fb950}
    #term-out .line-err{color:#f85149}
    #term-out .line-dim{color:#6e7681}
    #term-out .cursor{display:inline-block;width:8px;height:1em;background:#c9d1d9;
                      vertical-align:text-bottom;animation:blink .9s step-end infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}

    #status{margin-top:1rem;padding:.75rem 1rem;border-radius:7px;font-size:.88rem;
            line-height:1.5;display:none;white-space:pre-wrap;word-break:break-word}
    #status.error{background:rgba(239,68,68,.12);color:#fca5a5;
                  border:1px solid rgba(239,68,68,.25);display:block}
    #status.ok{background:rgba(34,197,94,.12);color:#86efac;
               border:1px solid rgba(34,197,94,.25);display:block}

    #view-packages{display:none;width:100%;max-width:900px}
    .pkg-search-wrap{position:relative;margin-bottom:1.2rem}
    .pkg-search-wrap input{background:rgba(15,23,42,.8);border:1px solid rgba(255,255,255,.1);
                           border-radius:9px;color:#e2e8f0;font-size:.9rem;
                           padding:.65rem 1rem .65rem 2.4rem;outline:none;
                           transition:border-color .15s;width:100%}
    .pkg-search-wrap input:focus{border-color:#00ADD8}
    .pkg-search-icon{position:absolute;left:.75rem;top:50%;transform:translateY(-50%);
                     color:#475569;font-size:.9rem;pointer-events:none}
    .pkg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.75rem}
    .pkg-card{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.07);
              border-radius:11px;padding:1rem 1.1rem;display:flex;flex-direction:column;
              gap:.5rem;transition:border-color .15s,background .15s;cursor:default}
    .pkg-card:hover{border-color:rgba(0,173,216,.4);background:rgba(30,41,59,.8)}
    .pkg-card-top{display:flex;align-items:center;gap:.7rem}
    .pkg-logo{width:36px;height:36px;border-radius:8px;flex-shrink:0;object-fit:contain}
    .pkg-name{font-weight:700;font-size:.82rem;color:#f1f5f9;word-break:break-all}
    .pkg-cat{font-size:.65rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
             background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
             border-radius:4px;padding:.1em .45em;color:#94a3b8;margin-left:auto;
             white-space:nowrap;flex-shrink:0}
    .pkg-desc{font-size:.75rem;color:#64748b;line-height:1.45;flex:1}
    .pkg-bundle-btn{margin-top:.3rem;background:none;border:1px solid rgba(0,173,216,.25);
                    border-radius:6px;color:#67e8f9;font-size:.75rem;font-weight:600;
                    padding:.35rem .8rem;cursor:pointer;transition:all .15s;
                    text-align:center;width:100%}
    .pkg-bundle-btn:hover{background:rgba(0,173,216,.15);border-color:#67e8f9}
    .pkg-none{color:#475569;text-align:center;padding:3rem;font-size:.88rem;grid-column:1/-1}

    /* ── test runner ── */
    .test-list{display:flex;flex-direction:column;gap:.3rem;margin-bottom:1rem}
    .test-row{display:flex;align-items:center;gap:.6rem;padding:.35rem .5rem;border-radius:5px;background:rgba(15,23,42,.5)}
    .test-badge{font-size:.68rem;font-weight:700;letter-spacing:.05em;padding:.15rem .45rem;border-radius:3px;min-width:52px;text-align:center;text-transform:uppercase;font-family:'Courier New',monospace}
    .badge-wait{background:rgba(100,116,139,.15);color:#64748b}
    .badge-run{background:rgba(251,191,36,.15);color:#fbbf24;animation:tpulse .8s ease-in-out infinite}
    .badge-pass{background:rgba(34,197,94,.15);color:#4ade80}
    .badge-fail{background:rgba(239,68,68,.15);color:#f87171}
    .badge-skip{background:rgba(100,116,139,.10);color:#475569}
    @keyframes tpulse{0%,100%{opacity:1}50%{opacity:.5}}
    .test-name{font-size:.8rem;font-weight:600;color:#cbd5e1;font-family:'Courier New',monospace;white-space:nowrap}
    .test-desc{font-size:.72rem;color:#475569;flex:1}
    .test-note{font-size:.7rem;color:#64748b;font-family:'Courier New',monospace;margin-left:auto;white-space:nowrap}
    .pkg-snav{display:flex;gap:.25rem;margin-bottom:1rem;flex-wrap:wrap}
    .pkg-snav-btn{background:rgba(0,173,216,.12);border:1px solid rgba(0,173,216,.25);color:#67e8f9;font-size:.78rem;font-weight:600;padding:.3rem .75rem;border-radius:6px;cursor:pointer;transition:all .15s;white-space:nowrap;width:auto;margin-top:0}
    .pkg-snav-btn.active{background:rgba(0,173,216,.3);border-color:#00ADD8;color:#fff}
  </style>
</head>
<body>
  <div class="hero">
    <div class="hero-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <rect width="48" height="48" rx="10" fill="#00ADD8"/>
        <text x="24" y="34" font-size="26" font-weight="900" text-anchor="middle"
              fill="white" font-family="system-ui,sans-serif" letter-spacing="-1">Go</text>
      </svg>
    </div>
    <h1>Go Bundler</h1>
    <p class="subtitle">Bundle any Go module + dependencies for offline use</p>
  </div>

  <div class="snav">
    <button class="snav-btn active" id="nav-bundle"   onclick="setView('bundle')">Bundle</button>
    <button class="snav-btn"        id="nav-packages" onclick="setView('packages')">Top Packages</button>
    <button class="snav-btn"        id="nav-install"  onclick="setView('install')">How to Install</button>
    <button class="snav-btn"        id="nav-tests"    onclick="setView('tests')">Test Cases</button>
  </div>

  <div id="view-bundle">
    <div class="card">
      <label for="pkg">Module Path</label>
      <input type="text" id="pkg" placeholder="e.g. github.com/gin-gonic/gin"
             autocomplete="off" spellcheck="false">
      <p class="hint">Full Go module path. Version pinning supported: <code>github.com/gin-gonic/gin@v1.9.1</code>, <code>@latest</code></p>

      <div class="embed-row" onclick="document.getElementById('embed-go').click()">
        <input type="checkbox" id="embed-go" onclick="event.stopPropagation()" onchange="toggleEmbed()">
        <div class="embed-label-text">
          Embed Go toolchain
          <small>For hosts without Go installed &mdash; adds ~65&ndash;70 MB to the bundle</small>
        </div>
      </div>

      <div id="embed-opts" style="display:none" class="embed-opts">
        <label for="go-platform">Target Platform</label>
        <select id="go-platform">
          <option value="linux-amd64">Linux x86-64</option>
          <option value="linux-arm64">Linux ARM64</option>
          <option value="darwin-arm64">macOS ARM64 (Apple Silicon)</option>
          <option value="darwin-amd64">macOS x86-64 (Intel)</option>
          <option value="windows-amd64">Windows x64</option>
        </select>
      </div>

      <button id="btn" onclick="go_bundle()">Bundle &amp; Download</button>

      <div style="margin-top:.75rem;padding:.6rem .85rem;background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.2);border-radius:6px;font-size:.78rem;color:#94a3b8;display:flex;align-items:flex-start;gap:.5rem">
        <span style="color:#00ff88;flex-shrink:0">&#x1F6E1;</span>
        <span>Every bundle is scanned with <strong style="color:#00ff88">ClamAV</strong> before download. If malware or a virus signature is detected, the bundle is <strong style="color:#ff4444">blocked</strong> and never served. A <code>scan_results.txt</code> report is included in every zip.</span>
      </div>

      <div id="terminal">
        <div class="term-bar">
          <span class="dot dot-r"></span>
          <span class="dot dot-y"></span>
          <span class="dot dot-g"></span>
          <span class="term-title" id="term-title">go mod download</span>
        </div>
        <div id="term-out"></div>
      </div>

      <div id="status"></div>
    </div>
  </div>

  <div id="view-packages">
    <div class="pkg-search-wrap">
      <span class="pkg-search-icon">\u{1F50D}</span>
      <input type="text" id="pkg-search" placeholder="Filter packages\u2026"
             autocomplete="off" spellcheck="false" oninput="renderPkgs()">
    </div>
    <div class="pkg-grid" id="pkg-grid"></div>
  </div>

  <div id="view-install" style="display:none;width:100%;max-width:900px;margin:0 auto">
    <div class="card" style="max-width:none">
      <h2 style="font-size:1.1rem;font-weight:700;color:#f1f5f9;margin-bottom:1.4rem">After Downloading the Zip</h2>
      <ol style="list-style:none;padding:0;display:flex;flex-direction:column;gap:1.1rem">
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#00ADD8;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">1</span>
          <div><strong style="color:#f1f5f9">Locate the file</strong><br><span style="color:#94a3b8;font-size:.85rem">Open your Downloads folder and find the <code>.zip</code> file.</span></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#00ADD8;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">2</span>
          <div><strong style="color:#f1f5f9">Extract it</strong><br><span style="color:#94a3b8;font-size:.85rem">Double-click the zip to extract, or run:</span><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">unzip &lt;filename&gt;.zip</code></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#00ADD8;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">3</span>
          <div><strong style="color:#f1f5f9">Open a terminal in the folder</strong><br><span style="color:#94a3b8;font-size:.85rem">Right-click the extracted folder and choose "Open Terminal here", or run:</span><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">cd &lt;extracted-folder-name&gt;</code></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#00ADD8;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">4</span>
          <div><strong style="color:#f1f5f9">Run the setup script</strong><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">./setup.sh</code><span style="color:#94a3b8;font-size:.85rem;display:block;margin-top:.2rem">Windows: <code>setup.bat</code></span><span style="color:#94a3b8;font-size:.85rem;display:block;margin-top:.4rem">This configures your Go module cache for offline use. Then build your project normally with <code>go build ./...</code></span></div>
        </li>
      </ol>
    </div>
  </div>

  <div id="view-tests" style="display:none;width:100%;max-width:780px">
    <div class="card" style="max-width:none">
      <div class="pkg-snav">
        <button class="pkg-snav-btn active"
                data-pkg="github.com/google/go-containerregistry/cmd/crane"
                onclick="selectTestPkg('github.com/google/go-containerregistry/cmd/crane')">crane</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <span style="font-weight:700;font-size:.95rem;color:#f1f5f9">Test Suite</span>
        <button id="run-btn" onclick="runTests()"
                style="width:auto;margin:0;padding:.35rem 1.1rem;font-size:.8rem">&#9654; Run</button>
      </div>
      <div class="test-list" id="test-list"></div>
      <div style="display:flex;gap:1rem;margin-top:.75rem">
        <div style="flex:1">
          <div style="font-size:.7rem;color:#475569;font-weight:600;letter-spacing:.07em;text-transform:uppercase;margin-bottom:.3rem">Bundle Log</div>
          <div class="term-bar" style="border-radius:6px 6px 0 0">
            <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
            <span class="term-title">go mod download</span>
          </div>
          <div id="tbundle-out" style="background:#0d1117;border-radius:0 0 6px 6px;padding:.65rem .75rem;height:200px;overflow-y:auto;font-family:'Fira Code','Cascadia Code','Consolas',monospace;font-size:.72rem;line-height:1.5;color:#c9d1d9;border:1px solid rgba(255,255,255,.06);border-top:none"></div>
        </div>
        <div style="flex:1">
          <div style="font-size:.7rem;color:#475569;font-weight:600;letter-spacing:.07em;text-transform:uppercase;margin-bottom:.3rem">Build Log</div>
          <div class="term-bar" style="border-radius:6px 6px 0 0">
            <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
            <span class="term-title">go build</span>
          </div>
          <div id="tbuild-out" style="background:#0d1117;border-radius:0 0 6px 6px;padding:.65rem .75rem;height:200px;overflow-y:auto;font-family:'Fira Code','Cascadia Code','Consolas',monospace;font-size:.72rem;line-height:1.5;color:#c9d1d9;border:1px solid rgba(255,255,255,.06);border-top:none"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function setView(v) {
      document.getElementById('view-bundle').style.display   = v === 'bundle'   ? 'block' : 'none';
      document.getElementById('view-packages').style.display = v === 'packages' ? 'block' : 'none';
      document.getElementById('view-install').style.display  = v === 'install'  ? 'block' : 'none';
      document.getElementById('view-tests').style.display    = v === 'tests'    ? 'block' : 'none';
      document.getElementById('nav-bundle').classList.toggle('active',   v === 'bundle');
      document.getElementById('nav-packages').classList.toggle('active', v === 'packages');
      document.getElementById('nav-install').classList.toggle('active',  v === 'install');
      document.getElementById('nav-tests').classList.toggle('active',    v === 'tests');
      if (v === 'packages') renderPkgs();
      if (v === 'tests') initTestList();
    }

    function toggleEmbed() {
      const show = document.getElementById('embed-go').checked;
      document.getElementById('embed-opts').style.display = show ? 'block' : 'none';
    }

    const PKGS = PACKAGES_JSON;

    function renderPkgs() {
      const q      = (document.getElementById('pkg-search').value || '').toLowerCase();
      const grid   = document.getElementById('pkg-grid');
      const filtered = q
        ? PKGS.filter(p => p.name.toLowerCase().includes(q) ||
                           p.cat.toLowerCase().includes(q)  ||
                           p.desc.toLowerCase().includes(q) ||
                           p.label.toLowerCase().includes(q))
        : PKGS;
      if (!filtered.length) {
        grid.innerHTML = '<div class="pkg-none">No packages match your search.</div>';
        return;
      }
      grid.innerHTML = filtered.map(p => `
        <div class="pkg-card">
          <div class="pkg-card-top">
            <img class="pkg-logo" src="/logo/${encodeURIComponent(p.name)}.svg" alt="${p.label}"
                 onerror="this.style.display='none'">
            <span class="pkg-name">${p.label}</span>
            <span class="pkg-cat">${p.cat}</span>
          </div>
          <div class="pkg-desc">${p.desc}</div>
          <button class="pkg-bundle-btn" data-pkg="${p.name}" onclick="pickPkg(this.dataset.pkg)">Bundle \u2192</button>
        </div>`).join('');
    }

    function pickPkg(name) {
      document.getElementById('pkg').value = name;
      setView('bundle');
      document.getElementById('pkg').focus();
    }

    const termEl  = document.getElementById('terminal');
    const outEl   = document.getElementById('term-out');
    const titleEl = document.getElementById('term-title');
    let   cursorEl = null;

    function termShow(mod) {
      titleEl.textContent = 'go mod download ' + mod;
      termEl.style.display = 'block';
      outEl.innerHTML = '';
      cursorEl = document.createElement('span');
      cursorEl.className = 'cursor';
      outEl.appendChild(cursorEl);
    }
    function termLine(text, cls) {
      if (cursorEl) outEl.removeChild(cursorEl);
      const d = document.createElement('div');
      d.className = cls || '';
      d.textContent = text;
      outEl.appendChild(d);
      if (cursorEl) outEl.appendChild(cursorEl);
      outEl.scrollTop = outEl.scrollHeight;
    }
    function termDone() {
      if (cursorEl) { outEl.removeChild(cursorEl); cursorEl = null; }
    }
    function lineClass(text) {
      if (text.startsWith('$'))                                           return 'line-cmd';
      if (/^(go: downloading|go: using|\u2713|  Go |  Found)/i.test(text)) return 'line-ok';
      if (/error|FAIL/i.test(text))                                       return 'line-err';
      if (/^(go:|  [\d.]+\sMB|  Download)/i.test(text))                  return 'line-dim';
      return '';
    }

    async function go_bundle() {
      const pkg  = document.getElementById('pkg').value.trim();
      const btn  = document.getElementById('btn');
      if (!pkg) { show('error', 'Enter a module path.'); return; }

      const embedGo = document.getElementById('embed-go').checked;
      const params  = new URLSearchParams({ module: pkg });
      if (embedGo) {
        params.set('embed_go',      'true');
        params.set('go_platform',   document.getElementById('go-platform').value);
      }

      btn.disabled = true;
      btn.textContent = 'Bundling\u2026';
      hideStatus();
      termShow(pkg);

      try {
        const resp = await fetch('/bundle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        if (!resp.ok) {
          const j = await resp.json().catch(() => ({ error: resp.statusText }));
          termDone();
          show('error', j.error || 'Bundle failed.');
          return;
        }

        const reader  = resp.body.getReader();
        const decoder = new TextDecoder();
        let   buf = '', token = null, errMsg = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split('\n\n');
          buf = events.pop();
          for (const raw of events) {
            let evtType = 'message', evtData = '';
            for (const line of raw.split('\n')) {
              if (line.startsWith('event: '))     evtType = line.slice(7).trim();
              else if (line.startsWith('data: ')) evtData = line.slice(6);
            }
            if (evtType === 'done')       token  = evtData;
            else if (evtType === 'error') errMsg = evtData;
            else if (evtData !== '')      termLine(evtData, lineClass(evtData));
          }
        }

        termDone();
        if (errMsg) { show('error', errMsg); return; }
        if (token) {
          window.location.href = '/download/' + token;
          const msg = embedGo
            ? '\u2713 Download started \u2014 check your downloads folder.\n\nThe zip includes the Go toolchain + module cache.\nRun setup.sh, then use go-toolchain/bin/go to build offline.'
            : '\u2713 Download started \u2014 check your downloads folder.\n\nThe zip contains the Go module cache.\nRun setup.sh for offline build instructions.';
          show('ok', msg);
        }
      } catch (e) {
        termDone();
        show('error', 'Network error: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Bundle & Download';
      }
    }

    function show(cls, msg) {
      const el = document.getElementById('status');
      el.className = cls;
      el.textContent = msg;
    }
    function hideStatus() {
      const el = document.getElementById('status');
      el.className = '';
      el.style.display = 'none';
    }

    document.getElementById('pkg').addEventListener('keydown', e => {
      if (e.key === 'Enter') go_bundle();
    });

    // ── Test runner ──────────────────────────────────────────────
    var TEST_DEFS = [
      {id:'T01', name:'T01', desc:'POST /bundle returns 200 stream'},
      {id:'T02', name:'T02', desc:'SSE stream ends with done event and token'},
      {id:'T03', name:'T03', desc:'GET /bundle-meta/:token returns 200'},
      {id:'T04', name:'T04', desc:'Zip opens without error'},
      {id:'T05', name:'T05', desc:'Root dir matches ximg-go-bundle-* pattern'},
      {id:'T06', name:'T06', desc:'setup.sh is a zip member'},
      {id:'T07', name:'T07', desc:'go.mod is a zip member'},
      {id:'T08', name:'T08', desc:'pkg/mod/cache/download/ present in zip'},
      {id:'T09', name:'T09', desc:'go-containerregistry present in module cache'},
      {id:'T10', name:'T10', desc:'go-containerregistry .zip archives in cache'},
      {id:'T11', name:'T11', desc:'unzip extracts successfully'},
      {id:'T12', name:'T12', desc:'setup.sh has +x permission in zip'},
      {id:'T13', name:'T13', desc:'setup.sh exports GOPROXY to bundle cache'},
      {id:'T14', name:'T14', desc:'go build -o crane cmd/crane exits 0 offline'},
      {id:'T15', name:'T15', desc:'crane binary exists after build'},
      {id:'T16', name:'T16', desc:'crane version exits 0'},
      {id:'T17', name:'T17', desc:'crane version output matches vN.N.N semver'},
      {id:'T18', name:'T18', desc:'crane --help exits 0 or prints help text'},
    ];

    var _testPkg = 'github.com/google/go-containerregistry/cmd/crane';
    var _testsRunning = false;

    function selectTestPkg(pkg) {
      _testPkg = pkg;
      document.querySelectorAll('.pkg-snav-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.pkg === pkg);
      });
      initTestList();
    }

    function setTestStatus(id, status, note) {
      var row = document.getElementById('trow-' + id);
      if (!row) return;
      var badge = row.querySelector('.test-badge');
      var noteEl = row.querySelector('.test-note');
      badge.className = 'test-badge badge-' + status;
      var labels = {wait:'WAIT', run:'RUN ', pass:'PASS', fail:'FAIL', skip:'SKIP'};
      badge.textContent = labels[status] || status.toUpperCase();
      if (noteEl) noteEl.textContent = note || '';
    }

    function initTestList() {
      var list = document.getElementById('test-list');
      if (!list) return;
      list.innerHTML = TEST_DEFS.map(function(t) {
        return '<div class="test-row" id="trow-' + t.id + '">' +
               '<span class="test-badge badge-wait">WAIT</span>' +
               '<span class="test-name">' + t.id + '</span>' +
               '<span class="test-desc">' + t.desc + '</span>' +
               '<span class="test-note"></span>' +
               '</div>';
      }).join('');
    }

    function termAppendTest(elId, text) {
      var el = document.getElementById(elId);
      if (!el) return;
      var d = document.createElement('div');
      d.textContent = text;
      el.appendChild(d);
      el.scrollTop = el.scrollHeight;
    }

    async function runTests() {
      if (_testsRunning) return;
      _testsRunning = true;
      var btn = document.getElementById('run-btn');
      btn.disabled = true;
      btn.textContent = 'Running\u2026';
      document.getElementById('tbundle-out').innerHTML = '';
      document.getElementById('tbuild-out').innerHTML = '';
      TEST_DEFS.forEach(function(t) { setTestStatus(t.id, 'wait', ''); });

      var stopped = false;
      function abort(fromId, reason) {
        var all = TEST_DEFS.map(function(t) { return t.id; });
        var idx = all.indexOf(fromId);
        if (idx >= 0) all.slice(idx).forEach(function(id) { setTestStatus(id, 'skip', reason || 'skipped'); });
        stopped = true;
      }

      try {
        // T01: Bundle endpoint reachable
        setTestStatus('T01', 'run');
        var bundleResp = await fetch('/bundle', {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: 'module=' + encodeURIComponent(_testPkg)
        });
        if (!bundleResp.ok) {
          setTestStatus('T01', 'fail', 'HTTP ' + bundleResp.status);
          abort('T02');
          return;
        }
        setTestStatus('T01', 'pass', 'HTTP 200');

        // T02: Bundle completes with token
        setTestStatus('T02', 'run');
        var reader = bundleResp.body.getReader();
        var dec = new TextDecoder();
        var buf = '', token = null, errMsg = null;
        while (true) {
          var ch = await reader.read();
          if (ch.done) break;
          buf += dec.decode(ch.value, {stream: true});
          var evts = buf.split('\n\n');
          buf = evts.pop();
          for (var i = 0; i < evts.length; i++) {
            var raw = evts[i], et = 'message', ed = '';
            evts[i].split('\n').forEach(function(ln) {
              if (ln.startsWith('event: ')) et = ln.slice(7).trim();
              else if (ln.startsWith('data: ')) ed = ln.slice(6);
            });
            if (et === 'done') token = ed;
            else if (et === 'error') errMsg = ed;
            else if (ed) termAppendTest('tbundle-out', ed);
          }
        }
        if (!token || errMsg) {
          setTestStatus('T02', 'fail', errMsg || 'no token');
          abort('T03');
          return;
        }
        setTestStatus('T02', 'pass', token.slice(0, 8) + '\u2026');

        // T03: Bundle meta peek
        if (!stopped) {
          setTestStatus('T03', 'run');
          var metaResp = await fetch('/bundle-meta/' + token);
          if (!metaResp.ok) {
            setTestStatus('T03', 'fail', 'HTTP ' + metaResp.status);
            abort('T04');
            return;
          }
          var meta = await metaResp.json();
          setTestStatus('T03', 'pass', (meta.name || 'ok').slice(0, 32));
        }

        // T04-T18: server-side streaming
        if (!stopped) {
          var testResp = await fetch('/test-run', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: 'token=' + encodeURIComponent(token)
          });
          if (!testResp.ok) {
            abort('T04', 'test-run server error');
            return;
          }
          var r2 = testResp.body.getReader();
          var dec2 = new TextDecoder();
          var buf2 = '';
          while (true) {
            var ch2 = await r2.read();
            if (ch2.done) break;
            buf2 += dec2.decode(ch2.value, {stream: true});
            var evts2 = buf2.split('\n\n');
            buf2 = evts2.pop();
            for (var k = 0; k < evts2.length; k++) {
              var et2 = 'message', ed2 = '';
              evts2[k].split('\n').forEach(function(ln) {
                if (ln.startsWith('event: ')) et2 = ln.slice(7).trim();
                else if (ln.startsWith('data: ')) ed2 = ln.slice(6);
              });
              if (et2 === 'step') {
                try { var d = JSON.parse(ed2); setTestStatus(d.id, d.status, d.note || ''); } catch(e) {}
              } else if (et2 === 'build') {
                termAppendTest('tbuild-out', ed2);
              } else if (et2 === 'log') {
                termAppendTest('tbundle-out', ed2);
              }
            }
          }
        }
      } catch(e) {
        abort('T01', 'error: ' + e.message);
      } finally {
        _testsRunning = false;
        btn.disabled = false;
        btn.textContent = '\u25b6 Run';
      }
    }
  </script>
  <script src="/shared/nav.js?v=2"></script>
</body>
</html>
"""


@app.route('/favicon.svg')
def favicon():
    return Response(FAVICON_SVG, mimetype='image/svg+xml')


@app.route('/logo/<path:name>.svg')
def logo(name):
    pkg = next((p for p in PACKAGES if p['name'].lower() == name.lower()), None)
    if not pkg:
        pkg = {'label': name[:2], 'color': '#334155'}
    return Response(_logo_svg(pkg), mimetype='image/svg+xml',
                    headers={'Cache-Control': 'public, max-age=86400'})


@app.route('/')
def index():
    pkgs_json = _json.dumps([
        {'name': p['name'], 'label': p['label'], 'cat': p['cat'],
         'color': p['color'], 'desc': p['desc']}
        for p in PACKAGES
    ])
    return HTML.replace('PACKAGES_JSON', pkgs_json)


@app.route('/bundle-meta/<token>')
def bundle_meta(token):
    with _bundles_lock:
        info = _bundles.get(token)
    if not info:
        return jsonify({'error': 'not found'}), 404
    return jsonify({'name': info.get('name', ''), 'package': info.get('package', '')})


@app.route('/test-run', methods=['POST'])
def test_run():
    token = request.form.get('token', '').strip()
    with _bundles_lock:
        info = _bundles.get(token)
    if not info or not os.path.exists(info.get('path', '')):
        return jsonify({'error': 'Bundle not found or expired'}), 404
    zip_path = info['path']

    @stream_with_context
    def generate():
        def step(tid, status, note=''):
            return f'event: step\ndata: {_json.dumps({"id": tid, "status": status, "note": note})}\n\n'
        def blog(msg):
            return f'event: build\ndata: {msg}\n\n'

        all_ids = ['T04','T05','T06','T07','T08','T09','T10','T11','T12','T13','T14','T15','T16','T17','T18']

        def skip_from(from_id, reason='skipped — prior step failed'):
            idx = all_ids.index(from_id) if from_id in all_ids else 0
            for tid in all_ids[idx:]:
                yield step(tid, 'skip', reason)

        tmpdir = tempfile.mkdtemp(prefix='go-testrun-')
        try:
            # T04: zip readable
            yield step('T04', 'run')
            try:
                with zipfile.ZipFile(zip_path) as zf:
                    names = zf.namelist()
            except Exception as e:
                yield step('T04', 'fail', str(e)[:60])
                yield from skip_from('T05')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T04', 'pass', f'{len(names)} entries')

            # T05: correct top-level dir
            yield step('T05', 'run')
            bundle_root = names[0].split('/')[0] if names else ''
            if not bundle_root.startswith('ximg-go-bundle-'):
                yield step('T05', 'fail', f'unexpected root: {bundle_root[:40]}')
                yield from skip_from('T06')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T05', 'pass', bundle_root[:50])

            # T06: setup.sh present
            yield step('T06', 'run')
            setup_sh_arc = f'{bundle_root}/setup.sh'
            if setup_sh_arc not in names:
                yield step('T06', 'fail', 'setup.sh missing from zip')
                yield from skip_from('T07')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T06', 'pass', 'found')

            # T07: go.mod present
            yield step('T07', 'run')
            if f'{bundle_root}/go.mod' not in names:
                yield step('T07', 'fail', 'go.mod missing from zip')
                yield from skip_from('T08')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T07', 'pass', 'found')

            # T08: module cache dir
            yield step('T08', 'run')
            cache_prefix = f'{bundle_root}/pkg/mod/cache/download/'
            cache_entries = [n for n in names if n.startswith(cache_prefix)]
            if not cache_entries:
                yield step('T08', 'fail', 'pkg/mod/cache/download/ not found')
                yield from skip_from('T09')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T08', 'pass', f'{len(cache_entries)} files')

            # T09: go-containerregistry in cache
            yield step('T09', 'run')
            gcr_entries = [n for n in cache_entries if 'go-containerregistry' in n]
            if not gcr_entries:
                yield step('T09', 'fail', 'go-containerregistry not in cache')
                yield from skip_from('T10')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T09', 'pass', f'{len(gcr_entries)} entries')

            # T10: go-containerregistry zip archives
            yield step('T10', 'run')
            gcr_zips = [n for n in gcr_entries if n.endswith('.zip')]
            if not gcr_zips:
                yield step('T10', 'fail', 'no .zip archives for go-containerregistry')
                yield from skip_from('T11')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T10', 'pass', f'{len(gcr_zips)} archive(s)')

            # T11: extract zip
            yield step('T11', 'run')
            extract_dir = os.path.join(tmpdir, 'extracted')
            os.makedirs(extract_dir, exist_ok=True)
            r = subprocess.run(['unzip', '-q', zip_path, '-d', extract_dir],
                               capture_output=True, text=True)
            if r.returncode != 0:
                yield step('T11', 'fail', (r.stderr or r.stdout).strip()[:60])
                yield from skip_from('T12')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T11', 'pass', 'ok')

            bundle_dir = os.path.join(extract_dir, bundle_root)

            # T12: setup.sh is executable
            yield step('T12', 'run')
            with zipfile.ZipFile(zip_path) as zf:
                zi = zf.getinfo(setup_sh_arc)
                mode = (zi.external_attr >> 16) & 0o777
            if mode & 0o111:
                yield step('T12', 'pass', oct(mode))
            else:
                yield step('T12', 'fail', f'mode {oct(mode)} not executable')

            # T13: GOPROXY in setup.sh
            yield step('T13', 'run')
            setup_content = open(os.path.join(bundle_dir, 'setup.sh')).read()
            if 'GOPROXY' in setup_content and 'pkg/mod/cache/download' in setup_content:
                yield step('T13', 'pass', 'GOPROXY set to bundle cache')
            else:
                yield step('T13', 'fail', 'GOPROXY missing or wrong')

            # T14: go build crane from bundle cache
            yield step('T14', 'run')
            crane_bin = os.path.join(tmpdir, 'crane')
            build_env = {**os.environ,
                         'GOMODCACHE': os.path.join(bundle_dir, 'pkg', 'mod'),
                         'GOPROXY': f'file://{bundle_dir}/pkg/mod/cache/download,off',
                         'GONOSUMDB': '*',
                         'GOFLAGS': '',
                         'GOCACHE': os.path.join(tmpdir, 'gocache'),
                         'HOME': tmpdir}
            yield blog('$ go build -o crane github.com/google/go-containerregistry/cmd/crane')
            yield blog(f'  GOPROXY=file://{bundle_dir}/pkg/mod/cache/download,off')
            try:
                r = subprocess.run(
                    ['go', 'build', '-o', crane_bin,
                     'github.com/google/go-containerregistry/cmd/crane'],
                    capture_output=True, text=True, env=build_env,
                    cwd=bundle_dir, timeout=180)
            except subprocess.TimeoutExpired:
                yield step('T14', 'fail', 'build timed out (180s)')
                yield from skip_from('T15')
                yield 'event: done\ndata: ok\n\n'
                return
            if r.stderr:
                for ln in r.stderr.strip().splitlines()[:15]:
                    yield blog(f'  {ln}')
            if r.returncode != 0:
                yield step('T14', 'fail', f'exit {r.returncode} — see build log')
                yield from skip_from('T15')
                yield 'event: done\ndata: ok\n\n'
                return
            yield blog('  Build successful')
            yield step('T14', 'pass', 'exit 0')

            # T15: crane binary exists
            yield step('T15', 'run')
            if os.path.exists(crane_bin) and os.path.getsize(crane_bin) > 0:
                size_mb = os.path.getsize(crane_bin) / 1_048_576
                yield step('T15', 'pass', f'{size_mb:.1f} MB')
            else:
                yield step('T15', 'fail', 'binary missing')
                yield from skip_from('T16')
                yield 'event: done\ndata: ok\n\n'
                return

            # T16: crane version runs
            yield step('T16', 'run')
            r = subprocess.run([crane_bin, 'version'],
                               capture_output=True, text=True, timeout=10)
            ver_out = (r.stdout + r.stderr).strip()
            yield blog('$ crane version')
            yield blog(f'  {ver_out}')
            if r.returncode != 0:
                yield step('T16', 'fail', f'exit {r.returncode}')
                yield from skip_from('T17')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T16', 'pass', f'exit 0')

            # T17: version is semver
            yield step('T17', 'run')
            semver_m = re.search(r'v?\d+\.\d+\.\d+', ver_out)
            if semver_m:
                yield step('T17', 'pass', semver_m.group(0))
            else:
                yield step('T17', 'fail', f'no semver in: {ver_out[:40]}')

            # T18: crane --help runs
            yield step('T18', 'run')
            r = subprocess.run([crane_bin, '--help'],
                               capture_output=True, text=True, timeout=10)
            help_out = (r.stdout + r.stderr).strip()
            yield blog('$ crane --help')
            for ln in help_out.splitlines()[:6]:
                yield blog(f'  {ln}')
            if r.returncode == 0 or len(help_out) > 20:
                yield step('T18', 'pass', f'exit {r.returncode}')
            else:
                yield step('T18', 'fail', f'no output, exit {r.returncode}')

        except Exception as e:
            import traceback
            yield blog(f'ERROR: {traceback.format_exc()[:200]}')
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

        yield 'event: done\ndata: ok\n\n'

    return Response(generate(), mimetype='text/event-stream',
                    headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache'})


@app.route('/bundle', methods=['POST'])
def bundle():
    module     = request.form.get('module', '').strip()
    embed_go   = request.form.get('embed_go', '') == 'true'
    go_platform = request.form.get('go_platform', 'linux-amd64').strip()

    if not module or not MODULE_RE.match(module):
        return jsonify({'error': 'Invalid module path.'}), 400
    if embed_go and go_platform not in GO_PLATFORMS:
        return jsonify({'error': 'Invalid platform.'}), 400

    client_ip = request.headers.get('X-Real-IP') or request.remote_addr or ''
    mod_base, mod_ver = _split_module_version(module)
    pkg_spec = f'{mod_base}@{mod_ver}'

    @stream_with_context
    def generate():
        tmpdir  = tempfile.mkdtemp(prefix='go-bundler-')
        projdir = os.path.join(tmpdir, 'project')
        gopath  = os.path.join(tmpdir, 'gopath')
        gomodcache = os.path.join(gopath, 'pkg', 'mod')
        os.makedirs(projdir)
        os.makedirs(gomodcache, exist_ok=True)

        env = os.environ.copy()
        env['GOPATH']     = gopath
        env['GOMODCACHE'] = gomodcache
        env['GOPROXY']    = 'https://proxy.golang.org,direct'
        env['GONOSUMDB']  = '*'
        env['GOFLAGS']    = ''
        env['HOME']       = tmpdir

        try:
            # ── Step 1: go mod init ──────────────────────────────
            yield 'data: $ go mod init ximg-offline-bundle\n\n'
            r = subprocess.run(
                ['go', 'mod', 'init', 'ximg-offline-bundle'],
                cwd=projdir, env=env, capture_output=True, text=True
            )
            if r.returncode != 0:
                yield f'event: error\ndata: go mod init failed: {r.stderr.strip()}\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            # ── Step 2: go get module ────────────────────────────
            yield f'data: $ go get -v {pkg_spec}\n\n'
            proc = subprocess.Popen(
                ['go', 'get', '-v', pkg_spec],
                cwd=projdir, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1
            )
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    yield f'data: {line}\n\n'
            proc.wait()
            if proc.returncode != 0:
                yield 'data: \n\n'
                yield 'event: error\ndata: go get failed — check the module path and try again\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            # ── Step 3: go mod download all ──────────────────────
            yield 'data: \n\n'
            yield 'data: $ go mod download -modcacherw all\n\n'
            proc = subprocess.Popen(
                ['go', 'mod', 'download', '-modcacherw', 'all'],
                cwd=projdir, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1
            )
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    yield f'data: {line}\n\n'
            proc.wait()
            if proc.returncode != 0:
                yield 'data: \n\n'
                yield 'event: error\ndata: go mod download failed — see terminal output above\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            # Count downloaded modules
            requires = _read_gomod_requires(projdir)
            n_mods = len(requires)
            main_ver = next((v for m, v in requires if m == mod_base), mod_ver)
            if main_ver == 'latest':
                # Try to get actual version from go.sum or cache
                main_ver = mod_ver

            yield 'data: \n\n'
            yield f'data: Downloaded {n_mods} module(s).\n\n'

            # ── ClamAV scan ── scan .zip archives in the module cache
            yield 'data: 🛡 Scanning with ClamAV...\n\n'
            _dl_cache = os.path.join(gomodcache, 'cache', 'download')
            _go_zips = []
            for _root, _dirs, _fnames in os.walk(_dl_cache):
                _dirs.sort()
                for _fname in sorted(_fnames):
                    if _fname.endswith('.zip'):
                        _go_zips.append(os.path.join(_root, _fname))
            _scan_results = []
            _clam_ok = True
            for _fpath in _go_zips:
                _label = os.path.relpath(_fpath, _dl_cache)
                _res = _clam_scan_file(_fpath)
                _scan_results.append((_label, _res))
                if _res is None:
                    yield f'data:   ⚠ {_label} — ClamAV unavailable, skipping\n\n'
                    _clam_ok = False
                elif _res == 'CLEAN':
                    yield f'data:   ✓ {_label}\n\n'
                else:
                    yield f'data:   ✗ {_label} — INFECTED: {_res}\n\n'
            _infected = [(_f, _r) for _f, _r in _scan_results if _r is not None and _r != 'CLEAN']
            if _infected:
                yield 'data: \n\n'
                for _fn, _vn in _infected:
                    yield f'data: ✗ BLOCKED: {_fn} — {_vn}\n\n'
                yield 'event: error\ndata: Bundle blocked — malware detected in downloaded modules\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return
            if _clam_ok:
                yield f'data: ✓ All {len(_scan_results)} module archive(s) clean\n\n'
            _scan_ts = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            _scan_report = 'ClamAV Scan Report\nGenerated: ' + _scan_ts + '\n\n' + (
                '\n'.join(f'{_f}: {_r or "SKIPPED (unavailable)"}' for _f, _r in _scan_results)
                if _scan_results else 'Scan skipped — ClamAV unavailable'
            ) + '\n'

            # ── Step 4: Optionally embed Go toolchain ─────────────
            toolchain_dir = None
            go_version    = None

            if embed_go:
                yield 'data: \n\n'
                yield f'data: $ Resolving latest Go version...\n\n'
                try:
                    go_version = _resolve_go_version()
                except Exception as e:
                    yield f'event: error\ndata: Could not resolve Go version: {e}\n\n'
                    shutil.rmtree(tmpdir, ignore_errors=True)
                    return
                yield f'data:   Found: {go_version}\n\n'

                toolchain_dir = os.path.join(tmpdir, 'toolchain')
                try:
                    yield from _embed_go_toolchain(go_version, go_platform, toolchain_dir, tmpdir)
                except Exception as e:
                    yield f'event: error\ndata: Toolchain download failed: {e}\n\n'
                    shutil.rmtree(tmpdir, ignore_errors=True)
                    return

            # ── Step 5: Generate scripts + README ─────────────────
            yield 'data: \n\n'
            yield 'data: Creating bundle zip...\n\n'

            generated = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            divider   = '\u2500' * 56
            col_w     = max((len(m) for m, _ in requires), default=10) + 2
            sbom_lines = '\n'.join(
                f'  {m:<{col_w}} {v}' for m, v in sorted(requires)
            )
            plat_label = GO_PLATFORMS[go_platform]['label'] if embed_go else None

            readme = '\n'.join([
                '\u2550' * 56,
                '  XIMG GO BUNDLE \u2014 SOFTWARE BILL OF MATERIALS',
                '\u2550' * 56,
                f'Generated:    {generated}',
                f'Source:       https://go-bundler.ximg.app',
                f'Module:       {mod_base} {main_ver}',
                f'Components:   {n_mods}',
                *(([f'Go toolchain: {go_version} ({go_platform})']) if embed_go else []),
                divider,
                'COMPONENTS',
                divider,
                sbom_lines,
                divider,
                '',
                'USAGE',
                divider,
                '  This bundle contains a Go module cache for offline builds.',
                '',
                *([
                    f'  Go {go_version} is bundled in go-toolchain/.',
                    '',
                    '  Linux / macOS:',
                    '    source setup.sh   # exports GOMODCACHE, GOPROXY, GONOSUMDB',
                    f'    ./go-toolchain/bin/go build ./...',
                    '',
                    '  Windows (PowerShell):',
                    '    . .\\setup.ps1',
                    f'    .\\go-toolchain\\bin\\go.exe build ./...',
                ] if embed_go else [
                    '  Linux / macOS:',
                    '    source setup.sh   # exports GOMODCACHE, GOPROXY, GONOSUMDB',
                    '    go build ./...',
                    '',
                    '  Windows (PowerShell):',
                    '    . .\\setup.ps1',
                    '    go build ./...',
                ]),
                '\u2550' * 56,
            ])

            bundle_name = f'ximg-go-bundle-{re.sub(r"[^A-Za-z0-9._-]", "_", mod_base)}-{re.sub(r"[^A-Za-z0-9._-]", "_", main_ver)}'
            if embed_go:
                bundle_name += f'-go-{go_platform}'

            setup_sh_lines = [
                '#!/bin/bash',
                f'# Offline Go module bundle: {mod_base} {main_ver} ({n_mods} modules)',
                f'# Source: https://go-bundler.ximg.app',
                'BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
                'export GOMODCACHE="$BUNDLE_DIR/pkg/mod"',
                'export GOPROXY="file://$BUNDLE_DIR/pkg/mod/cache/download,off"',
                'export GONOSUMDB="*"',
            ]
            if embed_go:
                setup_sh_lines += [
                    'export PATH="$BUNDLE_DIR/go-toolchain/bin:$PATH"',
                    'chmod +x "$BUNDLE_DIR/go-toolchain/bin/go" 2>/dev/null || true',
                    'echo "==> Go toolchain: $(go version)"',
                ]
            setup_sh_lines += [
                'echo "==> GOMODCACHE=$GOMODCACHE"',
                'echo "==> GOPROXY=$GOPROXY"',
                'echo ""',
                f'echo "\u2713 Bundle ready \u2014 run: go build ./..."',
            ]
            setup_sh = '\n'.join(setup_sh_lines) + '\n'

            setup_ps1_lines = [
                f'# Offline Go module bundle: {mod_base} {main_ver} ({n_mods} modules)',
                f'# Source: https://go-bundler.ximg.app',
                '$BundleDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
                '$env:GOMODCACHE = "$BundleDir\\pkg\\mod"',
                '$env:GOPROXY   = "file:///$($BundleDir -replace "\\\\","/")/pkg/mod/cache/download,off"',
                '$env:GONOSUMDB  = "*"',
            ]
            if embed_go:
                setup_ps1_lines += [
                    '$env:PATH = "$BundleDir\\go-toolchain\\bin;$env:PATH"',
                    'Write-Host "==> Go toolchain: $(go version)"',
                ]
            setup_ps1_lines += [
                'Write-Host "==> GOMODCACHE=$env:GOMODCACHE"',
                'Write-Host ""',
                f'Write-Host "\u2713 Bundle ready \u2014 run: go build ./..."',
            ]
            setup_ps1 = '\n'.join(setup_ps1_lines) + '\n'

            zip_name = f'{bundle_name}.zip'
            zip_path = os.path.join(tmpdir, zip_name)

            def _exec_entry(arc_path, src_path):
                info = zipfile.ZipInfo(arc_path)
                info.external_attr = 0o100755 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(src_path, 'rb') as fh:
                    zf.writestr(info, fh.read())

            with open(os.path.join(tmpdir, 'README.txt'), 'w') as f:
                f.write(readme)
            with open(os.path.join(tmpdir, 'setup.sh'), 'w') as f:
                f.write(setup_sh)
            with open(os.path.join(tmpdir, 'setup.ps1'), 'w') as f:
                f.write(setup_ps1)

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                # Module cache
                pkg_mod_dir = os.path.join(gopath, 'pkg')
                for root, dirs, files in os.walk(pkg_mod_dir):
                    dirs.sort()
                    for fname in sorted(files):
                        fpath = os.path.join(root, fname)
                        rel   = os.path.relpath(fpath, gopath)
                        zf.write(fpath, f'{bundle_name}/{rel}')

                # go.mod + go.sum
                for fname in ('go.mod', 'go.sum'):
                    fpath = os.path.join(projdir, fname)
                    if os.path.exists(fpath):
                        zf.write(fpath, f'{bundle_name}/{fname}')

                _exec_entry(f'{bundle_name}/setup.sh', os.path.join(tmpdir, 'setup.sh'))
                zf.write(os.path.join(tmpdir, 'setup.ps1'), f'{bundle_name}/setup.ps1')
                zf.write(os.path.join(tmpdir, 'README.txt'), f'{bundle_name}/README.txt')
                zf.writestr(f'{bundle_name}/scan_results.txt', _scan_report)

                # Optional: Go toolchain
                if embed_go and toolchain_dir and os.path.isdir(toolchain_dir):
                    for root, dirs, files in os.walk(toolchain_dir):
                        dirs.sort()
                        for fname in sorted(files):
                            fpath = os.path.join(root, fname)
                            rel   = os.path.relpath(fpath, toolchain_dir)
                            arc   = f'{bundle_name}/go-toolchain/{rel}'
                            # Mark executables
                            zinfo = zipfile.ZipInfo(arc)
                            zinfo.compress_type = zipfile.ZIP_DEFLATED
                            fmode = os.stat(fpath).st_mode
                            if fmode & 0o111:
                                zinfo.external_attr = (fmode | 0o755) << 16
                            with open(fpath, 'rb') as fh:
                                zf.writestr(zinfo, fh.read())

            import uuid as _uuid
            token = _uuid.uuid4().hex
            with _bundles_lock:
                _bundles[token] = {'path': zip_path, 'tmpdir': tmpdir,
                                   'name': zip_name, 'ts': time.time(),
                                   'ip': client_ip, 'package': module,
                                   'extra': go_platform if embed_go else ''}

            yield 'data: \n\n'
            yield f'data: \u2713 Bundle ready: {zip_name}\n\n'
            yield f'event: done\ndata: {token}\n\n'

        except Exception as e:
            yield 'data: \n\n'
            yield f'event: error\ndata: \u2717 {e}\n\n'
            shutil.rmtree(tmpdir, ignore_errors=True)

    return Response(generate(), mimetype='text/event-stream',
                    headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache'})


@app.route('/download/<token>')
def download(token):
    with _bundles_lock:
        info = _bundles.get(token)
    if not info or not os.path.exists(info['path']):
        return 'Not found or expired', 404
    _log_bundle_download('go', info.get('ip', ''), info.get('package', ''),
                          info.get('extra', ''),
                          os.path.getsize(info['path']) / 1_048_576)
    return send_file(info['path'], as_attachment=True,
                     download_name=info['name'],
                     mimetype='application/zip')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3006, threaded=True)
