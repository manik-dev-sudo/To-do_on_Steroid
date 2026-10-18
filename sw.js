const CACHE_NAME = 'todo-steroids-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/manifest.webmanifest',
  '/public/icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never intercept external APIs, hot-module-reloading, or Vite internal dev scripts
  const url = event.request.url;
  if (
    url.includes('googleapis.com') ||
    url.includes('@vite') ||
    url.includes('@fs') ||
    url.includes(':3000') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1')
  ) {
    return; // Pass through directly to network
  }

  // Network first, fallback to cache for offline support
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
