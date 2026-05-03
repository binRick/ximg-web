// NASDAQ-100 constituents (as of 2026 reconstitution).
// Source: Nasdaq index methodology — top 100 non-financial companies on Nasdaq by mkt cap.
// 100 entries; if a ticker is delisted yahoo-finance2 will return null and the
// server treats that round's pick as flat (0% pnl) for that monkey.
module.exports = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'TSLA', 'COST',
  'NFLX', 'TMUS', 'ASML', 'AZN', 'CSCO', 'AMD', 'PEP', 'LIN', 'ADBE', 'INTU',
  'TXN', 'ARM', 'QCOM', 'ISRG', 'AMGN', 'PDD', 'BKNG', 'AMAT', 'PANW', 'HON',
  'CMCSA', 'GILD', 'ADP', 'VRTX', 'MELI', 'LRCX', 'MU', 'ADI', 'KLAC', 'APP',
  'SBUX', 'INTC', 'CRWD', 'CEG', 'MDLZ', 'CTAS', 'PYPL', 'MAR', 'PLTR', 'SNPS',
  'MRVL', 'CDNS', 'REGN', 'FTNT', 'ORLY', 'ABNB', 'CSX', 'TRI', 'WDAY', 'ROP',
  'NXPI', 'AEP', 'CHTR', 'PCAR', 'MNST', 'PAYX', 'ROST', 'ADSK', 'KDP', 'FAST',
  'DASH', 'TEAM', 'ODFL', 'CPRT', 'BKR', 'KHC', 'DDOG', 'EA', 'GEHC', 'EXC',
  'XEL', 'CTSH', 'VRSK', 'LULU', 'CCEP', 'IDXX', 'ZS', 'ANSS', 'TTWO', 'AXON',
  'CSGP', 'WBD', 'FANG', 'ON', 'BIIB', 'MDB', 'GFS', 'DXCM', 'ILMN', 'MRNA'
];
