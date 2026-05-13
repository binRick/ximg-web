const http = require('http');
const url  = require('url');
const { stmts, asTx } = require('./db');
const { TICKERS, fetchAllQuotes: yahooFetchAllQuotes, fetchHistory, getApiStats: getYahooStats } = require('./market');
const alpaca = require('./alpaca');
const { evaluate: strategyEvaluate, strategyOf, CFG: STRAT_CFG } = require('./strategy');

// Mid-price history depth we expose to strategies via ctx.history. Picked to
// comfortably cover the longest lookback we use (breakout = 20 rounds).
const HISTORY_DEPTH = 24;

const USE_ALPACA = process.env.USE_ALPACA === '1';

// Unified quote shape across data sources:
//   { [ticker]: { bid, ask, mid } }
// Yahoo only returns a last-trade number, so we widen it to bid=ask=mid=last
// (a zero-spread world — the legacy behaviour that produces the bogus
// contrarian alpha). Alpaca returns real bid/ask from the IEX feed, which is
// the whole point of this rewrite: ENTRY = ask, EXIT = bid, so the spread is
// charged to the simulated trader exactly like a live broker would charge it.
async function fetchQuotes() {
  if (USE_ALPACA) {
    const clock = await alpaca.getClock().catch(() => null);
    if (clock && clock.is_open === false) {
      // Off-hours: IEX freezes quotes at the close with wide bands. Return
      // an empty map so the round-runner falls through to its skip path.
      return { _isOpen: false };
    }
    const q = await alpaca.fetchAllQuotes();
    q._isOpen = true;
    return q;
  }
  const m = await yahooFetchAllQuotes();
  const out = {};
  for (const t of Object.keys(m)) {
    const p = m[t];
    out[t] = { bid: p, ask: p, mid: p };
  }
  out._isOpen = true;
  return out;
}

