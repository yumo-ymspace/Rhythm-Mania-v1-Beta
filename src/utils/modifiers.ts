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
  'NF', 'EZ', 'HR', 'HT', 'DT', 'NC', 'SD', 'PF', 'HD', 'FI', 'COVER', 'CO', 'FL', 'AT',
  'MR', 'MIRROR',
  'CS', 'CONSTANTSPEED',
  'IN', 'INVERT',
  'HO', 'HOLDOFF',
  'NR', 'NORELEASE',
  'DA', 'DIFFICULTYADJUST',
  'CL', 'CLASSIC'
]);
 
export const MOD_SCORE_MULTIPLIERS: Record<string, number> = {
  NF: 0.5,
  EZ: 0.5,
  HT: 0.5,
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
  CS: 0.8,
  ConstantSpeed: 0.8,
  IN: 1.0,
  Invert: 1.0,
  HO: 0.9,
  HoldOff: 0.9,
  NR: 0.9,
  NoRelease: 0.9,
  DA: 1.0,
  DifficultyAdjust: 1.0,
  CL: 1.0,
  Classic: 1.0,
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

function isDifficultyAdjustPattern(upper: string): boolean {
  return upper === 'DA' || upper === 'DIFFICULTYADJUST' || upper.startsWith('DA:') || upper.startsWith('DA_') || upper.startsWith('DIFFICULTYADJUST:') || upper.startsWith('DIFFICULTYADJUST_');
}

function normalizeModName(upper: string): string {
  if (upper === 'COVER' || upper === 'CO') return 'Cover';
  if (upper === 'MIRROR') return 'MR';
  if (upper === 'CONSTANTSPEED') return 'CS';
  if (upper === 'INVERT') return 'IN';
  if (upper === 'HOLDOFF') return 'HO';
  if (upper === 'NORELEASE') return 'NR';
  if (upper === 'CLASSIC') return 'CL';
  if (upper === 'DIFFICULTYADJUST') return 'DA';
  if (upper.startsWith('DIFFICULTYADJUST:')) return `DA:${upper.substring(17)}`;
  if (upper.startsWith('DIFFICULTYADJUST_')) return `DA_${upper.substring(17)}`;
  return upper;
}

export function sanitizeGameplayMods(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const mods: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const upper = raw.toUpperCase();
    if (!BASE_MODIFIERS.has(upper) && !isDifficultyAdjustPattern(upper) && !/^K(?:[1-9]|10)$/.test(upper)) continue;
    const mod = normalizeModName(upper);
    if (mods.includes(mod)) continue;
    if ((mod === 'EZ' && mods.includes('HR')) || (mod === 'HR' && mods.includes('EZ'))) continue;
    if ((mod === 'HT' && (mods.includes('DT') || mods.includes('NC'))) || ((mod === 'DT' || mod === 'NC') && mods.includes('HT'))) continue;
    if ((mod === 'DT' && mods.includes('NC')) || (mod === 'NC' && mods.includes('DT'))) continue;
    if ((mod === 'NF' && (mods.includes('SD') || mods.includes('PF'))) || ((mod === 'SD' || mod === 'PF') && mods.includes('NF'))) continue;
    if ((mod === 'EZ' && (mods.includes('SD') || mods.includes('PF'))) || ((mod === 'SD' || mod === 'PF') && mods.includes('EZ'))) continue;
    if ((mod === 'SD' && mods.includes('PF')) || (mod === 'PF' && mods.includes('SD'))) continue;
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
