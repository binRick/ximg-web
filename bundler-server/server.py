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
from flask import Flask, after_this_request, request, send_file, jsonify, Response, stream_with_context

app = Flask(__name__)

BUNDLE_LOG  = '/data/bundler-downloads.log'
_blog_lock  = threading.Lock()

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

# Package name + optional PEP 440 version specifier
PACKAGE_RE = re.compile(
    r'^[A-Za-z0-9][A-Za-z0-9._-]*'
    r'(\s*(===|~=|==|!=|<=|>=|<|>)\s*[A-Za-z0-9._*!+]+)*$'
)

PYTHON_VERSIONS = {'3.9', '3.10', '3.11', '3.12', '3.13'}

PLATFORMS = {
    'linux_x86_64':       'Linux x86-64',
    'linux_aarch64':      'Linux ARM64',
    'win_amd64':          'Windows x64',
    'macosx_11_0_arm64':  'macOS ARM64 (Apple Silicon)',
    'macosx_10_9_x86_64': 'macOS x86-64 (Intel)',
    'any':                'Any / Pure Python',
}

# pip --platform tags to pass for each target.
# Linux needs the manylinux hierarchy so compiled packages (numpy, etc.) are found.
# Multiple --platform flags tell pip to treat all listed tags as compatible.
PLATFORM_TAGS = {
    'linux_x86_64':       ['manylinux_2_17_x86_64', 'manylinux2014_x86_64',
                           'manylinux1_x86_64', 'linux_x86_64'],
    'linux_aarch64':      ['manylinux_2_17_aarch64', 'manylinux2014_aarch64',
                           'linux_aarch64'],
    'win_amd64':          ['win_amd64'],
    'macosx_11_0_arm64':  ['macosx_11_0_arm64'],
    'macosx_10_9_x86_64': ['macosx_10_9_x86_64'],
}

# PyPI install name -> Python import name (for packages that differ)
IMPORT_NAMES = {
    'pillow':                  'PIL',
    'scikit-learn':            'sklearn',
    'pyyaml':                  'yaml',
    'beautifulsoup4':          'bs4',
    'opencv-python':           'cv2',
    'opencv-python-headless':  'cv2',
    'python-dateutil':         'dateutil',
    'pyserial':                'serial',
    'attrs':                   'attr',
    'typing-extensions':       'typing_extensions',
    'msgpack-python':          'msgpack',
    'python-magic':            'magic',
    'pycryptodome':            'Crypto',
    'pycryptodomex':           'Cryptodome',
    'pyzmq':                   'zmq',
    'py-bcrypt':               'bcrypt',
    'antlr4-python3-runtime':  'antlr4',
    'python-jose':             'jose',
    'python-multipart':        'multipart',
    'python-slugify':          'slugify',
    'lxml':                    'lxml',
    'psutil':                  'psutil',
}

FAVICON_SVG = open('/app/favicon.svg', 'rb').read()

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

