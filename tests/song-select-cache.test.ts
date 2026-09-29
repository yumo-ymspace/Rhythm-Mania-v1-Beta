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

import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildSongMapsIndex,
  clearSongSelectCaches,
  getCachedNoteCounts,
  getCachedStarRating,
} from '../src/utils/songSelectCache';
import { buildBestRecordIndex } from '../src/ui/lazer/SongSelectCarousel';
import type { Beatmap, HitObject, PlayHistoryRecord } from '../src/types';

function note(time: number, column: number, endTime?: number): HitObject {
  return {
    id: `${time}-${column}`,
    time,
    column,
    type: endTime === undefined ? 'normal' : 'hold',
    endTime,
    isHit: false,
    isReleased: false,
    isMissed: false,
    isHoldFailed: false,
  };
}

function testMap(id: string, difficulty: string, notes: HitObject[], extra: Partial<Beatmap> = {}): Beatmap {
  return {
    id,
    title: 'Title',
    artist: 'Artist',
    creator: 'Mapper',
    difficulty,
    bpm: 180,
    keyCount: 4,
    duration: 10,
    notes,
    hpDrainRate: 5,
    overallDifficulty: 5,
    timingPoints: [],
    sliderMultiplier: 1.4,
    ...extra,
  } as Beatmap;
}

function record(id: string, beatmapId: string, score: number, accuracy: number): PlayHistoryRecord {
  return {
    id,
    timestamp: 1,
    beatmapId,
    beatmapTitle: 'Title',
    beatmapArtist: 'Artist',
    keyCount: 4,
    score,
    accuracy,
    maxCombo: 10,
    grade: 'A',
    isFailed: false,
    scoreState: null as unknown as PlayHistoryRecord['scoreState'],
    replayFrames: [],
  };
}

describe('song select caches', () => {
  beforeEach(() => {
    clearSongSelectCaches();
  });

  it('memoizes star ratings per chart', () => {
    const map = testMap('map-a', 'Easy', [note(0, 0), note(250, 1), note(500, 2)]);
    const first = getCachedStarRating(map);
    const second = getCachedStarRating(map);
    expect(second).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it('prefers explicit star ratings without walking notes', () => {
    const map = testMap('map-b', 'Hard', [], { starRating: 4.567 } as Partial<Beatmap>);
    expect(getCachedStarRating(map)).toBe(4.57);
  });

  it('memoizes note/hold counts', () => {
    const map = testMap('map-c', 'Normal', [note(0, 0), note(250, 1, 500), note(750, 2)]);
    expect(getCachedNoteCounts(map)).toEqual({ total: 3, holds: 1, rice: 2 });
    // Cached identity is stable across calls.
    expect(getCachedNoteCounts(map)).toBe(getCachedNoteCounts(map));
  });

  it('indexes sibling diffs by song key', () => {
    const maps = [
      testMap('a1', 'Easy', [], { packageId: 'pkg_1' } as Partial<Beatmap>),
      testMap('a2', 'Hard', [], { packageId: 'pkg_1' } as Partial<Beatmap>),
      testMap('b1', 'Easy', [], { packageId: 'pkg_2' } as Partial<Beatmap>),
    ];
    const index = buildSongMapsIndex(maps, (m) => (m as { packageId?: string }).packageId || m.id);
    expect(index.get('pkg_1')?.map((m) => m.id)).toEqual(['a1', 'a2']);
    expect(index.get('pkg_2')?.map((m) => m.id)).toEqual(['b1']);
  });

  it('builds best-record lookups without per-row scans', () => {
    const history = [
      record('r1', 'diff-1', 100, 90),
      record('r2', 'diff-1', 200, 80),
      record('r3', 'diff-2', 50, 99),
    ];
    const best = buildBestRecordIndex(history);
    expect(best.byId.get('diff-1')?.id).toBe('r2');
    expect(best.byId.get('diff-2')?.id).toBe('r3');
    expect(best.byId.get('missing')).toBeUndefined();
  });
});
