// ═══════════════════════════════════════════════════════════════════════════
// SAVAŞ OYUNU - game.js
// ═══════════════════════════════════════════════════════════════════════════

const RENDER_URL = ‘https://saskioyunu-1-2d6i.onrender.com’;

// ── Config ─────────────────────────────────────────────────────────────────
const CFG = {
MAP_W: 2400, MAP_H: 2400,
PLAYER_SPEED: 200,
BULLET_SPEED: 600,
SHOOT_COOLDOWN: 300,
PLAYER_R: 18,
BULLET_R: 4,
TILE: 80
};

// ── State ──────────────────────────────────────────────────────────────────
let socket, myId, myTeam, myRoom;
let players = {}, bullets = [];
let camX = 0, camY = 0;
let canvas, ctx;
let keys = {};
let myX = 200, myY = 200, myAngle = 0, myHp = 100;
let alive = true;
let lastShoot = 0;
let kills = 0, deaths = 0;
let anim = ‘idle’, animFrame = 0, animTimer = 0;
let joystickMove = { x: 0, y: 0 };
let joystickActive = false;
let shootActive = false;
let lastTs = 0;
let connected = false;
let reconnectTimer = null;
let pingInterval = null;
let playerName = ‘’;
let telegramId = ‘’;
let walls = [];
let miniCanvas, miniCtx;

// ── Telegram WebApp ─────────────────────────────────────────────────────────
function getTelegramUser() {
try {
if (window.Telegram && window.Telegram.WebApp) {
const wa = window.Telegram.WebApp;
wa.ready();
wa.expand();
const u = wa.initDataUnsafe?.user;
if (u) {
return { name: u.first_name + (u.last_name ? ’ ’ + u.last_name : ‘’), id: ‘tg_’ + u.id };
}
}
} catch(e) {}
return null;
}

// ── Harita (Backrooms + Askeri) ─────────────────────────────────────────────
function generateMap() {
walls = [];
const W = CFG.MAP_W, H = CFG.MAP_H;

// Dış duvarlar
walls.push({ x: 0,   y: 0,   w: W,   h: 20  });
walls.push({ x: 0,   y: H-20,w: W,   h: 20  });
walls.push({ x: 0,   y: 0,   w: 20,  h: H   });
walls.push({ x: W-20,y: 0,   w: 20,  h: H   });

// İç oda yapısı (Backrooms tarzı)
const roomData = [
// Ana koridor
{ x: 400, y: 300, w: 20, h: 800 },
{ x: 400, y: 300, w: 600, h: 20 },
{ x: 1000, y: 300, w: 20, h: 400 },
{ x: 400, y: 1100, w: 600, h: 20 },
// Yan odalar
{ x: 600, y: 500, w: 200, h: 20 },
{ x: 600, y: 500, w: 20, h: 200 },
{ x: 800, y: 500, w: 20, h: 200 },
{ x: 600, y: 700, w: 200, h: 20 },
// Merkez alan
{ x: 1100, y: 800, w: 20, h: 600 },
{ x: 1100, y: 800, w: 400, h: 20 },
{ x: 1500, y: 800, w: 20, h: 300 },
{ x: 1100, y: 1400, w: 400, h: 20 },
{ x: 1500, y: 1100, w: 20, h: 300 },
// Sağ koridorlar
{ x: 1700, y: 400, w: 20, h: 500 },
{ x: 1700, y: 400, w: 400, h: 20 },
{ x: 2100, y: 400, w: 20, h: 500 },
{ x: 1700, y: 900, w: 400, h: 20 },
// Alt bölge
{ x: 700, y: 1500, w: 20, h: 600 },
{ x: 700, y: 1500, w: 600, h: 20 },
{ x: 1300, y: 1500, w: 20, h: 600 },
{ x: 700, y: 2100, w: 600, h: 20 },
// Ekstra engeller
{ x: 1800, y: 1500, w: 20, h: 400 },
{ x: 1800, y: 1500, w: 300, h: 20 },
{ x: 2100, y: 1500, w: 20, h: 400 },
{ x: 1800, y: 1900, w: 300, h: 20 },
// Merkez bloklar
{ x: 1050, y: 1050, w: 120, h: 120 },
{ x: 500, y: 1300, w: 80, h: 80  },
{ x: 1800, y: 1100, w: 80, h: 80 },
{ x: 900, y: 600, w: 80, h: 80  },
];
walls.push(…roomData);
}

