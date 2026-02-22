const express = require(‘express’);
const http = require(‘http’);
const { Server } = require(‘socket.io’);
const path = require(‘path’);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
cors: { origin: ‘*’ },
pingTimeout: 60000,
pingInterval: 25000
});

app.use(express.static(path.join(__dirname, ‘public’)));
app.get(’/’, (req, res) => res.sendFile(path.join(__dirname, ‘public’, ‘index.html’)));

// ── Sabitler ──────────────────────────────────────────────────────────────
const MAX_TEAM = 10;
const MAX_PER_TEAM = 10;
const TICK = 50; // ms
const RESPAWN_TIME = 5000;
const MAP_W = 2400, MAP_H = 2400;

// ── Oda yönetimi ──────────────────────────────────────────────────────────
const rooms = {};          // roomId -> room
const playerRoom = {};     // socketId -> roomId
const playerData = {};     // socketId -> player

function createRoom(id) {
const room = {
id,
players: {},           // socketId -> player snapshot
redTeam: [],
blueTeam: [],
bullets: [],
started: false,
tick: 0
};
rooms[id] = room;
return room;
}

function findOrCreateRoom() {
for (const rid in rooms) {
const r = rooms[rid];
if (r.redTeam.length < MAX_PER_TEAM || r.blueTeam.length < MAX_PER_TEAM) return r;
}
const newId = ‘room_’ + Date.now();
return createRoom(newId);
}

function assignTeam(room, socketId) {
if (room.redTeam.length <= room.blueTeam.length && room.redTeam.length < MAX_PER_TEAM) {
room.redTeam.push(socketId);
return ‘red’;
} else if (room.blueTeam.length < MAX_PER_TEAM) {
room.blueTeam.push(socketId);
return ‘blue’;
}
return null;
}

function removeFromRoom(socketId) {
const rid = playerRoom[socketId];
if (!rid || !rooms[rid]) return;
const room = rooms[rid];
room.redTeam = room.redTeam.filter(s => s !== socketId);
room.blueTeam = room.blueTeam.filter(s => s !== socketId);
delete room.players[socketId];
delete playerRoom[socketId];
if (room.redTeam.length === 0 && room.blueTeam.length === 0) {
delete rooms[rid];
}
}

// ── Spawn noktaları ───────────────────────────────────────────────────────
const SPAWNS = {
red:  [[200,200],[200,400],[400,200],[400,400],[200,600],[600,200],[600,400],[200,800],[800,200],[400,600]],
blue: [[2200,2200],[2200,2000],[2000,2200],[2000,2000],[2200,1800],[1800,2200],[1800,2000],[2200,1600],[1600,2200],[2000,1800]]
};

function getSpawn(team, idx) {
const arr = SPAWNS[team];
return arr[idx % arr.length];
}

// ── Oyun tick ─────────────────────────────────────────────────────────────
setInterval(() => {
for (const rid in rooms) {
const room = rooms[rid];
const allPlayers = Object.keys(room.players);
if (allPlayers.length === 0) continue;

```
// Mermi hareketi & çarpışma
const aliveBullets = [];
for (const b of room.bullets) {
  b.x += b.vx * (TICK / 1000) * 600;
  b.y += b.vy * (TICK / 1000) * 600;
  b.life -= TICK;
  if (b.life <= 0 || b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H) continue;

  let hit = false;
  for (const sid of allPlayers) {
    const p = room.players[sid];
    if (!p || !p.alive || sid === b.owner || p.team === b.ownerTeam) continue;
    const dx = p.x - b.x, dy = p.y - b.y;
    if (Math.sqrt(dx*dx + dy*dy) < 20) {
      // Hasar hesabı
      const dmg = b.bodyPart === 'head' ? 100 : b.bodyPart === 'feet' ? 20 : 35;
      p.hp = Math.max(0, p.hp - dmg);
      io.to(rid).emit('playerHit', { target: sid, hp: p.hp, shooter: b.owner, dmg, part: b.bodyPart });
      if (p.hp <= 0) {
        p.alive = false;
        io.to(rid).emit('playerDied', { id: sid, killer: b.owner });
        // Respawn
        setTimeout(() => {
          if (!room.players[sid]) return;
          const spawnIdx = Math.floor(Math.random() * 10);
          const [sx, sy] = getSpawn(p.team, spawnIdx);
          p.hp = 100; p.alive = true; p.x = sx; p.y = sy;
          io.to(sid).emit('respawn', { x: sx, y: sy, hp: 100 });
        }, RESPAWN_TIME);
      }
      hit = true;
      break;
    }
  }
  if (!hit) aliveBullets.push(b);
}
room.bullets = aliveBullets;

// State broadcast
const state = {
  players: room.players,
  bullets: room.bullets,
  ts: Date.now()
};
io.to(rid).emit('gameState', state);
```

}
}, TICK);

