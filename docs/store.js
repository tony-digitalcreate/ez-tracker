// EZ Tracker — data layer for the hosted PWA.
//
// Local-first: every change lands in memory + localStorage immediately so the
// app stays instant and works offline, then syncs to Firestore when signed in.
// Cloud shape mirrors EZ Money's:
//   ezTracker/{uid}              -> { sections, updatedAt }
//   ezTracker/{uid}/tasks/{id}   -> one document per task (subtasks inline)

const LS_KEY = 'eztracker-state';
const LS_MERGED = 'eztracker-merged-uid';
const FB = 'https://www.gstatic.com/firebasejs/10.12.5/';

export const DEFAULT_SECTIONS = [
  { id: 'fao', name: 'FAO Career', icon: '🌾' },
  { id: 'content', name: 'Content Creator', icon: '🎬' },
  { id: 'billing', name: 'Billing & Docs', icon: '🧾' },
  { id: 'household', name: 'Household', icon: '🏠' },
  { id: 'sport', name: 'Sport & Recreation', icon: '⚽' }
];

// local calendar date, not UTC — Laos is UTC+7, ticking a box at night must not slip a day
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dayShift = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
};
const rid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
                                     : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

let state = { version: 1, sections: DEFAULT_SECTIONS.map(s => ({ ...s })), tasks: [] };
let onChange = () => {};
let onStatus = () => {};

let M = null;                 // firebase modules once imported
let auth = null, db = null;
let user = null;
let unsubs = [];
let mode = 'local';           // 'local' | 'cloud'
let firstSnapshot = false;

// ---------------------------------------------------------------- local store
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}
function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (d && Array.isArray(d.tasks)) {
      state = {
        version: 1,
        sections: Array.isArray(d.sections) && d.sections.length ? d.sections : DEFAULT_SECTIONS.map(s => ({ ...s })),
        tasks: d.tasks.map(normalizeTask)
      };
    }
  } catch {}
}

// tasks coming from an older local-server backup may miss the newer fields
function normalizeTask(t) {
  return {
    id: t.id || rid(),
    sectionId: t.sectionId || 'fao',
    title: String(t.title || 'Untitled'),
    note: t.note || '',
    created: t.created || localDate(),
    createdAt: t.createdAt || new Date().toISOString(),
    due: t.due || null,
    daily: !!t.daily,
    lastRoll: t.lastRoll || (t.daily ? localDate() : null),
    history: Array.isArray(t.history) ? t.history : [],
    done: !!t.done,
    doneAt: t.doneAt || null,
    subs: Array.isArray(t.subs) ? t.subs.map(s => ({
      id: s.id || rid(), text: String(s.text || ''), done: !!s.done,
      doneAt: s.doneAt || null, due: s.due || null
    })) : [],
    updatedAt: t.updatedAt || Date.now()
  };
}

// A daily task starts fresh each calendar day: the finished day is filed into
// history (which drives the streak) and every box is cleared.
function rollDaily() {
  const today = localDate();
  const rolled = [];
  for (const t of state.tasks) {
    if (!t.daily || t.lastRoll === today) continue;
    if (t.lastRoll) {
      const total = t.subs.length;
      const done = t.subs.filter(s => s.done).length;
      if (total ? done === total : t.done) {
        if (!t.history.includes(t.lastRoll)) t.history.push(t.lastRoll);
        t.history.sort();
        if (t.history.length > 400) t.history = t.history.slice(-400);
      }
    }
    for (const s of t.subs) { s.done = false; s.doneAt = null; }
    t.done = false;
    t.doneAt = null;
    t.lastRoll = today;
    t.updatedAt = Date.now();
    rolled.push(t);
  }
  return rolled;
}

function commit(tasks) {
  const list = Array.isArray(tasks) ? tasks : [tasks];
  for (const t of list) if (t) t.updatedAt = Date.now();
  saveLocal();
  onChange(state);
  for (const t of list) if (t) pushTask(t);
}

// ---------------------------------------------------------------- cloud sync
const rootDoc = () => M.doc(db, window.EZTRACKER_ROOT || 'ezTracker', user.uid);
const taskCol = () => M.collection(db, window.EZTRACKER_ROOT || 'ezTracker', user.uid, 'tasks');

function pushTask(t) {
  if (mode !== 'cloud' || !user) return;
  M.setDoc(M.doc(taskCol(), t.id), JSON.parse(JSON.stringify(t)))
    .catch(e => console.warn('push failed', e));
}
function pushSections() {
  if (mode !== 'cloud' || !user) return;
  M.setDoc(rootDoc(), { sections: state.sections, updatedAt: Date.now() }, { merge: true })
    .catch(e => console.warn('sections push failed', e));
}

