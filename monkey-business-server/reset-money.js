#!/usr/bin/env node
'use strict';

// Wipes rounds, picks, prices, market_returns and resets monkey_stats. Keeps
// the monkeys table intact (id/name mapping is part of the deployment, not
// part of the trading history). Use when cutting over to a new data source
// or fill model — the existing P&L is meaningless under the new rules.
//
// Usage: node reset-money.js --yes

const Database = require('better-sqlite3');
const path = require('path');

if (!process.argv.includes('--yes')) {
  console.error('reset-money.js: refuses to run without --yes (this wipes all P&L history)');
  process.exit(2);
}

const DB_DIR  = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'monkey-business.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const before = {
  rounds:  db.prepare('SELECT COUNT(*) AS c FROM rounds').get().c,
  picks:   db.prepare('SELECT COUNT(*) AS c FROM picks').get().c,
  prices:  db.prepare('SELECT COUNT(*) AS c FROM prices').get().c,
  market:  db.prepare('SELECT COUNT(*) AS c FROM market_returns').get().c,
  monkeys: db.prepare('SELECT COUNT(*) AS c FROM monkeys').get().c
};

const tx = db.transaction(() => {
  db.exec(`
    DELETE FROM market_returns;
    DELETE FROM picks;
    DELETE FROM prices;
    DELETE FROM rounds;
    DELETE FROM sqlite_sequence WHERE name = 'rounds';
    UPDATE monkey_stats SET
      rounds_settled = 0,
      cum_log_return = 0,
      sum_pnl_pct    = 0,
      sum_pnl_pct_sq = 0,
      wins_vs_market = 0,
      last_round_id  = NULL;
  `);
});
tx();

console.log('reset complete.');
console.log('  rounds:         ', before.rounds, '→ 0');
console.log('  picks:          ', before.picks,  '→ 0');
console.log('  prices:         ', before.prices, '→ 0');
console.log('  market_returns: ', before.market, '→ 0');
console.log('  monkeys kept:   ', before.monkeys);
