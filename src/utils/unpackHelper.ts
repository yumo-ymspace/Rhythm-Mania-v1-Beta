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

import JSZip from 'jszip';
import type { Beatmap } from '../types';
import { extractZipEntry, RobustZipResolver } from './zipResolver';
import { AssetLifecycleManager, getMimeTypeFromFilename, isBrowserPlayableVideoFilename } from './assetLifecycle';
import { buildBackgroundCacheKey, storageManager, type SavedBeatmap } from './storageManager';
import { TempMemoryCache } from './tempMemoryCache';
import { createZipExtractionBudget, validateZipLimits } from './securityLimits';

async function registerZipFile(
  file: JSZip.JSZipObject,
  filename: string,
  budget: ReturnType<typeof createZipExtractionBudget>,
): Promise<string> {
  const ab = await extractZipEntry(file, filename, budget);
  return AssetLifecycleManager.registerArrayBuffer(ab, filename);
}

/**
 * Load previously extracted art from the persistent IndexedDB cache.
 * Returns a fresh blob URL, or '' on miss/failure. Survives sessions —
 * repeat visits usually need no zip decompression for backdrops/banners.
 */
async function loadPersistedBackgroundUrl(mapWithPkg: SavedBeatmap): Promise<string> {
  try {
    const packageId = mapWithPkg.packageId;
    const bgFilename = mapWithPkg.bgFilename;
    if (!packageId || !bgFilename || isBrowserPlayableVideoFilename(bgFilename)) return '';
    const key = buildBackgroundCacheKey(packageId, bgFilename);
    if (!key) return '';
    const cached = await storageManager.getCachedBackground(key);
    if (!cached) return '';
    return AssetLifecycleManager.registerArrayBuffer(cached.data, cached.mime);
  } catch {
    return '';
  }
}

/** Fire-and-forget persist of freshly extracted art (never blocks playback). */
function persistExtractedBackground(packageId: string | undefined, filename: string, data: ArrayBuffer): void {
  if (typeof window === 'undefined' || !packageId || !filename) return;
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0) return;
  const key = buildBackgroundCacheKey(packageId, filename);
  const mime = getMimeTypeFromFilename(filename);
  if (!key || !mime) return;
  void storageManager.putCachedBackground(key, data, mime).catch(() => undefined);
}

export interface UnpackOptions {
  /**
   * Extract only the background image (cheap). Used to pre-unzip song art
   * immediately after download / for neighbouring songs so the Song Select
   * backdrop switches without waiting on a full audio+video unpack.
   * A later full unpack fills in the remaining channels.
   */
  backgroundOnly?: boolean;
}

