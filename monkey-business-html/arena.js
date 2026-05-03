// Canvas arena: 100 monkeys, 100-cell ticker board, dart physics.
// All vector — no sprite assets. Per-monkey hue tint for individuality.
//
// Coordinate system: logical 1600x900 internal canvas, scaled to fit container
// while preserving aspect ratio.

import { getState, throwBonusRound, connectStream } from './api.js';
import { chorus } from './audio.js';

const W = 1600, H = 900;
const BOARD = { x: 110, y: 70,  w: 1380, h: 460 };   // 10x10 ticker grid
const COLS = 10, ROWS = 10;
const CELL_W = BOARD.w / COLS;
const CELL_H = BOARD.h / ROWS;
const FLIGHT_ZONE = { y0: BOARD.y + BOARD.h, y1: 660 };
const MONKEY_AREA = { x: 60, y: 690, w: 1480, h: 190 };
const MONKEY_COLS = 20, MONKEY_ROWS = 5;
const MONKEY_W = MONKEY_AREA.w / MONKEY_COLS;
const MONKEY_H = MONKEY_AREA.h / MONKEY_ROWS;

const COLOR_BG       = '#0a0a0f';
const COLOR_GRID     = 'rgba(124,58,237,0.08)';
const COLOR_BORDER   = 'rgba(255,255,255,0.06)';
const COLOR_BORDER_H = 'rgba(255,255,255,0.18)';
const COLOR_ACCENT   = '#06b6d4';
const COLOR_ACCENT2  = '#7c3aed';
const COLOR_TEXT     = '#f1f5f9';
const COLOR_MUTED    = '#64748b';
const COLOR_GAIN     = '#22c55e';
const COLOR_LOSS     = '#ef4444';
const COLOR_DART     = '#facc15';

// State
let state = {
  tickers: [],
  picks: [],            // current round picks (one per monkey)
  prevPicks: [],        // previous round picks (used for color-coded settlement)
  prevPnls: new Map(),  // monkeyId -> pnl_pct from settled round
  cellPnl: new Map(),   // ticker -> pnl_pct from settled round (for cell glow)
  cellHits: new Map(),  // ticker -> count this round
  prices: new Map(),    // ticker -> last known price (for display in cells)
  swarm: { cumMarket: 0, cumSwarm: 0, lastMarket: 0, lastSwarm: 0 },
  marketState: 'unknown',
  roundId: null,
  startedAt: 0,
  nextRoundAt: 0,
  serverTime: 0,
  serverTimeAt: 0,      // local timestamp when serverTime received
  leaderboard: [],
  cellBaseColor: new Map(),  // ticker -> hex (from prev pnl, decays slowly)
  flashUntil: new Map()      // ticker -> ms timestamp for flash effect
};

// Layout helpers
function cellOf(idx) {
  const col = idx % COLS;
  const row = (idx / COLS) | 0;
  return {
    x: BOARD.x + col * CELL_W,
    y: BOARD.y + row * CELL_H,
    cx: BOARD.x + (col + 0.5) * CELL_W,
    cy: BOARD.y + (row + 0.5) * CELL_H
  };
}

function tickerIndex(ticker) {
  // tickers list is fixed at boot; build map once
  if (!state._tIdx) {
    state._tIdx = new Map();
    state.tickers.forEach((t, i) => state._tIdx.set(t, i));
  }
  return state._tIdx.get(ticker);
}

function monkeyHome(monkeyId) {
  // monkeyId is 1..100; arrange in row-major 5x20
  const i = monkeyId - 1;
  const col = i % MONKEY_COLS;
  const row = (i / MONKEY_COLS) | 0;
  return {
    x: MONKEY_AREA.x + (col + 0.5) * MONKEY_W,
    y: MONKEY_AREA.y + (row + 0.5) * MONKEY_H
  };
}

// Per-monkey deterministic hue — same monkey same color across page loads.
function monkeyHue(monkeyId) {
  // golden-ratio hash for visually distinct distribution
  return ((monkeyId * 137.508) | 0) % 360;
}

