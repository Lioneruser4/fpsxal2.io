const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const MAP_W = 3200, MAP_H = 3200;
const MAX_TEAM = 10;
const BULLET_SPD = 16;
const BULLET_MAX = 1400;
const FIRE_RATE = 350;
const RESPAWN = 4000;
const PSIZE = 15;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, r) => r.json({ ok: true, rooms: rooms.size }));

// ── WALLS (same as client) ─────────────────
function buildWalls() {
  const w = [], T = 36;
  w.push({x:0,y:0,w:MAP_W,h:T},{x:0,y:MAP_H-T,w:MAP_W,h:T},{x:0,y:0,w:T,h:MAP_H},{x:MAP_W-T,y:0,w:T,h:MAP_H});
  const hz=[[300,400,500],[300,800,320],[720,600,440],[1200,300,620],[1020,720,340],[1420,900,540],[1820,420,420],[1720,720,340],[920,1120,640],[420,1420,460],[1120,1420,540],[1820,1220,440],[620,1720,740],[1520,1640,520],[320,2000,640],[1120,1900,440],[1720,1920,420],[200,2400,500],[900,2300,600],[1500,2500,400],[2000,600,350],[2100,1000,400],[2200,1400,350],[2000,1800,500]];
  const vt=[[620,100,360],[1020,200,260],[1420,100,360],[1920,100,360],[520,450,420],[920,660,520],[1320,360,420],[1720,460,320],[2120,460,620],[720,860,320],[1120,760,420],[1620,960,420],[420,1220,260],[820,1160,320],[1320,1120,360],[2020,1260,420],[620,1460,320],[1020,1460,320],[1520,1660,360],[1920,1660,320],[360,1760,320],[760,1760,320],[1220,1960,360],[1720,1960,360]];
  const bx=[[820,420,80,80],[1220,620,80,80],[1620,320,80,80],[520,1020,80,80],[1020,1320,80,80],[1820,1120,80,80],[720,1620,80,80],[1420,1820,80,80],[920,2020,80,80]];
  for(const[x,y,l]of hz) w.push({x,y,w:l,h:T});
  for(const[x,y,l]of vt) w.push({x,y,w:T,h:l});
  for(const[x,y,bw,bh]of bx) w.push({x,y,w:bw,h:bh});
  return w;
}
const WALLS = buildWalls();

function wallHit(x,y,r=PSIZE){
  for(const w of WALLS)
    if(x-r<w.x+w.w&&x+r>w.x&&y-r<w.y+w.h&&y+r>w.y) return true;
  return false;
}
function bulletWall(bx,by){
  for(const w of WALLS)
    if(bx>=w.x&&bx<=w.x+w.w&&by>=w.y&&by<=w.y+w.h) return true;
  return false;
}

// ── ROOMS ─────────────────────────────────
const rooms = new Map();
let rCount = 0;

function newRoom() {
  const id = 'oda_' + (++rCount);
  rooms.set(id, { id, players:new Map(), bullets:[], teams:{blue:new Set(),red:new Set()}, scores:{blue:0,red:0} });
  console.log('[Oda+]', id);
  return rooms.get(id);
}

function findRoom() {
  for(const r of rooms.values())
    if(r.teams.blue.size<MAX_TEAM||r.teams.red.size<MAX_TEAM) return r;
  return newRoom();
}

function pickTeam(room) {
  const b=room.teams.blue.size,r=room.teams.red.size;
  if(b<=r&&b<MAX_TEAM) return 'blue';
  if(r<MAX_TEAM) return 'red';
  return null;
}

function spawn(team) {
  let x,y,t=0;
  do {
    x = team==='blue' ? 200+Math.random()*400 : MAP_W-600+Math.random()*400;
    y = 400+Math.random()*(MAP_H-800);
    t++;
  } while(wallHit(x,y)&&t<80);
  return{x,y};
}

function roomInfo(r) {
  return{id:r.id,blue:r.teams.blue.size,red:r.teams.red.size,total:r.players.size,scores:r.scores};
}

function snap(r) {
  return Array.from(r.players.values()).map(p=>({
    id:p.id,name:p.name,x:p.x,y:p.y,angle:p.angle,
    hp:p.hp,team:p.team,state:p.state,dead:p.dead,
    kills:p.kills,deaths:p.deaths
  }));
}