export async function unpackBeatmap(map: Beatmap, force = false, opts?: UnpackOptions): Promise<void> {
  const backgroundOnly = opts?.backgroundOnly === true;
  const mapWithPkg = map as SavedBeatmap;
  if (mapWithPkg.isServerMap && !mapWithPkg.isCached && !mapWithPkg.packageId && !mapWithPkg.parentPackageId) {
    return;
  }

  // Clear stale mutated blob URLs if they are not in the active media cache
  const cached = storageManager.lruMediaCache.get(map.id);
  if (!cached) {
    for (const url of [map.audioUrl, map.videoUrl, map.bgUrl, ...Object.values(map.hitSoundUrls || {})]) {
      if (url?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(url);
    }
    map.audioUrl = '';
    map.videoUrl = '';
    map.bgUrl = '';
    map.hitSoundUrls = undefined;
  } else {
    for (const [current, retained] of [
      [map.audioUrl, cached.audioUrl],
      [map.videoUrl, cached.videoUrl],
      [map.bgUrl, cached.bgUrl],
    ] as Array<[string | undefined, string]>) {
      if (current && current !== retained) AssetLifecycleManager.releaseSpecific(current);
    }
    for (const [name, current] of Object.entries(map.hitSoundUrls || {})) {
      if (current !== cached.hitSoundUrls[name]) AssetLifecycleManager.releaseSpecific(current);
    }
    map.audioUrl = cached.audioUrl || map.audioUrl;
    map.videoUrl = cached.videoUrl || map.videoUrl;
    map.bgUrl = cached.bgUrl || map.bgUrl;
    map.hitSoundUrls = cached.hitSoundUrls;
  }

  if (!mapWithPkg.packageId) {
    return;
  }

  const wantsVideo = !!(mapWithPkg.videoFilename && isBrowserPlayableVideoFilename(mapWithPkg.videoFilename));
  if (backgroundOnly && cached?.bgUrl) {
    // Background already preloaded — keep any existing audio/video entries.
    map.audioUrl = cached.audioUrl || map.audioUrl;
    map.videoUrl = cached.videoUrl || map.videoUrl;
    map.bgUrl = cached.bgUrl || map.bgUrl;
    map.hitSoundUrls = cached.hitSoundUrls;
    return;
  }
  const cacheComplete =
    !force &&
    !!cached?.audioUrl &&
    !!cached?.bgUrl &&
    map.hitSoundUrls !== undefined &&
    (!wantsVideo || !!cached?.videoUrl);

  if (cacheComplete) {
    return;
  }

  // Cross-session fast path: previously extracted art lives in IndexedDB, so
  // backdrops/banners usually need no zip decompression at all.
  let persistedBgUrl = '';
  if (!force && !cached?.bgUrl && mapWithPkg.packageId) {
    persistedBgUrl = await loadPersistedBackgroundUrl(mapWithPkg);
  }

  let parsedAudioUrl = (!force && cached?.audioUrl) || '';
  let parsedVideoUrl = (!force && cached?.videoUrl) || '';
  let parsedBgUrl = (!force && (cached?.bgUrl || persistedBgUrl)) || '';
  const parsedHitSoundUrls: Record<string, string> = (!force && cached?.hitSoundUrls) ? { ...cached.hitSoundUrls } : {};
  const createdUrls: string[] = [];
  if (persistedBgUrl) createdUrls.push(persistedBgUrl);

  if (backgroundOnly && parsedBgUrl) {
    // Art resolved without touching the zip: merge into the memory cache
    // (preserving any audio/video already there) and return.
    storageManager.lruMediaCache.put(map.id, {
      audioUrl: cached?.audioUrl || '',
      videoUrl: cached?.videoUrl || '',
      bgUrl: parsedBgUrl,
      hitSoundUrls: cached?.hitSoundUrls ? { ...cached.hitSoundUrls } : {},
    });
    map.audioUrl = cached?.audioUrl || map.audioUrl;
    map.videoUrl = cached?.videoUrl || map.videoUrl;
    map.bgUrl = parsedBgUrl;
    return;
  }

  let zipBuffer: ArrayBuffer | Blob | null = TempMemoryCache.get(mapWithPkg.packageId);
  if (!zipBuffer) {
    zipBuffer = await storageManager.getPackage(mapWithPkg.packageId);
  }

  if (!zipBuffer) {
    return;
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  validateZipLimits(zip);
  const extractionBudget = createZipExtractionBudget();

  const resolver = new RobustZipResolver(zip);
  const audioFilename = mapWithPkg.audioFilename || '';
  const videoFilename = mapWithPkg.videoFilename || '';
  const bgFilename = mapWithPkg.bgFilename || '';
  const hitSoundFilenames = new Set<string>(['normal-hitnormal', 'normal-hitwhistle', 'normal-hitfinish', 'normal-hitclap']);
  for (const note of map.notes || []) {
    if (note.hitSample?.filename) hitSoundFilenames.add(note.hitSample.filename.replace(/\.[^/.]+$/, ''));
  }

  const register = async (file: JSZip.JSZipObject, filename: string): Promise<string> => {
    const url = await registerZipFile(file, filename, extractionBudget);
    createdUrls.push(url);
    return url;
  };

  // Background extraction that also persists the bytes for future sessions.
  const registerBackground = async (file: JSZip.JSZipObject, filename: string): Promise<string> => {
    const ab = await extractZipEntry(file, filename, extractionBudget);
    const url = AssetLifecycleManager.registerArrayBuffer(ab, filename);
    createdUrls.push(url);
    persistExtractedBackground(mapWithPkg.packageId, filename, ab);
    return url;
  };

  try {
    if (!backgroundOnly) {
      if (audioFilename && !parsedAudioUrl) {
        const file = resolver.findFile(audioFilename);
        if (file) parsedAudioUrl = await register(file, audioFilename);
      }
      if (videoFilename && isBrowserPlayableVideoFilename(videoFilename) && !parsedVideoUrl) {
        const file = resolver.findFile(videoFilename);
        if (file) parsedVideoUrl = await register(file, videoFilename);
      }

      if (!parsedAudioUrl) {
        const fallbackObj =
          (await resolver.findLargestFileByExtensions(['.mp3', '.ogg'])) ||
          resolver.findFallbackByExtensions(['.mp3', '.ogg'])?.file;
        if (fallbackObj) {
          parsedAudioUrl = await register(fallbackObj, fallbackObj.name);
        }
      }
      if (!parsedVideoUrl) {
        const fallbackObj =
          (await resolver.findLargestFileByExtensions(['.mp4', '.m4v', '.webm', '.ogv'])) ||
          resolver.findFallbackByExtensions(['.mp4', '.m4v', '.webm', '.ogv'])?.file;
        if (fallbackObj) {
          parsedVideoUrl = await register(fallbackObj, fallbackObj.name);
        }
      }
    }

  if (bgFilename && !parsedBgUrl) {
    const file = resolver.findFile(bgFilename);
    if (file) {
      // Skip if the "background" is actually a video file — handled as video above
      if (!isBrowserPlayableVideoFilename(bgFilename)) {
        parsedBgUrl = await registerBackground(file, bgFilename);
      }
    }
  }
  if (!backgroundOnly) {
    for (const sampleName of hitSoundFilenames) {
      const file = resolver.findFile(sampleName) ||
        resolver.findFile(`${sampleName}.wav`) ||
        resolver.findFile(`${sampleName}.ogg`);
       if (file && !parsedHitSoundUrls[sampleName]) parsedHitSoundUrls[sampleName] = await register(file, file.name);
    }
  }
  if (!parsedBgUrl) {
    const fallbackObj =
      (await resolver.findLargestFileByExtensions(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])) ||
      resolver.findFallbackByExtensions(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])?.file;
    if (fallbackObj) {
      parsedBgUrl = await registerBackground(fallbackObj, fallbackObj.name);
    }
  }

    storageManager.lruMediaCache.put(map.id, {
      audioUrl: parsedAudioUrl,
      videoUrl: parsedVideoUrl,
      bgUrl: parsedBgUrl,
      hitSoundUrls: parsedHitSoundUrls,
    });

  if (parsedAudioUrl) map.audioUrl = parsedAudioUrl;
  if (parsedVideoUrl) map.videoUrl = parsedVideoUrl;
  if (parsedBgUrl) map.bgUrl = parsedBgUrl;
    if (!backgroundOnly) {
      if (map.hitSoundUrls) {
        for (const url of Object.values(map.hitSoundUrls)) {
          if (url?.startsWith('blob:') && !Object.values(parsedHitSoundUrls).includes(url)) AssetLifecycleManager.releaseSpecific(url);
        }
      }
      map.hitSoundUrls = parsedHitSoundUrls;
    } else if (parsedBgUrl && !map.hitSoundUrls) {
      // Background-only preload must not mark hitsounds resolved; the later
      // full unpack still needs to extract them.
      map.hitSoundUrls = cached?.hitSoundUrls;
    }
  } catch (error) {
    for (const url of createdUrls) AssetLifecycleManager.releaseSpecific(url);
    throw error;
  } finally {
    TempMemoryCache.remove(mapWithPkg.packageId);
  }
}

