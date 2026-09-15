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
 * osu!(lazer) ManiaHealthProcessor port.
 *
 * Source: ppy/osu ManiaHealthProcessor + LegacyDrainingHealthProcessor (MIT).
 *
 * Key facts from the lazer implementation:
 *
 * - Health is 0.0..1.0 (displayed as a bar).
 * - Mania has NO passive drain; ManiaHealthProcessor.ComputeDrainRate() runs
 *   the base iteration only to compute HpMultiplierNormal, then returns 0.
 * - Health changes come only from judged objects via GetHealthIncreaseFor().
 * - EZ mod grants 2 extra lives (total 3 attempts before fail).
 * - NF mod prevents failure entirely.
 * - SD mod triggers failure on any combo break.
 * - PF mod triggers failure on anything below Great (result < Good in mania).
 *
 * The GetHealthIncreaseFor values are sourced from LegacyDrainingHealthProcessor
 * which mirrors stable osu!mania health behaviour:
 *
 * | Result         | Health Increase                             |
 * |----------------|---------------------------------------------|
 * | Miss (head/tail) | -(HP + 1) * 0.00375                       |
 * | Miss (other)     | -(HP + 1) * 0.0075                        |
 * | Meh (bad)        | -(HP + 1) * 0.0016                        |
 * | Ok (good)        | 0                                         |
 * | Good (great)     | (0.004 - HP * 0.0004) * HpMultiplierNormal|
 * | Great (perfect)  | (0.005 - HP * 0.0005) * HpMultiplierNormal|
 * | Perfect (marv)   | (0.0055 - HP * 0.0005) * HpMultiplierNormal|
 *
 * HpMultiplierNormal is computed during the drain-rate iteration in
 * LegacyDrainingHealthProcessor. For mania (drain rate = 0), the iteration
 * converges to a value that depends on the map's HP drain rate and the note
 * distribution. computeHpMultiplierNormalForMap() ports that iteration over
 * the note timeline (rice = one Perfect recovery, hold = head + tail
 * Perfect recoveries); ManiaHealthProcessor then returns drain rate 0.
 */

import type { JudgementType } from '../../types';
import { parseAccuracyChallengeThreshold } from './beatmapMods';

/** Interpolates difficulty range: OD 0 → min, OD 5 → mid, OD 10 → max. */
function difficultyRange(difficulty: number, min: number, mid: number, max: number): number {
  if (difficulty > 5) return mid + (max - mid) * ((difficulty - 5) / 5);
  if (difficulty < 5) return mid + (mid - min) * ((difficulty - 5) / 5);
  return mid;
}

/**
 * Estimates `HpMultiplierNormal` for a given HP drain rate.
 *
 * In lazer, `LegacyDrainingHealthProcessor.ComputeDrainRate()` iterates over
 * the full beatmap timeline to find the drain rate and HP multiplier that
 * produces the desired survival curve. For mania, `ManiaHealthProcessor`
 * overrides `ComputeDrainRate()` to return 0 (no passive drain), but the
 * base iteration still runs to compute `HpMultiplierNormal`.
 *
 * The iteration adjusts `HpMultiplierNormal` based on whether the simulated
 * lowest HP ever dips below a threshold derived from the HP drain rate.
 * The thresholds are:
 *   lowestHpEver  = DifficultyRange(HP, 0.975, 0.8, 0.3)
 *   lowestHpEnd   = DifficultyRange(HP, 0.99, 0.9, 0.4)
 *   hpRecoveryAvailable = DifficultyRange(HP, 0.04, 0.02, 0)
 *
 * Since mania has no drain between objects, the iteration typically converges
 * quickly. For a purely judgement-based processor, HpMultiplierNormal scales
 * the positive health recovery so that Good/Great/Perfect gains are meaningful
 * relative to the HP drain rate difficulty.
 *
 * We use a simplified heuristic: start at 1.0 and scale inversely with the
 * recovery budget. This matches the stable behaviour closely enough for
 * gameplay feel without requiring a full beatmap simulation pass.
 */
export interface HpMapNote {
  time: number;
  endTime?: number;
  type?: string;
}

/**
 * Base Perfect (internal marvelous) recovery before HpMultiplierNormal scaling.
 * Mirrors ManiaHealthProcessor.GetHealthIncreaseFor(Perfect).
 */
