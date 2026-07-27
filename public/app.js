// EZ Tracker frontend
let S = { sections: [], tasks: [] };
let activeSection = localStorage.getItem('eztr-section') || '';
let filter = localStorage.getItem('eztr-filter') || 'active';
let search = '';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dstr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dstr(new Date());
const dayShift = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dstr(d);
};

function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 3000);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function load() {
  S = await api('GET', '/api/data');
  if (!S.sections.some(s => s.id === activeSection)) activeSection = S.sections[0]?.id || '';
  render();
}

// ---------- helpers ----------
function sec() { return S.sections.find(s => s.id === activeSection) || null; }
function tasksOf(sectionId) { return S.tasks.filter(t => t.sectionId === sectionId); }
function isOpen(t) { return !t.done; }

function progress(t) {
  if (t.subs.length) {
    const done = t.subs.filter(s => s.done).length;
    return { done, total: t.subs.length, pct: Math.round(done / t.subs.length * 100) };
  }
  return { done: t.done ? 1 : 0, total: 1, pct: t.done ? 100 : 0 };
}

// consecutive completed days, counting today only if it is already complete
function streak(t) {
  const hist = new Set(t.history || []);
  if (t.done) hist.add(today());
  let n = 0;
  let d = hist.has(today()) ? today() : dayShift(today(), -1);
  while (hist.has(d)) { n++; d = dayShift(d, -1); }
  return n;
}

function prettyDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (s === today()) return 'today';
  if (s === dayShift(today(), -1)) return 'yesterday';
  if (s === dayShift(today(), 1)) return 'tomorrow';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

// ---------- render ----------
function render() {
  renderTabs();
  renderHero();
  renderTasks();
}

function renderTabs() {
  $('tabs').innerHTML = S.sections.map(s => {
    const open = tasksOf(s.id).filter(isOpen).length;
    return `<button class="tab${s.id === activeSection ? ' active' : ''}" data-sec="${s.id}">
      <span>${esc(s.icon || '')} ${esc(s.name)}</span>
      <span class="n${open ? '' : ' zero'}">${open}</span>
    </button>`;
  }).join('');
  $('tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => {
    activeSection = b.dataset.sec;
    localStorage.setItem('eztr-section', activeSection);
    search = '';
    $('search').value = '';
    render();
  });
}

function renderHero() {
  const s = sec();
  if (!s) { $('secHero').innerHTML = ''; return; }
  const list = tasksOf(s.id);
  const open = list.filter(isOpen).length;
  const doneToday = list.filter(t => t.doneAt === today()).length;
  const dailyDone = list.filter(t => t.daily && t.done).length;
  const dailyTotal = list.filter(t => t.daily).length;
  const overdue = list.filter(t => isOpen(t) && t.due && t.due < today()).length;

  const pct = list.length ? Math.round(list.reduce((a, t) => a + progress(t).pct, 0) / list.length) : 0;

  $('secHero').innerHTML = `
    <div class="sec-icon">${esc(s.icon || '📌')}</div>
    <div>
      <div class="sec-name">${esc(s.name)}</div>
      <div class="sec-sub">${list.length} task${list.length === 1 ? '' : 's'} here${
        overdue ? ` · <span style="color:var(--red);font-weight:700">${overdue} overdue</span>` : ''
      }${dailyTotal ? ` · routine ${dailyDone}/${dailyTotal} today` : ''}</div>
    </div>
    <div class="sec-stats">
      <div><div class="stat-big">${open}</div><div class="stat-label">Open</div></div>
      <div><div class="stat-big">${doneToday}</div><div class="stat-label">Done today</div></div>
      <div><div class="stat-big">${pct}%</div><div class="stat-label">Complete</div></div>
    </div>`;
}

function matches(t, q) {
  if (!q) return true;
  const hay = (t.title + ' ' + (t.note || '') + ' ' + t.subs.map(s => s.text).join(' ')).toLowerCase();
  return hay.includes(q);
}

function renderTasks() {
  const s = sec();
  if (!s) { $('taskList').innerHTML = ''; return; }
  const q = search.trim().toLowerCase();

  let list = tasksOf(s.id).filter(t => matches(t, q));
  if (filter === 'active') list = list.filter(isOpen);
  else if (filter === 'done') list = list.filter(t => t.done);

  // open first, overdue at the very top, then by due date, then newest created
  const rank = t => (t.done ? 2 : (t.due && t.due < today() ? 0 : 1));
  list.sort((a, b) => rank(a) - rank(b)
    || (a.due || '9999').localeCompare(b.due || '9999')
    || (b.createdAt || '').localeCompare(a.createdAt || ''));

  if (!list.length) {
    const anyHere = tasksOf(s.id).length > 0;
    $('taskList').innerHTML = `<div class="empty">${
      q ? 'nothing matches that search' :
      filter === 'done' ? 'nothing ticked off here yet' :
      anyHere ? 'all clear here — everything is ticked off 🎉' :
      'no tasks in this section yet — add one above'
    }</div>`;
    return;
  }

  $('taskList').innerHTML = list.map(taskHtml).join('');
  wireTasks();
}

