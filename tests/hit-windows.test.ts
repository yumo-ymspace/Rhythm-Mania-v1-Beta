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
  computeDifficultyRange,
  computeLazerHitWindow,
  getDifficultyMultiplier,
  getJudgementWindows,
  getSpeedMultiplier,
  MANIA_DIFFICULTY_RANGES,
} from '../src/ruleset/mania/hitWindows';
import type { JudgementType } from '../src/types';

describe('osu!(lazer) mania hit window fixtures (TASK-011)', () => {
  describe('computeDifficultyRange interpolation', () => {
    it('matches boundary values at OD 0, OD 5, and OD 10', () => {
      expect(computeDifficultyRange(0, 22.4, 19.4, 13.9)).toBeCloseTo(22.4);
      expect(computeDifficultyRange(5, 22.4, 19.4, 13.9)).toBeCloseTo(19.4);
      expect(computeDifficultyRange(10, 22.4, 19.4, 13.9)).toBeCloseTo(13.9);
    });

    it('interpolates linearly for intermediate ODs', () => {
      // OD 8 is 60% of the way from OD 5 (19.4) to OD 10 (13.9): 19.4 + (13.9 - 19.4) * 0.6 = 16.1
      expect(computeDifficultyRange(8, 22.4, 19.4, 13.9)).toBeCloseTo(16.1);
      // OD 2.5 is 50% of the way from OD 0 (22.4) to OD 5 (19.4): 22.4 + (19.4 - 22.4) * 0.5 = 20.9
      expect(computeDifficultyRange(2.5, 22.4, 19.4, 13.9)).toBeCloseTo(20.9);
    });
  });

  describe('Standard hit windows at OD 0, 5, 8, 10 matching floor(range)+0.5', () => {
    const getWindowsMap = (od: number, diffMultiplier: number = 1): Record<JudgementType, number> => {
      const windows = getJudgementWindows(od, diffMultiplier);
      return windows.reduce<Record<JudgementType, number>>((acc, w) => {
        acc[w.type] = w.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);
    };

    it('matches exact lazer windows at OD 0', () => {
      const w = getWindowsMap(0);
      expect(w.marvelous).toBe(22.5); // floor(22.4) + 0.5
      expect(w.perfect).toBe(64.5);   // floor(64.0) + 0.5
      expect(w.great).toBe(97.5);     // floor(97.0) + 0.5
      expect(w.good).toBe(127.5);     // floor(127.0) + 0.5
      expect(w.bad).toBe(151.5);      // floor(151.0) + 0.5
      expect(w.miss).toBe(188.5);     // floor(188.0) + 0.5
    });

    it('matches exact lazer windows at OD 5', () => {
      const w = getWindowsMap(5);
      expect(w.marvelous).toBe(19.5); // floor(19.4) + 0.5
      expect(w.perfect).toBe(49.5);   // floor(49.0) + 0.5
      expect(w.great).toBe(82.5);     // floor(82.0) + 0.5
      expect(w.good).toBe(112.5);     // floor(112.0) + 0.5
      expect(w.bad).toBe(136.5);      // floor(136.0) + 0.5
      expect(w.miss).toBe(173.5);     // floor(173.0) + 0.5
    });

    it('matches exact lazer windows at OD 8', () => {
      const w = getWindowsMap(8);
      // OD 8 calculation: mid + (max - mid) * 0.6
      // Marvelous: 19.4 + (13.9 - 19.4) * 0.6 = 16.1 -> floor(16.1) + 0.5 = 16.5
      // Perfect: 49.0 + (34.0 - 49.0) * 0.6 = 40.0 -> floor(40.0) + 0.5 = 40.5
      // Great: 82.0 + (67.0 - 82.0) * 0.6 = 73.0 -> floor(73.0) + 0.5 = 73.5
      // Good: 112.0 + (97.0 - 112.0) * 0.6 = 103.0 -> floor(103.0) + 0.5 = 103.5
      // Bad: 136.0 + (121.0 - 136.0) * 0.6 = 127.0 -> floor(127.0) + 0.5 = 127.5
      // Miss: 173.0 + (158.0 - 173.0) * 0.6 = 164.0 -> floor(164.0) + 0.5 = 164.5
      expect(w.marvelous).toBe(16.5);
      expect(w.perfect).toBe(40.5);
      expect(w.great).toBe(73.5);
      expect(w.good).toBe(103.5);
      expect(w.bad).toBe(127.5);
      expect(w.miss).toBe(164.5);
    });

    it('matches exact lazer windows at OD 10', () => {
      const w = getWindowsMap(10);
      expect(w.marvelous).toBe(13.5); // floor(13.9) + 0.5
      expect(w.perfect).toBe(34.5);   // floor(34.0) + 0.5
      expect(w.great).toBe(67.5);     // floor(67.0) + 0.5
      expect(w.good).toBe(97.5);     // floor(97.0) + 0.5
      expect(w.bad).toBe(121.5);      // floor(121.0) + 0.5
      expect(w.miss).toBe(158.5);     // floor(158.0) + 0.5
    });
  });

  describe('EZ and HR difficulty scaling', () => {
    it('scales OD 5 windows with EZ (difficultyMultiplier = 1 / 1.4)', () => {
      const ezMultiplier = 1 / 1.4;
      const windows = getJudgementWindows(5, ezMultiplier);
      const w = windows.reduce<Record<JudgementType, number>>((acc, curr) => {
        acc[curr.type] = curr.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);

      // 19.4 * 1.4 = 27.16 -> floor(27.16) + 0.5 = 27.5
      expect(w.marvelous).toBe(27.5);
      // 49.0 * 1.4 = 68.6 -> floor(68.6) + 0.5 = 68.5
      expect(w.perfect).toBe(68.5);
      // 82.0 * 1.4 = 114.8 -> floor(114.8) + 0.5 = 114.5
      expect(w.great).toBe(114.5);
      // 112.0 * 1.4 = 156.8 -> floor(156.8) + 0.5 = 156.5
      expect(w.good).toBe(156.5);
      // 136.0 * 1.4 = 190.4 -> floor(190.4) + 0.5 = 190.5
      expect(w.bad).toBe(190.5);
      // 173.0 * 1.4 = 242.2 -> floor(242.2) + 0.5 = 242.5
      expect(w.miss).toBe(242.5);
    });

    it('scales OD 5 windows with HR (difficultyMultiplier = 1.4)', () => {
      const hrMultiplier = 1.4;
      const windows = getJudgementWindows(5, hrMultiplier);
      const w = windows.reduce<Record<JudgementType, number>>((acc, curr) => {
        acc[curr.type] = curr.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);

      // 19.4 / 1.4 = 13.857... -> floor(13.857) + 0.5 = 13.5
      expect(w.marvelous).toBe(13.5);
      // 49.0 / 1.4 = 35.0 -> floor(35.0) + 0.5 = 35.5
      expect(w.perfect).toBe(35.5);
      // 82.0 / 1.4 = 58.571... -> floor(58.571) + 0.5 = 58.5
      expect(w.great).toBe(58.5);
      // 112.0 / 1.4 = 80.0 -> floor(80.0) + 0.5 = 80.5
      expect(w.good).toBe(80.5);
      // 136.0 / 1.4 = 97.142... -> floor(97.142) + 0.5 = 97.5
      expect(w.bad).toBe(97.5);
      // 173.0 / 1.4 = 123.571... -> floor(123.571) + 0.5 = 123.5
      expect(w.miss).toBe(123.5);
    });
  });

  describe('DT and HT speedMultiplier scaling (TASK-012)', () => {
    it('scales OD 5 windows with DT/NC (speedMultiplier = 1.5)', () => {
      const dtSpeed = 1.5;
      const windows = getJudgementWindows(5, 1, dtSpeed);
      const w = windows.reduce<Record<JudgementType, number>>((acc, curr) => {
        acc[curr.type] = curr.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);

      // 19.4 * 1.5 = 29.1 -> floor(29.1) + 0.5 = 29.5
      expect(w.marvelous).toBe(29.5);
      // 49.0 * 1.5 = 73.5 -> floor(73.5) + 0.5 = 73.5
      expect(w.perfect).toBe(73.5);
      // 82.0 * 1.5 = 123.0 -> floor(123.0) + 0.5 = 123.5
      expect(w.great).toBe(123.5);
      // 112.0 * 1.5 = 168.0 -> floor(168.0) + 0.5 = 168.5
      expect(w.good).toBe(168.5);
      // 136.0 * 1.5 = 204.0 -> floor(204.0) + 0.5 = 204.5
      expect(w.bad).toBe(204.5);
      // 173.0 * 1.5 = 259.5 -> floor(259.5) + 0.5 = 259.5
      expect(w.miss).toBe(259.5);
    });

    it('scales OD 5 windows with HT/DC (speedMultiplier = 0.75)', () => {
      const htSpeed = 0.75;
      const windows = getJudgementWindows(5, 1, htSpeed);
      const w = windows.reduce<Record<JudgementType, number>>((acc, curr) => {
        acc[curr.type] = curr.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);

      // 19.4 * 0.75 = 14.55 -> floor(14.55) + 0.5 = 14.5
      expect(w.marvelous).toBe(14.5);
      // 49.0 * 0.75 = 36.75 -> floor(36.75) + 0.5 = 36.5
      expect(w.perfect).toBe(36.5);
      // 82.0 * 0.75 = 61.50 -> floor(61.50) + 0.5 = 61.5
      expect(w.great).toBe(61.5);
      // 112.0 * 0.75 = 84.00 -> floor(84.00) + 0.5 = 84.5
      expect(w.good).toBe(84.5);
      // 136.0 * 0.75 = 102.0 -> floor(102.0) + 0.5 = 102.5
      expect(w.bad).toBe(102.5);
      // 173.0 * 0.75 = 129.75 -> floor(129.75) + 0.5 = 129.5
      expect(w.miss).toBe(129.5);
    });

    it('scales OD 8 windows with DT (speedMultiplier = 1.5)', () => {
      const dtSpeed = 1.5;
      const windows = getJudgementWindows(8, 1, dtSpeed);
      const w = windows.reduce<Record<JudgementType, number>>((acc, curr) => {
        acc[curr.type] = curr.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);

      // OD 8 marvelous = 16.1 * 1.5 = 24.15 -> 24.5
      expect(w.marvelous).toBe(24.5);
      // OD 8 perfect = 40.0 * 1.5 = 60.0 -> 60.5
      expect(w.perfect).toBe(60.5);
      // OD 8 great = 73.0 * 1.5 = 109.5 -> 109.5
      expect(w.great).toBe(109.5);
      // OD 8 good = 103.0 * 1.5 = 154.5 -> 154.5
      expect(w.good).toBe(154.5);
      // OD 8 bad = 127.0 * 1.5 = 190.5 -> 190.5
      expect(w.bad).toBe(190.5);
      // OD 8 miss = 164.0 * 1.5 = 246.0 -> 246.5
      expect(w.miss).toBe(246.5);
    });

    it('combines DT and HR (speedMultiplier = 1.5, difficultyMultiplier = 1.4)', () => {
      const windows = getJudgementWindows(5, 1.4, 1.5);
      const w = windows.reduce<Record<JudgementType, number>>((acc, curr) => {
        acc[curr.type] = curr.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);

      // 19.4 * 1.5 / 1.4 = 20.785... -> floor(20.785) + 0.5 = 20.5
      expect(w.marvelous).toBe(20.5);
      // 49.0 * 1.5 / 1.4 = 52.5 -> floor(52.5) + 0.5 = 52.5
      expect(w.perfect).toBe(52.5);
      // 82.0 * 1.5 / 1.4 = 87.857... -> floor(87.857) + 0.5 = 87.5
      expect(w.great).toBe(87.5);
      // 112.0 * 1.5 / 1.4 = 120.0 -> floor(120.0) + 0.5 = 120.5
      expect(w.good).toBe(120.5);
      // 136.0 * 1.5 / 1.4 = 145.714... -> floor(145.714) + 0.5 = 145.5
      expect(w.bad).toBe(145.5);
      // 173.0 * 1.5 / 1.4 = 185.357... -> floor(185.357) + 0.5 = 185.5
      expect(w.miss).toBe(185.5);
    });

    it('combines DT and EZ (speedMultiplier = 1.5, difficultyMultiplier = 1 / 1.4)', () => {
      const windows = getJudgementWindows(5, 1 / 1.4, 1.5);
      const w = windows.reduce<Record<JudgementType, number>>((acc, curr) => {
        acc[curr.type] = curr.windowMs;
        return acc;
      }, {} as Record<JudgementType, number>);

      // 19.4 * 1.5 * 1.4 = 40.74 -> floor(40.74) + 0.5 = 40.5
      expect(w.marvelous).toBe(40.5);
      // 49.0 * 1.5 * 1.4 = 102.9 -> floor(102.9) + 0.5 = 102.5
      expect(w.perfect).toBe(102.5);
      // 82.0 * 1.5 * 1.4 = 172.2 -> floor(172.2) + 0.5 = 172.5
      expect(w.great).toBe(172.5);
      // 112.0 * 1.5 * 1.4 = 235.2 -> floor(235.2) + 0.5 = 235.5
      expect(w.good).toBe(235.5);
      // 136.0 * 1.5 * 1.4 = 285.6 -> floor(285.6) + 0.5 = 285.5
      expect(w.bad).toBe(285.5);
      // 173.0 * 1.5 * 1.4 = 363.3 -> floor(363.3) + 0.5 = 363.5
      expect(w.miss).toBe(363.5);
    });
  });

  describe('Mod multiplier resolver helpers', () => {
    it('resolves difficultyMultiplier for HR, EZ, and default', () => {
      expect(getDifficultyMultiplier(['HR'])).toBe(1.4);
      expect(getDifficultyMultiplier(['EZ'])).toBeCloseTo(1 / 1.4);
      expect(getDifficultyMultiplier([])).toBe(1.0);
      expect(getDifficultyMultiplier(null)).toBe(1.0);
      expect(getDifficultyMultiplier(undefined)).toBe(1.0);
    });

    it('resolves speedMultiplier for DT, NC, HT, DC, and default', () => {
      expect(getSpeedMultiplier(['DT'])).toBe(1.5);
      expect(getSpeedMultiplier(['NC'])).toBe(1.5);
      expect(getSpeedMultiplier(['HT'])).toBe(0.75);
      expect(getSpeedMultiplier(['DC'])).toBe(0.75);
      expect(getSpeedMultiplier([])).toBe(1.0);
      expect(getSpeedMultiplier(null)).toBe(1.0);
      expect(getSpeedMultiplier(undefined)).toBe(1.0);
    });
  });

  describe('JudgementWindow metadata', () => {
    it('populates correct names, baseScores, hpDeltas, and colors', () => {
      const windows = getJudgementWindows(5);
      expect(windows).toHaveLength(6);

      const marvelous = windows.find((w) => w.type === 'marvelous')!;
      expect(marvelous.name).toBe('PERFECT');
      expect(marvelous.baseScore).toBe(305);
      expect(marvelous.hpDelta).toBe(3);
      expect(marvelous.color).toBe('#22d3ee');

      const perfect = windows.find((w) => w.type === 'perfect')!;
      expect(perfect.name).toBe('GREAT');
      expect(perfect.baseScore).toBe(300);
      expect(perfect.hpDelta).toBe(2);

      const miss = windows.find((w) => w.type === 'miss')!;
      expect(miss.name).toBe('MISS');
      expect(miss.baseScore).toBe(0);
      expect(miss.hpDelta).toBe(-10);
    });
  });
});
