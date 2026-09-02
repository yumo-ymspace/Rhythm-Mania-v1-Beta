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
import type { Beatmap, HitObject, ReplayFrame } from '../src/types';
import { simulateManiaReplay } from '../src/ruleset/mania/replaySimulator';
import { LAZER_HOLD_RULES_VERSION } from '../src/ruleset/mania/holdNote';
import { HOLD_TICK_RULES_VERSION } from '../src/utils/holdTickRules';

function createTestNote(params: {
  id: string;
  time: number;
  column: number;
  type?: 'normal' | 'hold';
  endTime?: number;
}): HitObject {
  return {
    id: params.id,
    time: params.time,
    column: params.column,
    type: params.type || (params.endTime !== undefined ? 'hold' : 'normal'),
    endTime: params.endTime,
    isHit: false,
    isReleased: false,
    isMissed: false,
    isHoldFailed: false,
  };
}

function createTestBeatmap(params: {
  id: string;
  title?: string;
  artist?: string;
  creator?: string;
  difficulty?: string;
  keyCount?: number;
  overallDifficulty?: number;
  hpDrainRate?: number;
  duration?: number;
  notes: HitObject[];
}): Beatmap {
  return {
    id: params.id,
    title: params.title || 'Test Title',
    artist: params.artist || 'Test Artist',
    creator: params.creator || 'Mapper',
    difficulty: params.difficulty || 'Normal',
    keyCount: params.keyCount || 4,
    overallDifficulty: params.overallDifficulty ?? 5,
    hpDrainRate: params.hpDrainRate ?? 5,
    duration: params.duration ?? 5,
    bpm: 120,
    sliderMultiplier: 1.4,
    timingPoints: [{ timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1 }],
    notes: params.notes,
  };
}

