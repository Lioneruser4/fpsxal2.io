import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ═══════════════════════════════════════════════════════
//  🔑 API KEY'LER
// ═══════════════════════════════════════════════════════
const GROQ_API_KEY   = "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";
const GEMINI_API_KEY = "AQ.Ab8RN6ITN6hKdG8hF6n0rTxWBUeSviDluenkyiGKXJEUP2TTZg";
const AI_PROVIDER    = "groq";   // "groq" | "gemini"

// ═══════════════════════════════════════════════════════
//  Karakterler
// ═══════════════════════════════════════════════════════
const CHARACTERS = [
  {
    id: "luna", name: "Luna", role: "Sanatçı", emoji: "🎨",
    color: 0xff6ec7, room: { x: -7, z: -5, label: "Atölye", color: 0x2a1a3a },
    personality: "Sen Luna'sın, genç bir ressam. Duygusal, yaratıcı, şiirsel konuşursun. Renkler ve sanat hakkında tutkulusun. Kısa ve içten cevap ver."
  },
  {
    id: "rex", name: "Kaptan Rex", role: "Yazılımcı", emoji: "💻",
    color: 0x4ade80, room: { x: 7, z: -5, label: "Ofis", color: 0x1a2a1a },
    personality: "Sen Kaptan Rex'sin, kıdemli yazılımcı. Mantıklı, doğrudan, esprili konuşursun. Kısa, net cevap ver."
  },
  {
    id: "mira", name: "Mira", role: "Şef", emoji: "🍳",
    color: 0xffa94d, room: { x: -7, z: 5, label: "Mutfak", color: 0x2a1a0a },
    personality: "Sen Mira'sın, sıcakkanlı bir şef. Yemek, tat, koku üzerinden konuşursun. Misafirperver ve neşelisin. Kısa, samimi cevap ver."
  },
  {
    id: "atlas", name: "Atlas", role: "Filozof", emoji: "📚",
    color: 0x7aaaff, room: { x: 7, z: 5, label: "Kütüphane", color: 0x1a1a2a },
    personality: "Sen Atlas'sın, sakin bir filozof. Derin, düşünceli konuşursun. Kısa ama anlamlı cevap ver."
  }
];

// ═══════════════════════════════════════════════════════
//  Three.js sahne
// ═══════════════════════════════════════════════════════
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05050a);
scene.fog = new THREE.FogExp2(0x05050a, 0.018);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 9, 16);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 6;
controls.maxDistance = 28;
controls.enablePan = false;

// Işıklar
scene.add(new THREE.AmbientLight(0x404060, 1.5));
scene.add(new THREE.HemisphereLight(0x8090ff, 0x201020, 0.8));

const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(10, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

// Zemin
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.9, metalness: 0.1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(80, 80, 0x2a2a4a, 0x15152a);
grid.material.opacity = 0.35;
grid.material.transparent = true;
grid.position.y = 0.01;
scene.add(grid);

// ═══════════════════════════════════════════════════════
//  Oda oluşturma
// ═══════════════════════════════════════════════════════
function createRoom(room) {
  const g = new THREE.Group();
  g.position.set(room.x, 0, room.z);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 40),
    new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.7, metalness: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  g.add(floor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.3, 3.5, 48),
    new THREE.MeshBasicMaterial({ color: room.color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.6, 2.8, 40, 1, true, Math.PI * 0.75, Math.PI * 1.5),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a2a, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, roughness: 0.9
    })
  );
  wall.position.y = 1.4;
  g.add(wall);

  const roomLight = new THREE.PointLight(room.color, 2.5, 9);
  roomLight.position.set(0, 3.2, 0);
  g.add(roomLight);

  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.75)';
  c.roundRect(8, 8, 240, 48, 24); c.fill();
  c.strokeStyle = '#7a7aff'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#fff';
  c.font = 'bold 22px system-ui';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(room.label, 128, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false
  }));
  sprite.position.set(0, 4.2, 0);
  sprite.scale.set(2.4, 0.6, 1);
  g.add(sprite);

  scene.add(g);
  return g;
}

