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
import type { HitObject, JudgementWindow, ReplayFrame } from '../src/types';
import {
  computeAccuracyPercent,
  computeGrade,
  computeMaxComboPortion,
  computeModMultiplier,
  computeTotalScore,
  getHpDrainMultiplier,
} from '../src/ruleset/mania/scoreProcessor';
import {
  getHoldTailJudgement,
  isHoldGraceActive,
  resolveHoldGrace,
  resolveJudgementForError,
} from '../src/ruleset/mania/judgementTiming';
import {
  JUDGEMENT_DISPLAY_NAMES,
  JUDGEMENT_UPPERCASE_NAMES,
  getJudgementDisplayName,
  getJudgementUppercaseName,
} from '../src/ruleset/mania/judgements';
import {
  consumeReplayFrames,
  createReplayCursor,
  normalizeReplayFrames,
  resetReplayCursor,
  upperBoundReplayFrame,
} from '../src/utils/replayCursor';
import { UnstableRateAccumulator } from '../src/utils/unstableRateAccumulator';
import {
  advanceHoldTailTicks,
  HOLD_TICK_RULES_VERSION,
  initializeHoldTailTicks,
  markHoldTailEngaged,
  markHoldEarlyRelease,
  markHoldTailResumed,
  resolveHoldTickInterval,
} from '../src/utils/holdTickRules';

const windows: JudgementWindow[] = [
  { type: 'marvelous', name: 'PERFECT', windowMs: 10, baseScore: 305, hpDelta: 3, color: '', glowColor: '' },
  { type: 'perfect', name: 'GREAT', windowMs: 20, baseScore: 300, hpDelta: 2, color: '', glowColor: '' },
  { type: 'miss', name: 'MISS', windowMs: 30, baseScore: 0, hpDelta: -10, color: '', glowColor: '' },
];

