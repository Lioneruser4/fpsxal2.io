// ═══════════════════════════════════════════════════════════════════════════
//  SAVAŞ OYUNU  –  game.js  v2
// ═══════════════════════════════════════════════════════════════════════════
const SERVER = ‘https://saskioyunu-1-2d6i.onrender.com’;

const CFG = {
MAP_W: 3200, MAP_H: 3200,
SPEED: 210,
BULLET_SPEED: 620,
SHOOT_CD: 280,
R: 18,
TILE: 80
};

// ── Durum ─────────────────────────────────────────────────────────────────
let socket;
let myId, myTeam, myRoom;
let myX = 200, myY = 200, myAngle = 0, myHp = 100;
let alive = true;
let kills = 0, deaths = 0;
let lastShoot = 0;
let animState = ‘idle’, animFrame = 0, animTimer = 0;
let jumping = false, jumpVy = 0, jumpY = 0;
let shootFlash = false, shootFlashT = 0;
let players = {}, bullets = [];
let walls = [];
let camX = 0, camY = 0;
let canvas, ctx, miniCanvas, miniCtx;
let keys = {};
let joyMove = { x: 0, y: 0 };
let lastMouseX = 0, lastMouseY = 0;
let mouseOnCanvas = false;
let playerName = ‘’;

// ── Telegram kullanıcı adını al ───────────────────────────────────────────
function initTelegram() {
try {
const tg = window.Telegram?.WebApp;
if (tg) {
tg.ready();
tg.expand();
const u = tg.initDataUnsafe?.user;
if (u && u.id) {
const first = u.first_name || ‘’;
const last  = u.last_name  || ‘’;
playerName  = (first + (last ? ’ ’ + last : ‘’)).trim();
return;
}
}
} catch(e) {}
// Telegram yoksa ya da user gelmezse random guest
playerName = ‘Guest’ + Math.floor(Math.random() * 9000 + 1000);
}

// ── Duvar haritası (Backrooms + askeri üsler) ─────────────────────────────
function buildMap() {
walls = [];
const W = CFG.MAP_W, H = CFG.MAP_H;

// Dış çerçeve
walls.push(
{ x:0,   y:0,   w:W,   h:24  },
{ x:0,   y:H-24,w:W,   h:24  },
{ x:0,   y:0,   w:24,  h:H   },
{ x:W-24,y:0,   w:24,  h:H   }
);

// ── Kırmızı Üs duvarları (sol-üst) ──────────────────────────────────
// Üs: 80-700 x 80-700 açık kutu (kapı var)
walls.push(
{ x:80,  y:80,  w:620, h:20  }, // üst
{ x:80,  y:80,  w:20,  h:620 }, // sol
{ x:80,  y:680, w:260, h:20  }, // alt sol parça
{ x:440, y:680, w:260, h:20  }, // alt sağ parça (ortada kapı)
{ x:700, y:80,  w:20,  h:260 }, // sağ üst parça
{ x:700, y:440, w:20,  h:260 }, // sağ alt parça (sağda kapı)
);

// ── Mavi Üs duvarları (sağ-alt) ─────────────────────────────────────
const bx = W - 720, by = H - 720;
walls.push(
{ x:bx,    y:by+600, w:620, h:20  }, // alt
{ x:bx+600,y:by,     w:20,  h:620 }, // sağ
{ x:bx,    y:by,     w:260, h:20  }, // üst sol parça
{ x:bx+360,y:by,     w:260, h:20  }, // üst sağ parça
{ x:bx,    y:by,     w:20,  h:260 }, // sol üst parça
{ x:bx,    y:by+360, w:20,  h:260 }, // sol alt parça
);

// ── İç koridorlar / odalar ────────────────────────────────────────────
const inner = [
// Merkez yatay duvar (kapı ortada)
{ x:900,  y:1580, w:550, h:20 },
{ x:1750, y:1580, w:550, h:20 },
// Merkez dikey duvar
{ x:1580, y:900,  w:20,  h:550 },
{ x:1580, y:1750, w:20,  h:550 },
// Sol koridor
{ x:800,  y:300,  w:20,  h:800 },
{ x:800,  y:300,  w:400, h:20  },
{ x:1200, y:300,  w:20,  h:400 },
{ x:800,  y:1100, w:400, h:20  },
// Sağ koridor
{ x:2380, y:300,  w:20,  h:800 },
{ x:1980, y:300,  w:400, h:20  },
{ x:1980, y:300,  w:20,  h:400 },
{ x:1980, y:1100, w:400, h:20  },
// Alt sol
{ x:800,  y:2100, w:20,  h:800 },
{ x:800,  y:2100, w:400, h:20  },
{ x:1200, y:2100, w:20,  h:400 },
{ x:800,  y:2900, w:400, h:20  },
// Alt sağ
{ x:2380, y:2100, w:20,  h:800 },
{ x:1980, y:2100, w:400, h:20  },
{ x:1980, y:2100, w:20,  h:400 },
{ x:1980, y:2900, w:400, h:20  },
// Merkez bloklar
{ x:1460, y:1460, w:280, h:280 },
{ x:500,  y:1500, w:100, h:100 },
{ x:2600, y:1500, w:100, h:100 },
{ x:1500, y:500,  w:100, h:100 },
{ x:1500, y:2600, w:100, h:100 },
{ x:1100, y:1100, w:80,  h:80  },
{ x:2020, y:1100, w:80,  h:80  },
{ x:1100, y:2020, w:80,  h:80  },
{ x:2020, y:2020, w:80,  h:80  },
];
walls.push(…inner);
}

