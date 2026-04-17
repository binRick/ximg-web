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
      ['cdn','cdn'],['chmod','chmod'],['clamav','clamav'],['claude','claude'],['computers','computers'],['crypto','crypto'],['database','database'],['dns','dns'],['docker','docker'],
      ['embeddings','embeddings'],['gentoo','gentoo'],['git','git'],['http','http'],['internet','internet'],['iptables','iptables'],['json','json'],['linux','linux'],['loadbalancer','loadbalancer'],['mac','mac'],['makefile','makefile'],['network','network'],['os','os'],['passwords','passwords'],['playground','playground'],['programming','programming'],['queue','queue'],['request','request'],['security','security'],['smtp','smtp'],['sql','sql'],['ssh','ssh'],['suricata','suricata'],['systemd','systemd'],['systemdesign','systemdesign'],['temperature','temp'],['tls','tls'],['tmux','tmux'],['tokens','tokens'],['unix','unix'],['utf8','utf8'],['vim','vim'],['vr','vr'],['vt101','vt101'],['yaml','yaml'],['zsh','zsh']
    ]},
    { label: 'Culture', apps: [
      ['america','america'],['architecture','architecture'],['bourbon','bourbon'],['coffee','coffee'],['florida','florida'],
      ['guns','guns'],['japan','japan'],['moto','moto'],
      ['tampa','tampa'],['trump','trump'],['wargames','wargames'],['wood','wood']
    ]},
    { label: 'History', apps: [
      ['aztec','aztec'],['babylon','babylon'],['british','british empire'],['cia','CIA'],['civilwar','civilwar'],['coldwar','coldwar'],['colonial','colonial'],['communism','communism'],['crusades','crusades'],
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
      ['mario','mario'],['monkey','monkey'],['nintendo','nintendo'],['poker','poker'],['quake','quake'],['simcity','simcity'],['tetris','tetris'],['warcraft','warcraft']
    ]},
    { label: 'Electronics', apps: [
      ['555timer','555 Timer'],['antenna','antenna'],['arduino','arduino'],['battery','battery'],['capacitor','capacitor'],['circuit','circuit'],['compiler','compiler'],['fpga','fpga'],['impedance','impedance'],['logic','logic'],['ohms','ohms'],['opamp','opamp'],['oscilloscope','oscilloscope'],['pcb','pcb'],['pinout','pinout'],['protocol','protocol'],['psu','psu'],['pwm','pwm'],['resistor','resistor'],['spectrum','spectrum'],['spi','spi'],['uart','uart'],['voltage','voltage']
    ]},
    { label: 'Dev Tools', apps: [
      ['devtools-info','what & why'],
      ['base64','base64'],['binary','binary'],['cidr','cidr'],['color','color'],['cron','cron'],
      ['csv','csv'],['curl','curl'],['diff','diff'],['dockerimage','dockerimage'],
      ['epoch','epoch'],['githubstars','github stars'],['hash','hash'],['jwt','JWT'],['lorem','lorem'],
      ['markdown','markdown'],['password','password'],['ps1','ps1'],['regex','regex'],['ssl','ssl'],
      ['timespan','timespan'],['url','url'],['uuid','uuid'],['ca-fetcher','CA fetcher']
    ]},
    { label: 'Bundlers', apps: [
      ['bundler-info','what & why'],
      ['ansible-bundler','ansible'],
      ['apt-bundler','apt'],
      ['dockerimagedownloader','docker image'],
      ['go-bundler','go'],
      ['iso','linux isos'],
      ['nodejs-bundler','node.js'],
      ['nuget-bundler','nuget'],
      ['python-bundler','python'],
      ['rpm-bundler','rpm'],
    ]},
    { label: 'Projects', apps: [
      ['rx','RxFitt'],
      ['esp32','Freenove ESP32-S3 Dev Kit FNK0086'],
      ['proc-trace-exec','proc-trace-exec'],
      ['proc-trace-net','proc-trace-net'],
      ['proc-trace-dns','proc-trace-dns'],
      ['pal','pal — Terminal Palette Switcher'],
      ['tls-ca-fetch','tls-ca-fetch']
    ]},
    { label: 'System', apps: [
      ['apps','apps'],['change','change'],['claudemd','CLAUDE.md'],['honeypot','honeypot'],['ids','IDS'],['logs','logs'],['mail','mail'],['nav','nav'],['readme','README.md'],['stats','stats'],['video','video'],['ximg','ximg']
    ]},
  ];

  // ── makeCSS: generate full nav CSS from a compact theme config ───────────────
  function makeCSS(c) {
    var f = c.font;
    var r = c.rad !== undefined ? c.rad : '6px';
    var tr = c.trans !== undefined ? c.trans : 'all .18s';
    return (
      'nav{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;' +
      'gap:' + (c.gap || '.35rem') + ';padding:' + (c.pad || '.4rem .75rem') + ';' +
      'background:' + c.bg + ';' +
      (c.blur ? 'backdrop-filter:' + c.blur + ';' : '') +
      'border-bottom:' + c.bord + ';' +
      (c.shad ? 'box-shadow:' + c.shad + ';' : '') +
      'font-family:' + f + ';}' +

      '.nav-brand{font-weight:700;font-size:.88rem;color:' + c.brandC + ';margin-right:.5rem;' +
      'letter-spacing:-.02em;text-decoration:none;flex-shrink:0;' +
      (c.brandBg ? 'background:' + c.brandBg + ';padding:2px 8px;letter-spacing:0;' : '') +
      'font-family:' + f + '}' +

      '.nav-group{position:relative;flex-shrink:0}' +

      '.nav-trigger{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-weight:600;' +
      'padding:.3rem .65rem;border-radius:' + r + ';cursor:pointer;white-space:nowrap;' +
      'color:' + c.tc + ';border:' + c.tbord + ';background:' + c.tbg + ';' +
      'font-family:' + f + ';user-select:none;transition:' + tr + ';}' +
      '.nav-trigger:hover{background:' + c.tHbg + ';border:' + (c.tHbord || c.tbord) + ';' + (c.tHc ? 'color:' + c.tHc + ';' : '') + '}' +
      '.nav-trigger.open{background:' + (c.tObg || c.tHbg) + ';border:' + (c.tObord || c.tHbord || c.tbord) + ';' + (c.tOc ? 'color:' + c.tOc + ';' : '') + '}' +
      '.nav-trigger.has-active{color:' + c.acc + ';border-color:' + c.accBord + ';background:' + c.accBg + ';}' +
      '.nav-trigger.has-active:hover{background:' + c.accHbg + ';}' +

      '.nav-caret{font-size:.55rem;opacity:.7;line-height:1}' +
      '.nav-trigger.open .nav-caret{transform:none}' +

      '.nav-dropdown{position:absolute;top:calc(100% + 4px);left:0;' +
      'background:' + (c.ddbg || c.bg) + ';border:' + c.ddbord + ';border-radius:' + r + ';' +
      'box-shadow:' + (c.ddshad || '0 8px 32px rgba(0,0,0,.7)') + ';padding:4px;z-index:300;' +
      'opacity:0;pointer-events:none;transition:opacity .12s,transform .12s;transform:translateY(-4px);}' +
      '.nav-dropdown.open{opacity:1;pointer-events:all;transform:none;}' +
      '.nav-dropdown.wide{display:grid;grid-template-columns:1fr 1fr;gap:0;min-width:200px;}' +
      '.nav-dropdown.wider{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;min-width:300px;}' +
      '.nav-dropdown.active-only .nav-dd-item:not(.active){display:none;}' +
      '.nav-dropdown.active-only{display:block;min-width:0;width:auto;}' +

      '.nav-dd-item{display:flex;align-items:center;gap:6px;font-size:.73rem;font-weight:400;' +
      'color:' + c.dc + ';padding:4px 10px;border-radius:' + (c.drad !== undefined ? c.drad : r) + ';white-space:nowrap;' +
      'text-decoration:none;font-family:' + f + ';cursor:default;}' +
      '.nav-dd-item:hover{background:' + c.dHbg + ';color:' + c.dHc + ';}' +
      '.nav-dd-item.active{color:' + c.acc + ';font-weight:600;}' +

      '.nav-dd-dot{width:4px;height:4px;flex-shrink:0;background:transparent;}' +
      '.nav-dd-item.active .nav-dd-dot{background:' + c.acc + ';}' +
      '@keyframes navpulse{0%,100%{opacity:1}50%{opacity:.4}}' +

      '.nav-hamburger{display:none;margin-left:auto;flex-shrink:0;cursor:pointer;' +
      'background:' + c.tbg + ';border:' + c.tbord + ';border-radius:' + r + ';' +
      'padding:.3rem .6rem;color:' + c.tc + ';font-size:.9rem;line-height:1;' +
      'font-family:' + f + ';user-select:none;transition:' + tr + ';}' +
      '.nav-hamburger:hover,.nav-hamburger.open{background:' + c.tHbg + ';}' +

      '.nav-mobile-panel{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:199;' +
      'background:' + (c.mpbg || c.bg) + ';' +
      (c.mpblur ? 'backdrop-filter:' + c.mpblur + ';' : '') +
      'overflow-y:auto;padding-top:2.8rem;}' +
      '.nav-mobile-panel.open{display:block;}' +

      '.nav-mobile-group{border-bottom:1px solid ' + (c.mpgbord || 'rgba(255,255,255,.1)') + ';}' +
      '.nav-mobile-label{display:flex;align-items:center;justify-content:space-between;' +
      'padding:8px 14px;font-size:.82rem;font-weight:600;color:' + c.tc + ';cursor:pointer;' +
      'font-family:' + f + ';user-select:none;}' +
      '.nav-mobile-label:active{color:' + c.acc + ';}' +
      '.nav-mobile-label.active-group{color:' + c.acc + ';}' +
      '.nav-mobile-caret{font-size:.6rem;opacity:.6;transition:transform .15s;}' +
      '.nav-mobile-group.open .nav-mobile-caret{transform:rotate(180deg);}' +

      '.nav-mobile-apps{display:none;padding:4px 8px 8px;' +
      'display:grid;grid-template-columns:1fr 1fr;gap:2px;}' +
      '.nav-mobile-group:not(.open) .nav-mobile-apps{display:none;}' +
      '.nav-mobile-group.open .nav-mobile-apps{display:grid;}' +

      '.nav-mobile-app{display:flex;align-items:center;gap:.4rem;padding:5px 8px;' +
      'border-radius:' + r + ';font-size:.76rem;font-weight:400;color:' + c.dc + ';' +
      'text-decoration:none;font-family:' + f + ';transition:color .12s;}' +
      '.nav-mobile-app:hover,.nav-mobile-app:active{color:' + c.dHc + ';background:' + c.dHbg + ';}' +
      '.nav-mobile-app.active{color:' + c.acc + ';font-weight:600;}' +
      '.nav-mobile-dot{width:4px;height:4px;flex-shrink:0;background:transparent;}' +
      '.nav-mobile-app.active .nav-mobile-dot{background:' + c.acc + ';}' +

      '@media(max-width:768px){.nav-group{display:none;}.nav-hamburger{display:inline-flex;align-items:center;}}' +

      '.sub-nav{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
      '.sub-nav::-webkit-scrollbar{display:none}' +

      'img[loading="lazy"]{cursor:zoom-in;transition:box-shadow .15s}' +
      'img[loading="lazy"]:hover{box-shadow:' + (c.imgRing || '0 0 0 2px ' + c.acc) + '}' +

      '.nav-lb{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.88);' +
      'display:flex;align-items:center;justify-content:center;cursor:default;animation:nav-lbi .1s ease}' +
      '@keyframes nav-lbi{from{opacity:0}to{opacity:1}}' +
      '.nav-lb img{max-width:90vw;max-height:88vh;object-fit:contain;' +
      'border:1px solid rgba(255,255,255,.18);border-radius:4px;' +
      'box-shadow:0 8px 40px rgba(0,0,0,.8);animation:nav-lbii .15s ease}' +
      '@keyframes nav-lbii{from{transform:scale(.95)}to{transform:none}}' +
      '.nav-lb-x{position:fixed;top:1rem;right:1.2rem;color:' + c.tc + ';font-size:.75rem;font-weight:700;' +
      'cursor:pointer;background:' + c.tbg + ';border:' + c.tbord + ';' +
      'border-radius:' + r + ';width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;' +
      'transition:' + tr + ';user-select:none;font-family:' + f + '}' +
      '.nav-lb-x:hover{background:' + c.tHbg + ';}' +
      '.nav-lb-cap{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);' +
      'color:rgba(255,255,255,.6);font-size:.78rem;font-family:' + f + ';' +
      'text-align:center;max-width:80vw;pointer-events:none}' +

      '.nav-copy{position:absolute;top:.5rem;right:.5rem;font-size:.68rem;font-weight:600;' +
      'padding:2px 7px;border-radius:' + r + ';cursor:pointer;' +
      'background:' + (c.cpBg || c.tbg) + ';border:' + (c.cpBord || c.tbord) + ';' +
      'color:' + (c.cpC || c.dc) + ';font-family:' + f + ';transition:all .15s;' +
      'opacity:0;pointer-events:none}' +
      'pre:hover .nav-copy{opacity:1;pointer-events:auto}' +
      '.nav-copy:hover{background:' + (c.cpHbg || c.tHbg) + ';color:' + (c.cpHc || c.dHc) + ';}' +
      '.nav-copy.ok{background:' + (c.cpOkBg || 'rgba(0,255,65,.1)') + ';color:' + (c.cpOkC || c.acc) + ';border-color:' + (c.cpOkBord || c.accBord) + ';}'
    );
  }

  // ── Theme CSS definitions ────────────────────────────────────────────────────

  var THEMES = {};

  THEMES.dark = makeCSS({
    bg: 'rgba(10,10,15,.9)', blur: 'blur(16px)',
    bord: '1px solid rgba(255,255,255,.06)',
    font: "'Courier New',monospace",
    brandC: '#f1f5f9',
    tc: '#c9d1d9', tbg: 'rgba(255,255,255,.04)', tbord: '1px solid rgba(255,255,255,.08)',
    tHbg: 'rgba(255,255,255,.09)', tHbord: '1px solid rgba(255,255,255,.18)',
    tObg: 'rgba(255,255,255,.1)', tObord: '1px solid rgba(255,255,255,.2)',
    acc: '#00ff41', accBord: 'rgba(0,255,65,.4)', accBg: 'rgba(0,255,65,.07)', accHbg: 'rgba(0,255,65,.12)',
    ddbg: 'rgba(10,10,18,.97)', ddbord: '1px solid rgba(255,255,255,.12)',
    dc: '#8b949e', dHbg: 'rgba(255,255,255,.07)', dHc: '#f1f5f9',
    mpbg: 'rgba(10,10,15,.97)', mpblur: 'blur(16px)', mpgbord: 'rgba(255,255,255,.07)',
    imgRing: '0 0 0 2px #00ff41,0 0 12px rgba(0,255,65,.2)',
  });

  THEMES.win95 =
    'nav{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;' +
    'gap:2px;padding:2px 4px;background:#c0c0c0;' +
    'border-bottom:2px solid #808080;box-shadow:inset 0 -1px 0 #000;' +
    'font-family:"MS Sans Serif",Arial,sans-serif;}' +
    '.nav-brand{font-weight:700;font-size:.8rem;color:#fff;margin-right:6px;' +
    'background:#000080;padding:2px 8px;text-decoration:none;flex-shrink:0;' +
    'font-family:"MS Sans Serif",Arial,sans-serif;white-space:nowrap;}' +
    '.nav-group{position:relative;flex-shrink:0}' +
    '.nav-trigger{display:inline-flex;align-items:center;gap:4px;font-size:.75rem;font-weight:400;' +
    'padding:3px 8px;border-radius:0;cursor:pointer;white-space:nowrap;' +
    'color:#000;background:#c0c0c0;' +
    'border:2px solid;border-top-color:#fff;border-left-color:#fff;' +
    'border-bottom-color:#000;border-right-color:#000;' +
    'box-shadow:inset 1px 1px 0 #dfdfdf,inset -1px -1px 0 #808080;' +
    'font-family:"MS Sans Serif",Arial,sans-serif;user-select:none;transition:none;}' +
    '.nav-trigger:hover{background:#c0c0c0;}' +
    '.nav-trigger.open{border-top-color:#000;border-left-color:#000;border-bottom-color:#fff;border-right-color:#fff;' +
    'box-shadow:inset 1px 1px 0 #808080,inset -1px -1px 0 #dfdfdf;padding:4px 7px 2px 9px;}' +
    '.nav-trigger.has-active{font-weight:700;color:#000080;}' +
    '.nav-trigger.has-active:hover{background:#c0c0c0;}' +
    '.nav-caret{font-size:.55rem;opacity:.7;line-height:1}' +
    '.nav-trigger.open .nav-caret{transform:none}' +
    '.nav-dropdown{position:absolute;top:calc(100% + 2px);left:0;' +
    'background:#c0c0c0;border:2px solid;border-top-color:#fff;border-left-color:#fff;' +
    'border-bottom-color:#000;border-right-color:#000;' +
    'box-shadow:2px 2px 0 #000,inset 1px 1px 0 #dfdfdf,inset -1px -1px 0 #808080;' +
    'padding:2px;z-index:300;opacity:0;pointer-events:none;transition:none;}' +
    '.nav-dropdown.open{opacity:1;pointer-events:all;}' +
    '.nav-dropdown.wide{display:grid;grid-template-columns:1fr 1fr;gap:0;min-width:200px;}' +
    '.nav-dropdown.wider{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;min-width:300px;}' +
    '.nav-dropdown.active-only .nav-dd-item:not(.active){display:none;}' +
    '.nav-dropdown.active-only{display:block;min-width:0;width:auto;}' +
    '.nav-dd-item{display:flex;align-items:center;gap:6px;font-size:.73rem;font-weight:400;' +
    'color:#000;padding:3px 16px 3px 8px;border-radius:0;white-space:nowrap;' +
    'text-decoration:none;font-family:"MS Sans Serif",Arial,sans-serif;cursor:default;}' +
    '.nav-dd-item:hover{background:#000080;color:#fff;}' +
    '.nav-dd-item.active{font-weight:700;}' +
    '.nav-dd-dot{width:4px;height:4px;flex-shrink:0;background:transparent;}' +
    '.nav-dd-item.active .nav-dd-dot{background:#000080;}' +
    '@keyframes navpulse{0%,100%{opacity:1}50%{opacity:.4}}' +
    '.nav-hamburger{display:none;margin-left:auto;flex-shrink:0;cursor:pointer;' +
    'background:#c0c0c0;border:2px solid;border-top-color:#fff;border-left-color:#fff;' +
    'border-bottom-color:#000;border-right-color:#000;' +
    'box-shadow:inset 1px 1px 0 #dfdfdf,inset -1px -1px 0 #808080;' +
    'border-radius:0;padding:3px 8px;color:#000;font-size:1rem;line-height:1;' +
    'font-family:"MS Sans Serif",Arial,sans-serif;user-select:none;transition:none;}' +
    '.nav-hamburger:hover{background:#c0c0c0;}' +
    '.nav-hamburger.open{border-top-color:#000;border-left-color:#000;border-bottom-color:#fff;border-right-color:#fff;' +
    'box-shadow:inset 1px 1px 0 #808080,inset -1px -1px 0 #dfdfdf;}' +
    '.nav-mobile-panel{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:199;' +
    'background:#c0c0c0;overflow-y:auto;padding-top:2.8rem;}' +
    '.nav-mobile-panel.open{display:block;}' +
    '.nav-mobile-group{border-bottom:1px solid #808080;}' +
    '.nav-mobile-label{display:flex;align-items:center;justify-content:space-between;' +
    'padding:7px 12px;font-size:.85rem;font-weight:700;color:#000;cursor:pointer;' +
    'font-family:"MS Sans Serif",Arial,sans-serif;user-select:none;}' +
    '.nav-mobile-label:active{background:#000080;color:#fff;}' +
    '.nav-mobile-label.active-group{background:#000080;color:#fff;}' +
    '.nav-mobile-caret{font-size:.6rem;opacity:.6;transition:transform .15s;}' +
    '.nav-mobile-group.open .nav-mobile-caret{transform:rotate(180deg);}' +
    '.nav-mobile-apps{display:none;padding:4px 8px 8px;display:grid;grid-template-columns:1fr 1fr;gap:2px;}' +
    '.nav-mobile-group:not(.open) .nav-mobile-apps{display:none;}' +
    '.nav-mobile-group.open .nav-mobile-apps{display:grid;}' +
    '.nav-mobile-app{display:flex;align-items:center;gap:.4rem;padding:5px 8px;' +
    'border-radius:0;font-size:.78rem;font-weight:400;color:#000;' +
    'text-decoration:none;font-family:"MS Sans Serif",Arial,sans-serif;transition:none;}' +
    '.nav-mobile-app:hover,.nav-mobile-app:active{background:#000080;color:#fff;}' +
    '.nav-mobile-app.active{font-weight:700;color:#000080;}' +
    '.nav-mobile-dot{width:4px;height:4px;flex-shrink:0;background:transparent;}' +
    '.nav-mobile-app.active .nav-mobile-dot{background:#000080;}' +
    '@media(max-width:768px){.nav-group{display:none;}.nav-hamburger{display:inline-flex;align-items:center;}}' +
    '.sub-nav{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '.sub-nav::-webkit-scrollbar{display:none}' +
    'img[loading="lazy"]{cursor:zoom-in;transition:box-shadow .15s}' +
    'img[loading="lazy"]:hover{box-shadow:0 0 0 2px #000080,2px 2px 4px rgba(0,0,0,.4)}' +
    '.nav-lb{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.88);' +
    'display:flex;align-items:center;justify-content:center;cursor:default;animation:nav-lbi .1s ease}' +
    '@keyframes nav-lbi{from{opacity:0}to{opacity:1}}' +
    '.nav-lb img{max-width:90vw;max-height:88vh;object-fit:contain;' +
    'border:3px solid;border-top-color:#fff;border-left-color:#fff;border-bottom-color:#000;border-right-color:#000;' +
    'box-shadow:2px 2px 0 #000;animation:nav-lbii .15s ease}' +
    '@keyframes nav-lbii{from{transform:scale(.95)}to{transform:none}}' +
    '.nav-lb-x{position:fixed;top:1rem;right:1.2rem;color:#000;font-size:.75rem;font-weight:700;' +
    'cursor:pointer;background:#c0c0c0;border:2px solid;border-top-color:#fff;border-left-color:#fff;' +
    'border-bottom-color:#000;border-right-color:#000;box-shadow:inset 1px 1px 0 #dfdfdf,inset -1px -1px 0 #808080;' +
    'width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;' +
    'transition:none;user-select:none;font-family:"MS Sans Serif",Arial,sans-serif;border-radius:0}' +
    '.nav-lb-x:hover{background:#c0c0c0;}' +
    '.nav-lb-cap{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);' +
    'color:rgba(255,255,255,.7);font-size:.78rem;font-family:"MS Sans Serif",Arial,sans-serif;' +
    'text-align:center;max-width:80vw;pointer-events:none}' +
    '.nav-copy{position:absolute;top:.5rem;right:.5rem;font-size:.68rem;font-weight:400;' +
    'padding:2px 6px;border-radius:0;cursor:pointer;background:#c0c0c0;' +
    'border:2px solid;border-top-color:#fff;border-left-color:#fff;border-bottom-color:#000;border-right-color:#000;' +
    'box-shadow:inset 1px 1px 0 #dfdfdf,inset -1px -1px 0 #808080;' +
    'color:#000;font-family:"MS Sans Serif",Arial,sans-serif;transition:none;opacity:0;pointer-events:none}' +
    'pre:hover .nav-copy{opacity:1;pointer-events:auto}' +
    '.nav-copy:hover{background:#c0c0c0;}' +
    '.nav-copy.ok{background:#000080;color:#fff;border-top-color:#000;border-left-color:#000;' +
    'border-bottom-color:#fff;border-right-color:#fff;box-shadow:inset 1px 1px 0 #808080}';

  THEMES.dos = makeCSS({
    bg: '#000', blur: '', bord: '1px solid #555',
    font: "'Courier New',monospace",
    brandC: '#fff',
    tc: '#aaa', tbg: 'transparent', tbord: '1px solid #444',
    tHbg: '#333', tHbord: '1px solid #666', tHc: '#fff',
    tObg: '#222', tObord: '1px solid #666',
    acc: '#ffff00', accBord: '#888800', accBg: 'rgba(255,255,0,.08)', accHbg: 'rgba(255,255,0,.15)',
    ddbg: '#111', ddbord: '1px solid #444',
    dc: '#888', dHbg: '#333', dHc: '#fff',
    mpbg: '#000', mpgbord: '#333',
    imgRing: '0 0 0 2px #ffff00',
  });

  THEMES.cga = makeCSS({
    bg: '#000', blur: '', bord: '2px solid #55ffff',
    font: "'Courier New',monospace",
    brandC: '#ffffff',
    tc: '#55ffff', tbg: 'transparent', tbord: '1px solid #55ffff',
    tHbg: '#55ffff', tHbord: '1px solid #55ffff', tHc: '#000',
    tObg: '#55ffff', tObord: '1px solid #55ffff',
    acc: '#ff55ff', accBord: '#ff55ff', accBg: 'rgba(255,85,255,.15)', accHbg: 'rgba(255,85,255,.3)',
    ddbg: '#000', ddbord: '1px solid #55ffff',
    dc: '#55ffff', dHbg: '#55ffff', dHc: '#000', drad: '0',
    mpbg: '#000', mpgbord: '#55ffff',
    imgRing: '0 0 0 2px #ff55ff',
  });

  THEMES.amber = makeCSS({
    bg: 'rgba(13,8,0,.95)', blur: '', bord: '1px solid rgba(255,176,0,.2)',
    font: "'Courier New',monospace",
    brandC: '#ffb000',
    tc: '#cc8800', tbg: 'transparent', tbord: '1px solid rgba(255,176,0,.2)',
    tHbg: 'rgba(255,176,0,.1)', tHbord: '1px solid rgba(255,176,0,.4)', tHc: '#ffb000',
    tObg: 'rgba(255,176,0,.15)', tObord: '1px solid rgba(255,176,0,.5)',
    acc: '#ffb000', accBord: 'rgba(255,176,0,.5)', accBg: 'rgba(255,176,0,.1)', accHbg: 'rgba(255,176,0,.2)',
    ddbg: 'rgba(8,5,0,.98)', ddbord: '1px solid rgba(255,176,0,.25)',
    dc: '#aa6600', dHbg: 'rgba(255,176,0,.1)', dHc: '#ffb000',
    mpbg: 'rgba(13,8,0,.98)', mpgbord: 'rgba(255,176,0,.2)',
    imgRing: '0 0 0 2px #ffb000,0 0 8px rgba(255,176,0,.3)',
  });

  THEMES.green = makeCSS({
    bg: 'rgba(0,12,0,.95)', blur: '', bord: '1px solid rgba(0,255,65,.2)',
    font: "'Courier New',monospace",
    brandC: '#00ff41',
    tc: '#00aa30', tbg: 'transparent', tbord: '1px solid rgba(0,255,65,.2)',
    tHbg: 'rgba(0,255,65,.1)', tHbord: '1px solid rgba(0,255,65,.4)', tHc: '#00ff41',
    tObg: 'rgba(0,255,65,.15)', tObord: '1px solid rgba(0,255,65,.5)',
    acc: '#00ff41', accBord: 'rgba(0,255,65,.5)', accBg: 'rgba(0,255,65,.1)', accHbg: 'rgba(0,255,65,.2)',
    ddbg: 'rgba(0,8,0,.98)', ddbord: '1px solid rgba(0,255,65,.25)',
    dc: '#008020', dHbg: 'rgba(0,255,65,.1)', dHc: '#00ff41',
    mpbg: 'rgba(0,12,0,.98)', mpgbord: 'rgba(0,255,65,.2)',
    imgRing: '0 0 0 2px #00ff41,0 0 8px rgba(0,255,65,.3)',
  });

  THEMES.mac = makeCSS({
    bg: '#dddddd', blur: '', bord: '1px solid #888', shad: '0 1px 3px rgba(0,0,0,.3)',
    font: "Chicago,'Geneva',Helvetica,Arial,sans-serif", pad: '.3rem .75rem', rad: '0', trans: 'none',
    brandC: '#000',
    tc: '#000', tbg: '#d0d0d0', tbord: '1px solid #888',
    tHbg: '#c0c0c0', tHbord: '1px solid #555',
    tObg: '#a0a0a0', tObord: '1px solid #444',
    acc: '#000080', accBord: '#000080', accBg: 'rgba(0,0,128,.08)', accHbg: 'rgba(0,0,128,.15)',
    ddbg: '#eeeeee', ddbord: '1px solid #888', drad: '0',
    dc: '#333', dHbg: '#000080', dHc: '#fff',
    mpbg: '#dddddd', mpgbord: '#999',
    imgRing: '0 0 0 2px #000080',
    cpBg: '#d0d0d0', cpBord: '1px solid #888', cpC: '#333',
    cpHbg: '#c0c0c0', cpHc: '#000',
    cpOkBg: '#000080', cpOkC: '#fff', cpOkBord: '#000040',
  });

  THEMES.c64 = makeCSS({
    bg: '#3535a5', blur: '', bord: '1px solid #8080ff',
    font: "'Courier New',monospace",
    brandC: '#c8c8ff',
    tc: '#8080cc', tbg: 'transparent', tbord: '1px solid #6060aa',
    tHbg: 'rgba(200,200,255,.15)', tHbord: '1px solid #8080ff', tHc: '#c8c8ff',
    tObg: 'rgba(200,200,255,.2)', tObord: '1px solid #a0a0ff',
    acc: '#c8c8ff', accBord: '#a0a0ff', accBg: 'rgba(200,200,255,.2)', accHbg: 'rgba(200,200,255,.3)',
    ddbg: '#2020a0', ddbord: '1px solid #8080ff',
    dc: '#8080cc', dHbg: '#c8c8ff', dHc: '#3535a5',
    mpbg: '#3535a5', mpgbord: '#6060aa',
    imgRing: '0 0 0 2px #c8c8ff',
  });

  THEMES.glass = makeCSS({
    bg: 'rgba(255,255,255,.08)', blur: 'blur(20px)',
    bord: '1px solid rgba(255,255,255,.15)', shad: '0 2px 20px rgba(0,0,0,.3)',
    font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    brandC: 'rgba(255,255,255,.9)',
    tc: 'rgba(255,255,255,.7)', tbg: 'rgba(255,255,255,.06)', tbord: '1px solid rgba(255,255,255,.15)',
    tHbg: 'rgba(255,255,255,.14)', tHbord: '1px solid rgba(255,255,255,.3)',
    tObg: 'rgba(255,255,255,.18)', tObord: '1px solid rgba(255,255,255,.35)',
    acc: 'rgba(255,255,255,.95)', accBord: 'rgba(255,255,255,.5)', accBg: 'rgba(255,255,255,.12)', accHbg: 'rgba(255,255,255,.2)',
    ddbg: 'rgba(20,20,40,.85)', ddbord: '1px solid rgba(255,255,255,.2)',
    dc: 'rgba(255,255,255,.6)', dHbg: 'rgba(255,255,255,.1)', dHc: 'rgba(255,255,255,.95)',
    mpbg: 'rgba(10,10,20,.85)', mpblur: 'blur(20px)', mpgbord: 'rgba(255,255,255,.1)',
    imgRing: '0 0 0 2px rgba(255,255,255,.5),0 0 12px rgba(255,255,255,.2)',
  });

  THEMES.neo = makeCSS({
    bg: '#e0e5ec', blur: '', bord: 'none', shad: '0 2px 8px rgba(163,177,198,.6)',
    font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    brandC: '#4a7fe5',
    tc: '#6b7280', tbg: '#e0e5ec', tbord: '1px solid rgba(255,255,255,.7)',
    tHbg: '#e8edf4', tHbord: '1px solid rgba(255,255,255,.8)', tHc: '#374151',
    tObg: '#d8dde6', tObord: '1px solid rgba(163,177,198,.5)',
    acc: '#4a7fe5', accBord: 'rgba(74,127,229,.4)', accBg: 'rgba(74,127,229,.1)', accHbg: 'rgba(74,127,229,.15)',
    ddbg: '#e8edf4', ddbord: '1px solid rgba(255,255,255,.8)',
    ddshad: '4px 4px 10px rgba(163,177,198,.6),-2px -2px 6px rgba(255,255,255,.8)',
    dc: '#6b7280', dHbg: 'rgba(74,127,229,.1)', dHc: '#374151',
    mpbg: '#e0e5ec', mpgbord: 'rgba(163,177,198,.5)',
    imgRing: '0 0 0 2px #4a7fe5',
    cpBg: '#e0e5ec', cpBord: '1px solid rgba(255,255,255,.7)', cpC: '#6b7280',
    cpHbg: '#e8edf4', cpHc: '#374151',
    cpOkBg: 'rgba(74,127,229,.1)', cpOkC: '#4a7fe5', cpOkBord: 'rgba(74,127,229,.4)',
  });

  THEMES.brutalist = makeCSS({
    bg: '#ffffff', blur: '', bord: '3px solid #000', shad: '0 3px 0 #000',
    font: "'Arial Black',Arial,sans-serif", pad: '.3rem .75rem', rad: '0', trans: 'none',
    brandC: '#000',
    tc: '#000', tbg: '#fff', tbord: '2px solid #000',
    tHbg: '#ffff00', tHbord: '2px solid #000', tHc: '#000',
    tObg: '#000', tObord: '2px solid #000', tOc: '#fff',
    acc: '#ff0000', accBord: '#ff0000', accBg: 'rgba(255,0,0,.1)', accHbg: 'rgba(255,0,0,.2)',
    ddbg: '#fff', ddbord: '3px solid #000', ddshad: '4px 4px 0 #000', drad: '0',
    dc: '#333', dHbg: '#ffff00', dHc: '#000',
    mpbg: '#fff', mpgbord: '#000',
    imgRing: '0 0 0 3px #000',
    cpBg: '#fff', cpBord: '2px solid #000', cpC: '#000',
    cpHbg: '#ffff00', cpHc: '#000',
    cpOkBg: '#00cc00', cpOkC: '#fff', cpOkBord: '#000',
  });

  THEMES.neon = makeCSS({
    bg: 'rgba(8,1,15,.95)', blur: 'blur(12px)', bord: '1px solid rgba(255,28,235,.2)',
    font: "'Courier New',monospace",
    brandC: '#ff1ceb',
    tc: '#c060e0', tbg: 'rgba(255,28,235,.04)', tbord: '1px solid rgba(255,28,235,.2)',
    tHbg: 'rgba(255,28,235,.1)', tHbord: '1px solid rgba(255,28,235,.5)', tHc: '#ff1ceb',
    tObg: 'rgba(255,28,235,.15)', tObord: '1px solid rgba(255,28,235,.7)',
    acc: '#ff1ceb', accBord: 'rgba(255,28,235,.6)', accBg: 'rgba(255,28,235,.1)', accHbg: 'rgba(255,28,235,.2)',
    ddbg: 'rgba(12,2,22,.98)', ddbord: '1px solid rgba(255,28,235,.3)',
    ddshad: '0 8px 32px rgba(255,28,235,.3)',
    dc: '#9040c0', dHbg: 'rgba(255,28,235,.15)', dHc: '#ff1ceb',
    mpbg: 'rgba(8,1,15,.98)', mpgbord: 'rgba(255,28,235,.2)',
    imgRing: '0 0 0 2px #ff1ceb,0 0 12px rgba(255,28,235,.4)',
  });

  THEMES.vaporwave = makeCSS({
    bg: 'rgba(26,15,40,.95)', blur: 'blur(12px)', bord: '1px solid rgba(185,103,255,.3)',
    font: "'Courier New',monospace",
    brandC: '#ff71ce',
    tc: '#b967ff', tbg: 'rgba(185,103,255,.08)', tbord: '1px solid rgba(185,103,255,.25)',
    tHbg: 'rgba(255,113,206,.15)', tHbord: '1px solid rgba(255,113,206,.5)', tHc: '#ff71ce',
    tObg: 'rgba(185,103,255,.2)', tObord: '1px solid rgba(185,103,255,.6)',
    acc: '#ff71ce', accBord: 'rgba(255,113,206,.5)', accBg: 'rgba(255,113,206,.1)', accHbg: 'rgba(255,113,206,.2)',
    ddbg: 'rgba(20,10,35,.98)', ddbord: '1px solid rgba(185,103,255,.35)',
    ddshad: '0 8px 32px rgba(185,103,255,.3)',
    dc: '#9040b0', dHbg: 'rgba(185,103,255,.15)', dHc: '#ff71ce',
    mpbg: 'rgba(26,15,40,.98)', mpgbord: 'rgba(185,103,255,.25)',
    imgRing: '0 0 0 2px #ff71ce,0 0 12px rgba(255,113,206,.4)',
  });

  THEMES.matrix = makeCSS({
    bg: 'rgba(0,8,0,.97)', blur: '', bord: '1px solid rgba(0,255,0,.15)',
    font: "'Courier New',monospace",
    brandC: '#00ff00',
    tc: '#007700', tbg: 'transparent', tbord: '1px solid rgba(0,255,0,.15)',
    tHbg: 'rgba(0,255,0,.07)', tHbord: '1px solid rgba(0,255,0,.4)', tHc: '#00ff00',
    tObg: 'rgba(0,255,0,.12)', tObord: '1px solid rgba(0,255,0,.5)',
    acc: '#00ff00', accBord: 'rgba(0,255,0,.5)', accBg: 'rgba(0,255,0,.08)', accHbg: 'rgba(0,255,0,.15)',
    ddbg: 'rgba(0,4,0,.99)', ddbord: '1px solid rgba(0,255,0,.2)',
    dc: '#005500', dHbg: 'rgba(0,255,0,.1)', dHc: '#00ff00',
    mpbg: 'rgba(0,8,0,.99)', mpgbord: 'rgba(0,255,0,.15)',
    imgRing: '0 0 0 2px #00ff00,0 0 12px rgba(0,255,0,.4)',
  });

  THEMES.hud = makeCSS({
    bg: 'rgba(0,8,20,.97)', blur: 'blur(8px)', bord: '1px solid rgba(0,229,255,.2)',
    font: "'Courier New',monospace",
    brandC: '#00e5ff',
    tc: '#0070aa', tbg: 'rgba(0,229,255,.04)', tbord: '1px solid rgba(0,229,255,.15)',
    tHbg: 'rgba(0,229,255,.08)', tHbord: '1px solid rgba(0,229,255,.4)', tHc: '#00e5ff',
    tObg: 'rgba(0,229,255,.12)', tObord: '1px solid rgba(0,229,255,.6)',
    acc: '#00e5ff', accBord: 'rgba(0,229,255,.5)', accBg: 'rgba(0,229,255,.08)', accHbg: 'rgba(0,229,255,.16)',
    ddbg: 'rgba(0,5,15,.99)', ddbord: '1px solid rgba(0,229,255,.25)',
    ddshad: '0 8px 32px rgba(0,229,255,.2)',
    dc: '#005580', dHbg: 'rgba(0,229,255,.1)', dHc: '#00e5ff',
    mpbg: 'rgba(0,8,20,.99)', mpgbord: 'rgba(0,229,255,.15)',
    imgRing: '0 0 0 2px #00e5ff,0 0 12px rgba(0,229,255,.3)',
  });

  THEMES.newspaper = makeCSS({
    bg: '#f5f0e8', blur: '', bord: '2px solid #1a1a1a', shad: '0 2px 0 #1a1a1a',
    font: "Georgia,'Times New Roman',serif", pad: '.35rem .75rem', rad: '0', trans: 'none',
    brandC: '#1a1a1a',
    tc: '#2a2a2a', tbg: 'transparent', tbord: '1px solid #aaa',
    tHbg: '#e8e0cc', tHbord: '1px solid #666', tHc: '#000',
    tObg: '#ddd8c4', tObord: '1px solid #444',
    acc: '#8b0000', accBord: '#8b0000', accBg: 'rgba(139,0,0,.08)', accHbg: 'rgba(139,0,0,.15)',
    ddbg: '#f8f4ea', ddbord: '1px solid #aaa', drad: '0',
    ddshad: '2px 2px 0 rgba(0,0,0,.2)',
    dc: '#555', dHbg: '#e8e0cc', dHc: '#000',
    mpbg: '#f5f0e8', mpgbord: '#ccc',
    imgRing: '0 0 0 2px #8b0000',
    cpBg: '#e8e0cc', cpBord: '1px solid #aaa', cpC: '#555',
    cpHbg: '#ddd8c4', cpHc: '#000',
    cpOkBg: '#8b0000', cpOkC: '#fff', cpOkBord: '#600',
  });

  THEMES.teletext =
    'nav{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;' +
    'gap:2px;padding:2px 4px;background:#000;border-bottom:2px solid #fff;' +
    'font-family:\'Courier New\',monospace;}' +
    '.nav-brand{font-weight:700;font-size:.9rem;color:#ff0;margin-right:4px;' +
    'background:#f00;padding:2px 8px;text-decoration:none;flex-shrink:0;}' +
    '.nav-group{position:relative;flex-shrink:0}' +
    '.nav-trigger{display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:700;' +
    'padding:2px 6px;border-radius:0;cursor:pointer;white-space:nowrap;' +
    'color:#fff;border:none;background:#0000aa;' +
    'font-family:\'Courier New\',monospace;user-select:none;transition:none;}' +
    '.nav-trigger:hover{filter:brightness(1.3);}' +
    '.nav-trigger.open{outline:2px solid #fff;outline-offset:-2px;}' +
    '.nav-trigger.has-active{outline:2px solid #ff0;outline-offset:-2px;color:#ff0;}' +
    '.nav-trigger.has-active:hover{filter:brightness(1.15);}' +
    'nav>.nav-group:nth-child(2) .nav-trigger{background:#0000aa;}' +
    'nav>.nav-group:nth-child(3) .nav-trigger{background:#00aa00;}' +
    'nav>.nav-group:nth-child(4) .nav-trigger{background:#aa0000;}' +
    'nav>.nav-group:nth-child(5) .nav-trigger{background:#00aaaa;}' +
    'nav>.nav-group:nth-child(6) .nav-trigger{background:#aa00aa;}' +
    'nav>.nav-group:nth-child(7) .nav-trigger{background:#aaaa00;}' +
    'nav>.nav-group:nth-child(8) .nav-trigger{background:#0000aa;}' +
    'nav>.nav-group:nth-child(9) .nav-trigger{background:#00aa00;}' +
    'nav>.nav-group:nth-child(10) .nav-trigger{background:#aa0000;}' +
    'nav>.nav-group:nth-child(11) .nav-trigger{background:#00aaaa;}' +
    'nav>.nav-group:nth-child(12) .nav-trigger{background:#aa00aa;}' +
    'nav>.nav-group:nth-child(13) .nav-trigger{background:#aaaa00;}' +
    '.nav-caret{font-size:.55rem;opacity:.7;line-height:1}' +
    '.nav-trigger.open .nav-caret{transform:none}' +
    '.nav-dropdown{position:absolute;top:calc(100% + 2px);left:0;' +
    'background:#000;border:2px solid #fff;border-radius:0;' +
    'box-shadow:none;padding:2px;z-index:300;opacity:0;pointer-events:none;transition:none;}' +
    '.nav-dropdown.open{opacity:1;pointer-events:all;}' +
    '.nav-dropdown.wide{display:grid;grid-template-columns:1fr 1fr;gap:0;min-width:200px;}' +
    '.nav-dropdown.wider{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;min-width:300px;}' +
    '.nav-dropdown.active-only .nav-dd-item:not(.active){display:none;}' +
    '.nav-dropdown.active-only{display:block;min-width:0;width:auto;}' +
    '.nav-dd-item{display:flex;align-items:center;gap:6px;font-size:.73rem;font-weight:400;' +
    'color:#0ff;padding:3px 10px;border-radius:0;white-space:nowrap;' +
    'text-decoration:none;font-family:\'Courier New\',monospace;cursor:default;}' +
    '.nav-dd-item:hover{background:#00aaaa;color:#000;}' +
    '.nav-dd-item.active{color:#ff0;font-weight:700;}' +
    '.nav-dd-dot{width:4px;height:4px;flex-shrink:0;background:transparent;}' +
    '.nav-dd-item.active .nav-dd-dot{background:#ff0;}' +
    '@keyframes navpulse{0%,100%{opacity:1}50%{opacity:.4}}' +
    '.nav-hamburger{display:none;margin-left:auto;flex-shrink:0;cursor:pointer;' +
    'background:#0000aa;border:none;border-radius:0;padding:3px 8px;color:#fff;font-size:1rem;line-height:1;' +
    'font-family:\'Courier New\',monospace;user-select:none;transition:none;}' +
    '.nav-hamburger:hover{filter:brightness(1.3);}' +
    '.nav-hamburger.open{outline:2px solid #fff;}' +
    '.nav-mobile-panel{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:199;' +
    'background:#000;overflow-y:auto;padding-top:2.8rem;}' +
    '.nav-mobile-panel.open{display:block;}' +
    '.nav-mobile-group{border-bottom:1px solid #fff;}' +
    '.nav-mobile-label{display:flex;align-items:center;justify-content:space-between;' +
    'padding:7px 12px;font-size:.85rem;font-weight:700;color:#0ff;cursor:pointer;' +
    'font-family:\'Courier New\',monospace;user-select:none;}' +
    '.nav-mobile-label:active{background:#00aaaa;color:#000;}' +
    '.nav-mobile-label.active-group{color:#ff0;}' +
    '.nav-mobile-caret{font-size:.6rem;opacity:.6;transition:transform .15s;}' +
    '.nav-mobile-group.open .nav-mobile-caret{transform:rotate(180deg);}' +
    '.nav-mobile-apps{display:none;padding:4px 8px 8px;display:grid;grid-template-columns:1fr 1fr;gap:2px;}' +
    '.nav-mobile-group:not(.open) .nav-mobile-apps{display:none;}' +
    '.nav-mobile-group.open .nav-mobile-apps{display:grid;}' +
    '.nav-mobile-app{display:flex;align-items:center;gap:.4rem;padding:5px 8px;' +
    'border-radius:0;font-size:.78rem;font-weight:400;color:#0ff;' +
    'text-decoration:none;font-family:\'Courier New\',monospace;transition:none;}' +
    '.nav-mobile-app:hover,.nav-mobile-app:active{background:#00aaaa;color:#000;}' +
    '.nav-mobile-app.active{font-weight:700;color:#ff0;}' +
    '.nav-mobile-dot{width:4px;height:4px;flex-shrink:0;background:transparent;}' +
    '.nav-mobile-app.active .nav-mobile-dot{background:#ff0;}' +
    '@media(max-width:768px){.nav-group{display:none;}.nav-hamburger{display:inline-flex;align-items:center;}}' +
    '.sub-nav{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '.sub-nav::-webkit-scrollbar{display:none}' +
    'img[loading="lazy"]{cursor:zoom-in;transition:box-shadow .15s}' +
    'img[loading="lazy"]:hover{box-shadow:0 0 0 2px #ff0}' +
    '.nav-lb{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.9);' +
    'display:flex;align-items:center;justify-content:center;cursor:default;animation:nav-lbi .1s ease}' +
    '@keyframes nav-lbi{from{opacity:0}to{opacity:1}}' +
    '.nav-lb img{max-width:90vw;max-height:88vh;object-fit:contain;border:2px solid #fff;border-radius:0;' +
    'box-shadow:none;animation:nav-lbii .15s ease}' +
    '@keyframes nav-lbii{from{transform:scale(.95)}to{transform:none}}' +
    '.nav-lb-x{position:fixed;top:1rem;right:1.2rem;color:#fff;font-size:.75rem;font-weight:700;' +
    'cursor:pointer;background:#aa0000;border:none;border-radius:0;width:2rem;height:2rem;' +
    'display:flex;align-items:center;justify-content:center;' +
    'transition:none;user-select:none;font-family:\'Courier New\',monospace}' +
    '.nav-lb-x:hover{filter:brightness(1.3);}' +
    '.nav-lb-cap{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);' +
    'color:#0ff;font-size:.78rem;font-family:\'Courier New\',monospace;' +
    'text-align:center;max-width:80vw;pointer-events:none}' +
    '.nav-copy{position:absolute;top:.5rem;right:.5rem;font-size:.68rem;font-weight:400;' +
    'padding:2px 6px;border-radius:0;cursor:pointer;background:#0000aa;border:none;' +
    'color:#fff;font-family:\'Courier New\',monospace;transition:none;opacity:0;pointer-events:none}' +
    'pre:hover .nav-copy{opacity:1;pointer-events:auto}' +
    '.nav-copy:hover{filter:brightness(1.3);}' +
    '.nav-copy.ok{background:#00aa00;color:#fff;}';

  // ── Theme picker UI — always-applied, never overwritten ──────────────────────
  var pickerStyle = document.createElement('style');
  pickerStyle.textContent =
    '@keyframes navflash{0%{color:#00ff41}20%{color:#ff1ceb}40%{color:#00e5ff}60%{color:#ffb000}80%{color:#ff5555}100%{color:#00ff41}}' +
    '.nav-dd-featured{animation:navflash 2.4s linear infinite!important;font-weight:700!important;}' +
    '.nav-mobile-app.nav-dd-featured{animation:navflash 2.4s linear infinite!important;font-weight:700!important;}' +
    '.nav-theme-wrap{position:relative;margin-left:auto;flex-shrink:0}' +
    '.nav-theme-btn{display:inline-flex;align-items:center;padding:2px 8px;cursor:pointer;' +
    'font-size:.62rem;font-weight:600;color:inherit;opacity:.6;transition:opacity .15s;' +
    'font-family:inherit;background:transparent;border:none;user-select:none;white-space:nowrap;}' +
    '.nav-theme-btn:hover{opacity:1;}' +
    '.nav-theme-dd{position:absolute;right:0;top:calc(100% + 4px);background:#111;' +
    'border:1px solid #333;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.8);' +
    'padding:4px;z-index:500;min-width:140px;display:none;font-family:\'Courier New\',monospace;}' +
    '.nav-theme-dd.open{display:block;}' +
    '.nav-theme-opt{display:block;padding:4px 10px;border-radius:3px;font-size:.72rem;' +
    'color:#aaa;cursor:pointer;white-space:nowrap;}' +
    '.nav-theme-opt:hover{background:rgba(255,255,255,.1);color:#fff;}' +
    '.nav-theme-opt.cur{color:#fff;font-weight:700;}' +
    '.nav-theme-opt.cur::before{content:"✓ ";}';
  document.head.appendChild(pickerStyle);

  // ── Theme metadata ───────────────────────────────────────────────────────────
  var THEME_NAMES = ['dark','win95','dos','cga','amber','green','mac','c64','glass','neo','brutalist','neon','vaporwave','matrix','hud','newspaper','teletext'];
  var THEME_LABELS = {dark:'Dark',win95:'Win95',dos:'DOS',cga:'CGA',amber:'Amber',green:'Green',mac:'Macintosh',c64:'C64',glass:'Glass',neo:'Soft UI',brutalist:'Brutalist',neon:'Neon Noir',vaporwave:'Vaporwave',matrix:'Matrix',hud:'HUD',newspaper:'Newspaper',teletext:'Teletext'};
  var THEME_META   = {dark:'#0a0a0f',win95:'#c0c0c0',dos:'#000',cga:'#000',amber:'#0d0800',green:'#001a00',mac:'#dddddd',c64:'#3535a5',glass:'#1a1a2e',neo:'#e0e5ec',brutalist:'#fff',neon:'#08010f',vaporwave:'#1a0f28',matrix:'#000800',hud:'#000814',newspaper:'#f5f0e8',teletext:'#000'};
  var THEME_BAR    = {dark:'#00ff41',win95:'#000080',dos:'#ffff00',cga:'#ff55ff',amber:'#ffb000',green:'#00ff41',mac:'#000080',c64:'#c8c8ff',glass:'rgba(255,255,255,.5)',neo:'#4a7fe5',brutalist:'#ff0000',neon:'#ff1ceb',vaporwave:'#ff71ce',matrix:'#00ff00',hud:'#00e5ff',newspaper:'#8b0000',teletext:'#ff0'};

  // ── Theme state ──────────────────────────────────────────────────────────────
  var THEME_KEY = 'ximg-nav-theme';
  var currentTheme = localStorage.getItem(THEME_KEY) || 'dark';
  if (!THEMES[currentTheme]) currentTheme = 'dark';

  var styleEl = document.createElement('style');
  document.head.appendChild(styleEl);

  var scrollBar; // set below
  var themeBtn, themeDD;

  function applyTheme(t) {
    currentTheme = t;
    styleEl.textContent = THEMES[t];
    localStorage.setItem(THEME_KEY, t);
    if (scrollBar) scrollBar.style.background = THEME_BAR[t];
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', THEME_META[t]);
    if (themeBtn) themeBtn.textContent = (THEME_LABELS[t] || t) + ' ▾';
    if (themeDD) {
      themeDD.querySelectorAll('.nav-theme-opt').forEach(function (o) {
        o.classList.toggle('cur', o.dataset.theme === t);
      });
    }
  }

  applyTheme(currentTheme);

  // ── Nav element ──────────────────────────────────────────────────────────────
  var nav = document.createElement('nav');
  nav.innerHTML = '<a class="nav-brand" href="https://ximg.app">ximg.app</a>';

  var curHost = window.location.hostname;
  var curPath = window.location.pathname.split('/')[1] || '';

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
      item.className = 'nav-dd-item' + (isActive ? ' active' : '') + (subdomain === 'bundler-info' || subdomain === 'devtools-info' ? ' nav-dd-featured' : '');
      item.innerHTML = '<span class="nav-dd-dot"></span>' + label;
      item.href = appHref(subdomain);
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

  // ── Theme picker dropdown ────────────────────────────────────────────────────
  var themeWrap = document.createElement('div');
  themeWrap.className = 'nav-theme-wrap';

  themeBtn = document.createElement('button');
  themeBtn.className = 'nav-theme-btn';
  themeBtn.title = 'Switch nav theme';
  themeBtn.textContent = (THEME_LABELS[currentTheme] || currentTheme) + ' ▾';
  themeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = themeDD.classList.contains('open');
    closeAll();
    if (!isOpen) themeDD.classList.add('open');
  });

  themeDD = document.createElement('div');
  themeDD.className = 'nav-theme-dd';
  THEME_NAMES.forEach(function (name) {
    var opt = document.createElement('div');
    opt.className = 'nav-theme-opt' + (name === currentTheme ? ' cur' : '');
    opt.dataset.theme = name;
    opt.textContent = THEME_LABELS[name] || name;
    opt.addEventListener('click', function (e) {
      e.stopPropagation();
      applyTheme(name);
      themeDD.classList.remove('open');
    });
    themeDD.appendChild(opt);
  });

  themeWrap.appendChild(themeBtn);
  themeWrap.appendChild(themeDD);
  nav.appendChild(themeWrap);

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
      item.className = 'nav-mobile-app' + (isActive ? ' active' : '') + (subdomain === 'bundler-info' || subdomain === 'devtools-info' ? ' nav-dd-featured' : '');
      item.innerHTML = '<span class="nav-mobile-dot"></span>' + label;
      item.href = appHref(subdomain);
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
    if (themeDD) themeDD.classList.remove('open');
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
  setTimeout(function () {
    if (window.__tabPersist) return;
    window.__tabPersist = true;

    var pageKey = 'tab:' + location.hostname + location.pathname;

    function getTabId(el) {
      if (!el || !el.getAttribute) return null;
      if (el.dataset && el.dataset.tab) return el.dataset.tab;
      var href = el.getAttribute('href');
      if (href && href[0] === '#' && href.length > 1) return href.slice(1);
      var oc = el.getAttribute('onclick');
      if (oc) {
        var m = oc.match(/\(\s*['"]([^'"]+)['"]\s*\)/);
        if (m) return m[1];
      }
      return null;
    }

    var TAB_SEL = '.tab,.nav-tab,.tab-btn,.sub-nav-btn,.linux-tab,.sub-nav a[href^="#"],[data-tab]';

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
    }, true);

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

    setMeta({ name: 'theme-color', content: THEME_META[currentTheme] || '#0a0a0f' });

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
    scrollBar = document.createElement('div');
    scrollBar.style.cssText =
      'position:fixed;top:0;left:0;height:3px;width:0%;z-index:9999;pointer-events:none;' +
      'transition:width .07s linear';
    scrollBar.style.background = THEME_BAR[currentTheme] || '#00ff41';
    document.body.appendChild(scrollBar);
    function upd() {
      var s = document.documentElement.scrollTop || document.body.scrollTop;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      scrollBar.style.width = (h > 0 ? Math.min(100, s / h * 100) : 0) + '%';
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
      if ((img.naturalWidth || img.width) < 80) return;

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
