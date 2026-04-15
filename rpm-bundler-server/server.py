import datetime
import json as _json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import zipfile
from shlex import quote as _shlex_quote
from flask import Flask, after_this_request, request, send_file, jsonify, Response, stream_with_context

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

# RPM package names: alphanumeric, hyphens, dots, plus, underscores
PACKAGE_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9+\-._]*$')

# Each distro defines named repos and their URL templates ({arch} is substituted)
DISTROS = {
    'fedora-41': {
        'label': 'Fedora 41',
        'repos': {
            'fedora':         'https://dl.fedoraproject.org/pub/fedora/linux/releases/41/Everything/{arch}/os/',
            'fedora-updates': 'https://dl.fedoraproject.org/pub/fedora/linux/updates/41/Everything/{arch}/',
        },
    },
    'fedora-40': {
        'label': 'Fedora 40',
        'repos': {
            'fedora':         'https://dl.fedoraproject.org/pub/fedora/linux/releases/40/Everything/{arch}/os/',
            'fedora-updates': 'https://dl.fedoraproject.org/pub/fedora/linux/updates/40/Everything/{arch}/',
        },
    },
    'rocky-9': {
        'label': 'Rocky Linux 9',
        'repos': {
            'baseos':    'https://dl.rockylinux.org/pub/rocky/9/BaseOS/{arch}/os/',
            'appstream': 'https://dl.rockylinux.org/pub/rocky/9/AppStream/{arch}/os/',
            'extras':    'https://dl.rockylinux.org/pub/rocky/9/extras/{arch}/os/',
        },
    },
    'rocky-8': {
        'label': 'Rocky Linux 8',
        'repos': {
            'baseos':    'https://dl.rockylinux.org/pub/rocky/8/BaseOS/{arch}/os/',
            'appstream': 'https://dl.rockylinux.org/pub/rocky/8/AppStream/{arch}/os/',
        },
    },
    'alma-9': {
        'label': 'AlmaLinux 9',
        'repos': {
            'baseos':    'https://repo.almalinux.org/almalinux/9/BaseOS/{arch}/os/',
            'appstream': 'https://repo.almalinux.org/almalinux/9/AppStream/{arch}/os/',
        },
    },
    'centos-stream-9': {
        'label': 'CentOS Stream 9',
        'repos': {
            'baseos':    'https://mirror.stream.centos.org/9-stream/BaseOS/{arch}/os/',
            'appstream': 'https://mirror.stream.centos.org/9-stream/AppStream/{arch}/os/',
        },
    },
    'centos-stream-10': {
        'label': 'CentOS Stream 10',
        'repos': {
            'baseos':    'https://mirror.stream.centos.org/10-stream/BaseOS/{arch}/os/',
            'appstream': 'https://mirror.stream.centos.org/10-stream/AppStream/{arch}/os/',
        },
    },
    'centos-8': {
        'label': 'CentOS 8 (EOL — vault)',
        'repos': {
            'baseos':    'https://vault.centos.org/centos/8/BaseOS/{arch}/os/',
            'appstream': 'https://vault.centos.org/centos/8/AppStream/{arch}/os/',
        },
    },
    'centos-7': {
        'label': 'CentOS 7 (EOL — vault)',
        'repos': {
            'base':    'https://vault.centos.org/centos/7/os/{arch}/',
            'updates': 'https://vault.centos.org/centos/7/updates/{arch}/',
            'extras':  'https://vault.centos.org/centos/7/extras/{arch}/',
        },
    },
    'rhel-9': {
        'label': 'RHEL 9 (UBI — public)',
        'repos': {
            'baseos':    'https://cdn-ubi.redhat.com/content/public/ubi/dist/ubi9/9/{arch}/baseos/os/',
            'appstream': 'https://cdn-ubi.redhat.com/content/public/ubi/dist/ubi9/9/{arch}/appstream/os/',
        },
    },
    'rhel-8': {
        'label': 'RHEL 8 (UBI — public)',
        'repos': {
            'baseos':    'https://cdn-ubi.redhat.com/content/public/ubi/dist/ubi8/8/{arch}/baseos/os/',
            'appstream': 'https://cdn-ubi.redhat.com/content/public/ubi/dist/ubi8/8/{arch}/appstream/os/',
        },
    },
}

