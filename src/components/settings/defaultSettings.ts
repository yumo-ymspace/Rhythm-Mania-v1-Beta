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

import { argonPaletteForKeyCount } from '../../render/argonSkin';
import type { GameSettings } from '../../types';

export const PLAYFIELD_WIDTH_MIN = 20;
export const PLAYFIELD_WIDTH_MAX = 50;
export const BABYLON_PLAYFIELD_WIDTH_MIN = 40;
export const BABYLON_PLAYFIELD_WIDTH_MAX = 90;
export const SCROLL_SPEED_MIN = 5;
export const SCROLL_SPEED_MAX = 80;
export const HISTORY_LIMIT_UNLIMITED = -1;

export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  scrollSpeed: 21,
  lockScrollSpeedDuringPlay: true,
  audioOffset: 0,
  visualOffset: 0,
  hitsoundVolume: 0.60,
  musicVolume: 0.75,
  previewVolume: 0.70,
  masterVolume: 1.0,
  keyMode: 4,
  bindings: {
    1: [' '],
    2: ['f', 'j'],
    3: ['f', ' ', 'j'],
    4: ['d', 'f', 'j', 'k'],
    5: ['d', 'f', ' ', 'j', 'k'],
    6: ['s', 'd', 'f', 'j', 'k', 'l'],
    7: ['s', 'd', 'f', ' ', 'j', 'k', 'l'],
    8: ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'],
    9: ['a', 's', 'd', 'f', ' ', 'j', 'k', 'l', ';'],
    10: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  },
  upsurfaceNoteMode: false,
  videoOpacity: 1.0,
  backgroundDim: 0.60,
  menuBackgroundDim: 0.30,
  disableVideo: false,
  videoOffset: 0,
  disableParticles: false,
  limitDprToOne: false,
  skinId: 'argon',
  squareRenderStyle: 'rhythmmania',
  receptorColorsByKeyCount: {
    1: argonPaletteForKeyCount(1),
    2: argonPaletteForKeyCount(2),
    3: argonPaletteForKeyCount(3),
    4: argonPaletteForKeyCount(4),
    5: argonPaletteForKeyCount(5),
    6: argonPaletteForKeyCount(6),
    7: argonPaletteForKeyCount(7),
    8: argonPaletteForKeyCount(8),
    9: argonPaletteForKeyCount(9),
    10: argonPaletteForKeyCount(10),
  },
  noteOpacity: 1.0,
  receptorOpacity: 1.0,
  judgementOpacity: 1.0,
  judgementSize: 1.0,
  judgementPositionY: 50,
  laneSeparatorOpacity: 0.30,
  circleSize: 1.0,
  noteSizeMultiplier: 1.0,
  receptorSizeMultiplier: 1.0,
  playfieldStyle: 'square',
  customSkinColors: ['#2e6b9e', '#eceff1', '#d32f2f', '#00b0ff', '#eab308'],
  playfieldWidthPercent: 40,
  progressBarTop: false,
  selectedMods: [],
  bindPause: 'escape',
  bindRetry: 'r',
  bindSkipIntro: 'enter',
  renderEngine: 'canvas',
  babylonFloor: true,
  enableMapSV: true,
  disableLaneShake: false,
  enableSongPreview: true,
  showFpsCounter: false,
  showPenarDuringPlay: true,
  localDisplayName: '',
}) satisfies GameSettings;

/** True when a setting's value differs from its default. */
export function isAtDefault(id: string, value: unknown, defaults: Readonly<GameSettings> = DEFAULT_SETTINGS): boolean {
  if (!(id in defaults)) return false;
  const dv = defaults[id as keyof GameSettings];
  if (Array.isArray(dv) && Array.isArray(value)) {
    if (dv.length !== value.length) return false;
    return dv.every((v, i) => v === value[i]);
  }
  if (dv !== null && typeof dv === 'object' && value !== null && typeof value === 'object') {
    return JSON.stringify(dv) === JSON.stringify(value);
  }
  return dv === value;
}