function wallCollide(x, y, r) {
for (const w of walls) {
const cx = Math.max(w.x, Math.min(w.x+w.w, x));
const cy = Math.max(w.y, Math.min(w.y+w.h, y));
const dx = x-cx, dy = y-cy;
if (dx*dx+dy*dy < r*r) return true;
}
return false;
}

// ── Animasyon ─────────────────────────────────────────────────────────────
function tickAnim(dt) {
const spd = animState === ‘walk’ ? 110 : animState === ‘jump’ ? 140 : animState === ‘shoot’ ? 70 : 400;
const frames = animState === ‘walk’ ? 4 : 2;
animTimer += dt;
if (animTimer > spd) { animTimer = 0; animFrame = (animFrame+1) % frames; }
if (shootFlash) { shootFlashT -= dt; if (shootFlashT <= 0) shootFlash = false; }
}

// ── Asker çizimi ──────────────────────────────────────────────────────────
function drawSoldier(cx, cy, angle, team, hp, name, isMe, st, fr, jy) {
ctx.save();
ctx.translate(cx, cy + jy);

const col  = team === ‘red’ ? ‘#c0392b’ : ‘#1a6fa8’;
const dark = team === ‘red’ ? ‘#922b21’ : ‘#154360’;
const skin = ‘#f0c080’;

// Gölge
ctx.fillStyle = ‘rgba(0,0,0,0.2)’;
ctx.beginPath(); ctx.ellipse(0,16,16,5,0,0,Math.PI*2); ctx.fill();

const bob  = (st===‘walk’) ? Math.sin(fr*Math.PI)*3 : 0;
const legL = (st===‘walk’) ? Math.sin(fr*Math.PI)*9  : 0;

// Bacaklar
ctx.fillStyle = dark;
ctx.fillRect(-9, 8+bob,    8, 14+legL*0.5);
ctx.fillRect( 1, 8+bob,    8, 14-legL*0.5);
// Çizmeler
ctx.fillStyle = ‘#1a1a1a’;
ctx.fillRect(-10,20+bob+legL*0.5,  10, 5);
ctx.fillRect(  0,20+bob-legL*0.5,  10, 5);

// Gövde
ctx.fillStyle = col;
ctx.fillRect(-11,-8+bob,22,18);
// Ceket detay
ctx.fillStyle = dark;
ctx.fillRect(-9,-5+bob,5,3);
ctx.fillRect( 4,-1+bob,4,4);
ctx.fillRect(-4, 5+bob,3,3);
// Kemer
ctx.fillStyle = ‘#1a1a1a’;
ctx.fillRect(-11, 8+bob, 22, 3);

// Kollar
const armS = (st===‘walk’) ? Math.sin(fr*Math.PI)*8 : 0;
ctx.fillStyle = col;
ctx.save(); ctx.translate(-15,-1+bob); ctx.rotate(-armS*0.04); ctx.fillRect(-4,0,8,12); ctx.restore();
ctx.save(); ctx.translate( 15,-1+bob); ctx.rotate( armS*0.04); ctx.fillRect(-4,0,8,12); ctx.restore();

// Baş + kask
ctx.fillStyle = skin;
ctx.fillRect(-8,-21+bob,16,14);
ctx.fillStyle = dark;
ctx.fillRect(-9,-24+bob,18,7);
ctx.fillRect(-7,-28+bob,14,5);
// Gözler
ctx.fillStyle = ‘#222’;
ctx.fillRect(-5,-17+bob,3,3);
ctx.fillRect( 2,-17+bob,3,3);

// Silah
ctx.save();
ctx.translate(13,1+bob);
ctx.rotate(angle);
ctx.fillStyle = ‘#222’; ctx.fillRect(0,-2,24,4);
ctx.fillStyle = ‘#444’; ctx.fillRect(20,-3,7,6);
ctx.fillStyle = ‘#555’; ctx.fillRect(-2,-1,4,2); // stok
if (st===‘shoot’ || (isMe && shootFlash)) {
ctx.fillStyle=‘rgba(255,200,0,0.9)’;
ctx.beginPath(); ctx.ellipse(32,0,10,5,0,0,Math.PI*2); ctx.fill();
}
ctx.restore();

// Can barı
const bw = 38, bh = 4;
const ratio = Math.max(0,hp/100);
ctx.fillStyle=‘rgba(0,0,0,0.6)’; ctx.fillRect(-bw/2,-36+bob,bw,bh);
ctx.fillStyle = ratio>0.5?’#27ae60’:ratio>0.25?’#e67e22’:’#e74c3c’;
ctx.fillRect(-bw/2,-36+bob,bw*ratio,bh);

// İsim
ctx.textAlign=‘center’;
ctx.font = isMe ? ‘bold 11px Arial’:‘10px Arial’;
ctx.fillStyle = isMe ? ‘#FFD700’:’#eee’;
ctx.shadowColor=’#000’; ctx.shadowBlur=3;
ctx.fillText(name.substring(0,14),0,-41+bob);
ctx.shadowBlur=0;

ctx.restore();
}