// ═══════════════════════════════════════════════════════
//  Karakter oluşturma
// ═══════════════════════════════════════════════════════
const charObjs = {};

function createCharacter(char) {
  const group = new THREE.Group();
  group.position.set(char.room.x, 0, char.room.z);

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.0, 12, 24),
    new THREE.MeshStandardMaterial({ color: char.color, roughness: 0.4, metalness: 0.3, emissive: char.color, emissiveIntensity: 0.15 })
  );
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xffdcc0, roughness: 0.6 })
  );
  head.position.y = 2.05;
  head.castShadow = true;
  group.add(head);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a12 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), eyeMat);
  eyeL.position.set(-0.16, 2.1, 0.4);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.16;
  group.add(eyeL, eyeR);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1.0, 32),
    new THREE.MeshBasicMaterial({ color: char.color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  group.add(glow);

  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.75)';
  c.roundRect(8, 8, 240, 48, 24); c.fill();
  c.strokeStyle = '#7a7aff'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#fff';
  c.font = 'bold 22px system-ui';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(char.name, 128, 32);
  const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true
  }));
  nameSprite.position.set(0, 3.0, 0);
  nameSprite.scale.set(1.9, 0.5, 1);
  group.add(nameSprite);

  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeBubbleTexture("Merhaba!"), transparent: true, depthTest: false
  }));
  bubble.position.set(0, 3.7, 0);
  bubble.scale.set(3.2, 0.95, 1);
  bubble.visible = false;
  group.add(bubble);

  scene.add(group);
  return { group, head, body, bubble };
}

function makeBubbleTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(20,20,40,0.96)';
  c.roundRect(10, 10, 492, 120, 30); c.fill();
  c.strokeStyle = 'rgba(150,150,255,0.7)'; c.lineWidth = 3; c.stroke();
  c.fillStyle = '#fff';
  c.font = 'bold 24px system-ui';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  wrapText(c, text, 256, 70, 460, 28);
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

CHARACTERS.forEach(char => {
  createRoom(char.room);
  charObjs[char.id] = createCharacter(char);
});

// ═══════════════════════════════════════════════════════
//  UI — Karakter kartları
// ═══════════════════════════════════════════════════════
const charBar = document.getElementById('charBar');
let activeId = CHARACTERS[0].id;

CHARACTERS.forEach(char => {
  const card = document.createElement('div');
  card.className = 'charCard';
  card.dataset.id = char.id;
  card.innerHTML = `
    <div class="avatar" style="background: linear-gradient(135deg, #${char.color.toString(16).padStart(6,'0')}, #7a7aff)">${char.emoji}</div>
    <div class="info">
      <span class="n">${char.name}</span>
      <span class="r">${char.role}</span>
    </div>
  `;
  card.addEventListener('click', () => selectCharacter(char.id));
  charBar.appendChild(card);
});

function selectCharacter(id) {
  activeId = id;
  document.querySelectorAll('.charCard').forEach(c =>
    c.classList.toggle('active', c.dataset.id === id)
  );
  const char = CHARACTERS.find(c => c.id === id);
  document.getElementById('chatName').textContent = char.name;
  document.getElementById('chatRole').textContent = `· ${char.role}`;

  const m = charObjs[id].group.position;
  controls.target.set(m.x, 1.2, m.z);
  camera.position.set(m.x + 5, 5.5, m.z + 8);
}

selectCharacter(activeId);

// ═══════════════════════════════════════════════════════
//  Sohbet
// ═══════════════════════════════════════════════════════
const messagesEl = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('serverStatus');
const statusText = document.getElementById('statusText');
const chatPanel = document.getElementById('chatPanel');
const chatToggle = document.getElementById('chatToggle');

