'use strict';

// Cohort split:
//   ids 1-50  → 'random' cohort. The control group. Uniform random picks
//               every round — pays full spread, no positions table entries.
//   ids 51-100 → 'persona' cohort. Each runs one of seven stateful
//                strategies, derived from a deterministic archetype.
// The experiment: with the random cohort bleeding spread by design and the
// persona cohort committing to multi-round theses, does the persona half
// hug the equal-weight market line more tightly? Malkiel says yes.

const ARCHETYPES = [
  'The Reluctant Contrarian', 'The Closet Indexer', 'The Recovering YOLOer',
  'The Vibe Trader', 'The Trend Whisperer', 'The Risk-Off Specialist',
  'The Volatility Tourist', 'The Quiet Quant', 'The Tape Reader',
  'The Sector Rotator', 'The Mean Reverter', 'The Late Adopter',
  'The Gut-Feel Maximalist', 'The 5-Year Plan', 'The Dip Buyer',
  'The Top-Caller', 'The Insomniac Daytrader', 'The Recovering Goldbug',
  'The Earnings Whisperer', 'The Backtest Believer', 'The Random Walker',
  'The Indicator Stacker', 'The Macro Tourist', 'The Lunchtime Trader',
  'The Conviction Trader', 'The Position Builder', 'The Reformed Maximalist',
  'The Sceptical Optimist'
];

const ARCHETYPE_STRATEGY = {
  'The Reluctant Contrarian':  'contrarian',
  'The Closet Indexer':        'signature',
  'The Recovering YOLOer':     'top_chaser',
  'The Vibe Trader':           'top_chaser',
  'The Trend Whisperer':       'momentum',
  'The Risk-Off Specialist':   'lazy',
  'The Volatility Tourist':    'breakout',
  'The Quiet Quant':           'momentum',
  'The Tape Reader':           'momentum',
  'The Sector Rotator':        'alphabetical',
  'The Mean Reverter':         'contrarian',
  'The Late Adopter':          'momentum',
  'The Gut-Feel Maximalist':   'breakout',
  'The 5-Year Plan':           'signature',
  'The Dip Buyer':             'contrarian',
  'The Top-Caller':            'contrarian',
  'The Insomniac Daytrader':   'top_chaser',
  'The Recovering Goldbug':    'contrarian',
  'The Earnings Whisperer':    'signature',
  'The Backtest Believer':     'momentum',
  'The Random Walker':         'lazy',
  'The Indicator Stacker':     'momentum',
  'The Macro Tourist':         'alphabetical',
  'The Lunchtime Trader':      'top_chaser',
  'The Conviction Trader':     'signature',
  'The Position Builder':      'lazy',
  'The Reformed Maximalist':   'lazy',
  'The Sceptical Optimist':    'breakout'
};

const STRATEGY_DESC = {
  random:       'Uniform random pick every round. No positions, just churn.',
  momentum:     'Buys top decile by 5-round return; exits on timeout or signal break.',
  contrarian:   'Buys bottom decile by 5-round return; exits on timeout, bounce, or stop.',
  top_chaser:   'Buys top 5 of last round; quick 3-round holds.',
  breakout:     'Buys new 20-round highs; trails on price-based stop, no timeout.',
  alphabetical: 'Cycles tickers alphabetically; rotates roughly hourly.',
  lazy:         'Buys once and holds; only exits on deep stop loss.',
  signature:    'Always holds the same favourite ticker — never sells.'
};

// Hold/exit constants. Tweakable here; the runner respects them.
const CFG = {
  momentum:    { lookback: 5,  topN: 10, holdRounds: 10, mediansize: 50 },
  contrarian:  { lookback: 5,  botN: 10, holdRounds: 10, stopPct: -0.10 },
  top_chaser:  { topN: 5,      holdRounds: 3 },
  breakout:    { lookback: 20, stopPct: -0.03, targetPct: 0.05, maxHold: 240 },
  alphabetical:{ holdRounds: 60 },
  lazy:        { stopPct: -0.20, maxHold: 100000 },
  signature:   { maxHold: 100000 }
};

function hash(a, b) {
  return (((a >>> 0) * 2654435761) ^ ((b >>> 0) * 1597334677)) >>> 0;
}
function archetypeOf(id) { return ARCHETYPES[hash(id, 1) % ARCHETYPES.length]; }
function cohort(id) { return id <= 50 ? 'random' : 'persona'; }
function strategyOf(id) {
  if (cohort(id) === 'random') return 'random';
  return ARCHETYPE_STRATEGY[archetypeOf(id)] || 'random';
}

