// sw.js - Service Worker pour MAKMUS Admin
const CACHE_NAME = 'makmus-admin-v1';
const urlsToCache = [
    '/',
    '/dashboard.html',
    '/editor.html',
    '/studio.html',
    '/moderation.html',
    '/login.html',
    '/css/admin.css',
    '/js/auth.js',
    '/js/dashboard.js',
    '/js/editor.js',
    '/js/studio.js',
    '/assets/icons/icon-192x192.png',
    '/assets/icons/icon-512x512.png'
];

// Installation du service worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache ouvert');
                return cache.addAll(urlsToCache);
            })
    );
});

// Interception des requêtes
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});