// ── Socket bağlantıları ───────────────────────────────────────────────────
io.on(‘connection’, (socket) => {
console.log(‘Connect:’, socket.id);

socket.on(‘joinGame’, ({ name, telegramId }) => {
const room = findOrCreateRoom();
const team = assignTeam(room, socket.id);
if (!team) { socket.emit(‘roomFull’); return; }

```
const spawnIdx = Object.keys(room.players).length;
const [sx, sy] = getSpawn(team, spawnIdx);

const player = {
  id: socket.id,
  name: name || telegramId || 'Asker',
  telegramId: telegramId || null,
  team,
  x: sx, y: sy,
  angle: team === 'red' ? 0 : Math.PI,
  hp: 100,
  alive: true,
  anim: 'idle',
  kills: 0,
  deaths: 0
};

room.players[socket.id] = player;
playerRoom[socket.id] = room.id;
playerData[socket.id] = player;

socket.join(room.id);
socket.emit('joined', {
  roomId: room.id,
  team,
  playerId: socket.id,
  spawnX: sx,
  spawnY: sy,
  mapW: MAP_W,
  mapH: MAP_H
});

const roomInfo = {
  id: room.id,
  red: room.redTeam.length,
  blue: room.blueTeam.length
};
io.to(room.id).emit('roomUpdate', roomInfo);
io.to(room.id).emit('playerJoined', player);
```

});

socket.on(‘playerMove’, (data) => {
const rid = playerRoom[socket.id];
if (!rid || !rooms[rid]) return;
const p = rooms[rid].players[socket.id];
if (!p || !p.alive) return;
p.x = Math.max(0, Math.min(MAP_W, data.x));
p.y = Math.max(0, Math.min(MAP_H, data.y));
p.angle = data.angle;
p.anim = data.anim || ‘idle’;
});

socket.on(‘shoot’, (data) => {
const rid = playerRoom[socket.id];
if (!rid || !rooms[rid]) return;
const p = rooms[rid].players[socket.id];
if (!p || !p.alive) return;
const bullet = {
id: socket.id + ‘*’ + Date.now() + ’*’ + Math.random(),
x: data.x, y: data.y,
vx: data.vx, vy: data.vy,
owner: socket.id,
ownerTeam: p.team,
bodyPart: data.bodyPart || ‘body’,
life: 2000
};
rooms[rid].bullets.push(bullet);
socket.to(rid).emit(‘bulletFired’, bullet);
});

socket.on(‘getRooms’, () => {
const list = Object.values(rooms).map(r => ({
id: r.id,
red: r.redTeam.length,
blue: r.blueTeam.length,
total: r.redTeam.length + r.blueTeam.length
}));
socket.emit(‘roomsList’, list);
});

socket.on(‘disconnect’, () => {
const rid = playerRoom[socket.id];
if (rid) {
io.to(rid).emit(‘playerLeft’, socket.id);
}
removeFromRoom(socket.id);
delete playerData[socket.id];
console.log(‘Disconnect:’, socket.id);
});
});

// ── Keep-alive ping (Render uyku modunu engeller) ─────────────────────────
const RENDER_URL = ‘https://saskioyunu-1-2d6i.onrender.com’;
setInterval(() => {
http.get(RENDER_URL, () => {}).on(‘error’, () => {});
}, 14 * 60 * 1000); // 14 dakikada bir

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu çalışıyor: ${PORT}`));
