// Deterministic per-monkey "trading personality" generator.
//
// Assigned at birth from the monkey id, never re-rolled. Pure narrative —
// the picks themselves remain uniformly random (Malkiel-faithful). This is
// the meta-joke: every monkey *thinks* they have a system.

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

const ALGO_PERIOD = [
  '3-day', '7-day', '14-day', '21-day', '50-day', '200-day',
  'lunar-cycle', 'fiscal-quarter', 'weekly', 'fortnightly', 'intraday',
  'pre-open', 'post-lunch'
];
const ALGO_MOD = [
  'RSI-weighted', 'vega-adjusted', 'Bollinger-clamped', 'sentiment-tuned',
  'momentum-corrected', 'log-normalised', 'sector-neutral', 'beta-stripped',
  'kurtosis-aware', 'gut-feel-augmented', 'volume-confirmed', 'gamma-hedged',
  'vibe-weighted'
];
const ALGO_STYLE = [
  'contrarian micro-momentum', 'mean-reversion', 'reluctant trend-following',
  'oscillator divergence', 'volatility breakout', 'accumulation/distribution',
  'false-breakout fade', 'regression-to-the-mean', 'calendar arbitrage',
  'gap-fill rotation', 'pairs trading (single leg)', 'momentum-then-doubt',
  'breakout-or-bust', 'whipsaw harvesting'
];
const ALGO_DISCLAIMER = [
  '', '', ' (lunar-corrected)', ' (back-tested 1873-present)',
  ' (with optional vibes overlay)', ' (proprietary)', ' (Tuesday-only)',
  ' (no take-backs)', ' (DM for whitepaper)', ' (patent pending)',
  ' (provisional)'
];

const BIASES = [
  ['Recency',          'Last round colours all decisions.'],
  ['Anchoring',        'The entry price is sacred. Always.'],
  ['Confirmation',     'Only reads news that agrees with the position.'],
  ['Sunk cost',        'Averages down on principle, not analysis.'],
  ['Disposition effect', 'Sells winners early. Holds losers indefinitely.'],
  ['Narrative fallacy', 'Every chart tells a story. The chart is not telling it.'],
  ['FOMO',             'Chases the move. Regrets it by the close.'],
  ['Loss aversion',    'Has not closed a losing position since 2024.'],
  ['Hindsight bias',   'Knew it was going to happen. Did not, in fact, know.'],
  ['Survivorship bias','Studies the winners exclusively.'],
  ['Overconfidence',   'Never wrong. Occasionally early.'],
  ['Hot-hand',         'Three wins is the start of a streak. Always.'],
  ['Endowment effect', 'Holds it because they hold it. Circular by design.'],
  ['Status quo',       'When in doubt, stays the course. In doubt often.']
];

const MANIFESTOS = [
  'Cuts losses early. Lets winners ride. Definitely does not tweet about it.',
  'The chart never lies. The chart often misleads.',
  'Buys when there is blood in the streets. Sells when the streets are clean.',
  'Has a system. Will not explain the system.',
  'Position sizing is everything. Position sizing is sometimes everything.',
  'Trades on conviction. Sources of conviction vary.',
  'The trend is your friend, until it is not.',
  'Never wrong, sometimes early.',
  'Marries the position. No prenup.',
  'Believes in mean reversion the way some people believe in karma.',
  'Has a stop loss. Has never used the stop loss.',
  'Trades the chart, not the company. Knows neither.',
  'Diversifies until victory.',
  'Reads the tape. The tape reads back.',
  'Convinced the macro is shifting. Has been since 2018.',
  'Risk-on. Risk-off. Risk-curious.',
  'The market is rational, except for the parts that are not.',
  'A long-term investor on a one-minute time horizon.',
  'Trades against the herd. Is, statistically, the herd.',
  'Has read every book on Behavioral Finance. Implements none of it.',
  'Buys breakouts. Defines breakouts loosely.',
  'Ladders into positions. Sometimes the ladder has one rung.',
  'Believes in technicals. And fundamentals. And vibes.',
  'Will not be filling out the questionnaire.',
  'Bullish until proven otherwise. The proof bar is high.',
  'The thesis is intact. The thesis is always intact.',
  'Buy the rumour. Buy the news. Buy the retraction.',
  'Trades small. Talks big.',
  'Wakes up bearish. Goes to bed bullish. Trades through it.',
  'Pattern matches with abandon. Patterns match back.'
];

const RISK = ['Conservative', 'Measured', 'Spirited', 'Aggressive', 'Reckless', 'Catatonic', 'Erratic', 'Mood-dependent'];