describe('Local Replay Simulation (TASK-022)', () => {
  const sampleMap = createTestBeatmap({
    id: 'test_map',
    title: 'Simulation Test Song',
    artist: 'Test Artist',
    creator: 'Mapper',
    difficulty: 'Normal',
    keyCount: 4,
    overallDifficulty: 5,
    hpDrainRate: 5,
    duration: 5,
    notes: [
      createTestNote({ id: 'note_1', time: 1000, column: 0, type: 'normal' }),
      createTestNote({ id: 'hold_2', time: 2000, endTime: 3000, column: 1, type: 'hold' }),
      createTestNote({ id: 'note_3', time: 4000, column: 2, type: 'normal' }),
    ],
  });

  describe('Version 3 osu!(lazer) Hold Rules Replay Simulation', () => {
    it('simulates a clean Full Combo run (v3)', () => {
      // Replay frames:
      // t=0: all keys up
      // t=1000: press col 0 (note 1)
      // t=1050: release col 0
      // t=2000: press col 1 (hold 2 head)
      // t=3000: release col 1 (hold 2 tail)
      // t=4000: press col 2 (note 3)
      // t=4050: release col 2
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1000, keysPressed: [true, false, false, false] },
        { time: 1050, keysPressed: [false, false, false, false] },
        { time: 2000, keysPressed: [false, true, false, false] },
        { time: 3000, keysPressed: [false, false, false, false] },
        { time: 4000, keysPressed: [false, false, true, false] },
        { time: 4050, keysPressed: [false, false, false, false] },
      ];

      const result = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
      });

      expect(result.scoreState.missCount).toBe(0);
      expect(result.scoreState.badCount).toBe(0);
      expect(result.scoreState.marvelousCount).toBe(4); // note1 + hold head + hold tail + note3 = 4 judgements
      expect(result.scoreState.maxCombo).toBe(4);
      expect(result.scoreState.accuracy).toBe(100);
      expect(result.scoreState.score).toBe(1_000_000);
    });

    it('simulates early release ComboBreak on hold body with re-press and capped tail (v3)', () => {
      // Replay frames:
      // t=1000: press col 0 -> hit note 1 (combo 1)
      // t=1050: release col 0
      // t=2000: press col 1 -> hit hold 2 head (combo 2)
      // t=2300: release col 1 -> early body break! (combo resets to 0, no acc change)
      // t=2800: re-press col 1 -> re-engages holding
      // t=3000: release col 1 -> tail hit on time, but capped at Meh ('bad') -> combo 1
      // t=4000: press col 2 -> hit note 3 (combo 2)
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1000, keysPressed: [true, false, false, false] },
        { time: 1050, keysPressed: [false, false, false, false] },
        { time: 2000, keysPressed: [false, true, false, false] },
        { time: 2300, keysPressed: [false, false, false, false] }, // ComboBreak!
        { time: 2800, keysPressed: [false, true, false, false] }, // Re-press
        { time: 3000, keysPressed: [false, false, false, false] }, // Tail hit (capped)
        { time: 4000, keysPressed: [false, false, true, false] },
        { time: 4050, keysPressed: [false, false, false, false] },
      ];

      const result = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
      });

      expect(result.scoreState.marvelousCount).toBe(3); // note 1, hold head, note 3
      expect(result.scoreState.badCount).toBe(1); // hold tail capped at Meh
      expect(result.scoreState.missCount).toBe(0); // ComboBreak is not an accuracy miss
      expect(result.scoreState.maxCombo).toBe(2); // Broke after head, then maxed at 2
      expect(result.scoreState.comboBreakCount).toBe(1);

      // Accuracy: (305 * 3 + 50 * 1) / (305 * 4) = (915 + 50) / 1220 = 965 / 1220 = 79.098...%
      expect(result.scoreState.accuracy).toBeCloseTo(79.098, 2);
    });

    it('simulates early release ComboBreak without re-press timing out to tail miss (v3)', () => {
      // Drop hold at t=2300 and never re-press
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1000, keysPressed: [true, false, false, false] },
        { time: 1050, keysPressed: [false, false, false, false] },
        { time: 2000, keysPressed: [false, true, false, false] },
        { time: 2300, keysPressed: [false, false, false, false] }, // Drop hold
        { time: 4000, keysPressed: [false, false, true, false] },
        { time: 4050, keysPressed: [false, false, false, false] },
      ];

      const result = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
      });

      expect(result.scoreState.marvelousCount).toBe(3); // note 1, hold head, note 3
      expect(result.scoreState.missCount).toBe(1); // tail timed out
      expect(result.scoreState.comboBreakCount).toBe(1);
    });

    it('simulates head miss with salvage and capped tail release (v3)', () => {
      // Don't press at t=2000 (head misses), press at t=2600 and release on time at t=3000
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1000, keysPressed: [true, false, false, false] },
        { time: 1050, keysPressed: [false, false, false, false] },
        { time: 2600, keysPressed: [false, true, false, false] }, // Press mid-body
        { time: 3000, keysPressed: [false, false, false, false] }, // Release on time -> capped at Meh
        { time: 4000, keysPressed: [false, false, true, false] },
        { time: 4050, keysPressed: [false, false, false, false] },
      ];

      const result = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
      });

      expect(result.scoreState.marvelousCount).toBe(2); // note 1, note 3
      expect(result.scoreState.missCount).toBe(1); // head missed
      expect(result.scoreState.badCount).toBe(1); // tail capped at Meh
    });

    it('simulates 1.5x tail release lenience (v3)', () => {
      // OD 5 Marvelous window is 19.5ms. A raw offset of 25ms would be Perfect (Great) without lenience,
      // but with 1.5x lenience: 25 / 1.5 = 16.67ms <= 19.5ms -> Marvelous!
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 2000, keysPressed: [false, true, false, false] },
        { time: 3025, keysPressed: [false, false, false, false] }, // 25ms late release
      ];

      const singleHoldMap = createTestBeatmap({
        id: 'hold_map',
        title: 'Single Hold Map',
        artist: 'Artist',
        keyCount: 4,
        overallDifficulty: 5,
        duration: 4,
        notes: [createTestNote({ id: 'h1', time: 2000, endTime: 3000, column: 1, type: 'hold' })],
      });

      const result = simulateManiaReplay({
        beatmap: singleHoldMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
      });

      expect(result.scoreState.marvelousCount).toBe(2); // Head + Tail both Marvelous!
      expect(result.scoreState.perfectCount).toBe(0);
      expect(result.scoreState.accuracy).toBe(100);
    });
  });

  describe('Version 2 Discrete Hold Ticks Replay Simulation', () => {
    it('simulates legacy v2 replay with discrete tick processing', () => {
      // In v2, a 1000ms hold (2000 -> 3000) with interval 50ms has ticks between Bad window (~136.5ms)
      // Ticks from ~2136.5ms to ~2863.5ms (~14 ticks).
      // If held throughout, all ticks are cleared and release is hit.
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1000, keysPressed: [true, false, false, false] },
        { time: 1050, keysPressed: [false, false, false, false] },
        { time: 2000, keysPressed: [false, true, false, false] },
        { time: 3000, keysPressed: [false, false, false, false] },
        { time: 4000, keysPressed: [false, false, true, false] },
        { time: 4050, keysPressed: [false, false, false, false] },
      ];

      const result = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: HOLD_TICK_RULES_VERSION,
        holdTickIntervalMs: 50,
      });

      expect(result.scoreState.missCount).toBe(0);
      expect(result.scoreState.marvelousCount).toBe(4);
      expect(result.scoreState.accuracy).toBe(100);
    });

    it('simulates v2 hold tick miss runs on early drop', () => {
      // Drop hold during ticks (at t=2400) and never re-press
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 2000, keysPressed: [false, true, false, false] },
        { time: 2400, keysPressed: [false, false, false, false] },
      ];

      const singleHoldMap = createTestBeatmap({
        id: 'hold_map',
        title: 'Single Hold Map',
        artist: 'Artist',
        keyCount: 4,
        overallDifficulty: 5,
        duration: 4,
        notes: [createTestNote({ id: 'h1', time: 2000, endTime: 3000, column: 1, type: 'hold' })],
      });

      const result = simulateManiaReplay({
        beatmap: singleHoldMap,
        replayFrames: frames,
        holdRulesVersion: HOLD_TICK_RULES_VERSION,
        holdTickIntervalMs: 50,
      });

      // Head is hit (1 marvelous), one continuous miss run for the missed ticks (1 miss), plus tail release miss (1 miss)
      expect(result.scoreState.marvelousCount).toBe(1);
      expect(result.scoreState.missCount).toBeGreaterThanOrEqual(1);
      expect(result.scoreState.accuracy).toBeLessThan(100);
    });

    it('simulates v2 hold tick resumption when re-pressed mid-hold', () => {
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 2000, keysPressed: [false, true, false, false] },
        { time: 2300, keysPressed: [false, false, false, false] }, // Release early
        { time: 2500, keysPressed: [false, true, false, false] }, // Re-press
        { time: 3000, keysPressed: [false, false, false, false] }, // Release at end
      ];

      const singleHoldMap = createTestBeatmap({
        id: 'hold_map',
        title: 'Single Hold Map',
        artist: 'Artist',
        keyCount: 4,
        overallDifficulty: 5,
        duration: 4,
        notes: [createTestNote({ id: 'h1', time: 2000, endTime: 3000, column: 1, type: 'hold' })],
      });

      const result = simulateManiaReplay({
        beatmap: singleHoldMap,
        replayFrames: frames,
        holdRulesVersion: HOLD_TICK_RULES_VERSION,
        holdTickIntervalMs: 50,
      });

      const holdNote = result.notes.find((n) => n.id === 'h1');
      expect(holdNote?.clearedTailIntervals?.length).toBeGreaterThan(0);
      expect(holdNote?.missedTailIntervals?.length).toBeGreaterThan(0);
    });
  });

  describe('Seeking and Partial Simulation', () => {
    it('simulates partial replay up to targetTimeMs deterministically', () => {
      const frames: ReplayFrame[] = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1000, keysPressed: [true, false, false, false] },
        { time: 1050, keysPressed: [false, false, false, false] },
        { time: 2000, keysPressed: [false, true, false, false] },
        { time: 3000, keysPressed: [false, false, false, false] },
        { time: 4000, keysPressed: [false, false, true, false] },
        { time: 4050, keysPressed: [false, false, false, false] },
      ];

      // Seek to t = 1500 (only note 1 judged)
      const part1 = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
        targetTimeMs: 1500,
      });
      expect(part1.scoreState.marvelousCount).toBe(1);
      expect(part1.scoreState.combo).toBe(1);

      // Seek to t = 2500 (note 1 judged, hold head judged)
      const part2 = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
        targetTimeMs: 2500,
      });
      expect(part2.scoreState.marvelousCount).toBe(2);
      expect(part2.scoreState.combo).toBe(2);

      // Seek to t = 3500 (note 1, hold head, hold tail judged)
      const part3 = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
        targetTimeMs: 3500,
      });
      expect(part3.scoreState.marvelousCount).toBe(3);
      expect(part3.scoreState.combo).toBe(3);

      // Seek to end (all 4 judgements)
      const part4 = simulateManiaReplay({
        beatmap: sampleMap,
        replayFrames: frames,
        holdRulesVersion: LAZER_HOLD_RULES_VERSION,
        targetTimeMs: 4500,
      });
      expect(part4.scoreState.marvelousCount).toBe(4);
      expect(part4.scoreState.combo).toBe(4);
      expect(part4.scoreState.score).toBe(1_000_000);
    });
  });
});
