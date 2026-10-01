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

import { TimingControlPoint } from '../types';

/**
 * A purely visual measure guide line. Mirrors osu!(lazer)'s mania
 * `BarLine` (osu.Game.Rulesets.Objects.BarLineGenerator): one line per
 * measure from each uninherited timing point, with `major` flagging every
 * `timeSignature`-th line. Never a hit object — input, scoring, and replay
 * all ignore it.
 */
export interface BarLine {
  time: number;
  major: boolean;
}

/** osu! default time signature. The parser does not store the meter field. */
export const DEFAULT_TIME_SIGNATURE = 4;

/** Hard cap so a malformed map can never balloon the guide-line buffer. */
const MAX_BAR_LINES = 200000;

/**
 * Generates measure guide lines for a beatmap's timing points, matching
 * lazer's BarLineGenerator: a line every `beatLength * timeSignature` from
 * each uninherited timing point up to the next one (or the song end), with
 * `major` set on every `timeSignature`-th line within a timing segment.
 */
export function generateBarLines(
  timingPoints: readonly TimingControlPoint[] | undefined,
  songDurationMs: number,
  timeSignature: number = DEFAULT_TIME_SIGNATURE,
): BarLine[] {
  const bars: BarLine[] = [];
  if (!timingPoints || timingPoints.length === 0) return bars;

  const numerator = Number.isInteger(timeSignature) && timeSignature > 0
    ? timeSignature
    : DEFAULT_TIME_SIGNATURE;

  // Inherited (green) points only carry SV; measure lines come from the
  // uninherited (red) points, exactly like lazer.
  const points = timingPoints
    .filter(tp => tp.uninherited && Number.isFinite(tp.beatLength) && tp.beatLength > 0)
    .sort((a, b) => a.timeMs - b.timeMs);
  if (points.length === 0) return bars;

  const songEnd = Number.isFinite(songDurationMs) && songDurationMs > 0 ? songDurationMs : 0;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const barLength = point.beatLength * numerator;
    if (!Number.isFinite(barLength) || barLength <= 0) continue;

    // Stop at the next uninherited point; the final segment runs just past
    // the last object so a line is never clipped mid-measure.
    const segmentEnd = i < points.length - 1 ? points[i + 1].timeMs : songEnd + barLength;

    // Align to the timing point. If it starts before t=0, advance to the
    // first whole measure at or after 0 (lazer clamps generation to >= 0).
    let t = point.timeMs;
    let barIndex = 0;
    if (t < 0) {
      const skippedBars = Math.ceil(-t / barLength);
      t += skippedBars * barLength;
      barIndex = skippedBars;
    }

    for (; t < segmentEnd; barIndex++, t += barLength) {
      if (t > songEnd + barLength) break;
      bars.push({ time: t, major: barIndex % numerator === 0 });
      if (bars.length >= MAX_BAR_LINES) {
        bars.sort((a, b) => a.time - b.time);
        return bars;
      }
    }
  }

  bars.sort((a, b) => a.time - b.time);
  return bars;
}