// Sohbet panelini aç/kapa
document.getElementById('chatHeader').addEventListener('click', () => {
  chatPanel.classList.toggle('collapsed');
  chatToggle.textContent = chatPanel.classList.contains('collapsed') ? 'kapat ▾' : 'aç ▴';
});

const history = {}; // id → [{role, content}]
CHARACTERS.forEach(c => history[c.id] = []);

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

async function callGroq(systemPrompt, hist, userMsg) {
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
        ...hist,
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

async function callGemini(systemPrompt, hist, userMsg) {
  const contents = hist.map(h => ({
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

async function askAI(char, userMsg, hist) {
  if (AI_PROVIDER === 'gemini' && GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_GEMINI_KEY_HERE') {
    return await callGemini(char.personality, hist, userMsg);
  }
  return await callGroq(char.personality, hist, userMsg);
}

async function sendMessage(userText) {
  const char = CHARACTERS.find(c => c.id === activeId);
  const mesh = charObjs[char.id];

  addMessage(userText, 'user', 'Sen');
  const typing = addMessage('', 'ai', char.name);
  typing.classList.add('typing');

  sendBtn.disabled = true;
  setStatus('düşünüyor', '');

  try {
    const reply = await askAI(char, userText, history[char.id]);
    history[char.id].push({ role: 'user', content: userText });
    history[char.id].push({ role: 'assistant', content: reply });

    typing.classList.remove('typing');
    typing.textContent = reply;

    mesh.bubble.material.map = makeBubbleTexture(reply);
    mesh.bubble.material.needsUpdate = true;
    mesh.bubble.visible = true;
    mesh.bubble.scale.set(3.2, 0.95, 1);
    clearTimeout(mesh._bubbleTimer);
    mesh._bubbleTimer = setTimeout(() => { mesh.bubble.visible = false; }, 6000);

    setStatus('bağlı', 'ok');
  } catch (e) {
    typing.classList.remove('typing');
    typing.textContent = `⚠️ ${e.message}`;
    setStatus('hata', 'err');
  } finally {
    sendBtn.disabled = false;
  }
}

function setStatus(text, cls) {
  statusText.textContent = text;
  statusEl.className = cls;
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
//  Emir kutusu
// ═══════════════════════════════════════════════════════
const cmdFab = document.getElementById('cmdFab');
const cmdPanel = document.getElementById('cmdPanel');
const cmdInput = document.getElementById('cmdInput');
const cmdBtn = document.getElementById('cmdBtn');

cmdFab.addEventListener('click', () => {
  cmdPanel.classList.toggle('open');
  cmdFab.classList.toggle('active');
  if (cmdPanel.classList.contains('open')) cmdInput.focus();
});

cmdBtn.addEventListener('click', async () => {
  const cmd = cmdInput.value.trim();
  if (!cmd) return;
  cmdInput.value = '';
  cmdBtn.disabled = true;

  const char = CHARACTERS.find(c => c.id === activeId);
  const mesh = charObjs[char.id];

  try {
    const prompt = `Kullanıcı sana şu emri verdi: "${cmd}". Bu emri yerine getiriyormuş gibi kısa bir tepki ver (1-2 cümle). Yapabildiğini söyle veya neden yapamadığını açıkla.`;
    const reply = await askAI(char, prompt, []);

    animateJump(mesh.group);

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

// ═══════════════════════════════════════════════════════
//  Zıplama animasyonu
// ═══════════════════════════════════════════════════════
const jumpAnims = [];
function animateJump(obj) { jumpAnims.push({ obj, t: 0 }); }

// ═══════════════════════════════════════════════════════
//  Render döngüsü
// ═══════════════════════════════════════════════════════
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  CHARACTERS.forEach(c => {
    const m = charObjs[c.id];
    m.group.position.y = Math.sin(t * 1.2 + c.room.x) * 0.05;
    m.head.rotation.y = Math.sin(t * 0.6 + c.room.z) * 0.3;
  });

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Başlat
document.getElementById('loading').classList.add('hidden');
setStatus('bağlı', 'ok');
animate();