# Top PyPI packages shown in the Packages tab
PACKAGES = [
    # HTTP / Networking
    {'name':'requests',       'label':'Requests',       'cat':'HTTP',       'color':'#e8412c', 'desc':'Simple, elegant HTTP requests for humans.'},
    {'name':'httpx',          'label':'HTTPX',          'cat':'HTTP',       'color':'#009688', 'desc':'Async-capable next-generation HTTP client.'},
    {'name':'aiohttp',        'label':'aiohttp',        'cat':'HTTP',       'color':'#2c5364', 'desc':'Async HTTP client/server framework.'},
    {'name':'urllib3',        'label':'urllib3',        'cat':'HTTP',       'color':'#4a90d9', 'desc':'HTTP client with connection pooling and retries.'},
    {'name':'websockets',     'label':'websockets',     'cat':'HTTP',       'color':'#1a6b3c', 'desc':'WebSocket client and server library.'},
    # Web Frameworks
    {'name':'flask',          'label':'Flask',          'cat':'Web',        'color':'#2b2d30', 'desc':'Lightweight WSGI micro web framework.'},
    {'name':'django',         'label':'Django',         'cat':'Web',        'color':'#092e20', 'desc':'High-level Python web framework.'},
    {'name':'fastapi',        'label':'FastAPI',        'cat':'Web',        'color':'#059669', 'desc':'Fast async framework with auto OpenAPI docs.'},
    {'name':'starlette',      'label':'Starlette',      'cat':'Web',        'color':'#395ca3', 'desc':'Lightweight ASGI framework and toolkit.'},
    {'name':'uvicorn',        'label':'Uvicorn',        'cat':'Server',     'color':'#7c3aed', 'desc':'Lightning-fast ASGI server implementation.'},
    {'name':'gunicorn',       'label':'Gunicorn',       'cat':'Server',     'color':'#499848', 'desc':'Python WSGI HTTP server for UNIX.'},
    # Science / Data
    {'name':'numpy',          'label':'NumPy',          'cat':'Science',    'color':'#013243', 'desc':'Fundamental package for array computing.'},
    {'name':'pandas',         'label':'Pandas',         'cat':'Data',       'color':'#150458', 'desc':'Powerful DataFrame-based data analysis.'},
    {'name':'scipy',          'label':'SciPy',          'cat':'Science',    'color':'#0054a6', 'desc':'Scientific computing algorithms and tools.'},
    {'name':'matplotlib',     'label':'Matplotlib',     'cat':'Viz',        'color':'#11557c', 'desc':'Comprehensive 2D/3D plotting library.'},
    {'name':'scikit-learn',   'label':'scikit-learn',   'cat':'ML',         'color':'#f89939', 'desc':'Machine learning built on NumPy and SciPy.'},
    {'name':'Pillow',         'label':'Pillow',         'cat':'Image',      'color':'#cc5c00', 'desc':'Friendly fork of the Python Imaging Library.'},
    # Dev / Testing
    {'name':'pytest',         'label':'pytest',         'cat':'Testing',    'color':'#0a9edc', 'desc':'Feature-rich, easy-to-use testing framework.'},
    {'name':'black',          'label':'Black',          'cat':'Dev',        'color':'#2b2d30', 'desc':'The uncompromising Python code formatter.'},
    {'name':'mypy',           'label':'mypy',           'cat':'Dev',        'color':'#2a6db5', 'desc':'Optional static type checker for Python.'},
    {'name':'ruff',           'label':'Ruff',           'cat':'Dev',        'color':'#cc5200', 'desc':'Extremely fast Python linter and formatter.'},
    {'name':'rich',           'label':'Rich',           'cat':'CLI',        'color':'#b5179e', 'desc':'Rich text and beautiful formatting in the terminal.'},
    {'name':'click',          'label':'Click',          'cat':'CLI',        'color':'#2b2d30', 'desc':'Composable command line interface toolkit.'},
    {'name':'typer',          'label':'Typer',          'cat':'CLI',        'color':'#059669', 'desc':'Build CLIs using Python type hints.'},
    # Storage / Cloud
    {'name':'sqlalchemy',     'label':'SQLAlchemy',     'cat':'Database',   'color':'#ca0c0c', 'desc':'SQL toolkit and ORM for Python.'},
    {'name':'redis',          'label':'Redis',          'cat':'Cache',      'color':'#dc382d', 'desc':'Redis database client library.'},
    {'name':'boto3',          'label':'Boto3',          'cat':'Cloud',      'color':'#ff9900', 'desc':'AWS SDK — S3, Lambda, EC2, and more.'},
    {'name':'celery',         'label':'Celery',         'cat':'Tasks',      'color':'#37814a', 'desc':'Distributed task queue and job scheduler.'},
    # Parsing / Formats
    {'name':'pydantic',       'label':'Pydantic',       'cat':'Validation', 'color':'#e92063', 'desc':'Data validation via Python type annotations.'},
    {'name':'PyYAML',         'label':'PyYAML',         'cat':'Format',     'color':'#cc1f1f', 'desc':'YAML parser and emitter for Python.'},
    {'name':'cryptography',   'label':'cryptography',   'cat':'Security',   'color':'#7c3aed', 'desc':'Cryptographic recipes and primitives.'},
    {'name':'paramiko',       'label':'Paramiko',       'cat':'SSH',        'color':'#4a90d9', 'desc':'SSHv2 protocol library for Python.'},
    {'name':'python-dotenv',  'label':'dotenv',         'cat':'Config',     'color':'#eab308', 'desc':'Load environment variables from .env files.'},
    {'name':'pydantic-settings','label':'pydantic-settings','cat':'Config', 'color':'#e92063', 'desc':'Settings management using Pydantic models.'},
]


def _logo_svg(pkg):
    """Generate a branded SVG icon for a package."""
    color  = pkg['color']
    # Use up to 2 chars: first char of each word, or first 2 chars
    words  = re.split(r'[-_ .]', pkg['label'])
    if len(words) >= 2:
        abbrev = (words[0][0] + words[1][0]).upper()
    else:
        abbrev = pkg['label'][:2].upper()
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
        f'<rect width="40" height="40" rx="9" fill="{color}"/>'
        f'<text x="20" y="27" font-size="15" font-weight="700" text-anchor="middle" '
        f'fill="white" font-family="system-ui,ui-sans-serif,sans-serif" letter-spacing="-0.5">'
        f'{abbrev}</text>'
        '</svg>'
    )

# Completed bundles waiting to be downloaded: token -> {path, tmpdir, name, ts}
_bundles = {}
_bundles_lock = threading.Lock()

BUNDLE_TTL = 300  # seconds before an uncollected bundle is deleted


def _cleanup_old():
    cutoff = time.time() - BUNDLE_TTL
    with _bundles_lock:
        for token in list(_bundles):
            if _bundles[token]['ts'] < cutoff:
                shutil.rmtree(_bundles[token]['tmpdir'], ignore_errors=True)
                del _bundles[token]


