/* ═══════════════════════════════════════════════════════
   C&C BROWSER GAME — Sophisticated OpenRA-style RTS
   Features: Fog of War · Canvas Sidebar · Web Audio
             Tech Tree · Rally Points · Particles
             Engineers · Artillery · Turrets · Radar
═══════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ── constants ── */
const TILE=32, MAP_W=80, MAP_H=60, SIDEBAR_W=180;
const G=0, TIB=1, WAT=2, ROC=3;
const VIS_NONE=0, VIS_SEEN=1, VIS_FULL=2;
const SCROLL_SPD=280, EDGE=20;

/* ── helpers ── */
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const dist=(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1);

/* ═══════════════════════════════════════════════════════
   AUDIO
═══════════════════════════════════════════════════════ */
let AC=null;
function initAudio(){try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}}
function resumeAudio(){if(AC&&AC.state==='suspended')AC.resume();}

function beep(freq,dur,type='square',vol=0.15,detune=0){
  if(!AC||AC.state!=='running')return;
  try{
    const o=AC.createOscillator(),g=AC.createGain();
    o.type=type;o.frequency.value=freq;o.detune.value=detune;
    g.gain.setValueAtTime(vol,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+dur);
    o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+dur);
  }catch(e){}
}

const sndShoot     =()=>beep(900,0.06,'sawtooth',0.07);
const sndHeavyShoot=()=>{beep(220,0.18,'sawtooth',0.18);beep(440,0.09,'square',0.08,80);};
const sndExplode   =()=>{beep(130,0.4,'sawtooth',0.28);beep(90,0.5,'sawtooth',0.22,-40);};
const sndBigExplode=()=>{beep(80,0.65,'sawtooth',0.38);beep(60,0.8,'sawtooth',0.28,-25);beep(220,0.2,'square',0.12);};
const sndBuild     =()=>{beep(700,0.05,'square',0.09);beep(1000,0.07,'square',0.09);};
const sndCredit    =()=>beep(1300,0.07,'sine',0.07);
const sndSelect    =()=>beep(1100,0.04,'sine',0.05);
const sndReady     =()=>{beep(800,0.07,'sine',0.1);beep(1000,0.07,'sine',0.1);beep(1300,0.1,'sine',0.12);};

/* ═══════════════════════════════════════════════════════
   DEFINITIONS
═══════════════════════════════════════════════════════ */
const UDEFS={
  soldier:  {name:'Rifle Soldier',  hp:80,  dmg:8,   range:3.5,atkRate:1.0,spd:65,cost:100,time:5, sz:9, sight:5,infantry:true,  desc:'Cheap, fast infantry'},
  rocket:   {name:'Rocket Soldier', hp:80,  dmg:32,  range:5.5,atkRate:2.0,spd:55,cost:200,time:8, sz:9, sight:4,infantry:true,  desc:'Anti-armor specialist'},
  engineer: {name:'Engineer',       hp:60,  dmg:0,   range:0,  atkRate:0,  spd:50,cost:300,time:10,sz:9, sight:4,infantry:true,isEngineer:true,desc:'Captures enemy buildings'},
  tank:     {name:'Light Tank',     hp:350, dmg:42,  range:4.5,atkRate:2.0,spd:50,cost:500,time:14,sz:18,sight:5,              desc:'Versatile main battle tank'},
  mammoth:  {name:'Mammoth Tank',   hp:800, dmg:85,  range:5.0,atkRate:2.8,spd:30,cost:1500,time:28,sz:22,sight:5,             desc:'Unstoppable heavy tank'},
  artillery:{name:'Artillery',      hp:150, dmg:120, range:8.0,atkRate:4.0,spd:35,cost:800,time:20,sz:18,sight:4,isArtillery:true,desc:'Long-range splash damage'},
  harvester:{name:'Harvester',      hp:300, dmg:0,   range:0,  atkRate:0,  spd:38,cost:0,  time:0, sz:18,sight:4,isHarv:true,  desc:'Collects Tiberium'},
  mcv:      {name:'MCV',            hp:600, dmg:0,   range:0,  atkRate:0,  spd:42,cost:0,  time:0, sz:22,sight:5,isMCV:true,   desc:'Deploy to establish base'},
};

const BDEFS={
  yard:    {name:'Construction Yard',hp:1000,w:3,h:3,cost:0,   pwr:-5, col:'#1a3510',req:[],           desc:'Base command center'},
  power:   {name:'Power Plant',      hp:400, w:2,h:2,cost:300, pwr:15, col:'#0e2235',req:['yard'],      desc:'Powers your base (+15)'},
  barracks:{name:'Barracks',         hp:500, w:2,h:3,cost:400, pwr:-5, col:'#2a1e08',req:['power'],     trains:['soldier','rocket','engineer'],desc:'Trains infantry'},
  factory: {name:'War Factory',      hp:600, w:3,h:2,cost:800, pwr:-10,col:'#1e1208',req:['barracks'],  trains:['tank','mammoth','artillery'],desc:'Produces vehicles'},
  refinery:{name:'Tib. Refinery',    hp:700, w:3,h:3,cost:1000,pwr:-8, col:'#102808',req:['power'],     desc:'Processes Tiberium (+$600/load)'},
  radar:   {name:'Radar Dome',       hp:400, w:2,h:2,cost:600, pwr:-5, col:'#1e1e0a',req:['power'],     desc:'Reveals map, enables advanced units'},
  turret:  {name:'Guard Tower',      hp:600, w:1,h:1,cost:500, pwr:-3, col:'#2a0808',req:['barracks'],  isDefense:true,dmg:30,range:5,atkRate:1.5,desc:'Defensive gun turret'},
  silo:    {name:'Tib. Silo',        hp:300, w:2,h:2,cost:150, pwr:-2, col:'#0a2010',req:['refinery'],  desc:'Extra credit storage'},
};

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
let canvas,ctx,bgCv,bgCtx;
let map,fog,units,buildings,effects,particles,creditFlashes,players;
let uid=0,tick=0,lastTs=0;
let vp={x:0,y:0};  // viewport
let keys={},mouse={x:0,y:0,wx:0,wy:0,down:false,ds:null};
let selected=new Set();
let placing=null;
let sideTab='bldg';
let gameOver=false,gameOverMsg='';
let rafId=null,bgDirty=true;
let aiTimer=0,aiAtkTimer=20,aiBuildIdx=0;
const AI_ORDER=['power','refinery','barracks','power','factory','radar','turret','power','barracks','factory','turret','turret'];

function GW(){return canvas.width-SIDEBAR_W;}
function GH(){return canvas.height;}

/* ═══════════════════════════════════════════════════════
   PATHFINDING
═══════════════════════════════════════════════════════ */
function walkable(tx,ty){
  if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H)return false;
  if(map[ty][tx]===WAT||map[ty][tx]===ROC)return false;
  for(const b of buildings)if(!b.dead&&tx>=b.tx&&tx<b.tx+b.def.w&&ty>=b.ty&&ty<b.ty+b.def.h)return false;
  return true;
}

function nearestWalkable(tx,ty){
  for(let r=1;r<6;r++){
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const nx=tx+dx,ny=ty+dy;
      if(walkable(nx,ny))return[nx,ny];
    }
  }
  return[tx,ty];
}

function astar(sx,sy,ex,ey){
  if(!walkable(ex,ey)){[ex,ey]=nearestWalkable(ex,ey);}
  const K=(x,y)=>y*MAP_W+x;
  const H=(x,y)=>Math.abs(x-ex)+Math.abs(y-ey);
  const open=new Map(),closed=new Set(),par=new Map(),g=new Map();
  open.set(K(sx,sy),{x:sx,y:sy,f:H(sx,sy)});g.set(K(sx,sy),0);
  let itr=0;
  while(open.size&&itr++<900){
    let bk=null,bn=null;
    for(const[k,n]of open)if(!bn||n.f<bn.f){bk=k;bn=n;}
    if(bn.x===ex&&bn.y===ey){
      const path=[[bn.x,bn.y]];let cur=bk;
      while(par.has(cur)){cur=par.get(cur);path.unshift([cur%MAP_W,Math.floor(cur/MAP_W)]);}
      return path;
    }
    open.delete(bk);closed.add(bk);
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nx=bn.x+dx,ny=bn.y+dy,nk=K(nx,ny);
      if(!walkable(nx,ny)||closed.has(nk))continue;
      const ng=(g.get(bk)||0)+(dx&&dy?1.4:1);
      if(!open.has(nk)||ng<(g.get(nk)||Infinity)){g.set(nk,ng);par.set(nk,bk);open.set(nk,{x:nx,y:ny,f:ng+H(nx,ny)});}
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════
   MAP GENERATION
═══════════════════════════════════════════════════════ */
function genMap(){
  map=[];fog=[];
  for(let y=0;y<MAP_H;y++){map[y]=[];fog[y]=[];for(let x=0;x<MAP_W;x++){map[y][x]=G;fog[y][x]=VIS_NONE;}}
  // Rock patches
  for(let i=0;i<12;i++){
    const cx=15+Math.floor(Math.random()*(MAP_W-30)),cy=10+Math.floor(Math.random()*(MAP_H-20)),r=2+Math.floor(Math.random()*3);
    for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++)if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&Math.random()<0.65)map[y][x]=ROC;
  }
  // Water pools
  for(let i=0;i<5;i++){
    const cx=20+Math.floor(Math.random()*(MAP_W-40)),cy=15+Math.floor(Math.random()*(MAP_H-30)),r=3+Math.floor(Math.random()*5);
    for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++)if(Math.hypot(x-cx,y-cy)<r&&x>=0&&y>=0&&x<MAP_W&&y<MAP_H)map[y][x]=WAT;
  }
  // Tiberium fields
  for(let i=0;i<16;i++){
    const cx=10+Math.floor(Math.random()*(MAP_W-20)),cy=8+Math.floor(Math.random()*(MAP_H-16));
    if((cx<18&&cy<18)||(cx>MAP_W-18&&cy>MAP_H-18))continue;
    const r=2+Math.floor(Math.random()*4);
    for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++)if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&map[y][x]===G&&Math.random()<0.72)map[y][x]=TIB;
  }
  clearArea(2,2,14,14); clearArea(MAP_W-15,MAP_H-15,MAP_W-2,MAP_H-2);
}

