'use strict';
/* ================= storage, dates, migration ================= */
const KEY = 'habit-tracker-v1';            // unchanged key: existing phone data is read in place
const DATA_VERSION = 2;
const DOW = ['S','M','T','W','T','F','S'];
const DOW_LONG = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const ICS_DAY = ['SU','MO','TU','WE','TH','FR','SA'];
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
const fmtDay = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtNum = v => (Math.round(v * 10) / 10).toString();

/** Upgrade any stored/imported data to the current shape. Purely additive: never drops fields or history. */
function migrate(s) {
  const out = { ...s, version: DATA_VERSION, habits: [] };
  for (const h of s.habits || []) {
    if (!h || typeof h !== 'object') continue;
    const m = { ...h };
    m.id ||= uid(); m.name = String(m.name || 'Habit'); m.emoji ||= '✅'; m.color ||= COLORS[0];
    m.why ??= ''; m.created ||= key(today());
    m.schedule = m.schedule && m.schedule.type ? { ...m.schedule } : { type: 'daily' };
    if (m.schedule.type === 'weekdays' && !Array.isArray(m.schedule.days)) m.schedule.days = [0,1,2,3,4,5,6];
    if (m.schedule.type === 'weekly') m.schedule.times = Math.min(7, Math.max(1, +m.schedule.times || 3));
    m.log = m.log && typeof m.log === 'object' ? m.log : {};
    m.notes = m.notes && typeof m.notes === 'object' ? m.notes : {};     // v2: { 'YYYY-MM-DD': 'text' }
    m.values = m.values && typeof m.values === 'object' ? m.values : {}; // v2: { 'YYYY-MM-DD': number }
    m.measure = m.measure && m.measure.unit !== undefined ? m.measure : null; // v2: { unit, target|null }
    m.reminder = /^\d{2}:\d{2}$/.test(m.reminder || '') ? m.reminder : null; // v2: 'HH:MM'
    out.habits.push(m);
  }
  return out;
}
let state = load();
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch {}
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.habits)) {
        if ((s.version || 1) < DATA_VERSION && !localStorage.getItem(KEY + '-backup-pre-v2'))
          localStorage.setItem(KEY + '-backup-pre-v2', raw); // safety copy before first upgrade
        const m = migrate(s); localStorage.setItem(KEY, JSON.stringify(m)); return m;
      }
    } catch (e) {
      // unreadable data: keep the original string aside instead of overwriting it
      localStorage.setItem(KEY + '-corrupt-' + Date.now(), raw);
    }
  }
  return seed();
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); syncReminders(); }

