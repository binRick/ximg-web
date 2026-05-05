'use strict';

// Cohort split:
//   ids 1-50  → 'random' cohort. The control group. Uniform random picks.
//   ids 51-100 → 'persona' cohort. Each runs a strategy derived from its
//                deterministic archetype (assigned at birth from the id).
// The race is whether 50 random monkeys can match 50 monkeys with strategies.

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

// archetype -> strategy. Multiple archetypes can share a strategy; that's
// fine — the diversity comes from the per-monkey hash inside each strategy.
const ARCHETYPE_STRATEGY = {
  'The Reluctant Contrarian':   'contrarian',
  'The Closet Indexer':         'random',
  'The Recovering YOLOer':      'top_chaser',
  'The Vibe Trader':            'random',
  'The Trend Whisperer':        'momentum',
  'The Risk-Off Specialist':    'contrarian',
  'The Volatility Tourist':     'contrarian',
  'The Quiet Quant':            'momentum',
  'The Tape Reader':            'momentum',
  'The Sector Rotator':         'alphabetical',
  'The Mean Reverter':          'contrarian',
  'The Late Adopter':           'momentum',
  'The Gut-Feel Maximalist':    'random',
  'The 5-Year Plan':            'lazy',
  'The Dip Buyer':              'contrarian',
  'The Top-Caller':             'contrarian',
  'The Insomniac Daytrader':    'top_chaser',
  'The Recovering Goldbug':     'contrarian',
  'The Earnings Whisperer':     'signature',
  'The Backtest Believer':      'momentum',
  'The Random Walker':          'random',
  'The Indicator Stacker':      'momentum',
  'The Macro Tourist':          'alphabetical',
  'The Lunchtime Trader':       'momentum',
  'The Conviction Trader':      'signature',
  'The Position Builder':       'lazy',
  'The Reformed Maximalist':    'momentum',
  'The Sceptical Optimist':     'contrarian'
};

// Per-strategy short descriptions (shown on the trader card).
const STRATEGY_DESC = {
  random:       'Uniform random pick from available tickers.',
  momentum:     'Picks from the top decile by previous-round return.',
  contrarian:   'Picks from the bottom decile by previous-round return.',
  top_chaser:   'Picks from the top 5 movers of the last round.',
  lazy:         'Holds last round\'s pick, or random on first round.',
  signature:    'Always picks the same ticker — their fixed favourite.',
  alphabetical: 'Cycles through tickers alphabetically by round.'
};

function hash(a, b) {
  return (((a >>> 0) * 2654435761) ^ ((b >>> 0) * 1597334677)) >>> 0;
}

function archetypeOf(id) {
  return ARCHETYPES[hash(id, 1) % ARCHETYPES.length];
}

function cohort(id) { return id <= 50 ? 'random' : 'persona'; }

function strategyOf(id) {
  if (cohort(id) === 'random') return 'random';
  return ARCHETYPE_STRATEGY[archetypeOf(id)] || 'random';
}

// ---- Strategy implementations ---------------------------------------------
// Each receives:
//   ctx = {
//     tickers:          string[]        // currently quoted tickers (set)
//     tickerPnls:       {ticker, pnl}[] // last round's per-ticker pnl, sorted desc
//     lastPickByMonkey: Map<id, ticker> // last round's picks per monkey
//     roundId:          number
//   }
//   monkeyId
// Returns a ticker string from ctx.tickers.

function pickFromGroup(group, monkeyId, roundId, fallbackCtx) {
  if (!group.length) return strategies.random(fallbackCtx, monkeyId);
  return group[hash(monkeyId, roundId) % group.length];
}

const strategies = {
  random(ctx) {
    return ctx.tickers[(Math.random() * ctx.tickers.length) | 0];
  },
  momentum(ctx, monkeyId) {
    if (!ctx.tickerPnls.length || ctx.tickerPnls.every(r => r.pnl === 0)) return strategies.random(ctx);
    const top = ctx.tickerPnls.slice(0, 10).map(r => r.ticker);
    return pickFromGroup(top, monkeyId, ctx.roundId, ctx);
  },
  contrarian(ctx, monkeyId) {
    if (!ctx.tickerPnls.length || ctx.tickerPnls.every(r => r.pnl === 0)) return strategies.random(ctx);
    const bot = ctx.tickerPnls.slice(-10).map(r => r.ticker);
    return pickFromGroup(bot, monkeyId, ctx.roundId, ctx);
  },
  top_chaser(ctx, monkeyId) {
    if (!ctx.tickerPnls.length || ctx.tickerPnls.every(r => r.pnl === 0)) return strategies.random(ctx);
    const top = ctx.tickerPnls.slice(0, 5).map(r => r.ticker);
    return pickFromGroup(top, monkeyId, ctx.roundId, ctx);
  },
  lazy(ctx, monkeyId) {
    const last = ctx.lastPickByMonkey.get(monkeyId);
    if (last && ctx.tickers.includes(last)) return last;
    return strategies.random(ctx);
  },
  signature(ctx, monkeyId) {
    // Deterministic favourite; if it's not currently quoted, fall back.
    const sortedTickers = [...ctx.tickers].sort();
    const fav = sortedTickers[hash(monkeyId, 999) % sortedTickers.length];
    return fav || strategies.random(ctx);
  },
  alphabetical(ctx, monkeyId) {
    const sorted = [...ctx.tickers].sort();
    return sorted[(monkeyId + ctx.roundId) % sorted.length];
  }
};

function pickFor(monkeyId, ctx) {
  const stratName = strategyOf(monkeyId);
  const fn = strategies[stratName] || strategies.random;
  return fn(ctx, monkeyId);
}

module.exports = {
  ARCHETYPES,
  ARCHETYPE_STRATEGY,
  STRATEGY_DESC,
  archetypeOf,
  cohort,
  strategyOf,
  pickFor
};
