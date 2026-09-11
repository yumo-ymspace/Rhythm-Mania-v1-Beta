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

import { parseCssColor } from './color';
import type { PlayfieldVisualSettings } from './types';
import type { HitObject } from '../types';

/** Recreated from osu!(lazer) `ArgonNotePiece` (osu-resources bitmaps are not used). */
export const ARGON_NOTE_HEIGHT = 42;
export const ARGON_NOTE_ACCENT_RATIO = 0.82;
export const ARGON_CORNER_RADIUS = 3.4;
export const ARGON_COLUMN_GAP = 1;

export const DENSITY_BIN_COUNT = 64;

export const ARGON_COLOUR_SPECIAL = '#a96aff';
export const ARGON_COLOUR_YELLOW = '#ffc528';
export const ARGON_COLOUR_ORANGE = '#fc6d01';
export const ARGON_COLOUR_PINK = '#d5235a';
export const ARGON_COLOUR_PURPLE = '#cb3cec';
export const ARGON_COLOUR_CYAN = '#48c6ff';
export const ARGON_COLOUR_GREEN = '#64c05c';

const FALLBACK_CYCLE = [
  ARGON_COLOUR_YELLOW,
  ARGON_COLOUR_ORANGE,
  ARGON_COLOUR_PINK,
  ARGON_COLOUR_PURPLE,
  ARGON_COLOUR_CYAN,
  ARGON_COLOUR_GREEN,
] as const;

/**
 * Per-key-count layouts from `ManiaArgonSkinTransformer.getColourForLayout`
 * (discussion #21996 / PR #23769).
 */
const ARGON_LAYOUT: Record<number, readonly string[]> = {
  1: [ARGON_COLOUR_YELLOW],
  2: [ARGON_COLOUR_GREEN, ARGON_COLOUR_CYAN],
  3: [ARGON_COLOUR_GREEN, ARGON_COLOUR_SPECIAL, ARGON_COLOUR_CYAN],
  4: [ARGON_COLOUR_YELLOW, ARGON_COLOUR_ORANGE, ARGON_COLOUR_PINK, ARGON_COLOUR_PURPLE],
  5: [ARGON_COLOUR_PINK, ARGON_COLOUR_ORANGE, ARGON_COLOUR_YELLOW, ARGON_COLOUR_GREEN, ARGON_COLOUR_CYAN],
  6: [ARGON_COLOUR_PINK, ARGON_COLOUR_ORANGE, ARGON_COLOUR_GREEN, ARGON_COLOUR_CYAN, ARGON_COLOUR_ORANGE, ARGON_COLOUR_PINK],
  7: [ARGON_COLOUR_PINK, ARGON_COLOUR_ORANGE, ARGON_COLOUR_PINK, ARGON_COLOUR_SPECIAL, ARGON_COLOUR_PINK, ARGON_COLOUR_ORANGE, ARGON_COLOUR_PINK],
  8: [ARGON_COLOUR_PURPLE, ARGON_COLOUR_PINK, ARGON_COLOUR_ORANGE, ARGON_COLOUR_GREEN, ARGON_COLOUR_CYAN, ARGON_COLOUR_ORANGE, ARGON_COLOUR_PINK, ARGON_COLOUR_PURPLE],
  9: [ARGON_COLOUR_PURPLE, ARGON_COLOUR_PINK, ARGON_COLOUR_ORANGE, ARGON_COLOUR_YELLOW, ARGON_COLOUR_SPECIAL, ARGON_COLOUR_YELLOW, ARGON_COLOUR_ORANGE, ARGON_COLOUR_PINK, ARGON_COLOUR_PURPLE],
  10: [ARGON_COLOUR_PURPLE, ARGON_COLOUR_PINK, ARGON_COLOUR_ORANGE, ARGON_COLOUR_YELLOW, ARGON_COLOUR_GREEN, ARGON_COLOUR_CYAN, ARGON_COLOUR_YELLOW, ARGON_COLOUR_ORANGE, ARGON_COLOUR_PINK, ARGON_COLOUR_PURPLE],
};

