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

/*
 * Tests for the Now Playing stepping rules (mirrors osu!lazer
 * `MusicController`: 5s previous-restart cutoff, wrap-around next/prev,
 * shuffle-never-repeats, seek clamping, preview-wins track resolution).
 */

import { describe, it, expect } from 'vitest';
import {
  NOW_PLAYING_RESTART_CUTOFF_SEC,
  clampSeekTarget,
  pickAdjacentIndex,
  resolveNowPlayingTrack,
  shouldRestartTrack,
} from '../src/utils/nowPlaying';

describe('now playing stepping rules', () => {
  it('uses lazer 5s previous-restart cutoff', () => {
    expect(NOW_PLAYING_RESTART_CUTOFF_SEC).toBe(5);
    expect(shouldRestartTrack(4.999)).toBe(false);
    expect(shouldRestartTrack(5)).toBe(true);
    expect(shouldRestartTrack(120)).toBe(true);
  });

  it('never restarts on invalid positions', () => {
    expect(shouldRestartTrack(Number.NaN)).toBe(false);
    expect(shouldRestartTrack(-1)).toBe(false);
    expect(shouldRestartTrack(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('steps sequentially with wrap-around', () => {
    expect(pickAdjacentIndex(5, 2, 1, false)).toBe(3);
    expect(pickAdjacentIndex(5, 4, 1, false)).toBe(0);
    expect(pickAdjacentIndex(5, 0, -1, false)).toBe(4);
    expect(pickAdjacentIndex(5, 2, -1, false)).toBe(1);
  });

  it('returns -1 for an empty pool and 0 for a single track', () => {
    expect(pickAdjacentIndex(0, 0, 1, false)).toBe(-1);
    expect(pickAdjacentIndex(1, 0, 1, true)).toBe(0);
    expect(pickAdjacentIndex(1, 0, -1, false)).toBe(0);
  });

  it('shuffle never repeats the current track', () => {
    for (let current = 0; current < 6; current++) {
      for (const r of [0, 0.1, 0.33, 0.5, 0.77, 0.999]) {
        const picked = pickAdjacentIndex(6, current, 1, true, () => r);
        expect(picked).toBeGreaterThanOrEqual(0);
        expect(picked).toBeLessThan(6);
        expect(picked).not.toBe(current);
      }
    }
  });

  it('clamps seeks into the track and floors blind seeks at zero', () => {
    expect(clampSeekTarget(30, 180)).toBe(30);
    expect(clampSeekTarget(-5, 180)).toBe(0);
    expect(clampSeekTarget(500, 180)).toBeCloseTo(179.95, 2);
    expect(clampSeekTarget(42, 0)).toBe(42);
    expect(clampSeekTarget(-3, 0)).toBe(0);
    expect(clampSeekTarget(Number.NaN, 180)).toBe(0);
  });

  it('prefers the song-select preview over the menu track', () => {
    const preview = { title: 'Galaxy Collapse', artist: 'Kurokotei', bgUrl: 'bg-a', audioUrl: 'blob:a' };
    const menu = { title: 'triangles', artist: '', bgUrl: '' };
    const resolved = resolveNowPlayingTrack({
      previewMap: preview,
      menuMap: menu,
      menuSrc: '/sounds/triangles.mp3',
      previewSrc: 'blob:a',
    });
    expect(resolved?.kind).toBe('preview');
    expect(resolved?.title).toBe('Galaxy Collapse');
  });

  it('falls back to the menu track and then to the empty state', () => {
    const menu = { title: 'triangles', artist: '', bgUrl: '' };
    expect(
      resolveNowPlayingTrack({ previewMap: null, menuMap: menu, menuSrc: '/sounds/triangles.mp3', previewSrc: null })?.kind,
    ).toBe('menu');
    expect(
      resolveNowPlayingTrack({ previewMap: null, menuMap: null, menuSrc: null, previewSrc: null }),
    ).toBeNull();
  });
});
