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

/**
 * Master beatmap mod pipeline: applies all structural mods (Key conversion, Invert, HoldOff, Mirror)
 * to produce the active playable beatmap.
 */
export function applyBeatmapMods(beatmap: Beatmap, mods: string[]): Beatmap {
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

  // 3. Mirror
  const hasMirror = mods.some((m) => m.toUpperCase() === 'MR' || m.toUpperCase() === 'MIRROR');
  if (hasMirror) {
    current = applyMirrorMod(current);
  }

  return current;
}
