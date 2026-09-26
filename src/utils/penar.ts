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

import type { PenarBreakdown } from '../types';
import {
  getTimedStarRatingAtTime,
  type TimedManiaDifficultyAttributes,
} from '../ruleset/mania/difficultyCalculator';

export interface ComputePenarInput {
  starRating?: number | null;
  marvelousCount?: number;
  perfectCount?: number;
  greatCount?: number;
  goodCount?: number;
  badCount?: number;
  missCount?: number;
  maxCombo?: number;
  mods?: string[];
}

export interface ComputeLivePenarInput extends Omit<ComputePenarInput, 'starRating'> {
  /**
   * Progressive difficulty for the chart+rate, from
   * calculateTimedManiaDifficultyAttributes.
   */
  timedAttributes?: ReadonlyArray<TimedManiaDifficultyAttributes> | null;
  /** Current progress in original (non-clock-adjusted) ms. */
  progressTime?: number;
  /** Full-chart star rating fallback when no timed entry applies yet. */
  fallbackStarRating?: number | null;
}

/**
 * Version tag for the lazer-equivalent mania performance formula.
 * Star ratings come from calculateManiaDifficultyAttributes
 * (src/ruleset/mania/difficultyCalculator.ts).
 */
export const PENAR_VERSION = 'penar-mania-1';

/** Lazer mania PP accuracy weights, from ppy/osu
 * ManiaPerformanceCalculator.calculateCustomAccuracy:
 *   (Perfect*320 + Great*300 + Good*200 + Ok*100 + Meh*50) / (totalHits*320)
 * RhythmMania judgement mapping (6 tiers to 6 tiers, top-for-top):
 *   marvelous->Perfect (320), perfect->Great (300), great->Good (200),
 *   good->Ok (100), bad->Meh (50), miss->Miss (0).
 * This is intentionally separate from the gameplay score/accuracy weights in
 * scoreProcessor.ts (305/300/200/100/50/0), which drive score, not PP.
 */
const PP_WEIGHT_MARVELOUS = 320;
const PP_WEIGHT_PERFECT = 300;
const PP_WEIGHT_GREAT = 200;
const PP_WEIGHT_GOOD = 100;
const PP_WEIGHT_BAD = 50;
const PP_WEIGHT_MAX = 320;

function sanitizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function hasMod(mods: readonly string[], id: string): boolean {
  return mods.some((mod) => typeof mod === 'string' && mod.toUpperCase() === id);
}

/**
 * Computes PENAR (Performance Evaluation & Numerical Achievement Rating).
 *
 * Exact port of ppy/osu ManiaPerformanceCalculator:
 *   totalHits = Perfect + Great + Good + Ok + Meh + Miss
 *   accuracy = clamp((P*320 + Gr*300 + Go*200 + O*100 + Me*50) / (totalHits*320), 0, 1)
 *   difficultyValue = 8 * max(SR - 0.15, 0.05)^2.2
 *     * max(0, 5*accuracy - 4)              // 0 at 80%, full weight at 100%
 *     * (1 + 0.1 * min(1, totalHits/1500))  // length bonus, capped at 1500
 *   total = difficultyValue * multiplier    // NF x0.75, EZ x0.5, nothing else
 *
 * Notes:
 * - SR already contains the effect of rate mods (DT/HT scale object times in
 *   the strain pass), so DT/HT/NC/DC/HD/HR add no direct PP multiplier.
 * - total is null only when no valid star rating is available; with no
 *   judgements yet it is 0 like lazer live PP.
 *
 * The `starRating` MUST be the full-chart rating for completed plays and
 * results/history surfaces. For live (in-progress) display pass the
 * progressive rating instead — see {@link computeLivePenar}. Reusing the
 * full-chart rating mid-map awards near-final PENAR after the first few
 * notes, which does not match lazer's live PP counter.
 */