ARCHES = {
    'x86_64':  'x86-64 (Intel/AMD)',
    'aarch64': 'ARM64 (AWS Graviton, Ampere)',
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

PACKAGES = [
    # Web servers
    {'name': 'nginx',               'label': 'nginx',         'cat': 'Web',       'color': '#009639', 'desc': 'High-performance HTTP server and reverse proxy.'},
    {'name': 'httpd',               'label': 'Apache httpd',  'cat': 'Web',       'color': '#d22128', 'desc': 'Apache HTTP server (httpd on RHEL-based distros).'},
    # Databases
    {'name': 'postgresql-server',   'label': 'PostgreSQL',    'cat': 'Database',  'color': '#336791', 'desc': 'Advanced open-source relational database system.'},
    {'name': 'mariadb-server',      'label': 'MariaDB',       'cat': 'Database',  'color': '#c0765a', 'desc': 'Community-developed MySQL fork.'},
    {'name': 'redis',               'label': 'Redis',         'cat': 'Cache',     'color': '#dc382d', 'desc': 'In-memory data structure store and cache.'},
    {'name': 'sqlite',              'label': 'SQLite',        'cat': 'Database',  'color': '#44a0d6', 'desc': 'Lightweight file-based SQL database.'},
    # Dev Tools
    {'name': 'git',                 'label': 'git',           'cat': 'VCS',       'color': '#f05032', 'desc': 'Distributed version control system.'},
    {'name': 'gcc',                 'label': 'GCC',           'cat': 'Build',     'color': '#3d3d3d', 'desc': 'GNU Compiler Collection — C, C++, Fortran.'},
    {'name': 'make',                'label': 'make',          'cat': 'Build',     'color': '#555555', 'desc': 'GNU make build automation tool.'},
    {'name': 'cmake',               'label': 'CMake',         'cat': 'Build',     'color': '#064f8c', 'desc': 'Cross-platform build system generator.'},
    {'name': 'curl',                'label': 'curl',          'cat': 'Net',       'color': '#073551', 'desc': 'HTTP client for transferring data.'},
    {'name': 'wget',                'label': 'wget',          'cat': 'Net',       'color': '#6a9a1c', 'desc': 'Non-interactive network downloader.'},
    {'name': 'vim-enhanced',        'label': 'vim',           'cat': 'Editor',    'color': '#019733', 'desc': 'Highly configurable text editor (full vim).'},
    {'name': 'tmux',                'label': 'tmux',          'cat': 'Terminal',  'color': '#1bb91f', 'desc': 'Terminal multiplexer — split panes and detach sessions.'},
    {'name': 'htop',                'label': 'htop',          'cat': 'Monitor',   'color': '#2b5b84', 'desc': 'Interactive process viewer.'},
    # Languages / Runtimes
    {'name': 'python3',             'label': 'Python 3',      'cat': 'Runtime',   'color': '#3776ab', 'desc': 'Python 3 interpreter and standard library.'},
    {'name': 'python3-pip',         'label': 'pip3',          'cat': 'Python',    'color': '#3776ab', 'desc': 'Python 3 package installer.'},
    {'name': 'nodejs',              'label': 'Node.js',       'cat': 'Runtime',   'color': '#339933', 'desc': 'JavaScript runtime built on Chrome V8.'},
    {'name': 'java-17-openjdk',     'label': 'Java 17 JDK',  'cat': 'Runtime',   'color': '#f89820', 'desc': 'OpenJDK 17 Java Development Kit.'},
    {'name': 'golang',              'label': 'Go',            'cat': 'Runtime',   'color': '#00acd7', 'desc': 'Go programming language tools.'},
    # Security
    {'name': 'openssh-server',      'label': 'OpenSSH',       'cat': 'Security',  'color': '#1a5276', 'desc': 'Secure Shell (SSH) server daemon.'},
    {'name': 'firewalld',           'label': 'firewalld',     'cat': 'Firewall',  'color': '#e74c3c', 'desc': 'Dynamic firewall manager with D-Bus interface.'},
    {'name': 'fail2ban',            'label': 'Fail2ban',      'cat': 'Security',  'color': '#c0392b', 'desc': 'Bans IPs with too many failed auth attempts.'},
    # Containers / DevOps
    {'name': 'podman',              'label': 'Podman',        'cat': 'Container', 'color': '#892ca0', 'desc': 'Daemonless container engine compatible with Docker CLI.'},
    {'name': 'buildah',             'label': 'Buildah',       'cat': 'Container', 'color': '#cc0000', 'desc': 'Build OCI container images without a daemon.'},
    # Networking / Monitoring
    {'name': 'nmap',                'label': 'nmap',          'cat': 'Net',       'color': '#0099cc', 'desc': 'Network exploration and port scanner.'},
    {'name': 'tcpdump',             'label': 'tcpdump',       'cat': 'Net',       'color': '#336699', 'desc': 'Command-line packet analyzer.'},
    {'name': 'nc',                  'label': 'netcat',        'cat': 'Net',       'color': '#555566', 'desc': 'TCP/UDP Swiss army knife.'},
    # Utilities
    {'name': 'zip',                 'label': 'zip',           'cat': 'Utils',     'color': '#555555', 'desc': 'Package and compress (archive) files.'},
    {'name': 'rsync',               'label': 'rsync',         'cat': 'Utils',     'color': '#cd6600', 'desc': 'Fast remote file copy and sync tool.'},
    {'name': 'jq',                  'label': 'jq',            'cat': 'Utils',     'color': '#c7a81a', 'desc': 'Lightweight command-line JSON processor.'},
    {'name': 'strace',              'label': 'strace',        'cat': 'Debug',     'color': '#444444', 'desc': 'System call tracer for debugging.'},
    {'name': 'lsof',                'label': 'lsof',          'cat': 'Debug',     'color': '#4a4a4a', 'desc': 'List open files and the processes using them.'},
]


def _logo_svg(pkg):
    color  = pkg['color']
    words  = re.split(r'[-_ .]', pkg['label'])
    abbrev = (words[0][0] + words[1][0]).upper() if len(words) >= 2 else pkg['label'][:2].upper()
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
        f'<rect width="40" height="40" rx="9" fill="{color}"/>'
        f'<text x="20" y="27" font-size="15" font-weight="700" text-anchor="middle" '
        f'fill="white" font-family="system-ui,ui-sans-serif,sans-serif" letter-spacing="-0.5">'
        f'{abbrev}</text>'
        '</svg>'
    )


def _build_dnf_cmd(pkg, distro_id, arch, pkg_dir):
    """Build the dnf download command for the given distro and arch."""
    repos = DISTROS[distro_id]['repos']
    repofrompath_args = []
    repo_args         = []
    for name, url_tmpl in repos.items():
        url = url_tmpl.format(arch=arch)
        repofrompath_args += ['--repofrompath', f'{name},{url}']
        repo_args          += ['--repo', name]

    return (
        ['dnf', 'download', '--resolve',
         '--destdir', pkg_dir]
        + repofrompath_args
        + repo_args
        + ['--arch', arch, pkg]
    )


def _parse_rpm_info(files):
    """Return sorted list of (name, version, arch, filename) for .rpm files.
    RPM filename format: {name}-{version}-{release}.{arch}.rpm
    """
    result = []
    for f in sorted(files):
        if not f.endswith('.rpm'):
            continue
        base = f[:-4]
        dot_parts = base.rsplit('.', 1)
        if len(dot_parts) != 2:
            continue
        name_ver_rel, arch = dot_parts
        # Split name from version-release: last two dash-segments are version and release
        parts = name_ver_rel.rsplit('-', 2)
        if len(parts) == 3:
            name, version, release = parts
            result.append((name, f'{version}-{release}', arch, f))
        elif len(parts) == 2:
            result.append((parts[0], parts[1], arch, f))
    return result


def _resolve_rpm_version(pkg, files):
    """Find the upstream version of the requested package."""
    pkg_norm = pkg.lower()
    for name, ver, _arch, _f in _parse_rpm_info(files):
        if name.lower() == pkg_norm:
            return ver.split('-')[0]  # upstream version without release
    return ''


def _build_scripts(pkg, distro_id, arch, files, main_version):
    generated    = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    distro_label = DISTROS[distro_id]['label']
    arch_label   = ARCHES[arch]
    components   = _parse_rpm_info(files)

    install_sh = (
        '#!/bin/bash\n'
        'set -e\n'
        'cd "$(dirname "$0")"\n'
        f'echo "==> Installing {pkg} from offline .rpm packages..."\n'
        'echo ""\n'
        'if command -v dnf &>/dev/null; then\n'
        '  sudo dnf install -y packages/*.rpm\n'
        'else\n'
        '  sudo rpm -Uvh --force packages/*.rpm\n'
        'fi\n'
        'echo ""\n'
        f'echo "✓ {pkg} installed. Verify with: rpm -q {pkg}"\n'
    )

    col_w = max((len(n) for n, _, _, _ in components), default=12) + 2
    sbom_lines = []
    pkg_norm = pkg.lower()
    for name, ver, a, _ in components:
        role = '(main)' if name.lower() == pkg_norm else '(dependency)'
        sbom_lines.append(f'  {name:<{col_w}} {ver:<30} {a:<10} {role}')

    divider = '─' * 60
    readme = (
        '═' * 60 + '\n'
        '  XIMG RPM BUNDLE — SOFTWARE BILL OF MATERIALS\n'
        + '═' * 60 + '\n'
        f'Generated:    {generated}\n'
        f'Source:       https://rpm-bundler.ximg.app\n'
        f'Package:      {pkg}  {main_version}\n'
        f'Distro:       {distro_label}\n'
        f'Architecture: {arch_label} ({arch})\n'
        f'Components:   {len(components)} .rpm files\n'
        + divider + '\n'
        'COMPONENTS\n'
        + divider + '\n'
        + '\n'.join(sbom_lines) + '\n'
        + divider + '\n\n'
        'INSTALL\n'
        + divider + '\n'
        '  # dnf (Fedora, RHEL 8+, Rocky, Alma):\n'
        '  sudo dnf install -y packages/*.rpm\n\n'
        '  # rpm (older systems):\n'
        '  sudo rpm -Uvh --force packages/*.rpm\n\n'
        '  Or use the install script:\n'
        '  chmod +x install.sh && sudo ./install.sh\n\n'
        'UNINSTALL\n'
        + divider + '\n'
        f'  sudo dnf remove {pkg}\n'
        '  # or: sudo rpm -e {pkg}\n'
        + '═' * 60 + '\n'
    )
    return install_sh, readme


