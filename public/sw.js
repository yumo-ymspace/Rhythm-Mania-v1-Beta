/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

// Service Worker for RhythmMania PWA Offline Support
const CACHE_NAME = 'rhythm-mania-cache-v2';
const BEATMAP_CACHE_NAME = 'rhythm-mania-beatmaps-v2';

// Core assets to pre-cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/backgrounds/- Y u m i J i-.webp',
  '/backgrounds/Arushii.webp',
  '/backgrounds/Ferineon.webp',
  '/backgrounds/MPDisplay.webp',
  '/backgrounds/PEALEERD_TAK.webp',
  '/backgrounds/Porukana.webp',
  '/backgrounds/RedcXca.webp',
  '/backgrounds/Sm0llBanana.webp',
  '/backgrounds/THICC Jeff.webp',
  '/backgrounds/Triantafyllia.webp',
  '/backgrounds/YellowX21.webp',
  '/backgrounds/mimile1606.webp',
  '/backgrounds/nikio.webp',
  '/backgrounds/serr.webp',
  '/backgrounds/soncak.webp',
  '/backgrounds/wxyz.webp',
  '/sounds/d1.mp3',
  '/sounds/d2.mp3',
  '/sounds/d3.mp3',
  '/sounds/click.mp3',
  '/sounds/fail.mp3',
  '/sounds/miss-sound.mp3',
  '/sounds/restart.mp3',
  '/sounds/soft-hitwhistle.mp3',
  '/sounds/triangles.mp3',
  '/fonts/Inter-Variable.ttf',
  '/fonts/Nunito-Variable.ttf',
  '/fonts/Orbitron-Variable.ttf',
  '/fonts/SpaceGrotesk-Variable.ttf'
];

self.addEventListener('install', (event) => {
  // force active immediately of the new service worker
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching core app shell assets');
      // Fail installation when the shell is incomplete instead of activating
      // an offline worker that cannot actually serve the application.
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Claim clients and clean stale caches in a single waitUntil so neither
  // task races the other.
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== BEATMAP_CACHE_NAME) {
            console.log('[Service Worker] Evicting stale cache:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      );
      await trimCache(BEATMAP_CACHE_NAME, MAX_BEATMAP_ENTRIES);
      await trimCache(CACHE_NAME, MAX_SHELL_ENTRIES);
    })()
  );
});

const MAX_BEATMAP_ENTRIES = 50;
const MAX_SHELL_ENTRIES = 200;

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      // Evict oldest-first (Cache keys() returns insertion order).
      const excess = keys.length - maxEntries;
      for (let i = 0; i < excess; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch {
    /* cache trimming must never break activation */
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 1. API responses carry session and replay state and must never enter an offline cache.
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'chrome:' ||
    url.pathname.includes('/@vite/') ||
    url.pathname.includes('/@react-refresh') ||
    url.hash.includes('vite') ||
    (url.hostname === 'localhost' && url.port !== '3000')
  ) {
    return;
  }

  // 2. Specialized Cache-First policy for beatmaps / .osz files / .txt files
  const isBeatmapAsset = 
    url.pathname.endsWith('.osz') || 
    url.pathname.endsWith('.zip') || 
    url.pathname.includes('/beatmaps/') ||
    url.pathname.endsWith('.txt') ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.ogg') ||
    url.pathname.endsWith('.wav');

  if (isBeatmapAsset) {
    event.respondWith(
      caches.open(BEATMAP_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[Service Worker] Serving cached beatmap file:', url.pathname);
            return cachedResponse;
          }
          
          // Fetch from network, cache, and return
          console.log('[Service Worker] Downloading and caching beatmap file:', url.pathname);
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              const clone = networkResponse.clone();
              cache.put(event.request, clone).then(() => trimCache(BEATMAP_CACHE_NAME, MAX_BEATMAP_ENTRIES)).catch(() => {});
            }
            return networkResponse;
          }).catch((err) => {
            console.error('[Service Worker] Failed to fetch beatmap offline:', err);
            // Fallback to offline search
            return new Response('Beatmap asset is offline and not pre-cached.', { status: 503, statusText: 'Offline' });
          });
        });
      })
    );
    return;
  }

  // 3. Specialized Cache-First policy for backgrounds
  const isBackgroundAsset = url.pathname.includes('/backgrounds/');
  if (isBackgroundAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[Service Worker] Serving cached background image:', url.pathname);
            return cachedResponse;
          }
          console.log('[Service Worker] Fetching background image from network:', url.pathname);
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200 || networkResponse.status === 304 || networkResponse.type === 'opaque') {
              const clone = networkResponse.clone();
              cache.put(event.request, clone).then(() => trimCache(CACHE_NAME, MAX_SHELL_ENTRIES)).catch(() => {});
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 4. Network-First, Falling Back to Cache for core web application shell (HTML, JS, CSS, and metadata)
  // Restricted to same-origin so third-party covers/assets are never written
  // into the app-shell cache.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          url.origin === self.location.origin &&
          event.request.url.startsWith('http') &&
          !url.pathname.startsWith('/api/') &&
          (networkResponse.status === 200 || networkResponse.status === 304)
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch((err) => {
        console.warn('[Service Worker] Network request failed, falling back to cache:', err);
        return caches.open(CACHE_NAME).then((cache) => {
          return cache.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If navigating and completely offline, fall back to index.html
            if (event.request.mode === 'navigate') {
              return cache.match('/index.html') || cache.match('/');
            }
            throw err;
          });
        });
      })
  );
});