// ── Harita çizimi ─────────────────────────────────────────────────────────
function drawWorld() {
const W=canvas.width, H=canvas.height;
const T=CFG.TILE;

// Zemin fayanslar
for (let tx=Math.floor(camX/T)*T; tx<camX+W+T; tx+=T) {
for (let ty=Math.floor(camY/T)*T; ty<camY+H+T; ty+=T) {
const even=((tx/T)+(ty/T))%2===0;
ctx.fillStyle = even ? ‘#ccc090’:’#bfb785’;
ctx.fillRect(tx-camX,ty-camY,T,T);
}
}
// Hafif grid
ctx.strokeStyle=‘rgba(0,0,0,0.07)’; ctx.lineWidth=1;
for (let tx=Math.floor(camX/T)*T; tx<camX+W+T; tx+=T) {
ctx.beginPath(); ctx.moveTo(tx-camX,0); ctx.lineTo(tx-camX,H); ctx.stroke();
}
for (let ty=Math.floor(camY/T)*T; ty<camY+H+T; ty+=T) {
ctx.beginPath(); ctx.moveTo(0,ty-camY); ctx.lineTo(W,ty-camY); ctx.stroke();
}

// ── Kırmızı üs zemini ────────────────────────────────────────────────
ctx.fillStyle=‘rgba(231,76,60,0.12)’;
ctx.fillRect(80-camX, 80-camY, 640, 640);
ctx.strokeStyle=‘rgba(231,76,60,0.5)’; ctx.lineWidth=3;
ctx.strokeRect(80-camX, 80-camY, 640, 640);
ctx.fillStyle=‘rgba(231,76,60,0.7)’;
ctx.font=‘bold 18px Arial’; ctx.textAlign=‘center’;
ctx.fillText(‘🔴 KIRMIZI ÜS’, 400-camX, 130-camY);

// ── Mavi üs zemini ────────────────────────────────────────────────────
const bx=CFG.MAP_W-720, by=CFG.MAP_H-720;
ctx.fillStyle=‘rgba(41,128,185,0.12)’;
ctx.fillRect(bx-camX, by-camY, 640, 640);
ctx.strokeStyle=‘rgba(41,128,185,0.5)’; ctx.lineWidth=3;
ctx.strokeRect(bx-camX, by-camY, 640, 640);
ctx.fillStyle=‘rgba(41,128,185,0.7)’;
ctx.font=‘bold 18px Arial’; ctx.textAlign=‘center’;
ctx.fillText(‘🔵 MAVİ ÜS’, bx+320-camX, by+50-camY);

// ── Duvarlar ──────────────────────────────────────────────────────────
for (const w of walls) {
const wx=w.x-camX, wy=w.y-camY;
if (wx>W||wy>H||wx+w.w<0||wy+w.h<0) continue;
ctx.fillStyle=’#5a4530’; ctx.fillRect(wx,wy,w.w,w.h);
ctx.fillStyle=’#7a6040’; ctx.fillRect(wx,wy,w.w,Math.min(5,w.h));
ctx.fillStyle=’#3a2a18’; ctx.fillRect(wx+w.w-Math.min(5,w.w),wy,Math.min(5,w.w),w.h);
// tuğla doku
ctx.fillStyle=‘rgba(0,0,0,0.08)’;
for (let bx2=wx;bx2<wx+w.w;bx2+=22) for (let by2=wy;by2<wy+w.h;by2+=12) ctx.fillRect(bx2,by2,20,1);
}
}