function wallCollide(x, y, r) {
for (const w of walls) {
const cx = Math.max(w.x, Math.min(w.x + w.w, x));
const cy = Math.max(w.y, Math.min(w.y + w.h, y));
const dx = x - cx, dy = y - cy;
if (dx*dx + dy*dy < r*r) return true;
}
return false;
}

function bulletHitsWall(x, y) {
for (const w of walls) {
if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
}
return false;
}

// ── Animasyon ───────────────────────────────────────────────────────────────
const ANIMS = {
idle:   { frames: 1, speed: 500 },
walk:   { frames: 4, speed: 120 },
jump:   { frames: 2, speed: 150 },
shoot:  { frames: 2, speed: 80  }
};
let jumping = false, jumpVy = 0, jumpY2d = 0;
let shootAnim = false, shootAnimTimer = 0;

function updateAnim(dt) {
animTimer += dt;
const cur = ANIMS[anim] || ANIMS.idle;
if (animTimer > cur.speed) {
animTimer = 0;
animFrame = (animFrame + 1) % cur.frames;
}
if (shootAnim) {
shootAnimTimer -= dt;
if (shootAnimTimer <= 0) { shootAnim = false; }
}
}

// ── Çizim: Asker karakteri ──────────────────────────────────────────────────
function drawSoldier(cx, cy, angle, team, hp, name, isMe, animState, frame) {
ctx.save();
ctx.translate(cx, cy);

const col = team === ‘red’ ? ‘#e74c3c’ : ‘#2980b9’;
const dark = team === ‘red’ ? ‘#c0392b’ : ‘#1a5276’;
const skin = ‘#f5cba7’;

// Gölge
ctx.fillStyle = ‘rgba(0,0,0,0.18)’;
ctx.ellipse(0, 14, 16, 6, 0, 0, Math.PI*2);
ctx.fill();

// Vücut hareketi (yürüme sallanması)
let bob = 0;
if (animState === ‘walk’) bob = Math.sin(frame * Math.PI) * 3;

// Bacaklar
const legOff = animState === ‘walk’ ? Math.sin(frame * Math.PI) * 8 : 0;
ctx.fillStyle = dark;
// Sol bacak
ctx.fillRect(-8, 8 + bob, 7, 14 + legOff * 0.5);
// Sağ bacak
ctx.fillRect(1, 8 + bob, 7, 14 - legOff * 0.5);

// Çizmeler
ctx.fillStyle = ‘#2c2c2c’;
ctx.fillRect(-9, 20 + bob + legOff*0.5, 9, 5);
ctx.fillRect(0,  20 + bob - legOff*0.5, 9, 5);

// Gövde / forma
ctx.fillStyle = col;
ctx.fillRect(-10, -8 + bob, 20, 18);

// Kamuflaj detayları
ctx.fillStyle = dark;
ctx.fillRect(-8, -6+bob, 5, 4);
ctx.fillRect(3, -2+bob, 4, 5);
ctx.fillRect(-5, 4+bob, 3, 3);

// Kollar
const armSwing = animState === ‘walk’ ? Math.sin(frame * Math.PI) * 10 : 0;
ctx.fillStyle = col;
// Sol kol
ctx.save();
ctx.translate(-14, -2 + bob);
ctx.rotate(-armSwing * 0.04);
ctx.fillRect(-4, 0, 8, 12);
ctx.restore();
// Sağ kol (silah tutan)
ctx.save();
ctx.translate(14, -2 + bob);
ctx.rotate(armSwing * 0.04);
ctx.fillRect(-4, 0, 8, 12);
ctx.restore();

// Baş
ctx.fillStyle = skin;
ctx.fillRect(-8, -20+bob, 16, 14);

// Baret / kask
ctx.fillStyle = dark;
ctx.fillRect(-9, -22+bob, 18, 8);
ctx.fillRect(-7, -26+bob, 14, 5);

// Gözler
ctx.fillStyle = ‘#2c2c2c’;
ctx.fillRect(-5, -16+bob, 3, 3);
ctx.fillRect(2,  -16+bob, 3, 3);

// Silah
ctx.save();
ctx.translate(12, 2+bob);
ctx.rotate(angle);
ctx.fillStyle = ‘#2c2c2c’;
ctx.fillRect(0, -2, 22, 4);
ctx.fillStyle = ‘#555’;
ctx.fillRect(18, -3, 6, 6);
ctx.restore();

// Ateş animasyonu
if (animState === ‘shoot’) {
ctx.save();
ctx.translate(12, 2+bob);
ctx.rotate(angle);
ctx.fillStyle = ‘rgba(255,200,0,0.8)’;
ctx.beginPath();
ctx.ellipse(28, 0, 10, 5, 0, 0, Math.PI*2);
ctx.fill();
ctx.restore();
}

// Can barı
const barW = 36;
const barH = 4;
const hpRatio = Math.max(0, hp / 100);
ctx.fillStyle = ‘rgba(0,0,0,0.5)’;
ctx.fillRect(-barW/2, -34+bob, barW, barH);
const barCol = hpRatio > 0.5 ? ‘#2ecc71’ : hpRatio > 0.25 ? ‘#f39c12’ : ‘#e74c3c’;
ctx.fillStyle = barCol;
ctx.fillRect(-barW/2, -34+bob, barW * hpRatio, barH);

// İsim
ctx.fillStyle = isMe ? ‘#FFD700’ : ‘#fff’;
ctx.font = isMe ? ‘bold 11px Arial’ : ‘10px Arial’;
ctx.textAlign = ‘center’;
ctx.shadowColor = ‘#000’;
ctx.shadowBlur = 3;
ctx.fillText(name.substring(0, 12), 0, -38+bob);
ctx.shadowBlur = 0;

ctx.restore();
}

