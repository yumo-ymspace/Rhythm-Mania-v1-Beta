/*
 * Tests for Classic (CL) and Difficulty Adjust (DA) mods (TASK-036)
 */

import { describe, expect, it } from 'vitest';
import {
  computeStableHitWindow,
  getJudgementWindows,
  isClassicMod,
  MANIA_STABLE_DIFFICULTY_RANGES,
} from '../src/ruleset/mania/hitWindows';
import {
  applyBeatmapMods,
  applyDifficultyAdjustMod,
  isDifficultyAdjustMod,
  parseDifficultyAdjustModString,
} from '../src/ruleset/mania/beatmapMods';
import { sanitizeGameplayMods, MOD_SCORE_MULTIPLIERS } from '../src/utils/modifiers';
import { computeModMultiplier } from '../src/ruleset/mania/scoreProcessor';
import { simulateManiaReplay } from '../src/ruleset/mania/replaySimulator';
import type { Beatmap, HitObject, JudgementType } from '../src/types';

describe('TASK-036: Classic (CL) & Difficulty Adjust (DA) mods', () => {
  describe('Classic (CL) hit windows & lazer speed compensation', () => {
    const getWindowsMap = (
      od: number,
      diffMultiplier: number = 1,
      speedMultiplier: number = 1,
      isClassic: boolean = true
    ): Record<JudgementType, number> => {
      const windows = getJudgementWindows(od, diffMultiplier, speedMultiplier, isClassic);
      return windows.reduce<Record<JudgementType, number>>((acc, w) => {
        acc[w.type] = w.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);
    };

    it('matches exact stable windows at OD 0 (fixed 16.5ms marvelous, 64.5ms perfect)', () => {
      const w = getWindowsMap(0);
      expect(w.marvelous).toBe(16.5); // fixed 16 -> floor(16) + 0.5
      expect(w.perfect).toBe(64.5);   // 64 - 0 = 64 -> 64.5
      expect(w.great).toBe(97.5);     // 97 - 0 = 97 -> 97.5
      expect(w.good).toBe(127.5);     // 127 - 0 = 127 -> 127.5
      expect(w.bad).toBe(151.5);      // 151 - 0 = 151 -> 151.5
      expect(w.miss).toBe(188.5);     // 188 - 0 = 188 -> 188.5
    });

    it('matches exact stable windows at OD 5', () => {
      const w = getWindowsMap(5);
      expect(w.marvelous).toBe(16.5); // fixed 16 ms (unlike lazer 19.5 ms)
      expect(w.perfect).toBe(49.5);   // 64 - 15 = 49 -> 49.5
      expect(w.great).toBe(82.5);     // 97 - 15 = 82 -> 82.5
      expect(w.good).toBe(112.5);     // 127 - 15 = 112 -> 112.5
      expect(w.bad).toBe(136.5);      // 151 - 15 = 136 -> 136.5
      expect(w.miss).toBe(173.5);     // 188 - 15 = 173 -> 173.5
    });

    it('matches exact stable windows at OD 8', () => {
      const w = getWindowsMap(8);
      expect(w.marvelous).toBe(16.5); // fixed 16 ms
      expect(w.perfect).toBe(40.5);   // 64 - 24 = 40 -> 40.5
      expect(w.great).toBe(73.5);     // 97 - 24 = 73 -> 73.5
      expect(w.good).toBe(103.5);     // 127 - 24 = 103 -> 103.5
      expect(w.bad).toBe(127.5);      // 151 - 24 = 127 -> 127.5
      expect(w.miss).toBe(164.5);     // 188 - 24 = 164 -> 164.5
    });

    it('matches exact stable windows at OD 10', () => {
      const w = getWindowsMap(10);
      expect(w.marvelous).toBe(16.5); // fixed 16 ms (unlike lazer 13.5 ms)
      expect(w.perfect).toBe(34.5);   // 64 - 30 = 34 -> 34.5
      expect(w.great).toBe(67.5);     // 97 - 30 = 67 -> 67.5
      expect(w.good).toBe(97.5);      // 127 - 30 = 97 -> 97.5
      expect(w.bad).toBe(121.5);      // 151 - 30 = 121 -> 121.5
      expect(w.miss).toBe(158.5);     // 188 - 30 = 158 -> 158.5
    });

    it('scales windows with DT under Classic (lazer totalMultiplier = speed / difficulty)', () => {
      // ppy/osu ManiaHitWindows.updateWindows: the Classic branch still uses
      // totalMultiplier, so DT 1.5x widens the ms windows to keep them
      // independent of track speed.
      const dtClassic = getWindowsMap(5, 1, 1.5, true);

      expect(dtClassic.marvelous).toBe(24.5); // floor(16 * 1.5) + 0.5
      expect(dtClassic.perfect).toBe(73.5); // floor(49 * 1.5) + 0.5
      expect(dtClassic.great).toBe(123.5); // floor(82 * 1.5) + 0.5
      expect(dtClassic.good).toBe(168.5); // floor(112 * 1.5) + 0.5
      expect(dtClassic.bad).toBe(204.5); // floor(136 * 1.5) + 0.5
      expect(dtClassic.miss).toBe(259.5); // floor(173 * 1.5) + 0.5
    });

    it('scales windows with HT under Classic (lazer totalMultiplier = speed / difficulty)', () => {
      const htClassic = getWindowsMap(5, 1, 0.75, true);

      expect(htClassic.marvelous).toBe(12.5); // floor(16 * 0.75) + 0.5
      expect(htClassic.perfect).toBe(36.5); // floor(49 * 0.75) + 0.5
      expect(htClassic.great).toBe(61.5); // floor(82 * 0.75) + 0.5
      expect(htClassic.good).toBe(84.5); // floor(112 * 0.75) + 0.5
      expect(htClassic.bad).toBe(102.5); // floor(136 * 0.75) + 0.5
      expect(htClassic.miss).toBe(129.5); // floor(173 * 0.75) + 0.5
    });

    it('scales stable windows with HR + DT via totalMultiplier (speed / difficulty)', () => {
      // totalMultiplier = 1.5 / 1.4 ≈ 1.0714
      const hrClassic = getWindowsMap(5, 1.4, 1.5, true);
      expect(hrClassic.marvelous).toBe(17.5); // floor(16 * 1.5 / 1.4) + 0.5
      expect(hrClassic.perfect).toBe(52.5); // floor(49 * 1.5 / 1.4) + 0.5
      expect(hrClassic.great).toBe(87.5); // floor(82 * 1.5 / 1.4) + 0.5
      expect(hrClassic.good).toBe(120.5); // floor(112 * 1.5 / 1.4) + 0.5
      expect(hrClassic.bad).toBe(145.5); // floor(136 * 1.5 / 1.4) + 0.5
      expect(hrClassic.miss).toBe(185.5); // floor(173 * 1.5 / 1.4) + 0.5
    });

    it('detects Classic mod using isClassicMod helper', () => {
      expect(isClassicMod(['CL'])).toBe(true);
      expect(isClassicMod(['CLASSIC'])).toBe(true);
      expect(isClassicMod(['cl', 'dt'])).toBe(true);
      expect(isClassicMod(['DT'])).toBe(false);
      expect(isClassicMod([])).toBe(false);
      expect(isClassicMod(null)).toBe(false);
      expect(isClassicMod(undefined)).toBe(false);
    });
  });

  describe('Difficulty Adjust (DA) mechanics', () => {
    const mockMap: Beatmap = {
      id: 'test_map_001',
      title: 'DA Test Map',
      artist: 'Artist',
      creator: 'Mapper',
      difficulty: 'Normal',
      keyCount: 4,
      overallDifficulty: 8,
      hpDrainRate: 5,
      bpm: 120,
      duration: 60,
      sliderMultiplier: 1.4,
      timingPoints: [],
      notes: [],
    };

    it('applies explicit OD and HP overrides via applyDifficultyAdjustMod', () => {
      const adjusted = applyDifficultyAdjustMod(mockMap, {
        overallDifficulty: 9.5,
        hpDrainRate: 7.2,
      });

      expect(adjusted.overallDifficulty).toBe(9.5);
      expect(adjusted.hpDrainRate).toBe(7.2);
      expect(adjusted.id).toBe('test_map_001_da');
    });

    it('clamps adjusted OD and HP to 0..10 bounds', () => {
      const clampedHigh = applyDifficultyAdjustMod(mockMap, {
        overallDifficulty: 15,
        hpDrainRate: 20,
      });
      expect(clampedHigh.overallDifficulty).toBe(10);
      expect(clampedHigh.hpDrainRate).toBe(10);

      const clampedLow = applyDifficultyAdjustMod(mockMap, {
        overallDifficulty: -5,
        hpDrainRate: -1,
      });
      expect(clampedLow.overallDifficulty).toBe(0);
      expect(clampedLow.hpDrainRate).toBe(0);
    });

    it('preserves existing values when options are omitted', () => {
      const untouched = applyDifficultyAdjustMod(mockMap);
      expect(untouched.overallDifficulty).toBe(8);
      expect(untouched.hpDrainRate).toBe(5);
    });

    it('parses inline DA parameter strings', () => {
      expect(parseDifficultyAdjustModString('DA:OD=9.5,HP=6')).toEqual({
        overallDifficulty: 9.5,
        hpDrainRate: 6,
      });
      expect(parseDifficultyAdjustModString('DA_OD=7.5')).toEqual({
        overallDifficulty: 7.5,
      });
      expect(parseDifficultyAdjustModString('DA:HP=3')).toEqual({
        hpDrainRate: 3,
      });
      expect(parseDifficultyAdjustModString('DA')).toBeNull();
      expect(parseDifficultyAdjustModString('HR')).toBeNull();
    });

    it('integrates DA into master applyBeatmapMods pipeline with options', () => {
      const transformed = applyBeatmapMods(mockMap, ['DA'], {
        difficultyAdjust: { overallDifficulty: 4, hpDrainRate: 2 },
      });
      expect(transformed.overallDifficulty).toBe(4);
      expect(transformed.hpDrainRate).toBe(2);
      expect(transformed.id).toBe('test_map_001_da');
    });

    it('integrates DA into applyBeatmapMods with inline parameters', () => {
      const transformed = applyBeatmapMods(mockMap, ['DA:OD=6.5,HP=8.5']);
      expect(transformed.overallDifficulty).toBe(6.5);
      expect(transformed.hpDrainRate).toBe(8.5);
    });

    it('detects DA mod using isDifficultyAdjustMod', () => {
      expect(isDifficultyAdjustMod(['DA'])).toBe(true);
      expect(isDifficultyAdjustMod(['DIFFICULTYADJUST'])).toBe(true);
      expect(isDifficultyAdjustMod(['DA:OD=9'])).toBe(true);
      expect(isDifficultyAdjustMod(['DA_OD=7'])).toBe(true);
      expect(isDifficultyAdjustMod(['HR', 'HD'])).toBe(false);
      expect(isDifficultyAdjustMod([])).toBe(false);
      expect(isDifficultyAdjustMod(null)).toBe(false);
    });
  });

  describe('Mod sanitization & exclusivity for CL and DA', () => {
    it('normalizes CLASSIC to CL and DIFFICULTYADJUST to DA', () => {
      expect(sanitizeGameplayMods(['classic'])).toEqual(['CL']);
      expect(sanitizeGameplayMods(['DIFFICULTYADJUST'])).toEqual(['DA']);
      expect(sanitizeGameplayMods(['difficultyadjust:OD=9'])).toEqual(['DA:OD=9']);
    });

    it('enforces DA vs EZ exclusivity', () => {
      expect(sanitizeGameplayMods(['DA', 'EZ'])).toEqual(['DA']);
      expect(sanitizeGameplayMods(['EZ', 'DA'])).toEqual(['EZ']);
      expect(sanitizeGameplayMods(['DA:OD=9', 'EZ'])).toEqual(['DA:OD=9']);
      expect(sanitizeGameplayMods(['EZ', 'DA:OD=9'])).toEqual(['EZ']);
    });

    it('enforces DA vs HR exclusivity', () => {
      expect(sanitizeGameplayMods(['DA', 'HR'])).toEqual(['DA']);
      expect(sanitizeGameplayMods(['HR', 'DA'])).toEqual(['HR']);
      expect(sanitizeGameplayMods(['DA:OD=9', 'HR'])).toEqual(['DA:OD=9']);
      expect(sanitizeGameplayMods(['HR', 'DA:OD=9'])).toEqual(['HR']);
    });

    it('allows combining Classic with DT, HR, HD, MR, etc.', () => {
      expect(sanitizeGameplayMods(['CL', 'DT', 'HR'])).toEqual(['CL', 'DT', 'HR']);
      expect(sanitizeGameplayMods(['CL', 'HD', 'MR'])).toEqual(['CL', 'HD', 'MR']);
    });

    it('deduplicates multiple DA entries', () => {
      expect(sanitizeGameplayMods(['DA', 'DA:OD=9'])).toEqual(['DA']);
      expect(sanitizeGameplayMods(['DA:OD=9', 'DA'])).toEqual(['DA:OD=9']);
    });
  });

  describe('Score multipliers for CL and DA', () => {
    it('has 1.00x multiplier for CL and DA', () => {
      expect(MOD_SCORE_MULTIPLIERS.CL).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.Classic).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.DA).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.DifficultyAdjust).toBe(1.0);
    });

    it('computes 1.00x multiplier in computeModMultiplier', () => {
      expect(computeModMultiplier(['CL'])).toBe(1.0);
      expect(computeModMultiplier(['DA'])).toBe(1.0);
      expect(computeModMultiplier(['DA:OD=9,HP=7'])).toBe(1.0);
      expect(computeModMultiplier(['CL', 'DA'])).toBe(1.0);
      expect(computeModMultiplier(['CL', 'DT', 'HD'])).toBe(1.0);
    });
  });

  describe('Replay simulator integration with Classic and DA', () => {
    const createNote = (id: string, time: number, column: number): HitObject => ({
      id,
      time,
      column,
      type: 'normal',
      isHit: false,
      isReleased: false,
      isMissed: false,
      isHoldFailed: false,
    });

    const mockBeatmap: Beatmap = {
      id: 'replay_cl_da_test',
      title: 'Simulation Test',
      artist: 'Artist',
      creator: 'Mapper',
      difficulty: 'Normal',
      keyCount: 4,
      overallDifficulty: 8,
      hpDrainRate: 5,
      bpm: 120,
      duration: 30,
      sliderMultiplier: 1.4,
      timingPoints: [],
      notes: [
        createNote('n1', 1000, 0),
        createNote('n2', 1500, 1),
      ],
    };

    it('simulates play with Classic mod and verifies stable windows apply', () => {
      // At OD 8:
      // Lazer default marvelous is 16.5 ms, Classic marvelous is 16.5 ms
      // At OD 5:
      // Lazer default marvelous is 19.5 ms, Classic marvelous is 16.5 ms!
      // Hit n1 at +18 ms offset:
      // With Lazer OD5 (19.5 ms): Marvelous
      // With Classic OD5 (16.5 ms): Perfect (Great), NOT Marvelous!
      const od5Map: Beatmap = {
        ...mockBeatmap,
        overallDifficulty: 5,
        notes: [createNote('n1', 1000, 0)],
      };

      const frames = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1018, keysPressed: [true, false, false, false] }, // hit at +18ms
        { time: 1050, keysPressed: [false, false, false, false] },
      ];

      // Without Classic (lazer OD5 window is 19.5 ms):
      const lazerResult = simulateManiaReplay({
        beatmap: od5Map,
        replayFrames: frames,
        selectedMods: [],
      });
      expect(lazerResult.scoreState.marvelousCount).toBe(1);
      expect(lazerResult.scoreState.perfectCount).toBe(0);

      // With Classic (stable OD5 window is 16.5 ms):
      // +18ms falls outside 16.5ms marvelous, into 49.5ms perfect (300)!
      const classicResult = simulateManiaReplay({
        beatmap: od5Map,
        replayFrames: frames,
        selectedMods: ['CL'],
      });
      expect(classicResult.scoreState.marvelousCount).toBe(0);
      expect(classicResult.scoreState.perfectCount).toBe(1);
    });

    it('simulates play with DA mod adjusting OD', () => {
      // Map OD 5. DA overrides OD to 10 (marvelous 13.5 ms in lazer).
      // Hit at +15ms:
      // Without DA (OD 5, window 19.5 ms) -> Marvelous.
      // With DA:OD=10 (OD 10, window 13.5 ms) -> +15ms is outside marvelous, into perfect!
      const od5Map: Beatmap = {
        ...mockBeatmap,
        overallDifficulty: 5,
        notes: [createNote('n1', 1000, 0)],
      };

      const frames = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1015, keysPressed: [true, false, false, false] },
        { time: 1050, keysPressed: [false, false, false, false] },
      ];

      const daResult = simulateManiaReplay({
        beatmap: od5Map,
        replayFrames: frames,
        selectedMods: ['DA:OD=10'],
      });
      expect(daResult.scoreState.marvelousCount).toBe(0);
      expect(daResult.scoreState.perfectCount).toBe(1);
    });
  });
});
