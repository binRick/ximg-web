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

  <script>
    const COLS = COLLECTIONS_JSON;

    function setView(v) {
      ['bundle','packages','install'].forEach(n => {
        document.getElementById('view-' + n).style.display = n === v ? 'block' : 'none';
        document.getElementById('nav-' + n).classList.toggle('active', n === v);
      });
      if (v === 'packages' && !document.getElementById('pkg-list').children.length) renderPkgs('');
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
  </script>
  <script src="/shared/nav.js?v=2"></script>
</body>
</html>'''


@app.route('/')
def index():
    html = PAGE.replace('COLLECTIONS_JSON', _json.dumps(COLLECTIONS))
    return app.response_class(html, mimetype='text/html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3006, threaded=True)
