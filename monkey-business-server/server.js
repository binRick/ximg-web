const http = require('http');
const url  = require('url');
const { stmts, asTx } = require('./db');
const { TICKERS, fetchAllQuotes, fetchHistory, getApiStats } = require('./market');
const { pickFor: strategyPick } = require('./strategy');

const PORT             = +(process.env.PORT || 3015);
const ROUND_INTERVAL_MS = +(process.env.ROUND_INTERVAL_MS || 60 * 1000);
const BONUS_RATE_MS    = +(process.env.BONUS_RATE_MS || 3 * 1000); // per-IP cooldown
const BONUS_MIN_GAP_MS = 2 * 1000; // global min gap between bonus rounds

// ---- SSE clients ----------------------------------------------------------
const clients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* client gone — drop on next write */ }
  }
}

// ---- Round mechanics ------------------------------------------------------
// A round = each monkey picks 1 ticker, prices snapshotted at start.
// Round is *settled* when the next round starts: the new round's prices act as
// each pick's exit_price, computing % return.
//
// Cron (auto) and visitor-triggered (bonus) rounds use the same code path; the
// only difference is the kind tag and the no-spam guard.

let runningRound = false;
let lastRoundStartedAt = 0;

async function runRound(kind) {
  if (runningRound) return { ok: false, reason: 'already_running' };
  runningRound = true;
  try {
    const now = Date.now();
    if (kind === 'bonus' && now - lastRoundStartedAt < BONUS_MIN_GAP_MS) {
      return { ok: false, reason: 'too_soon' };
    }

    let priceMap;
    try {
      priceMap = await fetchAllQuotes();
    } catch (err) {
      console.error('[round] price fetch failed:', err.message);
      return { ok: false, reason: 'fetch_failed' };
    }
    const availableTickers = Object.keys(priceMap);
    if (availableTickers.length < 50) {
      // sanity floor — yahoo sometimes returns a half-empty response off-hours
      return { ok: false, reason: 'too_few_quotes', got: availableTickers.length };
    }

    const startedAt = Date.now();
    let settledRoundId = null;
    let marketPct = 0, swarmPct = 0;

    let prevPicks = [];
    let tickerPnls = [];
    let lastPickByMonkey = new Map();

    asTx(() => {
      // 1) Settle previous unsettled round (if any) using these new prices
      const prev = stmts.latestUnsettledRound.get();
      if (prev) {
        prevPicks = stmts.picksForRound.all(prev.id);
        const prevPrices = stmts.pricesForRound.all(prev.id);
        const prevPriceMap = new Map(prevPrices.map(r => [r.ticker, r.price]));

        // Build per-ticker pnl snapshot for the strategy module's context
        for (const [ticker, oldP] of prevPriceMap) {
          const newP = priceMap[ticker];
          if (typeof newP === 'number' && oldP > 0) {
            tickerPnls.push({ ticker, pnl: (newP - oldP) / oldP });
          }
        }
        tickerPnls.sort((a, b) => b.pnl - a.pnl);
        for (const p of prevPicks) lastPickByMonkey.set(p.monkey_id, p.ticker);

        // Equal-weight market % change between prev and new prices
        let mSum = 0, mCount = 0;
        for (const { ticker, price: oldP } of prevPrices) {
          const newP = priceMap[ticker];
          if (typeof newP === 'number') {
            mSum += (newP - oldP) / oldP;
            mCount++;
          }
        }
        marketPct = mCount ? mSum / mCount : 0;

        // Per-pick P&L
        let swarmSum = 0;
        for (const pick of prevPicks) {
          const exit = priceMap[pick.ticker];
          let pnl;
          if (typeof exit === 'number') {
            pnl = (exit - pick.entry_price) / pick.entry_price;
          } else {
            pnl = 0; // ticker missing this round — treat as flat
          }
          stmts.settlePick.run(typeof exit === 'number' ? exit : pick.entry_price, pnl, prev.id, pick.monkey_id);

          // Update rolling per-monkey stats
          const beatMarket = pnl > marketPct ? 1 : 0;
          // log return — robust to the occasional bad quote (cap denom)
          const logRet = Math.log(1 + Math.max(-0.95, pnl));
          stmts.bumpStat.run(logRet, pnl, pnl * pnl, beatMarket, prev.id, pick.monkey_id);
          swarmSum += pnl;
        }
        swarmPct = prevPicks.length ? swarmSum / prevPicks.length : 0;

        stmts.settleRound.run(startedAt, prev.id);
        settledRoundId = prev.id;

        const lastMarket = stmts.latestMarket.get();
        const cumMarket = (lastMarket?.cum_market ?? 0) + marketPct;
        const cumSwarm  = (lastMarket?.cum_swarm  ?? 0) + swarmPct;
        stmts.insertMarket.run(prev.id, startedAt, marketPct, swarmPct, cumMarket, cumSwarm);
      }

      // 2) Open new round
      const roundId = stmts.insertRound.run(startedAt, kind).lastInsertRowid;

      // 3) Snapshot prices
      for (const t of availableTickers) {
        stmts.insertPrice.run(roundId, t, priceMap[t]);
      }

      // 4) Each monkey picks one ticker. ids 1-50 use uniform random (the
      //    control cohort); ids 51-100 use a strategy derived from their
      //    deterministic archetype (the persona cohort).
      const monkeys = stmts.allMonkeys.all();
      const ctx = { tickers: availableTickers, tickerPnls, lastPickByMonkey, roundId };
      for (const m of monkeys) {
        let t = strategyPick(m.id, ctx);
        if (typeof priceMap[t] !== 'number') {
          t = availableTickers[(Math.random() * availableTickers.length) | 0];
        }
        stmts.insertPick.run(roundId, m.id, t, priceMap[t]);
      }

      lastRoundStartedAt = startedAt;

      // Broadcast (after tx commits — node-better-sqlite3 transactions are sync)
      const newPicks = stmts.picksForRound.all(roundId);
      const settled = settledRoundId
        ? {
            roundId: settledRoundId,
            marketPct,
            swarmPct,
            picks: stmts.picksForRound.all(settledRoundId).map(p => ({
              monkeyId: p.monkey_id,
              ticker: p.ticker,
              pnlPct: p.pnl_pct
            }))
          }
        : null;

      // Schedule the broadcast after commit
      process.nextTick(() => {
        broadcast('round', {
          roundId,
          startedAt,
          kind,
          picks: newPicks.map(p => ({
            monkeyId: p.monkey_id,
            ticker: p.ticker,
            entryPrice: p.entry_price
          })),
          settled,
          nextRoundAt: lastAutoRoundAt + ROUND_INTERVAL_MS
        });
      });
    })();

    return { ok: true };
  } finally {
    runningRound = false;
  }
}

