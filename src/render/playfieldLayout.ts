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

import { PlayfieldVisualSettings, ColumnLayout } from './types';
import { ScrollModel, getScrollDelta } from './scrollVelocity';
import { isCircleSkinMode, getLaneColors } from './skinTheme';
import { getColumnStyles } from './laneLayout';

export function updateColumnsLayout(
  existingColumns: ColumnLayout[],
  keyCount: number,
  width: number,
  settings: PlayfieldVisualSettings,
  activeColumns: boolean[],
  laneGlows: number[]
): ColumnLayout[] {
  const baseWidth = width / keyCount;
  const laneColors = getLaneColors(settings, keyCount);
  const colStyles = getColumnStyles(keyCount, baseWidth, settings.skinId, settings.customSkinColors, laneColors);

  while (existingColumns.length < keyCount) {
    existingColumns.push({
      x: 0,
      width: 0,
      color: '',
      pressed: false,
      glow: 0
    });
  }
  while (existingColumns.length > keyCount) {
    existingColumns.pop();
  }

  let accumulatedX = 0;
  for (let i = 0; i < keyCount; i++) {
    const col = existingColumns[i];
    col.x = accumulatedX;
    col.width = colStyles[i].width;
    col.color = colStyles[i].color;
    col.pressed = activeColumns[i] || false;
    col.glow = laneGlows[i] || 0;
    accumulatedX += colStyles[i].width;
  }
  return existingColumns;
}

export function calculateScrollSpeedFactor(
  height: number,
  receptorY: number,
  settings: PlayfieldVisualSettings
): number {
  const travelDistance = settings.upsurfaceNoteMode ? (height - receptorY) : receptorY;
  const scrollTimeMs = Math.max(80, 1100 - (settings.scrollSpeed ?? 18) * 25);
  return travelDistance / scrollTimeMs;
}

export function getScrollYPosition(
  timeMs: number,
  visualTime: number,
  receptorY: number,
  speedFactor: number,
  upsurfaceNoteMode: boolean,
  scrollModel?: ScrollModel | null
): number {
  const delta = (scrollModel && scrollModel.isEnabled)
    ? getScrollDelta(scrollModel, visualTime, timeMs)
    : (timeMs - visualTime);

  if (upsurfaceNoteMode) {
    return receptorY + delta * speedFactor;
  } else {
    return receptorY - delta * speedFactor;
  }
}

/**
 * Note timing is represented by the receptor-facing edge, not the sprite
 * center. This keeps skins with different visible heights visually aligned.
 */
export function getNoteVisualY(
  timingY: number,
  columnWidth: number,
  settings: PlayfieldVisualSettings
): number {
  const noteScale = settings.noteSizeMultiplier ?? 1;
  const noteHeight = isCircleSkinMode(settings)
    ? columnWidth * noteScale
    : (settings.squareRenderStyle === 'rhythmplus' || settings.squareRenderStyle === 'rhythmplus-dynamic')
      ? 8 * noteScale
      : 20 * noteScale;
  const halfHeight = noteHeight / 2;
  return settings.upsurfaceNoteMode ? timingY + halfHeight : timingY - halfHeight;
}

export interface CoverState {
  isHD: boolean;
  isFI: boolean;
  isCover: boolean;
  isFL: boolean;
  effectiveCoverage: number;
  flashlightRadius?: number;
}

/**
 * Calculates effective coverage ratio for Hidden, Fade In, Cover, and Flashlight mods.
 * Follows osu!(lazer) mania: 160px initial -> 400px max (on 768px reference height) for HD/FI,
 * and 240px -> 190px (100 combo) -> 150px (200 combo) for Flashlight.
 * Retracts coverage / restores visibility during beatmap break periods.
 */
