import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';
import { sanitizeHistoryRecord } from '../src/utils/securityLimits';
import { createPlayHistoryRecord } from '../src/utils/replayManager';
import type { Beatmap } from '../src/types';

function makeBeatmap(id: string): Beatmap {
  return {
    id,
    title: 'Test Title',
    artist: 'Test Artist',
    creator: 'mapper',
    difficulty: 'Insane',
    keyCount: 4,
    notes: [{ time: 1000, column: 0, type: 'tap' } as any],
    duration: 120,
    bpm: 150,
    mode: 3,
  } as unknown as Beatmap;
}

function makeScore(failed = false, completed = true) {
  return {
    score: 100000,
    combo: 10,
    maxCombo: 50,
    hp: 80,
    perfectCount: 10,
    marvelousCount: 5,
    greatCount: 2,
    goodCount: 1,
    badCount: 0,
    missCount: 0,
    accuracy: 98.5,
    completed,
    failed,
    columnJudgements: [],
  } as any;
}

describe('repro disappearing', () => {
  it('round-trips a normal completed play', () => {
    const rec = createPlayHistoryRecord({
      id: 'play_1',
      timestamp: Date.now(),
      beatmap: makeBeatmap('map1'),
      scoreState: makeScore(false, true),
      replayFrames: [{ time: 0, keysPressed: [false, false, false, false] }, { time: 100, keysPressed: [true, false, false, false] }],
      recordedSettings: DEFAULT_SETTINGS as any,
      mods: [],
    });
    const json = JSON.parse(JSON.stringify(rec));
    const out = sanitizeHistoryRecord(json, DEFAULT_SETTINGS, [makeBeatmap('map1')]);
    console.log('normal play sanitize:', out ? 'kept' : 'DROPPED');
    expect(out).not.toBeNull();
  });

  it('checks quit-out (not completed, not failed)', () => {
    const rec = createPlayHistoryRecord({
      id: 'play_quit',
      timestamp: Date.now(),
      beatmap: makeBeatmap('map1'),
      scoreState: makeScore(false, false),
      replayFrames: [{ time: 0, keysPressed: [false, false, false, false] }],
      recordedSettings: DEFAULT_SETTINGS as any,
      mods: [],
    });
    const json = JSON.parse(JSON.stringify(rec));
    const out = sanitizeHistoryRecord(json, DEFAULT_SETTINGS, [makeBeatmap('map1')]);
    console.log('quit-out sanitize:', out ? 'kept' : 'DROPPED', 'completed=', (json.scoreState as any).completed, 'failed=', (json.scoreState as any).failed);
    // App only saves if (completed || failed), so quit-outs are never saved, but if they were, would they survive load?
    expect(out).not.toBeNull();
  });

  it('checks failed without NF', () => {
    const rec = createPlayHistoryRecord({
      id: 'play_failed',
      timestamp: Date.now(),
      beatmap: makeBeatmap('map1'),
      scoreState: makeScore(true, false),
      replayFrames: [{ time: 0, keysPressed: [false, false, false, false] }],
      recordedSettings: DEFAULT_SETTINGS as any,
      mods: [],
    });
    const json = JSON.parse(JSON.stringify(rec));
    const out = sanitizeHistoryRecord(json, DEFAULT_SETTINGS, [makeBeatmap('map1')]);
    console.log('failed non-NF sanitize:', out ? 'kept' : 'DROPPED');
    // This is currently DROPPED -> permanent deletion on load!
  });

  it('checks legacy record without scoreState', () => {
    const legacy: any = {
      id: 'legacy1',
      timestamp: 1,
      beatmapId: 'map',
      beatmapTitle: 'Title',
      beatmapArtist: 'Artist',
      keyCount: 4,
      score: 100,
      accuracy: 99,
      maxCombo: 10,
      grade: 'A',
      isFailed: false,
      replayFrames: [{ time: 0, keysPressed: [false, false, false, false] }],
      mods: [],
    };
    const out = sanitizeHistoryRecord(legacy, DEFAULT_SETTINGS, []);
    console.log('legacy without scoreState:', out ? 'kept' : 'DROPPED');
  });

  it('checks unicode title', () => {
    const rec = createPlayHistoryRecord({
      id: 'play_uni',
      timestamp: Date.now(),
      beatmap: { ...makeBeatmap('map1'), title: '初音ミクの消失', artist: 'cosMo@暴走P' } as any,
      scoreState: makeScore(false, true),
      replayFrames: [{ time: 0, keysPressed: [false, false, false, false] }],
      recordedSettings: DEFAULT_SETTINGS as any,
      mods: [],
    });
    console.log('unicode stored title:', JSON.stringify(rec.beatmapTitle));
    const json = JSON.parse(JSON.stringify(rec));
    const out = sanitizeHistoryRecord(json, DEFAULT_SETTINGS, []);
    console.log('unicode after sanitize title:', JSON.stringify(out?.beatmapTitle), 'kept:', !!out);
  });
});
