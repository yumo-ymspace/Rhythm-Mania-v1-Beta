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

import type { HitObject, JudgementWindow } from '../../types';

export function resolveJudgementForError(errorMs: number, windows: JudgementWindow[]): JudgementWindow {
  const absoluteError = Math.abs(errorMs);
  return windows.find(window => absoluteError <= window.windowMs) || windows[windows.length - 1];
}

export function isHoldGraceActive(currentTime: number, deadline: number | undefined): boolean {
  return deadline !== undefined && Number.isFinite(deadline) && currentTime <= deadline;
}

export type HoldGraceResolution = 'active' | 'expired' | 'none';

export interface HoldGraceTransition {
  resolution: HoldGraceResolution;
  releaseGraceUntil: number | undefined;
  isHoldFailed: boolean;
  isReleased: boolean;
}

export function resolveHoldGrace(note: HitObject, currentTime: number): HoldGraceTransition {
  if (note.releaseGraceUntil === undefined) {
    return {
      resolution: 'none',
      releaseGraceUntil: undefined,
      isHoldFailed: note.isHoldFailed,
      isReleased: note.isReleased,
    };
  }
  if (isHoldGraceActive(currentTime, note.releaseGraceUntil)) {
    return {
      resolution: 'active',
      releaseGraceUntil: note.releaseGraceUntil,
      isHoldFailed: note.isHoldFailed,
      isReleased: note.isReleased,
    };
  }
  return {
    resolution: 'expired',
    releaseGraceUntil: undefined,
    isHoldFailed: true,
    isReleased: true,
  };
}

export function getHoldTailJudgement(
  endErrorMs: number,
  windows: JudgementWindow[],
): JudgementWindow {
  return resolveJudgementForError(endErrorMs, windows);
}

/**
 * Lazer-compliant head/tap judgement as a JudgementWindow.
 * Late Meh (errorMs > 0 && matched == 'bad') is impossible in lazer and
 * converts to Miss. Use for all rice/head judgements.
 */
export function resolveLazerJudgementWindow(
  errorMs: number,
  windows: JudgementWindow[],
): JudgementWindow {
  const absoluteError = Math.abs(errorMs);
  const matched = windows.find((window) => absoluteError <= window.windowMs) || windows[windows.length - 1];
  if (errorMs > 0 && matched.type === 'bad') {
    return windows.find((window) => window.type === 'miss') || windows[windows.length - 1];
  }
  return matched;
}

export const TAIL_RELEASE_LENIENCE = 1.5;

/**
 * Lazer-compliant tail judgement as a JudgementWindow.
 * Applies 1.5x tail lenience (rawOffset / 1.5) plus the late-Meh -> Miss rule.
 * Use for all hold-tail releases (v1/v2/v3) so the same physical release
 * judges identically across rules versions.
 */
export function getLazerTailJudgementWindow(
  rawOffsetMs: number,
  windows: JudgementWindow[],
): JudgementWindow {
  const effectiveErrorMs = rawOffsetMs / TAIL_RELEASE_LENIENCE;
  return resolveLazerJudgementWindow(effectiveErrorMs, windows);
}
