(function () {
  // Google Tag Manager
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-PQQWB7BW');

  // Google Analytics (GA4)
  var gaScript = document.createElement('script');
  gaScript.async = true;
  gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-SFB2VH4MNH';
  document.head.appendChild(gaScript);
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-SFB2VH4MNH');

  var GROUPS = [
    { label: 'Tech', apps: [
      ['agents','agents'],['ai','ai'],['algorithms','algorithms'],['ansible','ansible'],['ascii','ascii'],['bash','bash'],['bgp','bgp'],['bsd','bsd'],
      ['cdn','cdn'],['chmod','chmod'],['claude','claude'],['computers','computers'],['crypto','crypto'],['database','database'],['dns','dns'],['docker','docker'],
      ['embeddings','embeddings'],['git','git'],['http','http'],['internet','internet'],['iptables','iptables'],['json','json'],['linux','linux'],['loadbalancer','loadbalancer'],['mac','mac'],['makefile','makefile'],['network','network'],['os','os'],['passwords','passwords'],['playground','playground'],['programming','programming'],['queue','queue'],['request','request'],['security','security'],['smtp','smtp'],['sql','sql'],['ssh','ssh'],['suricata','suricata'],['systemd','systemd'],['systemdesign','systemdesign'],['temperature','temp'],['tls','tls'],['tmux','tmux'],['tokens','tokens'],['unix','unix'],['utf8','utf8'],['vim','vim'],['vr','vr'],['vt101','vt101'],['yaml','yaml'],['zsh','zsh']
    ]},
    { label: 'Culture', apps: [
      ['america','america'],['coffee','coffee'],['florida','florida'],
      ['guns','guns'],['japan','japan'],['moto','moto'],
      ['tampa','tampa'],['trump','trump'],['wargames','wargames'],['wood','wood']
    ]},
    { label: 'History', apps: [
      ['aztec','aztec'],['babylon','babylon'],['british','british empire'],['civilwar','civilwar'],['coldwar','coldwar'],['colonial','colonial'],['communism','communism'],['crusades','crusades'],
      ['cuba','cuba crisis'],['egypt','egypt'],['french','french rev.'],['greece','greece'],['industrial','industrial'],['medieval','medieval'],['mongols','mongols'],['napoleon','napoleon'],
      ['ottoman','ottoman'],['pirates','pirates'],['renaissance','renaissance'],['revolution','revolution'],['rome','rome'],['russianrev','russian rev.'],['samurai','samurai'],
      ['silkroad','silkroad'],['spacerace','space race'],['vikings','vikings'],['ww1','ww1'],['ww2','ww2'],
    ]},
    { label: 'Retro', apps: [
      ['arpanet','arpanet'],['bbs','BBS'],['commodore','commodore'],['dos','DOS'],['fidonet','fidonet'],['mainframe','mainframe'],['modem','modem'],['punch','punch card'],['templeos','TempleOS'],['terminal','terminal'],
    ]},
    { label: 'Science', apps: [
      ['biology','biology'],['brain','brain'],['butterfly','butterfly'],['cell','cell'],['chaos','chaos'],['chemistry','chemistry'],['dna','dna'],['epidemic','epidemic'],['evolution','evolution'],['gravity','gravity'],['immune','immune'],['math','math'],['nutrition','nutrition'],['physics','physics'],['quantum','quantum'],['sandbox','sandbox'],['sleep','sleep'],['space','space'],['synth','synth'],['training','training'],['waves','waves'],['world','world']
    ]},
    { label: 'Food', apps: [
      ['baking','baking'],['bbq','bbq'],['beer','beer'],['calories','calories'],['chinese','chinese'],
      ['cocktails','cocktails'],['ferment','ferment'],['grilling','grilling'],['india','india'],
      ['knife','knife'],['market','market'],['pasta','pasta'],['pizza','pizza'],['ramen','ramen'],
      ['recipe','recipe'],['smoker','smoker'],['spice','spice'],['sushi','sushi'],['tacos','tacos'],
      ['tea','tea'],['thai','thai'],['wine','wine'],
    ]},
    { label: 'Games', apps: [
      ['chess','chess'],['cnc','cnc'],['doom','doom'],['kart','kart'],['kombat','kombat'],
      ['mario','mario'],['monkey','monkey'],['nintendo','nintendo'],['poker','poker'],['quake','quake'],['simcity','simcity'],['warcraft','warcraft']
    ]},
    { label: 'Electronics', apps: [
      ['555timer','555 Timer'],['antenna','antenna'],['arduino','arduino'],['battery','battery'],['capacitor','capacitor'],['circuit','circuit'],['compiler','compiler'],['fpga','fpga'],['impedance','impedance'],['logic','logic'],['ohms','ohms'],['opamp','opamp'],['oscilloscope','oscilloscope'],['pcb','pcb'],['pinout','pinout'],['protocol','protocol'],['psu','psu'],['pwm','pwm'],['resistor','resistor'],['spectrum','spectrum'],['spi','spi'],['uart','uart'],['voltage','voltage']
    ]},
    { label: 'Dev Tools', apps: [
      ['base64','base64'],['binary','binary'],['cidr','cidr'],['color','color'],['cron','cron'],
      ['csv','csv'],['curl','curl'],['diff','diff'],['dockerimage','dockerimage'],
      ['epoch','epoch'],['githubstars','github stars'],['hash','hash'],['jwt','JWT'],['lorem','lorem'],
      ['markdown','markdown'],['password','password'],['ps1','ps1'],['regex','regex'],['ssl','ssl'],
      ['timespan','timespan'],['url','url'],['uuid','uuid']
    ]},
    { label: 'Bundlers', apps: [
      ['apt-bundler','apt'],
      ['dockerimagedownloader','docker image'],
      ['go-bundler','go'],
      ['iso','linux isos'],
      ['nodejs-bundler','node.js'],
      ['python-bundler','python'],
      ['rpm-bundler','rpm']
    ]},
    { label: 'More', apps: [
      ['rx','RxFitt']
    ]},
    { label: 'System', apps: [
      ['apps','apps'],['change','change'],['claudemd','CLAUDE.md'],['honeypot','honeypot'],['ids','IDS'],['logs','logs'],['mail','mail'],['nav','nav'],['readme','README.md'],['stats','stats'],['video','video'],['ximg','ximg']
    ]},
  ];

  var s = document.createElement('style');
  s.textContent =
    'nav{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;' +
    'gap:.35rem;padding:.4rem .75rem;background:rgba(10,10,15,.9);backdrop-filter:blur(16px);' +
    'border-bottom:1px solid rgba(255,255,255,.06);font-family:\'Courier New\',monospace;}' +

    '.nav-brand{font-weight:700;font-size:.88rem;color:#f1f5f9;margin-right:.5rem;' +
    'letter-spacing:-.02em;text-decoration:none;flex-shrink:0}' +

    '.nav-group{position:relative;flex-shrink:0}' +

    '.nav-trigger{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-weight:600;' +
    'padding:.3rem .65rem;border-radius:6px;cursor:pointer;white-space:nowrap;' +
    'color:#c9d1d9;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);' +
    'font-family:\'Courier New\',monospace;user-select:none;transition:all .18s;}' +
    '.nav-trigger:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.18);}' +
    '.nav-trigger.open{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);}' +
    '.nav-trigger.has-active{color:#00ff41;border-color:rgba(0,255,65,.4);background:rgba(0,255,65,.07);}' +
    '.nav-trigger.has-active:hover{background:rgba(0,255,65,.12);}' +

    '.nav-caret{font-size:.55rem;opacity:.6;transition:transform .2s;line-height:1}' +
    '.nav-trigger.open .nav-caret{transform:rotate(180deg)}' +

    '.nav-dropdown{position:absolute;top:calc(100% + 5px);left:0;' +
    'background:#0d0d16;border:1px solid rgba(255,255,255,.1);border-radius:10px;' +
    'padding:.35rem;z-index:300;box-shadow:0 16px 40px rgba(0,0,0,.75);' +
    'opacity:0;transform:translateY(-6px);pointer-events:none;' +
    'transition:opacity .16s,transform .16s;}' +
    '.nav-dropdown.open{opacity:1;transform:none;pointer-events:all;}' +
    '.nav-dropdown.wide{display:grid;grid-template-columns:1fr 1fr;gap:.05rem .2rem;min-width:220px;}' +
    '.nav-dropdown.wider{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.05rem .2rem;min-width:320px;}' +
    '.nav-dropdown.active-only .nav-dd-item:not(.active){display:none;}' +
    '.nav-dropdown.active-only{display:block;min-width:0;width:auto;}' +

    '.nav-dd-item{display:flex;align-items:center;gap:.4rem;font-size:.73rem;font-weight:600;' +
    'color:#c9d1d9;padding:.3rem .6rem;border-radius:6px;white-space:nowrap;' +
    'text-decoration:none;transition:background .1s;font-family:\'Courier New\',monospace;}' +
    '.nav-dd-item:hover{background:rgba(255,255,255,.08);color:#fff;}' +
    '.nav-dd-item.active{color:#00ff41;cursor:default;}' +

    '.nav-dd-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;' +
    'background:rgba(255,255,255,.2);}' +
    '.nav-dd-item.active .nav-dd-dot{background:#00ff41;box-shadow:0 0 5px #00ff41;' +
    'animation:navpulse 2s ease-in-out infinite;}' +
    '@keyframes navpulse{0%,100%{opacity:1}50%{opacity:.3}}' +

    // Hamburger button — hidden on desktop
    '.nav-hamburger{display:none;margin-left:auto;flex-shrink:0;cursor:pointer;' +
    'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);' +
    'border-radius:6px;padding:.3rem .55rem;color:#c9d1d9;font-size:1rem;line-height:1;' +
    'font-family:\'Courier New\',monospace;user-select:none;transition:all .18s;}' +
    '.nav-hamburger:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);}' +
    '.nav-hamburger.open{color:#00ff41;border-color:rgba(0,255,65,.4);background:rgba(0,255,65,.07);}' +

    // Mobile panel — full-width overlay below nav
    '.nav-mobile-panel{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:199;' +
    'background:rgba(10,10,15,.97);overflow-y:auto;padding-top:2.8rem;}' +
    '.nav-mobile-panel.open{display:block;}' +

    '.nav-mobile-group{border-bottom:1px solid rgba(255,255,255,.07);}' +
    '.nav-mobile-label{display:flex;align-items:center;justify-content:space-between;' +
    'padding:.75rem 1rem;font-size:.85rem;font-weight:700;color:#c9d1d9;cursor:pointer;' +
    'font-family:\'Courier New\',monospace;user-select:none;}' +
    '.nav-mobile-label:active{background:rgba(255,255,255,.05);}' +
    '.nav-mobile-label.active-group{color:#00ff41;}' +
    '.nav-mobile-caret{font-size:.6rem;opacity:.5;transition:transform .2s;}' +
    '.nav-mobile-group.open .nav-mobile-caret{transform:rotate(180deg);}' +

    '.nav-mobile-apps{display:none;padding:.25rem .5rem .5rem;' +
    'display:grid;grid-template-columns:1fr 1fr;gap:.15rem;}' +
    '.nav-mobile-group:not(.open) .nav-mobile-apps{display:none;}' +
    '.nav-mobile-group.open .nav-mobile-apps{display:grid;}' +

    '.nav-mobile-app{display:flex;align-items:center;gap:.4rem;padding:.45rem .6rem;' +
    'border-radius:6px;font-size:.78rem;font-weight:600;color:#c9d1d9;' +
    'text-decoration:none;font-family:\'Courier New\',monospace;transition:background .1s;}' +
    '.nav-mobile-app:hover,.nav-mobile-app:active{background:rgba(255,255,255,.08);color:#fff;}' +
    '.nav-mobile-app.active{color:#00ff41;cursor:default;}' +
    '.nav-mobile-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,.2);}' +
    '.nav-mobile-app.active .nav-mobile-dot{background:#00ff41;box-shadow:0 0 5px #00ff41;}' +

    // Responsive breakpoint
    '@media(max-width:768px){' +
    '.nav-group{display:none;}' +
    '.nav-hamburger{display:inline-flex;align-items:center;}' +
    '}' +

    // Sub-nav horizontal scroll (tablets / narrow desktop)
    '.sub-nav{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '.sub-nav::-webkit-scrollbar{display:none}' +

    // Content images: zoom cursor + glow on hover
    'img[loading="lazy"]{cursor:zoom-in;transition:box-shadow .25s,transform .25s}' +
    'img[loading="lazy"]:hover{box-shadow:0 0 0 2px rgba(0,255,65,.35),0 8px 30px rgba(0,0,0,.6);transform:scale(1.015)}' +

    // Image lightbox
    '.nav-lb{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.94);' +
    'display:flex;align-items:center;justify-content:center;cursor:default;' +
    'animation:nav-lbi .18s ease}' +
    '@keyframes nav-lbi{from{opacity:0}to{opacity:1}}' +
    '.nav-lb img{max-width:90vw;max-height:88vh;object-fit:contain;border-radius:10px;' +
    'box-shadow:0 0 100px rgba(0,255,65,.12),0 30px 80px rgba(0,0,0,.85);' +
    'animation:nav-lbii .22s cubic-bezier(.34,1.56,.64,1)}' +
    '@keyframes nav-lbii{from{transform:scale(.88)}to{transform:none}}' +
    '.nav-lb-x{position:fixed;top:1rem;right:1.2rem;color:#fff;font-size:1.1rem;' +
    'cursor:pointer;background:rgba(255,255,255,.1);border-radius:50%;' +
    'width:2.1rem;height:2.1rem;display:flex;align-items:center;justify-content:center;' +
    'transition:background .15s,transform .15s;user-select:none;font-family:monospace}' +
    '.nav-lb-x:hover{background:rgba(255,255,255,.22);transform:scale(1.1)}' +
    '.nav-lb-cap{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);' +
    'color:rgba(255,255,255,.55);font-size:.78rem;font-family:\'Courier New\',monospace;' +
    'text-align:center;max-width:80vw;pointer-events:none}' +

    // Copy button on <pre> blocks
    '.nav-copy{position:absolute;top:.5rem;right:.5rem;font-size:.68rem;font-weight:700;' +
    'padding:.22rem .55rem;border-radius:5px;cursor:pointer;' +
    'background:rgba(13,13,22,.95);border:1px solid rgba(255,255,255,.14);' +
    'color:#8b949e;font-family:\'Courier New\',monospace;transition:all .15s;' +
    'opacity:0;pointer-events:none}' +
    'pre:hover .nav-copy{opacity:1;pointer-events:auto}' +
    '.nav-copy:hover{background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.28)}' +
    '.nav-copy.ok{color:#00ff41;border-color:rgba(0,255,65,.4);background:rgba(0,255,65,.07)}';

  document.head.appendChild(s);

  var nav = document.createElement('nav');
  nav.innerHTML = '<a class="nav-brand" href="https://ximg.app">ximg.app</a>';

  var curHost = window.location.hostname;
  var curPath = window.location.pathname.split('/')[1] || '';

  // Apps served via ximg.app/<app>/ path (no individual SSL cert yet)
  var PATH_APPS = {binary:1,color:1,compiler:1,immune:1,quantum:1,synth:1,mortgage:1,retire:1,inflation:1,debt:1,budget:1,savings:1,tax:1,stocks:1,options:1,forex:1,dcf:1,rome:1,bbs:1,dos:1,modem:1,commodore:1,base64:1,hash:1,diff:1,url:1,curl:1,cidr:1,uuid:1,lorem:1,csv:1,markdown:1,password:1,ssl:1,epoch:1,timespan:1,'555timer':1,antenna:1,arduino:1,battery:1,capacitor:1,fpga:1,impedance:1,ohms:1,opamp:1,oscilloscope:1,pcb:1,pinout:1,psu:1,pwm:1,resistor:1,spectrum:1,spi:1,uart:1,voltage:1,sushi:1,tacos:1,bbq:1,ramen:1,pasta:1,thai:1,baking:1,smoker:1,knife:1,ferment:1,wine:1,beer:1,cocktails:1,tea:1,calories:1,recipe:1,spice:1,market:1,egypt:1,greece:1,babylon:1,aztec:1,mongols:1,vikings:1,crusades:1,samurai:1,ottoman:1,ww2:1,ww1:1,revolution:1,industrial:1,civilwar:1,renaissance:1,silkroad:1,colonial:1};

  function appHref(subdomain) {
    return PATH_APPS[subdomain]
      ? 'https://ximg.app/' + subdomain + '/'
      : 'https://' + subdomain + '.ximg.app';
  }

  // ── Desktop dropdowns ──────────────────────────────────────────────────────
  GROUPS.forEach(function (g) {
    var hasActive = g.apps.some(function (a) {
      var sub = a[0];
      return sub + '.ximg.app' === curHost ||
             (PATH_APPS[sub] && curHost === 'ximg.app' && curPath === sub);
    });

    var group = document.createElement('div');
    group.className = 'nav-group';

    var trigger = document.createElement('div');
    trigger.className = 'nav-trigger' + (hasActive ? ' has-active' : '');
    trigger.innerHTML = g.label + ' <span class="nav-caret">▾</span>';

    var dd = document.createElement('div');
    dd.className = 'nav-dropdown' + (g.apps.length >= 18 ? ' wider' : g.apps.length >= 9 ? ' wide' : '');

    g.apps.forEach(function (a) {
      var subdomain = a[0], label = a[1];
      var isActive = subdomain + '.ximg.app' === curHost ||
                     (PATH_APPS[subdomain] && curHost === 'ximg.app' && curPath === subdomain);
      var item = document.createElement('a');
      item.className = 'nav-dd-item' + (isActive ? ' active' : '');
      item.innerHTML = '<span class="nav-dd-dot"></span>' + label;
      if (!isActive) item.href = appHref(subdomain);
      dd.appendChild(item);
    });

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dd.classList.contains('open');
      var isActiveOnly = dd.classList.contains('active-only');
      closeAll();
      if (!isOpen || isActiveOnly) {
        dd.classList.add('open');
        dd.classList.remove('active-only');
        trigger.classList.add('open');
        var rect = dd.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
          dd.style.left = 'auto';
          dd.style.right = '0';
        } else {
          dd.style.left = '';
          dd.style.right = '';
        }
        syncSpacer();
      }
    });

    group.appendChild(trigger);
    group.appendChild(dd);
    nav.appendChild(group);

    if (hasActive) {
      group._autoOpen = function () {
        dd.classList.add('open', 'active-only');
        trigger.classList.add('open');
        var rect = dd.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
          dd.style.left = 'auto';
          dd.style.right = '0';
        }
      };
    }
  });

  // ── Mobile hamburger + panel ───────────────────────────────────────────────
  var hamburger = document.createElement('div');
  hamburger.className = 'nav-hamburger';
  hamburger.textContent = '☰';
  nav.appendChild(hamburger);

  var mobilePanel = document.createElement('div');
  mobilePanel.className = 'nav-mobile-panel';

  GROUPS.forEach(function (g) {
    var hasActive = g.apps.some(function (a) {
      var sub = a[0];
      return sub + '.ximg.app' === curHost ||
             (PATH_APPS[sub] && curHost === 'ximg.app' && curPath === sub);
    });

    var mGroup = document.createElement('div');
    mGroup.className = 'nav-mobile-group' + (hasActive ? ' open' : '');

    var mLabel = document.createElement('div');
    mLabel.className = 'nav-mobile-label' + (hasActive ? ' active-group' : '');
    mLabel.innerHTML = g.label + ' <span class="nav-mobile-caret">▾</span>';

    var mApps = document.createElement('div');
    mApps.className = 'nav-mobile-apps';

    g.apps.forEach(function (a) {
      var subdomain = a[0], label = a[1];
      var isActive = subdomain + '.ximg.app' === curHost ||
                     (PATH_APPS[subdomain] && curHost === 'ximg.app' && curPath === subdomain);
      var item = document.createElement('a');
      item.className = 'nav-mobile-app' + (isActive ? ' active' : '');
      item.innerHTML = '<span class="nav-mobile-dot"></span>' + label;
      if (!isActive) item.href = appHref(subdomain);
      mApps.appendChild(item);
    });

    mLabel.addEventListener('click', function () {
      mGroup.classList.toggle('open');
    });

    mGroup.appendChild(mLabel);
    mGroup.appendChild(mApps);
    mobilePanel.appendChild(mGroup);
  });

  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = mobilePanel.classList.contains('open');
    if (isOpen) {
      mobilePanel.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.textContent = '☰';
    } else {
      closeAll();
      mobilePanel.classList.add('open');
      hamburger.classList.add('open');
      hamburger.textContent = '✕';
    }
    syncSpacer();
  });

  document.addEventListener('click', closeAll);

  function closeAll() {
    nav.querySelectorAll('.nav-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    nav.querySelectorAll('.nav-trigger.open').forEach(function (t) { t.classList.remove('open'); });
    mobilePanel.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.textContent = '☰';
    syncSpacer();
  }

  // Spacer — keeps content below the fixed nav
  var spacer = document.createElement('div');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = 'width:100%;flex-shrink:0;pointer-events:none';

  var gtmNs = document.createElement('noscript');
  gtmNs.innerHTML = '<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PQQWB7BW" height="0" width="0" style="display:none;visibility:hidden"></iframe>';

  document.body.prepend(spacer);
  document.body.prepend(mobilePanel);
  document.body.prepend(nav);
  document.body.prepend(gtmNs);

  // Auto-open the dropdown for the active group so the current page is visible on load
  var activeDD = null;
  nav.querySelectorAll('.nav-group').forEach(function (g) {
    if (g._autoOpen) { g._autoOpen(); activeDD = g.querySelector('.nav-dropdown'); }
  });

  function syncSpacer() {
    var extra = (activeDD && activeDD.classList.contains('open')) ? activeDD.offsetHeight + 8 : 0;
    spacer.style.height = (nav.offsetHeight + extra) + 'px';
  }
  syncSpacer();
  window.addEventListener('resize', syncSpacer);

  // ── Universal sub-nav tab persistence ─────────────────────────────────────
  // Saves the active tab to localStorage and restores it on refresh.
  // Skips restore when a URL hash is present — apps that already manage their
  // own hash navigation (Pattern 1/2) handle restoration themselves.
  setTimeout(function () {
    if (window.__tabPersist) return;
    window.__tabPersist = true;

    var pageKey = 'tab:' + location.hostname + location.pathname;

    // Extract a tab id from a clicked element (handles all sub-nav patterns)
    function getTabId(el) {
      if (!el || !el.getAttribute) return null;
      // data-tab="name" buttons (most common)
      if (el.dataset && el.dataset.tab) return el.dataset.tab;
      // href="#name" anchor links
      var href = el.getAttribute('href');
      if (href && href[0] === '#' && href.length > 1) return href.slice(1);
      // onclick="switchTab('name')" / showTab / showSection / showPanel
      var oc = el.getAttribute('onclick');
      if (oc) {
        var m = oc.match(/\(\s*['"]([^'"]+)['"]\s*\)/);
        if (m) return m[1];
      }
      return null;
    }

    var TAB_SEL = '.tab,.nav-tab,.tab-btn,.sub-nav-btn,.linux-tab,.sub-nav a[href^="#"],[data-tab]';

    // Restore saved tab — but only when there is no URL hash, so we don't
    // fight apps that already read location.hash on load.
    if (!location.hash) {
      var saved = localStorage.getItem(pageKey);
      if (saved) {
        var restoreBtn =
          document.querySelector('[data-tab="' + saved + '"]') ||
          document.querySelector('a[href="#' + saved + '"]');
        if (restoreBtn) {
          restoreBtn.click();
        } else if (typeof window.switchTab === 'function') {
          window.switchTab(saved);
        } else if (typeof window.showTab === 'function') {
          window.showTab(saved);
        } else if (typeof window.showSection === 'function') {
          window.showSection(saved);
        } else if (typeof window.showPanel === 'function') {
          window.showPanel(saved);
        }
      }
    }

    // Save to localStorage whenever any tab button is clicked
    document.addEventListener('click', function (e) {
      var el = e.target;
      for (var i = 0; i < 3; i++) {
        if (!el) break;
        if (el.matches && el.matches(TAB_SEL)) {
          var id = getTabId(el);
          if (id) { localStorage.setItem(pageKey, id); break; }
        }
        el = el.parentElement;
      }
    }, true); // capture so we run before any stopPropagation

  }, 50);

  // ── theme-color + Open Graph / Twitter Card meta tags ─────────────────────
  (function () {
    function setMeta(attrs) {
      var sel = attrs.property
        ? 'meta[property="' + attrs.property + '"]'
        : 'meta[name="' + attrs.name + '"]';
      if (document.querySelector(sel)) return;
      var m = document.createElement('meta');
      for (var k in attrs) m.setAttribute(k, attrs[k]);
      document.head.appendChild(m);
    }

    setMeta({ name: 'theme-color', content: '#0a0a0f' });

    var title = document.title || 'ximg.app';

    var descEl = document.querySelector('meta[name="description"]');
    var desc = descEl ? descEl.getAttribute('content') : '';
    if (!desc) {
      var candidates = document.querySelectorAll('h1,h2,p');
      for (var i = 0; i < candidates.length; i++) {
        var t = (candidates[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length > 35) { desc = t.slice(0, 200); break; }
      }
    }
    desc = desc || title + ' — interactive app on ximg.app';

    var imgEl = document.querySelector('img[src*="/images/"]');
    var imgSrc = imgEl ? imgEl.src : '';

    var ogUrl = location.href.split('#')[0];

    setMeta({ property: 'og:type',        content: 'website' });
    setMeta({ property: 'og:site_name',   content: 'ximg.app' });
    setMeta({ property: 'og:title',       content: title });
    setMeta({ property: 'og:description', content: desc });
    setMeta({ property: 'og:url',         content: ogUrl });
    if (imgSrc) setMeta({ property: 'og:image', content: imgSrc });

    setMeta({ name: 'twitter:card',        content: imgSrc ? 'summary_large_image' : 'summary' });
    setMeta({ name: 'twitter:title',       content: title });
    setMeta({ name: 'twitter:description', content: desc });
    if (imgSrc) setMeta({ name: 'twitter:image', content: imgSrc });
  }());

  // ── Scroll-progress bar ────────────────────────────────────────────────────
  (function () {
    var bar = document.createElement('div');
    bar.style.cssText =
      'position:fixed;top:0;left:0;height:3px;width:0%;z-index:9999;pointer-events:none;' +
      'background:linear-gradient(90deg,#00ff41 0%,#00d4ff 55%,#a855f7 100%);' +
      'transition:width .07s linear;box-shadow:0 0 8px rgba(0,255,65,.6)';
    document.body.appendChild(bar);
    function upd() {
      var s = document.documentElement.scrollTop || document.body.scrollTop;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, s / h * 100) : 0) + '%';
    }
    window.addEventListener('scroll', upd, { passive: true });
    upd();
  }());

  // ── Universal image lightbox ───────────────────────────────────────────────
  (function () {
    document.addEventListener('click', function (e) {
      var img = e.target.tagName === 'IMG' ? e.target : null;
      if (!img) return;
      if (img.closest('nav') || img.closest('.nav-mobile-panel')) return;
      if ((img.naturalWidth || img.width) < 80) return; // skip icons

      var lb = document.createElement('div');
      lb.className = 'nav-lb';

      var full = document.createElement('img');
      full.src = img.src;
      full.alt = img.alt || '';

      var close = document.createElement('div');
      close.className = 'nav-lb-x';
      close.innerHTML = '&#x2715;';

      if (img.alt) {
        var cap = document.createElement('div');
        cap.className = 'nav-lb-cap';
        cap.textContent = img.alt;
        lb.appendChild(cap);
      }

      lb.appendChild(full);
      lb.appendChild(close);
      document.body.appendChild(lb);
      document.body.style.overflow = 'hidden';

      function dismiss() {
        lb.remove();
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onKey);
      }
      function onKey(ev) { if (ev.key === 'Escape') dismiss(); }
      lb.addEventListener('click', function (ev) { if (ev.target === lb) dismiss(); });
      close.addEventListener('click', dismiss);
      document.addEventListener('keydown', onKey);
    });
  }());

  // ── Copy button on <pre> blocks ────────────────────────────────────────────
  setTimeout(function () {
    document.querySelectorAll('pre').forEach(function (pre) {
      if (pre.querySelector('.nav-copy')) return;
      var btn = document.createElement('button');
      btn.className = 'nav-copy';
      btn.textContent = 'copy';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var text = (pre.querySelector('code') || pre).textContent;
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'copied!';
          btn.classList.add('ok');
          setTimeout(function () { btn.textContent = 'copy'; btn.classList.remove('ok'); }, 2000);
        }).catch(function () {
          btn.textContent = 'failed';
          setTimeout(function () { btn.textContent = 'copy'; }, 2000);
        });
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }, 120);

  // ── Sub-nav keyboard arrow navigation ─────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var tag = (e.target || {}).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    var tabs = Array.from(document.querySelectorAll(
      '.tab,.nav-tab,.tab-btn,.sub-nav-btn,.linux-tab,.sub-nav a[href^="#"],[data-tab]'
    )).filter(function (el) { return el.offsetParent !== null; });

    if (tabs.length < 2) return;

    var activeIdx = -1;
    tabs.forEach(function (t, i) {
      if (t.classList.contains('active') || t.getAttribute('aria-selected') === 'true') activeIdx = i;
    });
    if (activeIdx === -1) return;

    var next = e.key === 'ArrowRight'
      ? (activeIdx + 1) % tabs.length
      : (activeIdx - 1 + tabs.length) % tabs.length;

    tabs[next].click();
    tabs[next].focus();
    e.preventDefault();
  });

})();
