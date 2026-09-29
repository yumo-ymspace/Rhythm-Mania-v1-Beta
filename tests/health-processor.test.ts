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
 * Tests for src/ruleset/mania/healthProcessor.ts
 * Port of osu!(lazer) ManiaHealthProcessor behaviour.
 */

import { describe, it, expect } from 'vitest';
import {
  computeHpMultiplierNormal,
  getHealthIncreaseFor,
  createHealthState,
  applyHealthJudgement,
  healthToDisplayPercent,
  displayPercentToHealth,
} from '../src/ruleset/mania/healthProcessor';

describe('ManiaHealthProcessor', () => {
  describe('getHealthIncreaseFor', () => {
    it('computes Miss penalty for regular notes using -(HP+1)*0.0075', () => {
      // HP 0: -(0+1)*0.0075 = -0.0075
      expect(getHealthIncreaseFor('miss', 0, 'note')).toBeCloseTo(-0.0075, 6);
      // HP 5: -(5+1)*0.0075 = -0.045
      expect(getHealthIncreaseFor('miss', 5, 'note')).toBeCloseTo(-0.045, 6);
      // HP 10: -(10+1)*0.0075 = -0.0825
      expect(getHealthIncreaseFor('miss', 10, 'note')).toBeCloseTo(-0.0825, 6);
    });

    it('computes Miss penalty for hold heads/tails using -(HP+1)*0.00375', () => {
      // HP 0: -(0+1)*0.00375 = -0.00375
      expect(getHealthIncreaseFor('miss', 0, 'hold_head')).toBeCloseTo(-0.00375, 6);
      expect(getHealthIncreaseFor('miss', 0, 'hold_tail')).toBeCloseTo(-0.00375, 6);
      // HP 5: -(5+1)*0.00375 = -0.0225
      expect(getHealthIncreaseFor('miss', 5, 'hold_head')).toBeCloseTo(-0.0225, 6);
      // HP 10: -(10+1)*0.00375 = -0.04125
      expect(getHealthIncreaseFor('miss', 10, 'hold_tail')).toBeCloseTo(-0.04125, 6);
    });

    it('hold head/tail miss is exactly half the penalty of a regular note miss', () => {
      for (const hp of [0, 3, 5, 7, 10]) {
        const noteMiss = getHealthIncreaseFor('miss', hp, 'note');
        const headMiss = getHealthIncreaseFor('miss', hp, 'hold_head');
        expect(headMiss).toBeCloseTo(noteMiss / 2, 6);
      }
    });

    it('computes Meh (bad) penalty using -(HP+1)*0.0016', () => {
      // HP 0: -(0+1)*0.0016 = -0.0016
      expect(getHealthIncreaseFor('bad', 0, 'note')).toBeCloseTo(-0.0016, 6);
      // HP 5: -(5+1)*0.0016 = -0.0096
      expect(getHealthIncreaseFor('bad', 5, 'note')).toBeCloseTo(-0.0096, 6);
      // HP 10: -(10+1)*0.0016 = -0.0176
      expect(getHealthIncreaseFor('bad', 10, 'note')).toBeCloseTo(-0.0176, 6);
    });

    it('Ok (good) gives exactly 0 health change', () => {
      for (const hp of [0, 5, 10]) {
        expect(getHealthIncreaseFor('good', hp, 'note')).toBe(0);
      }
    });

    it('computes Good (great) recovery using (0.004 - HP*0.0004)*mult', () => {
      // HP 0: (0.004 - 0) * 1.0 = 0.004
      expect(getHealthIncreaseFor('great', 0, 'note', 1.0)).toBeCloseTo(0.004, 6);
      // HP 5: (0.004 - 0.002) * 1.0 = 0.002
      expect(getHealthIncreaseFor('great', 5, 'note', 1.0)).toBeCloseTo(0.002, 6);
      // HP 10: (0.004 - 0.004) * 1.0 = 0
      expect(getHealthIncreaseFor('great', 10, 'note', 1.0)).toBeCloseTo(0, 6);
    });

    it('computes Great (perfect) recovery using (0.005 - HP*0.0005)*mult', () => {
      // HP 0: 0.005
      expect(getHealthIncreaseFor('perfect', 0, 'note', 1.0)).toBeCloseTo(0.005, 6);
      // HP 5: 0.0025
      expect(getHealthIncreaseFor('perfect', 5, 'note', 1.0)).toBeCloseTo(0.0025, 6);
      // HP 10: 0
      expect(getHealthIncreaseFor('perfect', 10, 'note', 1.0)).toBeCloseTo(0, 6);
    });

    it('computes Perfect (marvelous) recovery using (0.0055 - HP*0.0005)*mult', () => {
      // HP 0: 0.0055
      expect(getHealthIncreaseFor('marvelous', 0, 'note', 1.0)).toBeCloseTo(0.0055, 6);
      // HP 5: 0.003
      expect(getHealthIncreaseFor('marvelous', 5, 'note', 1.0)).toBeCloseTo(0.003, 6);
      // HP 10: 0.0005
      expect(getHealthIncreaseFor('marvelous', 10, 'note', 1.0)).toBeCloseTo(0.0005, 6);
    });

    it('body_break returns 0 health change (ComboBreak has no HP effect)', () => {
      for (const judgement of ['miss', 'bad', 'good', 'great', 'perfect', 'marvelous'] as const) {
        expect(getHealthIncreaseFor(judgement, 5, 'body_break')).toBe(0);
      }
    });

    it('clamps HP drain rate to [0, 10]', () => {
      // HP -5 should act like HP 0
      expect(getHealthIncreaseFor('miss', -5, 'note')).toBeCloseTo(
        getHealthIncreaseFor('miss', 0, 'note'), 6
      );
      // HP 15 should act like HP 10
      expect(getHealthIncreaseFor('miss', 15, 'note')).toBeCloseTo(
        getHealthIncreaseFor('miss', 10, 'note'), 6
      );
    });

    it('recovery values scale with HpMultiplierNormal', () => {
      const base = getHealthIncreaseFor('marvelous', 5, 'note', 1.0);
      const doubled = getHealthIncreaseFor('marvelous', 5, 'note', 2.0);
      expect(doubled).toBeCloseTo(base * 2, 6);
    });

    it('penalties do not scale with HpMultiplierNormal', () => {
      // Miss penalty should be the same regardless of multiplier
      const miss1 = getHealthIncreaseFor('miss', 5, 'note', 1.0);
      const miss2 = getHealthIncreaseFor('miss', 5, 'note', 2.0);
      expect(miss1).toBeCloseTo(miss2, 6);
    });
  });

  describe('no passive drain', () => {
    it('health does not change over 60s of idle objects', () => {
      const state = createHealthState(5);
      expect(state.health).toBe(1.0);
      // No applyHealthJudgement calls → health stays at 1.0
      // (This is the "no passive drain" test from the plan)
      expect(state.health).toBe(1.0);
    });
  });

  describe('createHealthState', () => {
    it('initializes with full health and no extra lives by default', () => {
      const state = createHealthState(5);
      expect(state.health).toBe(1.0);
      expect(state.failed).toBe(false);
      expect(state.extraLives).toBe(0);
      expect(state.isNoFail).toBe(false);
    });

    it('grants 2 extra lives with EZ mod', () => {
      const state = createHealthState(5, ['EZ']);
      expect(state.extraLives).toBe(2);
      expect(state.isNoFail).toBe(false);
    });

    it('sets isNoFail with NF mod', () => {
      const state = createHealthState(5, ['NF']);
      expect(state.isNoFail).toBe(true);
      expect(state.extraLives).toBe(0);
    });

    it('EZ + NF grants both extra lives and no-fail', () => {
      const state = createHealthState(5, ['EZ', 'NF']);
      expect(state.extraLives).toBe(2);
      expect(state.isNoFail).toBe(true);
    });

    it('is case-insensitive for mod detection', () => {
      const state = createHealthState(5, ['ez', 'nf']);
      expect(state.extraLives).toBe(2);
      expect(state.isNoFail).toBe(true);
    });
  });

  describe('applyHealthJudgement', () => {
    it('reduces health on miss', () => {
      const state = createHealthState(5);
      applyHealthJudgement(state, 'miss', 5, 'note');
      expect(state.health).toBeLessThan(1.0);
      expect(state.health).toBeGreaterThan(0);
      expect(state.failed).toBe(false);
    });

    it('increases health on marvelous/perfect/great', () => {
      const state = createHealthState(5);
      state.health = 0.5;
      const before = state.health;
      applyHealthJudgement(state, 'marvelous', 5, 'note');
      expect(state.health).toBeGreaterThan(before);
    });

    it('clamps health to [0, 1]', () => {
      // Health cannot exceed 1.0
      const state = createHealthState(0);
      state.health = 0.999;
      applyHealthJudgement(state, 'marvelous', 0, 'note');
      expect(state.health).toBeLessThanOrEqual(1.0);

      // Health cannot go below 0
      const state2 = createHealthState(10, ['NF']);
      state2.health = 0.001;
      applyHealthJudgement(state2, 'miss', 10, 'note');
      expect(state2.health).toBe(0);
    });

    it('triggers failure when health reaches 0 without NF or extra lives', () => {
      const state = createHealthState(10);
      state.health = 0.01; // Very low health
      const justFailed = applyHealthJudgement(state, 'miss', 10, 'note');
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
      expect(justFailed).toBe(true);
    });

    it('does not process further judgements after failure', () => {
      const state = createHealthState(10);
      state.health = 0.01;
      applyHealthJudgement(state, 'miss', 10, 'note');
      expect(state.failed).toBe(true);

      // Subsequent calls should be no-ops
      const result = applyHealthJudgement(state, 'marvelous', 0, 'note');
      expect(result).toBe(false);
      expect(state.health).toBe(0); // unchanged
    });
  });

  describe('NF (NoFail) mod', () => {
    it('prevents failure when health reaches 0', () => {
      const state = createHealthState(10, ['NF']);
      state.health = 0.01;
      const justFailed = applyHealthJudgement(state, 'miss', 10, 'note');
      expect(state.health).toBe(0);
      expect(state.failed).toBe(false);
      expect(justFailed).toBe(false);
    });

    it('allows health to recover after reaching 0', () => {
      const state = createHealthState(5, ['NF']);
      state.health = 0;
      applyHealthJudgement(state, 'marvelous', 5, 'note');
      expect(state.health).toBeGreaterThan(0);
    });

    it('gameplay continues indefinitely with NF', () => {
      const state = createHealthState(10, ['NF']);
      // Simulate many misses
      for (let i = 0; i < 100; i++) {
        applyHealthJudgement(state, 'miss', 10, 'note');
      }
      expect(state.failed).toBe(false);
    });
  });

  describe('EZ extra lives', () => {
    it('refills health on first death (2 lives → 1)', () => {
      const state = createHealthState(10, ['EZ']);
      expect(state.extraLives).toBe(2);

      state.health = 0.001;
      const justFailed = applyHealthJudgement(state, 'miss', 10, 'note');
      expect(justFailed).toBe(false);
      expect(state.health).toBe(1.0); // Refilled
      expect(state.extraLives).toBe(1);
      expect(state.failed).toBe(false);
    });

    it('refills health on second death (1 life → 0)', () => {
      const state = createHealthState(10, ['EZ']);
      state.extraLives = 1;

      state.health = 0.001;
      const justFailed = applyHealthJudgement(state, 'miss', 10, 'note');
      expect(justFailed).toBe(false);
      expect(state.health).toBe(1.0);
      expect(state.extraLives).toBe(0);
      expect(state.failed).toBe(false);
    });

    it('fails on third death when no extra lives remain', () => {
      const state = createHealthState(10, ['EZ']);
      state.extraLives = 0;

      state.health = 0.001;
      const justFailed = applyHealthJudgement(state, 'miss', 10, 'note');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('full EZ lifecycle: 3 total lives (initial + 2 extra)', () => {
      const state = createHealthState(10, ['EZ']);
      expect(state.extraLives).toBe(2);

      // Death 1 → refill
      state.health = 0.001;
      applyHealthJudgement(state, 'miss', 10, 'note');
      expect(state.failed).toBe(false);
      expect(state.health).toBe(1.0);
      expect(state.extraLives).toBe(1);

      // Death 2 → refill
      state.health = 0.001;
      applyHealthJudgement(state, 'miss', 10, 'note');
      expect(state.failed).toBe(false);
      expect(state.health).toBe(1.0);
      expect(state.extraLives).toBe(0);

      // Death 3 → fail
      state.health = 0.001;
      applyHealthJudgement(state, 'miss', 10, 'note');
      expect(state.failed).toBe(true);
      expect(state.health).toBe(0);
    });
  });

  describe('HP formula behavior across HP drain rates', () => {
    it('Miss drops by lazer formula at HP 0, 5, and 10', () => {
      // HP 0: miss drop = -0.0075
      const state0 = createHealthState(0);
      const before0 = state0.health;
      applyHealthJudgement(state0, 'miss', 0, 'note');
      expect(before0 - state0.health).toBeCloseTo(0.0075, 6);

      // HP 5: miss drop = -0.045
      const state5 = createHealthState(5);
      const before5 = state5.health;
      applyHealthJudgement(state5, 'miss', 5, 'note');
      expect(before5 - state5.health).toBeCloseTo(0.045, 6);

      // HP 10: miss drop = -0.0825
      const state10 = createHealthState(10);
      const before10 = state10.health;
      applyHealthJudgement(state10, 'miss', 10, 'note');
      expect(before10 - state10.health).toBeCloseTo(0.0825, 6);
    });

    it('at HP 10, Perfect (marvelous) recovery is tiny (0.0005)', () => {
      const delta = getHealthIncreaseFor('marvelous', 10, 'note', 1.0);
      expect(delta).toBeCloseTo(0.0005, 6);
    });

    it('at HP 0, Perfect (marvelous) recovery is large (0.0055)', () => {
      const delta = getHealthIncreaseFor('marvelous', 0, 'note', 1.0);
      expect(delta).toBeCloseTo(0.0055, 6);
    });

    it('higher HP drain rate means harder survival', () => {
      // Miss penalty increases with HP
      const miss0 = Math.abs(getHealthIncreaseFor('miss', 0, 'note'));
      const miss10 = Math.abs(getHealthIncreaseFor('miss', 10, 'note'));
      expect(miss10).toBeGreaterThan(miss0);

      // Recovery decreases with HP
      const recovery0 = getHealthIncreaseFor('marvelous', 0, 'note', 1.0);
      const recovery10 = getHealthIncreaseFor('marvelous', 10, 'note', 1.0);
      expect(recovery0).toBeGreaterThan(recovery10);
    });
  });

  describe('display conversion helpers', () => {
    it('converts health 0..1 to display 0..100', () => {
      expect(healthToDisplayPercent(1.0)).toBe(100);
      expect(healthToDisplayPercent(0.5)).toBe(50);
      expect(healthToDisplayPercent(0.0)).toBe(0);
      expect(healthToDisplayPercent(0.356)).toBeCloseTo(35.6);
    });

    it('clamps out-of-range values', () => {
      expect(healthToDisplayPercent(1.5)).toBe(100);
      expect(healthToDisplayPercent(-0.1)).toBe(0);
    });

    it('converts display 0..100 back to health 0..1', () => {
      expect(displayPercentToHealth(100)).toBe(1.0);
      expect(displayPercentToHealth(50)).toBe(0.5);
      expect(displayPercentToHealth(0)).toBe(0.0);
    });

    it('round-trips correctly', () => {
      for (const h of [0, 0.1, 0.25, 0.5, 0.75, 0.999, 1.0]) {
        expect(displayPercentToHealth(healthToDisplayPercent(h))).toBeCloseTo(h, 4);
      }
    });
  });

  describe('SD (SuddenDeath) mod', () => {
    it('sets isSuddenDeath in createHealthState', () => {
      const state = createHealthState(5, ['SD']);
      expect(state.isSuddenDeath).toBe(true);
      expect(state.isPerfect).toBe(false);
      expect(state.failed).toBe(false);
    });

    it('fails immediately on regular note miss', () => {
      const state = createHealthState(5, ['SD']);
      expect(state.health).toBe(1.0);
      const justFailed = applyHealthJudgement(state, 'miss', 5, 'note');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('fails immediately on hold head miss', () => {
      const state = createHealthState(5, ['SD']);
      const justFailed = applyHealthJudgement(state, 'miss', 5, 'hold_head');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('fails immediately on hold tail miss', () => {
      const state = createHealthState(5, ['SD']);
      const justFailed = applyHealthJudgement(state, 'miss', 5, 'hold_tail');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('fails immediately on hold body break (early release)', () => {
      const state = createHealthState(5, ['SD']);
      const justFailed = applyHealthJudgement(state, 'miss', 5, 'body_break');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('does not fail on non-miss judgements (marvelous, perfect, great, good, bad)', () => {
      for (const j of ['marvelous', 'perfect', 'great', 'good', 'bad'] as const) {
        const state = createHealthState(5, ['SD']);
        const justFailed = applyHealthJudgement(state, j, 5, 'note');
        expect(justFailed).toBe(false);
        expect(state.failed).toBe(false);
      }
    });

    it('NF prevents SD failure on miss', () => {
      const state = createHealthState(5, ['SD', 'NF']);
      const justFailed = applyHealthJudgement(state, 'miss', 5, 'note');
      expect(justFailed).toBe(false);
      expect(state.failed).toBe(false);
    });
  });

  describe('PF (Perfect) mod', () => {
    it('sets isPerfect in createHealthState', () => {
      const state = createHealthState(5, ['PF']);
      expect(state.isPerfect).toBe(true);
      expect(state.isSuddenDeath).toBe(false);
      expect(state.failed).toBe(false);
    });

    it('does not fail on marvelous (lazer Perfect)', () => {
      const state = createHealthState(5, ['PF']);
      const justFailed = applyHealthJudgement(state, 'marvelous', 5, 'note');
      expect(justFailed).toBe(false);
      expect(state.failed).toBe(false);
    });

    it('does not fail on perfect (lazer Great)', () => {
      const state = createHealthState(5, ['PF']);
      const justFailed = applyHealthJudgement(state, 'perfect', 5, 'note');
      expect(justFailed).toBe(false);
      expect(state.failed).toBe(false);
    });

    it('fails immediately on great (lazer Good / 200)', () => {
      const state = createHealthState(5, ['PF']);
      const justFailed = applyHealthJudgement(state, 'great', 5, 'note');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('fails immediately on good (lazer Ok / 100)', () => {
      const state = createHealthState(5, ['PF']);
      const justFailed = applyHealthJudgement(state, 'good', 5, 'note');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('fails immediately on bad (lazer Meh / 50)', () => {
      const state = createHealthState(5, ['PF']);
      const justFailed = applyHealthJudgement(state, 'bad', 5, 'note');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('fails immediately on miss', () => {
      const state = createHealthState(5, ['PF']);
      const justFailed = applyHealthJudgement(state, 'miss', 5, 'note');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('fails immediately on hold body break', () => {
      const state = createHealthState(5, ['PF']);
      const justFailed = applyHealthJudgement(state, 'miss', 5, 'body_break');
      expect(justFailed).toBe(true);
      expect(state.health).toBe(0);
      expect(state.failed).toBe(true);
    });

    it('NF prevents PF failure on lower judgements', () => {
      const state = createHealthState(5, ['PF', 'NF']);
      const justFailed = applyHealthJudgement(state, 'great', 5, 'note');
      expect(justFailed).toBe(false);
      expect(state.failed).toBe(false);
    });
  });

  describe('computeHpMultiplierNormal', () => {
    it('returns 1.0 for all HP drain rates (mania has no passive drain)', () => {
      for (const hp of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        expect(computeHpMultiplierNormal(hp)).toBe(1.0);
      }
    });
  });
});
