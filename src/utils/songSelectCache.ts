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
 * Song Select memoization caches.
 *
 * Why this exists: Song Select re-derives expensive per-chart values on
 * every render — star rating walks + sorts every note, note-count scans
 * walk every hit object, and group building scans the full map list once
 * per selected song. With a large library + every keystroke in the search
 * box, that is O(songs × notes) work per frame.
 *
 * These caches make the rules explicit:
 * - Star ratings and note counts are keyed by beatmap id and valid as long
 *   as the chart content is unchanged (imports create new ids; K-mod
 *   conversions create `_converted_` suffixed ids which are cached
 *   separately via the full id).
 * - The song-group index (`songKey -> diffs[]`) is rebuilt only when the
 *   underlying map array identity/content changes, not on every selection.
 */

import type { Beatmap } from '../types';
import { resolveStarRating } from './starRating';

const starRatingCache = new Map<string, number>();
const noteCountCache = new Map<string, { total: number; holds: number; rice: number }>();

function cacheKeyFor(map: Pick<Beatmap, 'id' | 'beatmapHash'> & { notes?: unknown }): string | null {
  const id = typeof map.id === 'string' ? map.id : '';
  if (!id) return null;
  // Beatmap hash changes when chart content changes while the id is reused
  // (re-imports). Include a short suffix so stale entries can't be reused.
  const hash = typeof (map as { beatmapHash?: unknown }).beatmapHash === 'string'
    ? (map as { beatmapHash?: string }).beatmapHash as string
    : '';
  return hash ? `${id}#${hash.slice(0, 16)}` : id;
}

/**
 * Memoized star rating (lazer-strain, via resolveStarRating). Falls back to
 * the uncached resolver on cache miss and stores the result. Explicit
 * official (`osu-api-download`) and fresh strain v2 values bypass the notes
 * walk inside the resolver, so this is cheapest for imported maps.
 * Rate mods change SR (DT/HT scale strain times), so non-1x rates get their
 * own cache entries.
 */
export function getCachedStarRating(map: Beatmap, clockRate?: number): number {
  const rate = typeof clockRate === 'number' && Number.isFinite(clockRate) && clockRate > 0 ? clockRate : 1;
  const key = cacheKeyFor(map);
  const cacheKey = key ? (rate === 1 ? key : `${key}@${rate}`) : null;
  if (cacheKey) {
    const hit = starRatingCache.get(cacheKey);
    if (hit !== undefined) return hit;
  }
  const rating = resolveStarRating(map, rate);
  if (cacheKey) {
    starRatingCache.set(cacheKey, rating);
    // Bound memory: libraries can hold thousands of diffs; LRU-trim.
    if (starRatingCache.size > 5000) {
      const oldest = starRatingCache.keys().next();
      if (!oldest.done) starRatingCache.delete(oldest.value);
    }
  }
  return rating;
}

/** Memoized note/hold/rice counts for the left-panel stats wedge. */
export function getCachedNoteCounts(map: Beatmap): { total: number; holds: number; rice: number } {
  const key = cacheKeyFor(map);
  if (key) {
    const hit = noteCountCache.get(key);
    if (hit) return hit;
  }
  const notes = Array.isArray(map.notes) ? map.notes : [];
  let holds = 0;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i]?.endTime != null) holds++;
  }
  const total = notes.length;
  const result = { total, holds, rice: Math.max(0, total - holds) };
  if (key) {
    noteCountCache.set(key, result);
    if (noteCountCache.size > 5000) {
      const oldest = noteCountCache.keys().next();
      if (!oldest.done) noteCountCache.delete(oldest.value);
    }
  }
  return result;
}

/** Drop memoized values (used by tests / after bulk re-imports). */
export function clearSongSelectCaches(): void {
  starRatingCache.clear();
  noteCountCache.clear();
}

// ---------------------------------------------------------------------------
// Song-group index: songKey -> sibling diffs.
// ---------------------------------------------------------------------------

export type SongMapsIndex = Map<string, Beatmap[]>;

/**
 * Build the `songKey -> diffs[]` index once per map-array change. Callers
 * pass the same `getSongKey` used for grouping so the index stays
 * consistent with the rendered groups. The returned map is a fresh object
 * each call — memoize the call itself with `useMemo` on the map array.
 */
export function buildSongMapsIndex(
  maps: Beatmap[],
  getSongKey: (map: Beatmap) => string,
): SongMapsIndex {
  const index: SongMapsIndex = new Map();
  for (let i = 0; i < maps.length; i++) {
    const map = maps[i];
    if (!map) continue;
    let key = '';
    try {
      key = getSongKey(map as Beatmap);
    } catch {
      continue;
    }
    if (!key) continue;
    const list = index.get(key);
    if (list) list.push(map);
    else index.set(key, [map]);
  }
  return index;
}
