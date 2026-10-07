// Offline support: serve from cache, refresh the cache in the background.
// Bump CACHE when the precache list changes shape.
const CACHE = 'einbuergerungstest-v1';
const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/srs.js',
  'js/exam.js',
  'js/storage.js',
  'js/app.js',
  'data/questions.js',
  'data/explanations.js',
  'images/q21.jpg',
  'images/q55.jpg',
  'images/q70.jpg',
  'images/q130.jpg',
  'images/q176.jpg',
  'images/q209.jpg',
  'images/q226.jpg',
  'images/q301.jpg',
  'images/q308.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
