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

import { isArgonSkin } from './argonSkin';
import { PlayfieldVisualSettings, ResolvedSkin } from './types';

export function getLaneColors(settings: PlayfieldVisualSettings, keyCount: number): string[] | null {
  if (isArgonSkin(settings)) return null;
  const colors = settings.receptorColorsByKeyCount?.[keyCount];
  return Array.isArray(colors) && colors.length === keyCount ? colors : null;
}

export type PlayfieldRenderStyle = 'argon' | 'rhythmplus' | 'rhythmplus-dynamic';

/**
 * Which playfield geometry the WebGL2 renderer draws. Argon is the default;
 * the two RhythmPlus legacy skins draw their slim-bar treatment instead.
 * Anything else (including stored `rhythmmania`/circle-era values) falls
 * back to argon.
 */
export function resolvePlayfieldStyle(settings: PlayfieldVisualSettings): PlayfieldRenderStyle {
  if (settings.squareRenderStyle === 'rhythmplus-dynamic') return 'rhythmplus-dynamic';
  if (settings.squareRenderStyle === 'rhythmplus') return 'rhythmplus';
  return 'argon';
}

export function resolveSkinTheme(settings: PlayfieldVisualSettings): ResolvedSkin {
  let colors = {
    blue: '#2e6b9e',
    white: '#eceff1',
    accent: '#d32f2f',
    cyan: '#00b0ff'
  };

  if (isArgonSkin(settings)) {
    colors = {
      blue: '#ffc528',
      white: '#fc6d01',
      accent: '#d5235a',
      cyan: '#cb3cec',
    };
  } else if (settings.skinId === 'custom' && settings.customSkinColors && settings.customSkinColors.length >= 4) {
    colors = {
      blue: settings.customSkinColors[0] || '#2e6b9e',
      white: settings.customSkinColors[1] || '#eceff1',
      accent: settings.customSkinColors[2] || '#d32f2f',
      cyan: settings.customSkinColors[3] || '#00b0ff'
    };
  } else if (settings.skinId === 'classic-bar') {
    colors = {
      blue: '#00e5ff',
      white: '#ffc107',
      accent: '#f50057',
      cyan: '#00e676'
    };
  } else if (settings.skinId === 'cyberpunk') {
    colors = {
      blue: '#ec4899',
      white: '#8b5cf6',
      accent: '#eab308',
      cyan: '#06b6d4'
    };
  } else if (settings.skinId === 'emerald') {
    colors = {
      blue: '#10b981',
      white: '#34d399',
      accent: '#34d399',
      cyan: '#059669'
    };
  } else if (settings.skinId === 'minimalist') {
    colors = {
      blue: '#475569',
      white: '#f8fafc',
      accent: '#cbd5e1',
      cyan: '#64748b'
    };
  }

  return {
    colors,
    customHoldColor: '#38bdf8'
  };
}
