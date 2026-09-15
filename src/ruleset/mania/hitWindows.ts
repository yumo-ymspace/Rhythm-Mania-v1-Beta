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
 * osu! stable mania hit window formulas for each judgement result:
 * - Marvelous (300g): 16 ms (fixed)
 * - Perfect (300): 64 - 3 * OD
 * - Great (200): 97 - 3 * OD
 * - Good (100): 127 - 3 * OD
 * - Bad (50): 151 - 3 * OD
 * - Miss: 188 - 3 * OD
 * 
 * Source: osu! wiki (Gameplay/Judgement/osu!mania) & osu-stable reference.
 */
export const MANIA_STABLE_DIFFICULTY_RANGES: Record<JudgementType, (od: number) => number> = {
  marvelous: () => 16,
  perfect: (od: number) => 64 - 3 * od,
  great: (od: number) => 97 - 3 * od,
  good: (od: number) => 127 - 3 * od,
  bad: (od: number) => 151 - 3 * od,
  miss: (od: number) => 188 - 3 * od,
};

/**
 * Computes hit window half-width in ms matching osu! stable (Classic mod):
 * floor(range * totalMultiplier) + 0.5
 * Note: Under Classic, speedMultiplier is NOT applied (no speed compensation for DT/HT),
 * so totalMultiplier = 1 / difficultyMultiplier.
 */
export function computeStableHitWindow(
  type: JudgementType,
  od: number,
  difficultyMultiplier: number = 1,
): number {
  const base = MANIA_STABLE_DIFFICULTY_RANGES[type](od);
  const totalMultiplier = 1 / difficultyMultiplier;
  return Math.floor(base * totalMultiplier) + 0.5;
}

/**
 * Resolves full JudgementWindow list matching osu!(lazer) ManiaHitWindows.
 * Lazer always applies totalMultiplier = speed / difficulty, including under
 * Classic (stable formulas). Classic non-convert stable bases equal
 * 16 / 64-3*OD / 97-3*OD / 127-3*OD / 151-3*OD / 188-3*OD; converts use the
 * 16 / 34|47 / 67|77 / 97 / 121 / 158 thresholds keyed on rounded OD > 4.
 */
export function getJudgementWindows(
  od: number,
  difficultyMultiplier: number = 1,
  speedMultiplier: number = 1,
  isClassic: boolean = false,
  isConvert: boolean = false,
): JudgementWindow[] {
  const types: JudgementType[] = ['marvelous', 'perfect', 'great', 'good', 'bad', 'miss'];

  const classicBase = (type: JudgementType): number => {
    if (isConvert) {
      const highOd = Math.round(od) > 4;
      switch (type) {
        case 'marvelous': return 16;
        case 'perfect': return highOd ? 34 : 47;
        case 'great': return highOd ? 67 : 77;
        case 'good': return 97;
        case 'bad': return 121;
        case 'miss': return 158;
      }
    }
    return MANIA_STABLE_DIFFICULTY_RANGES[type](od);
  };

  return types.map((type) => {
    const { color, glowColor } = JUDGEMENT_COLORS[type];
    let windowMs: number;
    if (isClassic) {
      const totalMultiplier = speedMultiplier / difficultyMultiplier;
      windowMs = Math.floor(classicBase(type) * totalMultiplier) + 0.5;
    } else {
      const range = MANIA_DIFFICULTY_RANGES[type];
      windowMs = computeLazerHitWindow(od, range.min, range.mid, range.max, difficultyMultiplier, speedMultiplier);
    }

    return {
      type,
      name: JUDGEMENT_UPPERCASE_NAMES[type],
      windowMs,
      baseScore: ACCURACY_BASE_SCORE[type],
      hpDelta: DEFAULT_HP_DELTAS[type],
      color,
      glowColor,
    };
  });
}

/**
 * Checks if the Classic (CL) mod is active in the provided mod list.
 */
export function isClassicMod(mods?: readonly string[] | string[] | null): boolean {
  if (!mods || !Array.isArray(mods)) return false;
  return mods.some((m) => {
    const u = m.toUpperCase();
    return u === 'CL' || u === 'CLASSIC';
  });
}

function hasMod(mods: readonly string[] | null | undefined, ...ids: string[]): boolean {
  if (!mods || !Array.isArray(mods)) return false;
  return mods.some((m) => ids.includes(m.toUpperCase()));
}

/**
 * Resolves difficultyMultiplier from active gameplay mods (HR = 1.4, EZ = 1 / 1.4, default = 1.0).
 * Matches lazer ManiaHitWindows.DifficultyMultiplier semantics.
 */
export function getDifficultyMultiplier(mods?: readonly string[] | string[] | null): number {
  if (hasMod(mods, 'HR')) return 1.4;
  if (hasMod(mods, 'EZ')) return 1 / 1.4;
  return 1.0;
}

/**
 * Resolves speedMultiplier / rate from active gameplay mods (DT/NC = 1.5, HT/DC = 0.75, default = 1.0).
 * Matches lazer track-rate compensation (WU/WD/AS use dynamic rates and stay at 1.0 here).
 */
export function getSpeedMultiplier(mods?: readonly string[] | string[] | null): number {
  if (hasMod(mods, 'DT', 'NC')) return 1.5;
  if (hasMod(mods, 'HT', 'DC')) return 0.75;
  return 1.0;
}