function seed() {
  const t = today(), log = fn => { const l = {}; for (let i = 41; i >= 1; i--) { const d = addDays(t, -i), v = fn(i, d); if (v) l[key(d)] = v; } return l; };
  const s = { version: DATA_VERSION, habits: [
    { id: uid(), sample: true, name: 'Workout', emoji: '💪', color: COLORS[0], why: 'Strong body, clear head.',
      schedule: { type: 'weekdays', days: [1,3,5] }, created: key(addDays(t,-42)), measure: null, reminder: '07:00', values: {}, notes: {},
      log: log((i, d) => [1,3,5].includes(d.getDay()) ? (i === 12 ? 'rest' : (i % 9 === 0 || i > 30 && i % 2) ? null : 'done') : null) },
    { id: uid(), sample: true, name: 'Sleep 8 hours', emoji: '😴', color: COLORS[1], why: 'Everything is easier when I’m rested.',
      schedule: { type: 'daily' }, created: key(addDays(t,-42)), measure: { unit: 'hours', target: 8 }, reminder: '22:00', values: {}, notes: {},
      log: log(i => i === 6 ? 'rest' : (i % 5 === 0 || i === 11 || (i > 28 && i % 3 === 0)) ? null : 'done') },
    { id: uid(), sample: true, name: 'Read 20 min', emoji: '📚', color: COLORS[2], why: '',
      schedule: { type: 'weekly', times: 4 }, created: key(addDays(t,-42)), measure: { unit: 'min', target: 20 }, reminder: null, values: {}, notes: {},
      log: log(i => (i % 2 === 0 || i === 3) ? 'done' : null) },
  ]};
  const [w, sl, rd] = s.habits;
  sl.log[key(t)] = 'done';
  for (const k of Object.keys(sl.log)) if (sl.log[k] === 'done') { const i = (t - parse(k)) / 864e5; sl.values[k] = +(7 + ((i * 37) % 17) / 10 + (i < 14 ? 0.4 : 0)).toFixed(1); }
  for (const k of Object.keys(rd.log)) if (rd.log[k] === 'done') { const i = (t - parse(k)) / 864e5; rd.values[k] = 12 + Math.round((i * 7) % 19); }
  const n = (h, i, txt) => { h.notes[key(addDays(t, -i))] = txt; };
  n(w, 2, 'Legs + core. Felt strong, added 5 kg to squats.'); n(w, 4, 'Short 20 min session, still counts.');
  n(w, 12, 'Rest — sore from Monday. Long walk instead.'); n(sl, 0, 'Phone out of the bedroom — slept great.');
  n(sl, 6, 'Late flight, resting.'); n(rd, 2, 'Finished chapter 4 of “Atomic Habits”.');
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

/* ================= habit logic ================= */
const isScheduled = (h, d) => h.schedule.type === 'weekdays' ? h.schedule.days.includes(d.getDay()) : true;
const statusOf = (h, d) => h.log[key(d)] || null;
function weekCount(h, d, upto) { const s = weekStart(d); let n = 0; for (let i = 0; i < 7; i++) { const x = addDays(s, i); if (upto && x > upto) break; if (h.log[key(x)] === 'done') n++; } return n; }
function weekRests(h, d, upto) { const s = weekStart(d); let n = 0; for (let i = 0; i < 7; i++) { const x = addDays(s, i); if (upto && x > upto) break; if (h.log[key(x)] === 'rest') n++; } return n; }
const weekMet = (h, d) => weekCount(h, d) + weekRests(h, d) >= h.schedule.times;
const startOf = h => { const f = Object.keys(h.log).sort()[0]; return parse(f && f < h.created ? f : h.created); };

/** Current streak: consecutive scheduled days (or weeks for X/week) completed; rest days keep it alive. */
function streak(h) {
  const t = today(); let n = 0;
  if (h.schedule.type === 'weekly') {
    let w = weekStart(t);
    if (!weekMet(h, t)) w = addDays(w, -7);
    while (weekMet(h, w) && n < 1000) { n++; w = addDays(w, -7); }
    return { n, unit: n === 1 ? 'week' : 'weeks' };
  }
  let d = statusOf(h, t) ? t : addDays(t, -1);
  const start = addDays(startOf(h), -1);
  for (; d >= start; d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    const s = statusOf(h, d);
    if (s === 'done') n++; else if (s === 'rest') continue; else break;
  }
  return { n, unit: n === 1 ? 'day' : 'days' };
}
function bestStreak(h) {
  const t = today(); let best = 0, run = 0;
  if (h.schedule.type === 'weekly') {
    for (let w = weekStart(startOf(h)); w <= t; w = addDays(w, 7)) { if (weekMet(h, w)) best = Math.max(best, ++run); else if (addDays(w, 6) < t) run = 0; }
  } else {
    for (let d = startOf(h); d <= t; d = addDays(d, 1)) {
      if (!isScheduled(h, d)) continue;
      const s = statusOf(h, d);
      if (s === 'done') best = Math.max(best, ++run); else if (s !== 'rest' && d < t) run = 0;
    }
  }
  return { n: best, unit: h.schedule.type === 'weekly' ? (best === 1 ? 'week' : 'weeks') : (best === 1 ? 'day' : 'days') };
}

/** Habit strength series (Loop-style moving average): misses decay gently, never resets; rest days are neutral;
 *  today only counts once done; X/week habits are scored per week and the running week can only add. */
function strengthSeries(h) {
  const t = today(), out = []; let sc = 0;
  if (h.schedule.type === 'weekly') {
    const a = 0.25;
    for (let d = weekStart(startOf(h)); d <= t; d = addDays(d, 1)) {
      const ratio = Math.min(1, weekCount(h, d, d) / Math.max(1, h.schedule.times - weekRests(h, d, d)));
      const prov = sc * (1 - a) + a * ratio;
      if (d.getDay() === 0) { sc = prov; out.push({ d, v: sc }); }
      else out.push({ d, v: Math.max(sc, prov) });
    }
  } else {
    const a = h.schedule.type === 'daily' ? 0.07 : 0.12;
    for (let d = startOf(h); d <= t; d = addDays(d, 1)) {
      const s = statusOf(h, d);
      if (isScheduled(h, d) && s !== 'rest' && !(+d === +t && s !== 'done')) sc = sc * (1 - a) + a * (s === 'done' ? 1 : 0);
      out.push({ d, v: sc });
    }
  }
  return out;
}
function strength(h) { const s = strengthSeries(h); return s.length ? Math.round(s[s.length - 1].v * 100) : 0; }

/** Done vs expected in [from, to]. Today counts only if completed. */
function tally(h, from, to) {
  const t = today(); let done = 0, exp = 0;
  const start = startOf(h); if (from < start) from = start;
  if (to > t) to = t;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const s = statusOf(h, d);
    if (+d === +t && !s) continue;
    if (h.schedule.type === 'weekly') { if (s === 'done') done++; if (s !== 'rest') exp += h.schedule.times / 7; }
    else if (isScheduled(h, d) && s !== 'rest') { exp++; if (s === 'done') done++; }
  }
  return { done: Math.min(done, exp || done), exp };
}
function rate(habits, days) {
  const t = today(), from = addDays(t, -(days - 1)); let d = 0, e = 0;
  for (const h of habits) { const r = tally(h, from, t); d += r.done; e += r.exp; }
  return e ? d / e : null;
}
function schedLabel(h) {
  const s = h.schedule;
  if (s.type === 'daily') return 'Every day';
  if (s.type === 'weekly') return `${s.times}× per week`;
  if (s.days.length === 5 && !s.days.includes(0) && !s.days.includes(6)) return 'Weekdays';
  return [1,2,3,4,5,6,0].filter(x => s.days.includes(x)).map(x => DOW_LONG[x]).join(' · ');
}
function setStatus(h, d, v) { const k = key(d); if (v) h.log[k] = v; else { delete h.log[k]; delete h.values[k]; } save(); }
const valueLabel = (h, k) => h.measure && h.values[k] != null ? `${fmtNum(h.values[k])} ${esc(h.measure.unit)}` : '';

