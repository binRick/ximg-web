// Plays nav-sound.mp3 when the visitor switches sub-nav tabs.
//
// We can't reliably play audio in the click handler itself because the page
// is about to unload. Instead we set a sessionStorage flag on click, and the
// next page reads it and plays on load — most browsers honor this as a
// continuation of the user gesture and allow the playback.
//
// Respects the same mute toggle the arena chorus uses (localStorage 'mb-sound').

(function () {
  const FLAG = 'mb-nav-sound';
  const MUTE_KEY = 'mb-sound';
  const SRC = 'nav-sound.mp3';

  function isMuted() {
    return localStorage.getItem(MUTE_KEY) === '0';
  }

  // 1) On any sub-nav link click, set the flag.
  function wireClicks() {
    document.querySelectorAll('#subnav a').forEach(a => {
      a.addEventListener('click', () => {
        try { sessionStorage.setItem(FLAG, String(Date.now())); } catch {}
      });
    });
  }

  // 2) On page load, if the flag is set, play once and clear.
  function maybePlay() {
    let stamp;
    try { stamp = sessionStorage.getItem(FLAG); } catch { return; }
    if (!stamp) return;
    try { sessionStorage.removeItem(FLAG); } catch {}
    if (isMuted()) return;
    // Stale flags (>10s old) get ignored — guards against weird tab restores.
    if (Date.now() - +stamp > 10_000) return;
    const audio = new Audio(SRC);
    audio.volume = 0.55;
    audio.play().catch(() => { /* autoplay blocked — silently skip */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { wireClicks(); maybePlay(); });
  } else {
    wireClicks();
    maybePlay();
  }
})();