function drawBullets() {
for (const b of bullets) {
const bx=b.x-camX, by=b.y-camY;
if (bx<-10||bx>canvas.width+10||by<-10||by>canvas.height+10) continue;
ctx.save();
ctx.shadowColor=’#ffa500’; ctx.shadowBlur=8;
ctx.fillStyle=’#FFD700’;
ctx.beginPath(); ctx.arc(bx,by,4,0,Math.PI*2); ctx.fill();
ctx.strokeStyle=‘rgba(255,200,0,0.3)’; ctx.lineWidth=2;
ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx-b.vx*18,by-b.vy*18); ctx.stroke();
ctx.restore();
}
}

function drawMinimap() {
if (!miniCanvas) return;
const mw=miniCanvas.width, mh=miniCanvas.height;
const sx=mw/CFG.MAP_W, sy=mh/CFG.MAP_H;
miniCtx.clearRect(0,0,mw,mh);
miniCtx.fillStyle=’#c8b878’; miniCtx.fillRect(0,0,mw,mh);
// üsler
miniCtx.fillStyle=‘rgba(231,76,60,0.3)’;   miniCtx.fillRect(80*sx,80*sy,640*sx,640*sy);
miniCtx.fillStyle=‘rgba(41,128,185,0.3)’;  miniCtx.fillRect((CFG.MAP_W-720)*sx,(CFG.MAP_H-720)*sy,640*sx,640*sy);
// duvarlar
miniCtx.fillStyle=’#5a4530’;
for (const w of walls) miniCtx.fillRect(w.x*sx,w.y*sy,Math.max(1,w.w*sx),Math.max(1,w.h*sy));
// oyuncular
for (const id in players) {
const p=players[id];
if (!p.alive) continue;
miniCtx.fillStyle = id===myId ? ‘#FFD700’ : p.team===‘red’ ? ‘#e74c3c’ : ‘#3498db’;
miniCtx.fillRect(p.x*sx-2,p.y*sy-2,4,4);
}
// görüş kutusu
miniCtx.strokeStyle=‘rgba(255,255,255,0.5)’; miniCtx.lineWidth=1;
miniCtx.strokeRect(camX*sx,camY*sy,canvas.width*sx,canvas.height*sy);
}

