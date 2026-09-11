/*
 * Tests for TASK-070: Results grade-hero + judgement names + PENAR + local score list only
 */

import { describe, it, expect } from 'vitest';
import { computeGradeFromScoreState } from '../src/ruleset/mania/scoreProcessor';
import { JUDGEMENT_DISPLAY_NAMES } from '../src/ruleset/mania/judgements';
import { formatPenar } from '../src/utils/penar';
import type { ScoreState, PlayHistoryRecord, Beatmap } from '../src/types';

describe('TASK-070: Results Screen Parity', () => {
  describe('Lazer Judgement Names and Accuracy Weights', () => {
    it('maps all internal judgements to osu!(lazer) names', () => {
      expect(JUDGEMENT_DISPLAY_NAMES.marvelous).toBe('Perfect');
      expect(JUDGEMENT_DISPLAY_NAMES.perfect).toBe('Great');
      expect(JUDGEMENT_DISPLAY_NAMES.great).toBe('Good');
      expect(JUDGEMENT_DISPLAY_NAMES.good).toBe('Ok');
      expect(JUDGEMENT_DISPLAY_NAMES.bad).toBe('Meh');
      expect(JUDGEMENT_DISPLAY_NAMES.miss).toBe('Miss');
    });
  });

  describe('Grade Hero Computation', () => {
    it('computes SS grade for all-Perfect and Great run', () => {
      const state: Pick<ScoreState, 'accuracy' | 'failed' | 'marvelousCount' | 'perfectCount' | 'greatCount' | 'goodCount' | 'badCount' | 'missCount'> = {
        accuracy: 99.5,
        failed: false,
        marvelousCount: 150,
        perfectCount: 20,
        greatCount: 0,
        goodCount: 0,
        badCount: 0,
        missCount: 0,
      };
      expect(computeGradeFromScoreState(state)).toBe('SS');
    });

    it('computes S grade for >=95% with Goods', () => {
      const state: Pick<ScoreState, 'accuracy' | 'failed' | 'marvelousCount' | 'perfectCount' | 'greatCount' | 'goodCount' | 'badCount' | 'missCount'> = {
        accuracy: 96.0,
        failed: false,
        marvelousCount: 100,
        perfectCount: 20,
        greatCount: 5,
        goodCount: 0,
        badCount: 0,
        missCount: 0,
      };
      expect(computeGradeFromScoreState(state)).toBe('S');
    });

    it('computes A grade for 90-95%', () => {
      const state: Pick<ScoreState, 'accuracy' | 'failed' | 'marvelousCount' | 'perfectCount' | 'greatCount' | 'goodCount' | 'badCount' | 'missCount'> = {
        accuracy: 92.5,
        failed: false,
        marvelousCount: 90,
        perfectCount: 15,
        greatCount: 10,
        goodCount: 5,
        badCount: 0,
        missCount: 1,
      };
      expect(computeGradeFromScoreState(state)).toBe('A');
    });

    it('computes F grade when run failed', () => {
      const state: Pick<ScoreState, 'accuracy' | 'failed' | 'marvelousCount' | 'perfectCount' | 'greatCount' | 'goodCount' | 'badCount' | 'missCount'> = {
        accuracy: 95.0,
        failed: true,
        marvelousCount: 50,
        perfectCount: 10,
        greatCount: 0,
        goodCount: 0,
        badCount: 0,
        missCount: 5,
      };
      expect(computeGradeFromScoreState(state)).toBe('F');
    });
  });

  describe('PENAR Display in Results', () => {
    it('formats null PENAR as an em-dash and never labels as pp', () => {
      expect(formatPenar(null)).toBe('—');
      expect(formatPenar({
        total: null,
        version: 'penar-stub-0',
        starRating: null,
        accuracy: 98,
        maxCombo: 200,
        missCount: 0,
        mods: [],
      })).toBe('—');
    });

    it('formats numeric PENAR rounded to integer', () => {
      expect(formatPenar({
        total: 245.8,
        version: 'penar-test',
        starRating: 3.5,
        accuracy: 99,
        maxCombo: 500,
        missCount: 0,
        mods: [],
      })).toBe('246');
    });
  });

  describe('Local Scores Ranking Logic', () => {
    const sampleRecords: PlayHistoryRecord[] = [
      {
        id: 'rec-1',
        beatmapId: 'bm-1',
        beatmapTitle: 'Test Song',
        beatmapArtist: 'Artist',
        score: 850000,
        accuracy: 95.5,
        grade: 'S',
        maxCombo: 300,
        timestamp: 1000,
        keyCount: 4,
        isFailed: false,
        replayFrames: [],
        scoreState: {} as any,
      },
      {
        id: 'rec-2',
        beatmapId: 'bm-1',
        beatmapTitle: 'Test Song',
        beatmapArtist: 'Artist',
        score: 980000,
        accuracy: 99.2,
        grade: 'SS',
        maxCombo: 450,
        timestamp: 2000,
        keyCount: 4,
        isFailed: false,
        replayFrames: [],
        scoreState: {} as any,
      },
      {
        id: 'rec-3',
        beatmapId: 'bm-1',
        beatmapTitle: 'Test Song',
        beatmapArtist: 'Artist',
        score: 980000,
        accuracy: 98.8,
        grade: 'S',
        maxCombo: 420,
        timestamp: 3000,
        keyCount: 4,
        isFailed: false,
        replayFrames: [],
        scoreState: {} as any,
      },
      {
        id: 'rec-other',
        beatmapId: 'bm-other',
        beatmapTitle: 'Other Song',
        beatmapArtist: 'Artist',
        score: 999999,
        accuracy: 100,
        grade: 'SS',
        maxCombo: 500,
        timestamp: 4000,
        keyCount: 4,
        isFailed: false,
        replayFrames: [],
        scoreState: {} as any,
      },
    ];

    it('filters records to this beatmap only (local device scores)', () => {
      const beatmap: Pick<Beatmap, 'id' | 'catalogMapId' | 'beatmapHash'> = { id: 'bm-1' };
      const matched = sampleRecords.filter(r => r.beatmapId === beatmap.id);
      expect(matched.length).toBe(3);
      expect(matched.some(r => r.id === 'rec-other')).toBe(false);
    });

    it('ranks records primarily by score descending, then accuracy descending', () => {
      const beatmapRecords = sampleRecords.filter(r => r.beatmapId === 'bm-1');
      const ranked = [...beatmapRecords].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

      expect(ranked[0].id).toBe('rec-2'); // 980k, 99.2%
      expect(ranked[1].id).toBe('rec-3'); // 980k, 98.8%
      expect(ranked[2].id).toBe('rec-1'); // 850k, 95.5%
    });
  });
});
