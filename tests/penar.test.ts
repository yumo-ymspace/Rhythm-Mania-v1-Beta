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
import { computePenar, formatPenar } from '../src/utils/penar';

describe('PENAR calculation & formatting (TASK-054 stub)', () => {
  it('returns total: null and version: penar-stub-0 for stubbed calculations', () => {
    const penar = computePenar({
      starRating: 3.5,
      accuracy: 98.75,
      maxCombo: 450,
      missCount: 2,
      mods: ['HD', 'DT'],
    });

    expect(penar.total).toBeNull();
    expect(penar.version).toBe('penar-stub-0');
    expect(penar.starRating).toBe(3.5);
    expect(penar.accuracy).toBe(98.75);
    expect(penar.maxCombo).toBe(450);
    expect(penar.missCount).toBe(2);
    expect(penar.mods).toEqual(['HD', 'DT']);
  });

  it('handles null / undefined starRating and empty mods gracefully', () => {
    const penar = computePenar({
      starRating: null,
      accuracy: 100,
      maxCombo: 1200,
      missCount: 0,
    });

    expect(penar.total).toBeNull();
    expect(penar.starRating).toBeNull();
    expect(penar.accuracy).toBe(100);
    expect(penar.maxCombo).toBe(1200);
    expect(penar.missCount).toBe(0);
    expect(penar.mods).toEqual([]);
  });

  it('formats uncalculated or stubbed PENAR as "—"', () => {
    expect(formatPenar(null)).toBe('—');
    expect(formatPenar(undefined)).toBe('—');
    expect(formatPenar(computePenar({ accuracy: 99.5, maxCombo: 500, missCount: 0 }))).toBe('—');
    expect(formatPenar({ total: null, version: 'penar-stub-0', starRating: null, accuracy: 100, maxCombo: 10, missCount: 0, mods: [] })).toBe('—');
    expect(formatPenar({ total: NaN as any, version: 'penar-stub-0', starRating: null, accuracy: 100, maxCombo: 10, missCount: 0, mods: [] })).toBe('—');
  });

  it('formats computed positive numbers correctly when populated', () => {
    const computed = {
      total: 350.4,
      version: 'penar-test',
      starRating: 4.2,
      accuracy: 99.1,
      maxCombo: 800,
      missCount: 1,
      mods: [],
    };
    expect(formatPenar(computed)).toBe('350');
  });

  it('never emits or contains a "pp" label or substring in outputs or json representations', () => {
    const penar = computePenar({
      starRating: 5.0,
      accuracy: 97.2,
      maxCombo: 750,
      missCount: 5,
      mods: ['HR'],
    });

    const formatted = formatPenar(penar);
    const jsonStr = JSON.stringify(penar);

    expect(formatted.toLowerCase()).not.toContain('pp');
    expect(jsonStr.toLowerCase()).not.toContain('"pp"');
    expect(Object.keys(penar)).not.toContain('pp');
  });
});
