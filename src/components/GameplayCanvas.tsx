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
  getHoldTailJudgement,
  getJudgementWindows,
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
  resolveJudgementForError,
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
import { getMimeTypeFromFilename, getVideoFormatLabel, isBrowserPlayableVideoFilename } from '../utils/assetLifecycle';
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
import metadata from '../../metadata.json';
import { SCROLL_SPEED_MAX, SCROLL_SPEED_MIN } from './settings/defaultSettings';
import { computePenar, computeLivePenar } from '../utils/penar';
import { calculateManiaDifficultyAttributes, calculateTimedManiaDifficultyAttributes, type TimedManiaDifficultyAttributes } from '../ruleset/mania/difficultyCalculator';

// HIGH PERFORMANCE INTEGRATED RENDERER IMPORTS
import { IPlayfieldRenderer, ColumnLayout } from '../render/types';
import { Canvas2DRenderer } from '../render/Canvas2DRenderer';
import { WebGL2PlayfieldRenderer } from '../render/WebGL2PlayfieldRenderer';
import { isArgonSkin } from '../render/argonSkin';
import { getLaneColors } from '../render/skinTheme';
import { calculateScrollSpeedFactor, computeScrollTravelTimeMs, updateColumnsLayout } from '../render/playfieldLayout';
import { getColumnStyles } from '../render/laneLayout';
import { getVisibleNotes } from '../render/noteVisibility';
import { createScrollModel, ScrollModel } from '../render/scrollVelocity';
import { computeSongDensityBins } from '../render/argonSkin';
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
  onTailHit?: (n: HitObject, judgement: JudgementType, errorMs: number) => void
) {
  notes.forEach((n) => {
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
        return;
      }
    }

    const usesTailTicks = n.holdRulesVersion === HOLD_TICK_RULES_VERSION;
    // 1. Head window expired: normal notes miss fully; holds only miss the head and stay salvageable for the tail
    if (!n.isHit && !n.isMissed && currentTime - n.time > missBound) {
      n.isMissed = true;
      if (n.type === 'hold') {
        onMiss(n, false);
        if (usesTailTicks) return;
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
      return;
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
  });
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

// All ManiaHud React state (score, accuracy, PENAR/PP, combo, HP, judgement,
// combo burst) flushes on this single cadence so the overlay reconciles at a
// stable 8Hz instead of per-hit or per-frame.
export const MANIA_HUD_UPDATE_INTERVAL_MS = 125;

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
          comboBurstTimeoutRef.current,
          scrollTimeoutRef.current,
          notificationTimeoutRef.current,
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
  const [showOffsetNotification, setShowOffsetNotification] = useState<boolean>(false);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showLockedScrollNotification, setShowLockedScrollNotification] = useState<boolean>(false);
  const lockedScrollNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monitor real-time latency offset keys + and - during gameplay, and intercept scroll speed hotkeys
  useEffect(() => {
    const handleOffsetKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Check for F3 / F4 or Ctrl+/- / Ctrl+= (scroll speed attempts)
      if (e.key === 'F3' || e.key === 'F4' || ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-'))) {
        e.preventDefault();
        const isLocked = (isPlayingRef.current || !isPrePlayRef.current) && (settingsRef.current.lockScrollSpeedDuringPlay !== false);
        if (isLocked) {
          setShowLockedScrollNotification(true);
          if (lockedScrollNotificationTimeoutRef.current) clearTimeout(lockedScrollNotificationTimeoutRef.current);
          lockedScrollNotificationTimeoutRef.current = setTimeout(() => {
            setShowLockedScrollNotification(false);
          }, 1800);
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          const nextOffset = settings.audioOffset + 5;
          if (updateSettings) {
            updateSettings({ audioOffset: nextOffset });
            setShowOffsetNotification(true);
            if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
            notificationTimeoutRef.current = setTimeout(() => {
              setShowOffsetNotification(false);
            }, 1800);
          }
        } else if (e.key === '-' || e.key === '_') {
          const nextOffset = settings.audioOffset - 5;
          if (updateSettings) {
            updateSettings({ audioOffset: nextOffset });
            setShowOffsetNotification(true);
            if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
            notificationTimeoutRef.current = setTimeout(() => {
              setShowOffsetNotification(false);
            }, 1800);
          }
        }
      }
    };

    window.addEventListener('keydown', handleOffsetKeyDown);
    return () => {
      window.removeEventListener('keydown', handleOffsetKeyDown);
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
      if (lockedScrollNotificationTimeoutRef.current) clearTimeout(lockedScrollNotificationTimeoutRef.current);
    };
  }, [settings.audioOffset, updateSettings]);
  
  // Game state refs (to avoid stale closures in high-frequency keyboard/requestAnimationFrame loops)
  const isPlayingRef = useRef<boolean>(true);
  const audioStartPendingRef = useRef<boolean>(false);
  const audioTimeRef = useRef<number>(0);
  const smoothOffsetRef = useRef<number>(settings.audioOffset);
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
  const [comboBurst, setComboBurst] = useState<number | null>(null);
  // Throttled HUD sync: applyJudgement only writes these refs (no setState in
  // the input path). The rAF loop flushes to React at 8Hz, so per-note
  // reconciliation never blocks judgement or audio.
  const hudPendingRef = useRef({ score: 0, combo: 0, hp: 100, accuracy: 100 });
  // Lazer-accurate PENAR difficulty, computed once per chart+rate at setup.
  const penarDifficultyRef = useRef<{ starRating: number; maxCombo: number } | null>(null);
  // Progressive (timed) difficulty for the live PENAR counter. lazer pairs
  // each judgement with the difficulty processed so far; using the
  // full-chart rating mid-map awards near-final PENAR after a few notes.
  const timedPenarRef = useRef<TimedManiaDifficultyAttributes[]>([]);
  const hudJudgementRef = useRef<{ text: string; color: string; time: number } | null>(null);
  const hudBurstRef = useRef<{ value: number; time: number } | null>(null);
  const lastHudFlushRef = useRef<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [unpauseCountdown, setUnpauseCountdown] = useState<number>(0);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isFailed, setIsFailed] = useState<boolean>(false);

  // Active inputs trace (boolean edge + refcount for multi-source keyboard/touch)
  const keysPressedRef = useRef<boolean[]>([]);
  const lanePressCountRef = useRef<number[]>([]);
  const activeColumnsRef = useRef<boolean[]>([]);
  const hasKeyPressedOnceRef = useRef<boolean[]>([]);
  const keyPressCountsRef = useRef<number[]>([]);

  const updateKeyCounterUi = (colIndex: number, isPressed: boolean, incrementCount: boolean = false) => {
    if (colIndex < 0 || colIndex >= beatmap.keyCount) return;
    if (incrementCount) {
      keyPressCountsRef.current[colIndex] = (keyPressCountsRef.current[colIndex] || 0) + 1;
      const countEl = document.getElementById(`argon-key-count-${colIndex}`);
      if (countEl) {
        countEl.innerText = keyPressCountsRef.current[colIndex].toString();
      }
    }
    const boxEl = document.getElementById(`argon-key-box-${colIndex}`);
    if (boxEl) {
      if (isPressed) {
        boxEl.classList.add('argon-key-active');
      } else {
        boxEl.classList.remove('argon-key-active');
      }
    }
  };

  const resetKeyCounterUi = () => {
    keyPressCountsRef.current = new Array(beatmap.keyCount).fill(0);
    for (let i = 0; i < beatmap.keyCount; i++) {
      const countEl = document.getElementById(`argon-key-count-${i}`);
      if (countEl) countEl.innerText = '0';
      const boxEl = document.getElementById(`argon-key-box-${i}`);
      if (boxEl) boxEl.classList.remove('argon-key-active');
    }
  };
  const progressBarRef = useRef<HTMLElement | HTMLInputElement | null>(null);
  const isScrubbingRef = useRef<boolean>(false);
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
  const isNoRelease = isNoReleaseMod(settings.selectedMods);
  const isConstantSpeed = isConstantSpeedMod(settings.selectedMods);
  const adaptiveSpeedAvgErrorRef = useRef<number>(0);
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiJudgementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboBurstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      executeTeardown(mainAudio, animationFrameRef.current, null, null, null, {
        timers: [
          finishTimeoutRef.current,
          uiJudgementTimeoutRef.current,
          comboBurstTimeoutRef.current,
          scrollTimeoutRef.current,
          notificationTimeoutRef.current,
        ].filter((timer): timer is ReturnType<typeof setTimeout> => timer !== null),
        video: videoRef.current,
        videoSync: syncControllerRef.current,
      });
    };
  }, []);
  
  // Dynamic visual visualizers
  const screenShakeRef = useRef<number>(0);
  const laneGlowRef = useRef<number[]>([]);
  
  // Judgement popup tracker
  const currentJudgementRef = useRef<{ text: string, color: string, time: number, size: number } | null>(null);

  // Hit error timing logs
  const hitErrorTicksRef = useRef<HitErrorTick[]>([]);
  const colsLayoutBufferRef = useRef<ColumnLayout[]>([]);
  const [loadingAudioProgress, setLoadingAudioProgress] = useState<number>(0);
  const [isAudioLoaded, setIsAudioLoaded] = useState<boolean>(false);
  // Hard renderer failure (e.g. WebGL2 unavailable with Canvas2D fallback
  // disabled). Surfaced as an overlay instead of a blank playfield.
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
  // A canvas element is bound to one context type for life; switching between
  // Canvas2D and WebGL2 requires a fresh canvas node (getContext would else
  // return null). Track the bound kind to know when to swap.
  const rendererKindRef = useRef<'canvas' | 'webgl' | null>(null);
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
      // Non-null local: the ref may be swapped to a fresh node below, while
      // canvasRef.current stays the source of truth for the rAF loop.
      let canvas: HTMLCanvasElement = canvasRef.current;

      // Renderer selection: WebGL2 is opt-in (settings.renderEngine) and MVP-
      // scoped to argon/default skins without Flashlight. Everything else
      // stays on Canvas2D. SV/judgement are untouched: both renderers consume
      // the same SV-projected PlayfieldFrame.
      const wantsWebGL = settings.renderEngine === 'webgl';
      const hasFlashlight = (settings.selectedMods || []).some(m => m.toUpperCase() === 'FL');
      const webglSupportedSkin = isArgonSkin({
        upsurfaceNoteMode: settings.upsurfaceNoteMode,
        scrollSpeed: settings.scrollSpeed,
        audioOffset: settings.audioOffset,
        visualOffset: settings.visualOffset,
        skinId: settings.skinId,
        squareRenderStyle: settings.squareRenderStyle,
        playfieldStyle: settings.playfieldStyle,
        noteSizeMultiplier: settings.noteSizeMultiplier,
        receptorSizeMultiplier: settings.receptorSizeMultiplier,
      });
      const useWebGL = wantsWebGL && webglSupportedSkin && !hasFlashlight;
      const desiredKind: 'canvas' | 'webgl' = useWebGL ? 'webgl' : 'canvas';

      // A canvas keeps its first context type forever. When the desired
      // renderer kind differs from the bound kind, swap in a fresh canvas
      // node with identical styling so getContext can succeed.
      if (rendererKindRef.current !== null && rendererKindRef.current !== desiredKind && canvas.parentNode) {
        const fresh = document.createElement('canvas');
        fresh.className = canvas.className;
        canvas.parentNode.replaceChild(fresh, canvas);
        canvasRef.current = fresh;
        canvas = fresh;
      }

      // Swap the canvas node for a fresh unbound one. Required when the
      // current node already carries the other context type (a canvas keeps
      // its first context for life; getContext would else return null).
      const swapFreshCanvas = () => {
        if (!canvas.parentNode) return;
        const fresh = document.createElement('canvas');
        fresh.className = canvas.className;
        canvas.parentNode.replaceChild(fresh, canvas);
        canvasRef.current = fresh;
        canvas = fresh;
      };

      const createFallback = async (): Promise<IPlayfieldRenderer | null> => {
        const fallback: IPlayfieldRenderer = new Canvas2DRenderer();
        await fallback.init(canvas, { settings, keyCount: beatmap.keyCount });
        if (!fallback.isReady()) {
          // The node is bound to a WebGL context (failed WebGL attempt);
          // retry once on a fresh node.
          swapFreshCanvas();
          await fallback.init(canvas, { settings, keyCount: beatmap.keyCount });
          if (!fallback.isReady()) throw new Error('Canvas2D fallback could not bind a 2D context');
        }
        rendererKindRef.current = 'canvas';
        return fallback;
      };

      try {
        setRendererError(null);
        let renderer: IPlayfieldRenderer | null = null;
        if (useWebGL) {
          try {
            const webgl = new WebGL2PlayfieldRenderer();
            await webgl.init(canvas, { settings, keyCount: beatmap.keyCount });
            renderer = webgl;
            rendererKindRef.current = 'webgl';
          } catch (webglErr) {
            console.warn('WebGL2 playfield init failed:', webglErr);
            if (settings.allowCanvasFallback !== false) {
              swapFreshCanvas();
              renderer = await createFallback();
            } else {
              throw webglErr;
            }
          }
        } else {
          if (wantsWebGL && !webglSupportedSkin) {
            console.info('WebGL2 MVP supports argon/default skins only; using Canvas2D fallback for this skin.');
          } else if (wantsWebGL && hasFlashlight) {
            console.info('WebGL2 MVP does not cover Flashlight; using Canvas2D fallback.');
          }
          renderer = await createFallback();
        }
        if (!renderer) return;

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
        const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
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
      // NOTE: rendererKindRef is intentionally preserved across re-runs so a
      // Canvas2D<->WebGL switch swaps in a fresh canvas node. It resets on
      // unmount via the effect below, when React drops the canvas anyway.
    };
  }, [settings.limitDprToOne, settings.renderEngine, settings.allowCanvasFallback, settings.skinId, settings.squareRenderStyle, settings.playfieldStyle, settings.selectedMods, beatmap.keyCount, isAudioLoaded]);

  useEffect(() => () => {
    rendererKindRef.current = null;
  }, []);

  // Lazer Mania EZ/HR scale hit-window difficulty rather than changing OD; DT/HT/NC/DC scale song-time hit-windows with clock rate.
  // Classic mod restores stable-style hit windows but keeps lazer speed compensation (totalMultiplier = speed / difficulty).
  const isClassic = isClassicMod(settings.selectedMods);
  const windowDifficultyMultiplier = getDifficultyMultiplier(settings.selectedMods);
  const windowSpeedMultiplier = getSpeedMultiplier(settings.selectedMods);
  const judgementWindows = getJudgementWindows(
    beatmap.overallDifficulty,
    windowDifficultyMultiplier,
    windowSpeedMultiplier,
    isClassic,
  );
  const marvelousJudg = judgementWindows.find(w => w.type === 'marvelous') || judgementWindows[0];
  const badJudg = judgementWindows.find(w => w.type === 'bad') || judgementWindows[judgementWindows.length - 2];
  const missJudg = judgementWindows.find(w => w.type === 'miss') || judgementWindows[judgementWindows.length - 1];

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
    // live PP reuses the progressive table on the 8Hz HUD tick so per-frame
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
    hudBurstRef.current = null;
    lastHudFlushRef.current = 0;
    setUiScore(0);
    setUiCombo(0);
    setUiHp(100);
    setUiAccuracy(100);
    setUiJudgement(null);
    setComboBurst(null);
    setIsPaused(false);
    setIsFailed(false);
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
      try {
        // Prefer shared unpacker (typed blobs + video fallback + package id cache key)
        await unpackBeatmap(mapWithPkg, false);
      } catch (mediaErr) {
        console.error('Failed to resolve beatmap media from package:', mediaErr);
      }

      if (!active) return;

      const cached = storageManager.lruMediaCache.get(beatmap.id);
      const resolved = {
        audioUrl: cached?.audioUrl || beatmap.audioUrl || '',
        videoUrl: cached?.videoUrl || beatmap.videoUrl || '',
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
      if (declaredVideo && !resolved.videoUrl) {
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
    smoothOffsetRef.current = settingsRef.current.audioOffset;
    laneGlowRef.current.fill(0);
    screenShakeRef.current = 0;
    hitErrorTicksRef.current = [];
    currentJudgementRef.current = null;

    const needsPlay = !isPlayingRef.current && !audioStartPendingRef.current;
    if (needsPlay) {
      audioStartPendingRef.current = true;
      void mainAudio.playAsync(beatmap.bpm, settingsRef.current.audioOffset).then(() => {
        audioStartPendingRef.current = false;
        isPlayingRef.current = true;
        audioTimeRef.current = mainAudio.getCurrentTimeMs();
        snapVideoToAudio(audioTimeRef.current, true);
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
        setUnpauseCountdown(prev => {
          if (prev === 1) {
            setIsPaused(false);
            isPausedRef.current = false;
            isPlayingRef.current = true;
            void mainAudio.playAsync(beatmap.bpm, settings.audioOffset).then(() => {
              audioTimeRef.current = mainAudio.getCurrentTimeMs();
              snapVideoToAudio(audioTimeRef.current, true);
            });
          }
          return prev - 1;
        });
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
      advanceHoldTailTicks(notesRef.current, inputTime - TICK_BOUNDARY_EPSILON_MS, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
      keysPressedRef.current[colIndex] = true;
      activeColumnsRef.current[colIndex] = true;
      laneGlowRef.current[colIndex] = 1.0;
      if (hasKeyPressedOnceRef.current) {
        hasKeyPressedOnceRef.current[colIndex] = true;
      }
      triggerHitEvent(colIndex, inputTime);
      advanceHoldTailTicks(notesRef.current, inputTime, keysPressedRef.current, note => applyJudgement(missJudg, note.column));

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
      advanceHoldTailTicks(notesRef.current, inputTime - TICK_BOUNDARY_EPSILON_MS, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
      keysPressedRef.current[colIndex] = false;
      activeColumnsRef.current[colIndex] = false;
      advanceHoldTailTicks(notesRef.current, inputTime, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
      
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
  const triggerHitEvent = (colIndex: number, explicitTime?: number) => {
    const playTime = typeof explicitTime === 'number' && Number.isFinite(explicitTime)
      ? explicitTime
      : audioTimeRef.current;

    // Version 3 Lazer hold rules
    if (holdRulesVersion === LAZER_HOLD_RULES_VERSION) {
      // 1. Check if an in-progress hold in this column is being re-pressed mid-body
      const activeHold = notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
          n.holdState && n.holdState.isHeadJudged && !n.holdState.isTailJudged
      );
      if (activeHold && activeHold.holdState && !activeHold.holdState.isHolding && activeHold.endTime !== undefined && playTime < activeHold.endTime) {
        onHoldKeyPress(activeHold.holdState, playTime, judgementWindows);
        return;
      }

      // 2. Find earliest unjudged note in column (or hold note whose head is unjudged)
      const note = notesRef.current.find(
        (n) => n.column === colIndex && (
          n.type === 'hold'
            ? (n.holdState ? !n.holdState.isHeadJudged : (!n.isHit && !n.isMissed))
            : (!n.isHit && !n.isMissed)
        )
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

          const resolvedJudg = judgementWindows.find(w => w.type === action.judgement) || marvelousJudg;
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
            id: Math.random().toString(36).substring(2, 9),
            error: hitError,
            timestamp: Date.now(),
            color: tickColor
          });

          if (action.judgement === 'marvelous' && !settingsRef.current.disableLaneShake) {
            screenShakeRef.current = 4;
          }
        } else if (action.kind === 'head_miss') {
          note.isMissed = true;
          note.hitTime = playTime;
          applyJudgement(missJudg, colIndex);
        }
        return;
      }

      const resolvedJudgement = resolveJudgementForError(diff, judgementWindows);
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
          id: Math.random().toString(36).substring(2, 9),
          error: hitError,
          timestamp: Date.now(),
          color: tickColor
        });

        if (resolvedJudgement.type === 'marvelous' && !settingsRef.current.disableLaneShake) {
          screenShakeRef.current = 4;
        }
      } else {
        note.isMissed = true;
        applyJudgement(resolvedJudgement, colIndex);
      }
      return;
    }

    const earlyReleasedHold = notesRef.current.find(
      (n) => n.column === colIndex && n.type === 'hold' && n.holdRulesVersion === HOLD_TICK_RULES_VERSION &&
        n.isHit && !n.isReleased && !n.isHoldFailed && n.earlyReleaseTime !== undefined,
    );
    if (earlyReleasedHold) {
      if (earlyReleasedHold.endTime !== undefined && playTime >= earlyReleasedHold.endTime - missJudg.windowMs) {
        markHoldReleaseZonePressed(earlyReleasedHold, playTime);
      } else {
        markHoldTailResumed(earlyReleasedHold, playTime);
      }
      return;
    }
    
    // Check if we are currently in a grace period for a hold note in this column
    const activeHoldAndReleased = notesRef.current.find(
      (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.releaseGraceUntil !== undefined
    );
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
    const note = notesRef.current.find(
      (n) =>
        n.column === colIndex &&
        (
          (!n.isHit && !n.isMissed) ||
          (n.type === 'hold' && n.isMissed && !n.isHit && !n.isReleased && !n.isHoldFailed)
        )
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
    const resolvedJudgement = resolveJudgementForError(diff, judgementWindows);

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
        id: Math.random().toString(36).substring(2, 9),
        error: hitError,
        timestamp: Date.now(),
        color: tickColor
      });
      
      // Screen shake for excellent accuracy
      if (resolvedJudgement.type === 'marvelous' && !settingsRef.current.disableLaneShake) {
        screenShakeRef.current = 4;
      }
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
      const holdNote = notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.holdRulesVersion === LAZER_HOLD_RULES_VERSION &&
          n.holdState && n.holdState.isHeadJudged && !n.holdState.isTailJudged && n.holdState.isHolding
      );

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
        // Route through the 8Hz HUD queue; force the next rAF tick to flush
        // so the combo break surfaces without per-event reconciliation.
        // (Pending HP is synced below after the health judgement.)
        lastHudFlushRef.current = 0;
        if ((settings.selectedMods || []).includes('MU') && isPlayingRef.current && !isPausedRef.current) {
          mainAudio.setVolumes(settings.musicVolume, settings.hitsoundVolume, settings.masterVolume);
        }
        if (!settingsRef.current.disableLaneShake) {
          screenShakeRef.current = 4;
        }
        const justFailed = applyHealthJudgement(
          healthStateRef.current,
          'miss',
          beatmap.hpDrainRate,
          'body_break',
        );
        scoreStateRef.current.hp = healthToDisplayPercent(healthStateRef.current.health);
        // Route through the 8Hz HUD queue; force the next rAF tick to flush
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
        }
        return;
      }

      if (action.kind === 'tail_hit') {
        holdNote.isReleased = true;
        holdNote.releaseTime = playTime;
        holdNote.isReleaseHit = true;
        holdNote.isReleaseMissed = false;

        const tailJudg = judgementWindows.find(w => w.type === action.judgement) || missJudg;
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
          id: Math.random().toString(36).substring(2, 9),
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
        if (!settingsRef.current.disableLaneShake) {
          screenShakeRef.current = 6;
        }
        return;
      }

      return;
    }
    
    // Find active hold note currently marked "Hit" but not yet "Released" or "HoldFailed"
    const holdNote = notesRef.current.find((n) => n.column === colIndex && n.type === 'hold' && !n.isReleased &&
      (n.holdRulesVersion === HOLD_TICK_RULES_VERSION
        ? (n.isHeadHit || n.tailEngagedTime !== undefined || n.releaseZoneArmedTime !== undefined)
        : (n.isHit && !n.isHoldFailed)));
    
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
      const releaseJudgement = getHoldTailJudgement(endDiff, judgementWindows);
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
    const tailJudgement = getHoldTailJudgement(endDiff, judgementWindows);
    applyJudgement(tailJudgement, colIndex, 'hold_tail');
    if (tailJudgement.type !== 'miss') {
      recordHitErrorSample(endDiff);
      mainAudio.playBeatmapHitsound(holdNote.hitSound, holdNote.hitSample?.filename);
    } else {
      holdNote.isHoldFailed = true;
      if (!settingsRef.current.disableLaneShake) {
        screenShakeRef.current = 6;
      }
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
      if (state.combo >= 50 && state.combo % 50 === 0 && !settingsRef.current.disableComboBurst) {
        hudBurstRef.current = { value: state.combo, time: Date.now() };
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

    if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
      maxComboPortionRef.current = extendMaxComboPortion(
        maxComboPortionRef.current,
        totalJudgementsRef.current,
        judgedCount,
      );
      totalJudgementsRef.current = judgedCount;
    }
    currentComboPortionRef.current += getComboScoreChange(judg.type, state.combo);
    const modMultiplier = computeModMultiplier(settings.selectedMods);
    state.score = computeTotalScore({
      currentComboPortion: currentComboPortionRef.current,
      maxComboPortion: maxComboPortionRef.current,
      accuracyPercent: state.accuracy,
      judgedCount,
      totalJudgements: totalJudgementsRef.current,
      modMultiplier,
    });

    // Live PENAR is refreshed at 8Hz by the HUD flush loop reusing the
    // cached chart difficulty; per-judgement PP would waste frame budget.

    // Muted (MU) mod: fade audio as combo builds, restore on break/miss
    if ((settings.selectedMods || []).includes('MU') && isPlayingRef.current && !isPausedRef.current) {
      const muteFactor = Math.max(0, 1 - state.combo / 30);
      mainAudio.setVolumes(settings.musicVolume * muteFactor, settings.hitsoundVolume, settings.masterVolume);
    }

    // Update canvas visual trackers (no React setState here — the rAF loop
    // flushes hudPendingRef at 8Hz so input never waits on reconciliation).
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
      const dpr = currentSettings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
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

    // Track notes elapsed to trigger automatic Miss judgments
    const checkAutonomousMisses = (currentTime: number) => {
      advanceHoldTailTicks(notesRef.current, currentTime, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
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
          const tailJudg = judgementWindows.find(w => w.type === judgType) || missJudg;
          applyJudgement(tailJudg, n.column, 'hold_tail');
          recordHitErrorSample(errorMs);
          mainAudio.playBeatmapHitsound(n.hitSound, n.hitSample?.filename);
        }
      );
    };

    // Canvas Draw Thread
    const render = () => {
      const currentSettings = settingsRef.current;
      const activeCanvas = canvasRef.current;
      if (!activeCanvas) return;

      const dpr = currentSettings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
      const cached = canvasCssSizeRef.current;
      const width = cached.width || activeCanvas.clientWidth || activeCanvas.width / dpr;
      const height = cached.height || activeCanvas.clientHeight || activeCanvas.height / dpr;

      // Smoothly slide the rendering offset towards the actual audioOffset to prevent note visual teleportations mid-flight:
      smoothOffsetRef.current += (currentSettings.audioOffset - smoothOffsetRef.current) * 0.08;

      let songTime;
      if (isScrubbingRef.current) {
        songTime = audioTimeRef.current;
      } else {
        const offsetDiff = currentSettings.audioOffset - smoothOffsetRef.current;
        const rawSongTime = mainAudio.getCurrentTimeMs();
        songTime = rawSongTime + offsetDiff;
        audioTimeRef.current = songTime;
      }

      // Dynamic playback rate updates for WU (Wind Up), WD (Wind Down), and AS (Adaptive Speed)
      const activeMods = settingsRef.current.selectedMods || [];
      const isWU = activeMods.includes('WU');
      const isWD = activeMods.includes('WD');
      const isAS = activeMods.includes('AS');

      if ((isWU || isWD) && isPlayingRef.current && !isPausedRef.current) {
        const totalDuration = Math.max(1, (beatmap.duration || 10) * 1000);
        const progress = Math.max(0, Math.min(1, (songTime - firstNoteTime) / totalDuration));
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

      if (breakLabelRef.current) {
        const inBreak = (beatmap.breaks || []).some(
          section => songTime >= section.startTime && songTime < section.endTime
        );
        breakLabelRef.current.style.opacity = inBreak ? '1' : '0';
      }

      if (introSkippable && !hasSkippedIntroRef.current && !isPrePlayRef.current) {
        const shouldShow = !isPausedRef.current && !scoreStateRef.current.failed && isSkipWindowActive(songTime, firstNoteTime, false, INTRO_SKIP_THRESHOLD_MS);
        if (shouldShow !== skipVisibleRef.current) {
          skipVisibleRef.current = shouldShow;
          setIsSkipVisible(shouldShow);
        }
      } else if (skipVisibleRef.current) {
        skipVisibleRef.current = false;
        setIsSkipVisible(false);
      }

      // Update progress bar
      if (progressBarRef.current) {
        const totalDurationMs = beatmap.duration * 1000;
        const progressPercent = totalDurationMs > 0 ? Math.min(100, Math.max(0, (songTime / totalDurationMs) * 100)) : 0;
        
        if (progressBarRef.current.tagName === 'INPUT') { // It's the replay scrubber
            const inputEl = progressBarRef.current as HTMLInputElement;
            if (!isScrubbingRef.current) {
                inputEl.value = (Math.max(0, songTime)).toString();
                inputEl.style.background = `linear-gradient(to right, #06b6d4 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%)`;
            }
        } else {
            progressBarRef.current.style.width = `${progressPercent}%`;
        }
      }

      if (timeLabelRef.current && !isScrubbingRef.current) {
        const totalMs = beatmap.duration * 1000;
        timeLabelRef.current.innerText = `${formatMsToMinSec(songTime)} / ${formatMsToMinSec(totalMs)}`;
      }
      if (timeLeftLabelRef.current && !isScrubbingRef.current) {
        if (isReplayMode || (!isAutoplay && !isPrePlay)) {
          const totalMs = beatmap.duration * 1000;
          const remainMs = Math.max(0, totalMs - Math.max(0, songTime));
          timeLeftLabelRef.current.innerText = `-${formatMsToMinSec(remainMs)}`;
          timeLeftLabelRef.current.style.display = '';
        } else if (timeLeftLabelRef.current.style.display !== 'none') {
          timeLeftLabelRef.current.style.display = 'none';
        }
      }

      // FPS readout (updated twice per second to avoid layout churn)
      if (fpsLabelRef.current) {
        const fpsNow = performance.now();
        if (fpsLastSampleRef.current === 0) {
          fpsLastSampleRef.current = fpsNow;
          fpsFramesRef.current = 0;
        }
        fpsFramesRef.current++;
        const elapsed = fpsNow - fpsLastSampleRef.current;
        if (elapsed >= 500) {
          fpsLabelRef.current.innerText = `${Math.round((fpsFramesRef.current * 1000) / elapsed)} FPS`;
          fpsFramesRef.current = 0;
          fpsLastSampleRef.current = fpsNow;
        }
      }

      // Throttled 8Hz HUD flush: moves all ManiaHud React reconciliation
      // (score, accuracy, PENAR/PP, combo, HP) off the input path.
      // Judgement popups expire after 600ms and combo bursts after 900ms
      // without per-hit setTimeout churn.
      {
        const nowMs = performance.now();
        if (nowMs - lastHudFlushRef.current >= MANIA_HUD_UPDATE_INTERVAL_MS) {
          lastHudFlushRef.current = nowMs;
          const pending = hudPendingRef.current;
          setUiScore((prev) => (prev === pending.score ? prev : pending.score));
          setUiCombo((prev) => (prev === pending.combo ? prev : pending.combo));
          setUiHp((prev) => (prev === pending.hp ? prev : pending.hp));
          setUiAccuracy((prev) => (prev === pending.accuracy ? prev : pending.accuracy));
          // Live PENAR refresh at 8Hz: same PP formula, but evaluated with
          // the progressive difficulty at the current progress time, exactly
          // like lazer's live PP counter. The HUD counter below renders it
          // on the same flush.
          const live = scoreStateRef.current;
          const difficulty = penarDifficultyRef.current;
          live.penar = computeLivePenar({
            timedAttributes: timedPenarRef.current,
            progressTime: songTime,
            fallbackStarRating: difficulty ? difficulty.starRating : null,
            marvelousCount: live.marvelousCount,
            perfectCount: live.perfectCount,
            greatCount: live.greatCount,
            goodCount: live.goodCount,
            badCount: live.badCount,
            missCount: live.missCount,
            maxCombo: live.maxCombo,
            mods: settingsRef.current.selectedMods || [],
          });
          const flushedPenar = scoreStateRef.current.penar ?? null;
          setUiPenar((prev) => (prev === flushedPenar ? prev : flushedPenar));
          const wallNow = Date.now();
          const j = hudJudgementRef.current;
          if (j && wallNow - j.time < 600) {
            setUiJudgement((prev) => (prev && prev.time === j.time ? prev : j));
          } else {
            if (j) hudJudgementRef.current = null;
            setUiJudgement((prev) => (prev === null ? prev : null));
          }
          const b = hudBurstRef.current;
          if (b && wallNow - b.time < 900) {
            setComboBurst((prev) => (prev === b.value ? prev : b.value));
          } else {
            if (b) hudBurstRef.current = null;
            setComboBurst((prev) => (prev === null ? prev : null));
          }
        }
      }

      // Replay simulation playback
      if (replayData && replayData.length > 0 && isPlayingRef.current && !isPaused) {
        consumeReplayFrames(replayData, replayCursorRef.current, songTime, frame => {
          audioTimeRef.current = frame.time;
          if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
            advanceHoldTailTicks(notesRef.current, frame.time - TICK_BOUNDARY_EPSILON_MS, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
          }
          checkNotesAutonomousMisses(
            notesRef.current,
            frame.time,
            missJudg.windowMs,
            (note) => applyJudgement(missJudg, note.column),
            keysPressedRef.current
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
          if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
            advanceHoldTailTicks(notesRef.current, frame.time, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
          }
        });
        audioTimeRef.current = songTime;
        checkNotesAutonomousMisses(
          notesRef.current,
          songTime,
          missJudg.windowMs,
          (note) => applyJudgement(missJudg, note.column),
          keysPressedRef.current
        );
        if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
          advanceHoldTailTicks(notesRef.current, songTime, keysPressedRef.current, note => applyJudgement(missJudg, note.column));
        }
      }

      if (isPlayingRef.current && !isPaused && unpauseCountdown === 0) {
        if (isAutoplay) {
          const dueEvents: { type: 'head' | 'tail'; note: HitObject; eventTime: number }[] = [];

          for (const note of notesRef.current) {
            if (!note.isHit && !note.isMissed && note.time <= songTime) {
              dueEvents.push({ type: 'head', note, eventTime: note.time });
            }
            if (
              note.type === 'hold' &&
              !note.isReleased &&
              note.endTime !== undefined &&
              note.endTime <= songTime &&
              (note.holdRulesVersion === LAZER_HOLD_RULES_VERSION || note.holdRulesVersion === HOLD_TICK_RULES_VERSION || (note.isHit && !note.isHoldFailed))
            ) {
              dueEvents.push({ type: 'tail', note, eventTime: note.endTime });
            }
          }

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
                  id: Math.random().toString(36).substring(2, 9),
                  error: 0,
                  timestamp: Date.now(),
                  color: '#3b82f6'
                });

                updateKeyCounterUi(n.column, true, true);
                if (n.type !== 'hold') {
                  setTimeout(() => updateKeyCounterUi(n.column, false, false), 60);
                }
                mainAudio.playBeatmapHitsound(n.hitSound, n.hitSample?.filename);
                laneGlowRef.current[n.column] = 1.0;
                if (!settingsRef.current.disableLaneShake) {
                  screenShakeRef.current = 4;
                }
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

                applyJudgement(marvelousJudg, n.column);
                recordHitErrorSample(0);
              }
            }
          }

          if (holdRulesVersion === HOLD_TICK_RULES_VERSION) {
            advanceHoldTailTicks(
              notesRef.current,
              songTime,
              new Array(beatmap.keyCount).fill(true),
              note => applyJudgement(missJudg, note.column),
            );
          }

          // Maintain active receptor/lane state for holds, including chords
          for (let col = 0; col < beatmap.keyCount; col++) {
            const isHolding = notesRef.current.some(
              n => n.column === col && n.type === 'hold' &&
                (n.holdState ? (n.holdState.isHolding && !n.holdState.isTailJudged) : (n.isHit && !n.isReleased && !n.isHoldFailed))
            );
            keysPressedRef.current[col] = isHolding;
            activeColumnsRef.current[col] = isHolding;
            if (isHolding) {
              laneGlowRef.current[col] = Math.max(laneGlowRef.current[col] || 0, 0.8);
            }
          }
        }

        if (!isReplayMode) checkAutonomousMisses(songTime);
        
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

        // Cull and fetch visible notes
        const visibleNotes = getVisibleNotes(
          notesRef.current,
          renderSettings,
          height,
          receptorY,
          visualTime,
          speedFactor,
          scrollModelRef.current,
          scoreStateRef.current.combo,
          beatmap.breaks || []
        );

        // Decay lane glows
        for (let i = 0; i < keyCount; i++) {
          if (laneGlowRef.current[i] > 0) {
            laneGlowRef.current[i] *= 0.88;
          }
        }

        // Build running hit error average
        let hitErrorAvgMs: number | null = null;
        const avgErrorValues = hitErrorTicksRef.current.slice(-30).map(t => t.error);
        if (avgErrorValues.length > 0) {
          hitErrorAvgMs = avgErrorValues.reduce((s, v) => s + v, 0) / avgErrorValues.length;
        }

        // Filter expired hit ticks (> 2000ms old)
        const currentTimeScale = Date.now();
        hitErrorTicksRef.current = hitErrorTicksRef.current.filter(t => currentTimeScale - t.timestamp < 2000);

        // Map key bindings for labels
        const layoutKeys = currentSettings.bindings[keyCount] || [];
        const keyLabelsMapped = layoutKeys.map((key, i) => {
          const hasPressed = hasKeyPressedOnceRef.current && hasKeyPressedOnceRef.current[i];
          return !hasPressed ? key : '';
        });

        // Execute drawing call (playfield-only; HUD meters are drawn below
        // from the same tick data via the ManiaHud overlay helper)
        activeRendererRef.current.render({
          width,
          height,
          timeMs: visualTime,
          receptorY,
          columns: colsLayout,
          notes: visibleNotes,
          shake: currentSettings.disableLaneShake ? 0 : screenShakeRef.current,
          settingsSlice: renderSettings,
          showKeyLabels: true,
          keyLabels: keyLabelsMapped,
          isFocusMode: isFocusModeRef.current,
          isMobile: false,
          combo: scoreStateRef.current.combo,
          breaks: beatmap.breaks || []
        });

        // Decay screen shake
        if (screenShakeRef.current > 0) {
          screenShakeRef.current *= 0.9;
          if (screenShakeRef.current < 0.1) screenShakeRef.current = 0;
        }

        // Draw Argon dual vertical hit-error meters flanking the stage
        if (leftHitErrorCanvasRef.current || rightHitErrorCanvasRef.current) {
          drawVerticalHitErrorMeter(leftHitErrorCanvasRef.current, hitErrorTicksRef.current, hitErrorAvgMs, 150);
          drawVerticalHitErrorMeter(rightHitErrorCanvasRef.current, hitErrorTicksRef.current, hitErrorAvgMs, 150);
        }
      }

      // Check if song completed naturally or run loops
      const songDurationMs = beatmap.duration * 1000;
      if (songTime >= songDurationMs && !scoreStateRef.current.completed && isPlayingRef.current) {
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
          audioTimeRef.current = mainAudio.getCurrentTimeMs();
          snapVideoToAudio(audioTimeRef.current, true);
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

    // Keep live PENAR consistent after scrub resets; the 8Hz flush loop
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

      // Live PENAR for replay simulation also flows through the 8Hz HUD
      // flush loop; see the live applyJudgement path above.
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
            const resolvedJudg = judgementWindows.find(w => w.type === action.judgement) || marvelousJudg;
            simApplyJudgement(resolvedJudg, colIndex, 'hold_head');
            recordHitErrorSample(action.errorMs);
          } else if (action.kind === 'head_miss') {
            note.isMissed = true;
            note.hitTime = frameTime;
            simApplyJudgement(missJudg, colIndex, 'hold_head');
          }
          return;
        }

        const resolvedJudgement = resolveJudgementForError(diff, judgementWindows);
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
      const resolvedJudgement = resolveJudgementForError(diff, judgementWindows);
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
          const tailJudg = judgementWindows.find(w => w.type === action.judgement) || missJudg;
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
        const releaseJudgement = getHoldTailJudgement(endDiff, judgementWindows);
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
      const tailJudgement = getHoldTailJudgement(endDiff, judgementWindows);
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

    for (let col = 0; col < beatmap.keyCount; col++) {
      const isHolding = notesRef.current.some(
        note => note.column === col && note.type === 'hold' && note.isHit && !note.isReleased && !note.isHoldFailed,
      );
      keysPressedRef.current[col] = isHolding;
      activeColumnsRef.current[col] = isHolding;
    }

    audioTimeRef.current = boundedTime;
    isPlayingRef.current = wasPlayingRef.current;
    hudPendingRef.current.score = scoreStateRef.current.score;
    hudPendingRef.current.combo = scoreStateRef.current.combo;
    hudPendingRef.current.hp = scoreStateRef.current.hp;
    hudPendingRef.current.accuracy = scoreStateRef.current.accuracy;
    lastHudFlushRef.current = 0;
    setUiScore(scoreStateRef.current.score);
    setUiCombo(scoreStateRef.current.combo);
    setUiHp(scoreStateRef.current.hp);
    setUiAccuracy(scoreStateRef.current.accuracy);
  };

  const handleSeek = (newTimeMs: number) => {
    mainAudio.seekGameplayTimeMs(newTimeMs);
    audioTimeRef.current = newTimeMs;
    smoothOffsetRef.current = settings.audioOffset;
    snapVideoToAudio(newTimeMs, false);
    
    // reset visuals
    hitErrorTicksRef.current = [];
    currentJudgementRef.current = null;
    laneGlowRef.current.fill(0);
    screenShakeRef.current = 0;
    
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
    setRetryCount(prev => prev + 1);
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
    for (const timer of [
      uiJudgementTimeoutRef.current,
      comboBurstTimeoutRef.current,
      scrollTimeoutRef.current,
    ]) {
      if (timer !== null) clearTimeout(timer);
    }
    uiJudgementTimeoutRef.current = null;
    comboBurstTimeoutRef.current = null;
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
    audioStartPendingRef.current = true;
    void mainAudio.playAsync(beatmap.bpm, settings.audioOffset, startDelayMs).then(() => {
      audioStartPendingRef.current = false;
      isPlayingRef.current = true;
      audioTimeRef.current = mainAudio.getCurrentTimeMs();
      snapVideoToAudio(audioTimeRef.current, true);
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
            <div className="absolute -bottom-6 left-2 font-bold pointer-events-none text-white/30">{metadata.version}</div>
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

                  {/* Playfield Width */}
                  {!isReplayMode && (
                    <div className="space-y-1.5">
                      {(() => {
                        const widthMin = PLAYFIELD_WIDTH_MIN;
                        const widthMax = PLAYFIELD_WIDTH_MAX;
                        const width = Math.max(widthMin, Math.min(widthMax, settings.playfieldWidthPercent ?? 40));
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
        {/* FLOATING REAL-TIME CALIBRATION HUD TOAST */}
        {showOffsetNotification && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-25 bg-slate-950/95 border border-cyan-500/65 shadow-[0_0_20px_rgba(34,211,238,0.3)] text-cyan-400 font-mono text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-full flex items-center gap-3 transition-all">
            <span className="animate-pulse">● LATENCY ADJUSTED</span>
            <span className="text-white bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-md">
              {settings.audioOffset > 0 ? `+${settings.audioOffset}` : settings.audioOffset}ms
            </span>
          </div>
        )}

        {showLockedScrollNotification && (
          <div id="scroll-locked-toast" className="absolute top-20 left-1/2 -translate-x-1/2 z-25 bg-slate-950/95 border border-amber-500/65 shadow-[0_0_20px_rgba(245,158,11,0.3)] text-amber-400 font-mono text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-full flex items-center gap-3 transition-all">
            <span className="animate-pulse">🔒 SCROLL SPEED LOCKED MID-MAP</span>
            <span className="text-white bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-md">
              {lockedScrollSpeedRef.current}x (~{computeScrollTravelTimeMs(lockedScrollSpeedRef.current)}ms)
            </span>
          </div>
        )}

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
            combo={uiCombo}
            keyCount={beatmap.keyCount}
            keyLabels={settings.bindings[beatmap.keyCount] || []}
            playfieldWidthPercent={settings.playfieldWidthPercent ?? 40}
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
              width: `${settings.playfieldWidthPercent ?? 40}%`, 
              minWidth: '280px',
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
                  <div className="mt-2 font-mono text-[11px] text-slate-400">Switch Graphics → Playfield renderer back to Canvas2D, or enable the Canvas2D fallback.</div>
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
              {/* Scale combo & judgement anchored directly at judgementPositionY */}
              <div
                className="absolute inset-x-0 flex flex-col items-center justify-center transition-transform duration-150"
                style={{
                  top: `${settings.judgementPositionY ?? 50}%`,
                  transform: `translateY(-50%) scale(${settings.judgementSize ?? 1.0})`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Combo numbers & burst (Legacy skins only; Argon places combo bottom-left) */}
                {settings.skinId !== 'argon' && uiCombo > 4 && (
                  <div
                    className="absolute bottom-full pb-2 flex flex-col items-center justify-end gap-1 whitespace-nowrap"
                  >
                    {comboBurst !== null && (
                      <div key={`burst-${comboBurst}`} className="rounded-full border-2 border-amber-300/70 bg-amber-400/20 px-8 py-3 text-2xl font-black uppercase tracking-[0.35em] text-amber-200 shadow-[0_0_35px_rgba(251,191,36,0.65)] animate-combo-pop">
                        {comboBurst}x
                      </div>
                    )}
                    <div key={`combo-${uiCombo}`} className="flex flex-col items-center justify-center animate-combo-pop">
                      <span className="text-6xl font-[900] tracking-tighter text-slate-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
                        {uiCombo}
                      </span>
                      <span className="text-[10px] font-black tracking-[0.25em] text-cyan-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] uppercase mt-1">
                        COMBO
                      </span>
                    </div>
                  </div>
                )}

                {/* Judgement popup */}
                {uiJudgement && (
                  <div 
                    key={`judg-${uiJudgement.time}`}
                    className="text-center text-5xl font-[900] tracking-widest uppercase drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] animate-judgement-pulse whitespace-nowrap"
                    style={{ 
                      color: uiJudgement.color,
                      textShadow: `0 0 15px currentColor`,
                      fontFamily: "'Orbitron', system-ui, sans-serif",
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
