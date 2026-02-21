const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const MAX_TEAM = 10;
const MAP_W = 3200;
const MAP_H = 3200;
const BULLET_SPEED = 16;
const BULLET_MAX_DIST = 1400;
const PLAYER_SIZE = 15;
const RESPAWN_TIME = 4000;
const FIRE_RATE = 350;

const rooms = new Map();
let roomCounter = 0;

// ─── WALLS ───────────────────────────────────────────────────────
const WALLS = generateWalls();

function generateWalls() {
  const w = [];
  const T = 36;

  w.push({ x: 0, y: 0, w: MAP_W, h: T });
  w.push({ x: 0, y: MAP_H - T, w: MAP_W, h: T });
  w.push({ x: 0, y: 0, w: T, h: MAP_H });
  w.push({ x: MAP_W - T, y: 0, w: T, h: MAP_H });

  const hz = [
    [300, 400, 500], [300, 800, 320], [720, 600, 440], [1200, 300, 620],
    [1020, 720, 340], [1420, 900, 540], [1820, 420, 420], [1720, 720, 340],
    [920, 1120, 640], [420, 1420, 460], [1120, 1420, 540], [1820, 1220, 440],
    [620, 1720, 740], [1520, 1640, 520], [320, 2000, 640], [1120, 1900, 440],
    [1720, 1920, 420], [200, 2400, 500], [900, 2300, 600], [1500, 2500, 400],
    [2000, 600, 350], [2100, 1000, 400], [2200, 1400, 350], [2000, 1800, 500],
    [2300, 2200, 450], [600, 2800, 600], [1300, 2700, 500], [1900, 2800, 400],
    [400, 3000, 500], [1100, 2950, 600], [1800, 3000, 450], [2400, 2600, 350],
  ];
  const vt = [
    [620, 100, 360], [1020, 200, 260], [1420, 100, 360], [1920, 100, 360],
    [520, 450, 420], [920, 660, 520], [1320, 360, 420], [1720, 460, 320],
    [2120, 460, 620], [720, 860, 320], [1120, 760, 420], [1620, 960, 420],
    [420, 1220, 260], [820, 1160, 320], [1320, 1120, 360], [2020, 1260, 420],
    [620, 1460, 320], [1020, 1460, 320], [1520, 1660, 360], [1920, 1660, 320],
    [360, 1760, 320], [760, 1760, 320], [1220, 1960, 360], [1720, 1960, 360],
    [2120, 1860, 420], [400, 2200, 400], [800, 2100, 500], [1200, 2200, 400],
  ];
  const boxes = [
    [820, 420, 80, 80], [1220, 620, 80, 80], [1620, 320, 80, 80],
    [520, 1020, 80, 80], [1020, 1320, 80, 80], [1820, 1120, 80, 80],
    [720, 1620, 80, 80], [1420, 1820, 80, 80], [920, 2020, 80, 80],
    [1620, 2120, 80, 80], [260, 1620, 80, 80], [2260, 620, 80, 80],
  ];

  for (const [x, y, len] of hz) w.push({ x, y, w: len, h: T });
  for (const [x, y, len] of vt) w.push({ x, y, w: T, h: len });
  for (const [x, y, bw, bh] of boxes) w.push({ x, y, w: bw, h: bh });
  return w;
}

function collidesWall(x, y, r) {
  for (const wall of WALLS) {
    if (x - r < wall.x + wall.w && x + r > wall.x &&
      y - r < wall.y + wall.h && y + r > wall.y) return true;
  }
  return false;
}

function bulletHitsWall(bx, by) {
  for (const wall of WALLS) {
    if (bx >= wall.x && bx <= wall.x + wall.w &&
      by >= wall.y && by <= wall.y + wall.h) return true;
  }
  return false;
}

// ─── ROOM MANAGEMENT ─────────────────────────────────────────────
function createRoom() {
  roomCounter++;
  const id = 'oda_' + roomCounter;
  const room = {
    id,
    players: new Map(),
    bullets: [],
    teams: { blue: new Set(), red: new Set() },
    scores: { blue: 0, red: 0 },
  };
  rooms.set(id, room);
  console.log(`[Oda Oluşturuldu] ${id}`);
  return room;
}

// Oyun bul: boş slot olan oda bul, yoksa yeni oda oluştur
function findOrCreateRoom() {
  for (const room of rooms.values()) {
    const b = room.teams.blue.size, r = room.teams.red.size;
    if (b < MAX_TEAM || r < MAX_TEAM) return room;
  }
  return createRoom();
}

function assignTeam(room) {
  const b = room.teams.blue.size, r = room.teams.red.size;
  if (b <= r && b < MAX_TEAM) return 'blue';
  if (r < MAX_TEAM) return 'red';
  return null;
}

