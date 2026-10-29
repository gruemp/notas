'use strict';
// Solo contiene la aplicación; nunca guarda respuestas de Google ni datos de notas.
const CACHE = 'notas-shell-v6-20261028-private-1';
const SHELL = ['./', './index.html', './notas.html'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(url => new Request(url, {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('notas-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !['/', '/index.html', '/notas.html'].includes(url.pathname.slice(new URL('./', self.location.href).pathname.length - 1))) return;
  event.respondWith(fetch(event.request).then(response => {
    if (!response.ok) throw new Error('Aplicación no disponible');
    const copy = response.clone();
    event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(event.request)) || (await cache.match('./notas.html'));
  }));
});
