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
  try { data = event.data.json() } catch { data = { title: 'Planner', body: event.data.text() } }

  // Buttons are shown only where the device supports them; each carries its own path inside the app.
  const inApp = (u, fallback) => (typeof u === 'string' && u.startsWith('/') ? u : fallback)
  const buttons = (Array.isArray(data.actions) ? data.actions : [])
    .filter(a => a && typeof a.action === 'string' && typeof a.title === 'string')
    .slice(0, 2)
  const actionUrls = {}
  for (const a of buttons) actionUrls[a.action] = inApp(a.url, '/')
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'jarvis-notification',
    data: { url: inApp(data.url, '/'), actionUrls },
    vibrate: [100, 50, 100],
  }
  const title = data.title || 'Planner'
  event.waitUntil(
    buttons.length
      ? self.registration
          .showNotification(title, { ...options, actions: buttons.map(a => ({ action: a.action, title: a.title })) })
          .catch(() => self.registration.showNotification(title, options))
      : self.registration.showNotification(title, options)
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const d = event.notification.data || {}
      // A button press carries its name in event.action; a press on the notice itself carries none.
      const path = (event.action && d.actionUrls && d.actionUrls[event.action]) || d.url || '/'
      const url = new URL(path, self.location.origin).href
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      for (const client of windowClients) {
        if ('navigate' in client && 'focus' in client) return client.navigate(url).then(w => (w || client).focus())
      }
      return clients.openWindow(url)
    })
  )
})