def _cleanup_loop():
    """Background thread: sweep every minute."""
    while True:
        time.sleep(60)
        _cleanup_old()


def _cleanup_orphans():
    """On startup, remove any bundler_ tmpdirs left over from a previous run."""
    tmp = tempfile.gettempdir()
    for entry in os.listdir(tmp):
        if entry.startswith('bundler_'):
            shutil.rmtree(os.path.join(tmp, entry), ignore_errors=True)


_cleanup_orphans()
threading.Thread(target=_cleanup_loop, daemon=True).start()


def _parse_wheel_versions(files):
    """Return list of (name, version, filename) sorted by name."""
    result = []
    for f in files:
        if f.endswith('.whl'):
            parts = f[:-4].split('-')
            if len(parts) >= 2:
                result.append((parts[0].replace('_', '-'), parts[1], f))
        elif f.endswith('.tar.gz'):
            stem = f[:-7]
            parts = stem.rsplit('-', 1)
            if len(parts) == 2:
                result.append((parts[0].replace('_', '-'), parts[1], f))
    return sorted(result, key=lambda x: x[0].lower())


def _resolve_version(pkg_base, files):
    norm = pkg_base.lower().replace('-', '_')
    for name, ver, _ in _parse_wheel_versions(files):
        if name.lower().replace('-', '_') == norm:
            return ver
    return ''


def _import_name(pkg_base):
    """Return the Python import name for a PyPI package name."""
    key = pkg_base.lower().replace('_', '-')
    if key in IMPORT_NAMES:
        return IMPORT_NAMES[key]
    # Normalize: hyphens → underscores (e.g. my-package → my_package)
    return pkg_base.replace('-', '_')


def _make_demo_py(pkg_install, pkg_base, main_version):
    import_name = _import_name(pkg_base)
    return (
        '#!/usr/bin/env python3\n'
        f'"""Demo — proves that {pkg_install} installed correctly from the offline bundle."""\n'
        'import sys\n'
        'import importlib.metadata\n\n'
        f'PKG_INSTALL = {repr(pkg_base)}\n'
        f'PKG_IMPORT  = {repr(import_name)}\n\n'
        'print(f"Python {sys.version}")\n'
        'print()\n\n'
        'try:\n'
        '    mod = __import__(PKG_IMPORT)\n'
        'except ImportError as e:\n'
        '    print(f"FAIL  could not import \'{{}}\': {{}}" .format(PKG_IMPORT, e))\n'
        '    sys.exit(1)\n\n'
        'try:\n'
        '    version = importlib.metadata.version(PKG_INSTALL)\n'
        'except Exception:\n'
        '    version = getattr(mod, "__version__", "unknown")\n\n'
        'mod_file = getattr(mod, "__file__", "built-in")\n'
        'print(f"OK    {PKG_INSTALL}=={version}")\n'
        'print(f"      {mod_file}")\n'
    )


def _make_demo_sh(pkg_install):
    return (
        '#!/bin/bash\n'
        'set -e\n'
        'PYTHON="${PYTHON:-python3}"\n'
        'cd "$(dirname "$0")"\n\n'
        'echo "==> Setting up virtual environment..."\n'
        '"$PYTHON" -m venv venv\n'
        'source venv/bin/activate\n\n'
        'echo "==> Installing packages from bundle..."\n'
        f'pip install --quiet --no-index --find-links packages/ "{pkg_install}"\n\n'
        'echo "==> Running demo.py..."\n'
        'python demo.py\n'
        f'echo ""\n'
        f'echo "✓ demo.py executed successfully — {pkg_install} was loaded by the Python interpreter."\n'
    )


