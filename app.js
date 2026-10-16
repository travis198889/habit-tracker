'use strict';
/* ---------- storage & dates ---------- */
const KEY = 'habit-tracker-v1';
const DOW = ['S','M','T','W','T','F','S'];
const DOW_LONG = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const EMOJIS = ['💪','😴','📚','🧘','🏃','💧','🥗','✍️','🎸','🌱','🚭','🧹','💊','🙏','📵','🚴'];
const COLORS = ['#5b8a72','#6c8ebf','#9b7ec8','#d08a5b','#c96f7f','#c9a227','#4f9ea8','#7d8590'];

const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const weekStart = d => addDays(d, -((d.getDay()+6)%7)); // Monday
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let state = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.habits)) return s; } catch {}
  return seed();
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

function seed() {
  const t = today(), log = (fn) => { const l = {}; for (let i = 27; i >= 1; i--) { const d = addDays(t, -i), v = fn(i, d); if (v) l[key(d)] = v; } return l; };
  const s = { version: 1, habits: [
    { id: uid(), sample: true, name: 'Workout', emoji: '💪', color: COLORS[0], why: 'Strong body, clear head.',
      schedule: { type: 'weekdays', days: [1,3,5] }, created: key(addDays(t,-28)),
      log: log((i, d) => [1,3,5].includes(d.getDay()) ? (i === 12 ? 'rest' : i % 9 === 0 ? null : 'done') : null) },
    { id: uid(), sample: true, name: 'Sleep 8 hours', emoji: '😴', color: COLORS[1], why: 'Everything is easier when I’m rested.',
      schedule: { type: 'daily' }, created: key(addDays(t,-28)),
      log: log(i => i === 6 ? 'rest' : (i % 5 === 0 || i === 11) ? null : 'done') },
    { id: uid(), sample: true, name: 'Read 20 min', emoji: '📚', color: COLORS[2], why: '',
      schedule: { type: 'weekly', times: 4 }, created: key(addDays(t,-28)),
      log: log(i => (i % 2 === 0 || i === 3) ? 'done' : null) },
  ]};
  s.habits[1].log[key(t)] = 'done';
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

/* ---------- habit logic ---------- */
const isScheduled = (h, d) => h.schedule.type === 'weekdays' ? h.schedule.days.includes(d.getDay()) : true;
const statusOf = (h, d) => h.log[key(d)] || null;
function weekCount(h, d) { const s = weekStart(d); let n = 0; for (let i = 0; i < 7; i++) if (h.log[key(addDays(s,i))] === 'done') n++; return n; }
function weekRests(h, d) { const s = weekStart(d); let n = 0; for (let i = 0; i < 7; i++) if (h.log[key(addDays(s,i))] === 'rest') n++; return n; }
const weekMet = (h, d) => weekCount(h, d) + weekRests(h, d) >= h.schedule.times;

/** Streak: consecutive scheduled days (or weeks for X/week) completed; rest days keep it alive. Today counts only once done. */
function streak(h) {
  const t = today(); let n = 0;
  if (h.schedule.type === 'weekly') {
    let w = weekStart(t);
    if (!weekMet(h, t)) w = addDays(w, -7);
    while (weekMet(h, w) && n < 1000) { n++; w = addDays(w, -7); }
    return { n, unit: n === 1 ? 'week' : 'weeks' };
  }
  let d = statusOf(h, t) ? t : addDays(t, -1);
  const start = parse(h.created);
  for (let i = 0; i < 3650 && d >= addDays(start, -60); i++, d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    const s = statusOf(h, d);
    if (s === 'done') n++; else if (s === 'rest') continue; else break;
  }
  return { n, unit: n === 1 ? 'day' : 'days' };
}

/** Habit strength 0-100 (exponential moving average, like Loop): misses decay it gently, never resets.
 *  Rest days are neutral. Today only counts once completed. X/week habits are scored per week. */
function strength(h) {
  const t = today(); let sc = 0;
  const firstLog = Object.keys(h.log).sort()[0];
  let d = parse(firstLog && firstLog < h.created ? firstLog : h.created);
  if (h.schedule.type === 'weekly') {
    const a = 0.25; d = weekStart(d);
    for (; d <= t; d = addDays(d, 7)) {
      const done = weekCount(h, d), need = Math.max(1, h.schedule.times - weekRests(h, d));
      const ratio = Math.min(1, done / need);
      if (addDays(d, 6) >= t && ratio < 1) { // current week in progress: only credit, no penalty
        sc = Math.max(sc, sc * (1 - a) + a * ratio); break;
      }
      sc = sc * (1 - a) + a * ratio;
    }
  } else {
    const a = h.schedule.type === 'daily' ? 0.07 : 0.12;
    for (; d <= t; d = addDays(d, 1)) {
      if (!isScheduled(h, d)) continue;
      const s = statusOf(h, d);
      if (s === 'rest') continue;
      if (+d === +t && s !== 'done') continue;
      sc = sc * (1 - a) + a * (s === 'done' ? 1 : 0);
    }
  }
  return Math.round(sc * 100);
}
function schedLabel(h) {
  const s = h.schedule;
  if (s.type === 'daily') return 'Every day';
  if (s.type === 'weekly') return `${s.times}× per week`;
  if (s.days.length === 5 && !s.days.includes(0) && !s.days.includes(6)) return 'Weekdays';
  return [1,2,3,4,5,6,0].filter(x => s.days.includes(x)).map(x => DOW_LONG[x]).join(' · ');
}
function setStatus(h, d, v) { const k = key(d); if (v) h.log[k] = v; else delete h.log[k]; save(); }

/* ---------- Today ---------- */
const $ = s => document.querySelector(s);
function renderToday() {
  const t = today();
  $('#dateLabel').textContent = t.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const hr = new Date().getHours();
  $('#greeting').textContent = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', Travis';
  const due = state.habits.filter(h => isScheduled(h, t) && !(h.schedule.type === 'weekly' && weekMet(h, t) && !statusOf(h, t)));
  const other = state.habits.filter(h => !due.includes(h));
  const done = due.filter(h => statusOf(h, t)).length;
  const pct = due.length ? Math.round(done / due.length * 100) : 0;
  $('#progressCard').hidden = !state.habits.length;
  $('#progressCard').innerHTML = `<div class="ring" style="--p:${pct}" data-l="${pct}%"></div>
    <div><b>${done === due.length && due.length ? 'All done — nice work 🌿' : `${done} of ${due.length} done`}</b>
    <p>${due.length - done ? `${due.length - done} left for today` : due.length ? 'Enjoy the rest of your day' : 'Nothing scheduled today'}</p></div>`;
  const list = $('#todayList');
  if (!state.habits.length) { list.innerHTML = `<div class="empty"><div>🌱</div><p>No habits yet.<br>Start small — add your first one.</p></div>`; return; }
  list.innerHTML = (due.length ? `<div class="group-label">Today</div>` + due.map(card).join('') : '')
    + (other.length ? `<div class="group-label">Not scheduled today</div>` + other.map(h => card(h, true)).join('') : '');
}
function card(h, off) {
  const t = today(), s = statusOf(h, t), st = streak(h), str = strength(h);
  const wk = h.schedule.type === 'weekly' ? `<span>${weekCount(h, t)}/${h.schedule.times} this week</span>` : '';
  return `<div class="habit ${s === 'done' ? 'done' : ''} ${s === 'rest' ? 'rested' : ''} ${off ? 'off' : ''}" style="--c:${h.color}" data-id="${h.id}">
    <button class="em" data-open aria-label="Open ${esc(h.name)}">${esc(h.emoji)}</button>
    <button class="info" data-open><div class="name">${esc(h.name)}</div>
      <div class="meta"><span>🔥 ${st.n} ${st.unit}</span><span>◔ ${str}%</span>${wk}</div></button>
    <button class="rest-btn ${s === 'rest' ? 'on' : ''}" data-rest aria-label="Rest day" title="Rest day">☾</button>
    <button class="check" data-toggle aria-label="Mark ${esc(h.name)} done" aria-pressed="${s === 'done'}">${s === 'rest' ? '☾' : '✓'}</button>
  </div>`;
}
$('#todayList').addEventListener('click', e => {
  const el = e.target.closest('.habit'); if (!el) return;
  const h = state.habits.find(x => x.id === el.dataset.id), t = today(), s = statusOf(h, t);
  if (e.target.closest('[data-toggle]')) { setStatus(h, t, s === 'done' ? null : 'done'); if (navigator.vibrate) navigator.vibrate(10); renderToday(); }
  else if (e.target.closest('[data-rest]')) { setStatus(h, t, s === 'rest' ? null : 'rest'); renderToday(); toast(s === 'rest' ? 'Rest day removed' : 'Rest day — your streak is safe ☾'); }
  else if (e.target.closest('[data-open]')) openDetail(h.id);
});

/* ---------- Detail ---------- */
let cur = null, month = null;
function openDetail(id) { cur = id; const t = today(); month = new Date(t.getFullYear(), t.getMonth(), 1); renderDetail(); $('#detail').hidden = false; $('#detail').scrollTop = 0; history.pushState({ d: id }, ''); }
function closeDetail() { $('#detail').hidden = true; cur = null; renderToday(); }
function renderDetail() {
  const h = state.habits.find(x => x.id === cur); if (!h) return closeDetail();
  const t = today(), st = streak(h), str = strength(h), s = statusOf(h, t);
  const total = Object.values(h.log).filter(v => v === 'done').length;
  const first = (month.getDay() + 6) % 7, dim = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  let cells = [1,2,3,4,5,6,0].map(i => `<div class="dow">${DOW[i]}</div>`).join('') + '<div class="day blank"></div>'.repeat(first);
  for (let i = 1; i <= dim; i++) {
    const d = new Date(month.getFullYear(), month.getMonth(), i), v = statusOf(h, d);
    let cls = v || '';
    if (d > t) cls = 'future';
    else if (!v && d < t && h.schedule.type !== 'weekly' && isScheduled(h, d) && d >= parse(h.created)) cls = 'missed';
    if (+d === +t) cls += ' today';
    cells += `<button class="day ${cls}" data-k="${key(d)}" ${d > t ? 'disabled' : ''} aria-label="${d.toDateString()} ${v || ''}">${i}</button>`;
  }
  const canNext = new Date(month.getFullYear(), month.getMonth()+1, 1) <= t;
  $('#detail').innerHTML = `<div class="in" style="--c:${h.color}">
    <div class="d-head"><button class="back" id="backBtn">‹ Today</button><button class="link strong" id="editBtn">Edit</button></div>
    <div class="hero"><div class="em">${esc(h.emoji)}</div><div><h1>${esc(h.name)}</h1><p class="eyebrow" style="text-transform:none">${schedLabel(h)}</p></div></div>
    ${h.why ? `<div class="why">“${esc(h.why)}”</div>` : ''}
    <div class="stats">
      <div class="stat"><b>🔥 ${st.n}</b><span>Streak (${st.unit})</span></div>
      <div class="stat"><b>${str}%</b><span>Habit strength</span><div class="bar"><i style="width:${str}%"></i></div></div>
      <div class="stat"><b>${total}</b><span>Times done</span></div>
    </div>
    <div class="card">
      <div class="cal-head"><button id="prevM" aria-label="Previous month">‹</button><b>${month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button id="nextM" aria-label="Next month" ${canNext ? '' : 'disabled style="opacity:.3"'}>›</button></div>
      <div class="cal" id="cal">${cells}</div>
      <div class="legend"><span><i style="background:${h.color}"></i>Done</span><span><i style="background:var(--rest)"></i>Rest</span>${h.schedule.type !== 'weekly' ? '<span><i style="background:var(--miss)"></i>Missed</span>' : ''}<span style="flex-basis:100%">Tap a past day to cycle done → rest → clear.</span></div>
    </div>
    <div class="actions">
      <button class="btn ${s === 'done' ? '' : 'primary'}" id="dDone">${s === 'done' ? '✓ Done today' : 'Mark done today'}</button>
      <button class="btn" id="dRest">${s === 'rest' ? '☾ Resting' : '☾ Rest day'}</button>
    </div></div>`;
  $('#backBtn').onclick = () => history.back();
  $('#editBtn').onclick = () => openEdit(h);
  $('#prevM').onclick = () => { month = new Date(month.getFullYear(), month.getMonth()-1, 1); renderDetail(); };
  $('#nextM').onclick = () => { if (canNext) { month = new Date(month.getFullYear(), month.getMonth()+1, 1); renderDetail(); } };
  $('#dDone').onclick = () => { setStatus(h, t, s === 'done' ? null : 'done'); renderDetail(); };
  $('#dRest').onclick = () => { setStatus(h, t, s === 'rest' ? null : 'rest'); renderDetail(); };
  $('#cal').onclick = e => { const b = e.target.closest('.day[data-k]'); if (!b || b.disabled) return;
    const d = parse(b.dataset.k), v = statusOf(h, d); setStatus(h, d, v === 'done' ? 'rest' : v === 'rest' ? null : 'done'); renderDetail(); };
}
window.addEventListener('popstate', () => { if (!$('#editWrap').hidden) { closeSheet('#editWrap'); return; } if (cur) closeDetail(); });

/* ---------- Edit sheet ---------- */
let draft = null;
function openEdit(h) {
  draft = h ? JSON.parse(JSON.stringify(h)) : { id: null, name: '', emoji: EMOJIS[3], color: COLORS[0], why: '', schedule: { type: 'daily', days: [1,2,3,4,5], times: 3 } };
  draft.schedule.days ||= [1,2,3,4,5]; draft.schedule.times ||= 3;
  $('#editTitle').textContent = h ? 'Edit habit' : 'New habit';
  $('#fName').value = draft.name; $('#fWhy').value = draft.why || ''; $('#fEmoji').value = '';
  $('#fEmoji').placeholder = 'Or type any emoji…';
  $('#deleteBtn').hidden = !h;
  renderForm(); $('#editWrap').hidden = false;
  if (!h) setTimeout(() => $('#fName').focus(), 50);
}
function renderForm() {
  $('#emojiRow').innerHTML = (EMOJIS.includes(draft.emoji) ? EMOJIS : [draft.emoji, ...EMOJIS.slice(0, -1)]).map(e => `<button type="button" class="${e === draft.emoji ? 'sel' : ''}">${e}</button>`).join('');
  $('#colorRow').innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" class="${c === draft.color ? 'sel' : ''}" aria-label="Color ${c}"></button>`).join('');
  document.querySelectorAll('#schedSeg button').forEach(b => b.classList.toggle('sel', b.dataset.v === draft.schedule.type));
  $('#daysRow').hidden = draft.schedule.type !== 'weekdays'; $('#timesRow').hidden = draft.schedule.type !== 'weekly';
  $('#daysRow').innerHTML = [1,2,3,4,5,6,0].map(i => `<button type="button" data-d="${i}" class="${draft.schedule.days.includes(i) ? 'sel' : ''}" aria-label="${DOW_LONG[i]}">${DOW[i]}</button>`).join('');
  $('#tVal').textContent = draft.schedule.times;
}
$('#emojiRow').onclick = e => { const b = e.target.closest('button'); if (b) { draft.emoji = b.textContent; renderForm(); } };
$('#fEmoji').oninput = e => { const v = [...e.target.value.trim()].slice(0, 2).join(''); if (v) { draft.emoji = v; renderForm(); } };
$('#colorRow').onclick = e => { const b = e.target.closest('button'); if (b) { draft.color = b.dataset.c; renderForm(); } };
$('#schedSeg').onclick = e => { const b = e.target.closest('button'); if (b) { draft.schedule.type = b.dataset.v; renderForm(); } };
$('#daysRow').onclick = e => { const b = e.target.closest('button'); if (!b) return; const d = +b.dataset.d, ds = draft.schedule.days;
  draft.schedule.days = ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]; renderForm(); };
