const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get('/api/health', (req, res) => {
  res.json({ ok: true, groq: !!GROQ_API_KEY, gemini: !!GEMINI_API_KEY });
});

app.post('/api/chat', async (req, res) => {
  const { system, messages, provider } = req.body;
  if (!system || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Geçersiz istek' });
  }
  try {
    if (provider === 'gemini' && GEMINI_API_KEY) {
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            generationConfig: { temperature: 0.8, maxOutputTokens: 200 }
          })
        }
      );
      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: `Gemini: ${err.slice(0, 300)}` });
      }
      const data = await r.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ reply });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY tanımlı değil' });
    }

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.8,
        max_tokens: 200
      })
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: `Groq: ${err.slice(0, 300)}` });
    }
    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content || '';
    res.json({ reply });
  } catch (e) {
    console.error('Chat hatası:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Sunucu ${PORT} portunda`);
  console.log(`🔑 Groq: ${GROQ_API_KEY ? 'var' : 'YOK'}`);
  console.log(`🔑 Gemini: ${GEMINI_API_KEY ? 'var' : 'YOK'}`);
});