async function startSync() {
  firstSnapshot = false;
  onStatus('sync', '☁ syncing…');

  const snap = await M.getDoc(rootDoc()).catch(() => null);
  if (snap && snap.exists() && Array.isArray(snap.data().sections) && snap.data().sections.length) {
    state.sections = snap.data().sections;
  } else {
    pushSections();   // first run on this account — seed the five sections
  }

  unsubs.push(M.onSnapshot(taskCol(), s => {
    for (const ch of s.docChanges()) {
      const id = ch.doc.id;
      if (ch.type === 'removed') {
        state.tasks = state.tasks.filter(t => t.id !== id);
        continue;
      }
      const remote = normalizeTask({ ...ch.doc.data(), id });
      const i = state.tasks.findIndex(t => t.id === id);
      if (i < 0) state.tasks.push(remote);
      else if ((remote.updatedAt || 0) >= (state.tasks[i].updatedAt || 0)) state.tasks[i] = remote;
    }

    // One-off merge the first time this account signs in on this browser: push
    // up anything created in local mode. After that the cloud owns what exists,
    // so a task deleted on the phone can't come back from this device's cache.
    if (!firstSnapshot) {
      firstSnapshot = true;
      if (localStorage.getItem(LS_MERGED) !== user.uid) {
        const remoteIds = new Set(s.docs.map(d => d.id));
        for (const t of state.tasks) if (!remoteIds.has(t.id)) pushTask(t);
        localStorage.setItem(LS_MERGED, user.uid);
      } else {
        const remoteIds = new Set(s.docs.map(d => d.id));
        state.tasks = state.tasks.filter(t => remoteIds.has(t.id));
      }
    }

    const rolled = rollDaily();
    saveLocal();
    onChange(state);
    for (const t of rolled) pushTask(t);
    onStatus('ok', '☁ synced');
  }, err => {
    console.warn('snapshot error', err);
    onStatus('off', '☁ offline');
  }));
}