function spawnPos(team) {
  let x, y, tries = 0;
  do {
    x = team === 'blue'
      ? 200 + Math.random() * 400
      : MAP_W - 600 + Math.random() * 400;
    y = 400 + Math.random() * (MAP_H - 800);
    tries++;
  } while (collidesWall(x, y, PLAYER_SIZE) && tries < 100);
  return { x, y };
}

function getRoomInfo(room) {
  return {
    id: room.id,
    blue: room.teams.blue.size,
    red: room.teams.red.size,
    total: room.players.size,
    scores: room.scores
  };
}

function getPlayersSnapshot(room) {
  return Array.from(room.players.values()).map(p => ({ ...p, lastShot: undefined }));
}

// ─── GAME TICK ───────────────────────────────────────────────────
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;

    const remaining = [];
    for (const bullet of room.bullets) {
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.traveled = (bullet.traveled || 0) + BULLET_SPEED;

      if (bullet.traveled > BULLET_MAX_DIST) continue;
      if (bulletHitsWall(bullet.x, bullet.y)) continue;

      let hit = false;
      for (const [, player] of room.players) {
        if (player.dead || player.id === bullet.owner || player.team === bullet.team) continue;
        const dx = bullet.x - player.x;
        const dy = bullet.y - player.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        let dmg = 0, part = null;
        if (d < 10 && dy < -15) { dmg = 100; part = 'head'; }   // kafa
        else if (d < 18) { dmg = 35; part = 'body'; }             // gövde
        else if (d < 25 && dy > 8) { dmg = 20; part = 'feet'; }  // ayak

        if (dmg > 0) {
          player.hp = Math.max(0, player.hp - dmg);
          hit = true;
          io.to(room.id).emit('hit', { victim: player.id, shooter: bullet.owner, dmg, part, x: bullet.x, y: bullet.y });

          if (player.hp <= 0 && !player.dead) {
            player.dead = true;
            player.deaths++;
            const shooter = room.players.get(bullet.owner);
            if (shooter) {
              shooter.kills++;
              room.scores[shooter.team] = (room.scores[shooter.team] || 0) + 1;
            }
            io.to(room.id).emit('playerDied', {
              id: player.id,
              killerId: bullet.owner,
              killerName: shooter ? shooter.name : '?',
              victimName: player.name,
              scores: { ...room.scores }
            });

            const pid = player.id;
            setTimeout(() => {
              const p = room.players.get(pid);
              if (!p) return;
              const sp = spawnPos(p.team);
              p.x = sp.x; p.y = sp.y;
              p.hp = 100; p.dead = false; p.state = 'idle';
              io.to(room.id).emit('playerRespawned', {
                id: p.id, x: p.x, y: p.y, hp: p.hp, dead: false, state: 'idle'
              });
            }, RESPAWN_TIME);
          }
          break;
        }
      }
      if (!hit) remaining.push(bullet);
    }
    room.bullets = remaining;

    if (room.bullets.length > 0) {
      io.to(room.id).emit('bullets', room.bullets.map(b => ({
        id: b.id, x: b.x, y: b.y, team: b.team
      })));
    }
  }
}, 33);

