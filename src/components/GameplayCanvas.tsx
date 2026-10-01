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

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Maximize, Settings, Info, Home, Sliders, X } from 'lucide-react';
import PauseOverlay from './PauseOverlay';
import ManiaHud, { drawVerticalHitErrorMeter } from './ManiaHud';
import { mainAudio } from '../audio/AudioEngine';
import { previewPlayer } from '../utils/previewPlayer';
import { Beatmap, GameSettings, HitObject, JudgementType, JudgementWindow, PenarBreakdown, ScoreState, ReplayFrame, PlayHistoryRecord } from '../types';
import { initializeColumnJudgements, incrementColumnJudgement } from '../utils/performanceMetrics';
import { VideoSyncController, computeTargetVideoTimeSec } from '../utils/videoSyncController';
import { executeTeardown } from '../utils/gameplayTeardown';
import {
  autoReleaseHoldTail,
  createHoldNoteState,
  getDifficultyMultiplier,
  getJudgementWindows,
  getLazerTailJudgementWindow,
  getSpeedMultiplier,
  HoldNoteState,
  isClassicMod,
  isConstantSpeedMod,
  isHoldGraceActive,
  isNoReleaseMod,
  LAZER_HOLD_RULES_VERSION,
  missHoldHead,
  missHoldTail,
  onHoldKeyPress,
  onHoldKeyRelease,
  resolveHoldGrace,
  resolveLazerJudgementWindow,
  TAIL_RELEASE_WINDOW_LENIENCE,
} from '../ruleset/mania';
import {
  advanceHoldTailTicks,
  HOLD_TICK_RULES_VERSION,
  holdTickIntervalMs,
  initializeHoldTailTicks,
  LEGACY_HOLD_RULES_VERSION,
  markHoldReleaseHit,
  markHoldEarlyRelease,
  markHoldStartHit,
  markHoldTailEngaged,
  markHoldTailResumed,
  markHoldReleaseZonePressed,
  TICK_BOUNDARY_EPSILON_MS,
} from '../utils/holdTickRules';
import { consumeReplayFrames, createReplayCursor, normalizeReplayFrames, resetReplayCursor, type ReplayCursor, upperBoundReplayFrame } from '../utils/replayCursor';
import { UnstableRateAccumulator } from '../utils/unstableRateAccumulator';
import { TouchInputAdapter } from '../utils/touchInputAdapter';
import { FullscreenManager } from '../utils/fullscreenManager';
import { GameplayMediaRegistry } from '../utils/mediaRegistry';
import { AssetLifecycleManager, getMimeTypeFromFilename, getVideoFormatLabel, isBrowserPlayableVideoFilename } from '../utils/assetLifecycle';
import { storageManager } from '../utils/storageManager';
import type { SavedBeatmap } from '../utils/storageManager';
import { unpackBeatmap } from '../utils/unpackHelper';
import { sanitizeCssUrl } from '../utils/securityLimits';
import {
  ACCURACY_BASE_SCORE,
  computeAccuracyPercent,
  computeMaxComboPortion,
  extendMaxComboPortion,
  computeModMultiplier,
  computeTotalScore,
  countMapJudgements,
  countTotalHits,
  getComboScoreChange,
} from '../ruleset/mania/scoreProcessor';
import {
  createHealthState,
  applyHealthJudgement,
  checkAccuracyChallengeFail,
  healthToDisplayPercent,
  type HealthState,
  type HealthJudgementContext,
} from '../ruleset/mania/healthProcessor';
import { SCROLL_SPEED_MAX, SCROLL_SPEED_MIN } from './settings/defaultSettings';
import { computePenar, computeLivePenar } from '../utils/penar';
import { calculateManiaDifficultyAttributes, calculateTimedManiaDifficultyAttributes, type TimedManiaDifficultyAttributes } from '../ruleset/mania/difficultyCalculator';

// HIGH PERFORMANCE INTEGRATED RENDERER IMPORTS
import { IPlayfieldRenderer, ColumnLayout, BarLineVisual } from '../render/types';
import { WebGL2PlayfieldRenderer } from '../render/WebGL2PlayfieldRenderer';
import { getLaneColors } from '../render/skinTheme';
import { calculateScrollSpeedFactor, computeScrollTravelTimeMs, getScrollYPosition, updateColumnsLayout } from '../render/playfieldLayout';
import { generateBarLines, type BarLine } from '../render/barLines';
import { getColumnStyles } from '../render/laneLayout';
import { getVisibleNotes } from '../render/noteVisibility';
import { getEffectiveDpr } from '../render/displayScale';
import { createScrollModel, ScrollModel } from '../render/scrollVelocity';
import { computeSongDensityBins, getArgonPlayfieldWidthPercent, isArgonSkin } from '../render/argonSkin';
import { parseBeatmap } from '../utils/beatmapParser';
import {
  PLAYFIELD_WIDTH_MAX,
  PLAYFIELD_WIDTH_MIN,
} from './settings/defaultSettings';
import {
  INTRO_SKIP_LEAD_IN_MS,
  INTRO_SKIP_THRESHOLD_MS,
  canPerformSkip,
  computeSkipTargetMs,
  isIntroSkippable,
  isSkipWindowActive,
} from '../utils/introSkip';

export function checkNotesAutonomousMisses(
  notes: HitObject[],
  currentTime: number,
  missBound: number,
  onMiss: (n: HitObject, isDoubleMiss: boolean) => void,
  keysPressed?: boolean[],
  isNoRelease: boolean = false,
  judgementWindows?: JudgementWindow[],
  onTailHit?: (n: HitObject, judgement: JudgementType, errorMs: number) => void,
  startIndex: number = 0,
  assumeSorted: boolean = false,
) {
  const begin = Number.isFinite(startIndex) && startIndex > 0 ? Math.min(startIndex, notes.length) : 0;
  for (let idx = begin; idx < notes.length; idx++) {
    const n = notes[idx];
    // Sorted fast path: heads (and therefore tails, since endTime >= time)
    // only move further into the future, so nothing past this point can miss.
    if (assumeSorted && n.time - currentTime > missBound) {
      const endFuture = n.type !== 'hold' || n.endTime === undefined || currentTime - n.endTime <= missBound;
      if (endFuture) break;
    }
    // 0. Lazer hold rules (version 3)
    if (n.holdRulesVersion === LAZER_HOLD_RULES_VERSION || (n.holdRulesVersion === undefined && n.holdState)) {
      if (n.type === 'hold' && n.holdState) {
        // Head timeout check
        if (!n.holdState.isHeadJudged && currentTime - n.time > missBound) {
          missHoldHead(n.holdState, n.time + missBound);
          n.isMissed = true;
          onMiss(n, false);
        }
        // No Release mod auto-release check
        if (isNoRelease && n.holdState.isHolding && !n.holdState.isTailJudged && n.endTime !== undefined && currentTime >= n.endTime && judgementWindows) {
          const action = autoReleaseHoldTail(n.holdState, judgementWindows);
          if (action && action.kind === 'tail_hit') {
            n.isReleased = true;
            n.releaseTime = n.endTime;
            n.isReleaseHit = true;
            n.isReleaseMissed = false;
            if (onTailHit) {
              onTailHit(n, action.judgement, action.effectiveErrorMs);
            }
          }
        }
        // Tail timeout check (1.5x lenience)
        if (!n.holdState.isTailJudged && n.holdState.isHeadJudged && n.endTime !== undefined) {
          const maxExpiry = n.endTime + missBound * TAIL_RELEASE_WINDOW_LENIENCE;
          if (currentTime > maxExpiry) {
            missHoldTail(n.holdState, currentTime);
            n.isReleased = true;
            n.isReleaseMissed = true;
            n.isHoldFailed = true;
            onMiss(n, false);
          }
        }
        continue;
      }
    }

    const usesTailTicks = n.holdRulesVersion === HOLD_TICK_RULES_VERSION;
    // 1. Head window expired: normal notes miss fully; holds only miss the head and stay salvageable for the tail
    if (!n.isHit && !n.isMissed && currentTime - n.time > missBound) {
      n.isMissed = true;
      if (n.type === 'hold') {
        onMiss(n, false);
        if (usesTailTicks) continue;
        // Head miss only — body/tail remain active
        // If the lane is already held when the head times out, engage the LN for tail scoring
        if (keysPressed && keysPressed[n.column]) {
          n.isHit = true;
          n.hitTime = currentTime;
          if (usesTailTicks) markHoldTailEngaged(n, currentTime);
        }
      } else {
        onMiss(n, false);
      }
    }

    if (usesTailTicks) {
      if (n.type === 'hold' && n.endTime !== undefined && !n.isReleased && currentTime - n.endTime > missBound) {
        n.isReleased = true;
        n.isReleaseMissed = true;
        onMiss(n, false);
      }
      continue;
    }

    // 1b. Head already missed, never engaged: tail times out separately
    if (
      n.type === 'hold' &&
      n.isMissed &&
      !n.isHit &&
      !n.isReleased &&
      !n.isHoldFailed &&
      n.endTime &&
      currentTime - n.endTime > missBound
    ) {
      n.isHoldFailed = true;
      n.isReleased = true;
      onMiss(n, false);
    }
    
    // 2. Continuous hold note missed intermediate bounds (engaged holds, including post-head-miss salvage)
    if (n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.endTime) {
      const stillHeld = !!(keysPressed && keysPressed[n.column]);

      // Spurious early release: if the lane is still logically held, heal grace
      // Resolve grace against the event clock, not RAF timing. A re-press at
      // the exact deadline is valid; anything later resolves before input.
      if (n.releaseGraceUntil !== undefined) {
        if (isHoldGraceActive(currentTime, n.releaseGraceUntil) && stillHeld) {
          n.releaseGraceUntil = undefined;
        } else if (!isHoldGraceActive(currentTime, n.releaseGraceUntil)) {
          const transition = resolveHoldGrace(n, currentTime);
          n.releaseGraceUntil = transition.releaseGraceUntil;
          n.isHoldFailed = transition.isHoldFailed;
          n.isReleased = transition.isReleased;
          onMiss(n, false);
        }
      }
      // Or if reached end without release, and time elapsed past miss boundary.
      else if (n.releaseGraceUntil === undefined && currentTime - n.endTime > missBound) {
        n.isHoldFailed = true;
        n.isReleased = true;
        onMiss(n, false);
      }
    }
  }
}

