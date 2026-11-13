// ═══════════════════════════════════════════════════════
//  Ayarlar
// ═══════════════════════════════════════════════════════
const AI_PROVIDER = "groq"; // "groq" | "gemini"

const CHARACTERS = [
  {
    id: "luna", name: "Luna", role: "Sanatçı", emoji: "🎨",
    color: "#ff6ec7",
    pos: { x: 25, y: 30 },      // yüzde cinsinden
    room: { x: 25, y: 30, label: "Atölye" },
    personality: "Sen Luna'sın, genç bir ressam. Duygusal, yaratıcı, şiirsel konuşursun. Kısa ve içten cevap ver."
  },
  {
    id: "rex", name: "Kaptan Rex", role: "Yazılımcı", emoji: "💻",
    color: "#4ade80",
    pos: { x: 75, y: 30 },
    room: { x: 75, y: 30, label: "Ofis" },
    personality: "Sen Kaptan Rex'sin, kıdemli yazılımcı. Mantıklı, doğrudan, esprili. Kısa, net cevap ver."
  },
  {
    id: "mira", name: "Mira", role: "Şef", emoji: "🍳",
    color: "#ffa94d",
    pos: { x: 25, y: 70 },
    room: { x: 25, y: 70, label: "Mutfak" },
    personality: "Sen Mira'sın, sıcakkanlı bir şef. Yemek, tat, koku üzerinden konuşursun. Kısa, samimi cevap ver."
  },
  {
    id: "atlas", name: "Atlas", role: "Filozof", emoji: "📚",
    color: "#7aaaff",
    pos: { x: 75, y: 70 },
    room: { x: 75, y: 70, label: "Kütüphane" },
    personality: "Sen Atlas'sın, sakin bir filozof. Derin, düşünceli konuşursun. Kısa ama anlamlı cevap ver."
  }
];

// ═══════════════════════════════════════════════════════
//  Dünya oluştur
// ═══════════════════════════════════════════════════════
const world = document.getElementById('world');
const charEls = {};

CHARACTERS.forEach(char => {
  // Oda
  const room = document.createElement('div');
  room.className = 'room';
  room.style.left = char.room.x + '%';
  room.style.top = char.room.y + '%';
  room.style.color = char.color;
  room.innerHTML = `
    <div class="floor" style="background:${char.color}"></div>
    <div class="wall"></div>
    <div class="label">${char.room.label}</div>
  `;
  room.addEventListener('click', () => selectCharacter(char.id));
  world.appendChild(room);

  // Karakter
  const c = document.createElement('div');
  c.className = 'char';
  c.style.left = char.pos.x + '%';
  c.style.top = char.pos.y + '%';
  c.style.color = char.color;
  c.innerHTML = `
    <div class="bubble"></div>
    <div class="avatar" style="background: radial-gradient(circle at 30% 30%, ${char.color}, #1a1a2e)">${char.emoji}</div>
    <div class="name">${char.name}</div>
  `;
  c.addEventListener('click', () => selectCharacter(char.id));
  world.appendChild(c);

  charEls[char.id] = {
    root: c,
    bubble: c.querySelector('.bubble')
  };
});

// ═══════════════════════════════════════════════════════
//  UI
// ═══════════════════════════════════════════════════════
const messagesEl = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('serverStatus');
const statusText = document.getElementById('statusText');
const chatPanel = document.getElementById('chatPanel');
const chatToggle = document.getElementById('chatToggle');

let activeId = CHARACTERS[0].id;

function selectCharacter(id) {
  activeId = id;
  const char = CHARACTERS.find(c => c.id === id);

  document.querySelectorAll('.char').forEach(el => el.classList.remove('active'));
  charEls[id].root.classList.add('active');

  document.getElementById('chatName').textContent = char.name;
  document.getElementById('chatRole').textContent = `· ${char.role}`;
}

selectCharacter(activeId);

document.getElementById('chatHeader').addEventListener('click', () => {
  chatPanel.classList.toggle('collapsed');
  chatToggle.textContent = chatPanel.classList.contains('collapsed') ? 'aç ▴' : 'kapat ▾';
});

const history = {};
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

function setStatus(text, cls) {
  statusText.textContent = text;
  statusEl.className = cls;
}

function showBubble(charId, text) {
  const b = charEls[charId].bubble;
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(b._timer);
  b._timer = setTimeout(() => b.classList.remove('show'), 6000);
}

// ═══════════════════════════════════════════════════════
//  Sunucuya istek (key sunucuda, env var'da)
// ═══════════════════════════════════════════════════════
async function askAI(char, userMsg, hist) {
  const messages = [...hist, { role: 'user', content: userMsg }];

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: char.personality,
      messages,
      provider: AI_PROVIDER
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.reply;
}

async function sendMessage(userText) {
  const char = CHARACTERS.find(c => c.id === activeId);

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

    showBubble(char.id, reply);
    setStatus('bağlı', 'ok');
  } catch (e) {
    typing.classList.remove('typing');
    typing.textContent = `⚠️ ${e.message}`;
    setStatus('hata', 'err');
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

  try {
    const prompt = `Kullanıcı sana şu emri verdi: "${cmd}". Bu emri yerine getiriyormuş gibi kısa bir tepki ver (1-2 cümle).`;
    const reply = await askAI(char, prompt, []);

    // Küçük zıplama animasyonu
    const el = charEls[char.id].root;
    el.animate([
      { transform: 'translate(-50%, -50%) scale(1)' },
      { transform: 'translate(-50%, -100%) scale(1.1)' },
      { transform: 'translate(-50%, -50%) scale(1)' }
    ], { duration: 500, easing: 'ease-out' });

    showBubble(char.id, reply);
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
//  Başlat
// ═══════════════════════════════════════════════════════
document.getElementById('loading').classList.add('hidden');
setStatus('bağlı', 'ok');

// Sunucu sağlık kontrolü
fetch('/api/health')
  .then(r => r.json())
  .then(d => {
    if (d.ok) setStatus('bağlı', 'ok');
    else setStatus('key yok', 'err');
  })
  .catch(() => setStatus('sunucu yok', 'err'));