$('#tMinus').onclick = () => { draft.schedule.times = Math.max(1, draft.schedule.times - 1); renderForm(); };
$('#tPlus').onclick = () => { draft.schedule.times = Math.min(7, draft.schedule.times + 1); renderForm(); };
$('#editForm').onsubmit = e => {
  e.preventDefault();
  const name = $('#fName').value.trim(); if (!name) return $('#fName').focus();
  if (draft.schedule.type === 'weekdays' && !draft.schedule.days.length) return toast('Pick at least one day');
  const sch = draft.schedule.type === 'daily' ? { type: 'daily' } : draft.schedule.type === 'weekly' ? { type: 'weekly', times: draft.schedule.times } : { type: 'weekdays', days: [...draft.schedule.days].sort() };
  if (draft.id) { Object.assign(state.habits.find(x => x.id === draft.id), { name, emoji: draft.emoji, color: draft.color, why: $('#fWhy').value.trim(), schedule: sch }); }
  else state.habits.push({ id: uid(), name, emoji: draft.emoji, color: draft.color, why: $('#fWhy').value.trim(), schedule: sch, created: key(today()), log: {} });
  save(); closeSheet('#editWrap'); toast(draft.id ? 'Saved' : 'Habit added 🌱'); cur ? renderDetail() : renderToday();
};
let undo = null;
$('#deleteBtn').onclick = () => {
  if (!confirm(`Delete “${draft.name}” and its history?`)) return;
  const i = state.habits.findIndex(x => x.id === draft.id); const [gone] = state.habits.splice(i, 1); save();
  closeSheet('#editWrap'); if (cur) history.back(); else renderToday();
  undo = () => { state.habits.splice(i, 0, gone); save(); renderToday(); };
  toast('Habit deleted', 'Undo');
};