// ---------------------------------------------------------------- public API
export const Store = {
  get state() { return state; },
  get mode() { return mode; },
  get user() { return user; },
  get cloudAvailable() { return !!M; },

  subscribe(changeCb, statusCb) { onChange = changeCb; onStatus = statusCb || (() => {}); },

  // Boot: show local data instantly, then wire up Firebase if it is configured.
  async init() {
    loadLocal();
    rollDaily();
    saveLocal();
    onChange(state);

    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('PASTE')) {
      onStatus('off', '☁ local only');
      return { cloud: false };
    }
    try {
      const [appM, authM, fsM] = await Promise.all([
        import(FB + 'firebase-app.js'),
        import(FB + 'firebase-auth.js'),
        import(FB + 'firebase-firestore.js')
      ]);
      const app = appM.getApps().length ? appM.getApp() : appM.initializeApp(cfg);
      auth = authM.getAuth(app);
      try {
        db = fsM.initializeFirestore(app, {
          localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() })
        });
      } catch { db = fsM.initializeFirestore(app, {}); }

      M = {
        doc: fsM.doc, collection: fsM.collection, getDoc: fsM.getDoc, setDoc: fsM.setDoc,
        deleteDoc: fsM.deleteDoc, onSnapshot: fsM.onSnapshot,
        GoogleAuthProvider: authM.GoogleAuthProvider, signInWithPopup: authM.signInWithPopup,
        signInWithRedirect: authM.signInWithRedirect, getRedirectResult: authM.getRedirectResult,
        onAuthStateChanged: authM.onAuthStateChanged, signOut: authM.signOut,
        signInWithEmailAndPassword: authM.signInWithEmailAndPassword,
        createUserWithEmailAndPassword: authM.createUserWithEmailAndPassword,
        sendPasswordResetEmail: authM.sendPasswordResetEmail
      };
      M.getRedirectResult(auth).catch(() => {});
      return { cloud: true };
    } catch (e) {
      console.warn('Firebase unavailable:', e);
      onStatus('off', '☁ local only');
      return { cloud: false, error: e };
    }
  },

  onAuth(cb) {
    if (!M) { cb(null); return; }
    M.onAuthStateChanged(auth, async u => {
      unsubs.forEach(f => f()); unsubs = [];
      user = u || null;
      mode = u ? 'cloud' : 'local';
      if (u) { try { await startSync(); } catch (e) { onStatus('off', '☁ offline'); } }
      else onStatus('off', '☁ not signed in');
      cb(user);
    });
  },

  async signIn() {
    if (!M) throw new Error('Cloud not configured');
    const provider = new M.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await M.signInWithPopup(auth, provider);
    } catch (e) {
      // popup blocked (common on iOS home-screen apps) — fall back to redirect
      if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request',
           'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
        await M.signInWithRedirect(auth, provider);
        return;
      }
      throw e;
    }
  },

  // Email + password — the same provider EZ Money uses, so signing in with the
  // same credentials lands on the same Firebase uid.
  signInEmail(email, pw) {
    if (!M) throw new Error('Cloud not configured');
    return M.signInWithEmailAndPassword(auth, String(email).trim(), pw);
  },
  signUpEmail(email, pw) {
    if (!M) throw new Error('Cloud not configured');
    return M.createUserWithEmailAndPassword(auth, String(email).trim(), pw);
  },
  resetPassword(email) {
    if (!M) throw new Error('Cloud not configured');
    return M.sendPasswordResetEmail(auth, String(email).trim());
  },

  async signOut() {
    unsubs.forEach(f => f()); unsubs = [];
    if (M) await M.signOut(auth);
    user = null; mode = 'local';
  },

  // -------- mutations (identical semantics to the local Node server) --------
  addTask({ sectionId, title, due, daily, note }) {
    title = String(title || '').trim();
    if (!title) throw new Error('title required');
    if (!state.sections.some(s => s.id === sectionId)) throw new Error('unknown section');
    const t = normalizeTask({
      id: rid(), sectionId, title: title.slice(0, 200), note: note || '',
      created: localDate(), createdAt: new Date().toISOString(),
      due: due || null, daily: !!daily, lastRoll: daily ? localDate() : null
    });
    state.tasks.unshift(t);
    commit(t);
    return t;
  },

  patchTask(id, patch) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return null;
    if (patch.title !== undefined) t.title = String(patch.title).trim().slice(0, 200);
    if (patch.note !== undefined) t.note = String(patch.note).slice(0, 2000);
    if (patch.due !== undefined) t.due = patch.due || null;
    if (patch.sectionId !== undefined && state.sections.some(s => s.id === patch.sectionId)) {
      t.sectionId = patch.sectionId;
    }
    if (patch.daily !== undefined) {
      t.daily = !!patch.daily;
      t.lastRoll = t.daily ? localDate() : null;
    }
    if (patch.done !== undefined) {
      t.done = !!patch.done;
      t.doneAt = t.done ? localDate() : null;
      // ticking the parent ticks the whole checklist, unticking clears it
      for (const s of t.subs) { s.done = t.done; s.doneAt = t.done ? localDate() : null; }
    }
    commit(t);
    return t;
  },

  delTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveLocal();
    onChange(state);
    if (mode === 'cloud' && user) M.deleteDoc(M.doc(taskCol(), id)).catch(() => {});
  },

  addSub(taskId, text, due) {
    const t = state.tasks.find(x => x.id === taskId);
    if (!t) return null;
    text = String(text || '').trim();
    if (!text) throw new Error('text required');
    t.subs.push({ id: rid(), text: text.slice(0, 200), done: false, doneAt: null, due: due || null });
    if (t.done) { t.done = false; t.doneAt = null; }   // a fresh step reopens the task
    commit(t);
    return t;
  },

  patchSub(taskId, subId, patch) {
    const t = state.tasks.find(x => x.id === taskId);
    if (!t) return null;
    const s = t.subs.find(x => x.id === subId);
    if (!s) return null;
    if (patch.text !== undefined) s.text = String(patch.text).trim().slice(0, 200);
    if (patch.due !== undefined) s.due = patch.due || null;
    if (patch.done !== undefined) {
      s.done = !!patch.done;
      s.doneAt = s.done ? localDate() : null;
    }
    syncParent(t);
    commit(t);
    return t;
  },

  delSub(taskId, subId) {
    const t = state.tasks.find(x => x.id === taskId);
    if (!t) return null;
    t.subs = t.subs.filter(s => s.id !== subId);
    syncParent(t);
    commit(t);
    return t;
  },

  // merge a backup exported from the local Node app (or this one)
  importBackup(dump) {
    if (!dump || !Array.isArray(dump.tasks)) throw new Error('That file has no tasks in it');
    if (Array.isArray(dump.sections) && dump.sections.length) {
      for (const s of dump.sections) {
        if (!state.sections.some(x => x.id === s.id)) state.sections.push(s);
      }
      pushSections();
    }
    let added = 0, updated = 0;
    for (const raw of dump.tasks) {
      const t = normalizeTask(raw);
      const i = state.tasks.findIndex(x => x.id === t.id);
      if (i < 0) { state.tasks.push(t); added++; }
      else if ((t.updatedAt || 0) > (state.tasks[i].updatedAt || 0)) { state.tasks[i] = t; updated++; }
      else continue;
      pushTask(t);
    }
    saveLocal();
    onChange(state);
    return { added, updated };
  },

  exportBackup() {
    return JSON.stringify({ version: 1, sections: state.sections, tasks: state.tasks }, null, 2);
  },

  // a tab left open past midnight rolls its daily tasks over
  tick() {
    const rolled = rollDaily();
    if (!rolled.length) return false;
    saveLocal();
    onChange(state);
    for (const t of rolled) pushTask(t);
    return true;
  }
};

// parent state follows the checklist
function syncParent(t) {
  if (!t.subs.length) return;
  const all = t.subs.every(s => s.done);
  t.done = all;
  t.doneAt = all ? localDate() : null;
}
