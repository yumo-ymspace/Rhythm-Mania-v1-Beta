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

/*
 * Visible-note selection is intentionally conservative. The input is normally
 * parser-sorted, but an imported/replayed map may not be, so the fallback sort
 * is kept at the boundary instead of making renderers defend themselves.
 */

import { HitObject } from '../types';
import { PlayfieldVisualSettings, VisibleNote } from './types';
import { getScrollYPosition, computeCoverRatio, getCoverOpacityForY } from './playfieldLayout';
import { ScrollModel } from './scrollVelocity';
import { isHoldBodyAnchored, isHoldSuccessfullyCompleted } from './noteState';
import { HOLD_TICK_RULES_VERSION } from '../utils/holdTickRules';
import { LAZER_HOLD_RULES_VERSION } from '../ruleset/mania/holdNote';

function mergeTailIntervals(
  intervals: Array<{ startTime: number; endTime: number }>,
): Array<{ startTime: number; endTime: number }> {
  const merged: Array<{ startTime: number; endTime: number }> = [];
  const ordered = [...intervals]
    .filter(interval => Number.isFinite(interval.startTime) && Number.isFinite(interval.endTime) && interval.endTime > interval.startTime)
    .sort((left, right) => left.startTime - right.startTime);
  for (const interval of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && interval.startTime <= previous.endTime + 0.001) {
      previous.endTime = Math.max(previous.endTime, interval.endTime);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

const sortednessCache = new WeakMap<readonly HitObject[], boolean>();

function isSortedByTime(notes: readonly HitObject[]): boolean {
  const cached = sortednessCache.get(notes);
  if (cached !== undefined) return cached;
  let sorted = true;
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].time < notes[i - 1].time) {
      sorted = false;
      break;
    }
  }
  // Only cache sorted arrays: unsorted inputs are mutated/sorted by callers,
  // and a stale "unsorted" flag must never stick to a later-sorted array.
  // Unsorted arrays take the (correct) full-scan fallback below.
  if (sorted) sortednessCache.set(notes, true);
  return sorted;
}

