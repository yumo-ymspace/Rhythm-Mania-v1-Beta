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

/**
 * One-shot menu cookie sounds for the first (lazer) menu.
 *
 * - idle cookie press -> d1.mp3
 * - top-level play button / cookie press -> d2.mp3
 * - play solo button / cookie press -> d3.mp3
 *
 * Uses plain HTMLAudio so it never disturbs the Web Audio gameplay clock
 * or the song-preview player. Each call creates a fresh element so rapid
 * presses can overlap instead of cutting each other off.
 */

export type MenuSoundId = 'd1' | 'd2' | 'd3';

const MENU_SOUND_SRC: Record<MenuSoundId, string> = {
  d1: '/sounds/d1.mp3',
  d2: '/sounds/d2.mp3',
  d3: '/sounds/d3.mp3',
};

const MENU_SOUND_IDS: readonly MenuSoundId[] = ['d1', 'd2', 'd3'];

/** Small rotating pool per sound so rapid presses overlap without re-fetching. */
const POOL_SIZE = 3;
const pool = new Map<MenuSoundId, HTMLAudioElement[]>();
const poolCursor = new Map<MenuSoundId, number>();
let preloaded = false;

function canPreload(): boolean {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined';
}

/**
 * Start fetching + decoding all three menu sounds immediately.
 * Safe to call multiple times; subsequent calls are no-ops.
 * Call this as early as possible (main.tsx) so the first cookie press is instant.
 */
export function preloadMenuSounds(): void {
  try {
    if (preloaded || !canPreload()) return;
    preloaded = true;
    for (const id of MENU_SOUND_IDS) {
      const elements: HTMLAudioElement[] = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const audio = new Audio(MENU_SOUND_SRC[id]);
        audio.preload = 'auto';
        try {
          audio.load();
        } catch {
          /* ignore - play() path still falls back to a fresh element */
        }
        elements.push(audio);
      }
      pool.set(id, elements);
      poolCursor.set(id, 0);
    }
  } catch {
    /* never break startup because of a sound */
  }
}

function playPooled(id: MenuSoundId): boolean {
  const elements = pool.get(id);
  if (!elements || elements.length === 0) return false;
  const cursor = poolCursor.get(id) ?? 0;
  poolCursor.set(id, (cursor + 1) % elements.length);
  const audio = elements[cursor];
  try {
    try {
      audio.pause();
    } catch {
      /* noop */
    }
    try {
      audio.currentTime = 0;
    } catch {
      /* noop - stream may not be seekable yet */
    }
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        /* autoplay blocked or missing file - menu must still navigate */
      });
    }
    return true;
  } catch {
    return false;
  }
}

export function playMenuSound(id: MenuSoundId): void {
  try {
    if (!canPreload()) return;
    if (playPooled(id)) return;
    // Fallback when preload hasn't run (or failed): fresh element still hits
    // the HTTP / preload-link cache after the first fetch.
    const audio = new Audio(MENU_SOUND_SRC[id]);
    audio.preload = 'auto';
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        /* autoplay blocked or missing file - menu must still navigate */
      });
    }
  } catch {
    /* never break menu navigation because of a sound */
  }
}
