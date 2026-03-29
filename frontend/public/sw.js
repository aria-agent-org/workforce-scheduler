const CACHE_NAME = 'shavtzak-v1';
const API_CACHE = 'shavtzak-api-v1';
const OFFLINE_QUEUE_KEY = 'shavtzak-offline-queue';

// App shell files to precache
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: Network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    // Don't cache mutations
    if (event.request.method !== 'GET') {
      event.respondWith(
        fetch(event.request).catch(() => {
          // Queue for later sync
          return queueOfflineAction(event.request).then(() => {
            return new Response(JSON.stringify({ queued: true, message: 'פעולה תבוצע כשתחזור לאינטרנט' }), {
              headers: { 'Content-Type': 'application/json' },
              status: 202,
            });
          });
        })
      );
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET responses
          if (response.ok) {
            const cloned = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => {
          // Serve from cache when offline
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return new Response(JSON.stringify({ offline: true, message: 'אין חיבור לאינטרנט' }), {
              headers: { 'Content-Type': 'application/json' },
              status: 503,
            });
          });
        })
    );
    return;
  }

  // Static assets: Cache first, network fallback
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff2?|ttf|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation: Network first, fallback to cached index.html (SPA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', cloned));
          return response;
        })
        .catch(() => caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  // Default: network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Queue offline mutations
async function queueOfflineAction(request) {
  try {
    const body = await request.clone().text();
    const queue = JSON.parse((await getFromIDB(OFFLINE_QUEUE_KEY)) || '[]');
    queue.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    });
    await putToIDB(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to queue offline action:', e);
  }
}

// Background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'shavtzak-sync') {
    event.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue() {
  const queueStr = await getFromIDB(OFFLINE_QUEUE_KEY);
  if (!queueStr) return;

  const queue = JSON.parse(queueStr);
  const remaining = [];

  for (const item of queue) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
    } catch {
      remaining.push(item);
    }
  }

  await putToIDB(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));

  // Notify clients
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      synced: queue.length - remaining.length,
      remaining: remaining.length,
    });
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'שבצק';
  const options = {
    body: data.body || 'התראה חדשה',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    dir: 'rtl',
    lang: 'he',
    data: data.url || '/',
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Simple IDB helpers for offline queue
function getIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shavtzak-sw', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFromIDB(key) {
  const db = await getIDB();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function putToIDB(key, value) {
  const db = await getIDB();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
  });
}