// ---------------------------------------------------------------------------
// Background preloading: unzip song art immediately after download (and for
// neighbouring songs while browsing) so the Song Select backdrop switches
// without waiting on a full audio+video unpack. Best-effort, low priority,
// bounded concurrency; a later full unpackBeatmap() fills in audio/video.
// ---------------------------------------------------------------------------

const BG_PRELOAD_CONCURRENCY = 2;
const bgPreloadPending = new Map<string, Beatmap>();
const bgPreloadInflight = new Set<string>();
let bgPreloadActive = 0;

function scheduleIdleWork(work: () => void): void {
  try {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
    if (typeof ric === 'function') {
      ric.call(window, work, { timeout: 2000 });
      return;
    }
  } catch {
    // fall through to setTimeout
  }
  window.setTimeout(work, 0);
}

function pumpBgPreloadQueue(): void {
  if (typeof window === 'undefined') return;
  while (bgPreloadActive < BG_PRELOAD_CONCURRENCY && bgPreloadPending.size > 0) {
    const next = bgPreloadPending.values().next();
    if (next.done) break;
    const map = next.value;
    bgPreloadPending.delete(map.id);
    if (bgPreloadInflight.has(map.id)) continue;
    // Skip maps whose background arrived while queued.
    if (storageManager.lruMediaCache.get(map.id)?.bgUrl) continue;
    bgPreloadInflight.add(map.id);
    bgPreloadActive += 1;
    scheduleIdleWork(() => {
      void (async () => {
        try {
          await unpackBeatmap(map, false, { backgroundOnly: true });
          const cached = storageManager.lruMediaCache.get(map.id);
          const src = cached?.bgUrl || map.bgUrl;
          if (src) {
            // Decode now so the later backdrop swap is a cache hit, not a
            // cold image load.
            try {
              const img = new Image();
              (img as { decoding?: string }).decoding = 'async';
              img.src = src;
              await img.decode().catch(() => undefined);
            } catch {
              // Image decode is best-effort.
            }
          }
        } catch {
          // Preload is best-effort; selection-time unpack will retry.
        } finally {
          bgPreloadActive -= 1;
          bgPreloadInflight.delete(map.id);
          pumpBgPreloadQueue();
        }
      })();
    });
  }
}

/**
 * Queue background-only unzips for the given maps. Safe to call with every
 * import and on Song Select navigation; already-cached and duplicate maps
 * are skipped. Never rejects.
 */
export function preloadBeatmapBackgrounds(maps: Beatmap[] | undefined | null): void {
  if (typeof window === 'undefined' || !Array.isArray(maps) || maps.length === 0) return;
  let queued = false;
  for (const map of maps) {
    if (!map || typeof map.id !== 'string' || !map.id) continue;
    if (!(map as SavedBeatmap).packageId) continue;
    if (bgPreloadInflight.has(map.id) || bgPreloadPending.has(map.id)) continue;
    if (storageManager.lruMediaCache.get(map.id)?.bgUrl) continue;
    bgPreloadPending.set(map.id, map);
    queued = true;
  }
  if (queued) pumpBgPreloadQueue();
}
