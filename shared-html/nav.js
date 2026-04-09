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
      ['ai','ai'],['ansible','ansible'],['ascii','ascii'],['bash','bash'],['bsd','bsd'],['claude','claude'],['computers','computers'],['crypto','crypto'],
      ['docker','docker'],['dns','dns'],['git','git'],['http','http'],['internet','internet'],['json','json'],['linux','linux'],['mac','mac'],
      ['agents','agents'],['algorithms','algorithms'],['cdn','cdn'],['database','database'],['embeddings','embeddings'],['loadbalancer','loadbalancer'],['nagios','nagios'],['network','network'],['os','os'],['passwords','passwords'],['playground','playground'],['programming','programming'],['queue','queue'],['request','request'],['security','security'],['sql','sql'],['ssh','ssh'],['suricata','suricata'],['systemd','systemd'],['systemdesign','systemdesign'],['temperature','temp'],['tmux','tmux'],['tokens','tokens'],['unix','unix'],['vim','vim'],['vr','vr'],['vt101','vt101'],['yaml','yaml'],['zsh','zsh']
    ]},
    { label: 'Culture', apps: [
      ['america','america'],['coffee','coffee'],['florida','florida'],
      ['guns','guns'],['japan','japan'],['moto','moto'],
      ['tampa','tampa'],['trump','trump'],['wargames','wargames'],['wood','wood']
    ]},
    { label: 'History', apps: [
      ['coldwar','coldwar'],['medieval','medieval'],['pirates','pirates'],['rome','rome'],
      ['egypt','egypt'],['greece','greece'],['babylon','babylon'],['aztec','aztec'],
      ['mongols','mongols'],['vikings','vikings'],['crusades','crusades'],['samurai','samurai'],
      ['ottoman','ottoman'],['ww2','ww2'],['ww1','ww1'],['revolution','revolution'],
      ['industrial','industrial'],['civilwar','civilwar'],['renaissance','renaissance'],
      ['silkroad','silkroad'],['colonial','colonial'],
    ]},
    { label: 'Retro', apps: [
      ['arpanet','arpanet'],['bbs','BBS'],['commodore','commodore'],['fidonet','fidonet'],['dos','DOS'],['mainframe','mainframe'],['modem','modem'],['punch','punch card'],['terminal','terminal'],
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
    { label: 'Data', apps: [
      ['visualize','visualize'],['statslab','statslab'],['regression','regression'],['probability','probability']
    ]},
    { label: 'Dev Tools', apps: [
      ['regex','regex'],['binary','binary'],['jwt','JWT'],['cron','cron'],['color','color'],
      ['base64','base64'],['hash','hash'],['diff','diff'],['url','url'],['curl','curl'],
      ['cidr','cidr'],['uuid','uuid'],['lorem','lorem'],['csv','csv'],['markdown','markdown'],
      ['password','password'],['ssl','ssl'],['epoch','epoch'],['timespan','timespan'],['ps1','ps1'],
      ['dockerimage','dockerimage'],['dockerimagedownloader','docker image downloader'],['githubstars','github stars']
    ]},
    { label: 'Finance', apps: [
      ['compound','compound'],
      ['mortgage','mortgage'],['retire','retire'],['inflation','inflation'],['debt','debt'],
      ['budget','budget'],['savings','savings'],['tax','tax'],['stocks','stocks'],
      ['options','options'],['forex','forex'],['dcf','DCF']
    ]},
    { label: 'More', apps: [
      ['rx','RxFitt']
    ]},
    { label: 'System', apps: [
      ['apps','apps'],['change','change'],['claudemd','CLAUDE.md'],['ids','IDS'],['logs','logs'],['mail','mail'],['nav','nav'],['readme','README.md'],['status','status'],['stats','stats'],['video','video'],['ximg','ximg']
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
    '@keyframes navpulse{0%,100%{opacity:1}50%{opacity:.3}}';

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
        dd.classList.remove('active-only'); // manual open always shows all apps
        trigger.classList.add('open');
        // flip left/right if dropdown would overflow viewport
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
        dd.classList.add('open', 'active-only'); // auto-open shows only the active item
        trigger.classList.add('open');
        var rect = dd.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
          dd.style.left = 'auto';
          dd.style.right = '0';
        }
      };
    }
  });

  document.addEventListener('click', closeAll);

  function closeAll() {
    nav.querySelectorAll('.nav-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    nav.querySelectorAll('.nav-trigger.open').forEach(function (t) { t.classList.remove('open'); });
    syncSpacer();
  }

  // Spacer — keeps content below the fixed nav
  var spacer = document.createElement('div');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = 'width:100%;flex-shrink:0;pointer-events:none';

  var gtmNs = document.createElement('noscript');
  gtmNs.innerHTML = '<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PQQWB7BW" height="0" width="0" style="display:none;visibility:hidden"></iframe>';

  document.body.prepend(spacer);
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
})();
