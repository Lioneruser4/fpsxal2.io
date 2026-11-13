import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ═══════════════════════════════════════════════════════
//  API KEY'LERİNİ BURAYA YAZ (tırnak içine)
// ═══════════════════════════════════════════════════════
const GROQ_API_KEY   = "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";    // https://console.groq.com/keys
const GEMINI_API_KEY = "AQ.Ab8RN6ITN6hKdG8hF6n0rTxWBUeSviDluenkyiGKXJEUP2TTZg";  // https://aistudio.google.com/app/apikey
const USE_GEMINI     = false;                   // true → Gemini kullan, false → Groq

// ═══════════════════════════════════════════════════════
//  KARAKTERLER (kişilik + oda konumu)
// ═══════════════════════════════════════════════════════
const CHARACTERS = [
  {
    id: "luna",
    name: "Luna",
    role: "Sanatçı",
    color: 0xff6ec7,
    room: { x: -6, z: -4, label: "Atölye", color: 0x2a1a3a },
    personality: "Sen Luna'sın, genç bir ressam. Duygusal, yaratıcı, şiirsel konuşursun. Renkler ve sanat hakkında tutkulusun. Kısa ve içten cevap ver.",
    greeting: "Merhaba… atölyeme hoş geldin. Bugün hangi renk seni çağırıyor?"
  },
  {
    id: "kaptan",
    name: "Kaptan Rex",
    role: "Yazılımcı",
    color: 0x4ade80,
    room: { x: 6, z: -4, label: "Ofis", color: 0x1a2a1a },
    personality: "Sen Kaptan Rex'sin, kıdemli bir yazılımcı. Mantıklı, doğrudan, esprili konuşursun. Kod ve teknoloji hakkında konuşmayı seversin. Kısa, net cevap ver.",
    greeting: "Selam. Ofise hoş geldin. Bir bug mı var, yoksa fikir mi paylaşacaksın?"
  },
  {
    id: "mira",
    name: "Mira",
    role: "Şef",
    color: 0xffa94d,
    room: { x: -6, z: 4, label: "Mutfak", color: 0x2a1a0a },
    personality: "Sen Mira'sın, sıcakkanlı bir şef. Yemek, tat, koku üzerinden konuşursun. Misafirperver ve neşelisin. Kısa, samimi cevap ver.",
    greeting: "Hoş geldin canım! Mutfağımda ne pişirsem diye düşünüyordum. Aç mısın?"
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Filozof",
    color: 0x7aaaff,
    room: { x: 6, z: 4, label: "Kütüphane", color: 0x1a1a2a },
    personality: "Sen Atlas'sın, sakin bir filozof. Derin, düşünceli, bazen gizemli konuşursun. Sorulara soruyla karşılık vermeyi seversin. Kısa ama anlamlı cevap ver.",
    greeting: "Ah… geldin demek. Otur. Bugün zihnini ne meşgul ediyor?"
  }
];

// ═══════════════════════════════════════════════════════
//  THREE.JS SAHNE KURULUMU
// ═══════════════════════════════════════════════════════
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);
scene.fog = new THREE.Fog(0x0a0a12, 20, 45);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 12, 18);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 8;
controls.maxDistance = 32;

// Işık
scene.add(new THREE.AmbientLight(0x404060, 1.2));
const hemi = new THREE.HemisphereLight(0x8090ff, 0x201020, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(10, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
scene.add(sun);

// Zemin
const groundGeo = new THREE.CircleGeometry(30, 64);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Izgara
const grid = new THREE.GridHelper(60, 60, 0x2a2a4a, 0x1a1a2a);
grid.material.opacity = 0.4;
grid.material.transparent = true;
scene.add(grid);

// ═══════════════════════════════════════════════════════
//  ODA + KARAKTER OLUŞTURMA
// ═══════════════════════════════════════════════════════
const charMeshes = {};  // id → { group, head, roomMesh, bubble }

function createRoom(room) {
  const g = new THREE.Group();
  g.position.set(room.x, 0, room.z);

  // Oda zemini
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  g.add(floor);

  // Oda ışığı (tavan)
  const roomLight = new THREE.PointLight(room.color, 2, 8);
  roomLight.position.set(0, 3, 0);
  g.add(roomLight);

  // Duvarlar (yarım daire)
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2a, transparent: true, opacity: 0.6,
    side: THREE.DoubleSide, roughness: 0.9
  });
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.5, 2.5, 32, 1, true, 0, Math.PI * 1.5),
    wallMat
  );
  wall.position.y = 1.25;
  g.add(wall);

  // Oda etiketi (sprite)
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 256; canvas2d.height = 64;
  const ctx = canvas2d.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.roundRect(0, 0, 256, 64, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(room.label, 128, 32);
  const tex = new THREE.CanvasTexture(canvas2d);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.position.set(0, 4, 0);
  sprite.scale.set(2.4, 0.6, 1);
  g.add(sprite);

  scene.add(g);
  return g;
}

