const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Oda yönetimi
const rooms = new Map();

// API endpoint'leri
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    redCount: room.redCount || 0,
    blueCount: room.blueCount || 0
  }));
  res.json(roomList);
});

app.post('/api/rooms/create', (req, res) => {
  const { name, map, user } = req.body;
  const roomId = Math.random().toString(36).substring(7);
  
  const room = {
    id: roomId,
    name: name || `Oda ${roomId}`,
    map: map || 'backrooms',
    players: {},
    teamRed: [],
    teamBlue: [],
    redCount: 0,
    blueCount: 0,
    created: Date.now(),
    createdBy: user?.id
  };
  
  rooms.set(roomId, room);
  res.json(room);
});

// Socket.IO bağlantıları
io.on('connection', (socket) => {
  console.log('Yeni oyuncu bağlandı:', socket.id);
  
  // Oyuncu girişi
  socket.on('player:join', (data) => {
    const { telegramId, username, roomId } = data;
    
    // Mevcut oda bul veya oluştur
    let room;
    if (roomId && rooms.has(roomId)) {
      room = rooms.get(roomId);
    } else {
      // Yeni oda bul veya oluştur
      room = findOrCreateRoom();
    }
    
    socket.join(room.id);
    socket.roomId = room.id;
    
    // Takım seçimi (az olan takıma ekle)
    let team = 'blue';
    if (room.redCount <= room.blueCount) {
      team = 'red';
      room.redCount++;
      room.teamRed.push(socket.id);
    } else {
      room.blueCount++;
      room.teamBlue.push(socket.id);
    }
    
    const playerData = {
      id: socket.id,
      telegramId,
      username,
      team,
      health: 100,
      kills: 0,
      deaths: 0,
      position: { x: Math.random() * 10 - 5, y: 0, z: Math.random() * 10 - 5 }
    };
    
    room.players[socket.id] = playerData;
    socket.playerData = playerData;
    
    // Yeni oyuncuya kendi bilgilerini gönder
    socket.emit('player:joined', playerData);
    
    // Diğer oyunculara yeni oyuncuyu bildir
    socket.to(room.id).emit('player:new', playerData);
    
    // Odaya katılan herkese güncel oda bilgisi
    io.to(room.id).emit('room:update', {
      id: room.id,
      redCount: room.redCount,
      blueCount: room.blueCount
    });
    
    console.log(`${username} ${team} takımına katıldı`);
  });
  
  // Oyuncu hareketi
  socket.on('player:move', (position) => {
    if (socket.playerData && socket.roomId) {
      socket.playerData.position = position;
      socket.to(socket.roomId).emit('player:moved', {
        id: socket.id,
        position
      });
    }
  });
  
  // Ateş etme
  socket.on('player:shoot', (data) => {
    if (!socket.roomId || !socket.playerData) return;
    
    const room = rooms.get(socket.roomId);
    if (!room) return;
    
    const { targetId, hitZone } = data;
    const target = room.players[targetId];
    
    if (target) {
      // Hasar hesapla
      const damage = hitZone === 'head' ? 100 : hitZone === 'body' ? 35 : 20;
      target.health -= damage;
      
      // Hasarı herkese bildir
      io.to(socket.roomId).emit('player:hit', {
        playerId: targetId,
        health: target.health,
        shooter: socket.playerData.username
      });
      
      // Ölüm kontrolü
      if (target.health <= 0) {
        socket.playerData.kills++;
        target.deaths++;
        
        io.to(socket.roomId).emit('player:dead', {
          killer: socket.playerData.username,
          victim: target.username
        });
        
        // 5 saniye sonra yeniden doğ
        setTimeout(() => {
          if (room.players[targetId]) {
            target.health = 100;
            target.position = { 
              x: Math.random() * 10 - 5, 
              y: 0, 
              z: Math.random() * 10 - 5 
            };
            
            io.to(socket.roomId).emit('player:respawn', target);
          }
        }, 5000);
      }
    }
  });
  
  // Yeniden bağlanma
  socket.on('player:reconnect', (telegramId) => {
    // Oyuncunun eski odasını bul
    for (const [id, room] of rooms) {
      for (const playerId in room.players) {
        if (room.players[playerId].telegramId === telegramId) {
          const player = room.players[playerId];
          socket.join(room.id);
          socket.roomId = room.id;
          socket.playerData = player;
          
          socket.emit('player:reconnected', {
            room: {
              id: room.id,
              redCount: room.redCount,
              blueCount: room.blueCount
            },
            playerData: player
          });
          
          // Diğer oyunculara yeniden bağlandığını bildir
          socket.to(room.id).emit('player:reconnected', player.id);
          return;
        }
      }
    }
  });
  
  // Bağlantı kopması
  socket.on('disconnect', () => {
    if (socket.roomId && socket.playerData) {
      const room = rooms.get(socket.roomId);
      if (room) {
        // Takımdan çıkar
        if (socket.playerData.team === 'red') {
          room.redCount--;
          room.teamRed = room.teamRed.filter(id => id !== socket.id);
        } else {
          room.blueCount--;
          room.teamBlue = room.teamBlue.filter(id => id !== socket.id);
        }
        
        // Oyuncuyu sil
        delete room.players[socket.id];
        
        // Oda güncellemesi gönder
        io.to(socket.roomId).emit('room:update', {
          id: room.id,
          redCount: room.redCount,
          blueCount: room.blueCount
        });
        
        // Diğer oyunculara ayrılmayı bildir
        socket.to(socket.roomId).emit('player:left', socket.id);
        
        // Oda boşsa sil
        if (room.redCount + room.blueCount === 0) {
          rooms.delete(socket.roomId);
          console.log('Oda silindi:', socket.roomId);
        }
      }
    }
    console.log('Oyuncu ayrıldı:', socket.id);
  });
});

// Oda bul veya oluştur fonksiyonu
function findOrCreateRoom() {
  // Önce dolu olmayan oda bul
  for (const [id, room] of rooms) {
    if (room.redCount + room.blueCount < 20) { // max 20 kişi (10v10)
      return room;
    }
  }
  
  // Yeni oda oluştur
  const roomId = Math.random().toString(36).substring(7);
  const newRoom = {
    id: roomId,
    name: `Oda ${roomId}`,
    players: {},
    teamRed: [],
    teamBlue: [],
    redCount: 0,
    blueCount: 0,
    created: Date.now()
  };
  
  rooms.set(roomId, newRoom);
  return newRoom;
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
