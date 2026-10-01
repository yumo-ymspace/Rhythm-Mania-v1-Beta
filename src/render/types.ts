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

import { GameSettings } from '../types';

export interface ColumnLayout {
  x: number;
  width: number;
  color: string;
  pressed: boolean;
  glow: number;
}

export interface VisibleNote {
  id: string;
  column: number;
  type: 'normal' | 'hold';
  time: number;
  endTime?: number;
  isHit: boolean;
  isReleased: boolean;
  isMissed: boolean;
  isHoldFailed: boolean;
  releaseTime?: number;
  releaseGraceUntil?: number;
  isReleaseMissed?: boolean;
  isReleaseHit?: boolean;
  isHolding?: boolean;
  isEndPassed?: boolean;
  earlyReleaseTime?: number;
  tailResumedTime?: number;
  releaseZoneArmedTime?: number;
  holdRulesVersion?: 1 | 2 | 3;
  tailSegments?: Array<{ startY: number; endY: number }>;
  missedTailSegments?: Array<{ startY: number; endY: number }>;
  endpointTailSegment?: { startY: number; endY: number };
  y: number;
  bodyStartY?: number;
  hitSegmentStartY?: number;
  hitSegmentEndY?: number;
  endY?: number;
  opacity: number;
  endOpacity?: number;
  styleKey: string;
}

/** A culled, scroll-projected measure guide line for the current frame. */
export interface BarLineVisual {
  y: number;
  time: number;
  major: boolean;
}

export interface HitErrorTick {
  id: string;
  error: number;
  timestamp: number;
  color: string;
}

export interface PlayfieldVisualSettings {
  upsurfaceNoteMode: boolean;
  scrollSpeed: number;
  audioOffset: number;
  visualOffset: number;
  skinId?: string;
  customSkinColors?: string[];
  squareRenderStyle?: 'rhythmplus' | 'rhythmplus-dynamic';
  receptorColorsByKeyCount?: Record<number, string[]>;
  /** @deprecated Locked at 1.0 — renderers ignore this and use 100%. */
  noteOpacity?: number;
  /** @deprecated Locked at 1.0 — renderers ignore this and use 100%. */
  receptorOpacity?: number;
  /** @deprecated Locked at 1.0 — renderers ignore this and use 100%. */
  noteSizeMultiplier?: number;
  /** @deprecated Locked at 1.0 — renderers ignore this and use 100%. */
  receptorSizeMultiplier?: number;
  judgementPositionY?: number;
  laneSeparatorOpacity?: number;
  selectedMods?: string[];
  backgroundDim?: number;
  enableMapSV?: boolean;
  playfieldWidthPercent?: number;
  showBarLines?: boolean;
}

export interface PlayfieldFrame {
  width: number;
  height: number;
  timeMs: number;
  receptorY: number;
  columns: ColumnLayout[];
  notes: VisibleNote[];
  // NOTE: playfield frames carry no HUD state. Hit-error meters are drawn by
  // the ManiaHud overlay from its own tick data, never from this frame.
  settingsSlice: PlayfieldVisualSettings;
  showKeyLabels: boolean;
  keyLabels: string[];
  isFocusMode: boolean;
  // Legacy mobile flag. Desktop UI is served as-is to all viewports;
  // the renderer ignores this and always uses the desktop playfield.
  isMobile?: boolean;
  combo?: number;
  breaks?: Array<{ startTime: number; endTime: number }>;
  /** Purely visual measure guide lines (osu!lazer mania parity). */
  barLines?: BarLineVisual[];
}

export interface ResolvedSkin {
  colors: {
    blue: string;
    white: string;
    accent: string;
    cyan: string;
  };
  customHoldColor: string;
}

export interface InitOpts {
  settings: GameSettings;
  keyCount: number;
}

export interface IPlayfieldRenderer {
  init(canvas: HTMLCanvasElement, opts: InitOpts): Promise<void>;
  resize(width: number, height: number, dpr: number): void;
  render(frame: PlayfieldFrame): void;
  destroy(): void;
  /** True when the backing graphics context bound successfully. */
  isReady(): boolean;
}
