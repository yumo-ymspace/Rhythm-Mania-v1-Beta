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

import type { JudgementType, JudgementWindow } from '../../types';

/**
 * osu!(lazer) release window lenience for HoldNote tails.
 * Source: ppy/osu osu.Game.Rulesets.Mania.Objects.TailNote.RELEASE_WINDOW_LENIENCE
 */
export const TAIL_RELEASE_WINDOW_LENIENCE = 1.5;

/**
 * osu!(lazer) mania hold rules version.
 */
export const LAZER_HOLD_RULES_VERSION = 3;

/**
 * The judgement type used when a tail is capped (osu! Meh -> internal 'bad').
 */
export const HOLD_MEH_CAP_TYPE: JudgementType = 'bad';

export type HoldActionKind =
  | 'head_hit'
  | 'head_miss'
  | 'body_break'
  | 'tail_hit'
  | 'tail_miss';

export interface HoldHeadHitResult {
  kind: 'head_hit';
  judgement: JudgementType;
  rawJudgement: JudgementType;
  errorMs: number;
  hitTime: number;
  comboChange: 1;
}

export interface HoldHeadMissResult {
  kind: 'head_miss';
  judgement: 'miss';
  time: number;
  comboChange: 0;
}

export interface HoldBodyBreakResult {
  kind: 'body_break';
  time: number;
  comboChange: 0;
}

export interface HoldTailHitResult {
  kind: 'tail_hit';
  judgement: JudgementType;
  rawJudgement: JudgementType;
  rawOffsetMs: number;
  effectiveErrorMs: number;
  releaseTime: number;
  isCapped: boolean;
  comboChange: 1;
}

export interface HoldTailMissResult {
  kind: 'tail_miss';
  judgement: 'miss';
  time: number;
  comboChange: 0;
}

export type HoldActionResult =
  | HoldHeadHitResult
  | HoldHeadMissResult
  | HoldBodyBreakResult
  | HoldTailHitResult
  | HoldTailMissResult;

export interface HoldNoteState {
  id?: string;
  startTime: number;
  endTime: number;
  column: number;

  // Head state
  isHeadJudged: boolean;
  headJudgement: JudgementType | null;
  headHitTime?: number;
  headMissed: boolean;

  // Body state
  isHolding: boolean;
  hasHoldBreak: boolean;
  bodyJudged: boolean;

  // Tail state
  isTailJudged: boolean;
  tailJudgement: JudgementType | null;
  tailReleaseTime?: number;
  tailMissed: boolean;
  isTailCapped: boolean;

  // Overall state
  isComplete: boolean;
}

/**
 * Creates initial HoldNoteState for a hold note.
 */
export function createHoldNoteState(params: {
  id?: string;
  startTime: number;
  endTime: number;
  column?: number;
}): HoldNoteState {
  return {
    id: params.id,
    startTime: params.startTime,
    endTime: params.endTime,
    column: params.column ?? 0,
    isHeadJudged: false,
    headJudgement: null,
    headMissed: false,
    isHolding: false,
    hasHoldBreak: false,
    bodyJudged: false,
    isTailJudged: false,
    tailJudgement: null,
    tailMissed: false,
    isTailCapped: false,
    isComplete: false,
  };
}

/**
 * Computes effective timing error for a tail release with 1.5x lenience.
 */
export function getEffectiveTailOffset(rawOffsetMs: number): number {
  return rawOffsetMs / TAIL_RELEASE_WINDOW_LENIENCE;
}

/**
 * Resolves mania hit result matching osu!(lazer) ManiaHitWindows.
 * Note: Late Meh (errorMs > 0 && result == Meh/'bad') is impossible in lazer and converts to Miss.
 */
export function resolveManiaHitResult(errorMs: number, windows: JudgementWindow[]): JudgementType {
  const absError = Math.abs(errorMs);
  const matched = windows.find((w) => absError <= w.windowMs);
  const resultType = matched ? matched.type : 'miss';

  // Lazer mania rule: Late Meh is impossible (ManiaHitWindows.cs: if (timeOffset > 0 && result == HitResult.Meh) return HitResult.Miss)
  if (errorMs > 0 && resultType === 'bad') {
    return 'miss';
  }

  return resultType;
}

