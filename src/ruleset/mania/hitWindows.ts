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

import type { JudgementType, JudgementWindow } from '../../types';
import { ACCURACY_BASE_SCORE } from './scoreProcessor';
import { JUDGEMENT_COLORS, JUDGEMENT_UPPERCASE_NAMES } from './judgements';

export interface ManiaDifficultyRange {
  type: JudgementType;
  min: number;
  mid: number;
  max: number;
}

/**
 * osu!(lazer) ManiaHitWindows difficulty ranges for each judgement result.
 * Source: ppy/osu osu.Game.Rulesets.Mania.Scoring.ManiaHitWindows
 */
export const MANIA_DIFFICULTY_RANGES: Record<JudgementType, ManiaDifficultyRange> = {
  marvelous: { type: 'marvelous', min: 22.4, mid: 19.4, max: 13.9 },
  perfect: { type: 'perfect', min: 64, mid: 49, max: 34 },
  great: { type: 'great', min: 97, mid: 82, max: 67 },
  good: { type: 'good', min: 127, mid: 112, max: 97 },
  bad: { type: 'bad', min: 151, mid: 136, max: 121 },
  miss: { type: 'miss', min: 188, mid: 173, max: 158 },
};

export const DEFAULT_HP_DELTAS: Record<JudgementType, number> = {
  marvelous: 3,
  perfect: 2,
  great: 1,
  good: 0.2,
  bad: -3,
  miss: -10,
};

/**
 * Interpolates difficulty range according to osu!(lazer) IHitWindows.DifficultyRange:
 * - OD 0 = min
 * - OD 5 = mid
 * - OD 10 = max
 */
export function computeDifficultyRange(od: number, min: number, mid: number, max: number): number {
  if (od > 5) return mid + (max - mid) * ((od - 5) / 5);
  if (od < 5) return mid + (mid - min) * ((od - 5) / 5);
  return mid;
}

/**
 * Computes hit window half-width in ms matching osu!(lazer):
 * floor(range * (speedMultiplier / difficultyMultiplier)) + 0.5
 */
export function computeLazerHitWindow(
  od: number,
  min: number,
  mid: number,
  max: number,
  difficultyMultiplier: number = 1,
  speedMultiplier: number = 1,
): number {
  const totalMultiplier = speedMultiplier / difficultyMultiplier;
  return Math.floor(computeDifficultyRange(od, min, mid, max) * totalMultiplier) + 0.5;
}

/**
 * Resolves full JudgementWindow list for a given overall difficulty, difficulty multiplier, and speed multiplier.
 */
export function getJudgementWindows(
  od: number,
  difficultyMultiplier: number = 1,
  speedMultiplier: number = 1,
): JudgementWindow[] {
  const types: JudgementType[] = ['marvelous', 'perfect', 'great', 'good', 'bad', 'miss'];
  return types.map((type) => {
    const range = MANIA_DIFFICULTY_RANGES[type];
    const { color, glowColor } = JUDGEMENT_COLORS[type];
    return {
      type,
      name: JUDGEMENT_UPPERCASE_NAMES[type],
      windowMs: computeLazerHitWindow(od, range.min, range.mid, range.max, difficultyMultiplier, speedMultiplier),
      baseScore: ACCURACY_BASE_SCORE[type],
      hpDelta: DEFAULT_HP_DELTAS[type],
      color,
      glowColor,
    };
  });
}

/**
 * Resolves difficultyMultiplier from active gameplay mods (HR = 1.4, EZ = 1 / 1.4, default = 1.0).
 */
export function getDifficultyMultiplier(mods?: readonly string[] | string[] | null): number {
  if (!mods || !Array.isArray(mods)) return 1.0;
  if (mods.includes('HR')) return 1.4;
  if (mods.includes('EZ')) return 1 / 1.4;
  return 1.0;
}

/**
 * Resolves speedMultiplier / rate from active gameplay mods (DT/NC = 1.5, HT/DC = 0.75, default = 1.0).
 */
export function getSpeedMultiplier(mods?: readonly string[] | string[] | null): number {
  if (!mods || !Array.isArray(mods)) return 1.0;
  if (mods.includes('DT') || mods.includes('NC')) return 1.5;
  if (mods.includes('HT') || mods.includes('DC')) return 0.75;
  return 1.0;
}

