/* ═══════════════════════════════════════════════════════
   C&C BROWSER GAME  —  OpenRA-style RTS
   Vanilla JS + Canvas, no dependencies
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── constants ── */
  const TILE = 32, MAP_W = 80, MAP_H = 60;
  const G = 0, TIB = 1, WAT = 2, ROC = 3;
  const SCROLL_SPD = 280, EDGE = 18, HUD_H = 130;

  /* ── unit defs ── */
  const UDEFS = {
    soldier:   { name:'Rifle Soldier',  hp:80,  dmg:8,  range:3.5, atkRate:1.1, spd:65,  cost:100, trainTime:6,  sz:9,  infantry:true },
    rocket:    { name:'Rocket Soldier', hp:80,  dmg:28, range:5,   atkRate:2,   spd:55,  cost:200, trainTime:9,  sz:9,  infantry:true },
    tank:      { name:'Light Tank',     hp:350, dmg:42, range:4.5, atkRate:2.2, spd:50,  cost:500, trainTime:14, sz:18 },
    mammoth:   { name:'Mammoth Tank',   hp:800, dmg:85, range:5,   atkRate:3,   spd:30,  cost:1500,trainTime:28, sz:22 },
    harvester: { name:'Harvester',      hp:300, dmg:0,  range:0,   atkRate:0,   spd:38,  cost:0,   trainTime:0,  sz:18, isHarv:true },
    mcv:       { name:'MCV',            hp:600, dmg:0,  range:0,   atkRate:0,   spd:42,  cost:0,   trainTime:0,  sz:22, isMCV:true },
  };

  /* ── building defs ── */
  const BDEFS = {
    yard:     { name:'Construction Yard', hp:1000, w:3, h:3, cost:0,    pwr:-5,  col:'#1e3d12' },
    power:    { name:'Power Plant',       hp:400,  w:2, h:2, cost:300,  pwr:15,  col:'#12283d' },
    barracks: { name:'Barracks',          hp:500,  w:2, h:3, cost:400,  pwr:-5,  col:'#2d200a', trains:['soldier','rocket'] },
    factory:  { name:'War Factory',       hp:600,  w:3, h:2, cost:800,  pwr:-10, col:'#1e150a', trains:['tank','mammoth'] },
    refinery: { name:'Tib. Refinery',     hp:700,  w:3, h:3, cost:1000, pwr:-8,  col:'#122d0a' },
  };

  /* ── state ── */
  let canvas, ctx, bgCv, bgCtx;
  let map, units, buildings, effects, players;
  let uid = 0, tick = 0, lastTs = 0;
  let viewport = { x:0, y:0 };
  let keys = {}, mouse = { x:0, y:0, wx:0, wy:0, down:false, ds:null };
  let selected = new Set();
  let placing = null;
  let gameOver = false, gameOverMsg = '';
  let rafId = null;
  let bgDirty = true;
  let aiTimer = 0, aiAtkTimer = 0, aiBuildIdx = 0;
  const AI_ORDER = ['power','refinery','barracks','power','factory','power','barracks','factory'];

  /* ── helpers ── */
  const dist = (x1,y1,x2,y2) => Math.hypot(x2-x1, y2-y1);
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

  function findEnt(id) {
    for (const u of units) if (u.id===id) return u;
    for (const b of buildings) if (b.id===id) return b;
    return null;
  }
  function findBldg(type, pid) {
    return buildings.find(b=>b.type===type && b.playerId===pid && !b.dead);
  }
  function nearestTib(tx,ty) {
    let best=null, bd=Infinity;
    for (let y=0;y<MAP_H;y++) for (let x=0;x<MAP_W;x++) {
      if (map[y][x]===TIB) { const d=Math.abs(x-tx)+Math.abs(y-ty); if(d<bd){bd=d;best=[x,y];} }
    }
    return best;
  }

  /* ── A* pathfinding ── */
  function walkable(tx,ty) {
    if (tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return false;
    const t=map[ty][tx]; if(t===WAT||t===ROC) return false;
    for (const b of buildings) {
      if (!b.dead && tx>=b.tx && tx<b.tx+b.def.w && ty>=b.ty && ty<b.ty+b.def.h) return false;
    }
    return true;
  }

  function astar(sx,sy,ex,ey) {
    const key = (x,y) => y*MAP_W+x;
    const h   = (x,y) => Math.abs(x-ex)+Math.abs(y-ey);
    const open=new Map(), closed=new Set(), par=new Map(), g=new Map();
    open.set(key(sx,sy),{x:sx,y:sy,f:h(sx,sy)});
    g.set(key(sx,sy),0);
    let itr=0;
    while (open.size&&itr++<600) {
      let bk=null, bn=null;
      for (const [k,n] of open) if(!bn||n.f<bn.f){bk=k;bn=n;}
      if (bn.x===ex&&bn.y===ey) {
        const path=[[bn.x,bn.y]]; let cur=bk;
        while (par.has(cur)){cur=par.get(cur);path.unshift([cur%MAP_W,Math.floor(cur/MAP_W)]);}
        return path;
      }
      open.delete(bk); closed.add(bk);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx=bn.x+dx,ny=bn.y+dy,nk=key(nx,ny);
        if (!walkable(nx,ny)||closed.has(nk)) continue;
        const ng=(g.get(bk)||0)+(dx&&dy?1.4:1);
        if (!open.has(nk)||ng<(g.get(nk)||Infinity)) {
          g.set(nk,ng); par.set(nk,bk);
          open.set(nk,{x:nx,y:ny,f:ng+h(nx,ny)});
        }
      }
    }
    return null;
  }

  /* ── map generation ── */
  function genMap() {
    map=[];
    for (let y=0;y<MAP_H;y++){map[y]=[];for(let x=0;x<MAP_W;x++)map[y][x]=G;}

    // Rock blobs
    for (let i=0;i<10;i++) {
      const cx=15+Math.floor(Math.random()*(MAP_W-30)), cy=10+Math.floor(Math.random()*(MAP_H-20));
      const r=2+Math.floor(Math.random()*3);
      for (let y=cy-r;y<=cy+r;y++) for (let x=cx-r;x<=cx+r;x++) {
        if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&Math.random()<0.6) map[y][x]=ROC;
      }
    }
    // Water pools
    for (let i=0;i<4;i++) {
      const cx=20+Math.floor(Math.random()*(MAP_W-40)), cy=15+Math.floor(Math.random()*(MAP_H-30));
      const r=3+Math.floor(Math.random()*4);
      for (let y=cy-r;y<=cy+r;y++) for (let x=cx-r;x<=cx+r;x++) {
        if(Math.hypot(x-cx,y-cy)<r&&x>=0&&y>=0&&x<MAP_W&&y<MAP_H) map[y][x]=WAT;
      }
    }
    // Tiberium fields
    for (let i=0;i<14;i++) {
      const cx=10+Math.floor(Math.random()*(MAP_W-20)), cy=8+Math.floor(Math.random()*(MAP_H-16));
      if((cx<16&&cy<16)||(cx>MAP_W-16&&cy>MAP_H-16)) continue;
      const r=2+Math.floor(Math.random()*4);
      for (let y=cy-r;y<=cy+r;y++) for (let x=cx-r;x<=cx+r;x++) {
        if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&map[y][x]===G&&Math.random()<0.7) map[y][x]=TIB;
      }
    }
    // Clear starting zones
    clear(2,2,13,13); clear(MAP_W-14,MAP_H-14,MAP_W-2,MAP_H-2);
  }
  function clear(x1,y1,x2,y2){
    for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H)map[y][x]=G;
  }

  /* ── Unit ── */
  class Unit {
    constructor(type,pid,wx,wy){
      this.id=uid++; this.type=type; this.def=UDEFS[type];
      this.playerId=pid; this.x=wx; this.y=wy;
      this.hp=this.def.hp; this.maxHp=this.def.hp;
      this.state='idle'; this.path=null; this.pi=0;
      this.target=null; this.atk=0;
      this.angle=0; this.dead=false;
      this.harvLoad=0; this.harvTimer=0;
    }
    get tx(){return Math.floor(this.x/TILE);}
    get ty(){return Math.floor(this.y/TILE);}

    moveTo(wx,wy){
      const p=astar(this.tx,this.ty,Math.floor(wx/TILE),Math.floor(wy/TILE));
      this.path=p||[[Math.floor(wx/TILE),Math.floor(wy/TILE)]];
      this.pi=0; this.state='moving'; this.target=null;
    }
    cmdAttack(id){this.target=id;this.state='attacking';this.path=null;}

    update(dt){
      if(this.dead)return;
      if(this.atk>0)this.atk-=dt;
      if(this.def.isMCV){if(this.state==='moving')this._move(dt);return;}
      if(this.def.isHarv){this._harv(dt);return;}
      if(this.state==='idle'||this.state==='moving')this._autoAtk();
      if(this.state==='moving')this._move(dt);
      else if(this.state==='attacking')this._doAtk(dt);
    }

    _autoAtk(){
      if(!this.def.dmg)return;
      const rng=this.def.range*TILE; let best=null,bd=Infinity;
      for(const e of [...units,...buildings]){
        if(e.dead||e.playerId===this.playerId)continue;
        const ex=e.x!==undefined?e.x:(e.tx+e.def.w/2)*TILE;
        const ey=e.y!==undefined?e.y:(e.ty+e.def.h/2)*TILE;
        const d=dist(this.x,this.y,ex,ey);
        if(d<rng&&d<bd){bd=d;best=e;}
      }
      if(best){this.target=best.id;this.state='attacking';}
    }

    _move(dt){
      if(!this.path||this.pi>=this.path.length){this.state='idle';return;}
      const [tx,ty]=this.path[this.pi];
      const wx=tx*TILE+TILE/2, wy=ty*TILE+TILE/2;
      const dx=wx-this.x, dy=wy-this.y, d=Math.hypot(dx,dy);
      this.angle=Math.atan2(dy,dx);
      if(d<3){this.pi++;if(this.pi>=this.path.length){this.state='idle';this.path=null;}}
      else{this.x+=dx/d*this.def.spd*dt;this.y+=dy/d*this.def.spd*dt;}
    }

    _doAtk(dt){
      const t=findEnt(this.target);
      if(!t||t.dead){this.target=null;this.state='idle';return;}
      const tx=t.x!==undefined?t.x:(t.tx+t.def.w/2)*TILE;
      const ty_=t.y!==undefined?t.y:(t.ty+t.def.h/2)*TILE;
      const d=dist(this.x,this.y,tx,ty_), rng=this.def.range*TILE;
      if(d>rng*1.15){
        if(!this.path||tick%90===0){
          const p=astar(this.tx,this.ty,Math.floor(tx/TILE),Math.floor(ty_/TILE));
          if(p){this.path=p;this.pi=0;}
        }
        this._move(dt);
      } else {
        this.path=null;
        this.angle=Math.atan2(ty_-this.y,tx-this.x);
        if(this.atk<=0){
          this.atk=this.def.atkRate;
          t.takeDamage(this.def.dmg);
          effects.push({x:this.x,y:this.y,tx,ty:ty_,life:0.12,col:players[this.playerId].color});
        }
      }
    }

    _harv(dt){
      if(this.state==='idle'){
        const tb=nearestTib(this.tx,this.ty);
        if(tb){this.moveTo(tb[0]*TILE+TILE/2,tb[1]*TILE+TILE/2);this.state='h-move';}
      } else if(this.state==='h-move'){
        this._move(dt);
        if(this.state==='idle'){
          const t=map[this.ty]?.[this.tx];
          this.state=(t===TIB)?'h-dig':'idle';
          if(this.state==='h-dig')this.harvTimer=2.5;
        }
      } else if(this.state==='h-dig'){
        this.harvTimer-=dt;
        if(this.harvTimer<=0){
          if(map[this.ty]?.[this.tx]===TIB){map[this.ty][this.tx]=G;bgDirty=true;this.harvLoad=500;}
          const ref=findBldg('refinery',this.playerId);
          if(ref){this.moveTo((ref.tx+1)*TILE,(ref.ty+1)*TILE);this.state='h-ret';}
          else this.state='idle';
        }
      } else if(this.state==='h-ret'){
        this._move(dt);
        if(this.state==='idle'){players[this.playerId].credits+=this.harvLoad;this.harvLoad=0;this.state='idle';}
      }
    }

    takeDamage(n){this.hp-=n;if(this.hp<=0){this.hp=0;this.dead=true;}}

    draw(cx,vy){
      const sx=this.x-viewport.x, sy=this.y-viewport.y;
      const sz=this.def.sz, col=players[this.playerId].color, sel=selected.has(this.id);
      cx.save(); cx.translate(sx,sy);
      if(sel){cx.beginPath();cx.arc(0,0,sz/2+4,0,Math.PI*2);cx.strokeStyle=col;cx.lineWidth=2;cx.stroke();}
      if(this.def.isHarv){
        cx.fillStyle=col;cx.fillRect(-sz/2,-sz/2,sz,sz);
        cx.fillStyle='rgba(0,0,0,.35)';cx.fillRect(-sz/2+3,-sz/2+3,sz-6,sz-6);
        if(this.harvLoad>0){cx.fillStyle='#4aff2a';cx.font='7px monospace';cx.textAlign='center';cx.fillText('$',0,3);}
      } else if(this.def.infantry){
        cx.fillStyle=col;cx.beginPath();cx.arc(0,0,sz/2,0,Math.PI*2);cx.fill();
        cx.fillStyle='rgba(0,0,0,.5)';cx.beginPath();cx.arc(Math.cos(this.angle)*sz/3,Math.sin(this.angle)*sz/3,2,0,Math.PI*2);cx.fill();
      } else {
        cx.rotate(this.angle);
        cx.fillStyle=col;cx.fillRect(-sz/2,-sz/2.5,sz,sz*0.8);
        cx.fillStyle='rgba(0,0,0,.3)';cx.fillRect(-sz/6,-sz/6,sz*0.65,sz/3);
        if(this.type==='mammoth'){cx.fillStyle=col;cx.fillRect(-sz/2,-sz/2,sz/5,sz);cx.fillRect(sz/3,-sz/2,sz/5,sz);}
      }
      if(this.def.isMCV&&this.playerId===0){
        cx.fillStyle='#fff';cx.font='8px monospace';cx.textAlign='center';cx.fillText('MCV',0,sz/2+10);
      }
      cx.restore();
      if(this.hp<this.maxHp){
        cx.fillStyle='#400';cx.fillRect(sx-sz/2,sy-sz/2-7,sz,4);
        cx.fillStyle=this.hp/this.maxHp>.5?'#0f0':this.hp/this.maxHp>.25?'#ff0':'#f00';
        cx.fillRect(sx-sz/2,sy-sz/2-7,sz*(this.hp/this.maxHp),4);
      }
    }
  }

  /* ── Building ── */
  class Building {
    constructor(type,pid,tx,ty){
      this.id=uid++; this.type=type; this.def=BDEFS[type];
      this.playerId=pid; this.tx=tx; this.ty=ty;
      this.hp=this.def.hp; this.maxHp=this.def.hp;
      this.dead=false; this.queue=[]; this.dead=false;
    }
    get x(){return(this.tx+this.def.w/2)*TILE;}
    get y(){return(this.ty+this.def.h/2)*TILE;}

    enqueue(t){if(this.queue.length<4)this.queue.push({type:t,prog:0});}

    update(dt){
      if(this.dead)return;
      if(this.queue.length&&players[this.playerId].power>=0){
        const it=this.queue[0]; it.prog+=dt;
        if(it.prog>=UDEFS[it.type].trainTime){
          this.queue.shift();
          const sx=(this.tx+this.def.w+0.5)*TILE, sy=(this.ty+Math.floor(this.def.h/2)+0.5)*TILE;
          spawnUnit(it.type,this.playerId,sx,sy);
        }
      }
    }
    takeDamage(n){this.hp-=n;if(this.hp<=0){this.hp=0;this.dead=true;recalcPwr(this.playerId);}}

    draw(cx){
      const sx=this.tx*TILE-viewport.x, sy=this.ty*TILE-viewport.y;
      const pw=this.def.w*TILE, ph=this.def.h*TILE;
      const col=players[this.playerId].color, sel=selected.has(this.id);
      cx.fillStyle=this.def.col; cx.fillRect(sx,sy,pw,ph);
      cx.strokeStyle=sel?col:'rgba(255,255,255,.12)'; cx.lineWidth=sel?2:1; cx.strokeRect(sx,sy,pw,ph);
      cx.fillStyle=col; cx.fillRect(sx,sy,pw,3);
      cx.fillStyle='rgba(255,255,255,.7)'; cx.font=`${Math.min(9,pw/5)}px monospace`;
      cx.textAlign='center'; cx.fillText(this.def.name,sx+pw/2,sy+ph/2+3);
      if(this.hp<this.maxHp){
        cx.fillStyle='#400';cx.fillRect(sx,sy+ph+2,pw,4);
        cx.fillStyle=this.hp/this.maxHp>.5?'#0f0':this.hp/this.maxHp>.25?'#ff0':'#f00';
        cx.fillRect(sx,sy+ph+2,pw*(this.hp/this.maxHp),4);
      }
      if(this.queue.length){
        const p=this.queue[0].prog/UDEFS[this.queue[0].type].trainTime;
        cx.fillStyle='rgba(74,255,42,.14)'; cx.fillRect(sx,sy,pw*p,ph);
      }
    }
  }

  /* ── placement ── */
  function canPlace(type,tx,ty,pid){
    const d=BDEFS[type];
    if(tx<0||ty<0||tx+d.w>MAP_W||ty+d.h>MAP_H)return false;
    for(let y=ty;y<ty+d.h;y++)for(let x=tx;x<tx+d.w;x++){
      if(map[y][x]!==G)return false;
      for(const b of buildings)if(!b.dead&&x>=b.tx&&x<b.tx+b.def.w&&y>=b.ty&&y<b.ty+b.def.h)return false;
    }
    // must be near own building
    const cx=tx+d.w/2, cy=ty+d.h/2;
    for(const b of buildings){
      if(b.playerId!==pid||b.dead)continue;
      if(Math.abs(b.tx+b.def.w/2-cx)+Math.abs(b.ty+b.def.h/2-cy)<9)return true;
    }
    return false;
  }

  function doPlace(type,tx,ty){
    const d=BDEFS[type];
    if(players[0].credits<d.cost||!canPlace(type,tx,ty,0))return false;
    players[0].credits-=d.cost;
    const b=new Building(type,0,tx,ty); buildings.push(b); recalcPwr(0);
    if(type==='refinery')spawnUnit('harvester',0,(b.tx+b.def.w+0.5)*TILE,(b.ty+1.5)*TILE);
    bgDirty=true; return true;
  }

  function deployMCV(u){
    const tx=u.tx-1, ty=u.ty-1;
    if(!canPlace('yard',tx,ty,0))return false;
    u.dead=true; buildings.push(new Building('yard',0,tx,ty)); recalcPwr(0); bgDirty=true; return true;
  }

  function recalcPwr(pid){
    let p=0; for(const b of buildings)if(b.playerId===pid&&!b.dead)p+=b.def.pwr;
    players[pid].power=p;
  }

  function spawnUnit(type,pid,wx,wy){
    const u=new Unit(type,pid,wx,wy); units.push(u); return u;
  }

  /* ── AI ── */
  function updateAI(dt){
    const ai=players[1];
    aiTimer-=dt; aiAtkTimer-=dt;
    if(aiTimer>0)return; aiTimer=0.6;

    const cy=findBldg('yard',1); if(!cy)return;

    // build next in order
    if(aiBuildIdx<AI_ORDER.length){
      const next=AI_ORDER[aiBuildIdx], def=BDEFS[next];
      if(ai.credits>=def.cost){
        const pos=aiFindPos(next);
        if(pos){
          ai.credits-=def.cost;
          const b=new Building(next,1,pos[0],pos[1]); buildings.push(b); recalcPwr(1);
          if(next==='refinery')spawnUnit('harvester',1,(b.tx-1.5)*TILE,(b.ty+1.5)*TILE);
          aiBuildIdx++;
        }
      }
    }

    // train units
    const bars=buildings.filter(b=>b.type==='barracks'&&b.playerId===1&&!b.dead);
    const facs=buildings.filter(b=>b.type==='factory'&&b.playerId===1&&!b.dead);
    if(bars.length&&ai.credits>=UDEFS.soldier.cost&&bars[0].queue.length<3){ai.credits-=UDEFS.soldier.cost;bars[0].enqueue('soldier');}
    if(facs.length&&ai.credits>=UDEFS.tank.cost&&facs[0].queue.length<2){ai.credits-=UDEFS.tank.cost;facs[0].enqueue('tank');}

    // attack
    if(aiAtkTimer<=0){
      const arm=units.filter(u=>u.playerId===1&&!u.dead&&u.def.dmg>0);
      if(arm.length>=6){
        aiAtkTimer=40+Math.random()*30;
        const tgt=findBldg('yard',0)||buildings.find(b=>b.playerId===0&&!b.dead);
        if(tgt)arm.forEach(u=>u.cmdAttack(tgt.id));
      } else aiAtkTimer=5;
    }
  }

  function aiFindPos(type){
    const cy=findBldg('yard',1); if(!cy)return null;
    const def=BDEFS[type], ox=cy.tx+1, oy=cy.ty+1;
    for(let r=3;r<16;r++){
      for(let a=0;a<Math.PI*2;a+=0.35){
        const tx=Math.round(ox+Math.cos(a)*r-def.w/2);
        const ty=Math.round(oy+Math.sin(a)*r-def.h/2);
        if(canPlace(type,tx,ty,1))return[tx,ty];
      }
    }
    return null;
  }

  /* ── effects ── */
  function drawEffects(){
    for(const e of effects){
      ctx.beginPath(); ctx.moveTo(e.x-viewport.x,e.y-viewport.y);
      ctx.lineTo(e.tx-viewport.x,e.ty-viewport.y);
      ctx.strokeStyle=e.col; ctx.lineWidth=1.5;
      ctx.globalAlpha=Math.min(1,e.life*8); ctx.stroke(); ctx.globalAlpha=1;
    }
  }

  /* ── background canvas ── */
  function renderBg(){
    if(!bgDirty)return; bgDirty=false;
    const c=bgCtx;
    for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
      const t=map[y][x];
      c.fillStyle=t===TIB?'#162e0a':t===WAT?'#0a1520':t===ROC?'#14140e':'#18250a';
      c.fillRect(x*TILE,y*TILE,TILE,TILE);
      if(t===TIB){
        c.fillStyle='#3ee820';
        for(let i=0;i<5;i++){
          const cx=x*TILE+4+(i%3)*9+Math.sin(x*5+y*3+i)*2;
          const cy=y*TILE+5+(Math.floor(i/3))*14+Math.cos(x*3+y*5+i)*2;
          c.fillRect(cx,cy,4,7);
        }
        c.fillStyle='rgba(74,255,42,.15)'; c.fillRect(x*TILE,y*TILE,TILE,TILE);
      }
      c.fillStyle='rgba(0,0,0,.06)'; c.fillRect(x*TILE,y*TILE,1,TILE); c.fillRect(x*TILE,y*TILE,TILE,1);
    }
  }

  /* ── HUD ── */
  function updateHUD(){
    const cr=document.getElementById('g-credits'), pw=document.getElementById('g-power');
    if(cr)cr.textContent=`$ ${players[0].credits}`;
    if(pw){pw.textContent=`PWR ${players[0].power>=0?'+':''}${players[0].power}`;pw.style.color=players[0].power<0?'#f55':'#4f4';}

    const nameEl=document.getElementById('g-sel-name'), hpEl=document.getElementById('g-sel-hp');
    if(selected.size===1){
      const e=findEnt([...selected][0]);
      if(e&&nameEl)nameEl.textContent=e.def.name;
      if(e&&hpEl){hpEl.style.width=`${e.hp/e.maxHp*100}%`;hpEl.style.background=e.hp/e.maxHp>.5?'#0f0':e.hp/e.maxHp>.25?'#ff0':'#f00';}
    } else if(nameEl){nameEl.textContent=selected.size>1?`${selected.size} selected`:'';if(hpEl)hpEl.style.width='0';}

    updateBuildPanel();
    updateTrainPanel();
  }

  function updateBuildPanel(){
    const el=document.getElementById('g-build-btns'); if(!el)return;
    const hasCY=findBldg('yard',0);
    const existing={};
    for(const b of buildings)if(b.playerId===0&&!b.dead)existing[b.type]=(existing[b.type]||0)+1;
    let h='';
    if(hasCY){
      ['power','barracks','factory','refinery'].forEach(t=>{
        const d=BDEFS[t], can=players[0].credits>=d.cost;
        h+=`<button class="g-btn${can?'':' off'}" onclick="cncGame.build('${t}')" title="${d.name} ($${d.cost})">${d.name.split(' ').slice(-1)[0]}<br><small>$${d.cost}</small></button>`;
      });
    }
    const mcv=[...selected].map(id=>findEnt(id)).find(e=>e&&!e.dead&&e instanceof Unit&&e.def?.isMCV);
    if(mcv)h+=`<button class="g-btn" onclick="cncGame.deploy()">DEPLOY</button>`;
    el.innerHTML=h||'<span class="g-hint">Build Construction Yard first</span>';
  }

  function updateTrainPanel(){
    const el=document.getElementById('g-train-btns'); if(!el)return;
    const sb=[...selected].map(id=>findEnt(id)).find(e=>e&&!e.dead&&e instanceof Building&&e.playerId===0&&e.def.trains);
    let h='';
    if(sb){
      sb.def.trains.forEach(t=>{
        const d=UDEFS[t], can=players[0].credits>=d.cost;
        h+=`<button class="g-btn${can?'':' off'}" onclick="cncGame.train('${t}')" title="${d.name} ($${d.cost})">${d.name.split(' ').slice(-1)[0]}<br><small>$${d.cost}</small></button>`;
      });
      if(sb.queue.length){
        const it=sb.queue[0],p=it.prog/UDEFS[it.type].trainTime;
        h+=`<div class="g-prog-wrap"><div class="g-prog" style="width:${p*100}%"></div><span>${UDEFS[it.type].name}</span></div>`;
      }
    }
    el.innerHTML=h||'<span class="g-hint">Select Barracks or Factory</span>';
  }

  /* ── minimap ── */
  function drawMinimap(){
    const mc=document.getElementById('g-minimap'); if(!mc)return;
    const mc2=mc.getContext('2d'), mw=mc.width, mh=mc.height;
    const sx=mw/(MAP_W*TILE), sy=mh/(MAP_H*TILE);
    mc2.fillStyle='#0a1205'; mc2.fillRect(0,0,mw,mh);
    for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
      const t=map[y][x];
      if(t===TIB)mc2.fillStyle='#2a8a0a';
      else if(t===WAT)mc2.fillStyle='#0a2040';
      else if(t===ROC)mc2.fillStyle='#222218';
      else continue;
      mc2.fillRect(x*TILE*sx,y*TILE*sy,Math.ceil(TILE*sx)+1,Math.ceil(TILE*sy)+1);
    }
    for(const b of buildings){if(b.dead)continue;mc2.fillStyle=players[b.playerId].color;mc2.fillRect(b.tx*TILE*sx,b.ty*TILE*sy,b.def.w*TILE*sx*2,b.def.h*TILE*sy*2);}
    for(const u of units){if(u.dead)continue;mc2.fillStyle=players[u.playerId].color;mc2.fillRect(u.x*sx-1,u.y*sy-1,3,3);}
    // viewport rect
    mc2.strokeStyle='rgba(255,255,255,.5)'; mc2.lineWidth=1;
    mc2.strokeRect(viewport.x*sx,viewport.y*sy,canvas.width*sx,(canvas.height-HUD_H)*sy);
    // minimap click to pan
    mc._sx=sx; mc._sy=sy;
  }

  /* ── input ── */
  function setupInput(){
    canvas.addEventListener('mousedown',onDown);
    canvas.addEventListener('mousemove',onMove);
    canvas.addEventListener('mouseup',onUp);
    canvas.addEventListener('contextmenu',e=>{e.preventDefault();onRight(e);});
    document.getElementById('g-minimap').addEventListener('click',e=>{
      const mc=document.getElementById('g-minimap'), r=mc.getBoundingClientRect();
      const mx=e.clientX-r.left, my=e.clientY-r.top;
      if(!mc._sx)return;
      viewport.x=clamp(mx/mc._sx-canvas.width/2,0,MAP_W*TILE-canvas.width);
      viewport.y=clamp(my/mc._sy-(canvas.height-HUD_H)/2,0,MAP_H*TILE-(canvas.height-HUD_H));
    });
    window.addEventListener('keydown',e=>{
      keys[e.key]=true;
      if(e.key==='Escape'){placing=null;selected.clear();}
      if((e.key==='r'||e.key==='R')&&gameOver)restart();
    });
    window.addEventListener('keyup',e=>{keys[e.key]=false;});
  }

  const s2w=(sx,sy)=>({x:sx+viewport.x,y:sy+viewport.y});

  function onDown(e){
    if(e.button!==0)return;
    const r=canvas.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
    if(sy>canvas.height-HUD_H)return;
    if(placing){
      const {x,y}=s2w(sx,sy);
      const tx=Math.floor(x/TILE)-Math.floor(BDEFS[placing].w/2);
      const ty=Math.floor(y/TILE)-Math.floor(BDEFS[placing].h/2);
      doPlace(placing,tx,ty); placing=null;
    } else {mouse.down=true;mouse.ds={sx,sy};}
  }

  function onMove(e){
    const r=canvas.getBoundingClientRect();
    mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top;
    const w=s2w(mouse.x,mouse.y); mouse.wx=w.x; mouse.wy=w.y;
  }

  function onUp(e){
    if(!mouse.down){return;}mouse.down=false;
    const r=canvas.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
    if(!mouse.ds)return;
    const dx=sx-mouse.ds.sx, dy=sy-mouse.ds.sy;
    if(Math.abs(dx)>5||Math.abs(dy)>5){
      // box select
      const x1=Math.min(mouse.ds.sx,sx)+viewport.x, y1=Math.min(mouse.ds.sy,sy)+viewport.y;
      const x2=Math.max(mouse.ds.sx,sx)+viewport.x, y2=Math.max(mouse.ds.sy,sy)+viewport.y;
      selected.clear();
      for(const u of units){if(u.dead||u.playerId!==0)continue;if(u.x>=x1&&u.x<=x2&&u.y>=y1&&u.y<=y2)selected.add(u.id);}
    } else {
      const wx=sx+viewport.x, wy=sy+viewport.y; selected.clear();
      let hit=null;
      for(const u of units){if(u.dead||u.playerId!==0)continue;if(dist(wx,wy,u.x,u.y)<u.def.sz+3){hit=u;break;}}
      if(!hit)for(const b of buildings){if(b.dead||b.playerId!==0)continue;if(wx>=b.tx*TILE&&wx<(b.tx+b.def.w)*TILE&&wy>=b.ty*TILE&&wy<(b.ty+b.def.h)*TILE){hit=b;break;}}
      if(hit)selected.add(hit.id);
    }
    mouse.ds=null;
  }

  function onRight(e){
    placing=null;
    if(!selected.size)return;
    const r=canvas.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
    const wx=sx+viewport.x, wy=sy+viewport.y;
    let enemy=null;
    for(const u of units){if(u.dead||u.playerId===0)continue;if(dist(wx,wy,u.x,u.y)<u.def.sz+5){enemy=u;break;}}
    if(!enemy)for(const b of buildings){if(b.dead||b.playerId===0)continue;if(wx>=b.tx*TILE&&wx<(b.tx+b.def.w)*TILE&&wy>=b.ty*TILE&&wy<(b.ty+b.def.h)*TILE){enemy=b;break;}}
    const sel=[...selected].map(id=>findEnt(id)).filter(e=>e&&!e.dead&&e instanceof Unit&&e.playerId===0);
    if(enemy){sel.forEach(u=>{if(u.def.dmg>0)u.cmdAttack(enemy.id);});}
    else{sel.forEach((u,i)=>{const c=i%4,row=Math.floor(i/4);u.moveTo(wx+(c-1.5)*TILE*.9,wy+(row-.5)*TILE*.9);});}
  }

  /* ── camera ── */
  function updateCam(dt){
    const maxX=MAP_W*TILE-canvas.width, maxY=MAP_H*TILE-(canvas.height-HUD_H);
    let dx=0,dy=0;
    if(keys['ArrowLeft']||keys['a']||keys['A']||mouse.x<EDGE)dx=-1;
    if(keys['ArrowRight']||keys['d']||keys['D']||mouse.x>canvas.width-EDGE)dx=1;
    if(keys['ArrowUp']||keys['w']||keys['W']||mouse.y<EDGE)dy=-1;
    if(keys['ArrowDown']||keys['s']||keys['S']||mouse.y>canvas.height-HUD_H-EDGE)dy=1;
    viewport.x=clamp(viewport.x+dx*SCROLL_SPD*dt,0,maxX);
    viewport.y=clamp(viewport.y+dy*SCROLL_SPD*dt,0,maxY);
  }

  /* ── render ── */
  function render(){
    const W=canvas.width, H=canvas.height-HUD_H;
    ctx.clearRect(0,0,W,canvas.height);
    renderBg();
    ctx.drawImage(bgCv,viewport.x,viewport.y,W,H,0,0,W,H);
    for(const b of buildings)if(!b.dead)b.draw(ctx);
    for(const u of units)if(!u.dead)u.draw(ctx);
    drawEffects();

    // selection box
    if(mouse.down&&mouse.ds&&!placing){
      const sx1=mouse.ds.sx,sy1=mouse.ds.sy,sx2=mouse.x,sy2=mouse.y;
      ctx.strokeStyle='#4aff2a';ctx.lineWidth=1;
      ctx.strokeRect(Math.min(sx1,sx2),Math.min(sy1,sy2),Math.abs(sx2-sx1),Math.abs(sy2-sy1));
      ctx.fillStyle='rgba(74,255,42,.04)';
      ctx.fillRect(Math.min(sx1,sx2),Math.min(sy1,sy2),Math.abs(sx2-sx1),Math.abs(sy2-sy1));
    }

    // placement ghost
    if(placing){
      const def=BDEFS[placing];
      const tx=Math.floor(mouse.wx/TILE)-Math.floor(def.w/2);
      const ty=Math.floor(mouse.wy/TILE)-Math.floor(def.h/2);
      const ok=canPlace(placing,tx,ty,0);
      const sx=tx*TILE-viewport.x, sy=ty*TILE-viewport.y;
      ctx.fillStyle=ok?'rgba(74,255,42,.25)':'rgba(255,50,50,.25)';ctx.fillRect(sx,sy,def.w*TILE,def.h*TILE);
      ctx.strokeStyle=ok?'#4aff2a':'#f55';ctx.lineWidth=2;ctx.strokeRect(sx,sy,def.w*TILE,def.h*TILE);
      ctx.fillStyle='#fff';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText(def.name,sx+def.w*TILE/2,sy+def.h*TILE/2);
    }

    // game over
    if(gameOver){
      ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(0,0,W,H);
      ctx.fillStyle=gameOverMsg.includes('VICTORY')?'#4aff2a':'#ff4422';
      ctx.font='bold 2rem monospace';ctx.textAlign='center';ctx.fillText(gameOverMsg,W/2,H/2-18);
      ctx.fillStyle='#aaa';ctx.font='1rem monospace';ctx.fillText('Press R to restart',W/2,H/2+18);
    }
  }

  /* ── update ── */
  function update(dt){
    tick++;
    updateCam(dt);
    if(!gameOver){
      for(const u of units)u.update(dt);
      units=units.filter(u=>!u.dead);
      buildings=buildings.filter(b=>{if(b.dead){recalcPwr(b.playerId);return false;}b.update(dt);return true;});
      effects=effects.filter(e=>{e.life-=dt;return e.life>0;});
      updateAI(dt);
      if(tick%60===0){
        if(!findBldg('yard',0)&&!units.find(u=>u.playerId===0&&u.def.isMCV)){gameOver=true;gameOverMsg='DEFEAT — Your base has been destroyed';}
        if(!findBldg('yard',1)&&!units.find(u=>u.playerId===1&&u.def.dmg>0)&&buildings.filter(b=>b.playerId===1&&!b.dead).length===0){gameOver=true;gameOverMsg='VICTORY — Enemy eliminated!';}
      }
    }
    if(tick%8===0)updateHUD();
    if(tick%4===0)drawMinimap();
  }

  /* ── loop ── */
  function loop(ts){
    const dt=Math.min((ts-lastTs)/1000,.05); lastTs=ts;
    update(dt); render();
    rafId=requestAnimationFrame(loop);
  }

  /* ── init / restart ── */
  function init(){
    canvas=document.getElementById('g-canvas'); ctx=canvas.getContext('2d');
    bgCv=document.createElement('canvas'); bgCv.width=MAP_W*TILE; bgCv.height=MAP_H*TILE;
    bgCtx=bgCv.getContext('2d');
    function resize(){const w=document.getElementById('g-wrap');canvas.width=w.clientWidth;canvas.height=w.clientHeight;}
    resize(); window.addEventListener('resize',resize);
    setupInput(); reset();
    lastTs=performance.now(); rafId=requestAnimationFrame(loop);
  }

  function reset(){
    units=[]; buildings=[]; effects=[]; selected.clear(); placing=null;
    uid=0; tick=0; gameOver=false; gameOverMsg='';
    aiTimer=0; aiAtkTimer=20; aiBuildIdx=0; bgDirty=true;
    viewport={x:0,y:0};
    genMap();
    players=[
      {id:0,isHuman:true, color:'#4aff2a',credits:2000,power:0},
      {id:1,isHuman:false,color:'#ff9900',credits:2000,power:0},
    ];
    // Player: MCV top-left
    spawnUnit('mcv',0,6.5*TILE,6.5*TILE);
    // AI: pre-built yard + harvester bottom-right
    buildings.push(new Building('yard',1,MAP_W-11,MAP_H-11));
    recalcPwr(1);
    spawnUnit('harvester',1,(MAP_W-7)*TILE,(MAP_H-9)*TILE);
    updateHUD();
  }

  function restart(){if(rafId)cancelAnimationFrame(rafId);reset();lastTs=performance.now();rafId=requestAnimationFrame(loop);}

  /* ── public API ── */
  window.cncGame={
    start:init,
    stop:()=>{if(rafId)cancelAnimationFrame(rafId);rafId=null;},
    build:t=>{placing=t;},
    deploy:()=>{const m=[...selected].map(id=>findEnt(id)).find(e=>e&&!e.dead&&e instanceof Unit&&e.def?.isMCV);if(m)deployMCV(m);},
    train:t=>{
      const sb=[...selected].map(id=>findEnt(id)).find(e=>e&&!e.dead&&e instanceof Building&&e.playerId===0&&e.def.trains);
      if(!sb)return;const d=UDEFS[t];if(players[0].credits<d.cost)return;players[0].credits-=d.cost;sb.enqueue(t);
    },
  };
})();