const formatMsToMinSec = (timeMs: number) => {
  const totalSecs = Math.max(0, Math.floor(timeMs / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Low-latency input helpers: resolve the audio-clock time of a DOM input event
// by subtracting main-thread handler delay (performance.now - event.timeStamp).
// Falls back to a fresh audio-clock read when no timestamp is available.
export function resolveEventInputDelayMs(eventTimeStamp?: number): number {
  if (typeof eventTimeStamp !== 'number' || !Number.isFinite(eventTimeStamp)) return 0;
  const delay = performance.now() - eventTimeStamp;
  if (!Number.isFinite(delay)) return 0;
  return Math.max(0, Math.min(100, delay));
}

function codeForBinding(binding: string): string | null {
  if (binding === ' ') return 'Space';
  if (binding === ';') return 'Semicolon';
  if (binding === ',') return 'Comma';
  if (binding === '.') return 'Period';
  if (binding === '/') return 'Slash';
  if (binding === "'") return 'Quote';
  if (binding === '[') return 'BracketLeft';
  if (binding === ']') return 'BracketRight';
  if (binding === '-') return 'Minus';
  if (binding === '=') return 'Equal';
  if (/^[a-zA-Z]$/.test(binding)) return `Key${binding.toUpperCase()}`;
  if (/^[0-9]$/.test(binding)) return `Digit${binding}`;
  return null;
}

// Physical-position lookup first (e.code, layout-independent), then legacy
// e.key fallback so custom bindings keep working.
export function findColumnForKeyboardEvent(
  e: Pick<KeyboardEvent, 'key' | 'code'>,
  keyLayout: string[],
): number {
  if (e.code) {
    for (let i = 0; i < keyLayout.length; i++) {
      const expected = codeForBinding(keyLayout[i]);
      if (expected && expected === e.code) return i;
    }
  }
  const key = (e.key || '').toLowerCase();
  return keyLayout.findIndex((k) => (k || '').toLowerCase() === key);
}

interface GameplayCanvasProps {
  beatmap: Beatmap;
  settings: GameSettings;
  updateSettings?: (s: Partial<GameSettings>) => void;
  onFinish: (score: ScoreState, replay?: ReplayFrame[], hitErrors?: number[]) => void;
  onBack: () => void;
  replayRecord?: PlayHistoryRecord | null;
}

interface HitErrorTick {
  id: string;
  error: number;
  timestamp: number;
  color: string;
}

// Vertical hit-error meters are owned by the ManiaHud overlay module
// (drawVerticalHitErrorMeter). The playfield canvas never draws HUD meters.

// All ManiaHud overlay work flushes on two tiers so the overlay stays cheap
// while feeling live. The fast tier (12.5Hz) owns React score/combo/HP/
// accuracy/judgement, progress + time labels, key-counter DOM, and
// hit-error meters. The slow tier (3Hz) owns the live PENAR counter (slow
// moving, costs a difficulty-table lookup) and the FPS readout. The playfield canvas itself still renders
// every rAF; only the DOM/React overlay is throttled.
export const MANIA_HUD_UPDATE_INTERVAL_MS = 80;
export const MANIA_HUD_SLOW_UPDATE_INTERVAL_MS = 333;

export default function GameplayCanvas({
  beatmap: originalBeatmap,
  settings: propSettings,
  updateSettings,
  onFinish,
  onBack,
  replayRecord = null
}: GameplayCanvasProps) {
  const beatmap = React.useMemo(() => {
    let baseMap: SavedBeatmap = originalBeatmap as SavedBeatmap;
    const legacy = originalBeatmap as SavedBeatmap;
    // Re-parse from .osu source when available so timing/SV matches the current parser
    // (negative/zero SV, uninherited reset). Full merge when timingPoints were never stored.
    if (legacy.originalContent) {
      try {
        const parsed = parseBeatmap(legacy.originalContent, baseMap.id);
        if (!baseMap.timingPoints || baseMap.timingPoints.length === 0) {
          baseMap = {
            ...legacy,
            ...parsed,
            audioUrl: legacy.audioUrl,
            videoUrl: legacy.videoUrl,
            bgUrl: legacy.bgUrl,
            videoStartTime: legacy.videoStartTime !== undefined ? legacy.videoStartTime : parsed.videoStartTime,
            packageId: legacy.packageId,
            parentPackageId: legacy.parentPackageId,
            audioFilename: legacy.audioFilename,
            videoFilename: legacy.videoFilename,
            bgFilename: legacy.bgFilename,
            originalContent: legacy.originalContent,
            isServerMap: legacy.isServerMap,
          } as unknown as SavedBeatmap;
        } else {
          baseMap = {
            ...baseMap,
            timingPoints: parsed.timingPoints,
          } as SavedBeatmap;
        }
      } catch (err) {
        console.error('Failed to auto-repair/re-parse legacy beatmap timing points:', err);
      }
    }
    return {
      ...baseMap,
      notes: baseMap.notes ? baseMap.notes.map(n => ({ ...n })) : []
    };
  }, [originalBeatmap]);

  // Override settings if we're watching a replay
  const settings = React.useMemo(() => {
    if (replayRecord?.recordedSettings) {
      const replayMods = replayRecord.mods || replayRecord.recordedSettings.selectedMods || [];
      return {
        ...propSettings,
        ...replayRecord.recordedSettings,
        selectedMods: replayMods,
        musicVolume: propSettings.musicVolume,
        hitsoundVolume: propSettings.hitsoundVolume,
        masterVolume: propSettings.masterVolume,
        videoOpacity: propSettings.videoOpacity,
        backgroundDim: propSettings.backgroundDim
      };
    }
    return propSettings;
  }, [propSettings, replayRecord]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const scrollModelRef = useRef<ScrollModel | null>(null);
  useEffect(() => {
    const enableMapSV = settings.enableMapSV !== false && !isConstantSpeedMod(settings.selectedMods);
    scrollModelRef.current = createScrollModel(beatmap, enableMapSV);
  }, [beatmap, settings.enableMapSV, settings.selectedMods]);

  // Find earliest note time in the beatmap
  const firstNoteTime = React.useMemo(() => {
    const notes = beatmap.notes || [];
    if (notes.length === 0) return 0;
    return Math.min(...notes.map(n => n.time));
  }, [beatmap]);

  const startDelayMs = React.useMemo(() => {
    return Math.max(0, 2000 - firstNoteTime);
  }, [firstNoteTime]);

  const introSkippable = React.useMemo(() => isIntroSkippable(firstNoteTime, INTRO_SKIP_THRESHOLD_MS), [firstNoteTime]);
  const skipTargetMs = React.useMemo(() => computeSkipTargetMs(firstNoteTime, INTRO_SKIP_LEAD_IN_MS), [firstNoteTime]);

  // TASK-V-052: Rate-invariant map-time 64-bin density histogram computed once per beatmap identity
  const densityBins = React.useMemo(() => {
    return computeSongDensityBins(beatmap.notes, (beatmap.duration || 0) * 1000);
  }, [beatmap.id, beatmap.notes, beatmap.duration]);

  // Visual-only osu!lazer-style measure guide lines, generated once per beatmap.
  const barLineSource: BarLine[] = React.useMemo(() => {
    return generateBarLines(beatmap.timingPoints, (beatmap.duration || 0) * 1000);
  }, [beatmap.id, beatmap.timingPoints, beatmap.duration]);

  const replayData = React.useMemo(
    () => normalizeReplayFrames(replayRecord?.replayFrames, beatmap.keyCount),
    [replayRecord?.replayFrames, beatmap.keyCount]
  );
  const holdRulesVersion = replayRecord?.holdRulesVersion ?? LAZER_HOLD_RULES_VERSION;
  const activeHoldTickIntervalMs = holdRulesVersion === HOLD_TICK_RULES_VERSION
    ? replayRecord?.holdTickIntervalMs ?? holdTickIntervalMs
    : undefined;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftHitErrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightHitErrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const syncControllerRef = useRef<VideoSyncController | null>(null);

  // Replay structures
  const replayFramesRef = useRef<ReplayFrame[]>([]);
  const lastProcessedReplayTimeRef = useRef<number>(-1);
  const replayCursorRef = useRef<ReplayCursor>(createReplayCursor());

  // Callback ref to register HTMLVideoElement in non-serializable global registry correctly on mount/unmount
  const setVideoRef = React.useCallback((node: HTMLVideoElement | null) => {
    const previousNode = videoRef.current;
    if (previousNode && previousNode !== node) {
      try { previousNode.pause(); } catch (_e) {}
      syncControllerRef.current?.destroy();
      syncControllerRef.current = null;
      GameplayMediaRegistry.setVideo(null);
    }

    videoRef.current = node;
    GameplayMediaRegistry.setVideo(node);
    if (node) {
      try {
        node.muted = true;
        node.playsInline = true;
        node.preload = 'auto';
        if (node.readyState < 1) {
          node.load();
        }
      } catch (err) {
        console.warn('Error inside video registration player:', err);
      }
    }
  }, []);
  const animationFrameRef = useRef<number | null>(null);
  const isPrePlayRef = useRef<boolean>(true);
  const lockedScrollSpeedRef = useRef<number>(settings.scrollSpeed);

  const handleExit = () => {
    try {
      const nav = navigator as Navigator & { keyboard?: { unlock?: () => void } };
      nav.keyboard?.unlock?.();
    } catch { /* ignore */ }
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
    executeTeardown(
      mainAudio,
      animationFrameRef.current,
      null,
      null,
      null,
      {
        timers: [
          finishTimeoutRef.current,
          uiJudgementTimeoutRef.current,
          scrollTimeoutRef.current,
        ].filter((timer): timer is ReturnType<typeof setTimeout> => timer !== null),
        video: videoRef.current,
        videoSync: syncControllerRef.current,
      }
    );
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) {}
    }
    
    // If they failed or are at 0 HP, submit as finished fail record so they see performance telemetry and replay
    if (scoreStateRef.current.failed) {
      if (isMountedRef.current) {
        // Failed runs never reach the full chart, so evaluate PENAR with the
        // progressive difficulty at the fail point like lazer live PP.
        scoreStateRef.current.penar = computeLivePenar({
          timedAttributes: timedPenarRef.current,
          progressTime: audioTimeRef.current,
          fallbackStarRating: penarDifficultyRef.current ? penarDifficultyRef.current.starRating : null,
          marvelousCount: scoreStateRef.current.marvelousCount,
          perfectCount: scoreStateRef.current.perfectCount,
          greatCount: scoreStateRef.current.greatCount,
          goodCount: scoreStateRef.current.goodCount,
          badCount: scoreStateRef.current.badCount,
          missCount: scoreStateRef.current.missCount,
          maxCombo: scoreStateRef.current.maxCombo,
          mods: settings.selectedMods,
        });
        onFinishRef.current(scoreStateRef.current, replayFramesRef.current, hitErrorSamplesRef.current);
      }
    } else {
      onBack();
    }
  };
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const isFocusModeRef = useRef<boolean>(false);

  useEffect(() => {
    isFocusModeRef.current = isFocusMode;
  }, [isFocusMode]);

  // Synchronize dynamic focus view modes with the programmatic Fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
        const active = FullscreenManager.isFullscreenActive();
      if (!active) {
        setIsFocusMode((prevActive) => {
          if (prevActive) {
            // Leaving fullscreen before the player starts must not create a
            // pause state underneath the pre-play screen or during unpause countdown.
            if (isPrePlayRef.current || unpauseCountdownRef.current > 0) return false;
            // Trigger pause because user exited native fullscreen externally
            setIsPaused(true);
            isPlayingRef.current = false;
            mainAudio.pause();
            if (videoRef.current) {
              try { videoRef.current.pause(); } catch (e) {}
            }
          }
          return false;
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFocus = async () => {
    const container = document.getElementById('gameplay-container');
    if (!container) return;

    if (!isFocusMode) {
      const entered = await FullscreenManager.enterFocusMode(container);
      setIsFocusMode(entered);
    } else {
      setIsFocusMode(false);
      await FullscreenManager.exitFocusMode();
    }
  };
  // Game state refs (to avoid stale closures in high-frequency keyboard/requestAnimationFrame loops)
  const isPlayingRef = useRef<boolean>(true);
  const audioStartPendingRef = useRef<boolean>(false);
  const audioTimeRef = useRef<number>(0);
  const smoothOffsetRef = useRef<number>(settings.audioOffset);
  // Anti-teleport song-time filter: the audio clock is truth for judgement,
  // but a single jumped frame (GC, video seek, rate switch, start edge)
  // must not teleport notes. Visual songTime chases the audio target with a
  // slew limit derived from wall dt, so hitches become quick glides.
  const lastSongTimeRef = useRef<number>(0);
  const lastFrameWallRef = useRef<number>(0);
  // Set before intentional jumps (start/seek/skip/restart) so the next frame
  // accepts the target instead of slewing from the old timeline.
  const songTimeJumpRef = useRef<boolean>(true);
  // Cursors that shrink the per-frame O(n) scans to the active window.
  // Notes are time-sorted at initialize; cursors only skip fully-resolved
  // prefixes and reset on any backwards timeline move.
  const missCursorRef = useRef<number>(0);
  const autoplayCursorRef = useRef<number>(0);
  // Per-column head pointers for the input path: notes are time-sorted at
  // initialize, so each lane keeps an index into its own column list and the
  // press path scans only a few candidates instead of the whole chart.
  // Rebuilt on initialize; .find() remains as the fallback for holds that
  // resolve out of order (re-presses, grace, salvage).
  const columnNotesRef = useRef<HitObject[][]>([]);
  const columnCursorRef = useRef<number[]>([]);
  // Holds that actually own v2 tail ticks. Rebuilt on initialize; the hot
  // tick advance then iterates hundreds of holds instead of all notes.
  const tickHoldsRef = useRef<HitObject[]>([]);
  const readGameplayTime = () => {
    const currentTime = mainAudio.getCurrentTimeMs();
    if (Number.isFinite(currentTime)) audioTimeRef.current = currentTime;
    return audioTimeRef.current;
  };
  const notesRef = useRef<HitObject[]>([]);
  const scoreStateRef = useRef<ScoreState>({
    score: 0,
    combo: 0,
    maxCombo: 0,
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
    columnJudgements: initializeColumnJudgements(beatmap.keyCount),
  });
  const healthStateRef = useRef<HealthState>(
    createHealthState(beatmap.hpDrainRate, settings.selectedMods, beatmap.notes)
  );

  const hitErrorSamplesRef = useRef<number[]>([]);
  const unstableRateAccumulatorRef = useRef(new UnstableRateAccumulator());

  const recordHitErrorSample = (error: number) => {
    if (typeof error !== 'number' || !Number.isFinite(error)) return;
    hitErrorSamplesRef.current.push(error);
    unstableRateAccumulatorRef.current.add(error);
    scoreStateRef.current.unstableRate = unstableRateAccumulatorRef.current.unstableRate;
    scoreStateRef.current.hitErrorSampleCount = hitErrorSamplesRef.current.length;
  };

  const maxComboPortionRef = useRef<number>(1);
  const currentComboPortionRef = useRef<number>(0);
  const totalJudgementsRef = useRef<number>(1);

  const [uiScore, setUiScore] = useState<number>(0);
  const [uiCombo, setUiCombo] = useState<number>(0);
  const [uiHp, setUiHp] = useState<number>(100);
  const [uiAccuracy, setUiAccuracy] = useState<number>(100);
  const [uiPenar, setUiPenar] = useState<PenarBreakdown | null>(null);
  const [uiJudgement, setUiJudgement] = useState<{ text: string; color: string; time: number } | null>(null);
  // Throttled HUD sync: applyJudgement only writes these refs (no setState in
  // the input path). The rAF loop flushes to React on the fast 12.5Hz tier,
  // so per-note reconciliation never blocks judgement or audio.
  const hudPendingRef = useRef({ score: 0, combo: 0, hp: 100, accuracy: 100 });
  // Lazer-accurate PENAR difficulty, computed once per chart+rate at setup.
  const penarDifficultyRef = useRef<{ starRating: number; maxCombo: number } | null>(null);
  // Progressive (timed) difficulty for the live PENAR counter. lazer pairs
  // each judgement with the difficulty processed so far; using the
  // full-chart rating mid-map awards near-final PENAR after a few notes.
  const timedPenarRef = useRef<TimedManiaDifficultyAttributes[]>([]);
  const hudJudgementRef = useRef<{ text: string; color: string; time: number } | null>(null);
  const lastHudFlushRef = useRef<number>(0);
  const lastHudSlowFlushRef = useRef<number>(0);
  const lastMeterSigRef = useRef<string>('');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [unpauseCountdown, setUnpauseCountdown] = useState<number>(0);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isFailed, setIsFailed] = useState<boolean>(false);
  // One-shot SFX guards: fail plays once per run; miss plays only for the
  // first miss of any consecutive miss chain (a later hit re-arms it).
  const failSoundPlayedRef = useRef(false);
  const missChainActiveRef = useRef(false);

  // Active inputs trace (boolean edge + refcount for multi-source keyboard/touch)
  const keysPressedRef = useRef<boolean[]>([]);
  const lanePressCountRef = useRef<number[]>([]);
  const activeColumnsRef = useRef<boolean[]>([]);
  const hasKeyPressedOnceRef = useRef<boolean[]>([]);
  const keyPressCountsRef = useRef<number[]>([]);

  // Key-counter DOM flushes at the fast HUD cadence. Input paths only bump
  // refs here; the rAF flush owns `innerText`/class writes. Canvas lane glow
  // stays per-frame so presses still feel instant. Element handles are cached
  // per keyCount so the flush never pays getElementById at 12.5Hz.
  const keyCounterElsRef = useRef<Array<{ count: HTMLElement | null; box: HTMLElement | null }>>([]);
  const cacheKeyCounterEls = () => {
    const cached: Array<{ count: HTMLElement | null; box: HTMLElement | null }> = [];
    for (let i = 0; i < beatmap.keyCount; i++) {
      cached.push({
        count: document.getElementById(`argon-key-count-${i}`),
        box: document.getElementById(`argon-key-box-${i}`),
      });
    }
    keyCounterElsRef.current = cached;
  };
  const updateKeyCounterUi = (colIndex: number, _isPressed: boolean, incrementCount: boolean = false) => {
    if (colIndex < 0 || colIndex >= beatmap.keyCount) return;
    if (incrementCount) {
      keyPressCountsRef.current[colIndex] = (keyPressCountsRef.current[colIndex] || 0) + 1;
    }
  };

  const flushKeyCounterUi = () => {
    const counts = keyPressCountsRef.current;
    const pressed = keysPressedRef.current;
    let cached = keyCounterElsRef.current;
    if (cached.length !== beatmap.keyCount) {
      cacheKeyCounterEls();
      cached = keyCounterElsRef.current;
    }
    for (let i = 0; i < beatmap.keyCount; i++) {
      const els = cached[i];
      // First flush after mount can race the HUD render: fall back to a
      // one-time lookup and keep the handle for subsequent flushes.
      let countEl = els?.count ?? null;
      if (!countEl) {
        countEl = document.getElementById(`argon-key-count-${i}`);
        if (els) els.count = countEl;
      }
      if (countEl) {
        const next = String(counts[i] || 0);
        if (countEl.innerText !== next) countEl.innerText = next;
      }
      let boxEl = els?.box ?? null;
      if (!boxEl) {
        boxEl = document.getElementById(`argon-key-box-${i}`);
        if (els) els.box = boxEl;
      }
      if (boxEl) {
        const shouldActive = !!pressed[i];
        const isActive = boxEl.classList.contains('argon-key-active');
        if (shouldActive !== isActive) {
          if (shouldActive) boxEl.classList.add('argon-key-active');
          else boxEl.classList.remove('argon-key-active');
        }
      }
    }
  };

  const resetKeyCounterUi = () => {
    keyPressCountsRef.current = new Array(beatmap.keyCount).fill(0);
    cacheKeyCounterEls();
    const cached = keyCounterElsRef.current;
    for (let i = 0; i < beatmap.keyCount; i++) {
      const countEl = cached[i]?.count ?? document.getElementById(`argon-key-count-${i}`);
      if (countEl) countEl.innerText = '0';
      const boxEl = cached[i]?.box ?? document.getElementById(`argon-key-box-${i}`);
      if (boxEl) boxEl.classList.remove('argon-key-active');
    }
  };

  // Single-lane press highlight, written synchronously so the bottom-right
  // key boxes react on the input event itself instead of waiting for the
  // next rAF / 80ms HUD flush. Count text still flushes on the slow tier.
  const setKeyBoxActiveImmediate = (colIndex: number, pressed: boolean) => {
    if (colIndex < 0 || colIndex >= beatmap.keyCount) return;
    let cached = keyCounterElsRef.current;
    if (cached.length !== beatmap.keyCount) {
      cacheKeyCounterEls();
      cached = keyCounterElsRef.current;
    }
    let boxEl = cached[colIndex]?.box ?? null;
    if (!boxEl) {
      boxEl = document.getElementById(`argon-key-box-${colIndex}`);
      const els = cached[colIndex];
      if (els) els.box = boxEl;
    }
    if (!boxEl) return;
    const isActive = boxEl.classList.contains('argon-key-active');
    if (pressed !== isActive) {
      if (pressed) boxEl.classList.add('argon-key-active');
      else boxEl.classList.remove('argon-key-active');
    }
  };

  // Per-frame press-highlight sync (class-only, no innerText reads): keeps
  // replay/autoplay/hold visuals at frame latency instead of the 80ms HUD
  // tier. Cheap: at most 10 cached class toggles, no layout reads.
  const flushKeyBoxesFast = () => {
    const pressed = keysPressedRef.current;
    let cached = keyCounterElsRef.current;
    if (cached.length !== beatmap.keyCount) {
      cacheKeyCounterEls();
      cached = keyCounterElsRef.current;
    }
    for (let i = 0; i < beatmap.keyCount; i++) {
      const els = cached[i];
      let boxEl = els?.box ?? null;
      if (!boxEl) {
        boxEl = document.getElementById(`argon-key-box-${i}`);
        if (els) els.box = boxEl;
      }
      if (boxEl) {
        const shouldActive = !!pressed[i];
        const isActive = boxEl.classList.contains('argon-key-active');
        if (shouldActive !== isActive) {
          if (shouldActive) boxEl.classList.add('argon-key-active');
          else boxEl.classList.remove('argon-key-active');
        }
      }
    }
  };
  // Ref-stable handle so the input-event effect (mounted once) can write the
  // highlight synchronously without a stale closure.
  const keyBoxActiveRef = useRef(setKeyBoxActiveImmediate);
  keyBoxActiveRef.current = setKeyBoxActiveImmediate;
  const flushKeyBoxesFastRef = useRef(flushKeyBoxesFast);
  flushKeyBoxesFastRef.current = flushKeyBoxesFast;
  const progressBarRef = useRef<HTMLElement | HTMLInputElement | null>(null);
  const isScrubbingRef = useRef<boolean>(false);
  // Last flushed overlay values so the fast HUD flush skips redundant DOM writes.
  const lastProgressPercentRef = useRef<number>(-1);
  const lastScrubberBgRef = useRef<string>('');
  const lastElapsedSecRef = useRef<number>(-1);
  const lastRemainSecRef = useRef<number>(-1);
  const lastVideoSeekTimeRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const timeLeftLabelRef = useRef<HTMLSpanElement>(null);
  const breakLabelRef = useRef<HTMLSpanElement>(null);
  const fpsLabelRef = useRef<HTMLSpanElement>(null);
  const fpsFramesRef = useRef<number>(0);
  const fpsLastSampleRef = useRef<number>(0);
  const isReplayMode = !!replayRecord;
  const isAutoplay = !isReplayMode && ((settings.selectedMods || []).includes('AT') || (settings.selectedMods || []).includes('CN'));
  const isCinema = !isReplayMode && (settings.selectedMods || []).includes('CN');
  // AT-only keypress visuals: CN cinema hides the playfield chassis, so it
  // keeps the legacy autoplay path (judgement only, no lane/key-box presses).
  const showAutoplayKeys = isAutoplay && !isCinema;
  // Tap press hold time: how long a tap head keeps the lane + key box lit.
  // Long enough to survive one fast-HUD flush so the flash is always visible,
  // short enough that streams don't look stuck.
  const AUTOPLAY_TAP_VISUAL_MS = 90;

  /** Map-failed sting, played once per run (never in replays/autoplay). */
  const playFailSoundOnce = () => {
    if (isReplayMode || isAutoplay) return;
    if (failSoundPlayedRef.current) return;
    failSoundPlayedRef.current = true;
    mainAudio.playFailSound();
  };

  /**
   * Miss-chain tick: plays miss-sound.mp3 only for the first miss of any
   * consecutive miss chain. Any on-time hit re-arms it. Never in
   * replays/autoplay (those misses aren't the player's).
   */
  const handleJudgementSfx = (judgType: string) => {
    if (isReplayMode || isAutoplay) return;
    if (judgType === 'miss') {
      if (!missChainActiveRef.current) {
        missChainActiveRef.current = true;
        mainAudio.playMissSound();
      }
    } else {
      missChainActiveRef.current = false;
    }
  };
  const isNoRelease = isNoReleaseMod(settings.selectedMods);
  const isConstantSpeed = isConstantSpeedMod(settings.selectedMods);
  const adaptiveSpeedAvgErrorRef = useRef<number>(0);
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiJudgementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unpauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isPausedRef = useRef<boolean>(false);
  const unpauseCountdownRef = useRef<number>(0);
  const showSettingsModalRef = useRef<boolean>(false);
  const showInfoModalRef = useRef<boolean>(false);
  const [hasSkippedIntro, setHasSkippedIntro] = useState<boolean>(false);
  const [isSkipVisible, setIsSkipVisible] = useState<boolean>(false);
  const hasSkippedIntroRef = useRef<boolean>(false);
  const skipVisibleRef = useRef<boolean>(false);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { unpauseCountdownRef.current = unpauseCountdown; }, [unpauseCountdown]);
  useEffect(() => { hasSkippedIntroRef.current = hasSkippedIntro; }, [hasSkippedIntro]);
  useEffect(() => { skipVisibleRef.current = isSkipVisible; }, [isSkipVisible]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (unpauseTimeoutRef.current) {
        clearTimeout(unpauseTimeoutRef.current);
        unpauseTimeoutRef.current = null;
      }
      executeTeardown(mainAudio, animationFrameRef.current, null, null, null, {
        timers: [
          finishTimeoutRef.current,
          uiJudgementTimeoutRef.current,
          scrollTimeoutRef.current,
        ].filter((timer): timer is ReturnType<typeof setTimeout> => timer !== null),
        video: videoRef.current,
        videoSync: syncControllerRef.current,
      });
    };
  }, []);
  
  // Dynamic visual visualizers
  const laneGlowRef = useRef<number[]>([]);
  
  // Judgement popup tracker
  const currentJudgementRef = useRef<{ text: string, color: string, time: number, size: number } | null>(null);

  // Hit error timing logs
  const hitErrorTicksRef = useRef<HitErrorTick[]>([]);
  // Monotonic tick ids avoid Math.random().toString(36) churn per hit.
  const hitErrorTickIdRef = useRef<number>(0);
  // Cached mod multiplier: recomputed only when the selected-mods array
  // identity changes (settings updates replace the array).
  const cachedModsRef = useRef<readonly string[] | undefined>(undefined);
  const cachedModMultiplierRef = useRef<number>(1);
  const colsLayoutBufferRef = useRef<ColumnLayout[]>([]);
  // Frame-loop scratch buffers: reused every rAF to avoid per-frame GC churn.
  const visibleNotesBufferRef = useRef<import('../render/types').VisibleNote[]>([]);
  const visibleBarLinesBufferRef = useRef<BarLineVisual[]>([]);
  const keyLabelsBufferRef = useRef<string[]>([]);
  const autoplayHoldKeysRef = useRef<boolean[]>([]);
  // Per-lane autoplay hold refcounts: incremented on hold-head events,
  // decremented on tail events. Lets the per-frame lane-state update run in
  // O(keys) instead of scanning every note for holding holds.
  const autoplayHoldCountRef = useRef<number[]>([]);
  // Per-lane autoplay tap release times (judgeTime ms): tap heads press the
  // lane + bottom-right key box like a real keydown, released when judgeTime
  // passes the expiry. Frame-driven (not setTimeout) so pause/seek stay safe.
  const autoplayTapReleaseRef = useRef<number[]>([]);
  const lastAutoplayTimeRef = useRef<number>(0);
  const [loadingAudioProgress, setLoadingAudioProgress] = useState<number>(0);
  const [isAudioLoaded, setIsAudioLoaded] = useState<boolean>(false);
  // Hard renderer failure (WebGL2 unavailable). Surfaced as an overlay
  // instead of a blank playfield.
  const [rendererError, setRendererError] = useState<string | null>(null);

  // Custom pre-play stage states
  const [isPrePlay, setIsPrePlay] = useState<boolean>(true);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  useEffect(() => {
    isPrePlayRef.current = isPrePlay;
    if (isPrePlay) {
      lockedScrollSpeedRef.current = settings.scrollSpeed;
    }
  }, [isPrePlay, settings.scrollSpeed]);
  useEffect(() => { showSettingsModalRef.current = showSettingsModal; }, [showSettingsModal]);
  useEffect(() => { showInfoModalRef.current = showInfoModal; }, [showInfoModal]);

  // PIPELINE DIAGNOSTICS & DECODING FALLBACK STATES
  const [isPlayingFallback, setIsPlayingFallback] = useState<boolean>(false);
  const [isVideoMissing, setIsVideoMissing] = useState<boolean>(false);
  const [isVideoError, setIsVideoError] = useState<boolean>(false);
  /** Soft notice for AVI/MKV/etc — not a hard error; static bg is used. */
  const [videoFormatWarning, setVideoFormatWarning] = useState<string | null>(null);
  const [showVideoFormatWarning, setShowVideoFormatWarning] = useState(true);
  // Resolved media URLs must live in React state — mutating beatmap.videoUrl does not re-render <video>
  const [mediaUrls, setMediaUrls] = useState({
    audioUrl: originalBeatmap.audioUrl || '',
    videoUrl: originalBeatmap.videoUrl || '',
    bgUrl: originalBeatmap.bgUrl || '',
  });

  // Playfield Renderer References
  const activeRendererRef = useRef<IPlayfieldRenderer | null>(null);
  // Cached CSS size avoids a forced layout (clientWidth) on every rAF tick.
  const canvasCssSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    let active = true;

    const initRenderer = async () => {
      // 1. Destroy existing renderer if any
      if (activeRendererRef.current) {
        try {
          activeRendererRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying active playfield renderer:', e);
        }
        activeRendererRef.current = null;
      }

      if (!canvasRef.current) return;
      // Non-null local: canvasRef.current stays the source of truth for the
      // rAF loop.
      const canvas: HTMLCanvasElement = canvasRef.current;

      // WebGL2 is the only playfield renderer. SV/judgement are untouched:
      // the renderer consumes the same SV-projected PlayfieldFrame.
      // Flashlight's dark vignette renders in-shader (see flashlight.ts).
      try {
        setRendererError(null);
        const renderer: IPlayfieldRenderer = new WebGL2PlayfieldRenderer();
        await renderer.init(canvas, { settings, keyCount: beatmap.keyCount });

        if (!active) {
          renderer.destroy();
          return;
        }

        activeRendererRef.current = renderer;

        // Force initial resize
        const container = containerRef.current;
        const canvasRect = canvas.getBoundingClientRect();
        const width = canvasRect.width || (container ? container.getBoundingClientRect().width : 400);
        const height = canvasRect.height || (container ? container.getBoundingClientRect().height : 700);
        const dpr = getEffectiveDpr(settings);
        renderer.resize(width, height, dpr);
      } catch (err) {
        console.error('Failed to initialize playfield renderer:', err);
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setRendererError(`Playfield renderer failed: ${msg}`);
        }
      }
    };

    initRenderer();

    return () => {
      active = false;
      if (activeRendererRef.current) {
        try {
          activeRendererRef.current.destroy();
        } catch (e) {}
        activeRendererRef.current = null;
      }
    };
  }, [settings.renderDpr, beatmap.keyCount, isAudioLoaded]);

  // Lazer Mania EZ/HR scale hit-window difficulty rather than changing OD; DT/HT/NC/DC scale song-time hit-windows with clock rate.
  // Classic mod restores stable-style hit windows but keeps lazer speed compensation (totalMultiplier = speed / difficulty).
  const isClassic = isClassicMod(settings.selectedMods);
  const windowDifficultyMultiplier = getDifficultyMultiplier(settings.selectedMods);
  const windowSpeedMultiplier = getSpeedMultiplier(settings.selectedMods);
  const judgementWindows = getJudgementWindows(
    Number.isFinite(beatmap.overallDifficulty) ? beatmap.overallDifficulty : 8,
    windowDifficultyMultiplier,
    windowSpeedMultiplier,
    isClassic,
  );
  const marvelousJudg = judgementWindows.find(w => w.type === 'marvelous') || judgementWindows[0];
  const badJudg = judgementWindows.find(w => w.type === 'bad') || judgementWindows[judgementWindows.length - 2];
  const missJudg = judgementWindows.find(w => w.type === 'miss') || judgementWindows[judgementWindows.length - 1];
  // O(1) judgement lookup for the input/tail paths (avoids .find per hit).
  const judgementByType = React.useMemo(() => {
    const map = new Map<string, (typeof judgementWindows)[number]>();
    for (const w of judgementWindows) {
      if (!map.has(w.type)) map.set(w.type, w);
    }
    return map;
  }, [judgementWindows]);
  const judgementByTypeRef = useRef(judgementByType);
  judgementByTypeRef.current = judgementByType;

  const initializeGameplay = (runCountdown: boolean = false) => {
    // Deep copy notes from the beatmap, ensuring gameplay properties reset
    notesRef.current = (beatmap.notes || []).map(note => {
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
    // Time-sort once so per-frame scans can early-break on future notes and
    // cursors can skip fully-resolved prefixes. Parser output is usually
    // sorted, but imports/replays may not be.
    notesRef.current.sort((a, b) => a.time - b.time);
    missCursorRef.current = 0;
    autoplayCursorRef.current = 0;
    autoplayHoldCountRef.current = new Array(beatmap.keyCount).fill(0);
    autoplayTapReleaseRef.current = new Array(beatmap.keyCount).fill(Number.NEGATIVE_INFINITY);
    lastAutoplayTimeRef.current = 0;
    // Per-column views share the same note object identities, so judgement
    // flags stay in sync; each lane list stays time-sorted via the global sort.
    {
      const perColumn: HitObject[][] = Array.from({ length: beatmap.keyCount }, () => []);
      for (const n of notesRef.current) {
        if (n.column >= 0 && n.column < beatmap.keyCount) perColumn[n.column].push(n);
      }
      columnNotesRef.current = perColumn;
      columnCursorRef.current = new Array(beatmap.keyCount).fill(0);
    }
    tickHoldsRef.current = notesRef.current.filter(
      (n) => n.type === 'hold' && n.nextTailTickTime !== undefined,
    );
    // Park the timeline at the lead-in start so the pre-play render and the
    // first audio frames agree. Previously audioTime stayed at 0 (stopped
    // clock) until playAsync resolved, then jumped to -startDelay in one
    // frame — the start-of-song note teleport.
    {
      const startOffset = settingsRef.current.audioOffset || 0;
      const parked = -startDelayMs - startOffset;
      audioTimeRef.current = parked;
      lastSongTimeRef.current = parked;
      smoothOffsetRef.current = startOffset;
    }
    songTimeJumpRef.current = true;
    lastFrameWallRef.current = 0;
    
    // Reset key arrays
    keysPressedRef.current = new Array(beatmap.keyCount).fill(false);
    lanePressCountRef.current = new Array(beatmap.keyCount).fill(0);
    activeColumnsRef.current = new Array(beatmap.keyCount).fill(false);
    laneGlowRef.current = new Array(beatmap.keyCount).fill(0);
    hasKeyPressedOnceRef.current = new Array(beatmap.keyCount).fill(false);
    resetKeyCounterUi();
    
    hitErrorSamplesRef.current = [];
    unstableRateAccumulatorRef.current.reset();
    
    // Reset score tracking
    scoreStateRef.current = {
      score: 0,
      combo: 0,
      maxCombo: 0,
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
      columnJudgements: initializeColumnJudgements(beatmap.keyCount),
      isAutoplay: isAutoplay,
    };
    healthStateRef.current = createHealthState(beatmap.hpDrainRate, settings.selectedMods, beatmap.notes);

    // osu!lazer mania standardised score: max combo portion for all-Marvelous FC.
    // The v2 tick path grows its total as judgements arrive (extended O(1) per
    // hit in applyJudgement), so it starts from the empty sum 0.
    const totalJudgements = holdRulesVersion === HOLD_TICK_RULES_VERSION ? 0 : countMapJudgements(beatmap.notes);
    totalJudgementsRef.current = totalJudgements;
    maxComboPortionRef.current =
      holdRulesVersion === HOLD_TICK_RULES_VERSION ? 0 : computeMaxComboPortion(totalJudgements);
    currentComboPortionRef.current = 0;

    // Lazer-accurate PENAR difficulty: strain passes run once per chart+rate;
    // live PP reuses the progressive table on the slow HUD tick so per-frame
    // rendering stays free.
    const penarRate = getSpeedMultiplier(settings.selectedMods);
    penarDifficultyRef.current = calculateManiaDifficultyAttributes(
      beatmap.notes,
      beatmap.keyCount,
      penarRate,
    );
    timedPenarRef.current = calculateTimedManiaDifficultyAttributes(
      beatmap.notes,
      beatmap.keyCount,
      penarRate,
    );
    scoreStateRef.current.penar = computePenar({
      starRating: penarDifficultyRef.current.starRating,
      maxCombo: 0,
      mods: settings.selectedMods,
    });
    setUiPenar(scoreStateRef.current.penar);

    // Reset replay tracking
    replayFramesRef.current = [{ time: 0, keysPressed: new Array(beatmap.keyCount).fill(false) }];

    // Reset hit error timing ticks
    hitErrorTicksRef.current = [];
    hitErrorSamplesRef.current = [];
    unstableRateAccumulatorRef.current.reset();
    lastProcessedReplayTimeRef.current = -1;
    resetReplayCursor(replayCursorRef.current, replayData);
    
    syncControllerRef.current?.destroy();
    syncControllerRef.current = null;
    audioStartPendingRef.current = false;
    
    hudPendingRef.current.score = 0;
    hudPendingRef.current.combo = 0;
    hudPendingRef.current.hp = 100;
    hudPendingRef.current.accuracy = 100;
    hudJudgementRef.current = null;
    lastHudFlushRef.current = 0;
    lastHudSlowFlushRef.current = 0;
    lastMeterSigRef.current = '';
    setUiScore(0);
    setUiCombo(0);
    setUiHp(100);
    setUiAccuracy(100);
    setUiJudgement(null);
    setIsPaused(false);
    setIsFailed(false);
    failSoundPlayedRef.current = false;
    missChainActiveRef.current = false;
    isPlayingRef.current = false;
    hasSkippedIntroRef.current = false;
    skipVisibleRef.current = false;
    setHasSkippedIntro(false);
    setIsSkipVisible(false);
    
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      } catch (e) {}
    }

    // Automatically scroll the browser/window up, ensuring gameplay elements, focus mode or exit buttons are prominent on mobile viewports
    try {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Also scroll the container itself into view to ensure it clears any headers/margins
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          scrollTimeoutRef.current = null;
          const containerElem = document.getElementById('gameplay-container');
          if (containerElem) {
            containerElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          // Reset scroll counters just in case smooth scrolling gets blocked by iframe sandboxing policies
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }, 150);
      }
    } catch (scrollErr) {
      console.warn('Silent fallback for scroll transition bounds:', scrollErr);
    }

  };

  // Initialize and load track + background media
  useEffect(() => {
    previewPlayer.stopImmediately();
    let active = true;
    const loadGeneration = mainAudio.beginLoadGeneration();
    setIsAudioLoaded(false);
    setIsVideoError(false);
    setIsVideoMissing(false);
    setVideoFormatWarning(null);
    setShowVideoFormatWarning(true);
    setIsPlayingFallback(false);
    syncControllerRef.current?.destroy();
    syncControllerRef.current = null;

    const loadBgAudio = async () => {
      const mapWithPkg = beatmap as SavedBeatmap;
      const skipVideoOnLoad = settings.disableVideo === true;
      try {
        // Prefer shared unpacker (typed blobs + video fallback + package id cache key).
        // skipVideo avoids inflating video bytes at all when disabled — the
        // render layer would refuse to mount <video> anyway.
        await unpackBeatmap(mapWithPkg, false, { skipVideo: skipVideoOnLoad });
      } catch (mediaErr) {
        console.error('Failed to resolve beatmap media from package:', mediaErr);
      }

      if (!active) return;

      const cached = storageManager.lruMediaCache.get(beatmap.id);
      const resolved = {
        audioUrl: cached?.audioUrl || beatmap.audioUrl || '',
        videoUrl: skipVideoOnLoad ? '' : (cached?.videoUrl || beatmap.videoUrl || ''),
        bgUrl: cached?.bgUrl || beatmap.bgUrl || '',
      };
      beatmap.audioUrl = resolved.audioUrl;
      beatmap.videoUrl = resolved.videoUrl;
      beatmap.bgUrl = resolved.bgUrl;
      setMediaUrls(resolved);

      mainAudio.init();
      mainAudio.setVolumes(settings.musicVolume, settings.hitsoundVolume, settings.masterVolume);
      mainAudio.setOffset(settings.audioOffset);
      mainAudio.compensateOutputLatency = settings.compensateOutputLatency === true;
      // Warm the file-backed SFX (soft-hitwhistle default + fail/miss/
      // restart) alongside the track so gameplay events play instantly.
      mainAudio.preloadSfx();

      const activeRate = getSpeedMultiplier(settings.selectedMods);
      mainAudio.playbackRate = activeRate;

       const success = await mainAudio.loadTrack(resolved.audioUrl || '', (p) => {
         if (active && mainAudio.isLoadGenerationCurrent(loadGeneration)) setLoadingAudioProgress(p);
       }, loadGeneration);
       await mainAudio.loadBeatmapHitsounds(beatmap.hitSoundUrls || {}, loadGeneration);

       if (!active || !mainAudio.isLoadGenerationCurrent(loadGeneration)) return;

       setIsAudioLoaded(true);
      if (!success) {
        setIsPlayingFallback(true);
      }

      const declaredVideo = mapWithPkg.videoFilename as string | undefined;
      if (!skipVideoOnLoad && declaredVideo && !resolved.videoUrl) {
        if (!isBrowserPlayableVideoFilename(declaredVideo)) {
          const fmt = getVideoFormatLabel(declaredVideo);
          setVideoFormatWarning(fmt);
          setShowVideoFormatWarning(true);
        } else {
          setIsVideoMissing(true);
        }
      }

      initializeGameplay();
    };

    loadBgAudio();

    return () => {
      active = false;
      mainAudio.beginLoadGeneration();
      mainAudio.stop();
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch (e) {}
      }
    };
  }, [beatmap]);

  // Apply Disable-background-video flips immediately, mid-song. Disabling
  // tears down and releases the video blob; re-enabling re-unpacks just the
  // missing video channel (audio/bg/hitsounds are reused from cache).
  useEffect(() => {
    if (!isAudioLoaded) return;
    const disabled = settings.disableVideo === true;
    if (disabled) {
      if (!mediaUrls.videoUrl) return;
      try { videoRef.current?.pause(); } catch (e) {}
      syncControllerRef.current?.destroy();
      syncControllerRef.current = null;
      GameplayMediaRegistry.setVideo(null);
      const cached = storageManager.lruMediaCache.get(beatmap.id);
      const stateUrl = mediaUrls.videoUrl;
      if (stateUrl && stateUrl !== cached?.videoUrl && stateUrl.startsWith('blob:')) {
        AssetLifecycleManager.releaseSpecific(stateUrl);
      }
      if (cached) {
        // put() revokes the retained cached video blob (replaced by '').
        storageManager.lruMediaCache.put(beatmap.id, {
          audioUrl: cached.audioUrl,
          videoUrl: '',
          bgUrl: cached.bgUrl,
          hitSoundUrls: cached.hitSoundUrls,
        });
      } else if (stateUrl.startsWith('blob:')) {
        AssetLifecycleManager.releaseSpecific(stateUrl);
      }
      beatmap.videoUrl = '';
      setMediaUrls((prev) => (prev.videoUrl ? { ...prev, videoUrl: '' } : prev));
      return;
    }
    if (mediaUrls.videoUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        await unpackBeatmap(beatmap as SavedBeatmap, false);
      } catch (mediaErr) {
        console.error('Failed to restore beatmap video after re-enable:', mediaErr);
      }
      if (cancelled || settingsRef.current.disableVideo === true) return;
      const cached = storageManager.lruMediaCache.get(beatmap.id);
      const videoUrl = cached?.videoUrl || beatmap.videoUrl || '';
      if (!videoUrl) {
        const declared = (beatmap as SavedBeatmap).videoFilename as string | undefined;
        if (declared && isBrowserPlayableVideoFilename(declared)) setIsVideoMissing(true);
        return;
      }
      beatmap.videoUrl = videoUrl;
      setIsVideoError(false);
      setIsVideoMissing(false);
      setMediaUrls((prev) => ({ ...prev, videoUrl }));
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.disableVideo, isAudioLoaded, mediaUrls.videoUrl, beatmap]);

  // Handle immediate sync of volume and offset values
  useEffect(() => {
    if (isAudioLoaded) {
      mainAudio.setVolumes(settings.musicVolume, settings.hitsoundVolume, settings.masterVolume);
      mainAudio.setOffset(settings.audioOffset);
      mainAudio.compensateOutputLatency = settings.compensateOutputLatency === true;
    }
  }, [isAudioLoaded, settings.musicVolume, settings.hitsoundVolume, settings.masterVolume, settings.audioOffset, settings.compensateOutputLatency]);

  const snapVideoToAudio = (audioTimeMs?: number, playIfReady: boolean = true) => {
    const video = videoRef.current;
    if (!video) return;
    const tMs = audioTimeMs ?? audioTimeRef.current;
    const target = computeTargetVideoTimeSec(
      tMs,
      beatmap.videoStartTime || 0,
      settingsRef.current.videoOffset || 0
    );
    try {
      video.playbackRate = mainAudio.playbackRate;
      if (target < 0) {
        if (video.currentTime > 0.001) video.currentTime = 0;
        if (!video.paused) video.pause();
        return;
      }
      if (Math.abs(video.currentTime - target) > 0.012) {
        video.currentTime = target;
      }
      if (playIfReady && video.paused) {
        video.play().catch(() => {});
      }
      syncControllerRef.current?.snapToAudio(playIfReady);
    } catch (_e) {}
  };

  const performIntroSkip = React.useCallback(() => {
    if (isPrePlayRef.current) return false;
    if (hasSkippedIntroRef.current) return false;
    if (!introSkippable) return false;
    if (isPausedRef.current) return false;
    if (scoreStateRef.current.failed) return false;
    const currentTime = audioTimeRef.current;
    if (!canPerformSkip(currentTime, firstNoteTime, false, INTRO_SKIP_THRESHOLD_MS)) return false;

    hasSkippedIntroRef.current = true;
    skipVisibleRef.current = false;
    setHasSkippedIntro(true);
    setIsSkipVisible(false);

    const targetMs = skipTargetMs;
    mainAudio.seekGameplayTimeMs(targetMs);
    audioTimeRef.current = targetMs;
    lastSongTimeRef.current = targetMs;
    songTimeJumpRef.current = true;
    smoothOffsetRef.current = settingsRef.current.audioOffset;
    laneGlowRef.current.fill(0);
    hitErrorTicksRef.current = [];
    currentJudgementRef.current = null;

    const needsPlay = !isPlayingRef.current && !audioStartPendingRef.current;
    if (needsPlay) {
      audioStartPendingRef.current = true;
      void mainAudio.playAsync(beatmap.bpm, settingsRef.current.audioOffset).then(() => {
        audioStartPendingRef.current = false;
        isPlayingRef.current = true;
        const now = mainAudio.getCurrentTimeMs();
        audioTimeRef.current = now;
        lastSongTimeRef.current = now;
        songTimeJumpRef.current = true;
        snapVideoToAudio(now, true);
      }).catch(() => {
        audioStartPendingRef.current = false;
      });
    } else {
      snapVideoToAudio(targetMs, true);
    }

    if (!isReplayMode && !isAutoplay) {
      const expectedGapMs = targetMs - currentTime;
      if (expectedGapMs > 60000) {
        const anchorCount = Math.ceil(expectedGapMs / 60000);
        for (let anchor = 1; anchor < anchorCount; anchor++) {
          const anchorTime = currentTime + (expectedGapMs * anchor) / anchorCount;
          const safeTime = Math.min(targetMs - 1, Math.max(0, Math.round(anchorTime)));
          const lastAnchor = replayFramesRef.current[replayFramesRef.current.length - 1];
          const keysAnchor = lastAnchor ? [...lastAnchor.keysPressed] : new Array(beatmap.keyCount).fill(false);
          replayFramesRef.current.push({ time: safeTime, keysPressed: keysAnchor });
        }
      }
      const last = replayFramesRef.current[replayFramesRef.current.length - 1];
      const keys = last ? [...last.keysPressed] : new Array(beatmap.keyCount).fill(false);
      replayFramesRef.current.push({ time: targetMs, keysPressed: keys });
    }

    return true;
  }, [beatmap.bpm, beatmap.keyCount, firstNoteTime, introSkippable, isAutoplay, isReplayMode, skipTargetMs]);

  useEffect(() => {
    if (unpauseCountdown > 0) {
      const timer = setTimeout(() => {
        unpauseTimeoutRef.current = null;
        if (unpauseCountdown === 1) {
          setUnpauseCountdown(0);
          setIsPaused(false);
          isPausedRef.current = false;
          isPlayingRef.current = true;
          void mainAudio.playAsync(beatmap.bpm, settings.audioOffset).then(() => {
            const now = mainAudio.getCurrentTimeMs();
            audioTimeRef.current = now;
            lastSongTimeRef.current = now;
            songTimeJumpRef.current = true;
            snapVideoToAudio(now, true);
          });
        } else {
          setUnpauseCountdown(unpauseCountdown - 1);
        }
      }, 1000);
      unpauseTimeoutRef.current = timer;
      return () => clearTimeout(timer);
    }
  }, [unpauseCountdown, beatmap.bpm, settings.audioOffset]);

  // Unified Keyboard processing & Multi-Touch Input Adapter
  // Listeners stay mounted for the play session; gate state is read from refs to avoid
  // teardown/reset mid-hold when pause/countdown/modals flip.
  useEffect(() => {
    const touchTarget = containerRef.current;
    const keyCount = beatmap.keyCount;

    if (lanePressCountRef.current.length !== keyCount) {
      lanePressCountRef.current = new Array(keyCount).fill(0);
    }
    
    // Refcounted lane press so keyboard + touch on the same column do not fight.
    // explicitTime is the event-time audio clock (already corrected for handler
    // delay). When omitted, a fresh audio-clock read is used.
    const virtualKeyDown = (colIndex: number, explicitTime?: number) => {
      if (isPrePlayRef.current || isPausedRef.current || scoreStateRef.current.failed || isAutoplay) return;
      if (colIndex < 0 || colIndex >= keyCount) return;

      const counts = lanePressCountRef.current;
      counts[colIndex] = (counts[colIndex] || 0) + 1;
      if (counts[colIndex] !== 1) return;

      updateKeyCounterUi(colIndex, true, true);

      const freshTime = readGameplayTime();
      const inputTime = typeof explicitTime === 'number' && Number.isFinite(explicitTime) ? explicitTime : freshTime;
      if (holdRulesVersion === HOLD_TICK_RULES_VERSION && tickHoldsRef.current.length > 0) {
        advanceHoldTailTicks(tickHoldsRef.current, inputTime - TICK_BOUNDARY_EPSILON_MS, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
      }
      keysPressedRef.current[colIndex] = true;
      activeColumnsRef.current[colIndex] = true;
      laneGlowRef.current[colIndex] = 1.0;
      keyBoxActiveRef.current(colIndex, true);
      if (hasKeyPressedOnceRef.current) {
        hasKeyPressedOnceRef.current[colIndex] = true;
      }
      triggerHitEvent(colIndex, inputTime);
      if (holdRulesVersion === HOLD_TICK_RULES_VERSION && tickHoldsRef.current.length > 0) {
        advanceHoldTailTicks(tickHoldsRef.current, inputTime, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
      }

      if (!isReplayMode) {
        replayFramesRef.current.push({
          time: inputTime,
          keysPressed: [...keysPressedRef.current]
        });
      }
    };

    const virtualKeyUp = (colIndex: number, explicitTime?: number) => {
      if (isPrePlayRef.current || isPausedRef.current || scoreStateRef.current.failed || isAutoplay) return;
      if (colIndex < 0 || colIndex >= keyCount) return;

      const counts = lanePressCountRef.current;
      if ((counts[colIndex] || 0) <= 0) return;
      counts[colIndex] -= 1;
      if (counts[colIndex] > 0) return;

      updateKeyCounterUi(colIndex, false, false);

      const freshTime = readGameplayTime();
      const inputTime = typeof explicitTime === 'number' && Number.isFinite(explicitTime) ? explicitTime : freshTime;
      if (holdRulesVersion === HOLD_TICK_RULES_VERSION && tickHoldsRef.current.length > 0) {
        advanceHoldTailTicks(tickHoldsRef.current, inputTime - TICK_BOUNDARY_EPSILON_MS, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
      }
      keysPressedRef.current[colIndex] = false;
      activeColumnsRef.current[colIndex] = false;
      keyBoxActiveRef.current(colIndex, false);
      if (holdRulesVersion === HOLD_TICK_RULES_VERSION && tickHoldsRef.current.length > 0) {
        advanceHoldTailTicks(tickHoldsRef.current, inputTime, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
      }
       
      triggerReleaseEvent(colIndex, inputTime);

      if (!isReplayMode) {
        replayFramesRef.current.push({
          time: inputTime,
          keysPressed: [...keysPressedRef.current]
        });
      }
    };

    // 1. Keyboard event parsing listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.repeat) return;
      
      if (isPrePlayRef.current) {
        if (showSettingsModalRef.current || showInfoModalRef.current) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          onBack();
        }
        return;
      }

      const currentSettings = settingsRef.current;

      // 1.1 Quick Retry Check
      const retryKey = (currentSettings.bindRetry || 'r').toLowerCase();
      if (e.key.toLowerCase() === retryKey) {
        e.preventDefault();
        restartMap();
        return;
      }

      // 1.2 Pause/Resume Check
      const pauseKey = (currentSettings.bindPause || 'escape').toLowerCase();
      const isPauseTrigger = e.key.toLowerCase() === pauseKey || e.key === 'Escape';

      if (isPauseTrigger) {
        e.preventDefault();
        if (unpauseCountdownRef.current > 0) {
          return; // Ignore / disable Escape and pause key during active countdowns
        }
        if (!isPausedRef.current && isFocusModeRef.current) {
          // Programmatically exit focus mode which triggers the fullscreen change listener to exit and pause
          FullscreenManager.exitFocusMode();
        } else {
          togglePause();
        }
        return;
      }

      {
        const skipKey = ((currentSettings as unknown as Record<string, string>).bindSkipIntro || 'enter').toLowerCase();
        const pressed = e.key.toLowerCase();
        const code = (e.code || '').toLowerCase();
        const isSkipKey = pressed === skipKey || code === skipKey || (skipKey === 'enter' && (pressed === 'enter' || code === 'enter' || code === 'numpadenter')) || pressed === ' ' || code === 'space';
        if (isSkipKey && introSkippable && !hasSkippedIntroRef.current) {
          if (performIntroSkip()) {
            e.preventDefault();
            return;
          }
        }
      }

      if (isReplayMode || isAutoplay) return; // ignore user key taps in replay mode or autoplay

      const keyLayout = currentSettings.bindings[keyCount] || [];
      const colIndex = findColumnForKeyboardEvent(e, keyLayout);
      if (colIndex !== -1) {
        const corrected = readGameplayTime() - resolveEventInputDelayMs(e.timeStamp);
        virtualKeyDown(colIndex, corrected);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      if (isReplayMode || isAutoplay) return; // ignore user key taps in replay mode or autoplay

      const currentSettings = settingsRef.current;
      const keyLayout = currentSettings.bindings[keyCount] || [];
      const colIndex = findColumnForKeyboardEvent(e, keyLayout);
      if (colIndex !== -1) {
        const corrected = readGameplayTime() - resolveEventInputDelayMs(e.timeStamp);
        virtualKeyUp(colIndex, corrected);
      }
    };

    // On focus restore after blur/pause, drop stale press counts so holds do not stick forever
    const reconcileInputOnFocus = () => {
      if (isPausedRef.current || unpauseCountdownRef.current > 0) return;
      lanePressCountRef.current.fill(0);
      for (let i = 0; i < keyCount; i++) {
        if (keysPressedRef.current[i]) {
          keysPressedRef.current[i] = false;
          activeColumnsRef.current[i] = false;
          keyBoxActiveRef.current(i, false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('focus', reconcileInputOnFocus);

    // 2. Pointer + touch input. Pointer Events are preferred (lower latency,
    // no compatibility double-fire); Touch Events are the Safari fallback.
    // Interaction rects are cached (~500ms) to avoid layout thrash per event.
    let touchAdapter: TouchInputAdapter | null = null;
    let handleTouchStart: ((e: TouchEvent) => void) | null = null;
    let handleTouchMove: ((e: TouchEvent) => void) | null = null;
    let handleTouchEnd: ((e: TouchEvent) => void) | null = null;
    let handleTouchCancel: ((e: TouchEvent) => void) | null = null;
    let handlePointerDown: ((e: PointerEvent) => void) | null = null;
    let handlePointerMove: ((e: PointerEvent) => void) | null = null;
    let handlePointerUp: ((e: PointerEvent) => void) | null = null;
    let handlePointerCancel: ((e: PointerEvent) => void) | null = null;
    const activePointers = new Map<number, number>();
    let cachedRect: DOMRect | null = null;
    let cachedRectAt = 0;
    const getInteractionRect = (): DOMRect | null => {
      if (!touchTarget) return null;
      const now = performance.now();
      if (!cachedRect || now - cachedRectAt > 500) {
        cachedRect = touchTarget.getBoundingClientRect();
        cachedRectAt = now;
      }
      return cachedRect;
    };
    const invalidateInteractionRect = () => {
      cachedRect = null;
    };
    const laneFromClientX = (clientX: number, rect: DOMRect): number => {
      if (!Number.isFinite(clientX) || rect.width <= 0 || keyCount <= 0) return -1;
      const relX = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
      const idx = Math.floor(relX / (rect.width / keyCount));
      return idx >= 0 && idx < keyCount ? idx : -1;
    };
    const inTouchZone = (clientY: number, rect: DOMRect): boolean => {
      const ratio = (clientY - rect.top) / rect.height;
      return settingsRef.current.upsurfaceNoteMode ? ratio <= 0.4 : ratio >= 0.6;
    };
    const inHoldStickyBand = (clientY: number, rect: DOMRect): boolean => {
      const ratio = (clientY - rect.top) / rect.height;
      if (settingsRef.current.upsurfaceNoteMode) return ratio <= 0.65;
      return ratio >= 0.35;
    };
    const usePointer = typeof window !== 'undefined' && 'PointerEvent' in window;

    if (touchTarget) {
      if (usePointer) {
        handlePointerDown = (e: PointerEvent) => {
          if (isReplayMode || isAutoplay) return;
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          const rect = getInteractionRect();
          if (!rect) return;
          if (!inTouchZone(e.clientY, rect)) return;
          const lane = laneFromClientX(e.clientX, rect);
          if (lane < 0) return;
          if (activePointers.has(e.pointerId)) return;
          activePointers.set(e.pointerId, lane);
          const corrected = readGameplayTime() - resolveEventInputDelayMs(e.timeStamp);
          virtualKeyDown(lane, corrected);
        };
        handlePointerMove = (e: PointerEvent) => {
          if (isReplayMode || isAutoplay) return;
          const prevLane = activePointers.get(e.pointerId);
          if (prevLane === undefined) return;
          const rect = getInteractionRect();
          if (!rect) return;
          if (!inHoldStickyBand(e.clientY, rect)) {
            activePointers.delete(e.pointerId);
            const corrected = readGameplayTime() - resolveEventInputDelayMs(e.timeStamp);
            virtualKeyUp(prevLane, corrected);
            return;
          }
          if (!inTouchZone(e.clientY, rect)) return;
          const lane = laneFromClientX(e.clientX, rect);
          if (lane < 0 || lane === prevLane) return;
          activePointers.set(e.pointerId, lane);
          const corrected = readGameplayTime() - resolveEventInputDelayMs(e.timeStamp);
          virtualKeyUp(prevLane, corrected);
          virtualKeyDown(lane, corrected);
        };
        handlePointerUp = (e: PointerEvent) => {
          if (isReplayMode || isAutoplay) return;
          const lane = activePointers.get(e.pointerId);
          if (lane === undefined) return;
          activePointers.delete(e.pointerId);
          const corrected = readGameplayTime() - resolveEventInputDelayMs(e.timeStamp);
          virtualKeyUp(lane, corrected);
        };
        handlePointerCancel = (e: PointerEvent) => {
          if (isReplayMode || isAutoplay) return;
          const lane = activePointers.get(e.pointerId);
          if (lane === undefined) return;
          activePointers.delete(e.pointerId);
          const corrected = readGameplayTime() - resolveEventInputDelayMs(e.timeStamp);
          virtualKeyUp(lane, corrected);
        };
        touchTarget.addEventListener('pointerdown', handlePointerDown);
        touchTarget.addEventListener('pointermove', handlePointerMove);
        touchTarget.addEventListener('pointerup', handlePointerUp);
        touchTarget.addEventListener('pointercancel', handlePointerCancel);
        window.addEventListener('resize', invalidateInteractionRect);
      } else {
        touchAdapter = new TouchInputAdapter(
          (lane) => virtualKeyDown(lane, readGameplayTime()),
          (lane) => virtualKeyUp(lane, readGameplayTime()),
        );

        handleTouchStart = (e: TouchEvent) => {
          if (isReplayMode || isAutoplay) return;
          const rect = getInteractionRect();
          if (!rect) return;
          touchAdapter?.handleTouchStart(e, rect, keyCount, settingsRef.current.upsurfaceNoteMode);
        };

        handleTouchMove = (e: TouchEvent) => {
          if (isReplayMode || isAutoplay) return;
          const rect = getInteractionRect();
          if (!rect) return;
          touchAdapter?.handleTouchMove(e, rect, keyCount, settingsRef.current.upsurfaceNoteMode);
        };

        handleTouchEnd = (e: TouchEvent) => {
          if (isReplayMode || isAutoplay) return;
          touchAdapter?.handleTouchEnd(e);
        };

        handleTouchCancel = (e: TouchEvent) => {
          if (isReplayMode || isAutoplay) return;
          touchAdapter?.handleTouchCancel(e);
        };

        // Register non-passive events to allow explicit preventDefault override inside raw handlers, blocking system browser zooms
        touchTarget.addEventListener('touchstart', handleTouchStart, { passive: false });
        touchTarget.addEventListener('touchmove', handleTouchMove, { passive: false });
        touchTarget.addEventListener('touchend', handleTouchEnd, { passive: false });
        touchTarget.addEventListener('touchcancel', handleTouchCancel, { passive: false });
        window.addEventListener('resize', invalidateInteractionRect);
      }
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('focus', reconcileInputOnFocus);
      window.removeEventListener('resize', invalidateInteractionRect);
      
      if (touchTarget) {
        if (handleTouchStart) touchTarget.removeEventListener('touchstart', handleTouchStart);
        if (handleTouchMove) touchTarget.removeEventListener('touchmove', handleTouchMove);
        if (handleTouchEnd) touchTarget.removeEventListener('touchend', handleTouchEnd);
        if (handleTouchCancel) touchTarget.removeEventListener('touchcancel', handleTouchCancel);
        if (handlePointerDown) touchTarget.removeEventListener('pointerdown', handlePointerDown);
        if (handlePointerMove) touchTarget.removeEventListener('pointermove', handlePointerMove);
        if (handlePointerUp) touchTarget.removeEventListener('pointerup', handlePointerUp);
        if (handlePointerCancel) touchTarget.removeEventListener('pointercancel', handlePointerCancel);
      }
      for (const lane of new Set(activePointers.values())) {
        try { virtualKeyUp(lane); } catch { /* ignore */ }
      }
      activePointers.clear();
      touchAdapter?.reset();
    };
  }, [beatmap.keyCount, replayData, isAudioLoaded, introSkippable, performIntroSkip]);

  // Judgement scoring evaluator. explicitTime is the corrected event-time
  // audio clock; falls back to the last render-loop time for rAF-driven callers.
  // Per-column head lookup: the lane list is time-sorted, so advance the
  // cursor past fully-settled notes and scan only a small window. The cursor
  // is shared across head/active-hold/grace/release searches, so settling
  // must be predicate-independent. Falls back to a
  // full scan when holds resolve out of order (re-press, grace, salvage).
  const findEarliestInColumn = (
    colIndex: number,
    isHeadOpen: (n: HitObject) => boolean,
  ): HitObject | undefined => {
    const lane = columnNotesRef.current[colIndex];
    if (!lane || lane.length === 0) {
      return notesRef.current.find((n) => n.column === colIndex && isHeadOpen(n));
    }
    let cursor = columnCursorRef.current[colIndex] || 0;
    if (cursor < 0) cursor = 0;
    if (cursor > lane.length) cursor = lane.length;
    // Settle the cursor past notes that are fully resolved for EVERY lookup,
    // never just "not open for this predicate". The same cursor is shared by
    // head, active-hold, grace, and release searches; advancing past a note
    // that is still hittable for another predicate (e.g. skipping unjudged
    // taps while searching for an active hold) desyncs the lane so presses
    // select a far-future note, read as too-early, and are ignored while the
    // imminent note times out as a miss. Holds with an open tail stay pinned
    // so re-presses still find them.
    const isFullySettled = (n: HitObject): boolean => {
      if (n.type !== 'hold') return n.isHit || n.isMissed;
      if (n.holdRulesVersion === LAZER_HOLD_RULES_VERSION && n.holdState) {
        return n.holdState.isHeadJudged && n.holdState.isTailJudged;
      }
      if (n.holdRulesVersion === HOLD_TICK_RULES_VERSION) {
        return !!n.isReleased;
      }
      return (!!n.isReleased || !!n.isHoldFailed) && (!!n.isHit || !!n.isMissed);
    };
    while (cursor < lane.length && isFullySettled(lane[cursor])) {
      cursor++;
    }
    columnCursorRef.current[colIndex] = cursor;
    // Bounded window first (covers chords + near neighbours without O(n)).
    const windowEnd = Math.min(lane.length, cursor + 16);
    for (let i = cursor; i < windowEnd; i++) {
      if (isHeadOpen(lane[i])) return lane[i];
    }
    // Out-of-order fallback: an earlier hold may have reopened, or the target
    // sits beyond the window on very dense lanes.
    for (let i = 0; i < cursor; i++) {
      if (isHeadOpen(lane[i])) return lane[i];
    }
    for (let i = windowEnd; i < lane.length; i++) {
      if (isHeadOpen(lane[i])) return lane[i];
    }
    return undefined;
  };
  const triggerHitEvent = (colIndex: number, explicitTime?: number) => {
    const playTime = typeof explicitTime === 'number' && Number.isFinite(explicitTime)
      ? explicitTime
      : audioTimeRef.current;

    // Version 3 Lazer hold rules
    if (holdRulesVersion === LAZER_HOLD_RULES_VERSION) {
      // 1. Check if an in-progress hold in this column is being re-pressed mid-body
      const activeHold = findEarliestInColumn(
        colIndex,
        (n) => n.type === 'hold' && n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
          !!n.holdState && n.holdState.isHeadJudged && !n.holdState.isTailJudged,
      ) ?? notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
          n.holdState && n.holdState.isHeadJudged && !n.holdState.isTailJudged
      );
      if (activeHold && activeHold.holdState && !activeHold.holdState.isHolding && activeHold.endTime !== undefined && playTime < activeHold.endTime) {
        onHoldKeyPress(activeHold.holdState, playTime, judgementWindows);
        return;
      }

      // 2. Find earliest unjudged note in column (or hold note whose head is unjudged)
      const isHeadOpenV3 = (n: HitObject) => n.type === 'hold'
        ? (n.holdState ? !n.holdState.isHeadJudged : (!n.isHit && !n.isMissed))
        : (!n.isHit && !n.isMissed);
      const note = findEarliestInColumn(colIndex, isHeadOpenV3) ?? notesRef.current.find(
        (n) => n.column === colIndex && isHeadOpenV3(n)
      );

      if (!note) return;

      const missWindow = judgementWindows[judgementWindows.length - 1].windowMs;
      const diff = playTime - note.time;

      if (diff < -missWindow) {
        return;
      }

      if (note.type === 'hold' && note.holdState) {
        const action = onHoldKeyPress(note.holdState, playTime, judgementWindows);
        if (!action) return;

        if (action.kind === 'head_hit') {
          note.isHit = true;
          note.hitTime = playTime;
          note.isHeadHit = true;

          const resolvedJudg = judgementByType.get(action.judgement) || marvelousJudg;
          applyJudgement(resolvedJudg, colIndex);
          mainAudio.playBeatmapHitsound(note.hitSound, note.hitSample?.filename);

          const hitError = action.errorMs;
          recordHitErrorSample(hitError);

          let tickColor = '#3b82f6';
          if (action.judgement === 'marvelous' || action.judgement === 'perfect') {
            tickColor = '#3b82f6';
          } else if (action.judgement === 'great') {
            tickColor = '#4ade80';
          } else if (action.judgement === 'good') {
            tickColor = '#fb923c';
          } else if (action.judgement === 'bad') {
            tickColor = '#facc15';
          }

          hitErrorTicksRef.current.push({
            id: `tick-${++hitErrorTickIdRef.current}`,
            error: hitError,
            timestamp: Date.now(),
            color: tickColor
          });
        } else if (action.kind === 'head_miss') {
          note.isMissed = true;
          note.hitTime = playTime;
          applyJudgement(missJudg, colIndex);
        }
        return;
      }

      const resolvedJudgement = resolveLazerJudgementWindow(diff, judgementWindows);
      if (resolvedJudgement.type !== 'miss') {
        note.isHit = true;
        note.hitTime = playTime;
        applyJudgement(resolvedJudgement, colIndex, 'note', playTime - note.time);
        mainAudio.playBeatmapHitsound(note.hitSound, note.hitSample?.filename);

        const hitError = playTime - note.time;
        recordHitErrorSample(hitError);

        let tickColor = '#3b82f6';
        if (resolvedJudgement.type === 'marvelous' || resolvedJudgement.type === 'perfect') {
          tickColor = '#3b82f6';
        } else if (resolvedJudgement.type === 'great') {
          tickColor = '#4ade80';
        } else if (resolvedJudgement.type === 'good') {
          tickColor = '#fb923c';
        } else if (resolvedJudgement.type === 'bad') {
          tickColor = '#facc15';
        }

        hitErrorTicksRef.current.push({
          id: `tick-${++hitErrorTickIdRef.current}`,
          error: hitError,
          timestamp: Date.now(),
          color: tickColor
        });
      } else {
        note.isMissed = true;
        applyJudgement(resolvedJudgement, colIndex);
      }
      return;
    }

    const isEarlyReleasedOpen = (n: HitObject) => n.type === 'hold' && n.holdRulesVersion === HOLD_TICK_RULES_VERSION &&
      n.isHit && !n.isReleased && !n.isHoldFailed && n.earlyReleaseTime !== undefined;
    const earlyReleasedHold = findEarliestInColumn(colIndex, isEarlyReleasedOpen) ??
      notesRef.current.find((n) => n.column === colIndex && isEarlyReleasedOpen(n));
    if (earlyReleasedHold) {
      if (earlyReleasedHold.endTime !== undefined && playTime >= earlyReleasedHold.endTime - missJudg.windowMs) {
        markHoldReleaseZonePressed(earlyReleasedHold, playTime);
      } else {
        markHoldTailResumed(earlyReleasedHold, playTime);
      }
      return;
    }
    
    // Check if we are currently in a grace period for a hold note in this column
    const isGraceOpen = (n: HitObject) => n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.releaseGraceUntil !== undefined;
    const activeHoldAndReleased = findEarliestInColumn(colIndex, isGraceOpen) ??
      notesRef.current.find((n) => n.column === colIndex && isGraceOpen(n));
    if (activeHoldAndReleased) {
      if (isHoldGraceActive(playTime, activeHoldAndReleased.releaseGraceUntil)) {
        activeHoldAndReleased.releaseGraceUntil = undefined;
        return;
      }
      const transition = resolveHoldGrace(activeHoldAndReleased, playTime);
      activeHoldAndReleased.releaseGraceUntil = transition.releaseGraceUntil;
      activeHoldAndReleased.isHoldFailed = transition.isHoldFailed;
      activeHoldAndReleased.isReleased = transition.isReleased;
      applyJudgement(missJudg, colIndex);
    }

    // Find earliest hittable note, or a head-missed LN that can still be salvaged for the tail
    const isHittableOpen = (n: HitObject) => (!n.isHit && !n.isMissed) ||
      (n.type === 'hold' && n.isMissed && !n.isHit && !n.isReleased && !n.isHoldFailed);
    const note = findEarliestInColumn(colIndex, isHittableOpen) ?? notesRef.current.find(
      (n) => n.column === colIndex && isHittableOpen(n)
    );
    
    if (!note) return;

    const missWindow = judgementWindows[judgementWindows.length - 1].windowMs;

    // Head already missed: pressing during the body/tail engages the LN for end scoring only
    if (note.type === 'hold' && note.isMissed && !note.isHit) {
      if (note.endTime && playTime - note.endTime > missWindow) {
        return;
      }
      if (note.endTime !== undefined && playTime >= note.endTime - missWindow) {
        markHoldReleaseZonePressed(note, playTime);
        return;
      }
      note.isHit = true;
      note.hitTime = playTime;
      markHoldTailEngaged(note, playTime);
      return;
    }

    // Absolute distance in timeline
    const diff = playTime - note.time;

    // The note must fall within the maximum allowable window (Bad/Miss window boundary)
    const maxWindow = missWindow;
    
    // If the note is too early to even register, disregard inputs
    if (diff < -maxWindow) {
      return; 
    }

    // Assign judgement
    const resolvedJudgement = resolveLazerJudgementWindow(diff, judgementWindows);

    if (resolvedJudgement.type !== 'miss') {
      // Registrations
      note.isHit = true;
      note.hitTime = playTime;
      markHoldStartHit(note);
      
      applyJudgement(resolvedJudgement, colIndex, note.type === 'hold' ? 'hold_head' : 'note', playTime - note.time);
      mainAudio.playBeatmapHitsound(note.hitSound, note.hitSample?.filename);

      // Calculate and store Hit Error details for timing feedback meter
      const hitError = playTime - note.time;
      recordHitErrorSample(hitError);

      let tickColor = '#3b82f6'; // Default perfect blue
      if (resolvedJudgement.type === 'marvelous' || resolvedJudgement.type === 'perfect') {
        tickColor = '#3b82f6'; // Blue for 300 range
        } else if (resolvedJudgement.type === 'great') {
          tickColor = '#4ade80'; // Green for Good
        } else if (resolvedJudgement.type === 'good') {
          tickColor = '#fb923c'; // Orange for Ok
        } else if (resolvedJudgement.type === 'bad') {
          tickColor = '#facc15'; // Yellow for Meh
        }
      
      hitErrorTicksRef.current.push({
        id: `tick-${++hitErrorTickIdRef.current}`,
        error: hitError,
        timestamp: Date.now(),
        color: tickColor
      });
    } else {
      // Tap in miss band (bad < |err| <= miss): head miss only; holds stay alive for tail salvage
      note.isMissed = true;
      if (note.type === 'hold') {
        applyJudgement(resolvedJudgement, colIndex, 'hold_head'); // Head miss only
        note.isHit = true; // Engage body/tail while key is down
        note.hitTime = playTime;
        if (note.holdRulesVersion === HOLD_TICK_RULES_VERSION) {
          markHoldTailEngaged(note, playTime);
        }
      } else {
        applyJudgement(resolvedJudgement, colIndex);
      }
    }
  };

  const triggerReleaseEvent = (colIndex: number, explicitTime?: number) => {
    const playTime = typeof explicitTime === 'number' && Number.isFinite(explicitTime)
      ? explicitTime
      : audioTimeRef.current;

    // Version 3 Lazer hold release rules:
    if (holdRulesVersion === LAZER_HOLD_RULES_VERSION) {
      const isHoldingOpen = (n: HitObject) => n.type === 'hold' && n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
        !!n.holdState && n.holdState.isHeadJudged && !n.holdState.isTailJudged && n.holdState.isHolding;
      const holdNote = findEarliestInColumn(colIndex, isHoldingOpen) ??
        notesRef.current.find((n) => n.column === colIndex && isHoldingOpen(n));

      if (!holdNote || !holdNote.endTime || !holdNote.holdState) return;

      const action = onHoldKeyRelease(holdNote.holdState, playTime, judgementWindows);
      if (!action) return;

      if (action.kind === 'body_break') {
        holdNote.isHoldFailed = true;
        holdNote.releaseTime = playTime;
        holdNote.earlyReleaseTime = playTime;
        scoreStateRef.current.combo = 0;
        if (scoreStateRef.current.comboBreakCount !== undefined) {
          scoreStateRef.current.comboBreakCount++;
        }
        // Route through the fast HUD queue; force the next rAF tick to flush
        // so the combo break surfaces without per-event reconciliation.
        // (Pending HP is synced below after the health judgement.)
        lastHudFlushRef.current = 0;
        if ((settings.selectedMods || []).includes('MU') && isPlayingRef.current && !isPausedRef.current) {
          mainAudio.setVolumes(settings.musicVolume, settings.hitsoundVolume, settings.masterVolume);
        }
        const justFailed = applyHealthJudgement(
          healthStateRef.current,
          'miss',
          beatmap.hpDrainRate,
          'body_break',
        );
        scoreStateRef.current.hp = healthToDisplayPercent(healthStateRef.current.health);
        // Route through the fast HUD queue; force the next rAF tick to flush
        // so the combo break surfaces without per-event reconciliation.
        hudPendingRef.current.combo = 0;
        hudPendingRef.current.hp = scoreStateRef.current.hp;
        lastHudFlushRef.current = 0;
        if (justFailed && !isReplayMode) {
          scoreStateRef.current.failed = true;
          isPlayingRef.current = false;
          setIsFailed(true);
          mainAudio.pause();
          if (videoRef.current) {
            try { videoRef.current.pause(); } catch (e) {}
          }
          playFailSoundOnce();
        }
        handleJudgementSfx('miss');
        return;
      }

      if (action.kind === 'tail_hit') {
        holdNote.isReleased = true;
        holdNote.releaseTime = playTime;
        holdNote.isReleaseHit = true;
        holdNote.isReleaseMissed = false;

        const tailJudg = judgementByType.get(action.judgement) || missJudg;
        applyJudgement(tailJudg, colIndex, 'hold_tail', action.effectiveErrorMs);
        recordHitErrorSample(action.effectiveErrorMs);
        mainAudio.playBeatmapHitsound(holdNote.hitSound, holdNote.hitSample?.filename);

        let tickColor = '#3b82f6';
        if (action.judgement === 'marvelous' || action.judgement === 'perfect') {
          tickColor = '#3b82f6';
        } else if (action.judgement === 'great') {
          tickColor = '#4ade80';
        } else if (action.judgement === 'good') {
          tickColor = '#fb923c';
        } else if (action.judgement === 'bad') {
          tickColor = '#facc15';
        }

        hitErrorTicksRef.current.push({
          id: `tick-${++hitErrorTickIdRef.current}`,
          error: action.effectiveErrorMs,
          timestamp: Date.now(),
          color: tickColor
        });

        return;
      }

      if (action.kind === 'tail_miss') {
        holdNote.isReleased = true;
        holdNote.releaseTime = playTime;
        holdNote.isReleaseHit = false;
        holdNote.isReleaseMissed = true;
        holdNote.isHoldFailed = true;
        applyJudgement(missJudg, colIndex, 'hold_tail');
        return;
      }

      return;
    }
    
    // Find active hold note currently marked "Hit" but not yet "Released" or "HoldFailed"
    const isActiveHoldOpen = (n: HitObject) => n.type === 'hold' && !n.isReleased &&
      (n.holdRulesVersion === HOLD_TICK_RULES_VERSION
        ? (n.isHeadHit || n.tailEngagedTime !== undefined || n.releaseZoneArmedTime !== undefined)
        : (n.isHit && !n.isHoldFailed));
    const holdNote = findEarliestInColumn(colIndex, isActiveHoldOpen) ??
      notesRef.current.find((n) => n.column === colIndex && isActiveHoldOpen(n));
    
    if (!holdNote || !holdNote.endTime) return;

    const endDiff = playTime - holdNote.endTime;
    const graceThreshold = -missJudg.windowMs;
    const graceDuration = missJudg.windowMs;

    if (holdNote.holdRulesVersion === HOLD_TICK_RULES_VERSION) {
      if (endDiff < -missJudg.windowMs) {
        markHoldEarlyRelease(holdNote, playTime);
        return;
      }
      holdNote.isReleased = true;
      holdNote.releaseTime = playTime;
      const releaseJudgement = getLazerTailJudgementWindow(endDiff, judgementWindows);
      const releaseMissed = releaseJudgement.type === 'miss';
      holdNote.isReleaseMissed = releaseMissed;
      holdNote.isReleaseHit = !releaseMissed;
       if (releaseMissed) markHoldEarlyRelease(holdNote, playTime);
      applyJudgement(releaseJudgement, colIndex, 'hold_tail', endDiff);
      if (!releaseMissed) {
        markHoldReleaseHit(holdNote);
        recordHitErrorSample(endDiff);
        mainAudio.playBeatmapHitsound(holdNote.hitSound, holdNote.hitSample?.filename);
      }
      return;
    }

    // If released prematurely: trigger a grace re-key window
    if (endDiff < graceThreshold) {
      holdNote.releaseTime = playTime;
      holdNote.releaseGraceUntil = playTime + graceDuration; // derived grace window
      return;
    }

    // Otherwise, they are releasing near the end (normal release window evaluation)
    holdNote.isReleased = true;
    holdNote.releaseTime = playTime;
    const tailJudgement = getLazerTailJudgementWindow(endDiff, judgementWindows);
    applyJudgement(tailJudgement, colIndex, 'hold_tail');
    if (tailJudgement.type !== 'miss') {
      recordHitErrorSample(endDiff);
      mainAudio.playBeatmapHitsound(holdNote.hitSound, holdNote.hitSample?.filename);
    } else {
      holdNote.isHoldFailed = true;
    }
  };

  // Score counter math accumulator
  const applyJudgement = (
    judg: JudgementWindow,
    col: number,
    healthContext: HealthJudgementContext = 'note',
    errorMs?: number,
  ) => {
    const state = scoreStateRef.current;
    if (!state.columnJudgements || state.columnJudgements.length === 0) {
      state.columnJudgements = initializeColumnJudgements(beatmap.keyCount);
    }
    if (typeof col === 'number' && col >= 0) {
      incrementColumnJudgement(state.columnJudgements, col, judg.type);
    }

    if (errorMs !== undefined && (settings.selectedMods || []).includes('AS') && Math.abs(errorMs) < 500) {
      adaptiveSpeedAvgErrorRef.current = adaptiveSpeedAvgErrorRef.current * 0.8 + errorMs * 0.2;
    }

    // Upgrades
    if (judg.type === 'miss') {
      state.missCount++;
      state.combo = 0;
    } else {
      state.combo++;
      if (state.combo > state.maxCombo) {
        state.maxCombo = state.combo;
      }
      
      if (judg.type === 'marvelous') state.marvelousCount++;
      else if (judg.type === 'perfect') state.perfectCount++;
      else if (judg.type === 'great') state.greatCount++;
      else if (judg.type === 'good') state.goodCount++;
      else if (judg.type === 'bad') state.badCount++;
    }

    // osu!(lazer) ManiaHealthProcessor: health 0..1, no passive drain
    const justFailed = applyHealthJudgement(
      healthStateRef.current,
      judg.type,
      beatmap.hpDrainRate,
      healthContext,
    );
    state.hp = healthToDisplayPercent(healthStateRef.current.health);

    if (justFailed && !isReplayMode) {
      state.failed = true;
      isPlayingRef.current = false;
      setIsFailed(true);
      mainAudio.pause();
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (e) {}
      }
    }

    // osu!lazer mania accuracy (Perfect=305) + standardised total score
    const counts = {
      marvelousCount: state.marvelousCount,
      perfectCount: state.perfectCount,
      greatCount: state.greatCount,
      goodCount: state.goodCount,
      badCount: state.badCount,
      missCount: state.missCount,
    };
    state.accuracy = computeAccuracyPercent(counts);

    const judgedCount = countTotalHits(counts);
    if (checkAccuracyChallengeFail(healthStateRef.current, state.accuracy, judgedCount)) {
      state.hp = healthToDisplayPercent(healthStateRef.current.health);
      if (!isReplayMode) {
        state.failed = true;
        isPlayingRef.current = false;
        setIsFailed(true);
        mainAudio.pause();
        if (videoRef.current) {
          try { videoRef.current.pause(); } catch (e) {}
        }
      }
    }

    // Fail sting once per run; miss tick only for the first miss of a chain.
    if (state.failed) playFailSoundOnce();
    handleJudgementSfx(judg.type);

    if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
      maxComboPortionRef.current = extendMaxComboPortion(
        maxComboPortionRef.current,
        totalJudgementsRef.current,
        judgedCount,
      );
      totalJudgementsRef.current = judgedCount;
    }
    currentComboPortionRef.current += getComboScoreChange(judg.type, state.combo);
    const selectedMods = settings.selectedMods;
    let modMultiplier: number;
    if (cachedModsRef.current === selectedMods && selectedMods !== undefined) {
      modMultiplier = cachedModMultiplierRef.current;
    } else {
      modMultiplier = computeModMultiplier(selectedMods);
      cachedModsRef.current = selectedMods;
      cachedModMultiplierRef.current = modMultiplier;
    }
    state.score = computeTotalScore({
      currentComboPortion: currentComboPortionRef.current,
      maxComboPortion: maxComboPortionRef.current,
      accuracyPercent: state.accuracy,
      judgedCount,
      totalJudgements: totalJudgementsRef.current,
      modMultiplier,
    });

    // Live PENAR is refreshed at the slow tier by the HUD flush loop reusing the
    // cached chart difficulty; per-judgement PP would waste frame budget.

    // Muted (MU) mod: fade audio as combo builds, restore on break/miss
    const muMods = settings.selectedMods;
    let isMutedMod = false;
    if (muMods) {
      for (let i = 0; i < muMods.length; i++) {
        if (muMods[i] === 'MU') { isMutedMod = true; break; }
      }
    }
    if (isMutedMod && isPlayingRef.current && !isPausedRef.current) {
      const muteFactor = Math.max(0, 1 - state.combo / 30);
      mainAudio.setVolumes(settings.musicVolume * muteFactor, settings.hitsoundVolume, settings.masterVolume);
    }

    // Update canvas visual trackers (no React setState here — the rAF loop
    // flushes hudPendingRef at the fast tier so input never waits on reconciliation).
    const now = Date.now();
    currentJudgementRef.current = {
      text: judg.name,
      color: judg.color,
      time: now,
      size: 1.4 // trigger pulse size scaling
    };
    hudPendingRef.current.score = state.score;
    hudPendingRef.current.combo = state.combo;
    hudPendingRef.current.hp = state.hp;
    hudPendingRef.current.accuracy = state.accuracy;
    hudJudgementRef.current = { text: judg.name, color: judg.color, time: now };
    // A miss/combo-break or fail must surface immediately even between flushes.
    if (judg.type === 'miss' || state.failed || state.combo === 0) {
      lastHudFlushRef.current = 0;
    }
  };

  // Main rendering loop (RequestAnimationFrame)
  useEffect(() => {
    let requestId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle high-dpi monitors for pristine retina canvas crispness with performance caps
    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container || !canvas) return;

       const rect = canvas.getBoundingClientRect();
      const currentSettings = settingsRef.current;
      const dpr = getEffectiveDpr(currentSettings);
      const cssW = rect.width || container.getBoundingClientRect().width;
      const cssH = rect.height || container.getBoundingClientRect().height;
      canvasCssSizeRef.current.width = cssW;
      canvasCssSizeRef.current.height = cssH;
      
      if (activeRendererRef.current) {
           activeRendererRef.current.resize(cssW, cssH, dpr);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    const sizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resizeCanvas()) : null;
    try {
      if (sizeObserver && canvas) sizeObserver.observe(canvas);
    } catch { /* ResizeObserver unavailable */ }

    // Track notes elapsed to trigger automatic Miss judgments.
    // Notes are time-sorted: advance a cursor past fully-settled prefixes so
    // each frame scans only the active window instead of the whole chart.
    // v2 tail ticks iterate only holds that own ticks (usually hundreds, not
    // tens of thousands). Skipped work is judgement-neutral: settled notes
    // can never auto-miss again, and future notes break early by sort order.
    const isSettledForMissCursor = (n: HitObject): boolean => {
      if (n.type !== 'hold') return n.isHit || n.isMissed;
      if (n.holdRulesVersion === LAZER_HOLD_RULES_VERSION && n.holdState) {
        return n.holdState.isHeadJudged && n.holdState.isTailJudged;
      }
      if (n.holdRulesVersion === HOLD_TICK_RULES_VERSION) {
        if (!n.isReleased) return false;
        return true;
      }
      // v1 continuous holds settle once released/failed.
      return (n.isReleased || n.isHoldFailed) && (n.isHit || n.isMissed);
    };
    const advanceMissCursor = () => {
      const all = notesRef.current;
      let cursor = missCursorRef.current;
      if (cursor < 0) cursor = 0;
      if (cursor > all.length) cursor = all.length;
      while (cursor < all.length && isSettledForMissCursor(all[cursor])) {
        cursor++;
      }
      missCursorRef.current = cursor;
      return cursor;
    };
    const checkAutonomousMisses = (currentTime: number) => {
      if (holdRulesVersion === HOLD_TICK_RULES_VERSION && activeHoldTickIntervalMs !== undefined) {
        const ticks = tickHoldsRef.current;
        if (ticks.length > 0) {
          advanceHoldTailTicks(ticks, currentTime, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
        }
      }
      const startIndex = advanceMissCursor();
      checkNotesAutonomousMisses(
        notesRef.current,
        currentTime,
        missJudg.windowMs,
        (n, isDoubleMiss) => {
          if (isDoubleMiss) {
            applyJudgement(missJudg, n.column, 'hold_head');
            applyJudgement(missJudg, n.column, 'hold_tail');
          } else {
            applyJudgement(missJudg, n.column);
          }
        },
        keysPressedRef.current,
        isNoRelease,
        judgementWindows,
        (n, judgType, errorMs) => {
          const tailJudg = judgementByTypeRef.current.get(judgType) || missJudg;
          applyJudgement(tailJudg, n.column, 'hold_tail');
          recordHitErrorSample(errorMs);
          mainAudio.playBeatmapHitsound(n.hitSound, n.hitSample?.filename);
        },
        startIndex,
        true,
      );
    };

    // Canvas Draw Thread
    const render = () => {
      const currentSettings = settingsRef.current;
      const activeCanvas = canvasRef.current;
      if (!activeCanvas) return;

      const dpr = getEffectiveDpr(currentSettings);
      const cached = canvasCssSizeRef.current;
      const width = cached.width || activeCanvas.clientWidth || activeCanvas.width / dpr;
      const height = cached.height || activeCanvas.clientHeight || activeCanvas.height / dpr;

      const frameWallNow = performance.now();
      const lastWall = lastFrameWallRef.current;
      const wallDtMs = lastWall > 0 ? Math.max(0, Math.min(100, frameWallNow - lastWall)) : 16.7;
      lastFrameWallRef.current = frameWallNow;

      // Frame-rate independent offset smoothing (tau ~125ms). The old fixed
      // 0.08 factor converged faster on high-refresh displays, making offset
      // touches teleport notes further per second on 120Hz+ screens.
      {
        const target = currentSettings.audioOffset || 0;
        const alpha = 1 - Math.exp(-wallDtMs / 125);
        smoothOffsetRef.current += (target - smoothOffsetRef.current) * alpha;
      }

      let songTime;
      let judgeTime;
      if (isScrubbingRef.current) {
        songTime = audioTimeRef.current;
        judgeTime = songTime;
        lastSongTimeRef.current = songTime;
        songTimeJumpRef.current = true;
      } else if (audioStartPendingRef.current) {
        // AudioContext still resuming: hold the parked lead-in value instead
        // of reading the stopped clock (0), which previously caused a full
        // startDelay teleport on the first armed frame.
        songTime = lastSongTimeRef.current;
        judgeTime = songTime;
        audioTimeRef.current = judgeTime;
      } else {
        const offsetDiff = (currentSettings.audioOffset || 0) - smoothOffsetRef.current;
        const rawSongTime = mainAudio.getCurrentTimeMs();
        const targetSongTime = rawSongTime + offsetDiff;
        if (!Number.isFinite(targetSongTime)) {
          songTime = lastSongTimeRef.current;
          judgeTime = songTime;
        } else {
          judgeTime = targetSongTime;
          if (songTimeJumpRef.current) {
            songTime = targetSongTime;
            songTimeJumpRef.current = false;
          } else {
            const last = lastSongTimeRef.current;
            let delta = targetSongTime - last;
            // Intentional seeks/skips/rate edges set the jump flag upstream,
            // so anything reaching here should be continuous. Clamp hitches
            // (GC, video seek, audio quant) to a quick glide instead of a
            // one-frame teleport. Judgement below uses judgeTime (audio
            // truth); only visuals use the slewed songTime.
            const liveRate = mainAudio.playbackRate;
            const rate = Number.isFinite(liveRate) && liveRate > 0 ? liveRate : 1;
            const maxForward = wallDtMs * rate + 40;
            const maxBackward = 25;
            if (delta > maxForward) {
              delta = maxForward + (delta - maxForward) * 0.15;
            } else if (delta < -maxBackward) {
              delta = -maxBackward + (delta + maxBackward) * 0.15;
            }
            // Never run ahead of the audio truth by more than the slack, and
            // never fall more than ~250ms behind even under sustained hitches.
            const hardAhead = 60;
            const hardBehind = 250;
            let next = last + delta;
            if (next > targetSongTime + hardAhead) next = targetSongTime + hardAhead;
            if (next < targetSongTime - hardBehind) next = targetSongTime - hardBehind;
            songTime = next;
          }
        }
        lastSongTimeRef.current = songTime;
        audioTimeRef.current = judgeTime;
      }

      // Dynamic playback rate updates for WU (Wind Up), WD (Wind Down), and AS (Adaptive Speed)
      // Allocation-free mod scan (no `|| []` / includes churn per frame).
      const activeMods = settingsRef.current.selectedMods;
      let isWU = false;
      let isWD = false;
      let isAS = false;
      if (activeMods) {
        for (let i = 0; i < activeMods.length; i++) {
          const m = activeMods[i];
          if (m === 'WU') isWU = true;
          else if (m === 'WD') isWD = true;
          else if (m === 'AS') isAS = true;
          if (isWU && isWD && isAS) break;
        }
      }

      if ((isWU || isWD) && isPlayingRef.current && !isPausedRef.current) {
        const totalDuration = Math.max(1, (beatmap.duration || 10) * 1000);
        const progress = Math.max(0, Math.min(1, (judgeTime - firstNoteTime) / totalDuration));
        const targetRate = isWU ? (1.0 + 0.5 * progress) : (1.0 - 0.25 * progress);
        if (Math.abs(mainAudio.playbackRate - targetRate) > 0.01) {
          mainAudio.setPlaybackRate(targetRate);
        }
      } else if (isAS && isPlayingRef.current && !isPausedRef.current) {
        const targetRate = Math.max(0.75, Math.min(1.5, 1.0 - adaptiveSpeedAvgErrorRef.current / 150));
        if (Math.abs(mainAudio.playbackRate - targetRate) > 0.01) {
          mainAudio.setPlaybackRate(targetRate);
        }
      }

      // Frame counter for the FPS readout; the DOM write happens in the slow
      // HUD flush below so per-frame work stays an integer increment.
      fpsFramesRef.current++;

      // Two-tier HUD flush: the fast 12.5Hz tier owns every live
      // ManiaHud/DOM update (React score/combo/HP/accuracy/judgement/burst,
      // progress + time labels, break label, key-counter DOM, hit-error
      // meters). The slow 3Hz tier owns the live PENAR counter and the FPS
      // readout. The playfield
      // canvas above still renders every rAF.
      {
        const nowMs = performance.now();
        const forceFlush = isPausedRef.current || !isPlayingRef.current;
        const fastDue = forceFlush || nowMs - lastHudFlushRef.current >= MANIA_HUD_UPDATE_INTERVAL_MS;
        const slowDue = forceFlush || nowMs - lastHudSlowFlushRef.current >= MANIA_HUD_SLOW_UPDATE_INTERVAL_MS;
        if (fastDue) {
          lastHudFlushRef.current = nowMs;

          if (breakLabelRef.current) {
            const songBreaks = beatmap.breaks ?? [];
            let inBreak = false;
            for (let i = 0; i < songBreaks.length; i++) {
              const section = songBreaks[i];
              if (judgeTime >= section.startTime && judgeTime < section.endTime) {
                inBreak = true;
                break;
              }
            }
            const nextOpacity = inBreak ? '1' : '0';
            if (breakLabelRef.current.style.opacity !== nextOpacity) {
              breakLabelRef.current.style.opacity = nextOpacity;
            }
          }

          if (introSkippable && !hasSkippedIntroRef.current && !isPrePlayRef.current) {
            const shouldShow = !isPausedRef.current && !scoreStateRef.current.failed && isSkipWindowActive(judgeTime, firstNoteTime, false, INTRO_SKIP_THRESHOLD_MS);
            if (shouldShow !== skipVisibleRef.current) {
              skipVisibleRef.current = shouldShow;
              setIsSkipVisible(shouldShow);
            }
          } else if (skipVisibleRef.current) {
            skipVisibleRef.current = false;
            setIsSkipVisible(false);
          }

          // Progress bar (replay scrubber input and HUD div share the ref).
          // Quantized so the gradient/width strings stay stable between flushes.
          if (progressBarRef.current) {
            const totalDurationMs = beatmap.duration * 1000;
            const rawPercent = totalDurationMs > 0 ? Math.min(100, Math.max(0, (judgeTime / totalDurationMs) * 100)) : 0;
            const progressPercent = Math.round(rawPercent * 10) / 10;
            if (progressPercent !== lastProgressPercentRef.current) {
              lastProgressPercentRef.current = progressPercent;
              if (progressBarRef.current.tagName === 'INPUT') {
                const inputEl = progressBarRef.current as HTMLInputElement;
                if (!isScrubbingRef.current) {
                  inputEl.value = (Math.max(0, judgeTime)).toString();
                  const bg = `linear-gradient(to right, #06b6d4 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%)`;
                  if (bg !== lastScrubberBgRef.current) {
                    lastScrubberBgRef.current = bg;
                    inputEl.style.background = bg;
                  }
                }
              } else {
                const nextWidth = `${progressPercent}%`;
                if ((progressBarRef.current as HTMLElement).style.width !== nextWidth) {
                  (progressBarRef.current as HTMLElement).style.width = nextWidth;
                }
              }
            } else if (progressBarRef.current.tagName === 'INPUT' && !isScrubbingRef.current) {
              // Percent bucket unchanged but judgeTime moved: keep scrubber
              // position live without rebuilding the gradient string.
              (progressBarRef.current as HTMLInputElement).value = (Math.max(0, judgeTime)).toString();
            }
          }

          if (timeLabelRef.current && !isScrubbingRef.current) {
            const totalMs = beatmap.duration * 1000;
            const elapsedSec = Math.floor(Math.max(0, judgeTime) / 1000);
            if (elapsedSec !== lastElapsedSecRef.current) {
              lastElapsedSecRef.current = elapsedSec;
              const nextText = `${formatMsToMinSec(judgeTime)} / ${formatMsToMinSec(totalMs)}`;
              if (timeLabelRef.current.innerText !== nextText) {
                timeLabelRef.current.innerText = nextText;
              }
            }
          }
          if (timeLeftLabelRef.current && !isScrubbingRef.current) {
            if (isReplayMode || (!isAutoplay && !isPrePlay)) {
              const totalMs = beatmap.duration * 1000;
              const remainMs = Math.max(0, totalMs - Math.max(0, judgeTime));
              const remainSec = Math.floor(remainMs / 1000);
              if (remainSec !== lastRemainSecRef.current) {
                lastRemainSecRef.current = remainSec;
                const nextText = `-${formatMsToMinSec(remainMs)}`;
                if (timeLeftLabelRef.current.innerText !== nextText) {
                  timeLeftLabelRef.current.innerText = nextText;
                }
              }
              if (timeLeftLabelRef.current.style.display !== '') {
                timeLeftLabelRef.current.style.display = '';
              }
            } else if (timeLeftLabelRef.current.style.display !== 'none') {
              timeLeftLabelRef.current.style.display = 'none';
            }
          }

          const pending = hudPendingRef.current;
          setUiScore((prev) => (prev === pending.score ? prev : pending.score));
          setUiCombo((prev) => (prev === pending.combo ? prev : pending.combo));
          // Quantize HP to 0.5 steps so fractional health churn between
          // judgements never re-renders the bar at 12.5Hz for no visual gain.
          const quantizedHp = Math.round(pending.hp * 2) / 2;
          setUiHp((prev) => (prev === quantizedHp ? prev : quantizedHp));
          setUiAccuracy((prev) => (prev === pending.accuracy ? prev : pending.accuracy));
          const wallNow = Date.now();
          const j = hudJudgementRef.current;
          if (j && wallNow - j.time < 600) {
            setUiJudgement((prev) => (prev && prev.time === j.time ? prev : j));
          } else {
            if (j) hudJudgementRef.current = null;
            setUiJudgement((prev) => (prev === null ? prev : null));
          }

          // Key-counter DOM (counts + active classes) at the fast tier. Flush
          // unconditionally with cached handles: press/release states change
          // without count bumps.
          flushKeyCounterUi();

          // Hit-error running average + dual meters at the fast tier. Skips
          // the canvas redraw when neither the tick list nor the average
          // moved since the last flush.
          let hitErrorAvgMs: number | null = null;
          {
            const ticks = hitErrorTicksRef.current;
            const count = Math.min(30, ticks.length);
            if (count > 0) {
              let sum = 0;
              for (let i = ticks.length - count; i < ticks.length; i++) {
                sum += ticks[i].error;
              }
              hitErrorAvgMs = sum / count;
            }
          }
          if (leftHitErrorCanvasRef.current || rightHitErrorCanvasRef.current) {
            const roundedAvg = hitErrorAvgMs === null ? 'n' : String(Math.round(hitErrorAvgMs * 4) / 4);
            const meterSig = `${hitErrorTicksRef.current.length}:${hitErrorTickIdRef.current}:${roundedAvg}`;
            if (meterSig !== lastMeterSigRef.current) {
              lastMeterSigRef.current = meterSig;
              drawVerticalHitErrorMeter(leftHitErrorCanvasRef.current, hitErrorTicksRef.current, hitErrorAvgMs, 150);
              drawVerticalHitErrorMeter(rightHitErrorCanvasRef.current, hitErrorTicksRef.current, hitErrorAvgMs, 150);
            }
          }
        }
        if (slowDue) {
          lastHudSlowFlushRef.current = nowMs;

          // FPS readout averaged since the last sample (500ms window).
          if (fpsLabelRef.current) {
            if (fpsLastSampleRef.current === 0) {
              fpsLastSampleRef.current = nowMs;
              fpsFramesRef.current = 0;
            } else {
              const elapsed = nowMs - fpsLastSampleRef.current;
              if (elapsed >= 500) {
                const nextText = `${Math.round((fpsFramesRef.current * 1000) / elapsed)} FPS`;
                if (fpsLabelRef.current.innerText !== nextText) {
                  fpsLabelRef.current.innerText = nextText;
                }
                fpsFramesRef.current = 0;
                fpsLastSampleRef.current = nowMs;
              }
            }
          }

          // Live PENAR refresh on the slow 3Hz tier: same PP formula,
          // evaluated with the progressive difficulty at the current progress
          // time, exactly like lazer's live PP counter.
          const live = scoreStateRef.current;
          const difficulty = penarDifficultyRef.current;
          live.penar = computeLivePenar({
            timedAttributes: timedPenarRef.current,
            progressTime: judgeTime,
            fallbackStarRating: difficulty ? difficulty.starRating : null,
            marvelousCount: live.marvelousCount,
            perfectCount: live.perfectCount,
            greatCount: live.greatCount,
            goodCount: live.goodCount,
            badCount: live.badCount,
            missCount: live.missCount,
            maxCombo: live.maxCombo,
            mods: settingsRef.current.selectedMods,
          });
          const flushedPenar = scoreStateRef.current.penar ?? null;
          setUiPenar((prev) => (prev === flushedPenar ? prev : flushedPenar));
        }
      }

      // Replay simulation playback
      if (replayData && replayData.length > 0 && isPlayingRef.current && !isPaused) {
        consumeReplayFrames(replayData, replayCursorRef.current, judgeTime, frame => {
          audioTimeRef.current = frame.time;
          if (holdRulesVersion === HOLD_TICK_RULES_VERSION && tickHoldsRef.current.length > 0) {
            advanceHoldTailTicks(tickHoldsRef.current, frame.time - TICK_BOUNDARY_EPSILON_MS, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
          }
          checkNotesAutonomousMisses(
            notesRef.current,
            frame.time,
            missJudg.windowMs,
            (note) => applyJudgement(missJudg, note.column),
            keysPressedRef.current,
            isNoRelease,
            judgementWindows,
            undefined,
            0,
            false,
          );
          for (let col = 0; col < beatmap.keyCount; col++) {
            const wasPressed = keysPressedRef.current[col];
            const isCurrentlyPressed = frame.keysPressed[col];
            if (!wasPressed && isCurrentlyPressed) {
              updateKeyCounterUi(col, true, true);
              keysPressedRef.current[col] = true;
              activeColumnsRef.current[col] = true;
              laneGlowRef.current[col] = 1.0;
              hasKeyPressedOnceRef.current[col] = true;
              triggerHitEvent(col, frame.time);
            } else if (wasPressed && !isCurrentlyPressed) {
              updateKeyCounterUi(col, false, false);
              keysPressedRef.current[col] = false;
              activeColumnsRef.current[col] = false;
              triggerReleaseEvent(col, frame.time);
            }
          }
          if (holdRulesVersion === HOLD_TICK_RULES_VERSION && tickHoldsRef.current.length > 0) {
            advanceHoldTailTicks(tickHoldsRef.current, frame.time, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
          }
        });
        audioTimeRef.current = judgeTime;
        checkNotesAutonomousMisses(
          notesRef.current,
          judgeTime,
          missJudg.windowMs,
          (note) => applyJudgement(missJudg, note.column),
          keysPressedRef.current,
          isNoRelease,
          judgementWindows,
          undefined,
          missCursorRef.current,
          true,
        );
        if (holdRulesVersion === HOLD_TICK_RULES_VERSION && activeHoldTickIntervalMs !== undefined) {
          const ticks = tickHoldsRef.current;
          if (ticks.length > 0) {
            advanceHoldTailTicks(ticks, judgeTime, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
          }
        }
      }

      if (isPlayingRef.current && !isPaused && unpauseCountdown === 0) {
        if (isAutoplay) {
          // Cursor-accelerated autoplay: notes are time-sorted, so advance a
          // pointer instead of scanning the whole chart every frame. Backwards
          // seeks reset the cursor via songTimeJump handling in handleSeek.
          const allAutoNotes = notesRef.current;
          let autoCursor = autoplayCursorRef.current;
          if (autoCursor < 0) autoCursor = 0;
          if (autoCursor > allAutoNotes.length) autoCursor = allAutoNotes.length;
          // Rewind the cursor only as far as needed when judgeTime moved
          // backwards (smoothing never moves logic time backwards except on
          // jumps, which reset the cursor upstream).
          if (autoCursor > 0 && autoCursor <= allAutoNotes.length) {
            const probe = allAutoNotes[autoCursor - 1];
            const probeEnd = probe.type === 'hold' && probe.endTime !== undefined ? probe.endTime : probe.time;
            if (probeEnd > judgeTime + missJudg.windowMs + 1) {
              autoCursor = 0;
            }
          }
          const dueEvents: { type: 'head' | 'tail'; note: HitObject; eventTime: number }[] = [];
          // Notes are sorted by head time, but hold tails can end long after
          // later notes begin. The cursor must not advance past a hold whose
          // tail is still in the future, or its sliderend is never visited.
          let firstPendingHoldIndex = -1;

          for (let ai = autoCursor; ai < allAutoNotes.length; ai++) {
            const note = allAutoNotes[ai];
            if (note.time > judgeTime && (note.endTime === undefined || note.endTime > judgeTime)) {
              // Heads beyond this point are all future (sorted), but an
              // earlier hold tail may still be pending — resume from it.
              autoCursor = firstPendingHoldIndex !== -1 ? firstPendingHoldIndex : ai;
              break;
            }
            if (ai === allAutoNotes.length - 1) {
              autoCursor = firstPendingHoldIndex !== -1 ? firstPendingHoldIndex : allAutoNotes.length;
            }
            if (!note.isHit && !note.isMissed && note.time <= judgeTime) {
              dueEvents.push({ type: 'head', note, eventTime: note.time });
            }
            if (
              note.type === 'hold' &&
              !note.isReleased &&
              note.endTime !== undefined &&
              note.endTime <= judgeTime &&
              (note.holdRulesVersion === LAZER_HOLD_RULES_VERSION || note.holdRulesVersion === HOLD_TICK_RULES_VERSION || (note.isHit && !note.isHoldFailed))
            ) {
              dueEvents.push({ type: 'tail', note, eventTime: note.endTime });
            }
            if (
              firstPendingHoldIndex === -1 &&
              note.type === 'hold' &&
              !note.isReleased &&
              !note.isHoldFailed &&
              note.endTime !== undefined &&
              note.endTime > judgeTime &&
              (note.isHit || (!note.isMissed && note.time <= judgeTime))
            ) {
              firstPendingHoldIndex = ai;
            }
          }
          // The scan above may have found a pending tail after the break
          // point was already assigned (tail due later in the same pass).
          if (firstPendingHoldIndex !== -1 && autoCursor > firstPendingHoldIndex) {
            autoCursor = firstPendingHoldIndex;
          }
          autoplayCursorRef.current = autoCursor;

          if (dueEvents.length > 0) {
            dueEvents.sort((a, b) => a.eventTime - b.eventTime);

            for (const evt of dueEvents) {
              const n = evt.note;
              if (evt.type === 'head') {
                if (n.isHit || n.isMissed) continue;
                n.isHit = true;
                n.hitTime = n.time;
                n.isHeadHit = true;
                if (n.holdState) {
                  n.holdState.isHeadJudged = true;
                  n.holdState.headJudgement = 'marvelous';
                  n.holdState.isHolding = true;
                }
                markHoldStartHit(n);

                applyJudgement(marvelousJudg, n.column);
                recordHitErrorSample(0);

                hitErrorTicksRef.current.push({
                  id: `tick-${++hitErrorTickIdRef.current}`,
                  error: 0,
                  timestamp: Date.now(),
                  color: '#3b82f6'
                });

                updateKeyCounterUi(n.column, true, true);
                if (showAutoplayKeys) {
                  // Replay-style press: lane receptor + bottom-right key box
                  // light via keysPressed (flushed to DOM), same sources as
                  // live/replay input. Judgement stays forced marvelous.
                  keysPressedRef.current[n.column] = true;
                  activeColumnsRef.current[n.column] = true;
                  if (hasKeyPressedOnceRef.current) {
                    hasKeyPressedOnceRef.current[n.column] = true;
                  }
                  if (n.type !== 'hold') {
                    // Tap: hold the visual press briefly; the per-frame
                    // maintenance below releases it (pause/seek safe).
                    let expiries = autoplayTapReleaseRef.current;
                    if (expiries.length !== beatmap.keyCount) {
                      expiries = new Array(beatmap.keyCount).fill(Number.NEGATIVE_INFINITY);
                      autoplayTapReleaseRef.current = expiries;
                    }
                    expiries[n.column] = Math.max(
                      expiries[n.column] ?? Number.NEGATIVE_INFINITY,
                      evt.eventTime + AUTOPLAY_TAP_VISUAL_MS,
                    );
                  } else {
                    // Track the held lane incrementally so the per-frame
                    // receptor update stays O(keys) (see below).
                    const counts = autoplayHoldCountRef.current;
                    if (counts.length !== beatmap.keyCount) {
                      autoplayHoldCountRef.current = new Array(beatmap.keyCount).fill(0);
                    }
                    autoplayHoldCountRef.current[n.column] =
                      (autoplayHoldCountRef.current[n.column] || 0) + 1;
                  }
                } else if (n.type === 'hold') {
                  // Cinema legacy path: holds track the lane, taps only bump
                  // the counter (no lane/key-box press).
                  const counts = autoplayHoldCountRef.current;
                  if (counts.length !== beatmap.keyCount) {
                    autoplayHoldCountRef.current = new Array(beatmap.keyCount).fill(0);
                  }
                  autoplayHoldCountRef.current[n.column] =
                    (autoplayHoldCountRef.current[n.column] || 0) + 1;
                  keysPressedRef.current[n.column] = true;
                  activeColumnsRef.current[n.column] = true;
                }
                mainAudio.playBeatmapHitsound(n.hitSound, n.hitSample?.filename);
                laneGlowRef.current[n.column] = 1.0;
              } else if (evt.type === 'tail') {
                updateKeyCounterUi(n.column, false, false);
                if (n.isReleased || n.isHoldFailed) continue;
                n.isReleased = true;
                n.releaseTime = n.endTime!;
                n.isReleaseHit = true;
                if (n.holdState) {
                  n.holdState.isTailJudged = true;
                  n.holdState.tailJudgement = 'marvelous';
                  n.holdState.isHolding = false;
                  n.holdState.isComplete = true;
                }
                markHoldReleaseHit(n);
                // Release one held-lane refcount; the lane clears only when
                // no overlapping hold in the same column remains.
                {
                  const counts = autoplayHoldCountRef.current;
                  const next = Math.max(0, (counts[n.column] || 1) - 1);
                  counts[n.column] = next;
                  if (showAutoplayKeys) {
                    // Keep the lane lit if a tap flash is still active in
                    // the same column (hold + tap overlap).
                    const tapActive =
                      (autoplayTapReleaseRef.current[n.column] ?? Number.NEGATIVE_INFINITY) > judgeTime;
                    if (next === 0 && !tapActive) {
                      keysPressedRef.current[n.column] = false;
                      activeColumnsRef.current[n.column] = false;
                    }
                  } else if (next === 0) {
                    keysPressedRef.current[n.column] = false;
                    activeColumnsRef.current[n.column] = false;
                  }
                }

                applyJudgement(marvelousJudg, n.column);
                recordHitErrorSample(0);
              }
            }
          }

          if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
            let holdKeys = autoplayHoldKeysRef.current;
            if (holdKeys.length !== beatmap.keyCount) {
              holdKeys = new Array(beatmap.keyCount).fill(true);
              autoplayHoldKeysRef.current = holdKeys;
            } else {
              holdKeys.fill(true);
            }
            const autoTicks = tickHoldsRef.current;
            if (autoTicks.length > 0) {
              advanceHoldTailTicks(
                autoTicks,
                judgeTime,
                holdKeys,
                note => applyJudgement(missJudg, note.column),
              );
            } else {
              advanceHoldTailTicks(
                notesRef.current,
                judgeTime,
                holdKeys,
                note => applyJudgement(missJudg, note.column),
              );
            }
          }

          // Maintain active receptor/lane state from the incremental hold
          // refcounts (O(keys)). A backwards timeline move (seek/restart)
          // rebuilds the counts once instead of scanning every frame.
          {
            if (judgeTime < lastAutoplayTimeRef.current - 1) {
              const rebuilt = new Array(beatmap.keyCount).fill(0);
              for (const n of notesRef.current) {
                if (n.time > judgeTime) break;
                if (n.type !== 'hold') continue;
                if (n.endTime !== undefined && n.endTime <= judgeTime) continue;
                const holding = n.holdState
                  ? (n.holdState.isHolding && !n.holdState.isTailJudged)
                  : (n.isHit && !n.isReleased && !n.isHoldFailed);
                if (holding) rebuilt[n.column] = (rebuilt[n.column] || 0) + 1;
              }
              autoplayHoldCountRef.current = rebuilt;
              if (showAutoplayKeys) {
                // Timeline jumped backwards: taps from the future must not
                // stay lit.
                autoplayTapReleaseRef.current = new Array(beatmap.keyCount).fill(Number.NEGATIVE_INFINITY);
              }
              for (let col = 0; col < beatmap.keyCount; col++) {
                const held = rebuilt[col] > 0;
                keysPressedRef.current[col] = held;
                activeColumnsRef.current[col] = held;
              }
            }
            lastAutoplayTimeRef.current = judgeTime;
            const counts = autoplayHoldCountRef.current;
            if (showAutoplayKeys) {
              // Replay-style sustain: holds + active tap flashes drive the
              // receptors, lane glow, and bottom-right key boxes every frame.
              let expiries = autoplayTapReleaseRef.current;
              if (expiries.length !== beatmap.keyCount) {
                expiries = new Array(beatmap.keyCount).fill(Number.NEGATIVE_INFINITY);
                autoplayTapReleaseRef.current = expiries;
              }
              for (let col = 0; col < beatmap.keyCount; col++) {
                const held = (counts[col] || 0) > 0;
                const tapActive = (expiries[col] ?? Number.NEGATIVE_INFINITY) > judgeTime;
                const shouldPressed = held || tapActive;
                if (shouldPressed) {
                  keysPressedRef.current[col] = true;
                  activeColumnsRef.current[col] = true;
                  laneGlowRef.current[col] = Math.max(laneGlowRef.current[col] || 0, 0.8);
                } else if ((counts[col] || 0) === 0) {
                  keysPressedRef.current[col] = false;
                  activeColumnsRef.current[col] = false;
                }
              }
            } else {
              for (let col = 0; col < beatmap.keyCount; col++) {
                if ((counts[col] || 0) > 0) {
                  laneGlowRef.current[col] = Math.max(laneGlowRef.current[col] || 0, 0.8);
                }
              }
            }
          }
        }

        if (!isReplayMode) checkAutonomousMisses(judgeTime);

        // Frame-latency key-box highlights (class-only): replay/autoplay/hold
        // state set above reaches the DOM this frame instead of the 80ms HUD
        // tier. Live keydown/up already write synchronously on the event.
        flushKeyBoxesFastRef.current();
        
        // Continuous Video-Audio phase lock (PI PLL + transport snaps elsewhere)
        if (videoRef.current) {
          if (!syncControllerRef.current) {
            syncControllerRef.current = new VideoSyncController(
              videoRef.current,
              () => audioTimeRef.current,
              beatmap.videoStartTime || 0,
              () => settingsRef.current,
              () => mainAudio.playbackRate
            );
          }
          try {
            syncControllerRef.current.update();
          } catch (e) {
            // Fail-safe warnings ignored safely
          }
        }
      } else if (videoRef.current) {
        // Paused or count down: keep video matched to start or paused
        try {
          if (!videoRef.current.paused) {
            videoRef.current.pause();
          }
        } catch (e) {}
      }

      const receptorY = currentSettings.upsurfaceNoteMode ? 60 : height - 155;

      // --- HIGH PERFORMANCE RENDERER HANDLER ---
      if (activeRendererRef.current) {
        const keyCount = beatmap.keyCount;
        const isScrollLocked = (isPlayingRef.current || !isPrePlayRef.current) && (currentSettings.lockScrollSpeedDuringPlay !== false);
        const activeScrollSpeed = isScrollLocked ? lockedScrollSpeedRef.current : currentSettings.scrollSpeed;
        const renderSettings = activeScrollSpeed === currentSettings.scrollSpeed
          ? currentSettings
          : { ...currentSettings, scrollSpeed: activeScrollSpeed };
        // Rate-compensated scroll: keep wall-clock px/sec constant so DT/HT/WU/WD/AS
        // change note density, not visual scroll speed.
        const liveRate = mainAudio.playbackRate;
        const rateForScroll = Number.isFinite(liveRate) && liveRate > 0 ? liveRate : 1;
        const speedFactor = calculateScrollSpeedFactor(height, receptorY, renderSettings, rateForScroll);

        // Calculate dynamic layouts
        const colsLayout = updateColumnsLayout(
          colsLayoutBufferRef.current,
          keyCount,
          width,
          renderSettings,
          activeColumnsRef.current,
          laneGlowRef.current
        );

        const visualTime = songTime - (currentSettings.visualOffset || 0);

        // Cull and fetch visible notes (reuse buffer, no per-frame array alloc).
        const songBreaks = beatmap.breaks ?? [];
        const visibleNotes = getVisibleNotes(
          notesRef.current,
          renderSettings,
          height,
          receptorY,
          visualTime,
          speedFactor,
          scrollModelRef.current,
          scoreStateRef.current.combo,
          songBreaks,
          visibleNotesBufferRef.current
        );

        // Project visible measure guide lines (reuse buffer, no per-frame alloc).
        const visibleBarLines = visibleBarLinesBufferRef.current;
        visibleBarLines.length = 0;
        if (renderSettings.showBarLines !== false && barLineSource.length > 0) {
          const upscroll = !!renderSettings.upsurfaceNoteMode;
          const scrollModel = scrollModelRef.current;
          for (let i = 0; i < barLineSource.length; i++) {
            const bar = barLineSource[i];
            const y = getScrollYPosition(bar.time, visualTime, receptorY, speedFactor, upscroll, scrollModel);
            if (y < -20 || y > height + 20) continue;
            visibleBarLines.push({ y, time: bar.time, major: bar.major });
          }
        }

        // Decay lane glows
        for (let i = 0; i < keyCount; i++) {
          if (laneGlowRef.current[i] > 0) {
            laneGlowRef.current[i] *= 0.88;
          }
        }

        // Compact expired hit ticks (> 2000ms old) in place. Ticks are
        // push-ordered, so expiry is a prefix that can be spliced once.
        // (Average + meter draws live in the fast HUD flush above.)
        {
          const ticks = hitErrorTicksRef.current;
          const nowScale = Date.now();
          let expired = 0;
          while (expired < ticks.length && nowScale - ticks[expired].timestamp >= 2000) {
            expired++;
          }
          if (expired > 0) ticks.splice(0, expired);
        }

        // Map key bindings for labels (reuse buffer, no per-frame array;
        // pre-uppercased once here so the renderer never calls toUpperCase).
        const layoutKeys = currentSettings.bindings[keyCount] || [];
        const keyLabelsMapped = keyLabelsBufferRef.current;
        keyLabelsMapped.length = layoutKeys.length;
        for (let i = 0; i < layoutKeys.length; i++) {
          const hasPressed = hasKeyPressedOnceRef.current && hasKeyPressedOnceRef.current[i];
          const raw = !hasPressed ? layoutKeys[i] : '';
          keyLabelsMapped[i] = raw ? raw.toUpperCase() : '';
        }

        // Execute drawing call (playfield-only; HUD meters are drawn below
        // from the same tick data via the ManiaHud overlay helper)
        activeRendererRef.current.render({
          width,
          height,
          timeMs: visualTime,
          receptorY,
          columns: colsLayout,
          notes: visibleNotes,
          barLines: visibleBarLines,
          settingsSlice: renderSettings,
          showKeyLabels: true,
          keyLabels: keyLabelsMapped,
          isFocusMode: isFocusModeRef.current,
          isMobile: false,
          combo: scoreStateRef.current.combo,
          breaks: songBreaks
        });

        // Hit-error meters draw in the fast HUD flush above, never per-frame.
      }

      // Check if song completed naturally or run loops (audio truth, not the
      // slewed visual clock, so completion never lags a catch-up glide).
      const songDurationMs = Number.isFinite(beatmap.duration) && beatmap.duration > 0 ? beatmap.duration * 1000 : 10 * 1000;
      if (judgeTime >= songDurationMs && !scoreStateRef.current.completed && isPlayingRef.current) {
        scoreStateRef.current.completed = true;
        isPlayingRef.current = false;
        mainAudio.stop();
        if (videoRef.current) {
          try { videoRef.current.pause(); } catch (e) {}
        }
        
        if (finishTimeoutRef.current) {
          clearTimeout(finishTimeoutRef.current);
        }
        finishTimeoutRef.current = setTimeout(() => {
          finishTimeoutRef.current = null;
          if (isMountedRef.current) {
            scoreStateRef.current.penar = computePenar({
              starRating: penarDifficultyRef.current ? penarDifficultyRef.current.starRating : null,
              marvelousCount: scoreStateRef.current.marvelousCount,
              perfectCount: scoreStateRef.current.perfectCount,
              greatCount: scoreStateRef.current.greatCount,
              goodCount: scoreStateRef.current.goodCount,
              badCount: scoreStateRef.current.badCount,
              missCount: scoreStateRef.current.missCount,
              maxCombo: scoreStateRef.current.maxCombo,
              mods: settings.selectedMods,
            });
            onFinishRef.current(scoreStateRef.current, replayFramesRef.current, hitErrorSamplesRef.current);
          }
        }, 1200);
      }

      if ((isPlayingRef.current && !isPaused) || audioStartPendingRef.current || unpauseCountdown > 0) {
        requestId = requestAnimationFrame(render);
        animationFrameRef.current = requestId;
      }
    };

    // Begin looping
    if ((isPlayingRef.current && !isPaused) || audioStartPendingRef.current || unpauseCountdown > 0) {
      requestId = requestAnimationFrame(render);
      animationFrameRef.current = requestId;
    } else {
      render(); // Single tick render on draw pause state
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      window.removeEventListener('resize', resizeCanvas);
      try { sizeObserver?.disconnect(); } catch { /* ignore */ }
    };
  }, [beatmap, isPaused, isPrePlay, unpauseCountdown]);

  // Pause / Resume Handlers
  const pauseGameplay = () => {
    if (unpauseCountdownRef.current > 0 || scoreStateRef.current.failed) return;
    setUnpauseCountdown(0);
    if (isPausedRef.current) return;
    setIsPaused(true);
    isPausedRef.current = true;
    isPlayingRef.current = false;
    mainAudio.pause();
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) {}
    }
    // Drop in-flight hold grace and input edges so resume does not auto-fail LNs
    notesRef.current.forEach((n) => {
      if (n.releaseGraceUntil !== undefined) n.releaseGraceUntil = undefined;
    });
    lanePressCountRef.current.fill(0);
    keysPressedRef.current.fill(false);
    activeColumnsRef.current.fill(false);
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pauseGameplay();
      }
    };
    const handleBlur = () => {
      pauseGameplay();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isPaused]);

  const togglePause = () => {
    if (unpauseCountdownRef.current > 0 || scoreStateRef.current.failed) return;

    if (isPausedRef.current) {
      if (isReplayMode || isAutoplay) {
        setIsPaused(false);
        isPausedRef.current = false;
        isPlayingRef.current = true;
        void mainAudio.playAsync(beatmap.bpm, settingsRef.current.audioOffset).then(() => {
          const now = mainAudio.getCurrentTimeMs();
          audioTimeRef.current = now;
          lastSongTimeRef.current = now;
          songTimeJumpRef.current = true;
          snapVideoToAudio(now, true);
        });
      } else {
        setUnpauseCountdown(3);
      }
    } else {
      setIsPaused(true);
      isPausedRef.current = true;
      isPlayingRef.current = false;
      mainAudio.pause();
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (e) {}
      }
      notesRef.current.forEach((n) => {
        if (n.releaseGraceUntil !== undefined) n.releaseGraceUntil = undefined;
      });
      lanePressCountRef.current.fill(0);
      keysPressedRef.current.fill(false);
      activeColumnsRef.current.fill(false);
    }
  };

  const simulateGameToTime = (targetTimeMs: number) => {
    // 1. Reset all notes to default states
    notesRef.current = (beatmap.notes || []).map(note => {
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
    notesRef.current.sort((a, b) => a.time - b.time);
    tickHoldsRef.current = notesRef.current.filter(
      (n) => n.type === 'hold' && n.nextTailTickTime !== undefined,
    );
    // simulateGameToTime builds brand-new note objects, so the per-column
    // views (which hold object identities) must be rebuilt and the shared
    // input cursors rewound with the miss/autoplay cursors.
    {
      const perColumn: HitObject[][] = Array.from({ length: beatmap.keyCount }, () => []);
      for (const n of notesRef.current) {
        if (n.column >= 0 && n.column < beatmap.keyCount) perColumn[n.column].push(n);
      }
      columnNotesRef.current = perColumn;
      columnCursorRef.current = new Array(beatmap.keyCount).fill(0);
    }
    missCursorRef.current = 0;
    autoplayCursorRef.current = 0;

    // 2. Reset keyboard arrays
    keysPressedRef.current = new Array(beatmap.keyCount).fill(false);
    lanePressCountRef.current = new Array(beatmap.keyCount).fill(0);
    activeColumnsRef.current = new Array(beatmap.keyCount).fill(false);
    laneGlowRef.current = new Array(beatmap.keyCount).fill(0);
    hasKeyPressedOnceRef.current = new Array(beatmap.keyCount).fill(false);
    resetKeyCounterUi();

    // 3. Reset score tracking
    scoreStateRef.current = {
      score: 0,
      combo: 0,
      maxCombo: 0,
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
      columnJudgements: initializeColumnJudgements(beatmap.keyCount),
    };
    healthStateRef.current = createHealthState(beatmap.hpDrainRate, settings.selectedMods, beatmap.notes);

    totalJudgementsRef.current = holdRulesVersion === HOLD_TICK_RULES_VERSION ? 0 : countMapJudgements(beatmap.notes);
    maxComboPortionRef.current =
      holdRulesVersion === HOLD_TICK_RULES_VERSION ? 0 : computeMaxComboPortion(totalJudgementsRef.current);

    // Keep live PENAR consistent after scrub resets; the slow flush tier
    // recomputes it from these counts on its next tick.
    scoreStateRef.current.penar = computePenar({
      starRating: penarDifficultyRef.current ? penarDifficultyRef.current.starRating : null,
      maxCombo: 0,
      mods: settings.selectedMods,
    });
    setUiPenar(scoreStateRef.current.penar);

    // Reset hit error timing ticks
    hitErrorTicksRef.current = [];
    hitErrorSamplesRef.current = [];
    unstableRateAccumulatorRef.current.reset();

    if (replayData.length === 0) {
      hudPendingRef.current.score = 0;
      hudPendingRef.current.combo = 0;
      hudPendingRef.current.hp = 100;
      hudPendingRef.current.accuracy = 100;
      lastHudFlushRef.current = 0;
      lastHudSlowFlushRef.current = 0;
      lastMeterSigRef.current = '';
      setUiScore(0);
      setUiCombo(0);
      setUiHp(100);
      setUiAccuracy(100);
      return;
    }

    let simCurrentComboPortion = 0;

    // Helper functions for chronological simulation
    const simApplyJudgement = (judg: JudgementWindow, col: number, healthContext: HealthJudgementContext = 'note') => {
      const state = scoreStateRef.current;
      if (!state.columnJudgements || state.columnJudgements.length === 0) {
        state.columnJudgements = initializeColumnJudgements(beatmap.keyCount);
      }
      if (typeof col === 'number' && col >= 0) {
        incrementColumnJudgement(state.columnJudgements, col, judg.type);
      }

      if (judg.type === 'miss') {
        state.missCount++;
        state.combo = 0;
      } else {
        state.combo++;
        if (state.combo > state.maxCombo) {
          state.maxCombo = state.combo;
        }
        if (judg.type === 'marvelous') state.marvelousCount++;
        else if (judg.type === 'perfect') state.perfectCount++;
        else if (judg.type === 'great') state.greatCount++;
        else if (judg.type === 'good') state.goodCount++;
        else if (judg.type === 'bad') state.badCount++;
      }
      applyHealthJudgement(
        healthStateRef.current,
        judg.type,
        beatmap.hpDrainRate,
        healthContext,
      );
      state.hp = healthToDisplayPercent(healthStateRef.current.health);

      const counts = {
        marvelousCount: state.marvelousCount,
        perfectCount: state.perfectCount,
        greatCount: state.greatCount,
        goodCount: state.goodCount,
        badCount: state.badCount,
        missCount: state.missCount,
      };
      state.accuracy = computeAccuracyPercent(counts);
      const judgedCount = countTotalHits(counts);
      if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
        maxComboPortionRef.current = extendMaxComboPortion(
          maxComboPortionRef.current,
          totalJudgementsRef.current,
          judgedCount,
        );
        totalJudgementsRef.current = judgedCount;
      }

      simCurrentComboPortion += getComboScoreChange(judg.type, state.combo);
      const modMultiplier = computeModMultiplier(settings.selectedMods);
      state.score = computeTotalScore({
        currentComboPortion: simCurrentComboPortion,
        maxComboPortion: maxComboPortionRef.current,
        accuracyPercent: state.accuracy,
        judgedCount,
        totalJudgements: totalJudgementsRef.current,
        modMultiplier,
      });

      // Live PENAR for replay simulation also flows through the slow HUD
      // flush tier; see the live applyJudgement path above.
    };

    const simTriggerHit = (colIndex: number, frameTime: number) => {
      if (holdRulesVersion === LAZER_HOLD_RULES_VERSION) {
        const activeHold = notesRef.current.find(
          (n) => n.column === colIndex && n.type === 'hold' && n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
            n.holdState && n.holdState.isHeadJudged && !n.holdState.isTailJudged
        );
        if (activeHold && activeHold.holdState && !activeHold.holdState.isHolding && activeHold.endTime !== undefined && frameTime < activeHold.endTime) {
          onHoldKeyPress(activeHold.holdState, frameTime, judgementWindows);
          return;
        }

        const note = notesRef.current.find(
          (n) => n.column === colIndex && (
            n.type === 'hold'
              ? (n.holdState ? !n.holdState.isHeadJudged : (!n.isHit && !n.isMissed))
              : (!n.isHit && !n.isMissed)
          )
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
            const resolvedJudg = judgementByType.get(action.judgement) || marvelousJudg;
            simApplyJudgement(resolvedJudg, colIndex, 'hold_head');
            recordHitErrorSample(action.errorMs);
          } else if (action.kind === 'head_miss') {
            note.isMissed = true;
            note.hitTime = frameTime;
            simApplyJudgement(missJudg, colIndex, 'hold_head');
          }
          return;
        }

        const resolvedJudgement = resolveLazerJudgementWindow(diff, judgementWindows);
        if (resolvedJudgement.type !== 'miss') {
          note.isHit = true;
          note.hitTime = frameTime;
          simApplyJudgement(resolvedJudgement, colIndex);
          recordHitErrorSample(frameTime - note.time);
        } else {
          note.isMissed = true;
          simApplyJudgement(resolvedJudgement, colIndex);
        }
        return;
      }

      const earlyReleasedHold = notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.holdRulesVersion === HOLD_TICK_RULES_VERSION &&
          n.isHit && !n.isReleased && !n.isHoldFailed && n.earlyReleaseTime !== undefined,
      );
      if (earlyReleasedHold) {
        if (earlyReleasedHold.endTime !== undefined && frameTime >= earlyReleasedHold.endTime - missJudg.windowMs) {
          markHoldReleaseZonePressed(earlyReleasedHold, frameTime);
        } else {
          markHoldTailResumed(earlyReleasedHold, frameTime);
        }
        return;
      }
      const activeHoldAndReleased = notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.releaseGraceUntil !== undefined
      );
      if (activeHoldAndReleased) {
        if (isHoldGraceActive(frameTime, activeHoldAndReleased.releaseGraceUntil)) {
          activeHoldAndReleased.releaseGraceUntil = undefined;
          return;
        }
        const transition = resolveHoldGrace(activeHoldAndReleased, frameTime);
        activeHoldAndReleased.releaseGraceUntil = transition.releaseGraceUntil;
        activeHoldAndReleased.isHoldFailed = transition.isHoldFailed;
        activeHoldAndReleased.isReleased = transition.isReleased;
        simApplyJudgement(missJudg, colIndex);
      }
      const note = notesRef.current.find(
        (n) =>
          n.column === colIndex &&
          (
            (!n.isHit && !n.isMissed) ||
            (n.type === 'hold' && n.isMissed && !n.isHit && !n.isReleased && !n.isHoldFailed)
          )
      );
      if (!note) return;
      const maxWindow = judgementWindows[judgementWindows.length - 1].windowMs;

      if (note.type === 'hold' && note.isMissed && !note.isHit) {
        if (note.endTime && frameTime - note.endTime > maxWindow) {
          return;
        }
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
      if (diff < -maxWindow) {
        return; 
      }
      const resolvedJudgement = resolveLazerJudgementWindow(diff, judgementWindows);
      if (resolvedJudgement.type !== 'miss') {
        note.isHit = true;
        note.hitTime = frameTime;
        markHoldStartHit(note);
        simApplyJudgement(resolvedJudgement, colIndex, note.type === 'hold' ? 'hold_head' : 'note');
        recordHitErrorSample(frameTime - note.time);
      } else {
        note.isMissed = true;
        if (note.type === 'hold') {
          simApplyJudgement(resolvedJudgement, colIndex, 'hold_head');
          note.isHit = true;
          note.hitTime = frameTime;
          if (note.holdRulesVersion === HOLD_TICK_RULES_VERSION) {
            markHoldTailEngaged(note, frameTime);
          }
        } else {
          simApplyJudgement(resolvedJudgement, colIndex);
        }
      }
    };

    const simTriggerRelease = (colIndex: number, frameTime: number) => {
      if (holdRulesVersion === LAZER_HOLD_RULES_VERSION) {
        const holdNote = notesRef.current.find(
          (n) => n.column === colIndex && n.type === 'hold' && n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
            n.holdState && n.holdState.isHeadJudged && !n.holdState.isTailJudged && n.holdState.isHolding
        );
        if (!holdNote || !holdNote.endTime || !holdNote.holdState) return;

        const action = onHoldKeyRelease(holdNote.holdState, frameTime, judgementWindows);
        if (!action) return;

        if (action.kind === 'body_break') {
          holdNote.isHoldFailed = true;
          holdNote.releaseTime = frameTime;
          holdNote.earlyReleaseTime = frameTime;
          scoreStateRef.current.combo = 0;
          if (scoreStateRef.current.comboBreakCount !== undefined) {
            scoreStateRef.current.comboBreakCount++;
          }
          applyHealthJudgement(
            healthStateRef.current,
            'miss',
            beatmap.hpDrainRate,
            'body_break',
          );
          scoreStateRef.current.hp = healthToDisplayPercent(healthStateRef.current.health);
          return;
        }

        if (action.kind === 'tail_hit') {
          holdNote.isReleased = true;
          holdNote.releaseTime = frameTime;
          holdNote.isReleaseHit = true;
          holdNote.isReleaseMissed = false;
          const tailJudg = judgementByType.get(action.judgement) || missJudg;
          simApplyJudgement(tailJudg, colIndex, 'hold_tail');
          recordHitErrorSample(action.effectiveErrorMs);
          return;
        }

        if (action.kind === 'tail_miss') {
          holdNote.isReleased = true;
          holdNote.releaseTime = frameTime;
          holdNote.isReleaseHit = false;
          holdNote.isReleaseMissed = true;
          holdNote.isHoldFailed = true;
          simApplyJudgement(missJudg, colIndex, 'hold_tail');
          return;
        }
        return;
      }

      const holdNote = notesRef.current.find((n) => n.column === colIndex && n.type === 'hold' && !n.isReleased &&
        (n.holdRulesVersion === HOLD_TICK_RULES_VERSION
          ? (n.isHeadHit || n.tailEngagedTime !== undefined || n.releaseZoneArmedTime !== undefined)
          : (n.isHit && !n.isHoldFailed)));
      if (!holdNote || !holdNote.endTime) return;
      const endDiff = frameTime - holdNote.endTime;
      const graceThreshold = -missJudg.windowMs;
      const graceDuration = missJudg.windowMs;
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
        simApplyJudgement(releaseJudgement, colIndex, 'hold_tail');
        if (!releaseMissed) {
          markHoldReleaseHit(holdNote);
          recordHitErrorSample(endDiff);
        }
        return;
      }
      if (endDiff < graceThreshold) {
        holdNote.releaseTime = frameTime;
        holdNote.releaseGraceUntil = frameTime + graceDuration;
        return;
      }
      holdNote.isReleased = true;
      holdNote.releaseTime = frameTime;
      const tailJudgement = getLazerTailJudgementWindow(endDiff, judgementWindows);
      simApplyJudgement(tailJudgement, colIndex, 'hold_tail');
      if (tailJudgement.type !== 'miss') {
        recordHitErrorSample(endDiff);
      } else {
        holdNote.isHoldFailed = true;
      }
    };

    const simCheckAutonomousMisses = (currentTime: number, keysPressed?: boolean[]) => {
      if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
        advanceHoldTailTicks(notesRef.current, currentTime, keysPressed || [], note => simApplyJudgement(missJudg, note.column));
      }
      checkNotesAutonomousMisses(
        notesRef.current,
        currentTime,
        missJudg.windowMs,
        (n, isDoubleMiss) => {
          if (isDoubleMiss) {
            simApplyJudgement(missJudg, n.column, 'hold_head');
            simApplyJudgement(missJudg, n.column, 'hold_tail');
          } else {
            simApplyJudgement(missJudg, n.column);
          }
        },
        keysPressed
      );
    };

    // Binary-search the normalized frame list for a responsive scrub start.
    const historicalFrameCount = upperBoundReplayFrame(replayData, targetTimeMs);
    let prevKeys = new Array(beatmap.keyCount).fill(false);

    for (let frameIndex = 0; frameIndex < historicalFrameCount; frameIndex++) {
      const frame = replayData[frameIndex];
      // 1. Check autonomous misses at this frame time
      simCheckAutonomousMisses(frame.time, prevKeys);

      // 2. Process keyboard changes
      for (let col = 0; col < beatmap.keyCount; col++) {
        const wasPressed = prevKeys[col];
        const isCurrentlyPressed = frame.keysPressed[col];
        if (!wasPressed && isCurrentlyPressed) {
          simTriggerHit(col, frame.time);
        } else if (wasPressed && !isCurrentlyPressed) {
          simTriggerRelease(col, frame.time);
        }
        prevKeys[col] = isCurrentlyPressed;
      }
      if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
        advanceHoldTailTicks(notesRef.current, frame.time, prevKeys, note => simApplyJudgement(missJudg, note.column));
      }
    }

    // 3. Sweep up to targetTimeMs
    simCheckAutonomousMisses(targetTimeMs, prevKeys);

    // Sync key states to the last frame if available
    if (historicalFrameCount > 0) {
      const lastFrame = replayData[historicalFrameCount - 1];
      keysPressedRef.current = [...lastFrame.keysPressed];
      activeColumnsRef.current = [...lastFrame.keysPressed];
      lanePressCountRef.current = lastFrame.keysPressed.map((p) => (p ? 1 : 0));
    } else {
      keysPressedRef.current.fill(false);
      activeColumnsRef.current.fill(false);
      lanePressCountRef.current.fill(0);
    }

    lastProcessedReplayTimeRef.current = targetTimeMs;
    resetReplayCursor(replayCursorRef.current, replayData, targetTimeMs);

    // Synchronize UI view hooks (scrub path is infrequent: flush immediately)
    hudPendingRef.current.score = scoreStateRef.current.score;
    hudPendingRef.current.combo = scoreStateRef.current.combo;
    hudPendingRef.current.hp = scoreStateRef.current.hp;
    hudPendingRef.current.accuracy = scoreStateRef.current.accuracy;
    lastHudFlushRef.current = 0;
    lastHudSlowFlushRef.current = 0;
    lastMeterSigRef.current = '';
    setUiScore(scoreStateRef.current.score);
    setUiCombo(scoreStateRef.current.combo);
    setUiHp(scoreStateRef.current.hp);
    setUiAccuracy(scoreStateRef.current.accuracy);
  };

  const simulateAutoplayToTime = (targetTimeMs: number) => {
    const wasPaused = isPausedRef.current;
    initializeGameplay(false);
    setIsPaused(wasPaused);
    isPausedRef.current = wasPaused;

    const boundedTime = Math.max(0, Math.min(targetTimeMs, beatmap.duration * 1000));
    for (const note of notesRef.current) {
      if (note.time <= boundedTime) {
        note.isHit = true;
        note.hitTime = note.time;
        markHoldStartHit(note);
        applyJudgement(marvelousJudg, note.column);
      }
      if (
        note.type === 'hold' &&
        note.endTime !== undefined &&
        note.endTime <= boundedTime
      ) {
        note.isReleased = true;
        note.releaseTime = note.endTime;
        markHoldReleaseHit(note);
        applyJudgement(marvelousJudg, note.column);
      }
    }

    advanceHoldTailTicks(
      notesRef.current,
      boundedTime,
      new Array(beatmap.keyCount).fill(true),
      note => applyJudgement(missJudg, note.column),
    );

    // Single O(n) pass instead of O(keys*n) `.some` per column.
    {
      const holdingByColumn = new Array(beatmap.keyCount).fill(false);
      for (const note of notesRef.current) {
        if (note.type === 'hold' && note.isHit && !note.isReleased && !note.isHoldFailed) {
          if (note.column >= 0 && note.column < beatmap.keyCount) holdingByColumn[note.column] = true;
        }
      }
      // Rebuild the incremental hold refcounts so the per-frame autoplay
      // maintenance keeps seek-restored holds lit (taps never persist).
      const rebuiltCounts = new Array(beatmap.keyCount).fill(0);
      for (const note of notesRef.current) {
        if (note.type !== 'hold') continue;
        if (note.endTime !== undefined && note.endTime <= boundedTime) continue;
        const holding = note.holdState
          ? (note.holdState.isHolding && !note.holdState.isTailJudged)
          : (note.isHit && !note.isReleased && !note.isHoldFailed);
        if (holding && note.column >= 0 && note.column < beatmap.keyCount) {
          rebuiltCounts[note.column] = (rebuiltCounts[note.column] || 0) + 1;
        }
      }
      autoplayHoldCountRef.current = rebuiltCounts;
      autoplayTapReleaseRef.current = new Array(beatmap.keyCount).fill(Number.NEGATIVE_INFINITY);
      lastAutoplayTimeRef.current = boundedTime;
      for (let col = 0; col < beatmap.keyCount; col++) {
        keysPressedRef.current[col] = holdingByColumn[col];
        activeColumnsRef.current[col] = holdingByColumn[col];
      }
    }

    audioTimeRef.current = boundedTime;
    lastSongTimeRef.current = boundedTime;
    songTimeJumpRef.current = true;
    isPlayingRef.current = wasPlayingRef.current;
    hudPendingRef.current.score = scoreStateRef.current.score;
    hudPendingRef.current.combo = scoreStateRef.current.combo;
    hudPendingRef.current.hp = scoreStateRef.current.hp;
    hudPendingRef.current.accuracy = scoreStateRef.current.accuracy;
    lastHudFlushRef.current = 0;
    lastHudSlowFlushRef.current = 0;
    lastMeterSigRef.current = '';
    setUiScore(scoreStateRef.current.score);
    setUiCombo(scoreStateRef.current.combo);
    setUiHp(scoreStateRef.current.hp);
    setUiAccuracy(scoreStateRef.current.accuracy);
  };

  const handleSeek = (newTimeMs: number) => {
    mainAudio.seekGameplayTimeMs(newTimeMs);
    audioTimeRef.current = newTimeMs;
    lastSongTimeRef.current = newTimeMs;
                                 songTimeJumpRef.current = true;
                                 missCursorRef.current = 0;
                                 autoplayCursorRef.current = 0;
                                 columnCursorRef.current = new Array(beatmap.keyCount).fill(0);
    // handleSeek mutates note flags in place (same identities), so the
    // per-column views stay valid but the shared input cursors must rewind
    // with the timeline, otherwise presses after a backward seek scan from a
    // stale lane position.
    columnCursorRef.current = new Array(beatmap.keyCount).fill(0);
    smoothOffsetRef.current = settings.audioOffset;
    snapVideoToAudio(newTimeMs, false);
    
    // reset visuals
    hitErrorTicksRef.current = [];
    currentJudgementRef.current = null;
    laneGlowRef.current.fill(0);
    
    if (isReplayMode) {
      simulateGameToTime(newTimeMs);
    } else if (isAutoplay) {
      simulateAutoplayToTime(newTimeMs);
    } else {
      // Normal playing seek
      // Hide or miss nodes prior to the seek point so they don't pile up on screen
      notesRef.current.forEach(n => {
         if (n.time < newTimeMs - 200) {
             n.isHit = true; 
             n.isMissed = false;
             n.isReleased = true; // Complete any hold notes
             n.isHoldFailed = false;
         } else {
             n.isHit = false;
             n.isMissed = false;
             n.isReleased = false;
             n.isHoldFailed = false;
             n.hitTime = undefined;
             n.releaseTime = undefined;
             n.releaseGraceUntil = undefined;
         }
      });
      lastProcessedReplayTimeRef.current = newTimeMs;
    }
  };

  const restartMap = () => {
    // Restart pressed in the pause/fail menu: fire the sting synchronously
    // from the gesture so it plays instantly (pre-decoded buffer).
    mainAudio.playRestartSound();
    setRetryCount(prev => prev + 1);
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
    for (const timer of [
      uiJudgementTimeoutRef.current,
      scrollTimeoutRef.current,
    ]) {
      if (timer !== null) clearTimeout(timer);
    }
    uiJudgementTimeoutRef.current = null;
    scrollTimeoutRef.current = null;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    syncControllerRef.current?.destroy();
    syncControllerRef.current = null;
    mainAudio.stop();
    lockedScrollSpeedRef.current = settingsRef.current.scrollSpeed;
    setIsPrePlay(true);
    initializeGameplay(false);
  };

  const handleStartGameplay = () => {
    if (!isAudioLoaded) return;
    // Request raw keyboard lock where supported so gameplay keys are not
    // intercepted by the browser/OS (best-effort, failures are ignored).
    try {
      const nav = navigator as Navigator & { keyboard?: { lock?: () => Promise<void>; unlock?: () => void } };
      void nav.keyboard?.lock?.()?.catch(() => {});
    } catch { /* keyboard lock unsupported */ }
    lockedScrollSpeedRef.current = settingsRef.current.scrollSpeed;
    setIsPaused(false);
    isPausedRef.current = false;
    setIsPrePlay(false);
    // Hold the visual timeline at the lead-in start while the AudioContext
    // resumes. The render loop freezes here until playAsync arms the clock
    // at the same value, so there is no 0 -> -delay teleport.
    {
      const startOffset = settingsRef.current.audioOffset || 0;
      const parked = -startDelayMs - startOffset;
      audioTimeRef.current = parked;
      lastSongTimeRef.current = parked;
      smoothOffsetRef.current = startOffset;
    }
    songTimeJumpRef.current = true;
    lastFrameWallRef.current = 0;
    missCursorRef.current = 0;
    autoplayCursorRef.current = 0;
    autoplayHoldCountRef.current = new Array(beatmap.keyCount).fill(0);
    autoplayTapReleaseRef.current = new Array(beatmap.keyCount).fill(Number.NEGATIVE_INFINITY);
    lastAutoplayTimeRef.current = 0;
    audioStartPendingRef.current = true;
    void mainAudio.playAsync(beatmap.bpm, settings.audioOffset, startDelayMs).then(() => {
      audioStartPendingRef.current = false;
      isPlayingRef.current = true;
      const now = mainAudio.getCurrentTimeMs();
      // Accept the freshly armed clock without slewing: it should already
      // equal the parked lead-in value.
      audioTimeRef.current = now;
      lastSongTimeRef.current = now;
      songTimeJumpRef.current = true;
      snapVideoToAudio(now, true);
    }).catch(() => {
      audioStartPendingRef.current = false;
    });
  };

  // Handle keys in PrePlay
  useEffect(() => {
    if (isPrePlay && isAudioLoaded) {
      const mountTime = Date.now();
      const handlePrePlayKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        if (e.code === 'Escape') {
          e.preventDefault();
          handleExit();
        } else if (e.code === 'Space' || e.code === 'Enter') {
          // Ignore keydown if it happens within 300ms of entering Pre-Play (prevents bleed from Loading page inputs)
          if (Date.now() - mountTime < 300) return;
          e.preventDefault();
          handleStartGameplay();
        }
      };
      window.addEventListener('keydown', handlePrePlayKeyDown);
      return () => window.removeEventListener('keydown', handlePrePlayKeyDown);
    }
  }, [isPrePlay, isAudioLoaded]);

  return (
    <div 
      id="gameplay-container" 
      className="w-full h-screen max-w-none bg-[#050508] p-0 flex flex-col justify-between overflow-hidden relative select-none animate-fade-in"
    >
      {/* PRE-PLAY STAGE OVERLAY */}
      {isPrePlay && (
        <div 
          className="absolute inset-0 z-50 bg-[#050508] flex flex-col justify-between p-6 select-none animate-fade-in"
          style={{ borderRadius: '0px' }}
          onClick={(e) => {
            e.stopPropagation();
            // Removed handleStartGameplay() so they must click the button
          }}
        >
          {/* Dynamic background image layer */}
          {mediaUrls.bgUrl && (
            <div 
              className="absolute inset-0 bg-cover bg-center pointer-events-none"
              style={{
                backgroundImage: `url("${sanitizeCssUrl(mediaUrls.bgUrl)}")`,
                zIndex: 0
              }}
            />
          )}
          {/* Dynamic real-time background dim layer */}
          <div 
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-150"
            style={{ 
              opacity: settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60,
              zIndex: 1
            }}
          />
          {/* Backdrop blur layer */}
          <div 
            className="absolute inset-0 backdrop-blur-md bg-black/10 pointer-events-none"
            style={{ zIndex: 2 }}
          />

          {/* Top Row: Navigation and Fullscreen Controls */}
          <div className="w-full flex justify-between items-center z-10 relative">
            <div className="flex items-center bg-[#10101a]/95 p-1.5 rounded-xl border border-white/10 shadow-xl gap-1">
              <button
                id="preplay-home-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onBack();
                }}
                className="flex items-center justify-center p-2.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                title="Return to selection"
              >
                <Home className="h-5 w-5" />
              </button>
              
              <button
                id="preplay-fullscreen-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFocus();
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-l border-white/10 pl-3"
                title="Toggle Fullscreen"
              >
                <Maximize className="h-4 w-4" />
                <span>Full</span>
              </button>
            </div>

            <div className="text-right">
              <span className="text-[9px] text-zinc-500 font-mono tracking-widest font-black uppercase">
                {isReplayMode ? "PRE-REPLAY ENGINE STAGE" : "PRE-PLAY ENGINE STAGE"}
              </span>
            </div>
          </div>

          {/* Middle Row: Start and Calibration popups */}
          <div className="flex-1 flex flex-col items-center justify-center gap-10 max-w-lg mx-auto w-full z-10 relative">
            {/* Beatmap details snippet */}
            <div className="text-center space-y-2">
              <span className="px-3 py-1 bg-cyan-950/40 text-cyan-400 font-mono text-xs font-bold rounded-full border border-cyan-500/20 shadow-sm shadow-cyan-500/5">
                {beatmap.keyCount}K Mode
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold font-sans text-slate-100 tracking-tight leading-tight mt-2">{beatmap.title}</h2>
              <p className="text-sm font-sans text-slate-400 font-normal">by {beatmap.artist}</p>
            </div>

            {/* Core Buttons Layout: Left Gear, Center Large Play, Right Info */}
            <div className="flex items-center justify-center gap-6 md:gap-8 w-full">
              {/* Settings button */}
              <button
                id="preplay-settings-link"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsModal(true);
                }}
                className="p-5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full border border-white/5 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xl"
                title="Adjust settings"
              >
                <Settings className="h-6 w-6" />
              </button>

              {/* Start Game Button */}
              <button
                id="preplay-start-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartGameplay();
                }}
                 disabled={!isAudioLoaded}
                 className={`flex items-center justify-center gap-4 px-12 py-5 hover:bg-slate-750 text-white rounded-xl border border-white/10 transition-all active:scale-95 cursor-pointer shadow-xl hover:shadow-[0_0_30px_rgba(255,255,255,0.07)] ${isReplayMode ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-800'} ${!isAudioLoaded ? 'opacity-60 cursor-wait' : ''}`}
               >
                 {!isAudioLoaded ? (
                  <>
                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="font-sans font-black text-lg tracking-wider uppercase">Loading</span>
                  </>
                ) : (
                  <>
                    <Play className="h-6 w-6 fill-current text-white" />
                    <span className="font-sans font-black text-lg tracking-wider uppercase">
                      {isReplayMode ? "Watch" : "Start"}
                    </span>
                  </>
                )}
              </button>

              {/* Beatmap metadata button */}
              <button
                id="preplay-info-link"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInfoModal(true);
                }}
                className="p-5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full border border-white/5 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xl"
                title="View map details"
              >
                <Info className="h-6 w-6" />
              </button>
            </div>

             <div className="text-zinc-500 font-mono text-[10px] tracking-widest text-center uppercase">
               {!isAudioLoaded
                 ? `${loadingAudioProgress}% LOADING PLAY ENGINE`
                 : isReplayMode ? "CLICK 'WATCH' TO BEGIN REPLAY" : "CLICK 'START' TO BEGIN PERFORMANCE"}
            </div>
          </div>

          {/* Bottom info */}
          <div className="w-full flex justify-between text-[10px] text-zinc-500 font-mono px-2 relative z-10">
            <span>BPM: {beatmap.bpm}</span>
            <span>DIFFICULTY: {beatmap.difficulty}</span>
          </div>

          {/* INSTANT SETTINGS MODAL POPUP */}
          {showSettingsModal && (
            <div 
              className="fixed inset-0 z-55 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
              onClick={(e) => {
                e.stopPropagation();
                setShowSettingsModal(false);
              }}
            >
              <div 
                className="bg-[#0f0f1c] border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-5 animate-scale-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-cyan-400" />
                    <span className="font-sans font-bold text-slate-200 uppercase tracking-wider text-xs">CALIBRATION ROOM</span>
                  </div>
                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 font-sans text-xs text-left">
                  {/* Scroll speed */}
                  {!isReplayMode && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-400">
                        <span>Scroll Speed</span>
                        <span className="font-mono text-cyan-400 font-extrabold">
                          {settings.scrollSpeed}x (~{computeScrollTravelTimeMs(settings.scrollSpeed)}ms)
                        </span>
                      </div>
                      <input 
                        type="range" min={SCROLL_SPEED_MIN} max={SCROLL_SPEED_MAX} step="1"
                        value={(!isPrePlay && settings.lockScrollSpeedDuringPlay !== false) ? lockedScrollSpeedRef.current : settings.scrollSpeed} 
                        disabled={!isPrePlay && settings.lockScrollSpeedDuringPlay !== false}
                        onChange={(e) => {
                          if (!isPrePlay && settings.lockScrollSpeedDuringPlay !== false) return;
                          updateSettings?.({ scrollSpeed: Number(e.target.value) });
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg ${(!isPrePlay && settings.lockScrollSpeedDuringPlay !== false) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      />
                      {!isPrePlay && settings.lockScrollSpeedDuringPlay !== false && (
                        <p className="text-[10px] text-amber-400/80 font-mono uppercase tracking-wider">Locked mid-map</p>
                      )}
                    </div>
                  )}

                  {/* Audio latency offset */}
                  {!isReplayMode && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-400 font-sans">
                        <span>Audio Offset / Latency</span>
                        <span className="font-mono text-cyan-400 font-extrabold">
                          {settings.audioOffset > 0 ? `+${settings.audioOffset}` : settings.audioOffset}ms
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => updateSettings?.({ audioOffset: Math.max(-500, settings.audioOffset - 5) })}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-white/5 hover:border-white/10 rounded font-mono text-[10px] font-bold cursor-pointer"
                        >
                          -5
                        </button>
                        <input 
                          type="range" min="-300" max="300" step="5"
                          value={settings.audioOffset} 
                          onChange={(e) => updateSettings?.({ audioOffset: Number(e.target.value) })}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="flex-1 accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <button 
                          onClick={() => updateSettings?.({ audioOffset: Math.min(500, settings.audioOffset + 5) })}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-white/5 hover:border-white/10 rounded font-mono text-[10px] font-bold cursor-pointer"
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lane Background Dim */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Gameplay Background Dim</span>
                      <span className="font-mono text-cyan-400 font-extrabold">{Math.round((settings.backgroundDim ?? 0.60) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.05"
                      value={settings.backgroundDim ?? 0.60} 
                      onChange={(e) => updateSettings?.({ backgroundDim: Number(e.target.value) })}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Music Volume */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Music Volume</span>
                      <span className="font-mono text-cyan-400 font-extrabold">{Math.round((settings.musicVolume ?? 0.75) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.05"
                      value={settings.musicVolume} 
                      onChange={(e) => updateSettings?.({ musicVolume: Number(e.target.value) })}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Hitsound Volume */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Hitsound Volume</span>
                      <span className="font-mono text-cyan-400 font-extrabold">{Math.round((settings.hitsoundVolume ?? 0.60) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.05"
                      value={settings.hitsoundVolume} 
                      onChange={(e) => updateSettings?.({ hitsoundVolume: Number(e.target.value) })}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Playfield Width (manual sizing; hidden for argon, which auto-sizes per key count) */}
                  {!isReplayMode && !isArgonSkin(settings) && (
                    <div className="space-y-1.5">
                      {(() => {
                        const widthMin = PLAYFIELD_WIDTH_MIN;
                        const widthMax = PLAYFIELD_WIDTH_MAX;
                        const width = Math.max(widthMin, Math.min(widthMax, settings.playfieldWidthPercent ?? 15));
                        return (
                          <>
                      <div className="flex justify-between text-slate-400">
                        <span>Lane Playfield Width</span>
                        <span className="font-mono text-cyan-400 font-extrabold">{width}%</span>
                      </div>
                      <input 
                        type="range" min={widthMin} max={widthMax} step="1"
                        value={width}
                        onChange={(e) => updateSettings?.({ playfieldWidthPercent: Number(e.target.value) })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                      />
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Upsurface note mode */}
                  {!isReplayMode && (
                    <div className="pt-2 flex justify-between items-center border-t border-white/5">
                      <span className="text-slate-400">Scroll Direction</span>
                      <button
                        onClick={() => {
                          updateSettings?.({ upsurfaceNoteMode: !settings.upsurfaceNoteMode });
                        }}
                        className={`px-3 py-1 text-[10px] font-bold font-mono tracking-wider rounded uppercase border transition cursor-pointer ${
                          settings.upsurfaceNoteMode
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                              : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white animate-pulse'
                        }`}
                      >
                        {settings.upsurfaceNoteMode ? 'Upward Scroll' : 'Downward Scroll'}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black uppercase tracking-wider text-[10px] rounded-xl transition cursor-pointer"
                >
                  Confirm calibrators
                </button>
              </div>
            </div>
          )}

          {/* BEATMAP INFO POPUP */}
          {showInfoModal && (
            <div 
              className="fixed inset-0 z-55 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
              onClick={(e) => {
                e.stopPropagation();
                setShowInfoModal(false);
              }}
            >
              <div 
                className="bg-[#0f0f1c] border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-5 animate-scale-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-cyan-400" />
                    <span className="font-sans font-bold text-slate-200 uppercase tracking-wider text-xs">BEATMAP METRICS</span>
                  </div>
                  <button 
                    onClick={() => setShowInfoModal(false)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2.5 font-sans text-xs text-left">
                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg">
                    <span className="text-slate-400">Song Title</span>
                    <span className="text-slate-100 font-bold max-w-[170px] truncate" title={beatmap.title}>
                      {beatmap.title}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg">
                    <span className="text-slate-400">Artist Name</span>
                    <span className="text-slate-100 font-bold max-w-[170px] truncate" title={beatmap.artist}>
                      {beatmap.artist}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">BPM Clock Rate</span>
                    <span className="text-cyan-400 font-black">{beatmap.bpm} BPM</span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">Song Length</span>
                    <span className="text-slate-100 font-bold">
                      {Math.floor(beatmap.duration / 60)}m {Math.floor(beatmap.duration % 60)}s
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">Creator</span>
                    <span className="text-slate-200 font-bold">{beatmap.creator}</span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">HP Drain Intensity</span>
                    <span className="text-right flex items-center gap-1.5">
                      <span className="text-amber-400 font-black">{beatmap.hpDrainRate}/10</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">Overall Accuracy Window</span>
                    <span className="text-right flex items-center gap-1.5">
                      <span className="text-cyan-400 font-black">{beatmap.overallDifficulty}/10</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-full py-2.5 bg-slate-900 border border-white/5 text-slate-300 hover:text-white font-bold uppercase tracking-wider text-[10px] rounded-xl transition cursor-pointer"
                >
                  Dismiss metrics
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1. PRIMARY GAMEPLAY HIGH-PERFORMANCE CANVAS VIEWPORT */}
      <div 
        className="flex-1 w-full h-full flex flex-col items-center relative bg-slate-950 overflow-hidden text-slate-100"
      >
        {/* VIDEO FORMAT WARNING (soft notice — not a pipeline error) */}
        {videoFormatWarning && showVideoFormatWarning && !isPrePlay && (
          <div className="absolute top-24 right-4 bg-amber-950/80 border border-amber-500/40 p-3 rounded-lg text-[11px] font-sans text-amber-100 z-50 max-w-sm shadow-2xl animate-fade-in backdrop-blur-sm">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <h4 className="font-bold text-amber-300 uppercase tracking-widest text-[10px] flex items-center gap-1.5">
                <span>⚠️</span> Video notice
              </h4>
              <button
                type="button"
                onClick={() => setShowVideoFormatWarning(false)}
                className="text-amber-400/80 hover:text-amber-200 font-mono text-base leading-none px-1 cursor-pointer"
                title="Dismiss"
              >
                ×
              </button>
            </div>
            <p className="leading-relaxed text-amber-50/95">
              The video format <span className="font-black text-amber-200">({videoFormatWarning})</span> is not supported on browsers.
              Gameplay will resume with a JPG/PNG background.
            </p>
          </div>
        )}

        {/* PIPELINE DIAGNOSTICS (hard failures only) */}
        {(isPlayingFallback || isVideoMissing) && (
          <div className="absolute top-24 right-4 bg-red-950/85 border border-red-500/35 p-3 rounded-lg text-[10px] font-mono text-rose-250 z-50 max-w-xs shadow-2xl animate-fade-in backdrop-blur-sm"
            style={videoFormatWarning && showVideoFormatWarning ? { top: '12.5rem' } : undefined}
          >
            <h4 className="font-bold mb-1 text-red-400 uppercase tracking-widest flex items-center gap-1.5 text-[10px]">
              <span>⚠️</span> PIPELINE DIAGNOSTICS
            </h4>
            <div className="space-y-1 text-red-200">
              {isPlayingFallback && <p className="font-bold text-red-400">⚠️ Audio failed to decode. PLEASE RELOAD THE BROWSER TO RESOLVE.</p>}
              {isVideoMissing && <p>• Video declared in metadata but missing in file archive.</p>}
            </div>
          </div>
        )}

        {/* ARGON MANIA HUD (TASK-052/053/054: Complete Argon HUD layout with PENAR) */}
        {!isPrePlay && (
          <ManiaHud
            score={uiScore}
            hp={uiHp}
            accuracy={uiAccuracy}
            penar={uiPenar}
            showPenar={settings.showPenarDuringPlay !== false}
            keyCount={beatmap.keyCount}
            keyLabels={settings.bindings[beatmap.keyCount] || []}
            playfieldWidthPercent={isArgonSkin(settings) ? getArgonPlayfieldWidthPercent(beatmap.keyCount) : (settings.playfieldWidthPercent ?? 15)}
            isReplayMode={isReplayMode}
            isAutoplay={isAutoplay}
            progressBarRef={progressBarRef as React.Ref<HTMLDivElement>}
            densityBins={densityBins}
            timeLabelRef={timeLabelRef}
            timeLeftLabelRef={timeLeftLabelRef}
            leftHitErrorCanvasRef={leftHitErrorCanvasRef}
            rightHitErrorCanvasRef={rightHitErrorCanvasRef}
          />
        )}

        {!isReplayMode && !isAutoplay && unpauseCountdown > 0 && (
          <div className="absolute inset-0 z-45 flex items-center justify-center bg-black/45 select-none pointer-events-none animate-fade-in">
            <div className="relative flex items-center justify-center">
              <svg className="w-40 h-40 transform -rotate-90">
                <circle cx="80" cy="80" r="64" className="stroke-slate-800" strokeWidth="5" fill="transparent" />
                <circle
                  cx="80"
                  cy="80"
                  r="64"
                  stroke="#f59e0b"
                  className="stroke-amber-500 unpause-circle-animation"
                  strokeWidth="7"
                  fill="transparent"
                  strokeDasharray="402.12"
                  strokeLinecap="round"
                  style={{ filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.65))' }}
                />
              </svg>
              <div className="absolute font-sans font-[900] text-5xl text-white tracking-widest drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
                {unpauseCountdown}
              </div>
            </div>
          </div>
        )}

        {/* FPS readout moved to the global overlay (GlobalFpsOverlay), which
            renders on every screen including gameplay when enabled. The
            per-frame fpsLabelRef accounting above stays as a harmless no-op
            when no label is mounted. */}

        {/* REPLAY SCRUBBER (Only in Replay/Autoplay mode; live play uses ArgonSongProgress in ManiaHud) */}
        {!isPrePlay && (isReplayMode || isAutoplay) && (
          <div className="absolute left-0 right-0 bottom-0 flex flex-col justify-end z-35 pointer-events-none transition-all duration-300">
            <div className="w-full flex flex-col items-center px-4 md:px-8 py-4 pb-[max(1rem,calc(0.5rem+env(safe-area-inset-bottom,0px)))] bg-slate-950/95 border-t border-white/10 pointer-events-auto backdrop-blur-2xl shadow-[0_-15px_35px_rgba(0,0,0,0.95)] z-40">
              <div className="w-full max-w-5xl flex flex-col gap-2.5">
                   
                   {/* Slider track + Time stamp row */}
                   <div className="w-full flex items-center justify-between gap-4">
                      
                      {/* Play/Pause Button */}
                      <button
                         onClick={togglePause}
                         className="text-white hover:text-cyan-400 hover:bg-white/10 active:scale-95 transition-all bg-white/5 rounded-full cursor-pointer h-10 w-10 flex items-center justify-center shrink-0 border border-white/10"
                      >
                         {isPaused ? <Play className="w-5 h-5 fill-current ml-0.5" /> : <Pause className="w-5 h-5 fill-current" />}
                      </button>

                      <div className="flex-1 w-full relative group py-2">
                         <input 
                            ref={progressBarRef as React.Ref<HTMLInputElement>}
                            type="range"
                            min="0"
                            max={beatmap.duration * 1000}
                            step="1"
                            defaultValue={0}
                            onPointerDown={() => {
                                isScrubbingRef.current = true;
                                wasPlayingRef.current = isPlayingRef.current && !isPaused;
                                mainAudio.pause();
                                if (videoRef.current) {
                                    try { videoRef.current.pause(); } catch (e) {}
                                }
                            }}
                            onPointerUp={(e) => { 
                                isScrubbingRef.current = false; 
                                const newTime = Number((e.target as HTMLInputElement).value);
                                handleSeek(newTime);
                                if (wasPlayingRef.current) {
                                    void mainAudio.playAsync(beatmap.bpm, settings.audioOffset).then(() => {
                                      const now = mainAudio.getCurrentTimeMs();
                                      audioTimeRef.current = now;
                                      lastSongTimeRef.current = now;
                                      songTimeJumpRef.current = true;
                                      snapVideoToAudio(newTime, true);
                                    });
                                }
                            }}
                            onChange={(e) => {
                                const newTime = Number(e.target.value);
                                const totalMs = beatmap.duration * 1000;
                                const progressPercent = totalMs > 0 ? (newTime / totalMs) * 100 : 0;
                                e.target.style.background = `linear-gradient(to right, #06b6d4 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%)`;
                                
                                if (timeLabelRef.current) {
                                   timeLabelRef.current.innerText = `${formatMsToMinSec(newTime)} / ${formatMsToMinSec(totalMs)}`;
                                }
                                if (timeLeftLabelRef.current) {
                                  const remainMs = Math.max(0, totalMs - Math.max(0, newTime));
                                  timeLeftLabelRef.current.innerText = `-${formatMsToMinSec(remainMs)}`;
                                }
                                simulateGameToTime(newTime);
                                audioTimeRef.current = newTime;
                                lastSongTimeRef.current = newTime;
                                songTimeJumpRef.current = true;
                                missCursorRef.current = 0;
                                autoplayCursorRef.current = 0;
                                const now = performance.now();
                                if (now - lastVideoSeekTimeRef.current > 80) {
                                    snapVideoToAudio(newTime, false);
                                    lastVideoSeekTimeRef.current = now;
                                }
                            }}
                            className="w-full h-2 rounded-full appearance-none outline-none cursor-pointer group-hover:h-2.5 transition-all z-10 block bg-white/20"
                            style={{
                               background: `linear-gradient(to right, #06b6d4 0%, rgba(255,255,255,0.15) 0%)`,
                               WebkitAppearance: 'none',
                            }}
                         />
                         <style dangerouslySetInnerHTML={{__html: `
                            input[type=range]::-webkit-slider-thumb {
                              -webkit-appearance: none;
                              appearance: none;
                              width: 14px;
                              height: 14px;
                              border-radius: 50%;
                              background: #ffffff;
                              box-shadow: 0 0 10px rgba(6, 182, 212, 0.9), 0 0 4px rgba(255, 255, 255, 0.5);
                               border: 2px solid #06b6d4;
                               /* No cursor here: the thumb inherits the track cursor so the
                                  lazer-cursor none override applies to the thumb too. */
                               transition: transform 0.15s ease-in-out, background-color 0.1s;
                            }
                            input[type=range]:hover::-webkit-slider-thumb, 
                            input[type=range]:active::-webkit-slider-thumb {
                              transform: scale(1.4);
                              background: #06b6d4;
                              border-color: #ffffff;
                            }
                         `}} />
                      </div>

                      {/* Direct readable Time Stamp HUD */}
                      <span 
                         ref={timeLabelRef}
                         className="font-mono text-sm text-slate-300 font-bold shrink-0 min-w-[110px] text-right"
                      >
                         00:00 / 00:00
                      </span>

                      <div className="flex items-center gap-2.5 shrink-0 border-l border-white/10 pl-4 h-8">
                          <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">Speed</span>
                          <select 
                             onChange={(e) => {
                                 const spd = Number(e.target.value);
                                 mainAudio.setPlaybackRate(spd);
                                 if (videoRef.current) videoRef.current.playbackRate = spd;
                             }} 
                             defaultValue={mainAudio.playbackRate || 1} 
                             className="bg-white/10 hover:bg-white/15 text-white rounded-md px-2.5 py-1 outline-none font-mono text-xs border border-white/10 cursor-pointer transition-all font-semibold"
                          >
                            <option value={0.5}>0.5x</option>
                            <option value={0.75}>0.75x</option>
                            <option value={1}>1.0x</option>
                            <option value={1.25}>1.25x</option>
                            <option value={1.5}>1.5x</option>
                            <option value={2}>2.0x</option>
                          </select>
                      </div>

                   </div>
              </div>
            </div>
          </div>
        )}

        {isSkipVisible && !isPrePlay && !isFailed && !isPaused && (
          <button
            type="button"
            id="skip-intro-btn"
            onClick={performIntroSkip}
            aria-label="Skip intro"
            className="absolute right-4 sm:right-6 bottom-[max(4.5rem,calc(3.5rem+env(safe-area-inset-bottom,0px)))] z-30 flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/85 px-4 py-2 font-mono text-xs font-black uppercase tracking-widest text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:border-cyan-400/40 hover:bg-slate-800 hover:text-cyan-200 active:scale-95 cursor-pointer"
          >
            <span>Skip</span>
            <span className="text-[10px] leading-none opacity-70">{(((settings as unknown as Record<string, string>).bindSkipIntro || 'enter') === ' ' ? 'Space' : ((settings as unknown as Record<string, string>).bindSkipIntro || 'enter').toUpperCase())}</span>
            <span aria-hidden>▶</span>
          </button>
        )}

        {/* PLAY HIGHWAY HERO BOX */}
          <div
            className="flex-1 w-full flex justify-center relative overflow-hidden bg-[#050508]"
          >
          {/* STATIC BACKGROUND IMAGE LAYER (Layer -1, z-index: 5) */}
          {mediaUrls.bgUrl && (!mediaUrls.videoUrl || settings.disableVideo || isVideoError) && (
            <div 
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
              style={{
                backgroundImage: `radial-gradient(ellipse at center, rgba(10,10,13,0.30), rgba(5,5,8,0.95)), url("${sanitizeCssUrl(mediaUrls.bgUrl)}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                zIndex: 5,
              }}
            />
          )}

          {/* FALLBACK CHIP GRID LAYER (z-index: 4, used when video is playing or image is absent) */}
          {(!mediaUrls.bgUrl || (mediaUrls.videoUrl && !settings.disableVideo && !isVideoError)) && (
            <div 
              className="absolute inset-0 w-full h-full transition-opacity duration-1000 animate-fade-in"
              style={{
                backgroundImage: 'radial-gradient(ellipse at center, rgba(16,24,48,0.2) 0%, rgba(5,5,8,0.98) 100%), linear-gradient(0deg, rgba(255,255,255,0.01) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)',
                backgroundSize: 'cover, 40px 40px, 40px 40px',
                backgroundPosition: 'center',
                zIndex: 4,
              }}
            />
          )}

          {/* HARDWARE-ACCELERATED SYNCHRONIZED VIDEO LAYER (Layer 0, z-index: 10) */}
          {mediaUrls.videoUrl && !settings.disableVideo && !isVideoError && (
            <video
              ref={setVideoRef}
              key={mediaUrls.videoUrl}
              muted
              playsInline
              preload="auto"
              onError={() => {
                const mediaErr = videoRef.current?.error;
                const code = mediaErr?.code;
                const detail =
                  code === 4
                    ? 'unsupported container/codec or missing MIME type on blob'
                    : code === 3
                      ? 'decode failure'
                      : mediaErr?.message || `media error code ${code ?? '?'}`;
                console.warn('Video failed to render or decode:', detail, mediaUrls.videoUrl);
                setIsVideoError(true);
              }}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
              style={{ 
                opacity: settings.videoOpacity !== undefined ? settings.videoOpacity : 0.35,
                zIndex: 10
              }}
            >
              <source
                src={mediaUrls.videoUrl}
               type={getMimeTypeFromFilename((beatmap as SavedBeatmap).videoFilename || '') || 'video/mp4'}
              />
            </video>
          )}

          {/* REAL-TIME DYNAMIC BACKGROUND DIM OVERLAY LAYER (z-index: 15) */}
          <div 
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-150"
            style={{ 
              opacity: settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60,
              zIndex: 15
            }}
          />

          <div 
            ref={containerRef} 
            className={`h-full relative transition-all duration-205 z-20 playfield-chassis-container ${isCinema ? 'opacity-0 pointer-events-none' : ''}`} 
            style={{
              // Argon auto-sizes: 4K = 18% of screen width, one lane = 4.5%, linear per key count.
              width: `${isArgonSkin(settings) ? getArgonPlayfieldWidthPercent(beatmap.keyCount) : (settings.playfieldWidthPercent ?? 15)}%`,
              maxWidth: '100%'
            }}
          >


            {/* PIANO TILES ACTIVE TOUCH ZONE BOUNDARY INDICATOR (Invisible / Logical Only) */}

            <canvas ref={canvasRef} className="block w-full h-full cursor-none game-canvas-element touch-none select-none" />

            {rendererError && (
              <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none p-6">
                <div className="max-w-md rounded-xl border border-rose-400/40 bg-slate-950/90 px-5 py-4 text-center shadow-2xl">
                  <div className="font-mono text-xs font-black uppercase tracking-[0.25em] text-rose-300">Renderer error</div>
                  <div className="mt-2 font-mono text-xs text-slate-200 break-words">{rendererError}</div>
                  <div className="mt-2 font-mono text-[11px] text-slate-400">WebGL2 is required for the playfield. Try a browser with hardware acceleration enabled.</div>
                </div>
              </div>
            )}

            <span
              ref={breakLabelRef}
              className="absolute top-1/3 left-1/2 -translate-x-1/2 z-20 rounded-full border border-cyan-300/30 bg-slate-950/70 px-5 py-2 font-mono text-xs font-black uppercase tracking-[0.3em] text-cyan-200 shadow-lg transition-opacity duration-300 pointer-events-none"
              style={{ opacity: 0 }}
            >
              Break
            </span>

            {/* DYNAMIC HIGH-PERFORMANCE DOM COMBO & JUDGEMENT POPUPS */}
            <div 
              className="absolute inset-0 pointer-events-none flex flex-col items-center select-none z-10 font-sans"
              style={{
                opacity: settings.judgementOpacity ?? 1.0,
              }}
            >
              {/* Combo counter on its own layer, anchored at comboPositionY (separate from judgement text).
                  Ticks up and back down on every combo increase via remount key. */}
              {uiCombo > 0 && (
                <div
                  className="absolute inset-x-0 flex items-center justify-center transition-transform duration-150"
                  style={{
                    top: `${settings.comboPositionY ?? 30}%`,
                    transform: `translateY(-50%) scale(${settings.judgementSize ?? 0.5})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <div 
                    key={uiCombo}
                    className="text-center text-5xl font-[300] tracking-[0.35em] uppercase text-white tabular-nums drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] whitespace-nowrap animate-combo-tick"
                    style={{ 
                      textShadow: `0 0 15px rgba(255,255,255,0.6)`,
                      fontFamily: "'Nunito', system-ui, sans-serif",
                    }}
                  >
                    {/* Fixed-width digit slots so proportional glyphs can't shift the number as it grows */}
                    {String(uiCombo).split('').map((d, i) => (
                      <span key={i} className="inline-block w-[1ch] text-center">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Scale judgement anchored directly at judgementPositionY */}
              <div
                className="absolute inset-x-0 flex flex-col items-center justify-center transition-transform duration-150"
                style={{
                  top: `${settings.judgementPositionY ?? 50}%`,
                  transform: `translateY(-50%) scale(${settings.judgementSize ?? 0.5})`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Judgement popup */}
                {uiJudgement && (
                  <div 
                    key={`judg-${uiJudgement.time}`}
                    className="text-center text-5xl font-[300] tracking-[0.35em] uppercase drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] animate-judgement-pulse whitespace-nowrap"
                    style={{ 
                      color: uiJudgement.color,
                      textShadow: `0 0 15px currentColor`,
                      fontFamily: "'Nunito', system-ui, sans-serif",
                    }}
                  >
                    {uiJudgement.text}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* ARGON FAIL OVERLAY — same container as pause, without Continue */}
          <PauseOverlay
            mode="fail"
            isOpen={!isPrePlay && isFailed}
            onRetry={restartMap}
            onExit={handleExit}
            retryCount={retryCount}
            songProgressPercent={
              beatmap.duration && beatmap.duration > 0
                ? Math.min(100, Math.max(0, ((audioTimeRef.current || 0) / (beatmap.duration * 1000)) * 100))
                : 0
            }
            accuracyPercent={scoreStateRef.current.accuracy}
            beatmapTitle={beatmap.title}
            beatmapArtist={beatmap.artist}
            beatmapVersion={beatmap.difficulty}
            mods={settings.selectedMods}
          />

          {/* ARGON PAUSE OVERLAY */}
          <PauseOverlay
            mode="pause"
            isOpen={!isPrePlay && isPaused && unpauseCountdown === 0 && !isFailed}
            onResume={togglePause}
            onRetry={restartMap}
            onExit={handleExit}
            retryCount={retryCount}
            songProgressPercent={
              beatmap.duration && beatmap.duration > 0
                ? Math.min(100, Math.max(0, ((audioTimeRef.current || 0) / (beatmap.duration * 1000)) * 100))
                : 0
            }
            accuracyPercent={scoreStateRef.current.accuracy}
            beatmapTitle={beatmap.title}
            beatmapArtist={beatmap.artist}
            beatmapVersion={beatmap.difficulty}
            mods={settings.selectedMods}
          />
        </div>
      </div>
    </div>
  );
}
