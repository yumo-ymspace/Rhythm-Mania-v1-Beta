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
