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

import { describe, it, expect } from 'vitest';
import {
  calculateManiaDifficultyAttributes,
  calculateTimedManiaDifficultyAttributes,
  getTimedStarRatingAtTime,
} from '../src/ruleset/mania/difficultyCalculator';
import { computePenar, computeLivePenar } from '../src/utils/penar';

function streamNotes(count: number, gapMs: number, keyCount = 4) {
  return Array.from({ length: count }, (_, i) => ({
    time: 1000 + i * gapMs,
    column: i % keyCount,
    type: 'normal' as const,
  }));
}

describe('timed (progressive) mania difficulty', () => {
  it('returns an empty table for empty or missing input', () => {
    expect(calculateTimedManiaDifficultyAttributes([], 4, 1)).toEqual([]);
    expect(calculateTimedManiaDifficultyAttributes(undefined, 4, 1)).toEqual([]);
    expect(calculateTimedManiaDifficultyAttributes(null, 4, 1)).toEqual([]);
  });

  it('emits a single zero-star entry for a single note', () => {
    const timed = calculateTimedManiaDifficultyAttributes(
      [{ time: 1000, column: 0, type: 'normal' }],
      4,
      1,
    );
    expect(timed).toHaveLength(1);
    expect(timed[0].time).toBe(1000);
    expect(timed[0].starRating).toBe(0);
    expect(timed[0].maxCombo).toBe(1);
  });

  it('matches the full-chart reference on the final entry (two notes)', () => {
    const notes = [
      { time: 1000, column: 0, type: 'normal' as const },
      { time: 1500, column: 1, type: 'normal' as const },
    ];
    const full = calculateManiaDifficultyAttributes(notes, 4, 1);
    expect(full.starRating).toBeCloseTo(0.063859006, 9);

    const timed = calculateTimedManiaDifficultyAttributes(notes, 4, 1);
    expect(timed).toHaveLength(2);
    expect(timed[0].starRating).toBe(0);
    expect(timed[1].starRating).toBe(full.starRating);
    expect(timed[1].maxCombo).toBe(full.maxCombo);
  });

  it('is sorted by time, non-decreasing, and ends at the full-chart values', () => {
    const notes = streamNotes(500, 120);
    const full = calculateManiaDifficultyAttributes(notes, 4, 1);
    const timed = calculateTimedManiaDifficultyAttributes(notes, 4, 1);

    expect(timed).toHaveLength(500);
    for (let i = 1; i < timed.length; i++) {
      expect(timed[i].time).toBeGreaterThanOrEqual(timed[i - 1].time);
      expect(timed[i].starRating).toBeGreaterThanOrEqual(timed[i - 1].starRating);
      expect(timed[i].maxCombo).toBeGreaterThanOrEqual(timed[i - 1].maxCombo);
    }
    expect(timed[timed.length - 1].starRating).toBe(full.starRating);
    expect(timed[timed.length - 1].maxCombo).toBe(full.maxCombo);
    // Progressive difficulty must actually build up: early entries well
    // below the final rating.
    expect(timed[9].starRating).toBeLessThan(full.starRating * 0.5);
  });

  it('handles holds with tail-indexed times and matches full values', () => {
    const notes = [
      { time: 1000, column: 0, type: 'normal' as const },
      { time: 1200, column: 1, type: 'hold' as const, endTime: 2400 },
      { time: 1500, column: 2, type: 'normal' as const },
      { time: 2000, column: 3, type: 'normal' as const },
    ];
    const full = calculateManiaDifficultyAttributes(notes, 4, 1);
    const timed = calculateTimedManiaDifficultyAttributes(notes, 4, 1);
    expect(timed).toHaveLength(4);
    expect(timed[timed.length - 1].starRating).toBe(full.starRating);
    expect(timed[timed.length - 1].maxCombo).toBe(full.maxCombo);
    for (let i = 1; i < timed.length; i++) {
      expect(timed[i].time).toBeGreaterThanOrEqual(timed[i - 1].time);
    }
  });

  it('looks up progressive ratings by progress time', () => {
    const notes = streamNotes(200, 150);
    const timed = calculateTimedManiaDifficultyAttributes(notes, 4, 1);
    const full = calculateManiaDifficultyAttributes(notes, 4, 1);

    expect(getTimedStarRatingAtTime(timed, -1000)).toBe(0);
    expect(getTimedStarRatingAtTime(timed, 999)).toBe(0);
    expect(getTimedStarRatingAtTime([], 5000)).toBe(0);
    expect(getTimedStarRatingAtTime(timed, Number.NaN)).toBe(0);

    const mid = getTimedStarRatingAtTime(timed, timed[19].time);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(full.starRating);
    expect(getTimedStarRatingAtTime(timed, timed[timed.length - 1].time)).toBe(full.starRating);
    expect(getTimedStarRatingAtTime(timed, 1e9)).toBe(full.starRating);
  });
});