/**
 * Caps a judgement to Meh ('bad') if it is better than Meh.
 */
export function capJudgementAtMeh(judgement: JudgementType): JudgementType {
  if (
    judgement === 'marvelous' ||
    judgement === 'perfect' ||
    judgement === 'great' ||
    judgement === 'good'
  ) {
    return HOLD_MEH_CAP_TYPE;
  }
  return judgement;
}

/**
 * Resolves hold tail release judgement given raw offset, windows, and whether the tail is capped.
 */
export function resolveHoldTailJudgement(
  rawOffsetMs: number,
  windows: JudgementWindow[],
  isCapped: boolean,
): {
  judgement: JudgementType;
  rawJudgement: JudgementType;
  effectiveErrorMs: number;
  isCapped: boolean;
} {
  const effectiveErrorMs = getEffectiveTailOffset(rawOffsetMs);
  const rawJudgement = resolveManiaHitResult(effectiveErrorMs, windows);

  if (isCapped && rawJudgement !== 'miss') {
    const cappedJudgement = capJudgementAtMeh(rawJudgement);
    return {
      judgement: cappedJudgement,
      rawJudgement,
      effectiveErrorMs,
      isCapped: cappedJudgement !== rawJudgement,
    };
  }

  return {
    judgement: rawJudgement,
    rawJudgement,
    effectiveErrorMs,
    isCapped: false,
  };
}

/**
 * Returns the earliest time (in ms) that a hold tail can be hit / released.
 */
export function getEarliestTailHitTime(endTime: number, windows: JudgementWindow[]): number {
  const badWindowMs = windows.find((w) => w.type === 'bad')?.windowMs ?? 136.5;
  return endTime - badWindowMs * TAIL_RELEASE_WINDOW_LENIENCE;
}

/**
 * Returns the latest time (in ms) that a hold tail can be hit (past which it is a late miss).
 * Note: since late Meh is miss, the latest hittable offset is the Ok ('good') window * 1.5.
 */
export function getLatestTailHitTime(endTime: number, windows: JudgementWindow[]): number {
  const goodWindowMs = windows.find((w) => w.type === 'good')?.windowMs ?? 112.5;
  return endTime + goodWindowMs * TAIL_RELEASE_WINDOW_LENIENCE;
}

/**
 * Checks if the current time is within the tail release hit window.
 */
export function isTailHittable(
  currentTime: number,
  endTime: number,
  windows: JudgementWindow[],
): boolean {
  const earliest = getEarliestTailHitTime(endTime, windows);
  const latest = getLatestTailHitTime(endTime, windows);
  return currentTime >= earliest && currentTime <= latest;
}

/**
 * Processes key press on a hold note.
 */
export function onHoldKeyPress(
  state: HoldNoteState,
  pressTime: number,
  windows: JudgementWindow[],
): HoldActionResult | null {
  if (!state.isHeadJudged) {
    const missWindowMs = windows.find((w) => w.type === 'miss')?.windowMs ?? 173.5;
    // If within hittable window for head
    if (pressTime >= state.startTime - missWindowMs) {
      const errorMs = pressTime - state.startTime;
      const judgement = resolveManiaHitResult(errorMs, windows);

      state.isHeadJudged = true;
      state.headJudgement = judgement;
      state.headHitTime = pressTime;

      if (judgement === 'miss') {
        state.headMissed = true;
        state.hasHoldBreak = true;
        state.isHolding = false;
        return {
          kind: 'head_miss',
          judgement: 'miss',
          time: pressTime,
          comboChange: 0,
        };
      }

      state.headMissed = false;
      state.isHolding = true;
      return {
        kind: 'head_hit',
        judgement,
        rawJudgement: judgement,
        errorMs,
        hitTime: pressTime,
        comboChange: 1,
      };
    }
    return null;
  }

  // Head is already judged.
  // Player re-presses key mid-hold before tail time.
  if (!state.isTailJudged && pressTime < state.endTime) {
    state.isHolding = true;
    return null;
  }

  return null;
}

/**
 * Explicitly misses the head note (e.g. when time expires past head miss window).
 */
