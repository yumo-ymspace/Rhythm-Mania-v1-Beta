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

import React from 'react';
import type { PenarBreakdown } from '../types';
import { formatPenar } from '../utils/penar';

export interface ManiaHudProps {
  score: number;
  hp: number; // 0..100
  accuracy?: number; // 0..100
  combo?: number;
  penar?: PenarBreakdown | null;
  showPenar?: boolean;
  keyCount?: number;
  keyLabels?: string[];
  playfieldWidthPercent?: number;
  isReplayMode?: boolean;
  isAutoplay?: boolean;
  progressBarRef?: React.Ref<HTMLDivElement>;
  timeLabelRef?: React.Ref<HTMLSpanElement>;
  timeLeftLabelRef?: React.Ref<HTMLSpanElement>;
  leftHitErrorCanvasRef?: React.Ref<HTMLCanvasElement>;
  rightHitErrorCanvasRef?: React.Ref<HTMLCanvasElement>;
  className?: string;
}

/**
 * ArgonWedgePiece component
 * Recreates the procedural double-stacked skewed wedges from osu!(lazer) Argon skin.
 * In ArgonSkin.cs: two stacked pieces (~380x72), second piece offset by (4, 5),
 * Shear = (0.8, 0), CornerRadius = 10, AccentColour = #66CCFF with 0% to 25% vertical gradient.
 */
export const ArgonWedgePieces: React.FC<{ width?: number; height?: number; className?: string }> = ({
  width = 380,
  height = 72,
  className = '',
}) => {
  // Shear factor 0.8 on X axis: shear offset = height * 0.8 = 57.6
  const shearOffset = height * 0.8;
  const rectWidth = Math.max(10, width - shearOffset);

  return (
    <div className={`relative pointer-events-none select-none ${className}`} style={{ width, height }}>
      <svg
        width={width}
        height={height + 10}
        viewBox={`0 0 ${width} ${height + 10}`}
        className="absolute top-0 left-0 overflow-visible"
        aria-hidden="true"
      >
        <defs>
          {/* Vertical gradient: AccentColour #66CCFF from 0% opacity to 25% opacity */}
          <linearGradient id="argonWedgeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#66CCFF" stopOpacity="0.0" />
            <stop offset="100%" stopColor="#66CCFF" stopOpacity="0.25" />
          </linearGradient>

          {/* Dark glass background gradient */}
          <linearGradient id="argonWedgeBackdrop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#080d18" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#050810" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {/* Back / Second Wedge (offset 4, 5) */}
        <g transform="translate(4, 5)">
          <g transform="matrix(1 0 0.8 1 0 0)">
            <rect
              x="0"
              y="0"
              width={rectWidth}
              height={height}
              rx="10"
              ry="10"
              fill="url(#argonWedgeBackdrop)"
              stroke="#66CCFF"
              strokeOpacity="0.12"
              strokeWidth="1"
            />
            <rect
              x="0"
              y="0"
              width={rectWidth}
              height={height}
              rx="10"
              ry="10"
              fill="url(#argonWedgeGradient)"
              opacity="0.6"
            />
          </g>
        </g>

        {/* Front / Primary Wedge (offset 0, 0) */}
        <g transform="translate(0, 0)">
          <g transform="matrix(1 0 0.8 1 0 0)">
            <rect
              x="0"
              y="0"
              width={rectWidth}
              height={height}
              rx="10"
              ry="10"
              fill="url(#argonWedgeBackdrop)"
              stroke="#66CCFF"
              strokeOpacity="0.25"
              strokeWidth="1"
            />
            <rect
              x="0"
              y="0"
              width={rectWidth}
              height={height}
              rx="10"
              ry="10"
              fill="url(#argonWedgeGradient)"
            />
          </g>
        </g>
      </svg>
    </div>
  );
};