function clearArea(x1,y1,x2,y2){for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H)map[y][x]=G;}

/* ═══════════════════════════════════════════════════════
   FOG OF WAR
═══════════════════════════════════════════════════════ */
function updateFog(){
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(fog[y][x]===VIS_FULL)fog[y][x]=VIS_SEEN;
  for(const u of units){if(u.playerId!==0||u.dead)continue;revealCircle(u.tx,u.ty,u.def.sight);}
  for(const b of buildings){
    if(b.playerId!==0||b.dead)continue;
    revealCircle(b.tx+Math.floor(b.def.w/2),b.ty+Math.floor(b.def.h/2),b.type==='radar'?14:6);
  }
}
function revealCircle(cx,cy,r){
  for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++)if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&Math.hypot(x-cx,y-cy)<=r)fog[y][x]=VIS_FULL;
}
const fogAt=(wx,wy)=>{const tx=Math.floor(wx/TILE),ty=Math.floor(wy/TILE);return(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H)?VIS_NONE:fog[ty][tx];};
const isVis=(wx,wy)=>fogAt(wx,wy)===VIS_FULL;

/* ═══════════════════════════════════════════════════════
   PARTICLES
═══════════════════════════════════════════════════════ */
function spawnExplosion(wx,wy,big){
  const n=big?22:10;
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,spd=(big?70:35)+Math.random()*(big?90:45);
    particles.push({x:wx,y:wy,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,life:0.5+Math.random()*0.4,ml:0.9,r:(big?5:2)+Math.random()*4,col:i%3?'#ff6600':'#ffaa00'});
  }
  for(let i=0;i<(big?10:4);i++){
    const a=Math.random()*Math.PI*2,spd=15+Math.random()*25;
    particles.push({x:wx,y:wy,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd-25,life:0.9+Math.random()*0.7,ml:1.6,r:(big?12:6)+Math.random()*6,col:'#555',smoke:true});
  }
}

function spawnMuzzle(wx,wy,col){
  for(let i=0;i<4;i++){
    const a=Math.random()*Math.PI*2,spd=40+Math.random()*60;
    particles.push({x:wx,y:wy,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,life:0.1,ml:0.1,r:2+Math.random()*2,col});
  }
}

function updateParticles(dt){
  for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.smoke)p.vy-=18*dt;}
  particles=particles.filter(p=>p.life>0);
}

