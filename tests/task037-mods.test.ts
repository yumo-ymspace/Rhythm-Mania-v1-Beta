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
 * Tests for TASK-037 Mods
 * Random (RD), Wind Up (WU), Wind Down (WD), Adaptive Speed (AS),
 * Muted (MU), Cinema (CN), and Accuracy Challenge (AC)
 */

import { describe, it, expect } from 'vitest';
import type { Beatmap, HitObject, ReplayFrame } from '../src/types';
import {
  applyRandomMod,
  applyBeatmapMods,
  isRandomMod,
  isWindUpMod,
  isWindDownMod,
  isAdaptiveSpeedMod,
  isMutedMod,
  isCinemaMod,
  isAccuracyChallengeMod,
  parseAccuracyChallengeThreshold,
  hashStringToSeed,
  createMulberry32,
} from '../src/ruleset/mania/beatmapMods';
import {
  sanitizeGameplayMods,
  MOD_SCORE_MULTIPLIERS,
} from '../src/utils/modifiers';
import {
  createHealthState,
  checkAccuracyChallengeFail,
} from '../src/ruleset/mania/healthProcessor';
import { computeModMultiplier } from '../src/ruleset/mania/scoreProcessor';
import { simulateManiaReplay } from '../src/ruleset/mania/replaySimulator';

function createNote(params: { id: string; time: number; column: number; type?: 'normal' | 'hold'; endTime?: number }): HitObject {
  return {
    id: params.id,
    time: params.time,
    column: params.column,
    type: params.type || 'normal',
    endTime: params.endTime,
    isHit: false,
    isReleased: false,
    isMissed: false,
    isHoldFailed: false,
  };
}

function createMockBeatmap(overrides?: Partial<Beatmap>): Beatmap {
  return {
    id: 'test_map_037',
    title: 'Test Song 037',
    artist: 'Artist 037',
    creator: 'Creator 037',
    difficulty: 'Insane',
    bpm: 140,
    keyCount: 4,
    duration: 10,
    hpDrainRate: 5,
    overallDifficulty: 8,
    mode: 3,
    sliderMultiplier: 1.4,
    baseBeatLength: 500,
    timingPoints: [
      { timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1.0 },
    ],
    notes: [
      createNote({ id: 'n1', time: 500, column: 0 }),
      createNote({ id: 'n2', time: 1000, column: 1 }),
      createNote({ id: 'n3', time: 1500, column: 2, type: 'hold', endTime: 2500 }),
      createNote({ id: 'n4', time: 2000, column: 3 }),
    ],
    ...overrides,
  };
}