/**
 * ArgonHealthDisplay component
 * Recreates the top-left horizontal health display from osu!(lazer) Argon skin.
 * In ArgonSkin.cs: width ~300, bar height 30, position ~(50, 20),
 * with a short horizontal accent line (45x3) beside it at x=0.
 */
export const ArgonHealthDisplay: React.FC<{ hp: number; className?: string }> = ({
  hp,
  className = '',
}) => {
  const clampedHp = Math.max(0, Math.min(100, hp));
  const isCritical = clampedHp < 20;

  return (
    <div className={`flex items-center gap-2 pointer-events-none select-none ${className}`}>
      {/* Short horizontal accent line beside health display (45x3, rounded-full) */}
      <div
        className="w-[45px] h-[3px] rounded-full bg-[#7ED7FD]/80 shadow-[0_0_8px_rgba(126,215,253,0.6)] shrink-0"
        aria-hidden="true"
      />

      {/* Health bar container (width 300px, height 30px, pill shape) */}
      <div
        id="argon-health-display"
        className="w-[min(300px,calc(100vw-80px))] h-[30px] rounded-full bg-slate-950/70 border border-white/15 p-[3px] relative overflow-hidden backdrop-blur-sm shadow-inner"
        role="progressbar"
        aria-valuenow={Math.round(clampedHp)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Health"
      >
        {/* Fill bar */}
        <div
          className={`h-full rounded-full transition-all duration-100 ease-out ${
            isCritical
              ? 'bg-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.9)]'
              : 'bg-white shadow-[0_0_12px_rgba(126,215,253,0.85)]'
          }`}
          style={{ width: `${clampedHp}%` }}
        />
      </div>
    </div>
  );
};

/**
 * ArgonScoreCounter component
 * Recreates the ArgonScoreCounter from osu!(lazer) Argon skin.
 * In ArgonSkin.cs: ShowLabel = false (no "Score" label),
 * sits on top of the wedges, tabular digits, 6 display digits with wireframe background.
 */
export const ArgonScoreCounter: React.FC<{ score: number; className?: string }> = ({
  score,
  className = '',
}) => {
  const safeScore = Math.max(0, Math.round(score));
  const scoreStr = safeScore.toString();
  const minDigits = 6;
  const paddedZerosCount = Math.max(0, minDigits - scoreStr.length);
  const wireframeZeros = '0'.repeat(paddedZerosCount);

  return (
    <div
      id="argon-score-counter"
      className={`font-mono font-black tracking-tight tabular-nums select-none flex items-baseline justify-end leading-none ${className}`}
      aria-label={`Score: ${safeScore}`}
    >
      {wireframeZeros.length > 0 && (
        <span className="opacity-25 text-white select-none">
          {wireframeZeros}
        </span>
      )}
      <span className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
        {scoreStr}
      </span>
    </div>
  );
};

/**
 * ArgonAccuracyCounter component
 * Recreates the Argon accuracy counter from osu!(lazer) Argon skin.
 * Positioned top-right ~(-20, 20), tabular digits, two decimal places with %.
 */
export const ArgonAccuracyCounter: React.FC<{ accuracy?: number; className?: string }> = ({
  accuracy = 100,
  className = '',
}) => {
  const safeAcc = Math.max(0, Math.min(100, accuracy));
  const accStr = safeAcc.toFixed(2);

  return (
    <div
      id="argon-accuracy-counter"
      className={`font-mono font-black select-none pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] flex items-baseline leading-none text-white ${className}`}
      aria-label={`Accuracy: ${accStr}%`}
    >
      <span className="text-2xl sm:text-3xl md:text-4xl tracking-tight tabular-nums font-black">
        {accStr}
      </span>
      <span className="text-base sm:text-xl md:text-2xl font-bold opacity-90 ml-0.5">%</span>
    </div>
  );
};

/**
 * ArgonPenarCounter component
 * Recreates the Argon PP / PENAR counter slot under the accuracy display.
 * Positioned directly under accuracy, scale ~0.8 relative to accuracy.
 * Never labelled "pp"; explicitly labelled "PENAR" with tooltip.
 */
export const ArgonPenarCounter: React.FC<{
  penar?: PenarBreakdown | null;
  className?: string;
}> = ({ penar, className = '' }) => {
  const valueStr = formatPenar(penar);

  return (
    <div
      id="argon-penar-counter"
      title="Performance Evaluation & Numerical Achievement Rating"
      className={`font-mono font-black select-none pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] flex items-baseline leading-none text-white/90 ${className}`}
      aria-label={`PENAR: ${valueStr}`}
    >
      <span className="text-xl sm:text-2xl md:text-3xl tracking-tight tabular-nums font-black">
        {valueStr}
      </span>
      <span className="text-[10px] sm:text-xs md:text-sm font-black tracking-wider text-cyan-400 opacity-90 ml-1 uppercase">
        PENAR
      </span>
    </div>
  );
};

/**
 * ArgonComboCounter component
 * Recreates the large combo counter from osu!(lazer) Argon skin.
 * Positioned bottom-left, scale ~1.3, bumping on combo increase.
 */
export const ArgonComboCounter: React.FC<{ combo?: number; className?: string }> = ({
  combo = 0,
  className = '',
}) => {
  if (combo <= 0) return null;

  return (
    <div
      id="argon-combo-counter"
      key={`argon-combo-${combo}`}
      className={`flex flex-col items-start leading-none font-mono select-none pointer-events-none origin-bottom-left scale-125 sm:scale-[1.3] drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)] animate-combo-pop ${className}`}
      aria-label={`Combo: ${combo}`}
    >
      <div className="text-5xl sm:text-6xl font-[900] tracking-tighter text-white">
        {combo}x
      </div>
    </div>
  );
};

/**
 * ArgonKeyCounter component
 * Displays key columns with key binding labels and press counts.
 * Lights up bright cyan with press animation when key is pressed.
 * Positioned bottom-right, above song progress bar.
 */
export const ArgonKeyCounter: React.FC<{
  keyCount?: number;
  keyLabels?: string[];
  className?: string;
}> = ({ keyCount = 4, keyLabels = [], className = '' }) => {
  const keys = Array.from({ length: keyCount }, (_, i) => {
    const rawLabel = keyLabels[i] || `K${i + 1}`;
    const displayLabel = rawLabel === ' ' ? 'SPC' : rawLabel.toUpperCase().slice(0, 3);
    return { id: i, label: displayLabel };
  });

  return (
    <div
      id="argon-key-counter"
      className={`flex items-center gap-1.5 sm:gap-2 pointer-events-none select-none ${className}`}
      aria-label="Key Counter"
    >
      {keys.map(k => (
        <div
          key={k.id}
          id={`argon-key-box-${k.id}`}
          className="w-8 sm:w-9 h-11 sm:h-12 rounded-lg bg-slate-950/75 border border-white/15 backdrop-blur-sm flex flex-col items-center justify-between py-1 px-0.5 transition-all duration-75 shadow-sm"
        >
          <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-slate-300 select-none">
            {k.label}
          </span>
          <span
            id={`argon-key-count-${k.id}`}
            className="font-mono text-[10px] font-black text-white/90 tabular-nums select-none"
          >
            0
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * ArgonDualHitErrorMeters component
 * Two vertical BarHitErrorMeters flanking the playfield stage.
 * Left meter is positioned at stage left edge; Right meter is mirrored on stage right edge.
 */
export const ArgonDualHitErrorMeters: React.FC<{
  playfieldWidthPercent?: number;
  leftCanvasRef?: React.Ref<HTMLCanvasElement>;
  rightCanvasRef?: React.Ref<HTMLCanvasElement>;
  className?: string;
}> = ({
  playfieldWidthPercent = 40,
  leftCanvasRef,
  rightCanvasRef,
  className = '',
}) => {
  const halfPercent = Math.max(10, Math.min(48, (playfieldWidthPercent || 40) / 2));

  return (
    <div className={`pointer-events-none select-none ${className}`}>
      {/* Left Hit Error Meter */}
      <div
        id="argon-hit-error-left"
        className="absolute top-1/2 -translate-y-1/2 z-25 flex flex-col items-center gap-1"
        style={{
          right: `calc(50% + ${halfPercent}% + 12px)`,
        }}
      >
        <span className="text-[8px] font-mono font-black uppercase tracking-wider text-slate-400/80">Early</span>
        <canvas
          ref={leftCanvasRef}
          width={24}
          height={200}
          className="w-[24px] h-[200px]"
          aria-hidden="true"
        />
        <span className="text-[8px] font-mono font-black uppercase tracking-wider text-slate-400/80">Late</span>
      </div>

      {/* Right Hit Error Meter (X-Flipped canvas only; labels stay readable) */}
      <div
        id="argon-hit-error-right"
        className="absolute top-1/2 -translate-y-1/2 z-25 flex flex-col items-center gap-1"
        style={{
          left: `calc(50% + ${halfPercent}% + 12px)`,
        }}
      >
        <span className="text-[8px] font-mono font-black uppercase tracking-wider text-slate-400/80">Early</span>
        <canvas
          ref={rightCanvasRef}
          width={24}
          height={200}
          className="w-[24px] h-[200px] scale-x-[-1]"
          aria-hidden="true"
        />
        <span className="text-[8px] font-mono font-black uppercase tracking-wider text-slate-400/80">Late</span>
      </div>
    </div>
  );
};

/**
 * ArgonSongProgress component
 * Full-width (scale X 0.9) rounded pill progress bar at bottom of the screen.
 * Displays elapsed time on the left, remaining time on the right, and bright fill.
 */
export const ArgonSongProgress: React.FC<{
  progressBarRef?: React.Ref<HTMLDivElement>;
  timeLabelRef?: React.Ref<HTMLSpanElement>;
  timeLeftLabelRef?: React.Ref<HTMLSpanElement>;
  className?: string;
}> = ({ progressBarRef, timeLabelRef, timeLeftLabelRef, className = '' }) => {
  return (
    <div
      id="argon-song-progress"
      className={`absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 w-[min(90vw,850px)] flex items-center gap-3 pointer-events-none select-none z-30 ${className}`}
    >
      {/* Current elapsed time label */}
      <span
        ref={timeLabelRef}
        className="font-mono text-[11px] font-bold text-white/80 tabular-nums shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
      >
        0:00
      </span>

      {/* Pill-shaped progress track */}
      <div className="flex-1 h-[10px] sm:h-[12px] rounded-full bg-slate-950/75 border border-white/15 p-[2px] relative overflow-hidden backdrop-blur-sm shadow-inner">
        <div
          ref={progressBarRef}
          className="h-full rounded-full bg-white shadow-[0_0_12px_rgba(126,215,253,0.9)] transition-none"
          style={{ width: '0%' }}
        />
      </div>

      {/* Remaining time label */}
      <span
        ref={timeLeftLabelRef}
        className="font-mono text-[11px] font-bold text-white/80 tabular-nums shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
      >
        -0:00
      </span>
    </div>
  );
};

/**
 * ManiaHud component
 * Top-level HUD coordinator for osu!(lazer) mania Argon alignment.
 * Complete Argon layout:
 * - Health display top-left ~(50, 20) with horizontal accent line
 * - Stacked ArgonWedgePiece behind score
 * - ArgonScoreCounter sitting on wedges (origin top-right, no "Score" label)
 * - ArgonAccuracyCounter top-right ~(-20, 20)
 * - ArgonComboCounter bottom-left ~(50, 50), scale ~1.3
 * - ArgonKeyCounter bottom-right above progress bar
 * - ArgonDualHitErrorMeters flanking the playfield stage (left and right mirrored)
 * - ArgonSongProgress centered at bottom
 */
export const ManiaHud: React.FC<ManiaHudProps> = ({
  score,
  hp,
  accuracy = 100,
  combo = 0,
  penar,
  showPenar = true,
  keyCount = 4,
  keyLabels = [],
  playfieldWidthPercent = 40,
  isReplayMode = false,
  isAutoplay = false,
  progressBarRef,
  timeLabelRef,
  timeLeftLabelRef,
  leftHitErrorCanvasRef,
  rightHitErrorCanvasRef,
  className = '',
}) => {
  return (
    <div
      id="mania-hud"
      className={`absolute inset-0 pointer-events-none select-none z-30 overflow-hidden ${className}`}
    >
      {/* TOP-LEFT CLUSTER: Health display, Wedges, and Score */}
      <div className="absolute top-2.5 sm:top-5 left-2.5 sm:left-[50px] flex flex-col items-start origin-top-left scale-[0.62] sm:scale-[0.88] md:scale-100">
        {/* Health display row */}
        <ArgonHealthDisplay hp={hp} />

        {/* Wedges + Score container */}
        <div className="relative mt-2" style={{ width: 380, height: 72 }}>
          {/* Procedural Argon Wedges */}
          <ArgonWedgePieces width={380} height={72} />

          {/* Score Counter: sits on wedges, origin top-right */}
          <div
            className="absolute top-0 left-0 w-full h-full flex items-center justify-end pr-14 sm:pr-16"
            style={{
              // Position score counter right-aligned inside the sheared wedge area
              transform: 'translateY(-2px)',
            }}
          >
            <ArgonScoreCounter score={score} className="text-3xl sm:text-4xl" />
          </div>
        </div>

        {/* Replay indicator if in replay spectator mode */}
        {isReplayMode && (
          <div className="mt-2 ml-12 flex items-center gap-2 bg-cyan-950/70 border border-cyan-400/40 text-cyan-400 px-3 py-1 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.25)] text-[10px] font-extrabold uppercase tracking-[0.2em]">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>REPLAY</span>
          </div>
        )}
      </div>

      {/* TOP-RIGHT CLUSTER: Accuracy and PENAR */}
      <div className="absolute top-3 sm:top-5 right-4 sm:right-[30px] flex flex-col items-end gap-1 sm:gap-1.5">
        <ArgonAccuracyCounter accuracy={accuracy} />
        {showPenar && (
          <ArgonPenarCounter penar={penar} />
        )}
      </div>

      {/* DUAL HIT-ERROR BARS (Flanking the Playfield) */}
      <ArgonDualHitErrorMeters
        playfieldWidthPercent={playfieldWidthPercent}
        leftCanvasRef={leftHitErrorCanvasRef}
        rightCanvasRef={rightHitErrorCanvasRef}
      />

      {/* BOTTOM-LEFT: Combo Counter */}
      <div className={`absolute left-4 sm:left-[50px] ${isReplayMode || isAutoplay ? 'bottom-24 sm:bottom-28' : 'bottom-6 sm:bottom-8'}`}>
        <ArgonComboCounter combo={combo} />
      </div>

      {/* BOTTOM-RIGHT: Key Counter */}
      <div className={`absolute right-4 sm:right-[50px] ${isReplayMode || isAutoplay ? 'bottom-24 sm:bottom-28' : 'bottom-8 sm:bottom-12'}`}>
        <ArgonKeyCounter keyCount={keyCount} keyLabels={keyLabels} />
      </div>

      {/* BOTTOM-CENTER: Song Progress (When not in replay scrubber mode) */}
      {!isReplayMode && !isAutoplay && (
        <ArgonSongProgress
          progressBarRef={progressBarRef}
          timeLabelRef={timeLabelRef}
          timeLeftLabelRef={timeLeftLabelRef}
        />
      )}
    </div>
  );
};

export default ManiaHud;
