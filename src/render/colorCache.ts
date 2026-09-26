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

import { parseCssColor } from './color';

/**
 * Per-frame color parsing (`parseCssColor` + `rgb()` string building) showed up
 * as a hot spot in the gameplay loop: lanes, holds, heads, tails and receptors
 * all resolved CSS colors for every quad, every rAF. This cache parses each
 * unique CSS string once and serves cheap float math afterwards.
 *
 * Bounded LRU so hostile custom palettes cannot grow it without limit.
 */
const MAX_CACHED_COLORS = 256;
const rgbCache = new Map<string, [number, number, number]>();
const rgbaStringCache = new Map<string, string>();
const MAX_RGBA_STRINGS = 512;

function parseToUnitRgb(color: string): [number, number, number] {
  const c = parseCssColor(color);
  return [c.r / 255, c.g / 255, c.b / 255];
}

/** 0..1 RGB tuple for a CSS color string. Cached after first parse. */
export function getCachedRgb01(color: string): [number, number, number] {
  const hit = rgbCache.get(color);
  if (hit) return hit;
  const rgb = parseToUnitRgb(color);
  rgbCache.set(color, rgb);
  if (rgbCache.size > MAX_CACHED_COLORS) {
    const oldest = rgbCache.keys().next().value as string | undefined;
    if (oldest !== undefined) rgbCache.delete(oldest);
  }
  return rgb;
}

/** `argonDarken(color, amount)` without string round-trips. factor = 1/(1+amount). */
export function darkenCached(color: string, amount: number): [number, number, number] {
  const [r, g, b] = getCachedRgb01(color);
  const f = 1 / (1 + amount);
  return [r * f, g * f, b * f];
}

/** `argonLighten(color, amount)` without string round-trips. factor = 1+amount, clamped. */
export function lightenCached(color: string, amount: number): [number, number, number] {
  const [r, g, b] = getCachedRgb01(color);
  const f = 1 + amount;
  return [Math.min(1, r * f), Math.min(1, g * f), Math.min(1, b * f)];
}

export function tupleWithAlpha(rgb: readonly [number, number, number], alpha: number): [number, number, number, number] {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return [rgb[0], rgb[1], rgb[2], a];
}

/**
 * Fast `rgba(r,g,b,a)` string builder on top of the cached parse.
 * Alpha is quantized to 3 decimals so HD fades still hit the cache.
 */
export function cachedHexToRgba(color: string | undefined, alpha: number): string {
  const src = typeof color === 'string' ? color : '#ffffff';
  const a = Math.max(0, Math.min(1, alpha));
  const key = `${src}|${a.toFixed(3)}`;
  const hit = rgbaStringCache.get(key);
  if (hit !== undefined) return hit;
  const [r, g, b] = getCachedRgb01(src);
  // parseCssColor also carries an intrinsic alpha; fold it in for parity.
  const intrinsic = parseCssColor(src).alpha;
  const out = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${(intrinsic * a).toFixed(3)})`;
  rgbaStringCache.set(key, out);
  if (rgbaStringCache.size > MAX_RGBA_STRINGS) {
    const oldest = rgbaStringCache.keys().next().value as string | undefined;
    if (oldest !== undefined) rgbaStringCache.delete(oldest);
  }
  return out;
}

function rgbaStringFromUnitRgb(r: number, g: number, b: number, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const key = `u:${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}|${a.toFixed(3)}`;
  const hit = rgbaStringCache.get(key);
  if (hit !== undefined) return hit;
  const out = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a.toFixed(3)})`;
  rgbaStringCache.set(key, out);
  if (rgbaStringCache.size > MAX_RGBA_STRINGS) {
    const oldest = rgbaStringCache.keys().next().value as string | undefined;
    if (oldest !== undefined) rgbaStringCache.delete(oldest);
  }
  return out;
}

/** Cached `argonDarken(color, amount)` as an `rgba()` string with alpha. No intermediate strings. */
export function cachedDarkenRgba(color: string, amount: number, alpha: number): string {
  const [r, g, b] = darkenCached(color, amount);
  return rgbaStringFromUnitRgb(r, g, b, alpha);
}

/** Cached `argonLighten(color, amount)` as an `rgba()` string with alpha. No intermediate strings. */
export function cachedLightenRgba(color: string, amount: number, alpha: number): string {
  const [r, g, b] = lightenCached(color, amount);
  return rgbaStringFromUnitRgb(r, g, b, alpha);
}

/** Test/debug helper: current cache sizes. */
export function colorCacheStats(): { rgb: number; rgbaStrings: number } {
  return { rgb: rgbCache.size, rgbaStrings: rgbaStringCache.size };
}

/** Test/debug helper: clear caches. */
export function clearColorCaches(): void {
  rgbCache.clear();
  rgbaStringCache.clear();
}
