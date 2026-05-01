import datetime
import json as _json
import os
import re
import shutil
import socket
import struct
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

# NuGet package IDs: letters, numbers, dots, hyphens, underscores
PACKAGE_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')

FRAMEWORKS = {
    'net8.0':         '.NET 8.0 (LTS)',
    'net6.0':         '.NET 6.0 (LTS)',
    'net48':          '.NET Framework 4.8',
    'netstandard2.1': '.NET Standard 2.1',
    'netstandard2.0': '.NET Standard 2.0',
}

PACKAGES = [
    {'name': 'Newtonsoft.Json',                   'label': 'Newtonsoft.Json',           'cat': 'serialization', 'color': '#1e90ff', 'desc': 'The most widely used JSON library for .NET'},
    {'name': 'Microsoft.EntityFrameworkCore',      'label': 'EF Core',                   'cat': 'database',      'color': '#9c27b0', 'desc': 'Modern object-database mapper for .NET'},
    {'name': 'Serilog',                            'label': 'Serilog',                   'cat': 'logging',       'color': '#2196f3', 'desc': 'Structured, diagnostic logging for .NET'},
    {'name': 'AutoMapper',                         'label': 'AutoMapper',                'cat': 'mapping',       'color': '#ff9800', 'desc': 'Convention-based object-to-object mapper'},
    {'name': 'Dapper',                             'label': 'Dapper',                    'cat': 'database',      'color': '#4caf50', 'desc': 'Lightweight micro-ORM for .NET'},
    {'name': 'Polly',                              'label': 'Polly',                     'cat': 'resilience',    'color': '#e91e63', 'desc': 'Resilience and transient-fault-handling library'},
    {'name': 'FluentValidation',                   'label': 'FluentValidation',          'cat': 'validation',    'color': '#ff5722', 'desc': 'Strongly-typed validation rules using a fluent API'},
    {'name': 'MediatR',                            'label': 'MediatR',                   'cat': 'patterns',      'color': '#795548', 'desc': 'Simple mediator implementation for .NET'},
    {'name': 'xunit',                              'label': 'xUnit',                     'cat': 'testing',       'color': '#607d8b', 'desc': 'Free, open-source unit testing framework'},
    {'name': 'Moq',                                'label': 'Moq',                       'cat': 'testing',       'color': '#9e9e9e', 'desc': 'Mocking framework for .NET'},
    {'name': 'StackExchange.Redis',                'label': 'StackExchange.Redis',       'cat': 'caching',       'color': '#f44336', 'desc': 'High-performance Redis client'},
    {'name': 'RestSharp',                          'label': 'RestSharp',                 'cat': 'http',          'color': '#3f51b5', 'desc': 'Simple REST and HTTP API client for .NET'},
    {'name': 'Microsoft.Extensions.DependencyInjection', 'label': 'DI Extensions',      'cat': 'di',            'color': '#00bcd4', 'desc': 'Microsoft dependency injection container'},
    {'name': 'Bogus',                              'label': 'Bogus',                     'cat': 'testing',       'color': '#8bc34a', 'desc': 'Fake data generator for .NET'},
    {'name': 'NUnit',                              'label': 'NUnit',                     'cat': 'testing',       'color': '#ffc107', 'desc': 'Classic unit testing framework for .NET'},
    {'name': 'CsvHelper',                          'label': 'CsvHelper',                 'cat': 'serialization', 'color': '#009688', 'desc': 'Read and write CSV files'},
    {'name': 'FluentAssertions',                   'label': 'FluentAssertions',          'cat': 'testing',       'color': '#673ab7', 'desc': 'Natural test assertions for .NET'},
    {'name': 'Microsoft.AspNetCore.Authentication.JwtBearer', 'label': 'JWT Bearer',    'cat': 'security',      'color': '#ff6f00', 'desc': 'JWT Bearer token authentication middleware'},
]

# ── Bundle store ──────────────────────────────────────────────────────────────
_bundles      = {}
_bundles_lock = threading.Lock()
BUNDLE_TTL    = 300  # 5 min

def _cleanup_old():
    cutoff = time.time() - BUNDLE_TTL
    with _bundles_lock:
        for tok in list(_bundles):
            if _bundles[tok]['ts'] < cutoff:
                shutil.rmtree(_bundles[tok]['tmpdir'], ignore_errors=True)
                del _bundles[tok]

