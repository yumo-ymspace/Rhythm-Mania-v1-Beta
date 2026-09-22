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
import { computePenar, formatPenar, PENAR_VERSION } from '../src/utils/penar';

// Vectors cross-validated bit-for-bit against the lazer mania performance
// implementation (kionell/osu-mania-stable ScoreInfo path) at stars
// 1.8451872842256853. See validate-pp battery.
describe('PENAR lazer-equivalent mania performance', () => {
  it('computes total PP from judgement counts and stars', () => {
    const penar = computePenar({
      starRating: 1.8451872842256853,
      marvelousCount: 480,
      perfectCount: 10,
      greatCount: 5,
      goodCount: 3,
      badCount: 1,
      missCount: 1,
      maxCombo: 500,
      mods: [],
    });

    expect(penar.version).toBe(PENAR_VERSION);
    expect(penar.total).toBeCloseTo(24.709057713, 9);
    expect(penar.starRating).toBeCloseTo(1.8451872842256853, 9);
    expect(penar.missCount).toBe(1);
    expect(penar.mods).toEqual([]);
  });

  it('matches reference totals for FC, mixed, and all-miss scores', () => {
    const fc = computePenar({
      starRating: 1.8451872842256853,
      marvelousCount: 500,
      maxCombo: 500,
    });
    expect(fc.total).toBeCloseTo(26.400328775, 9);

    const mixed = computePenar({
      starRating: 1.8451872842256853,
      marvelousCount: 400,
      perfectCount: 60,
      greatCount: 20,
      goodCount: 10,
      badCount: 5,
      missCount: 5,
      maxCombo: 480,
    });
    expect(mixed.total).toBeCloseTo(19.181488876, 9);

    const allMiss = computePenar({
      starRating: 1.8451872842256853,
      missCount: 500,
      maxCombo: 0,
    });
    expect(allMiss.total).toBe(0);
  });

  it('applies NF/EZ multipliers and ignores visual-only mods', () => {
    const base = {
      starRating: 1.8451872842256853 as number,
      marvelousCount: 480,
      perfectCount: 10,
      greatCount: 5,
      goodCount: 3,
      badCount: 1,
      missCount: 1,
      maxCombo: 500,
    };
    expect(computePenar({ ...base, mods: ['NF'] }).total).toBeCloseTo(18.531793285, 9);
    expect(computePenar({ ...base, mods: ['EZ'] }).total).toBeCloseTo(12.354528856, 9);
    expect(computePenar({ ...base, mods: ['HD', 'DT'] }).total).toBeCloseTo(24.709057713, 9);
  });

  it('returns total null without a valid star rating', () => {
    expect(computePenar({ marvelousCount: 10 }).total).toBeNull();
    expect(computePenar({ starRating: null, marvelousCount: 10 }).total).toBeNull();
    expect(computePenar({ starRating: Number.NaN, marvelousCount: 10 }).total).toBeNull();
  });

  it('returns total 0 before any judgement, like lazer live PP', () => {
    const penar = computePenar({ starRating: 2.5, maxCombo: 0, mods: [] });
    expect(penar.total).toBe(0);
    expect(formatPenar(penar)).toBe('0');
  });

  it('formats uncalculated PENAR as em-dash and numeric PENAR rounded', () => {
    expect(formatPenar(null)).toBe('—');
    expect(formatPenar(undefined)).toBe('—');
    expect(formatPenar(computePenar({ marvelousCount: 5 }))).toBe('—');
    expect(formatPenar({ total: null, version: PENAR_VERSION, starRating: null, accuracy: 0, maxCombo: 0, missCount: 0, mods: [] })).toBe('—');
    expect(formatPenar({ total: Number.NaN as unknown as number, version: PENAR_VERSION, starRating: null, accuracy: 0, maxCombo: 0, missCount: 0, mods: [] })).toBe('—');
    expect(formatPenar({ total: 245.8, version: 'penar-test', starRating: 3.5, accuracy: 99, maxCombo: 500, missCount: 0, mods: [] })).toBe('246');
  });

  it('never emits or contains a "pp" label or substring in outputs or json representations', () => {
    const penar = computePenar({
      starRating: 5.0,
      marvelousCount: 700,
      perfectCount: 30,
      greatCount: 10,
      goodCount: 5,
      badCount: 2,
      missCount: 3,
      maxCombo: 740,
      mods: ['HR'],
    });

    const formatted = formatPenar(penar);
    const jsonStr = JSON.stringify(penar);

    expect(formatted.toLowerCase()).not.toContain('pp');
    expect(jsonStr.toLowerCase()).not.toContain('"pp"');
    expect(Object.keys(penar)).not.toContain('pp');
  });
});