function drawParticles(){
  for(const p of particles){
    if(!isVis(p.x,p.y))continue;
    const sx=p.x-vp.x,sy=p.y-vp.y;
    if(sx<-60||sy<-60||sx>GW()+60||sy>GH()+60)continue;
    const a=Math.max(0,p.life/p.ml);
    ctx.globalAlpha=a*(p.smoke?0.55:0.88);
    ctx.fillStyle=p.col;
    ctx.beginPath();ctx.arc(sx,sy,Math.max(0.5,p.r*(p.smoke?a:1)),0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
  }
}

/* ═══════════════════════════════════════════════════════
   UNIT
═══════════════════════════════════════════════════════ */
class Unit{
  constructor(type,pid,wx,wy){
    this.id=uid++;this.type=type;this.def=UDEFS[type];
    this.playerId=pid;this.x=wx;this.y=wy;
    this.hp=this.def.hp;this.maxHp=this.def.hp;
    this.state='idle';this.path=null;this.pi=0;
    this.target=null;this.atk=0;this.angle=0;this.dead=false;
    this.harvLoad=0;this.harvTimer=0;this.kills=0;this.engTimer=0;
  }
  get tx(){return Math.floor(this.x/TILE);}
  get ty(){return Math.floor(this.y/TILE);}

  moveTo(wx,wy){
    const p=astar(this.tx,this.ty,Math.floor(wx/TILE),Math.floor(wy/TILE));
    this.path=p||[[Math.floor(wx/TILE),Math.floor(wy/TILE)]];
    this.pi=0;this.state='moving';this.target=null;
  }
  cmdAttack(id){this.target=id;this.state='attacking';this.path=null;}

  update(dt){
    if(this.dead)return;
    if(this.atk>0)this.atk-=dt;
    if(this.def.isMCV){if(this.state==='moving')this._move(dt);return;}
    if(this.def.isHarv){this._harv(dt);return;}
    if(this.def.isEngineer&&this.state==='engineering'){this._eng(dt);return;}
    if(this.state==='idle'||this.state==='moving')this._autoAtk();
    if(this.state==='moving')this._move(dt);
    else if(this.state==='attacking')this._doAtk(dt);
  }

  _autoAtk(){
    if(!this.def.dmg)return;
    const rng=this.def.range*TILE;let best=null,bd=Infinity;
    for(const e of[...units,...buildings]){
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
    const[tx,ty]=this.path[this.pi];
    const wx=tx*TILE+TILE/2,wy=ty*TILE+TILE/2;
    const dx=wx-this.x,dy=wy-this.y,d=Math.hypot(dx,dy);
    this.angle=Math.atan2(dy,dx);
    if(d<3){this.pi++;if(this.pi>=this.path.length){this.state='idle';this.path=null;}}
    else{this.x+=dx/d*this.def.spd*dt;this.y+=dy/d*this.def.spd*dt;}
  }

  _doAtk(dt){
    const t=findEnt(this.target);
    if(!t||t.dead){this.target=null;this.state='idle';return;}
    const tx=t.x!==undefined?t.x:(t.tx+t.def.w/2)*TILE;
    const ty=t.y!==undefined?t.y:(t.ty+t.def.h/2)*TILE;
    const d=dist(this.x,this.y,tx,ty),rng=this.def.range*TILE;
    if(d>rng*1.1){
      if(!this.path||tick%90===0){const p=astar(this.tx,this.ty,Math.floor(tx/TILE),Math.floor(ty/TILE));if(p){this.path=p;this.pi=0;}}
      this._move(dt);
    } else {
      this.path=null;this.angle=Math.atan2(ty-this.y,tx-this.x);
      if(this.atk<=0){
        this.atk=this.def.atkRate;
        if(this.def.isArtillery){
          const splash=2.5*TILE;
          for(const e of[...units,...buildings]){
            if(e.dead||e.playerId===this.playerId)continue;
            const ex2=e.x!==undefined?e.x:(e.tx+e.def.w/2)*TILE;
            const ey2=e.y!==undefined?e.y:(e.ty+e.def.h/2)*TILE;
            const sd=dist(tx,ty,ex2,ey2);
            if(sd<splash)e.takeDamage(Math.round(this.def.dmg*(1-sd/splash*0.5)));
          }
          spawnExplosion(tx,ty,true);sndBigExplode();
        } else {
          t.takeDamage(this.def.dmg);
          spawnMuzzle(this.x,this.y,players[this.playerId].color);
          effects.push({x:this.x,y:this.y,tx,ty,life:0.1,col:players[this.playerId].color});
          this.def.dmg>40?sndHeavyShoot():sndShoot();
        }
        if(t.dead)this.kills++;
      }
    }
  }

  _eng(dt){
    const t=findEnt(this.target);
    if(!t||t.dead||t.playerId===this.playerId){this.state='idle';return;}
    const tx=(t.tx+t.def.w/2)*TILE,ty=(t.ty+t.def.h/2)*TILE;
    const d=dist(this.x,this.y,tx,ty);
    if(d>TILE*1.8){
      if(!this.path||tick%90===0){const p=astar(this.tx,this.ty,Math.floor(tx/TILE),Math.floor(ty/TILE));if(p){this.path=p;this.pi=0;}}
      this._move(dt);
    } else {
      this.engTimer+=dt;
      if(this.engTimer>=2.0){
        t.playerId=this.playerId;recalcPwr(0);recalcPwr(1);
        this.dead=true;sndReady();
        creditFlashes.push({x:this.x,y:this.y,msg:'CAPTURED!',life:2,col:'#ffcc00'});
      }
    }
  }

  _harv(dt){
    if(this.state==='idle'){
      const tb=nearestTib(this.tx,this.ty);
      if(tb){this.moveTo(tb[0]*TILE+TILE/2,tb[1]*TILE+TILE/2);this.state='h-move';}
    } else if(this.state==='h-move'){
      this._move(dt);
      if(this.state==='idle'){this.state=map[this.ty]?.[this.tx]===TIB?'h-dig':'idle';if(this.state==='h-dig')this.harvTimer=2.5;}
    } else if(this.state==='h-dig'){
      this.harvTimer-=dt;
      if(this.harvTimer<=0){
        if(map[this.ty]?.[this.tx]===TIB){map[this.ty][this.tx]=G;bgDirty=true;this.harvLoad=600;}
        const ref=findBldg('refinery',this.playerId);
        if(ref){this.moveTo((ref.tx+1)*TILE,(ref.ty+1)*TILE);this.state='h-ret';}
        else this.state='idle';
      }
    } else if(this.state==='h-ret'){
      this._move(dt);
      if(this.state==='idle'){
        players[this.playerId].credits+=this.harvLoad;
        creditFlashes.push({x:this.x,y:this.y,msg:`+$${this.harvLoad}`,life:1.3,col:'#4aff2a'});
        this.harvLoad=0;this.state='idle';
        if(this.playerId===0)sndCredit();
      }
    }
  }

  takeDamage(n){
    this.hp=Math.max(0,this.hp-n);
    if(this.hp<=0){
      this.dead=true;
      spawnExplosion(this.x,this.y,this.def.sz>=18);
      this.def.sz>=18?sndBigExplode():sndExplode();
    }
  }

  draw(){
    const sx=this.x-vp.x,sy=this.y-vp.y;
    if(sx<-32||sy<-32||sx>GW()+32||sy>GH()+32)return;
    const fv=fogAt(this.x,this.y);
    if(this.playerId!==0&&fv!==VIS_FULL)return;
    if(fv===VIS_NONE)return;
    const alpha=fv===VIS_FULL?1:0.4;
    const col=players[this.playerId].color;
    const sel=selected.has(this.id);
    const sz=this.def.sz;
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(sx,sy);

    // Ground shadow
    ctx.fillStyle='rgba(0,0,0,0.22)';ctx.beginPath();ctx.ellipse(1,sz/2,sz/2+1,sz/3,0,0,Math.PI*2);ctx.fill();

    // Selection ring
    if(sel){
      ctx.beginPath();ctx.arc(0,0,sz/2+5,0,Math.PI*2);
      ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
    }

    if(this.def.isHarv){
      ctx.fillStyle='#444';ctx.fillRect(-sz/2-1,-sz/2-1,sz+2,sz+2);
      ctx.fillStyle=col;ctx.fillRect(-sz/2,-sz/2,sz,sz);
      ctx.fillStyle='rgba(0,0,0,0.38)';ctx.fillRect(-sz/2+3,-sz/2+3,sz-6,sz-6);
      // Tread lines
      ctx.fillStyle='rgba(0,0,0,0.35)';ctx.fillRect(-sz/2,-sz/2,sz,3);ctx.fillRect(-sz/2,sz/2-3,sz,3);
      if(this.harvLoad>0){ctx.fillStyle='#4aff2a';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText('$',0,3);}
    } else if(this.def.infantry){
      ctx.fillStyle='rgba(0,0,0,0.5)';ctx.beginPath();ctx.arc(0,0,sz/2+1,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=col;ctx.beginPath();ctx.arc(0,0,sz/2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(0,0,0,0.45)';ctx.beginPath();ctx.arc(0,-sz/6,sz/3.5,Math.PI,Math.PI*2);ctx.fill();
      ctx.save();ctx.rotate(this.angle);
      ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(sz/4-1,-1.5,sz/2,3);
      if(this.type==='rocket')ctx.fillRect(sz/4,-3,sz/2.2,1.5);
      if(this.type==='engineer'){ctx.fillStyle='#fff8';ctx.fillRect(-1,-sz/4,2,sz/2);}
      ctx.restore();
    } else if(this.def.isMCV){
      ctx.fillStyle='#3a3a3a';ctx.fillRect(-sz/2,-sz/3,sz,sz*0.67);
      ctx.fillStyle=col;ctx.fillRect(-sz/2+2,-sz/3+2,sz-4,sz*0.67-4);
      ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(-sz/4,-sz/3+4,sz/2,sz*0.67-8);
      ctx.fillStyle='#999';ctx.beginPath();ctx.arc(0,0,sz/5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.6)';ctx.font='7px monospace';ctx.textAlign='center';ctx.fillText('MCV',0,sz/2+10);
    } else if(this.def.isArtillery){
      // Wheeled platform
      ctx.fillStyle='#333';ctx.fillRect(-sz/2,-sz/3,sz,sz*0.67);
      ctx.fillStyle=col;ctx.fillRect(-sz/2+2,-sz/3+2,sz-4,sz*0.67-4);
      // Wheel bumps
      ctx.fillStyle='#222';for(let i=0;i<3;i++)ctx.fillRect(-sz/2+3+i*10,-sz/3-2,7,4);
      ctx.save();ctx.rotate(this.angle);
      ctx.fillStyle='#aaa';ctx.fillRect(2,-2,sz*0.85,4);
      ctx.fillStyle='#666';ctx.fillRect(sz*0.8,-3,sz*0.08,6);
      ctx.restore();
    } else {
      // Tank
      ctx.save();ctx.rotate(this.angle);
      ctx.fillStyle='#2a2a2a';ctx.fillRect(-sz/2-1,-sz/2-1,sz+2,sz+2);
      ctx.fillStyle=col;ctx.fillRect(-sz/2,-sz/2,sz,sz);
      // Tread panels
      ctx.fillStyle='rgba(0,0,0,0.38)';ctx.fillRect(-sz/2,-sz/2,sz,sz/5);ctx.fillRect(-sz/2,sz/2-sz/5,sz,sz/5);
      ctx.fillStyle='rgba(255,255,255,0.06)';for(let i=0;i<4;i++){ctx.fillRect(-sz/2+i*(sz/4),-sz/2,1,sz/5);ctx.fillRect(-sz/2+i*(sz/4),sz/2-sz/5,1,sz/5);}
      // Turret
      ctx.fillStyle=darken(col,0.25);ctx.beginPath();ctx.arc(0,0,sz/3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#888';ctx.fillRect(0,-2,sz*0.6,4);
      if(this.type==='mammoth'){
        // Double barrel + pods
        ctx.fillStyle='#888';ctx.fillRect(0,-5,sz*0.55,3);ctx.fillRect(0,2,sz*0.55,3);
        ctx.restore();
        // Side missile pods
        ctx.fillStyle=col;ctx.fillRect(-sz/2-4,-sz/2,4,sz);ctx.fillRect(sz/2,sz/2,4,-sz);
        ctx.save();
      }
      ctx.restore();
    }
    ctx.restore();

    // HP bar (above unit, outside transform)
    if(this.hp<this.maxHp&&fv===VIS_FULL){
      const bw=sz+6;
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(sx-bw/2-1,sy-sz/2-9,bw+2,6);
      ctx.fillStyle=this.hp/this.maxHp>.6?'#0d0':this.hp/this.maxHp>.3?'#ee0':'#d00';
      ctx.fillRect(sx-bw/2,sy-sz/2-8,bw*(this.hp/this.maxHp),4);
    }
    if(this.kills>=3){ctx.fillStyle='#ffcc00';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText('★',sx,sy-sz/2-11);}
  }
}

/* ═══════════════════════════════════════════════════════
   BUILDING
═══════════════════════════════════════════════════════ */
class Building{
  constructor(type,pid,tx,ty){
    this.id=uid++;this.type=type;this.def=BDEFS[type];
    this.playerId=pid;this.tx=tx;this.ty=ty;
    this.hp=this.def.hp;this.maxHp=this.def.hp;
    this.dead=false;this.queue=[];this.atkCool=0;this.angle=0;
    this.rallyX=null;this.rallyY=null;
  }
  get x(){return(this.tx+this.def.w/2)*TILE;}
  get y(){return(this.ty+this.def.h/2)*TILE;}
  enqueue(t){if(this.queue.length<5)this.queue.push({type:t,prog:0});}

  update(dt){
    if(this.dead)return;
    // Production
    if(this.queue.length&&players[this.playerId].power>=0){
      const it=this.queue[0];it.prog+=dt;
      if(it.prog>=UDEFS[it.type].time){
        this.queue.shift();
        const rx=this.rallyX!==null?this.rallyX:(this.tx+this.def.w+0.5)*TILE;
        const ry=this.rallyY!==null?this.rallyY:(this.ty+this.def.h/2)*TILE;
        const u=spawnUnit(it.type,this.playerId,(this.tx+this.def.w+0.5)*TILE,(this.ty+this.def.h/2)*TILE);
        if(this.rallyX!==null)u.moveTo(rx,ry);
        if(this.playerId===0)sndReady();
      }
    }
    // Turret
    if(this.def.isDefense){
      this.atkCool=Math.max(0,this.atkCool-dt);
      if(this.atkCool<=0){
        const rng=this.def.range*TILE;let best=null,bd=Infinity;
        for(const e of[...units,...buildings]){
          if(e.dead||e.playerId===this.playerId)continue;
          const ex=e.x!==undefined?e.x:(e.tx+e.def.w/2)*TILE;
          const ey=e.y!==undefined?e.y:(e.ty+e.def.h/2)*TILE;
          const d=dist(this.x,this.y,ex,ey);
          if(d<rng&&d<bd){bd=d;best=e;}
        }
        if(best){
          this.atkCool=this.def.atkRate;
          const ex=best.x!==undefined?best.x:(best.tx+best.def.w/2)*TILE;
          const ey=best.y!==undefined?best.y:(best.ty+best.def.h/2)*TILE;
          this.angle=Math.atan2(ey-this.y,ex-this.x);
          best.takeDamage(this.def.dmg);
          effects.push({x:this.x,y:this.y,tx:ex,ty:ey,life:0.12,col:players[this.playerId].color});
          sndShoot();
          if(best.dead){spawnExplosion(ex,ey,best instanceof Building);best instanceof Building?sndBigExplode():sndExplode();}
        }
      }
    }
  }

  takeDamage(n){
    this.hp=Math.max(0,this.hp-n);
    if(this.hp<=0){this.hp=0;this.dead=true;recalcPwr(this.playerId);bgDirty=true;spawnExplosion(this.x,this.y,true);sndBigExplode();}
  }

  draw(){
    const bx=this.tx*TILE-vp.x,by=this.ty*TILE-vp.y;
    const pw=this.def.w*TILE,ph=this.def.h*TILE;
    if(bx>GW()+pw||by>GH()+ph||bx+pw<0||by+ph<0)return;
    const fv=fogAt(this.x,this.y);if(fv===VIS_NONE)return;
    const col=players[this.playerId].color,sel=selected.has(this.id);
    ctx.save();ctx.globalAlpha=fv===VIS_FULL?1:0.45;

    // Body
    ctx.fillStyle=this.def.col;ctx.fillRect(bx,by,pw,ph);
    ctx.fillStyle='rgba(0,0,0,0.28)';ctx.fillRect(bx+2,by+2,pw-4,ph-4);
    ctx.fillStyle=this.def.col;ctx.fillRect(bx+4,by+4,pw-8,ph-8);
    // Player color stripe
    ctx.fillStyle=col;ctx.fillRect(bx,by,pw,4);
    ctx.fillStyle=darken(col,0.3);ctx.fillRect(bx,by+4,pw,2);
    // Window/vent detail
    if(pw>=64){ctx.fillStyle='rgba(255,255,255,0.07)';ctx.fillRect(bx+6,by+8,pw-12,8);}

    // Outline
    ctx.strokeStyle=sel?col:'rgba(255,255,255,0.1)';ctx.lineWidth=sel?2:1;
    if(sel){ctx.shadowColor=col;ctx.shadowBlur=10;}
    ctx.strokeRect(bx,by,pw,ph);ctx.shadowBlur=0;

    // Label
    ctx.fillStyle='rgba(255,255,255,0.75)';ctx.font=`bold ${Math.min(9,pw/6)}px monospace`;
    ctx.textAlign='center';ctx.fillText(this.def.name,bx+pw/2,by+ph/2+3);

    // Power plant glow
    if(this.type==='power'&&fv===VIS_FULL){
      const grad=ctx.createRadialGradient(bx+pw/2,by+ph/2,2,bx+pw/2,by+ph/2,pw);
      grad.addColorStop(0,'rgba(50,140,255,0.35)');grad.addColorStop(1,'rgba(50,140,255,0)');
      ctx.fillStyle=grad;ctx.fillRect(bx,by,pw,ph);
    }
    // Radar spin
    if(this.type==='radar'&&fv===VIS_FULL){
      ctx.save();ctx.translate(bx+pw/2,by+ph/2);ctx.rotate(Date.now()/600);
      ctx.strokeStyle='rgba(74,255,42,0.4)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-ph/2+4);ctx.stroke();
      ctx.restore();
    }
    // Turret barrel
    if(this.def.isDefense){
      ctx.save();ctx.translate(bx+pw/2,by+ph/2);ctx.rotate(this.angle);
      ctx.fillStyle='#555';ctx.fillRect(-3,-3,6,6);
      ctx.fillStyle='#888';ctx.fillRect(3,-2,TILE*0.7,4);
      ctx.restore();
    }
    // Production bar
    if(this.queue.length&&fv===VIS_FULL){
      const p=this.queue[0].prog/UDEFS[this.queue[0].type].time;
      ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(bx+1,by+ph-8,pw-2,7);
      ctx.fillStyle='rgba(74,255,42,0.85)';ctx.fillRect(bx+1,by+ph-8,(pw-2)*p,7);
      ctx.fillStyle='#fff';ctx.font='5px monospace';ctx.textAlign='center';ctx.fillText(UDEFS[this.queue[0].type].name,bx+pw/2,by+ph-2);
    }
    // HP bar
    if(this.hp<this.maxHp&&fv===VIS_FULL){
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(bx,by-8,pw,6);
      ctx.fillStyle=this.hp/this.maxHp>.6?'#0d0':this.hp/this.maxHp>.3?'#ee0':'#d00';
      ctx.fillRect(bx,by-8,pw*(this.hp/this.maxHp),6);
    }
    // Rally line
    if(sel&&this.rallyX!==null&&fv===VIS_FULL){
      ctx.strokeStyle='rgba(74,255,42,0.45)';ctx.lineWidth=1;ctx.setLineDash([5,4]);
      ctx.beginPath();ctx.moveTo(bx+pw/2,by+ph/2);ctx.lineTo(this.rallyX-vp.x,this.rallyY-vp.y);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(74,255,42,0.75)';ctx.beginPath();ctx.arc(this.rallyX-vp.x,this.rallyY-vp.y,4,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
}

function darken(hex,amt){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.floor(r*(1-amt))},${Math.floor(g*(1-amt))},${Math.floor(b*(1-amt))})`;
}

/* ═══════════════════════════════════════════════════════
   GAME LOGIC HELPERS
═══════════════════════════════════════════════════════ */
function findEnt(id){for(const u of units)if(u.id===id)return u;for(const b of buildings)if(b.id===id)return b;return null;}
function findBldg(type,pid){return buildings.find(b=>b.type===type&&b.playerId===pid&&!b.dead);}
function hasBuilt(type,pid){return!!findBldg(type,pid);}
function recalcPwr(pid){let p=0;for(const b of buildings)if(b.playerId===pid&&!b.dead)p+=b.def.pwr;players[pid].power=p;}
function spawnUnit(type,pid,wx,wy){const u=new Unit(type,pid,wx,wy);units.push(u);return u;}

function nearestTib(tx,ty){
  let best=null,bd=Infinity;
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(map[y]&&map[y][x]===TIB){const d=Math.abs(x-tx)+Math.abs(y-ty);if(d<bd){bd=d;best=[x,y];}}
  return best;
}

function meetsReqs(type,pid){return BDEFS[type].req.every(r=>hasBuilt(r,pid));}

function canPlace(type,tx,ty,pid){
  const d=BDEFS[type];
  if(tx<0||ty<0||tx+d.w>MAP_W||ty+d.h>MAP_H)return false;
  for(let y=ty;y<ty+d.h;y++)for(let x=tx;x<tx+d.w;x++){
    if(map[y][x]!==G)return false;
    for(const b of buildings)if(!b.dead&&x>=b.tx&&x<b.tx+b.def.w&&y>=b.ty&&y<b.ty+b.def.h)return false;
  }
  const cx=tx+d.w/2,cy=ty+d.h/2;
  for(const b of buildings){
    if(b.playerId!==pid||b.dead)continue;
    if(Math.abs(b.tx+b.def.w/2-cx)+Math.abs(b.ty+b.def.h/2-cy)<10)return true;
  }
  return false;
}

function doPlace(type,tx,ty){
  const d=BDEFS[type];
  if(players[0].credits<d.cost||!canPlace(type,tx,ty,0)||!meetsReqs(type,0))return false;
  players[0].credits-=d.cost;
  const b=new Building(type,0,tx,ty);buildings.push(b);recalcPwr(0);
  if(type==='refinery')spawnUnit('harvester',0,(b.tx+b.def.w+0.5)*TILE,(b.ty+1.5)*TILE);
  bgDirty=true;sndBuild();return true;
}

function deployMCV(u){
  const tx=u.tx-1,ty=u.ty-1;
  if(!canPlace('yard',tx,ty,0))return false;
  u.dead=true;buildings.push(new Building('yard',0,tx,ty));recalcPwr(0);bgDirty=true;sndBuild();return true;
}

/* ═══════════════════════════════════════════════════════
   AI
═══════════════════════════════════════════════════════ */
function updateAI(dt){
  const ai=players[1];
  aiTimer-=dt;aiAtkTimer-=dt;
  if(aiTimer>0)return;aiTimer=0.55;
  const cy=findBldg('yard',1);if(!cy)return;

  // Build queue
  if(aiBuildIdx<AI_ORDER.length){
    const next=AI_ORDER[aiBuildIdx],def=BDEFS[next];
    if(meetsReqs(next,1)&&ai.credits>=def.cost){
      const pos=aiFindPos(next);
      if(pos){
        ai.credits-=def.cost;
        const b=new Building(next,1,pos[0],pos[1]);buildings.push(b);recalcPwr(1);
        if(next==='refinery')spawnUnit('harvester',1,(b.tx-1.5)*TILE,(b.ty+1.5)*TILE);
        aiBuildIdx++;
      }
    }
  }
  if(ai.power<-8&&ai.credits>=BDEFS.power.cost&&meetsReqs('power',1)){
    const pos=aiFindPos('power');if(pos){ai.credits-=BDEFS.power.cost;buildings.push(new Building('power',1,pos[0],pos[1]));recalcPwr(1);}
  }

  // Train
  const bars=buildings.filter(b=>b.type==='barracks'&&b.playerId===1&&!b.dead);
  const facs=buildings.filter(b=>b.type==='factory'&&b.playerId===1&&!b.dead);
  if(bars.length&&ai.credits>=UDEFS.soldier.cost&&bars[0].queue.length<3){ai.credits-=UDEFS.soldier.cost;bars[0].enqueue('soldier');}
  if(facs.length&&ai.credits>=UDEFS.tank.cost&&facs[0].queue.length<2){ai.credits-=UDEFS.tank.cost;facs[0].enqueue('tank');}
  if(facs.length&&ai.credits>=UDEFS.artillery.cost&&facs[0].queue.length<1&&Math.random()<0.25){ai.credits-=UDEFS.artillery.cost;facs[0].enqueue('artillery');}

  // Attack waves
  if(aiAtkTimer<=0){
    const arm=units.filter(u=>u.playerId===1&&!u.dead&&u.def.dmg>0);
    if(arm.length>=5){
      aiAtkTimer=35+Math.random()*25;
      const tgt=findBldg('yard',0)||findBldg('refinery',0)||buildings.find(b=>b.playerId===0&&!b.dead);
      if(tgt)arm.forEach(u=>u.cmdAttack(tgt.id));
    } else aiAtkTimer=5;
  }
}

function aiFindPos(type){
  const cy=findBldg('yard',1);if(!cy)return null;
  const def=BDEFS[type],ox=cy.tx+1,oy=cy.ty+1;
  for(let r=3;r<20;r++)for(let a=0;a<Math.PI*2;a+=0.28){
    const tx=Math.round(ox+Math.cos(a)*r-def.w/2),ty=Math.round(oy+Math.sin(a)*r-def.h/2);
    if(canPlace(type,tx,ty,1))return[tx,ty];
  }
  return null;
}

/* ═══════════════════════════════════════════════════════
   BACKGROUND CANVAS
═══════════════════════════════════════════════════════ */
function renderBg(){
  if(!bgDirty)return;bgDirty=false;
  const c=bgCtx;
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const t=map[y][x];
    const v=Math.sin(x*0.71+y*0.53)*2.5;
    if(t===G){const r=21+v,g=34+v,b=11+v;c.fillStyle=`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;}
    else if(t===TIB)c.fillStyle='#152e0a';
    else if(t===WAT)c.fillStyle='#0a1520';
    else c.fillStyle='#161612';
    c.fillRect(x*TILE,y*TILE,TILE,TILE);

    if(t===TIB){
      for(let i=0;i<6;i++){
        const cx=x*TILE+3+(i%3)*9+Math.sin(x*4.1+y*3.3+i*1.4)*2;
        const cy2=y*TILE+4+Math.floor(i/3)*12+Math.cos(x*3.3+y*4.1+i*1.8)*2;
        const h=6+Math.sin(x*5.1+y*2.3+i)*2;
        c.fillStyle=i%2?'#40e020':'#58ff35';c.fillRect(cx,cy2,3,h);
        c.fillStyle='rgba(90,230,50,0.25)';c.fillRect(cx-1,cy2-1,5,h+2);
      }
      c.fillStyle='rgba(60,220,20,0.07)';c.fillRect(x*TILE,y*TILE,TILE,TILE);
    } else if(t===WAT){
      const wv=(x+y)%4;c.fillStyle=wv<2?'rgba(20,65,130,0.28)':'rgba(10,35,90,0.28)';c.fillRect(x*TILE,y*TILE,TILE,TILE);
    } else if(t===ROC){
      c.fillStyle='rgba(255,255,255,0.04)';c.fillRect(x*TILE+2,y*TILE+2,TILE-4,TILE/2-3);
    }
    c.fillStyle='rgba(0,0,0,0.045)';c.fillRect(x*TILE,y*TILE,1,TILE);c.fillRect(x*TILE,y*TILE,TILE,1);
  }
}

/* ═══════════════════════════════════════════════════════
   FOG RENDER
═══════════════════════════════════════════════════════ */
function drawFog(){
  for(let ty=0;ty<MAP_H;ty++)for(let tx=0;tx<MAP_W;tx++){
    const fv=fog[ty][tx];if(fv===VIS_FULL)continue;
    const sx=tx*TILE-vp.x,sy=ty*TILE-vp.y;
    if(sx>GW()||sy>GH()||sx+TILE<0||sy+TILE<0)continue;
    ctx.fillStyle=fv===VIS_NONE?'rgba(0,0,0,0.94)':'rgba(0,0,0,0.52)';
    ctx.fillRect(sx,sy,TILE+1,TILE+1);
  }
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR (all drawn on canvas)
═══════════════════════════════════════════════════════ */
// Store button hit areas for click detection
let _bldgBtns=[], _unitBtns=[], _tabBtns=[], _mmRect=null;

function drawSidebar(){
  _bldgBtns=[];_unitBtns=[];_tabBtns=[];
  const sx=GW(),W=SIDEBAR_W,H=GH();

  // Panel BG
  ctx.fillStyle='#050d03';ctx.fillRect(sx,0,W,H);
  ctx.fillStyle='rgba(74,255,42,0.18)';ctx.fillRect(sx,0,1,H);

  let y=8;

  // Credits
  ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(sx+5,y,W-10,24);
  ctx.fillStyle=players[0].credits>0?'#4aff2a':'#f55';
  ctx.font='bold 14px monospace';ctx.textAlign='left';ctx.fillText(`$ ${players[0].credits}`,sx+11,y+16);
  y+=28;

  // Power bar
  const pwr=players[0].power, barW=W-10;
  ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(sx+5,y,barW,9);
  const fill=clamp((pwr+60)/120,0,1);
  ctx.fillStyle=pwr<0?'#f55':'#4aff2a';ctx.fillRect(sx+5,y,barW*fill,9);
  ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font='7px monospace';ctx.textAlign='center';
  ctx.fillText(`PWR ${pwr>=0?'+':''}${pwr}`,sx+W/2,y+7);
  y+=13;

  // Wave timer hint
  const arm1=units.filter(u=>u.playerId===1&&!u.dead&&u.def.dmg>0).length;
  ctx.fillStyle='#3a4a33';ctx.font='7px monospace';ctx.textAlign='center';
  ctx.fillText(`Enemy forces: ${arm1}`,sx+W/2,y+7);
  y+=12;

  // Minimap
  const mmH=Math.round((W-8)*0.75);
  _mmRect={x:sx+4,y,w:W-8,h:mmH};
  drawMinimap(sx+4,y,W-8,mmH);
  y+=mmH+6;

  // Tabs
  const tabY=y,tabW=(W-8)/2;
  ['bldg','unit'].forEach((tab,i)=>{
    const tx2=sx+4+i*tabW,active=sideTab===tab;
    ctx.fillStyle=active?'rgba(74,255,42,0.18)':'rgba(0,0,0,0.4)';ctx.fillRect(tx2,tabY,tabW-2,20);
    ctx.strokeStyle=active?'rgba(74,255,42,0.55)':'rgba(74,255,42,0.1)';ctx.lineWidth=1;ctx.strokeRect(tx2,tabY,tabW-2,20);
    ctx.fillStyle=active?'#4aff2a':'#3a5a2a';ctx.font='bold 9px monospace';ctx.textAlign='center';
    ctx.fillText(tab==='bldg'?'BUILD':'TRAIN',tx2+tabW/2-1,tabY+13);
    _tabBtns.push({x:tx2,y:tabY,w:tabW-2,h:20,tab});
  });
  y+=24;

  // Content
  if(sideTab==='bldg')drawBuildPanel(sx,y,W,H-y);
  else drawTrainPanel(sx,y,W,H-y);
}

function drawBuildPanel(sx,y,W,H){
  const types=['power','barracks','factory','refinery','radar','turret','silo'];
  // MCV deploy
  const mcv=[...selected].map(id=>findEnt(id)).find(e=>e&&!e.dead&&e instanceof Unit&&e.def?.isMCV);
  if(mcv){
    const enabled=true;
    ctx.fillStyle='rgba(255,153,0,0.12)';ctx.fillRect(sx+4,y,W-8,20);
    ctx.strokeStyle='rgba(255,153,0,0.5)';ctx.lineWidth=1;ctx.strokeRect(sx+4,y,W-8,20);
    ctx.fillStyle='#ff9900';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText('▶ DEPLOY MCV',sx+W/2,y+13);
    _bldgBtns.push({x:sx+4,y,w:W-8,h:20,action:'deployMCV'});
    y+=24;
  }

  if(!findBldg('yard',0)&&!mcv){
    ctx.fillStyle='#3a5a2a';ctx.font='8px monospace';ctx.textAlign='center';
    ctx.fillText('Deploy MCV to start',sx+W/2,y+12);ctx.fillText('building your base',sx+W/2,y+22);
    return;
  }

  const btnW=(W-12)/2,btnH=44;
  types.forEach((t,i)=>{
    const def=BDEFS[t];
    const bx=sx+4+(i%2)*(btnW+4),by=y+Math.floor(i/2)*(btnH+4);
    if(by+btnH>y+H)return;
    const canAfford=players[0].credits>=def.cost;
    const reqsMet=meetsReqs(t,0);
    const active=placing===t;

    ctx.fillStyle=active?'rgba(74,255,42,0.2)':canAfford&&reqsMet?'rgba(74,255,42,0.06)':'rgba(0,0,0,0.25)';
    ctx.fillRect(bx,by,btnW,btnH);
    ctx.strokeStyle=active?'#4aff2a':canAfford&&reqsMet?'rgba(74,255,42,0.25)':'rgba(255,255,255,0.05)';
    ctx.lineWidth=active?2:1;ctx.strokeRect(bx,by,btnW,btnH);

    // Top color bar
    ctx.fillStyle=canAfford&&reqsMet?def.col:'rgba(10,10,10,0.5)';ctx.fillRect(bx,by,btnW,3);

    const nameLines=def.name.split(' ');
    ctx.fillStyle=canAfford&&reqsMet?'#c8e898':locked_?'#2a3a2a':'#4a6a3a';
    ctx.font='bold 7px monospace';ctx.textAlign='center';
    ctx.fillText(nameLines[0],bx+btnW/2,by+14);
    if(nameLines[1])ctx.fillText(nameLines[1]||'',bx+btnW/2,by+23);

    ctx.fillStyle=canAfford?'#8aaa66':'#3a4a33';ctx.font='8px monospace';
    ctx.fillText(`$${def.cost}`,bx+btnW/2,by+34);

    if(!reqsMet){
      ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(bx,by,btnW,btnH);
      ctx.fillStyle='#2a4a2a';ctx.font='6px monospace';ctx.textAlign='center';ctx.fillText('🔒 locked',bx+btnW/2,by+btnH/2+3);
    }
    if(active){ctx.fillStyle='rgba(74,255,42,0.15)';ctx.fillRect(bx,by,btnW,btnH);ctx.fillStyle='#4aff2a';ctx.font='6px monospace';ctx.fillText('[placing]',bx+btnW/2,by+btnH-4);}

    _bldgBtns.push({x:bx,y:by,w:btnW,h:btnH,action:'place',btype:t,enabled:canAfford&&reqsMet});
  });
  const locked_=false;
}

function drawTrainPanel(sx,y,W,H){
  const selBldg=[...selected].map(id=>findEnt(id)).find(e=>e&&!e.dead&&e instanceof Building&&e.playerId===0&&e.def.trains);
  if(!selBldg){
    ctx.fillStyle='#3a5a2a';ctx.font='8px monospace';ctx.textAlign='center';
    ctx.fillText('Select a Barracks',sx+W/2,y+14);ctx.fillText('or War Factory',sx+W/2,y+26);
    return;
  }
  // Building header
  ctx.fillStyle='rgba(74,255,42,0.1)';ctx.fillRect(sx+4,y,W-8,18);
  ctx.strokeStyle='rgba(74,255,42,0.2)';ctx.lineWidth=1;ctx.strokeRect(sx+4,y,W-8,18);
  ctx.fillStyle='#8aaa66';ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillText(selBldg.def.name,sx+W/2,y+12);
  y+=22;

  const btnW=(W-12)/2,btnH=50;
  selBldg.def.trains.forEach((t,i)=>{
    const def=UDEFS[t];
    const can=players[0].credits>=def.cost&&players[0].power>=0;
    const bx=sx+4+(i%2)*(btnW+4),by=y+Math.floor(i/2)*(btnH+4);
    if(by+btnH>y+H)return;
    ctx.fillStyle=can?'rgba(74,255,42,0.07)':'rgba(0,0,0,0.25)';ctx.fillRect(bx,by,btnW,btnH);
    ctx.strokeStyle=can?'rgba(74,255,42,0.25)':'rgba(255,255,255,0.05)';ctx.lineWidth=1;ctx.strokeRect(bx,by,btnW,btnH);

    ctx.fillStyle=can?'#c8e898':'#3a5a3a';ctx.font='bold 7px monospace';ctx.textAlign='center';
    ctx.fillText(def.name.split(' ').pop(),bx+btnW/2,by+13);
    ctx.fillStyle=can?'#8aaa66':'#3a5a3a';ctx.font='7px monospace';
    ctx.fillText(`$${def.cost}`,bx+btnW/2,by+24);
    ctx.fillStyle='#3a5a3a';ctx.font='6px monospace';
    ctx.fillText(`hp:${def.hp}`,bx+btnW/2,by+34);
    ctx.fillText(`rng:${def.range} t:${def.time}s`,bx+btnW/2,by+43);
    _unitBtns.push({x:bx,y:by,w:btnW,h:btnH,utype:t,bldgId:selBldg.id,enabled:can});
  });
  y+=Math.ceil(selBldg.def.trains.length/2)*(btnH+4)+4;

  // Queue
  if(selBldg.queue.length){
    const it=selBldg.queue[0],p=it.prog/UDEFS[it.type].time;
    ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(sx+4,y,W-8,20);
    ctx.fillStyle='rgba(74,255,42,0.55)';ctx.fillRect(sx+4,y,(W-8)*p,20);
    ctx.fillStyle='#fff';ctx.font='8px monospace';ctx.textAlign='center';
    ctx.fillText(`${UDEFS[it.type].name} ${Math.round(p*100)}%`,sx+W/2,y+13);
    y+=24;
    if(selBldg.queue.length>1){ctx.fillStyle='#446633';ctx.font='7px monospace';ctx.textAlign='center';ctx.fillText(`+${selBldg.queue.length-1} queued`,sx+W/2,y+8);}
  }
}

function drawMinimap(mx,my,mw,mh){
  ctx.fillStyle='#080e04';ctx.fillRect(mx,my,mw,mh);
  const sx=mw/MAP_W,sy=mh/MAP_H;
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const fv=fog[y][x];if(fv===VIS_NONE)continue;
    const t=map[y][x];
    let c=t===TIB?'#2a8a0a':t===WAT?'#0a2040':t===ROC?'#222218':null;
    if(c||fv===VIS_FULL){ctx.fillStyle=c||'#0f1a06';ctx.fillRect(mx+x*sx,my+y*sy,Math.ceil(sx)+1,Math.ceil(sy)+1);}
  }
  for(const b of buildings){
    if(b.dead)continue;
    const fv=fog[clamp(b.ty,0,MAP_H-1)][clamp(b.tx,0,MAP_W-1)];if(fv===VIS_NONE)continue;
    ctx.fillStyle=fv===VIS_FULL?players[b.playerId].color:darken(players[b.playerId].color,0.35);
    ctx.fillRect(mx+b.tx*sx,my+b.ty*sy,b.def.w*sx*1.5,b.def.h*sy*1.5);
  }
  for(const u of units){
    if(u.dead)continue;
    if(u.playerId!==0&&fog[clamp(u.ty,0,MAP_H-1)][clamp(u.tx,0,MAP_W-1)]!==VIS_FULL)continue;
    ctx.fillStyle=players[u.playerId].color;ctx.fillRect(mx+u.x/TILE*sx-1,my+u.y/TILE*sy-1,3,3);
  }
  // Fog overlay
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const fv=fog[y][x];
    if(fv===VIS_NONE){ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(mx+x*sx,my+y*sy,Math.ceil(sx)+1,Math.ceil(sy)+1);}
    else if(fv===VIS_SEEN){ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(mx+x*sx,my+y*sy,Math.ceil(sx)+1,Math.ceil(sy)+1);}
  }
  ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=1;ctx.strokeRect(mx+vp.x*sx/TILE,my+vp.y*sy/TILE,(GW()*sx)/TILE,(GH()*sy)/TILE);
  ctx.strokeStyle='rgba(74,255,42,0.3)';ctx.strokeRect(mx,my,mw,mh);
}

/* ═══════════════════════════════════════════════════════
   SELECTED UNIT INFO BAR
═══════════════════════════════════════════════════════ */
function drawInfoBar(){
  if(!selected.size)return;
  const ents=[...selected].map(id=>findEnt(id)).filter(e=>e&&!e.dead);
  if(!ents.length)return;
  const bh=selected.size===1?42:32,by=GH()-bh;
  ctx.fillStyle='rgba(5,12,3,0.94)';ctx.fillRect(0,by,GW(),bh);
  ctx.fillStyle='rgba(74,255,42,0.28)';ctx.fillRect(0,by,GW(),1);
  if(selected.size===1){
    const e=ents[0];
    ctx.fillStyle='#d8f0b0';ctx.font='bold 11px monospace';ctx.textAlign='left';ctx.fillText(e.def.name,8,by+14);
    ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(8,by+18,140,6);
    ctx.fillStyle=e.hp/e.maxHp>.6?'#0d0':e.hp/e.maxHp>.3?'#ee0':'#d00';
    ctx.fillRect(8,by+18,140*(e.hp/e.maxHp),6);
    ctx.fillStyle='#7a9955';ctx.font='8px monospace';ctx.fillText(`${e.hp}/${e.maxHp} HP`,154,by+24);
    if(e.def.desc){ctx.fillStyle='#556644';ctx.fillText(e.def.desc,8,by+35);}
    const st=e instanceof Unit?(e.def.isMCV?'Right-click enemy to capture·':'')+e.state:'';
    ctx.fillStyle='#4aff2a';ctx.textAlign='right';ctx.fillText(st.toUpperCase(),GW()-8,by+14);
    if(e instanceof Unit&&e.kills){ctx.fillStyle='#ffcc00';ctx.fillText(`★ ${e.kills} kills`,GW()-8,by+27);}
    // Engineer capture hint
    if(e instanceof Unit&&e.def.isEngineer){ctx.fillStyle='#ff9900';ctx.textAlign='right';ctx.fillText('Right-click building to capture',GW()-8,by+36);}
  } else {
    ctx.fillStyle='#d8f0b0';ctx.font='bold 10px monospace';ctx.textAlign='left';ctx.fillText(`${ents.length} units selected`,8,by+18);
    ents.slice(0,16).forEach((e,i)=>{const px=8+i*24,py=by+22;ctx.fillStyle='#300';ctx.fillRect(px,py,20,5);ctx.fillStyle=e.hp/e.maxHp>.5?'#0d0':'#d00';ctx.fillRect(px,py,20*(e.hp/e.maxHp),5);});
  }
}

/* ═══════════════════════════════════════════════════════
   CREDIT FLASHES
═══════════════════════════════════════════════════════ */
function updateCreditFlashes(dt){
  for(const f of creditFlashes){f.life-=dt;f.y-=25*dt;}
  creditFlashes=creditFlashes.filter(f=>f.life>0);
}
function drawCreditFlashes(){
  for(const f of creditFlashes){
    if(!isVis(f.x,f.y))continue;
    ctx.globalAlpha=Math.min(1,f.life);
    ctx.fillStyle=f.col||'#4aff2a';ctx.font='bold 11px monospace';ctx.textAlign='center';
    ctx.fillText(f.msg,f.x-vp.x,f.y-vp.y);ctx.globalAlpha=1;
  }
}

/* ═══════════════════════════════════════════════════════
   INPUT
═══════════════════════════════════════════════════════ */
function setupInput(){
  canvas.addEventListener('mousedown',onDown);
  canvas.addEventListener('mousemove',onMove);
  canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();onRight(e);});
  window.addEventListener('keydown',e=>{
    keys[e.key]=true;
    if(e.key==='Escape'){placing=null;selected.clear();}
    if((e.key==='r'||e.key==='R')&&gameOver)restart();
    if(e.key==='Tab'){e.preventDefault();sideTab=sideTab==='bldg'?'unit':'bldg';}
  });
  window.addEventListener('keyup',e=>{keys[e.key]=false;});
}

