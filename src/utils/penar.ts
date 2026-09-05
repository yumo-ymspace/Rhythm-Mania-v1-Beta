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
  accuracy: number;
  maxCombo: number;
  missCount: number;
  mods?: string[];
}

/**
 * Computes PENAR (Performance Evaluation & Numerical Achievement Rating).
 * Stubbed until TASK-090 ports the full mania difficulty and performance formula.
 * DO NOT invent arbitrary osu! pp numbers; total remains null while stubbed.
 */
export function computePenar(input: ComputePenarInput): PenarBreakdown {
  return {
    total: null,
    version: 'penar-stub-0',
    starRating: typeof input.starRating === 'number' && Number.isFinite(input.starRating) ? input.starRating : null,
    accuracy: Number.isFinite(input.accuracy) ? input.accuracy : 0,
    maxCombo: Math.max(0, Math.round(input.maxCombo || 0)),
    missCount: Math.max(0, Math.round(input.missCount || 0)),
    mods: Array.isArray(input.mods) ? [...input.mods] : [],
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
