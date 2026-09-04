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

import type { Beatmap, HitObject } from '../../types';
import { convertBeatmapKeyCount } from '../../utils/beatmapParser';

/**
 * Applies the Mirror (MR) mod to a Beatmap.
 * Flips columns horizontally: newColumn = (keyCount - 1) - oldColumn.
 */
export function applyMirrorMod(beatmap: Beatmap): Beatmap {
  const keyCount = beatmap.keyCount;
  if (!keyCount || keyCount <= 1) return beatmap;

  const mirroredNotes: HitObject[] = (beatmap.notes || []).map((note) => {
    const newCol = Math.max(0, Math.min(keyCount - 1, keyCount - 1 - note.column));
    const newX = note.x !== undefined ? Math.floor(((newCol + 0.5) * 512) / keyCount) : undefined;
    return {
      ...note,
      column: newCol,
      ...(newX !== undefined ? { x: newX } : {}),
    };
  });

  mirroredNotes.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.column - b.column;
  });

  return {
    ...beatmap,
    notes: mirroredNotes,
    id: `${beatmap.id}_mr`,
  };
}

/**
 * Applies the Hold Off (HO) mod to a Beatmap.
 * Converts all hold notes into regular (rice) notes at their start time.
 */
export function applyHoldOffMod(beatmap: Beatmap): Beatmap {
  const convertedNotes: HitObject[] = (beatmap.notes || []).map((note) => {
    if (note.type !== 'hold' && note.endTime === undefined) {
      return note;
    }
    return {
      ...note,
      type: 'normal',
      endTime: undefined,
    };
  });

  convertedNotes.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.column - b.column;
  });

  return {
    ...beatmap,
    notes: convertedNotes,
    id: `${beatmap.id}_ho`,
  };
}

/**
 * Applies the Invert (IN) mod to a Beatmap.
 * Inverts notes and holds:
 * - Existing hold notes become regular notes at their start time.
 * - Existing regular notes become hold notes ending at the start time of the next note in the same column.
 * - If there is no subsequent note in that column, the note remains a regular note.
 */
export function applyInvertMod(beatmap: Beatmap): Beatmap {
  const keyCount = beatmap.keyCount || 4;
  const originalNotes = beatmap.notes || [];

  const notesByColumn: HitObject[][] = Array.from({ length: keyCount }, () => []);
  for (const note of originalNotes) {
    if (note.column >= 0 && note.column < keyCount) {
      notesByColumn[note.column].push({ ...note });
    }
  }

  const invertedNotes: HitObject[] = [];

  for (let col = 0; col < keyCount; col++) {
    const colNotes = notesByColumn[col];
    colNotes.sort((a, b) => a.time - b.time);

    for (let i = 0; i < colNotes.length; i++) {
      const current = colNotes[i];
      const isHold = current.type === 'hold' || (current.endTime !== undefined && current.endTime > current.time);

      if (isHold) {
        // Hold becomes regular note
        invertedNotes.push({
          ...current,
          type: 'normal',
          endTime: undefined,
        });
      } else {
        // Regular note becomes hold if there is a next note in this column
        const next = colNotes[i + 1];
        if (next && next.time > current.time) {
          invertedNotes.push({
            ...current,
            type: 'hold',
            endTime: next.time,
          });
        } else {
          // Last note in column remains regular
          invertedNotes.push({
            ...current,
            type: 'normal',
            endTime: undefined,
          });
        }
      }
    }
  }

  invertedNotes.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.column - b.column;
  });

  return {
    ...beatmap,
    notes: invertedNotes,
    id: `${beatmap.id}_in`,
  };
}

/**
 * Checks if No Release (NR) mod is active in the provided mod list.
 */
export function isNoReleaseMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => m.toUpperCase() === 'NR' || m.toUpperCase() === 'NORELEASE');
}

/**
 * Checks if Constant Speed (CS) mod is active in the provided mod list.
 */
export function isConstantSpeedMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => m.toUpperCase() === 'CS' || m.toUpperCase() === 'CONSTANTSPEED');
}

export interface DifficultyAdjustOptions {
  overallDifficulty?: number;
  hpDrainRate?: number;
}

/**
 * Checks if Difficulty Adjust (DA) mod is active in the provided mod list.
 */
