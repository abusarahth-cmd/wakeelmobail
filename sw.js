/**
 * Service Worker - برنامج الوكيل الرقمي للجوال والآيباد (PWA)
 * يوفر تجربة تشغيل متكاملة بدون إنترنت (Offline First)
 */

const CACHE_NAME = 'wakeel-mobile-pwa-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.png',
    './license-guard.js',
    './assets/icon.png',
    './assets/js/storage-db.js',
    './assets/js/whatsapp-client.js',
    './assets/js/custom-datepicker.js',
    './assets/js/custom-dropdown.js',
    './assets/js/noor-parser.js',
    './assets/js/print-preview.js',
    './assets/vendor/tailwind.js',
    './assets/vendor/chart.umd.min.js',
    './assets/vendor/xlsx.full.min.js',
    './assets/vendor/fontawesome/css/all.min.css',
    './assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './assets/vendor/fontawesome/webfonts/fa-regular-400.woff2',
    './assets/vendor/fontawesome/webfonts/fa-brands-400.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] Non-critical assets caching warning:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // تجاهل الطلبات غير الـ GET أو الطلبات الخارجية الخاصة بالـ API
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // إرجاع النسخة المخزنة مع تحديث الكاش بالخلفية إن أمكن
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                // إذا انقطع الإنترنت تماماً ولم يتوفر في الكاش
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
