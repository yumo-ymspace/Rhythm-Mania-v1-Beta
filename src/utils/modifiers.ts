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

const BASE_MODIFIERS = new Set([
  'NF', 'EZ', 'HR', 'HT', 'DT', 'NC', 'DC', 'DAYCORE', 'SD', 'PF', 'HD', 'FI', 'COVER', 'CO', 'FL', 'AT',
  'MR', 'MIRROR',
  'CS', 'CONSTANTSPEED',
  'IN', 'INVERT',
  'HO', 'HOLDOFF',
  'NR', 'NORELEASE',
  'DA', 'DIFFICULTYADJUST',
  'CL', 'CLASSIC',
  'RD', 'RANDOM',
  'WU', 'WINDUP',
  'WD', 'WINDDOWN',
  'AS', 'ADAPTIVESPEED',
  'MU', 'MUTED',
  'CN', 'CINEMA',
  'AC', 'ACCURACYCHALLENGE',
]);
 
// Score multipliers mirror ppy/osu ManiaScoreMultiplierCalculator:
// EZ/NF 0.5, HT/DC rate-adjusted (0.75x -> 0.3), NR/HO/CS 0.9, DA 0.5,
// WU/WD/AS 0.5, key mods 0.9. DT/NC/HR/SD/PF/HD/FI/CO/FL/MR/RD/IN/CL/MU/AC 1.0.
export const MOD_SCORE_MULTIPLIERS: Record<string, number> = {
  NF: 0.5,
  EZ: 0.5,
  HT: 0.3,
  DC: 0.3,
  Daycore: 0.3,
  HR: 1.0,
  SD: 1.0,
  PF: 1.0,
  HD: 1.0,
  FI: 1.0,
  Cover: 1.0,
  CO: 1.0,
  FL: 1.0,
  DT: 1.0,
  NC: 1.0,
  MR: 1.0,
  Mirror: 1.0,
  CS: 0.9,
  ConstantSpeed: 0.9,
  IN: 1.0,
  Invert: 1.0,
  HO: 0.9,
  HoldOff: 0.9,
  NR: 0.9,
  NoRelease: 0.9,
  DA: 0.5,
  DifficultyAdjust: 0.5,
  CL: 1.0,
  Classic: 1.0,
  RD: 1.0,
  Random: 1.0,
  WU: 0.5,
  WindUp: 0.5,
  WD: 0.5,
  WindDown: 0.5,
  AS: 0.5,
  AdaptiveSpeed: 0.5,
  MU: 1.0,
  Muted: 1.0,
  CN: 0.0,
  Cinema: 0.0,
  AC: 1.0,
  AccuracyChallenge: 1.0,
  K1: 0.9,
  K2: 0.9,
  K3: 0.9,
  K4: 0.9,
  K5: 0.9,
  K6: 0.9,
  K7: 0.9,
  K8: 0.9,
  K9: 0.9,
  K10: 0.9,
};

const VISUAL_COVER_MODS = new Set(['HD', 'FI', 'COVER', 'CO', 'FL']);
const RATE_ADJUST_MODS = new Set(['HT', 'DT', 'NC', 'DC', 'WU', 'WD', 'AS']);
const SUDDEN_FAIL_MODS = new Set(['SD', 'PF', 'AC']);
const AUTOMATION_MODS = new Set(['AT', 'CN']);

function isDifficultyAdjustPattern(upper: string): boolean {
  return upper === 'DA' || upper === 'DIFFICULTYADJUST' || upper.startsWith('DA:') || upper.startsWith('DA_') || upper.startsWith('DIFFICULTYADJUST:') || upper.startsWith('DIFFICULTYADJUST_');
}

function isAccuracyChallengePattern(upper: string): boolean {
  return upper === 'AC' || upper === 'ACCURACYCHALLENGE' || upper.startsWith('AC:') || upper.startsWith('AC_') || upper.startsWith('ACCURACYCHALLENGE:') || upper.startsWith('ACCURACYCHALLENGE_');
}

