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

/**
 * Official osu!lazer star-difficulty colour spectrum.
 * Mirrors `OsuColour.STAR_DIFFICULTY_SPECTRUM` in the osu!lazer C# client
 * (osu.Game/Graphics/OsuColour.cs): consecutive stops interpolate linearly
 * in RGB, so any star rating maps to its exact official colour —
 * grey -> blue -> light blue -> teal -> green -> yellow -> orange ->
 * pink/red -> magenta -> purple -> deep indigo -> black (9* and above).
 */
const STAR_DIFFICULTY_SPECTRUM: ReadonlyArray<readonly [number, string]> = [
  [0.1, '#aaaaaa'],
  [0.1, '#4290fb'],
  [1.25, '#4fc0ff'],
  [2.0, '#4fffd5'],
  [2.5, '#7cff4f'],
  [3.3, '#f6f05c'],
  [4.2, '#ff8068'],
  [4.9, '#ff4e6f'],
  [5.8, '#c645b8'],
  [6.7, '#6563de'],
  [7.7, '#18158e'],
  [9.0, '#000000'],
  [10.0, '#000000'],
];

type RgbTuple = readonly [number, number, number];

function hexToRgb(hex: string): RgbTuple {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Exact official osu!lazer colour for a star rating
 * (`OsuColour.ForStarDifficulty`). Like the client, the rating is rounded to
 * 2 decimals first; non-finite/negative input falls back to grey.
 */
export function sampleStarDifficultyColor(starRating: number): string {
  const sr = Number.isFinite(starRating) ? Math.max(0, Math.round(starRating * 100) / 100) : 0;
  const stops = STAR_DIFFICULTY_SPECTRUM;
  if (sr <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [p1, h1] = stops[i];
    const [p2, h2] = stops[i + 1];
    if (sr > p2) continue;
    const [r1, g1, b1] = hexToRgb(h1);
    const [r2, g2, b2] = hexToRgb(h2);
    const t = p2 > p1 ? (sr - p1) / (p2 - p1) : 1;
    return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
  }
  return stops[stops.length - 1][1];
}

/** Appends an alpha byte to an '#rrggbb' colour ('#rrggbbaa'). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
}

/** Scales an '#rrggbb' colour towards black (factor 1 keeps it as-is). */
export function darkenHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = Math.max(0, Math.min(1, factor));
  return rgbToHex(r * f, g * f, b * f);
}

function relativeLuminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Mixes an '#rrggbb' colour towards white (amount 0 keeps it, 1 is white). */
export function mixWithWhite(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, amount));
  return rgbToHex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a);
}

/**
 * Readable text colour to place on top of the given difficulty colour:
 * near-black on light colours, white on dark ones.
 */
export function contrastTextOn(hex: string): string {
  return relativeLuminance(hex) >= 0.4 ? '#14161c' : '#ffffff';
}
