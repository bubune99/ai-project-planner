const CACHE_NAME = 'jarvis-v1'
const STATIC_ASSETS = ['/', '/projects', '/todos']

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
    ])
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})

self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { data = { title: 'JARVIS', body: event.data.text() } }

  event.waitUntil(
    self.registration.showNotification(data.title || 'JARVIS', {
      body: data.body || '',
      icon: '/apple-icon.png',
      badge: '/icon.svg',
      tag: data.tag || 'jarvis-notification',
      data: { url: data.url || '/' },
      vibrate: [100, 50, 100],
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const url = event.notification.data?.url || '/'
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    })
  )
})
