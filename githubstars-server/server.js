const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN    = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME;
const PORT     = 3003;
const SYNC_MS  = 60 * 60 * 1000; // 1 hour

let cache = {
  stars:     [],
  lastSync:  null,
  syncing:   false,
  error:     null,
};

function githubGet(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept':        'application/vnd.github.star+json',
        'User-Agent':    'ximg-githubstars/1.0',
      },
    };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ body: JSON.parse(data), headers: res.headers, status: res.statusCode }); }
        catch (e) { reject(new Error('JSON parse: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

async function fetchAllStars() {
  if (cache.syncing) return;
  cache.syncing = true;
  cache.error   = null;
  console.log(`[${new Date().toISOString()}] Syncing stars for ${USERNAME}...`);

  const stars = [];
  let page = 1;

  try {
    while (true) {
      const url = `https://api.github.com/users/${USERNAME}/starred?per_page=100&page=${page}`;
      const { body, headers, status } = await githubGet(url);

      if (status !== 200) throw new Error(`GitHub API ${status}: ${JSON.stringify(body)}`);
      if (!Array.isArray(body) || body.length === 0) break;

      for (const item of body) {
        // vnd.github.star+json wraps: { starred_at, repo }
        const r = item.repo || item;
        stars.push({
          id:               r.id,
          name:             r.name,
          full_name:        r.full_name,
          html_url:         r.html_url,
          description:      r.description || '',
          language:         r.language    || null,
          stargazers_count: r.stargazers_count,
          forks_count:      r.forks_count,
          topics:           r.topics || [],
          updated_at:       r.updated_at,
          pushed_at:        r.pushed_at,
          starred_at:       item.starred_at || null,
          owner_login:      r.owner.login,
          owner_avatar:     r.owner.avatar_url,
          license:          r.license ? r.license.spdx_id : null,
        });
      }

      console.log(`  page ${page}: +${body.length} (total ${stars.length})`);
      if (!(headers['link'] || '').includes('rel="next"')) break;
      page++;
      await new Promise(r => setTimeout(r, 150));
    }

    cache.stars    = stars;
    cache.lastSync = new Date().toISOString();
    console.log(`[${new Date().toISOString()}] Done: ${stars.length} stars`);
  } catch (err) {
    cache.error = err.message;
    console.error(`[${new Date().toISOString()}] Sync error:`, err.message);
  } finally {
    cache.syncing = false;
  }
}

fetchAllStars();
setInterval(fetchAllStars, SYNC_MS);

const PAGE_HTML = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];

  if (p === '/api/stars') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      stars:    cache.stars,
      lastSync: cache.lastSync,
      syncing:  cache.syncing,
      error:    cache.error,
      total:    cache.stars.length,
    }));
  } else if (p === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      lastSync: cache.lastSync,
      syncing:  cache.syncing,
      error:    cache.error,
      total:    cache.stars.length,
    }));
  } else if (p === '/favicon.ico') {
    res.writeHead(302, { 'Location': '/favicon.svg' });
    res.end();
  } else if (p === '/favicon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#f59e0b" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  }
});

server.listen(PORT, () => console.log(`githubstars on :${PORT}`));
