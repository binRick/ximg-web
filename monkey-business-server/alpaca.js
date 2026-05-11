'use strict';

// Alpaca market-data adapter — returns realistic bid/ask quotes so a
// simulated round can model buys at the ask and sells at the bid. Replaces
// the "Yahoo last-trade as both entry and exit" assumption in market.js,
// which is what makes the contrarian persona look like a genius (see
// WHY-NO-REAL-MONEY.md).
//
// Free plan = IEX feed (single venue). Quote prices/sizes are real but
// narrower than NBBO; good enough to model the spread cost, not good
// enough to claim NBBO compliance.

const TICKERS = require('./tickers');

const DATA_BASE = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';
const KEY_ID    = process.env.ALPACA_KEY_ID;
const SECRET    = process.env.ALPACA_SECRET_KEY;
const FEED      = process.env.ALPACA_FEED || 'iex';

const apiStats = {
  alpaca: {
    calls: 0, ok: 0, failed: 0, blocked: false,
    lastError: null, lastErrorAt: null, lastOkAt: null
  }
};

function recordOk()         { const s = apiStats.alpaca; s.calls++; s.ok++; s.blocked = false; s.lastOkAt = Date.now(); }
function recordFail(err)    { const s = apiStats.alpaca; s.calls++; s.failed++; s.lastError = err.message || String(err); s.lastErrorAt = Date.now(); if (/^http 4(0[13]|29)/i.test(s.lastError)) s.blocked = true; }

function authHeaders() {
  if (!KEY_ID || !SECRET) {
    throw new Error('ALPACA_KEY_ID / ALPACA_SECRET_KEY not set');
  }
  return { 'APCA-API-KEY-ID': KEY_ID, 'APCA-API-SECRET-KEY': SECRET };
}

const QUOTES_CHUNK = 50;

async function fetchQuotesChunk(symbols) {
  const url = `${DATA_BASE}/v2/stocks/quotes/latest?symbols=${symbols.join(',')}&feed=${FEED}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const j = await res.json();
  const out = {};
  const quotes = j.quotes || {};
  for (const sym of Object.keys(quotes)) {
    const q = quotes[sym];
    const bid = Number(q.bp);
    const ask = Number(q.ap);
    if (Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0 && ask >= bid) {
      out[sym.toUpperCase()] = {
        bid, ask,
        mid: (bid + ask) / 2,
        bidSize: Number(q.bs) || 0,
        askSize: Number(q.as) || 0,
        ts: q.t || null
      };
    }
  }
  return out;
}

async function fetchAllQuotes() {
  let merged = {};
  for (let i = 0; i < TICKERS.length; i += QUOTES_CHUNK) {
    try {
      Object.assign(merged, await fetchQuotesChunk(TICKERS.slice(i, i + QUOTES_CHUNK)));
      recordOk();
    } catch (err) {
      recordFail(err);
      throw err;
    }
  }
  return merged;
}

function getApiStats() {
  return JSON.parse(JSON.stringify(apiStats));
}

// Market-hours clock, cached briefly. Returns Alpaca's view of whether the
// US equity market is currently open. We use this to skip rounds off-hours,
// since IEX freezes quotes at the close with wide protective bands that
// would otherwise generate fake P&L.
let clockCache = { ts: 0, payload: null };
const CLOCK_TTL_MS = 30 * 1000;
async function getClock() {
  const now = Date.now();
  if (clockCache.payload && now - clockCache.ts < CLOCK_TTL_MS) return clockCache.payload;
  const TRADING_BASE = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
  const res = await fetch(`${TRADING_BASE}/v2/clock`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const j = await res.json();
  clockCache = { ts: now, payload: j };
  return j;
}

module.exports = { TICKERS, fetchAllQuotes, getApiStats, getClock };