function s2w(sx,sy){return{x:sx+vp.x,y:sy+vp.y};}

function onDown(e){
  resumeAudio();
  const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
  if(e.button!==0)return;
  if(sx>=GW()){handleSidebarClick(sx,sy);return;}
  if(placing){
    const{x,y}=s2w(sx,sy);
    const tx=Math.floor(x/TILE)-Math.floor(BDEFS[placing].w/2);
    const ty=Math.floor(y/TILE)-Math.floor(BDEFS[placing].h/2);
    doPlace(placing,tx,ty);placing=null;
  } else {mouse.down=true;mouse.ds={sx,sy};}
}

function handleSidebarClick(sx,sy){
  // Minimap
  if(_mmRect&&sx>=_mmRect.x&&sx<=_mmRect.x+_mmRect.w&&sy>=_mmRect.y&&sy<=_mmRect.y+_mmRect.h){
    vp.x=clamp((sx-_mmRect.x)/_mmRect.w*MAP_W*TILE-GW()/2,0,MAP_W*TILE-GW());
    vp.y=clamp((sy-_mmRect.y)/_mmRect.h*MAP_H*TILE-GH()/2,0,MAP_H*TILE-GH());
    return;
  }
  // Tabs
  for(const t of _tabBtns)if(sx>=t.x&&sx<=t.x+t.w&&sy>=t.y&&sy<=t.y+t.h){sideTab=t.tab;return;}
  // Build buttons
  for(const b of _bldgBtns){
    if(sx>=b.x&&sx<=b.x+b.w&&sy>=b.y&&sy<=b.y+b.h){
      if(b.action==='deployMCV'){const m=[...selected].map(id=>findEnt(id)).find(e=>e&&!e.dead&&e instanceof Unit&&e.def?.isMCV);if(m)deployMCV(m);}
      else if(b.action==='place'&&b.enabled)placing=placing===b.btype?null:b.btype;
      return;
    }
  }
  // Unit train buttons
  for(const b of _unitBtns){
    if(sx>=b.x&&sx<=b.x+b.w&&sy>=b.y&&sy<=b.y+b.h){
      if(!b.enabled)return;
      const bldg=findEnt(b.bldgId);
      if(bldg&&players[0].credits>=UDEFS[b.utype].cost&&players[0].power>=0){players[0].credits-=UDEFS[b.utype].cost;bldg.enqueue(b.utype);}
      return;
    }
  }
}

