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

import type { JudgementType } from '../../types';

/**
 * osu!(lazer) mania judgement display names.
 * Internal (schema) -> Display:
 * - marvelous -> Perfect (base score 305)
 * - perfect -> Great (base score 300)
 * - great -> Good (base score 200)
 * - good -> Ok (base score 100)
 * - bad -> Meh (base score 50)
 * - miss -> Miss (base score 0)
 */
export const JUDGEMENT_DISPLAY_NAMES: Record<JudgementType, string> = {
  marvelous: 'Perfect',
  perfect: 'Great',
  great: 'Good',
  good: 'Ok',
  bad: 'Meh',
  miss: 'Miss',
};

export const JUDGEMENT_UPPERCASE_NAMES: Record<JudgementType, string> = {
  marvelous: 'PERFECT',
  perfect: 'GREAT',
  great: 'GOOD',
  good: 'OK',
  bad: 'MEH',
  miss: 'MISS',
};

export const JUDGEMENT_COLORS: Record<JudgementType, { color: string; glowColor: string }> = {
  marvelous: { color: '#22d3ee', glowColor: 'rgba(34,211,238,0.5)' },
  perfect: { color: '#facc15', glowColor: 'rgba(250,204,21,0.4)' },
  great: { color: '#4ade80', glowColor: 'rgba(74,222,128,0.3)' },
  good: { color: '#3b82f6', glowColor: 'rgba(59,130,246,0.2)' },
  bad: { color: '#ec4899', glowColor: 'rgba(236,72,153,0.1)' },
  miss: { color: '#ef4444', glowColor: 'rgba(239,68,68,0.3)' },
};

export function getJudgementDisplayName(type: JudgementType): string {
  return JUDGEMENT_DISPLAY_NAMES[type] ?? type;
}

export function getJudgementUppercaseName(type: JudgementType): string {
  return JUDGEMENT_UPPERCASE_NAMES[type] ?? type.toUpperCase();
}
