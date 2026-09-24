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

import type { Beatmap } from '../types';
import { storageManager } from './storageManager';
import { unpackBeatmap } from './unpackHelper';

export interface PreparedLaunchTrack {
  /** Installed-song beatmap id, or null for the bundled fallback track. */
  mapId: string | null;
  /** Playable audio URL, or null to use the bundled fallback track. */
  src: string | null;
}

/** Beatmapset whose audio is played when the boot start button is pressed. */
export const LAUNCH_MENU_BEATMAPSET_ID = 2153231;

type LaunchSetCandidate = Beatmap & {
  packageId?: string;
  parentPackageId?: string;
};

/**
 * True when a beatmap belongs to the launch-menu beatmapset. Matches every
 * identity shape written by the osu! mirror import paths (numeric set id,
 * `osuapi_<setId>` package/catalog ids, and chart-revision ids).
 */
export function isLaunchMenuSetMap(map: Beatmap): boolean {
  const candidate = map as LaunchSetCandidate;
  if (
    typeof candidate.sourceSetId === 'number' &&
    candidate.sourceSetId === LAUNCH_MENU_BEATMAPSET_ID
  ) {
    return true;
  }
  const catalogSetId =
    typeof candidate.catalogSetId === 'string' ? candidate.catalogSetId : null;
  if (
    catalogSetId &&
    catalogSetId.replace(/^osuapi_/, '') === String(LAUNCH_MENU_BEATMAPSET_ID)
  ) {
    return true;
  }
  if (candidate.packageId === `osuapi_${LAUNCH_MENU_BEATMAPSET_ID}`) return true;
  if (candidate.parentPackageId === `osuapi_${LAUNCH_MENU_BEATMAPSET_ID}`)
    return true;
  const ids = [
    candidate.id,
    typeof candidate.chartRevisionId === 'string'
      ? candidate.chartRevisionId
      : null,
    typeof candidate.catalogMapId === 'string' ? candidate.catalogMapId : null,
  ];
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    if (
      id === `osuapi_${LAUNCH_MENU_BEATMAPSET_ID}` ||
      id.startsWith(`osuapi_${LAUNCH_MENU_BEATMAPSET_ID}_`)
    ) {
      return true;
    }
  }
  return false;
}

function hasReadyLaunchAudio(map: Beatmap): boolean {
  const cached = storageManager.lruMediaCache.get(map.id);
  return Boolean(cached?.audioUrl || map.audioUrl);
}

/**
 * Find the installed launch-menu track: the first beatmapset-2153231 chart,
 * preferring one whose audio URL is already available so the start-button
 * song plays instantly. Returns null when the set is not downloaded yet.
 */
export function findLaunchMenuTrackMap(maps: Beatmap[]): Beatmap | null {
  const pool = Array.isArray(maps) ? maps : [];
  const candidates = pool.filter(isLaunchMenuSetMap);
  if (candidates.length === 0) return null;
  return candidates.find(hasReadyLaunchAudio) ?? candidates[0] ?? null;
}

async function resolveLaunchAudioSrc(map: Beatmap): Promise<string | null> {
  const cached = storageManager.lruMediaCache.get(map.id);
  let src: string | null = cached?.audioUrl || map.audioUrl || null;
  if (src) return src;
  const clone: Beatmap = {
    ...map,
    notes: map.notes ? map.notes.map((n) => ({ ...n })) : [],
  };
  await unpackBeatmap(clone);
  const fresh = storageManager.lruMediaCache.get(map.id);
  return fresh?.audioUrl || clone.audioUrl || null;
}

/**
 * Resolve the once-per-session launch track and unpack its audio up front so
 * the song starts instantly when the loading screen's start button fires.
 * Uses the audio file from beatmapset 2153231 when it is installed;
 * otherwise resolves to the bundled `triangles.mp3` fallback track
 * (via `{ mapId: null, src: null }`) instead of rejecting.
 */
export async function prepareLaunchMenuTrack(
  maps: Beatmap[],
  _rand: () => number = Math.random,
): Promise<PreparedLaunchTrack> {
  void _rand;
  const pool = Array.isArray(maps) ? maps : [];
  const candidates = pool.filter(isLaunchMenuSetMap);
  if (candidates.length === 0) return { mapId: null, src: null };
  const ordered = [
    ...candidates.filter(hasReadyLaunchAudio),
    ...candidates.filter((map) => !hasReadyLaunchAudio(map)),
  ];

  for (const picked of ordered) {
    try {
      const src = await resolveLaunchAudioSrc(picked);
      if (!src) continue;
      return { mapId: picked.id, src };
    } catch (err) {
      console.warn(
        'Launch track unpack failed, falling back:',
        err instanceof Error ? err.message : String(err),
      );
      continue;
    }
  }
  return { mapId: null, src: null };
}
