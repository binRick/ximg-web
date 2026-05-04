const TICKERS = require('./tickers');

// Yahoo Finance v7 spark batch: free, no key, no crumb. Returns latest
// regularMarketPrice per symbol — close enough to a tick since we re-snapshot
// every round. Outside US hours `regularMarketPrice` is the most recent close,
// matching the prior Stooq behaviour.
//
// Yahoo caps spark at 20 symbols per request (returns 400 above that).
const CHUNK = 20;

async function fetchChunk(symbols) {
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.join(',')}&range=1d&interval=1m`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 monkey-business/1.0' }
  });
  if (!res.ok) throw new Error(`yahoo spark ${res.status} ${res.statusText}`);
  const j = await res.json();
  const results = j?.spark?.result || [];
  const out = {};
  for (const r of results) {
    const meta = r?.response?.[0]?.meta;
    const sym  = (meta?.symbol || r?.symbol || '').toUpperCase();
    const px   = meta?.regularMarketPrice;
    if (sym && Number.isFinite(px) && px > 0) out[sym] = px;
  }
  return out;
}

async function fetchAllQuotes() {
  let merged = {};
  for (let i = 0; i < TICKERS.length; i += CHUNK) {
    Object.assign(merged, await fetchChunk(TICKERS.slice(i, i + CHUNK)));
  }
  return merged;
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

module.exports = { TICKERS, fetchAllQuotes, fetchHistory };
