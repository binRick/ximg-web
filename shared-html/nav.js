(function () {
  // Inject nav CSS once
  var s = document.createElement('style');
  s.textContent =
    'nav{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;' +
    'gap:.25rem;padding:.75rem 1.5rem;background:rgba(10,10,15,.85);backdrop-filter:blur(16px);' +
    'border-bottom:1px solid rgba(255,255,255,.06);font-family:\'Courier New\',monospace}' +
    '.nav-brand{font-weight:700;font-size:.95rem;color:#f1f5f9;margin-right:auto;letter-spacing:-.02em}' +
    '.nav-item{display:inline-flex;align-items:center;gap:.45rem;font-size:.85rem;font-weight:600;' +
    'text-decoration:none;padding:.4rem 1rem;border-radius:6px;transition:all .2s;' +
    'color:#c9d1d9;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04)}' +
    '.nav-item:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);transform:translateY(-1px)}' +
    '.nav-item.active{color:#00ff41;border-color:rgba(0,255,65,.4);background:rgba(0,255,65,.07);' +
    'pointer-events:none;cursor:default}' +
    '.nav-dot{width:7px;height:7px;border-radius:50%;background:#00ff41;box-shadow:0 0 6px #00ff41;' +
    'animation:navpulse 2s ease-in-out infinite;flex-shrink:0}' +
    '@keyframes navpulse{0%,100%{opacity:1}50%{opacity:.4}}';
  document.head.appendChild(s);

  // Build nav
  var nav = document.createElement('nav');
  nav.innerHTML =
    '<span class="nav-brand">ximg.app</span>' +
    '<a class="nav-item" href="https://ximg.app"><div class="nav-dot"></div>ximg.app</a>' +
    '<a class="nav-item" href="https://linux.ximg.app"><div class="nav-dot"></div>linux.ximg.app</a>' +
    '<a class="nav-item" href="https://butterfly.ximg.app"><div class="nav-dot"></div>butterfly.ximg.app</a>' +
    '<a class="nav-item" href="https://ascii.ximg.app"><div class="nav-dot"></div>ascii.ximg.app</a>' +
    '<a class="nav-item" href="https://json.ximg.app"><div class="nav-dot"></div>json.ximg.app</a>' +
    '<a class="nav-item" href="https://logs.ximg.app"><div class="nav-dot"></div>logs.ximg.app</a>';

  // Highlight the current site
  nav.querySelectorAll('.nav-item').forEach(function (a) {
    if (new URL(a.href).hostname === window.location.hostname) {
      a.classList.add('active');
      a.removeAttribute('href');
    }
  });

  // Spacer — keeps content below the fixed nav in flex-column layouts
  var spacer = document.createElement('div');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = 'height:52px;width:100%;flex-shrink:0;pointer-events:none';

  document.body.prepend(spacer);
  document.body.prepend(nav);
})();
