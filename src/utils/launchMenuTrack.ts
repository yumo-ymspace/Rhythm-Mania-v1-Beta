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
import { pickMenuMusicIndex } from './menuMusic';
import { storageManager } from './storageManager';
import { unpackBeatmap } from './unpackHelper';

export interface PreparedLaunchTrack {
  /** Installed-song beatmap id, or null for the bundled fallback track. */
  mapId: string | null;
  /** Playable audio URL, or null to use the bundled fallback track. */
  src: string | null;
}

/**
 * Roll the once-per-session launch track and unpack its audio up front so
 * the song starts instantly when the loading screen's start button fires.
 * Any failure (missing map, unpack error, no audio) resolves to the bundled
 * fallback track instead of rejecting.
 */
export async function prepareLaunchMenuTrack(
  maps: Beatmap[],
  rand: () => number = Math.random,
): Promise<PreparedLaunchTrack> {
  const pool = Array.isArray(maps) ? maps : [];
  const index = pickMenuMusicIndex(pool.length + 1, rand);
  if (index === 0) return { mapId: null, src: null };
  const picked = pool[index - 1];
  if (!picked) return { mapId: null, src: null };

  try {
    const cached = storageManager.lruMediaCache.get(picked.id);
    let src: string | null = cached?.audioUrl || picked.audioUrl || null;
    if (!src) {
      const clone: Beatmap = {
        ...picked,
        notes: picked.notes ? picked.notes.map((n) => ({ ...n })) : [],
      };
      await unpackBeatmap(clone);
      const fresh = storageManager.lruMediaCache.get(picked.id);
      src = fresh?.audioUrl || clone.audioUrl || null;
    }
    if (!src) return { mapId: null, src: null };
    return { mapId: picked.id, src };
  } catch (err) {
    console.warn(
      'Launch track unpack failed, falling back:',
      err instanceof Error ? err.message : String(err),
    );
    return { mapId: null, src: null };
  }
}
