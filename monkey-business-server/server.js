const http = require('http');
const url  = require('url');
const { stmts, asTx } = require('./db');
const { TICKERS, fetchAllQuotes } = require('./market');

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

    asTx(() => {
      // 1) Settle previous unsettled round (if any) using these new prices
      const prev = stmts.latestUnsettledRound.get();
      if (prev) {
        const prevPicks = stmts.picksForRound.all(prev.id);
        const prevPrices = stmts.pricesForRound.all(prev.id);
        const prevPriceMap = new Map(prevPrices.map(r => [r.ticker, r.price]));

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

      // 4) Each monkey picks one ticker uniformly at random from those quoted
      const monkeys = stmts.allMonkeys.all();
      for (const m of monkeys) {
        const t = availableTickers[(Math.random() * availableTickers.length) | 0];
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

  'GET /api/history': (req, res) => {
    const q = url.parse(req.url, true).query;
    const id = +q.monkey;
    if (!id || id < 1 || id > 100) return json(res, 400, { error: 'bad monkey id' });
    const m = stmts.monkeyById.get(id);
    if (!m) return json(res, 404, { error: 'no such monkey' });
    const limit = +(q.limit || 200);
    const rows = stmts.monkeyHistory.all(id, Math.min(2000, Math.max(1, limit)));
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

  'GET /api/health': (req, res) => json(res, 200, { ok: true, rounds: stmts.roundCount.get().c })
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
