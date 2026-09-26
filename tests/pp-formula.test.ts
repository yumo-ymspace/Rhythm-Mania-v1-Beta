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
import { computePenar, PENAR_VERSION } from '../src/utils/penar';

// Locks the exact ppy/osu ManiaPerformanceCalculator equation:
//   pp = 8 * max(SR - 0.15, 0.05)^2.2 * max(0, 5*acc - 4)
//        * (1 + 0.1 * min(1, notes/1500)) * mods
// where acc uses weights Perfect 320 / Great 300 / Good 200 / Ok 100 /
// Meh 50 (miss 0), mapped from marvelous/perfect/great/good/bad/miss, and
// mods is NF x0.75 / EZ x0.5 only.
describe('PP equation accuracy (lazer ManiaPerformanceCalculator)', () => {
  const SR = 4.0;

  function fc(total: number, mods: string[] = []) {
    return computePenar({ starRating: SR, marvelousCount: total, maxCombo: total, mods });
  }

  it('matches the closed-form equation bit-for-bit on a reference vector', () => {
    const total = 500;
    const expected =
      8 *
      Math.pow(Math.max(SR - 0.15, 0.05), 2.2) *
      Math.max(0, 5 * 1 - 4) *
      (1 + 0.1 * Math.min(1, total / 1500));
    expect(fc(total).total).toBeCloseTo(expected, 12);
  });

  it('hits ~0 at 80% accuracy and rewards only the top 20%', () => {
    // 4/5 top-judgement + 1/5 miss => acc = 0.8 => 5*0.8-4 = 0 (up to
    // float dust: 0.8 is not binary-exact, so allow epsilon).
    const atFloor = computePenar({
      starRating: SR,
      marvelousCount: 400,
      missCount: 100,
      maxCombo: 400,
      mods: [],
    });
    expect(atFloor.total!).toBeLessThan(1e-9);

    // One more top judgement above the floor => strictly positive.
    const aboveFloor = computePenar({
      starRating: SR,
      marvelousCount: 401,
      missCount: 99,
      maxCombo: 401,
      mods: [],
    });
    expect(aboveFloor.total).toBeGreaterThan(0);

    // Deep below the floor (all Ok-weight goods: acc = 100/320) => 0.
    const belowFloor = computePenar({
      starRating: SR,
      goodCount: 500,
      maxCombo: 500,
      mods: [],
    });
    expect(belowFloor.total).toBe(0);
  });

  it('caps the length bonus at 1500 notes', () => {
    const at1500 = fc(1500).total!;
    const at3000 = fc(3000).total!;
    // Same accuracy (FC) and SR with the bonus capped: identical totals.
    expect(at3000).toBeCloseTo(at1500, 9);

    const at750 = fc(750).total!;
    // 750 notes => 1.05, 1500 notes => 1.1.
    expect(at1500 / at750).toBeCloseTo(1.1 / 1.05, 12);
  });

  it('applies only NF (x0.75) and EZ (x0.5) as direct multipliers', () => {
    const base = fc(500).total!;
    expect(computePenar({ starRating: SR, marvelousCount: 500, maxCombo: 500, mods: ['NF'] }).total)
      .toBeCloseTo(base * 0.75, 12);
    expect(computePenar({ starRating: SR, marvelousCount: 500, maxCombo: 500, mods: ['EZ'] }).total)
      .toBeCloseTo(base * 0.5, 12);
    expect(
      computePenar({ starRating: SR, marvelousCount: 500, maxCombo: 500, mods: ['NF', 'EZ'] }).total,
    ).toBeCloseTo(base * 0.375, 12);
  });

  it('ignores rate/visual/HP mods directly (they act through SR only)', () => {
    const base = fc(500).total!;
    for (const mods of [['DT'], ['HT'], ['NC'], ['DC'], ['HD'], ['HR'], ['DT', 'HD'], ['AT'], ['CN']]) {
      expect(computePenar({ starRating: SR, marvelousCount: 500, maxCombo: 500, mods }).total)
        .toBeCloseTo(base, 12);
    }
    // Mod matching is case-insensitive.
    expect(computePenar({ starRating: SR, marvelousCount: 500, maxCombo: 500, mods: ['nf'] }).total)
      .toBeCloseTo(base * 0.75, 12);
    expect(computePenar({ starRating: SR, marvelousCount: 500, maxCombo: 500, mods: ['ez'] }).total)
      .toBeCloseTo(base * 0.5, 12);
  });

  it('floors the star-rating curve at 0.05 below SR 0.2', () => {
    const zero = computePenar({ starRating: 0, marvelousCount: 500, maxCombo: 500, mods: [] }).total!;
    const tenth = computePenar({ starRating: 0.1, marvelousCount: 500, maxCombo: 500, mods: [] }).total!;
    const fifth = computePenar({ starRating: 0.2, marvelousCount: 500, maxCombo: 500, mods: [] }).total!;
    expect(zero).toBeGreaterThan(0);
    expect(tenth).toBe(zero);
    expect(fifth).toBeGreaterThan(zero);
  });

  it('uses the lazer accuracy weights, not the gameplay score weights', () => {
    // Perfect-tier judgement maps to Great (300), not 320: swapping one
    // marvelous for one perfect must LOWER pp.
    const allMarv = computePenar({ starRating: SR, marvelousCount: 500, maxCombo: 500, mods: [] }).total!;
    const oneDown = computePenar({
      starRating: SR,
      marvelousCount: 499,
      perfectCount: 1,
      maxCombo: 500,
      mods: [],
    }).total!;
    expect(oneDown).toBeLessThan(allMarv);
    // Weight check: acc = (499*320 + 300) / (500*320).
    const acc = (499 * 320 + 300) / (500 * 320);
    const expected =
      8 * Math.pow(SR - 0.15, 2.2) * (5 * acc - 4) * (1 + 0.1 * (500 / 1500));
    expect(oneDown).toBeCloseTo(expected, 9);
  });

  it('keeps the estimator version tag stable', () => {
    expect(PENAR_VERSION).toBe('penar-mania-1');
    expect(fc(10).version).toBe(PENAR_VERSION);
  });
});