export function isDifficultyAdjustMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => {
    const u = m.toUpperCase();
    return u === 'DA' || u === 'DIFFICULTYADJUST' || u.startsWith('DA:') || u.startsWith('DA_');
  });
}

/**
 * Parses inline Difficulty Adjust parameters from a mod string like "DA:OD=9,HP=7" or "DA_OD8".
 */
export function parseDifficultyAdjustModString(mod: string): DifficultyAdjustOptions | null {
  const match = mod.match(/^DA[:_](.+)$/i);
  if (!match) return null;
  const parts = match[1].split(/[,_]/);
  const options: DifficultyAdjustOptions = {};
  for (const part of parts) {
    const odMatch = part.match(/^OD=?([0-9]+(?:\.[0-9]+)?)$/i);
    if (odMatch) {
      options.overallDifficulty = parseFloat(odMatch[1]);
    }
    const hpMatch = part.match(/^HP=?([0-9]+(?:\.[0-9]+)?)$/i);
    if (hpMatch) {
      options.hpDrainRate = parseFloat(hpMatch[1]);
    }
  }
  return options;
}

/**
 * Applies the Difficulty Adjust (DA) mod to a Beatmap.
 * Overrides overallDifficulty (0..10) and/or hpDrainRate (0..10) if specified.
 */
export function applyDifficultyAdjustMod(
  beatmap: Beatmap,
  options?: DifficultyAdjustOptions,
): Beatmap {
  const nextOd = options?.overallDifficulty !== undefined && Number.isFinite(options.overallDifficulty)
    ? Math.max(0, Math.min(10, options.overallDifficulty))
    : beatmap.overallDifficulty;

  const nextHp = options?.hpDrainRate !== undefined && Number.isFinite(options.hpDrainRate)
    ? Math.max(0, Math.min(10, options.hpDrainRate))
    : beatmap.hpDrainRate;

  return {
    ...beatmap,
    overallDifficulty: nextOd,
    hpDrainRate: nextHp,
    id: `${beatmap.id}_da`,
  };
}

/**
 * Simple 32-bit FNV-1a hash function for strings to generate deterministic numeric seeds.
 */
export function hashStringToSeed(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Creates a deterministic Mulberry32 PRNG from a 32-bit unsigned seed.
 */
export function createMulberry32(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Applies the Random (RD) conversion mod to a Beatmap.
 * Shuffles all columns into a random bijection (permutation) using a deterministic seed.
 */
export function applyRandomMod(beatmap: Beatmap, seed?: number): Beatmap {
  const keyCount = beatmap.keyCount;
  if (!keyCount || keyCount <= 1) return beatmap;

  const numericSeed = seed !== undefined ? seed : hashStringToSeed(beatmap.id || beatmap.title || 'rm_random');
  const rng = createMulberry32(numericSeed);

  // Generate a random permutation of 0..keyCount - 1 (Fisher-Yates shuffle)
  const permutation = Array.from({ length: keyCount }, (_, i) => i);
  for (let i = keyCount - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = permutation[i];
    permutation[i] = permutation[j];
    permutation[j] = temp;
  }

  // If the shuffle accidentally left all columns in their original position, swap first two
  let isIdentity = true;
  for (let i = 0; i < keyCount; i++) {
    if (permutation[i] !== i) {
      isIdentity = false;
      break;
    }
  }
  if (isIdentity && keyCount > 1) {
    const temp = permutation[0];
    permutation[0] = permutation[1];
    permutation[1] = temp;
  }

  const randomizedNotes: HitObject[] = (beatmap.notes || []).map((note) => {
    const newCol = permutation[note.column] !== undefined ? permutation[note.column] : note.column;
    const newX = note.x !== undefined ? Math.floor(((newCol + 0.5) * 512) / keyCount) : undefined;
    return {
      ...note,
      column: newCol,
      ...(newX !== undefined ? { x: newX } : {}),
    };
  });

  randomizedNotes.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.column - b.column;
  });

  return {
    ...beatmap,
    notes: randomizedNotes,
    id: `${beatmap.id}_rd`,
  };
}

/**
 * Checks if Random (RD) mod is active in the provided mod list.
 */
export function isRandomMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => m.toUpperCase() === 'RD' || m.toUpperCase() === 'RANDOM');
}

/**
 * Checks if Wind Up (WU) mod is active in the provided mod list.
 */
export function isWindUpMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => m.toUpperCase() === 'WU' || m.toUpperCase() === 'WINDUP');
}

