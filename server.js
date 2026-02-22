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

// Statik dosyalar root klasöründen (index.html, game.js burada)
app.use(express.static(path.join(__dirname)));
app.get(’/’, (req, res) => res.sendFile(path.join(__dirname, ‘index.html’)));

// ── Sabitler ──────────────────────────────────────────────────────────────
const MAX_PER_TEAM = 10;
const TICK_MS      = 50;
const RESPAWN_MS   = 5000;
const MAP_W        = 3200;
const MAP_H        = 3200;

// ── Oda yönetimi ──────────────────────────────────────────────────────────
const rooms  = {};
const pRoom  = {};

function mkRoom(id) {
rooms[id] = { id, players: {}, red: [], blue: [], bullets: [] };
return rooms[id];
}
mkRoom(‘room_1’);

function findRoom() {
for (const id in rooms) {
const r = rooms[id];
if (r.red.length < MAX_PER_TEAM || r.blue.length < MAX_PER_TEAM) return r;
}
const newId = ‘room_’ + Date.now();
return mkRoom(newId);
}

function assignTeam(room, sid) {
if (room.red.length <= room.blue.length && room.red.length < MAX_PER_TEAM) {
room.red.push(sid); return ‘red’;
} else if (room.blue.length < MAX_PER_TEAM) {
room.blue.push(sid); return ‘blue’;
}
return null;
}

function leaveRoom(sid) {
const rid = pRoom[sid];
if (!rid || !rooms[rid]) return;
const r = rooms[rid];
r.red  = r.red.filter(s => s !== sid);
r.blue = r.blue.filter(s => s !== sid);
delete r.players[sid];
delete pRoom[sid];
if (rid !== ‘room_1’ && r.red.length === 0 && r.blue.length === 0) delete rooms[rid];
}

// ── Spawn noktaları ───────────────────────────────────────────────────────
const SPAWNS = {
red:  [[200,200],[300,200],[400,200],[200,300],[300,300],[400,300],[200,400],[300,400],[500,200],[500,300]],
blue: [[3000,3000],[2900,3000],[2800,3000],[3000,2900],[2900,2900],[2800,2900],[3000,2800],[2900,2800],[2700,3000],[2700,2900]]
};
function getSpawn(team, n) {
const a = SPAWNS[team];
return a[n % a.length];
}

// ── Game tick ─────────────────────────────────────────────────────────────
setInterval(() => {
for (const rid in rooms) {
const room = rooms[rid];
const sids = Object.keys(room.players);
if (!sids.length) continue;

```
const keep = [];
for (const b of room.bullets) {
  b.x += b.vx * (TICK_MS / 1000) * 600;
  b.y += b.vy * (TICK_MS / 1000) * 600;
  b.life -= TICK_MS;
  if (b.life <= 0 || b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H) continue;

  let hit = false;
  for (const sid of sids) {
    const p = room.players[sid];
    if (!p || !p.alive || sid === b.owner || p.team === b.ownerTeam) continue;
    const dx = p.x - b.x, dy = p.y - b.y;
    if (Math.sqrt(dx*dx+dy*dy) < 22) {
      const dmg = b.part === 'head' ? 100 : b.part === 'feet' ? 20 : 35;
      p.hp = Math.max(0, p.hp - dmg);
      io.to(rid).emit('hit', { target: sid, hp: p.hp, shooter: b.owner, dmg, part: b.part });
      if (p.hp <= 0) {
        p.alive = false;
        io.to(rid).emit('died', { id: sid, killer: b.owner });
        setTimeout(() => {
          const pp = rooms[rid]?.players[sid];
          if (!pp) return;
          const [sx, sy] = getSpawn(pp.team, Math.floor(Math.random()*10));
          pp.hp = 100; pp.alive = true; pp.x = sx; pp.y = sy;
          io.to(sid).emit('respawn', { x: sx, y: sy });
        }, RESPAWN_MS);
      }
      hit = true; break;
    }
  }
  if (!hit) keep.push(b);
}
room.bullets = keep;

io.to(rid).emit('state', { players: room.players, bullets: room.bullets });
```

}
}, TICK_MS);

// ── Socket bağlantıları ───────────────────────────────────────────────────
io.on(‘connection’, sock => {
console.log(’+’, sock.id);

sock.on(‘join’, ({ name }) => {
const room = findRoom();
const team = assignTeam(room, sock.id);
if (!team) { sock.emit(‘full’); return; }

```
const spawnIdx = room.red.length + room.blue.length - 1;
const [sx, sy] = getSpawn(team, spawnIdx);

const p = { id: sock.id, name, team, x: sx, y: sy, angle: 0, hp: 100, alive: true, anim: 'idle' };
room.players[sock.id] = p;
pRoom[sock.id] = room.id;

sock.join(room.id);
sock.emit('joined', { roomId: room.id, team, id: sock.id, x: sx, y: sy, mapW: MAP_W, mapH: MAP_H });
sock.to(room.id).emit('pJoin', p);
sock.emit('allPlayers', Object.values(room.players).filter(pp => pp.id !== sock.id));
io.to(room.id).emit('roomInfo', { red: room.red.length, blue: room.blue.length });
```

});

sock.on(‘move’, d => {
const r = rooms[pRoom[sock.id]];
if (!r) return;
const p = r.players[sock.id];
if (!p || !p.alive) return;
p.x = d.x; p.y = d.y; p.angle = d.angle; p.anim = d.anim || ‘idle’;
});

sock.on(‘shoot’, d => {
const r = rooms[pRoom[sock.id]];
if (!r) return;
const p = r.players[sock.id];
if (!p || !p.alive) return;
r.bullets.push({
id: sock.id+’_’+Date.now(), x: d.x, y: d.y,
vx: d.vx, vy: d.vy, owner: sock.id, ownerTeam: p.team,
part: d.part || ‘body’, life: 2000
});
});

sock.on(‘getRooms’, () => {
sock.emit(‘roomsList’, Object.values(rooms).map(r => ({
id: r.id, red: r.red.length, blue: r.blue.length
})));
});

sock.on(‘disconnect’, () => {
const rid = pRoom[sock.id];
const name = rooms[rid]?.players[sock.id]?.name || ‘’;
leaveRoom(sock.id);
if (rid) {
io.to(rid).emit(‘pLeft’, sock.id);
const r = rooms[rid];
if (r) io.to(rid).emit(‘roomInfo’, { red: r.red.length, blue: r.blue.length });
}
console.log(’-’, sock.id, name);
});
});

// ── Render uyku önleme ────────────────────────────────────────────────────
setInterval(() => {
require(‘http’).get(‘https://saskioyunu-1-2d6i.onrender.com’, () => {}).on(‘error’, () => {});
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(‘Port:’, PORT));