/* ================= Today ================= */
const $ = s => document.querySelector(s);
let tab = 'today';
function render() { if (cur) renderDetail(); if (tab === 'today') renderToday(); else renderProgress(); }
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
  list.innerHTML = (due.length ? `<div class="group-label">Today</div>` + due.map(h => card(h)).join('') : '')
    + (other.length ? `<div class="group-label">Not scheduled today</div>` + other.map(h => card(h, true)).join('') : '');
}
function card(h, off) {
  const t = today(), k = key(t), s = statusOf(h, t), st = streak(h), str = strength(h);
  const wk = h.schedule.type === 'weekly' ? `<span>${weekCount(h, t)}/${h.schedule.times} this week</span>` : '';
  const val = valueLabel(h, k) ? `<span>📏 ${valueLabel(h, k)}</span>` : '';
  const rem = h.reminder && !s ? `<span>⏰ ${h.reminder}</span>` : '';
  const note = h.notes[k] ? `<span>📝</span>` : '';
  return `<div class="habit ${s === 'done' ? 'done' : ''} ${s === 'rest' ? 'rested' : ''} ${off ? 'off' : ''}" style="--c:${h.color}" data-id="${h.id}">
    <button class="em" data-open aria-label="Open ${esc(h.name)}">${esc(h.emoji)}</button>
    <button class="info" data-open><div class="name">${esc(h.name)}</div>
      <div class="meta"><span>🔥 ${st.n} ${st.unit}</span><span>◔ ${str}%</span>${wk}${val}${rem}${note}</div></button>
    <button class="rest-btn ${s === 'rest' ? 'on' : ''}" data-rest aria-label="Rest day" title="Rest day">☾</button>
    <button class="check" data-toggle aria-label="Mark ${esc(h.name)} done" aria-pressed="${s === 'done'}">${s === 'rest' ? '☾' : '✓'}</button>
  </div>`;
}
$('#todayList').addEventListener('click', e => {
  const el = e.target.closest('.habit'); if (!el) return;
  const h = state.habits.find(x => x.id === el.dataset.id), t = today(), s = statusOf(h, t);
  if (e.target.closest('[data-toggle]')) {
    if (s === 'done') { setStatus(h, t, null); renderToday(); return; }
    if (h.measure) { openDay(h, t, 'done'); return; }       // measured: log the value on check-in
    setStatus(h, t, 'done'); if (navigator.vibrate) navigator.vibrate(10); renderToday();
    toast('Done ✓', 'Add note', () => openDay(h, t, 'done'));
  }
  else if (e.target.closest('[data-rest]')) { setStatus(h, t, s === 'rest' ? null : 'rest'); renderToday(); toast(s === 'rest' ? 'Rest day removed' : 'Rest day — your streak is safe ☾'); }
  else if (e.target.closest('[data-open]')) openDetail(h.id);
});

/* ================= Day sheet (check-in: status + value + note) ================= */
let dayCtx = null;
function openDay(h, d, preset) {
  const k = key(d);
  dayCtx = { h, d, status: preset !== undefined ? preset : statusOf(h, d) };
  $('#dayTitle').textContent = `${h.emoji} ${+d === +today() ? 'Today' : fmtDay(d)}`;
  $('#daySub').textContent = h.name;
  $('#dayValueField').hidden = !h.measure;
  if (h.measure) {
    $('#dayUnit').textContent = h.measure.unit;
    $('#dayValue').value = h.values[k] ?? '';
    $('#dayValue').placeholder = h.measure.target != null ? String(h.measure.target) : '0';
    $('#dayTarget').textContent = h.measure.target != null ? `Daily target: ${fmtNum(h.measure.target)} ${h.measure.unit}` : '';
  }
  $('#dayNote').value = h.notes[k] || '';
  renderDaySeg(); $('#dayWrap').hidden = false;
}
function renderDaySeg() { document.querySelectorAll('#daySeg button').forEach(b => b.classList.toggle('sel', (b.dataset.v || null) === dayCtx.status)); }
$('#daySeg').onclick = e => { const b = e.target.closest('button'); if (b) { dayCtx.status = b.dataset.v || null; renderDaySeg(); } };
$('#dayForm').onsubmit = e => {
  e.preventDefault();
  const { h, d } = dayCtx, k = key(d);
  const note = $('#dayNote').value.trim(); if (note) h.notes[k] = note; else delete h.notes[k];
  let status = dayCtx.status;
  if (h.measure) {
    const raw = $('#dayValue').value.trim(), v = raw === '' ? NaN : Number(raw.replace(',', '.'));
    if (raw !== '' && !Number.isFinite(v)) return toast('Enter a number');
    if (Number.isFinite(v)) { h.values[k] = v; if (!status) status = 'done'; } else delete h.values[k];
  }
  setStatus(h, d, status);
  if (status !== 'done') delete h.values[k];
  if (note) h.notes[k] = note; // keep the note even when a day is cleared or rested
  save(); closeSheet('#dayWrap'); render();
  if (status === 'done' && navigator.vibrate) navigator.vibrate(10);
};

