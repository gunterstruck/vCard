/**
 * SERVICE WORKER - vCard NFC Writer
 * ===================================
 * Simplified caching strategy for PWA offline functionality:
 * - Core Assets: Cached for offline availability (App Shell)
 * - Offline Fallback: Shows offline page when network unavailable
 */

// Repository path
const REPO_PATH = '/vCard/';

// Cache version - increment to force cache update
const CORE_CACHE_NAME = 'vcard-core-v10';

// Core Assets for offline availability
const CORE_ASSETS = [
    '/vCard/offline.html',
    '/vCard/index.html',
    '/vCard/style.css',
    '/vCard/assets/style.css',
    '/vCard/assets/offline.css',
    '/vCard/assets/datenschutz.css',
    '/vCard/assets/app.js',
    '/vCard/assets/theme-bootstrap.js',
    '/vCard/assets/datenschutz.html',
    '/vCard/lang/de.json',
    '/vCard/lang/en.json',
    '/vCard/lang/es.json',
    '/vCard/lang/fr.json'
];

// ============================================================
// Service Worker Lifecycle Events
// ============================================================

/**
 * Safe cache helper - adds assets with error handling
 */
async function safeCacheAddAll(cache, urls) {
    console.log('[Service Worker] Starting robust caching of assets.');
    const promises = urls.map(url => {
        return cache.add(url).catch(err => {
            console.warn(`[Service Worker] Skipping asset: ${url} failed to cache.`, err);
        });
    });
    await Promise.all(promises);
    console.log(`[Service Worker] Robust caching finished.`);
}

/**
 * Install Event - Cache core assets
 */
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CORE_CACHE_NAME)
            .then((cache) => safeCacheAddAll(cache, CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete all caches except current version
                    if (cacheName !== CORE_CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ============================================================
// Fetch Event - Network strategies
// ============================================================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Navigation Requests (HTML pages)
    if (request.mode === 'navigate') {
        // HTML pages from assets/ (e.g., privacy policy)
        if (url.pathname.startsWith(`${REPO_PATH}assets/`) && url.pathname.endsWith('.html')) {
            event.respondWith((async () => {
                const cache = await caches.open(CORE_CACHE_NAME);

                try {
                    const networkResponse = await fetch(request);
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    const cachedResponse = await cache.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    console.log('[Service Worker] Navigate fetch failed for legal page, falling back to offline page.');
                    return await caches.match('/vCard/offline.html');
                }
            })());
            return;
        }

        // Main navigation - always serve index.html
        event.respondWith((async () => {
            const indexRequest = new Request(`${REPO_PATH}index.html`);
            const cachedResponse = await caches.match(indexRequest);

            if (cachedResponse) {
                return cachedResponse;
            }

            try {
                const networkResponse = await fetch(indexRequest);
                caches.open(CORE_CACHE_NAME).then(cache => {
                    cache.put(indexRequest, networkResponse.clone());
                });
                return networkResponse;
            } catch (error) {
                console.log('[Service Worker] Navigate fetch failed, falling back to offline page.');
                return await caches.match('/vCard/offline.html');
            }
        })());
        return;
    }

    // Assets - Cache on Demand
    if (url.pathname.startsWith('/vCard/assets/')) {
        event.respondWith(
            caches.match(request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request).then(networkResponse => {
                    // Cache only successful responses
                    if (networkResponse.ok) {
                        caches.open(CORE_CACHE_NAME).then(cache => {
                            cache.put(request, networkResponse.clone());
                        });
                    }
                    return networkResponse;
                });
            })
        );
        return;
    }

    // All other assets: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request).then(networkResponse => {
                caches.open(CORE_CACHE_NAME).then(cache => {
                    if (networkResponse.ok) {
                        cache.put(request, networkResponse.clone());
                    }
                });
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});

// ============================================================
// Message Event - Handle skip waiting
// ============================================================

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});