function perfectRecoveryBase(hpDrainRate: number): number {
  const hp = Math.max(0, Math.min(10, hpDrainRate));
  return 0.0055 - hp * 0.0005;
}

function isHoldNote(note: HpMapNote): boolean {
  if (note.type === 'hold') return true;
  return note.endTime !== undefined && note.endTime > note.time;
}

/**
 * Map-aware HpMultiplierNormal port of lazer's
 * LegacyDrainingHealthProcessor.ComputeDrainRate().
 *
 * ManiaHealthProcessor calls the base iteration only to compute
 * HpMultiplierNormal, then returns drain rate 0 (no passive drain).
 * The loop binary-searches a test drop rate while bumping the recovery
 * multiplier (*1.01) whenever the simulated perfect play dips below the
 * lowestHpEver/lowestHpEnd curves or the uncapped recovery budget is too
 * low. The returned multiplier scales Good/Great/Perfect recovery only.
 *
 * With no notes the iteration has nothing to simulate and stays at 1.0.
 */
export function computeHpMultiplierNormalForMap(
  hpDrainRate: number,
  notes: readonly HpMapNote[] | undefined | null,
): number {
  const hp = Math.max(0, Math.min(10, hpDrainRate));
  if (!notes || notes.length === 0) return 1.0;

  const sorted = [...notes]
    .filter((n) => Number.isFinite(n.time))
    .sort((a, b) => a.time - b.time || (a.endTime ?? a.time) - (b.endTime ?? b.time));
  if (sorted.length === 0) return 1.0;

  const lowestHpEver = difficultyRange(hp, 0.975, 0.8, 0.3);
  const lowestHpEnd = difficultyRange(hp, 0.99, 0.9, 0.4);
  const hpRecoveryAvailable = difficultyRange(hp, 0.04, 0.02, 0);
  const baseRecovery = perfectRecoveryBase(hp);

  let hpMultiplierNormal = 1;
  let testDrop = 0.00025;
  const drainStartTime = sorted[0].time;

  for (let iteration = 0; iteration < 500; iteration++) {
    let currentHp = 1;
    let currentHpUncapped = 1;
    let lastTime = drainStartTime;
    let fail = false;

    for (const h of sorted) {
      const start = h.time;
      const end = isHoldNote(h) && h.endTime !== undefined ? h.endTime : h.time;

      const reduce = (amount: number) => {
        currentHpUncapped = Math.max(0, currentHpUncapped - amount);
        currentHp = Math.max(0, currentHp - amount);
      };
      const increase = (amount: number) => {
        currentHpUncapped += amount;
        currentHp = Math.max(0, Math.min(1, currentHp + amount));
      };

      reduce(testDrop * (start - lastTime));
      lastTime = end;

      if (currentHp <= lowestHpEver) {
        fail = true;
        testDrop *= 0.96;
        break;
      }

      const hpReduction = testDrop * (end - start);
      const hpOverkill = Math.max(0, hpReduction - currentHp);
      reduce(hpReduction);

      if (isHoldNote(h)) {
        // Nested HeadNote + TailNote judged at MaxResult (Perfect).
        increase(baseRecovery * hpMultiplierNormal);
        increase(baseRecovery * hpMultiplierNormal);
      }

      if (hpOverkill > 0 && currentHp - hpOverkill <= lowestHpEver) {
        fail = true;
        testDrop *= 0.96;
        break;
      }

      if (!isHoldNote(h)) {
        // Top-level rice note judged at MaxResult (Perfect).
        increase(baseRecovery * hpMultiplierNormal);
      }
    }

    if (!fail && currentHp < lowestHpEnd) {
      fail = true;
      testDrop *= 0.94;
      hpMultiplierNormal *= 1.01;
    }

    const recovery = (currentHpUncapped - 1) / Math.max(1, sorted.length);

    if (!fail && recovery < hpRecoveryAvailable) {
      fail = true;
      testDrop *= 0.96;
      hpMultiplierNormal *= 1.01;
    }

    if (!fail && !Number.isFinite(hpMultiplierNormal)) {
      return 1.0;
    }

    if (!fail) {
      return hpMultiplierNormal;
    }

    if (!Number.isFinite(testDrop) || testDrop <= 0) {
      return hpMultiplierNormal;
    }
  }

  return hpMultiplierNormal;
}

