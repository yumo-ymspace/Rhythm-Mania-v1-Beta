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

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { preloadMenuSounds } from './utils/menuSounds';
import { preloadMenuMusic } from './utils/menuMusic';
import { mainAudio } from './audio/AudioEngine';

// Fetch + decode the first-menu cookie sounds (plus the global UI click)
// immediately so the first cookie press plays instantly instead of waiting
// on network.
preloadMenuSounds();

// Fetch + decode the launch menu song (triangles.mp3 fallback) immediately so
// the boot start button starts it with a synchronous start(0) — the same
// no-startup-delay path as the d1/d2/d3 clicks — instead of paying the
// HTMLAudio load pipeline on the click gesture.
preloadMenuMusic();

// Fetch + decode the gameplay one-shots (soft-hitwhistle default hitsound,
// fail, miss, restart) immediately so the first gameplay event plays with a
// synchronous start() instead of paying fetch + decode on the event.
mainAudio.preloadSfx();

// Register Service Worker for robust offline caching
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[Service Worker] Registered successfully with scope:', reg.scope);
        
        // Listen for updates from the service worker installation lifecycle
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[Service Worker] New version detected! Preparing to upgrade...');
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[Service Worker] Registration failed:', err);
      });
  });

}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