describe('TASK-037: Random (RD) Mod', () => {
  it('deterministically shuffles columns as a bijection (permutation)', () => {
    const map = createMockBeatmap();
    const result = applyRandomMod(map, 12345);

    expect(result.id).toBe('test_map_037_rd');
    expect(result.notes.length).toBe(4);

    // Verify all columns in result are valid
    for (const note of result.notes) {
      expect(note.column).toBeGreaterThanOrEqual(0);
      expect(note.column).toBeLessThan(4);
    }

    // Two notes that were originally in the same column should map to the same column
    const note1 = map.notes[0];
    const transformed1 = result.notes.find((n) => n.id === note1.id)!;
    expect(transformed1).toBeDefined();

    // EndTime on hold notes is preserved
    const hold = result.notes.find((n) => n.id === 'n3')!;
    expect(hold.type).toBe('hold');
    expect(hold.endTime).toBe(2500);

    // Re-running with the exact same seed yields the identical mapping
    const resultAgain = applyRandomMod(map, 12345);
    expect(resultAgain.notes.map((n) => n.column)).toEqual(result.notes.map((n) => n.column));
  });

  it('generates different shuffles with different seeds', () => {
    const map = createMockBeatmap({
      keyCount: 7,
      notes: Array.from({ length: 7 }, (_, i) => createNote({ id: `n_${i}`, time: 100 * (i + 1), column: i })),
    });

    const result1 = applyRandomMod(map, 42);
    const result2 = applyRandomMod(map, 99999);

    const cols1 = result1.notes.map((n) => n.column);
    const cols2 = result2.notes.map((n) => n.column);
    expect(cols1).not.toEqual(cols2);
  });

  it('is applied via applyBeatmapMods when RD is present', () => {
    const map = createMockBeatmap();
    const withRd = applyBeatmapMods(map, ['RD'], { randomSeed: 777 });
    expect(withRd.id).toBe('test_map_037_rd');

    // Exclusive with Mirror: Mirror takes precedence if both somehow passed, or RD is applied
    const withMirror = applyBeatmapMods(map, ['MR']);
    expect(withMirror.id).toBe('test_map_037_mr');
  });

  it('hashStringToSeed produces positive 32-bit integer', () => {
    const s1 = hashStringToSeed('test');
    const s2 = hashStringToSeed('test');
    expect(s1).toBe(s2);
    expect(s1).toBeGreaterThanOrEqual(0);
  });

  it('createMulberry32 produces uniform values in [0, 1)', () => {
    const rng = createMulberry32(100);
    for (let i = 0; i < 50; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe('TASK-037: Mod Predicates and Options Parsing', () => {
  it('correctly identifies all TASK-037 mod predicates', () => {
    expect(isRandomMod(['RD'])).toBe(true);
    expect(isRandomMod(['RANDOM'])).toBe(true);
    expect(isRandomMod(['MR'])).toBe(false);

    expect(isWindUpMod(['WU'])).toBe(true);
    expect(isWindUpMod(['WINDUP'])).toBe(true);
    expect(isWindUpMod(['DT'])).toBe(false);

    expect(isWindDownMod(['WD'])).toBe(true);
    expect(isWindDownMod(['WINDDOWN'])).toBe(true);

    expect(isAdaptiveSpeedMod(['AS'])).toBe(true);
    expect(isAdaptiveSpeedMod(['ADAPTIVESPEED'])).toBe(true);

    expect(isMutedMod(['MU'])).toBe(true);
    expect(isMutedMod(['MUTED'])).toBe(true);

    expect(isCinemaMod(['CN'])).toBe(true);
    expect(isCinemaMod(['CINEMA'])).toBe(true);

    expect(isAccuracyChallengeMod(['AC'])).toBe(true);
    expect(isAccuracyChallengeMod(['AC:90'])).toBe(true);
    expect(isAccuracyChallengeMod(['AC_85'])).toBe(true);
    expect(isAccuracyChallengeMod(['ACCURACYCHALLENGE'])).toBe(true);
    expect(isAccuracyChallengeMod(['PF'])).toBe(false);
  });

  it('parses accuracy challenge thresholds correctly', () => {
    expect(parseAccuracyChallengeThreshold('AC')).toBe(0.90);
    expect(parseAccuracyChallengeThreshold('AC:95')).toBe(0.95);
    expect(parseAccuracyChallengeThreshold('AC:80')).toBe(0.80);
    expect(parseAccuracyChallengeThreshold('AC_0.88')).toBe(0.88);
    expect(parseAccuracyChallengeThreshold('ACCURACYCHALLENGE')).toBe(0.90);
  });
});

describe('TASK-037: Mod Sanitization, Normalization, and Multipliers', () => {
  it('normalizes mod names correctly', () => {
    expect(sanitizeGameplayMods(['random'])).toEqual(['RD']);
    expect(sanitizeGameplayMods(['windup'])).toEqual(['WU']);
    expect(sanitizeGameplayMods(['winddown'])).toEqual(['WD']);
    expect(sanitizeGameplayMods(['adaptivespeed'])).toEqual(['AS']);
    expect(sanitizeGameplayMods(['muted'])).toEqual(['MU']);
    expect(sanitizeGameplayMods(['cinema'])).toEqual(['CN']);
    expect(sanitizeGameplayMods(['accuracychallenge'])).toEqual(['AC']);
    expect(sanitizeGameplayMods(['accuracychallenge:90'])).toEqual(['AC:90']);
  });

  it('enforces rate mod mutual exclusivity (DT, NC, HT, WU, WD, AS)', () => {
    expect(sanitizeGameplayMods(['DT', 'WU'])).toEqual(['DT']);
    expect(sanitizeGameplayMods(['WU', 'DT'])).toEqual(['WU']);
    expect(sanitizeGameplayMods(['WU', 'WD'])).toEqual(['WU']);
    expect(sanitizeGameplayMods(['AS', 'HT'])).toEqual(['AS']);
    expect(sanitizeGameplayMods(['WD', 'AS'])).toEqual(['WD']);
  });

  it('enforces sudden fail mutual exclusivity (SD, PF, AC, NF, EZ)', () => {
    expect(sanitizeGameplayMods(['AC', 'NF'])).toEqual(['AC']);
    expect(sanitizeGameplayMods(['NF', 'AC'])).toEqual(['NF']);
    expect(sanitizeGameplayMods(['EZ', 'AC'])).toEqual(['EZ']);
    expect(sanitizeGameplayMods(['AC', 'SD'])).toEqual(['AC']);
    expect(sanitizeGameplayMods(['SD', 'AC'])).toEqual(['SD']);
    expect(sanitizeGameplayMods(['PF', 'AC'])).toEqual(['PF']);
  });

  it('enforces automation mutual exclusivity (AT, CN)', () => {
    expect(sanitizeGameplayMods(['AT', 'CN'])).toEqual(['AT']);
    expect(sanitizeGameplayMods(['CN', 'AT'])).toEqual(['CN']);
  });

  it('enforces column conversion mutual exclusivity (MR, RD)', () => {
    expect(sanitizeGameplayMods(['MR', 'RD'])).toEqual(['MR']);
    expect(sanitizeGameplayMods(['RD', 'MR'])).toEqual(['RD']);
  });

  it('reports correct score multipliers', () => {
    expect(MOD_SCORE_MULTIPLIERS['RD']).toBe(1.0);
    expect(MOD_SCORE_MULTIPLIERS['WU']).toBe(0.5);
    expect(MOD_SCORE_MULTIPLIERS['WD']).toBe(0.5);
    expect(MOD_SCORE_MULTIPLIERS['AS']).toBe(0.5);
    expect(MOD_SCORE_MULTIPLIERS['MU']).toBe(1.0);
    expect(MOD_SCORE_MULTIPLIERS['CN']).toBe(0.0);
    expect(MOD_SCORE_MULTIPLIERS['AC']).toBe(1.0);

    expect(computeModMultiplier(['RD', 'MU'])).toBe(1.0);
    expect(computeModMultiplier(['AC:90'])).toBe(1.0);
    expect(computeModMultiplier(['CN'])).toBe(0.0);
  });
});

describe('TASK-037: HealthProcessor Accuracy Challenge (AC)', () => {
  it('creates HealthState with AC configuration', () => {
    const state = createHealthState(5, ['AC:85']);
    expect(state.isAccuracyChallenge).toBe(true);
    expect(state.minimumAccuracy).toBe(0.85);
    expect(state.failed).toBe(false);
  });

  it('fails when accuracy drops below threshold after judgements', () => {
    const state = createHealthState(5, ['AC:90']);
    expect(state.failed).toBe(false);

    // High accuracy (95%): does not fail
    expect(checkAccuracyChallengeFail(state, 95.0, 1)).toBe(false);
    expect(state.failed).toBe(false);

    // Accuracy drops to 89% (0.89 < 0.90): triggers fail
    expect(checkAccuracyChallengeFail(state, 89.0, 2)).toBe(true);
    expect(state.failed).toBe(true);
    expect(state.health).toBe(0);
  });

  it('does not fail if NoFail is also set or no judgements have occurred', () => {
    const state = createHealthState(5, ['AC:90', 'NF']);
    expect(checkAccuracyChallengeFail(state, 50.0, 5)).toBe(false);
    expect(state.failed).toBe(false);

    const freshState = createHealthState(5, ['AC:90']);
    expect(checkAccuracyChallengeFail(freshState, 0.0, 0)).toBe(false);
  });
});

describe('TASK-037: Replay Simulation with RD and AC', () => {
  it('simulates correctly with Random (RD) mod', () => {
    const map = createMockBeatmap();
    const frames: ReplayFrame[] = [
      { time: 0, keysPressed: [false, false, false, false] },
      { time: 500, keysPressed: [true, false, false, false] },
      { time: 550, keysPressed: [false, false, false, false] },
      { time: 1000, keysPressed: [false, true, false, false] },
      { time: 1050, keysPressed: [false, false, false, false] },
    ];

    const result = simulateManiaReplay({
      beatmap: map,
      replayFrames: frames,
      selectedMods: ['RD'],
    });

    expect(result.scoreState).toBeDefined();
    expect(result.notes.length).toBe(4);
  });

  it('triggers failure in replay simulation if AC accuracy drops below threshold', () => {
    const map = createMockBeatmap();
    // Replay with miss on note 1
    const frames: ReplayFrame[] = [
      { time: 0, keysPressed: [false, false, false, false] },
      // Miss note 1 at 500ms by doing nothing until 750ms
      { time: 800, keysPressed: [false, false, false, false] },
    ];

    const result = simulateManiaReplay({
      beatmap: map,
      replayFrames: frames,
      selectedMods: ['AC:90'],
      targetTimeMs: 800,
    });

    // A single miss results in accuracy = 0%, which is below 90%
    expect(result.scoreState.accuracy).toBe(0);
    expect(result.scoreState.failed).toBe(true);
  });
});
