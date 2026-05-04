// Release-the-monkeys sound clips. To add a new clip:
//   1. Drop the .mp3 into ./release-sounds/
//   2. Add its filename to the SOUNDS array below
// A random one plays each time the visitor clicks "Release the monkeys".
//
// Respects the same mute toggle the arena chorus uses (localStorage 'mb-sound').

const SOUNDS = [
  'monkeys-30632.mp3'
];

const MUTE_KEY = 'mb-sound';
function isMuted() { return localStorage.getItem(MUTE_KEY) === '0'; }

// Tiny pool of pre-loaded Audio objects so rapid clicks don't have to hit
// the network/decoder for each click; we reuse a small ring of clones.
const POOL_SIZE = 4;
let pool = null;

// The dart-throw cascade in arena.js takes roughly 100 monkeys × 24 ms stagger
// + ~1100 ms flight ≈ 3.5s. We fade the clip out near that mark so the audio
// doesn't outlast the visual.
const CASCADE_MS = 3500;
const FADE_MS    = 350;
const BASE_VOL   = 0.55;

function fadeOut(audio, durMs) {
  if (audio.paused || audio.ended) return;
  const startV = audio.volume;
  const startT = performance.now();
  const tick = () => {
    const u = (performance.now() - startT) / durMs;
    if (u >= 1) {
      try { audio.pause(); } catch {}
      audio.volume = BASE_VOL;     // restore for next play
      audio._fadeRAF = null;
      return;
    }
    audio.volume = Math.max(0, startV * (1 - u));
    audio._fadeRAF = requestAnimationFrame(tick);
  };
  tick();
}

function ensurePool() {
  if (pool) return pool;
  pool = SOUNDS.map(name => {
    const arr = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio('release-sounds/' + name);
      a.preload = 'auto';
      a.volume = BASE_VOL;
      arr.push(a);
    }
    return arr;
  });
  return pool;
}

let cursor = 0;

export function playReleaseSound() {
  if (isMuted() || SOUNDS.length === 0) return;
  const p = ensurePool();
  const idx = (Math.random() * SOUNDS.length) | 0;
  const slot = p[idx][cursor++ % POOL_SIZE];
  // Cancel any in-flight fade on this slot before re-triggering it.
  if (slot._fadeTimer) { clearTimeout(slot._fadeTimer); slot._fadeTimer = null; }
  if (slot._fadeRAF)   { cancelAnimationFrame(slot._fadeRAF); slot._fadeRAF = null; }
  // Rewind, restore volume, play.
  try { slot.currentTime = 0; } catch {}
  slot.volume = BASE_VOL;
  slot.play().catch(() => { /* autoplay blocked or overlap — silent skip */ });
  // Schedule the fade so the clip stops shortly after the dart cascade ends.
  slot._fadeTimer = setTimeout(() => fadeOut(slot, FADE_MS), CASCADE_MS);
}