// ── Girdi ─────────────────────────────────────────────────────────────────
function setupInput() {
window.addEventListener(‘keydown’,e=>{ keys[e.code]=true; if(e.code===‘Space’){e.preventDefault();doJump();} });
window.addEventListener(‘keyup’,  e=>{ keys[e.code]=false; });

canvas.addEventListener(‘mousemove’,e=>{
const r=canvas.getBoundingClientRect();
lastMouseX=e.clientX-r.left; lastMouseY=e.clientY-r.top; mouseOnCanvas=true;
});
canvas.addEventListener(‘mouseleave’,()=>mouseOnCanvas=false);
canvas.addEventListener(‘click’,e=>{
const r=canvas.getBoundingClientRect();
const wx=e.clientX-r.left+camX, wy=e.clientY-r.top+camY;
tryShoot(wx,wy);
});
canvas.addEventListener(‘mousedown’,e=>{
if(e.button===0){ const r=canvas.getBoundingClientRect(); const wx=e.clientX-r.left+camX, wy=e.clientY-r.top+camY; tryShoot(wx,wy); }
});

// Joystick sol
const joy=document.getElementById(‘joystick’);
const jknob=document.getElementById(‘joy-knob’);
let jt=null, jOrigin={x:0,y:0};
joy.addEventListener(‘touchstart’,e=>{ e.preventDefault(); const t=e.changedTouches[0]; jt=t.identifier; const r=joy.getBoundingClientRect(); jOrigin={x:r.left+r.width/2,y:r.top+r.height/2}; },{passive:false});
joy.addEventListener(‘touchmove’,e=>{ e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier!==jt) continue; const dx=t.clientX-jOrigin.x, dy=t.clientY-jOrigin.y; const d=Math.sqrt(dx*dx+dy*dy); const mx=50; const nx=d>mx?dx/d*mx:dx; const ny=d>mx?dy/d*mx:dy; joyMove={x:nx/mx,y:ny/mx}; jknob.style.transform=`translate(calc(-50% + ${nx}px),calc(-50% + ${ny}px))`; } },{passive:false});
const jEnd=()=>{ joyMove={x:0,y:0}; jknob.style.transform=‘translate(-50%,-50%)’; };
joy.addEventListener(‘touchend’,jEnd); joy.addEventListener(‘touchcancel’,jEnd);

// Aim joystick sağ
const aim=document.getElementById(‘aim-joystick’);
const aknob=document.getElementById(‘aim-knob’);
let at=null, aOrigin={x:0,y:0};
aim.addEventListener(‘touchstart’,e=>{ e.preventDefault(); const t=e.changedTouches[0]; at=t.identifier; const r=aim.getBoundingClientRect(); aOrigin={x:r.left+r.width/2,y:r.top+r.height/2}; },{passive:false});
aim.addEventListener(‘touchmove’,e=>{ e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier!==at) continue; const dx=t.clientX-aOrigin.x, dy=t.clientY-aOrigin.y; const d=Math.sqrt(dx*dx+dy*dy); const mx=50; const nx=d>mx?dx/d*mx:dx; const ny=d>mx?dy/d*mx:dy; myAngle=Math.atan2(ny,nx); aknob.style.transform=`translate(calc(-50% + ${nx}px),calc(-50% + ${ny}px))`; if(d>15){ const tx2=myX+Math.cos(myAngle)*200; const ty2=myY+Math.sin(myAngle)*200; tryShoot(tx2,ty2); } } },{passive:false});
const aEnd=()=>{ aknob.style.transform=‘translate(-50%,-50%)’; };
aim.addEventListener(‘touchend’,aEnd); aim.addEventListener(‘touchcancel’,aEnd);

// Ateş butonu
const sb=document.getElementById(‘shoot-btn’);
sb.addEventListener(‘touchstart’,e=>{ e.preventDefault(); const tx=myX+Math.cos(myAngle)*200; const ty=myY+Math.sin(myAngle)*200; tryShoot(tx,ty); },{passive:false});

// Zıpla
document.getElementById(‘jump-btn’).addEventListener(‘touchstart’,e=>{ e.preventDefault(); doJump(); },{passive:false});
}

function doJump() {
if (!jumping && alive) { jumping=true; jumpVy=-7; animState=‘jump’; }
}