// Per-monkey deterministic traits. Same monkey, same look, every render.
// Mix of subtle (mouth, brow, look-direction) and rare loud accessories
// (glasses, top hat, mustache) so leaderboard winners are visually memorable.
function monkeyTraits(id) {
  const r = ((id * 2654435761) >>> 0);
  return {
    hue:      ((id * 137.508) | 0) % 360,
    mouth:    r        % 5,             // 0=smile 1=neutral 2=oh 3=smirk 4=teeth
    brow:    ((r >>> 3) % 5) - 2,       // -2..2 tilt
    look:    ((r >>> 5) % 5) - 2,       // -2..2 eye direction
    earTilt: ((r >>> 7) % 3) - 1,       // -1..1
    glasses:  ((r >>> 9)  & 0xff) < 18, // ~7%
    tophat:   ((r >>> 13) & 0xff) < 13, // ~5%
    mustache: ((r >>> 17) & 0xff) < 13  // ~5%
  };
}

// ---- Dart physics ---------------------------------------------------------
const darts = []; // { sx, sy, tx, ty, t0, dur, hue, monkeyId, ticker }
const FLIGHT_DUR_MS = 1100;
const STAGGER_MS = 24; // 100 monkeys * 24ms = 2.4s wave

function launchRound(picks, kind) {
  const now = performance.now();
  const order = picks.map((_, i) => i);
  // Shuffle so the wave isn't strictly left-to-right (more chaotic, more impressive)
  for (let i = order.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }
  state.cellHits.clear();
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const p = picks[i];
    const idx = tickerIndex(p.ticker);
    if (idx === undefined) continue;
    const target = cellOf(idx);
    const home = monkeyHome(p.monkeyId);
    // small jitter on landing point so darts don't all stack on the cell center
    const jitterX = (Math.random() - 0.5) * (CELL_W * 0.6);
    const jitterY = (Math.random() - 0.5) * (CELL_H * 0.6);
    darts.push({
      sx: home.x, sy: home.y - 18,
      tx: target.cx + jitterX, ty: target.cy + jitterY,
      t0: now + k * STAGGER_MS,
      dur: FLIGHT_DUR_MS + (Math.random() - 0.5) * 250,
      hue: monkeyHue(p.monkeyId),
      monkeyId: p.monkeyId,
      ticker: p.ticker,
      done: false
    });
    state.cellHits.set(p.ticker, (state.cellHits.get(p.ticker) || 0) + 1);
  }
  if (kind === 'bonus') {
    bonusFlashUntil = performance.now() + 1800;
  }
  // Cue the swarm sound — louder and a touch denser on bonus rounds.
  chorus.swarm({
    durationMs: STAGGER_MS * order.length + 400,
    count:      kind === 'bonus' ? 90 : 70,
    intensity:  kind === 'bonus' ? 1.25 : 1
  });
}

let bonusFlashUntil = 0;

// Parabolic-ish trajectory: lerp x linearly, y on a quadratic that arcs above
function dartPos(d, t) {
  const u = Math.min(1, Math.max(0, (t - d.t0) / d.dur));
  if (u <= 0) return null;
  const x = d.sx + (d.tx - d.sx) * u;
  const yLerp = d.sy + (d.ty - d.sy) * u;
  // arc height proportional to flight distance (gives near throws shorter arcs)
  const dist = Math.hypot(d.tx - d.sx, d.ty - d.sy);
  const arcH = Math.min(220, dist * 0.35);
  const arc  = -arcH * 4 * u * (1 - u); // peaks at u=0.5
  return { x, y: yLerp + arc, u };
}

// ---- Drawing --------------------------------------------------------------
function drawBackground(ctx) {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, W, H);
  // subtle grid
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
}

