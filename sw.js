const CACHE = 'habits-v3';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const REM_CACHE = 'habit-reminders', REM_URL = './__reminders.json';

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== REM_CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// network-first so updates arrive, cache fallback for offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.endsWith('__reminders.json')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

/* Best-effort background reminders (periodic background sync, Chrome/Android installed PWAs only;
   the browser decides how often this runs). Reads the compact copy the page mirrors into Cache Storage. */
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
async function checkReminders() {
  const c = await caches.open(REM_CACHE), r = await c.match(REM_URL); if (!r) return;
  const data = await r.json(), now = new Date(), k = key(now), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  data.sent ||= {}; data.sent[k] ||= [];
  const ws = new Date(now); ws.setHours(0,0,0,0); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  for (const h of data.habits || []) {
    if (!h.reminder || h.reminder > hm || h.log[k] || data.sent[k].includes(h.id)) continue;
    if (h.schedule.type === 'weekdays' && !h.schedule.days.includes(now.getDay())) continue;
    if (h.schedule.type === 'weekly') { let n = 0; for (const [d, v] of Object.entries(h.log)) if (d >= key(ws) && v) n++; if (n >= h.schedule.times) continue; }
    data.sent[k].push(h.id);
    await self.registration.showNotification(`${h.emoji} ${h.name}`, { body: h.why || 'Time for your habit.', tag: `rem-${h.id}-${k}`, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: './' } });
  }
  await c.put(REM_URL, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'habit-reminders') e.waitUntil(checkReminders()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope)); return c ? c.focus() : self.clients.openWindow(e.notification.data?.url || './');
  }));
});
