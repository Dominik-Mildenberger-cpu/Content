require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3747;

const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUPS_DIR = path.join(__dirname, 'backups');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

[BACKUPS_DIR, UPLOADS_DIR, path.join(__dirname, 'public')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Session cost tracking
let sessionCosts = { totalUSD: 0, requests: 0 };

const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 }
};

function getModel(task, saveMode = false) {
  if (saveMode) return 'claude-haiku-4-5-20251001';
  const haikuTasks = ['hashtags', 'caption', 'hook', 'cta', 'idea', 'chat'];
  if (haikuTasks.includes(task)) return 'claude-haiku-4-5-20251001';
  return 'claude-sonnet-4-20250514';
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { posts: [], analytics: [], ideas: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { posts: [], analytics: [], ideas: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function runBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const backupFile = path.join(BACKUPS_DIR, `data-${today}.json`);
    if (!fs.existsSync(backupFile)) {
      fs.copyFileSync(DATA_FILE, backupFile);
      const backups = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json')).sort();
      while (backups.length > 30) fs.unlinkSync(path.join(BACKUPS_DIR, backups.shift()));
    }
  } catch (err) {
    console.error('Backup-Fehler:', err.message);
  }
}
setInterval(runBackup, 24 * 60 * 60 * 1000);
runBackup();

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const VINELLA_SYSTEM = `Du bist der Content-Assistent für Vinella – eine Premium-Feinkost-Manufaktur aus der Pfalz (vinella.de).
Produkte: Weinbrand-Trüffel, Grappa-Pralinen, Weingummis, Likörpralinen, Feinkost-Geschenkboxen.
Stil: warm, authentisch, luxuriös, kulinarisch begeistert. Antworte immer auf Deutsch.`;

async function callClaude(model, messages, system, maxTokens = 1500) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Kein API-Key gefunden. Bitte .env Datei erstellen.');

  const body = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `API Fehler ${response.status}`);

  const pricing = PRICING[model] || PRICING['claude-sonnet-4-20250514'];
  sessionCosts.totalUSD += ((data.usage?.input_tokens || 0) / 1e6 * pricing.input)
    + ((data.usage?.output_tokens || 0) / 1e6 * pricing.output);
  sessionCosts.requests++;

  return data.content[0].text;
}

