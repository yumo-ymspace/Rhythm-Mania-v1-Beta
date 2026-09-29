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
 * Now Playing track-stepping rules, mirroring osu!lazer's `MusicController`
 * (`osu.Game/Overlays/MusicController.cs`):
 *
 * - Previous restarts the current track when its position is at or past the
 *   restart cutoff (lazer: `restart_cutoff_point = 5000`ms), otherwise it
 *   moves to the previous track.
 * - Next always moves to the next track (wrapping around).
 * - Shuffle picks a random track that is not the current one (a single-track
 *   pool replays the same track — looping beats silence).
 *
 * Everything here is pure (no player singletons, no DOM) so it stays
 * Node-testable under `tests/now-playing.test.ts`.
 */

/** Position at or past which Previous restarts instead of stepping (seconds). */
export const NOW_PLAYING_RESTART_CUTOFF_SEC = 5;

/** Returns true when Previous should restart the track instead of stepping. */
export function shouldRestartTrack(currentTimeSec: number): boolean {
  if (!Number.isFinite(currentTimeSec) || currentTimeSec < 0) return false;
  return currentTimeSec >= NOW_PLAYING_RESTART_CUTOFF_SEC;
}

/**
 * Clamp a seek target into the track. Unknown/empty durations (<= 0) only
 * clamp the low end so the players can still seek blind into streams.
 */
export function clampSeekTarget(targetSec: number, durationSec: number): number {
  if (!Number.isFinite(targetSec)) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return Math.max(0, targetSec);
  return Math.max(0, Math.min(targetSec, Math.max(0, durationSec - 0.05)));
}

export type NowPlayingStepDirection = 1 | -1;

/**
 * Pick the next index for a Next/Previous step over `count` tracks.
 * Sequential mode wraps around; shuffle mode draws a random index that
 * differs from the current one. Returns -1 for an empty pool.
 */
export function pickAdjacentIndex(
  count: number,
  currentIndex: number,
  direction: NowPlayingStepDirection,
  shuffle: boolean,
  rand: () => number = Math.random,
): number {
  if (!Number.isFinite(count) || count <= 0) return -1;
  const size = Math.floor(count);
  if (size === 1) return 0;
  const current = Number.isFinite(currentIndex)
    ? ((Math.floor(currentIndex) % size) + size) % size
    : 0;
  if (!shuffle) {
    return (((current + direction) % size) + size) % size;
  }
  const r = rand();
  const clamped = Number.isFinite(r) ? Math.min(0.999999999, Math.max(0, r)) : 0;
  // Draw from the size-1 others, then skip past the current index.
  let picked = Math.floor(clamped * (size - 1));
  if (picked >= current) picked += 1;
  return Math.min(size - 1, picked);
}

/** Display metadata for the track the Now Playing panel shows. */
export interface NowPlayingTrack {
  /** Which player currently owns the audible track. */
  kind: 'preview' | 'menu';
  title: string;
  artist: string;
  bgUrl: string;
  /** Player src URL (blob: or same-origin), for identity only. */
  src: string;
}

/**
 * Resolve what the panel should display. Song Select preview wins whenever a
 * preview map is selected; otherwise the menu launch track shows; otherwise
 * null (the caller holds the last track frozen instead of an empty state).
 */
export function resolveNowPlayingTrack(args: {
  previewMap: { title: string; artist: string; bgUrl?: string; audioUrl?: string } | null;
  menuMap: { title: string; artist: string; bgUrl?: string } | null;
  menuSrc: string | null;
  previewSrc: string | null;
}): NowPlayingTrack | null {
  const { previewMap, menuMap, menuSrc, previewSrc } = args;
  if (previewMap && previewSrc) {
    return {
      kind: 'preview',
      title: previewMap.title || '',
      artist: previewMap.artist || '',
      bgUrl: previewMap.bgUrl || '',
      src: previewSrc,
    };
  }
  if (menuMap && menuSrc) {
    return {
      kind: 'menu',
      title: menuMap.title || '',
      artist: menuMap.artist || '',
      bgUrl: menuMap.bgUrl || '',
      src: menuSrc,
    };
  }
  return null;
}