// ─── SOCKET.IO ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;
  let currentPlayer = null;

  console.log(`[Bağlandı] ${socket.id}`);
  socket.emit('connected');

  function joinRoomById(roomId, playerData) {
    const room = rooms.get(roomId);
    if (!room) { socket.emit('error', 'Oda bulunamadı'); return; }
    doJoin(room, playerData);
  }

  function doJoin(room, playerData) {
    playerData = playerData || {};
    const team = assignTeam(room);
    if (!team) { socket.emit('roomFull', { msg: 'Oda dolu!' }); return; }

    currentRoom = room;
    room.teams[team].add(socket.id);

    const sp = spawnPos(team);

    const pName = playerData.name || playerData.first_name || playerData.username || 'Asker';
    const pTgId = playerData.tgId || playerData.id || null;

    currentPlayer = {
      id: socket.id,
      name: pName,
      tgId: pTgId,
      x: sp.x, y: sp.y,
      angle: team === 'blue' ? 0 : Math.PI,
      hp: 100, team,
      state: 'idle', dead: false,
      kills: 0, deaths: 0,
      lastShot: 0
    };

    room.players.set(socket.id, currentPlayer);
    socket.join(room.id);

    // Sadece bu sokete joined gönder
    socket.emit('joined', {
      roomId: room.id,
      playerId: socket.id,
      team,
      walls: WALLS,
      mapWidth: MAP_W,
      mapHeight: MAP_H,
      players: getPlayersSnapshot(room),
      scores: { ...room.scores },
      myPlayer: { ...currentPlayer }
    });

    // Diğer oyunculara yeni oyuncu bildir
    socket.to(room.id).emit('playerJoined', { ...currentPlayer });

    // Herkese oda güncelle
    io.to(room.id).emit('roomUpdate', getRoomInfo(room));

    console.log(`[Katıldı] ${currentPlayer.name} (TG: ${currentPlayer.tgId || 'Yok'}) (${team}) -> ${room.id} [${room.players.size} oyuncu]`);
  }

  // Odaları listele
  socket.on('getRooms', () => {
    socket.emit('roomsList', Array.from(rooms.values()).map(getRoomInfo));
  });

  // Oyun bul - mevcut odaya katıl veya yeni oda yap
  socket.on('findGame', (data) => {
    console.log(`[İstek] Oyun Bul: ${socket.id} (${data ? data.name : '?'})`);
    const room = findOrCreateRoom();
    doJoin(room, data || {});
  });

  // Belirli odaya katıl
  socket.on('joinRoom', (data) => {
    if (data && data.roomId) {
      joinRoomById(data.roomId, data);
    }
  });

  // Yeni oda oluştur ve katıl
  socket.on('createRoom', (data) => {
    const newRoom = createRoom();
    doJoin(newRoom, data || {});
  });

  // Input
  socket.on('input', (input) => {
    if (!currentRoom || !currentPlayer || currentPlayer.dead) return;

    const spd = 3.8;
    const keys = input.keys || {};
    let moved = false;
    let nx = currentPlayer.x, ny = currentPlayer.y;

    if (keys.w) { ny -= spd; moved = true; }
    if (keys.s) { ny += spd; moved = true; }
    if (keys.a) { nx -= spd; moved = true; }
    if (keys.d) { nx += spd; moved = true; }

    if (!collidesWall(nx, currentPlayer.y, PLAYER_SIZE)) currentPlayer.x = Math.max(50, Math.min(MAP_W - 50, nx));
    if (!collidesWall(currentPlayer.x, ny, PLAYER_SIZE)) currentPlayer.y = Math.max(50, Math.min(MAP_H - 50, ny));

    if (input.angle !== undefined) currentPlayer.angle = input.angle;

    if (keys.space && currentPlayer.state !== 'jump') {
      currentPlayer.state = 'jump';
      setTimeout(() => { if (currentPlayer) currentPlayer.state = 'idle'; }, 550);
    } else if (moved && currentPlayer.state !== 'jump') {
      currentPlayer.state = 'walk';
    } else if (!moved && currentPlayer.state !== 'jump') {
      currentPlayer.state = 'idle';
    }

    // Ateş
    if (input.shoot) {
      const now = Date.now();
      if (now - currentPlayer.lastShot >= FIRE_RATE) {
        currentPlayer.lastShot = now;
        currentRoom.bullets.push({
          id: socket.id + '_' + now,
          x: currentPlayer.x + Math.cos(currentPlayer.angle) * 22,
          y: currentPlayer.y + Math.sin(currentPlayer.angle) * 22,
          vx: Math.cos(currentPlayer.angle) * BULLET_SPEED,
          vy: Math.sin(currentPlayer.angle) * BULLET_SPEED,
          owner: socket.id,
          team: currentPlayer.team,
          traveled: 0
        });
        socket.to(currentRoom.id).emit('shot', {
          owner: socket.id, x: currentPlayer.x, y: currentPlayer.y, angle: currentPlayer.angle
        });
      }
    }

    socket.to(currentRoom.id).emit('playerMoved', {
      id: socket.id,
      x: currentPlayer.x,
      y: currentPlayer.y,
      angle: currentPlayer.angle,
      state: currentPlayer.state,
      hp: currentPlayer.hp
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Ayrıldı] ${socket.id}`);
    if (!currentRoom) return;

    currentRoom.players.delete(socket.id);
    currentRoom.teams.blue.delete(socket.id);
    currentRoom.teams.red.delete(socket.id);

    io.to(currentRoom.id).emit('playerLeft', socket.id);
    io.to(currentRoom.id).emit('roomUpdate', getRoomInfo(currentRoom));

    if (currentRoom.players.size === 0 && rooms.size > 1) {
      rooms.delete(currentRoom.id);
      console.log(`[Oda Silindi] ${currentRoom.id}`);
    }
  });
});

// Sunucu canlı tut (Render free tier uyku önleme)
setInterval(() => {
  const totalPlayers = Array.from(rooms.values()).reduce((s, r) => s + r.players.size, 0);
  console.log(`[Canlı] ${new Date().toLocaleTimeString('tr-TR')} | Odalar: ${rooms.size} | Oyuncular: ${totalPlayers}`);
}, 25000);

app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));
app.get('/api/rooms', (_, res) => res.json(Array.from(rooms.values()).map(getRoomInfo)));

server.listen(PORT, () => {
  console.log(`[Sunucu] Port ${PORT} üzerinde çalışıyor`);
});
