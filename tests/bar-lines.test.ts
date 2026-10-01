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
import { generateBarLines } from '../src/render/barLines';
import type { TimingControlPoint } from '../src/types';

function point(timeMs: number, beatLength: number, uninherited = true): TimingControlPoint {
  return { timeMs, beatLength, uninherited, svMultiplier: 1 };
}

describe('generateBarLines (osu!lazer mania parity)', () => {
  it('returns no lines without timing points', () => {
    expect(generateBarLines(undefined, 180000)).toEqual([]);
    expect(generateBarLines([], 180000)).toEqual([]);
  });

  it('places one line per measure from a 4/4 timing point', () => {
    // 120 BPM -> 500ms beat -> 2000ms measure.
    const bars = generateBarLines([point(0, 500)], 10000);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]).toEqual({ time: 0, major: true });
    // Measure spacing.
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].time - bars[i - 1].time).toBeCloseTo(2000, 6);
    }
    // No line may jump past the song end plus one trailing measure.
    expect(bars[bars.length - 1].time).toBeLessThanOrEqual(10000 + 2000);
  });

  it('marks every fourth measure line as major', () => {
    const bars = generateBarLines([point(0, 500)], 20000);
    expect(bars.slice(0, 8).map((b) => b.major)).toEqual([
      true, false, false, false, true, false, false, false,
    ]);
  });

  it('ignores inherited (green) timing points', () => {
    const bars = generateBarLines(
      [point(0, 500), { timeMs: 1000, beatLength: -50, uninherited: false, svMultiplier: 2 }],
      10000,
    );
    // Driven purely by the red point: 0, 2000, 4000, ...
    expect(bars.map((b) => b.time)).toEqual([0, 2000, 4000, 6000, 8000, 10000]);
  });

  it('restarts bar counting at the next timing point', () => {
    // 120 BPM then 150 BPM (400ms beat) at t=8000 -> 1600ms measures.
    const bars = generateBarLines([point(0, 500), point(8000, 400)], 16000);
    expect(bars.map((b) => b.time)).toEqual([
      0, 2000, 4000, 6000, 8000, 9600, 11200, 12800, 14400, 16000,
    ]);
    const secondSegmentStart = bars.findIndex((b) => b.time === 8000);
    expect(bars[secondSegmentStart].major).toBe(true);
  });

  it('aligns negative-offset timing points to the first measure at or after t=0', () => {
    const bars = generateBarLines([point(-500, 500)], 6000);
    expect(bars[0].time).toBeGreaterThanOrEqual(0);
    expect(bars[0].time).toBeLessThan(2000);
    // Alignment stays on the 2000ms measure grid implied by t=-500.
    for (const bar of bars) {
      expect((bar.time + 500) % 2000).toBeCloseTo(0, 6);
    }
  });
});
