// S&P 500 large caps — ~top 100 by market cap, sampled across sectors.
// Mix of NYSE and NASDAQ listings; chosen for high liquidity and good IEX
// coverage on Alpaca's free feed. If a ticker is delisted or the feed
// returns no bid/ask, the round runner treats that monkey's pick as flat.
//
// We intentionally avoid dotted tickers (e.g. BRK.B) — symbol-with-dot
// support varies across data providers and isn't worth the special-casing
// for this many sample names.
module.exports = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'GOOG',  'META',  'TSLA', 'AVGO', 'LLY',
  'JPM',  'V',    'WMT',  'MA',   'UNH',   'XOM',   'COST',  'JNJ',  'HD',   'NFLX',
  'BAC',  'PG',   'ORCL', 'ABBV', 'KO',    'CRM',   'CVX',   'MRK',  'AMD',  'CSCO',
  'PEP',  'ACN',  'ADBE', 'TMO',  'DHR',   'ABT',   'LIN',   'MCD',  'WFC',  'DIS',
  'INTC', 'IBM',  'QCOM', 'GE',   'CAT',   'AXP',   'VZ',    'PFE',  'NOW',  'TXN',
  'INTU', 'T',    'MS',   'AMGN', 'NEE',   'ISRG',  'GS',    'AMAT', 'BKNG', 'SCHW',
  'BLK',  'RTX',  'HON',  'SPGI', 'LOW',   'UNP',   'PLD',   'COP',  'NKE',  'SYK',
  'BX',   'UBER', 'ETN',  'C',    'BSX',   'ADP',   'MDT',   'ANET', 'DE',   'LMT',
  'MMC',  'FI',   'GILD', 'VRTX', 'REGN',  'ELV',   'MU',    'CB',   'BMY',  'PGR',
  'ADI',  'SBUX', 'MDLZ', 'ZTS',  'PANW',  'EQIX',  'MMM',   'CMCSA','BA',   'TJX'
];