// ── GAME TICK ─────────────────────────────
setInterval(() => {
  for(const room of rooms.values()) {
    if(!room.players.size) continue;
    const keep=[];
    for(const b of room.bullets) {
      b.x+=b.vx; b.y+=b.vy;
      b.dist=(b.dist||0)+BULLET_SPD;
      if(b.dist>BULLET_MAX||bulletWall(b.x,b.y)) continue;
      let hit=false;
      for(const[,p]of room.players) {
        if(p.dead||p.id===b.owner||p.team===b.team) continue;
        const dx=b.x-p.x,dy=b.y-p.y,d=Math.sqrt(dx*dx+dy*dy);
        let dmg=0,part=null;
        if(d<12&&dy<-14){dmg=100;part='head';}
        else if(d<18){dmg=35;part='body';}
        else if(d<26&&dy>8){dmg=20;part='feet';}
        if(dmg>0){
          p.hp=Math.max(0,p.hp-dmg);
          hit=true;
          io.to(room.id).emit('hit',{victim:p.id,shooter:b.owner,dmg,part,x:b.x,y:b.y});
          if(p.hp<=0&&!p.dead){
            p.dead=true; p.deaths++;
            const k=room.players.get(b.owner);
            if(k){k.kills++;room.scores[k.team]=(room.scores[k.team]||0)+1;}
            io.to(room.id).emit('playerDied',{
              id:p.id,killerId:b.owner,
              killerName:k?k.name:'?',victimName:p.name,
              scores:{...room.scores}
            });
            const pid=p.id;
            setTimeout(()=>{
              const pp=room.players.get(pid); if(!pp) return;
              const s=spawn(pp.team);
              pp.x=s.x;pp.y=s.y;pp.hp=100;pp.dead=false;pp.state='idle';
              io.to(room.id).emit('playerRespawned',{id:pid,x:pp.x,y:pp.y,hp:100,dead:false,state:'idle'});
            },RESPAWN);
          }
          break;
        }
      }
      if(!hit) keep.push(b);
    }
    room.bullets=keep;
    if(room.bullets.length)
      io.to(room.id).emit('bullets',room.bullets.map(b=>({id:b.id,x:b.x,y:b.y,team:b.team})));
  }
},33);

// ── SOCKET ────────────────────────────────
io.on('connection', socket => {
  let room=null, player=null;
  console.log('[+]',socket.id);

  function doJoin(r, data) {
    const team=pickTeam(r);
    if(!team){socket.emit('roomFull');return;}
    room=r;
    room.teams[team].add(socket.id);
    const s=spawn(team);
    player={
      id:socket.id,
      name:(data.name||'Asker').slice(0,20),
      tgId:data.tgId||null,
      x:s.x,y:s.y,
      angle:team==='blue'?0:Math.PI,
      hp:100,team,state:'idle',dead:false,
      kills:0,deaths:0,lastShot:0
    };
    room.players.set(socket.id,player);
    socket.join(room.id);

    // send walls only once on join
    socket.emit('joined',{
      roomId:room.id,
      playerId:socket.id,
      team,
      walls:WALLS,
      mapWidth:MAP_W,
      mapHeight:MAP_H,
      players:snap(room),
      scores:{...room.scores},
      myPlayer:{...player},
      teams:{blue:room.teams.blue.size,red:room.teams.red.size}
    });

    socket.to(room.id).emit('playerJoined',{...player});
    io.to(room.id).emit('roomUpdate',roomInfo(room));
    console.log(`[Join] ${player.name}(${team}) -> ${room.id} [${room.players.size}p]`);
  }

  socket.on('getRooms', ()=> socket.emit('roomsList', Array.from(rooms.values()).map(roomInfo)));
  socket.on('findGame',   data => doJoin(findRoom(), data||{}));
  socket.on('createRoom', data => doJoin(newRoom(),  data||{}));
  socket.on('joinRoom',   data => {
    const r=rooms.get(data.roomId);
    if(r) doJoin(r,data); else socket.emit('error','Oda bulunamadı');
  });

  socket.on('input', inp => {
    if(!room||!player||player.dead) return;
    const k=inp.keys||{}, spd=3.8;
    let nx=player.x,ny=player.y,mv=false;
    if(k.w){ny-=spd;mv=true;} if(k.s){ny+=spd;mv=true;}
    if(k.a){nx-=spd;mv=true;} if(k.d){nx+=spd;mv=true;}
    if(!wallHit(nx,player.y)) player.x=Math.max(50,Math.min(MAP_W-50,nx));
    if(!wallHit(player.x,ny)) player.y=Math.max(50,Math.min(MAP_H-50,ny));
    if(inp.angle!==undefined) player.angle=inp.angle;
    if(k.space&&player.state!=='jump'){
      player.state='jump';
      setTimeout(()=>{if(player)player.state='idle';},550);
    } else if(mv&&player.state!=='jump') player.state='walk';
    else if(!mv&&player.state!=='jump') player.state='idle';

    if(inp.shoot){
      const now=Date.now();
      if(now-player.lastShot>=FIRE_RATE){
        player.lastShot=now;
        room.bullets.push({
          id:socket.id+'_'+now,
          x:player.x+Math.cos(player.angle)*22,
          y:player.y+Math.sin(player.angle)*22,
          vx:Math.cos(player.angle)*BULLET_SPD,
          vy:Math.sin(player.angle)*BULLET_SPD,
          owner:socket.id, team:player.team, dist:0
        });
        socket.to(room.id).emit('shot',{owner:socket.id,x:player.x,y:player.y,angle:player.angle});
      }
    }

    socket.to(room.id).emit('playerMoved',{id:socket.id,x:player.x,y:player.y,angle:player.angle,state:player.state,hp:player.hp});
  });

  socket.on('disconnect', () => {
    if(!room) return;
    room.players.delete(socket.id);
    room.teams.blue.delete(socket.id);
    room.teams.red.delete(socket.id);
    io.to(room.id).emit('playerLeft',socket.id);
    io.to(room.id).emit('roomUpdate',roomInfo(room));
    if(room.players.size===0&&rooms.size>1){rooms.delete(room.id);console.log('[Oda-]',room.id);}
    console.log('[-]',socket.id);
  });
});

// Render uyku önleyici
setInterval(()=>console.log(`[alive] ${new Date().toLocaleTimeString()} rooms:${rooms.size}`),25000);

server.listen(PORT,()=>console.log('[Server] port',PORT));
