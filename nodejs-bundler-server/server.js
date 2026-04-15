'use strict';
const express   = require('express');
const { spawn } = require('child_process');
const fs        = require('fs');
const fsp       = fs.promises;
const path      = require('path');
const os        = require('os');
const crypto    = require('crypto');
const https     = require('https');
const http      = require('http');
const archiver  = require('archiver');
const tar       = require('tar');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// npm package name + optional @version specifier
const PACKAGE_RE = /^(@[a-z0-9][a-z0-9\-._]*(\/[a-z0-9][a-z0-9\-._]*)?(@[A-Za-z0-9._~^>=<!*()\-+]+)?|[a-z0-9_][a-z0-9\-._]*(@[A-Za-z0-9._~^>=<!*()\-+]+)?)$/;

// Node.js embed platforms: ext is the archive type, bin is the in-archive binary path
const NODE_PLATFORMS = {
  'linux-x64':    { label: 'Linux x86-64',              ext: 'tar.gz', bin: 'node',     sizeMB: 28 },
  'linux-arm64':  { label: 'Linux ARM64',                ext: 'tar.gz', bin: 'node',     sizeMB: 26 },
  'darwin-arm64': { label: 'macOS ARM64 (Apple Silicon)', ext: 'tar.gz', bin: 'node',    sizeMB: 25 },
  'darwin-x64':   { label: 'macOS x86-64 (Intel)',       ext: 'tar.gz', bin: 'node',     sizeMB: 26 },
  'win-x64':      { label: 'Windows x64',                ext: 'zip',    bin: 'node.exe', sizeMB: 32 },
};

const VALID_NODE_MAJORS = new Set(['18', '20', '22', '23']);