function getApiStats() {
  return USE_ALPACA ? alpaca.getApiStats() : getYahooStats();
}

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
      priceMap = await fetchQuotes();
    } catch (err) {
      console.error('[round] price fetch failed:', err.message);
      return { ok: false, reason: 'fetch_failed' };
    }
    if (priceMap._isOpen === false) {
      return { ok: false, reason: 'market_closed' };
    }
    delete priceMap._isOpen;
    const availableTickers = Object.keys(priceMap);
    if (availableTickers.length < 50) {
      // sanity floor — feed sometimes returns a half-empty response off-hours
      return { ok: false, reason: 'too_few_quotes', got: availableTickers.length };
    }

    const startedAt = Date.now();
    let settledRoundId = null;
    let marketPct = 0, swarmPct = 0;

    asTx(() => {
      // 1) Load prev-round state + the per-ticker mid history strategies need
      //    for lookbacks (momentum, contrarian, breakout). Open positions tell
      //    us which monkeys are mid-thesis.
      const prev = stmts.latestUnsettledRound.get();
      let prevPicks = [];
      let prevPrices = [];
      const tickerPnls = [];
      const prevPickByMonkey = new Map();
      if (prev) {
        prevPicks = stmts.picksForRound.all(prev.id);
        prevPrices = stmts.pricesForRound.all(prev.id);
        for (const { ticker, price: oldMid } of prevPrices) {
          const cur = priceMap[ticker];
          if (cur && oldMid > 0) {
            tickerPnls.push({ ticker, pnl: (cur.mid - oldMid) / oldMid });
          }
        }
        tickerPnls.sort((a, b) => b.pnl - a.pnl);
        for (const p of prevPicks) prevPickByMonkey.set(p.monkey_id, p);
      }

      // 2) Open new round + snapshot mids. The bid/ask aren't persisted —
      //    they're only needed live for fill pricing.
      const roundId = stmts.insertRound.run(startedAt, kind).lastInsertRowid;
      for (const t of availableTickers) {
        stmts.insertPrice.run(roundId, t, priceMap[t].mid);
      }

      // 3) Build ticker history (last N rounds of mids, ordered oldest→newest
      //    with this round's mid as the last element) so strategies can
      //    compute lookback returns and N-round highs.
      const history = new Map();
      const histRows = stmts.recentPricesForLookback.all(HISTORY_DEPTH);
      for (const row of histRows) {
        let arr = history.get(row.ticker);
        if (!arr) { arr = []; history.set(row.ticker, arr); }
        arr.push(row.price);
      }
      // recentPricesForLookback already includes this round (we just inserted
      // its prices above), so each array ends with the current mid.

      // 4) Compute each monkey's strategy decision. Persona monkeys may have
      //    an open position to inform exit logic; random monkeys never do.
      const monkeys = stmts.allMonkeys.all();
      const openPositions = new Map();
      for (const p of stmts.openPositionsAll.all()) openPositions.set(p.monkey_id, p);

      const ctx = {
        tickers: availableTickers,
        prices: priceMap,
        tickerPnls,
        history,
        roundId
      };

      // Pre-compute exit/entry per monkey so settle and insert agree.
      const plans = new Map(); // monkey_id → { closePos, openPos, intent, holding }
      for (const m of monkeys) {
        const openPos = openPositions.get(m.id) || null;
        const { signal_break, intent } = strategyEvaluate(m.id, ctx, openPos);

        // Normalize: ensure the chosen ticker is actually quoted this round.
        let target = intent.ticker;
        if (!priceMap[target]) target = availableTickers[(Math.random() * availableTickers.length) | 0];

        let holding = false;
        let closePos = null;
        let closeReason = null;
        if (openPos) {
          const cur = priceMap[openPos.ticker];
          const pnl = cur ? (cur.mid - openPos.entry_price) / openPos.entry_price : 0;
          const timeoutHit = roundId >= openPos.target_exit_round_id;
          const stopHit    = openPos.stop_pct != null && cur && pnl <= openPos.stop_pct;
          const rotated    = target !== openPos.ticker;
          if (signal_break)     closeReason = 'signal_break';
          else if (stopHit)     closeReason = 'stop';
          else if (timeoutHit)  closeReason = 'timeout';
          else if (rotated)     closeReason = 'rotate';
          if (closeReason)      closePos = openPos;
          else                  holding = true;
        }
        plans.set(m.id, { closePos, closeReason, intent: { ...intent, ticker: target }, holding, openPos });
      }

      // 5) Settle prev round. For monkeys whose plan keeps the position, mark
      //    to mid; otherwise sell at bid. Same spread mechanic as yesterday.
      if (prev) {
        let mSum = 0, mCount = 0;
        for (const { ticker, price: oldMid } of prevPrices) {
          const cur = priceMap[ticker];
          if (cur) { mSum += (cur.mid - oldMid) / oldMid; mCount++; }
        }
        marketPct = mCount ? mSum / mCount : 0;

        let swarmSum = 0;
        for (const pick of prevPicks) {
          const cur = priceMap[pick.ticker];
          const plan = plans.get(pick.monkey_id);
          let pnl, exitPrice;
          if (cur) {
            // A persona monkey "holds" when their plan keeps the prev pick's
            // ticker AND keeps the position. A random monkey holds iff its
            // new intent happens to land on the prev ticker (rare).
            const sameTicker = plan.intent.ticker === pick.ticker;
            const positionKept = plan.openPos && !plan.closePos;
            const holding = positionKept || (!plan.openPos && sameTicker);
            exitPrice = holding ? cur.mid : cur.bid;
            pnl = (exitPrice - pick.entry_price) / pick.entry_price;
          } else {
            exitPrice = pick.entry_price;
            pnl = 0;
          }
          stmts.settlePick.run(exitPrice, pnl, prev.id, pick.monkey_id);

          const beatMarket = pnl > marketPct ? 1 : 0;
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

      // 6) Close positions that the plan says to close. Realized P&L is the
      //    ratio of the exit bid to the original entry ask — multi-round
      //    spread paid exactly once on entry and once on exit, regardless of
      //    how many rounds the thesis lasted.
      for (const m of monkeys) {
        const plan = plans.get(m.id);
        if (!plan.closePos) continue;
        const cur = priceMap[plan.closePos.ticker];
        const exitPrice = cur ? cur.bid : plan.closePos.entry_price;
        const realizedPnl = (exitPrice - plan.closePos.entry_price) / plan.closePos.entry_price;
        stmts.closePosition.run(roundId, exitPrice, realizedPnl, plan.closeReason, plan.closePos.id);
      }

      // 7) Insert this round's pick per monkey. Holding rolls in at mid (no
      //    spread); a transition or fresh entry pays the ask. Persona
      //    monkeys also get a new positions row when they're not holding.
      for (const m of monkeys) {
        const plan = plans.get(m.id);
        const isRandom = strategyOf(m.id) === 'random';
        if (plan.holding) {
          const entry = priceMap[plan.openPos.ticker].mid;
          stmts.insertPick.run(roundId, m.id, plan.openPos.ticker, entry, plan.openPos.id);
          continue;
        }
        // Open new pick (and, for persona, new position) at ask.
        const t = plan.intent.ticker;
        const cur = priceMap[t];
        const entry = cur.ask;
        let positionId = null;
        if (!isRandom) {
          const targetExit = roundId + (plan.intent.hold_rounds || 1);
          positionId = stmts.insertPosition.run(
            m.id, strategyOf(m.id), t, roundId, entry,
            plan.intent.signal ?? null, targetExit, plan.intent.stop_pct ?? null
          ).lastInsertRowid;
        }
        stmts.insertPick.run(roundId, m.id, t, entry, positionId);
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
    const q = url.parse(req.url, true).query;
    const fromRaw = q.from ? +q.from : null;
    const from = Number.isFinite(fromRaw) ? fromRaw : null;
    let rows;
    if (from != null) {
      rows = stmts.recentMarketSince.all(from);
      const MAX = 1000;
      if (rows.length > MAX) {
        const step = (rows.length - 1) / (MAX - 1);
        const out = new Array(MAX);
        for (let i = 0; i < MAX; i++) out[i] = rows[Math.round(i * step)];
        rows = out;
      }
    } else {
      const limit = +(q.limit || 500);
      rows = stmts.recentMarket.all(Math.min(5000, Math.max(1, limit))).reverse();
    }
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
    const q = url.parse(req.url, true).query;
    const fromRaw = q.from ? +q.from : null;
    const from = Number.isFinite(fromRaw) ? fromRaw : null;

    if (from == null) {
      const cached = sparksCache.get();
      if (cached) return json(res, 200, cached);
    }

    const N_POINTS = 30;
    const rows = from != null
      ? stmts.allSettledPicksOrderedSince.all(from)
      : stmts.allSettledPicksOrdered.all();
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
    if (from == null) sparksCache.set(payload);
    json(res, 200, payload);
  },

  'GET /api/beating': (req, res) => {
    // For each settled round, how many of the 100 monkeys had a cumulative
    // log-return above the equal-weight market baseline at that point in
    // time. The Malkiel hypothesis says this should oscillate near 50.
    // When `from` is provided, both the monkey cumulatives and the market
    // baseline restart at zero at the window start so the count reflects
    // performance within the window rather than lifetime.
    const q = url.parse(req.url, true).query;
    const fromRaw = q.from ? +q.from : null;
    const from = Number.isFinite(fromRaw) ? fromRaw : null;

    if (from == null) {
      const cached = beatingCache.get();
      if (cached) return json(res, 200, cached);
    }

    const marketRows = from != null
      ? stmts.marketRoundsAscSince.all(from)
      : stmts.marketRoundsAsc.all();
    if (!marketRows.length) {
      const empty = { asOf: Date.now(), points: [] };
      if (from == null) beatingCache.set(empty);
      return json(res, 200, empty);
    }

    // Group all settled picks by round_id once.
    const picksByRound = new Map();
    const pickRows = from != null
      ? stmts.allSettledPicksByRoundSince.all(from)
      : stmts.allSettledPicksByRound.all();
    for (const p of pickRows) {
      let arr = picksByRound.get(p.round_id);
      if (!arr) { arr = []; picksByRound.set(p.round_id, arr); }
      arr.push(p);
    }

    const monkeyLogCum = new Float64Array(101); // index 1..100
    let windowedMarketCum = 0;
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
      let marketCum;
      if (from != null) {
        windowedMarketCum += m.market_pct;
        marketCum = windowedMarketCum;
      } else {
        marketCum = m.cum_market;
      }
      const marketLog = Math.log1p(marketCum);
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
    if (from == null) beatingCache.set(payload);
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