def _build_scripts(pkg, pyver, plat, files, pkg_base, main_version):
    setup_sh = (
        '#!/bin/bash\n'
        'set -e\n'
        'PYTHON="${PYTHON:-python3}"\n'
        'echo "==> Creating virtual environment..."\n'
        '"$PYTHON" -m venv venv\n'
        'source venv/bin/activate\n'
        f'echo "==> Installing {pkg} from local packages..."\n'
        f'pip install --no-index --find-links packages/ "{pkg}"\n'
        'echo ""\n'
        'echo "Done!  Activate with:  source venv/bin/activate"\n'
    )
    setup_bat = (
        '@echo off\n'
        'setlocal\n'
        'echo =^> Creating virtual environment...\n'
        'python -m venv venv\n'
        'call venv\\Scripts\\activate.bat\n'
        f'echo =^> Installing {pkg} from local packages...\n'
        f'pip install --no-index --find-links packages/ "{pkg}"\n'
        'echo.\n'
        'echo Done!  Activate with:  call venv\\Scripts\\activate.bat\n'
    )

    generated = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    components = _parse_wheel_versions(files)
    norm_base  = pkg_base.lower().replace('-', '_')

    col_w = max((len(n) for n, _, _ in components), default=10) + 2
    sbom_lines = []
    for name, ver, _ in components:
        role = '(main)' if name.lower().replace('-', '_') == norm_base else '(dependency)'
        sbom_lines.append(f'  {name:<{col_w}} {ver:<20} {role}')

    divider = '─' * 56
    readme = (
        '═' * 56 + '\n'
        '  XIMG PYTHON BUNDLE — SOFTWARE BILL OF MATERIALS\n'
        + '═' * 56 + '\n'
        f'Generated:    {generated}\n'
        f'Source:       https://python-bundler.ximg.app\n'
        f'Package:      {pkg_base} {main_version}\n'
        f'Python:       {pyver}\n'
        f'Platform:     {PLATFORMS[plat]} ({plat})\n'
        f'Components:   {len(components)}\n'
        + divider + '\n'
        'COMPONENTS\n'
        + divider + '\n'
        + '\n'.join(sbom_lines) + '\n'
        + divider + '\n\n'
        'USAGE (Linux / macOS)\n'
        + divider + '\n'
        '  ./setup.sh                       # create venv + install packages\n'
        '  source venv/bin/activate         # activate in current shell\n\n'
        '  # Or run the full demo in one step:\n'
        '  ./demo.sh\n\n'
        '  Note: setup.sh and demo.sh create + activate the venv internally,\n'
        '  but activation does not persist to your calling shell. Run\n'
        '  "source venv/bin/activate" afterwards to use the packages\n'
        '  interactively.\n\n'
        'USAGE (Windows)\n'
        + divider + '\n'
        '  setup.bat\n'
        '  call venv\\Scripts\\activate.bat   # activate in current shell\n\n'
        'MANUAL INSTALL\n'
        + divider + '\n'
        '  Linux / macOS:\n'
        '    python3 -m venv venv\n'
        '    source venv/bin/activate\n'
        f'    pip install --no-index --find-links packages/ "{pkg}"\n\n'
        '  Windows:\n'
        '    python -m venv venv\n'
        '    venv\\Scripts\\activate.bat\n'
        f'    pip install --no-index --find-links packages/ "{pkg}"\n'
        + '═' * 56 + '\n'
    )
    return setup_sh, setup_bat, readme


HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Python Bundler — python-bundler.ximg.app</title>
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

    /* ── sub-nav ── */
    .snav{display:flex;gap:.25rem;margin-bottom:1.6rem;
          background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.07);
          border-radius:10px;padding:.3rem}
    .snav-btn{flex:1;background:none;border:none;color:#64748b;font-size:.82rem;
              font-weight:600;padding:.5rem .75rem;border-radius:7px;cursor:pointer;
              transition:all .15s;letter-spacing:.01em;width:auto;margin-top:0;white-space:nowrap}
    .snav-btn.active{background:#1e293b;color:#f1f5f9;
                     box-shadow:0 1px 4px rgba(0,0,0,.4)}
    .snav-btn:hover:not(.active){color:#cbd5e1}

    /* ── bundle form card ── */
    .card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.07);
          border-radius:14px;padding:2rem;width:100%;max-width:680px;backdrop-filter:blur(8px)}
    label{display:block;color:#94a3b8;font-size:.75rem;font-weight:700;
          letter-spacing:.07em;text-transform:uppercase;margin-bottom:.4rem;margin-top:1.3rem}
    label:first-of-type{margin-top:0}
    input,select{width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);
                 border-radius:7px;color:#e2e8f0;font-size:.95rem;padding:.6rem .85rem;
                 outline:none;transition:border-color .15s}
    input:focus,select:focus{border-color:#3b82f6}
    select option{background:#1e293b}
    .hint{color:#475569;font-size:.75rem;margin-top:.35rem;line-height:1.5}
    code{background:rgba(255,255,255,.07);border-radius:3px;padding:.1em .3em;font-size:.85em}
    button{width:100%;margin-top:1.8rem;background:#2563eb;color:#fff;border:none;
           border-radius:7px;font-size:1rem;font-weight:700;padding:.8rem;
           cursor:pointer;transition:background .15s,opacity .15s;letter-spacing:.01em}
    button:hover:not(:disabled){background:#1d4ed8}
    button:disabled{opacity:.55;cursor:not-allowed}

    /* ── terminal ── */
    #terminal{display:none;margin-top:1.4rem;border-radius:10px;overflow:hidden;
              border:1px solid rgba(255,255,255,.08)}
    .term-bar{background:#1e2433;padding:.45rem .75rem;display:flex;align-items:center;gap:.4rem}
    .dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
    .dot-r{background:#ef4444}.dot-y{background:#eab308}.dot-g{background:#22c55e}
    .term-title{flex:1;text-align:center;font-size:.72rem;color:#64748b;
                font-family:monospace;letter-spacing:.03em;margin-right:28px}
    #term-out{background:#0d1117;padding:.85rem 1rem;height:260px;overflow-y:auto;
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
    #status.info{background:rgba(59,130,246,.12);color:#93c5fd;
                 border:1px solid rgba(59,130,246,.25);display:block}
    #status.error{background:rgba(239,68,68,.12);color:#fca5a5;
                  border:1px solid rgba(239,68,68,.25);display:block}
    #status.ok{background:rgba(34,197,94,.12);color:#86efac;
               border:1px solid rgba(34,197,94,.25);display:block}

    /* ── packages panel ── */
    #view-packages{display:none;width:100%;max-width:900px}
    .pkg-search-wrap{position:relative;margin-bottom:1.2rem}
    .pkg-search-wrap input{background:rgba(15,23,42,.8);border:1px solid rgba(255,255,255,.1);
                           border-radius:9px;color:#e2e8f0;font-size:.9rem;
                           padding:.65rem 1rem .65rem 2.4rem;outline:none;
                           transition:border-color .15s;width:100%}
    .pkg-search-wrap input:focus{border-color:#3b82f6}
    .pkg-search-icon{position:absolute;left:.75rem;top:50%;transform:translateY(-50%);
                     color:#475569;font-size:.9rem;pointer-events:none}
    .pkg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.75rem}
    .pkg-card{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.07);
              border-radius:11px;padding:1rem 1.1rem;display:flex;flex-direction:column;
              gap:.5rem;transition:border-color .15s,background .15s;cursor:default}
    .pkg-card:hover{border-color:rgba(59,130,246,.35);background:rgba(30,41,59,.8)}
    .pkg-card-top{display:flex;align-items:center;gap:.7rem}
    .pkg-logo{width:36px;height:36px;border-radius:8px;flex-shrink:0;object-fit:contain}
    .pkg-name{font-weight:700;font-size:.88rem;color:#f1f5f9}
    .pkg-cat{font-size:.65rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
             background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
             border-radius:4px;padding:.1em .45em;color:#94a3b8;margin-left:auto;
             white-space:nowrap;flex-shrink:0}
    .pkg-desc{font-size:.75rem;color:#64748b;line-height:1.45;flex:1}
    .pkg-bundle-btn{margin-top:.3rem;background:none;border:1px solid rgba(56,189,248,.25);
                    border-radius:6px;color:#38bdf8;font-size:.75rem;font-weight:600;
                    padding:.35rem .8rem;cursor:pointer;transition:all .15s;
                    text-align:center;width:100%}
    .pkg-bundle-btn:hover{background:rgba(56,189,248,.1);border-color:#38bdf8}
    .pkg-none{color:#475569;text-align:center;padding:3rem;font-size:.88rem;
              grid-column:1/-1}
  </style>
</head>
<body>
  <div class="hero">
    <div class="hero-icon">🐍</div>
    <h1>Python Bundler</h1>
    <p class="subtitle">Bundle any PyPI package + dependencies for offline installation</p>
  </div>

  <!-- sub-nav -->
  <div class="snav">
    <button class="snav-btn active" id="nav-bundle"   onclick="setView('bundle')">Bundle</button>
    <button class="snav-btn"        id="nav-packages" onclick="setView('packages')">Top Packages</button>
    <button class="snav-btn"        id="nav-install"  onclick="setView('install')">How to Install</button>
  </div>

  <!-- ── Bundle view ── -->
  <div id="view-bundle">
    <div class="card">
      <label for="pkg">Package Name</label>
      <input type="text" id="pkg" placeholder="e.g. requests, numpy, flask==3.0.0"
             autocomplete="off" spellcheck="false">
      <p class="hint">PyPI package name. Version pinning supported: <code>requests==2.31.0</code>, <code>flask&gt;=3.0</code></p>

      <label for="pyver">Python Version</label>
      <select id="pyver">
        <option value="3.13">Python 3.13</option>
        <option value="3.12" selected>Python 3.12</option>
        <option value="3.11">Python 3.11</option>
        <option value="3.10">Python 3.10</option>
        <option value="3.9">Python 3.9</option>
      </select>

      <label for="plat">Target Platform</label>
      <select id="plat">
        <option value="linux_x86_64" selected>Linux x86-64</option>
        <option value="linux_aarch64">Linux ARM64</option>
        <option value="win_amd64">Windows x64</option>
        <option value="macosx_11_0_arm64">macOS ARM64 (Apple Silicon)</option>
        <option value="macosx_10_9_x86_64">macOS x86-64 (Intel)</option>
        <option value="any">Any / Pure Python</option>
      </select>
      <p class="hint">Platform builds require binary wheels on PyPI. Use <code>Any / Pure Python</code>
        for pure-Python packages or if the platform-specific download fails.</p>

      <button id="btn" onclick="go()">Bundle &amp; Download</button>

      <div style="margin-top:.75rem;padding:.6rem .85rem;background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.2);border-radius:6px;font-size:.78rem;color:#94a3b8;display:flex;align-items:flex-start;gap:.5rem">
        <span style="color:#00ff88;flex-shrink:0">&#x1F6E1;</span>
        <span>Every bundle is scanned with <strong style="color:#00ff88">ClamAV</strong> before download. If malware or a virus signature is detected, the bundle is <strong style="color:#ff4444">blocked</strong> and never served. A <code>scan_results.txt</code> report is included in every zip.</span>
      </div>

      <div id="terminal">
        <div class="term-bar">
          <span class="dot dot-r"></span>
          <span class="dot dot-y"></span>
          <span class="dot dot-g"></span>
          <span class="term-title" id="term-title">bundler</span>
        </div>
        <div id="term-out"></div>
      </div>

      <div id="status"></div>
    </div>
  </div>

  <!-- ── Packages view ── -->
  <div id="view-packages">
    <div class="pkg-search-wrap">
      <span class="pkg-search-icon">🔍</span>
      <input type="text" id="pkg-search" placeholder="Filter packages…"
             autocomplete="off" spellcheck="false" oninput="renderPkgs()">
    </div>
    <div class="pkg-grid" id="pkg-grid"></div>
  </div>

  <!-- ── Install instructions view ── -->
  <div id="view-install" style="display:none;width:100%;max-width:900px;margin:0 auto">
    <div class="card" style="max-width:none">
      <h2 style="font-size:1.1rem;font-weight:700;color:#f1f5f9;margin-bottom:1.4rem">After Downloading the Zip</h2>
      <ol style="list-style:none;padding:0;display:flex;flex-direction:column;gap:1.1rem">
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#3b82f6;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">1</span>
          <div><strong style="color:#f1f5f9">Locate the file</strong><br><span style="color:#94a3b8;font-size:.85rem">Open your Downloads folder and find the <code>.zip</code> file.</span></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#3b82f6;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">2</span>
          <div><strong style="color:#f1f5f9">Extract it</strong><br><span style="color:#94a3b8;font-size:.85rem">Double-click the zip to extract, or run:</span><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">unzip &lt;filename&gt;.zip</code></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#3b82f6;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">3</span>
          <div><strong style="color:#f1f5f9">Open a terminal in the folder</strong><br><span style="color:#94a3b8;font-size:.85rem">Right-click the extracted folder and choose "Open Terminal here", or run:</span><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">cd &lt;extracted-folder-name&gt;</code></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#3b82f6;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">4</span>
          <div><strong style="color:#f1f5f9">Run the setup script</strong><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">./setup.sh &amp;&amp; source venv/bin/activate</code><span style="color:#94a3b8;font-size:.85rem;display:block;margin-top:.2rem">Windows: <code>setup.bat &amp;&amp; call venv\Scripts\activate.bat</code></span><span style="color:#94a3b8;font-size:.85rem;display:block;margin-top:.4rem">Your packages are installed in a virtual environment — no internet needed.</span></div>
        </li>
      </ol>
      <div style="margin-top:1.4rem;padding:.8rem 1rem;background:#0d1117;border-radius:8px;border:1px solid rgba(255,255,255,.07)">
        <span style="color:#64748b;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Or install manually</span>
        <code style="display:block;margin-top:.4rem;font-size:.82rem;color:#c9d1d9">pip install --no-index --find-links packages/ &lt;package-name&gt;</code>
      </div>
    </div>
  </div>

  <script>
    /* ── view switching ── */
    function setView(v) {
      document.getElementById('view-bundle').style.display   = v === 'bundle'   ? 'block' : 'none';
      document.getElementById('view-packages').style.display = v === 'packages' ? 'block' : 'none';
      document.getElementById('view-install').style.display  = v === 'install'  ? 'block' : 'none';
      document.getElementById('nav-bundle').classList.toggle('active',   v === 'bundle');
      document.getElementById('nav-packages').classList.toggle('active', v === 'packages');
      document.getElementById('nav-install').classList.toggle('active',  v === 'install');
      if (v === 'packages') renderPkgs();
    }

    /* ── packages data (injected server-side) ── */
    const PKGS = PACKAGES_JSON;

    function renderPkgs() {
      const q    = (document.getElementById('pkg-search').value || '').toLowerCase();
      const grid = document.getElementById('pkg-grid');
      const filtered = q
        ? PKGS.filter(p => p.name.toLowerCase().includes(q) ||
                           p.cat.toLowerCase().includes(q)  ||
                           p.desc.toLowerCase().includes(q))
        : PKGS;

      if (!filtered.length) {
        grid.innerHTML = '<div class="pkg-none">No packages match your search.</div>';
        return;
      }

      grid.innerHTML = filtered.map(p => `
        <div class="pkg-card">
          <div class="pkg-card-top">
            <img class="pkg-logo" src="/logo/${encodeURIComponent(p.name)}.svg" alt="${p.name}"
                 onerror="this.style.display='none'">
            <span class="pkg-name">${p.label}</span>
            <span class="pkg-cat">${p.cat}</span>
          </div>
          <div class="pkg-desc">${p.desc}</div>
          <button class="pkg-bundle-btn" data-pkg="${p.name}" onclick="pickPkg(this.dataset.pkg)">Bundle →</button>
        </div>`).join('');
    }

    function pickPkg(name) {
      document.getElementById('pkg').value = name;
      setView('bundle');
      document.getElementById('pkg').focus();
    }

    /* ── terminal ── */
    const termEl  = document.getElementById('terminal');
    const outEl   = document.getElementById('term-out');
    const titleEl = document.getElementById('term-title');
    let   cursorEl = null;

    function termShow(pkg) {
      titleEl.textContent = `pip download ${pkg}`;
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
      if (text.startsWith('$'))                                              return 'line-cmd';
      if (/^(Collecting|Downloading|Installing|Saved|Successfully)/i.test(text)) return 'line-ok';
      if (/error|warning/i.test(text))                                      return 'line-err';
      if (/^\s*(Looking|Processing|Requirement|Using)/i.test(text))         return 'line-dim';
      return '';
    }

    /* ── bundle & download ── */
    async function go() {
      const pkg   = document.getElementById('pkg').value.trim();
      const pyver = document.getElementById('pyver').value;
      const plat  = document.getElementById('plat').value;
      const btn   = document.getElementById('btn');

      if (!pkg) { show('error', 'Enter a package name.'); return; }

      btn.disabled = true;
      btn.textContent = 'Bundling…';
      hideStatus();
      termShow(pkg);

      try {
        const fd = new FormData();
        fd.append('package', pkg);
        fd.append('python_version', pyver);
        fd.append('platform', plat);

        const resp = await fetch('/bundle', { method: 'POST', body: fd });
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
              if (line.startsWith('event: ')) evtType = line.slice(7).trim();
              else if (line.startsWith('data: ')) evtData = line.slice(6);
            }
            if (evtType === 'done')        token  = evtData;
            else if (evtType === 'error')  errMsg = evtData;
            else if (evtData !== '')       termLine(evtData, lineClass(evtData));
          }
        }

        termDone();
        if (errMsg) { show('error', errMsg); return; }
        if (token) {
          window.location.href = `/download/${token}`;
          show('ok', '✓ Download started — check your downloads folder.\n\nInstall:\n  Linux/macOS:  ./setup.sh && source venv/bin/activate\n  Windows:      setup.bat && call venv\\Scripts\\activate.bat');
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
      if (e.key === 'Enter') go();
    });
  </script>
  <script src="/shared/nav.js?v=2"></script>
</body>
</html>
"""


@app.route('/favicon.svg')
def favicon():
    return Response(FAVICON_SVG, mimetype='image/svg+xml')


@app.route('/logo/<name>.svg')
def logo(name):
    pkg = next((p for p in PACKAGES if p['name'].lower() == name.lower()), None)
    if not pkg:
        # Generic gray icon for unknown packages
        pkg = {'label': name[:2], 'color': '#334155'}
    return Response(_logo_svg(pkg), mimetype='image/svg+xml',
                    headers={'Cache-Control': 'public, max-age=86400'})


@app.route('/')
def index():
    # Inject package list as JSON into the page
    pkgs_json = _json.dumps([
        {'name': p['name'], 'label': p['label'], 'cat': p['cat'],
         'color': p['color'], 'desc': p['desc']}
        for p in PACKAGES
    ])
    return HTML.replace('PACKAGES_JSON', pkgs_json)


@app.route('/bundle', methods=['POST'])
def bundle():
    pkg   = request.form.get('package', '').strip()
    pyver = request.form.get('python_version', '3.12').strip()
    plat  = request.form.get('platform', 'linux_x86_64').strip()

    if not pkg or not PACKAGE_RE.match(pkg):
        return jsonify({'error': 'Invalid package name.'}), 400
    if pyver not in PYTHON_VERSIONS:
        return jsonify({'error': 'Invalid Python version.'}), 400
    if plat not in PLATFORMS:
        return jsonify({'error': 'Invalid platform.'}), 400

    client_ip = request.remote_addr or ''
    pybin = f'python{pyver}'  # e.g. python3.9 — markers evaluate against this interpreter

    if plat == 'any':
        cmd = [pybin, '-m', 'pip', 'download', '-d', None, pkg]
    else:
        platform_flags = []
        for tag in PLATFORM_TAGS[plat]:
            platform_flags += ['--platform', tag]
        cmd = (
            [pybin, '-m', 'pip', 'download']
            + platform_flags
            + ['--only-binary', ':all:',
               '--implementation', 'cp',
               '-d', None,
               pkg]
        )

    @stream_with_context
    def generate():
        tmpdir = tempfile.mkdtemp(prefix='bundler_')
        pkg_dir = os.path.join(tmpdir, 'packages')
        os.makedirs(pkg_dir)

        # fill in the pkg_dir placeholder
        actual_cmd = [pkg_dir if c is None else c for c in cmd]

        yield f'data: $ {" ".join(actual_cmd)}\n\n'
        yield 'data: \n\n'

        try:
            proc = subprocess.Popen(
                actual_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    yield f'data: {line}\n\n'
            proc.wait()

            if proc.returncode != 0:
                yield 'data: \n\n'
                yield 'data: ✗ pip exited with error\n\n'
                yield 'event: error\ndata: pip download failed — see terminal output above\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            files = sorted(os.listdir(pkg_dir))
            if not files:
                yield 'event: error\ndata: No packages downloaded — check the package name\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            yield 'data: \n\n'
            yield f'data: Downloaded {len(files)} package(s).\n\n'

            # ── ClamAV scan ───────────────────────────────────────────
            yield 'data: 🛡 Scanning with ClamAV...\n\n'
            _scan_results = []
            _clam_ok = True
            for _f in files:
                _res = _clam_scan_file(os.path.join(pkg_dir, _f))
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
                yield 'event: error\ndata: Bundle blocked — malware detected in downloaded packages\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return
            if _clam_ok:
                yield f'data: ✓ All {len(_scan_results)} file(s) clean\n\n'
            _scan_ts = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            _scan_report = 'ClamAV Scan Report\nGenerated: ' + _scan_ts + '\n\n' + (
                '\n'.join(f'{_f}: {_r or "SKIPPED (unavailable)"}' for _f, _r in _scan_results)
                if _scan_results else 'Scan skipped — ClamAV unavailable'
            ) + '\n'

            yield 'data: \n\n'
            yield 'data: Zipping...\n\n'

            pkg_base  = re.split(r'[><=!~\s]', pkg)[0]
            safe_pkg  = re.sub(r'[^A-Za-z0-9._-]', '_', pkg_base)
            ver       = _resolve_version(pkg_base, files)
            ver_tag   = f'-{ver}' if ver else ''

            setup_sh, setup_bat, readme = _build_scripts(pkg, pyver, plat, files, pkg_base, ver)
            demo_py = _make_demo_py(pkg, pkg_base, ver)
            demo_sh = _make_demo_sh(pkg)
            for fname, content in [
                ('setup.sh',  setup_sh),
                ('setup.bat', setup_bat),
                ('demo.py',   demo_py),
                ('demo.sh',   demo_sh),
                ('README.txt', readme),
            ]:
                with open(os.path.join(tmpdir, fname), 'w', newline='\n') as fh:
                    fh.write(content)

            ver_nodot  = pyver.replace('.', '')
            bundle_dir = f'ximg-app-py-bundle-{safe_pkg}{ver_tag}-py{ver_nodot}-{plat}'
            zip_name   = f'{bundle_dir}.zip'
            zip_path   = os.path.join(tmpdir, zip_name)

            def _exec_entry(arc_path, src_path):
                """Add a file to the zip with -rwxr-xr-x permissions."""
                info = zipfile.ZipInfo(arc_path)
                info.external_attr = 0o100755 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(src_path, 'rb') as fh:
                    zf.writestr(info, fh.read())

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in files:
                    zf.write(os.path.join(pkg_dir, f), f'{bundle_dir}/packages/{f}')
                    yield f'data:   + packages/{f}\n\n'
                _exec_entry(f'{bundle_dir}/setup.sh',  os.path.join(tmpdir, 'setup.sh'))
                _exec_entry(f'{bundle_dir}/demo.sh',   os.path.join(tmpdir, 'demo.sh'))
                zf.write(os.path.join(tmpdir, 'setup.bat'),  f'{bundle_dir}/setup.bat')
                zf.write(os.path.join(tmpdir, 'demo.py'),    f'{bundle_dir}/demo.py')
                zf.write(os.path.join(tmpdir, 'README.txt'), f'{bundle_dir}/README.txt')
                zf.writestr(f'{bundle_dir}/scan_results.txt', _scan_report)

            token = uuid.uuid4().hex
            with _bundles_lock:
                _bundles[token] = {'path': zip_path, 'tmpdir': tmpdir, 'name': zip_name, 'ts': time.time(),
                                   'ip': client_ip, 'package': pkg, 'extra': f'{pyver}-{plat}'}

            yield 'data: \n\n'
            yield f'data: ✓ Bundle ready: {zip_name}\n\n'
            yield f'event: done\ndata: {token}\n\n'

        except Exception as e:
            shutil.rmtree(tmpdir, ignore_errors=True)
            yield f'event: error\ndata: {e}\n\n'

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


@app.route('/download/<token>')
def download(token):
    with _bundles_lock:
        info = _bundles.pop(token, None)
    if not info:
        return 'Bundle not found or already downloaded', 404

    _log_bundle_download('python', info.get('ip', ''), info.get('package', ''),
                          info.get('extra', ''),
                          os.path.getsize(info['path']) / 1_048_576)

    @after_this_request
    def cleanup(response):
        shutil.rmtree(info['tmpdir'], ignore_errors=True)
        return response

    return send_file(
        info['path'],
        mimetype='application/zip',
        as_attachment=True,
        download_name=info['name'],
    )


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3004, threaded=True)
