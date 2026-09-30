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

import type { Beatmap, HitObject, JudgementWindow, ReplayFrame, ScoreState } from '../../types';
import { getDifficultyMultiplier, getJudgementWindows, getSpeedMultiplier, isClassicMod } from './hitWindows';
import {
  createHoldNoteState,
  LAZER_HOLD_RULES_VERSION,
  missHoldHead,
  missHoldTail,
  onHoldKeyPress,
  onHoldKeyRelease,
  autoReleaseHoldTail,
  TAIL_RELEASE_WINDOW_LENIENCE,
} from './holdNote';
import { applyBeatmapMods, isNoReleaseMod } from './beatmapMods';
import {
  computeAccuracyPercent,
  computeMaxComboPortion,
  computeModMultiplier,
  computeTotalScore,
  countMapJudgements,
  countTotalHits,
  extendMaxComboPortion,
  getComboScoreChange,
} from './scoreProcessor';
import {
  createHealthState,
  applyHealthJudgement,
  checkAccuracyChallengeFail,
  healthToDisplayPercent,
  type HealthJudgementContext,
} from './healthProcessor';
import { getLazerTailJudgementWindow, resolveLazerJudgementWindow } from './judgementTiming';
import { normalizeReplayFrames, upperBoundReplayFrame } from '../../utils/replayCursor';
import {
  advanceHoldTailTicks,
  HOLD_TICK_RULES_VERSION,
  initializeHoldTailTicks,
  markHoldEarlyRelease,
  markHoldReleaseHit,
  markHoldReleaseZonePressed,
  markHoldStartHit,
  markHoldTailEngaged,
  markHoldTailResumed,
  resolveHoldTickInterval,
} from '../../utils/holdTickRules';

import { incrementColumnJudgement, initializeColumnJudgements } from '../../utils/performanceMetrics';

export interface SimulateReplayOptions {
  beatmap: Beatmap;
  replayFrames: ReplayFrame[];
  holdRulesVersion?: 1 | 2 | 3;
  holdTickIntervalMs?: number;
  targetTimeMs?: number;
  selectedMods?: string[];
}

export interface SimulateReplayResult {
  scoreState: ScoreState;
  notes: HitObject[];
  hitErrorSamples: number[];
  finalTimeMs: number;
}