function taskHtml(t) {
  const p = progress(t);
  const overdue = !t.done && t.due && t.due < today();
  const st = t.daily ? streak(t) : 0;

  const chips = [];
  chips.push(`<span class="chip" title="Date created">📅 ${esc(prettyDate(t.created))}</span>`);
  if (t.due) {
    const cls = overdue ? 'red' : (t.due === today() ? 'amber' : 'blue');
    chips.push(`<span class="chip ${cls}" title="Due date">${overdue ? '⚠' : '🎯'} due ${esc(prettyDate(t.due))}</span>`);
  }
  if (t.daily) {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = dayShift(today(), -(6 - i));
      const on = (t.history || []).includes(d) || (d === today() && t.done);
      return `<i class="${on ? 'on' : ''}"></i>`;
    }).join('');
    chips.push(`<span class="chip blue" title="Resets every day">🔁 daily</span>`);
    chips.push(`<span class="chip ${st ? 'green' : ''}" title="Day streak">🔥 ${st}<span class="streak-dots">${last7}</span></span>`);
  }
  if (t.subs.length) chips.push(`<span class="chip ${p.pct === 100 ? 'green' : ''}">${p.done}/${p.total} steps</span>`);
  if (t.done && t.doneAt) chips.push(`<span class="chip green">✓ done ${esc(prettyDate(t.doneAt))}</span>`);

  const subs = t.subs.map(sb => {
    const sOver = !sb.done && sb.due && sb.due < today();
    return `<div class="sub-row${sb.done ? ' done' : ''}" data-sub="${sb.id}">
      <input type="checkbox" ${sb.done ? 'checked' : ''} data-act="sub-toggle">
      <span class="sub-text" data-act="sub-edit" title="Click to rename">${esc(sb.text)}</span>
      ${sb.due ? `<span class="sub-date${sOver ? ' over' : ''}">${sOver ? '⚠ ' : ''}${esc(prettyDate(sb.due))}</span>` : ''}
      ${sb.done && sb.doneAt ? `<span class="sub-date">✓ ${esc(prettyDate(sb.doneAt))}</span>` : ''}
      <button class="btn btn-ghost btn-sm sub-x" data-act="sub-del" title="Remove subtask">✕</button>
    </div>`;
  }).join('');

  return `<div class="card task${t.done ? ' done' : ''}${overdue ? ' overdue' : ''}" data-task="${t.id}">
    <div class="task-top">
      <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''} data-act="task-toggle" title="Tick the whole task">
      <div class="task-main">
        <div class="task-title" data-act="task-edit" title="Click to rename">${esc(t.title)}</div>
        <div class="task-meta">${chips.join('')}</div>
        ${t.note ? `<div class="task-note">${esc(t.note)}</div>` : ''}
      </div>
      <div class="task-actions">
        <button class="btn btn-ghost" data-act="task-due" title="Set due date">🎯</button>
        <button class="btn btn-ghost" data-act="task-note" title="Note">📝</button>
        <button class="btn btn-ghost" data-act="task-daily" title="${t.daily ? 'Stop repeating daily' : 'Repeat daily'}">${t.daily ? '🔁' : '↻'}</button>
        <button class="btn btn-ghost" data-act="task-move" title="Move to another section">📂</button>
        <button class="btn btn-ghost" data-act="task-del" title="Delete task">🗑</button>
      </div>
    </div>

    <div class="pbar${p.pct === 100 ? ' full' : ''}"><i style="width:${p.pct}%"></i></div>

    <div class="subs">
      ${subs || '<div class="muted" style="font-size:.82rem;padding:.2rem 0">No subtasks yet.</div>'}
      <div class="sub-add">
        <input type="text" placeholder="＋ Add a subtask…" data-act="sub-input" autocomplete="off">
        <input type="date" data-act="sub-due" title="Subtask due date">
        <button class="btn btn-sm" data-act="sub-add">Add</button>
      </div>
    </div>
  </div>`;
}

