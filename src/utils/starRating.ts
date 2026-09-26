import type { Beatmap } from '../types';
import { calculateManiaDifficultyAttributes } from '../ruleset/mania/difficultyCalculator';

/**
 * Version tag for locally computed lazer-strain star ratings.
 * Stored `chart-content` v1 values (from the removed density-heuristic
 * estimator) measurably diverged from official lazer ratings and must NOT
 * feed the PP curve. Fresh strain-based values are stored with this version
 * so the resolver can trust them without recomputing the strain pass on
 * every render.
 */
export const STRAIN_STAR_RATING_VERSION = 2;

const MAX_STAR_RATING = 20;

function roundRating(value: number): number {
  return Math.round(Math.min(MAX_STAR_RATING, Math.max(0, value)) * 100) / 100;
}

function normalizeRate(clockRate: unknown): number {
  return typeof clockRate === 'number' && Number.isFinite(clockRate) && clockRate > 0 ? clockRate : 1;
}

type StarRatingSource = Pick<Beatmap, 'id' | 'difficulty' | 'notes' | 'keyCount' | 'duration'> & {
  starRating?: unknown;
  starRatingSource?: unknown;
  starRatingVersion?: unknown;
};

/**
 * Resolves the star rating that drives the PP curve.
 *
 * Source priority (lazer accuracy):
 * 1. Official osu! snapshot (`starRatingSource === 'osu-api-download'`) at
 *    clock rate 1x — this IS the lazer number, use it verbatim.
 * 2. Ad-hoc explicit values with no provenance (tests/tools) at 1x.
 * 3. Fresh local strain ratings (`chart-content` v2) at 1x — computed by the
 *    same strain pass below, trusted to skip the O(n log n) recompute.
 * 4. Otherwise the lazer-strain port (`calculateManiaDifficultyAttributes`).
 *
 * Legacy heuristic values (`chart-content` v1 / `legacy-fallback`) are never
 * trusted: they diverge from lazer (e.g. 2.24 vs official 1.65) and would
 * warp the PP curve. Rate mods (DT/HT) always force a strain recompute at
 * the adjusted clock rate, because SR already contains the rate effect and
 * DT/HT add no direct PP multiplier.
 */
export function resolveStarRating(map: StarRatingSource, clockRate?: number): number {
  const rate = normalizeRate(clockRate);
  const explicit = Number(map.starRating);
  const explicitValid = Number.isFinite(explicit) && explicit >= 0 && explicit <= MAX_STAR_RATING;

  if (explicitValid && rate === 1) {
    const source = (map as { starRatingSource?: unknown }).starRatingSource;
    const version = (map as { starRatingVersion?: unknown }).starRatingVersion;
    if (source === 'osu-api-download') return roundRating(explicit);
    if (source === undefined) return roundRating(explicit);
    if (source === 'chart-content' && version === STRAIN_STAR_RATING_VERSION) return roundRating(explicit);
    // Legacy heuristic provenance: fall through to the strain recompute.
  }

  if (Array.isArray(map.notes)) {
    const keyCount = Number.isInteger(map.keyCount) ? map.keyCount : 4;
    try {
      return roundRating(calculateManiaDifficultyAttributes(map.notes, keyCount, rate).starRating);
    } catch {
      return 0;
    }
  }

  return 0;
}
