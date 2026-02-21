const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
const PLAYER_SIZE = 28;
const RESPAWN_TIME = 4000;
const FIRE_RATE = 350;

const rooms = new Map();
let roomCounter = 0;

// ─── MAP WALLS (Backrooms tarzı labirent) ────────────────────────────────────
const WALLS = generateWalls();

function generateWalls() {
  const w = [];
  const T = 36; // thickness

  // Border
  w.push({ x: 0,        y: 0,        w: MAP_W, h: T });
  w.push({ x: 0,        y: MAP_H-T,  w: MAP_W, h: T });
  w.push({ x: 0,        y: 0,        w: T,     h: MAP_H });
  w.push({ x: MAP_W-T,  y: 0,        w: T,     h: MAP_H });

  // Yatay koridorlar
  const hz = [
    [300,400,500],[300,800,320],[720,600,440],[1200,300,620],
    [1020,720,340],[1420,900,540],[1820,420,420],[1720,720,340],
    [920,1120,640],[420,1420,460],[1120,1420,540],[1820,1220,440],
    [620,1720,740],[1520,1640,520],[320,2000,640],[1120,1900,440],
    [1720,1920,420],[200,2400,500],[900,2300,600],[1500,2500,400],
    [2000,600,350],[2100,1000,400],[2200,1400,350],[2000,1800,500],
    [2300,2200,450],[600,2800,600],[1300,2700,500],[1900,2800,400],
    [400,3000,500],[1100,2950,600],[1800,3000,450],[2400,2600,350],
    [2600,1200,300],[2700,800,350],[2500,400,400],[2800,1600,300],
    [2600,2000,350],[2800,2400,300],
  ];

  // Dikey koridorlar
  const vt = [
    [620,100,360],[1020,200,260],[1420,100,360],[1920,100,360],
    [520,450,420],[920,660,520],[1320,360,420],[1720,460,320],
    [2120,460,620],[720,860,320],[1120,760,420],[1620,960,420],
    [420,1220,260],[820,1160,320],[1320,1120,360],[2020,1260,420],
    [620,1460,320],[1020,1460,320],[1520,1660,360],[1920,1660,320],
    [360,1760,320],[760,1760,320],[1220,1960,360],[1720,1960,360],
    [2120,1860,420],[400,2200,400],[800,2100,500],[1200,2200,400],
    [1600,2300,350],[2000,2100,450],[2300,400,500],[2500,800,600],
    [2700,1200,500],[2900,600,700],[3000,1600,500],[2800,2000,400],
    [3000,2400,600],[2600,2800,300],[2400,3000,300],
  ];

  // Sütunlar / kutular
  const boxes = [
    [820,420,80,80],[1220,620,80,80],[1620,320,80,80],
    [520,1020,80,80],[1020,1320,80,80],[1820,1120,80,80],
    [720,1620,80,80],[1420,1820,80,80],[920,2020,80,80],
    [1620,2120,80,80],[260,1620,80,80],[2260,620,80,80],
    [2460,1020,80,80],[2660,1620,80,80],[2360,2020,80,80],
    [560,2620,80,80],[1060,2820,80,80],[1560,2920,80,80],
    [2060,2620,80,80],[2560,2220,80,80],[2060,3020,80,80],
    [3020,1020,80,80],[3020,2020,80,80],[400,600,100,100],
    [1600,1200,100,100],[2400,1600,100,100],[800,2400,100,100],
    [1200,2800,100,100],[2000,2400,100,100],[2800,3000,100,100],
  ];

  for (const [x,y,len] of hz) w.push({ x, y, w: len, h: T });
  for (const [x,y,len] of vt) w.push({ x, y, w: T, h: len });
  for (const [x,y,bw,bh] of boxes) w.push({ x, y, w: bw, h: bh });

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

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ─── ROOM ─────────────────────────────────────────────────────────────────────
function createRoom() {
  roomCounter++;
  const id = 'oda_' + roomCounter;
  const room = {
    id,
    players: new Map(),
    bullets: [],
    teams: { blue: new Set(), red: new Set() },
    scores: { blue: 0, red: 0 },
    lastTick: Date.now()
  };
  rooms.set(id, room);
  console.log(`[Room] Created: ${id}`);
  return room;
}

function findAvailableRoom() {
  for (const room of rooms.values()) {
    if (room.teams.blue.size < MAX_TEAM || room.teams.red.size < MAX_TEAM) return room;
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
  const margin = 200;
  const yRange = MAP_H * 0.6;
  const yBase = MAP_H * 0.2;
  let x, y, tries = 0;
  do {
    x = team === 'blue'
      ? margin + Math.random() * 300
      : MAP_W - margin - 300 + Math.random() * 300;
    y = yBase + Math.random() * yRange;
    tries++;
  } while (collidesWall(x, y, PLAYER_SIZE) && tries < 50);
  return { x, y };
}

function getRoomInfo(room) {
  return {
    id: room.id,
    blue: room.teams.blue.size,
    red: room.teams.red.size,
    scores: room.scores
  };
}

function getPlayersSnapshot(room) {
  const arr = [];
  for (const [, p] of room.players) arr.push(sanitizePlayer(p));
  return arr;
}

function sanitizePlayer(p) {
  return {
    id: p.id, name: p.name, x: p.x, y: p.y,
    angle: p.angle, hp: p.hp, team: p.team,
    state: p.state, dead: p.dead,
    kills: p.kills, deaths: p.deaths
  };
}

// ─── GAME LOOP ────────────────────────────────────────────────────────────────
const TICK = 1000 / 30; // 30 fps server tick

function tickRoom(room) {
  const now = Date.now();
  const remaining = [];

  for (const bullet of room.bullets) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    bullet.dist = (bullet.dist || 0) + BULLET_SPEED;

    if (bullet.dist > BULLET_MAX_DIST || bulletHitsWall(bullet.x, bullet.y)) continue;

    let hit = false;
    for (const [, player] of room.players) {
      if (player.dead || player.id === bullet.owner || player.team === bullet.team) continue;

      const d = dist(bullet, player);
      let dmg = 0;
      let part = null;

      // Hitbox zones (approximate)
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;

      if (d < 22) {
        // Head (above center ~-18 to -28)
        const relY = dy;
        if (relY < -14 && d < 14) { dmg = 100; part = 'head'; }
        else if (d < 22) { dmg = 35; part = 'body'; }
      } else if (d < 30) {
        // Feet (below center)
        const relY = dy;
        if (relY > 10) { dmg = 20; part = 'feet'; }
      }

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
            id: player.id, killerId: bullet.owner,
            scores: room.scores
          });

          // Respawn
          setTimeout(() => {
            if (!room.players.has(player.id)) return;
            const sp = spawnPos(player.team);
            player.x = sp.x; player.y = sp.y;
            player.hp = 100; player.dead = false; player.state = 'idle';
            io.to(room.id).emit('playerRespawned', sanitizePlayer(player));
          }, RESPAWN_TIME);
        }
        break;
      }
    }

    if (!hit) remaining.push(bullet);
  }

  room.bullets = remaining;
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.size === 0) continue;
    tickRoom(room);
    // Broadcast bullets
    if (room.bullets.length > 0) {
      const bl = room.bullets.map(b => ({ id: b.id, x: b.x, y: b.y, team: b.team }));
      io.to(room.id).emit('bullets', bl);
    }
  }
}, TICK);

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let room = null;
  let player = null;

  // Reconnect support
  socket.on('reconnectPlayer', (data) => {
    const r = rooms.get(data.roomId);
    if (r && r.players.has(data.playerId)) {
      room = r;
      player = r.players.get(data.playerId);
      player.id = socket.id;
      r.players.delete(data.playerId);
      r.players.set(socket.id, player);
      player.id = socket.id;
      socket.join(room.id);
      socket.emit('reconnected', {
        roomId: room.id, playerId: socket.id, team: player.team,
        walls: WALLS, mapWidth: MAP_W, mapHeight: MAP_H,
        players: getPlayersSnapshot(room), scores: room.scores
      });
    } else {
      socket.emit('reconnectFailed');
    }
  });

  socket.on('getRooms', () => {
    socket.emit('roomsList', Array.from(rooms.values()).map(getRoomInfo));
  });

  socket.on('findGame', (data) => joinRoom(null, data));
  socket.on('joinRoom', (data) => joinRoom(data.roomId, data));
  socket.on('createRoom', (data) => {
    const newRoom = createRoom();
    joinRoom(newRoom.id, data);
  });

  function joinRoom(roomId, data) {
    const r = roomId ? (rooms.get(roomId) || findAvailableRoom()) : findAvailableRoom();
    const team = assignTeam(r);
    if (!team) { socket.emit('roomFull'); return; }

    room = r;
    r.teams[team].add(socket.id);
    const sp = spawnPos(team);

    player = {
      id: socket.id,
      name: (data && data.name) ? data.name.substring(0, 20) : 'Asker',
      x: sp.x, y: sp.y,
      angle: team === 'blue' ? 0 : Math.PI,
      hp: 100, team,
      state: 'idle', dead: false,
      kills: 0, deaths: 0,
      lastShot: 0, lastInput: Date.now()
    };

    r.players.set(socket.id, player);
    socket.join(r.id);

    socket.emit('joined', {
      roomId: r.id, playerId: socket.id, team,
      walls: WALLS, mapWidth: MAP_W, mapHeight: MAP_H,
      players: getPlayersSnapshot(r), scores: r.scores
    });

    socket.to(r.id).emit('playerJoined', sanitizePlayer(player));
    io.to(r.id).emit('roomUpdate', getRoomInfo(r));
    console.log(`[Join] ${player.name} -> ${r.id} [${team}]`);
  }

  socket.on('input', (input) => {
    if (!room || !player || player.dead) return;
    player.lastInput = Date.now();

    const spd = 3.8;
    const keys = input.keys || {};
    let moved = false;

    let nx = player.x, ny = player.y;
    if (keys.w || keys.ArrowUp)    { ny -= spd; moved = true; }
    if (keys.s || keys.ArrowDown)  { ny += spd; moved = true; }
    if (keys.a || keys.ArrowLeft)  { nx -= spd; moved = true; }
    if (keys.d || keys.ArrowRight) { nx += spd; moved = true; }

    if (!collidesWall(nx, player.y, PLAYER_SIZE / 2)) player.x = Math.max(50, Math.min(MAP_W - 50, nx));
    if (!collidesWall(player.x, ny, PLAYER_SIZE / 2)) player.y = Math.max(50, Math.min(MAP_H - 50, ny));

    if (input.angle !== undefined) player.angle = input.angle;

    if (keys[' '] && player.state !== 'jump') player.state = 'jump';
    else if (moved) player.state = 'walk';
    else if (player.state !== 'jump') player.state = 'idle';

    if (player.state === 'jump') setTimeout(() => { if (player && !player.dead) player.state = 'idle'; }, 500);

    // Shoot
    if (input.shoot) {
      const now = Date.now();
      if (now - player.lastShot >= FIRE_RATE) {
        player.lastShot = now;
        room.bullets.push({
          id: socket.id + '_' + now,
          x: player.x + Math.cos(player.angle) * 22,
          y: player.y + Math.sin(player.angle) * 22,
          vx: Math.cos(player.angle) * BULLET_SPEED,
          vy: Math.sin(player.angle) * BULLET_SPEED,
          owner: socket.id,
          team: player.team,
          dist: 0
        });
        io.to(room.id).emit('shot', { owner: socket.id, x: player.x, y: player.y, angle: player.angle });
      }
    }

    socket.to(room.id).emit('playerMoved', {
      id: socket.id, x: player.x, y: player.y,
      angle: player.angle, state: player.state, hp: player.hp
    });
  });

  socket.on('disconnect', () => {
    if (!room || !player) return;
    room.players.delete(socket.id);
    room.teams.blue.delete(socket.id);
    room.teams.red.delete(socket.id);
    io.to(room.id).emit('playerLeft', socket.id);
    io.to(room.id).emit('roomUpdate', getRoomInfo(room));
    // Clean empty rooms (keep at least 1)
    if (room.players.size === 0 && rooms.size > 1) {
      rooms.delete(room.id);
      console.log(`[Room] Deleted empty: ${room.id}`);
    }
    console.log(`[Leave] ${player.name} from ${room.id}`);
  });
});

// Keep alive for Render free tier
setInterval(() => {
  console.log(`[Alive] ${new Date().toISOString()} | Rooms: ${rooms.size} | Players: ${Array.from(rooms.values()).reduce((s, r) => s + r.players.size, 0)}`);
}, 30000);

app.get('/health', (_, res) => res.json({ status: 'ok', rooms: rooms.size }));
app.get('/rooms', (_, res) => res.json(Array.from(rooms.values()).map(getRoomInfo)));

server.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));
