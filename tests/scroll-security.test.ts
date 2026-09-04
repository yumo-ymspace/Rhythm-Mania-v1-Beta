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
import { createScrollModel, getScrollDelta, getScrollPosition } from '../src/render/scrollVelocity';
import { calculateScrollSpeedFactor, computeScrollTravelTimeMs } from '../src/render/playfieldLayout';
import { sanitizeSettings } from '../src/utils/securityLimits';
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';
import type { TimingControlPoint } from '../src/types';

describe('cumulative scroll model', () => {
  it('integrates normal, changed, and reverse scroll segments', () => {
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

    const reverse = createScrollModel({
      timingPoints: [{ timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1 }, { timeMs: 1000, beatLength: 250, uninherited: false, svMultiplier: -1 }],
      baseBeatLength: 500,
    });
    expect(getScrollPosition(reverse, 1500)).toBeCloseTo(500);
  });

  it('preserves frozen inherited SV as zero movement', () => {
    const model = createScrollModel({
      timingPoints: [
        { timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1 },
        { timeMs: 1000, beatLength: 0.0001, uninherited: false, svMultiplier: 999 },
      ],
      baseBeatLength: 500,
    });
    expect(model.segments[1].isFrozen).toBe(true);
    expect(getScrollPosition(model, 1000)).toBe(1000);
    expect(getScrollPosition(model, 2000)).toBe(1000);
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