export function isArgonSkinId(skinId?: string): boolean {
  return !skinId || skinId === 'argon';
}

export function isArgonSkin(settings: PlayfieldVisualSettings): boolean {
  if (settings.playfieldStyle === 'circle') return false;
  if (settings.squareRenderStyle === 'rhythmplus' || settings.squareRenderStyle === 'rhythmplus-dynamic') {
    return false;
  }
  return isArgonSkinId(settings.skinId);
}

export function getArgonNoteHeight(settings: PlayfieldVisualSettings): number {
  return ARGON_NOTE_HEIGHT * (settings.noteSizeMultiplier ?? 1);
}

export function getArgonColumnColor(keyCount: number, columnIndex: number): string {
  const layout = ARGON_LAYOUT[keyCount];
  if (layout && columnIndex >= 0 && columnIndex < layout.length) {
    return layout[columnIndex];
  }
  const odd = keyCount % 2 === 1;
  const specialIndex = Math.floor(keyCount / 2);
  if (odd && columnIndex === specialIndex) return ARGON_COLOUR_SPECIAL;
  return FALLBACK_CYCLE[((columnIndex % FALLBACK_CYCLE.length) + FALLBACK_CYCLE.length) % FALLBACK_CYCLE.length];
}

export function argonPaletteForKeyCount(keyCount: number): string[] {
  return Array.from({ length: keyCount }, (_, i) => getArgonColumnColor(keyCount, i));
}

export function argonDarken(color: string, amount: number): string {
  const parsed = parseCssColor(color);
  const factor = 1 / (1 + amount);
  return `rgb(${Math.round(parsed.r * factor)},${Math.round(parsed.g * factor)},${Math.round(parsed.b * factor)})`;
}

export function argonLighten(color: string, amount: number): string {
  const parsed = parseCssColor(color);
  const factor = 1 + amount;
  return `rgb(${Math.min(255, Math.round(parsed.r * factor))},${Math.min(255, Math.round(parsed.g * factor))},${Math.min(255, Math.round(parsed.b * factor))})`;
}

/**
 * Computes a rate-invariant 64-bin density histogram in map-time domain (TASK-V-052).
 * - Each hit object contributes 1 count at its head time (`obj.time`).
 * - Bin index: Math.floor((obj.time / audioDurationMs) * 64), clamped to 0..63.
 * - Normalized so peak bin value equals 1.0 (empty map returns all zeros).
 * - audioDurationMs: map audio duration in ms (unrated). If missing or <= 0, max(note time/endTime) is used.
 */
export function computeSongDensityBins(
  notes: readonly HitObject[] | undefined,
  audioDurationMs?: number,
): Float32Array {
  const bins = new Float32Array(DENSITY_BIN_COUNT);
  if (!notes || notes.length === 0) {
    return bins;
  }

  let effectiveDuration = audioDurationMs && audioDurationMs > 0 ? audioDurationMs : 0;
  if (effectiveDuration <= 0) {
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const endTime = n.endTime !== undefined && n.endTime > n.time ? n.endTime : n.time;
      if (endTime > effectiveDuration) {
        effectiveDuration = endTime;
      }
    }
  }

  if (effectiveDuration <= 0) {
    return bins;
  }

  let maxCount = 0;
  for (let i = 0; i < notes.length; i++) {
    const t = Math.max(0, notes[i].time);
    const binIdx = Math.min(DENSITY_BIN_COUNT - 1, Math.max(0, Math.floor((t / effectiveDuration) * DENSITY_BIN_COUNT)));
    bins[binIdx]++;
    if (bins[binIdx] > maxCount) {
      maxCount = bins[binIdx];
    }
  }

  if (maxCount > 0) {
    for (let b = 0; b < DENSITY_BIN_COUNT; b++) {
      bins[b] /= maxCount;
    }
  }

  return bins;
}