// ---- Cron -----------------------------------------------------------------
let lastAutoRoundAt = 0;
async function autoTick() {
  lastAutoRoundAt = Date.now();
  const result = await runRound('auto');
  if (!result.ok) console.warn('[auto] skipped:', result.reason);
}

// First round on startup (so the dashboard isn't empty), then on the cadence.
setTimeout(() => { autoTick(); }, 2_000);
setInterval(autoTick, ROUND_INTERVAL_MS);

// ---- Bonus rate-limiting --------------------------------------------------
const ipCooldown = new Map(); // ip -> ts
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

// ---- HTTP handlers --------------------------------------------------------
function json(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(s),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(s);
}

// Returns 'open' during US regular hours (9:30–16:00 ET, Mon–Fri) — Stooq
// prices are intraday during this window — else 'closed' (DB P&L will be 0).
// We don't bother with US holidays; the frontend just shows a banner when
// closed and doesn't change behaviour.
function marketState(now = Date.now()) {
  const d = new Date(now);
  // Convert to US/Eastern by formatting then re-parsing (avoids tz lib).
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(d);
  const get = t => fmt.find(p => p.type === t)?.value;
  const dow = get('weekday'); // Mon, Tue, ...
  const h   = +get('hour');
  const m   = +get('minute');
  if (dow === 'Sat' || dow === 'Sun') return 'closed';
  const mins = h * 60 + m;
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return 'open';
  return 'closed';
}

