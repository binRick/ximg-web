import datetime
import json as _json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import zipfile
from flask import Flask, request, send_file, Response, stream_with_context

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

COLLECTION_RE = re.compile(r'^[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*$')
FAVICON_SVG   = open('/app/favicon.svg', 'rb').read()

# ── ClamAV helpers ───────────────────────────────────────────────────
import socket as _socket
import struct as _struct

def _clam_scan_file(filepath, host='clamav', port=3310, timeout=30):
    """Scan one file via clamd INSTREAM. Returns 'CLEAN', virus name, or None if unavailable."""
    try:
        with _socket.create_connection((host, port), timeout=timeout) as _s:
            _s.sendall(b'zINSTREAM\0')
            with open(filepath, 'rb') as fh:
                while True:
                    chunk = fh.read(8192)
                    if not chunk:
                        break
                    _s.sendall(_struct.pack('>I', len(chunk)) + chunk)
            _s.sendall(b'\x00\x00\x00\x00')
            resp = b''
            while True:
                data = _s.recv(4096)
                if not data:
                    break
                resp += data
                if b'\0' in data or b'\n' in data:
                    break
        text = resp.decode('utf-8', errors='replace').strip().rstrip('\0')
        if text.endswith(' FOUND'):
            return text[len('stream: '):-len(' FOUND')]
        return 'CLEAN'
    except Exception:
        return None

COLLECTIONS = [
    # Core
    {'name': 'ansible.posix',          'label': 'ansible.posix',         'cat': 'Core',     'color': '#ee0000', 'desc': 'POSIX platform modules: authorized_key, cron, firewalld, mount, sysctl, and more.'},
    {'name': 'ansible.utils',          'label': 'ansible.utils',         'cat': 'Core',     'color': '#cc1111', 'desc': 'Filter, test, and lookup plugins for data and network manipulation.'},
    {'name': 'ansible.netcommon',      'label': 'ansible.netcommon',     'cat': 'Network',  'color': '#0077cc', 'desc': 'Common modules and connection plugins for network automation.'},
    {'name': 'ansible.windows',        'label': 'ansible.windows',       'cat': 'Windows',  'color': '#0078d4', 'desc': 'Core Windows modules: win_copy, win_service, win_user, win_regedit.'},
    # Community
    {'name': 'community.general',      'label': 'community.general',     'cat': 'General',  'color': '#5bbad5', 'desc': 'Hundreds of general-purpose automation modules across services and platforms.'},
    {'name': 'community.crypto',       'label': 'community.crypto',      'cat': 'Security', 'color': '#2b7489', 'desc': 'TLS/SSL certificate management and cryptographic operations.'},
    {'name': 'community.docker',       'label': 'community.docker',      'cat': 'Container','color': '#2496ed', 'desc': 'Docker container, image, network, and volume management.'},
    {'name': 'community.mysql',        'label': 'community.mysql',       'cat': 'Database', 'color': '#4479a1', 'desc': 'MySQL and MariaDB database and user management.'},
    {'name': 'community.postgresql',   'label': 'community.postgresql',  'cat': 'Database', 'color': '#336791', 'desc': 'PostgreSQL database, user, schema, and extension management.'},
    {'name': 'community.windows',      'label': 'community.windows',     'cat': 'Windows',  'color': '#0078d4', 'desc': 'Extra Windows modules complementing ansible.windows.'},
    {'name': 'community.kubernetes',   'label': 'community.kubernetes',  'cat': 'Cloud',    'color': '#326ce5', 'desc': 'Kubernetes cluster, deployment, and resource management.'},
    {'name': 'community.aws',          'label': 'community.aws',         'cat': 'Cloud',    'color': '#ff9900', 'desc': 'Community AWS: extended EC2, S3, IAM, RDS modules.'},
    {'name': 'community.vmware',       'label': 'community.vmware',      'cat': 'Cloud',    'color': '#607078', 'desc': 'VMware vSphere, ESXi, and vCenter management.'},
    # Cloud
    {'name': 'amazon.aws',             'label': 'amazon.aws',            'cat': 'Cloud',    'color': '#ff9900', 'desc': 'Official Amazon AWS: EC2, S3, VPC, Lambda, and more.'},
    {'name': 'google.cloud',           'label': 'google.cloud',          'cat': 'Cloud',    'color': '#4285f4', 'desc': 'Google Cloud Platform resource management modules.'},
    {'name': 'azure.azcollection',     'label': 'azure.azcollection',    'cat': 'Cloud',    'color': '#008ad7', 'desc': 'Microsoft Azure resource management modules.'},
    {'name': 'kubernetes.core',        'label': 'kubernetes.core',       'cat': 'Cloud',    'color': '#326ce5', 'desc': 'Official Kubernetes collection: k8s, helm, and kubectl modules.'},
    # Network
    {'name': 'cisco.ios',              'label': 'cisco.ios',             'cat': 'Network',  'color': '#049fd9', 'desc': 'Cisco IOS network device automation.'},
    {'name': 'arista.eos',             'label': 'arista.eos',            'cat': 'Network',  'color': '#008000', 'desc': 'Arista EOS network device automation.'},
    {'name': 'junipernetworks.junos',  'label': 'junos',                 'cat': 'Network',  'color': '#84b135', 'desc': 'Juniper Networks Junos OS automation.'},
]

