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

function ensurePool() {
  if (pool) return pool;
  pool = SOUNDS.map(name => {
    const arr = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio('release-sounds/' + name);
      a.preload = 'auto';
      a.volume = 0.55;
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
  // Rewind & play; .catch() because some browsers reject if too rapid
  try { slot.currentTime = 0; } catch {}
  slot.play().catch(() => { /* autoplay blocked or overlap — silent skip */ });
}
