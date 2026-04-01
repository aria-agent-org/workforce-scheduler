// Build: 2026-04-01T19:30:00Z — Force update all clients
const BUILD_TS = Date.now();
const CACHE_VERSION = `v7-${BUILD_TS}`;
const CACHE_NAME = `shavtzak-${CACHE_VERSION}`;
const API_CACHE = `shavtzak-api-${CACHE_VERSION}`;

// FORCE: skip waiting and claim immediately
self.addEventListener('install', event => {
  // Delete ALL old caches
  event.waitUntil(
    caches.keys().then(names => 
      Promise.all(names.map(name => caches.delete(name)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => 
      Promise.all(
        names.filter(n => n !== CACHE_NAME && n !== API_CACHE).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
    .then(() => {
      // Force reload all open tabs
      self.clients.matchAll({type: 'window'}).then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    })
  );
});

// Minimal fetch - no caching, always network
self.addEventListener('fetch', event => {
  // Skip caching for now - ensure fresh content
  if (event.request.url.includes('/api/') || event.request.url.includes('/auth/')) {
    return; // Let browser handle API requests normally
  }
  // For page navigations, always go to network
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
    return;
  }
});

// Push notification handler
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'שבצק';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    dir: 'rtl',
    lang: 'he',
    data: data.url ? { url: data.url } : undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