def _cleanup_loop():
    while True:
        time.sleep(60)
        _cleanup_old()

def _cleanup_orphans():
    tmp = tempfile.gettempdir()
    for entry in os.listdir(tmp):
        if entry.startswith('nugetbundle_'):
            shutil.rmtree(os.path.join(tmp, entry), ignore_errors=True)

_cleanup_orphans()
threading.Thread(target=_cleanup_loop, daemon=True).start()

# ── ClamAV ────────────────────────────────────────────────────────────────────
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

# ── HTML ──────────────────────────────────────────────────────────────────────
FAVICON_SVG = open(os.path.join(os.path.dirname(__file__), 'favicon.svg')).read()

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NuGet Bundler — ximg.app</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
:root{--accent:#004880;--accent2:#0078d4;--bg:#080b0e;--card:#0f1318;--border:rgba(255,255,255,.08);--text:#c9d1d9;--muted:#5a6070}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;padding-top:52px}
a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}
.hero{text-align:center;padding:3.5rem 1rem 2rem}
.hero h1{font-size:2.2rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.5rem}
.hero h1 span{color:var(--accent2)}
.hero p{color:var(--muted);max-width:520px;margin:.6rem auto 0;font-size:1rem;line-height:1.6}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:2rem;max-width:680px;margin:0 auto 2rem;box-shadow:0 4px 24px rgba(0,0,0,.4)}
label{display:block;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.35rem;font-family:'Courier New',monospace}
input,select{width:100%;background:#0d1117;border:1px solid rgba(255,255,255,.12);border-radius:6px;color:var(--text);padding:.65rem .85rem;font-size:.95rem;outline:none;transition:border-color .2s;margin-bottom:1.1rem}
input:focus,select:focus{border-color:var(--accent2)}
input::placeholder{color:#3a4050}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
button#btn{width:100%;background:var(--accent2);color:#fff;border:none;border-radius:7px;padding:.8rem;font-size:1rem;font-weight:600;cursor:pointer;transition:background .2s,opacity .2s;margin-top:.4rem}
button#btn:hover:not(:disabled){background:#106ebe}
button#btn:disabled{opacity:.5;cursor:default}
.status{border-radius:8px;padding:.75rem 1rem;font-size:.9rem;margin-top:1rem;display:none}
.status.ok{background:rgba(46,160,67,.15);border:1px solid rgba(46,160,67,.35);color:#3fb950}
.status.err{background:rgba(248,81,73,.13);border:1px solid rgba(248,81,73,.35);color:#f85149}
.term-bar{background:#1a1d23;padding:.4rem .75rem;display:flex;align-items:center;gap:.35rem}
.dot{width:11px;height:11px;border-radius:50%;display:inline-block}
.dot-r{background:#ff5f57}.dot-y{background:#febc2e}.dot-g{background:#28c840}
.term-title{font-size:.72rem;color:var(--muted);font-family:'Courier New',monospace;margin-left:.4rem}
#term-out .line-cmd{color:#79c0ff}
#term-out .line-ok{color:#3fb950}
#term-out .line-err{color:#f85149}
#term-out .line-dim{color:#444d56}
.tabs{display:flex;gap:.2rem;border-bottom:1px solid var(--border);margin-bottom:1.5rem}
.tab{background:none;border:none;color:var(--muted);padding:.5rem 1rem;font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:'Courier New',monospace;transition:color .2s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--accent2);border-bottom-color:var(--accent2)}
.pane{display:none}.pane.active{display:block}
.pkg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.6rem;margin-top:.5rem}
.pkg-chip{background:#0d1117;border:1px solid var(--border);border-radius:7px;padding:.6rem .85rem;cursor:pointer;transition:border-color .2s,background .2s;position:relative}
.pkg-chip:hover{border-color:var(--accent2);background:#111820}
.pkg-chip .chip-name{font-size:.82rem;font-weight:600;color:var(--text);margin-bottom:.15rem}
.pkg-chip .chip-desc{font-size:.72rem;color:var(--muted);line-height:1.4}
.pkg-chip .chip-cat{position:absolute;top:.45rem;right:.65rem;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-family:'Courier New',monospace}
.install-block{background:#0d1117;border:1px solid var(--border);border-radius:8px;padding:1.1rem 1.3rem;margin-top:.75rem}
.install-block h4{font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.6rem;font-family:'Courier New',monospace}
.install-block pre{font-size:.8rem;color:var(--text);white-space:pre-wrap;line-height:1.6;font-family:'Fira Code','Cascadia Code','Consolas',monospace}
.section-title{font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.75rem;font-family:'Courier New',monospace}
</style>
</head>
<body>
<div class="hero">
  <h1>NuGet <span>Bundler</span></h1>
  <p>Enter a NuGet package name and download a zip containing all <code>.nupkg</code> files — ready for offline <code>dotnet restore</code> on air-gapped machines.</p>
</div>

<div class="card">
  <div class="tabs">
    <button class="tab active" onclick="switchTab('bundle',this)">Bundle</button>
    <button class="tab" onclick="switchTab('packages',this)">Top Packages</button>
    <button class="tab" onclick="switchTab('install',this)">How to Install</button>
  </div>

  <div id="pane-bundle" class="pane active">
    <label for="pkg">Package Name</label>
    <input type="text" id="pkg" placeholder="e.g. Newtonsoft.Json, Serilog, Dapper" autocomplete="off" spellcheck="false" onkeydown="if(event.key==='Enter')go()">

    <label for="fw">Target Framework</label>
    <select id="fw">
      <option value="net8.0" selected>.NET 8.0 LTS (net8.0)</option>
      <option value="net6.0">.NET 6.0 LTS (net6.0)</option>
      <option value="net48">.NET Framework 4.8 (net48)</option>
      <option value="netstandard2.1">.NET Standard 2.1 (netstandard2.1)</option>
      <option value="netstandard2.0">.NET Standard 2.0 (netstandard2.0)</option>
    </select>

    <button id="btn" onclick="go()">Bundle &amp; Download</button>

    <div id="status" class="status"></div>

    <div id="terminal" style="display:none;margin-top:1.4rem;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.08)">
      <div class="term-bar">
        <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
        <span class="term-title" id="term-title">nuget bundler</span>
      </div>
      <div id="term-out" style="background:#0d1117;padding:.85rem 1rem;height:300px;overflow-y:auto;font-family:'Fira Code','Cascadia Code','Consolas',monospace;font-size:.78rem;line-height:1.55;color:#c9d1d9"></div>
    </div>
  </div>

  <div id="pane-packages" class="pane">
    <p class="section-title">Click a package to pre-fill the form</p>
    <div class="pkg-grid" id="pkg-grid"></div>
  </div>

  <div id="pane-install" class="pane">
    <div class="install-block">
      <h4>Bundle contents</h4>
      <pre>ximg-nuget-bundle-&lt;pkg&gt;-&lt;ver&gt;-&lt;framework&gt;/
  packages/              ← flat directory of .nupkg files
  nuget.config           ← points to ./packages as offline source
  install.ps1            ← Windows PowerShell installer
  install.sh             ← Linux / macOS installer
  README.txt</pre>
    </div>

    <div class="install-block" style="margin-top:.75rem">
      <h4>Windows (PowerShell)</h4>
      <pre>cd ximg-nuget-bundle-&lt;pkg&gt;-...
.\install.ps1</pre>
    </div>

    <div class="install-block" style="margin-top:.75rem">
      <h4>Linux / macOS (bash)</h4>
      <pre>cd ximg-nuget-bundle-&lt;pkg&gt;-...
bash install.sh</pre>
    </div>

    <div class="install-block" style="margin-top:.75rem">
      <h4>Use in your own project</h4>
      <pre># Copy nuget.config to your project root, then:
dotnet restore

# Or restore with an explicit source:
dotnet restore --source /path/to/packages</pre>
    </div>
  </div>
</div>

<script>
const PACKAGES = PACKAGES_JSON;

function switchTab(id, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('pane-' + id).classList.add('active');
}

function buildPkgGrid() {
  const grid = document.getElementById('pkg-grid');
  PACKAGES.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pkg-chip';
    div.innerHTML = `<div class="chip-name" style="color:${p.color}">${p.label}</div><div class="chip-desc">${p.desc}</div><div class="chip-cat">${p.cat}</div>`;
    div.onclick = () => {
      document.getElementById('pkg').value = p.name;
      switchTab('bundle', document.querySelectorAll('.tab')[0]);
    };
    grid.appendChild(div);
  });
}
buildPkgGrid();

function show(type, msg) {
  const s = document.getElementById('status');
  s.className = 'status ' + type;
  s.textContent = msg;
  s.style.display = 'block';
}
function hideStatus() {
  document.getElementById('status').style.display = 'none';
}
function termShow(pkg) {
  document.getElementById('term-title').textContent = 'dotnet restore ' + pkg;
  document.getElementById('terminal').style.display = 'block';
  document.getElementById('term-out').innerHTML = '';
}
function termLine(text, cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  const out = document.getElementById('term-out');
  out.appendChild(d);
  out.scrollTop = out.scrollHeight;
}
function termDone() {}
function lineClass(text) {
  if (/^(==>|\$)/.test(text))                          return 'line-cmd';
  if (/^(✓|Restored|Resolved|Downloaded|Writing)/i.test(text)) return 'line-ok';
  if (/error|warning/i.test(text))                     return 'line-err';
  if (/^(Determining|MSBuild|Build|  \w)/i.test(text)) return 'line-dim';
  return '';
}

async function go() {
  const pkg = document.getElementById('pkg').value.trim();
  const fw  = document.getElementById('fw').value;
  const btn = document.getElementById('btn');
  if (!pkg) { show('err', 'Enter a package name.'); return; }
  btn.disabled = true;
  btn.textContent = 'Bundling\u2026';
  hideStatus();
  termShow(pkg);
  try {
    const fd = new FormData();
    fd.append('package', pkg);
    fd.append('framework', fw);
    const resp = await fetch('/bundle', { method: 'POST', body: fd });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({ error: resp.statusText }));
      termDone();
      show('err', j.error || 'Bundle failed.');
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
    if (errMsg) { show('err', errMsg); return; }
    if (token) {
      window.location.href = '/download/' + token;
      show('ok', '\u2713 Download started. Check your downloads folder.');
    }
  } catch(e) {
    termDone();
    show('err', 'Network error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Bundle & Download';
  }
}
</script>
<script src="/shared/nav.js?v=2"></script>
</body>
</html>
"""

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/favicon.svg')
def favicon():
    return Response(FAVICON_SVG, mimetype='image/svg+xml')

@app.route('/')
def index():
    pkgs_json = _json.dumps([
        {'name': p['name'], 'label': p['label'], 'cat': p['cat'],
         'color': p['color'], 'desc': p['desc']}
        for p in PACKAGES
    ])
    return HTML.replace('PACKAGES_JSON', pkgs_json)

@app.route('/bundle', methods=['POST'])
def bundle():
    pkg = request.form.get('package', '').strip()
    fw  = request.form.get('framework', 'net8.0').strip()

    if not pkg or not PACKAGE_RE.match(pkg):
        return jsonify({'error': 'Invalid package name. Use letters, numbers, dots, hyphens, underscores.'}), 400
    if fw not in FRAMEWORKS:
        return jsonify({'error': 'Invalid framework.'}), 400

    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    fw_label  = FRAMEWORKS[fw]

    @stream_with_context
    def generate():
        tmpdir = tempfile.mkdtemp(prefix='nugetbundle_')
        try:
            proj_dir = os.path.join(tmpdir, 'project')
            cache_dir = os.path.join(tmpdir, 'cache')
            flat_dir  = os.path.join(tmpdir, 'packages')
            os.makedirs(proj_dir)
            os.makedirs(cache_dir)
            os.makedirs(flat_dir)

            # Write minimal .csproj
            csproj = os.path.join(proj_dir, 'bundle.csproj')
            with open(csproj, 'w') as fh:
                fh.write(f'''<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>{fw}</TargetFramework>
    <OutputType>Exe</OutputType>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="{pkg}" Version="*" />
  </ItemGroup>
</Project>
''')

            yield f'data: ==> Resolving {pkg} for {fw_label}...\n\n'
            yield f'data: \n\n'

            cmd = [
                'dotnet', 'restore', csproj,
                '--packages', cache_dir,
                '--no-cache',
                '--verbosity', 'normal',
            ]
            yield f'data: $ {" ".join(cmd)}\n\n'
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    text=True, bufsize=1)
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    yield f'data: {line}\n\n'
            proc.wait()

            if proc.returncode != 0:
                yield 'event: error\ndata: dotnet restore failed — package not found or incompatible with target framework.\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            # Collect all .nupkg files from cache and flatten into packages/
            nupkg_files = []
            for root, _dirs, files in os.walk(cache_dir):
                for fname in files:
                    if fname.endswith('.nupkg'):
                        nupkg_files.append(os.path.join(root, fname))

            if not nupkg_files:
                yield 'event: error\ndata: No .nupkg files found after restore.\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            yield f'data: \n\n'
            yield f'data: ==> Collected {len(nupkg_files)} .nupkg file(s). Flattening...\n\n'

            for src in sorted(nupkg_files):
                fname = os.path.basename(src)
                dst   = os.path.join(flat_dir, fname)
                shutil.copy2(src, dst)
                yield f'data:   + {fname}\n\n'

            # ClamAV scan
            yield f'data: \n\n'
            yield f'data: \U0001f6e1 Scanning with ClamAV...\n\n'
            scan_lines = []
            infected = []
            for src in sorted(nupkg_files):
                fname = os.path.basename(src)
                result = _clam_scan_file(os.path.join(flat_dir, fname))
                if result is None:
                    scan_lines.append(f'{fname}: SKIPPED (ClamAV unavailable)')
                    yield f'data:   \u26a0 {fname} \u2014 ClamAV unavailable, skipping\n\n'
                elif result == 'CLEAN':
                    scan_lines.append(f'{fname}: CLEAN')
                    yield f'data:   \u2713 {fname}\n\n'
                else:
                    scan_lines.append(f'{fname}: INFECTED — {result}')
                    infected.append((fname, result))
                    yield f'data:   \u2717 {fname} \u2014 INFECTED: {result}\n\n'

            if infected:
                yield 'event: error\ndata: Bundle blocked — malware detected by ClamAV.\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            # Resolve version from assets.json
            resolved_ver = ''
            assets_path = os.path.join(proj_dir, 'obj', 'project.assets.json')
            if os.path.exists(assets_path):
                try:
                    with open(assets_path) as fh:
                        assets = _json.load(fh)
                    libs = assets.get('libraries', {})
                    for key in libs:
                        if key.lower().startswith(pkg.lower() + '/'):
                            resolved_ver = key.split('/', 1)[1]
                            break
                except Exception:
                    pass

            ver_tag    = f'-{resolved_ver}' if resolved_ver else ''
            safe_fw    = fw.replace('.', '')
            bundle_dir = f'ximg-nuget-bundle-{pkg}{ver_tag}-{safe_fw}'
            zip_name   = f'{bundle_dir}.zip'
            zip_path   = os.path.join(tmpdir, zip_name)

            # nuget.config
            nuget_config = f'''<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="LocalBundle" value="./packages" />
  </packageSources>
</configuration>
'''

            # install.ps1
            install_ps1 = f'''# NuGet Offline Bundle — install.ps1
# Generated by nuget-bundler.ximg.app
#
# Package : {pkg}{ver_tag}
# Framework: {fw_label}
#
# Usage:
#   1. Copy this entire folder to your target machine.
#   2. Run: .\\install.ps1
#      Or: dotnet restore --source "$PSScriptRoot\\packages"
#
param(
    [string]$ProjectPath = ""
)

$BundleDir  = $PSScriptRoot
$PackageDir = Join-Path $BundleDir "packages"
$ConfigFile = Join-Path $BundleDir "nuget.config"

Write-Host "NuGet Offline Bundle: {pkg}{ver_tag} ({fw_label})" -ForegroundColor Cyan
Write-Host ""
Write-Host "Package source: $PackageDir"
Write-Host ""

if ($ProjectPath -ne "") {{
    Write-Host "Restoring project: $ProjectPath" -ForegroundColor Yellow
    dotnet restore $ProjectPath --source $PackageDir
}} else {{
    Write-Host "To use in your .NET project, run one of:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  # Option A — restore with explicit source:"
    Write-Host "  dotnet restore --source `"$PackageDir`""
    Write-Host ""
    Write-Host "  # Option B — copy nuget.config to your project root, then:"
    Write-Host "  copy `"$ConfigFile`" <your-project-dir>\\nuget.config"
    Write-Host "  dotnet restore"
    Write-Host ""
    Write-Host "  # Option C — add as a permanent local source:"
    Write-Host "  dotnet nuget add source `"$PackageDir`" --name LocalBundle"
    Write-Host "  dotnet restore"
}}
'''

            # install.sh
            install_sh = f'''#!/bin/bash
# NuGet Offline Bundle — install.sh
# Generated by nuget-bundler.ximg.app
#
# Package : {pkg}{ver_tag}
# Framework: {fw_label}

set -e
BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$BUNDLE_DIR/packages"
CONFIG_FILE="$BUNDLE_DIR/nuget.config"

echo "NuGet Offline Bundle: {pkg}{ver_tag} ({fw_label})"
echo ""
echo "Package source: $PACKAGE_DIR"
echo ""

if [ -n "$1" ]; then
    echo "Restoring project: $1"
    dotnet restore "$1" --source "$PACKAGE_DIR"
else
    echo "To use in your .NET project, run one of:"
    echo ""
    echo "  # Option A — restore with explicit source:"
    echo "  dotnet restore --source \\"$PACKAGE_DIR\\""
    echo ""
    echo "  # Option B — copy nuget.config to your project root, then:"
    echo "  cp \\"$CONFIG_FILE\\" <your-project-dir>/nuget.config"
    echo "  dotnet restore"
    echo ""
    echo "  # Option C — add as a permanent local source:"
    echo "  dotnet nuget add source \\"$PACKAGE_DIR\\" --name LocalBundle"
    echo "  dotnet restore"
fi
'''

            readme = f'''NuGet Offline Bundle
====================
Package   : {pkg}{ver_tag}
Framework : {fw_label}
Generated : {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}
Source    : nuget-bundler.ximg.app

Contents
--------
  packages/        .nupkg files ({len(nupkg_files)} files, package + all transitive deps)
  nuget.config     Local NuGet source config pointing to ./packages
  install.ps1      Windows PowerShell installer / usage guide
  install.sh       Linux / macOS bash installer / usage guide
  scan_results.txt ClamAV scan report

Quick Start
-----------
Windows:
  .\\install.ps1

Linux / macOS:
  bash install.sh

Manual (any platform):
  dotnet restore --source ./packages

Packages included
-----------------
''' + '\n'.join(f'  {os.path.basename(f)}' for f in sorted(nupkg_files))

            scan_report = '\n'.join(scan_lines)

            yield f'data: \n\n'
            yield f'data: ==> Zipping {len(nupkg_files)} packages...\n\n'

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in sorted(nupkg_files):
                    fname = os.path.basename(f)
                    zf.write(os.path.join(flat_dir, fname), f'{bundle_dir}/packages/{fname}')
                zf.writestr(f'{bundle_dir}/nuget.config',     nuget_config)
                zf.writestr(f'{bundle_dir}/install.ps1',      install_ps1)
                zf.writestr(f'{bundle_dir}/install.sh',       install_sh)
                zf.writestr(f'{bundle_dir}/README.txt',       readme)
                zf.writestr(f'{bundle_dir}/scan_results.txt', scan_report)

            size_mb = os.path.getsize(zip_path) / 1_048_576
            yield f'data: \n\n'
            yield f'data: \u2713 Bundle ready: {zip_name} ({size_mb:.1f} MB)\n\n'

            token = uuid.uuid4().hex
            with _bundles_lock:
                _bundles[token] = {
                    'path': zip_path, 'tmpdir': tmpdir, 'name': zip_name,
                    'ts': time.time(), 'ip': client_ip,
                    'package': pkg, 'extra': fw,
                }

            yield f'event: done\ndata: {token}\n\n'

        except Exception as exc:
            yield f'event: error\ndata: Internal error: {exc}\n\n'
            shutil.rmtree(tmpdir, ignore_errors=True)

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
        return 'Bundle not found or already downloaded.', 404

    _log_bundle_download('nuget', info.get('ip', ''), info.get('package', ''),
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
    app.run(host='0.0.0.0', port=3008, threaded=True)
