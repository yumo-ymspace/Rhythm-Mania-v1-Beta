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

const BASE_MODIFIERS = new Set(['NF', 'EZ', 'HR', 'HT', 'DT', 'NC', 'SD', 'PF', 'HD', 'FI', 'COVER', 'CO', 'FL', 'AT']);
 
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

export function sanitizeGameplayMods(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const mods: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const upper = raw.toUpperCase();
    if (!BASE_MODIFIERS.has(upper) && !/^K(?:[1-9]|10)$/.test(upper)) continue;
    const mod = upper === 'COVER' ? 'Cover' : upper === 'CO' ? 'Cover' : upper;
    if (mods.includes(mod)) continue;
    if ((mod === 'EZ' && mods.includes('HR')) || (mod === 'HR' && mods.includes('EZ'))) continue;
    if ((mod === 'HT' && (mods.includes('DT') || mods.includes('NC'))) || ((mod === 'DT' || mod === 'NC') && mods.includes('HT'))) continue;
    if ((mod === 'DT' && mods.includes('NC')) || (mod === 'NC' && mods.includes('DT'))) continue;
    if ((mod === 'NF' && (mods.includes('SD') || mods.includes('PF'))) || ((mod === 'SD' || mod === 'PF') && mods.includes('NF'))) continue;
    if ((mod === 'EZ' && (mods.includes('SD') || mods.includes('PF'))) || ((mod === 'SD' || mod === 'PF') && mods.includes('EZ'))) continue;
    if ((mod === 'SD' && mods.includes('PF')) || (mod === 'PF' && mods.includes('SD'))) continue;
    if (VISUAL_COVER_MODS.has(mod.toUpperCase()) && mods.some((item) => VISUAL_COVER_MODS.has(item.toUpperCase()))) continue;
    if (/^K(?:[1-9]|10)$/.test(mod) && mods.some((item) => /^K(?:[1-9]|10)$/.test(item))) continue;
    mods.push(mod);
  }
  return mods;
}