describe('score and judgement math', () => {
  it('keeps accuracy, grade, combo score, and modifiers deterministic', () => {
    const counts = { marvelousCount: 2, perfectCount: 0, greatCount: 0, goodCount: 0, badCount: 0, missCount: 0 };
    expect(computeAccuracyPercent(counts)).toBe(100);
    expect(computeGrade(100, counts)).toBe('SS');
    expect(computeMaxComboPortion(2)).toBe(300);
    expect(computeTotalScore({
      currentComboPortion: 300,
      maxComboPortion: 300,
      accuracyPercent: 100,
      judgedCount: 2,
      totalJudgements: 2,
    })).toBe(1_000_000);
    expect(computeModMultiplier(['NF', 'HD'])).toBeCloseTo(0.5);
    expect(computeGrade(98, { ...counts, perfectCount: 1, greatCount: 1 })).toBe('S');
  });

  it('calculates osu!(lazer) mania mod multipliers correctly (TASK-030)', () => {
    // Single modifiers
    expect(computeModMultiplier([])).toBe(1);
    expect(computeModMultiplier(null)).toBe(1);
    expect(computeModMultiplier(undefined)).toBe(1);
    expect(computeModMultiplier(['NF'])).toBeCloseTo(0.5);
    expect(computeModMultiplier(['EZ'])).toBeCloseTo(0.5);
    expect(computeModMultiplier(['HT'])).toBeCloseTo(0.5);
    expect(computeModMultiplier(['HR'])).toBeCloseTo(1.0);
    expect(computeModMultiplier(['HD'])).toBeCloseTo(1.0);
    expect(computeModMultiplier(['DT'])).toBeCloseTo(1.0);

    // Key conversion modifiers (K2-K9 = 0.90x)
    for (let k = 2; k <= 9; k++) {
      expect(computeModMultiplier([`K${k}`])).toBeCloseTo(0.9);
    }

    // Compound modifiers
    expect(computeModMultiplier(['EZ', 'NF'])).toBeCloseTo(0.25);
    expect(computeModMultiplier(['HD', 'DT', 'HR'])).toBeCloseTo(1.0);
    expect(computeModMultiplier(['EZ', 'DT'])).toBeCloseTo(0.5);
    expect(computeModMultiplier(['HD', 'DT', 'K4'])).toBeCloseTo(0.9);
    expect(computeModMultiplier(['NF', 'HD', 'K7'])).toBeCloseTo(0.45);
  });

  it('applies EZ and HR HP drain modifiers on top of map drain', () => {
    expect(getHpDrainMultiplier(5, [])).toBeCloseTo(1.2);
    expect(getHpDrainMultiplier(5, ['EZ'])).toBeCloseTo(0.6);
    expect(getHpDrainMultiplier(5, ['HR'])).toBeCloseTo(1.68);
    expect(getHpDrainMultiplier(6, ['EZ'])).toBeCloseTo(0.4);
    expect(getHpDrainMultiplier(6, ['HR'])).toBeCloseTo(1.12);
  });

  it('uses ordered timing windows and does not revive expired hold grace', () => {
    expect(resolveJudgementForError(10, windows).type).toBe('marvelous');
    expect(resolveJudgementForError(21, windows).type).toBe('miss');
    expect(getHoldTailJudgement(-25, windows).type).toBe('miss');
    expect(isHoldGraceActive(100, 100)).toBe(true);
    expect(isHoldGraceActive(101, 100)).toBe(false);

    const note: HitObject = {
      id: 'hold', time: 0, column: 0, type: 'hold', endTime: 1000,
      isHit: true, isReleased: true, isMissed: false, isHoldFailed: false,
      releaseGraceUntil: 100,
    };
    expect(resolveHoldGrace(note, 100).resolution).toBe('active');
    expect(resolveHoldGrace(note, 101)).toMatchObject({ resolution: 'expired', isHoldFailed: true, isReleased: true });
  });

  it('maps judgement schema types to osu!(lazer) display and uppercase names', () => {
    expect(JUDGEMENT_DISPLAY_NAMES.marvelous).toBe('Perfect');
    expect(JUDGEMENT_DISPLAY_NAMES.perfect).toBe('Great');
    expect(JUDGEMENT_DISPLAY_NAMES.great).toBe('Good');
    expect(JUDGEMENT_DISPLAY_NAMES.good).toBe('Ok');
    expect(JUDGEMENT_DISPLAY_NAMES.bad).toBe('Meh');
    expect(JUDGEMENT_DISPLAY_NAMES.miss).toBe('Miss');

    expect(JUDGEMENT_UPPERCASE_NAMES.marvelous).toBe('PERFECT');
    expect(JUDGEMENT_UPPERCASE_NAMES.perfect).toBe('GREAT');
    expect(JUDGEMENT_UPPERCASE_NAMES.great).toBe('GOOD');
    expect(JUDGEMENT_UPPERCASE_NAMES.good).toBe('OK');
    expect(JUDGEMENT_UPPERCASE_NAMES.bad).toBe('MEH');
    expect(JUDGEMENT_UPPERCASE_NAMES.miss).toBe('MISS');

    expect(getJudgementDisplayName('marvelous')).toBe('Perfect');
    expect(getJudgementUppercaseName('marvelous')).toBe('PERFECT');
    expect(getJudgementDisplayName('bad')).toBe('Meh');
    expect(getJudgementUppercaseName('bad')).toBe('MEH');
  });
});