/* ================= Detail ================= */
let cur = null, month = null;
function openDetail(id) { cur = id; const t = today(); month = new Date(t.getFullYear(), t.getMonth(), 1); renderDetail(); $('#detail').hidden = false; $('#detail').scrollTop = 0; history.pushState({ d: id }, ''); }
function closeDetail() { $('#detail').hidden = true; cur = null; render(); }
function renderDetail() {
  const h = state.habits.find(x => x.id === cur); if (!h) return closeDetail();
  const t = today(), st = streak(h), best = bestStreak(h), str = strength(h), s = statusOf(h, t);
  const total = Object.values(h.log).filter(v => v === 'done').length;
  const first = (month.getDay() + 6) % 7, dim = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  let cells = [1,2,3,4,5,6,0].map(i => `<div class="dow">${DOW[i]}</div>`).join('') + '<div class="day blank"></div>'.repeat(first);
  for (let i = 1; i <= dim; i++) {
    const d = new Date(month.getFullYear(), month.getMonth(), i), k = key(d), v = statusOf(h, d);
    let cls = v || '';
    if (d > t) cls = 'future';
    else if (!v && d < t && h.schedule.type !== 'weekly' && isScheduled(h, d) && d >= parse(h.created)) cls = 'missed';
    if (+d === +t) cls += ' today';
    if (h.notes[k]) cls += ' has-note';
    cells += `<button class="day ${cls}" data-k="${k}" ${d > t ? 'disabled' : ''} aria-label="${d.toDateString()} ${v || ''}">${i}</button>`;
  }
  const canNext = new Date(month.getFullYear(), month.getMonth()+1, 1) <= t;
  const noteKeys = Object.keys(h.notes).filter(k => h.notes[k]).sort().reverse().slice(0, 8);
  const notes = noteKeys.map(k => { const v = h.log[k];
    return `<button class="note" data-k="${k}"><div class="note-h"><b>${fmtDay(parse(k))}</b><span class="pill ${v || 'none'}">${v === 'done' ? '✓ Done' : v === 'rest' ? '☾ Rest' : '—'}</span>${valueLabel(h, k) ? `<span class="muted">${valueLabel(h, k)}</span>` : ''}</div><p>${esc(h.notes[k])}</p></button>`; }).join('');
  const vals = h.measure ? Object.keys(h.values).filter(k => h.log[k] === 'done') : [];
  const avg7 = vals.filter(k => parse(k) > addDays(t, -7)).map(k => h.values[k]);
  $('#detail').innerHTML = `<div class="in" style="--c:${h.color}">
    <div class="d-head"><button class="back" id="backBtn">‹ Back</button><button class="link strong" id="editBtn">Edit</button></div>
    <div class="hero"><div class="em">${esc(h.emoji)}</div><div><h1>${esc(h.name)}</h1><p class="eyebrow" style="text-transform:none">${schedLabel(h)}${h.reminder ? ` · ⏰ ${h.reminder}` : ''}${h.measure ? ` · 📏 ${esc(h.measure.unit)}${h.measure.target != null ? ` (target ${fmtNum(h.measure.target)})` : ''}` : ''}</p></div></div>
    ${h.why ? `<div class="why">“${esc(h.why)}”</div>` : ''}
    <div class="stats">
      <div class="stat"><b>🔥 ${st.n}</b><span>Streak · best ${best.n}</span></div>
      <div class="stat"><b>${str}%</b><span>Habit strength</span><div class="bar"><i style="width:${str}%"></i></div></div>
      ${h.measure ? `<div class="stat"><b>${avg7.length ? fmtNum(avg7.reduce((a, b) => a + b, 0) / avg7.length) : '–'}</b><span>7-day avg ${esc(h.measure.unit)}</span></div>`
                  : `<div class="stat"><b>${total}</b><span>Times done</span></div>`}
    </div>
    <div class="card">
      <div class="cal-head"><button id="prevM" aria-label="Previous month">‹</button><b>${month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button id="nextM" aria-label="Next month" ${canNext ? '' : 'disabled style="opacity:.3"'}>›</button></div>
      <div class="cal" id="cal">${cells}</div>
      <div class="legend"><span><i style="background:${h.color}"></i>Done</span><span><i style="background:var(--rest)"></i>Rest</span>${h.schedule.type !== 'weekly' ? '<span><i style="background:var(--miss)"></i>Missed</span>' : ''}<span><i class="dot"></i>Note</span><span style="flex-basis:100%">Tap a day to log it, add a value or write a note.</span></div>
    </div>
    <div class="actions">
      <button class="btn ${s === 'done' ? '' : 'primary'}" id="dDone">${s === 'done' ? '✓ Done today' : 'Check in today'}</button>
      <button class="btn" id="dRest">${s === 'rest' ? '☾ Resting' : '☾ Rest day'}</button>
    </div>
    <h3 class="section">Recent notes</h3>
    <div id="notes">${notes || `<p class="muted small empty-notes">No notes yet. Tap a day in the calendar (or “Add note” after checking in) to jot down how it went.</p>`}</div>
  </div>`;
  $('#backBtn').onclick = () => history.back();
  $('#editBtn').onclick = () => openEdit(h);
  $('#prevM').onclick = () => { month = new Date(month.getFullYear(), month.getMonth()-1, 1); renderDetail(); };
  $('#nextM').onclick = () => { if (canNext) { month = new Date(month.getFullYear(), month.getMonth()+1, 1); renderDetail(); } };
  $('#dDone').onclick = () => { if (s === 'done') { setStatus(h, t, null); renderDetail(); } else openDay(h, t, 'done'); };
  $('#dRest').onclick = () => { setStatus(h, t, s === 'rest' ? null : 'rest'); renderDetail(); };
  $('#cal').onclick = e => { const b = e.target.closest('.day[data-k]'); if (b && !b.disabled) openDay(h, parse(b.dataset.k)); };
  $('#notes').onclick = e => { const b = e.target.closest('.note'); if (b) openDay(h, parse(b.dataset.k)); };
}
window.addEventListener('popstate', () => {
  for (const w of ['#dayWrap', '#editWrap', '#settingsWrap']) if (!$(w).hidden) { closeSheet(w); return; }
  if (cur) closeDetail();
});

