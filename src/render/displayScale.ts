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
 * User-selectable canvas device pixel ratio for the playfield.
 * 1 = perf mode, 1.5 = balanced default, 2 = sharpest / highest GPU cost.
 */
export const ALLOWED_RENDER_DPRS = [1, 1.5, 2] as const;
export type RenderDpr = (typeof ALLOWED_RENDER_DPRS)[number];
export const DEFAULT_RENDER_DPR: RenderDpr = 1.5;

export function sanitizeRenderDpr(value: unknown, fallback: RenderDpr = DEFAULT_RENDER_DPR): RenderDpr {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isFinite(num)) return fallback;
  for (const allowed of ALLOWED_RENDER_DPRS) {
    if (Math.abs(num - allowed) < 0.001) return allowed;
  }
  return fallback;
}

/** Resolve the effective canvas DPR from settings. No devicePixelRatio cap: the user choice wins. */
export function getEffectiveDpr(settingsLike: { renderDpr?: unknown } | null | undefined): number {
  if (!settingsLike) return DEFAULT_RENDER_DPR;
  return sanitizeRenderDpr(settingsLike.renderDpr, DEFAULT_RENDER_DPR);
}