export function computePenar(input: ComputePenarInput): PenarBreakdown {
  const marvelous = sanitizeCount(input.marvelousCount);
  const perfect = sanitizeCount(input.perfectCount);
  const great = sanitizeCount(input.greatCount);
  const good = sanitizeCount(input.goodCount);
  const bad = sanitizeCount(input.badCount);
  const miss = sanitizeCount(input.missCount);
  const totalHits = marvelous + perfect + great + good + bad + miss;
  const stars = typeof input.starRating === 'number' && Number.isFinite(input.starRating) && input.starRating >= 0
    ? input.starRating
    : null;
  const mods = Array.isArray(input.mods) ? [...input.mods] : [];

  let total: number | null = null;
  let accuracy = 0;
  if (stars !== null) {
    // Lazer clamps the custom accuracy to [0, 1]; the weighted sum can never
    // exceed the max, but the clamp guards hostile persisted counts.
    accuracy = totalHits > 0
      ? ((marvelous * PP_WEIGHT_MARVELOUS +
          perfect * PP_WEIGHT_PERFECT +
          great * PP_WEIGHT_GREAT +
          good * PP_WEIGHT_GOOD +
          bad * PP_WEIGHT_BAD) /
          (totalHits * PP_WEIGHT_MAX)) *
        100
      : 0;
    const accuracyRatio = Math.min(1, Math.max(0, accuracy / 100));
    // computeDifficultyValue: star-rating curve x accuracy gate x length bonus.
    let difficultyValue = 8 * Math.pow(Math.max(stars - 0.15, 0.05), 2.2);
    difficultyValue *= Math.max(0, 5 * accuracyRatio - 4);
    difficultyValue *= 1 + 0.1 * Math.min(1, totalHits / 1500);
    // Only NF and EZ touch PP directly. Rate/visual/HP mods (DT, HT, NC, DC,
    // HD, HR, ...) affect PP exclusively through the star rating.
    let multiplier = 1;
    if (hasMod(mods, 'NF')) multiplier *= 0.75;
    if (hasMod(mods, 'EZ')) multiplier *= 0.5;
    total = difficultyValue * multiplier;
  }

  return {
    total,
    version: PENAR_VERSION,
    starRating: stars,
    accuracy,
    maxCombo: sanitizeCount(input.maxCombo),
    missCount: miss,
    mods,
  };
}

/**
 * Computes live (in-progress) PENAR, matching lazer's live PP counter
 * (`PerformancePointsCounter`): the same performance formula, but evaluated
 * with the progressive star rating at the current progress time instead of
 * the full-chart rating, plus the judgements recorded so far. Before the
 * first timed entry the progressive rating is 0, so early-map PENAR starts
 * near 0 and grows towards the final value as the chart progresses.
 */
export function computeLivePenar(input: ComputeLivePenarInput): PenarBreakdown {
  const timed = Array.isArray(input.timedAttributes) ? input.timedAttributes : null;
  const progressTime = typeof input.progressTime === 'number' && Number.isFinite(input.progressTime)
    ? input.progressTime
    : null;
  let starRating: number | null = null;
  if (timed && timed.length > 0 && progressTime !== null) {
    starRating = getTimedStarRatingAtTime(timed, progressTime);
  } else if (typeof input.fallbackStarRating === 'number' && Number.isFinite(input.fallbackStarRating)) {
    starRating = input.fallbackStarRating >= 0 ? input.fallbackStarRating : null;
  }
  return computePenar({
    starRating,
    marvelousCount: input.marvelousCount,
    perfectCount: input.perfectCount,
    greatCount: input.greatCount,
    goodCount: input.goodCount,
    badCount: input.badCount,
    missCount: input.missCount,
    maxCombo: input.maxCombo,
    mods: input.mods,
  });
}

/**
 * Formats PENAR value for display across HUD, Results, and History surfaces.
 * Returns '—' when total is null or uncalculated.
 */
export function formatPenar(penar?: PenarBreakdown | null): string {
  if (!penar || penar.total === null || penar.total === undefined || !Number.isFinite(penar.total)) {
    return '—';
  }
  return Math.round(penar.total).toLocaleString();
}