function onMove(e){
  const r=canvas.getBoundingClientRect();
  mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;
  const w=s2w(mouse.x,mouse.y);mouse.wx=w.x;mouse.wy=w.y;
}

function onUp(e){
  if(!mouse.down)return;mouse.down=false;
  const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
  if(!mouse.ds||sx>=GW()){mouse.ds=null;return;}
  const dx=sx-mouse.ds.sx,dy=sy-mouse.ds.sy;
  if(Math.abs(dx)>5||Math.abs(dy)>5){
    const x1=Math.min(mouse.ds.sx,sx)+vp.x,y1=Math.min(mouse.ds.sy,sy)+vp.y;
    const x2=Math.max(mouse.ds.sx,sx)+vp.x,y2=Math.max(mouse.ds.sy,sy)+vp.y;
    selected.clear();
    for(const u of units)if(!u.dead&&u.playerId===0&&u.x>=x1&&u.x<=x2&&u.y>=y1&&u.y<=y2)selected.add(u.id);
    if(selected.size)sndSelect();
  } else {
    const wx=sx+vp.x,wy=sy+vp.y;selected.clear();
    let hit=null;
    for(const u of units){if(u.dead||u.playerId!==0)continue;if(dist(wx,wy,u.x,u.y)<u.def.sz+4){hit=u;break;}}
    if(!hit)for(const b of buildings){if(b.dead||b.playerId!==0)continue;if(wx>=b.tx*TILE&&wx<(b.tx+b.def.w)*TILE&&wy>=b.ty*TILE&&wy<(b.ty+b.def.h)*TILE){hit=b;break;}}
    if(hit){selected.add(hit.id);sndSelect();}
  }
  mouse.ds=null;
}

