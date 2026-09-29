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

import type { VisibleNote } from './types';

export function isHoldBodyAnchored(note: Pick<VisibleNote, 'type' | 'isHit' | 'isMissed' | 'isReleased' | 'isHoldFailed' | 'isEndPassed' | 'earlyReleaseTime' | 'tailResumedTime' | 'isHolding' | 'holdRulesVersion'>): boolean {
  if (note.type !== 'hold' || !note.isHit || note.isMissed || note.isReleased || note.isHoldFailed) {
    return false;
  }
  // Live holds (v3) report `isHolding` from hold state. The body stays
  // anchored to the receptor for as long as the key is held, even after the
  // tail time has passed, so a held long note is eaten by the receptor
  // instead of dropping below it. The renderer clips the anchored body at
  // the judgement line.
  if (note.holdRulesVersion === 3) {
    return note.isHolding === true;
  }
  // Tick holds (v1/v2) keep the legacy behavior: a tail that has passed the
  // receptor no longer anchors.
  if (note.isEndPassed) return false;
  return (note.earlyReleaseTime === undefined || note.tailResumedTime !== undefined);
}

/**
 * True when a long note has been fully hit (head hit + tail released
 * successfully). The whole body has been consumed into the receptor, so
 * renderers must draw nothing - neither above nor underneath the receptor.
 *
 * - v2/v3: success is explicitly flagged by `isReleaseHit`.
 * - v1/legacy (1 or undefined): success is `isHit + isReleased` without any
 *   fail/miss flag (`isHoldFailed` / `isReleaseMissed`).
 */
export function isHoldSuccessfullyCompleted(note: Pick<VisibleNote, 'type' | 'isHit' | 'isReleased' | 'isHoldFailed' | 'isReleaseMissed' | 'isReleaseHit' | 'holdRulesVersion'>): boolean {
  if (note.type !== 'hold') return false;
  if (note.holdRulesVersion === 2 || note.holdRulesVersion === 3) {
    return note.isReleaseHit === true;
  }
  return !!note.isHit && !!note.isReleased && !note.isHoldFailed && !note.isReleaseMissed;
}