/* ================= Progress ================= */
let progSel = 'all';
const svgEl = (w, h, inner, label) => `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="${esc(label)}">${inner}</svg>`;
function barChart(items, color, label) {
  const W = 340, H = 140, pb = 20, pt = 14, bw = W / items.length;
  let g = [0, .5, 1].map(f => `<line x1="0" x2="${W}" y1="${pt + (H - pb - pt) * (1 - f)}" y2="${pt + (H - pb - pt) * (1 - f)}" class="grid"/>`).join('');
  items.forEach((it, i) => {
    const x = i * bw + bw * .18, w = bw * .64, hh = it.v == null ? 0 : Math.max(2, (H - pb - pt) * it.v), y = H - pb - hh;
    g += it.v == null ? `<rect x="${x}" y="${H - pb - 2}" width="${w}" height="2" rx="1" fill="#ddd"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="4" fill="${color}" opacity="${i === items.length - 1 ? 1 : .75}"><title>${esc(it.label)}: ${Math.round(it.v * 100)}%</title></rect>`;
    if (i % 2 === (items.length - 1) % 2) g += `<text x="${x + w / 2}" y="${H - 5}" class="ax" text-anchor="middle">${esc(it.label)}</text>`;
  });
  return svgEl(W, H, g, label);
}
function lineChart(series, { color, min = 0, max, target, fmt = v => v, label, area = true }) {
  const W = 340, H = 150, pl = 30, pr = 8, pt = 12, pb = 20;
  const pts = series.filter(p => p.v != null);
  if (pts.length < 2) return `<p class="muted small">Not enough data yet — log a few more days.</p>`;
  const vmax = max ?? (Math.max(...pts.map(p => p.v), target ?? 0) * 1.15 || 1);
  const vmin = Math.min(min, ...pts.map(p => p.v));
  const X = i => pl + (W - pl - pr) * i / (series.length - 1), Y = v => pt + (H - pt - pb) * (1 - (v - vmin) / (vmax - vmin || 1));
  let g = [0, .5, 1].map(f => { const v = vmin + (vmax - vmin) * f; return `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${pl - 5}" y="${Y(v) + 3}" class="ax" text-anchor="end">${fmt(v)}</text>`; }).join('');
  const path = series.map((p, i) => p.v == null ? null : [X(i), Y(p.v)]).filter(Boolean);
  const dStr = path.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  if (area) g += `<path d="${dStr}L${path[path.length - 1][0]},${H - pb}L${path[0][0]},${H - pb}Z" fill="${color}" opacity=".12"/>`;
  if (target != null) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(target)}" y2="${Y(target)}" class="target"/><text x="${W - pr}" y="${Y(target) - 4}" class="ax tgt" text-anchor="end">target ${fmt(target)}</text>`;
  g += `<path d="${dStr}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (!area) g += path.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${color}"/>`).join('');
  const lbl = [0, Math.floor((series.length - 1) / 2), series.length - 1];
  g += lbl.map(i => `<text x="${X(i)}" y="${H - 5}" class="ax" text-anchor="${i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}">${series[i].d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>`).join('');
  return svgEl(W, H, g, label);
}
function renderProgress() {
  const P = $('#progressView'), t = today();
  if (!state.habits.length) { P.innerHTML = `<div class="empty"><div>📈</div><p>Add a habit to see your progress here.</p></div>`; return; }
  if (progSel !== 'all' && !state.habits.find(h => h.id === progSel)) progSel = 'all';
  const sel = progSel === 'all' ? state.habits : state.habits.filter(h => h.id === progSel);
  const color = progSel === 'all' ? 'var(--accent)' : sel[0].color;
  const pct = r => r == null ? '–' : Math.round(r * 100) + '%';
  // weekly completion (last 12 weeks)
  const weeks = []; for (let i = 11; i >= 0; i--) {
    const ws = addDays(weekStart(t), -7 * i); let d = 0, e = 0;
    for (const h of sel) { const r = tally(h, ws, addDays(ws, 6)); d += r.done; e += r.exp; }
    weeks.push({ label: ws.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), v: e ? Math.min(1, d / e) : null });
  }
  while (weeks.length > 4 && weeks[0].v == null) weeks.shift(); // don't show empty weeks before tracking began
  // strength over last 90 days (average when "All")
  const first = new Date(Math.min(...sel.map(h => +startOf(h)))), days = [];
  for (let i = 89; i >= 0; i--) { const d = addDays(t, -i); if (d >= first || i < 14) days.push(d); }
  const maps = sel.map(h => new Map(strengthSeries(h).map(p => [key(p.d), p.v])));
  const strSeries = days.map(d => { const vs = maps.map(m => m.get(key(d))).filter(v => v != null); return { d, v: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length * 100 : null }; });
  // value trends for measured habits
  const measured = sel.filter(h => h.measure);
  const valueCharts = measured.map(h => {
    const s = []; for (let i = 29; i >= 0; i--) { const d = addDays(t, -i), k = key(d); s.push({ d, v: h.log[k] === 'done' && h.values[k] != null ? h.values[k] : null }); }
    const vs = s.filter(p => p.v != null).map(p => p.v);
    const hit = h.measure.target != null && vs.length ? vs.filter(v => v >= h.measure.target).length / vs.length : null;
    return `<div class="card"><div class="card-h"><b>${esc(h.emoji)} ${esc(h.name)}</b><span class="muted small">${vs.length ? `avg ${fmtNum(vs.reduce((a, b) => a + b, 0) / vs.length)} ${esc(h.measure.unit)}` : ''}${hit != null ? ` · target hit ${Math.round(hit * 100)}%` : ''}</span></div>
      ${lineChart(s, { color: h.color, target: h.measure.target ?? undefined, fmt: fmtNum, label: `${h.name} values, last 30 days`, area: false })}</div>`;
  }).join('');
  const comp = state.habits.map(h => { const r30 = rate([h], 30), b = bestStreak(h);
    return `<div class="cmp" style="--c:${h.color}"><div class="cmp-h"><span>${esc(h.emoji)} ${esc(h.name)}</span><b>${pct(r30)}</b></div>
      <div class="bar"><i style="width:${Math.round((r30 || 0) * 100)}%"></i></div>
      <div class="cmp-m muted small"><span>◔ strength ${strength(h)}%</span><span>🔥 now ${streak(h).n}</span><span>🏆 best ${b.n} ${b.unit}</span></div></div>`; }).join('');
  const bests = sel.map(h => ({ h, b: bestStreak(h) })).sort((a, b) => b.b.n - a.b.n)[0];
  P.innerHTML = `
    <div class="chips" id="progChips"><button data-id="all" class="${progSel === 'all' ? 'sel' : ''}">All habits</button>${state.habits.map(h => `<button data-id="${h.id}" class="${progSel === h.id ? 'sel' : ''}" style="--c:${h.color}">${esc(h.emoji)} ${esc(h.name)}</button>`).join('')}</div>
    <div class="stats rates" style="--c:${color}">
      ${[7, 30, 90].map(n => { const r = rate(sel, n); return `<div class="stat"><b>${pct(r)}</b><span>Last ${n} days</span><div class="bar"><i style="width:${Math.round((r || 0) * 100)}%"></i></div></div>`; }).join('')}
    </div>
    <div class="stat wide"><span>🏆 Best streak</span><b>${bests.b.n} ${bests.b.unit}</b><span class="muted small">${sel.length > 1 ? esc(bests.h.emoji + ' ' + bests.h.name) : `current ${streak(sel[0]).n}`}</span></div>
    <div class="card"><div class="card-h"><b>Weekly completion</b><span class="muted small">last 12 weeks</span></div>${barChart(weeks, color, 'Weekly completion rate')}</div>
    <div class="card"><div class="card-h"><b>Habit strength</b><span class="muted small">last 90 days${sel.length > 1 ? ' · average' : ''}</span></div>${lineChart(strSeries, { color, min: 0, max: 100, fmt: v => Math.round(v) + '%', label: 'Habit strength over time' })}</div>
    ${measured.length ? `<h3 class="section">Values · last 30 days</h3>${valueCharts}` : ''}
    ${state.habits.length > 1 ? `<h3 class="section">Compare habits · 30 days</h3><div class="card">${comp}</div>` : ''}`;
  $('#progChips').onclick = e => { const b = e.target.closest('button'); if (b) { progSel = b.dataset.id; renderProgress(); } };
}