function onRight(e){
  placing=null;
  const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
  if(sx>=GW()||!selected.size)return;
  const wx=sx+vp.x,wy=sy+vp.y;

  // Rally point for selected building
  const selB=[...selected].map(id=>findEnt(id)).find(e=>e&&!e.dead&&e instanceof Building&&e.playerId===0&&e.def.trains);
  if(selB){selB.rallyX=wx;selB.rallyY=wy;return;}

  let enemy=null;
  for(const u of units){if(u.dead||u.playerId===0)continue;if(dist(wx,wy,u.x,u.y)<u.def.sz+6){enemy=u;break;}}
  if(!enemy)for(const b of buildings){if(b.dead||b.playerId===0)continue;if(wx>=b.tx*TILE&&wx<(b.tx+b.def.w)*TILE&&wy>=b.ty*TILE&&wy<(b.ty+b.def.h)*TILE){enemy=b;break;}}

  const sel=[...selected].map(id=>findEnt(id)).filter(e=>e&&!e.dead&&e instanceof Unit&&e.playerId===0);
  if(enemy){
    sel.forEach(u=>{
      if(u.def.isEngineer&&enemy instanceof Building){u.target=enemy.id;u.state='engineering';u.path=null;u.engTimer=0;}
      else if(u.def.dmg>0)u.cmdAttack(enemy.id);
    });
  } else {
    sel.forEach((u,i)=>{const c=i%4,row=Math.floor(i/4);u.moveTo(wx+(c-1.5)*TILE*0.85,wy+(row-0.5)*TILE*0.85);});
  }
}