const PACKAGES = [
  // HTTP
  { name: 'axios',          label: 'Axios',          cat: 'HTTP',       color: '#5a29e4', desc: 'Promise-based HTTP client for browser and Node.js.' },
  { name: 'node-fetch',     label: 'node-fetch',     cat: 'HTTP',       color: '#0d6efd', desc: 'Lightweight window.fetch implementation for Node.js.' },
  { name: 'got',            label: 'Got',            cat: 'HTTP',       color: '#ff4154', desc: 'Human-friendly and powerful HTTP request library.' },
  { name: 'undici',         label: 'Undici',         cat: 'HTTP',       color: '#026e00', desc: 'Fast HTTP/1.1 client written from scratch for Node.js.' },
  // Web Frameworks
  { name: 'express',        label: 'Express',        cat: 'Web',        color: '#259ddd', desc: 'Fast, unopinionated, minimalist web framework.' },
  { name: 'fastify',        label: 'Fastify',        cat: 'Web',        color: '#f50057', desc: 'Fast and low overhead web framework for Node.js.' },
  { name: 'koa',            label: 'Koa',            cat: 'Web',        color: '#33333d', desc: 'Expressive HTTP middleware framework by the Express team.' },
  { name: 'hapi',           label: 'hapi',           cat: 'Web',        color: '#e84545', desc: 'The simple, secure framework for Node.js web apps.' },
  // Database
  { name: 'mongoose',       label: 'Mongoose',       cat: 'Database',   color: '#800000', desc: 'Elegant MongoDB object modeling for Node.js.' },
  { name: 'pg',             label: 'pg',             cat: 'Database',   color: '#336791', desc: 'Non-blocking PostgreSQL client for Node.js.' },
  { name: 'mysql2',         label: 'mysql2',         cat: 'Database',   color: '#00758f', desc: 'Fast MySQL client for Node.js with Promise support.' },
  { name: 'ioredis',        label: 'ioredis',        cat: 'Cache',      color: '#dc382d', desc: 'Robust Redis client with cluster and Lua scripting support.' },
  { name: 'better-sqlite3', label: 'better-sqlite3', cat: 'Database',   color: '#0078d4', desc: 'Fastest and simplest SQLite3 library for Node.js.' },
  // ORM
  { name: 'sequelize',      label: 'Sequelize',      cat: 'ORM',        color: '#52b0e7', desc: 'Promise-based Node.js ORM for multiple SQL dialects.' },
  { name: 'prisma',         label: 'Prisma',         cat: 'ORM',        color: '#2d3748', desc: 'Next-generation TypeScript ORM with auto-generated queries.' },
  { name: 'drizzle-orm',    label: 'Drizzle ORM',    cat: 'ORM',        color: '#c97b30', desc: 'Lightweight TypeScript ORM with SQL-first query builder.' },
  // Testing
  { name: 'jest',           label: 'Jest',           cat: 'Testing',    color: '#c21325', desc: 'Delightful JavaScript testing framework with zero config.' },
  { name: 'vitest',         label: 'Vitest',         cat: 'Testing',    color: '#6e9f18', desc: 'Vite-native blazing fast unit test framework.' },
  { name: 'mocha',          label: 'Mocha',          cat: 'Testing',    color: '#8d6748', desc: 'Simple, flexible, fun JavaScript test framework.' },
  { name: 'chai',           label: 'Chai',           cat: 'Testing',    color: '#a40802', desc: 'BDD/TDD assertion library for Node.js and browsers.' },
  { name: 'playwright',     label: 'Playwright',     cat: 'Testing',    color: '#2ead33', desc: 'Reliable end-to-end testing for modern web apps.' },
  // Build/Dev
  { name: 'typescript',     label: 'TypeScript',     cat: 'Dev',        color: '#3178c6', desc: 'Typed superset of JavaScript that compiles to plain JS.' },
  { name: 'esbuild',        label: 'esbuild',        cat: 'Build',      color: '#ffcf00', desc: 'Extremely fast JavaScript and CSS bundler.' },
  { name: 'vite',           label: 'Vite',           cat: 'Build',      color: '#646cff', desc: 'Next generation frontend tooling with instant HMR.' },
  { name: 'webpack',        label: 'webpack',        cat: 'Build',      color: '#8dd6f9', desc: 'Static module bundler for modern JavaScript applications.' },
  { name: 'rollup',         label: 'Rollup',         cat: 'Build',      color: '#ec4a3f', desc: 'Module bundler for JavaScript, tree-shaking included.' },
  { name: 'eslint',         label: 'ESLint',         cat: 'Dev',        color: '#4b32c3', desc: 'Find and fix problems in your JavaScript code.' },
  { name: 'prettier',       label: 'Prettier',       cat: 'Dev',        color: '#1a2b34', desc: 'Opinionated code formatter supporting many languages.' },
  // Utilities
  { name: 'lodash',         label: 'Lodash',         cat: 'Utility',    color: '#3492ff', desc: 'Utility library delivering modularity, performance, & extras.' },
  { name: 'dayjs',          label: 'Day.js',         cat: 'Date',       color: '#fb8c00', desc: 'Fast 2kB date library with Moment.js-compatible API.' },
  { name: 'date-fns',       label: 'date-fns',       cat: 'Date',       color: '#770c56', desc: 'Modern JavaScript date utility library — like lodash for dates.' },
  { name: 'uuid',           label: 'UUID',           cat: 'Utility',    color: '#00897b', desc: 'RFC-compliant UUID generator for JavaScript.' },
  { name: 'dotenv',         label: 'dotenv',         cat: 'Config',     color: '#ecd53f', desc: 'Load environment variables from .env files into process.env.' },
  { name: 'zod',            label: 'Zod',            cat: 'Validation', color: '#3068b7', desc: 'TypeScript-first schema declaration and validation library.' },
  { name: 'joi',            label: 'Joi',            cat: 'Validation', color: '#f7b731', desc: 'Powerful schema description language and data validator.' },
  // CLI
  { name: 'chalk',          label: 'Chalk',          cat: 'CLI',        color: '#cc5200', desc: 'Terminal string styling done right.' },
  { name: 'commander',      label: 'Commander',      cat: 'CLI',        color: '#2563eb', desc: 'Complete solution for Node.js command-line programs.' },
  { name: 'inquirer',       label: 'Inquirer',       cat: 'CLI',        color: '#1a56db', desc: 'A collection of interactive CLI user interfaces.' },
  { name: 'ora',            label: 'Ora',            cat: 'CLI',        color: '#64748b', desc: 'Elegant terminal spinner for Node.js.' },
  { name: 'yargs',          label: 'Yargs',          cat: 'CLI',        color: '#cc1f1f', desc: 'Build interactive command line tools with pirate flair.' },
  // Auth/Security
  { name: 'jsonwebtoken',   label: 'jsonwebtoken',   cat: 'Auth',       color: '#fb015b', desc: 'JSON Web Token implementation for Node.js.' },
  { name: 'bcryptjs',       label: 'bcryptjs',       cat: 'Security',   color: '#1e40af', desc: 'Optimised bcrypt in plain JavaScript — zero native deps.' },
  { name: 'passport',       label: 'Passport',       cat: 'Auth',       color: '#34d399', desc: 'Simple, unobtrusive authentication middleware for Node.js.' },
  // Realtime
  { name: 'socket.io',      label: 'Socket.IO',      cat: 'Realtime',   color: '#010101', desc: 'Bidirectional low-latency event-based communication.' },
  { name: 'ws',             label: 'ws',             cat: 'Realtime',   color: '#4a90d9', desc: 'Simple to use, blazing fast WebSocket client and server.' },
];

const FAVICON_SVG = fs.readFileSync('/app/favicon.svg');

// ── Bundle store ──────────────────────────────────────────
const bundles    = new Map();
const BUNDLE_TTL = 300_000; // 5 minutes

function cleanupBundles() {
  const now = Date.now();
  for (const [token, info] of bundles) {
    if (now - info.ts > BUNDLE_TTL) {
      fs.rm(info.tmpdir, { recursive: true, force: true }, () => {});
      bundles.delete(token);
    }
  }
}
setInterval(cleanupBundles, 60_000);

(function cleanupOrphans() {
  const tmp = os.tmpdir();
  try {
    for (const entry of fs.readdirSync(tmp)) {
      if (entry.startsWith('nodejs-bundler-')) {
        fs.rm(path.join(tmp, entry), { recursive: true, force: true }, () => {});
      }
    }
  } catch {}
})();

// ── Helpers ───────────────────────────────────────────────