describe('discrete hold tail ticks', () => {
  it('starts strictly after the Bad window and records one miss per uninterrupted run', () => {
    const hold: HitObject = {
      id: 'hold', time: 0, column: 0, type: 'hold', endTime: 400,
      isHit: false, isReleased: false, isMissed: false, isHoldFailed: false,
      isHeadHit: true,
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
    };
    initializeHoldTailTicks(hold, 30, 50);
    expect(hold.nextTailTickTime).toBeGreaterThan(30);
    const misses: number[] = [];
    advanceHoldTailTicks([hold], 81, [false], () => misses.push(1));
    expect(misses).toHaveLength(1);
    expect(hold.missedTailIntervals).toEqual([{ startTime: expect.any(Number), endTime: expect.any(Number) }]);
    advanceHoldTailTicks([hold], 181, [false], () => misses.push(1));
    expect(misses).toHaveLength(1);
    advanceHoldTailTicks([hold], 231, [true], () => misses.push(1));
    advanceHoldTailTicks([hold], 281, [false], () => misses.push(1));
    expect(misses).toHaveLength(2);
  });

  it('records successfully held tail intervals as consumed visual sections', () => {
    const hold: HitObject = {
      id: 'hold', time: 0, column: 0, type: 'hold', endTime: 400,
      isHit: false, isReleased: false, isMissed: false, isHoldFailed: false,
      isHeadHit: true,
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
    };
  initializeHoldTailTicks(hold, 30, 50);

  advanceHoldTailTicks([hold], 81, [true], () => undefined);

    expect(hold.clearedTailIntervals).toEqual([
      { startTime: expect.any(Number), endTime: expect.any(Number) },
    ]);
    expect(hold.missedTailIntervals).toEqual([]);
  });

  it('cannot mark a release as successful from an active tail state', () => {
    const hold: HitObject = {
      id: 'hold', time: 0, column: 0, type: 'hold', endTime: 400,
      isHit: true, isReleased: false, isMissed: false, isHoldFailed: false,
      isReleaseHit: true,
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
    };
    initializeHoldTailTicks(hold, 30, 50);
    advanceHoldTailTicks([hold], 81, [true], () => undefined);
    expect(hold.isReleaseHit).toBe(false);
  });

  it('requires a release and re-press when the lane was inherited at the hold head', () => {
    const hold: HitObject = {
      id: 'hold', time: 0, column: 0, type: 'hold', endTime: 400,
      isHit: false, isReleased: false, isMissed: true, isHoldFailed: false,
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
    };
    initializeHoldTailTicks(hold, 30, 50);
    const misses: number[] = [];

    advanceHoldTailTicks([hold], 31, [true], () => misses.push(1));
    advanceHoldTailTicks([hold], 131, [true], () => misses.push(1));

    expect(hold.tailRequiresRepress).toBe(true);
    expect(hold.clearedTailIntervals).toEqual([]);
    expect(misses).toHaveLength(1);

    markHoldTailEngaged(hold, 140);
    advanceHoldTailTicks([hold], 181, [true], () => misses.push(1));

    expect(hold.tailRequiresRepress).toBe(false);
    expect(hold.clearedTailIntervals?.length).toBeGreaterThan(0);
  });

  it('clamps invalid tick configuration to the safe default', () => {
    expect(resolveHoldTickInterval(10)).toBe(10);
    expect(resolveHoldTickInterval(100)).toBe(100);
    expect(resolveHoldTickInterval(9)).toBe(50);
    expect(resolveHoldTickInterval('bad')).toBe(50);
  });

  it('starts a new early-release cycle after a re-press', () => {
    const hold: HitObject = {
      id: 'hold', time: 0, column: 0, type: 'hold', endTime: 1000,
      isHit: true, isReleased: false, isMissed: true, isHoldFailed: false,
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
    };

    markHoldEarlyRelease(hold, 200);
    markHoldTailResumed(hold, 300);
    markHoldEarlyRelease(hold, 400);

    expect(hold.earlyReleaseTime).toBe(400);
    expect(hold.tailResumedTime).toBeUndefined();
  });
});

