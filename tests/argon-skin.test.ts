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
  ARGON_COLOUR_CYAN,
  ARGON_COLOUR_GREEN,
  ARGON_COLOUR_ORANGE,
  ARGON_COLOUR_PINK,
  ARGON_COLOUR_PURPLE,
  ARGON_COLOUR_SPECIAL,
  ARGON_COLOUR_YELLOW,
  ARGON_NOTE_HEIGHT,
  getArgonColumnColor,
  getArgonNoteHeight,
  isArgonSkin,
} from '../src/render/argonSkin';
import { getColumnStyles } from '../src/render/laneLayout';
import { getNoteVisualY } from '../src/render/playfieldLayout';
import { getLaneColors } from '../src/render/skinTheme';
import type { PlayfieldVisualSettings } from '../src/render/types';

describe('Argon column colours', () => {
  it('matches the shipped 1K–10K transformer table', () => {
    expect(getArgonColumnColor(1, 0)).toBe(ARGON_COLOUR_YELLOW);
    expect([0, 1].map((i) => getArgonColumnColor(2, i))).toEqual([ARGON_COLOUR_GREEN, ARGON_COLOUR_CYAN]);
    expect([0, 1, 2].map((i) => getArgonColumnColor(3, i))).toEqual([
      ARGON_COLOUR_GREEN,
      ARGON_COLOUR_SPECIAL,
      ARGON_COLOUR_CYAN,
    ]);
    expect([0, 1, 2, 3].map((i) => getArgonColumnColor(4, i))).toEqual([
      ARGON_COLOUR_YELLOW,
      ARGON_COLOUR_ORANGE,
      ARGON_COLOUR_PINK,
      ARGON_COLOUR_PURPLE,
    ]);
    expect([0, 1, 2, 3, 4].map((i) => getArgonColumnColor(5, i))).toEqual([
      ARGON_COLOUR_PINK,
      ARGON_COLOUR_ORANGE,
      ARGON_COLOUR_YELLOW,
      ARGON_COLOUR_GREEN,
      ARGON_COLOUR_CYAN,
    ]);
    expect([0, 1, 2, 3, 4, 5].map((i) => getArgonColumnColor(6, i))).toEqual([
      ARGON_COLOUR_PINK,
      ARGON_COLOUR_ORANGE,
      ARGON_COLOUR_GREEN,
      ARGON_COLOUR_CYAN,
      ARGON_COLOUR_ORANGE,
      ARGON_COLOUR_PINK,
    ]);
    expect(getArgonColumnColor(7, 3)).toBe(ARGON_COLOUR_SPECIAL);
    expect(getArgonColumnColor(9, 4)).toBe(ARGON_COLOUR_SPECIAL);
    expect(getArgonColumnColor(10, 0)).toBe(ARGON_COLOUR_PURPLE);
    expect(getArgonColumnColor(10, 9)).toBe(ARGON_COLOUR_PURPLE);
  });

  it('uses Argon colours for the default skin and ignores custom lane overrides', () => {
    const settings: PlayfieldVisualSettings = {
      upsurfaceNoteMode: false,
      scrollSpeed: 21,
      audioOffset: 0,
      visualOffset: 0,
      skinId: 'argon',
      receptorColorsByKeyCount: { 4: ['#00b0ff', '#00b0ff', '#00b0ff', '#00b0ff'] },
    };
    expect(isArgonSkin(settings)).toBe(true);
    expect(getLaneColors(settings, 4)).toBeNull();
    expect(getColumnStyles(4, 100, 'argon').map((col) => col.color)).toEqual([
      ARGON_COLOUR_YELLOW,
      ARGON_COLOUR_ORANGE,
      ARGON_COLOUR_PINK,
      ARGON_COLOUR_PURPLE,
    ]);
  });

  it('keeps legacy skins off the Argon note height', () => {
    const argon: PlayfieldVisualSettings = {
      upsurfaceNoteMode: false,
      scrollSpeed: 21,
      audioOffset: 0,
      visualOffset: 0,
      skinId: 'argon',
    };
    const rhythmplus: PlayfieldVisualSettings = {
      ...argon,
      skinId: 'custom',
      squareRenderStyle: 'rhythmplus',
    };
    expect(getArgonNoteHeight(argon)).toBe(ARGON_NOTE_HEIGHT);
    expect(getNoteVisualY(400, 80, argon)).toBe(400 - ARGON_NOTE_HEIGHT / 2);
    expect(getNoteVisualY(400, 80, rhythmplus)).toBe(400 - 4);
    expect(isArgonSkin(rhythmplus)).toBe(false);
  });
});