function normalizeModName(upper: string): string {
  if (upper === 'DAYCORE') return 'DC';
  if (upper === 'COVER' || upper === 'CO') return 'Cover';
  if (upper === 'MIRROR') return 'MR';
  if (upper === 'CONSTANTSPEED') return 'CS';
  if (upper === 'INVERT') return 'IN';
  if (upper === 'HOLDOFF') return 'HO';
  if (upper === 'NORELEASE') return 'NR';
  if (upper === 'CLASSIC') return 'CL';
  if (upper === 'DIFFICULTYADJUST') return 'DA';
  if (upper === 'RANDOM') return 'RD';
  if (upper === 'WINDUP') return 'WU';
  if (upper === 'WINDDOWN') return 'WD';
  if (upper === 'ADAPTIVESPEED') return 'AS';
  if (upper === 'MUTED') return 'MU';
  if (upper === 'CINEMA') return 'CN';
  if (upper === 'ACCURACYCHALLENGE') return 'AC';
  if (upper.startsWith('DIFFICULTYADJUST:')) return `DA:${upper.substring(17)}`;
  if (upper.startsWith('DIFFICULTYADJUST_')) return `DA_${upper.substring(17)}`;
  if (upper.startsWith('ACCURACYCHALLENGE:')) return `AC:${upper.substring(18)}`;
  if (upper.startsWith('ACCURACYCHALLENGE_')) return `AC_${upper.substring(18)}`;
  return upper;
}

export function sanitizeGameplayMods(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const mods: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const upper = raw.toUpperCase();
    if (!BASE_MODIFIERS.has(upper) && !isDifficultyAdjustPattern(upper) && !isAccuracyChallengePattern(upper) && !/^K(?:[1-9]|10)$/.test(upper)) continue;
    const mod = normalizeModName(upper);
    const modBase = mod.startsWith('DA:') || mod.startsWith('DA_') ? 'DA' : (mod.startsWith('AC:') || mod.startsWith('AC_') ? 'AC' : mod);

    if (mods.includes(mod)) continue;
    if (mods.some((item) => {
      const itemBase = item.startsWith('DA:') || item.startsWith('DA_') ? 'DA' : (item.startsWith('AC:') || item.startsWith('AC_') ? 'AC' : item);
      return itemBase === modBase;
    })) continue;

    if ((mod === 'EZ' && mods.includes('HR')) || (mod === 'HR' && mods.includes('EZ'))) continue;
    if (RATE_ADJUST_MODS.has(modBase) && mods.some((item) => RATE_ADJUST_MODS.has(item.startsWith('DA:') || item.startsWith('DA_') ? 'DA' : item))) continue;
    if ((mod === 'NF' && mods.some((item) => SUDDEN_FAIL_MODS.has(item.startsWith('AC:') || item.startsWith('AC_') ? 'AC' : item))) ||
        (SUDDEN_FAIL_MODS.has(modBase) && mods.includes('NF'))) continue;
    if ((mod === 'EZ' && mods.some((item) => SUDDEN_FAIL_MODS.has(item.startsWith('AC:') || item.startsWith('AC_') ? 'AC' : item))) ||
        (SUDDEN_FAIL_MODS.has(modBase) && mods.includes('EZ'))) continue;
    if (SUDDEN_FAIL_MODS.has(modBase) && mods.some((item) => SUDDEN_FAIL_MODS.has(item.startsWith('AC:') || item.startsWith('AC_') ? 'AC' : item))) continue;
    if (AUTOMATION_MODS.has(modBase) && mods.some((item) => AUTOMATION_MODS.has(item))) continue;
    if ((mod === 'RD' && mods.includes('MR')) || (mod === 'MR' && mods.includes('RD'))) continue;
    if (VISUAL_COVER_MODS.has(mod.toUpperCase()) && mods.some((item) => VISUAL_COVER_MODS.has(item.toUpperCase()))) continue;
    if ((mod === 'IN' && mods.includes('HO')) || (mod === 'HO' && mods.includes('IN'))) continue;
    if ((mod === 'HO' && mods.includes('NR')) || (mod === 'NR' && mods.includes('HO'))) continue;
    if (isDifficultyAdjustPattern(mod) && mods.some((item) => isDifficultyAdjustPattern(item))) continue;
    if ((isDifficultyAdjustPattern(mod) && (mods.includes('EZ') || mods.includes('HR'))) || ((mod === 'EZ' || mod === 'HR') && mods.some((item) => isDifficultyAdjustPattern(item)))) continue;
    if (/^K(?:[1-9]|10)$/.test(mod) && mods.some((item) => /^K(?:[1-9]|10)$/.test(item))) continue;
    mods.push(mod);
  }
  return mods;
}
