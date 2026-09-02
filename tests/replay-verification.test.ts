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
  decodeCanonicalChart,
  parseCanonicalOsu,
} from '../api/_lib/replayVerification';

const checksum = 'a'.repeat(32);

const chart = {
  chartRevisionId: 'chart-1', checksum, checksumAlgorithm: 'md5' as const, keyCount: 2, mode: 3 as const,
  overallDifficulty: 8, hpDrainRate: 5, durationMs: 4000,
  notes: [{ lane: 0, timeMs: 1000 }], timingPoints: [],
};

describe('canonical chart helpers', () => {
  it('rejects untrusted chart shapes', () => {
    expect(decodeCanonicalChart({ ...chart, notes: [{ lane: 2, timeMs: 1000 }] })).toBeNull();
  });

  it('accepts canonical 9K charts', () => {
    const nineKeyChart = {
      ...chart,
      keyCount: 9,
      notes: [{ lane: 8, timeMs: 1000 }],
    };
    expect(decodeCanonicalChart(nineKeyChart)).toMatchObject({ keyCount: 9, notes: [{ lane: 8 }] });
  });

  it('parses only bounded mania chart data', () => {
    const content = `[General]\nMode: 3\n[Difficulty]\nCircleSize: 4\nOverallDifficulty: 7\nHPDrainRate: 5\n[HitObjects]\n256,192,1000,1,0,0:0:0:0:`;
    const parsed = parseCanonicalOsu(content, 'chart-2', checksum, 'md5');
    expect(parsed).toMatchObject({ mode: 3, keyCount: 4, notes: [{ lane: 2, timeMs: 1000 }] });
    expect(() => parseCanonicalOsu(content.replace('Mode: 3', 'Mode: 0'), 'chart-2', checksum, 'md5')).toThrow();
  });

  it('normalizes fractional hold tails consistently with the browser parser', () => {
    const content = `[General]\nMode: 3\n[Difficulty]\nCircleSize: 4\nOverallDifficulty: 7\nHPDrainRate: 5\n[HitObjects]\n256,192,1000,128,0,2000.4:0:0:0:`;
    expect(parseCanonicalOsu(content, 'chart-3', checksum, 'md5')).toMatchObject({
      notes: [{ timeMs: 1000, endTimeMs: 2000 }],
    });
    expect(() => parseCanonicalOsu(content.replace('2000.4', '1000.4'), 'chart-3', checksum, 'md5')).toThrow(/hold/);
  });
});