/* ═══════════════════════════════════════════════════════
   CAMERA
═══════════════════════════════════════════════════════ */
function updateCam(dt){
  const maxX=MAP_W*TILE-GW(),maxY=MAP_H*TILE-GH();
  let dx=0,dy=0;
  if(keys['ArrowLeft']||keys['a']||keys['A']||mouse.x<EDGE)dx=-1;
  if(keys['ArrowRight']||keys['d']||keys['D']||(mouse.x>GW()-EDGE&&mouse.x<GW()))dx=1;
  if(keys['ArrowUp']||keys['w']||keys['W']||mouse.y<EDGE)dy=-1;
  if(keys['ArrowDown']||keys['s']||keys['S']||mouse.y>GH()-EDGE)dy=1;
  vp.x=clamp(vp.x+dx*SCROLL_SPD*dt,0,Math.max(0,maxX));
  vp.y=clamp(vp.y+dy*SCROLL_SPD*dt,0,Math.max(0,maxY));
}

/* ═══════════════════════════════════════════════════════
   WIN CHECK
═══════════════════════════════════════════════════════ */
function checkWin(){
  const hasCY0=findBldg('yard',0),hasMCV0=units.find(u=>u.playerId===0&&u.def.isMCV&&!u.dead);
  const aiAlive=buildings.some(b=>b.playerId===1&&!b.dead)||units.some(u=>u.playerId===1&&!u.dead&&u.def.dmg>0);
  if(!hasCY0&&!hasMCV0){gameOver=true;gameOverMsg='DEFEAT — Base Destroyed';}
  if(!aiAlive){gameOver=true;gameOverMsg='VICTORY — Enemy Eliminated!';}
}

