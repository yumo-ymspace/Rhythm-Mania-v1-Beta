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

/**
 * Flashlight (FL) view-radius math, shared by every playfield renderer.
 *
 * The visible circle shrinks as combo builds (240px idle, 190px at 100
 * combo, 150px at 200 combo) and opens up toward fullscreen during breaks,
 * with a short ease at each break edge. Returns the radius in CSS pixels,
 * or null when Flashlight is not selected. Breaks expand toward
 * `max(width, height)` exactly like the legacy Canvas2D vignette did, so a
 * tall playfield opens fully on portrait breaks.
 */
export function getFlashlightRadius(
  selectedMods: readonly string[] | undefined,
  combo: number,
  songTimeMs: number,
  breaks: ReadonlyArray<{ startTime: number; endTime: number }> | undefined,
  width: number,
  height: number,
): number | null {
  let isFlashlight = false;
  if (selectedMods) {
    for (let i = 0; i < selectedMods.length; i++) {
      if (selectedMods[i].toUpperCase() === 'FL') {
        isFlashlight = true;
        break;
      }
    }
  }
  if (!isFlashlight) return null;

  let baseRadius = 240;
  if (combo >= 200) {
    baseRadius = 150;
  } else if (combo >= 100) {
    baseRadius = 190;
  }

  let breakFactor = 1.0;
  if (breaks && breaks.length > 0) {
    for (const b of breaks) {
      if (songTimeMs >= b.startTime && songTimeMs <= b.endTime) {
        const breakDuration = b.endTime - b.startTime;
        const transitionMs = Math.min(500, Math.max(50, breakDuration / 2));
        if (songTimeMs < b.startTime + transitionMs) {
          breakFactor = 1 - (songTimeMs - b.startTime) / transitionMs;
        } else if (songTimeMs > b.endTime - transitionMs) {
          breakFactor = (songTimeMs - (b.endTime - transitionMs)) / transitionMs;
        } else {
          breakFactor = 0;
        }
        break;
      }
    }
  }

  return breakFactor < 1.0
    ? baseRadius + (Math.max(width, height) - baseRadius) * (1 - breakFactor)
    : baseRadius;
}