// Mirror of the backend strategy mapping (monkey-business-server/strategy.js).
// Keep in sync.
const ARCHETYPE_STRATEGY = {
  'The Reluctant Contrarian':   'contrarian',
  'The Closet Indexer':         'lazy',
  'The Recovering YOLOer':      'top_chaser',
  'The Vibe Trader':            'top_chaser',
  'The Trend Whisperer':        'trend_follow',
  'The Risk-Off Specialist':    'lazy',
  'The Volatility Tourist':     'breakout',
  'The Quiet Quant':            'momentum',
  'The Tape Reader':            'momentum',
  'The Sector Rotator':         'alphabetical',
  'The Mean Reverter':          'contrarian',
  'The Late Adopter':           'momentum',
  'The Gut-Feel Maximalist':    'breakout',
  'The 5-Year Plan':            'lazy',
  'The Dip Buyer':              'contrarian',
  'The Top-Caller':             'breakout',
  'The Insomniac Daytrader':    'top_chaser',
  'The Recovering Goldbug':     'contrarian',
  'The Earnings Whisperer':     'trend_follow',
  'The Backtest Believer':      'momentum',
  'The Random Walker':          'lazy',
  'The Indicator Stacker':      'trend_follow',
  'The Macro Tourist':          'alphabetical',
  'The Lunchtime Trader':       'top_chaser',
  'The Conviction Trader':      'trend_follow',
  'The Position Builder':       'lazy',
  'The Reformed Maximalist':    'lazy',
  'The Sceptical Optimist':     'breakout'
};
const STRATEGY_DESC = {
  random:       'Uniform random pick every round. Pays the spread on every trade by design.',
  momentum:     'Top decile by 5-round return; holds until it drops to the bottom decile or 30 rounds pass.',
  contrarian:   'Bottom decile by 5-round return; exits on a top-quartile rebound, a -15% stop, or 30 rounds.',
  top_chaser:   'Top 5 movers of the last round; holds 15 rounds.',
  breakout:     'New 20-round highs with a -5% stop and +5% target.',
  alphabetical: 'Cycles tickers alphabetically; rotates once per trading day.',
  lazy:         'Buys once and holds; only sells on a -20% stop.',
  signature:    'Holds one favourite ticker forever. (Wanderer Knock only.)',
  trend_follow: 'Top decile by 20-round return + above 20-round MA; held with a -15% stop, no timeout.'
};

export function cohort(id) { return id <= 50 ? 'random' : 'persona'; }
export function strategyOf(id) {
  if (cohort(id) === 'random') return 'random';
  if (id === 95) return 'signature'; // Wanderer Knock — locked-in winner.
  const archetype = pick(id, 1, ARCHETYPES);
  return ARCHETYPE_STRATEGY[archetype] || 'lazy';
}
export function strategyDesc(name) {
  return STRATEGY_DESC[name] || STRATEGY_DESC.random;
}

const HOLDING = [
  'Holds for exactly one minute. Then divorces.',
  'Long-term to them means until the next round.',
  'Convicted, briefly.',
  'Re-evaluates every 60 seconds. By design.',
  'Diamond hands for a single minute at a time.',
  'Maximum holding period: one round. Minimum: one round.',
  'Believes in compound interest, in theory.',
  'Time in the market beats timing the market. Has neither.'
];

// Hash with a salt so each field picks independently from id.
function pick(id, salt, list) {
  // (Knuth multiplicative hash) ^ (salt-derived prime), mod list length
  const h = ((id >>> 0) * 2654435761) ^ ((salt >>> 0) * 1597334677);
  return list[(h >>> 0) % list.length];
}

export function persona(id) {
  const archetype  = pick(id, 1, ARCHETYPES);
  const algorithm  =
    pick(id, 3, ALGO_PERIOD)  + ' ' +
    pick(id, 4, ALGO_MOD)     + ' ' +
    pick(id, 5, ALGO_STYLE)   +
    pick(id, 6, ALGO_DISCLAIMER);
  const [biasName, biasDesc] = pick(id, 2, BIASES);
  const manifesto = pick(id, 7, MANIFESTOS);
  const risk      = pick(id, 8, RISK);
  const holding   = pick(id, 9, HOLDING);
  const c         = cohort(id);
  const strategy  = strategyOf(id);
  return { archetype, algorithm, biasName, biasDesc, manifesto, risk, holding, cohort: c, strategy, strategyDescription: strategyDesc(strategy) };
}

// Mood derived from the most recent settled picks. Returns a short narrative
// line that updates as new rounds settle.
export function mood(picks) {
  const settled = picks.filter(p => p.pnlPct != null);
  if (settled.length === 0) return 'Awaiting first settlement. The system is ready.';
  // picks come newest-first; take the recent 5 and read the streak
  const recent = settled.slice(0, 5);
  let greens = 0, reds = 0;
  for (const p of recent) {
    if (p.pnlPct > 0) greens++;
    else if (p.pnlPct < 0) reds++;
  }
  // Active streak (consecutive same-sign from the top)
  let streak = 0, sign = Math.sign(recent[0]?.pnlPct ?? 0);
  if (sign !== 0) {
    for (const p of recent) {
      if (Math.sign(p.pnlPct) !== sign) break;
      streak++;
    }
  }
  if (sign > 0 && streak >= 3) return `${streak}-round green streak. The system is working.`;
  if (sign < 0 && streak >= 3) return `${streak}-round drawdown. Reviewing — but the system is intact.`;
  if (greens > reds + 1)       return 'Quietly outperforming. No comment.';
  if (reds > greens + 1)       return 'Choppy session. Long-term thesis unchanged.';
  return 'Trading sideways. Patience is alpha.';
}

// Signature ticker = most-picked from the loaded picks.
export function signatureTicker(picks) {
  if (!picks?.length) return null;
  const counts = new Map();
  let wins = new Map(), settled = new Map();
  for (const p of picks) {
    counts.set(p.ticker, (counts.get(p.ticker) || 0) + 1);
    if (p.pnlPct != null && p.marketPct != null) {
      settled.set(p.ticker, (settled.get(p.ticker) || 0) + 1);
      if (p.pnlPct > p.marketPct) wins.set(p.ticker, (wins.get(p.ticker) || 0) + 1);
    }
  }
  let bestTicker = null, bestCount = 0;
  for (const [t, c] of counts) {
    if (c > bestCount) { bestCount = c; bestTicker = t; }
  }
  if (!bestTicker) return null;
  const s = settled.get(bestTicker) || 0;
  const w = wins.get(bestTicker) || 0;
  return {
    ticker: bestTicker,
    picks: bestCount,
    settled: s,
    wins: w,
    winRate: s ? w / s : null
  };
}