// ---------- wiring ----------
function wireTasks() {
  document.querySelectorAll('.task').forEach(card => {
    const id = card.dataset.task;
    const t = S.tasks.find(x => x.id === id);
    if (!t) return;
    const q = a => card.querySelector(`[data-act="${a}"]`);

    q('task-toggle').onchange = e => save(api('PATCH', `/api/tasks/${id}`, { done: e.target.checked }));

    q('task-edit').onclick = () => {
      const v = prompt('Task name:', t.title);
      if (v != null && v.trim() && v.trim() !== t.title) save(api('PATCH', `/api/tasks/${id}`, { title: v.trim() }));
    };
    q('task-note').onclick = () => {
      const v = prompt('Note for this task:', t.note || '');
      if (v != null) save(api('PATCH', `/api/tasks/${id}`, { note: v }));
    };
    q('task-due').onclick = () => {
      const v = prompt('Due date (YYYY-MM-DD, empty to clear):', t.due || '');
      if (v == null) return;
      const d = v.trim();
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return toast('Use the format 2026-07-31', true);
      save(api('PATCH', `/api/tasks/${id}`, { due: d || null }));
    };
    q('task-daily').onclick = () => save(api('PATCH', `/api/tasks/${id}`, { daily: !t.daily }));
    q('task-move').onclick = () => {
      const opts = S.sections.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      const v = prompt(`Move "${t.title}" to which section?\n\n${opts}\n\nType the number:`, '');
      if (v == null) return;
      const target = S.sections[parseInt(v, 10) - 1];
      if (!target) return toast('No section with that number', true);
      save(api('PATCH', `/api/tasks/${id}`, { sectionId: target.id }), `Moved to ${target.name}`);
    };
    q('task-del').onclick = () => {
      if (!confirm(`Delete "${t.title}" and its ${t.subs.length} subtask(s)?`)) return;
      save(api('DELETE', `/api/tasks/${id}`), 'Task deleted');
    };

    // subtasks
    card.querySelectorAll('.sub-row').forEach(row => {
      const sid = row.dataset.sub;
      const sb = t.subs.find(x => x.id === sid);
      row.querySelector('[data-act="sub-toggle"]').onchange = e =>
        save(api('PATCH', `/api/tasks/${id}/subs/${sid}`, { done: e.target.checked }));
      row.querySelector('[data-act="sub-edit"]').onclick = () => {
        const v = prompt('Subtask:', sb.text);
        if (v != null && v.trim() && v.trim() !== sb.text) save(api('PATCH', `/api/tasks/${id}/subs/${sid}`, { text: v.trim() }));
      };
      row.querySelector('[data-act="sub-del"]').onclick = () =>
        save(api('DELETE', `/api/tasks/${id}/subs/${sid}`));
    });

    const input = q('sub-input');
    const dueIn = q('sub-due');
    const addSub = () => {
      const text = input.value.trim();
      if (!text) return input.focus();
      save(api('POST', `/api/tasks/${id}/subs`, { text, due: dueIn.value || null }), null, () => {
        const again = document.querySelector(`[data-task="${id}"] [data-act="sub-input"]`);
        if (again) again.focus();
      });
    };
    q('sub-add').onclick = addSub;
    input.onkeydown = e => { if (e.key === 'Enter') addSub(); };
  });
}

async function save(promise, msg, after) {
  try {
    await promise;
    await load();
    if (msg) toast(msg);
    if (after) after();
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------- add task ----------
function addTask() {
  const title = $('newTitle').value.trim();
  if (!title) return $('newTitle').focus();
  const body = {
    sectionId: activeSection,
    title,
    due: $('newDue').value || null,
    daily: $('newDaily').checked
  };
  save(api('POST', '/api/tasks', body), 'Task added', () => {
    $('newTitle').value = '';
    $('newDue').value = '';
    $('newDaily').checked = false;
    $('newTitle').focus();
  });
}

$('addTaskBtn').onclick = addTask;
$('newTitle').onkeydown = e => { if (e.key === 'Enter') addTask(); };

$('search').oninput = e => { search = e.target.value; renderTasks(); };

$('filters').querySelectorAll('.fchip').forEach(b => b.onclick = () => {
  filter = b.dataset.filter;
  localStorage.setItem('eztr-filter', filter);
  $('filters').querySelectorAll('.fchip').forEach(x => x.classList.toggle('on', x === b));
  renderTasks();
});
$('filters').querySelectorAll('.fchip').forEach(b => b.classList.toggle('on', b.dataset.filter === filter));

// a tab left open overnight should roll its daily tasks over
let bootDay = today();
setInterval(() => { if (today() !== bootDay) { bootDay = today(); load(); } }, 60000);

load().catch(e => toast(e.message, true));
