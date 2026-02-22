const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] } // Tüm bağlantılara izin ver
});

app.use(cors());
app.use(express.json());

// Sunucunun çalıştığını gösteren basit bir rota
app.get('/', (req, res) => {
  res.send('🎮 SAŞKİ OYUNU Sunucusu Çalışıyor!');
});

// Aktif odaları listeleyen API
app.get('/api/rooms', (req, res) => {
  const activeRooms = Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    players: Object.keys(r.players).length,
    redCount: r.redCount,
    blueCount: r.blueCount,
    map: r.map
  }));
  res.json(activeRooms);
});

// Oda oluşturma API'si
app.post('/api/rooms/create', (req, res) => {
  const { name, map } = req.body;
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newRoom = {
    id: roomId,
    name: name || `Oda ${roomId}`,
    map: map || 'backrooms',
    players: {},
    teamRed: [],
    teamBlue: [],
    redCount: 0,
    blueCount: 0,
    created: Date.now()
  };
  rooms.set(roomId, newRoom);
  res.json({ id: roomId });
});

// ---- Oda ve Oyuncu Yönetimi ----
const rooms = new Map();

// Sunucuyu uyanık tutan ping mekanizması (20 saniyede bir)
setInterval(() => {
  http.get(`http://localhost:${PORT}`, (res) => {
    console.log('🔁 Kendi kendine ping atıldı, durum:', res.statusCode);
  }).on('error', (err) => {
    console.log('🔁 Ping hatası (önemli değil):', err.message);
  });
}, 20000); // 20 saniye

// Socket.IO bağlantıları
io.on('connection', (socket) => {
  console.log('✅ Yeni oyuncu bağlandı:', socket.id);

  // 1. Oyuncu odaya katılıyor
  socket.on('joinRoom', (data) => {
    const { username, telegramId, roomId } = data;
    let targetRoom;

    // Eğer oda ID'si verilmemişse veya oda doluysa yeni oda bul/oluştur
    if (!roomId || !rooms.has(roomId) || rooms.get(roomId).redCount + rooms.get(roomId).blueCount >= 20) {
      targetRoom = findAvailableRoom();
    } else {
      targetRoom = rooms.get(roomId);
    }

    // Takım seçimi (az olan takım)
    const team = targetRoom.redCount <= targetRoom.blueCount ? 'red' : 'blue';
    if (team === 'red') {
      targetRoom.redCount++;
      targetRoom.teamRed.push(socket.id);
    } else {
      targetRoom.blueCount++;
      targetRoom.teamBlue.push(socket.id);
    }

    // Oyuncu nesnesi
    const player = {
      id: socket.id,
      username: username || `Oyuncu${Math.floor(Math.random() * 1000)}`,
      telegramId: telegramId || null,
      team: team,
      health: 100,
      position: { x: Math.random() * 10 - 5, y: 1, z: Math.random() * 10 - 5 },
      rotation: 0,
      isAlive: true
    };

    targetRoom.players[socket.id] = player;
    socket.join(targetRoom.id);
    socket.playerData = player;
    socket.currentRoom = targetRoom.id;

    // Oyuncuya odaya katıldığına dair bilgi gönder
    socket.emit('roomJoined', {
      roomId: targetRoom.id,
      players: targetRoom.players,
      redCount: targetRoom.redCount,
      blueCount: targetRoom.blueCount,
      yourTeam: team
    });

    // Diğer oyunculara yeni oyuncuyu bildir
    socket.to(targetRoom.id).emit('newPlayer', player);

    console.log(`${player.username} (${team}) odasına katıldı: ${targetRoom.id}`);
  });

  // 2. Oyuncu hareket ettiğinde
  socket.on('playerMove', (position) => {
    if (socket.playerData && socket.currentRoom) {
      socket.playerData.position = position;
      socket.to(socket.currentRoom).emit('playerMoved', {
        id: socket.id,
        position: position
      });
    }
  });

  // 3. Oyuncu ateş ettiğinde
  socket.on('playerShoot', (data) => {
    if (!socket.playerData || !socket.currentRoom) return;
    const room = rooms.get(socket.currentRoom);
    if (!room) return;

    const { targetId, hitZone } = data;
    const target = room.players[targetId];
    
    if (target && target.isAlive && target.team !== socket.playerData.team) {
      // Hasar hesapla
      const damage = hitZone === 'head' ? 100 : hitZone === 'body' ? 35 : 20;
      target.health -= damage;

      // Hasar bilgisini herkese gönder
      io.to(socket.currentRoom).emit('playerHit', {
        targetId: targetId,
        health: target.health,
        shooterId: socket.id,
        hitZone: hitZone
      });

      // Ölüm kontrolü
      if (target.health <= 0) {
        target.isAlive = false;
        io.to(socket.currentRoom).emit('playerDied', {
          victimId: targetId,
          killerId: socket.id,
          killerName: socket.playerData.username,
          victimName: target.username
        });

        // Yeniden doğma (5 saniye sonra)
        setTimeout(() => {
          if (room.players[targetId]) {
            target.health = 100;
            target.isAlive = true;
            target.position = { x: Math.random() * 10 - 5, y: 1, z: Math.random() * 10 - 5 };
            io.to(socket.currentRoom).emit('playerRespawn', target);
          }
        }, 5000);
      }
    }
  });

  // 4. Oyuncu yeniden bağlanma denemesi
  socket.on('reconnectPlayer', (telegramId) => {
    for (let room of rooms.values()) {
      for (let p of Object.values(room.players)) {
        if (p.telegramId === telegramId) {
          // Eski bağlantıyı bul ve güncelle
          const oldId = p.id;
          p.id = socket.id;
          room.players[socket.id] = p;
          delete room.players[oldId];
          
          if (p.team === 'red') {
            room.teamRed = room.teamRed.map(id => id === oldId ? socket.id : id);
          } else {
            room.teamBlue = room.teamBlue.map(id => id === oldId ? socket.id : id);
          }

          socket.join(room.id);
          socket.playerData = p;
          socket.currentRoom = room.id;

          socket.emit('reconnectSuccess', {
            roomId: room.id,
            players: room.players,
            yourData: p
          });
          
          socket.to(room.id).emit('playerReconnected', socket.id);
          console.log('🔄 Oyuncu yeniden bağlandı:', p.username);
          return;
        }
      }
    }
  });

  // 5. Bağlantı koptuğunda
  socket.on('disconnect', () => {
    if (socket.playerData && socket.currentRoom) {
      const room = rooms.get(socket.currentRoom);
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
        
        // Diğerlerine bildir
        socket.to(socket.currentRoom).emit('playerLeft', socket.id);
        
        // Oda boşsa sil
        if (room.redCount + room.blueCount === 0) {
          rooms.delete(socket.currentRoom);
          console.log('🗑️ Boş oda silindi:', socket.currentRoom);
        }
      }
      console.log('❌ Oyuncu ayrıldı:', socket.playerData.username);
    }
  });
});

// Uygun oda bulma fonksiyonu
function findAvailableRoom() {
  for (let room of rooms.values()) {
    if (room.redCount + room.blueCount < 20) {
      return room;
    }
  }
  // Hiç uygun oda yoksa yeni oda oluştur
  const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newRoom = {
    id: newId,
    name: `Oda ${newId}`,
    players: {},
    teamRed: [],
    teamBlue: [],
    redCount: 0,
    blueCount: 0,
    map: 'backrooms'
  };
  rooms.set(newId, newRoom);
  return newRoom;
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor, adres: https://saskioyunu-1-2d6i.onrender.com`);
});
