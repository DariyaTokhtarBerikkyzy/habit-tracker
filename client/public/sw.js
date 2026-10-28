self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Привычки', body: 'Пора отметить привычку!', url: '/' };
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, icon: '/icon.svg', data: { url: data.url || '/' } }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