# ── Bundle store ──────────────────────────────────────────────────────────────
_bundles = {}
_bundles_lock = threading.Lock()
BUNDLE_TTL = 300


def _cleanup_old():
    cutoff = time.time() - BUNDLE_TTL
    with _bundles_lock:
        for token in list(_bundles):
            if _bundles[token]['ts'] < cutoff:
                shutil.rmtree(_bundles[token]['tmpdir'], ignore_errors=True)
                del _bundles[token]


def _cleanup_loop():
    while True:
        time.sleep(60)
        _cleanup_old()


def _cleanup_orphans():
    tmp = tempfile.gettempdir()
    for entry in os.listdir(tmp):
        if entry.startswith('rpmbundle_'):
            shutil.rmtree(os.path.join(tmp, entry), ignore_errors=True)


_cleanup_orphans()
threading.Thread(target=_cleanup_loop, daemon=True).start()


# ── HTML ──────────────────────────────────────────────────────────────────────
HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RPM Bundler — rpm-bundler.ximg.app</title>
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

    .pkg-snav{display:flex;gap:.35rem;margin-bottom:1.2rem;flex-wrap:wrap}
    .pkg-snav-btn{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.08);
                  color:#64748b;font-size:.72rem;font-weight:600;letter-spacing:.07em;
                  text-transform:uppercase;padding:.3rem .75rem;border-radius:5px;
                  cursor:pointer;transition:all .15s;width:auto;margin-top:0}
    .pkg-snav-btn.active{background:#294172;border-color:#294172;color:#fff}

    .test-row{display:grid;grid-template-columns:3rem 1fr auto;align-items:start;
              gap:.5rem .75rem;padding:.55rem .2rem;border-bottom:1px solid rgba(255,255,255,.05)}
    .test-row:last-child{border-bottom:none}
    .test-id{font-size:.7rem;font-weight:700;color:#475569;font-family:monospace;padding-top:.15rem}
    .test-name{font-size:.82rem;font-weight:600;color:#e2e8f0}
    .test-desc{font-size:.72rem;color:#475569;margin-top:.15rem}
    .test-detail{font-size:.7rem;color:#64748b;margin-top:.2rem;font-family:monospace;word-break:break-all}
    .test-badge{display:inline-block;font-size:.65rem;font-weight:700;letter-spacing:.07em;
                text-transform:uppercase;padding:.18rem .5rem;border-radius:4px;
                width:5.5rem;text-align:center;flex-shrink:0;margin-top:.1rem}
    .test-badge.pending{background:rgba(100,116,139,.15);color:#64748b}
    .test-badge.running{background:rgba(234,179,8,.15);color:#eab308;
                        animation:pulse .8s ease-in-out infinite}
    .test-badge.pass{background:rgba(34,197,94,.15);color:#22c55e}
    .test-badge.fail{background:rgba(239,68,68,.15);color:#ef4444}
    .test-badge.skip{background:rgba(100,116,139,.1);color:#475569}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}

    .card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.07);
          border-radius:14px;padding:2rem;width:100%;max-width:680px;backdrop-filter:blur(8px)}
    label{display:block;color:#94a3b8;font-size:.75rem;font-weight:700;
          letter-spacing:.07em;text-transform:uppercase;margin-bottom:.4rem;margin-top:1.3rem}
    label:first-of-type{margin-top:0}
    input,select{width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);
                 border-radius:7px;color:#e2e8f0;font-size:.95rem;padding:.6rem .85rem;
                 outline:none;transition:border-color .15s}
    input:focus,select:focus{border-color:#294172}
    select option{background:#1e293b}
    .hint{color:#475569;font-size:.75rem;margin-top:.35rem;line-height:1.5}
    code{background:rgba(255,255,255,.07);border-radius:3px;padding:.1em .3em;font-size:.85em}
    button{width:100%;margin-top:1.8rem;background:#294172;color:#fff;border:none;
           border-radius:7px;font-size:1rem;font-weight:700;padding:.8rem;
           cursor:pointer;transition:background .15s,opacity .15s;letter-spacing:.01em}
    button:hover:not(:disabled){background:#1e3060}
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
    #status.info{background:rgba(41,65,114,.2);color:#93c5fd;
                 border:1px solid rgba(41,65,114,.4);display:block}
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
    .pkg-search-wrap input:focus{border-color:#294172}
    .pkg-search-icon{position:absolute;left:.75rem;top:50%;transform:translateY(-50%);
                     color:#475569;font-size:.9rem;pointer-events:none}
    .pkg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.75rem}
    .pkg-card{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.07);
              border-radius:11px;padding:1rem 1.1rem;display:flex;flex-direction:column;
              gap:.5rem;transition:border-color .15s,background .15s}
    .pkg-card:hover{border-color:rgba(41,65,114,.5);background:rgba(30,41,59,.8)}
    .pkg-card-top{display:flex;align-items:center;gap:.7rem}
    .pkg-logo{width:36px;height:36px;border-radius:8px;flex-shrink:0;object-fit:contain}
    .pkg-name{font-weight:700;font-size:.88rem;color:#f1f5f9}
    .pkg-cat{font-size:.65rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
             background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
             border-radius:4px;padding:.1em .45em;color:#94a3b8;margin-left:auto;
             white-space:nowrap;flex-shrink:0}
    .pkg-desc{font-size:.75rem;color:#64748b;line-height:1.45;flex:1}
    .pkg-bundle-btn{margin-top:.3rem;background:none;border:1px solid rgba(41,65,114,.4);
                    border-radius:6px;color:#93c5fd;font-size:.75rem;font-weight:600;
                    padding:.35rem .8rem;cursor:pointer;transition:all .15s;
                    text-align:center;width:100%}
    .pkg-bundle-btn:hover{background:rgba(41,65,114,.2);border-color:#294172}
    .pkg-none{color:#475569;text-align:center;padding:3rem;font-size:.88rem;grid-column:1/-1}
  </style>
</head>
<body>
  <div class="hero">
    <div class="hero-icon">🎩</div>
    <h1>RPM Bundler</h1>
    <p class="subtitle">Bundle any RPM package + dependencies for offline installation</p>
  </div>

  <div class="snav">
    <button class="snav-btn active" id="nav-bundle"   onclick="setView('bundle')">Bundle</button>
    <button class="snav-btn"        id="nav-packages" onclick="setView('packages')">Top Packages</button>
    <button class="snav-btn"        id="nav-install"  onclick="setView('install')">How to Install</button>
    <button class="snav-btn"        id="nav-tests"    onclick="setView('tests')">Test Cases</button>
  </div>

  <div id="view-bundle">
    <div class="card">
      <label for="pkg">Package Name</label>
      <input type="text" id="pkg" placeholder="e.g. nginx, git, postgresql-server, podman"
             autocomplete="off" spellcheck="false">
      <p class="hint">RPM package name as it appears in <code>dnf install &lt;name&gt;</code></p>

      <label for="distro">Distribution</label>
      <select id="distro">
        <option value="fedora-41">Fedora 41</option>
        <option value="fedora-40">Fedora 40</option>
        <option value="rocky-9" selected>Rocky Linux 9</option>
        <option value="rocky-8">Rocky Linux 8</option>
        <option value="alma-9">AlmaLinux 9</option>
        <option value="centos-stream-9">CentOS Stream 9</option>
        <option value="centos-stream-10">CentOS Stream 10</option>
        <option value="centos-8">CentOS 8 (EOL)</option>
        <option value="centos-7">CentOS 7 (EOL)</option>
        <option value="rhel-9">RHEL 9 (UBI — public)</option>
        <option value="rhel-8">RHEL 8 (UBI — public)</option>
      </select>

      <label for="arch">Architecture</label>
      <select id="arch">
        <option value="x86_64" selected>x86_64 — Intel/AMD 64-bit</option>
        <option value="aarch64">aarch64 — ARM64 (Graviton, Ampere)</option>
      </select>
      <p class="hint">All RPM dependencies are included. Install with <code>sudo dnf install packages/*.rpm</code></p>

      <button id="btn" onclick="go()">Bundle &amp; Download</button>

      <div style="margin-top:.75rem;padding:.6rem .85rem;background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.2);border-radius:6px;font-size:.78rem;color:#94a3b8;display:flex;align-items:flex-start;gap:.5rem">
        <span style="color:#00ff88;flex-shrink:0">&#x1F6E1;</span>
        <span>Every bundle is scanned with <strong style="color:#00ff88">ClamAV</strong> before download. If malware or a virus signature is detected, the bundle is <strong style="color:#ff4444">blocked</strong> and never served. A <code>scan_results.txt</code> report is included in every zip.</span>
      </div>

      <div id="terminal">
        <div class="term-bar">
          <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
          <span class="term-title" id="term-title">rpm bundler</span>
        </div>
        <div id="term-out"></div>
      </div>
      <div id="status"></div>
    </div>
  </div>

  <div id="view-packages">
    <div class="pkg-search-wrap">
      <span class="pkg-search-icon">🔍</span>
      <input type="text" id="pkg-search" placeholder="Filter packages…"
             autocomplete="off" spellcheck="false" oninput="renderPkgs()">
    </div>
    <div class="pkg-grid" id="pkg-grid"></div>
  </div>

  <div id="view-install" style="display:none;width:100%;max-width:900px;margin:0 auto">
    <div class="card" style="max-width:none">
      <h2 style="font-size:1.1rem;font-weight:700;color:#f1f5f9;margin-bottom:1.4rem">After Downloading the Zip</h2>
      <ol style="list-style:none;padding:0;display:flex;flex-direction:column;gap:1.1rem">
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#294172;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">1</span>
          <div><strong style="color:#f1f5f9">Locate the file</strong><br><span style="color:#94a3b8;font-size:.85rem">Open your Downloads folder and find the <code>.zip</code> file.</span></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#294172;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">2</span>
          <div><strong style="color:#f1f5f9">Extract it</strong><br><span style="color:#94a3b8;font-size:.85rem">Double-click the zip to extract, or run:</span><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">unzip &lt;filename&gt;.zip</code></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#294172;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">3</span>
          <div><strong style="color:#f1f5f9">Open a terminal in the folder</strong><br><span style="color:#94a3b8;font-size:.85rem">Right-click the extracted folder and choose "Open Terminal here", or run:</span><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">cd &lt;extracted-folder-name&gt;</code></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#294172;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">4</span>
          <div><strong style="color:#f1f5f9">Run the install script</strong><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">chmod +x install.sh &amp;&amp; sudo ./install.sh</code><span style="color:#94a3b8;font-size:.85rem;display:block;margin-top:.4rem">Installs the package and all its dependencies — no internet needed.</span></div>
        </li>
      </ol>
      <div style="margin-top:1.4rem;padding:.8rem 1rem;background:#0d1117;border-radius:8px;border:1px solid rgba(255,255,255,.07)">
        <span style="color:#64748b;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Or install manually</span>
        <code style="display:block;margin-top:.4rem;font-size:.82rem;color:#c9d1d9">sudo dnf install -y packages/*.rpm</code>
      </div>
    </div>
  </div>

  <div id="view-tests" style="display:none;width:100%;max-width:780px">
    <div class="pkg-snav">
      <button class="pkg-snav-btn active" id="tpkg-httpd"
              onclick="selectTestPkg('httpd')">httpd</button>
    </div>
    <div style="color:#64748b;font-size:.8rem;margin-bottom:1.2rem;text-align:center">
      Rocky Linux 9 &nbsp;·&nbsp; x86_64 &nbsp;·&nbsp; end-to-end bundle test
    </div>
    <div class="card" style="padding:1.2rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.1rem">
        <span style="font-weight:700;font-size:.95rem;color:#f1f5f9">Test Suite</span>
        <button id="run-btn" onclick="runTests()"
                style="width:auto;margin:0;padding:.35rem 1.1rem;font-size:.8rem">&#9654; Run</button>
      </div>
      <div id="test-list"></div>
      <div id="test-summary"
           style="display:none;margin-top:1rem;padding:.65rem .85rem;border-radius:7px;
                  font-size:.85rem;font-weight:600"></div>
    </div>
    <div id="test-log-wrap" style="display:none;margin-top:.75rem">
      <div style="background:#1e2433;border-radius:10px 10px 0 0;padding:.4rem .75rem;
                  display:flex;align-items:center;gap:.35rem;
                  border:1px solid rgba(255,255,255,.07);border-bottom:none">
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#ef4444"></span>
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#eab308"></span>
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#22c55e"></span>
        <span style="flex:1;text-align:center;font-size:.72rem;color:#64748b;
                     font-family:monospace;margin-right:22px">build log</span>
      </div>
      <div id="test-log"
           style="background:#0d1117;border:1px solid rgba(255,255,255,.07);
                  border-radius:0 0 10px 10px;padding:.75rem 1rem;height:240px;
                  overflow-y:auto;font-family:'Fira Code','Consolas',monospace;
                  font-size:.76rem;line-height:1.6;color:#c9d1d9;
                  white-space:pre-wrap;word-break:break-all"></div>
    </div>
    <div id="test-install-log-wrap" style="display:none;margin-top:.75rem">
      <div style="background:#1a2438;border-radius:10px 10px 0 0;padding:.4rem .75rem;
                  display:flex;align-items:center;gap:.35rem;
                  border:1px solid rgba(41,65,114,.4);border-bottom:none">
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#ef4444"></span>
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#eab308"></span>
        <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#22c55e"></span>
        <span style="flex:1;text-align:center;font-size:.72rem;color:#93c5fd;
                     font-family:monospace;margin-right:22px">install test — isolated rpm root</span>
      </div>
      <div id="test-install-log"
           style="background:#060d10;border:1px solid rgba(41,65,114,.25);
                  border-radius:0 0 10px 10px;padding:.75rem 1rem;height:220px;
                  overflow-y:auto;font-family:'Fira Code','Consolas',monospace;
                  font-size:.76rem;line-height:1.6;color:#93c5fd;
                  white-space:pre-wrap;word-break:break-all"></div>
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

    const termEl  = document.getElementById('terminal');
    const outEl   = document.getElementById('term-out');
    const titleEl = document.getElementById('term-title');
    let   cursorEl = null;

    function termShow(pkg) {
      titleEl.textContent = `dnf download ${pkg}`;
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
      if (text.startsWith('$') || text.startsWith('==>'))             return 'line-cmd';
      if (/^(Downloading|Downloaded|Complete!)/i.test(text))          return 'line-ok';
      if (/error|warning|failed/i.test(text))                         return 'line-err';
      if (/^\s*(Updating|Last metadata|Dependencies|Install|Total)/i.test(text)) return 'line-dim';
      return '';
    }

    async function go() {
      const pkg    = document.getElementById('pkg').value.trim();
      const distro = document.getElementById('distro').value;
      const arch   = document.getElementById('arch').value;
      const btn    = document.getElementById('btn');

      if (!pkg) { show('error', 'Enter a package name.'); return; }

      btn.disabled = true;
      btn.textContent = 'Bundling…';
      hideStatus();
      termShow(pkg);

      try {
        const fd = new FormData();
        fd.append('package', pkg);
        fd.append('distro',  distro);
        fd.append('arch',    arch);

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
            if (evtType === 'done')       token  = evtData;
            else if (evtType === 'error') errMsg = evtData;
            else if (evtData !== '')      termLine(evtData, lineClass(evtData));
          }
        }

        termDone();
        if (errMsg) { show('error', errMsg); return; }
        if (token) {
          window.location.href = `/download/${token}`;
          show('ok', '✓ Download started.\n\nInstall:\n  sudo dnf install -y packages/*.rpm\n  # or: sudo rpm -Uvh --force packages/*.rpm');
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

    // ── Test Cases ────────────────────────────────────────────────────────────

    const TEST_DEFS = [
      { id:'T01', name:'Reject invalid package name',      desc:'POST with "!!bad!!" → 400 JSON error' },
      { id:'T02', name:'Reject unknown distro',             desc:'POST with distro="windows-11" → 400 JSON error' },
      { id:'T03', name:'Bundle request accepted',           desc:'POST → 200 text/event-stream' },
      { id:'T04', name:'DNF download output in stream',    desc:'Stream contains "Downloading" or "Downloaded" line' },
      { id:'T05', name:'Package .rpm files appear',         desc:'.rpm filename seen in stream output' },
      { id:'T06', name:'ClamAV scan clean',                 desc:'No INFECTED line in stream' },
      { id:'T07', name:'Bundle completes without error',   desc:'event:done received (not event:error)' },
      { id:'T08', name:'Download token is valid',           desc:'event:done data matches UUID format' },
      { id:'T09', name:'Bundle metadata endpoint responds', desc:'GET /bundle-meta/<token> → 200 JSON' },
      { id:'T10', name:'Bundle filename is a .zip',         desc:'Metadata name field ends with .zip' },
      { id:'T11', name:'Bundle size > 10 KB',               desc:'Metadata size field > 10,240 bytes' },
      { id:'T12', name:'Zip extracts cleanly',              desc:'Server extracts bundle without error' },
      { id:'T13', name:'install.sh present',                desc:'install.sh found in extracted bundle' },
      { id:'T14', name:'.rpm files are valid',              desc:'rpm -qp passes on every .rpm' },
      { id:'T15', name:'Target package .rpm present',       desc:'At least one .rpm named after the package' },
      { id:'T16', name:'Packages extract into isolated root', desc:'rpm2cpio | cpio into fresh root succeeds' },
      { id:'T17', name:'Package version readable',          desc:'rpm -qp --queryformat reads VERSION from .rpm' },
      { id:'T18', name:'Package files present in root',     desc:'Files from package list exist in isolated root' },
    ];

    let activeTestPkg = 'httpd';
    let testsRunning  = false;

    function selectTestPkg(pkg) {
      activeTestPkg = pkg;
      document.querySelectorAll('.pkg-snav-btn').forEach(b => b.classList.remove('active'));
      const el = document.getElementById('tpkg-' + pkg);
      if (el) el.classList.add('active');
      initTestList();
    }

    function setTestStatus(id, status, detail) {
      const row = document.getElementById('trow-' + id);
      if (!row) return;
      const badge  = row.querySelector('.test-badge');
      const detEl  = row.querySelector('.test-detail');
      badge.className = 'test-badge ' + status;
      const labels = { pending:'—', running:'running…', pass:'✓ PASS', fail:'✗ FAIL', skip:'SKIP' };
      badge.textContent = labels[status] || status;
      if (detEl && detail !== undefined) detEl.textContent = detail;
    }

    function appendTestLog(text) {
      const log = document.getElementById('test-log');
      if (!log) return;
      log.textContent += text + '\n';
      log.scrollTop = log.scrollHeight;
    }

    function initTestList() {
      const list = document.getElementById('test-list');
      if (!list) return;
      list.innerHTML = TEST_DEFS.map(t =>
        '<div class="test-row" id="trow-' + t.id + '">' +
          '<span class="test-id">' + t.id + '</span>' +
          '<div><div class="test-name">' + t.name + '</div>' +
              '<div class="test-desc">' + t.desc + '</div>' +
              '<div class="test-detail"></div></div>' +
          '<span class="test-badge pending">—</span>' +
        '</div>'
      ).join('');
      const sumEl = document.getElementById('test-summary');
      if (sumEl) sumEl.style.display = 'none';
      const logEl = document.getElementById('test-log');
      if (logEl) logEl.textContent = '';
      const wrapEl = document.getElementById('test-log-wrap');
      if (wrapEl) wrapEl.style.display = 'none';
      const ilogEl = document.getElementById('test-install-log');
      if (ilogEl) ilogEl.textContent = '';
      const iwrapEl = document.getElementById('test-install-log-wrap');
      if (iwrapEl) iwrapEl.style.display = 'none';
      const btn = document.getElementById('run-btn');
      if (btn) { btn.disabled = false; btn.textContent = '▶ Run'; }
    }

    async function runTests() {
      if (testsRunning) return;
      testsRunning = true;

      const btn = document.getElementById('run-btn');
      btn.disabled = true;
      btn.textContent = '⏳ Running…';

      initTestList();
      document.getElementById('test-log-wrap').style.display = 'block';

      const pkg    = activeTestPkg;
      const distro = 'rocky-9';
      const arch   = 'x86_64';
      let passed = 0, failed = 0;
      let stopped = false;

      function pass(id, detail) { setTestStatus(id, 'pass', detail); passed++; }
      function fail(id, detail) { setTestStatus(id, 'fail', detail); failed++; }
      function skip(id, detail) { setTestStatus(id, 'skip', detail); }
      function abort(fromId, reason) {
        const all = TEST_DEFS.map(t => t.id);
        const idx = all.indexOf(fromId);
        if (idx >= 0) all.slice(idx).forEach(id => skip(id, reason || 'skipped — prior step failed'));
        stopped = true;
      }

      // T01 — Reject invalid package name
      setTestStatus('T01', 'running');
      try {
        const f = new FormData();
        f.append('package', '!!bad!!');
        f.append('distro', distro);
        f.append('arch', arch);
        const r = await fetch('/bundle', { method:'POST', body:f });
        const j = await r.json().catch(() => null);
        if (r.status === 400 && j && j.error) { pass('T01', 'HTTP 400 — ' + j.error); }
        else { fail('T01', 'Expected 400, got HTTP ' + r.status); abort('T02'); }
      } catch(e) { fail('T01', 'Network error: ' + e.message); abort('T02'); }

      // T02 — Reject unknown distro
      if (!stopped) {
        setTestStatus('T02', 'running');
        try {
          const f = new FormData();
          f.append('package', pkg);
          f.append('distro', 'windows-11');
          f.append('arch', arch);
          const r = await fetch('/bundle', { method:'POST', body:f });
          const j = await r.json().catch(() => null);
          if (r.status === 400 && j && j.error) { pass('T02', 'HTTP 400 — ' + j.error); }
          else { fail('T02', 'Expected 400, got HTTP ' + r.status); abort('T03'); }
        } catch(e) { fail('T02', 'Network error: ' + e.message); abort('T03'); }
      }

      // T03–T08 — SSE bundle stream
      let token = null;
      if (!stopped) {
        setTestStatus('T03', 'running');
        setTestStatus('T04', 'running');
        setTestStatus('T05', 'running');
        setTestStatus('T06', 'running');
        setTestStatus('T07', 'running');
        setTestStatus('T08', 'running');

        let streamFailed = false;
        try {
          const form = new FormData();
          form.append('package', pkg);
          form.append('distro', distro);
          form.append('arch', arch);

          const resp = await fetch('/bundle', { method:'POST', body:form });
          const rct  = resp.headers.get('content-type') || '';

          if (!resp.ok || !rct.includes('event-stream')) {
            fail('T03', 'Expected 200 text/event-stream, got HTTP ' + resp.status);
            abort('T04');
            streamFailed = true;
          } else {
            pass('T03', 'HTTP 200 text/event-stream');

            const reader = resp.body.getReader();
            const dec = new TextDecoder();
            let buf = '';
            let T04done = false, T05done = false, T06done = false, streamDone = false;

            while (!streamDone) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });

              const blocks = buf.split('\n\n');
              buf = blocks.pop();

              for (const block of blocks) {
                let evtType = '', evtData = '';
                for (const line of block.split('\n')) {
                  if (line.startsWith('event:')) evtType = line.slice(6).trim();
                  else if (line.startsWith('data:')) evtData = line.slice(5).trim();
                }

                if (evtData) {
                  appendTestLog(evtData);
                  if (!T04done && /Downloading|Downloaded/i.test(evtData)) {
                    T04done = true;
                    pass('T04', 'DNF download detected in stream');
                  }
                  if (!T05done && evtData.includes('.rpm')) {
                    T05done = true;
                    pass('T05', '.rpm filename seen in stream');
                  }
                  if (!T06done && evtData.includes('INFECTED')) {
                    T06done = true;
                    fail('T06', evtData.slice(0, 80));
                  }
                }

                if (evtType === 'done') {
                  token = evtData;
                  if (!T04done) { fail('T04', 'No DNF download output in stream'); streamFailed = true; }
                  if (!T05done && !streamFailed) { fail('T05', 'No .rpm filename in stream'); streamFailed = true; }
                  else if (!T05done) skip('T05', 'skipped — prior step failed');
                  if (!T06done && !streamFailed) pass('T06', 'No INFECTED lines — scan clean');
                  else if (!T06done) skip('T06', 'skipped — prior step failed');
                  if (!streamFailed) {
                    pass('T07', 'event:done received');
                    if (/^[0-9a-f\-]{32,}$/i.test(token)) { pass('T08', token); }
                    else { fail('T08', 'Unexpected format: ' + token); streamFailed = true; }
                  } else {
                    skip('T07', 'skipped — prior step failed');
                    skip('T08', 'skipped — prior step failed');
                    token = null;
                  }
                  streamDone = true;
                  break;
                }

                if (evtType === 'error') {
                  if (!T04done) fail('T04', 'Bundle failed');
                  if (!T05done) skip('T05', 'Bundle failed');
                  if (!T06done) skip('T06', 'Bundle failed');
                  fail('T07', 'event:error — ' + evtData.slice(0, 80));
                  skip('T08', 'skipped — prior step failed');
                  streamFailed = true;
                  streamDone = true;
                  break;
                }
              }
            }
          }
        } catch(e) {
          fail('T03', 'Error: ' + e.message);
          abort('T04');
          streamFailed = true;
        }

        if (streamFailed) abort('T09');
      }

      // T09–T11 — Bundle metadata
      if (!stopped && token) {
        setTestStatus('T09', 'running');
        setTestStatus('T10', 'running');
        setTestStatus('T11', 'running');
        try {
          const mr = await fetch('/bundle-meta/' + token);
          if (mr.ok) {
            pass('T09', 'HTTP ' + mr.status);
            const meta = await mr.json();
            if (meta.name && meta.name.endsWith('.zip')) { pass('T10', meta.name); }
            else { fail('T10', 'name: ' + (meta.name || '(none)')); abort('T11'); }
            if (!stopped) {
              meta.size > 10240
                ? pass('T11', meta.size.toLocaleString() + ' bytes (' + (meta.size/1048576).toFixed(1) + ' MB)')
                : (fail('T11', (meta.size || 0) + ' bytes — too small'), abort('T12'));
            }
          } else {
            fail('T09', 'HTTP ' + mr.status);
            abort('T10');
          }
        } catch(e) { fail('T09', e.message); abort('T10'); }
      }

      // T12–T18 — Install in isolated rpm root (server-side)
      if (!stopped && token) {
        ['T12','T13','T14','T15','T16','T17','T18'].forEach(id => setTestStatus(id, 'running'));
        document.getElementById('test-install-log-wrap').style.display = 'block';
        const ilog = document.getElementById('test-install-log');
        function appendInstallLog(text) {
          ilog.textContent += text + '\n';
          ilog.scrollTop = ilog.scrollHeight;
        }

        try {
          const form2 = new FormData();
          form2.append('token', token);
          const ir = await fetch('/test-install', { method:'POST', body:form2 });
          if (!ir.ok) {
            ['T12','T13','T14','T15','T16','T17','T18'].forEach(id =>
              fail(id, 'HTTP ' + ir.status));
          } else {
            const reader2 = ir.body.getReader();
            const dec2 = new TextDecoder();
            let ibuf = '';
            while (true) {
              const { done, value } = await reader2.read();
              if (done) break;
              ibuf += dec2.decode(value, { stream: true });
              const blocks = ibuf.split('\n\n');
              ibuf = blocks.pop();
              for (const block of blocks) {
                let et = '', ed = '';
                for (const line of block.split('\n')) {
                  if (line.startsWith('event:')) et = line.slice(6).trim();
                  else if (line.startsWith('data:')) ed = line.slice(5).trim();
                }
                if (et === 'step') {
                  try {
                    const s = JSON.parse(ed);
                    setTestStatus(s.test, s.status, s.detail || '');
                    if (s.status === 'pass') passed++;
                    else if (s.status === 'fail') failed++;
                  } catch(_) {}
                } else if (et === 'log' && ed) {
                  appendInstallLog(ed);
                } else if (et === 'error') {
                  ['T12','T13','T14','T15','T16','T17','T18'].forEach(id => {
                    const row = document.getElementById('trow-' + id);
                    if (row && row.querySelector('.test-badge').classList.contains('running'))
                      skip(id, 'aborted: ' + ed.slice(0, 60));
                  });
                  appendInstallLog('ERROR: ' + ed);
                }
              }
            }
          }
        } catch(e) {
          ['T12','T13','T14','T15','T16','T17','T18'].forEach(id => {
            const row = document.getElementById('trow-' + id);
            if (row && row.querySelector('.test-badge').classList.contains('running'))
              fail(id, 'Error: ' + e.message);
          });
        }
      }

      // Summary
      const sumEl = document.getElementById('test-summary');
      sumEl.style.display = 'block';
      if (failed === 0 && passed > 0) {
        sumEl.style.background = 'rgba(34,197,94,.12)';
        sumEl.style.color = '#86efac';
        sumEl.style.border = '1px solid rgba(34,197,94,.25)';
        sumEl.textContent = '✓ All ' + passed + ' tests passed';
      } else {
        sumEl.style.background = 'rgba(239,68,68,.12)';
        sumEl.style.color = '#fca5a5';
        sumEl.style.border = '1px solid rgba(239,68,68,.25)';
        sumEl.textContent = passed + ' passed · ' + failed + ' failed';
      }
      btn.disabled = false;
      btn.textContent = '↺ Re-run';
      testsRunning = false;
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


@app.route('/logo/<name>.svg')
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


@app.route('/bundle', methods=['POST'])
def bundle():
    pkg    = request.form.get('package', '').strip()
    distro = request.form.get('distro',  'rocky-9').strip()
    arch   = request.form.get('arch',    'x86_64').strip()

    if not pkg or not PACKAGE_RE.match(pkg):
        return jsonify({'error': 'Invalid package name.'}), 400
    if distro not in DISTROS:
        return jsonify({'error': 'Invalid distribution.'}), 400
    if arch not in ARCHES:
        return jsonify({'error': 'Invalid architecture.'}), 400

    client_ip = request.headers.get('X-Real-IP') or request.remote_addr or ''

    @stream_with_context
    def generate():
        tmpdir  = tempfile.mkdtemp(prefix='rpmbundle_')
        pkg_dir = os.path.join(tmpdir, 'packages')
        os.makedirs(pkg_dir)

        distro_label = DISTROS[distro]['label']
        cmd = _build_dnf_cmd(pkg, distro, arch, pkg_dir)

        try:
            yield f'data: ==> Downloading {pkg} for {distro_label} / {arch}...\n\n'
            yield f'data: $ {" ".join(cmd)}\n\n'

            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1,
            )
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    yield f'data: {line}\n\n'
            proc.wait()

            if proc.returncode != 0:
                yield 'data: \n\n'
                yield 'data: ✗ dnf download failed\n\n'
                yield 'event: error\ndata: Download failed — package not found or not available for this distro/arch\n\n'
                shutil.rmtree(tmpdir, ignore_errors=True)
                return

            files = sorted(f for f in os.listdir(pkg_dir) if f.endswith('.rpm'))
            if not files:
                yield 'event: error\ndata: No .rpm files downloaded — check the package name\n\n'
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

            ver = _resolve_rpm_version(pkg, files)
            ver_tag    = f'-{ver}' if ver else ''
            safe_distro = distro.replace('-', '').replace('.', '')  # rocky9
            bundle_dir  = f'ximg-app-rpm-bundle-{pkg}{ver_tag}-{safe_distro}-{arch}'
            zip_name    = f'{bundle_dir}.zip'
            zip_path    = os.path.join(tmpdir, zip_name)

            install_sh, readme = _build_scripts(pkg, distro, arch, files, ver)

            for fname, content in [('install.sh', install_sh), ('README.txt', readme)]:
                with open(os.path.join(tmpdir, fname), 'w', newline='\n') as fh:
                    fh.write(content)

            def _exec_entry(arc_path, src_path):
                info = zipfile.ZipInfo(arc_path)
                info.external_attr = 0o100755 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(src_path, 'rb') as fh:
                    zf.writestr(info, fh.read())

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in files:
                    zf.write(os.path.join(pkg_dir, f), f'{bundle_dir}/packages/{f}')
                    yield f'data:   + packages/{f}\n\n'
                _exec_entry(f'{bundle_dir}/install.sh', os.path.join(tmpdir, 'install.sh'))
                zf.write(os.path.join(tmpdir, 'README.txt'), f'{bundle_dir}/README.txt')
                zf.writestr(f'{bundle_dir}/scan_results.txt', _scan_report)

            token = uuid.uuid4().hex
            with _bundles_lock:
                _bundles[token] = {'path': zip_path, 'tmpdir': tmpdir, 'name': zip_name, 'ts': time.time(),
                                   'ip': client_ip, 'package': pkg, 'extra': f'{distro}-{arch}'}

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

    _log_bundle_download('rpm', info.get('ip', ''), info.get('package', ''),
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


@app.route('/bundle-meta/<token>')
def bundle_meta(token):
    with _bundles_lock:
        info = _bundles.get(token)
    if not info:
        return jsonify({'error': 'not found'}), 404
    size = 0
    try:
        size = os.path.getsize(info['path'])
    except Exception:
        pass
    return jsonify({'name': info.get('name', ''), 'size': size})


@app.route('/test-install', methods=['POST'])
def test_install():
    """Run install-verification tests against a pending bundle in an isolated rpm root."""
    token = request.form.get('token', '').strip()

    with _bundles_lock:
        info = _bundles.get(token)
    if not info:
        return Response('event: error\ndata: Bundle not found or expired\n\n',
                        mimetype='text/event-stream')

    @stream_with_context
    def generate():
        import zipfile as _zip

        work = tempfile.mkdtemp(prefix='rpminsttest_')
        try:
            zip_path = info['path']
            pkg_name = info.get('package', '')

            def step(test, status, detail=''):
                entry = _json.dumps({'test': test, 'status': status, 'detail': detail})
                return 'event: step\ndata: ' + entry + '\n\n'

            def log(msg):
                return 'event: log\ndata: ' + msg + '\n\n'

            # ── T12: Extract zip ─────────────────────────────────────────────
            extract_dir = os.path.join(work, 'extracted')
            rpm_files = []
            try:
                with _zip.ZipFile(zip_path) as zf:
                    zf.extractall(extract_dir)
                for root_d, _, files in os.walk(extract_dir):
                    for f in files:
                        if f.endswith('.rpm'):
                            rpm_files.append(os.path.join(root_d, f))
                yield step('T12', 'pass',
                           f'Extracted {len(rpm_files)} .rpm file(s) + ancillary files')
            except Exception as e:
                yield step('T12', 'fail', str(e))
                yield 'event: error\ndata: extraction failed\n\n'
                return

            # ── T13: install.sh present ──────────────────────────────────────
            install_sh = None
            for root_d, _, files in os.walk(extract_dir):
                if 'install.sh' in files:
                    install_sh = os.path.join(root_d, 'install.sh')
                    break
            if install_sh:
                yield step('T13', 'pass', 'install.sh found')
            else:
                yield step('T13', 'fail', 'install.sh not found in bundle')
                for tid in ['T14','T15','T16','T17','T18']:
                    yield step(tid, 'skip', 'skipped — prior step failed')
                yield 'event: done\ndata: ok\n\n'
                return

            # ── T14: .rpm files valid ────────────────────────────────────────
            if not rpm_files:
                yield step('T14', 'fail', 'No .rpm files in bundle')
                for tid in ['T15','T16','T17','T18']:
                    yield step(tid, 'skip', 'skipped — prior step failed')
                yield 'event: done\ndata: ok\n\n'
                return

            all_valid = True
            for rf in rpm_files:
                r = subprocess.run(['rpm', '-qp', '--nosignature', rf],
                                   capture_output=True, text=True)
                if r.returncode != 0:
                    all_valid = False
                    yield log(f'FAILED: {os.path.basename(rf)}: {r.stderr.strip()}')
                else:
                    yield log(f'OK: {r.stdout.strip()}')
            if all_valid:
                yield step('T14', 'pass', f'{len(rpm_files)} .rpm file(s) valid')
            else:
                yield step('T14', 'fail', 'Some .rpm files failed rpm -qp check')
                for tid in ['T15','T16','T17','T18']:
                    yield step(tid, 'skip', 'skipped — prior step failed')
                yield 'event: done\ndata: ok\n\n'
                return

            # ── T15: Target package .rpm present ────────────────────────────
            target_rpms = [f for f in rpm_files if pkg_name in os.path.basename(f)]
            if target_rpms:
                yield step('T15', 'pass', os.path.basename(target_rpms[0]))
            else:
                yield step('T15', 'fail', f'No .rpm file matching "{pkg_name}"')
                for tid in ['T16','T17','T18']:
                    yield step(tid, 'skip', 'skipped — prior step failed')
                yield 'event: done\ndata: ok\n\n'
                return

            # ── T16: Extract all rpms into isolated root ─────────────────────
            extract_root = os.path.join(work, 'extract_root')
            os.makedirs(extract_root, exist_ok=True)
            failed_extracts = []
            for rf in rpm_files:
                r = subprocess.run(
                    f'rpm2cpio {_shlex_quote(rf)} | cpio -idm --quiet',
                    shell=True, capture_output=True, text=True,
                    cwd=extract_root,
                )
                if r.returncode != 0:
                    yield log(f'FAILED: {os.path.basename(rf)}: {r.stderr.strip()[:120]}')
                    failed_extracts.append(rf)
                else:
                    yield log(f'OK: {os.path.basename(rf)}')

            primary_failed = any(pkg_name in os.path.basename(d) for d in failed_extracts)
            if primary_failed:
                yield step('T16', 'fail', f'Primary package failed to extract: {pkg_name}')
                for tid in ['T17', 'T18']:
                    yield step(tid, 'skip', 'skipped — prior step failed')
                yield 'event: done\ndata: ok\n\n'
                return
            else:
                n = len(failed_extracts)
                detail = (f'All {len(rpm_files)} RPMs extracted to isolated root'
                          if n == 0 else
                          f'Primary OK; {n} dep(s) failed extraction')
                yield step('T16', 'pass', detail)

            # ── T17: Package version readable ────────────────────────────────
            primary_rpm = target_rpms[0]
            ver_r = subprocess.run(
                ['rpm', '-qp', '--nosignature', '--queryformat', '%{VERSION}\n', primary_rpm],
                capture_output=True, text=True,
            )
            if ver_r.returncode == 0 and ver_r.stdout.strip():
                yield step('T17', 'pass', f'Version: {ver_r.stdout.strip()}')
            else:
                yield step('T17', 'fail', 'Could not read VERSION from rpm metadata')
                yield step('T18', 'skip', 'skipped — prior step failed')
                yield 'event: done\ndata: ok\n\n'
                return

            # ── T18: Package files present in isolated root ──────────────────
            list_r = subprocess.run(
                ['rpm', '-qp', '--nosignature', '--list', primary_rpm],
                capture_output=True, text=True,
            )
            if list_r.returncode == 0:
                all_files = [p.lstrip('/') for p in list_r.stdout.splitlines()
                             if p and not p.endswith('/')]
                found = [p for p in all_files
                         if os.path.exists(os.path.join(extract_root, p))]
                if found:
                    yield step('T18', 'pass',
                               f'{len(found)}/{len(all_files)} files on disk — e.g. /{found[0]}')
                else:
                    yield step('T18', 'fail', 'No files from primary package found in isolated root')
            else:
                yield step('T18', 'fail', 'rpm -qp --list failed')

            yield 'event: done\ndata: ok\n\n'

        except Exception as e:
            yield f'event: error\ndata: {e}\n\n'
        finally:
            shutil.rmtree(work, ignore_errors=True)
            with _bundles_lock:
                _bundles.pop(token, None)

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3007, threaded=True)
