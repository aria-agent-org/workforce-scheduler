// Force service worker update - one time
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => {
      reg.update();
    });
  });
  // Clear all caches
  caches.keys().then(names => {
    names.forEach(name => {
      if (!name.includes('1775070784000') && !name.includes('v6-1775')) {
        caches.delete(name);
        console.log('Deleted old cache:', name);
      }
    });
  });
}