function lowerBoundNoteTime(notes: readonly HitObject[], t: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundNoteTime(notes: readonly HitObject[], t: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Minimum positive SV multiplier in the model, or null when indexing is
// unsafe (frozen/reverse/non-finite segments can park far-off-time notes
// on screen, so callers must fall back to the full scan).
function minPositiveSvMultiplier(model?: ScrollModel | null): number | null {
  if (!model || !model.isEnabled || model.segments.length === 0) return 1;
  let min = Infinity;
  for (const s of model.segments) {
    if (!Number.isFinite(s.multiplier) || s.multiplier <= 0) return null;
    if (s.multiplier < min) min = s.multiplier;
  }
  return Number.isFinite(min) ? Math.max(0.05, min) : 1;
}

export function getVisibleNotes(
  notes: HitObject[],
  settings: PlayfieldVisualSettings,
  height: number,
  receptorY: number,
  visualTime: number,
  speedFactor: number,
  scrollModel?: ScrollModel | null,
  combo: number = 0,
  breaks: Array<{ startTime: number; endTime: number }> = [],
): VisibleNote[] {
  const visible: VisibleNote[] = [];
  const paddingLimit = 100;
  const up = settings.upsurfaceNoteMode;
  const noteOpacityVal = settings.noteOpacity ?? 1.0;
  const coverState = computeCoverRatio(settings.selectedMods || [], combo, visualTime, breaks);
  const sorted = isSortedByTime(notes);
  const orderedNotes: readonly HitObject[] = sorted
    ? notes
    : [...notes].sort((a, b) => a.time - b.time);

  // Indexed fast path for constant/positive SV scroll: binary-search a
  // conservative time window instead of projecting every note. Falls back to
  // the full scan when SV can freeze/reverse (a global time window is not
  // safe then) or when the window degenerates (tiny multipliers).
  // Holds that started before the window but extend into/through it are
  // picked up by a bounded backward scan (2-minute max hold span).
  let windowed: readonly HitObject[] | null = null;
  if (sorted && Number.isFinite(speedFactor) && speedFactor > 0) {
    const minMult = minPositiveSvMultiplier(scrollModel);
    if (minMult !== null) {
      const travelWindowMs = (height + paddingLimit * 2) / speedFactor / minMult;
      if (Number.isFinite(travelWindowMs) && travelWindowMs <= 15000) {
        const windowMs = travelWindowMs + 1000;
        const loTime = visualTime - windowMs;
        const hiTime = visualTime + windowMs;
        const startIdx = lowerBoundNoteTime(orderedNotes, loTime);
        const endIdx = upperBoundNoteTime(orderedNotes, hiTime);
        if (endIdx - startIdx < orderedNotes.length) {
          const picked: HitObject[] = [];
          // Bounded backward scan for holds spanning into the window.
          const spanCutoff = loTime - 120000;
          let spanFallback = false;
          for (let i = startIdx - 1; i >= 0; i--) {
            const n = orderedNotes[i];
            if (n.time < spanCutoff) break;
            if (n.type === 'hold' && n.endTime !== undefined && n.endTime >= loTime) {
              picked.push(n);
            } else if (n.type !== 'hold') {
              // Non-holds before the window can never be visible; keep
              // scanning past them only while a spanning hold is plausible.
              // (No early break: an earlier long hold may still span.)
              continue;
            }
            // Bound the scan so hold-heavy maps cannot degenerate to O(n).
            if (picked.length >= 512 || startIdx - i >= 4096) {
              // Give up windowing and fall back to the exact full scan.
              spanFallback = true;
              break;
            }
          }
          if (!spanFallback) {
            picked.reverse();
            const slice = orderedNotes.slice(startIdx, endIdx);
            windowed = picked.length > 0 ? [...picked, ...slice] : slice;
          }
        }
      }
    }
  }

  // Evaluate every note against its actual SV-projected position. A global
  // time window is not safe when timing points change scroll direction or
  // speed, because a note outside that window can still be on screen.
  for (const n of windowed ?? orderedNotes) {

    // A fully-hit long note is completely consumed into the receptor: draw
    // nothing, neither above nor underneath it. Only skip once the release
    // has happened in the timeline so future-dated test fixtures still show
    // the approaching tail.
    if (n.type === 'hold') {
      const completedByFlags = isHoldSuccessfullyCompleted({
        type: n.type,
        isHit: n.isHit,
        isReleased: n.isReleased,
        isHoldFailed: n.isHoldFailed,
        isReleaseMissed: n.isReleaseMissed,
        isReleaseHit: n.isReleaseHit,
        holdRulesVersion: n.holdRulesVersion,
      });
      const completedByState = n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
        !!n.holdState?.isTailJudged && !n.holdState.tailMissed;
      if (completedByFlags || completedByState) {
        const releaseTime = n.releaseTime ?? n.endTime;
        if (releaseTime === undefined || visualTime >= releaseTime - 0.001) {
          continue;
        }
      }
    }

    // Hold geometry is timeline-driven. Judgement state may change its color or
    // anchoring, but it must not consume the note before it scrolls off-screen.
    const usesTailTicks = n.holdRulesVersion === HOLD_TICK_RULES_VERSION;
    const isHoldBodyActive = n.type === 'hold' && n.endTime !== undefined;
    const isEndPassed = isHoldBodyActive && n.endTime !== undefined && visualTime > n.endTime;
    const isHolding = n.type === 'hold' && (
      n.holdRulesVersion === LAZER_HOLD_RULES_VERSION && n.holdState
        ? n.holdState.isHolding
        : (n.isHit && !n.isReleased && !n.isHoldFailed && (n.earlyReleaseTime === undefined || n.tailResumedTime !== undefined))
    );

    const y = getScrollYPosition(n.time, visualTime, receptorY, speedFactor, up, scrollModel);
    const endY = n.endTime !== undefined
      ? getScrollYPosition(n.endTime, visualTime, receptorY, speedFactor, up, scrollModel)
      : undefined;

    const isHeadAtOrPastReceptor = up ? y <= receptorY : y >= receptorY;
    // Once a hold head is hit and actively held, the consumed middle
    // disappears into the receptor: anchor the body start to the receptor
    // immediately instead of waiting for the head sprite to scroll past.
    const isHoldBodyGrounded = isHoldBodyActive && isHolding && isHoldBodyAnchored({
      type: n.type,
      isHit: n.isHit,
      isMissed: n.isMissed,
      isReleased: n.isReleased,
      isHoldFailed: n.isHoldFailed,
      isEndPassed,
      earlyReleaseTime: n.earlyReleaseTime,
      tailResumedTime: n.tailResumedTime,
      isHolding,
      holdRulesVersion: n.holdRulesVersion,
    });
    const shouldDrawHead = (n.type === 'normal' && !n.isHit && !n.isMissed) ||
      (n.type === 'hold' && (n.isMissed || (!n.isHit && !n.isHoldFailed) || (n.isHit && !isHeadAtOrPastReceptor)));
    const shouldDrawEnd = n.type === 'hold' && n.endTime !== undefined && (!usesTailTicks || !n.isReleaseHit);

    if (!isHoldBodyActive && !shouldDrawHead && !shouldDrawEnd) continue;

    const bodyStartY = isHoldBodyGrounded && !usesTailTicks
      ? receptorY
      : (n.isHit && n.earlyReleaseTime !== undefined && n.earlyReleaseTime > n.time && !usesTailTicks)
        ? getScrollYPosition(n.earlyReleaseTime, visualTime, receptorY, speedFactor, up, scrollModel)
        : y;
    const hitSegmentStartY = n.type === 'hold' && n.isHoldFailed && n.isReleased &&
      n.hitTime !== undefined && n.releaseTime !== undefined && n.releaseTime > n.hitTime
      ? getScrollYPosition(n.hitTime, visualTime, receptorY, speedFactor, up, scrollModel)
      : undefined;
    const hitSegmentEndY = hitSegmentStartY !== undefined && n.releaseTime !== undefined
      ? getScrollYPosition(n.releaseTime, visualTime, receptorY, speedFactor, up, scrollModel)
      : undefined;

    let isVisible = false;
    if (isHoldBodyActive && endY !== undefined) {
      const minY = Math.min(bodyStartY, endY);
      const maxY = Math.max(bodyStartY, endY);
      isVisible = maxY >= -paddingLimit && minY <= height + paddingLimit;
      if (!isVisible && shouldDrawHead) {
        isVisible = y >= -paddingLimit && y <= height + paddingLimit;
      }
      if (!isVisible && shouldDrawEnd) {
        isVisible = endY >= -paddingLimit && endY <= height + paddingLimit;
      }
    } else if (shouldDrawHead) {
      isVisible = y >= -paddingLimit && y <= height + paddingLimit;
    } else if (shouldDrawEnd && endY !== undefined) {
      isVisible = endY >= -paddingLimit && endY <= height + paddingLimit;
    }
    if (!isVisible) continue;

    const opacity = getCoverOpacityForY(bodyStartY, height, receptorY, up, coverState) * noteOpacityVal;
    const endOpacity = endY !== undefined
      ? getCoverOpacityForY(endY, height, receptorY, up, coverState) * noteOpacityVal
      : undefined;

    const tailEngaged = n.isHeadHit || n.tailEngagedTime !== undefined;
    const engagementTime = n.isHeadHit
      ? n.hitTime ?? n.time
      : n.tailEngagedTime ?? n.time;
    const isLateTailStart = tailEngaged && !n.isHeadHit;
    const isEarlyReleased = n.earlyReleaseTime !== undefined && n.tailResumedTime === undefined;
    const frontierTime = tailEngaged
      ? Math.max(n.time, engagementTime, visualTime)
      : n.time;
    const bodyStartTime = isEarlyReleased
      ? Math.max(n.time, n.earlyReleaseTime ?? n.time)
      : isLateTailStart
      ? n.time
      : tailEngaged
        ? frontierTime
        : n.time;
    const judgedBodyEndTime = n.isReleaseHit && n.releaseTime !== undefined
      ? Math.min(n.endTime ?? n.releaseTime, Math.max(n.time, n.releaseTime))
      : n.endTime;
    // Entering the endpoint window arms a later release judgement, but does
    // not consume the tail. The endpoint remains an unhit note until that
    // release is actually judged successfully.
    const bodyEndTime = judgedBodyEndTime;
    const endpointTailStartTime = usesTailTicks && !n.isReleaseHit && n.tailTickEndTime !== undefined
      ? Math.max(bodyStartTime, n.tailTickEndTime)
      : undefined;
    const baseBodyEndTime = endpointTailStartTime !== undefined
      ? Math.min(bodyEndTime ?? endpointTailStartTime, endpointTailStartTime)
      : bodyEndTime;
    const visualMissedIntervals = usesTailTicks
      ? mergeTailIntervals(n.missedTailIntervals || [])
      : [];

    // When a late-start player begins holding immediately after a missed run,
    // bridge only that small visual handoff gap. This keeps the missed run as
    // one solid tail without hiding a genuinely cleared interval.
    const trailingMiss = visualMissedIntervals[visualMissedIntervals.length - 1];
    const hasClearedAfterEngagement = isLateTailStart
      ? (n.clearedTailIntervals || []).some(interval =>
        interval.startTime < frontierTime && interval.endTime > engagementTime)
      : false;
    const hasClearedGap = trailingMiss && tailEngaged
      ? (n.clearedTailIntervals || []).some(interval =>
        interval.startTime < frontierTime && interval.endTime > trailingMiss.endTime)
      : false;
    if (
      trailingMiss &&
      tailEngaged &&
      !isEarlyReleased &&
      bodyEndTime !== undefined &&
      bodyStartTime <= bodyEndTime &&
      n.tailTickIntervalMs !== undefined &&
      frontierTime > trailingMiss.endTime &&
      (isLateTailStart || frontierTime - trailingMiss.endTime <= n.tailTickIntervalMs + 0.001) &&
      !hasClearedGap
    ) {
      trailingMiss.endTime = frontierTime;
    }

    const tailSegments = usesTailTicks && n.tailTickStartTime !== undefined && n.tailTickEndTime !== undefined
      ? (() => {
        const segments: Array<{ startY: number; endY: number }> = [];
        // Once the head is hit, consume the unmissed tail from the moving
        // receptor edge. This keeps the remaining body continuous instead of
        // making each successful tick look like a detached visual chunk.
        if (isLateTailStart) {
          const visualPrefixEndTime = isEarlyReleased
            ? Math.max(engagementTime, n.earlyReleaseTime ?? engagementTime)
            : hasClearedAfterEngagement ? engagementTime : frontierTime;
          const prefixEndTime = baseBodyEndTime === undefined
            ? visualPrefixEndTime
            : Math.min(baseBodyEndTime, visualPrefixEndTime);
          if (prefixEndTime > n.time) {
            const clearedIntervals = isEarlyReleased
              ? mergeTailIntervals(n.clearedTailIntervals || [])
              : [];
            let prefixCursor = n.time;
            for (const cleared of clearedIntervals) {
              const clearedStart = Math.max(prefixCursor, cleared.startTime);
              const clearedEnd = Math.min(prefixEndTime, cleared.endTime);
              if (clearedEnd <= n.time || clearedStart >= clearedEnd) continue;
              if (clearedStart > prefixCursor) {
                segments.push({
                  startY: getScrollYPosition(prefixCursor, visualTime, receptorY, speedFactor, up, scrollModel),
                  endY: getScrollYPosition(clearedStart, visualTime, receptorY, speedFactor, up, scrollModel),
                });
              }
              prefixCursor = Math.max(prefixCursor, clearedEnd);
            }
            if (prefixCursor < prefixEndTime) {
              segments.push({
                startY: getScrollYPosition(prefixCursor, visualTime, receptorY, speedFactor, up, scrollModel),
                endY: getScrollYPosition(prefixEndTime, visualTime, receptorY, speedFactor, up, scrollModel),
              });
            }
          }
          if (baseBodyEndTime !== undefined && frontierTime < baseBodyEndTime) {
            segments.push({
              startY: getScrollYPosition(frontierTime, visualTime, receptorY, speedFactor, up, scrollModel),
              endY: getScrollYPosition(baseBodyEndTime, visualTime, receptorY, speedFactor, up, scrollModel),
            });
          }
          return segments;
        }

        let cursor = bodyStartTime;
        // Successful intervals are already consumed by the moving start edge
        // once the head is engaged. Subtracting them again would create a
        // visible gap at every tick. Missed intervals remain explicit holes so
        // their unhit texture can stay on-screen until it scrolls away.
        const consumedIntervals = mergeTailIntervals([
          ...(tailEngaged ? [] : (n.clearedTailIntervals || [])),
          ...visualMissedIntervals,
        ]);
        for (const consumed of consumedIntervals) {
          const consumedStart = Math.max(bodyStartTime, consumed.startTime);
          const consumedEnd = baseBodyEndTime === undefined
            ? consumed.endTime
            : Math.min(baseBodyEndTime, consumed.endTime);
          if (consumedEnd <= bodyStartTime || consumedStart >= consumedEnd) continue;
          if (consumedStart > cursor) {
            segments.push({
              startY: getScrollYPosition(cursor, visualTime, receptorY, speedFactor, up, scrollModel),
              endY: getScrollYPosition(consumedStart, visualTime, receptorY, speedFactor, up, scrollModel),
            });
          }
          cursor = Math.max(cursor, consumedEnd);
        }
        if (baseBodyEndTime !== undefined && cursor < baseBodyEndTime) {
          segments.push({
            startY: getScrollYPosition(cursor, visualTime, receptorY, speedFactor, up, scrollModel),
            endY: getScrollYPosition(baseBodyEndTime, visualTime, receptorY, speedFactor, up, scrollModel),
          });
        }
        return segments;
      })()
      : undefined;
    const missedTailSegments = usesTailTicks
      ? visualMissedIntervals.map(segment => ({
        startY: getScrollYPosition(segment.startTime, visualTime, receptorY, speedFactor, up, scrollModel),
        endY: getScrollYPosition(segment.endTime, visualTime, receptorY, speedFactor, up, scrollModel),
      }))
      : undefined;
    const endpointTailSegment = endpointTailStartTime !== undefined && bodyEndTime !== undefined && endpointTailStartTime < bodyEndTime
      ? {
        startY: getScrollYPosition(endpointTailStartTime, visualTime, receptorY, speedFactor, up, scrollModel),
        endY: getScrollYPosition(bodyEndTime, visualTime, receptorY, speedFactor, up, scrollModel),
      }
      : undefined;

    visible.push({
      id: n.id,
      column: n.column,
      type: n.type,
      time: n.time,
      endTime: n.endTime,
      isHit: n.isHit,
      isReleased: n.isReleased,
      isMissed: n.isMissed,
      isHoldFailed: n.isHoldFailed,
      isReleaseMissed: n.isReleaseMissed,
      isReleaseHit: n.isReleaseHit,
      isHolding,
      isEndPassed,
      earlyReleaseTime: n.earlyReleaseTime,
      tailResumedTime: n.tailResumedTime,
      releaseZoneArmedTime: n.releaseZoneArmedTime,
      holdRulesVersion: n.holdRulesVersion,
      releaseTime: n.releaseTime,
      releaseGraceUntil: n.releaseGraceUntil,
      y,
      bodyStartY,
      hitSegmentStartY,
      hitSegmentEndY,
      endY,
      opacity,
      endOpacity,
      tailSegments,
      missedTailSegments,
      endpointTailSegment,
      styleKey: n.type === 'hold' ? 'hold' : 'normal',
    });
  }

  return visible;
}