/* ---------- sheets / settings ---------- */
function closeSheet(sel) { $(sel).hidden = true; }
document.querySelectorAll('.sheet-wrap').forEach(w => w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-close]')) closeSheet('#' + w.id); }));
$('#addBtn').onclick = () => openEdit(null);
$('#settingsBtn').onclick = () => { $('#clearSampleBtn').hidden = !state.habits.some(h => h.sample); $('#settingsWrap').hidden = false; };
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'habit-tracker', exported: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `habits-backup-${key(today())}.json` });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Backup exported');
};
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.habits) || !data.habits.every(h => h.id && h.name && h.schedule && typeof h.log === 'object')) throw new Error('bad');
    if (!confirm(`Replace current data with ${data.habits.length} habit(s) from backup?`)) return;
    state = { version: 1, habits: data.habits }; save(); closeSheet('#settingsWrap'); renderToday(); toast('Backup restored');
  } catch { toast('That file isn’t a valid backup'); }
};
$('#clearSampleBtn').onclick = () => { state.habits = state.habits.filter(h => !h.sample); save(); closeSheet('#settingsWrap'); renderToday(); toast('Sample data cleared'); };
$('#resetBtn').onclick = () => { if (confirm('Delete ALL habits and history? Export first if unsure.')) { state.habits = []; save(); closeSheet('#settingsWrap'); renderToday(); } };

let tt;
function toast(msg, action) {
  const el = $('#toast'); el.innerHTML = esc(msg) + (action ? ` <button id="toastAct">${esc(action)}</button>` : ''); el.hidden = false;
  if (action) $('#toastAct').onclick = () => { undo && undo(); undo = null; el.hidden = true; };
  clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; undo = null; }, action ? 5000 : 2200);
}

/* refresh at midnight / when returning to the app */
let lastDay = key(today());
document.addEventListener('visibilitychange', () => { if (!document.hidden && key(today()) !== lastDay) { lastDay = key(today()); cur ? renderDetail() : renderToday(); } });

renderToday();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