_tokens     = {}
_token_lock = threading.Lock()


def _cleanup():
    while True:
        time.sleep(60)
        cutoff = time.time() - 300
        with _token_lock:
            stale = [t for t, info in _tokens.items() if info['ts'] < cutoff]
            for t in stale:
                info = _tokens.pop(t)
                shutil.rmtree(os.path.dirname(info['path']), ignore_errors=True)

threading.Thread(target=_cleanup, daemon=True).start()


def _logo_svg(col):
    color  = col['color']
    parts  = col['name'].split('.')
    abbrev = (parts[0][0] + parts[1][0]).upper()
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
        f'<rect width="40" height="40" rx="9" fill="{color}"/>'
        f'<text x="20" y="27" font-size="15" font-weight="700" text-anchor="middle" '
        f'fill="white" font-family="system-ui,ui-sans-serif,sans-serif" letter-spacing="-0.5">'
        f'{abbrev}</text>'
        '</svg>'
    )


def _build_scripts(collection, files):
    generated = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    sbom      = '\n'.join(f'  {f}' for f in sorted(files))

    install_sh = (
        '#!/bin/bash\n'
        'set -e\n'
        f'# Ansible Galaxy offline bundle — {collection}\n'
        f'# Generated: {generated}\n'
        '# Source:    https://ansible-bundler.ximg.app\n\n'
        'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\n'
        'cd "$SCRIPT_DIR"\n\n'
        'echo "==> Installing Ansible collections from bundle..."\n'
        'ansible-galaxy collection install collections/*.tar.gz\n'
        'echo "==> Done!"\n'
    )

    readme = (
        f'Ansible Galaxy Bundle\n'
        f'=====================\n\n'
        f'Generated:  {generated}\n'
        f'Collection: {collection}\n'
        f'Source:     https://ansible-bundler.ximg.app\n'
        f'Archives:   {len(files)} .tar.gz file(s)\n\n'
        f'Contents:\n{sbom}\n\n'
        f'Installation\n'
        f'------------\n\n'
        f'Option 1 — run the install script:\n'
        f'  chmod +x install.sh && ./install.sh\n\n'
        f'Option 2 — install manually:\n'
        f'  ansible-galaxy collection install collections/*.tar.gz\n\n'
        f'No internet connection required after downloading this bundle.\n'
    )
    return install_sh, readme


@app.route('/favicon.svg')
def favicon():
    return app.response_class(FAVICON_SVG, mimetype='image/svg+xml')


@app.route('/logo/<path:name>.svg')
def logo(name):
    col = next((c for c in COLLECTIONS if c['name'] == name), {'name': name, 'color': '#555'})
    return app.response_class(_logo_svg(col), mimetype='image/svg+xml')


