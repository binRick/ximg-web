const TICKERS = require('./tickers');

// Stooq batch CSV: free, no key, no crumb. US tickers use `.us` suffix.
// Returns columns: Symbol,Date,Time,Open,High,Low,Close,Volume
// Bad/unknown tickers return "N/D" for all fields — silently dropped.
//
// We keep the request under URL length limits by chunking 50 tickers per call
// (giving headroom; the practical limit is ~2KB on most stacks).
const CHUNK = 50;

async function fetchChunk(symbols) {
  const q = symbols.map(s => s.toLowerCase() + '.us').join('+');
  const url = `https://stooq.com/q/l/?s=${q}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'monkey-business/1.0 (+https://monkey-business.ximg.app)' }
  });
  if (!res.ok) throw new Error(`stooq ${res.status} ${res.statusText}`);
  const text = await res.text();
  return text;
}

function parseCsv(text) {
  const out = {};
  const lines = text.trim().split(/\r?\n/);
  // header: Symbol,Date,Time,Open,High,Low,Close,Volume
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 7) continue;
    const sym = cols[0].toUpperCase().replace(/\.US$/, '');
    const close = Number(cols[6]);
    if (Number.isFinite(close) && close > 0) out[sym] = close;
  }
  return out;
}

async function fetchAllQuotes() {
  const chunks = [];
  for (let i = 0; i < TICKERS.length; i += CHUNK) {
    chunks.push(TICKERS.slice(i, i + CHUNK));
  }
  // sequential — Stooq doesn't love bursts; 2 calls finish in <500ms
  let merged = {};
  for (const c of chunks) {
    const text = await fetchChunk(c);
    Object.assign(merged, parseCsv(text));
  }
  return merged;
}

module.exports = { TICKERS, fetchAllQuotes };
