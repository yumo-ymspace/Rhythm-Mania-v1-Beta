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

/**
 * Version tag for the lazer-equivalent mania performance formula.
 * Star ratings come from calculateManiaDifficultyAttributes
 * (src/ruleset/mania/difficultyCalculator.ts).
 */
export const PENAR_VERSION = 'penar-mania-1';

/** Lazer mania PP accuracy weights (HitResult Perfect/Great/Good/Ok/Meh). */
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
 * lazer-equivalent osu!mania performance:
 *   difficultyValue = max(stars - 0.15, 0.05)^2.2
 *     * max(0, 5 * accuracy - 4)
 *     * (1 + 0.1 * min(1, totalHits / 1500))
 *   total = difficultyValue * 8 (NF: x0.75, EZ: x0.5)
 * Judgement mapping is marvelous->Perfect, perfect->Great, great->Good,
 * good->Ok, bad->Meh, miss->Miss. total is null only when no valid star
 * rating is available; with no judgements yet it is 0 like lazer live PP.
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
    let difficultyValue = Math.pow(Math.max(stars - 0.15, 0.05), 2.2);
    difficultyValue *= Math.max(0, 5 * accuracyRatio - 4);
    difficultyValue *= 1 + 0.1 * Math.min(1, totalHits / 1500);
    let multiplier = 8;
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
 * Formats PENAR value for display across HUD, Results, and History surfaces.
 * Returns '—' when total is null or uncalculated.
 */
export function formatPenar(penar?: PenarBreakdown | null): string {
  if (!penar || penar.total === null || penar.total === undefined || !Number.isFinite(penar.total)) {
    return '—';
  }
  return Math.round(penar.total).toLocaleString();
}