@app.route('/bundle', methods=['POST'])
def bundle():
    collection = request.form.get('collection', '').strip()
    client_ip  = request.headers.get('X-Real-IP') or request.remote_addr or ''

    if not collection:
        return Response('data: ✗ No collection specified\n\ndata: __DONE_ERROR__\n\n',
                        mimetype='text/event-stream')
    if not COLLECTION_RE.match(collection):
        return Response(
            f'data: ✗ Invalid name "{collection}" — expected namespace.name format\n\n'
            f'data: __DONE_ERROR__\n\n',
            mimetype='text/event-stream')

    def generate():
        tmp     = tempfile.mkdtemp(prefix='ansible_bundle_')
        dl_path = os.path.join(tmp, 'collections')
        os.makedirs(dl_path)

        yield f'data: ==> Downloading {collection} from Ansible Galaxy...\n\n'

        cmd = ['ansible-galaxy', 'collection', 'download', collection, '-p', dl_path]
        yield f'data: $ {" ".join(cmd)}\n\n'

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env={**os.environ, 'HOME': tmp},
            )
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    yield f'data: {line}\n\n'
            proc.wait()
        except Exception as e:
            yield f'data: ✗ Error: {e}\n\n'
            yield 'data: __DONE_ERROR__\n\n'
            shutil.rmtree(tmp, ignore_errors=True)
            return

        if proc.returncode != 0:
            yield 'data: ✗ ansible-galaxy download failed\n\n'
            yield 'data: __DONE_ERROR__\n\n'
            shutil.rmtree(tmp, ignore_errors=True)
            return

        files = sorted(f for f in os.listdir(dl_path) if f.endswith('.tar.gz'))
        if not files:
            yield 'data: ✗ No .tar.gz archives found in download path\n\n'
            yield 'data: __DONE_ERROR__\n\n'
            shutil.rmtree(tmp, ignore_errors=True)
            return

        yield f'data: ==> Downloaded {len(files)} archive(s): {", ".join(files)}\n\n'

        # ── ClamAV scan ───────────────────────────────────────────
        yield 'data: 🛡 Scanning with ClamAV...\n\n'
        _scan_results = []
        _clam_ok = True
        for _f in files:
            _res = _clam_scan_file(os.path.join(dl_path, _f))
            _scan_results.append((_f, _res))
            if _res is None:
                yield f'data:   ⚠ {_f} — ClamAV unavailable, skipping\n\n'
                _clam_ok = False
            elif _res == 'CLEAN':
                yield f'data:   ✓ {_f}\n\n'
            else:
                yield f'data:   ✗ {_f} — INFECTED: {_res}\n\n'
        _infected = [(_f, _r) for _f, _r in _scan_results if _r is not None and _r != 'CLEAN']
        if _infected:
            yield 'data: \n\n'
            for _fn, _vn in _infected:
                yield f'data: ✗ BLOCKED: {_fn} — {_vn}\n\n'
            yield 'data: __DONE_ERROR__\n\n'
            shutil.rmtree(tmp, ignore_errors=True)
            return
        if _clam_ok:
            yield f'data: ✓ All {len(_scan_results)} file(s) clean\n\n'
        _scan_ts = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        _scan_report = 'ClamAV Scan Report\nGenerated: ' + _scan_ts + '\n\n' + (
            '\n'.join(f'{_f}: {_r or "SKIPPED (unavailable)"}' for _f, _r in _scan_results)
            if _scan_results else 'Scan skipped — ClamAV unavailable'
        ) + '\n'

        yield 'data: ==> Building bundle zip...\n\n'

        install_sh, readme = _build_scripts(collection, files)

        install_path = os.path.join(tmp, 'install.sh')
        readme_path  = os.path.join(tmp, 'README.txt')
        with open(install_path, 'w') as f:
            f.write(install_sh)
        with open(readme_path, 'w') as f:
            f.write(readme)
        os.chmod(install_path, 0o755)

        prefix   = collection.replace('.', '-') + '-bundle'
        zip_name = prefix + '.zip'
        zip_path = os.path.join(tmp, zip_name)

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.write(install_path, f'{prefix}/install.sh')
            zf.write(readme_path,  f'{prefix}/README.txt')
            for fname in files:
                zf.write(os.path.join(dl_path, fname), f'{prefix}/collections/{fname}')
            zf.writestr(f'{prefix}/scan_results.txt', _scan_report)

        token = str(uuid.uuid4())
        with _token_lock:
            _tokens[token] = {'path': zip_path, 'ts': time.time(),
                               'ip': client_ip, 'package': collection}

        size_mb = os.path.getsize(zip_path) / 1_048_576
        yield f'data: ✓ Bundle ready — {len(files)} archive(s), {size_mb:.1f} MB\n\n'
        yield f'data: __DONE__:{token}\n\n'

    return Response(stream_with_context(generate()), mimetype='text/event-stream',
                    headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache'})


@app.route('/download/<token>')
def download(token):
    with _token_lock:
        entry = _tokens.get(token)
    if not entry:
        return 'Not found or expired', 404
    zip_path = entry['path']
    if not os.path.exists(zip_path):
        return 'File not found', 404
    _log_bundle_download('ansible', entry.get('ip', ''), entry.get('package', ''), '',
                          os.path.getsize(zip_path) / 1_048_576)
    return send_file(zip_path, as_attachment=True, download_name=os.path.basename(zip_path))


PAGE = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ansible Galaxy Bundler — ansible-bundler.ximg.app</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;background:#0a0e1a;
         background-image:radial-gradient(ellipse at 20% 50%,rgba(238,0,0,.07) 0,transparent 60%),
                          radial-gradient(ellipse at 80% 20%,rgba(180,0,0,.05) 0,transparent 50%);
         font-family:system-ui,ui-sans-serif,sans-serif;
         display:flex;flex-direction:column;align-items:center;
         padding:2rem 1rem 4rem}

    .hero{text-align:center;margin-bottom:2.5rem;margin-top:1rem}
    .hero h1{font-size:2rem;font-weight:800;letter-spacing:-.03em;
             background:linear-gradient(135deg,#ff4444 0%,#ee0000 50%,#cc0000 100%);
             -webkit-background-clip:text;-webkit-text-fill-color:transparent;
             background-clip:text}
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
    input[type=text]:focus{border-color:rgba(238,0,0,.5)}
    .hint{color:#475569;font-size:.78rem;margin-top:.35rem}

    button#btn{width:100%;margin-top:1.4rem;padding:.7rem;border:none;border-radius:8px;
               background:linear-gradient(135deg,#ee0000,#cc0000);
               color:#fff;font-size:.95rem;font-weight:700;cursor:pointer;
               transition:opacity .15s;letter-spacing:.01em}
    button#btn:hover{opacity:.88}
    button#btn:disabled{opacity:.5;cursor:not-allowed}

    #status{margin-top:1rem;padding:.65rem .85rem;border-radius:8px;font-size:.85rem;
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
    .pkg-search-wrap input:focus{border-color:rgba(238,0,0,.4)}
    .pkg-search-wrap::before{content:"⌕";position:absolute;left:.8rem;top:50%;
                              transform:translateY(-50%);color:#475569;font-size:1.1rem}
    .cat-label{color:#475569;font-size:.7rem;font-weight:700;letter-spacing:.1em;
               text-transform:uppercase;margin:1.2rem 0 .5rem;padding-left:.25rem}
    .pkg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.6rem}
    .pkg-card{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.07);
              border-radius:10px;padding:.75rem .85rem;display:flex;flex-direction:column;gap:.35rem;
              transition:border-color .2s}
    .pkg-card:hover{border-color:rgba(238,0,0,.3)}
    .pkg-top{display:flex;align-items:center;gap:.6rem}
    .pkg-icon{width:32px;height:32px;border-radius:7px;flex-shrink:0}
    .pkg-name{font-size:.82rem;font-weight:700;color:#e2e8f0;white-space:nowrap;flex-shrink:0}
    .pkg-desc{font-size:.75rem;color:#64748b;line-height:1.45;flex:1}
    .pkg-bundle-btn{margin-top:.3rem;background:none;border:1px solid rgba(238,0,0,.25);
                    border-radius:6px;color:#fca5a5;font-size:.75rem;font-weight:600;
                    padding:.35rem .8rem;cursor:pointer;transition:all .15s;
                    text-align:center;width:100%}
    .pkg-bundle-btn:hover{background:rgba(238,0,0,.1);border-color:rgba(238,0,0,.5)}

    .terminal{background:#0d1117;border:1px solid rgba(255,255,255,.08);
              border-radius:10px;overflow:hidden;margin-top:1.2rem;display:none}
    .term-bar{background:#161b22;padding:.45rem .75rem;display:flex;align-items:center;gap:.4rem}
    .dot{width:11px;height:11px;border-radius:50%}
    .dot-r{background:#ff5f57}.dot-y{background:#febc2e}.dot-g{background:#28c840}
    .term-title{color:#6e7681;font-size:.75rem;margin-left:.4rem}
    #term-out{padding:.75rem 1rem;font-family:ui-monospace,monospace;font-size:.78rem;
              line-height:1.6;color:#c9d1d9;max-height:320px;overflow-y:auto;
              white-space:pre-wrap;word-break:break-all}

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
    .pkg-snav-btn{background:rgba(238,0,0,.10);border:1px solid rgba(238,0,0,.25);color:#fca5a5;font-size:.78rem;font-weight:600;padding:.3rem .75rem;border-radius:6px;cursor:pointer;transition:all .15s;white-space:nowrap;width:auto;margin-top:0}
    .pkg-snav-btn.active{background:rgba(238,0,0,.25);border-color:#ee0000;color:#fff}
  </style>
</head>
<body>
  <div class="hero">
    <h1>Ansible Galaxy Bundler</h1>
    <div class="subtitle">Download any collection with dependencies for offline airgap install</div>
  </div>

  <div class="snav">
    <button class="snav-btn active" id="nav-bundle"   onclick="setView('bundle')">Bundle</button>
    <button class="snav-btn"        id="nav-packages" onclick="setView('packages')">Top Collections</button>
    <button class="snav-btn"        id="nav-install"  onclick="setView('install')">How to Install</button>
    <button class="snav-btn"        id="nav-tests"    onclick="setView('tests')">Test Cases</button>
  </div>

  <div id="view-bundle">
    <div class="card">
      <label for="collection">Ansible Galaxy Collection</label>
      <input type="text" id="collection" placeholder="e.g. community.general" autocomplete="off" spellcheck="false">
      <p class="hint">Collection name in <code>namespace.name</code> format — as used in <code>ansible-galaxy collection install &lt;name&gt;</code></p>

      <button id="btn" onclick="go()">Bundle &amp; Download</button>

      <div style="margin-top:.75rem;padding:.6rem .85rem;background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.2);border-radius:6px;font-size:.78rem;color:#94a3b8;display:flex;align-items:flex-start;gap:.5rem">
        <span style="color:#00ff88;flex-shrink:0">&#x1F6E1;</span>
        <span>Every bundle is scanned with <strong style="color:#00ff88">ClamAV</strong> before download. If malware or a virus signature is detected, the bundle is <strong style="color:#ff4444">blocked</strong> and never served. A <code>scan_results.txt</code> report is included in every zip.</span>
      </div>

      <div class="terminal" id="terminal">
        <div class="term-bar">
          <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
          <span class="term-title" id="term-title">ansible-bundler</span>
        </div>
        <div id="term-out"></div>
      </div>
      <div id="status"></div>
    </div>
  </div>

  <div id="view-packages" style="display:none;width:100%;max-width:900px">
    <div class="pkg-search-wrap">
      <input type="text" id="pkg-search" placeholder="Search collections..." oninput="filterPkgs(this.value)">
    </div>
    <div id="pkg-list"></div>
  </div>

  <div id="view-install" style="display:none;width:100%;max-width:680px;margin:0 auto">
    <div class="card" style="max-width:none">
      <h2 style="font-size:1.1rem;font-weight:700;color:#f1f5f9;margin-bottom:1.4rem">After Downloading the Zip</h2>
      <ol style="list-style:none;padding:0;display:flex;flex-direction:column;gap:1.1rem">
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#ee0000;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">1</span>
          <div><strong style="color:#f1f5f9">Unzip the bundle</strong><br>
          <code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">unzip &lt;collection&gt;-bundle.zip</code></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#ee0000;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">2</span>
          <div><strong style="color:#f1f5f9">Run the install script</strong><br>
          <code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">chmod +x install.sh &amp;&amp; ./install.sh</code>
          <span style="color:#94a3b8;font-size:.85rem;display:block;margin-top:.4rem">Installs the collection and all dependencies — no internet needed.</span></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#ee0000;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">3</span>
          <div><strong style="color:#f1f5f9">Or install manually</strong><br>
          <code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">ansible-galaxy collection install collections/*.tar.gz</code></div>
        </li>
      </ol>
    </div>
  </div>

  <div id="view-tests" style="display:none;width:100%;max-width:780px">
    <div class="card" style="max-width:none">
      <div class="pkg-snav">
        <button class="pkg-snav-btn active" data-col="community.vmware"
                onclick="selectTestCol('community.vmware')">community.vmware</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <span style="font-weight:700;font-size:.95rem;color:#f1f5f9">Test Suite</span>
        <button id="run-btn" onclick="runTests()"
                style="width:auto;margin:0;padding:.35rem 1.1rem;font-size:.8rem;background:linear-gradient(135deg,#ee0000,#cc0000)">&#9654; Run</button>
      </div>
      <div class="test-list" id="test-list"></div>
      <div style="display:flex;gap:1rem;margin-top:.75rem">
        <div style="flex:1">
          <div style="font-size:.7rem;color:#475569;font-weight:600;letter-spacing:.07em;text-transform:uppercase;margin-bottom:.3rem">Bundle Log</div>
          <div class="term-bar" style="border-radius:6px 6px 0 0">
            <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
            <span class="term-title">ansible-galaxy download</span>
          </div>
          <div id="tbundle-out" style="background:#0d1117;border-radius:0 0 6px 6px;padding:.65rem .75rem;height:200px;overflow-y:auto;font-family:ui-monospace,monospace;font-size:.72rem;line-height:1.5;color:#c9d1d9;border:1px solid rgba(255,255,255,.06);border-top:none"></div>
        </div>
        <div style="flex:1">
          <div style="font-size:.7rem;color:#475569;font-weight:600;letter-spacing:.07em;text-transform:uppercase;margin-bottom:.3rem">Install Log</div>
          <div class="term-bar" style="border-radius:6px 6px 0 0">
            <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
            <span class="term-title">ansible-galaxy install</span>
          </div>
          <div id="tinstall-out" style="background:#0d1117;border-radius:0 0 6px 6px;padding:.65rem .75rem;height:200px;overflow-y:auto;font-family:ui-monospace,monospace;font-size:.72rem;line-height:1.5;color:#c9d1d9;border:1px solid rgba(255,255,255,.06);border-top:none"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const COLS = COLLECTIONS_JSON;

    function setView(v) {
      ['bundle','packages','install','tests'].forEach(n => {
        document.getElementById('view-' + n).style.display = n === v ? 'block' : 'none';
        document.getElementById('nav-' + n).classList.toggle('active', n === v);
      });
      if (v === 'packages' && !document.getElementById('pkg-list').children.length) renderPkgs('');
      if (v === 'tests') initTestList();
    }

    function renderPkgs(q) {
      const list    = document.getElementById('pkg-list');
      const query   = q.toLowerCase();
      const filtered = query ? COLS.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.label.toLowerCase().includes(query) ||
        c.desc.toLowerCase().includes(query) ||
        c.cat.toLowerCase().includes(query)
      ) : COLS;

      const byCat = {};
      filtered.forEach(c => { (byCat[c.cat] = byCat[c.cat] || []).push(c); });

      list.innerHTML = '';
      Object.entries(byCat).forEach(([cat, cols]) => {
        const lbl = document.createElement('div');
        lbl.className = 'cat-label';
        lbl.textContent = cat;
        list.appendChild(lbl);

        const grid = document.createElement('div');
        grid.className = 'pkg-grid';
        cols.forEach(c => {
          grid.innerHTML += `
            <div class="pkg-card">
              <div class="pkg-top">
                <img class="pkg-icon" src="/logo/${c.name}.svg" alt="">
                <span class="pkg-name">${c.label}</span>
              </div>
              <div class="pkg-desc">${c.desc}</div>
              <button class="pkg-bundle-btn" onclick="bundleCol('${c.name}')">Bundle &amp; Download</button>
            </div>`;
        });
        list.appendChild(grid);
      });
    }

    function filterPkgs(q) { renderPkgs(q); }

    function bundleCol(name) {
      document.getElementById('collection').value = name;
      setView('bundle');
      go();
    }

    async function go() {
      const col       = document.getElementById('collection').value.trim();
      const btn       = document.getElementById('btn');
      const termDiv   = document.getElementById('terminal');
      const termOut   = document.getElementById('term-out');
      const status    = document.getElementById('status');
      const termTitle = document.getElementById('term-title');

      if (!col) { alert('Enter a collection name'); return; }

      btn.disabled        = true;
      btn.textContent     = 'Downloading\u2026';
      termTitle.textContent = col;
      termDiv.style.display = 'block';
      termOut.textContent = '';
      status.className    = '';
      status.style.display = 'none';

      const fd = new FormData();
      fd.append('collection', col);

      try {
        const res    = await fetch('/bundle', { method: 'POST', body: fd });
        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let buf      = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop();
          for (const part of parts) {
            const line = part.replace(/^data: ?/, '');
            if (line.startsWith('__DONE__:')) {
              const token = line.split(':')[1];
              btn.disabled    = false;
              btn.textContent = 'Bundle & Download';
              status.className    = 'ok';
              status.style.display = 'block';
              status.textContent  = '\u2713 Bundle ready \u2014 downloading\u2026';
              window.location.href = '/download/' + token;
              return;
            } else if (line === '__DONE_ERROR__') {
              btn.disabled    = false;
              btn.textContent = 'Bundle & Download';
              status.className    = 'error';
              status.style.display = 'block';
              status.textContent  = '\u2717 Download failed \u2014 see terminal above';
              return;
            } else {
              termOut.textContent += line + '\n';
              termOut.scrollTop    = termOut.scrollHeight;
            }
          }
        }
      } catch (e) {
        btn.disabled    = false;
        btn.textContent = 'Bundle & Download';
        status.className    = 'error';
        status.style.display = 'block';
        status.textContent  = '\u2717 Network error: ' + e.message;
      }
    }
    // ── Test runner ──────────────────────────────────────────────
    var TEST_DEFS = [
      {id:'T01', desc:'POST /bundle returns 200 stream'},
      {id:'T02', desc:'SSE stream ends with __DONE__:token'},
      {id:'T03', desc:'GET /bundle-meta/:token returns 200'},
      {id:'T04', desc:'Zip opens without error'},
      {id:'T05', desc:'Root dir matches community-vmware-bundle'},
      {id:'T06', desc:'install.sh is a zip member'},
      {id:'T07', desc:'README.txt is a zip member'},
      {id:'T08', desc:'collections/ directory present in zip'},
      {id:'T09', desc:'community.vmware .tar.gz in collections/'},
      {id:'T10', desc:'Multiple archives present (collection + deps)'},
      {id:'T11', desc:'unzip extracts successfully'},
      {id:'T12', desc:'install.sh has +x permission in zip'},
      {id:'T13', desc:'install.sh contains ansible-galaxy install command'},
      {id:'T14', desc:'ansible-galaxy collection install from local .tar.gz exits 0'},
      {id:'T15', desc:'community.vmware dir exists in installed path'},
      {id:'T16', desc:'MANIFEST.json present in installed collection'},
      {id:'T17', desc:'collection version in MANIFEST.json is semver'},
      {id:'T18', desc:'vmware_vm_info plugin file exists in collection'},
    ];

    var _testCol = 'community.vmware';
    var _testsRunning = false;

    function selectTestCol(col) {
      _testCol = col;
      document.querySelectorAll('.pkg-snav-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.col === col);
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
      document.getElementById('tinstall-out').innerHTML = '';
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
        var fd = new FormData();
        fd.append('collection', _testCol);
        var bundleResp = await fetch('/bundle', {method:'POST', body:fd});
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
        var buf = '', token = null, bundleErr = false;
        while (true) {
          var ch = await reader.read();
          if (ch.done) break;
          buf += dec.decode(ch.value, {stream:true});
          var parts = buf.split('\n\n');
          buf = parts.pop();
          for (var i = 0; i < parts.length; i++) {
            var line = parts[i].replace(/^data: ?/, '');
            if (line.startsWith('__DONE__:')) { token = line.split(':')[1]; }
            else if (line === '__DONE_ERROR__') { bundleErr = true; }
            else if (line) termAppendTest('tbundle-out', line);
          }
        }
        if (!token || bundleErr) {
          setTestStatus('T02', 'fail', bundleErr ? 'bundle error' : 'no token');
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
            method:'POST',
            headers:{'Content-Type':'application/x-www-form-urlencoded'},
            body:'token=' + encodeURIComponent(token)
          });
          if (!testResp.ok) { abort('T04', 'test-run server error'); return; }
          var r2 = testResp.body.getReader();
          var dec2 = new TextDecoder(), buf2 = '';
          while (true) {
            var ch2 = await r2.read();
            if (ch2.done) break;
            buf2 += dec2.decode(ch2.value, {stream:true});
            var evts = buf2.split('\n\n');
            buf2 = evts.pop();
            for (var k = 0; k < evts.length; k++) {
              var et = 'message', ed = '';
              evts[k].split('\n').forEach(function(ln) {
                if (ln.startsWith('event: ')) et = ln.slice(7).trim();
                else if (ln.startsWith('data: ')) ed = ln.slice(6);
              });
              if (et === 'step') {
                try { var d = JSON.parse(ed); setTestStatus(d.id, d.status, d.note || ''); } catch(e) {}
              } else if (et === 'install') {
                termAppendTest('tinstall-out', ed);
              } else if (et === 'log') {
                termAppendTest('tbundle-out', ed);
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
</html>'''


@app.route('/bundle-meta/<token>')
def bundle_meta(token):
    with _token_lock:
        info = _tokens.get(token)
    if not info:
        from flask import jsonify
        return jsonify({'error': 'not found'}), 404
    from flask import jsonify
    return jsonify({'name': os.path.basename(info['path']),
                    'package': info.get('package', '')})


@app.route('/test-run', methods=['POST'])
def test_run():
    from flask import jsonify
    token = request.form.get('token', '').strip()
    with _token_lock:
        info = _tokens.get(token)
    if not info or not os.path.exists(info.get('path', '')):
        return jsonify({'error': 'Bundle not found or expired'}), 404
    zip_path = info['path']

    @stream_with_context
    def generate():
        def step(tid, status, note=''):
            return f'event: step\ndata: {_json.dumps({"id": tid, "status": status, "note": note})}\n\n'
        def ilog(msg):
            return f'event: install\ndata: {msg}\n\n'

        all_ids = ['T04','T05','T06','T07','T08','T09','T10','T11','T12','T13','T14','T15','T16','T17','T18']

        def skip_from(from_id, reason='skipped — prior step failed'):
            idx = all_ids.index(from_id) if from_id in all_ids else 0
            for tid in all_ids[idx:]:
                yield step(tid, 'skip', reason)

        tmpdir = tempfile.mkdtemp(prefix='ansible-testrun-')
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
            if not bundle_root.endswith('-bundle'):
                yield step('T05', 'fail', f'unexpected root: {bundle_root[:40]}')
                yield from skip_from('T06')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T05', 'pass', bundle_root)

            # T06: install.sh present
            yield step('T06', 'run')
            install_arc = f'{bundle_root}/install.sh'
            if install_arc not in names:
                yield step('T06', 'fail', 'install.sh missing')
                yield from skip_from('T07')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T06', 'pass', 'found')

            # T07: README.txt present
            yield step('T07', 'run')
            if f'{bundle_root}/README.txt' not in names:
                yield step('T07', 'fail', 'README.txt missing')
            else:
                yield step('T07', 'pass', 'found')

            # T08: collections/ dir
            yield step('T08', 'run')
            col_prefix = f'{bundle_root}/collections/'
            col_entries = [n for n in names if n.startswith(col_prefix) and n.endswith('.tar.gz')]
            if not col_entries:
                yield step('T08', 'fail', 'collections/*.tar.gz not found')
                yield from skip_from('T09')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T08', 'pass', f'{len(col_entries)} archives')

            # T09: community.vmware archive present
            yield step('T09', 'run')
            vmware_arcs = [n for n in col_entries if 'community-vmware' in os.path.basename(n)]
            if not vmware_arcs:
                yield step('T09', 'fail', 'community-vmware-*.tar.gz not found')
                yield from skip_from('T10')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T09', 'pass', os.path.basename(vmware_arcs[0]))

            # T10: multiple archives (collection + deps)
            yield step('T10', 'run')
            if len(col_entries) > 1:
                yield step('T10', 'pass', f'{len(col_entries)} archives (incl deps)')
            else:
                yield step('T10', 'fail', 'only 1 archive — deps may be missing')

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

            # T12: install.sh is executable
            yield step('T12', 'run')
            with zipfile.ZipFile(zip_path) as zf:
                zi = zf.getinfo(install_arc)
                mode = (zi.external_attr >> 16) & 0o777
            if mode & 0o111:
                yield step('T12', 'pass', oct(mode))
            else:
                yield step('T12', 'fail', f'mode {oct(mode)} not executable')

            # T13: install.sh contains ansible-galaxy install
            yield step('T13', 'run')
            install_content = open(os.path.join(bundle_dir, 'install.sh')).read()
            if 'ansible-galaxy collection install' in install_content:
                yield step('T13', 'pass', 'ansible-galaxy collection install found')
            else:
                yield step('T13', 'fail', 'install command missing from install.sh')

            # T14: ansible-galaxy collection install from local archives
            yield step('T14', 'run')
            install_path = os.path.join(tmpdir, 'collections_installed')
            os.makedirs(install_path, exist_ok=True)
            col_files = sorted(
                os.path.join(bundle_dir, 'collections', f)
                for f in os.listdir(os.path.join(bundle_dir, 'collections'))
                if f.endswith('.tar.gz')
            )
            cmd = ['ansible-galaxy', 'collection', 'install', '--offline',
                   '-p', install_path] + col_files
            yield ilog('$ ansible-galaxy collection install --offline -p <installpath> collections/*.tar.gz')
            try:
                r = subprocess.run(cmd, capture_output=True, text=True,
                                   env={**os.environ, 'HOME': tmpdir}, timeout=120)
            except subprocess.TimeoutExpired:
                yield step('T14', 'fail', 'timed out (120s)')
                yield from skip_from('T15')
                yield 'event: done\ndata: ok\n\n'
                return
            for ln in (r.stdout + r.stderr).strip().splitlines()[:20]:
                yield ilog(f'  {ln}')
            if r.returncode != 0:
                yield step('T14', 'fail', f'exit {r.returncode}')
                yield from skip_from('T15')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T14', 'pass', f'installed {len(col_files)} archives')

            # T15: community.vmware dir exists
            yield step('T15', 'run')
            vmware_dir = os.path.join(install_path, 'ansible_collections', 'community', 'vmware')
            if os.path.isdir(vmware_dir):
                yield step('T15', 'pass', 'community/vmware/ found')
            else:
                yield step('T15', 'fail', 'community/vmware/ missing')
                yield from skip_from('T16')
                yield 'event: done\ndata: ok\n\n'
                return

            # T16: MANIFEST.json present
            yield step('T16', 'run')
            manifest_path = os.path.join(vmware_dir, 'MANIFEST.json')
            if not os.path.exists(manifest_path):
                yield step('T16', 'fail', 'MANIFEST.json missing')
                yield from skip_from('T17')
                yield 'event: done\ndata: ok\n\n'
                return
            yield step('T16', 'pass', 'found')

            # T17: version in MANIFEST.json is semver
            yield step('T17', 'run')
            try:
                manifest = _json.loads(open(manifest_path).read())
                version = manifest.get('collection_info', {}).get('version', '')
            except Exception:
                version = ''
            semver_m = re.search(r'\d+\.\d+\.\d+', version)
            if semver_m:
                yield step('T17', 'pass', version)
            else:
                yield step('T17', 'fail', f'no semver: {version[:40]}')

            # T18: vmware_vm_info plugin file exists
            yield step('T18', 'run')
            vm_info = os.path.join(vmware_dir, 'plugins', 'modules', 'vmware_vm_info.py')
            if os.path.exists(vm_info):
                yield step('T18', 'pass', 'plugins/modules/vmware_vm_info.py found')
            else:
                yield step('T18', 'fail', 'vmware_vm_info.py not found')

        except Exception as e:
            import traceback
            yield ilog(f'ERROR: {traceback.format_exc()[:200]}')
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

        yield 'event: done\ndata: ok\n\n'

    return Response(generate(), mimetype='text/event-stream',
                    headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache'})


@app.route('/')
def index():
    html = PAGE.replace('COLLECTIONS_JSON', _json.dumps(COLLECTIONS))
    return app.response_class(html, mimetype='text/html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3006, threaded=True)
