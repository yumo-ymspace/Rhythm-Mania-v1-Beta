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
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';
import {
  isSafeAssetUrl,
  sanitizeCssUrl,
  sanitizeHistoryRecord,
  sanitizeSettings,
} from '../src/utils/securityLimits';
import { determineCatalogIdentity, hasCatalogIdentity } from '../src/utils/replayManager';

const scoreState = {
  score: 100,
  combo: 1,
  maxCombo: 1,
  hp: 100,
  perfectCount: 1,
  marvelousCount: 0,
  greatCount: 0,
  goodCount: 0,
  badCount: 0,
  missCount: 0,
  accuracy: 100,
  completed: true,
  failed: false,
  columnJudgements: [],
};

describe('settings, history, and URL boundaries', () => {
  it('recognizes catalog charts for an empty online leaderboard before activation', () => {
    const catalogMap = {
      catalogSetId: 'osuapi_123',
      catalogMapId: 'osuapi_123_b456_checksum',
      chartRevisionId: 'osuapi_123_b456_checksum',
    } as any;
    expect(hasCatalogIdentity(catalogMap)).toBe(true);
    expect(hasCatalogIdentity({} as any)).toBe(false);
  });

  it('clamps hostile settings and locks Babylon to downward scroll', () => {
    const clean = sanitizeSettings({
      scrollSpeed: 999,
      renderEngine: 'babylon',
      upsurfaceNoteMode: true,
      bindings: { 4: ['d', 'f', 'j', 'k'] },
      customSkinColors: ['javascript:alert(1)'],
    }, DEFAULT_SETTINGS);
    expect(clean.scrollSpeed).toBe(80);
    expect(clean.upsurfaceNoteMode).toBe(false);
    expect(clean.customSkinColors?.[0]).toBe('#ffffff');
    expect(clean.bindings[4]).toEqual(['d', 'f', 'j', 'k']);
  });

  it('preserves 9K settings and replay widths', () => {
    const clean = sanitizeSettings({ keyMode: 9, bindings: { 9: ['a', 's', 'd', 'f', ' ', 'j', 'k', 'l', ';'] }, receptorColorsByKeyCount: { 9: Array(9).fill('#00b0ff') }, selectedMods: ['K9', 'K4'] }, DEFAULT_SETTINGS);
    expect(clean.keyMode).toBe(9);
    expect(clean.bindings[9]).toHaveLength(9);
    expect(clean.receptorColorsByKeyCount?.[9]).toHaveLength(9);
    expect(clean.selectedMods).toEqual(['K9']);
    const record = sanitizeHistoryRecord({ id: 'nine', timestamp: 1, beatmapId: 'map', beatmapTitle: 'Title', beatmapArtist: 'Artist', keyCount: 9, score: 0, accuracy: 0, maxCombo: 0, grade: 'F', isFailed: false, scoreState: { ...scoreState, columnJudgements: Array.from({ length: 9 }, (_, column) => ({ column })) }, replayFrames: [{ time: 0, keysPressed: Array(9).fill(false) }, { time: 10, keysPressed: [false, false, false, false, false, false, false, false, true] }] }, DEFAULT_SETTINGS);
    expect(record?.keyCount).toBe(9);
    expect(record?.replayFrames[1]?.keysPressed[8]).toBe(true);
  });

  it('normalizes persisted modifiers without duplicate scoring or conflicts', () => {
    const clean = sanitizeSettings({ selectedMods: ['nf', 'NF', 'EZ', 'HR', 'DT', 'HT', 'K4', 'K5', 'UNKNOWN'] }, DEFAULT_SETTINGS);
    expect(clean.selectedMods).toEqual(['NF', 'EZ', 'DT', 'K4']);
  });

  it('keeps an optional local display name and strips hostile characters', () => {
    const named = sanitizeSettings({ localDisplayName: '  Local_Player-1  ' }, DEFAULT_SETTINGS);
    expect(named.localDisplayName).toBe('Local_Player-1');
    const hostile = sanitizeSettings({ localDisplayName: '<script>alert(1)</script>' }, DEFAULT_SETTINGS);
    expect(hostile.localDisplayName).toBe('scriptalert1script');
    const empty = sanitizeSettings({ localDisplayName: '   ' }, DEFAULT_SETTINGS);
    expect(empty.localDisplayName).toBe('');
    const tooLong = sanitizeSettings({ localDisplayName: 'A'.repeat(80) }, DEFAULT_SETTINGS);
    expect(tooLong.localDisplayName).toHaveLength(32);
  });

  it('preserves literal space center-lane bindings', () => {
    const clean = sanitizeSettings({
      bindings: {
        5: ['d', 'f', ' ', 'j', 'k'],
      },
    }, DEFAULT_SETTINGS);

    expect(clean.bindings[5]).toEqual(['d', 'f', ' ', 'j', 'k']);
  });

  it('preserves canonical history identity and rejects non-boolean replay keys', () => {
    const raw = {
      id: 'record-1', timestamp: 1, beatmapId: 'map', beatmapTitle: 'Title', beatmapArtist: 'Artist',
      keyCount: 2, score: 100, accuracy: 100, maxCombo: 1, grade: 'S', isFailed: false,
      chartRevisionId: 'chart-1', checksum: 'abc', checksumAlgorithm: 'md5',
      scoreState: { ...scoreState, columnJudgements: [{ column: 0 }, { column: 1 }] },
      replayFrames: [
        { time: 20, keysPressed: [false, false] },
        { time: 10, keysPressed: ['yes', false] },
      ],
    };
    expect(sanitizeHistoryRecord(raw, DEFAULT_SETTINGS)).toBeNull();

    const valid = sanitizeHistoryRecord({
      ...raw,
      replayFrames: [
        { time: 20, keysPressed: [false, false] },
        { time: 10, keysPressed: [true, false] },
        { time: 10, keysPressed: [false, true] },
      ],
    }, DEFAULT_SETTINGS);
    expect(valid).not.toBeNull();
    expect(valid?.chartRevisionId).toBe('chart-1');
    expect(valid?.checksumAlgorithm).toBe('md5');
    expect(valid?.replayFrames).toEqual([
      { time: 10, keysPressed: [false, true] },
      { time: 20, keysPressed: [false, false] },
    ]);
  });

  it('preserves hold-rule metadata and assigns legacy result record ids', () => {
    const record = sanitizeHistoryRecord({
      id: 'record-2', timestamp: 1, beatmapId: 'map', beatmapTitle: 'Title', beatmapArtist: 'Artist',
      keyCount: 2, score: 100, accuracy: 100, maxCombo: 1, grade: 'S', isFailed: false,
      holdRulesVersion: 2, holdTickIntervalMs: 25,
      scoreState: { ...scoreState, columnJudgements: [{ column: 0 }, { column: 1 }] },
      replayFrames: [{ time: 0, keysPressed: [false, false] }],
    }, DEFAULT_SETTINGS);
    expect(record?.holdRulesVersion).toBe(2);
    expect(record?.holdTickIntervalMs).toBe(25);
    expect(record?.scoreState.recordId).toBe('record-2');
  });

  it('does not claim converted K-mod charts are uploadable server charts', () => {
    const map = { isServerMap: true, catalogSetId: 'osuapi_1', catalogMapId: 'chart', chartRevisionId: 'chart' } as any;
    expect(determineCatalogIdentity(map, 'chart_converted_5k').isServerCatalogMap).toBe(false);
  });

  it('preserves sourceSetId and falls back to osuapi_{sourceSetId} for catalogSetId', () => {
    const record = sanitizeHistoryRecord({
      id: 'record-3', timestamp: 1, beatmapId: 'map', beatmapTitle: 'Title', beatmapArtist: 'Artist',
      keyCount: 4, score: 100, accuracy: 100, maxCombo: 1, grade: 'S', isFailed: false,
      sourceSetId: 12345,
      scoreState: { ...scoreState, columnJudgements: [{ column: 0 }, { column: 1 }, { column: 2 }, { column: 3 }] },
      replayFrames: [{ time: 0, keysPressed: [false, false, false, false] }],
    }, DEFAULT_SETTINGS);
    expect(record?.sourceSetId).toBe(12345);
    expect(record?.catalogSetId).toBe('osuapi_12345');
  });

  it('clamps noteSizeMultiplier and receptorSizeMultiplier to 0.60-1.00', () => {
    const clean = sanitizeSettings({
      noteSizeMultiplier: 0.1,
      receptorSizeMultiplier: 2.5,
    }, DEFAULT_SETTINGS);
    expect(clean.noteSizeMultiplier).toBe(0.60);
    expect(clean.receptorSizeMultiplier).toBe(1.00);
  });

  it('allows local/blob assets only and rejects executable URL schemes', () => {
    expect(isSafeAssetUrl('/backgrounds/Ferineon.webp')).toBe(true);
    expect(isSafeAssetUrl('blob:https://rhythm-mania.com/id')).toBe(true);
    expect(isSafeAssetUrl('//evil.example/map.mp3')).toBe(false);
    expect(isSafeAssetUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeAssetUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeAssetUrl('https://evil.example/map.mp3')).toBe(false);
    expect(isSafeAssetUrl('/\\evil.example/map.mp3')).toBe(false);
    expect(sanitizeCssUrl('javascript:alert(1)')).toBe('/backgrounds/Ferineon.webp');
  });
});
