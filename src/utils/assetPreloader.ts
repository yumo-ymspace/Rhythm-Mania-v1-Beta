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
 * Boot-time asset preloading for the loading screen.
 *
 * Every bundled file the menu can reach for (menu sounds, menu backgrounds,
 * skin previews, avatars, cursor, icons) is fetched up front so the HTTP
 * cache holds full bytes before the first menu renders. Beatmap media from
 * user packages is intentionally excluded: those blobs live in IndexedDB and
 * are unpacked on demand into a small media cache.
 */

export const BOOT_MENU_BACKGROUNDS: readonly string[] = [
  '- Y u m i J i-.webp',
  'Arushii.webp',
  'Ferineon.webp',
  'MPDisplay.webp',
  'PEALEERD_TAK.webp',
  'Porukana.webp',
  'RedcXca.webp',
  'Sm0llBanana.webp',
  'THICC Jeff.webp',
  'Triantafyllia.webp',
  'YellowX21.webp',
  'mimile1606.webp',
  'nikio.webp',
  'serr.webp',
  'soncak.webp',
  'wxyz.webp',
] as const;

const BOOT_SOUNDS: readonly string[] = [
  '/sounds/triangles.mp3',
  '/sounds/click.mp3',
  '/sounds/d1.mp3',
  '/sounds/d2.mp3',
  '/sounds/d3.mp3',
  '/sounds/fail.mp3',
  '/sounds/miss-sound.mp3',
  '/sounds/restart.mp3',
  '/sounds/soft-hitwhistle.mp3',
] as const;

const BOOT_SKIN_PREVIEWS: readonly string[] = [
  '/skin/rhythmplus-classic-style-rectangular.webp',
  '/skin/rhythmplus-dynamic-style-rectangular.webp',
] as const;

const BOOT_CHROME: readonly string[] = [
  '/avatars/preset_01.png',
  '/cursor/cursor.png',
  '/cursor/cursor-additive.png',
  '/icons/favicon-64.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
] as const;

/** Every static file warmed by the boot loader. */
export const BOOT_STATIC_ASSETS: readonly string[] = [
  ...BOOT_SOUNDS,
  ...BOOT_MENU_BACKGROUNDS.map((name) => `/backgrounds/${name}`),
  ...BOOT_SKIN_PREVIEWS,
  ...BOOT_CHROME,
] as const;

const PRELOAD_CONCURRENCY = 6;

async function fetchOne(url: string): Promise<void> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`Boot preload failed for ${url}: HTTP ${res.status}`);
  }
  // Consume full bytes so the HTTP cache (and service worker) holds the file,
  // not just the response headers.
  await res.arrayBuffer();
}

/**
 * Fetch every bundled static asset with bounded concurrency.
 * A single missing/failed file never fails the boot; it is warned and the
 * loader moves on so one bad asset can't brick the launch.
 */
export async function preloadStaticAssets(
  onFile?: (done: number, total: number) => void,
): Promise<void> {
  const total = BOOT_STATIC_ASSETS.length;
  let done = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < total) {
      const url = BOOT_STATIC_ASSETS[cursor];
      cursor += 1;
      try {
        await fetchOne(url);
      } catch (err) {
        console.warn('Boot preload skipped an asset:', err instanceof Error ? err.message : String(err));
      }
      done += 1;
      onFile?.(done, total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PRELOAD_CONCURRENCY, total) }, () => worker()),
  );
}

/**
 * Wait for web fonts so the first menu never flashes fallback type.
 * Times out instead of hanging the boot when fonts stall.
 */
export async function waitForBootFonts(timeoutMs = 3000): Promise<void> {
  try {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    /* fonts are decorative for boot purposes */
  }
}
