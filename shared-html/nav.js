(function () {
  // Inject nav CSS once
  var s = document.createElement('style');
  s.textContent =
    'nav{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;' +
    'flex-wrap:wrap;gap:.2rem;padding:.4rem .75rem;background:rgba(10,10,15,.9);backdrop-filter:blur(16px);' +
    'border-bottom:1px solid rgba(255,255,255,.06);font-family:\'Courier New\',monospace;}' +
    '.nav-brand{font-weight:700;font-size:.88rem;color:#f1f5f9;margin-right:.4rem;letter-spacing:-.02em;text-decoration:none;flex-shrink:0}' +
    '.nav-item{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-weight:600;' +
    'text-decoration:none;padding:.3rem .65rem;border-radius:6px;transition:all .2s;white-space:nowrap;flex-shrink:0;' +
    'color:#c9d1d9;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04)}' +
    '.nav-item:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);transform:translateY(-1px)}' +
    '.nav-item.active{color:#00ff41;border-color:rgba(0,255,65,.4);background:rgba(0,255,65,.07);' +
    'pointer-events:none;cursor:default}' +
    '.nav-dot{width:6px;height:6px;border-radius:50%;background:#00ff41;box-shadow:0 0 5px #00ff41;' +
    'animation:navpulse 2s ease-in-out infinite;flex-shrink:0}' +
    '@keyframes navpulse{0%,100%{opacity:1}50%{opacity:.4}}';
  document.head.appendChild(s);

  // Build nav
  var nav = document.createElement('nav');
  nav.innerHTML =
    '<a class="nav-brand" href="https://ximg.app">ximg.app</a>' +
    '<a class="nav-item" href="https://linux.ximg.app"><div class="nav-dot"></div>linux</a>' +
    '<a class="nav-item" href="https://butterfly.ximg.app"><div class="nav-dot"></div>butterfly</a>' +
    '<a class="nav-item" href="https://ascii.ximg.app"><div class="nav-dot"></div>ascii</a>' +
    '<a class="nav-item" href="https://yaml.ximg.app"><div class="nav-dot"></div>yaml</a>' +
    '<a class="nav-item" href="https://json.ximg.app"><div class="nav-dot"></div>json</a>' +
    '<a class="nav-item" href="https://poker.ximg.app"><div class="nav-dot"></div>poker</a>' +
    '<a class="nav-item" href="https://mario.ximg.app"><div class="nav-dot"></div>mario</a>' +
    '<a class="nav-item" href="https://doom.ximg.app"><div class="nav-dot"></div>doom</a>' +
    '<a class="nav-item" href="https://monkey.ximg.app"><div class="nav-dot"></div>monkey</a>' +
    '<a class="nav-item" href="https://docker.ximg.app"><div class="nav-dot"></div>docker</a>' +
    '<a class="nav-item" href="https://pizza.ximg.app"><div class="nav-dot"></div>pizza</a>' +
    '<a class="nav-item" href="https://kombat.ximg.app"><div class="nav-dot"></div>kombat</a>' +
    '<a class="nav-item" href="https://chinese.ximg.app"><div class="nav-dot"></div>chinese</a>' +
    '<a class="nav-item" href="https://wargames.ximg.app"><div class="nav-dot"></div>wargames</a>' +
    '<a class="nav-item" href="https://moto.ximg.app"><div class="nav-dot"></div>moto</a>' +
    '<a class="nav-item" href="https://india.ximg.app"><div class="nav-dot"></div>india</a>' +
    '<a class="nav-item" href="https://wood.ximg.app"><div class="nav-dot"></div>wood</a>' +
    '<a class="nav-item" href="https://guns.ximg.app"><div class="nav-dot"></div>guns</a>' +
    '<a class="nav-item" href="https://florida.ximg.app"><div class="nav-dot"></div>florida</a>' +
    '<a class="nav-item" href="https://tampa.ximg.app"><div class="nav-dot"></div>tampa</a>' +
    '<a class="nav-item" href="https://america.ximg.app"><div class="nav-dot"></div>america</a>' +
    '<a class="nav-item" href="https://computers.ximg.app"><div class="nav-dot"></div>computers</a>' +
    '<a class="nav-item" href="https://trump.ximg.app"><div class="nav-dot"></div>trump</a>' +
    '<a class="nav-item" href="https://cnc.ximg.app"><div class="nav-dot"></div>cnc</a>' +
    '<a class="nav-item" href="https://rx.ximg.app"><div class="nav-dot"></div>RxFitt</a>' +
    '<a class="nav-item" href="https://logs.ximg.app"><div class="nav-dot"></div>logs</a>';

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
  spacer.style.cssText = 'width:100%;flex-shrink:0;pointer-events:none';

  document.body.prepend(spacer);
  document.body.prepend(nav);

  // Match spacer height to actual nav height (handles wrapping)
  function syncSpacer() { spacer.style.height = nav.offsetHeight + 'px'; }
  syncSpacer();
  window.addEventListener('resize', syncSpacer);
})();
