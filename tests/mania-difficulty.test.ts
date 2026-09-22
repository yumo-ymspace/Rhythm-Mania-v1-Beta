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
import { calculateManiaDifficultyAttributes } from '../src/ruleset/mania/difficultyCalculator';

// Star vectors cross-validated bit-for-bit against the lazer mania strain
// difficulty implementation (kionell/osu-mania-stable difficulty path).
describe('mania strain difficulty (lazer-equivalent)', () => {
  it('returns zero stars and combo for empty or missing input', () => {
    expect(calculateManiaDifficultyAttributes([], 4, 1)).toEqual({ starRating: 0, maxCombo: 0 });
    expect(calculateManiaDifficultyAttributes(undefined, 4, 1)).toEqual({ starRating: 0, maxCombo: 0 });
    expect(calculateManiaDifficultyAttributes(null, 4, 1)).toEqual({ starRating: 0, maxCombo: 0 });
  });

  it('returns zero stars for a single note with combo of one', () => {
    const attrs = calculateManiaDifficultyAttributes(
      [{ time: 1000, column: 0, type: 'normal' }],
      4,
      1,
    );
    expect(attrs.starRating).toBe(0);
    expect(attrs.maxCombo).toBe(1);
  });

  it('matches the reference strain value for two notes', () => {
    const notes = [
      { time: 1000, column: 0, type: 'normal' as const },
      { time: 1500, column: 1, type: 'normal' as const },
    ];
    const nm = calculateManiaDifficultyAttributes(notes, 4, 1);
    expect(nm.starRating).toBeCloseTo(0.063859006, 9);
    expect(nm.maxCombo).toBe(2);

    const dt = calculateManiaDifficultyAttributes(notes, 4, 1.5);
    expect(dt.starRating).toBeCloseTo(0.066049793, 9);
    expect(dt.maxCombo).toBe(2);
  });

  it('counts hold ticks toward max combo like lazer difficulty', () => {
    const attrs = calculateManiaDifficultyAttributes(
      [{ time: 0, column: 0, type: 'hold' as const, endTime: 400 }],
      4,
      1,
    );
    expect(attrs.starRating).toBe(0);
    expect(attrs.maxCombo).toBe(1 + Math.trunc(400 / 100));
  });

  it('skips invalid notes instead of failing the chart', () => {
    const attrs = calculateManiaDifficultyAttributes(
      [
        { time: 1000, column: 0, type: 'normal' as const },
        { time: Number.NaN, column: 1, type: 'normal' as const },
        { time: 1500, column: 99, type: 'normal' as const },
      ],
      4,
      1,
    );
    expect(attrs.starRating).toBe(0);
    expect(attrs.maxCombo).toBe(1);
  });

  it('scales strain with density (sanity, no reference needed)', () => {
    const sparse = Array.from({ length: 100 }, (_, i) => ({ time: i * 1000, column: i % 4, type: 'normal' as const }));
    const dense = Array.from({ length: 100 }, (_, i) => ({ time: i * 100, column: i % 4, type: 'normal' as const }));
    const sparseStars = calculateManiaDifficultyAttributes(sparse, 4, 1).starRating;
    const denseStars = calculateManiaDifficultyAttributes(dense, 4, 1).starRating;
    expect(denseStars).toBeGreaterThan(sparseStars);
    expect(sparseStars).toBeGreaterThanOrEqual(0);
  });
});