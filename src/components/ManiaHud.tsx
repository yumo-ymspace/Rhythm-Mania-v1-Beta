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

export interface ManiaHudProps {
  score: number;
  hp: number; // 0..100
  isReplayMode?: boolean;
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
 * ManiaHud component
 * Top-level HUD coordinator for osu!(lazer) mania Argon alignment.
 * TASK-052 implements:
 * - ArgonHealthDisplay at top-left ~(50, 20) with horizontal accent line
 * - Stacked ArgonWedgePiece behind score
 * - ArgonScoreCounter sitting on wedges (origin top-right, no "Score" label)
 */
export const ManiaHud: React.FC<ManiaHudProps> = ({
  score,
  hp,
  isReplayMode = false,
  className = '',
}) => {
  return (
    <div
      id="mania-hud"
      className={`absolute inset-0 pointer-events-none select-none z-30 overflow-hidden ${className}`}
    >
      {/* TOP-LEFT CLUSTER: Health display, Wedges, and Score */}
      <div className="absolute top-3 sm:top-5 left-3 sm:left-[50px] flex flex-col items-start origin-top-left scale-[0.78] sm:scale-100">
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
    </div>
  );
};

export default ManiaHud;