// ---- helpers --------------------------------------------------------------
function pickFromGroup(group, monkeyId, roundId, ctx) {
  if (!group.length) return randomTicker(ctx);
  return group[hash(monkeyId, roundId) % group.length];
}
function randomTicker(ctx) {
  return ctx.tickers[(Math.random() * ctx.tickers.length) | 0];
}
// Multi-round return for a ticker over the last `lookback` rounds, using
// ctx.history (Map of ticker → array of mids, oldest first, last element is
// current round's mid). Returns null if not enough history yet.
function lookbackReturn(ctx, ticker, lookback) {
  const arr = ctx.history.get(ticker);
  if (!arr || arr.length <= lookback) return null;
  const oldP = arr[arr.length - 1 - lookback];
  const curP = arr[arr.length - 1];
  if (!oldP || oldP <= 0) return null;
  return (curP - oldP) / oldP;
}
// Highest mid over the last `lookback` rounds (inclusive of current).
function lookbackHigh(ctx, ticker, lookback) {
  const arr = ctx.history.get(ticker);
  if (!arr || arr.length < 2) return null;
  const window = arr.slice(-lookback);
  let hi = -Infinity;
  for (const p of window) if (p > hi) hi = p;
  return hi === -Infinity ? null : hi;
}

// Rank tickers by lookback return. Returns sorted [{ticker, ret}] desc.
// Tickers without enough history get omitted.
function rankByLookback(ctx, lookback) {
  const out = [];
  for (const t of ctx.tickers) {
    const r = lookbackReturn(ctx, t, lookback);
    if (r != null) out.push({ ticker: t, ret: r });
  }
  out.sort((a, b) => b.ret - a.ret);
  return out;
}

// ---- strategies -----------------------------------------------------------
// Each evaluate(ctx, monkeyId, openPos) returns:
//   { signal_break: bool, intent: { ticker, signal, hold_rounds, stop_pct } | null }
// - signal_break: true ⇒ close current position this round (in addition to any
//   timeout/stop the runner enforces mechanically).
// - intent: what to enter if there's no current position (or if exiting this
//   round). Always non-null — we fall back to random if no signal qualifies,
//   so every monkey is always invested.

// Tickers that broke above their N-round prior high this round, sorted by
// magnitude of breakout. Falls back to a random ticker if none qualify.
function pickBreakoutCandidate(ctx, monkeyId, c) {
  const candidates = [];
  for (const t of ctx.tickers) {
    const arr = ctx.history.get(t);
    if (!arr || arr.length < c.lookback + 1) continue;
    const cur = arr[arr.length - 1];
    const prevWindow = arr.slice(Math.max(0, arr.length - 1 - c.lookback), arr.length - 1);
    if (!prevWindow.length) continue;
    let prevHi = -Infinity;
    for (const p of prevWindow) if (p > prevHi) prevHi = p;
    if (cur > prevHi) candidates.push({ ticker: t, signal: (cur - prevHi) / prevHi });
  }
  candidates.sort((a, b) => b.signal - a.signal);
  if (!candidates.length) return { ticker: randomTicker(ctx), signal: null };
  return candidates[hash(monkeyId, ctx.roundId) % candidates.length];
}

// Returning a "hold intent" — used when a strategy wants to keep its current
// position. The runner compares intent.ticker with openPos.ticker; if equal
// and signal_break is false, no transition happens.
function holdIntent(openPos) {
  return {
    ticker: openPos.ticker,
    signal: null,
    hold_rounds: openPos.target_exit_round_id - openPos.entry_round_id,
    stop_pct: openPos.stop_pct
  };
}

