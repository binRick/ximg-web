import datetime
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

FAVICON_SVG = open('/app/favicon.svg', 'rb').read()

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
        f'Source:       https://bundler.ximg.app\n'
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
        '  chmod +x setup.sh\n'
        '  ./setup.sh\n\n'
        'USAGE (Windows)\n'
        + divider + '\n'
        '  setup.bat\n\n'
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
  <title>Python Bundler — bundler.ximg.app</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0e1a;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;
         min-height:100vh;display:flex;flex-direction:column;align-items:center;
         padding:3rem 1rem 4rem}
    .hero{text-align:center;margin-bottom:2.5rem}
    .hero-icon{font-size:3rem;line-height:1;margin-bottom:.5rem}
    h1{font-size:1.9rem;font-weight:800;color:#f8fafc;letter-spacing:-.02em}
    .subtitle{color:#94a3b8;font-size:.9rem;margin-top:.4rem}
    .card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.07);
          border-radius:14px;padding:2rem;width:100%;max-width:560px;backdrop-filter:blur(8px)}
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
  </style>
</head>
<body>
  <div class="hero">
    <div class="hero-icon">🐍</div>
    <h1>Python Bundler</h1>
    <p class="subtitle">Bundle any PyPI package + dependencies for offline installation</p>
  </div>

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

    <!-- terminal -->
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

  <script>
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
      if (text.startsWith('$'))                          return 'line-cmd';
      if (/^(Collecting|Downloading|Installing|Saved|Successfully)/i.test(text)) return 'line-ok';
      if (/error|warning/i.test(text))                  return 'line-err';
      if (/^\s*(Looking|Processing|Requirement|Using)/i.test(text)) return 'line-dim';
      return '';
    }

    async function go() {
      const pkg  = document.getElementById('pkg').value.trim();
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
        let   buf     = '';
        let   token   = null;
        let   errMsg  = null;

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
              else if (line.startsWith('data: '))  evtData = line.slice(6);
            }
            if (evtType === 'done')    { token  = evtData; }
            else if (evtType === 'error') { errMsg = evtData; }
            else if (evtData !== '')   { termLine(evtData, lineClass(evtData)); }
          }
        }

        termDone();

        if (errMsg) {
          show('error', errMsg);
          return;
        }
        if (token) {
          window.location.href = `/download/${token}`;
          show('ok', '✓ Download started — check your downloads folder.\n\nInstall:\n  Linux/macOS:  chmod +x setup.sh && ./setup.sh\n  Windows:      setup.bat');
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


@app.route('/')
def index():
    return HTML


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

    ver_nodot = pyver.replace('.', '')

    if plat == 'any':
        cmd = ['pip', 'download', '-d', None, pkg]
    else:
        cmd = [
            'pip', 'download',
            '--python-version', ver_nodot,
            '--platform', plat,
            '--only-binary', ':all:',
            '--implementation', 'cp',
            '-d', None,
            pkg,
        ]

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
            yield f'data: Downloaded {len(files)} package(s). Zipping...\n\n'

            pkg_base  = re.split(r'[><=!~\s]', pkg)[0]
            safe_pkg  = re.sub(r'[^A-Za-z0-9._-]', '_', pkg_base)
            ver       = _resolve_version(pkg_base, files)
            ver_tag   = f'-{ver}' if ver else ''

            setup_sh, setup_bat, readme = _build_scripts(pkg, pyver, plat, files, pkg_base, ver)
            for fname, content in [('setup.sh', setup_sh), ('setup.bat', setup_bat), ('README.txt', readme)]:
                with open(os.path.join(tmpdir, fname), 'w', newline='\n') as fh:
                    fh.write(content)
            bundle_dir = f'ximg-app-py-bundle-{safe_pkg}{ver_tag}-py{ver_nodot}-{plat}'
            zip_name   = f'{bundle_dir}.zip'
            zip_path   = os.path.join(tmpdir, zip_name)

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in files:
                    zf.write(os.path.join(pkg_dir, f), f'{bundle_dir}/packages/{f}')
                    yield f'data:   + packages/{f}\n\n'
                sh_info = zipfile.ZipInfo(f'{bundle_dir}/setup.sh')
                sh_info.external_attr = 0o100755 << 16  # -rwxr-xr-x
                sh_info.compress_type = zipfile.ZIP_DEFLATED
                with open(os.path.join(tmpdir, 'setup.sh'), 'rb') as fh:
                    zf.writestr(sh_info, fh.read())
                zf.write(os.path.join(tmpdir, 'setup.bat'),  f'{bundle_dir}/setup.bat')
                zf.write(os.path.join(tmpdir, 'README.txt'), f'{bundle_dir}/README.txt')

            token = uuid.uuid4().hex
            with _bundles_lock:
                _bundles[token] = {'path': zip_path, 'tmpdir': tmpdir, 'name': zip_name, 'ts': time.time()}

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
