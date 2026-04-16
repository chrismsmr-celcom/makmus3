// sw.js - Service Worker pour PWA
const CACHE_NAME = 'makmus-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/redaction.html',
    '/redaction.css',
    '/redaction.js',
    '/script.js',
    '/favicon.ico'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});