const strategies = {
  momentum(ctx, monkeyId, openPos) {
    const c = CFG.momentum;
    const ranked = rankByLookback(ctx, c.lookback);
    const top = ranked.slice(0, c.topN).map(r => r.ticker);
    const median = ranked.length ? ranked[Math.floor(ranked.length / 2)].ret : 0;

    if (openPos) {
      const cur = lookbackReturn(ctx, openPos.ticker, c.lookback);
      // Exit if our pick has fallen below the universe median.
      if (cur != null && cur < median) {
        // signal_break: close, then enter a fresh top-decile pick this round.
        const t = top.length ? pickFromGroup(top, monkeyId, ctx.roundId, ctx) : randomTicker(ctx);
        return {
          signal_break: true,
          intent: { ticker: t, signal: ranked.find(r => r.ticker === t)?.ret ?? null,
                    hold_rounds: c.holdRounds, stop_pct: null }
        };
      }
      // Still above the line — keep riding.
      return { signal_break: false, intent: holdIntent(openPos) };
    }

    // No position → enter top decile.
    const t = top.length ? pickFromGroup(top, monkeyId, ctx.roundId, ctx) : randomTicker(ctx);
    return {
      signal_break: false,
      intent: { ticker: t, signal: ranked.find(r => r.ticker === t)?.ret ?? null,
                hold_rounds: c.holdRounds, stop_pct: null }
    };
  },

  contrarian(ctx, monkeyId, openPos) {
    const c = CFG.contrarian;
    const ranked = rankByLookback(ctx, c.lookback);
    const bot = ranked.slice(-c.botN).map(r => r.ticker);
    const median = ranked.length ? ranked[Math.floor(ranked.length / 2)].ret : 0;

    if (openPos) {
      const cur = lookbackReturn(ctx, openPos.ticker, c.lookback);
      // Reversion thesis fulfilled: the beaten-down pick climbed above median.
      if (cur != null && cur > median) {
        const t = bot.length ? pickFromGroup(bot, monkeyId, ctx.roundId, ctx) : randomTicker(ctx);
        return {
          signal_break: true,
          intent: { ticker: t, signal: ranked.find(r => r.ticker === t)?.ret ?? null,
                    hold_rounds: c.holdRounds, stop_pct: c.stopPct }
        };
      }
      return { signal_break: false, intent: holdIntent(openPos) };
    }

    const t = bot.length ? pickFromGroup(bot, monkeyId, ctx.roundId, ctx) : randomTicker(ctx);
    return {
      signal_break: false,
      intent: { ticker: t, signal: ranked.find(r => r.ticker === t)?.ret ?? null,
                hold_rounds: c.holdRounds, stop_pct: c.stopPct }
    };
  },

  top_chaser(ctx, monkeyId, openPos) {
    const c = CFG.top_chaser;
    if (openPos) {
      // Pure timeout exit — keep holding until the runner times us out.
      return { signal_break: false, intent: holdIntent(openPos) };
    }
    const top = ctx.tickerPnls.slice(0, c.topN).map(r => r.ticker);
    const t = (top.length && ctx.tickerPnls.some(r => r.pnl !== 0))
      ? pickFromGroup(top, monkeyId, ctx.roundId, ctx)
      : randomTicker(ctx);
    return {
      signal_break: false,
      intent: { ticker: t, signal: ctx.tickerPnls.find(r => r.ticker === t)?.pnl ?? null,
                hold_rounds: c.holdRounds, stop_pct: null }
    };
  },

  breakout(ctx, monkeyId, openPos) {
    const c = CFG.breakout;
    if (openPos) {
      // Exit on profit target hit (stop is enforced by the runner).
      const cur = ctx.prices[openPos.ticker]?.mid;
      if (cur != null && openPos.entry_price > 0) {
        const pnl = (cur - openPos.entry_price) / openPos.entry_price;
        if (pnl >= c.targetPct) {
          // Target hit — rotate into next breakout if available, else random.
          const next = pickBreakoutCandidate(ctx, monkeyId, c);
          return {
            signal_break: true,
            intent: { ticker: next.ticker, signal: next.signal,
                      hold_rounds: c.maxHold, stop_pct: c.stopPct }
          };
        }
      }
      return { signal_break: false, intent: holdIntent(openPos) };
    }
    const next = pickBreakoutCandidate(ctx, monkeyId, c);
    return {
      signal_break: false,
      intent: { ticker: next.ticker, signal: next.signal,
                hold_rounds: c.maxHold, stop_pct: c.stopPct }
    };
  },

  alphabetical(ctx, monkeyId) {
    const c = CFG.alphabetical;
    const sorted = [...ctx.tickers].sort();
    // One step per K rounds, so all alphabetical monkeys rotate together but
    // offset by id.
    const step = Math.floor(ctx.roundId / c.holdRounds);
    const t = sorted[(monkeyId + step) % sorted.length];
    return {
      signal_break: false,
      intent: { ticker: t, signal: null, hold_rounds: c.holdRounds, stop_pct: null }
    };
  },

  lazy(ctx, monkeyId, openPos) {
    const c = CFG.lazy;
    // If we have an open position, keep wanting the same thing — runner only
    // closes on the deep stop loss (no signal_break, no rotation).
    if (openPos) {
      return {
        signal_break: false,
        intent: { ticker: openPos.ticker, signal: null, hold_rounds: c.maxHold, stop_pct: c.stopPct }
      };
    }
    // No position → pick once (random) and stick.
    return {
      signal_break: false,
      intent: { ticker: randomTicker(ctx), signal: null, hold_rounds: c.maxHold, stop_pct: c.stopPct }
    };
  },

  signature(ctx, monkeyId, openPos) {
    const c = CFG.signature;
    const sorted = [...ctx.tickers].sort();
    const fav = sorted[hash(monkeyId, 999) % sorted.length];
    if (openPos && openPos.ticker === fav) {
      return { signal_break: false,
               intent: { ticker: fav, signal: null, hold_rounds: c.maxHold, stop_pct: null } };
    }
    return {
      signal_break: false,
      intent: { ticker: fav || randomTicker(ctx), signal: null, hold_rounds: c.maxHold, stop_pct: null }
    };
  }
};

// Random cohort entry point — every round, fresh random, no positions kept.
function randomIntent(ctx) {
  return {
    signal_break: false,
    intent: { ticker: randomTicker(ctx), signal: null, hold_rounds: 1, stop_pct: null }
  };
}

function evaluate(monkeyId, ctx, openPos) {
  const name = strategyOf(monkeyId);
  if (name === 'random') return randomIntent(ctx);
  const fn = strategies[name] || strategies.lazy;
  return fn(ctx, monkeyId, openPos);
}

module.exports = {
  ARCHETYPES,
  ARCHETYPE_STRATEGY,
  STRATEGY_DESC,
  CFG,
  archetypeOf,
  cohort,
  strategyOf,
  evaluate
};