export function computeHpMultiplierNormal(hpDrainRate: number): number {
  // No beatmap context: preserve the historical 1.0 default. Callers with
  // access to the note timeline should use computeHpMultiplierNormalForMap().
  return 1.0;
}

/**
 * Mania judgement types mapped to their health result categories.
 *
 * In lazer, hold objects produce different miss types:
 * - Head miss and tail miss use a reduced penalty (0.00375 factor).
 * - Regular note misses use the full penalty (0.0075 factor).
 * - ComboBreak (body break) has no direct health effect — only combo resets.
 */
export type HealthJudgementContext =
  | 'note'        // Regular rice note judgement
  | 'hold_head'   // Hold note head judgement
  | 'hold_tail'   // Hold note tail judgement
  | 'body_break'; // Hold body early release (ComboBreak — no HP effect)

/**
 * Computes the health change for a given judgement result.
 *
 * Ported from LegacyDrainingHealthProcessor.GetHealthIncreaseFor().
 * Health is in the range [0.0, 1.0].
 *
 * @param judgement - The judgement type (internal name).
 * @param hpDrainRate - The beatmap HP drain rate (0–10).
 * @param context - Whether this is a note, hold head, hold tail, or body break.
 * @param hpMultiplierNormal - Pre-computed recovery multiplier. Pass the result
 *   of computeHpMultiplierNormal() for the map. Default 1.0.
 * @returns The health delta to apply (positive = recovery, negative = penalty).
 */
export function getHealthIncreaseFor(
  judgement: JudgementType,
  hpDrainRate: number,
  context: HealthJudgementContext = 'note',
  hpMultiplierNormal: number = 1.0,
): number {
  // ComboBreak (body break) does not change health — only resets combo
  if (context === 'body_break') return 0;

  const hp = Math.max(0, Math.min(10, hpDrainRate));

  switch (judgement) {
    case 'miss': {
      // Head and tail misses use a reduced penalty factor
      if (context === 'hold_head' || context === 'hold_tail') {
        return -(hp + 1) * 0.00375;
      }
      // Regular note miss (or "other" miss)
      return -(hp + 1) * 0.0075;
    }

    case 'bad': // Meh
      return -(hp + 1) * 0.0016;

    case 'good': // Ok
      return 0;

    case 'great': // Good
      return (0.004 - hp * 0.0004) * hpMultiplierNormal;

    case 'perfect': // Great
      return (0.005 - hp * 0.0005) * hpMultiplierNormal;

    case 'marvelous': // Perfect (MAX)
      return (0.0055 - hp * 0.0005) * hpMultiplierNormal;

    default:
      return 0;
  }
}

/**
 * Mutable health state for a gameplay session.
 */
export interface HealthState {
  /** Current health value in the range [0.0, 1.0]. */
  health: number;

  /** Whether the player has failed (health reached 0 without NF/extra lives). */
  failed: boolean;

  /** Number of remaining extra lives (EZ mod grants 2). */
  extraLives: number;

  /** Pre-computed HpMultiplierNormal for this map. */
  hpMultiplierNormal: number;

  /** Whether NoFail is active (prevents failure). */
  isNoFail: boolean;

  /** Whether SuddenDeath is active (fails on any combo break). */
  isSuddenDeath: boolean;

  /** Whether Perfect is active (fails on anything below Great / <300 or combo break). */
  isPerfect: boolean;

  /** Whether Accuracy Challenge is active. */
  isAccuracyChallenge: boolean;

  /** Minimum accuracy required before failure (0.0 .. 1.0, default 0.90). */
  minimumAccuracy: number;
}

/**
 * Creates an initial HealthState for a gameplay session.
 *
 * @param hpDrainRate - The beatmap's HP drain rate (0–10).
 * @param mods - Active gameplay mod identifiers.
 */