/* ================= Tabs ================= */
function setTab(t) {
  tab = t;
  $('#todayView').hidden = t !== 'today'; $('#progressView').hidden = t !== 'progress'; $('#addBtn').hidden = t !== 'today';
  $('#progressCard').hidden = t !== 'today' || !state.habits.length;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('sel', b.dataset.tab === t));
  if (t === 'progress') { $('#greeting').textContent = 'Progress'; $('#dateLabel').textContent = 'Your trends'; renderProgress(); } else renderToday();
  window.scrollTo(0, 0);
}
document.querySelector('.tabbar').onclick = e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); };

/* ================= Edit sheet ================= */
let draft = null;
function openEdit(h) {
  draft = h ? JSON.parse(JSON.stringify(h)) : { id: null, name: '', emoji: EMOJIS[3], color: COLORS[0], why: '', schedule: { type: 'daily' }, measure: null, reminder: null };
  draft.schedule.days ||= [1,2,3,4,5]; draft.schedule.times ||= 3;
  $('#editTitle').textContent = h ? 'Edit habit' : 'New habit';
  $('#fName').value = draft.name; $('#fWhy').value = draft.why || ''; $('#fEmoji').value = '';
  $('#fEmoji').placeholder = 'Or type any emoji…';
  $('#fMeasure').checked = !!draft.measure; $('#fUnit').value = draft.measure?.unit || ''; $('#fTarget').value = draft.measure?.target ?? '';
  $('#fRemOn').checked = !!draft.reminder; $('#fRemTime').value = draft.reminder || '09:00';
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
  $('#measureFields').hidden = !$('#fMeasure').checked;
  $('#remFields').hidden = !$('#fRemOn').checked;
  $('#remHint').innerHTML = $('#fRemOn').checked ? notifHint() : '';
}
function notifHint() {
  if (!('Notification' in window)) return 'This browser can’t show notifications — use the calendar file in Settings instead.';
  if (Notification.permission === 'granted') return 'Best-effort phone notification. For a guaranteed reminder, add the calendar file from Settings.';
  if (Notification.permission === 'denied') return 'Notifications are blocked for this app in Android settings — the calendar file in Settings still works.';
  return 'You’ll be asked to allow notifications after saving.';
}
$('#fMeasure').onchange = () => { renderForm(); if ($('#fMeasure').checked) $('#fUnit').focus(); };
$('#fRemOn').onchange = renderForm;
document.querySelectorAll('.unit-chips button').forEach(b => b.onclick = () => { $('#fUnit').value = b.textContent; });
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
  let measure = null;
  if ($('#fMeasure').checked) {
    const unit = $('#fUnit').value.trim(); if (!unit) { $('#fUnit').focus(); return toast('Add a unit, e.g. min or pages'); }
    const tv = $('#fTarget').value.trim(), target = tv === '' ? null : Number(tv.replace(',', '.'));
    if (target !== null && !Number.isFinite(target)) return toast('Target must be a number');
    measure = { unit, target };
  }
  const reminder = $('#fRemOn').checked && $('#fRemTime').value ? $('#fRemTime').value : null;
  const sch = draft.schedule.type === 'daily' ? { type: 'daily' } : draft.schedule.type === 'weekly' ? { type: 'weekly', times: draft.schedule.times } : { type: 'weekdays', days: [...draft.schedule.days].sort() };
  const fields = { name, emoji: draft.emoji, color: draft.color, why: $('#fWhy').value.trim(), schedule: sch, measure, reminder };
  if (draft.id) Object.assign(state.habits.find(x => x.id === draft.id), fields);   // values/notes/log are kept even if measuring is turned off
  else state.habits.push({ id: uid(), ...fields, created: key(today()), log: {}, notes: {}, values: {} });
  save(); closeSheet('#editWrap'); toast(draft.id ? 'Saved' : 'Habit added 🌱'); render();
  if (reminder && 'Notification' in window && Notification.permission === 'default') setTimeout(() => openSettings(true), 400);
};
let undoFn = null;
$('#deleteBtn').onclick = () => {
  if (!confirm(`Delete “${draft.name}” and its history?`)) return;
  const i = state.habits.findIndex(x => x.id === draft.id); const [gone] = state.habits.splice(i, 1); save();
  closeSheet('#editWrap'); if (cur) history.back(); else render();
  toast('Habit deleted', 'Undo', () => { state.habits.splice(i, 0, gone); save(); render(); });
};

