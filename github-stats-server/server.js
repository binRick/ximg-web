const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN    = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME || 'binRick';
const PORT     = 3009;
const SYNC_MS  = 60 * 60 * 1000; // 1 hour
const REPO_LIMIT = 20;

let cache = {
  repos:    [],
  lastSync: null,
  syncing:  false,
  error:    null,
};

function githubGet(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept':        'application/vnd.github.v3+json',
        'User-Agent':    'ximg-github-stats/1.0',
      },
    };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ body: JSON.parse(data), status: res.statusCode }); }
        catch (e) { reject(new Error('JSON parse: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

async function fetchStats() {
  if (cache.syncing) return;
  cache.syncing = true;
  cache.error   = null;
  console.log(`[${new Date().toISOString()}] Syncing GitHub traffic stats for ${USERNAME}...`);

  try {
    // Get latest 20 repos
    const reposUrl = `https://api.github.com/users/${USERNAME}/repos?sort=pushed&direction=desc&per_page=${REPO_LIMIT}`;
    const { body: repos, status } = await githubGet(reposUrl);
    if (status !== 200) throw new Error(`GitHub repos API ${status}: ${JSON.stringify(repos)}`);

    const results = [];
    for (const repo of repos) {
      await new Promise(r => setTimeout(r, 80)); // avoid rate limit
      const [clonesRes, viewsRes] = await Promise.all([
        githubGet(`https://api.github.com/repos/${USERNAME}/${repo.name}/traffic/clones`),
        githubGet(`https://api.github.com/repos/${USERNAME}/${repo.name}/traffic/views`),
      ]);

      const clones = clonesRes.status === 200 ? clonesRes.body : { count: 0, uniques: 0, clones: [] };
      const views  = viewsRes.status  === 200 ? viewsRes.body  : { count: 0, uniques: 0, views: [] };

      // Build per-day breakdown (merge clones+views by date)
      const days = {};
      for (const d of (clones.clones || [])) {
        const k = d.timestamp.slice(0, 10);
        days[k] = days[k] || { date: k, clones: 0, uniqueCloners: 0, views: 0, uniqueViewers: 0 };
        days[k].clones       += d.count;
        days[k].uniqueCloners += d.uniques;
      }
      for (const d of (views.views || [])) {
        const k = d.timestamp.slice(0, 10);
        days[k] = days[k] || { date: k, clones: 0, uniqueCloners: 0, views: 0, uniqueViewers: 0 };
        days[k].views         += d.count;
        days[k].uniqueViewers += d.uniques;
      }

      results.push({
        name:          repo.name,
        full_name:     repo.full_name,
        html_url:      repo.html_url,
        description:   repo.description || '',
        stars:         repo.stargazers_count,
        forks:         repo.forks_count,
        language:      repo.language || null,
        pushed_at:     repo.pushed_at,
        clones:        clones.count   || 0,
        uniqueCloners: clones.uniques || 0,
        views:         views.count    || 0,
        uniqueViewers: views.uniques  || 0,
        days:          Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
      });

      console.log(`  ${repo.name}: ${clones.count || 0} clones, ${views.count || 0} views`);
    }

    cache.repos    = results;
    cache.lastSync = new Date().toISOString();
    console.log(`[${new Date().toISOString()}] Done: ${results.length} repos`);
  } catch (err) {
    cache.error = err.message;
    console.error(`[${new Date().toISOString()}] Sync error:`, err.message);
  } finally {
    cache.syncing = false;
  }
}

fetchStats();
setInterval(fetchStats, SYNC_MS);

const PAGE_HTML = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];

  if (p === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      repos:    cache.repos,
      lastSync: cache.lastSync,
      syncing:  cache.syncing,
      error:    cache.error,
    }));
  } else if (p === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  } else if (p === '/favicon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#6366f1" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`);
  } else if (p === '/favicon.ico') {
    res.writeHead(302, { 'Location': '/favicon.svg' });
    res.end();
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  }
});

server.listen(PORT, () => console.log(`github-stats on :${PORT}`));