describe('live PENAR matches lazer progression', () => {
  it('awards only a fraction of final PENAR early in the map on perfect play', () => {
    const notes = streamNotes(500, 120);
    const full = calculateManiaDifficultyAttributes(notes, 4, 1);
    const timed = calculateTimedManiaDifficultyAttributes(notes, 4, 1);

    const finalPenar = computePenar({
      starRating: full.starRating,
      marvelousCount: 500,
      maxCombo: 500,
      mods: [],
    });

    // Old (bugged) live behaviour: full-chart stars with only the judged
    // notes so far — near-final PENAR after 10 perfect hits.
    const buggedEarly = computePenar({
      starRating: full.starRating,
      marvelousCount: 10,
      maxCombo: 10,
      mods: [],
    });

    const liveEarly = computeLivePenar({
      timedAttributes: timed,
      progressTime: timed[9].time,
      marvelousCount: 10,
      maxCombo: 10,
      mods: [],
    });

    expect(finalPenar.total).toBeGreaterThan(0);
    // The bug: 10/500 perfect notes already grant the vast majority of PP.
    expect(buggedEarly.total! / finalPenar.total!).toBeGreaterThan(0.9);
    // Fixed live value tracks the progressive difficulty instead.
    expect(liveEarly.total! / finalPenar.total!).toBeLessThan(0.5);
    expect(liveEarly.total).toBeGreaterThanOrEqual(0);
  });

  it('converges to the final value at map end and grows monotonically', () => {
    const notes = streamNotes(300, 140);
    const full = calculateManiaDifficultyAttributes(notes, 4, 1);
    const timed = calculateTimedManiaDifficultyAttributes(notes, 4, 1);

    const finalPenar = computePenar({
      starRating: full.starRating,
      marvelousCount: 300,
      maxCombo: 300,
      mods: [],
    });

    let previous = -1;
    for (const idx of [9, 49, 99, 149, 199, 249, 299]) {
      const judged = idx + 1;
      const live = computeLivePenar({
        timedAttributes: timed,
        progressTime: timed[idx].time,
        marvelousCount: judged,
        maxCombo: judged,
        mods: [],
      });
      expect(live.total).toBeGreaterThanOrEqual(previous);
      previous = live.total!;
    }

    const liveEnd = computeLivePenar({
      timedAttributes: timed,
      progressTime: timed[timed.length - 1].time,
      marvelousCount: 300,
      maxCombo: 300,
      mods: [],
    });
    expect(liveEnd.total).toBe(finalPenar.total);
  });

  it('falls back to full stars without timed data and null without any rating', () => {
    const withFallback = computeLivePenar({
      progressTime: 5000,
      fallbackStarRating: 2.5,
      marvelousCount: 10,
      maxCombo: 10,
      mods: [],
    });
    expect(withFallback.total).toBe(
      computePenar({ starRating: 2.5, marvelousCount: 10, maxCombo: 10, mods: [] }).total,
    );
    expect(computeLivePenar({ marvelousCount: 10 }).total).toBeNull();
  });
});
