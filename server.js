// EZ Tracker - daily routine & task tracker split into life sections. Runs locally on port 3801.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3801;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILE = path.join(DATA_DIR, 'tracker.json');

const uid = () => crypto.randomBytes(8).toString('hex');
// local calendar date, not UTC — Laos is UTC+7, ticking a box at night must not slip a day
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DEFAULT_SECTIONS = [
  { id: 'fao', name: 'FAO Career', icon: '🌾' },
  { id: 'content', name: 'Content Creator', icon: '🎬' },
  { id: 'billing', name: 'Billing & Docs', icon: '🧾' },
  { id: 'household', name: 'Household', icon: '🏠' },
  { id: 'sport', name: 'Sport & Recreation', icon: '⚽' }
];

function readData() {
  let d;
  try { d = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { d = null; }
  if (!d || typeof d !== 'object') d = { version: 1, sections: DEFAULT_SECTIONS, tasks: [] };
  if (!Array.isArray(d.sections) || !d.sections.length) d.sections = DEFAULT_SECTIONS;
  if (!Array.isArray(d.tasks)) d.tasks = [];
  return d;
}
function writeData(d) {
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8');
}

// A daily task starts fresh each calendar day: yesterday's ticks get filed into
// history (which drives the streak) and every box is cleared.
function rollDaily(data) {
  const today = localDate();
  let changed = false;
  for (const t of data.tasks) {
    if (!t.daily) continue;
    if (t.lastRoll === today) continue;
    if (t.lastRoll) {
      const total = t.subs.length;
      const done = t.subs.filter(s => s.done).length;
      if (total ? done === total : t.done) {
        t.history = t.history || [];
        if (!t.history.includes(t.lastRoll)) t.history.push(t.lastRoll);
        t.history.sort();
        if (t.history.length > 400) t.history = t.history.slice(-400);
      }
    }
    for (const s of t.subs) { s.done = false; s.doneAt = null; }
    t.done = false;
    t.doneAt = null;
    t.lastRoll = today;
    changed = true;
  }
  if (changed) writeData(data);
  return data;
}

// every request rolls first, so a tab left open past midnight can't write into
// yesterday's boxes
const loadState = () => rollDaily(readData());

function findTask(data, id) { return data.tasks.find(t => t.id === id) || null; }

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', (req, res) => {
  res.json(loadState());
});

// ---------- sections ----------
app.patch('/api/sections/:id', (req, res) => {
  const data = loadState();
  const sec = data.sections.find(s => s.id === req.params.id);
  if (!sec) return res.status(404).json({ error: 'section not found' });
  for (const k of ['name', 'icon']) if (req.body[k] !== undefined) sec[k] = String(req.body[k]).slice(0, 40);
  writeData(data);
  res.json(sec);
});

// ---------- tasks ----------
app.post('/api/tasks', (req, res) => {
  const data = loadState();
  const sectionId = String(req.body.sectionId || '');
  if (!data.sections.some(s => s.id === sectionId)) return res.status(400).json({ error: 'unknown section' });
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });

  const task = {
    id: uid(),
    sectionId,
    title: title.slice(0, 200),
    note: String(req.body.note || '').slice(0, 2000),
    created: localDate(),
    createdAt: new Date().toISOString(),
    due: req.body.due || null,
    daily: !!req.body.daily,
    lastRoll: req.body.daily ? localDate() : null,
    history: [],
    done: false,
    doneAt: null,
    subs: []
  };
  data.tasks.unshift(task);
  writeData(data);
  res.json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const data = loadState();
  const t = findTask(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'task not found' });

  if (req.body.title !== undefined) t.title = String(req.body.title).trim().slice(0, 200);
  if (req.body.note !== undefined) t.note = String(req.body.note).slice(0, 2000);
  if (req.body.due !== undefined) t.due = req.body.due || null;
  if (req.body.sectionId !== undefined && data.sections.some(s => s.id === req.body.sectionId)) {
    t.sectionId = req.body.sectionId;
  }
  if (req.body.daily !== undefined) {
    t.daily = !!req.body.daily;
    t.lastRoll = t.daily ? localDate() : null;
    if (t.daily && !Array.isArray(t.history)) t.history = [];
  }
  if (req.body.done !== undefined) {
    t.done = !!req.body.done;
    t.doneAt = t.done ? localDate() : null;
    // ticking the parent ticks the whole checklist, unticking clears it
    for (const s of t.subs) { s.done = t.done; s.doneAt = t.done ? localDate() : null; }
  }
  writeData(data);
  res.json(t);
});

app.delete('/api/tasks/:id', (req, res) => {
  const data = loadState();
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => t.id !== req.params.id);
  if (data.tasks.length === before) return res.status(404).json({ error: 'task not found' });
  writeData(data);
  res.json({ ok: true });
});

// ---------- subtasks ----------
app.post('/api/tasks/:id/subs', (req, res) => {
  const data = loadState();
  const t = findTask(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'task not found' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  const sub = { id: uid(), text: text.slice(0, 200), done: false, doneAt: null, due: req.body.due || null };
  t.subs.push(sub);
  if (t.done) { t.done = false; t.doneAt = null; }   // a fresh step reopens the task
  writeData(data);
  res.json(t);
});

app.patch('/api/tasks/:id/subs/:sid', (req, res) => {
  const data = loadState();
  const t = findTask(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'task not found' });
  const sub = t.subs.find(s => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ error: 'subtask not found' });

  if (req.body.text !== undefined) sub.text = String(req.body.text).trim().slice(0, 200);
  if (req.body.due !== undefined) sub.due = req.body.due || null;
  if (req.body.done !== undefined) {
    sub.done = !!req.body.done;
    sub.doneAt = sub.done ? localDate() : null;
  }
  // parent state follows the checklist
  if (t.subs.length) {
    const all = t.subs.every(s => s.done);
    t.done = all;
    t.doneAt = all ? localDate() : null;
  }
  writeData(data);
  res.json(t);
});

app.delete('/api/tasks/:id/subs/:sid', (req, res) => {
  const data = loadState();
  const t = findTask(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'task not found' });
  t.subs = t.subs.filter(s => s.id !== req.params.sid);
  if (t.subs.length) {
    const all = t.subs.every(s => s.done);
    t.done = all;
    t.doneAt = all ? localDate() : null;
  }
  writeData(data);
  res.json(t);
});

// -- backup export --
app.get('/api/export', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.set('Content-Disposition', `attachment; filename="ez-tracker-backup-${localDate()}.json"`);
  res.send(JSON.stringify(loadState(), null, 2));
});

app.listen(PORT, () => console.log(`EZ Tracker running at http://localhost:${PORT}`));