function logoSVG(pkg) {
  const words  = pkg.label.split(/[-_ .]/);
  const abbrev = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : pkg.label.slice(0, 2).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="${pkg.color}"/><text x="20" y="27" font-size="15" font-weight="700" text-anchor="middle" fill="white" font-family="system-ui,ui-sans-serif,sans-serif" letter-spacing="-0.5">${abbrev}</text></svg>`;
}

// Parse npm package spec → { base, version }
function parsePackageSpec(spec) {
  if (spec.startsWith('@')) {
    const rest     = spec.slice(1);
    const slashIdx = rest.indexOf('/');
    if (slashIdx < 0) return { base: spec, version: null };
    const afterSlash = rest.slice(slashIdx + 1);
    const atIdx      = afterSlash.indexOf('@');
    if (atIdx < 0) return { base: spec, version: null };
    return { base: `@${rest.slice(0, slashIdx + 1 + atIdx)}`, version: afterSlash.slice(atIdx + 1) };
  }
  const atIdx = spec.indexOf('@');
  if (atIdx < 0) return { base: spec, version: null };
  return { base: spec.slice(0, atIdx), version: spec.slice(atIdx + 1) };
}

// Walk node_modules → [{ name, version }]
async function readNodeModules(nodeModulesDir) {
  const result = [];
  let entries;
  try { entries = await fsp.readdir(nodeModulesDir, { withFileTypes: true }); }
  catch { return result; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@')) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
      let subs;
      try { subs = await fsp.readdir(scopeDir, { withFileTypes: true }); } catch { continue; }
      for (const sub of subs) {
        if (!sub.isDirectory()) continue;
        try {
          const pkg = JSON.parse(await fsp.readFile(path.join(scopeDir, sub.name, 'package.json'), 'utf8'));
          result.push({ name: `${entry.name}/${sub.name}`, version: pkg.version || '?' });
        } catch {}
      }
    } else {
      try {
        const pkg = JSON.parse(await fsp.readFile(path.join(nodeModulesDir, entry.name, 'package.json'), 'utf8'));
        result.push({ name: entry.name, version: pkg.version || '?' });
      } catch {}
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

async function getMainVersion(nodeModulesDir, base) {
  try {
    const pkg = JSON.parse(await fsp.readFile(path.join(nodeModulesDir, ...base.split('/'), 'package.json'), 'utf8'));
    return pkg.version || '?';
  } catch { return '?'; }
}

// ── Node.js embed helpers ─────────────────────────────────

// Resolve latest Node.js version for a given major (e.g. "22" → "v22.14.0")
function resolveNodeVersion(major) {
  return new Promise((resolve, reject) => {
    const doGet = (url) => {
      const lib = url.startsWith('https') ? https : http;
      lib.get(url, res => {
        if (res.statusCode === 301 || res.statusCode === 302) { doGet(res.headers.location); return; }
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          const m = data.match(/node-(v[\d.]+)/);
          resolve(m ? m[1] : null);
        });
        res.on('error', reject);
      }).on('error', reject);
    };
    doGet(`https://nodejs.org/dist/latest-v${major}.x/SHASUMS256.txt`);
  });
}

