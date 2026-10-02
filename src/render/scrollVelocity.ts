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

export interface MultiplierSegment {
  timeMs: number;
  multiplier: number;
  cumulativeScroll: number; // S(timeMs) in ms-multiplier units
}

export interface ScrollModel {
  segments: MultiplierSegment[];
  baseBeatLength: number;
  sliderMultiplier: number;
  isEnabled: boolean;
}

/**
 * lazer's TimingControlPoint.DEFAULT_BEAT_LENGTH (60 BPM). The "current" red
 * beat length starts here until the first uninherited line, exactly like
 * lazer's merged control points (which seed lastTimingPoint with a default).
 */
export const DEFAULT_BEAT_LENGTH = 1000;

/**
 * lazer's EffectControlPoint.ScrollSpeed bindable range. BindableNumber
 * clamps on set, so decoder-produced scroll speeds always land in [0.01, 10].
 */
export const MIN_SCROLL_SPEED = 0.01;
export const MAX_SCROLL_SPEED = 10;

/**
 * Most common uninherited beat length, mirroring lazer's
 * Beatmap.GetMostCommonBeatLength (used with RelativeScaleBeatLengths for
 * mania): duration-weighted with the first point's span starting at 0
 * (osu-stable compat), the tail running to the last object, beat lengths
 * rounded to 1e-3ms for grouping, clamped to the raw range, and 1000 when
 * there is nothing to vote on.
 */
export function calculateMostCommonBeatLength(
  timingPoints: readonly TimingControlPoint[],
  lastObjectTimeMs?: number,
): number {
  const reds = timingPoints
    .filter(tp => tp.uninherited && Number.isFinite(tp.beatLength) && tp.beatLength > 0)
    .sort((a, b) => a.timeMs - b.timeMs);
  if (reds.length === 0) return DEFAULT_BEAT_LENGTH;

  // No objects: lazer falls back to the last timing point's time.
  const lastTime = Number.isFinite(lastObjectTimeMs) && (lastObjectTimeMs as number) > 0
    ? (lastObjectTimeMs as number)
    : reds[reds.length - 1].timeMs;

  let minRaw = Infinity;
  let maxRaw = -Infinity;
  const totals = new Map<number, number>();
  const keyOrder: number[] = [];
  for (let i = 0; i < reds.length; i++) {
    const raw = reds[i].beatLength;
    if (raw < minRaw) minRaw = raw;
    if (raw > maxRaw) maxRaw = raw;
    const key = Math.round(raw * 1000) / 1000;
    if (!totals.has(key)) {
      totals.set(key, 0);
      keyOrder.push(key);
    }
    if (reds[i].timeMs > lastTime) continue;
    const start = i === 0 ? 0 : reds[i].timeMs;
    const end = i === reds.length - 1 ? lastTime : reds[i + 1].timeMs;
    const duration = end - start;
    if (duration > 0) totals.set(key, totals.get(key)! + duration);
  }

  // Stable descending sort: ties keep first-occurrence order, like lazer's
  // OrderByDescending over insertion-ordered groups.
  let bestKey = 0;
  let bestDuration = -Infinity;
  for (const key of keyOrder) {
    const duration = totals.get(key)!;
    if (duration > bestDuration) {
      bestDuration = duration;
      bestKey = key;
    }
  }
  if (bestKey === 0) return DEFAULT_BEAT_LENGTH;
  if (bestKey < minRaw) return minRaw;
  if (bestKey > maxRaw) return maxRaw;
  return bestKey;
}

/**
 * Creates a ScrollModel from a beatmap-like object, mirroring lazer mania's
 * sequential scroll (DrawableManiaRuleset forces RelativeScaleBeatLengths,
 * Velocity = 1, and folds the slider multiplier out of the base beat length).
 * The base is always the most common beat length recomputed from the map's
 * own timing points, so stale or rounded stored values can never skew scroll.
 */
