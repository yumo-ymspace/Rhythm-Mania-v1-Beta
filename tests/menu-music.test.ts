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
 * Tests for launch menu music: fallback track with no beatmaps, uniform
 * random pick between the fallback track and installed songs otherwise.
 */

import { describe, it, expect } from 'vitest';
import { MENU_FALLBACK_TRACK, pickMenuMusicIndex } from '../src/utils/menuMusic';

describe('launch menu music', () => {
  it('uses the bundled triangles.mp3 fallback track', () => {
    expect(MENU_FALLBACK_TRACK).toBe('/sounds/triangles.mp3');
  });

  it('returns index 0 when the pool holds only the fallback track', () => {
    expect(pickMenuMusicIndex(0)).toBe(0);
    expect(pickMenuMusicIndex(1)).toBe(0);
  });

  it('picks uniformly across the fallback track and every song', () => {
    // Pool of 4: index 0 = fallback, indices 1..3 = songs.
    expect(pickMenuMusicIndex(4, () => 0)).toBe(0);
    expect(pickMenuMusicIndex(4, () => 0.24)).toBe(0);
    expect(pickMenuMusicIndex(4, () => 0.25)).toBe(1);
    expect(pickMenuMusicIndex(4, () => 0.5)).toBe(2);
    expect(pickMenuMusicIndex(4, () => 0.75)).toBe(3);
    expect(pickMenuMusicIndex(4, () => 0.9999)).toBe(3);
  });

  it('clamps out-of-range randoms instead of going out of bounds', () => {
    expect(pickMenuMusicIndex(3, () => -1)).toBe(0);
    expect(pickMenuMusicIndex(3, () => 2)).toBe(2);
    expect(pickMenuMusicIndex(3, () => Number.NaN)).toBe(0);
  });
});
