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

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { persistPlayHistory, PLAY_HISTORY_STORAGE_KEY } from '../src/utils/replayManager';
import type { PlayHistoryRecord } from '../src/types';

function makeRecord(id: string, frameCount: number): PlayHistoryRecord {
  return {
    id,
    timestamp: 1,
    beatmapId: 'map',
    beatmapTitle: 'Title',
    beatmapArtist: 'Artist',
    keyCount: 4,
    score: 100,
    accuracy: 100,
    maxCombo: 1,
    grade: 'S',
    isFailed: false,
    scoreState: {
      score: 100,
      combo: 1,
      maxCombo: 1,
      hp: 100,
      perfectCount: 1,
      marvelousCount: 0,
      greatCount: 0,
      goodCount: 0,
      badCount: 0,
      missCount: 0,
      accuracy: 100,
      completed: true,
      failed: false,
      columnJudgements: [],
    } as unknown as PlayHistoryRecord['scoreState'],
    replayFrames: Array.from({ length: frameCount }, (_, i) => ({
      time: i,
      keysPressed: [false, false, false, false],
    })),
    mods: [],
  };
}

describe('quota-safe play history persistence', () => {
  const realWindow = (globalThis as unknown as { window?: unknown }).window;

  beforeEach(() => {
    const store = new Map<string, string>();
    // Tiny quota: throw once serialized payload exceeds ~2000 bytes.
    const QUOTA_BYTES = 2000;
    const localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        const next = new Map(store);
        next.set(k, v);
        let total = 0;
        for (const value of next.values()) total += value.length;
        if (total > QUOTA_BYTES) {
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        }
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    (globalThis as unknown as { window: unknown }).window = { localStorage };
  });

  afterEach(() => {
    if (realWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window: unknown }).window = realWindow;
    }
  });

  it('evicts oldest-first so the newest play survives a full quota', () => {
    const oldRecord = makeRecord('old', 20);
    const newRecord = makeRecord('new', 5);
    // Seed storage with the old record first.
    const win = (globalThis as unknown as { window: { localStorage: Storage } }).window;
    win.localStorage.setItem(PLAY_HISTORY_STORAGE_KEY, JSON.stringify([oldRecord]));

    const persisted = persistPlayHistory([newRecord, oldRecord]);
    // Newest must survive; oldest is evicted to fit.
    expect(persisted[0]?.id).toBe('new');
    const stored = JSON.parse(win.localStorage.getItem(PLAY_HISTORY_STORAGE_KEY)!);
    expect(stored.map((r: PlayHistoryRecord) => r.id)).toEqual(persisted.map(r => r.id));
  });

  it('keeps score metadata when a single record exceeds quota', () => {
    const huge = makeRecord('huge', 100);
    const persisted = persistPlayHistory([huge]);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id).toBe('huge');
    // Heavy replay payload is stripped but the score entry survives.
    expect(persisted[0]?.replayFrames).toEqual([]);
    const win = (globalThis as unknown as { window: { localStorage: Storage } }).window;
    const stored = JSON.parse(win.localStorage.getItem(PLAY_HISTORY_STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('huge');
  });
});
