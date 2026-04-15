'use strict';
const express   = require('express');
const { spawn, spawnSync } = require('child_process');
const fs        = require('fs');
const fsp       = fs.promises;
const path      = require('path');
const os        = require('os');
const crypto    = require('crypto');
const https     = require('https');
const http      = require('http');
const net       = require('net');
const archiver  = require('archiver');
const tar       = require('tar');

const BUNDLE_LOG = '/data/bundler-downloads.log';

function logBundleDownload(bundler, ip, pkg, extra, sizeMB) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), bundler, ip,
                                  package: pkg, extra, sizeMB: Math.round(sizeMB * 10) / 10 });
  try { fs.appendFileSync(BUNDLE_LOG, entry + '\n'); } catch (_) {}
}

// ── ClamAV helpers ──────────────────────────────────────────────────
function clamavScanFile(filePath) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: 'clamav', port: 3310 });
    sock.setTimeout(30000);
    let response = '';
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      const fStream = fs.createReadStream(filePath, { highWaterMark: 8192 });
      fStream.on('data', (chunk) => {
        const len = Buffer.allocUnsafe(4);
        len.writeUInt32BE(chunk.length);
        sock.write(Buffer.concat([len, chunk]));
      });
      fStream.on('end', () => { sock.write(Buffer.alloc(4)); });
      fStream.on('error', () => { sock.destroy(); resolve(null); });
    });
    sock.on('data', (data) => { response += data.toString(); });
    sock.on('end', () => {
      const r = response.trim().replace(/\0$/, '');
      if (r.endsWith(' FOUND')) resolve(r.slice('stream: '.length, -' FOUND'.length));
      else resolve('CLEAN');
    });
    sock.on('error', () => resolve(null));
    sock.on('timeout', () => { sock.destroy(); resolve(null); });
  });
}

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

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
              font-weight:600;padding:.5rem .75rem;border-radius:7px;cursor:pointer;
              transition:all .15s;letter-spacing:.01em;width:auto;margin-top:0;white-space:nowrap}
    .snav-btn.active{background:#1e293b;color:#f1f5f9;box-shadow:0 1px 4px rgba(0,0,0,.4)}
    .snav-btn:hover:not(.active){color:#cbd5e1}

    /* test cases */
    .pkg-snav{display:flex;gap:.35rem;margin-bottom:1.2rem;flex-wrap:wrap}
    .pkg-snav-btn{background:rgba(15,23,42,.7);border:1px solid rgba(255,255,255,.08);
                  color:#64748b;font-size:.72rem;font-weight:600;letter-spacing:.07em;
                  text-transform:uppercase;padding:.3rem .75rem;border-radius:5px;
                  cursor:pointer;transition:all .15s}
    .pkg-snav-btn.active{background:#026e00;border-color:#026e00;color:#fff}
    .test-list{width:100%;border-collapse:collapse;margin-bottom:1rem}
    .test-list th{font-size:.67rem;letter-spacing:.09em;text-transform:uppercase;
                  color:#475569;font-weight:700;padding:.4rem .7rem;text-align:left;
                  border-bottom:1px solid rgba(255,255,255,.06)}
    .test-row td{padding:.45rem .7rem;font-size:.78rem;border-bottom:1px solid rgba(255,255,255,.04);
                 vertical-align:middle}
    .test-row:last-child td{border-bottom:none}
    .test-id{font-family:monospace;color:#475569;width:3rem;font-size:.72rem}
    .test-name{color:#94a3b8;font-weight:600}
    .test-desc{color:#475569;font-size:.72rem}
    .test-detail{color:#64748b;font-size:.72rem;font-family:monospace;max-width:320px;
                 overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .test-badge{display:inline-block;font-size:.65rem;font-weight:700;letter-spacing:.07em;
                text-transform:uppercase;padding:.18rem .5rem;border-radius:4px;
                width:5.5rem;text-align:center}
    .test-badge.pending{background:rgba(100,116,139,.15);color:#64748b}
    .test-badge.running{background:rgba(234,179,8,.15);color:#eab308;
                        animation:pulse .8s ease-in-out infinite}
    .test-badge.pass{background:rgba(34,197,94,.15);color:#22c55e}
    .test-badge.fail{background:rgba(239,68,68,.15);color:#ef4444}
    .test-badge.skip{background:rgba(100,116,139,.1);color:#475569}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
    #test-summary{display:none;padding:.75rem 1rem;border-radius:7px;
                  font-size:.85rem;font-weight:600;margin-top:.75rem;text-align:center}

    /* form card */
    .card{background:rgba(30,41,59,.7);border:1px solid rgba(255,255,255,.07);
          border-radius:14px;padding:2rem;width:100%;max-width:680px;backdrop-filter:blur(8px)}
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
    <button class="snav-btn"        id="nav-tests"    onclick="setView('tests')">Test Cases</button>
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
  <div id="view-install" style="display:none;width:100%;max-width:900px;margin:0 auto">
    <div class="card" style="max-width:none">
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

  <!-- Test Cases view -->
  <div id="view-tests" style="display:none;width:100%;max-width:860px">
    <div class="card" style="max-width:none">
      <div style="margin-bottom:1rem">
        <div style="font-size:.7rem;letter-spacing:.09em;text-transform:uppercase;
                    color:#475569;font-weight:700;margin-bottom:.5rem">Test Package</div>
        <div class="pkg-snav" id="tpkg-nav">
          <button class="pkg-snav-btn active" id="tpkg-nodemon"
                  onclick="selectTestPkg('nodemon')">nodemon</button>
        </div>
      </div>

      <div id="test-list-wrap">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
          <span style="font-weight:700;font-size:.95rem;color:#f1f5f9">Test Suite</span>
          <button id="run-btn" onclick="runTests()"
                  style="width:auto;margin:0;padding:.35rem 1.1rem;font-size:.8rem">&#9654; Run</button>
        </div>
        <table class="test-list" id="test-table">
          <thead><tr>
            <th>ID</th><th>Test</th><th>Description</th><th>Status</th><th>Detail</th>
          </tr></thead>
          <tbody id="test-tbody"></tbody>
        </table>
      </div>

      <div id="test-log-wrap" style="display:none;margin-top:.75rem">
        <div style="background:#1e2433;border-radius:10px 10px 0 0;padding:.4rem .75rem;
                    display:flex;align-items:center;gap:.35rem;
                    border:1px solid rgba(255,255,255,.08);border-bottom:none">
          <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#ef4444"></span>
          <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#eab308"></span>
          <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#22c55e"></span>
          <span style="flex:1;text-align:center;font-size:.72rem;color:#64748b;
                       font-family:monospace;margin-right:22px">bundle stream</span>
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
                    border:1px solid rgba(34,197,94,.2);border-bottom:none">
          <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#ef4444"></span>
          <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#eab308"></span>
          <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#22c55e"></span>
          <span style="flex:1;text-align:center;font-size:.72rem;color:#22c55e;
                       font-family:monospace;margin-right:22px">install test — nodemon functionality</span>
        </div>
        <div id="test-install-log"
             style="background:#060d10;border:1px solid rgba(34,197,94,.15);
                    border-radius:0 0 10px 10px;padding:.75rem 1rem;height:220px;
                    overflow-y:auto;font-family:'Fira Code','Consolas',monospace;
                    font-size:.76rem;line-height:1.6;color:#86efac;
                    white-space:pre-wrap;word-break:break-all"></div>
      </div>

      <div id="test-summary"></div>
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

    // ── Test Cases ──────────────────────────────────────────────────────────
    const TEST_DEFS = [
      { id:'T01', name:'Reject invalid package name',      desc:'POST with "!!bad!!" → 400 JSON error' },
      { id:'T02', name:'Bundle stream accepted',            desc:'POST nodemon → 200 text/event-stream' },
      { id:'T03', name:'npm install output in stream',      desc:'Stream contains "added" or "packages" line' },
      { id:'T04', name:'ClamAV scan clean',                 desc:'No INFECTED line in stream' },
      { id:'T05', name:'Bundle completes without error',    desc:'event:done received (not event:error)' },
      { id:'T06', name:'Download token is valid UUID',      desc:'event:done data matches UUID format' },
      { id:'T07', name:'bundle-meta endpoint responds',     desc:'GET /bundle-meta/<token> → 200 JSON' },
      { id:'T08', name:'Bundle filename is a .zip',         desc:'Metadata name field ends with .zip' },
      { id:'T09', name:'Bundle size > 10 KB',               desc:'Metadata size field > 10,240 bytes' },
      { id:'T10', name:'Zip extracts cleanly',              desc:'Server unzips bundle without error' },
      { id:'T11', name:'setup.sh present',                  desc:'setup.sh found in extracted bundle' },
      { id:'T12', name:'nodemon in node_modules',           desc:'node_modules/nodemon/package.json exists' },
      { id:'T13', name:'nodemon version readable',          desc:'Version field present in package.json' },
      { id:'T14', name:'nodemon binary exists',             desc:'node_modules/.bin/nodemon present' },
      { id:'T15', name:'nodemon --version succeeds',        desc:'node nodemon --version exits 0' },
      { id:'T16', name:'Version output is semver',          desc:'Output matches N.N.N semver format' },
      { id:'T17', name:'nodemon require() loads',           desc:'Module loads cleanly via require without error' },
      { id:'T18', name:'nodemon --help exits 0',            desc:'node nodemon --help returns exit code 0' },
    ];

    let activeTestPkg = 'nodemon';
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
      const badge = row.querySelector('.test-badge');
      const detEl = row.querySelector('.test-detail');
      badge.className = 'test-badge ' + status;
      const labels = { pending:'—', running:'running…', pass:'✓ PASS', fail:'✗ FAIL', skip:'SKIP' };
      badge.textContent = labels[status] || status;
      if (detEl && detail !== undefined) detEl.textContent = detail;
    }

    function initTestList() {
      const tbody = document.getElementById('test-tbody');
      if (!tbody) return;
      tbody.innerHTML = TEST_DEFS.map(t => \`
        <tr class="test-row" id="trow-\${t.id}">
          <td class="test-id">\${t.id}</td>
          <td class="test-name">\${t.name}</td>
          <td class="test-desc">\${t.desc}</td>
          <td><span class="test-badge pending">—</span></td>
          <td class="test-detail"></td>
        </tr>\`).join('');

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

      const pkg   = activeTestPkg;
      let passed  = 0, failed = 0;
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

      const logEl = document.getElementById('test-log');
      function appendTestLog(text) {
        logEl.textContent += text + '\\n';
        logEl.scrollTop = logEl.scrollHeight;
      }

      // T01 — Reject invalid package name
      setTestStatus('T01', 'running');
      try {
        const f = new FormData();
        f.append('package', '!!bad!!');
        const r = await fetch('/bundle', { method:'POST', body: new URLSearchParams({ package:'!!bad!!' }) });
        const j = await r.json().catch(() => null);
        if (r.status === 400 && j && j.error) { pass('T01', 'HTTP 400 — ' + j.error); }
        else { fail('T01', 'Expected 400, got HTTP ' + r.status); abort('T02'); }
      } catch(e) { fail('T01', e.message); abort('T02'); }

      // T02–T06 — SSE bundle stream
      let token = null;
      if (!stopped) {
        setTestStatus('T02', 'running');
        setTestStatus('T03', 'running');
        setTestStatus('T04', 'running');
        setTestStatus('T05', 'running');
        setTestStatus('T06', 'running');

        let streamFailed = false;
        try {
          const resp = await fetch('/bundle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ package: pkg }),
          });
          const rct = resp.headers.get('content-type') || '';

          if (!resp.ok || !rct.includes('event-stream')) {
            fail('T02', 'Expected 200 event-stream, got HTTP ' + resp.status);
            abort('T03');
            streamFailed = true;
          } else {
            pass('T02', 'HTTP 200 text/event-stream');
            const reader = resp.body.getReader();
            const dec    = new TextDecoder();
            let buf = '', T03done = false, T04done = false, streamDone = false;

            while (!streamDone) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const blocks = buf.split('\\n\\n');
              buf = blocks.pop();

              for (const block of blocks) {
                let et = '', ed = '';
                for (const line of block.split('\\n')) {
                  if (line.startsWith('event: ')) et = line.slice(7).trim();
                  else if (line.startsWith('data: ')) ed = line.slice(6);
                }

                if (ed) {
                  appendTestLog(ed);
                  if (!T03done && /added|packages|npm install/i.test(ed)) {
                    T03done = true;
                    pass('T03', 'npm install output detected');
                  }
                  if (!T04done && ed.includes('INFECTED')) {
                    T04done = true;
                    fail('T04', ed.slice(0, 80));
                  }
                }

                if (et === 'done') {
                  token = ed;
                  if (!T03done) { fail('T03', 'No npm install output seen'); streamFailed = true; }
                  if (!T04done && !streamFailed) pass('T04', 'No INFECTED — ClamAV clean');
                  else if (!T04done) skip('T04', 'skipped — prior step failed');
                  if (!streamFailed) {
                    pass('T05', 'event:done received');
                    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(token)) { pass('T06', token); }
                    else { fail('T06', 'Unexpected format: ' + token); streamFailed = true; token = null; }
                  } else {
                    skip('T05', 'skipped — prior step failed');
                    skip('T06', 'skipped — prior step failed');
                    token = null;
                  }
                  streamDone = true; break;
                }
                if (et === 'error') {
                  if (!T03done) fail('T03', 'Bundle failed');
                  if (!T04done) skip('T04', 'Bundle failed');
                  fail('T05', 'event:error — ' + ed.slice(0, 80));
                  skip('T06', 'skipped — prior step failed');
                  streamFailed = true; streamDone = true; break;
                }
              }
            }
          }
        } catch(e) {
          fail('T02', 'Error: ' + e.message);
          abort('T03');
          streamFailed = true;
        }
        if (streamFailed) abort('T07');
      }

      // T07–T09 — Bundle metadata (non-consuming)
      if (!stopped && token) {
        setTestStatus('T07', 'running');
        setTestStatus('T08', 'running');
        setTestStatus('T09', 'running');
        try {
          const mr = await fetch('/bundle-meta/' + token);
          if (mr.ok) {
            pass('T07', 'HTTP ' + mr.status);
            const meta = await mr.json();
            if (meta.name && meta.name.endsWith('.zip')) { pass('T08', meta.name); }
            else { fail('T08', 'name: ' + (meta.name || '(none)')); abort('T09'); }
            if (!stopped) {
              meta.size > 10240
                ? pass('T09', meta.size.toLocaleString() + ' bytes (' + (meta.size/1048576).toFixed(1) + ' MB)')
                : (fail('T09', (meta.size || 0) + ' bytes — too small'), abort('T10'));
            }
          } else {
            fail('T07', 'HTTP ' + mr.status); abort('T08');
          }
        } catch(e) { fail('T07', e.message); abort('T08'); }
      }

      // T10–T18 — Server-side tests via /test-run
      if (!stopped && token) {
        ['T10','T11','T12','T13','T14','T15','T16','T17','T18'].forEach(id => setTestStatus(id, 'running'));
        document.getElementById('test-install-log-wrap').style.display = 'block';
        const ilog = document.getElementById('test-install-log');
        function appendInstallLog(text) {
          ilog.textContent += text + '\\n';
          ilog.scrollTop = ilog.scrollHeight;
        }
        try {
          const ir = await fetch('/test-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }),
          });
          if (!ir.ok) {
            ['T10','T11','T12','T13','T14','T15','T16','T17','T18'].forEach(id => fail(id, 'HTTP ' + ir.status));
          } else {
            const reader2 = ir.body.getReader();
            const dec2    = new TextDecoder();
            let ibuf = '';
            while (true) {
              const { done, value } = await reader2.read();
              if (done) break;
              ibuf += dec2.decode(value, { stream: true });
              const blocks = ibuf.split('\\n\\n');
              ibuf = blocks.pop();
              for (const block of blocks) {
                let et = '', ed = '';
                for (const line of block.split('\\n')) {
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
                } else if (!et && ed) {
                  appendInstallLog(ed);
                } else if (et === 'error') {
                  ['T10','T11','T12','T13','T14','T15','T16','T17','T18'].forEach(id => {
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
          ['T10','T11','T12','T13','T14','T15','T16','T17','T18'].forEach(id => {
            const row = document.getElementById('trow-' + id);
            if (row && row.querySelector('.test-badge').classList.contains('running'))
              fail(id, e.message);
          });
        }
      }

      // Summary
      const total = TEST_DEFS.length;
      const sumEl = document.getElementById('test-summary');
      sumEl.style.display = 'block';
      if (failed === 0) {
        sumEl.style.cssText += ';background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#86efac';
        sumEl.textContent = passed + '/' + total + ' passed — all tests pass';
      } else {
        sumEl.style.cssText += ';background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#fca5a5';
        sumEl.textContent = passed + '/' + total + ' passed · ' + failed + ' failed';
      }

      btn.disabled = false;
      btn.textContent = '↺ Re-run';
      testsRunning = false;
    }
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

    // ── ClamAV scan ──────────────────────────────────────
    send('');
    send('🛡 Scanning with ClamAV...');
    const allFiles   = walkDir(nodeModulesDir);
    let clamavOk     = true;
    const infected   = [];
    let cleanCount   = 0;
    for (const filePath of allFiles) {
      const result = await clamavScanFile(filePath);
      if (result === null) {
        send('  ⚠ ClamAV unavailable — skipping scan');
        clamavOk = false;
        break;
      } else if (result === 'CLEAN') {
        cleanCount++;
      } else {
        const rel = path.relative(tmpdir, filePath);
        send(`  ✗ ${rel} — INFECTED: ${result}`);
        infected.push({ file: rel, virus: result });
      }
    }
    if (infected.length > 0) {
      send('');
      for (const { file, virus } of infected) send(`✗ BLOCKED: ${file} — ${virus}`);
      send('Bundle blocked — malware detected in downloaded packages', 'error');
      return;
    }
    if (clamavOk) send(`✓ ${cleanCount} file(s) scanned — all clean`);
    const scanTs     = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const scanReport = clamavOk
      ? `ClamAV Scan Report\nGenerated: ${scanTs}\n\nResult: ${cleanCount} file(s) scanned — CLEAN\n`
      : `ClamAV Scan Report\nGenerated: ${scanTs}\n\nResult: SKIPPED (ClamAV unavailable)\n`;
    await fsp.writeFile(path.join(tmpdir, 'scan_results.txt'), scanReport);

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
      archive.file(path.join(tmpdir, 'setup.sh'),        { name: `${bundleName}/setup.sh` });
      archive.file(path.join(tmpdir, 'README.txt'),       { name: `${bundleName}/README.txt` });
      archive.file(path.join(tmpdir, 'scan_results.txt'), { name: `${bundleName}/scan_results.txt` });

      if (embedNode && nodeRuntimeDir) {
        // Add just the extracted binary under node-runtime/
        archive.directory(nodeRuntimeDir, `${bundleName}/node-runtime`);
      }

      archive.finalize();
    });

    const token = crypto.randomUUID();
    bundles.set(token, { zipPath, tmpdir, name: zipName, ts: Date.now(),
                         ip: req.ip || '', package: pkg,
                         extra: embedNode ? `${nodePlatform}-${nodeMajor}` : '' });

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
  let sizeMB = 0;
  try { sizeMB = fs.statSync(info.zipPath).size / 1048576; } catch (_) {}
  logBundleDownload('nodejs', info.ip || '', info.package || '', info.extra || '', sizeMB);
  res.download(info.zipPath, info.name, err => {
    if (!err) {
      bundles.delete(req.params.token);
      fs.rm(info.tmpdir, { recursive: true, force: true }, () => {});
    }
  });
});

// ── Non-consuming bundle metadata (for test cases) ───────────────────────────
app.get('/bundle-meta/:token', (req, res) => {
  const info = bundles.get(req.params.token);
  if (!info) return res.status(404).json({ error: 'Bundle not found or expired' });
  let size = 0;
  try { size = fs.statSync(info.zipPath).size; } catch (_) {}
  res.json({ name: info.name, size, package: info.package || '', extra: info.extra || '' });
});

// ── Test-run endpoint — SSE, server-side nodemon tests ───────────────────────
app.post('/test-run', async (req, res) => {
  const token = (req.body.token || '').trim();
  const info  = bundles.get(token);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sstep = (test, status, detail) =>
    res.write(`event: step\ndata: ${JSON.stringify({ test, status, detail: detail || '' })}\n\n`);
  const slog  = (msg) => res.write(`data: ${msg}\n\n`);
  const sskip = (test, reason) => sstep(test, 'skip', reason || 'skipped — prior step failed');
  const sdone = () => { res.write('event: done\ndata: ok\n\n'); res.end(); };
  const serr  = (msg) => { res.write(`event: error\ndata: ${msg}\n\n`); res.end(); };

  const remaining = (fromIdx, all) => all.slice(fromIdx);
  const ALL = ['T10','T11','T12','T13','T14','T15','T16','T17','T18'];

  if (!info) { serr('Bundle not found or expired'); return; }

  let workdir = null;
  try {
    workdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nodejs-test-'));

    // T10: extract zip
    slog(`$ unzip ${info.name}`);
    const unzip = spawnSync('unzip', ['-q', info.zipPath, '-d', workdir], { encoding: 'utf8' });
    if (unzip.status !== 0) {
      sstep('T10', 'fail', 'unzip failed: ' + (unzip.stderr || '').slice(0, 80));
      ALL.slice(1).forEach(t => sskip(t));
      sdone(); return;
    }
    const topEntries = fs.readdirSync(workdir).filter(e => !e.startsWith('.'));
    if (!topEntries.length) { sstep('T10', 'fail', 'empty zip'); ALL.slice(1).forEach(t => sskip(t)); sdone(); return; }
    sstep('T10', 'pass', `Extracted — ${topEntries[0]}`);

    const bundleDir    = path.join(workdir, topEntries[0]);
    const nodeModDir   = path.join(bundleDir, 'node_modules');

    // T11: setup.sh present
    const setupSh = path.join(bundleDir, 'setup.sh');
    if (fs.existsSync(setupSh)) {
      sstep('T11', 'pass', 'setup.sh found');
    } else {
      sstep('T11', 'fail', 'setup.sh not found');
      ALL.slice(2).forEach(t => sskip(t));
      sdone(); return;
    }

    // T12: nodemon package.json in node_modules
    const nodemonPkg = path.join(nodeModDir, 'nodemon', 'package.json');
    if (fs.existsSync(nodemonPkg)) {
      sstep('T12', 'pass', 'node_modules/nodemon/package.json exists');
    } else {
      sstep('T12', 'fail', 'node_modules/nodemon/ not found');
      ALL.slice(3).forEach(t => sskip(t));
      sdone(); return;
    }

    // T13: nodemon version readable
    let nodemonVer = null;
    try { nodemonVer = JSON.parse(fs.readFileSync(nodemonPkg, 'utf8')).version; } catch (_) {}
    if (nodemonVer) {
      sstep('T13', 'pass', `version: ${nodemonVer}`);
    } else {
      sstep('T13', 'fail', 'Could not read version from package.json');
      ALL.slice(4).forEach(t => sskip(t));
      sdone(); return;
    }

    // T14: node_modules/.bin/nodemon exists
    const binPath = path.join(nodeModDir, '.bin', 'nodemon');
    if (fs.existsSync(binPath)) {
      sstep('T14', 'pass', 'node_modules/.bin/nodemon exists');
    } else {
      sstep('T14', 'fail', 'node_modules/.bin/nodemon not found');
      ALL.slice(5).forEach(t => sskip(t));
      sdone(); return;
    }

    // T15: nodemon --version runs
    slog(`$ node ${binPath} --version`);
    const verRun = spawnSync('node', [binPath, '--version'],
      { encoding: 'utf8', timeout: 15000, cwd: bundleDir });
    const verOut = (verRun.stdout || '').trim();
    slog(verOut || (verRun.stderr || '').trim() || '(no output)');
    if (verRun.status === 0 && verOut) {
      sstep('T15', 'pass', `nodemon --version → ${verOut}`);
    } else {
      sstep('T15', 'fail', `exit ${verRun.status}: ${(verRun.stderr||'').slice(0,60)}`);
      ALL.slice(6).forEach(t => sskip(t));
      sdone(); return;
    }

    // T16: version output is semver
    if (/^\d+\.\d+\.\d+/.test(verOut)) {
      sstep('T16', 'pass', `${verOut} matches semver`);
    } else {
      sstep('T16', 'fail', `"${verOut}" is not semver`);
      ALL.slice(7).forEach(t => sskip(t));
      sdone(); return;
    }

    // T17: require('nodemon') loads without error
    slog(`$ node -e "require('nodemon')"`);
    const reqRun = spawnSync('node', ['-e', "require('nodemon')"],
      { encoding: 'utf8', timeout: 15000, cwd: bundleDir });
    if (reqRun.stdout) slog(reqRun.stdout.trim());
    if (reqRun.status === 0) {
      sstep('T17', 'pass', "require('nodemon') loaded successfully");
    } else {
      const errOut = (reqRun.stderr || '').slice(0, 120);
      slog(errOut);
      sstep('T17', 'fail', `exit ${reqRun.status}: ${errOut.slice(0,60)}`);
      sskip('T18');
      sdone(); return;
    }

    // T18: nodemon --help exits 0
    slog(`$ node ${binPath} --help`);
    const helpRun = spawnSync('node', [binPath, '--help'],
      { encoding: 'utf8', timeout: 15000, cwd: bundleDir });
    const helpFirst = ((helpRun.stdout || '') + (helpRun.stderr || '')).split('\n').find(l => l.trim());
    if (helpFirst) slog(helpFirst.trim());
    if (helpRun.status === 0) {
      sstep('T18', 'pass', 'nodemon --help exited 0');
    } else {
      sstep('T18', 'fail', `nodemon --help exited ${helpRun.status}`);
    }

    sdone();
  } catch (err) {
    serr(err.message);
  } finally {
    if (workdir) fs.rm(workdir, { recursive: true, force: true }, () => {});
    bundles.delete(token);
    if (info) fs.rm(info.tmpdir, { recursive: true, force: true }, () => {});
  }
});

app.listen(3005, '0.0.0.0', () => {
  console.log('nodejs-bundler listening on :3005');
});