// Yahoo v8 chart accepts: 1d 5d 1mo 3mo 6mo ytd 1y 2y 5y 10y max (and the
// generic [N](d|wk|mo|y) we already use elsewhere).
function validRange(s) {
  return /^([0-9]+(d|wk|mo|y)|ytd|max)$/.test(s);
}

// Bounded-concurrency map. Avoids hammering Yahoo with 100 sockets at once.
async function pMap(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

// Reduce a points array to at most `max` evenly-spaced samples, keeping the
// last point so the spark's endpoint matches `last`.
function downsample(points, max = 40) {
  if (points.length <= max) return points.map(p => p.close);
  const out = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)].close);
  return out;
}

async function rankByPctChange(range, interval) {
  const results = await pMap(TICKERS, 8, async (t) => {
    const r = await fetchHistory(t, range, interval);
    if (r.err || !r.data || !r.data.points || r.data.points.length < 2) {
      return { ticker: t, pct: null, first: null, last: null, spark: [] };
    }
    const points = r.data.points;
    const first  = points[0].close;
    const last   = points[points.length - 1].close;
    const pct    = (first > 0) ? (last - first) / first : null;
    return { ticker: t, pct, first, last, spark: downsample(points, 40) };
  });
  return results;
}

function buildState() {
  const latest = stmts.latestUnsettledRound.get() || stmts.latestSettledRound.get();
  const lastSettled = stmts.latestSettledRound.get();
  const lastMarket  = stmts.latestMarket.get();
  const totalRounds = stmts.roundCount.get().c;
  const settled     = stmts.settledCount.get().c;

  let currentPicks = [];
  if (latest) {
    currentPicks = stmts.picksForRound.all(latest.id).map(p => ({
      monkeyId: p.monkey_id,
      ticker: p.ticker,
      entryPrice: p.entry_price,
      exitPrice: p.exit_price,
      pnlPct: p.pnl_pct,
      name: p.name
    }));
  }

  // Top 10 leaderboard snippet
  const lb = stmts.leaderboardAll.all().slice(0, 10).map(r => ({
    id: r.id, name: r.name,
    rounds: r.rounds_settled,
    cumPct: Math.expm1(r.cum_log_return), // back to simple cumulative %
    winRate: r.rounds_settled ? r.wins_vs_market / r.rounds_settled : 0
  }));

  return {
    tickers: TICKERS,
    roundIntervalMs: ROUND_INTERVAL_MS,
    nextRoundAt: lastAutoRoundAt + ROUND_INTERVAL_MS,
    serverTime: Date.now(),
    marketState: marketState(),
    currentRound: latest ? {
      id: latest.id, startedAt: latest.started_at, kind: latest.kind,
      settledAt: latest.settled_at, picks: currentPicks
    } : null,
    lastSettled: lastSettled ? {
      id: lastSettled.id, settledAt: lastSettled.settled_at
    } : null,
    swarm: lastMarket ? {
      cumMarket: lastMarket.cum_market,
      cumSwarm:  lastMarket.cum_swarm,
      lastMarket: lastMarket.market_pct,
      lastSwarm:  lastMarket.swarm_pct
    } : { cumMarket: 0, cumSwarm: 0, lastMarket: 0, lastSwarm: 0 },
    counts: { rounds: totalRounds, settled }, // settled = # with P&L
    leaderboard: lb
  };
}

const sparksCache = (() => {
  const TTL_MS = 30_000;
  let payload = null, savedAt = 0;
  return {
    get() { return payload && (Date.now() - savedAt) < TTL_MS ? payload : null; },
    set(p) { payload = p; savedAt = Date.now(); },
    invalidate() { payload = null; }
  };
})();

const beatingCache = (() => {
  const TTL_MS = 60_000;
  let payload = null, savedAt = 0;
  return {
    get() { return payload && (Date.now() - savedAt) < TTL_MS ? payload : null; },
    set(p) { payload = p; savedAt = Date.now(); }
  };
})();

