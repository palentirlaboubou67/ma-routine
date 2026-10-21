// Service worker : permet d'utiliser l'application hors ligne (et une fois
// installée, sans lancer le serveur). Stratégie « réseau d'abord » : la
// version la plus récente est servie quand elle est disponible, sinon la copie
// en cache.

const CACHE = 'ma-routine-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/main.js',
  './src/date.js',
  './src/model.js',
  './src/storage.js',
  './src/store.js',
  './src/ui/app.js',
  './src/ui/dom.js',
  './src/ui/feedback.js',
  './src/ui/history.js',
  './src/ui/icons.js',
  './src/ui/settings.js',
  './src/ui/today.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