function getWeekDates(kw, year) {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - dow + 1 + (kw - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.get('/api/costs', (req, res) => res.json(sessionCosts));

// Posts
app.get('/api/posts', (req, res) => res.json(loadData().posts || []));

app.post('/api/posts', (req, res) => {
  const data = loadData();
  const post = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  if (!data.posts) data.posts = [];
  data.posts.push(post);
  saveData(data);
  res.json(post);
});

app.put('/api/posts/:id', (req, res) => {
  const data = loadData();
  const idx = data.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
  data.posts[idx] = { ...data.posts[idx], ...req.body };
  saveData(data);
  res.json(data.posts[idx]);
});

app.delete('/api/posts/:id', (req, res) => {
  const data = loadData();
  data.posts = (data.posts || []).filter(p => p.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// Analytics
app.get('/api/analytics', (req, res) => res.json(loadData().analytics || []));

app.post('/api/analytics', (req, res) => {
  const data = loadData();
  const entry = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  if (!data.analytics) data.analytics = [];
  data.analytics.push(entry);
  saveData(data);
  res.json(entry);
});

app.delete('/api/analytics/:id', (req, res) => {
  const data = loadData();
  data.analytics = (data.analytics || []).filter(a => a.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// Ideas
app.get('/api/ideas', (req, res) => res.json(loadData().ideas || []));

app.post('/api/ideas', (req, res) => {
  const data = loadData();
  const idea = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  if (!data.ideas) data.ideas = [];
  data.ideas.push(idea);
  saveData(data);
  res.json(idea);
});

app.delete('/api/ideas/:id', (req, res) => {
  const data = loadData();
  data.ideas = (data.ideas || []).filter(i => i.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// File upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
  res.json({
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    mimetype: req.file.mimetype
  });
});

// Claude proxy
app.post('/api/claude', async (req, res) => {
  try {
    const { task = 'chat', prompt, saveMode = false, history = [] } = req.body;
    const model = getModel(task, saveMode);
    const messages = [...history, { role: 'user', content: prompt }];
    const text = await callClaude(model, messages, VINELLA_SYSTEM, 2048);
    res.json({ text, model, costs: sessionCosts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vision analysis
app.post('/api/claude/vision', async (req, res) => {
  try {
    const { imageBase64, mediaType = 'image/jpeg', saveMode = false } = req.body;
    const model = saveMode ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-20250514';

    const prompt = `Analysiere dieses Vinella-Produktbild und erstelle professionellen Social-Media-Content.

Antworte NUR mit gültigem JSON (kein Markdown, keine Erklärungen außerhalb des JSON):
{
  "caption": "Instagram Caption auf Deutsch, ca. 1500 Zeichen, emotional und einladend, mit 2-3 passenden Emojis",
  "hooks": ["TikTok Hook 1 (max 60 Zeichen)", "TikTok Hook 2 (max 60 Zeichen)", "TikTok Hook 3 (max 60 Zeichen)"],
  "videoPrompt": "Higgsfield/Luma AI Prompt auf Englisch, sehr detailliert für KI-Video-Generierung mit diesem Produkt",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8", "hashtag9", "hashtag10", "hashtag11", "hashtag12", "hashtag13", "hashtag14", "hashtag15"]
}`;

    const text = await callClaude(model, [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: prompt }
      ]
    }], VINELLA_SYSTEM, 2048);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('KI-Antwort konnte nicht verarbeitet werden');
    res.json({ ...JSON.parse(jsonMatch[0]), model, costs: sessionCosts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Weekly plan generator
app.post('/api/generate-week', async (req, res) => {
  try {
    const {
      kw, year,
      instagram = 3, tiktok = 3, youtube = 1, facebook = 2, pinterest = 2,
      focusProduct = 'Weinbrand-Trüffel', theme = '', saveMode = false
    } = req.body;

    const model = saveMode ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-20250514';
    const weekDates = getWeekDates(parseInt(kw), parseInt(year));
    const total = parseInt(instagram) + parseInt(tiktok) + parseInt(youtube) + parseInt(facebook) + parseInt(pinterest);

    const prompt = `Erstelle einen Social-Media-Wochenplan für Vinella (Premium-Feinkost, Pfalz) für KW ${kw} ${year} (${weekDates[0]} bis ${weekDates[6]}).

Einstellungen:
- Fokus-Produkt: ${focusProduct}
- Kampagnen-Thema: ${theme || 'Premium-Genuss erleben'}
- Posts: Instagram=${instagram}, TikTok=${tiktok}, YouTube=${youtube}, Facebook=${facebook}, Pinterest=${pinterest}
- Regeln: Kein Doppel-Post am selben Tag auf gleicher Plattform, optimale Posting-Zeiten berücksichtigen

Antworte NUR mit einem JSON-Array (${total} Elemente), jedes Element:
{
  "date": "YYYY-MM-DD",
  "platform": "Instagram|TikTok|YouTube|Facebook|Pinterest",
  "product": "Produktname",
  "theme": "Thema des Posts",
  "hook": "Hook max 60 Zeichen",
  "caption": "Caption ca. 500-800 Zeichen auf Deutsch",
  "cta": "Call-to-Action kurz",
  "hashtags": ["tag1", "tag2", "tag3"],
  "postingTime": "HH:MM",
  "status": "geplant"
}`;

    const text = await callClaude(model, [{ role: 'user', content: prompt }], VINELLA_SYSTEM, 4096);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Wochenplan konnte nicht verarbeitet werden');
    const posts = JSON.parse(jsonMatch[0]);
    res.json({ posts, model, costs: sessionCosts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log('\n  🍇 ╔════════════════════════════════════╗');
  console.log('     ║   Vinella Content Studio           ║');
  console.log(`     ║   http://localhost:${PORT}            ║`);
  console.log('     ╚════════════════════════════════════╝\n');
  if (key) console.log(`  ✅ API-Key: ${key.substring(0, 20)}...`);
  else console.log('  ❌ Kein API-Key! Bitte .env erstellen.');
  console.log('');
});