export function createHealthState(
  hpDrainRate: number,
  mods: readonly string[] = [],
  notes?: readonly HpMapNote[] | undefined | null,
): HealthState {
  const isEZ = mods.some(m => m.toUpperCase() === 'EZ');
  const isNF = mods.some(m => m.toUpperCase() === 'NF');
  const isSD = mods.some(m => m.toUpperCase() === 'SD');
  const isPF = mods.some(m => m.toUpperCase() === 'PF');

  const acMod = mods.find(m => {
    const u = m.toUpperCase();
    return u === 'AC' || u === 'ACCURACYCHALLENGE' || u.startsWith('AC:') || u.startsWith('AC_') || u.startsWith('ACCURACYCHALLENGE:') || u.startsWith('ACCURACYCHALLENGE_');
  });
  const isAC = !!acMod;
  let minAccuracy = 0.90;
  if (acMod) {
    const parsed = parseAccuracyChallengeThreshold(acMod);
    if (parsed !== null && Number.isFinite(parsed)) minAccuracy = parsed;
  }

  return {
    health: 1.0,
    failed: false,
    extraLives: isEZ ? 2 : 0,
    hpMultiplierNormal: computeHpMultiplierNormalForMap(hpDrainRate, notes),
    isNoFail: isNF,
    isSuddenDeath: isSD,
    isPerfect: isPF,
    isAccuracyChallenge: isAC,
    minimumAccuracy: minAccuracy,
  };
}

/**
 * Checks whether the Accuracy Challenge (AC) mod condition has triggered a failure.
 * Fails if AC is active, at least one judgement has occurred, and accuracy is below minimum threshold.
 */
export function checkAccuracyChallengeFail(
  state: HealthState,
  accuracyRatio: number,
  judgedCount: number,
): boolean {
  if (state.failed || !state.isAccuracyChallenge || state.isNoFail || judgedCount <= 0) return false;
  const ratio = accuracyRatio > 1.0 ? accuracyRatio / 100 : accuracyRatio;
  if (ratio < state.minimumAccuracy) {
    state.health = 0;
    state.failed = true;
    return true;
  }
  return false;
}

/**
 * Applies a health change from a judgement result to the health state.
 *
 * Handles:
 * - Health clamping to [0.0, 1.0]
 * - Extra lives (EZ mod): refills health on death, consumes one life
 * - NoFail: health can reach 0 but does not trigger failure
 * - SuddenDeath (SD mod): failure on any combo break / miss
 * - Perfect (PF mod): failure on anything below Great (<300) or combo break / miss
 *
 * @param state - Mutable health state to update.
 * @param judgement - The judgement type.
 * @param hpDrainRate - The beatmap HP drain rate.
 * @param context - Whether this is a note, hold head, hold tail, or body break.
 * @returns true if the player has just failed (newly triggered), false otherwise.
 */
export function applyHealthJudgement(
  state: HealthState,
  judgement: JudgementType,
  hpDrainRate: number,
  context: HealthJudgementContext = 'note',
): boolean {
  if (state.failed) return false; // Already failed, no further processing

  if (!state.isNoFail) {
    // Hold body break (early release) causes combo break
    if (context === 'body_break') {
      if (state.isSuddenDeath || state.isPerfect) {
        state.health = 0;
        state.failed = true;
        return true;
      }
      return false;
    }

    // SD fails on any miss (note miss, hold head miss, hold tail miss)
    if (state.isSuddenDeath && judgement === 'miss') {
      state.health = 0;
      state.failed = true;
      return true;
    }

    // PF fails on any judgement below Great (lazer Great = internal perfect; marvelous = lazer Perfect)
    // or any miss
    if (state.isPerfect) {
      if (judgement !== 'marvelous' && judgement !== 'perfect') {
        state.health = 0;
        state.failed = true;
        return true;
      }
    }
  } else if (context === 'body_break') {
    return false;
  }

  const delta = getHealthIncreaseFor(
    judgement,
    hpDrainRate,
    context,
    state.hpMultiplierNormal,
  );

  state.health = Math.max(0, Math.min(1, state.health + delta));

  if (state.health <= 0) {
    if (state.isNoFail) {
      // NF: health stays at 0 but player does not fail
      return false;
    }

    if (state.extraLives > 0) {
      // EZ extra life: refill health and consume one life
      state.extraLives--;
      state.health = 1.0;
      return false;
    }

    // No lives remaining — fail
    state.failed = true;
    return true;
  }

  return false;
}

/**
 * Converts health from the 0..1 scale to the legacy 0..100 display scale.
 * The ScoreState.hp field uses 0..100 for backward compatibility with
 * existing history records, replay data, and the visual HP bar.
 */
export function healthToDisplayPercent(health: number): number {
  return Math.max(0, Math.min(100, health * 100));
}

/**
 * Converts from legacy 0..100 display scale back to 0..1 health.
 */
export function displayPercentToHealth(percent: number): number {
  return Math.max(0, Math.min(1, percent / 100));
}
