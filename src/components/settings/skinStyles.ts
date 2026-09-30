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

import type { GameSettings } from '../../types';

export type SkinStyleId = 'argon' | 'rhythmplus' | 'rhythmplus-dynamic';

export interface SkinStyle {
  id: SkinStyleId;
  label: string;
  category: 'default' | 'legacy';
  badge: string;
  subtitle: string;
  description: string;
  previewImage?: string;
}

export const DEFAULT_SKIN: SkinStyle = {
  id: 'argon',
  label: 'Argon',
  category: 'default',
  badge: 'DEFAULT',
  subtitle: 'Argon (lazer-style) Reference',
  description: 'Argon default mania skin. Authentic note geometry, receptors, darkened hold tails, and canonical 1K–10K column palettes on WebGL2.',
};

export const LEGACY_SKINS: SkinStyle[] = [
  {
    id: 'rhythmplus',
    label: 'RhythmPlus Classic',
    category: 'legacy',
    badge: 'LEGACY',
    subtitle: 'Slim classic bars',
    description: 'Slim classic bars with a clean, compact playfield read.',
    previewImage: '/skin/rhythmplus-classic-style-rectangular.webp',
  },
  {
    id: 'rhythmplus-dynamic',
    label: 'RhythmPlus Dynamic',
    category: 'legacy',
    badge: 'LEGACY',
    subtitle: 'Tall dynamic blocks',
    description: 'Tall hold blocks and bright timing bars for a more active read.',
    previewImage: '/skin/rhythmplus-dynamic-style-rectangular.webp',
  },
];

export const ALL_SKINS: SkinStyle[] = [DEFAULT_SKIN, ...LEGACY_SKINS];

export const getSelectedStyle = (settings: GameSettings): SkinStyleId => {
  if (!settings.skinId || settings.skinId === 'argon') return 'argon';
  if (settings.squareRenderStyle === 'rhythmplus-dynamic') return 'rhythmplus-dynamic';
  if (settings.squareRenderStyle === 'rhythmplus') return 'rhythmplus';
  return 'argon';
};

export const styleSettings = (style: SkinStyleId): Partial<GameSettings> => ({
  skinId: style === 'argon' ? 'argon' : 'custom',
  squareRenderStyle: style === 'argon'
    ? undefined
    : style === 'rhythmplus-dynamic'
      ? 'rhythmplus-dynamic'
      : 'rhythmplus',
});