export function computeCoverRatio(
  mods: readonly string[] = [],
  combo: number = 0,
  songTime?: number,
  breaks: readonly { startTime: number; endTime: number }[] = []
): CoverState {
  const normalizedMods = mods.map(m => m.toUpperCase());
  const isHD = normalizedMods.includes('HD');
  const isFI = normalizedMods.includes('FI');
  const isCover = normalizedMods.includes('COVER') || normalizedMods.includes('CO');
  const isFL = normalizedMods.includes('FL');

  if (!isHD && !isFI && !isCover && !isFL) {
    return { isHD: false, isFI: false, isCover: false, isFL: false, effectiveCoverage: 0 };
  }

  // Retract coverage during break periods
  let breakFactor = 1.0;
  if (songTime !== undefined && breaks.length > 0) {
    for (const b of breaks) {
      if (songTime >= b.startTime && songTime <= b.endTime) {
        const breakDuration = b.endTime - b.startTime;
        const transitionMs = Math.min(500, Math.max(50, breakDuration / 2));
        if (songTime < b.startTime + transitionMs) {
          // Retracting at break start: 1 -> 0
          breakFactor = 1 - (songTime - b.startTime) / transitionMs;
        } else if (songTime > b.endTime - transitionMs) {
          // Expanding back before break end: 0 -> 1
          breakFactor = (songTime - (b.endTime - transitionMs)) / transitionMs;
        } else {
          // Middle of break: fully retracted
          breakFactor = 0;
        }
        break;
      }
    }
  }

  // Base coverage ratio on 768px reference height
  let targetCoverage = 0;
  let flashlightRadius: number | undefined;

  if (isHD || isFI) {
    const coveragePx = Math.min(400, Math.max(160, 160 + 0.5 * Math.max(0, combo)));
    targetCoverage = coveragePx / 768;
  } else if (isCover) {
    targetCoverage = 0.5; // default 50% fixed lane cover
  } else if (isFL) {
    let baseRadius = 240;
    if (combo >= 200) {
      baseRadius = 150;
    } else if (combo >= 100) {
      baseRadius = 190;
    }
    // During break, smoothly interpolate from baseRadius up to 1000 (fully illuminated)
    flashlightRadius = breakFactor < 1.0
      ? baseRadius + (1000 - baseRadius) * (1 - breakFactor)
      : baseRadius;
    targetCoverage = 1.0;
  }

  const effectiveCoverage = Math.max(0, Math.min(1, targetCoverage * breakFactor));
  return { isHD, isFI, isCover, isFL, effectiveCoverage, flashlightRadius };
}

/**
 * Computes note opacity for a given Y position under HD, FI, Cover, or FL modifiers.
 */
export function getCoverOpacityForY(
  y: number,
  height: number,
  receptorY: number,
  upsurfaceNoteMode: boolean,
  coverState: CoverState
): number {
  const { isHD, isFI, isCover, isFL, effectiveCoverage } = coverState;
  if ((!isHD && !isFI && !isCover && !isFL) || (effectiveCoverage <= 0.0001 && !isFL)) {
    return 1.0;
  }

  if (isFL) {
    const radius = coverState.flashlightRadius ?? 240;
    const dist = Math.abs(y - receptorY);
    const innerRadius = radius * 0.45;
    const outerRadius = radius;

    if (dist <= innerRadius) {
      return 1.0;
    } else if (dist >= outerRadius) {
      return 0.0;
    } else {
      const t = (dist - innerRadius) / (outerRadius - innerRadius);
      return Math.max(0, Math.min(1, 1 - t));
    }
  }

  // Progress along the track: 0.0 at note spawn (top for downscroll, bottom for upscroll),
  // 1.0 at receptor (bottom for downscroll, top for upscroll).
  const distance = upsurfaceNoteMode
    ? (height - y)
    : y;
  const totalTrack = upsurfaceNoteMode
    ? (height - receptorY)
    : receptorY;

  const progress = totalTrack > 0 ? distance / totalTrack : 0;

  if (isHD) {
    // Hidden: notes start visible, fade to 0 in the covered region before receptor
    const fadeLen = Math.min(0.20, effectiveCoverage * 0.5);
    const fadeStart = 1 - effectiveCoverage;
    const fadeEnd = fadeStart + fadeLen;

    if (progress <= fadeStart) {
      return 1.0;
    } else if (progress >= fadeEnd) {
      return 0.0;
    } else {
      const t = (progress - fadeStart) / (fadeEnd - fadeStart);
      return Math.max(0, Math.min(1, 1 - t));
    }
  } else if (isFI) {
    // Fade In: notes start invisible at spawn, fade in towards receptor
    const fadeLen = Math.min(0.20, effectiveCoverage * 0.5);
    const fadeEnd = effectiveCoverage;
    const fadeStart = fadeEnd - fadeLen;

    if (progress <= fadeStart) {
      return 0.0;
    } else if (progress >= fadeEnd) {
      return 1.0;
    } else {
      const t = (progress - fadeStart) / (fadeEnd - fadeStart);
      return Math.max(0, Math.min(1, t));
    }
  } else if (isCover) {
    // Cover: player-set top lane cover
    const fadeLen = 0.05;
    const fadeEnd = effectiveCoverage;
    const fadeStart = fadeEnd - fadeLen;

    if (progress <= fadeStart) {
      return 0.0;
    } else if (progress >= fadeEnd) {
      return 1.0;
    } else {
      const t = (progress - fadeStart) / (fadeEnd - fadeStart);
      return Math.max(0, Math.min(1, t));
    }
  }

  return 1.0;
}

export function getHiddenOpacityForY(
  y: number,
  height: number,
  receptorY: number,
  upsurfaceNoteMode: boolean,
  isHD: boolean
): number {
  return getCoverOpacityForY(y, height, receptorY, upsurfaceNoteMode, {
    isHD,
    isFI: false,
    isCover: false,
    isFL: false,
    effectiveCoverage: isHD ? (160 / 768) : 0,
  });
}