export function missHoldHead(state: HoldNoteState, time: number): HoldHeadMissResult | null {
  if (state.isHeadJudged) return null;

  state.isHeadJudged = true;
  state.headJudgement = 'miss';
  state.headMissed = true;
  state.hasHoldBreak = true;
  state.isHolding = false;

  return {
    kind: 'head_miss',
    judgement: 'miss',
    time,
    comboChange: 0,
  };
}

/**
 * Processes key release on a hold note.
 */
export function onHoldKeyRelease(
  state: HoldNoteState,
  releaseTime: number,
  windows: JudgementWindow[],
): HoldActionResult | null {
  if (!state.isHolding || state.isTailJudged) {
    return null;
  }

  state.isHolding = false;
  const earliestTailTime = getEarliestTailHitTime(state.endTime, windows);

  // Released early during the hold body
  if (releaseTime < earliestTailTime) {
    state.hasHoldBreak = true;
    state.bodyJudged = true;
    return {
      kind: 'body_break',
      time: releaseTime,
      comboChange: 0,
    };
  }

  // Released within or near tail window
  return judgeHoldTail(state, releaseTime, windows);
}

/**
 * Judges the hold tail on release.
 */
export function judgeHoldTail(
  state: HoldNoteState,
  releaseTime: number,
  windows: JudgementWindow[],
): HoldActionResult | null {
  if (state.isTailJudged) return null;

  state.isTailJudged = true;
  state.tailReleaseTime = releaseTime;
  state.isComplete = true;

  const rawOffsetMs = releaseTime - state.endTime;
  const isCapped = state.headMissed || state.hasHoldBreak;
  const result = resolveHoldTailJudgement(rawOffsetMs, windows, isCapped);

  state.tailJudgement = result.judgement;
  state.tailMissed = result.judgement === 'miss';
  state.isTailCapped = result.isCapped;

  if (result.judgement === 'miss') {
    return {
      kind: 'tail_miss',
      judgement: 'miss',
      time: releaseTime,
      comboChange: 0,
    };
  }

  return {
    kind: 'tail_hit',
    judgement: result.judgement,
    rawJudgement: result.rawJudgement,
    rawOffsetMs,
    effectiveErrorMs: result.effectiveErrorMs,
    releaseTime,
    isCapped: result.isCapped,
    comboChange: 1,
  };
}

/**
 * Explicitly misses the hold tail (e.g. when time expires without release).
 */
export function missHoldTail(state: HoldNoteState, time: number): HoldTailMissResult | null {
  if (state.isTailJudged) return null;

  state.isTailJudged = true;
  state.tailJudgement = 'miss';
  state.tailMissed = true;
  state.isComplete = true;

  return {
    kind: 'tail_miss',
    judgement: 'miss',
    time,
    comboChange: 0,
  };
}

/**
 * Updates hold note state against current time to detect head or tail expiration.
 */
export function updateHoldNoteTime(
  state: HoldNoteState,
  currentTime: number,
  windows: JudgementWindow[],
): HoldActionResult[] {
  const actions: HoldActionResult[] = [];
  if (state.isComplete) return actions;

  // 1. Check head timeout
  if (!state.isHeadJudged) {
    const missWindowMs = windows.find((w) => w.type === 'miss')?.windowMs ?? 173.5;
    if (currentTime > state.startTime + missWindowMs) {
      const headMiss = missHoldHead(state, state.startTime + missWindowMs);
      if (headMiss) actions.push(headMiss);
    }
  }

  // 2. Check tail timeout
  if (!state.isTailJudged && state.isHeadJudged) {
    const latestTailTime = getLatestTailHitTime(state.endTime, windows);
    const missWindowMs = windows.find((w) => w.type === 'miss')?.windowMs ?? 173.5;
    const maxExpiryTime = state.endTime + missWindowMs * TAIL_RELEASE_WINDOW_LENIENCE;

    if (currentTime > Math.max(latestTailTime, maxExpiryTime)) {
      const tailMiss = missHoldTail(state, currentTime);
      if (tailMiss) actions.push(tailMiss);
    }
  }

  return actions;
}
