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
import { parseReplayImport } from '../src/utils/replayTransfer';
import { sanitizeHistoryRecord } from '../src/utils/securityLimits';

const mashcoreRecord = {
  id: 'play_1787418027969_3b3dov9hg',
  timestamp: 1787418027969,
  beatmapId: 'osuapi_574811_b1217397_c08b1db68e90151626f359626c2fb607',
  beatmapTitle: 'The Shortest Mashcore Ever',
  beatmapArtist: 'odaxelagnia',
  keyCount: 4,
  score: 4271,
  accuracy: 9.006750241080038,
  maxCombo: 3,
  grade: 'D',
  isFailed: false,
  scoreState: {
    score: 4271,
    combo: 0,
    maxCombo: 3,
    hp: 0,
    marvelousCount: 4,
    perfectCount: 7,
    greatCount: 0,
    goodCount: 0,
    badCount: 0,
    missCount: 100,
    accuracy: 9.006750241080038,
    completed: true,
    failed: false,
    recordId: 'play_1787418027969_3b3dov9hg',
    unstableRate: null,
    hitErrorSampleCount: 0,
    columnJudgements: [
      { column: 0, marvelousCount: 1, perfectCount: 2, greatCount: 0, goodCount: 0, badCount: 0, missCount: 25 },
      { column: 1, marvelousCount: 1, perfectCount: 2, greatCount: 0, goodCount: 0, badCount: 0, missCount: 25 },
    ],
  },
  replayFrames: [
    { time: 0, keysPressed: [false, false, false, false] },
    { time: 120, keysPressed: [true, false, false, false] },
  ],
  mods: [],
  schemaVersion: 3,
  sourceSetId: 574811,
  sourceChartId: 1217397,
};

describe('rmr replay import', () => {
  it('imports the exported mashcore envelope that previously sanitized to null', () => {
    const text = JSON.stringify({
      format: 'rhythmmania-replay-export',
      schemaVersion: 3,
      exportedAt: 1787418030996,
      records: [mashcoreRecord],
    });
    const parsed = parseReplayImport(text, DEFAULT_SETTINGS, []);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].id).toBe(mashcoreRecord.id);
    expect(parsed.records[0].sourceSetId).toBe(574811);
    expect(parsed.records[0].replaySource).toBe('imported');
  });

  it('keeps imported failed runs that local history would drop', () => {
    const failed = {
      ...mashcoreRecord,
      id: 'play_failed_import',
      isFailed: true,
      grade: 'F',
      scoreState: { ...mashcoreRecord.scoreState, failed: true, completed: false, hp: 0 },
    };
    expect(sanitizeHistoryRecord(failed, DEFAULT_SETTINGS)).toBeNull();
    const parsed = parseReplayImport(JSON.stringify({
      format: 'rhythmmania-replay-export',
      schemaVersion: 3,
      exportedAt: Date.now(),
      records: [failed],
    }), DEFAULT_SETTINGS, []);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].isFailed).toBe(true);
  });

  it('imports a BOM-prefixed envelope and still rejects hostile local frames', () => {
    const text = `\uFEFF${JSON.stringify({
      format: 'rhythmmania-replay-export',
      schemaVersion: 3,
      exportedAt: Date.now(),
      records: [mashcoreRecord],
    })}`;
    expect(parseReplayImport(text, DEFAULT_SETTINGS, []).records).toHaveLength(1);
    expect(sanitizeHistoryRecord({
      ...mashcoreRecord,
      replayFrames: [{ time: 10, keysPressed: ['yes', false, false, false] }],
    }, DEFAULT_SETTINGS)).toBeNull();
  });
});