export function simulateManiaReplay(options: SimulateReplayOptions): SimulateReplayResult {
  const {
    beatmap,
    replayFrames,
    holdRulesVersion = LAZER_HOLD_RULES_VERSION,
    holdTickIntervalMs: rawInterval,
    targetTimeMs: rawTargetTime,
    selectedMods = [],
  } = options;

  const activeBeatmap = applyBeatmapMods(beatmap, selectedMods);
  const isNoRelease = isNoReleaseMod(selectedMods);
  const keyCount = activeBeatmap.keyCount || 4;
  const activeHoldTickIntervalMs = holdRulesVersion === HOLD_TICK_RULES_VERSION
    ? resolveHoldTickInterval(rawInterval)
    : undefined;

  const od = activeBeatmap.overallDifficulty ?? 8;
  const hpDrainRate = activeBeatmap.hpDrainRate ?? 5;
  const isClassic = isClassicMod(selectedMods);
  const difficultyMultiplier = getDifficultyMultiplier(selectedMods);
  // Lazer Classic branch still uses totalMultiplier = speed / difficulty.
  const speedMultiplier = getSpeedMultiplier(selectedMods);
  const judgementWindows = getJudgementWindows(od, difficultyMultiplier, speedMultiplier, isClassic);

  const marvelousJudg = judgementWindows.find((w) => w.type === 'marvelous') || judgementWindows[0];
  const badJudg = judgementWindows.find((w) => w.type === 'bad') || judgementWindows[judgementWindows.length - 2];
  const missJudg = judgementWindows.find((w) => w.type === 'miss') || judgementWindows[judgementWindows.length - 1];

  // Initialize notes
  const notes: HitObject[] = (activeBeatmap.notes || []).map((note) => {
    const playNote: HitObject = {
      ...note,
      isHit: false,
      isReleased: false,
      isMissed: false,
      isHoldFailed: false,
      isHeadHit: false,
      tailEngagedTime: undefined,
      tailRequiresRepress: false,
      isReleaseMissed: false,
      isReleaseHit: false,
      earlyReleaseTime: undefined,
      tailResumedTime: undefined,
      releaseZoneArmedTime: undefined,
      holdRulesVersion,
      hitTime: undefined,
      releaseTime: undefined,
      releaseGraceUntil: undefined,
    };

    if (holdRulesVersion === LAZER_HOLD_RULES_VERSION && playNote.type === 'hold') {
      playNote.holdState = createHoldNoteState({
        id: playNote.id,
        startTime: playNote.time,
        endTime: playNote.endTime ?? playNote.time,
        column: playNote.column,
      });
    } else if (holdRulesVersion === HOLD_TICK_RULES_VERSION && playNote.type === 'hold' && activeHoldTickIntervalMs !== undefined) {
      initializeHoldTailTicks(playNote, badJudg.windowMs, activeHoldTickIntervalMs);
    }

    return playNote;
  });

  const columnJudgements = initializeColumnJudgements(keyCount);

  const scoreState: ScoreState = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    comboBreakCount: 0,
    hp: 100,
    marvelousCount: 0,
    perfectCount: 0,
    greatCount: 0,
    goodCount: 0,
    badCount: 0,
    missCount: 0,
    accuracy: 100,
    completed: false,
    failed: false,
    unstableRate: null,
    hitErrorSampleCount: 0,
    columnJudgements,
  };

  let totalJudgements = holdRulesVersion === HOLD_TICK_RULES_VERSION ? 0 : countMapJudgements(beatmap.notes);
  // The v2 tick path grows its total as judgements arrive (extended O(1) per
  // hit below), so it starts from the empty sum 0.
  let maxComboPortion = holdRulesVersion === HOLD_TICK_RULES_VERSION ? 0 : computeMaxComboPortion(totalJudgements);
  let currentComboPortion = 0;
  const hitErrorSamples: number[] = [];
  const healthState = createHealthState(hpDrainRate, selectedMods, activeBeatmap.notes);

  const applyJudgement = (judg: JudgementWindow, col: number, healthContext: HealthJudgementContext = 'note') => {
    if (col >= 0 && col < columnJudgements.length) {
      incrementColumnJudgement(columnJudgements, col, judg.type);
    }

    if (judg.type === 'miss') {
      scoreState.missCount++;
      scoreState.combo = 0;
    } else {
      scoreState.combo++;
      if (scoreState.combo > scoreState.maxCombo) {
        scoreState.maxCombo = scoreState.combo;
      }
      if (judg.type === 'marvelous') scoreState.marvelousCount++;
      else if (judg.type === 'perfect') scoreState.perfectCount++;
      else if (judg.type === 'great') scoreState.greatCount++;
      else if (judg.type === 'good') scoreState.goodCount++;
      else if (judg.type === 'bad') scoreState.badCount++;
    }

    applyHealthJudgement(healthState, judg.type, hpDrainRate, healthContext);
    scoreState.hp = healthToDisplayPercent(healthState.health);
    scoreState.failed = healthState.failed;

    const counts = {
      marvelousCount: scoreState.marvelousCount,
      perfectCount: scoreState.perfectCount,
      greatCount: scoreState.greatCount,
      goodCount: scoreState.goodCount,
      badCount: scoreState.badCount,
      missCount: scoreState.missCount,
    };
    scoreState.accuracy = computeAccuracyPercent(counts);
    const judgedCount = countTotalHits(counts);

    if (checkAccuracyChallengeFail(healthState, scoreState.accuracy, judgedCount)) {
      scoreState.hp = healthToDisplayPercent(healthState.health);
      scoreState.failed = healthState.failed;
    }

    if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
      maxComboPortion = extendMaxComboPortion(maxComboPortion, totalJudgements, judgedCount);
      totalJudgements = judgedCount;
    }

    currentComboPortion += getComboScoreChange(judg.type, scoreState.combo);
    const modMultiplier = computeModMultiplier(selectedMods);
    scoreState.score = computeTotalScore({
      currentComboPortion,
      maxComboPortion,
      accuracyPercent: scoreState.accuracy,
      judgedCount,
      totalJudgements,
      modMultiplier,
    });
  };

  const normalizedReplay = normalizeReplayFrames(replayFrames, keyCount);
  const endTimeMs = rawTargetTime !== undefined
    ? rawTargetTime
    : (normalizedReplay.length > 0 ? normalizedReplay[normalizedReplay.length - 1].time + 1000 : (beatmap.duration || 10) * 1000);

  const checkAutonomousMisses = (currentTime: number, keysPressed?: boolean[]) => {
    // 1. Version 2 discrete hold tail ticks
    if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
      advanceHoldTailTicks(notes, currentTime, keysPressed || [], (note) => applyJudgement(missJudg, note.column));
    }

    // 2. Note autonomous misses
    notes.forEach((n) => {
      // Version 3 Lazer hold rules
      if (n.holdRulesVersion === LAZER_HOLD_RULES_VERSION || (n.holdRulesVersion === undefined && n.holdState)) {
        if (n.type === 'hold' && n.holdState) {
          if (!n.holdState.isHeadJudged && currentTime - n.time > missJudg.windowMs) {
            missHoldHead(n.holdState, n.time + missJudg.windowMs);
            n.isMissed = true;
            applyJudgement(missJudg, n.column, 'hold_head');
          }
          if (isNoRelease && n.holdState.isHolding && !n.holdState.isTailJudged && n.endTime !== undefined && currentTime >= n.endTime) {
            const action = autoReleaseHoldTail(n.holdState, judgementWindows);
            if (action && action.kind === 'tail_hit') {
              n.isReleased = true;
              n.releaseTime = n.endTime;
              n.isReleaseHit = true;
              n.isReleaseMissed = false;
              const tailJudg = judgementWindows.find((w) => w.type === action.judgement) || missJudg;
              applyJudgement(tailJudg, n.column, 'hold_tail');
              hitErrorSamples.push(action.effectiveErrorMs);
            }
          }
          if (!n.holdState.isTailJudged && n.holdState.isHeadJudged && n.endTime !== undefined) {
            const maxExpiry = n.endTime + missJudg.windowMs * TAIL_RELEASE_WINDOW_LENIENCE;
            if (currentTime > maxExpiry) {
              missHoldTail(n.holdState, currentTime);
              n.isReleased = true;
              n.isReleaseMissed = true;
              n.isHoldFailed = true;
              applyJudgement(missJudg, n.column, 'hold_tail');
            }
          }
          return;
        }
      }

      // Version 2 discrete hold tail rules
      const usesTailTicks = n.holdRulesVersion === HOLD_TICK_RULES_VERSION;
      if (!n.isHit && !n.isMissed && currentTime - n.time > missJudg.windowMs) {
        n.isMissed = true;
        applyJudgement(missJudg, n.column);
        if (usesTailTicks) return;
        if (keysPressed && keysPressed[n.column]) {
          n.isHit = true;
          n.hitTime = currentTime;
        }
      }

      if (usesTailTicks) {
        if (n.type === 'hold' && n.endTime !== undefined && !n.isReleased && currentTime - n.endTime > missJudg.windowMs) {
          n.isReleased = true;
          n.isReleaseMissed = true;
          applyJudgement(missJudg, n.column);
        }
        return;
      }

      // Legacy continuous hold rules (version 1)
      if (
        n.type === 'hold' &&
        n.isMissed &&
        !n.isHit &&
        !n.isReleased &&
        !n.isHoldFailed &&
        n.endTime &&
        currentTime - n.endTime > missJudg.windowMs
      ) {
        n.isHoldFailed = true;
        n.isReleased = true;
        applyJudgement(missJudg, n.column);
      }
    });
  };

  const triggerHit = (colIndex: number, frameTime: number) => {
    // Version 3 Lazer hold rules
    if (holdRulesVersion === LAZER_HOLD_RULES_VERSION) {
      const activeHold = notes.find(
        (n) =>
          n.column === colIndex &&
          n.type === 'hold' &&
          n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
          n.holdState &&
          n.holdState.isHeadJudged &&
          !n.holdState.isTailJudged
      );
      if (
        activeHold &&
        activeHold.holdState &&
        !activeHold.holdState.isHolding &&
        activeHold.endTime !== undefined &&
        frameTime < activeHold.endTime
      ) {
        onHoldKeyPress(activeHold.holdState, frameTime, judgementWindows);
        return;
      }

      const note = notes.find(
        (n) =>
          n.column === colIndex &&
          (n.type === 'hold'
            ? n.holdState
              ? !n.holdState.isHeadJudged
              : !n.isHit && !n.isMissed
            : !n.isHit && !n.isMissed)
      );
      if (!note) return;

      const missWindow = judgementWindows[judgementWindows.length - 1].windowMs;
      const diff = frameTime - note.time;
      if (diff < -missWindow) return;

      if (note.type === 'hold' && note.holdState) {
        const action = onHoldKeyPress(note.holdState, frameTime, judgementWindows);
        if (!action) return;

        if (action.kind === 'head_hit') {
          note.isHit = true;
          note.hitTime = frameTime;
          note.isHeadHit = true;
          const resolvedJudg = judgementWindows.find((w) => w.type === action.judgement) || marvelousJudg;
          applyJudgement(resolvedJudg, colIndex, 'hold_head');
          hitErrorSamples.push(action.errorMs);
        } else if (action.kind === 'head_miss') {
          note.isMissed = true;
          note.hitTime = frameTime;
          applyJudgement(missJudg, colIndex, 'hold_head');
        }
        return;
      }

      const resolvedJudgement = resolveLazerJudgementWindow(diff, judgementWindows);
      if (resolvedJudgement.type !== 'miss') {
        note.isHit = true;
        note.hitTime = frameTime;
        applyJudgement(resolvedJudgement, colIndex);
        hitErrorSamples.push(frameTime - note.time);
      } else {
        note.isMissed = true;
        applyJudgement(resolvedJudgement, colIndex);
      }
      return;
    }

    // Version 2 discrete ticks
    const earlyReleasedHold = notes.find(
      (n) =>
        n.column === colIndex &&
        n.type === 'hold' &&
        n.holdRulesVersion === HOLD_TICK_RULES_VERSION &&
        n.isHit &&
        !n.isReleased &&
        !n.isHoldFailed &&
        n.earlyReleaseTime !== undefined
    );
    if (earlyReleasedHold) {
      if (earlyReleasedHold.endTime !== undefined && frameTime >= earlyReleasedHold.endTime - missJudg.windowMs) {
        markHoldReleaseZonePressed(earlyReleasedHold, frameTime);
      } else {
        markHoldTailResumed(earlyReleasedHold, frameTime);
      }
      return;
    }

    const note = notes.find(
      (n) =>
        n.column === colIndex &&
        ((!n.isHit && !n.isMissed) ||
          (n.type === 'hold' && n.isMissed && !n.isHit && !n.isReleased && !n.isHoldFailed))
    );
    if (!note) return;

    const maxWindow = judgementWindows[judgementWindows.length - 1].windowMs;
    if (note.type === 'hold' && note.isMissed && !note.isHit) {
      if (note.endTime && frameTime - note.endTime > maxWindow) return;
      if (note.endTime !== undefined && frameTime >= note.endTime - maxWindow) {
        markHoldReleaseZonePressed(note, frameTime);
        return;
      }
      note.isHit = true;
      note.hitTime = frameTime;
      markHoldTailEngaged(note, frameTime);
      return;
    }

    const diff = frameTime - note.time;
    if (diff < -maxWindow) return;

    const resolvedJudgement = resolveLazerJudgementWindow(diff, judgementWindows);
    if (resolvedJudgement.type !== 'miss') {
      note.isHit = true;
      note.hitTime = frameTime;
      markHoldStartHit(note);
      applyJudgement(resolvedJudgement, colIndex, note.type === 'hold' ? 'hold_head' : 'note');
      hitErrorSamples.push(frameTime - note.time);
    } else {
      note.isMissed = true;
      if (note.type === 'hold') {
        applyJudgement(resolvedJudgement, colIndex, 'hold_head');
        note.isHit = true;
        note.hitTime = frameTime;
        if (note.holdRulesVersion === HOLD_TICK_RULES_VERSION) {
          markHoldTailEngaged(note, frameTime);
        }
      } else {
        applyJudgement(resolvedJudgement, colIndex);
      }
    }
  };

  const triggerRelease = (colIndex: number, frameTime: number) => {
    // Version 3 Lazer hold rules
    if (holdRulesVersion === LAZER_HOLD_RULES_VERSION) {
      const holdNote = notes.find(
        (n) =>
          n.column === colIndex &&
          n.type === 'hold' &&
          n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
          n.holdState &&
          n.holdState.isHeadJudged &&
          !n.holdState.isTailJudged &&
          n.holdState.isHolding
      );
      if (!holdNote || !holdNote.endTime || !holdNote.holdState) return;

      const action = onHoldKeyRelease(holdNote.holdState, frameTime, judgementWindows);
      if (!action) return;

      if (action.kind === 'body_break') {
        holdNote.isHoldFailed = true;
        holdNote.releaseTime = frameTime;
        holdNote.earlyReleaseTime = frameTime;
        scoreState.combo = 0;
        if (scoreState.comboBreakCount !== undefined) {
          scoreState.comboBreakCount++;
        }
        applyHealthJudgement(healthState, 'miss', hpDrainRate, 'body_break');
        scoreState.hp = healthToDisplayPercent(healthState.health);
        scoreState.failed = healthState.failed;
        return;
      }

      if (action.kind === 'tail_hit') {
        holdNote.isReleased = true;
        holdNote.releaseTime = frameTime;
        holdNote.isReleaseHit = true;
        holdNote.isReleaseMissed = false;
        const tailJudg = judgementWindows.find((w) => w.type === action.judgement) || missJudg;
        applyJudgement(tailJudg, colIndex, 'hold_tail');
        hitErrorSamples.push(action.effectiveErrorMs);
        return;
      }

      if (action.kind === 'tail_miss') {
        holdNote.isReleased = true;
        holdNote.releaseTime = frameTime;
        holdNote.isReleaseHit = false;
        holdNote.isReleaseMissed = true;
        holdNote.isHoldFailed = true;
        applyJudgement(missJudg, colIndex, 'hold_tail');
        return;
      }
      return;
    }

    // Version 2 discrete ticks
    const holdNote = notes.find(
      (n) =>
        n.column === colIndex &&
        n.type === 'hold' &&
        !n.isReleased &&
        (n.holdRulesVersion === HOLD_TICK_RULES_VERSION
          ? n.isHeadHit || n.tailEngagedTime !== undefined || n.releaseZoneArmedTime !== undefined
          : n.isHit && !n.isHoldFailed)
    );
    if (!holdNote || !holdNote.endTime) return;

    const endDiff = frameTime - holdNote.endTime;
    if (holdNote.holdRulesVersion === HOLD_TICK_RULES_VERSION) {
      if (endDiff < -missJudg.windowMs) {
        markHoldEarlyRelease(holdNote, frameTime);
        return;
      }
      holdNote.isReleased = true;
      holdNote.releaseTime = frameTime;
      const releaseJudgement = getLazerTailJudgementWindow(endDiff, judgementWindows);
      const releaseMissed = releaseJudgement.type === 'miss';
      holdNote.isReleaseMissed = releaseMissed;
      holdNote.isReleaseHit = !releaseMissed;
      if (releaseMissed) markHoldEarlyRelease(holdNote, frameTime);
      applyJudgement(releaseJudgement, colIndex, 'hold_tail');
      if (!releaseMissed) {
        markHoldReleaseHit(holdNote);
        hitErrorSamples.push(endDiff);
      }
      return;
    }

    // Version 1
    holdNote.isReleased = true;
    holdNote.releaseTime = frameTime;
    const tailJudgement = getLazerTailJudgementWindow(endDiff, judgementWindows);
    applyJudgement(tailJudgement, colIndex, 'hold_tail');
    if (tailJudgement.type !== 'miss') {
      hitErrorSamples.push(endDiff);
    } else {
      holdNote.isHoldFailed = true;
    }
  };

  const historicalFrameCount = upperBoundReplayFrame(normalizedReplay, endTimeMs);
  let prevKeys = new Array(keyCount).fill(false);

  for (let frameIndex = 0; frameIndex < historicalFrameCount; frameIndex++) {
    const frame = normalizedReplay[frameIndex];
    checkAutonomousMisses(frame.time, prevKeys);

    for (let col = 0; col < keyCount; col++) {
      const wasPressed = prevKeys[col];
      const isCurrentlyPressed = frame.keysPressed[col];
      if (!wasPressed && isCurrentlyPressed) {
        triggerHit(col, frame.time);
      } else if (wasPressed && !isCurrentlyPressed) {
        triggerRelease(col, frame.time);
      }
      prevKeys[col] = isCurrentlyPressed;
    }

    if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
      advanceHoldTailTicks(notes, frame.time, prevKeys, (note) => applyJudgement(missJudg, note.column));
    }
  }

  checkAutonomousMisses(endTimeMs, prevKeys);

  scoreState.completed = true;
  scoreState.hitErrorSampleCount = hitErrorSamples.length;

  return {
    scoreState,
    notes,
    hitErrorSamples,
    finalTimeMs: endTimeMs,
  };
}
