// API & SSE wrappers. In production behind nginx, /api/* on
// monkey-business.ximg.app proxies to the Node server, so same-origin works.
// During local dev (file served from a different port than the API), we
// auto-redirect to :3015 unless the page already has window.MB_API_BASE set.
const API_BASE = (() => {
  if (window.MB_API_BASE !== undefined) return window.MB_API_BASE;
  const h = location.hostname;
  if ((h === 'localhost' || h === '127.0.0.1') && location.port !== '3015') {
    return `http://${h}:3015`;
  }
  return '';
})();

export async function getState()       { return jget('/api/state'); }
export async function getLeaderboard() { return jget('/api/leaderboard'); }
export async function getSwarm(limit=500) { return jget(`/api/swarm?limit=${limit}`); }
export async function getHistory(monkeyId, limit=200) { return jget(`/api/history?monkey=${monkeyId}&limit=${limit}`); }
export async function getMarket()      { return jget('/api/market'); }
export async function getTicker(symbol, range='7d', interval='1d') {
  return jget(`/api/ticker?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`);
}
export async function getWinners(range='1mo', interval='1d') {
  return jget(`/api/winners?range=${range}&interval=${interval}`);
}
export async function getStats()       { return jget('/api/stats'); }

export async function throwBonusRound() {
  const res = await fetch(API_BASE + '/api/throw', { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function jget(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// EventSource wrapper. Auto-reconnects (browser default), exposes onRound/onHello.
export function connectStream({ onRound, onHello, onOpen, onError }) {
  const es = new EventSource(API_BASE + '/api/events');
  es.addEventListener('hello', e => onHello && onHello(JSON.parse(e.data)));
  es.addEventListener('round', e => onRound && onRound(JSON.parse(e.data)));
  if (onOpen)  es.addEventListener('open', onOpen);
  if (onError) es.addEventListener('error', onError);
  return es;
}
