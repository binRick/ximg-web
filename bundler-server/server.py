import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from flask import Flask, request, send_file, jsonify, Response

app = Flask(__name__)

# Package name + optional PEP 440 version specifier
# e.g. requests, requests==2.31.0, flask>=2.0, numpy~=1.24
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
          border-radius:14px;padding:2rem;width:100%;max-width:520px;backdrop-filter:blur(8px)}
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
    button:hover{background:#1d4ed8}
    button:disabled{opacity:.55;cursor:not-allowed}
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
    <div id="status"></div>
  </div>

  <script>
    async function go() {
      const pkg   = document.getElementById('pkg').value.trim();
      const pyver = document.getElementById('pyver').value;
      const plat  = document.getElementById('plat').value;
      const btn   = document.getElementById('btn');

      if (!pkg) { show('error', 'Enter a package name.'); return; }

      btn.disabled = true;
      btn.textContent = 'Bundling…';
      show('info', `Fetching ${pkg} for Python ${pyver} / ${plat}…\nThis may take 30–60 s for large packages.`);

      try {
        const fd = new FormData();
        fd.append('package', pkg);
        fd.append('python_version', pyver);
        fd.append('platform', plat);

        const r = await fetch('/bundle', { method: 'POST', body: fd });

        if (!r.ok) {
          const j = await r.json().catch(() => ({ error: r.statusText }));
          show('error', j.error || 'Bundle failed.');
          return;
        }

        const blob = await r.blob();
        const cd   = r.headers.get('Content-Disposition') || '';
        const m    = cd.match(/filename[^;=\n]*=(['"]?)([^'"\n]+)\1/);
        const name = m ? m[2] : `${pkg}.zip`;
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
        show('ok', `✓ ${name} downloaded.\n\nInstall:\n  Linux/macOS: chmod +x setup.sh && ./setup.sh\n  Windows:     setup.bat`);
      } catch (e) {
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
        return jsonify({'error': 'Invalid package name. Use letters, digits, hyphens, underscores, dots, and optional version specifier.'}), 400
    if pyver not in PYTHON_VERSIONS:
        return jsonify({'error': 'Invalid Python version.'}), 400
    if plat not in PLATFORMS:
        return jsonify({'error': 'Invalid platform.'}), 400

    ver_nodot = pyver.replace('.', '')   # e.g. "3.12" -> "312"

    tmpdir = tempfile.mkdtemp(prefix='bundler_')
    try:
        pkg_dir = os.path.join(tmpdir, 'packages')
        os.makedirs(pkg_dir)

        if plat == 'any':
            cmd = ['pip', 'download', '-d', pkg_dir, pkg]
        else:
            cmd = [
                'pip', 'download',
                '--python-version', ver_nodot,
                '--platform', plat,
                '--only-binary', ':all:',
                '--implementation', 'cp',
                '-d', pkg_dir,
                pkg,
            ]

        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120
        )

        if result.returncode != 0:
            err = result.stderr.strip() or result.stdout.strip() or 'pip download failed'
            # Trim to last ~800 chars to avoid huge responses
            if len(err) > 800:
                err = '…' + err[-800:]
            return jsonify({'error': err}), 500

        files = sorted(os.listdir(pkg_dir))
        if not files:
            return jsonify({'error': 'No packages downloaded. Check the package name.'}), 500

        # setup.sh
        setup_sh = f'''#!/bin/bash
set -e
PYTHON="${{PYTHON:-python3}}"
echo "==> Creating virtual environment..."
"$PYTHON" -m venv venv
source venv/bin/activate
echo "==> Installing {pkg} from local packages..."
pip install --no-index --find-links packages/ "{pkg}"
echo ""
echo "Done! Activate with:  source venv/bin/activate"
'''

        # setup.bat
        setup_bat = f'''@echo off
setlocal
echo =^> Creating virtual environment...
python -m venv venv
call venv\\Scripts\\activate.bat
echo =^> Installing {pkg} from local packages...
pip install --no-index --find-links packages/ "{pkg}"
echo.
echo Done! Activate with:  call venv\\Scripts\\activate.bat
'''

        # README.txt
        readme = (
            f'Python Bundle: {pkg}\n'
            f'Python version: {pyver}\n'
            f'Platform:       {PLATFORMS[plat]} ({plat})\n'
            f'Packages:       {len(files)}\n\n'
            'Files:\n' +
            ''.join(f'  packages/{f}\n' for f in files) +
            '\nUsage (Linux / macOS):\n'
            '  chmod +x setup.sh\n'
            '  ./setup.sh\n\n'
            'Usage (Windows):\n'
            '  setup.bat\n\n'
            'Manual install:\n'
            '  python -m venv venv\n'
            '  source venv/bin/activate          # or venv\\Scripts\\activate.bat on Windows\n'
            f'  pip install --no-index --find-links packages/ "{pkg}"\n'
        )

        for name, content in [
            ('setup.sh',  setup_sh),
            ('setup.bat', setup_bat),
            ('README.txt', readme),
        ]:
            with open(os.path.join(tmpdir, name), 'w', newline='\n') as fh:
                fh.write(content)

        safe_pkg = re.sub(r'[^A-Za-z0-9._-]', '_', pkg)
        zip_name = f'{safe_pkg}-py{ver_nodot}-{plat}.zip'
        zip_path = os.path.join(tmpdir, zip_name)

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                zf.write(os.path.join(pkg_dir, f), f'packages/{f}')
            zf.write(os.path.join(tmpdir, 'setup.sh'),  'setup.sh')
            zf.write(os.path.join(tmpdir, 'setup.bat'), 'setup.bat')
            zf.write(os.path.join(tmpdir, 'README.txt'), 'README.txt')

        return send_file(
            zip_path,
            mimetype='application/zip',
            as_attachment=True,
            download_name=zip_name,
        )

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Timed out (120 s). The package may be very large — try again or use a smaller package.'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3004, threaded=True)
