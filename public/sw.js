/* Gewölbentisch offline (Service Worker)
   Die App ist eine einzige HTML-Datei. Sie liegt mit Manifest und Icons im Cache „app“.
   Start immer sofort aus dem Cache (auch ohne Netz); im Hintergrund wird die Seite neu geladen.
   Hat sie sich geändert, kommt sie in den Cache und die offenen Fenster erfahren es
   (Leiste „Neue Version“, aktiv nach dem nächsten Laden). Karten liegen im Browser-Speicher, nicht hier. */
const APP = 'gewoelbentisch-app-v1';
const SHELL = ['./', './manifest.webmanifest', './favicon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
const page = new URL('./', self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(APP)
      .then((c) => Promise.all(SHELL.map((u) => fetchClean(u).then((r) => c.put(u, r)).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Frisch vom Server; umgeleitete Antworten neu verpacken (Safari lehnt sie für Seitenaufrufe ab) */
async function fetchClean(u) {
  const r = await fetch(u, { cache: 'no-cache' });
  if (!r.ok) throw new Error(String(r.status));
  return r.redirected ? new Response(await r.blob(), { status: 200, headers: r.headers }) : r;
}

async function refreshPage() {
  try {
    const c = await caches.open(APP);
    const old = await c.match('./');
    const fresh = await fetchClean('./');
    const a = old ? await old.clone().text() : null;
    const b = await fresh.clone().text();
    if (a === b) return;
    await c.put('./', fresh);
    if (a !== null) for (const cl of await self.clients.matchAll()) cl.postMessage({ type: 'updated' });
  } catch {
    /* offline: alter Stand bleibt */
  }
}

// Die geöffnete App fragt regelmäßig nach (alle 15 Minuten und beim Zurückwechseln): neue Version da?
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'check') e.waitUntil(refreshPage());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Die App selbst: sofort aus dem Cache, im Hintergrund aktualisieren
  if (req.mode === 'navigate' || url.href === page || url.href === page + 'index.html') {
    e.respondWith(
      caches.open(APP).then(async (c) => {
        const hit = await c.match('./');
        const upd = refreshPage();
        e.waitUntil(upd);
        if (hit) return hit;
        await upd;
        return (await c.match('./')) || fetch(req);
      }),
    );
    return;
  }
  // Übrige eigene Dateien (Manifest, Icons): Cache, sonst Netz
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
  }
});
