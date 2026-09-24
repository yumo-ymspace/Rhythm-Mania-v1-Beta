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
import { convertBeatmapKeyCount, parseBeatmap, parseMediaPaths } from '../src/utils/beatmapParser';
import {
  MAX_OSU_TEXT_BYTES,
  addExtractedZipBytes,
  createZipExtractionBudget,
  decodeBoundedUtf8,
} from '../src/utils/securityLimits';

const playableMap = `[General]
Mode: 3
AudioFilename: song.mp3

[Metadata]
Title: Test
Artist: Artist
Creator: Mapper
Version: Hard

[Difficulty]
CircleSize: 2
OverallDifficulty: 8
HPDrainRate: 6
SliderMultiplier: 1.4

[TimingPoints]
0,500,4,2,1,70,1,0
1000,-250,4,2,1,70,0,0

[HitObjects]
0,192,1000,128,0,2000:0:0:0:0
256,192,2500,1,0,0:0:0:0:
`;

describe('beatmap parser security boundaries', () => {
  it('parses case-insensitive media fields, holds, and inherited SV', () => {
    const paths = parseMediaPaths('[General]\naUdIoFiLeNaMe: song.mp3\n[Events]\n0,0,"bg.jpg"');
    expect(paths.audioFilename).toBe('song.mp3');
    expect(paths.bgFilename).toBe('bg.jpg');

    const map = parseBeatmap(playableMap, 'test-map');
    expect(map.keyCount).toBe(2);
    expect(map.notes[0]).toMatchObject({ type: 'hold', time: 1000, endTime: 2000 });
    expect(map.timingPoints[1]).toMatchObject({ uninherited: false, svMultiplier: 0.4 });
  });

  it('rejects unsupported keys and malformed finite values', () => {
    expect(() => parseBeatmap(playableMap.replace('Mode: 3', 'Mode: 0'), 'standard-map')).toThrow(/mania maps only/);
    const nineKeyMap = parseBeatmap(playableMap.replace('CircleSize: 2', 'CircleSize: 9').replace('256,192,2500', '511,192,2500'), 'nine-key');
    expect(nineKeyMap.keyCount).toBe(9);
    expect(nineKeyMap.notes[1]?.column).toBe(8);
    const tenKeyMap = parseBeatmap(playableMap.replace('CircleSize: 2', 'CircleSize: 10').replace('256,192,2500', '511,192,2500'), 'ten-key');
    expect(tenKeyMap.keyCount).toBe(10);
    const oneKeyMap = parseBeatmap(playableMap.replace('CircleSize: 2', 'CircleSize: 1'), 'one-key');
    expect(oneKeyMap.keyCount).toBe(1);
    expect(() => parseBeatmap(playableMap.replace('CircleSize: 2', 'CircleSize: 11'), 'too-wide')).toThrow(/CircleSize|1K through 10K/);
    expect(() => parseBeatmap(playableMap.replace('CircleSize: 2', 'CircleSize: 0'), 'too-narrow')).toThrow(/CircleSize|1K through 10K/);
    expect(() => parseBeatmap(playableMap.replace('OverallDifficulty: 8', 'OverallDifficulty: NaN'), 'bad-od')).toThrow(/OverallDifficulty/);
    expect(() => parseBeatmap(playableMap.replace('1000,-250', '1000,NaN'), 'bad-timing')).toThrow(/timing point/);
    expect(() => parseBeatmap(playableMap.replace('2000:0:0:0:0', 'NaN:0:0:0:0'), 'bad-hold')).toThrow(/hold/);
  });

  it('uses an explicit 9K CircleSize when coordinates contain extra positions', () => {
    const coordinates = Array.from({ length: 10 }, (_, lane) => `${lane * 56},192,${1000 + lane * 10},1,0,0:0:0:0:`).join('\n');
    const map = parseBeatmap(playableMap.replace('CircleSize: 2', 'CircleSize: 9').replace(/0,192,1000,128,0,2000:0:0:0:0\n256,192,2500,1,0,0:0:0:0:/, coordinates), 'nine-key-extra-positions');
    expect(map.keyCount).toBe(9);
    expect(map.notes.every((note) => note.column >= 0 && note.column < 9)).toBe(true);
  });

  it('normalizes harmless fractional hold tails while rejecting invalid ordering', () => {
    const fractional = playableMap.replace('2000:0:0:0:0', ' 2000.4 :0:0:0:0');
    expect(parseBeatmap(fractional, 'fractional-hold').notes[0]?.endTime).toBe(2000);
    expect(() => parseBeatmap(playableMap.replace('2000:0:0:0:0', '1000.4:0:0:0:0'), 'backwards-hold')).toThrow(/hold/);
    expect(() => parseBeatmap(playableMap.replace('2000:0:0:0:0', '10000001.2:0:0:0:0'), 'long-hold')).toThrow(/hold/);
  });

  it('enforces encoded text and extracted package budgets', () => {
    const oversized = 'x'.repeat(MAX_OSU_TEXT_BYTES + 1);
    expect(() => parseBeatmap(oversized, 'large')).toThrow(/size exceeds limit/);
    expect(() => decodeBoundedUtf8(new TextEncoder().encode(oversized))).toThrow(/size limit/);

    const budget = createZipExtractionBudget();
    addExtractedZipBytes(budget, 10, 'a.osu');
    expect(budget.totalBytes).toBe(10);
    expect(() => addExtractedZipBytes(budget, Number.POSITIVE_INFINITY, 'bomb.bin')).toThrow(/entry size/);
  });

  it('parses BeatmapSetID and generates slimcover URL', () => {
    const mapWithSet = playableMap.replace('Version: Hard', 'Version: Hard\nBeatmapSetID: 123456\nBeatmapID: 789012');
    const map = parseBeatmap(mapWithSet, 'map-with-set');
    expect(map.sourceSetId).toBe(123456);
    expect(map.sourceChartId).toBe(789012);
    expect(map.coverUrl).toBe('https://assets.ppy.sh/beatmaps/123456/covers/slimcover@2x.jpg');
  });

  it('ignores unrecognized sections such as Colours between TimingPoints and HitObjects', () => {
    const withColours = playableMap.replace(
      '[HitObjects]',
      '[Colours]\nCombo1 : 45,6,7\nCombo2 : 172,13,13\n\n[HitObjects]',
    );
    const map = parseBeatmap(withColours, 'colours-map');
    expect(map.timingPoints.length).toBe(2);
    expect(map.notes.length).toBe(2);
  });

  it('converts beatmaps between 1K and 10K correctly and rejects out-of-range targets', () => {
    const original4K = parseBeatmap(playableMap.replace('CircleSize: 2', 'CircleSize: 4'), 'test-4k');
    expect(original4K.keyCount).toBe(4);

    // Convert to 1K
    const converted1K = convertBeatmapKeyCount(original4K, 1);
    expect(converted1K.keyCount).toBe(1);
    expect(converted1K.id).toBe('test-4k_converted_1k');
    expect(converted1K.notes.every(n => n.column === 0)).toBe(true);

    // Convert to 7K
    const converted7K = convertBeatmapKeyCount(original4K, 7);
    expect(converted7K.keyCount).toBe(7);
    expect(converted7K.id).toBe('test-4k_converted_7k');
    expect(converted7K.notes.every(n => n.column >= 0 && n.column < 7)).toBe(true);

    // Convert to 10K
    const converted10K = convertBeatmapKeyCount(original4K, 10);
    expect(converted10K.keyCount).toBe(10);
    expect(converted10K.id).toBe('test-4k_converted_10k');
    expect(converted10K.notes.every(n => n.column >= 0 && n.column < 10)).toBe(true);

    // Identity when target === original
    expect(convertBeatmapKeyCount(original4K, 4)).toBe(original4K);

    // Reject out-of-range conversion targets
    expect(() => convertBeatmapKeyCount(original4K, 0)).toThrow(/1K through 10K/);
    expect(() => convertBeatmapKeyCount(original4K, 11)).toThrow(/1K through 10K/);
    expect(() => convertBeatmapKeyCount(original4K, 4.5)).toThrow(/1K through 10K/);
  });
});