// ── Harita çizimi ───────────────────────────────────────────────────────────
function drawMap() {
// Zemin (Backrooms sarımtırak fayans)
const tile = CFG.TILE;
for (let tx = Math.floor(camX/tile)*tile; tx < camX + canvas.width + tile; tx += tile) {
for (let ty = Math.floor(camY/tile)*tile; ty < camY + canvas.height + tile; ty += tile) {
const row = Math.floor(tx/tile) + Math.floor(ty/tile);
ctx.fillStyle = row % 2 === 0 ? ‘#d4c89a’ : ‘#c9bb89’;
ctx.fillRect(tx - camX, ty - camY, tile, tile);
}
}

// Grid çizgileri (hafif)
ctx.strokeStyle = ‘rgba(0,0,0,0.08)’;
ctx.lineWidth = 1;
for (let tx = Math.floor(camX/tile)*tile; tx < camX + canvas.width + tile; tx += tile) {
ctx.beginPath();
ctx.moveTo(tx - camX, 0);
ctx.lineTo(tx - camX, canvas.height);
ctx.stroke();
}
for (let ty = Math.floor(camY/tile)*tile; ty < camY + canvas.height + tile; ty += tile) {
ctx.beginPath();
ctx.moveTo(0, ty - camY);
ctx.lineTo(canvas.width, ty - camY);
ctx.stroke();
}

// Duvarlar
for (const w of walls) {
const sx = w.x - camX, sy = w.y - camY;
if (sx > canvas.width || sy > canvas.height || sx + w.w < 0 || sy + w.h < 0) continue;
// Ana duvar
ctx.fillStyle = ‘#5d4e37’;
ctx.fillRect(sx, sy, w.w, w.h);
// Üst highlight
ctx.fillStyle = ‘#7a6548’;
ctx.fillRect(sx, sy, w.w, Math.min(4, w.h));
// Sağ gölge
ctx.fillStyle = ‘#3e3326’;
ctx.fillRect(sx + w.w - Math.min(4, w.w), sy, Math.min(4, w.w), w.h);
// Doku deseni
ctx.fillStyle = ‘rgba(0,0,0,0.07)’;
for (let bx = sx; bx < sx+w.w; bx += 20) {
for (let by = sy; by < sy+w.h; by += 10) {
ctx.fillRect(bx, by, 18, 1);
}
}
}

// Spawn alanları
ctx.fillStyle = ‘rgba(231, 76, 60, 0.15)’;
ctx.fillRect(100 - camX, 100 - camY, 700, 700);
ctx.strokeStyle = ‘rgba(231, 76, 60, 0.4)’;
ctx.lineWidth = 2;
ctx.strokeRect(100 - camX, 100 - camY, 700, 700);
ctx.fillStyle = ‘rgba(231,76,60,0.5)’;
ctx.font = ‘bold 20px Arial’;
ctx.textAlign = ‘center’;
ctx.fillText(‘KIRMIZI ÜSSÜ’, 450 - camX, 160 - camY);

ctx.fillStyle = ‘rgba(41, 128, 185, 0.15)’;
ctx.fillRect(1600 - camX, 1600 - camY, 700, 700);
ctx.strokeStyle = ‘rgba(41,128,185,0.4)’;
ctx.lineWidth = 2;
ctx.strokeRect(1600 - camX, 1600 - camY, 700, 700);
ctx.fillStyle = ‘rgba(41,128,185,0.5)’;
ctx.fillText(‘MAVİ ÜSSÜ’, 1950 - camX, 1660 - camY);
}