describe('replay cursor and unstable rate math', () => {
  it('normalizes lane width, sorts stably, and consumes frames once', () => {
    const frames: ReplayFrame[] = [
      { time: 20, keysPressed: [true, false, true] },
      { time: 10, keysPressed: [false] },
      { time: 20, keysPressed: [false, true] },
    ];
    const normalized = normalizeReplayFrames(frames, 2);
    expect(normalized).toEqual([
      { time: 10, keysPressed: [false, false] },
      { time: 20, keysPressed: [true, false] },
      { time: 20, keysPressed: [false, true] },
    ]);
    expect(upperBoundReplayFrame(normalized, 20)).toBe(3);

    const cursor = createReplayCursor();
    const consumed: number[] = [];
    consumeReplayFrames(normalized, cursor, 15, frame => consumed.push(frame.time));
    consumeReplayFrames(normalized, cursor, 20, frame => consumed.push(frame.time));
    expect(consumed).toEqual([10, 20, 20]);
    resetReplayCursor(cursor, normalized, 10);
    expect(cursor.nextIndex).toBe(1);
  });

  it('matches population standard deviation and ignores non-finite samples', () => {
    const accumulator = new UnstableRateAccumulator();
    expect(accumulator.add(Number.NaN)).toBe(false);
    [10, 20, 30].forEach(value => accumulator.add(value));
    expect(accumulator.sampleCount).toBe(3);
    expect(accumulator.populationStandardDeviation).toBeCloseTo(Math.sqrt(200 / 3));
    expect(accumulator.unstableRate).toBeCloseTo(Math.sqrt(200 / 3) * 10);
  });
});

describe('autonomous misses with lazer hold rules (TASK-021)', () => {
  it('handles head timeout and tail timeout for version 3 lazer holds without ticks', async () => {
    const { checkNotesAutonomousMisses } = await import('../src/components/GameplayCanvas');
    const { createHoldNoteState, LAZER_HOLD_RULES_VERSION } = await import('../src/ruleset/mania/holdNote');

    const holdNote: HitObject = {
      id: 'hold_v3',
      time: 1000,
      endTime: 2000,
      column: 0,
      type: 'hold',
      isHit: false,
      isReleased: false,
      isMissed: false,
      isHoldFailed: false,
      holdRulesVersion: LAZER_HOLD_RULES_VERSION,
      holdState: createHoldNoteState({ id: 'hold_v3', startTime: 1000, endTime: 2000, column: 0 }),
    };

    const misses: HitObject[] = [];
    const onMiss = (n: HitObject) => misses.push(n);

    // 1. Before head expiry (t = 1100, missBound = 150 -> expiry = 1150)
    checkNotesAutonomousMisses([holdNote], 1100, 150, onMiss);
    expect(misses).toHaveLength(0);
    expect(holdNote.isMissed).toBe(false);

    // 2. After head expiry (t = 1200 > 1150) -> head miss
    checkNotesAutonomousMisses([holdNote], 1200, 150, onMiss);
    expect(misses).toHaveLength(1);
    expect(holdNote.isMissed).toBe(true);
    expect(holdNote.holdState?.headMissed).toBe(true);
    expect(holdNote.holdState?.hasHoldBreak).toBe(true);
    expect(holdNote.isReleased).toBe(false);

    // 3. Before tail expiry (endTime = 2000, 1.5x lenience -> expiry = 2000 + 150 * 1.5 = 2225)
    checkNotesAutonomousMisses([holdNote], 2200, 150, onMiss);
    expect(misses).toHaveLength(1); // No new miss yet
    expect(holdNote.isReleased).toBe(false);

    // 4. After tail expiry (t = 2300 > 2225) -> tail miss
    checkNotesAutonomousMisses([holdNote], 2300, 150, onMiss);
    expect(misses).toHaveLength(2); // Tail missed
    expect(holdNote.isReleased).toBe(true);
    expect(holdNote.isReleaseMissed).toBe(true);
    expect(holdNote.isHoldFailed).toBe(true);
    expect(holdNote.holdState?.tailMissed).toBe(true);
    expect(holdNote.holdState?.isComplete).toBe(true);
  });
});