/**
 * Checks if Wind Down (WD) mod is active in the provided mod list.
 */
export function isWindDownMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => m.toUpperCase() === 'WD' || m.toUpperCase() === 'WINDDOWN');
}

/**
 * Checks if Adaptive Speed (AS) mod is active in the provided mod list.
 */
export function isAdaptiveSpeedMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => m.toUpperCase() === 'AS' || m.toUpperCase() === 'ADAPTIVESPEED');
}

/**
 * Checks if Muted (MU) mod is active in the provided mod list.
 */
export function isMutedMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => m.toUpperCase() === 'MU' || m.toUpperCase() === 'MUTED');
}

/**
 * Checks if Cinema (CN) mod is active in the provided mod list.
 */
export function isCinemaMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => m.toUpperCase() === 'CN' || m.toUpperCase() === 'CINEMA');
}

/**
 * Checks if Accuracy Challenge (AC) mod is active in the provided mod list.
 */
export function isAccuracyChallengeMod(mods?: string[] | null): boolean {
  if (!mods) return false;
  return mods.some((m) => {
    const u = m.toUpperCase();
    return u === 'AC' || u === 'ACCURACYCHALLENGE' || u.startsWith('AC:') || u.startsWith('AC_');
  });
}

/**
 * Parses minimum accuracy threshold from an AC mod string (e.g., "AC:90" -> 0.90, "AC_85" -> 0.85).
 * Returns default 0.90 (90%) if unparameterized.
 */
export function parseAccuracyChallengeThreshold(mod: string): number | null {
  const match = mod.match(/^AC[:_]([0-9]+(?:\.[0-9]+)?)$/i);
  if (!match) return 0.90;
  const val = parseFloat(match[1]);
  if (Number.isNaN(val)) return 0.90;
  // If provided as percentage (e.g. 90), normalize to [0, 1]
  return val > 1.0 ? val / 100 : val;
}

/**
 * Master beatmap mod pipeline: applies all structural mods (Key conversion, Invert, HoldOff, Mirror, Random, Difficulty Adjust)
 * to produce the active playable beatmap.
 */
export function applyBeatmapMods(
  beatmap: Beatmap,
  mods: string[],
  options?: { difficultyAdjust?: DifficultyAdjustOptions; randomSeed?: number },
): Beatmap {
  if (!mods || mods.length === 0) return beatmap;

  let current = beatmap;

  // 1. Key count conversion (K1-K10)
  const keyMod = mods.find((m) => /^K(?:[1-9]|10)$/i.test(m));
  if (keyMod) {
    const targetKeys = parseInt(keyMod.toUpperCase().substring(1), 10);
    if (targetKeys >= 1 && targetKeys <= 10 && targetKeys !== current.keyCount) {
      current = convertBeatmapKeyCount(current, targetKeys);
    }
  }

  // 2. Invert or Hold Off (exclusive)
  const hasInvert = mods.some((m) => m.toUpperCase() === 'IN' || m.toUpperCase() === 'INVERT');
  const hasHoldOff = mods.some((m) => m.toUpperCase() === 'HO' || m.toUpperCase() === 'HOLDOFF');

  if (hasInvert) {
    current = applyInvertMod(current);
  } else if (hasHoldOff) {
    current = applyHoldOffMod(current);
  }

  // 3. Mirror or Random (exclusive)
  const hasMirror = mods.some((m) => m.toUpperCase() === 'MR' || m.toUpperCase() === 'MIRROR');
  const hasRandom = mods.some((m) => isRandomMod([m]));

  if (hasMirror) {
    current = applyMirrorMod(current);
  } else if (hasRandom) {
    current = applyRandomMod(current, options?.randomSeed);
  }

  // 4. Difficulty Adjust
  const daMod = mods.find((m) => isDifficultyAdjustMod([m]));
  if (daMod) {
    const inlineOptions = parseDifficultyAdjustModString(daMod);
    const combinedOptions: DifficultyAdjustOptions = {
      overallDifficulty: inlineOptions?.overallDifficulty ?? options?.difficultyAdjust?.overallDifficulty,
      hpDrainRate: inlineOptions?.hpDrainRate ?? options?.difficultyAdjust?.hpDrainRate,
    };
    current = applyDifficultyAdjustMod(current, combinedOptions);
  }

  return current;
}
