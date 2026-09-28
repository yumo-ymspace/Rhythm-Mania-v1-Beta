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
import { getFlashlightRadius } from '../src/render/flashlight';

const W = 400;
const H = 700;

describe('getFlashlightRadius', () => {
  it('returns null when Flashlight is not selected', () => {
    expect(getFlashlightRadius(undefined, 0, 0, undefined, W, H)).toBeNull();
    expect(getFlashlightRadius([], 150, 1000, undefined, W, H)).toBeNull();
    expect(getFlashlightRadius(['HD', 'DT'], 250, 1000, undefined, W, H)).toBeNull();
  });

  it('matches mod id case-insensitively', () => {
    expect(getFlashlightRadius(['fl'], 0, 0, undefined, W, H)).toBe(240);
    expect(getFlashlightRadius(['HD', 'Fl'], 0, 0, undefined, W, H)).toBe(240);
  });

  it('shrinks the view circle at the 100 and 200 combo steps', () => {
    expect(getFlashlightRadius(['FL'], 0, 0, undefined, W, H)).toBe(240);
    expect(getFlashlightRadius(['FL'], 99, 0, undefined, W, H)).toBe(240);
    expect(getFlashlightRadius(['FL'], 100, 0, undefined, W, H)).toBe(190);
    expect(getFlashlightRadius(['FL'], 199, 0, undefined, W, H)).toBe(190);
    expect(getFlashlightRadius(['FL'], 200, 0, undefined, W, H)).toBe(150);
    expect(getFlashlightRadius(['FL'], 999, 0, undefined, W, H)).toBe(150);
  });

  it('keeps the base radius outside breaks', () => {
    const breaks = [{ startTime: 10000, endTime: 20000 }];
    expect(getFlashlightRadius(['FL'], 0, 5000, breaks, W, H)).toBe(240);
    expect(getFlashlightRadius(['FL'], 0, 25000, breaks, W, H)).toBe(240);
  });

  it('opens fully in the middle of a break', () => {
    const breaks = [{ startTime: 10000, endTime: 20000 }];
    expect(getFlashlightRadius(['FL'], 0, 15000, breaks, W, H)).toBe(Math.max(W, H));
  });

  it('eases the radius at break edges', () => {
    // 10s break -> transitionMs = min(500, max(50, 5000)) = 500.
    const breaks = [{ startTime: 10000, endTime: 20000 }];
    // Halfway into the opening transition: factor 0.5 -> midpoint radius.
    expect(getFlashlightRadius(['FL'], 0, 10250, breaks, W, H)).toBe(240 + (700 - 240) * 0.5);
    // Halfway into the closing transition: same midpoint.
    expect(getFlashlightRadius(['FL'], 0, 19750, breaks, W, H)).toBe(240 + (700 - 240) * 0.5);
  });

  it('clamps tiny-break transitions to a 50ms minimum', () => {
    // 40ms break -> transitionMs = min(500, max(50, 20)) = 50.
    const breaks = [{ startTime: 10000, endTime: 10040 }];
    expect(getFlashlightRadius(['FL'], 0, 10010, breaks, W, H)).toBe(240 + (700 - 240) * 0.2);
  });
});