/* ═══════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════ */
function render(){
  const W=GW(),H=GH();
  ctx.clearRect(0,0,canvas.width,H);
  renderBg();
  ctx.drawImage(bgCv,vp.x,vp.y,W,H,0,0,W,H);

  for(const b of buildings)if(!b.dead)b.draw();
  for(const u of units)if(!u.dead)u.draw();

  // Shot lines
  for(const e of effects){
    if(!isVis(e.x,e.y)&&!isVis(e.tx,e.ty))continue;
    ctx.beginPath();ctx.moveTo(e.x-vp.x,e.y-vp.y);ctx.lineTo(e.tx-vp.x,e.ty-vp.y);
    ctx.strokeStyle=e.col;ctx.lineWidth=2;ctx.globalAlpha=Math.min(1,e.life*8);ctx.stroke();ctx.globalAlpha=1;
  }

  drawParticles();
  drawCreditFlashes();
  drawFog();

  // Selection box
  if(mouse.down&&mouse.ds&&!placing&&mouse.x<W){
    const{sx,sy}=mouse.ds,sx2=mouse.x,sy2=mouse.y;
    ctx.strokeStyle='#4aff2a';ctx.lineWidth=1;
    ctx.strokeRect(Math.min(sx,sx2),Math.min(sy,sy2),Math.abs(sx2-sx),Math.abs(sy2-sy));
    ctx.fillStyle='rgba(74,255,42,0.04)';ctx.fillRect(Math.min(sx,sx2),Math.min(sy,sy2),Math.abs(sx2-sx),Math.abs(sy2-sy));
  }

  // Placement ghost
  if(placing&&mouse.x<W){
    const def=BDEFS[placing];
    const tx=Math.floor(mouse.wx/TILE)-Math.floor(def.w/2);
    const ty=Math.floor(mouse.wy/TILE)-Math.floor(def.h/2);
    const ok=canPlace(placing,tx,ty,0);
    const bx=tx*TILE-vp.x,by=ty*TILE-vp.y;
    ctx.fillStyle=ok?'rgba(74,255,42,0.2)':'rgba(255,50,50,0.22)';ctx.fillRect(bx,by,def.w*TILE,def.h*TILE);
    ctx.strokeStyle=ok?'#4aff2a':'#f55';ctx.lineWidth=2;ctx.strokeRect(bx,by,def.w*TILE,def.h*TILE);
    ctx.fillStyle=ok?'#fff':'#f88';ctx.font='bold 9px monospace';ctx.textAlign='center';
    ctx.fillText(def.name,bx+def.w*TILE/2,by+def.h*TILE/2);
    ctx.font='8px monospace';ctx.fillText(`$${def.cost}`,bx+def.w*TILE/2,by+def.h*TILE/2+12);
  }

  drawInfoBar();
  drawSidebar();

  // Game over
  if(gameOver){
    ctx.fillStyle='rgba(0,0,0,0.8)';ctx.fillRect(0,0,W,H);
    const win=gameOverMsg.includes('VICTORY');
    ctx.shadowColor=win?'#4aff2a':'#ff4422';ctx.shadowBlur=30;
    ctx.fillStyle=win?'#4aff2a':'#ff4422';ctx.font='bold 2.4rem monospace';ctx.textAlign='center';
    ctx.fillText(gameOverMsg,W/2,H/2-22);ctx.shadowBlur=0;
    ctx.fillStyle='#aaa';ctx.font='1rem monospace';ctx.fillText('Press R to restart',W/2,H/2+18);
    if(win&&tick%3===0){
      for(let i=0;i<4;i++)particles.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*100,vy:-120-Math.random()*80,life:1.5,ml:1.5,r:3+Math.random()*4,col:`hsl(${80+Math.random()*60},100%,60%)`});
    }
  }
}

/* ═══════════════════════════════════════════════════════
   UPDATE
═══════════════════════════════════════════════════════ */
function update(dt){
  tick++;
  updateCam(dt);
  if(!gameOver){
    updateFog();
    for(const u of units)u.update(dt);
    units=units.filter(u=>!u.dead);
    buildings=buildings.filter(b=>{if(b.dead)return false;b.update(dt);return true;});
    effects=effects.filter(e=>{e.life-=dt;return e.life>0;});
    updateParticles(dt);
    updateCreditFlashes(dt);
    updateAI(dt);
    if(tick%60===0)checkWin();
  } else updateParticles(dt);
}

/* ═══════════════════════════════════════════════════════
   GAME LOOP
═══════════════════════════════════════════════════════ */
function loop(ts){
  const dt=Math.min((ts-lastTs)/1000,0.05);lastTs=ts;
  update(dt);render();rafId=requestAnimationFrame(loop);
}

/* ═══════════════════════════════════════════════════════
   INIT / RESET
═══════════════════════════════════════════════════════ */
function reset(){
  units=[];buildings=[];effects=[];particles=[];creditFlashes=[];
  selected.clear();placing=null;uid=0;tick=0;
  gameOver=false;gameOverMsg='';bgDirty=true;sideTab='bldg';
  aiTimer=0;aiAtkTimer=20;aiBuildIdx=0;vp={x:0,y:0};
  genMap();
  players=[
    {id:0,isHuman:true, color:'#4aff2a',credits:2000,power:0},
    {id:1,isHuman:false,color:'#ff9900',credits:2500,power:0},
  ];
  spawnUnit('mcv',0,7*TILE,7*TILE);
  buildings.push(new Building('yard',1,MAP_W-12,MAP_H-12));
  buildings.push(new Building('power',1,MAP_W-8,MAP_H-15));
  recalcPwr(1);
  spawnUnit('harvester',1,(MAP_W-8)*TILE,(MAP_H-10)*TILE);
}

function init(){
  canvas=document.getElementById('g-canvas');ctx=canvas.getContext('2d');
  bgCv=document.createElement('canvas');bgCv.width=MAP_W*TILE;bgCv.height=MAP_H*TILE;bgCtx=bgCv.getContext('2d');
  initAudio();
  function resize(){canvas.width=canvas.parentElement.clientWidth;canvas.height=canvas.parentElement.clientHeight;}
  resize();window.addEventListener('resize',resize);
  setupInput();reset();
  lastTs=performance.now();rafId=requestAnimationFrame(loop);
}

function restart(){if(rafId)cancelAnimationFrame(rafId);reset();lastTs=performance.now();rafId=requestAnimationFrame(loop);}

window.cncGame={start:init,stop:()=>{if(rafId){cancelAnimationFrame(rafId);rafId=null;}},restart};
})();