// Download a URL to a file, calling onProgress(received, total) every ~10%
function downloadToFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const doGet = (url) => {
      const lib = url.startsWith('https') ? https : http;
      lib.get(url, res => {
        if (res.statusCode === 301 || res.statusCode === 302) { doGet(res.headers.location); return; }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} from ${url}`)); return; }
        const total   = parseInt(res.headers['content-length'] || '0', 10);
        let received  = 0, lastPct = -1;
        const file    = fs.createWriteStream(destPath);
        res.on('data', chunk => {
          file.write(chunk);
          received += chunk.length;
          if (total && onProgress) {
            const pct = Math.floor(received / total * 100);
            if (pct >= lastPct + 10) { lastPct = pct - (pct % 10); onProgress(received, total); }
          }
        });
        res.on('end',   () => file.close(resolve));
        res.on('error', err => { file.close(); fs.unlink(destPath, () => {}); reject(err); });
        file.on('error', reject);
      }).on('error', reject);
    };
    doGet(url);
  });
}

// Download + extract just the node binary into nodeRuntimeDir.
// Returns the resolved version string (e.g. "v22.14.0").
async function embedNodeRuntime(major, platform, nodeRuntimeDir, tmpdir, send) {
  const plat = NODE_PLATFORMS[platform];
  if (!plat) throw new Error(`Unknown platform: ${platform}`);

  send(`$ Resolving Node.js v${major} latest version...`);
  const version = await resolveNodeVersion(major);
  if (!version) throw new Error(`Could not resolve Node.js v${major}.x version`);
  send(`  Found: Node.js ${version}`);

  const fileName = `node-${version}-${platform}.${plat.ext}`;
  const dlUrl    = `https://nodejs.org/dist/${version}/${fileName}`;
  const dlPath   = path.join(tmpdir, fileName);

  send(`$ Downloading ${fileName} (~${plat.sizeMB} MB)...`);
  await downloadToFile(dlUrl, dlPath, (recv, total) => {
    const mb  = (recv / 1048576).toFixed(1);
    const tot = (total / 1048576).toFixed(0);
    const pct = Math.floor(recv / total * 100);
    send(`  ${mb} MB / ${tot} MB  (${pct}%)`);
  });
  send(`  Download complete`);

  await fsp.mkdir(nodeRuntimeDir, { recursive: true });

  send(`$ Extracting Node.js binary...`);
  if (plat.ext === 'tar.gz') {
    // Use the 'tar' npm package — extract only the node binary, strip the first 2 path
    // components so node-vX.Y.Z-platform/bin/node lands as nodeRuntimeDir/node
    await tar.extract({
      file:   dlPath,
      cwd:    nodeRuntimeDir,
      strip:  2,
      filter: (p) => p.endsWith('/bin/node'),
    });
    await fsp.chmod(path.join(nodeRuntimeDir, 'node'), 0o755);
  } else {
    // Windows zip: use unzip -j to flatten and extract node.exe
    await new Promise((resolve, reject) => {
      const proc = spawn('unzip', ['-j', dlPath, '*/node.exe', '-d', nodeRuntimeDir]);
      proc.on('close', code => (code === 0 || code === 1) ? resolve() : reject(new Error(`unzip failed: ${code}`)));
    });
  }

  fs.unlink(dlPath, () => {}); // remove downloaded archive
  send(`  Node.js ${version} ready  →  node-runtime/${plat.bin}`);
  return version;
}

// ── HTML ──────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Node.js Bundler — nodejs-bundler.ximg.app</title>
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

    /* sub-nav */
    .snav{display:flex;gap:.25rem;margin-bottom:1.6rem;
          background:rgba(15,23,42,.6);border:1px solid rgba(255,255,255,.07);
          border-radius:10px;padding:.3rem}
    .snav-btn{flex:1;background:none;border:none;color:#64748b;font-size:.82rem;
              font-weight:600;padding:.5rem 1.2rem;border-radius:7px;cursor:pointer;
              transition:all .15s;letter-spacing:.01em;width:auto;margin-top:0}
    .snav-btn.active{background:#1e293b;color:#f1f5f9;box-shadow:0 1px 4px rgba(0,0,0,.4)}
    .snav-btn:hover:not(.active){color:#cbd5e1}

    /* form card */
    .card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.07);
          border-radius:14px;padding:2rem;width:100%;max-width:560px;backdrop-filter:blur(8px)}
    label{display:block;color:#94a3b8;font-size:.75rem;font-weight:700;
          letter-spacing:.07em;text-transform:uppercase;margin-bottom:.4rem;margin-top:1.3rem}
    label:first-of-type{margin-top:0}
    input[type=text]{width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);
          border-radius:7px;color:#e2e8f0;font-size:.95rem;padding:.6rem .85rem;
          outline:none;transition:border-color .15s}
    input[type=text]:focus{border-color:#026e00}
    select{width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);
           border-radius:7px;color:#e2e8f0;font-size:.95rem;padding:.6rem .85rem;
           outline:none;transition:border-color .15s;appearance:none;
           background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
           background-repeat:no-repeat;background-position:right .8rem center;padding-right:2rem}
    select:focus{border-color:#026e00}
    select option{background:#1e293b}
    .hint{color:#475569;font-size:.75rem;margin-top:.35rem;line-height:1.5}
    code{background:rgba(255,255,255,.07);border-radius:3px;padding:.1em .3em;font-size:.85em}

    /* embed toggle */
    .embed-row{display:flex;align-items:center;gap:.55rem;margin-top:1.3rem;
               background:rgba(2,110,0,.07);border:1px solid rgba(2,110,0,.18);
               border-radius:8px;padding:.65rem .85rem;cursor:pointer}
    .embed-row:hover{background:rgba(2,110,0,.12)}
    .embed-row input[type=checkbox]{width:15px;height:15px;accent-color:#026e00;
               cursor:pointer;flex-shrink:0;margin:0}
    .embed-label-text{color:#94a3b8;font-size:.82rem;font-weight:600;
                      letter-spacing:.01em;line-height:1.3}
    .embed-label-text small{display:block;color:#475569;font-size:.72rem;
                            font-weight:400;margin-top:.1rem}
    .embed-opts{margin-top:.5rem;padding:.1rem 0 0 0;
                border-top:1px solid rgba(255,255,255,.05);padding-top:.9rem}

    button{width:100%;margin-top:1.8rem;background:#026e00;color:#fff;border:none;
           border-radius:7px;font-size:1rem;font-weight:700;padding:.8rem;
           cursor:pointer;transition:background .15s,opacity .15s;letter-spacing:.01em}
    button:hover:not(:disabled){background:#015a00}
    button:disabled{opacity:.55;cursor:not-allowed}

    /* terminal */
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

    /* packages panel */
    #view-packages{display:none;width:100%;max-width:900px}
    .pkg-search-wrap{position:relative;margin-bottom:1.2rem}
    .pkg-search-wrap input{background:rgba(15,23,42,.8);border:1px solid rgba(255,255,255,.1);
                           border-radius:9px;color:#e2e8f0;font-size:.9rem;
                           padding:.65rem 1rem .65rem 2.4rem;outline:none;
                           transition:border-color .15s;width:100%}
    .pkg-search-wrap input:focus{border-color:#026e00}
    .pkg-search-icon{position:absolute;left:.75rem;top:50%;transform:translateY(-50%);
                     color:#475569;font-size:.9rem;pointer-events:none}
    .pkg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.75rem}
    .pkg-card{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.07);
              border-radius:11px;padding:1rem 1.1rem;display:flex;flex-direction:column;
              gap:.5rem;transition:border-color .15s,background .15s;cursor:default}
    .pkg-card:hover{border-color:rgba(2,110,0,.4);background:rgba(30,41,59,.8)}
    .pkg-card-top{display:flex;align-items:center;gap:.7rem}
    .pkg-logo{width:36px;height:36px;border-radius:8px;flex-shrink:0;object-fit:contain}
    .pkg-name{font-weight:700;font-size:.88rem;color:#f1f5f9}
    .pkg-cat{font-size:.65rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
             background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
             border-radius:4px;padding:.1em .45em;color:#94a3b8;margin-left:auto;
             white-space:nowrap;flex-shrink:0}
    .pkg-desc{font-size:.75rem;color:#64748b;line-height:1.45;flex:1}
    .pkg-bundle-btn{margin-top:.3rem;background:none;border:1px solid rgba(2,200,0,.25);
                    border-radius:6px;color:#4ade80;font-size:.75rem;font-weight:600;
                    padding:.35rem .8rem;cursor:pointer;transition:all .15s;
                    text-align:center;width:100%}
    .pkg-bundle-btn:hover{background:rgba(2,110,0,.15);border-color:#4ade80}
    .pkg-none{color:#475569;text-align:center;padding:3rem;font-size:.88rem;grid-column:1/-1}
  </style>
</head>
<body>
  <div class="hero">
    <div class="hero-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
        <polygon points="24,2 44,13 44,35 24,46 4,35 4,13" fill="#026e00"/>
        <text x="24" y="29" font-size="14" font-weight="900" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" letter-spacing="-0.5">NODE</text>
      </svg>
    </div>
    <h1>Node.js Bundler</h1>
    <p class="subtitle">Bundle any npm package + dependencies for offline installation</p>
  </div>

  <div class="snav">
    <button class="snav-btn active" id="nav-bundle"   onclick="setView('bundle')">Bundle</button>
    <button class="snav-btn"        id="nav-packages" onclick="setView('packages')">Top Packages</button>
    <button class="snav-btn"        id="nav-install"  onclick="setView('install')">How to Install</button>
  </div>

  <!-- Bundle view -->
  <div id="view-bundle">
    <div class="card">
      <label for="pkg">Package Name</label>
      <input type="text" id="pkg" placeholder="e.g. express, lodash, @babel/core@7.24.0"
             autocomplete="off" spellcheck="false">
      <p class="hint">npm package name. Version pinning supported: <code>express@4.18.2</code>, <code>lodash@^4.17</code>, <code>@babel/core@7.24.0</code></p>

      <!-- Embed Node.js toggle -->
      <div class="embed-row" onclick="document.getElementById('embed-node').click()">
        <input type="checkbox" id="embed-node" onclick="event.stopPropagation()" onchange="toggleEmbed()">
        <div class="embed-label-text">
          Embed Node.js runtime
          <small>For hosts without Node.js installed — adds ~25 MB to the bundle</small>
        </div>
      </div>

      <div id="embed-opts" style="display:none" class="embed-opts">
        <label for="node-platform">Target Platform</label>
        <select id="node-platform">
          <option value="linux-x64">Linux x86-64</option>
          <option value="linux-arm64">Linux ARM64</option>
          <option value="darwin-arm64">macOS ARM64 (Apple Silicon)</option>
          <option value="darwin-x64">macOS x86-64 (Intel)</option>
          <option value="win-x64">Windows x64</option>
        </select>

        <label for="node-major">Node.js Version</label>
        <select id="node-major">
          <option value="22">Node.js 22 LTS</option>
          <option value="20">Node.js 20 LTS</option>
          <option value="18">Node.js 18</option>
        </select>
      </div>

      <button id="btn" onclick="go()">Bundle &amp; Download</button>

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

  <!-- Packages view -->
  <div id="view-packages">
    <div class="pkg-search-wrap">
      <span class="pkg-search-icon">🔍</span>
      <input type="text" id="pkg-search" placeholder="Filter packages\u2026"
             autocomplete="off" spellcheck="false" oninput="renderPkgs()">
    </div>
    <div class="pkg-grid" id="pkg-grid"></div>
  </div>

  <!-- Install instructions view -->
  <div id="view-install" style="display:none;width:100%;max-width:560px">
    <div class="card">
      <h2 style="font-size:1.1rem;font-weight:700;color:#f1f5f9;margin-bottom:1.4rem">After Downloading the Zip</h2>
      <ol style="list-style:none;padding:0;display:flex;flex-direction:column;gap:1.1rem">
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#026e00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">1</span>
          <div><strong style="color:#f1f5f9">Locate the file</strong><br><span style="color:#94a3b8;font-size:.85rem">Open your Downloads folder and find the <code>.zip</code> file.</span></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#026e00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">2</span>
          <div><strong style="color:#f1f5f9">Extract it</strong><br><span style="color:#94a3b8;font-size:.85rem">Double-click the zip to extract, or run:</span><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">unzip &lt;filename&gt;.zip</code></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#026e00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">3</span>
          <div><strong style="color:#f1f5f9">Copy node_modules into your project</strong><br><span style="color:#94a3b8;font-size:.85rem">Move the <code>node_modules/</code> folder from the extracted zip into your project's root folder — right next to your <code>package.json</code>.</span></div>
        </li>
        <li style="display:flex;gap:.85rem;align-items:flex-start">
          <span style="background:#026e00;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;flex-shrink:0;margin-top:.1rem">4</span>
          <div><strong style="color:#f1f5f9">Run your project</strong><br><code style="display:block;margin-top:.35rem;background:#0d1117;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;color:#c9d1d9">node app.js</code><span style="color:#94a3b8;font-size:.85rem;display:block;margin-top:.4rem">Your packages are ready — no internet or <code>npm install</code> needed.</span></div>
        </li>
      </ol>
      <div style="margin-top:1.4rem;padding:.8rem 1rem;background:#0d1117;border-radius:8px;border:1px solid rgba(255,255,255,.07)">
        <span style="color:#64748b;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em">If Node.js runtime was bundled</span>
        <p style="color:#94a3b8;font-size:.83rem;margin-top:.4rem">Run <code>./setup.sh</code> (Linux/Mac) or <code>setup.bat</code> (Windows) to configure it, then use <code>node-runtime/node</code> to run scripts on machines without Node.js installed.</p>
      </div>
    </div>
  </div>

  <script>
    function setView(v) {
      document.getElementById('view-bundle').style.display   = v === 'bundle'   ? 'block' : 'none';
      document.getElementById('view-packages').style.display = v === 'packages' ? 'block' : 'none';
      document.getElementById('view-install').style.display  = v === 'install'  ? 'block' : 'none';
      document.getElementById('nav-bundle').classList.toggle('active',   v === 'bundle');
      document.getElementById('nav-packages').classList.toggle('active', v === 'packages');
      document.getElementById('nav-install').classList.toggle('active',  v === 'install');
      if (v === 'packages') renderPkgs();
    }

    function toggleEmbed() {
      const show = document.getElementById('embed-node').checked;
      document.getElementById('embed-opts').style.display = show ? 'block' : 'none';
    }

    const PKGS = PACKAGES_JSON;

    function renderPkgs() {
      const q      = (document.getElementById('pkg-search').value || '').toLowerCase();
      const grid   = document.getElementById('pkg-grid');
      const filtered = q
        ? PKGS.filter(p => p.name.toLowerCase().includes(q) ||
                           p.cat.toLowerCase().includes(q)  ||
                           p.desc.toLowerCase().includes(q))
        : PKGS;
      if (!filtered.length) {
        grid.innerHTML = '<div class="pkg-none">No packages match your search.</div>';
        return;
      }
      grid.innerHTML = filtered.map(p => \`
        <div class="pkg-card">
          <div class="pkg-card-top">
            <img class="pkg-logo" src="/logo/\${encodeURIComponent(p.name)}.svg" alt="\${p.name}"
                 onerror="this.style.display='none'">
            <span class="pkg-name">\${p.label}</span>
            <span class="pkg-cat">\${p.cat}</span>
          </div>
          <div class="pkg-desc">\${p.desc}</div>
          <button class="pkg-bundle-btn" data-pkg="\${p.name}" onclick="pickPkg(this.dataset.pkg)">Bundle \u2192</button>
        </div>\`).join('');
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
      titleEl.textContent = 'npm install ' + pkg;
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
      if (/^(added|updated|found|packages|  Found|  Download|  Node)/i.test(text)) return 'line-ok';
      if (/error|ERR!/i.test(text))                                          return 'line-err';
      if (/^(npm notice|npm warn|http|timing|  [\d.]+\sMB)/i.test(text))   return 'line-dim';
      return '';
    }

    async function go() {
      const pkg = document.getElementById('pkg').value.trim();
      const btn = document.getElementById('btn');
      if (!pkg) { show('error', 'Enter a package name.'); return; }

      const embedNode = document.getElementById('embed-node').checked;
      const params    = new URLSearchParams({ package: pkg });
      if (embedNode) {
        params.set('embed_node',    'true');
        params.set('node_platform', document.getElementById('node-platform').value);
        params.set('node_major',    document.getElementById('node-major').value);
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
          const events = buf.split('\\n\\n');
          buf = events.pop();
          for (const raw of events) {
            let evtType = 'message', evtData = '';
            for (const line of raw.split('\\n')) {
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
          const msg = embedNode
            ? '\u2713 Download started \u2014 check your downloads folder.\\n\\nThe zip includes Node.js runtime + pre-installed node_modules.\\nRun setup.sh to verify, then use node-runtime/node to run scripts.'
            : '\u2713 Download started \u2014 check your downloads folder.\\n\\nThe zip contains pre-installed node_modules.\\nExtract and copy node_modules/ into your project.';
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
      if (e.key === 'Enter') go();
    });
  </script>
  <script src="/shared/nav.js?v=2"></script>
</body>
</html>`;

// ── Routes ────────────────────────────────────────────────

app.get('/favicon.svg', (req, res) => {
  res.type('image/svg+xml').send(FAVICON_SVG);
});

app.get('/logo/:name.svg', (req, res) => {
  const name = decodeURIComponent(req.params.name).toLowerCase();
  let pkg = PACKAGES.find(p => p.name.toLowerCase() === name);
  if (!pkg) pkg = { label: name.slice(0, 2), color: '#334155' };
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(logoSVG(pkg));
});

app.get('/', (req, res) => {
  const pkgsJSON = JSON.stringify(PACKAGES.map(p => ({
    name: p.name, label: p.label, cat: p.cat, color: p.color, desc: p.desc,
  })));
  res.type('text/html').send(HTML.replace('PACKAGES_JSON', pkgsJSON));
});

app.post('/bundle', async (req, res) => {
  const pkg         = (req.body.package      || '').trim();
  const embedNode   = req.body.embed_node    === 'true';
  const nodePlatform= (req.body.node_platform|| 'linux-x64').trim();
  const nodeMajor   = (req.body.node_major   || '22').trim();

  if (!pkg || !PACKAGE_RE.test(pkg)) {
    return res.status(400).json({ error: 'Invalid package name.' });
  }
  if (embedNode && !NODE_PLATFORMS[nodePlatform]) {
    return res.status(400).json({ error: 'Invalid node platform.' });
  }
  if (embedNode && !VALID_NODE_MAJORS.has(nodeMajor)) {
    return res.status(400).json({ error: 'Invalid node major version.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data, evt) => {
    if (evt) res.write(`event: ${evt}\ndata: ${data}\n\n`);
    else     res.write(`data: ${data}\n\n`);
  };

  let tmpdir = null;
  try {
    tmpdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nodejs-bundler-'));
    const { base: pkgBase, version: pkgVer } = parsePackageSpec(pkg);

    // ── Step 1: npm install ──────────────────────────────
    const pkgJson = {
      name: 'ximg-offline-bundle', version: '1.0.0', private: true,
      description: `Offline bundle for ${pkgBase}`,
      dependencies: { [pkgBase]: pkgVer || '*' },
    };
    await fsp.writeFile(path.join(tmpdir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    send(`$ npm install --ignore-scripts --no-audit --no-fund`);
    send('');

    await new Promise((resolve, reject) => {
      const proc = spawn('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: tmpdir });
      const onData = chunk => {
        for (const line of chunk.toString().split('\n')) {
          const l = line.trim();
          if (l) send(l);
        }
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('close', code => code !== 0 ? reject(new Error(`npm install exited with code ${code}`)) : resolve());
    });

    const nodeModulesDir = path.join(tmpdir, 'node_modules');
    const installed      = await readNodeModules(nodeModulesDir);

    if (!installed.length) {
      send('No packages were installed — check the package name', 'error');
      return;
    }

    send('');
    send(`Installed ${installed.length} package(s).`);

    const mainVersion = await getMainVersion(nodeModulesDir, pkgBase);

    // ── Step 2: Optionally embed Node.js runtime ─────────
    let nodeRuntimeDir = null;
    let nodeVersion    = null;

    if (embedNode) {
      send('');
      nodeRuntimeDir = path.join(tmpdir, 'node-runtime');
      nodeVersion    = await embedNodeRuntime(nodeMajor, nodePlatform, nodeRuntimeDir, tmpdir, send);
    }

    // ── Step 3: Generate scripts + README ────────────────
    send('');
    send('Creating bundle zip...');

    const generated  = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const colW       = Math.max(...installed.map(p => p.name.length), 10) + 2;
    const divider    = '\u2500'.repeat(56);
    const sbomLines  = installed.map(p => `  ${p.name.padEnd(colW)} ${p.version}`).join('\n');
    const platInfo   = embedNode ? NODE_PLATFORMS[nodePlatform] : null;
    const nodeLabel  = embedNode ? `${nodeVersion} (${nodePlatform})` : null;

    const nodeUsageSh  = embedNode ? `./node-runtime/${platInfo.bin}` : 'node';
    const nodeUsageBat = embedNode ? `.\\node-runtime\\${platInfo.bin}` : 'node';

    const readme = [
      '\u2550'.repeat(56),
      '  XIMG NODE.JS BUNDLE \u2014 SOFTWARE BILL OF MATERIALS',
      '\u2550'.repeat(56),
      `Generated:    ${generated}`,
      `Source:       https://nodejs-bundler.ximg.app`,
      `Package:      ${pkgBase} ${mainVersion}`,
      `Components:   ${installed.length}`,
      ...(embedNode ? [`Node.js:      ${nodeVersion} (${nodePlatform})`] : []),
      divider,
      'COMPONENTS',
      divider,
      sbomLines,
      divider,
      '',
      'USAGE',
      divider,
      '  This bundle contains pre-installed node_modules.',
      ...(embedNode ? [
        `  Node.js ${nodeVersion} is bundled in node-runtime/.`,
        '',
        '  Linux / macOS:',
        '    ./setup.sh',
        `    ./node-runtime/node yourscript.js`,
        '',
        '  Windows:',
        `    .\\node-runtime\\node.exe yourscript.js`,
      ] : [
        '  Run setup.sh to verify, then copy node_modules/ into your project.',
        '',
        '  Linux / macOS:',
        `    ./setup.sh`,
        `    cp -r node_modules/ /path/to/your/project/`,
        '',
        '  Windows (PowerShell):',
        `    Copy-Item -Recurse node_modules\\ C:\\path\\to\\project\\`,
      ]),
      '\u2550'.repeat(56),
    ].join('\n');

    const setupSh = embedNode ? [
      '#!/bin/bash',
      `# Offline bundle: ${pkgBase} ${mainVersion} (${installed.length} packages) + Node.js ${nodeVersion} (${nodePlatform})`,
      `# Source: https://nodejs-bundler.ximg.app`,
      'set -e',
      'BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"',
      `NODE="$BUNDLE_DIR/node-runtime/node"`,
      'chmod +x "$NODE" 2>/dev/null || true',
      'echo "==> Node.js: $($NODE --version) [bundled]"',
      '',
      '# Generate a self-contained wrapper for each CLI tool in node_modules/.bin/',
      '# Each wrapper uses the bundled node regardless of what is on the system PATH.',
      'echo "==> Creating bin wrappers..."',
      'for bin in "$BUNDLE_DIR/node_modules/.bin/"*; do',
      '  [ -e "$bin" ] || continue',
      '  name="$(basename "$bin")"',
      '  wrapper="$BUNDLE_DIR/$name"',
      // printf writes a small bash script; \\n in the format becomes a real newline.
      // $0/$@ are quoted so they stay as literals in the generated wrapper.
      `  printf '#!/bin/bash\\nSELF="$(cd "$(dirname "$0")" && pwd)"\\nexec "$SELF/node-runtime/node" "$SELF/node_modules/.bin/%s" "$@"\\n' "$name" > "$wrapper"`,
      '  chmod +x "$wrapper"',
      '  echo "  ./$name"',
      'done',
      '',
      'echo ""',
      'echo "==> Verifying bundle..."',
      `$NODE -e "require('${pkgBase}'); console.log('OK  ${pkgBase} loaded successfully')" 2>/dev/null || \\`,
      `  echo "NOTE: ${pkgBase} is a CLI \u2014 use the wrapper above, e.g. ./${pkgBase}"`,
      'echo ""',
      `echo "\u2713 Bundle ready \u2014 Node.js ${nodeVersion} + ${pkgBase} ${mainVersion} (${installed.length} packages)"`,
      `echo "  ./${pkgBase} [args]          uses bundled Node.js"`,
      `echo "  To use from anywhere: export PATH=\\"\$BUNDLE_DIR:\\$PATH\\""`,
    ].join('\n') : [
      '#!/bin/bash',
      `# Offline bundle: ${pkgBase} ${mainVersion} (${installed.length} packages)`,
      `# Source: https://nodejs-bundler.ximg.app`,
      'set -e',
      'cd "$(dirname "$0")"',
      'echo "==> Verifying bundle..."',
      `node -e "require('${pkgBase}'); console.log('OK  ${pkgBase} loaded successfully')" 2>/dev/null || \\`,
      `  echo "NOTE: ${pkgBase} is a CLI/framework \u2014 import it from your project code"`,
      'echo ""',
      `echo "\u2713 Bundle ready \u2014 ${pkgBase} ${mainVersion} (${installed.length} packages)"`,
      `echo "  Copy node_modules/ to your project: cp -r node_modules/ /your/project/"`,
    ].join('\n');

    await fsp.writeFile(path.join(tmpdir, 'README.txt'), readme);
    await fsp.writeFile(path.join(tmpdir, 'setup.sh'),   setupSh, { mode: 0o755 });

    // ── Step 4: Create zip ────────────────────────────────
    const safePkg    = pkgBase.replace(/[^A-Za-z0-9._-]/g, '_');
    const nodeSuffix = embedNode ? `-node${nodeMajor}-${nodePlatform}` : '';
    const bundleName = `ximg-app-js-bundle-${safePkg}-${mainVersion}${nodeSuffix}`;
    const zipName    = `${bundleName}.zip`;
    const zipPath    = path.join(tmpdir, zipName);

    await new Promise((resolve, reject) => {
      const output  = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      archive.directory(nodeModulesDir,                `${bundleName}/node_modules`);
      archive.file(path.join(tmpdir, 'package.json'), { name: `${bundleName}/package.json` });
      const lockPath = path.join(tmpdir, 'package-lock.json');
      if (fs.existsSync(lockPath)) {
        archive.file(lockPath, { name: `${bundleName}/package-lock.json` });
      }
      archive.file(path.join(tmpdir, 'setup.sh'),   { name: `${bundleName}/setup.sh` });
      archive.file(path.join(tmpdir, 'README.txt'), { name: `${bundleName}/README.txt` });

      if (embedNode && nodeRuntimeDir) {
        // Add just the extracted binary under node-runtime/
        archive.directory(nodeRuntimeDir, `${bundleName}/node-runtime`);
      }

      archive.finalize();
    });

    const token = crypto.randomUUID();
    bundles.set(token, { zipPath, tmpdir, name: zipName, ts: Date.now() });

    send(`\u2713 Bundle ready: ${zipName}`);
    send(token, 'done');
  } catch (err) {
    send('');
    send(`\u2717 ${err.message}`, 'error');
    if (tmpdir) fs.rm(tmpdir, { recursive: true, force: true }, () => {});
  } finally {
    res.end();
  }
});

app.get('/download/:token', (req, res) => {
  const info = bundles.get(req.params.token);
  if (!info) return res.status(404).send('Bundle expired or not found.');
  res.download(info.zipPath, info.name, err => {
    if (!err) {
      bundles.delete(req.params.token);
      fs.rm(info.tmpdir, { recursive: true, force: true }, () => {});
    }
  });
});

app.listen(3005, '0.0.0.0', () => {
  console.log('nodejs-bundler listening on :3005');
});
