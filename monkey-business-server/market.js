const TICKERS = require('./tickers');

// Quote feeds. Yahoo first (single batch endpoint, no observed daily limit),
// Stooq as fallback (free CSV but has an undocumented per-IP daily hits cap
// that returns "Exceeded the daily hits limit" once tripped).
//
// We track per-provider stats so the UI can show which feed is healthy.

const apiStats = {
  yahoo: { calls: 0, ok: 0, failed: 0, blocked: false, lastError: null, lastErrorAt: null, lastOkAt: null },
  stooq: { calls: 0, ok: 0, failed: 0, blocked: false, lastError: null, lastErrorAt: null, lastOkAt: null }
};

function recordOk(provider) {
  const s = apiStats[provider];
  s.calls++;
  s.ok++;
  s.blocked = false;
  s.lastOkAt = Date.now();
}

function recordFail(provider, err) {
  const s = apiStats[provider];
  s.calls++;
  s.failed++;
  s.lastError = err.message || String(err);
  s.lastErrorAt = Date.now();
  if (provider === 'stooq' && /daily hits limit/i.test(s.lastError)) s.blocked = true;
  else if (provider === 'yahoo' && / 4\d\d\b/.test(s.lastError))     s.blocked = true;
}

// Yahoo caps spark at 20 symbols per request (returns 400 above that).
const YAHOO_CHUNK = 20;
async function fetchYahooChunk(symbols) {
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.join(',')}&range=1d&interval=1m`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 monkey-business/1.0' }
  });
  if (!res.ok) throw new Error(`yahoo spark ${res.status} ${res.statusText}`);
  const j = await res.json();
  const out = {};
  for (const r of (j?.spark?.result || [])) {
    const meta = r?.response?.[0]?.meta;
    const sym  = (meta?.symbol || r?.symbol || '').toUpperCase();
    const px   = meta?.regularMarketPrice;
    if (sym && Number.isFinite(px) && px > 0) out[sym] = px;
  }
  return out;
}

async function fetchAllFromYahoo() {
  let merged = {};
  for (let i = 0; i < TICKERS.length; i += YAHOO_CHUNK) {
    try {
      Object.assign(merged, await fetchYahooChunk(TICKERS.slice(i, i + YAHOO_CHUNK)));
      recordOk('yahoo');
    } catch (err) {
      recordFail('yahoo', err);
      throw err;
    }
  }
  return merged;
}

const STOOQ_CHUNK = 50;
async function fetchStooqChunk(symbols) {
  const q = symbols.map(s => s.toLowerCase() + '.us').join('+');
  const url = `https://stooq.com/q/l/?s=${q}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'monkey-business/1.0 (+https://monkey-business.ximg.app)' }
  });
  if (!res.ok) throw new Error(`stooq ${res.status} ${res.statusText}`);
  const text = await res.text();
  // Stooq's daily-limit error is HTTP 200 with a plaintext body, not CSV.
  if (/Exceeded the daily hits limit/i.test(text)) throw new Error('stooq daily hits limit hit');
  const out = {};
  const lines = text.trim().split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 7) continue;
    const sym = cols[0].toUpperCase().replace(/\.US$/, '');
    const close = Number(cols[6]);
    if (Number.isFinite(close) && close > 0) out[sym] = close;
  }
  return out;
}

async function fetchAllFromStooq() {
  let merged = {};
  for (let i = 0; i < TICKERS.length; i += STOOQ_CHUNK) {
    try {
      Object.assign(merged, await fetchStooqChunk(TICKERS.slice(i, i + STOOQ_CHUNK)));
      recordOk('stooq');
    } catch (err) {
      recordFail('stooq', err);
      throw err;
    }
  }
  return merged;
}

// Floor below which we treat a successful-looking response as a failure and
// fall back. Mirrors the floor in server.js so a thin Yahoo response (e.g.
// if Yahoo ever rate-limits and returns mostly empty results) triggers the
// fallback rather than starving the round.
const FALLBACK_FLOOR = 50;

async function fetchAllQuotes() {
  try {
    const m = await fetchAllFromYahoo();
    if (Object.keys(m).length >= FALLBACK_FLOOR) return m;
    console.warn(`[market] yahoo returned only ${Object.keys(m).length} quotes — falling back to stooq`);
  } catch (err) {
    console.warn('[market] yahoo failed, falling back to stooq:', err.message);
  }
  return fetchAllFromStooq();
}

function getApiStats() {
  return JSON.parse(JSON.stringify(apiStats));
}

// Yahoo Finance v8 chart endpoint — free, no key, but rate-limits cloud IPs.
// We aggressively cache per-ticker responses to keep traffic minimal.
const HISTORY_CACHE_TTL_MS = 60 * 60 * 1000;   // 1 hour
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;   // 5 min on errors
const historyCache = new Map(); // ticker -> { ts, data | err }

async function fetchHistory(ticker, range = '7d', interval = '1d') {
  const key = `${ticker}:${range}:${interval}`;
  const cached = historyCache.get(key);
  const now = Date.now();
  if (cached) {
    const ttl = cached.err ? NEGATIVE_CACHE_TTL_MS : HISTORY_CACHE_TTL_MS;
    if (now - cached.ts < ttl) return cached;
  }
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 monkey-business/1.0' }
    });
    if (!res.ok) throw new Error(`yahoo ${res.status}`);
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    if (!r) throw new Error('no chart result');
    const ts = r.timestamp || [];
    const closes = r.indicators?.quote?.[0]?.close || [];
    // pair, drop nulls
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === 'number' && Number.isFinite(c)) {
        points.push({ ts: ts[i] * 1000, close: c });
      }
    }
    const entry = {
      ts: now, ticker, range, interval,
      data: { points, currency: r.meta?.currency || 'USD', symbol: r.meta?.symbol || ticker }
    };
    historyCache.set(key, entry);
    return entry;
  } catch (err) {
    const entry = { ts: now, err: err.message };
    historyCache.set(key, entry);
    return entry;
  }
}

module.exports = { TICKERS, fetchAllQuotes, fetchHistory, getApiStats };