function tryShoot(tx, ty) {
if (!alive) return;
const now=Date.now();
if (now-lastShoot < CFG.SHOOT_CD) return;
lastShoot=now;
const dx=tx-myX, dy=ty-myY, dist=Math.sqrt(dx*dx+dy*dy)||1;
const vx=dx/dist, vy=dy/dist;
const rnd=Math.random();
const part=rnd<0.14?‘head’:rnd<0.24?‘feet’:‘body’;
myAngle=Math.atan2(vy,vx);
socket.emit(‘shoot’,{x:myX,y:myY,vx,vy,part});
shootFlash=true; shootFlashT=120;
// lokal mermi
bullets.push({id:‘l_’+now,x:myX,y:myY,vx,vy,owner:myId,ownerTeam:myTeam,part,life:2000,local:true});
}

// ── Update ────────────────────────────────────────────────────────────────
let lastFrame=0, gameRunning=false;

function loop(ts) {
if (!gameRunning) return;
const dt=Math.min(ts-lastFrame,50); lastFrame=ts;
update(dt); render();
requestAnimationFrame(loop);
}

function update(dt) {
if (!alive) return;

// Hareket
let dx=joyMove.x, dy=joyMove.y;
if(keys[‘KeyW’]||keys[‘ArrowUp’])    dy-=1;
if(keys[‘KeyS’]||keys[‘ArrowDown’])  dy+=1;
if(keys[‘KeyA’]||keys[‘ArrowLeft’])  dx-=1;
if(keys[‘KeyD’]||keys[‘ArrowRight’]) dx+=1;
const mag=Math.sqrt(dx*dx+dy*dy);
if(mag>0){
const spd=CFG.SPEED*dt/1000;
const nx=myX+(dx/mag)*spd, ny=myY+(dy/mag)*spd;
if(!wallCollide(nx,myY,CFG.R)) myX=Math.max(20,Math.min(CFG.MAP_W-20,nx));
if(!wallCollide(myX,ny,CFG.R)) myY=Math.max(20,Math.min(CFG.MAP_H-20,ny));
if(!jumping) animState=‘walk’;
} else {
if(!jumping&&animState!==‘shoot’) animState=‘idle’;
}

// Zıplama
if(jumping){
jumpVy+=0.55; jumpY+=jumpVy;
if(jumpY>=0){ jumpY=0; jumping=false; jumpVy=0; }
}

// Ateş animasyonu önceliği
if(shootFlash) animState=‘shoot’;
else if(!jumping&&mag===0) animState=‘idle’;

// Klavye ateşi
if((keys[‘KeyF’]||keys[‘ControlLeft’])&&alive){
const tx=myX+Math.cos(myAngle)*200, ty=myY+Math.sin(myAngle)*200;
tryShoot(tx,ty);
}

// Mouse aim
if(mouseOnCanvas){
myAngle=Math.atan2(lastMouseY-canvas.height/2, lastMouseX-canvas.width/2);
}

// Kamera
camX=Math.max(0,Math.min(CFG.MAP_W-canvas.width,  myX-canvas.width/2));
camY=Math.max(0,Math.min(CFG.MAP_H-canvas.height, myY-canvas.height/2+jumpY));

tickAnim(dt);

// Lokal mermi hareketi
const keep=[];
for(const b of bullets){
if(!b.local){keep.push(b);continue;}
b.x+=b.vx*CFG.BULLET_SPEED*dt/1000;
b.y+=b.vy*CFG.BULLET_SPEED*dt/1000;
b.life-=dt;
if(b.life>0&&b.x>=0&&b.x<=CFG.MAP_W&&b.y>=0&&b.y<=CFG.MAP_H) keep.push(b);
}
bullets=keep;

// Sunucu pozisyon
socket.emit(‘move’,{x:myX,y:myY,angle:myAngle,anim:animState});

// Local player güncelle
if(players[myId]){ players[myId].x=myX; players[myId].y=myY; players[myId].angle=myAngle; players[myId].hp=myHp; players[myId].anim=animState; }

updateHUD();
}