export function createScrollModel(
  beatmapLike: { timingPoints?: TimingControlPoint[]; sliderMultiplier?: number; baseBeatLength?: number },
  isEnabled: boolean = true,
  lastObjectTimeMs?: number,
): ScrollModel {
  const timingPoints: TimingControlPoint[] = beatmapLike.timingPoints || [];
  const sliderMultiplier: number = beatmapLike.sliderMultiplier !== undefined ? beatmapLike.sliderMultiplier : 1.4;

  const baseBeatLength = calculateMostCommonBeatLength(timingPoints, lastObjectTimeMs);

  // Sort and filter timing points safely
  const sortedPoints = [...timingPoints].sort((a, b) => {
    if (a.timeMs !== b.timeMs) {
      return a.timeMs - b.timeMs;
    }
    if (a.uninherited !== b.uninherited) {
      return a.uninherited ? -1 : 1;
    }
    return 0;
  });

  const pointsByTime = new Map<number, TimingControlPoint[]>();
  for (const tp of sortedPoints) {
    if (!pointsByTime.has(tp.timeMs)) {
      pointsByTime.set(tp.timeMs, []);
    }
    pointsByTime.get(tp.timeMs)!.push(tp);
  }

  const uniqueTimes = Array.from(pointsByTime.keys()).sort((a, b) => a - b);

  const segments: MultiplierSegment[] = [];
  // lazer seeds the "current" red beat length with the default (1000ms) until
  // the first uninherited line; green lines never change it.
  let currentBeatLength = DEFAULT_BEAT_LENGTH;
  // lazer mania scroll speed, exactly as the legacy decoder produces it for
  // ruleset 3: red lines reset to 1x, green lines use 100/-beatLength clamped
  // to the effect-point range. Negative and zero speeds cannot occur.
  let currentScrollSpeed = 1.0;

  const resolvedMultipliers = new Map<number, number>();

  // MultiplierControlPoint.Multiplier with mania's Velocity = 1:
  // ScrollSpeed * baseBeatLength / beatLength.
  for (const t of uniqueTimes) {
    const points = pointsByTime.get(t)!;
    for (const tp of points) {
      if (tp.uninherited) {
        if (Number.isFinite(tp.beatLength) && tp.beatLength > 0) {
          currentBeatLength = tp.beatLength;
        }
        currentScrollSpeed = 1.0;
      } else {
        currentScrollSpeed = tp.beatLength < 0 && Number.isFinite(tp.beatLength)
          ? Math.min(MAX_SCROLL_SPEED, Math.max(MIN_SCROLL_SPEED, 100 / -tp.beatLength))
          : 1.0;
      }
    }
    let mult = currentScrollSpeed * (baseBeatLength / currentBeatLength);
    if (!Number.isFinite(mult)) {
      mult = 1.0;
    }
    resolvedMultipliers.set(t, mult);
  }

  if (uniqueTimes.length > 0) {
    const t0 = uniqueTimes[0];
    const mult0 = resolvedMultipliers.get(t0)!;
    segments.push({
      timeMs: t0,
      multiplier: mult0,
      cumulativeScroll: 0,
    });

    for (let i = 1; i < uniqueTimes.length; i++) {
      const prevSeg = segments[i - 1];
      const tCurrent = uniqueTimes[i];
      const duration = tCurrent - prevSeg.timeMs;
      const nextAccum = prevSeg.cumulativeScroll + duration * prevSeg.multiplier;
      const multCurrent = resolvedMultipliers.get(tCurrent)!;

      segments.push({
        timeMs: tCurrent,
        multiplier: multCurrent,
        cumulativeScroll: nextAccum,
      });
    }
  }

  return {
    segments,
    baseBeatLength,
    sliderMultiplier,
    isEnabled
  };
}

/**
 * Gets the precomputed S(t) cumulative scroll position at a given time
 */
export function getScrollPosition(model: ScrollModel, timeMs: number): number {
  if (!model.isEnabled || model.segments.length === 0) {
    return timeMs;
  }

  const segments = model.segments;
  const first = segments[0];
  if (timeMs < first.timeMs) {
    return first.cumulativeScroll + (timeMs - first.timeMs) * first.multiplier;
  }

  const last = segments[segments.length - 1];
  if (timeMs >= last.timeMs) {
    return last.cumulativeScroll + (timeMs - last.timeMs) * last.multiplier;
  }

  let low = 0;
  let high = segments.length - 2;
  let ans = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].timeMs <= timeMs) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const seg = segments[ans];
  return seg.cumulativeScroll + (timeMs - seg.timeMs) * seg.multiplier;
}

/**
 * Gets scroll delta between two times
 */
export function getScrollDelta(model: ScrollModel, fromMs: number, toMs: number): number {
  return getScrollPosition(model, toMs) - getScrollPosition(model, fromMs);
}
