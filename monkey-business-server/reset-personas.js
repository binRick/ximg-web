#!/usr/bin/env node
'use strict';

// Wipes trading history for the persona cohort EXCEPT Wanderer Knock (#95).
// Used when changing strategy logic mid-flight: the prior persona data was
// generated under a different ruleset, so mixing it with the new one makes
// the leaderboard meaningless. The random cohort (ids 1-50) is left alone —
// they're the spread-tax control and their history stays useful. #95 also
// stays untouched because their signature buy-and-hold is unchanged.
//
// Usage: node reset-personas.js --yes

const Database = require('better-sqlite3');
const path = require('path');

if (!process.argv.includes('--yes')) {
  console.error('reset-personas.js: refuses to run without --yes (this wipes 49 monkeys\' history)');
  process.exit(2);
}

const KEEP_ID = 95;

const DB_DIR  = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'monkey-business.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const where = `monkey_id BETWEEN 51 AND 100 AND monkey_id != ${KEEP_ID}`;

const before = {
  picks:     db.prepare(`SELECT COUNT(*) AS c FROM picks WHERE ${where}`).get().c,
  positions: db.prepare(`SELECT COUNT(*) AS c FROM positions WHERE ${where}`).get().c,
  stats:     db.prepare(`SELECT COUNT(*) AS c FROM monkey_stats WHERE ${where} AND rounds_settled > 0`).get().c
};

const tx = db.transaction(() => {
  // Order matters for FK: picks → positions, then stats.
  db.prepare(`DELETE FROM picks WHERE ${where}`).run();
  db.prepare(`DELETE FROM positions WHERE ${where}`).run();
  db.prepare(`UPDATE monkey_stats SET
      rounds_settled = 0,
      cum_log_return = 0,
      sum_pnl_pct    = 0,
      sum_pnl_pct_sq = 0,
      wins_vs_market = 0,
      last_round_id  = NULL
    WHERE ${where}`).run();
});
tx();

const wkAfter = db.prepare(`SELECT rounds_settled, cum_log_return FROM monkey_stats WHERE monkey_id = ${KEEP_ID}`).get();

console.log('selective persona reset complete.');
console.log('  picks wiped:        ', before.picks);
console.log('  positions wiped:    ', before.positions);
console.log('  stat rows reset:    ', before.stats, '(of 49 persona-non-95)');
console.log(`  #${KEEP_ID} preserved: rounds_settled=${wkAfter.rounds_settled}, cum_log_return=${wkAfter.cum_log_return.toFixed(6)}`);
console.log('  random cohort (1-50): untouched.');