/* ================= Reminders ================= */
/* Honest limits: without a push server, a static PWA can only notify while the browser keeps the app or its
   service worker alive. We layer: (1) timers while the app is open, (2) catch-up when it's reopened,
   (3) Notification Triggers where the browser supports them, (4) periodic background sync (Chrome on Android,
   installed PWA, browser decides the frequency). The .ics calendar file is the reliable fallback. */
const REM_CACHE = 'habit-reminders', REM_URL = './__reminders.json';
const supportsTriggers = () => 'Notification' in window && 'showTrigger' in Notification.prototype && 'TimestampTrigger' in window;
const notifReady = () => 'Notification' in window && Notification.permission === 'granted';
async function remRead() { try { const c = await caches.open(REM_CACHE), r = await c.match(REM_URL); return r ? await r.json() : {}; } catch { return {}; } }
async function remWrite(data) { try { const c = await caches.open(REM_CACHE); await c.put(REM_URL, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })); } catch {} }
function dueReminders(habits, now = new Date()) {
  const t = today(), k = key(t), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return habits.filter(h => h.reminder && h.reminder <= hm && isScheduled(h, t) && !h.log[k] && !(h.schedule.type === 'weekly' && weekMet(h, t)));
}
async function showNote(title, body, tag, extra = {}) {
  const opts = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: './' }, ...extra };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  if (reg) return reg.showNotification(title, opts);
  return new Notification(title, opts);
}
let remTimers = [];
async function syncReminders() {
  remTimers.forEach(clearTimeout); remTimers = [];
  const t = today(), k = key(t);
  // mirror a compact copy for the service worker (it can't read localStorage)
  const store = await remRead(); store.sent ||= {};
  for (const s of Object.keys(store.sent)) if (s < key(addDays(t, -3))) delete store.sent[s];
  store.habits = state.habits.filter(h => h.reminder).map(h => ({ id: h.id, name: h.name, emoji: h.emoji, reminder: h.reminder, schedule: h.schedule, why: h.why,
    log: Object.fromEntries(Object.entries(h.log).filter(([d]) => d >= key(addDays(weekStart(t), -1)))) }));
  await remWrite(store);
  if (!notifReady()) return;
  const now = new Date();
  // (1) timers for later today while the app stays open
  for (const h of state.habits) {
    if (!h.reminder) continue;
    const [H, M] = h.reminder.split(':').map(Number), at = new Date(t); at.setHours(H, M, 0, 0);
    if (at > now && at - now < 864e5) remTimers.push(setTimeout(() => fireDue(), at - now + 500));
  }
  remTimers.push(setTimeout(() => syncReminders(), (addDays(t, 1) - now) + 2000)); // re-plan after midnight
  // (3) Notification Triggers (experimental; only where supported)
  if (supportsTriggers()) {
    try {
      const reg = await navigator.serviceWorker.ready;
      for (const n of await reg.getNotifications({ includeTriggered: true })) if (n.tag?.startsWith('rem-')) n.close();
      for (const h of state.habits) {
        if (!h.reminder) continue;
        const [H, M] = h.reminder.split(':').map(Number);
        for (let i = 0; i < 7; i++) {
          const d = addDays(t, i), at = new Date(d); at.setHours(H, M, 0, 0);
          if (at <= now || !isScheduled(h, d) || (i === 0 && h.log[k])) continue;
          await reg.showNotification(`${h.emoji} ${h.name}`, { body: h.why || 'Time for your habit.', tag: `rem-${h.id}-${key(d)}`, icon: 'icon-192.png', showTrigger: new TimestampTrigger(+at), data: { url: './' } });
        }
      }
    } catch (e) { /* unsupported in this browser build */ }
  }
}
async function fireDue() {
  if (!notifReady()) return;
  const store = await remRead(), k = key(today()); store.sent ||= {}; store.sent[k] ||= [];
  for (const h of dueReminders(state.habits)) {
    if (store.sent[k].includes(h.id)) continue;
    store.sent[k].push(h.id);
    try { await showNote(`${h.emoji} ${h.name}`, h.why || 'Time for your habit.', `rem-${h.id}-${k}`); } catch {}
  }
  await remWrite(store);
}
async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return 'unsupported';
    const p = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (p.state !== 'granted') return 'not allowed';
    await reg.periodicSync.register('habit-reminders', { minInterval: 60 * 60 * 1000 });
    return 'on';
  } catch { return 'unsupported'; }
}
async function renderReminderSettings() {
  const st = $('#notifStatus'), btn = $('#notifBtn');
  const n = state.habits.filter(h => h.reminder).length;
  let txt, cls = '';
  if (!('Notification' in window)) { txt = 'Notifications aren’t available in this browser.'; cls = 'warn'; btn.hidden = true; }
  else if (Notification.permission === 'granted') { txt = 'Notifications allowed'; cls = 'ok'; btn.hidden = true; }
  else if (Notification.permission === 'denied') { txt = 'Blocked — allow notifications for Habits in your phone/browser settings (Android: Settings › Apps › Habits › Notifications).'; cls = 'warn'; btn.hidden = true; }
  else { txt = 'Not enabled yet'; btn.hidden = false; }
  st.textContent = txt; st.className = 'status ' + cls;
  $('#remCount').textContent = n ? `${n} habit${n > 1 ? 's have' : ' has'} a reminder time.` : 'No habits have a reminder yet — set one in a habit’s Edit screen.';
  const ps = 'serviceWorker' in navigator && notifReady() ? await registerPeriodicSync() : 'off';
  $('#remCaps').innerHTML = `<li>While the app is open: <b>yes</b></li><li>Catch-up when you reopen it: <b>yes</b></li>
    <li>Scheduled triggers: <b>${supportsTriggers() ? 'supported' : 'not supported here'}</b></li>
    <li>Background check (periodic sync): <b>${ps === 'on' ? 'on — Chrome decides how often' : ps === 'not allowed' ? 'not allowed by Chrome yet' : ps === 'off' ? 'needs notifications' : 'not supported here'}</b></li>`;
}
$('#notifBtn').onclick = async () => {
  const p = await Notification.requestPermission();
  if (p === 'granted') { toast('Notifications on 🔔'); await syncReminders(); }
  else toast('Notifications not allowed — the calendar file still works');
  renderReminderSettings();
};
$('#testNotifBtn').onclick = async () => {
  if (!('Notification' in window)) return toast('Notifications aren’t supported here');
  if (Notification.permission !== 'granted') { const p = await Notification.requestPermission(); renderReminderSettings(); if (p !== 'granted') return toast('Allow notifications first'); }
  try { await showNote('🌿 Habits', 'Test notification — reminders can reach you.', 'test'); toast('Test notification sent'); }
  catch (e) { toast('Couldn’t show a notification: ' + (e.message || e)); }
};
/* .ics: one recurring event per habit with a reminder (habits without one default to 09:00) */
function buildICS() {
  const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
  const fold = l => l.length <= 74 ? l : l.match(/.{1,73}/g).join('\r\n ');
  const t = today(), lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Habits PWA//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Habit reminders'];
  const list = state.habits.filter(h => h.reminder).length ? state.habits.filter(h => h.reminder) : state.habits;
  for (const h of list) {
    const [H, M] = (h.reminder || '09:00').split(':'), ds = key(t).replace(/-/g, '');
    const rule = h.schedule.type === 'weekdays' ? `FREQ=WEEKLY;BYDAY=${h.schedule.days.map(d => ICS_DAY[d]).join(',')}` : 'FREQ=DAILY';
    const desc = (h.why ? h.why + '\n\n' : '') + (h.schedule.type === 'weekly' ? `Goal: ${h.schedule.times}× per week.\n` : '') + 'Check in: https://travis198889.github.io/habit-tracker/';
    lines.push('BEGIN:VEVENT', `UID:habit-${h.id}@habit-tracker`, `DTSTAMP:${stamp}`,
      `DTSTART:${ds}T${H}${M}00`, 'DURATION:PT10M', `RRULE:${rule}`,
      `SUMMARY:${icsEsc(`${h.emoji} ${h.name}`)}`, `DESCRIPTION:${icsEsc(desc)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(h.name)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
function download(name, text, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
$('#icsBtn').onclick = () => {
  if (!state.habits.length) return toast('Add a habit first');
  download('habit-reminders.ics', buildICS(), 'text/calendar'); toast('Calendar file downloaded — open it to add to Google Calendar');
};

/* ================= sheets / settings / backup ================= */
function closeSheet(sel) { $(sel).hidden = true; }
document.querySelectorAll('.sheet-wrap').forEach(w => w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-close]')) closeSheet('#' + w.id); }));
$('#addBtn').onclick = () => openEdit(null);
function openSettings(focusReminders) {
  $('#clearSampleBtn').hidden = !state.habits.some(h => h.sample); $('#settingsWrap').hidden = false; renderReminderSettings();
  if (focusReminders) $('#remSection').scrollIntoView({ block: 'start' });
}
$('#settingsBtn').onclick = () => openSettings();
$('#exportBtn').onclick = () => {
  download(`habits-backup-${key(today())}.json`, JSON.stringify({ app: 'habit-tracker', exported: new Date().toISOString(), ...state }, null, 2), 'application/json');
  toast('Backup exported');
};
$('#importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.habits) || !data.habits.every(h => h && h.id && h.name && h.schedule && typeof h.log === 'object')) throw new Error('bad');
    if (!confirm(`Replace current data with ${data.habits.length} habit(s) from backup?`)) return;
    localStorage.setItem(KEY + '-backup-before-import', JSON.stringify(state)); // one-step safety net
    const { app, exported, ...rest } = data;
    state = migrate(rest); save(); closeSheet('#settingsWrap'); render(); toast('Backup restored');
  } catch { toast('That file isn’t a valid backup'); }
};
$('#clearSampleBtn').onclick = () => { state.habits = state.habits.filter(h => !h.sample); save(); closeSheet('#settingsWrap'); render(); toast('Sample data cleared'); };
$('#resetBtn').onclick = () => { if (confirm('Delete ALL habits and history? Export first if unsure.')) { state.habits = []; save(); closeSheet('#settingsWrap'); render(); } };

let tt;
function toast(msg, action, fn) {
  const el = $('#toast'); el.innerHTML = esc(msg) + (action ? ` <button id="toastAct">${esc(action)}</button>` : ''); el.hidden = false;
  undoFn = fn || null;
  if (action) $('#toastAct').onclick = () => { const f = undoFn; undoFn = null; el.hidden = true; f && f(); };
  clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; undoFn = null; }, action ? 5000 : 2400);
}

/* refresh on return (new day, catch-up reminders) */
let lastDay = key(today());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (key(today()) !== lastDay) { lastDay = key(today()); render(); }
  syncReminders().then(fireDue);
});

setTab('today');
if ('serviceWorker' in navigator && location.protocol !== 'file:')
  navigator.serviceWorker.register('sw.js').then(() => syncReminders()).then(() => fireDue()).catch(() => {});