// ── Mermi çizimi ────────────────────────────────────────────────────────────
function drawBullets() {
for (const b of bullets) {
const bx = b.x - camX, by = b.y - camY;
ctx.save();
ctx.fillStyle = ‘#FFD700’;
ctx.shadowColor = ‘#FF8C00’;
ctx.shadowBlur = 8;
ctx.beginPath();
ctx.arc(bx, by, CFG.BULLET_R, 0, Math.PI*2);
ctx.fill();
// İz
ctx.strokeStyle = ‘rgba(255,200,0,0.3)’;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(bx, by);
ctx.lineTo(bx - b.vx * 20, by - b.vy * 20);
ctx.stroke();
ctx.restore();
}
}

// ── Mini harita ─────────────────────────────────────────────────────────────
function drawMinimap() {
if (!miniCanvas) return;
const mW = miniCanvas.width, mH = miniCanvas.height;
const scX = mW / CFG.MAP_W, scY = mH / CFG.MAP_H;
miniCtx.clearRect(0, 0, mW, mH);
miniCtx.fillStyle = ‘#c9bb89’;
miniCtx.fillRect(0, 0, mW, mH);

// Duvarlar
miniCtx.fillStyle = ‘#5d4e37’;
for (const w of walls) {
miniCtx.fillRect(w.x*scX, w.y*scY, Math.max(1, w.w*scX), Math.max(1, w.h*scY));
}

// Oyuncular
for (const sid in players) {
const p = players[sid];
if (!p.alive) continue;
miniCtx.fillStyle = p.team === ‘red’ ? ‘#e74c3c’ : ‘#2980b9’;
if (sid === myId) { miniCtx.fillStyle = ‘#FFD700’; }
miniCtx.fillRect(p.x*scX-2, p.y*scY-2, 4, 4);
}
// Kamera view rect
miniCtx.strokeStyle = ‘rgba(255,255,255,0.6)’;
miniCtx.lineWidth = 1;
miniCtx.strokeRect(camX*scX, camY*scY, canvas.width*scX, canvas.height*scY);
}

// ── Girdi ───────────────────────────────────────────────────────────────────
function setupInput() {
window.addEventListener(‘keydown’, e => { keys[e.code] = true; });
window.addEventListener(‘keyup’,   e => { keys[e.code] = false; });

// Mouse tıklama (masaüstü)
canvas.addEventListener(‘click’, e => {
if (!alive) return;
const rect = canvas.getBoundingClientRect();
const mx = e.clientX - rect.left + camX;
const my = e.clientY - rect.top + camY;
doShoot(mx, my);
});

// ── Mobil joystick (sol) ──────────────────────────────────────────────
const joyEl = document.getElementById(‘joystick’);
const joyKnob = document.getElementById(‘joystick-knob’);
let joyOrigin = null;

function getTouch(el, id) {
const arr = el.touches || [];
for (let i = 0; i < arr.length; i++) if (arr[i].identifier === id) return arr[i];
return null;
}

let joyTouchId = null;
joyEl.addEventListener(‘touchstart’, e => {
e.preventDefault();
const t = e.changedTouches[0];
joyTouchId = t.identifier;
const r = joyEl.getBoundingClientRect();
joyOrigin = { x: r.left + r.width/2, y: r.top + r.height/2 };
joystickActive = true;
}, { passive: false });

joyEl.addEventListener(‘touchmove’, e => {
e.preventDefault();
for (const t of e.changedTouches) {
if (t.identifier !== joyTouchId) continue;
const dx = t.clientX - joyOrigin.x;
const dy = t.clientY - joyOrigin.y;
const dist = Math.sqrt(dx*dx + dy*dy);
const max = 50;
const nx = dist > max ? dx/dist*max : dx;
const ny = dist > max ? dy/dist*max : dy;
joystickMove = { x: nx/max, y: ny/max };
joyKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
}
}, { passive: false });

function joyEnd(e) {
joystickMove = { x: 0, y: 0 };
joystickActive = false;
joyKnob.style.transform = ‘translate(-50%, -50%)’;
}
joyEl.addEventListener(‘touchend’, joyEnd);
joyEl.addEventListener(‘touchcancel’, joyEnd);

// ── Mobil ateş butonu ──────────────────────────────────────────────────
const shootBtn = document.getElementById(‘shoot-btn’);
shootBtn.addEventListener(‘touchstart’, e => {
e.preventDefault();
shootActive = true;
const now = Date.now();
if (now - lastShoot > CFG.SHOOT_COOLDOWN && alive) {
const angle = myAngle;
const tx = myX + Math.cos(angle) * 200;
const ty = myY + Math.sin(angle) * 200;
doShoot(tx, ty);
}
}, { passive: false });
shootBtn.addEventListener(‘touchend’, () => shootActive = false);

// ── Mobil zıplama ──────────────────────────────────────────────────────
const jumpBtn = document.getElementById(‘jump-btn’);
jumpBtn.addEventListener(‘touchstart’, e => {
e.preventDefault();
doJump();
}, { passive: false });

// ── Sağ taraf aim joystick ─────────────────────────────────────────────
const aimEl = document.getElementById(‘aim-joystick’);
const aimKnob = document.getElementById(‘aim-knob’);
let aimOrigin = null, aimTouchId = null;

aimEl.addEventListener(‘touchstart’, e => {
e.preventDefault();
const t = e.changedTouches[0];
aimTouchId = t.identifier;
const r = aimEl.getBoundingClientRect();
aimOrigin = { x: r.left + r.width/2, y: r.top + r.height/2 };
}, { passive: false });

aimEl.addEventListener(‘touchmove’, e => {
e.preventDefault();
for (const t of e.changedTouches) {
if (t.identifier !== aimTouchId) continue;
const dx = t.clientX - aimOrigin.x;
const dy = t.clientY - aimOrigin.y;
const dist = Math.sqrt(dx*dx + dy*dy);
const max = 50;
const nx = dist > max ? dx/dist*max : dx;
const ny = dist > max ? dy/dist*max : dy;
myAngle = Math.atan2(ny, nx);
aimKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
// Otomatik ateş
const now = Date.now();
if (dist > 20 && now - lastShoot > CFG.SHOOT_COOLDOWN && alive) {
const tx = myX + Math.cos(myAngle) * 200;
const ty = myY + Math.sin(myAngle) * 200;
doShoot(tx, ty);
}
}
}, { passive: false });

function aimEnd() {
aimKnob.style.transform = ‘translate(-50%, -50%)’;
}
aimEl.addEventListener(‘touchend’, aimEnd);
aimEl.addEventListener(‘touchcancel’, aimEnd);
}

function doJump() {
if (!jumping && alive) {
jumping = true;
jumpVy = -8;
anim = ‘jump’;
}
}

function doShoot(tx, ty) {
const now = Date.now();
if (now - lastShoot < CFG.SHOOT_COOLDOWN || !alive) return;
lastShoot = now;
const dx = tx - myX, dy = ty - myY;
const dist = Math.sqrt(dx*dx + dy*dy) || 1;
const vx = dx/dist, vy = dy/dist;

// Vücut bölgesi belirleme (basit: headshot %15 şans)
const rand = Math.random();
const bodyPart = rand < 0.15 ? ‘head’ : rand < 0.25 ? ‘feet’ : ‘body’;

socket.emit(‘shoot’, { x: myX, y: myY, vx, vy, bodyPart });
shootAnim = true;
shootAnimTimer = 150;

// Lokal mermi
bullets.push({
id: ‘local_’ + now,
x: myX, y: myY,
vx, vy,
owner: myId,
ownerTeam: myTeam,
bodyPart,
life: 2000
});
}

// ── Oyun döngüsü ────────────────────────────────────────────────────────────
let gameRunning = false;
let lastFrame = 0;

function gameLoop(ts) {
if (!gameRunning) return;
const dt = Math.min((ts - lastFrame), 50);
lastFrame = ts;

update(dt);
render();
requestAnimationFrame(gameLoop);
}

function update(dt) {
if (!alive) return;

// WASD / Ok tuşları
let dx = 0, dy = 0;
if (keys[‘KeyW’] || keys[‘ArrowUp’])    dy -= 1;
if (keys[‘KeyS’] || keys[‘ArrowDown’])  dy += 1;
if (keys[‘KeyA’] || keys[‘ArrowLeft’])  dx -= 1;
if (keys[‘KeyD’] || keys[‘ArrowRight’]) dx += 1;

// Joystick
dx += joystickMove.x;
dy += joystickMove.y;

// Normalize
const mag = Math.sqrt(dx*dx + dy*dy);
if (mag > 0) {
dx /= mag; dy /= mag;
const speed = CFG.PLAYER_SPEED * dt / 1000;
const nx = myX + dx * speed;
const ny = myY + dy * speed;
if (!wallCollide(nx, myY, CFG.PLAYER_R)) myX = Math.max(20, Math.min(CFG.MAP_W-20, nx));
if (!wallCollide(myX, ny, CFG.PLAYER_R)) myY = Math.max(20, Math.min(CFG.MAP_H-20, ny));
anim = ‘walk’;
} else {
if (!jumping) anim = ‘idle’;
}

// Zıplama (2.5D görsel)
if (jumping) {
jumpVy += 0.5;
jumpY2d += jumpVy;
if (jumpY2d >= 0) { jumpY2d = 0; jumping = false; jumpVy = 0; anim = ‘idle’; }
}

// Ateş animasyonu
if (shootAnim) anim = ‘shoot’;

// Spacebar zıplama
if (keys[‘Space’] && !jumping) doJump();

// Mouse izi (masaüstü)
if (lastMouseX !== undefined) {
myAngle = Math.atan2(lastMouseY - canvas.height/2, lastMouseX - canvas.width/2);
}

// Otomatik ateş (tuş)
if ((keys[‘KeyF’] || keys[‘ControlLeft’]) && alive) {
const tx = myX + Math.cos(myAngle) * 200;
const ty = myY + Math.sin(myAngle) * 200;
doShoot(tx, ty);
}

// Kamera
camX = myX - canvas.width/2;
camY = myY - canvas.height/2 + jumpY2d;
camX = Math.max(0, Math.min(CFG.MAP_W - canvas.width, camX));
camY = Math.max(0, Math.min(CFG.MAP_H - canvas.height, camY));

// Animasyon
updateAnim(dt);

// Lokal mermiler
const alive2 = [];
for (const b of bullets) {
if (!b.id.startsWith(‘local_’)) continue;
b.x += b.vx * CFG.BULLET_SPEED * dt/1000;
b.y += b.vy * CFG.BULLET_SPEED * dt/1000;
b.life -= dt;
if (b.life > 0 && !bulletHitsWall(b.x, b.y)) alive2.push(b);
}
bullets = bullets.filter(b => !b.id.startsWith(‘local_’)).concat(alive2);

// Sunucuya pozisyon gönder
socket.emit(‘playerMove’, { x: myX, y: myY, angle: myAngle, anim });

// Güncelle local player snapshot
if (players[myId]) {
players[myId].x = myX;
players[myId].y = myY;
players[myId].angle = myAngle;
players[myId].hp = myHp;
players[myId].anim = anim;
}

// HUD
updateHUD();
}

let lastMouseX, lastMouseY;
document.addEventListener(‘mousemove’, e => {
if (!canvas) return;
const rect = canvas.getBoundingClientRect();
lastMouseX = e.clientX - rect.left;
lastMouseY = e.clientY - rect.top;
});

function render() {
ctx.clearRect(0, 0, canvas.width, canvas.height);
drawMap();
drawBullets();

// Oyuncular
for (const sid in players) {
const p = players[sid];
if (!p.alive) continue;
const sx = p.x - camX;
const sy = p.y - camY + (sid === myId ? jumpY2d : 0);
if (sx < -60 || sx > canvas.width+60 || sy < -80 || sy > canvas.height+80) continue;
drawSoldier(sx, sy, p.angle, p.team, p.hp, p.name, sid === myId, p.anim || ‘idle’, animFrame);
}

drawMinimap();

// Ölü ekran
if (!alive) {
ctx.fillStyle = ‘rgba(0,0,0,0.55)’;
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = ‘#e74c3c’;
ctx.font = ‘bold 48px Arial’;
ctx.textAlign = ‘center’;
ctx.fillText(‘ÖLDÜN!’, canvas.width/2, canvas.height/2 - 30);
ctx.fillStyle = ‘#fff’;
ctx.font = ‘24px Arial’;
ctx.fillText(‘5 saniye içinde geri dönüyorsun…’, canvas.width/2, canvas.height/2 + 20);
}
}

function updateHUD() {
const hpEl = document.getElementById(‘hp-val’);
if (hpEl) hpEl.textContent = myHp;
const hpBar = document.getElementById(‘hp-bar-inner’);
if (hpBar) hpBar.style.width = myHp + ‘%’;
const hpBarEl = document.getElementById(‘hp-bar-inner’);
if (hpBarEl) {
hpBarEl.style.backgroundColor = myHp > 50 ? ‘#2ecc71’ : myHp > 25 ? ‘#f39c12’ : ‘#e74c3c’;
}
const killEl = document.getElementById(‘kills-val’);
if (killEl) killEl.textContent = kills;
const deathEl = document.getElementById(‘deaths-val’);
if (deathEl) deathEl.textContent = deaths;
}

// ── Socket kurulumu ─────────────────────────────────────────────────────────
function setupSocket() {
socket = io(RENDER_URL, {
reconnection: true,
reconnectionAttempts: Infinity,
reconnectionDelay: 1000,
reconnectionDelayMax: 5000
});

socket.on(‘connect’, () => {
connected = true;
document.getElementById(‘conn-status’).textContent = ‘🟢 Bağlandı’;
console.log(‘Socket bağlandı:’, socket.id);
});

socket.on(‘disconnect’, () => {
connected = false;
document.getElementById(‘conn-status’).textContent = ‘🔴 Bağlantı kesildi…’;
});

socket.on(‘connect_error’, () => {
document.getElementById(‘conn-status’).textContent = ‘🟡 Yeniden bağlanıyor…’;
});

socket.on(‘joined’, data => {
myId = data.playerId;
myTeam = data.team;
myRoom = data.roomId;
myX = data.spawnX;
myY = data.spawnY;
myHp = 100;
alive = true;
document.getElementById(‘team-label’).textContent = myTeam === ‘red’ ? ‘🔴 KIRMIZI’ : ‘🔵 MAVİ’;
document.getElementById(‘team-label’).style.color = myTeam === ‘red’ ? ‘#e74c3c’ : ‘#2980b9’;
document.getElementById(‘room-label’).textContent = ’Oda: ’ + myRoom;
players[myId] = { id: myId, name: playerName, team: myTeam, x: myX, y: myY, angle: 0, hp: 100, alive: true, anim: ‘idle’ };
});

socket.on(‘gameState’, state => {
for (const sid in state.players) {
if (sid === myId) continue;
players[sid] = state.players[sid];
}
// Sunucu mermileri (başkaları)
bullets = bullets.filter(b => b.id.startsWith(‘local_’));
for (const b of (state.bullets || [])) {
if (!b.owner || b.owner !== myId) bullets.push(b);
}
});

socket.on(‘playerJoined’, p => {
if (p.id !== myId) players[p.id] = p;
showNotif(`${p.name} katıldı! (${p.team === 'red' ? '🔴' : '🔵'})`, p.team);
});

socket.on(‘playerLeft’, id => {
if (players[id]) {
showNotif(`${players[id].name} ayrıldı`, ‘neutral’);
delete players[id];
}
});

socket.on(‘playerHit’, data => {
if (data.target === myId) {
myHp = data.hp;
if (players[myId]) players[myId].hp = myHp;
showDamage(data.dmg, data.part);
}
});

socket.on(‘playerDied’, data => {
if (data.id === myId) {
alive = false;
deaths++;
showNotif(‘Öldün! 5sn içinde respawn…’, ‘red’);
}
if (data.killer === myId) {
kills++;
showNotif(‘Öldürdün!’, ‘green’);
}
if (players[data.id]) players[data.id].alive = false;
});

socket.on(‘respawn’, data => {
myX = data.x; myY = data.y;
myHp = data.hp;
alive = true;
jumping = false; jumpY2d = 0;
if (players[myId]) {
players[myId].x = myX;
players[myId].y = myY;
players[myId].hp = myHp;
players[myId].alive = true;
}
showNotif(‘Geri döndün!’, ‘blue’);
});

socket.on(‘roomsList’, list => renderRoomsList(list));
socket.on(‘roomUpdate’, info => {
document.getElementById(‘room-label’).textContent = `Oda: ${info.id} | 🔴${info.red} 🔵${info.blue}`;
});

socket.on(‘bulletFired’, b => {
if (b.owner !== myId) bullets.push({ …b, life: 2000 });
});
}

function showNotif(msg, type) {
const el = document.getElementById(‘notif’);
if (!el) return;
el.textContent = msg;
el.className = ’notif show ’ + (type || ‘’);
setTimeout(() => el.classList.remove(‘show’), 3000);
}

function showDamage(dmg, part) {
const el = document.getElementById(‘damage-popup’);
if (!el) return;
const labels = { head: ‘💀 KAFa!’, feet: ‘🦵 Ayak’, body: ‘💥 Gövde’ };
el.textContent = `-${dmg} ${labels[part] || ''}`;
el.classList.add(‘show’);
setTimeout(() => el.classList.remove(‘show’), 800);
}

// ── Oda listesi render ───────────────────────────────────────────────────────
function renderRoomsList(list) {
const el = document.getElementById(‘rooms-list’);
if (!el) return;
el.innerHTML = ‘’;
if (list.length === 0) {
el.innerHTML = ‘<div class="no-rooms">Henüz oda yok. İlk sen oluştur!</div>’;
return;
}
for (const r of list) {
const div = document.createElement(‘div’);
div.className = ‘room-item’;
const full = r.total >= 20;
div.innerHTML = ` <div class="room-info"> <span class="room-name">🏠 ${r.id}</span> <span class="room-teams">🔴 ${r.red}/10 &nbsp; 🔵 ${r.blue}/10</span> </div> <button class="room-join-btn" onclick="joinSpecificRoom('${r.id}')" ${full ? 'disabled' : ''}>${full ? 'DOLU' : 'GİR'}</button>`;
el.appendChild(div);
}
}

function joinSpecificRoom(roomId) {
// Şimdilik direkt katıl (sunucu takım atar)
joinGame();
}

// ── Oyunu başlat ────────────────────────────────────────────────────────────
function joinGame() {
socket.emit(‘joinGame’, { name: playerName, telegramId });
showScreen(‘game-screen’);
startGame();
}

function startGame() {
canvas = document.getElementById(‘game-canvas’);
ctx = canvas.getContext(‘2d’);
miniCanvas = document.getElementById(‘minimap’);
miniCtx = miniCanvas.getContext(‘2d’);
resizeCanvas();
window.addEventListener(‘resize’, resizeCanvas);
generateMap();
setupInput();
gameRunning = true;
lastFrame = performance.now();
requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
if (!canvas) return;
canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;
}

// ── Ekran geçişleri ─────────────────────────────────────────────────────────
function showScreen(id) {
document.querySelectorAll(’.screen’).forEach(s => s.classList.remove(‘active’));
document.getElementById(id)?.classList.add(‘active’);
}

// ── DOMContentLoaded ─────────────────────────────────────────────────────────
window.addEventListener(‘DOMContentLoaded’, () => {
// Telegram kullanıcısı
const tgUser = getTelegramUser();
if (tgUser) {
playerName = tgUser.name;
telegramId = tgUser.id;
document.getElementById(‘player-name-display’).textContent = playerName;
document.getElementById(‘player-id-display’).textContent   = telegramId;
}

setupSocket();

// Ana menü butonları
document.getElementById(‘btn-find-game’).addEventListener(‘click’, () => {
if (!playerName) playerName = document.getElementById(‘name-input’)?.value || ‘Asker’;
joinGame();
});

document.getElementById(‘btn-rooms’).addEventListener(‘click’, () => {
showScreen(‘rooms-screen’);
socket.emit(‘getRooms’);
});

document.getElementById(‘btn-create-room’).addEventListener(‘click’, () => {
if (!playerName) playerName = document.getElementById(‘name-input’)?.value || ‘Asker’;
joinGame();
});

document.getElementById(‘btn-back-rooms’).addEventListener(‘click’, () => showScreen(‘main-menu’));
document.getElementById(‘btn-back-create’).addEventListener(‘click’, () => showScreen(‘main-menu’));

document.getElementById(‘btn-create-room-screen’).addEventListener(‘click’, () => {
if (!playerName) playerName = document.getElementById(‘name-input’)?.value || ‘Asker’;
joinGame();
});

// İsim girişi
const nameInput = document.getElementById(‘name-input’);
if (nameInput) {
nameInput.addEventListener(‘input’, e => { playerName = e.target.value; });
if (tgUser) { nameInput.value = tgUser.name; nameInput.disabled = true; }
}

// Keep-alive ping
setInterval(() => {
if (socket && socket.connected) socket.emit(‘ping’);
}, 25000);
});