function drawBoard(ctx, now) {
  // panel background
  ctx.fillStyle = 'rgba(255,255,255,0.018)';
  roundRect(ctx, BOARD.x - 14, BOARD.y - 38, BOARD.w + 28, BOARD.h + 52, 14);
  ctx.fill();

  // header
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = '10px ui-monospace, "SFMono-Regular", "Menlo", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('NASDAQ-100 · 10×10 DARTBOARD', BOARD.x, BOARD.y - 16);

  // cells
  for (let i = 0; i < COLS * ROWS; i++) {
    const t = state.tickers[i];
    if (!t) continue;
    const c = cellOf(i);
    const pnl = state.cellPnl.get(t);
    const hits = state.cellHits.get(t) || 0;
    const flashTill = state.flashUntil.get(t) || 0;
    const flashing = now < flashTill;

    // Cell fill — tinted by last settled pnl
    let bg = 'rgba(255,255,255,0.018)';
    if (pnl !== undefined && pnl !== 0) {
      const mag = Math.min(1, Math.abs(pnl) * 60); // 1.6% pnl -> full saturation
      const col = pnl > 0 ? '34,197,94' : '239,68,68';
      bg = `rgba(${col},${0.05 + mag * 0.18})`;
    }
    if (flashing) {
      const u = (flashTill - now) / 400;
      bg = `rgba(255,255,255,${0.12 * u})`;
    }
    ctx.fillStyle = bg;
    ctx.fillRect(c.x + 1, c.y + 1, CELL_W - 2, CELL_H - 2);

    // Border
    ctx.strokeStyle = hits > 0 ? COLOR_BORDER_H : COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x + 0.5, c.y + 0.5, CELL_W - 1, CELL_H - 1);

    // Ticker label
    ctx.fillStyle = pnl > 0 ? COLOR_GAIN : pnl < 0 ? COLOR_LOSS : COLOR_TEXT;
    ctx.font = '600 14px ui-monospace, "SFMono-Regular", "Menlo", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, c.cx, c.cy - 6);

    // Price (if known)
    const px = state.prices.get(t);
    if (px) {
      ctx.fillStyle = COLOR_MUTED;
      ctx.font = '10px ui-monospace, "SFMono-Regular", "Menlo", monospace';
      ctx.fillText(px.toFixed(px < 10 ? 3 : 2), c.cx, c.cy + 9);
    }

    // Hit count badge
    if (hits > 0) {
      ctx.fillStyle = COLOR_DART;
      ctx.font = '9px ui-monospace, "SFMono-Regular", "Menlo", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`×${hits}`, c.x + CELL_W - 4, c.y + 3);
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawMonkeys(ctx, now) {
  // panel
  ctx.fillStyle = 'rgba(255,255,255,0.012)';
  roundRect(ctx, MONKEY_AREA.x - 14, MONKEY_AREA.y - 32, MONKEY_AREA.w + 28, MONKEY_AREA.h + 44, 14);
  ctx.fill();
  ctx.fillStyle = COLOR_MUTED;
  ctx.font = '10px ui-monospace, "SFMono-Regular", "Menlo", monospace';
  ctx.fillText('THE SWARM · 100 MONKEYS', MONKEY_AREA.x, MONKEY_AREA.y - 12);

  for (let id = 1; id <= 100; id++) {
    const home = monkeyHome(id);
    const t    = monkeyTraits(id);
    // sway: small per-monkey breathing motion
    const sway = Math.sin(now * 0.001 + id * 0.7) * 1.2;
    drawMonkey(ctx, home.x, home.y + sway, t, id, now);
  }
}

// Vector monkey at ~28-32px tall. Designed to read at small sizes:
// strong silhouette, lighter heart-shaped face plate, prominent eyes,
// subtle muzzle + mouth, optional accessories.
function drawMonkey(ctx, cx, cy, t, id, now) {
  const h = t.hue;
  const fur     = `hsl(${h}, 40%, 30%)`;
  const furDk   = `hsl(${h}, 45%, 20%)`;
  const face    = `hsl(${(h + 8) % 360}, 32%, 62%)`;
  const muzzle  = `hsl(${(h + 8) % 360}, 28%, 52%)`;
  const earPink = `hsl(${(h + 350) % 360}, 45%, 55%)`;
  const eyeWhite = '#f8fafc';
  const eyeDark  = `hsl(${h}, 55%, 12%)`;
  const sheen    = `hsla(${h}, 60%, 90%, 0.18)`;

  // Shoulders / body — small rounded silhouette behind the head
  ctx.fillStyle = furDk;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 16, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ears (with subtle tilt) — outer fur, then inner pink concha
  const earY = cy - 1;
  const earOff = 11.5;
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(cx - earOff, earY + t.earTilt, 5.2, 5.8, -0.2, 0, Math.PI * 2);
  ctx.ellipse(cx + earOff, earY - t.earTilt, 5.2, 5.8,  0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = earPink;
  ctx.beginPath();
  ctx.ellipse(cx - earOff + 0.3, earY + 0.5 + t.earTilt, 2.3, 3.0, -0.2, 0, Math.PI * 2);
  ctx.ellipse(cx + earOff - 0.3, earY + 0.5 - t.earTilt, 2.3, 3.0,  0.2, 0, Math.PI * 2);
  ctx.fill();

  // Head — slightly taller than wide, fur color
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 11.5, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top sheen — small white arc, sells "rounded 3D" feel
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(cx - 1.5, cy - 7, 5, 2.2, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Face plate — heart-shaped: round top, tapered bottom (drawn as one fill)
  ctx.fillStyle = face;
  ctx.beginPath();
  // upper round part
  ctx.ellipse(cx, cy + 1, 7.5, 7, 0, Math.PI, 0, false);
  // lower tapered chin (Bezier)
  ctx.bezierCurveTo(cx + 7.5, cy + 5,  cx + 2,  cy + 9,  cx, cy + 9);
  ctx.bezierCurveTo(cx - 2,  cy + 9,   cx - 7.5, cy + 5, cx - 7.5, cy + 1);
  ctx.closePath();
  ctx.fill();

  // Brow ridge — two short fur strokes above eyes; tilt encodes mood
  ctx.strokeStyle = furDk;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  const browTilt = t.brow * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - 4.4, cy - 2 + browTilt);
  ctx.lineTo(cx - 1.6, cy - 2.6 - browTilt * 0.3);
  ctx.moveTo(cx + 1.6, cy - 2.6 - browTilt * 0.3);
  ctx.lineTo(cx + 4.4, cy - 2 + browTilt);
  ctx.stroke();

  // Eyes — sclera + iris (the iris also acts as the pupil at this scale)
  const lookX = t.look * 0.35;
  const lookY = (((id * 11) % 4) - 2) * 0.2;
  ctx.fillStyle = eyeWhite;
  ctx.beginPath();
  ctx.ellipse(cx - 2.7, cy + 0.2, 1.7, 2.0, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 2.7, cy + 0.2, 1.7, 2.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eyeDark;
  ctx.beginPath();
  ctx.ellipse(cx - 2.7 + lookX, cy + 0.4 + lookY, 1.0, 1.3, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 2.7 + lookX, cy + 0.4 + lookY, 1.0, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // tiny eye-shine
  ctx.fillStyle = eyeWhite;
  ctx.beginPath();
  ctx.ellipse(cx - 2.4 + lookX, cy - 0.1 + lookY, 0.4, 0.5, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 3.0 + lookX, cy - 0.1 + lookY, 0.4, 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Muzzle — slightly darker bulge under eyes
  ctx.fillStyle = muzzle;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4.4, 3.6, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nostrils
  ctx.fillStyle = furDk;
  ctx.beginPath();
  ctx.ellipse(cx - 1.0, cy + 4.2, 0.35, 0.45, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 1.0, cy + 4.2, 0.35, 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mustache (rare) — sits just above the mouth, hides nostril area
  if (t.mustache) {
    ctx.fillStyle = furDk;
    ctx.beginPath();
    ctx.ellipse(cx - 1.5, cy + 5.0, 1.6, 0.7, 0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + 1.5, cy + 5.0, 1.6, 0.7, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mouth — variable per-monkey
  ctx.strokeStyle = eyeDark;
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (!t.mustache) {
    if (t.mouth === 0) {
      // smile
      ctx.arc(cx, cy + 5.6, 1.6, 0.2 * Math.PI, 0.8 * Math.PI);
    } else if (t.mouth === 1) {
      // neutral line
      ctx.moveTo(cx - 1.4, cy + 6.4);
      ctx.lineTo(cx + 1.4, cy + 6.4);
    } else if (t.mouth === 2) {
      // open "oh" — small filled circle
      ctx.fillStyle = eyeDark;
      ctx.ellipse(cx, cy + 6.4, 0.8, 1.0, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.mouth === 3) {
      // smirk — diagonal up-right
      ctx.moveTo(cx - 1.2, cy + 6.6);
      ctx.lineTo(cx + 1.4, cy + 6.0);
    } else {
      // teeth — short bracket
      ctx.fillStyle = eyeWhite;
      ctx.fillRect(cx - 1.2, cy + 5.6, 2.4, 1.0);
      ctx.strokeStyle = eyeDark;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 5.6); ctx.lineTo(cx, cy + 6.6);
      ctx.stroke();
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.rect(cx - 1.2, cy + 5.6, 2.4, 1.0);
    }
    ctx.stroke();
  }

  // Top hat (rare) — small black cylinder + brim
  if (t.tophat) {
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(cx - 4.5, cy - 11.5, 9, 1.0);            // brim
    ctx.fillRect(cx - 3.0, cy - 16, 6.0, 5);              // crown
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 3.0, cy - 12.6, 6.0, 0.6);          // gold band
  }

  // Glasses (rare) — thin gold rims around both eyes
  if (t.glasses) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(cx - 2.7, cy + 0.4, 2.4, 0, Math.PI * 2);
    ctx.arc(cx + 2.7, cy + 0.4, 2.4, 0, Math.PI * 2);
    ctx.moveTo(cx - 0.3, cy + 0.4);
    ctx.lineTo(cx + 0.3, cy + 0.4);
    ctx.stroke();
  }
}

function drawDarts(ctx, now) {
  for (let i = darts.length - 1; i >= 0; i--) {
    const d = darts[i];
    const p = dartPos(d, now);
    if (!p) continue;

    if (p.u >= 1 && !d.done) {
      // landed!
      d.done = true;
      d.impactAt = now;
      flashCell(d.ticker, 400);
      // Audible thunk — slight per-dart pitch variance so the cascade
      // sounds like a rolling hailstorm rather than a single tone.
      chorus.thunkNow(0.85 + Math.random() * 0.4);
    }

    if (p.u >= 1) {
      // landed dart sits at target as a small jewel
      drawLandedDart(ctx, d.tx, d.ty, d.hue, now - (d.impactAt || now));
      // expire after a short time so the board doesn't get cluttered between rounds
      if (now - (d.impactAt || 0) > 4000) {
        darts.splice(i, 1);
      }
      continue;
    }

    // in flight
    drawFlyingDart(ctx, p.x, p.y, d, now);
  }
}

function drawFlyingDart(ctx, x, y, d, now) {
  // direction
  const u = (now - d.t0) / d.dur;
  const next = dartPos(d, now + 16);
  if (!next) return;
  const dx = next.x - x, dy = next.y - y;
  const mag = Math.hypot(dx, dy) || 1;
  const ux = dx / mag, uy = dy / mag;

  // trail
  const trailColor = `hsla(${d.hue}, 80%, 65%, 0.55)`;
  ctx.strokeStyle = trailColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - ux * 18, y - uy * 18);
  ctx.lineTo(x, y);
  ctx.stroke();

  // dart body
  ctx.strokeStyle = `hsl(${d.hue}, 90%, 70%)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - ux * 6, y - uy * 6);
  ctx.lineTo(x + ux * 4, y + uy * 4);
  ctx.stroke();

  // tip glow
  ctx.fillStyle = COLOR_DART;
  ctx.beginPath();
  ctx.arc(x + ux * 4, y + uy * 4, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawLandedDart(ctx, x, y, hue, age) {
  const a = Math.max(0, 1 - age / 4000);
  ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.5 * a + 0.3})`;
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function flashCell(ticker, durMs) {
  const t = performance.now() + durMs;
  if ((state.flashUntil.get(ticker) || 0) < t) state.flashUntil.set(ticker, t);
}

// rounded-rect helper
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- Settlement glow ------------------------------------------------------
function applySettlement(settled) {
  // settled.picks = [{ monkeyId, ticker, pnlPct }]
  const cellSum = new Map();
  const cellCount = new Map();
  for (const p of settled.picks) {
    const cur = cellSum.get(p.ticker) || 0;
    cellSum.set(p.ticker, cur + (p.pnlPct || 0));
    cellCount.set(p.ticker, (cellCount.get(p.ticker) || 0) + 1);
    state.prevPnls.set(p.monkeyId, p.pnlPct || 0);
  }
  for (const [t, sum] of cellSum) {
    state.cellPnl.set(t, sum / cellCount.get(t));
  }
}

// ---- Render loop ----------------------------------------------------------
let canvas, ctx;
function render(t) {
  drawBackground(ctx);
  drawBoard(ctx, t);
  drawDarts(ctx, t);
  drawMonkeys(ctx, t);
  // bonus banner shimmer
  if (t < bonusFlashUntil) {
    const u = (bonusFlashUntil - t) / 1800;
    ctx.fillStyle = `rgba(124,58,237,${0.18 * u})`;
    ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(render);
}

// ---- Public init ----------------------------------------------------------
export async function initArena({ canvasEl, onState }) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  const s = await getState();
  ingestState(s, /*animate*/false);
  onState && onState(s);

  connectStream({
    onHello: () => {},
    onRound: ev => {
      // Settle previous round (color cells, save pnls) FIRST so the new throws
      // arrive at correctly-tinted cells.
      if (ev.settled) applySettlement(ev.settled);
      // Update prices from the new round's picks (entry prices are fresh quotes)
      for (const p of ev.picks) state.prices.set(p.ticker, p.entryPrice);
      state.picks = ev.picks;
      state.roundId = ev.roundId;
      state.startedAt = ev.startedAt;
      state.nextRoundAt = ev.nextRoundAt;
      // Launch the dart cascade
      launchRound(ev.picks, ev.kind);
      onState && onState({ kind: 'round', ev });
    }
  });

  requestAnimationFrame(render);
}

function ingestState(s, animate) {
  state.tickers = s.tickers;
  state._tIdx = null;
  state.swarm = s.swarm;
  state.marketState = s.marketState;
  state.nextRoundAt = s.nextRoundAt;
  state.serverTime  = s.serverTime;
  state.serverTimeAt = Date.now();
  state.leaderboard = s.leaderboard;
  if (s.currentRound) {
    state.roundId = s.currentRound.id;
    state.startedAt = s.currentRound.startedAt;
    state.picks = s.currentRound.picks;
    for (const p of s.currentRound.picks) {
      if (p.entryPrice) state.prices.set(p.ticker, p.entryPrice);
      // if the round happens to be already settled (rare), color cells
      if (p.pnlPct != null) {
        state.cellPnl.set(p.ticker, p.pnlPct);
        state.prevPnls.set(p.monkeyId, p.pnlPct);
      }
    }
  }
}

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr  = window.devicePixelRatio || 1;
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  // Logical scale: stretch our W×H coords to fit pixel space
  ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}

// Hover hit-test for monkey tooltips (called from outside)
export function hitTestMonkey(localX, localY) {
  // Convert from canvas-local (CSS pixels) to logical
  const rect = canvas.getBoundingClientRect();
  const lx = (localX - rect.left) * (W / rect.width);
  const ly = (localY - rect.top)  * (H / rect.height);
  if (lx < MONKEY_AREA.x || lx > MONKEY_AREA.x + MONKEY_AREA.w) return null;
  if (ly < MONKEY_AREA.y || ly > MONKEY_AREA.y + MONKEY_AREA.h) return null;
  const col = Math.floor((lx - MONKEY_AREA.x) / MONKEY_W);
  const row = Math.floor((ly - MONKEY_AREA.y) / MONKEY_H);
  const id = row * MONKEY_COLS + col + 1;
  return id >= 1 && id <= 100 ? id : null;
}

export async function fireBonus() { return throwBonusRound(); }
export function getCurrentState() { return state; }
export { chorus };
