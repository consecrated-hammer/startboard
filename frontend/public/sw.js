const SHELL_CACHE = 'startboard-shell-v2'
const RUNTIME_CACHE = 'startboard-runtime-v2'
const SHELL_URLS = ['/', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
        .map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const sameOrigin = url.origin === self.location.origin
  const isNavigation = event.request.mode === 'navigate'
  const isAsset = sameOrigin && (
    url.pathname.startsWith('/assets/')
    || url.pathname === '/'
    || url.pathname === '/favicon.svg'
  )
  const isLocalIcon = sameOrigin && url.pathname.startsWith('/api/icons/')

  if (!sameOrigin || (!isNavigation && !isAsset && !isLocalIcon)) return

  event.respondWith((async () => {
    const cache = await caches.open(isNavigation || isAsset ? SHELL_CACHE : RUNTIME_CACHE)

    try {
      const response = await fetch(event.request)
      if (response.ok) cache.put(event.request, response.clone())
      return response
    } catch {
      const cached = await cache.match(event.request)
      if (cached) return cached
      if (isNavigation) {
        const fallback = await cache.match('/')
        if (fallback) return fallback
      }
      throw new Error('Offline and no cached response available')
    }
  })())
})
