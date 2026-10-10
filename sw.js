// Offline support: serve from cache, refresh the cache in the background.
// Bump CACHE when the precache list changes shape.
const CACHE = 'einbuergerungstest-v4';
const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/srs.js',
  'js/exam.js',
  'js/catalogue.js',
  'js/storage.js',
  'js/app.js',
  'data/states.js',
  'data/questions.js',
  'data/explanations.js',
  'data/explanations_de.js',
  'images/q21.jpg',
  'images/q55.jpg',
  'images/q130.jpg',
  'images/q176.jpg',
  'images/q209.jpg',
  'images/q226.jpg',
  'images/q301.jpg',
  'images/q308.jpg',
  'images/q311.jpg',
  'images/q318.jpg',
  'images/q321.jpg',
  'images/q328.jpg',
  'images/q331.jpg',
  'images/q338.jpg',
  'images/q341.jpg',
  'images/q348.jpg',
  'images/q351.jpg',
  'images/q358.jpg',
  'images/q361.jpg',
  'images/q368.jpg',
  'images/q371.jpg',
  'images/q378.jpg',
  'images/q381.jpg',
  'images/q388.jpg',
  'images/q391.jpg',
  'images/q398.jpg',
  'images/q401.jpg',
  'images/q408.jpg',
  'images/q411.jpg',
  'images/q418.jpg',
  'images/q421.jpg',
  'images/q428.jpg',
  'images/q431.jpg',
  'images/q438.jpg',
  'images/q441.jpg',
  'images/q448.jpg',
  'images/q451.jpg',
  'images/q458.jpg',
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