function render() {
ctx.clearRect(0,0,canvas.width,canvas.height);
drawWorld();
drawBullets();

// Oyuncular
for(const id in players){
const p=players[id];
if(!p.alive) continue;
const sx=p.x-camX, sy=p.y-camY;
const jy=id===myId?jumpY:0;
if(sx<-80||sx>canvas.width+80||sy<-100||sy>canvas.height+100) continue;
drawSoldier(sx,sy,p.angle,p.team,p.hp,p.name,id===myId,id===myId?animState:(p.anim||‘idle’),animFrame,jy);
}

drawMinimap();

// Ölüm ekranı
if(!alive){
ctx.fillStyle=‘rgba(0,0,0,0.6)’; ctx.fillRect(0,0,canvas.width,canvas.height);
ctx.fillStyle=’#e74c3c’; ctx.font=‘bold 52px Arial’; ctx.textAlign=‘center’;
ctx.fillText(‘ÖLDÜN!’,canvas.width/2,canvas.height/2-20);
ctx.fillStyle=’#fff’; ctx.font=‘22px Arial’;
ctx.fillText(‘5 saniye içinde geri dönüyorsun…’,canvas.width/2,canvas.height/2+30);
}
}

function updateHUD(){
const hv=document.getElementById(‘hp-val’); if(hv) hv.textContent=myHp;
const hb=document.getElementById(‘hp-bar-inner’);
if(hb){ hb.style.width=myHp+’%’; hb.style.background=myHp>50?’#27ae60’:myHp>25?’#e67e22’:’#e74c3c’; }
const kv=document.getElementById(‘kills-val’); if(kv) kv.textContent=kills;
const dv=document.getElementById(‘deaths-val’); if(dv) dv.textContent=deaths;
}

// ── Socket ────────────────────────────────────────────────────────────────
function setupSocket(){
socket=io(SERVER,{ reconnection:true, reconnectionAttempts:Infinity, reconnectionDelay:1000, reconnectionDelayMax:5000 });

socket.on(‘connect’,()=>{
document.getElementById(‘conn-status’).textContent=‘🟢 Bağlandı’;
// Eğer önceden bir oyuna katıldıysak yeniden katıl
if(myRoom){ socket.emit(‘join’,{name:playerName}); }
});
socket.on(‘disconnect’,()=>{ document.getElementById(‘conn-status’).textContent=‘🔴 Bağlantı kesildi…’; });
socket.on(‘connect_error’,()=>{ document.getElementById(‘conn-status’).textContent=‘🟡 Yeniden bağlanıyor…’; });

socket.on(‘joined’,d=>{
myId=d.id; myTeam=d.team; myRoom=d.roomId;
myX=d.x; myY=d.y; myHp=100; alive=true;
players[myId]={id:myId,name:playerName,team:myTeam,x:myX,y:myY,angle:0,hp:100,alive:true,anim:‘idle’};
document.getElementById(‘team-label’).textContent=myTeam===‘red’?‘🔴 KIRMIZI’:‘🔵 MAVİ’;
document.getElementById(‘team-label’).style.color=myTeam===‘red’?’#e74c3c’:’#3498db’;
document.getElementById(‘room-label’).textContent=’Oda: ’+myRoom;
});

socket.on(‘allPlayers’,list=>{
for(const p of list) players[p.id]=p;
});

socket.on(‘state’,d=>{
for(const id in d.players){
if(id===myId) continue;
players[id]=d.players[id];
}
// Sunucu mermi (başkalarınınki)
bullets=bullets.filter(b=>b.local);
for(const b of (d.bullets||[])){
if(b.owner!==myId) bullets.push(b);
}
});

socket.on(‘pJoin’,p=>{
if(p.id!==myId){ players[p.id]=p; notify(`${p.name} katıldı!`,p.team); }
});
socket.on(‘pLeft’,id=>{
const n=players[id]?.name||’’; delete players[id];
if(n) notify(n+’ ayrıldı’,‘neutral’);
});

socket.on(‘hit’,d=>{
if(d.target===myId){ myHp=d.hp; if(players[myId]) players[myId].hp=myHp; showDmg(d.dmg,d.part); }
else if(players[d.target]) players[d.target].hp=d.hp;
});

socket.on(‘died’,d=>{
if(d.id===myId){ alive=false; deaths++; }
if(d.killer===myId){ kills++; notify(‘Öldürdün! 🎯’,‘green’); }
if(players[d.id]) players[d.id].alive=false;
});

socket.on(‘respawn’,d=>{
myX=d.x; myY=d.y; myHp=100; alive=true; jumping=false; jumpY=0;
if(players[myId]){ players[myId].x=myX; players[myId].y=myY; players[myId].hp=100; players[myId].alive=true; }
notify(‘Geri döndün!’,‘blue’);
});

socket.on(‘roomInfo’,d=>{
document.getElementById(‘room-label’).textContent=`Oda: ${myRoom||''} 🔴${d.red} 🔵${d.blue}`;
});

socket.on(‘roomsList’,list=>renderRooms(list));
}

function notify(msg,type){
const el=document.getElementById(‘notif’);
if(!el) return;
el.textContent=msg; el.className=‘notif show ‘+(type||’’);
clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove(‘show’),3000);
}
function showDmg(dmg,part){
const el=document.getElementById(‘dmg-popup’);
if(!el) return;
const lbl={head:‘💀 KAFA!’,feet:‘🦵 Ayak’,body:‘💥 Gövde’};
el.textContent=`-${dmg} ${lbl[part]||''}`;
el.classList.remove(‘show’); void el.offsetWidth; el.classList.add(‘show’);
}