const routes = {
  'GET /api/state': (req, res) => json(res, 200, buildState()),

  'GET /api/leaderboard': (req, res) => {
    const all = stmts.leaderboardAll.all().map(r => {
      const rounds  = r.rounds_settled;
      const meanPct = rounds ? r.sum_pnl_pct / rounds : 0;
      const variance = rounds > 1
        ? (r.sum_pnl_pct_sq - rounds * meanPct * meanPct) / (rounds - 1)
        : 0;
      const stdev = Math.sqrt(Math.max(0, variance));
      return {
        id: r.id, name: r.name,
        rounds,
        cumPct: Math.expm1(r.cum_log_return),
        meanPct,
        stdev,
        sharpeish: stdev > 0 ? meanPct / stdev : 0,
        winRate: rounds ? r.wins_vs_market / rounds : 0
      };
    });
    json(res, 200, { monkeys: all });
  },

  'GET /api/swarm': (req, res) => {
    const limit = +(url.parse(req.url, true).query.limit || 500);
    const rows = stmts.recentMarket.all(Math.min(5000, Math.max(1, limit))).reverse();
    json(res, 200, {
      points: rows.map(r => ({
        roundId:    r.round_id,
        settledAt:  r.settled_at,
        marketPct:  r.market_pct,
        swarmPct:   r.swarm_pct,
        cumMarket:  r.cum_market,
        cumSwarm:   r.cum_swarm
      }))
    });
  },

  'GET /api/sparks': (req, res) => {
    // Cumulative log-return series for every monkey, downsampled to ~30 points
    // each — small enough to ship in one round-trip for the dropdown sparklines.
    const cached = sparksCache.get();
    if (cached) return json(res, 200, cached);

    const N_POINTS = 30;
    const rows = stmts.allSettledPicksOrdered.all();
    const series = new Map(); // monkey_id -> rolling cumulative log-return array

    for (const r of rows) {
      const arr = series.get(r.monkey_id) || [];
      const prev = arr.length ? arr[arr.length - 1] : 0;
      const safe = Math.max(-0.99, r.pnl_pct);
      arr.push(prev + Math.log1p(safe));
      series.set(r.monkey_id, arr);
    }

    const downsample = (arr, n) => {
      if (arr.length <= n) return arr;
      const step = (arr.length - 1) / (n - 1);
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = arr[Math.round(i * step)];
      return out;
    };

    const monkeys = [];
    for (let id = 1; id <= 100; id++) {
      const s = series.get(id) || [];
      monkeys.push({
        id,
        rounds: s.length,
        // round to 6 sig figs to keep payload small
        points: downsample(s, N_POINTS).map(v => +v.toFixed(6))
      });
    }
    const payload = { asOf: Date.now(), monkeys };
    sparksCache.set(payload);
    json(res, 200, payload);
  },

  'GET /api/beating': (req, res) => {
    // For each settled round, how many of the 100 monkeys had a cumulative
    // log-return above the equal-weight market baseline at that point in
    // time. The Malkiel hypothesis says this should oscillate near 50.
    const cached = beatingCache.get();
    if (cached) return json(res, 200, cached);

    const marketRows = stmts.marketRoundsAsc.all();
    if (!marketRows.length) {
      const empty = { asOf: Date.now(), points: [] };
      beatingCache.set(empty);
      return json(res, 200, empty);
    }

    // Group all settled picks by round_id once.
    const picksByRound = new Map();
    for (const p of stmts.allSettledPicksByRound.all()) {
      let arr = picksByRound.get(p.round_id);
      if (!arr) { arr = []; picksByRound.set(p.round_id, arr); }
      arr.push(p);
    }

    const monkeyLogCum = new Float64Array(101); // index 1..100
    const points = new Array(marketRows.length);
    for (let i = 0; i < marketRows.length; i++) {
      const m = marketRows[i];
      const picks = picksByRound.get(m.round_id);
      if (picks) {
        for (const p of picks) {
          const safe = Math.max(-0.99, p.pnl_pct);
          monkeyLogCum[p.monkey_id] += Math.log1p(safe);
        }
      }
      const marketLog = Math.log1p(m.cum_market);
      let above = 0;
      for (let id = 1; id <= 100; id++) if (monkeyLogCum[id] > marketLog) above++;
      points[i] = { roundId: m.round_id, settledAt: m.settled_at, beating: above };
    }

    // Downsample to keep payload small for very long histories
    const MAX = 500;
    const out = points.length <= MAX
      ? points
      : (() => {
          const step = (points.length - 1) / (MAX - 1);
          const r = new Array(MAX);
          for (let i = 0; i < MAX; i++) r[i] = points[Math.round(i * step)];
          return r;
        })();

    const payload = { asOf: Date.now(), points: out };
    beatingCache.set(payload);
    json(res, 200, payload);
  },

  'GET /api/history': (req, res) => {
    const q = url.parse(req.url, true).query;
    const id = +q.monkey;
    if (!id || id < 1 || id > 100) return json(res, 400, { error: 'bad monkey id' });
    const m = stmts.monkeyById.get(id);
    if (!m) return json(res, 404, { error: 'no such monkey' });
    // `from` (ms epoch) lets the period dropdown ask for everything since
    // a cutoff; without it we keep the original recent-N behaviour.
    const from = q.from ? +q.from : null;
    const defaultLimit = from ? 50000 : 200;
    const limit = +(q.limit || defaultLimit);
    const cap   = from ? 200000 : 2000;
    const safeLimit = Math.min(cap, Math.max(1, limit));
    const rows = (from && Number.isFinite(from))
      ? stmts.monkeyHistorySince.all(id, from, safeLimit)
      : stmts.monkeyHistory.all(id, safeLimit);
    json(res, 200, {
      monkey: m,
      picks: rows.map(r => ({
        roundId:    r.round_id,
        startedAt:  r.started_at,
        settledAt:  r.settled_at,
        ticker:     r.ticker,
        entryPrice: r.entry_price,
        exitPrice:  r.exit_price,
        pnlPct:     r.pnl_pct,
        marketPct:  r.market_pct
      }))
    });
  },

  'POST /api/throw': async (req, res) => {
    const ip = clientIp(req);
    const now = Date.now();
    const last = ipCooldown.get(ip) || 0;
    if (now - last < BONUS_RATE_MS) {
      return json(res, 429, {
        ok: false,
        reason: 'cooldown',
        retryAfterMs: BONUS_RATE_MS - (now - last)
      });
    }
    ipCooldown.set(ip, now);
    // prune cooldown map if it grows
    if (ipCooldown.size > 5000) {
      for (const [k, t] of ipCooldown) {
        if (now - t > BONUS_RATE_MS * 4) ipCooldown.delete(k);
      }
    }
    const result = await runRound('bonus');
    json(res, result.ok ? 202 : 503, result);
  },

  'GET /api/events': (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // tell nginx not to buffer
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    res.write(`event: hello\ndata: ${JSON.stringify({ serverTime: Date.now() })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  },

  'GET /api/health': (req, res) => json(res, 200, { ok: true, rounds: stmts.roundCount.get().c }),

  'GET /api/stats': (req, res) => json(res, 200, {
    serverTime: Date.now(),
    rounds: stmts.roundCount.get().c,
    providers: getApiStats()
  }),

  'GET /api/ticker': async (req, res) => {
    const q = url.parse(req.url, true).query;
    const t = (q.symbol || '').toString().trim().toUpperCase();
    if (!t || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) {
      return json(res, 400, { error: 'bad symbol' });
    }
    const range    = (q.range    || '7d').toString();
    const interval = (q.interval || '1d').toString();
    if (!validRange(range))                      return json(res, 400, { error: 'bad range' });
    if (!/^[0-9]+(m|h|d|wk|mo)$/.test(interval)) return json(res, 400, { error: 'bad interval' });
    const r = await fetchHistory(t, range, interval);
    if (r.err) return json(res, 502, { error: 'fetch failed', detail: r.err });
    json(res, 200, { ticker: t, range, interval, ...r.data });
  },

  'GET /api/winners': async (req, res) => {
    const q = url.parse(req.url, true).query;
    const range    = (q.range    || '1mo').toString();
    const interval = (q.interval || '1d').toString();
    if (!validRange(range))                      return json(res, 400, { error: 'bad range' });
    if (!/^[0-9]+(m|h|d|wk|mo)$/.test(interval)) return json(res, 400, { error: 'bad interval' });
    try {
      const rows = await rankByPctChange(range, interval);
      const winners = rows.filter(r => r.pct != null && r.pct > 0).sort((a,b) => b.pct - a.pct);
      const losers  = rows.filter(r => r.pct != null && r.pct < 0).sort((a,b) => a.pct - b.pct);
      const flat    = [...rows].filter(r => r.pct == null);
      json(res, 200, { range, interval, asOf: Date.now(), winners, losers, unavailable: flat.map(r => r.ticker) });
    } catch (err) {
      json(res, 502, { error: 'winners failed', detail: err.message });
    }
  },

  'GET /api/market': (req, res) => {
    const latest = stmts.latestSettledRound.get() || stmts.latestUnsettledRound.get();
    if (!latest) return json(res, 200, {
      asOf: null, marketState: marketState(),
      summary: { biggestGainer: null, biggestLoser: null, totalRounds: 0 },
      tickers: []
    });

    const latestPrices = new Map(stmts.pricesForRound.all(latest.id).map(r => [r.ticker, r.price]));

    const firstRow = stmts.firstPricedRound.get();
    const firstPrices = (firstRow && firstRow.round_id !== null && firstRow.round_id !== latest.id)
      ? new Map(stmts.pricesForRound.all(firstRow.round_id).map(r => [r.ticker, r.price]))
      : new Map();

    const prevRound = stmts.prevSettledBefore.get(latest.id);
    const prevPrices = prevRound
      ? new Map(stmts.pricesForRound.all(prevRound.id).map(r => [r.ticker, r.price]))
      : new Map();

    const hitCounts = new Map(stmts.pickCountsByTicker.all().map(r => [r.ticker, r.hits]));

    const tickers = TICKERS.map(t => {
      const price = latestPrices.get(t) ?? null;
      const first = firstPrices.get(t);
      const prev  = prevPrices.get(t);
      return {
        ticker: t,
        price,
        lastRoundPct:  (prev != null && price != null && prev > 0) ? (price - prev) / prev : null,
        sinceStartPct: (first != null && price != null && first > 0) ? (price - first) / first : null,
        hits: hitCounts.get(t) || 0
      };
    });

    let biggestGainer = null, biggestLoser = null;
    for (const t of tickers) {
      if (t.sinceStartPct == null) continue;
      if (!biggestGainer || t.sinceStartPct > biggestGainer.sinceStartPct) biggestGainer = t;
      if (!biggestLoser  || t.sinceStartPct < biggestLoser.sinceStartPct)  biggestLoser  = t;
    }

    json(res, 200, {
      asOf: latest.settled_at || latest.started_at,
      marketState: marketState(),
      summary: {
        totalRounds: stmts.roundCount.get().c,
        biggestGainer, biggestLoser
      },
      tickers
    });
  }
};

// SSE keepalive — comment frames every 25s so proxies don't drop the connection
setInterval(() => {
  for (const res of clients) {
    try { res.write(': keepalive\n\n'); } catch { clients.delete(res); }
  }
}, 25_000);

const server = http.createServer((req, res) => {
  // Permissive CORS preflight for the small set of endpoints.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600'
    });
    return res.end();
  }
  const route = `${req.method} ${req.url.split('?')[0]}`;
  const handler = routes[route];
  if (handler) {
    Promise.resolve(handler(req, res)).catch(err => {
      console.error('[handler]', route, err);
      try { json(res, 500, { error: 'internal' }); } catch {}
    });
  } else {
    json(res, 404, { error: 'not found' });
  }
});

server.listen(PORT, () => {
  console.log(`[monkey-business] listening on :${PORT}`);
  console.log(`[monkey-business] round interval ${ROUND_INTERVAL_MS}ms, ${TICKERS.length} tickers, 100 monkeys`);
});
