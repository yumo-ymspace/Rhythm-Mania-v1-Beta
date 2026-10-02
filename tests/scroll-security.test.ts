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

import { describe, expect, it } from 'vitest';
import {
  calculateMostCommonBeatLength,
  createScrollModel,
  getScrollDelta,
  getScrollPosition,
} from '../src/render/scrollVelocity';
import { calculateScrollSpeedFactor, computeScrollTravelTimeMs } from '../src/render/playfieldLayout';
import { sanitizeSettings } from '../src/utils/securityLimits';
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';
import type { TimingControlPoint } from '../src/types';

describe('cumulative scroll model', () => {
  it('integrates normal and changed scroll segments', () => {
    const points: TimingControlPoint[] = [
      { timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1 },
      { timeMs: 1000, beatLength: -250, uninherited: false, svMultiplier: 0.4 },
      { timeMs: 2000, beatLength: 250, uninherited: true, svMultiplier: 1 },
    ];
    const model = createScrollModel({ timingPoints: points, baseBeatLength: 500 }, true);
    expect(getScrollPosition(model, 500)).toBe(500);
    expect(getScrollPosition(model, 1500)).toBeCloseTo(1200);
    expect(getScrollPosition(model, 2500)).toBeCloseTo(2400);
    expect(getScrollDelta(model, 1000, 1500)).toBeCloseTo(200);
  });

  it('treats a positive inherited beatLength as 1x (no reverse scroll, lazer decoder)', () => {
    const model = createScrollModel({
      timingPoints: [
        { timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1 },
        { timeMs: 1000, beatLength: 250, uninherited: false, svMultiplier: -1 },
      ],
      baseBeatLength: 500,
    });
    // lazer's decoder maps non-negative inherited beat lengths to 1x, so the
    // stored -1 can never take effect on a real map.
    expect(getScrollPosition(model, 1500)).toBeCloseTo(1500);
  });

  it('clamps extreme inherited SV to the effect-point range instead of freezing', () => {
    const model = createScrollModel({
      timingPoints: [
        { timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1 },
        { timeMs: 1000, beatLength: -1, uninherited: false, svMultiplier: 999 },
      ],
      baseBeatLength: 500,
    });
    // -1 encodes 100x, clamped to lazer's 10x maximum: still fast, never frozen.
    expect(getScrollPosition(model, 1000)).toBe(1000);
    expect(getScrollPosition(model, 1500)).toBeCloseTo(6000);
  });

  it('uses the 1000ms default beat length before the first red line (lazer)', () => {
    const model = createScrollModel({
      timingPoints: [
        { timeMs: 0, beatLength: -200, uninherited: false, svMultiplier: 0.5 },
        { timeMs: 2000, beatLength: 500, uninherited: true, svMultiplier: 1 },
      ],
      baseBeatLength: 500,
    }, true, 10000);
    // Pre-first-red multiplier: 0.5 * 500 / 1000 = 0.25.
    expect(getScrollPosition(model, 1000)).toBeCloseTo(250);
    expect(getScrollPosition(model, 2500)).toBeCloseTo(1000);
  });

  it('resets scroll speed to 1x on red lines even after green SV', () => {
    const model = createScrollModel({
      timingPoints: [
        { timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1 },
        { timeMs: 1000, beatLength: -250, uninherited: false, svMultiplier: 2 },
        { timeMs: 2000, beatLength: 500, uninherited: true, svMultiplier: 1 },
      ],
      baseBeatLength: 500,
    }, true, 10000);
    expect(getScrollDelta(model, 2000, 2500)).toBeCloseTo(500);
  });
});

describe('most common beat length (lazer GetMostCommonBeatLength)', () => {
  const red = (timeMs: number, beatLength: number): TimingControlPoint => ({
    timeMs, beatLength, uninherited: true, svMultiplier: 1,
  });

  it('returns 1000 with no uninherited points', () => {
    expect(calculateMostCommonBeatLength([], 60000)).toBe(1000);
    expect(calculateMostCommonBeatLength(
      [{ timeMs: 0, beatLength: -100, uninherited: false, svMultiplier: 1 }], 6000,
    )).toBe(1000);
  });

  it('returns the single point beat length', () => {
    expect(calculateMostCommonBeatLength([red(0, 500)])).toBe(500);
  });

  it('starts the first point duration at 0 like osu-stable compat', () => {
    // First red at 8000: its span counts from 0, so it outweighs the
    // [8100, 10000) span even though it starts later in the file.
    expect(calculateMostCommonBeatLength([red(8000, 500), red(8100, 300)], 10000)).toBe(500);
  });

  it('tails the last point at the last object, not an arbitrary window', () => {
    // [0, 9000) at 500 beats [9000, 9500) at 250; a +10000 tail would flip it.
    expect(calculateMostCommonBeatLength([red(0, 500), red(9000, 250)], 9500)).toBe(500);
  });

  it('ignores points after the last object', () => {
    expect(calculateMostCommonBeatLength([red(0, 500), red(9000, 250)], 8000)).toBe(500);
  });

  it('groups float-noise beat lengths and clamps to the raw range', () => {
    expect(calculateMostCommonBeatLength([red(0, 500), red(1000, 500.0000001)], 10000)).toBe(500);
    // Rounded winner (100.001) sits outside the raw range -> clamp to max raw.
    expect(calculateMostCommonBeatLength([red(0, 100.0004), red(1000, 100.0006)], 10000)).toBeCloseTo(100.0006, 9);
  });
});

describe('TASK-042 scroll speed travel time and settings lock', () => {
  it('maps scroll speed to time-to-receptor ms correctly', () => {
    // formula: Math.max(80, 1100 - scrollSpeed * 25)
    expect(computeScrollTravelTimeMs(21)).toBe(575);
    expect(computeScrollTravelTimeMs(5)).toBe(975); // min speed = slowest travel
    expect(computeScrollTravelTimeMs(40)).toBe(100);
    expect(computeScrollTravelTimeMs(80)).toBe(80); // clamped at 80ms minimum
    expect(computeScrollTravelTimeMs(undefined)).toBe(650); // fallback 18 -> 1100 - 450 = 650
  });

  it('calculateScrollSpeedFactor matches travelDistance / computeScrollTravelTimeMs', () => {
    const height = 800;
    const receptorY = 645;
    const settings = {
      scrollSpeed: 21,
      upsurfaceNoteMode: false,
    } as any;

    const speedFactor = calculateScrollSpeedFactor(height, receptorY, settings);
    const expectedTravelDistance = 645;
    const expectedTravelMs = 575;
    expect(speedFactor).toBeCloseTo(expectedTravelDistance / expectedTravelMs, 6);
  });

  it('sanitizes and defaults lockScrollSpeedDuringPlay to true', () => {
    const defaulted = sanitizeSettings({}, DEFAULT_SETTINGS);
    expect(defaulted.lockScrollSpeedDuringPlay).toBe(true);

    const explicitFalse = sanitizeSettings({ lockScrollSpeedDuringPlay: false }, DEFAULT_SETTINGS);
    expect(explicitFalse.lockScrollSpeedDuringPlay).toBe(false);

    const explicitTrue = sanitizeSettings({ lockScrollSpeedDuringPlay: true }, DEFAULT_SETTINGS);
    expect(explicitTrue.lockScrollSpeedDuringPlay).toBe(true);
  });
});