function renderRooms(list){
const el=document.getElementById(‘rooms-list’); if(!el) return;
el.innerHTML=’’;
if(!list.length){ el.innerHTML=’<div class="no-rooms">Henüz oda yok.</div>’; return; }
for(const r of list){
const full=(r.red+r.blue)>=20;
const d=document.createElement(‘div’); d.className=‘room-item’;
d.innerHTML=`<div class="room-info"><span class="room-name">🏠 ${r.id}</span><span class="room-teams">🔴${r.red}/10 🔵${r.blue}/10</span></div><button class="room-join-btn"${full?' disabled':''} onclick="doJoin()">${full?'DOLU':'GİR'}</button>`;
el.appendChild(d);
}
}

// ── Ekranlar ──────────────────────────────────────────────────────────────
function showScreen(id){
document.querySelectorAll(’.screen’).forEach(s=>s.classList.remove(‘active’));
document.getElementById(id)?.classList.add(‘active’);
}

function doJoin(){
socket.emit(‘join’,{name:playerName});
showScreen(‘game-screen’);
if(!gameRunning) startGame();
}

function startGame(){
canvas=document.getElementById(‘game-canvas’);
ctx=canvas.getContext(‘2d’);
miniCanvas=document.getElementById(‘minimap’);
miniCtx=miniCanvas.getContext(‘2d’);
resize(); window.addEventListener(‘resize’,resize);
buildMap();
setupInput();
gameRunning=true;
lastFrame=performance.now();
requestAnimationFrame(loop);
}

function resize(){
if(!canvas) return;
canvas.width=window.innerWidth; canvas.height=window.innerHeight;
}

// ── İlk yükleme ───────────────────────────────────────────────────────────
window.addEventListener(‘DOMContentLoaded’,()=>{
initTelegram();

// İsmi göster
document.getElementById(‘player-name-display’).textContent=playerName;

setupSocket();

document.getElementById(‘btn-find-game’).addEventListener(‘click’, doJoin);
document.getElementById(‘btn-rooms’).addEventListener(‘click’,()=>{ showScreen(‘rooms-screen’); socket.emit(‘getRooms’); });
document.getElementById(‘btn-create-room’).addEventListener(‘click’, doJoin);
document.getElementById(‘btn-back-rooms’).addEventListener(‘click’,()=>showScreen(‘main-menu’));
document.getElementById(‘btn-back-create’).addEventListener(‘click’,()=>showScreen(‘main-menu’));
document.getElementById(‘btn-create-room-confirm’).addEventListener(‘click’, doJoin);

document.addEventListener(‘contextmenu’,e=>e.preventDefault());
});
