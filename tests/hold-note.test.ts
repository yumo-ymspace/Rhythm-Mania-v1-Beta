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

import { describe, expect, it } from 'vitest';
import {
  capJudgementAtMeh,
  createHoldNoteState,
  getEarliestTailHitTime,
  getEffectiveTailOffset,
  getLatestTailHitTime,
  HOLD_MEH_CAP_TYPE,
  isTailHittable,
  judgeHoldTail,
  missHoldHead,
  missHoldTail,
  onHoldKeyPress,
  onHoldKeyRelease,
  resolveHoldTailJudgement,
  resolveManiaHitResult,
  TAIL_RELEASE_WINDOW_LENIENCE,
  updateHoldNoteTime,
} from '../src/ruleset/mania/holdNote';
import { getJudgementWindows } from '../src/ruleset/mania/hitWindows';
import { ACCURACY_BASE_SCORE, computeAccuracyPercent } from '../src/ruleset/mania/scoreProcessor';

describe('osu!(lazer) mania HoldNote ruleset module (TASK-020)', () => {
  const od5Windows = getJudgementWindows(5);

  describe('Constants & Tail Lenience Math', () => {
    it('uses 1.5x release window lenience matching osu!(lazer) TailNote.RELEASE_WINDOW_LENIENCE', () => {
      expect(TAIL_RELEASE_WINDOW_LENIENCE).toBe(1.5);
      expect(HOLD_MEH_CAP_TYPE).toBe('bad');
    });

    it('scales raw release offset by 1 / 1.5', () => {
      expect(getEffectiveTailOffset(30)).toBe(20);
      expect(getEffectiveTailOffset(-45)).toBe(-30);
      expect(getEffectiveTailOffset(0)).toBe(0);
    });
  });

  describe('Hit Result Resolution & Lazer Late Meh Rule', () => {
    it('resolves standard hit results symmetrically when within window', () => {
      // OD 5 Marvelous = 19.5
      expect(resolveManiaHitResult(10, od5Windows)).toBe('marvelous');
      expect(resolveManiaHitResult(-10, od5Windows)).toBe('marvelous');

      // OD 5 Perfect = 49.5
      expect(resolveManiaHitResult(30, od5Windows)).toBe('perfect');
      expect(resolveManiaHitResult(-30, od5Windows)).toBe('perfect');

      // OD 5 Great = 82.5
      expect(resolveManiaHitResult(60, od5Windows)).toBe('great');
      expect(resolveManiaHitResult(-60, od5Windows)).toBe('great');

      // OD 5 Good (Ok) = 112.5
      expect(resolveManiaHitResult(100, od5Windows)).toBe('good');
      expect(resolveManiaHitResult(-100, od5Windows)).toBe('good');
    });

    it('allows early Meh but converts late Meh to Miss matching osu!(lazer) ManiaHitWindows', () => {
      // OD 5 Good/Ok = 112.5, Bad/Meh = 136.5
      // Early at -125 is early Meh ('bad')
      expect(resolveManiaHitResult(-125, od5Windows)).toBe('bad');

      // Late at +125 is late Meh -> must convert to Miss!
      expect(resolveManiaHitResult(125, od5Windows)).toBe('miss');
    });

    it('treats offsets beyond the miss window as Miss', () => {
      expect(resolveManiaHitResult(200, od5Windows)).toBe('miss');
      expect(resolveManiaHitResult(-200, od5Windows)).toBe('miss');
    });
  });

  describe('Meh Capping Rule', () => {
    it('caps judgements better than Meh to Meh (internal "bad")', () => {
      expect(capJudgementAtMeh('marvelous')).toBe('bad');
      expect(capJudgementAtMeh('perfect')).toBe('bad');
      expect(capJudgementAtMeh('great')).toBe('bad');
      expect(capJudgementAtMeh('good')).toBe('bad');
    });

    it('keeps Meh as Meh and Miss as Miss when capped', () => {
      expect(capJudgementAtMeh('bad')).toBe('bad');
      expect(capJudgementAtMeh('miss')).toBe('miss');
    });
  });

  describe('Tail Judgement Resolution with 1.5x Lenience and Cap', () => {
    it('evaluates OD 5 20ms late release as Marvelous (osu! Perfect) thanks to 1.5x lenience', () => {
      // 20ms / 1.5 = 13.33ms <= 19.5 (OD 5 Marvelous window)
      const result = resolveHoldTailJudgement(20, od5Windows, false);
      expect(result.effectiveErrorMs).toBeCloseTo(13.333, 2);
      expect(result.rawJudgement).toBe('marvelous');
      expect(result.judgement).toBe('marvelous');
      expect(result.isCapped).toBe(false);
    });

    it('evaluates OD 5 60ms late release as Perfect (osu! Great) with 1.5x lenience', () => {
      // 60ms / 1.5 = 40.0ms <= 49.5 (OD 5 Perfect window)
      const result = resolveHoldTailJudgement(60, od5Windows, false);
      expect(result.effectiveErrorMs).toBe(40);
      expect(result.rawJudgement).toBe('perfect');
      expect(result.judgement).toBe('perfect');
      expect(result.isCapped).toBe(false);
    });

    it('caps on-time tail release at Meh when isCapped is true', () => {
      const result = resolveHoldTailJudgement(0, od5Windows, true);
      expect(result.rawJudgement).toBe('marvelous');
      expect(result.judgement).toBe('bad');
      expect(result.isCapped).toBe(true);
    });

    it('caps Good (Ok) tail release at Meh when isCapped is true', () => {
      // -100ms / 1.5 = -66.67ms -> Great (Good) window
      const result = resolveHoldTailJudgement(-100, od5Windows, true);
      expect(result.rawJudgement).toBe('great');
      expect(result.judgement).toBe('bad');
      expect(result.isCapped).toBe(true);
    });

    it('does not upgrade a missed tail to Meh when isCapped is true', () => {
      // 300ms / 1.5 = 200ms -> Miss
      const result = resolveHoldTailJudgement(300, od5Windows, true);
      expect(result.rawJudgement).toBe('miss');
      expect(result.judgement).toBe('miss');
      expect(result.isCapped).toBe(false);
    });

    it('converts late release in Meh range (180ms raw / 120ms effective) to Miss', () => {
      // 180ms / 1.5 = 120ms (between 112.5 Good and 136.5 Bad) -> Late Meh is Miss
      const result = resolveHoldTailJudgement(180, od5Windows, false);
      expect(result.rawJudgement).toBe('miss');
      expect(result.judgement).toBe('miss');
    });

    it('allows early release in Meh range (-180ms raw / -120ms effective) as Meh', () => {
      const result = resolveHoldTailJudgement(-180, od5Windows, false);
      expect(result.rawJudgement).toBe('bad');
      expect(result.judgement).toBe('bad');
    });
  });

  describe('Tail Hittable Window Boundaries', () => {
    it('computes earliest and latest hittable times for tail', () => {
      const endTime = 2000;
      // OD 5 Bad window = 136.5 -> earliest = 2000 - 136.5 * 1.5 = 2000 - 204.75 = 1795.25
      expect(getEarliestTailHitTime(endTime, od5Windows)).toBeCloseTo(1795.25);
      // OD 5 Good window = 112.5 -> latest = 2000 + 112.5 * 1.5 = 2000 + 168.75 = 2168.75
      expect(getLatestTailHitTime(endTime, od5Windows)).toBeCloseTo(2168.75);

      expect(isTailHittable(1800, endTime, od5Windows)).toBe(true);
      expect(isTailHittable(2000, endTime, od5Windows)).toBe(true);
      expect(isTailHittable(2150, endTime, od5Windows)).toBe(true);
      expect(isTailHittable(1700, endTime, od5Windows)).toBe(false); // Too early (body)
      expect(isTailHittable(2200, endTime, od5Windows)).toBe(false); // Too late (miss)
    });
  });

  describe('Full Hold Lifecycle Scenarios', () => {
    it('Scenario 1: Perfect Full Hold (FC) -> 2 Marvelous, +2 Combo', () => {
      const hold = createHoldNoteState({ startTime: 1000, endTime: 2000, column: 0 });

      // 1. Press on time at t = 1000
      const headAction = onHoldKeyPress(hold, 1000, od5Windows);
      expect(headAction).toEqual({
        kind: 'head_hit',
        judgement: 'marvelous',
        rawJudgement: 'marvelous',
        errorMs: 0,
        hitTime: 1000,
        comboChange: 1,
      });
      expect(hold.isHolding).toBe(true);
      expect(hold.hasHoldBreak).toBe(false);

      // 2. Release on time at t = 2000
      const tailAction = onHoldKeyRelease(hold, 2000, od5Windows);
      expect(tailAction).toEqual({
        kind: 'tail_hit',
        judgement: 'marvelous',
        rawJudgement: 'marvelous',
        rawOffsetMs: 0,
        effectiveErrorMs: 0,
        releaseTime: 2000,
        isCapped: false,
        comboChange: 1,
      });
      expect(hold.isComplete).toBe(true);
      expect(hold.isTailCapped).toBe(false);
    });

    it('Scenario 2: Early release during body triggers ComboBreak and caps tail at Meh', () => {
      const hold = createHoldNoteState({ startTime: 1000, endTime: 2000, column: 0 });

      // 1. Press on time
      const headAction = onHoldKeyPress(hold, 1000, od5Windows);
      expect(headAction?.kind).toBe('head_hit');
      expect(hold.isHolding).toBe(true);

      // 2. Early release at t = 1400 (well before earliest tail window ~1795.25)
      const bodyAction = onHoldKeyRelease(hold, 1400, od5Windows);
      expect(bodyAction).toEqual({
        kind: 'body_break',
        time: 1400,
        comboChange: 0,
      });
      expect(hold.isHolding).toBe(false);
      expect(hold.hasHoldBreak).toBe(true);

      // 3. Re-press at t = 1850 (before end time)
      const repressAction = onHoldKeyPress(hold, 1850, od5Windows);
      expect(repressAction).toBeNull(); // Re-press arms holding without score event
      expect(hold.isHolding).toBe(true);

      // 4. Release on time at t = 2000
      const tailAction = onHoldKeyRelease(hold, 2000, od5Windows);
      expect(tailAction).toEqual({
        kind: 'tail_hit',
        judgement: 'bad', // Capped at Meh!
        rawJudgement: 'marvelous',
        rawOffsetMs: 0,
        effectiveErrorMs: 0,
        releaseTime: 2000,
        isCapped: true,
        comboChange: 1,
      });
      expect(hold.isComplete).toBe(true);
      expect(hold.isTailCapped).toBe(true);
    });

    it('Scenario 3: Early release during body without re-press times out to tail miss', () => {
      const hold = createHoldNoteState({ startTime: 1000, endTime: 2000, column: 0 });

      // 1. Press on time
      onHoldKeyPress(hold, 1000, od5Windows);

      // 2. Early release at t = 1300
      const bodyAction = onHoldKeyRelease(hold, 1300, od5Windows);
      expect(bodyAction?.kind).toBe('body_break');
      expect(hold.hasHoldBreak).toBe(true);

      // 3. Time advances past tail expiry (e.g. t = 2300)
      const timeoutActions = updateHoldNoteTime(hold, 2300, od5Windows);
      expect(timeoutActions).toHaveLength(1);
      expect(timeoutActions[0]).toEqual({
        kind: 'tail_miss',
        judgement: 'miss',
        time: 2300,
        comboChange: 0,
      });
      expect(hold.tailMissed).toBe(true);
      expect(hold.isComplete).toBe(true);
    });

    it('Scenario 4: Head missed, re-pressed and held, tail released on time -> tail capped at Meh', () => {
      const hold = createHoldNoteState({ startTime: 1000, endTime: 2000, column: 0 });

      // 1. Head expires at t = 1200 (past miss window 173.5ms)
      const headTimeout = updateHoldNoteTime(hold, 1200, od5Windows);
      expect(headTimeout).toHaveLength(1);
      expect(headTimeout[0]).toEqual({
        kind: 'head_miss',
        judgement: 'miss',
        time: 1173.5,
        comboChange: 0,
      });
      expect(hold.headMissed).toBe(true);
      expect(hold.hasHoldBreak).toBe(true);

      // 2. Player re-presses at t = 1500 to catch the tail
      onHoldKeyPress(hold, 1500, od5Windows);
      expect(hold.isHolding).toBe(true);

      // 3. Tail released on time at t = 2000
      const tailAction = onHoldKeyRelease(hold, 2000, od5Windows);
      expect(tailAction).toEqual({
        kind: 'tail_hit',
        judgement: 'bad', // Capped at Meh because head was missed!
        rawJudgement: 'marvelous',
        rawOffsetMs: 0,
        effectiveErrorMs: 0,
        releaseTime: 2000,
        isCapped: true,
        comboChange: 1,
      });
      expect(hold.isComplete).toBe(true);
    });

    it('Scenario 5: Cannot start holding in the tail late-lenience window (after endTime)', () => {
      const hold = createHoldNoteState({ startTime: 1000, endTime: 2000, column: 0 });

      // Head expires
      updateHoldNoteTime(hold, 1200, od5Windows);
      expect(hold.headMissed).toBe(true);

      // Press at t = 2050 (after endTime 2000)
      const pressAction = onHoldKeyPress(hold, 2050, od5Windows);
      expect(pressAction).toBeNull();
      expect(hold.isHolding).toBe(false); // Does not engage holding
    });

    it('Scenario 6: Head pressed early in miss window -> Head Miss', () => {
      const hold = createHoldNoteState({ startTime: 1000, endTime: 2000, column: 0 });

      // Press 150ms early at t = 850 (OD 5 Bad is 136.5, Miss is 173.5 -> early miss)
      const headAction = onHoldKeyPress(hold, 850, od5Windows);
      expect(headAction).toEqual({
        kind: 'head_miss',
        judgement: 'miss',
        time: 850,
        comboChange: 0,
      });
      expect(hold.headMissed).toBe(true);
      expect(hold.hasHoldBreak).toBe(true);
      expect(hold.isHolding).toBe(false);
    });

    it('Scenario 7: Accuracy calculation for FC vs Meh-capped hold', () => {
      // 1. FC hold: 2 Marvelous
      const fcCounts = {
        marvelousCount: 2,
        perfectCount: 0,
        greatCount: 0,
        goodCount: 0,
        badCount: 0,
        missCount: 0,
      };
      expect(computeAccuracyPercent(fcCounts)).toBe(100);

      // 2. Body-broken hold: 1 Marvelous (head) + 1 Meh (tail capped)
      const brokenCounts = {
        marvelousCount: 1,
        perfectCount: 0,
        greatCount: 0,
        goodCount: 0,
        badCount: 1,
        missCount: 0,
      };
      // (305 + 50) / (2 * 305) = 355 / 610 = 58.1967...%
      expect(computeAccuracyPercent(brokenCounts)).toBeCloseTo(58.1967, 3);
      expect(ACCURACY_BASE_SCORE.marvelous).toBe(305);
      expect(ACCURACY_BASE_SCORE.bad).toBe(50);

      // 3. Head missed + Meh-capped tail: 1 Miss + 1 Meh
      const headMissCounts = {
        marvelousCount: 0,
        perfectCount: 0,
        greatCount: 0,
        goodCount: 0,
        badCount: 1,
        missCount: 1,
      };
      // (0 + 50) / (2 * 305) = 50 / 610 = 8.1967...%
      expect(computeAccuracyPercent(headMissCounts)).toBeCloseTo(8.1967, 3);
    });
  });
});