function createCharacter(char) {
  const group = new THREE.Group();
  group.position.set(char.room.x + (Math.random() * 2 - 1), 0, char.room.z + (Math.random() * 2 - 1));

  // Gövde
  const bodyMat = new THREE.MeshStandardMaterial({ color: char.color, roughness: 0.5, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 8, 16), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);

  // Kafa
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffe0c0, roughness: 0.6 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), headMat);
  head.position.y = 1.85;
  head.castShadow = true;
  group.add(head);

  // Gözler
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a12 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), eyeMat);
  eyeL.position.set(-0.15, 1.9, 0.36);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.15;
  group.add(eyeL, eyeR);

  // İsim etiketi
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.7)';
  c.roundRect(0, 0, 256, 64, 16);
  c.fill();
  c.fillStyle = '#ffffff';
  c.font = 'bold 28px system-ui';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(char.name, 128, 32);
  const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true
  }));
  nameSprite.position.set(0, 2.7, 0);
  nameSprite.scale.set(1.8, 0.45, 1);
  group.add(nameSprite);

  // Konuşma balonu
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeBubbleTexture("Merhaba!"), transparent: true, depthTest: false
  }));
  bubble.position.set(0, 3.4, 0);
  bubble.scale.set(3, 0.9, 1);
  bubble.visible = false;
  group.add(bubble);

  scene.add(group);
  return { group, head, bubble };
}

function makeBubbleTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(20,20,40,0.95)';
  c.roundRect(10, 10, 492, 120, 30);
  c.fill();
  c.strokeStyle = 'rgba(150,150,255,0.6)';
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = '#ffffff';
  c.font = 'bold 26px system-ui';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  wrapText(c, text, 256, 70, 460, 30);
  return new THREE.CanvasTexture(cv);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line.trim());
      line = w + ' ';
    } else line = test;
  }
  lines.push(line.trim());
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

// Odaları ve karakterleri sahneye ekle
CHARACTERS.forEach(char => {
  createRoom(char.room);
  charMeshes[char.id] = createCharacter(char);
});

// ═══════════════════════════════════════════════════════
//  UI — KARAKTER SEÇİCİ
// ═══════════════════════════════════════════════════════
const charBar = document.getElementById('charBar');
let activeCharId = CHARACTERS[0].id;

CHARACTERS.forEach(char => {
  const btn = document.createElement('button');
  btn.className = 'charBtn';
  btn.textContent = char.name;
  btn.dataset.id = char.id;
  btn.addEventListener('click', () => selectCharacter(char.id));
  charBar.appendChild(btn);
});

function selectCharacter(id) {
  activeCharId = id;
  document.querySelectorAll('.charBtn').forEach(b =>
    b.classList.toggle('active', b.dataset.id === id)
  );
  const char = CHARACTERS.find(c => c.id === id);
  document.getElementById('chatTitle').textContent = `${char.name} — ${char.role}`;

  // Kamerayı karaktere yaklaştır
  const m = charMeshes[id].group.position;
  controls.target.set(m.x, 1.2, m.z);
  camera.position.set(m.x + 4, 4.5, m.z + 6);
}

// İlk seçimi yap
selectCharacter(activeCharId);

// ═══════════════════════════════════════════════════════
//  SOHBET
// ═══════════════════════════════════════════════════════
const messagesEl = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');

const conversationHistory = {}; // id → [{role, content}]

CHARACTERS.forEach(c => conversationHistory[c.id] = []);

function addMessage(text, who, name) {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  if (name) {
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = name;
    div.appendChild(n);
  }
  div.appendChild(document.createTextNode(text));
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

async function callGroq(systemPrompt, history, userMsg) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMsg }
      ],
      temperature: 0.8,
      max_tokens: 200
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function callGemini(systemPrompt, history, userMsg) {
  const contents = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }]
  }));
  contents.push({ role: 'user', parts: [{ text: userMsg }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.8, maxOutputTokens: 200 }
      })
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

