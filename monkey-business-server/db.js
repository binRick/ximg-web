const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const NAMES = require('./monkey-names');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'monkey-business.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS monkeys (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('auto','bonus')),
    settled_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS prices (
    round_id INTEGER NOT NULL REFERENCES rounds(id),
    ticker   TEXT    NOT NULL,
    price    REAL    NOT NULL,
    PRIMARY KEY (round_id, ticker)
  );

  CREATE TABLE IF NOT EXISTS picks (
    round_id     INTEGER NOT NULL REFERENCES rounds(id),
    monkey_id    INTEGER NOT NULL REFERENCES monkeys(id),
    ticker       TEXT    NOT NULL,
    entry_price  REAL    NOT NULL,
    exit_price   REAL,
    pnl_pct      REAL,
    PRIMARY KEY (round_id, monkey_id)
  );

  CREATE INDEX IF NOT EXISTS idx_picks_monkey ON picks(monkey_id);
  CREATE INDEX IF NOT EXISTS idx_picks_round  ON picks(round_id);
  CREATE INDEX IF NOT EXISTS idx_rounds_time  ON rounds(started_at);

  -- Per-monkey rolling totals, updated on each settle. Avoids re-aggregating
  -- the entire picks table for the leaderboard on every request.
  CREATE TABLE IF NOT EXISTS monkey_stats (
    monkey_id        INTEGER PRIMARY KEY REFERENCES monkeys(id),
    rounds_settled   INTEGER NOT NULL DEFAULT 0,
    cum_log_return   REAL    NOT NULL DEFAULT 0,
    sum_pnl_pct      REAL    NOT NULL DEFAULT 0,
    sum_pnl_pct_sq   REAL    NOT NULL DEFAULT 0,
    wins_vs_market   INTEGER NOT NULL DEFAULT 0,
    last_round_id    INTEGER
  );

  -- Per-round market baseline (equal-weight % change across the universe)
  -- so we can plot swarm-vs-market without re-deriving it.
  CREATE TABLE IF NOT EXISTS market_returns (
    round_id     INTEGER PRIMARY KEY REFERENCES rounds(id),
    settled_at   INTEGER NOT NULL,
    market_pct   REAL    NOT NULL,
    swarm_pct    REAL    NOT NULL,
    cum_market   REAL    NOT NULL,
    cum_swarm    REAL    NOT NULL
  );

  -- Strategy-driven theses: one row per opened position. A position spans
  -- multiple picks (one per round it's held). The runner enforces timeout
  -- and stop_pct mechanically; strategies can also signal an early close
  -- via signal_break.
  CREATE TABLE IF NOT EXISTS positions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    monkey_id            INTEGER NOT NULL REFERENCES monkeys(id),
    strategy             TEXT    NOT NULL,
    ticker               TEXT    NOT NULL,
    entry_round_id       INTEGER NOT NULL REFERENCES rounds(id),
    entry_price          REAL    NOT NULL,
    signal               REAL,
    target_exit_round_id INTEGER NOT NULL,
    stop_pct             REAL,
    exit_round_id        INTEGER REFERENCES rounds(id),
    exit_price           REAL,
    pnl_pct              REAL,
    exit_reason          TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_positions_monkey_open
    ON positions(monkey_id, exit_round_id);
`);

// picks predates the positions table — only persona monkeys link to one,
// random-cohort picks leave it NULL.
try { db.exec('ALTER TABLE picks ADD COLUMN position_id INTEGER REFERENCES positions(id)'); }
catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }

// Seed monkeys (idempotent — runs once on first boot)
{
  const count = db.prepare('SELECT COUNT(*) AS c FROM monkeys').get().c;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO monkeys (id, name) VALUES (?, ?)');
    const insertStat = db.prepare('INSERT INTO monkey_stats (monkey_id) VALUES (?)');
    const seed = db.transaction(() => {
      for (let i = 0; i < 100; i++) {
        insert.run(i + 1, NAMES[i]);
        insertStat.run(i + 1);
      }
    });
    seed();
    console.log('[db] seeded 100 monkeys');
  }
}

// Prepared statements
const stmts = {
  insertRound:    db.prepare('INSERT INTO rounds (started_at, kind) VALUES (?, ?)'),
  settleRound:    db.prepare('UPDATE rounds SET settled_at = ? WHERE id = ?'),
  insertPrice:    db.prepare('INSERT INTO prices (round_id, ticker, price) VALUES (?, ?, ?)'),
  insertPick:     db.prepare('INSERT INTO picks (round_id, monkey_id, ticker, entry_price, position_id) VALUES (?, ?, ?, ?, ?)'),
  settlePick:     db.prepare('UPDATE picks SET exit_price = ?, pnl_pct = ? WHERE round_id = ? AND monkey_id = ?'),
  insertMarket:   db.prepare(`
    INSERT INTO market_returns (round_id, settled_at, market_pct, swarm_pct, cum_market, cum_swarm)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  bumpStat:       db.prepare(`
    UPDATE monkey_stats
    SET rounds_settled = rounds_settled + 1,
        cum_log_return = cum_log_return + ?,
        sum_pnl_pct    = sum_pnl_pct    + ?,
        sum_pnl_pct_sq = sum_pnl_pct_sq + ?,
        wins_vs_market = wins_vs_market + ?,
        last_round_id  = ?
    WHERE monkey_id = ?
  `),
  allMonkeys:     db.prepare('SELECT id, name FROM monkeys ORDER BY id'),
  monkeyById:     db.prepare('SELECT id, name FROM monkeys WHERE id = ?'),
  picksForRound:  db.prepare(`
    SELECT p.monkey_id, p.ticker, p.entry_price, p.exit_price, p.pnl_pct, m.name
    FROM picks p JOIN monkeys m ON m.id = p.monkey_id
    WHERE p.round_id = ?
    ORDER BY p.monkey_id
  `),
  pricesForRound: db.prepare('SELECT ticker, price FROM prices WHERE round_id = ?'),
  recentRounds:   db.prepare(`
    SELECT id, started_at, kind, settled_at
    FROM rounds
    ORDER BY id DESC
    LIMIT ?
  `),
  latestUnsettledRound: db.prepare(`
    SELECT id, started_at, kind FROM rounds WHERE settled_at IS NULL
    ORDER BY id ASC LIMIT 1
  `),
  latestSettledRound: db.prepare(`
    SELECT id, started_at, kind, settled_at FROM rounds WHERE settled_at IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `),
  roundCount:     db.prepare('SELECT COUNT(*) AS c FROM rounds'),
  settledCount:   db.prepare('SELECT COUNT(*) AS c FROM rounds WHERE settled_at IS NOT NULL'),
  recentMarket:   db.prepare(`
    SELECT round_id, settled_at, market_pct, swarm_pct, cum_market, cum_swarm
    FROM market_returns
    ORDER BY round_id DESC
    LIMIT ?
  `),
  latestMarket:   db.prepare(`
    SELECT round_id, settled_at, market_pct, swarm_pct, cum_market, cum_swarm
    FROM market_returns
    ORDER BY round_id DESC LIMIT 1
  `),
  leaderboardAll: db.prepare(`
    SELECT m.id, m.name, s.rounds_settled, s.cum_log_return, s.sum_pnl_pct,
           s.sum_pnl_pct_sq, s.wins_vs_market
    FROM monkeys m JOIN monkey_stats s ON s.monkey_id = m.id
    ORDER BY s.cum_log_return DESC
  `),
  monkeyHistory:  db.prepare(`
    SELECT p.round_id, r.started_at, r.settled_at, p.ticker, p.entry_price,
           p.exit_price, p.pnl_pct, mr.market_pct
    FROM picks p
    JOIN rounds r       ON r.id = p.round_id
    LEFT JOIN market_returns mr ON mr.round_id = p.round_id
    WHERE p.monkey_id = ?
    ORDER BY p.round_id DESC
    LIMIT ?
  `),
  monkeyHistorySince:  db.prepare(`
    SELECT p.round_id, r.started_at, r.settled_at, p.ticker, p.entry_price,
           p.exit_price, p.pnl_pct, mr.market_pct
    FROM picks p
    JOIN rounds r       ON r.id = p.round_id
    LEFT JOIN market_returns mr ON mr.round_id = p.round_id
    WHERE p.monkey_id = ? AND r.started_at >= ?
    ORDER BY p.round_id DESC
    LIMIT ?
  `),
  firstPricedRound: db.prepare('SELECT MIN(round_id) AS round_id FROM prices'),
  prevSettledBefore: db.prepare(`
    SELECT id FROM rounds
    WHERE id < ? AND settled_at IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `),
  pickCountsByTicker: db.prepare(`
    SELECT ticker, COUNT(*) AS hits FROM picks GROUP BY ticker
  `),
  allSettledPicksOrdered: db.prepare(`
    SELECT monkey_id, pnl_pct
    FROM picks
    WHERE pnl_pct IS NOT NULL
    ORDER BY monkey_id, round_id
  `),
  allSettledPicksByRound: db.prepare(`
    SELECT round_id, monkey_id, pnl_pct
    FROM picks
    WHERE pnl_pct IS NOT NULL
    ORDER BY round_id, monkey_id
  `),
  marketRoundsAsc: db.prepare(`
    SELECT round_id, settled_at, cum_market
    FROM market_returns
    ORDER BY round_id ASC
  `),
  recentMarketSince: db.prepare(`
    SELECT round_id, settled_at, market_pct, swarm_pct, cum_market, cum_swarm
    FROM market_returns
    WHERE settled_at >= ?
    ORDER BY round_id ASC
  `),
  marketRoundsAscSince: db.prepare(`
    SELECT round_id, settled_at, market_pct, cum_market
    FROM market_returns
    WHERE settled_at >= ?
    ORDER BY round_id ASC
  `),
  allSettledPicksOrderedSince: db.prepare(`
    SELECT p.monkey_id, p.pnl_pct
    FROM picks p
    JOIN rounds r ON r.id = p.round_id
    WHERE p.pnl_pct IS NOT NULL AND r.settled_at >= ?
    ORDER BY p.monkey_id, p.round_id
  `),
  allSettledPicksByRoundSince: db.prepare(`
    SELECT p.round_id, p.monkey_id, p.pnl_pct
    FROM picks p
    JOIN rounds r ON r.id = p.round_id
    WHERE p.pnl_pct IS NOT NULL AND r.settled_at >= ?
    ORDER BY p.round_id, p.monkey_id
  `),

  // --- positions (theses held across rounds) ---------------------------------
  openPositionsAll: db.prepare(`
    SELECT id, monkey_id, strategy, ticker, entry_round_id, entry_price, signal,
           target_exit_round_id, stop_pct
    FROM positions
    WHERE exit_round_id IS NULL
  `),
  positionsForMonkey: db.prepare(`
    SELECT p.id, p.strategy, p.ticker, p.entry_round_id,
           er.started_at AS entry_started_at,
           p.entry_price, p.signal, p.target_exit_round_id, p.stop_pct,
           p.exit_round_id, xr.started_at AS exit_started_at,
           p.exit_price, p.pnl_pct, p.exit_reason
    FROM positions p
    JOIN rounds er ON er.id = p.entry_round_id
    LEFT JOIN rounds xr ON xr.id = p.exit_round_id
    WHERE p.monkey_id = ?
    ORDER BY p.id DESC
    LIMIT ?
  `),
  insertPosition: db.prepare(`
    INSERT INTO positions
      (monkey_id, strategy, ticker, entry_round_id, entry_price, signal,
       target_exit_round_id, stop_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  closePosition: db.prepare(`
    UPDATE positions
       SET exit_round_id = ?, exit_price = ?, pnl_pct = ?, exit_reason = ?
     WHERE id = ?
  `),
  // N-round mid-price history per ticker for strategy lookbacks. Limit at the
  // SQL level so a long-running prod DB doesn't pull a gigabyte.
  recentPricesForLookback: db.prepare(`
    SELECT round_id, ticker, price
    FROM prices
    WHERE round_id IN (SELECT id FROM rounds ORDER BY id DESC LIMIT ?)
    ORDER BY round_id ASC, ticker
  `)
};

function asTx(fn) { return db.transaction(fn); }

module.exports = { db, stmts, asTx };