async function sendMessage(userText) {
  const char = CHARACTERS.find(c => c.id === activeCharId);
  const mesh = charMeshes[char.id];

  addMessage(userText, 'user', 'Sen');

  const typing = addMessage('', 'ai', char.name);
  typing.classList.add('typing');

  sendBtn.disabled = true;
  statusEl.textContent = 'düşünüyor…';
  statusEl.className = '';

  try {
    const history = conversationHistory[char.id];
    let reply;
    if (USE_GEMINI && GEMINI_API_KEY !== 'YOUR_GEMINI_KEY_HERE') {
      reply = await callGemini(char.personality, history, userText);
    } else {
      reply = await callGroq(char.personality, history, userText);
    }

    history.push({ role: 'user', content: userText });
    history.push({ role: 'assistant', content: reply });

    typing.classList.remove('typing');
    typing.textContent = reply;

    // 3D balon
    mesh.bubble.material.map = makeBubbleTexture(reply);
    mesh.bubble.material.needsUpdate = true;
    mesh.bubble.visible = true;
    mesh.bubble.scale.set(3, 0.9, 1);
    clearTimeout(mesh._bubbleTimer);
    mesh._bubbleTimer = setTimeout(() => { mesh.bubble.visible = false; }, 6000);

    statusEl.textContent = 'hazır';
    statusEl.className = 'ok';
  } catch (e) {
    typing.classList.remove('typing');
    typing.textContent = `⚠️ Hata: ${e.message}`;
    statusEl.textContent = 'hata';
    statusEl.className = 'err';
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', () => {
  const t = chatInput.value.trim();
  if (!t) return;
  chatInput.value = '';
  sendMessage(t);
});
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendBtn.click();
});

// ═══════════════════════════════════════════════════════
//  EMİR KUTUSU
// ═══════════════════════════════════════════════════════
const cmdInput = document.getElementById('cmdInput');
const cmdBtn = document.getElementById('cmdBtn');

cmdBtn.addEventListener('click', async () => {
  const cmd = cmdInput.value.trim();
  if (!cmd) return;
  cmdInput.value = '';
  cmdBtn.disabled = true;

  const char = CHARACTERS.find(c => c.id === activeCharId);
  const mesh = charMeshes[char.id];

  // Karaktere emri ilet
  try {
    const prompt = `Kullanıcı sana şu emri verdi: "${cmd}". Bu emri yerine getiriyormuş gibi kısa bir tepki ver (1-2 cümle). Yapabildiğini söyle veya neden yapamadığını açıkla.`;
    let reply;
    if (USE_GEMINI && GEMINI_API_KEY !== 'YOUR_GEMINI_KEY_HERE') {
      reply = await callGemini(char.personality, [], prompt);
    } else {
      reply = await callGroq(char.personality, [], prompt);
    }

    // Basit animasyon: karakter zıplasın
    animateJump(mesh.group);

    // Balonda göster
    mesh.bubble.material.map = makeBubbleTexture(reply);
    mesh.bubble.material.needsUpdate = true;
    mesh.bubble.visible = true;
    clearTimeout(mesh._bubbleTimer);
    mesh._bubbleTimer = setTimeout(() => { mesh.bubble.visible = false; }, 6000);

    addMessage(`[Emir] ${cmd}`, 'user', 'Sen');
    addMessage(reply, 'ai', char.name);
  } catch (e) {
    addMessage(`⚠️ Emir hatası: ${e.message}`, 'ai', 'Sistem');
  } finally {
    cmdBtn.disabled = false;
  }
});
cmdInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') cmdBtn.click();
});

// Basit zıplama animasyonu
const jumpAnims = [];
function animateJump(obj) {
  jumpAnims.push({ obj, t: 0 });
}

// ═══════════════════════════════════════════════════════
//  RENDER DÖNGÜSÜ
// ═══════════════════════════════════════════════════════
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  // Karakterler hafifçe sallansın
  CHARACTERS.forEach(c => {
    const m = charMeshes[c.id];
    m.group.position.y = Math.sin(t * 1.2 + c.room.x) * 0.05;
    m.head.rotation.y = Math.sin(t * 0.6 + c.room.z) * 0.3;
  });

  // Zıplama animasyonları
  for (let i = jumpAnims.length - 1; i >= 0; i--) {
    const a = jumpAnims[i];
    a.t += dt;
    const dur = 0.6;
    if (a.t >= dur) {
      a.obj.position.y = 0;
      jumpAnims.splice(i, 1);
    } else {
      a.obj.position.y = Math.sin((a.t / dur) * Math.PI) * 0.8;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

// Boyut değişimi
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Başlat
document.getElementById('loading').classList.add('hidden');
animate();

statusEl.textContent = 'hazır';
statusEl.className = 'ok';
