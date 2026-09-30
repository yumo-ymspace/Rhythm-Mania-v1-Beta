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

export interface HudHitErrorTick {
  id: string;
  error: number;
  timestamp: number;
  color: string;
}

/**
 * Draws one argon dual vertical hit-error meter. This is the sole owner of
 * hit-error meter rendering: the playfield canvas never draws HUD meters.
 * Called imperatively from the gameplay fast-tier HUD flush with the live tick list
 * so React reconciliation stays off the per-frame path. Each meter canvas uses
 * its own cached 2D context; the right meter is mirrored via CSS `scale-x-[-1]`.
 *
 * Perf: the static track/segments/dot layer is pre-rendered once per canvas
 * size and blitted with drawImage; ticks are stroked without per-tick
 * save/restore.
 */
const meterCtxCache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
const meterStaticCache = new Map<string, HTMLCanvasElement>();

function getMeterStaticLayer(w: number, h: number, maxMs: number): HTMLCanvasElement | null {
  const key = `${w}x${h}|${maxMs}`;
  const hit = meterStaticCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const halfH = h / 2;
  const trackH = 180;
  const trackHalfH = trackH / 2;
  const centerX = 12;
  const layer = document.createElement('canvas');
  layer.width = w;
  layer.height = h;
  const ctx = layer.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.roundRect(centerX - 1.5, halfH - trackHalfH, 3, trackH, 1.5);
  ctx.fill();
  // Window color ranges (OD ranges in ms: Meh 136, Ok 112, Good 82, Great 49, Perfect 19.4)
  const segments: Array<[number, string, number]> = [
    [136, 'rgba(244, 63, 94, 0.25)', 3],
    [112, 'rgba(249, 115, 22, 0.35)', 3],
    [82, 'rgba(234, 179, 8, 0.45)', 3],
    [49, 'rgba(34, 197, 94, 0.60)', 3],
    [19.4, 'rgba(102, 204, 255, 0.80)', 4],
  ];
  for (const [ms, color, thickness] of segments) {
    const yOffset = Math.min(trackHalfH, (ms / maxMs) * trackHalfH);
    ctx.fillStyle = color;
    ctx.fillRect(centerX - thickness / 2, halfH - yOffset, thickness, yOffset * 2);
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, halfH, 2.5, 0, Math.PI * 2);
  ctx.fill();
  meterStaticCache.set(key, layer);
  if (meterStaticCache.size > 8) {
    const oldest = meterStaticCache.keys().next().value as string | undefined;
    if (oldest !== undefined) meterStaticCache.delete(oldest);
  }
  return layer;
}

export function drawVerticalHitErrorMeter(
  canvas: HTMLCanvasElement | null,
  ticks: HudHitErrorTick[],
  avgMs: number | null,
  maxMs: number = 150
): void {
  if (!canvas) return;
  let ctx = meterCtxCache.get(canvas);
  if (!ctx) {
    const fresh = canvas.getContext('2d');
    if (!fresh) return;
    meterCtxCache.set(canvas, fresh);
    ctx = fresh;
  }
  const w = canvas.width;
  const h = canvas.height;
  const halfH = h / 2;
  const trackH = 180;
  const trackHalfH = trackH / 2;
  const centerX = 12;

  ctx.clearRect(0, 0, w, h);

  // Static background: blit the cached layer instead of rebuilding geometry.
  const staticLayer = getMeterStaticLayer(w, h, maxMs);
  if (staticLayer) {
    ctx.drawImage(staticLayer, 0, 0);
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(centerX - 1.5, halfH - trackHalfH, 3, trackH, 1.5);
    ctx.fill();
  }

  // Draw ticks: one lineWidth, no save/restore per tick. Ticks are
  // push-ordered and compacted by the caller, so iterate from newest back
  // and stop at the 2000ms fade horizon. Ticks sharing a color and quantized
  // alpha are stroked as one path.
  const now = Date.now();
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  let batchKey: string | null = null;
  const flushBatch = () => {
    if (batchKey !== null) {
      ctx!.stroke();
      batchKey = null;
    }
  };
  for (let i = ticks.length - 1; i >= 0; i--) {
    const tick = ticks[i];
    const age = now - tick.timestamp;
    if (age > 2000) break;
    const alpha = Math.max(0, 1 - age / 2000);
    // Quantize alpha so same-color, same-age ticks share one stroke.
    const qAlpha = Math.round(alpha * 16) / 16;
    const clampedError = Math.max(-maxMs, Math.min(maxMs, tick.error));
    const tickY = halfH + (clampedError / maxMs) * trackHalfH;

    const key = `${tick.color}|${qAlpha}`;
    if (batchKey !== key) {
      flushBatch();
      ctx.strokeStyle = tick.color;
      ctx.globalAlpha = qAlpha;
      ctx.beginPath();
      batchKey = key;
    }
    ctx.moveTo(centerX - 7, tickY);
    ctx.lineTo(centerX + 7, tickY);
  }
  flushBatch();
  ctx.globalAlpha = 1;

  // Draw running average pointer / chevron
  if (avgMs !== null) {
    const clampedAvg = Math.max(-maxMs, Math.min(maxMs, avgMs));
    const avgY = halfH + (clampedAvg / maxMs) * trackHalfH;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(centerX - 3, avgY);
    ctx.lineTo(2, avgY - 4);
    ctx.lineTo(2, avgY + 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX - 3, avgY);
    ctx.lineTo(centerX + 7, avgY);
    ctx.stroke();
  }
}

export interface ManiaHudProps {
  score: number;
  hp: number; // 0..100
  accuracy?: number; // 0..100
  combo?: number;
  // Pop-animation generation: the combo number renders live, but the pop
  // re-fires only when this key changes (bumped at the 3Hz slow tier).
  comboPopKey?: number;
  penar?: PenarBreakdown | null;
  showPenar?: boolean;
  keyCount?: number;
  keyLabels?: string[];
  playfieldWidthPercent?: number;
  isReplayMode?: boolean;
  isAutoplay?: boolean;
  progressBarRef?: React.Ref<HTMLDivElement>;
  densityCanvasRef?: React.Ref<HTMLCanvasElement>;
  densityBins?: Float32Array;
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
export const ArgonWedgePieces = React.memo(function ArgonWedgePieces({
  width = 380,
  height = 72,
  className = '',
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
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
          {/* Vertical gradient: AccentColour var(--argon-accent, #66CCFF) from 0% opacity to 25% opacity */}
          <linearGradient id="argonWedgeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--argon-accent, #66CCFF)" stopOpacity="0.0" />
            <stop offset="100%" stopColor="var(--argon-accent, #66CCFF)" stopOpacity="0.25" />
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
              rx="var(--argon-wedge-radius, 10px)"
              ry="var(--argon-wedge-radius, 10px)"
              fill="url(#argonWedgeBackdrop)"
              stroke="var(--argon-accent, #66CCFF)"
              strokeOpacity="0.12"
              strokeWidth="1"
            />
            <rect
              x="0"
              y="0"
              width={rectWidth}
              height={height}
              rx="var(--argon-wedge-radius, 10px)"
              ry="var(--argon-wedge-radius, 10px)"
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
              rx="var(--argon-wedge-radius, 10px)"
              ry="var(--argon-wedge-radius, 10px)"
              fill="url(#argonWedgeBackdrop)"
              stroke="var(--argon-accent, #66CCFF)"
              strokeOpacity="0.25"
              strokeWidth="1"
            />
            <rect
              x="0"
              y="0"
              width={rectWidth}
              height={height}
              rx="var(--argon-wedge-radius, 10px)"
              ry="var(--argon-wedge-radius, 10px)"
              fill="url(#argonWedgeGradient)"
            />
          </g>
        </g>
      </svg>
    </div>
  );
});

/**
 * ArgonHealthDisplay component
 * Recreates the top-left horizontal health display from osu!(lazer) Argon skin.
 * In ArgonSkin.cs: width ~300, bar height 30, position ~(50, 20),
 * with a short horizontal accent line (45x3) beside it at x=0.
 */
export const ArgonHealthDisplay = React.memo(function ArgonHealthDisplay({
  hp,
  className = '',
}: {
  hp: number;
  className?: string;
}) {
  const clampedHp = Math.max(0, Math.min(100, hp));
  const isCritical = clampedHp < 20;

  return (
    <div className={`flex items-center gap-2 pointer-events-none select-none ${className}`}>
      {/* Short horizontal accent line beside health display (45x3, rounded-full) */}
      <div
        className="w-[45px] h-[3px] rounded-full bg-[#7ED7FD]/80 shrink-0"
        aria-hidden="true"
      />

      {/* Health bar container (width 300px, height 30px, pill shape) */}
      <div
        id="argon-health-display"
        className="w-[min(300px,calc(100vw-80px))] h-[30px] rounded-full bg-slate-950/85 border border-white/15 p-[3px] relative overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(clampedHp)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Health"
      >
        {/* Fill bar: transition-none since the parent flushes quantized HP at
            12.5Hz — a CSS transition would restart on every flush. */}
        <div
          className={`h-full rounded-full transition-none ${
            isCritical
              ? 'bg-rose-100'
              : 'bg-white'
          }`}
          style={{ width: `${clampedHp}%` }}
        />
      </div>
    </div>
  );
});

/**
 * ArgonScoreCounter component
 * Recreates the ArgonScoreCounter from osu!(lazer) Argon skin.
 * In ArgonSkin.cs: ShowLabel = false (no "Score" label),
 * sits on top of the wedges, tabular digits, 6 display digits with wireframe background.
 *
 * Visual: glassy dark-navy capsule with a thick glossy chrome rail running
 * along the top edge that bends down on the right (flat top, smooth elbow,
 * short down-leg), plus a thin hairline extending left. Digits sit inside
 * the glass, right-aligned, white with a soft glow; leading slots render as
 * faint wireframe zeros.
 */
export const ArgonScoreCounter = React.memo(function ArgonScoreCounter({
  score,
  className = '',
}: {
  score: number;
  className?: string;
}) {
  const safeScore = Math.max(0, Math.round(score));
  const scoreStr = safeScore.toString();
  const minDigits = 6;
  const paddedZerosCount = Math.max(0, minDigits - scoreStr.length);
  const wireframeZeros = '0'.repeat(paddedZerosCount);
  const railPath = 'M 52 9 H 216 C 236 9 245 13 253 27 L 260 38 Q 262 42 268 42 H 312';

  // Every digit (and every wireframe placeholder) gets its own fixed-width
  // slot so Orbitron's proportional figures can't push neighbouring digits
  // around as the score counts up. Each slot is 1ch wide with a centered
  // glyph; a glyph wider than its slot overflows symmetrically without moving
  // layout, and the whole counter stays right-anchored. Index keys keep the
  // slot nodes stable across score updates instead of remounting them.
  return (
    <div
      id="argon-score-counter"
      className={`relative select-none ${className}`}
      style={{ width: 320, height: 52 }}
      aria-label={`Score: ${safeScore}`}
    >
      <svg
        width={320}
        height={52}
        viewBox="0 0 320 52"
        className="absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="scoreGlass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14324f" stopOpacity="0.85" />
            <stop offset="45%" stopColor="#0a1c31" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#04070d" stopOpacity="0.88" />
          </linearGradient>
          <linearGradient id="scoreChrome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="28%" stopColor="#e6eef6" />
            <stop offset="46%" stopColor="#93a3b5" />
            <stop offset="50%" stopColor="#5b6b7e" />
            <stop offset="56%" stopColor="#d7e3ef" />
            <stop offset="78%" stopColor="#f8fbff" />
            <stop offset="100%" stopColor="#c4d2e0" />
          </linearGradient>
          <linearGradient id="scoreHairline" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7ed7fd" stopOpacity="0" />
            <stop offset="100%" stopColor="#9fd8f5" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        {/* Dark glass body under the rail */}
        <rect
          x="52"
          y="13"
          width="260"
          height="31"
          rx="6"
          fill="url(#scoreGlass)"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1"
        />
        {/* Soft blue inner glow at the bottom of the glass */}
        <rect
          x="56"
          y="34"
          width="252"
          height="8"
          rx="4"
          fill="#1c4a73"
          opacity="0.25"
        />

        {/* Thin hairline extending left from the chrome rail */}
        <rect x="2" y="8" width="52" height="2" rx="1" fill="url(#scoreHairline)" />

        {/* Thick glossy chrome rail: flat top with a smooth bent down-leg right */}
        <path
          d={railPath}
          fill="none"
          stroke="url(#scoreChrome)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Specular highlight along the top of the tube */}
        <path
          d={railPath}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
          transform="translate(0 -1.6)"
        />
        {/* Faint dark under-shadow so the tube lifts off the glass */}
        <path
          d={railPath}
          fill="none"
          stroke="#020409"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
          transform="translate(0 3.4)"
        />
      </svg>

      <div className="font-display font-medium tabular-nums absolute inset-0 flex items-center justify-end leading-none pr-4 tracking-[0.12em]">
        {wireframeZeros.split('').map((z, i) => (
          <span
            key={`wireframe-${i}`}
            className="opacity-25 text-white select-none w-[1ch] text-center shrink-0"
          >
            {z}
          </span>
        ))}
        {scoreStr.split('').map((d, i) => (
          <span
            key={`digit-${i}`}
            className="text-white [text-shadow:0_0_7px_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.9)] w-[1ch] text-center shrink-0"
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
});

/**
 * ArgonAccuracyCounter component
 * Recreates the Argon accuracy counter from osu!(lazer) Argon skin.
 * Positioned top-right ~(-20, 20), tabular digits, two decimal places with %.
 */
export const ArgonAccuracyCounter = React.memo(function ArgonAccuracyCounter({
  accuracy = 100,
  className = '',
}: {
  accuracy?: number;
  className?: string;
}) {
  const safeAcc = Math.max(0, Math.min(100, accuracy));
  const accStr = safeAcc.toFixed(2);

  return (
    <div
      id="argon-accuracy-counter"
      className={`font-display font-black select-none pointer-events-none [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] flex items-baseline leading-none text-white ${className}`}
      aria-label={`Accuracy: ${accStr}%`}
    >
      <span className="text-2xl sm:text-3xl md:text-4xl tracking-tight tabular-nums font-black">
        {accStr}
      </span>
      <span className="text-base sm:text-xl md:text-2xl font-bold opacity-90 ml-0.5">%</span>
    </div>
  );
});

/**
 * ArgonPenarCounter component
 * Recreates the Argon PP / PENAR counter slot under the accuracy display.
 * Positioned directly under accuracy, scale ~0.8 relative to accuracy.
 * Never labelled "pp"; explicitly labelled "PENAR" with tooltip.
 */
export const ArgonPenarCounter = React.memo(function ArgonPenarCounter({
  penar,
  className = '',
}: {
  penar?: PenarBreakdown | null;
  className?: string;
}) {
  const valueStr = formatPenar(penar);

  return (
    <div
      id="argon-penar-counter"
      title="Performance Evaluation & Numerical Achievement Rating"
      className={`font-display font-black select-none pointer-events-none [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] flex items-baseline leading-none text-white/90 ${className}`}
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
});

/**
 * ArgonComboCounter component
 * Recreates the large combo counter from osu!(lazer) Argon skin.
 * Positioned bottom-left, scale ~1.3, bumping on combo increase.
 */
export const ArgonComboCounter = React.memo(function ArgonComboCounter({
  combo = 0,
  className = '',
}: {
  combo?: number;
  className?: string;
}) {
  if (combo <= 0) return null;

  // The number updates on every parent render (fast tier), but the pop
  // animation only re-fires when the parent remounts this node via its
  // `key` (slow 3Hz tier) — no per-combo remount from inside.
  return (
    <div
      id="argon-combo-counter"
      className={`flex flex-col items-start leading-none font-display select-none pointer-events-none origin-bottom-left scale-125 sm:scale-[1.3] [text-shadow:0_2px_6px_rgba(0,0,0,0.95)] animate-combo-pop ${className}`}
      aria-label={`Combo: ${combo}`}
    >
      <div className="text-5xl sm:text-6xl font-[900] tracking-tighter text-white">
        {combo}x
      </div>
    </div>
  );
});

/**
 * ArgonKeyCounter component
 * Displays key columns with key binding labels and press counts.
 * Lights up bright cyan with press animation when key is pressed.
 * Positioned bottom-right, above song progress bar.
 */
export const ArgonKeyCounter = React.memo(function ArgonKeyCounter({
  keyCount = 4,
  keyLabels = [],
  className = '',
}: {
  keyCount?: number;
  keyLabels?: string[];
  className?: string;
}) {
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
          className="w-8 sm:w-9 h-11 sm:h-12 rounded-lg bg-slate-950/85 border border-white/15 flex flex-col items-center justify-between py-1 px-0.5 transition-colors duration-75"
        >
          <span className="font-display text-[10px] sm:text-[11px] font-bold uppercase text-slate-300 select-none">
            {k.label}
          </span>
          <span
            id={`argon-key-count-${k.id}`}
            className="font-display text-[10px] font-black text-white/90 tabular-nums select-none"
          >
            0
          </span>
        </div>
      ))}
    </div>
  );
});

/**
 * ArgonDualHitErrorMeters component
 * Two vertical BarHitErrorMeters flanking the playfield stage.
 * Left meter is positioned at stage left edge; Right meter is mirrored on stage right edge.
 */
export const ArgonDualHitErrorMeters = React.memo(function ArgonDualHitErrorMeters({
  playfieldWidthPercent = 40,
  leftCanvasRef,
  rightCanvasRef,
  className = '',
}: {
  playfieldWidthPercent?: number;
  leftCanvasRef?: React.Ref<HTMLCanvasElement>;
  rightCanvasRef?: React.Ref<HTMLCanvasElement>;
  className?: string;
}) {
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
        <span className="text-[8px] font-display font-black uppercase tracking-wider text-slate-400/80">Early</span>
        <canvas
          ref={leftCanvasRef}
          width={24}
          height={200}
          className="w-[24px] h-[200px]"
          aria-hidden="true"
        />
        <span className="text-[8px] font-display font-black uppercase tracking-wider text-slate-400/80">Late</span>
      </div>

      {/* Right Hit Error Meter (X-Flipped canvas only; labels stay readable) */}
      <div
        id="argon-hit-error-right"
        className="absolute top-1/2 -translate-y-1/2 z-25 flex flex-col items-center gap-1"
        style={{
          left: `calc(50% + ${halfPercent}% + 12px)`,
        }}
      >
        <span className="text-[8px] font-display font-black uppercase tracking-wider text-slate-400/80">Early</span>
        <canvas
          ref={rightCanvasRef}
          width={24}
          height={200}
          className="w-[24px] h-[200px] scale-x-[-1]"
          aria-hidden="true"
        />
        <span className="text-[8px] font-display font-black uppercase tracking-wider text-slate-400/80">Late</span>
      </div>
    </div>
  );
});

/**
 * ArgonSongProgress component
 * Full-width (scale X 0.9) rounded pill progress bar at bottom of the screen.
 * Displays elapsed time on the left, remaining time on the right, and bright fill.
 */
export const ArgonSongProgress = React.memo(function ArgonSongProgress({
  progressBarRef,
  densityCanvasRef,
  densityBins,
  timeLabelRef,
  timeLeftLabelRef,
  className = '',
}: {
  progressBarRef?: React.Ref<HTMLDivElement>;
  densityCanvasRef?: React.Ref<HTMLCanvasElement>;
  densityBins?: Float32Array;
  timeLabelRef?: React.Ref<HTMLSpanElement>;
  timeLeftLabelRef?: React.Ref<HTMLSpanElement>;
  className?: string;
}) {
  const localCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const setMergedCanvasRef = React.useCallback(
    (node: HTMLCanvasElement | null) => {
      localCanvasRef.current = node;
      if (typeof densityCanvasRef === 'function') {
        densityCanvasRef(node);
      } else if (densityCanvasRef && typeof densityCanvasRef === 'object') {
        (densityCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = node;
      }
    },
    [densityCanvasRef]
  );

  React.useEffect(() => {
    const canvas = localCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!densityBins || densityBins.length === 0) return;

    const binCount = densityBins.length;
    const binWidth = w / binCount;

    for (let i = 0; i < binCount; i++) {
      const val = densityBins[i];
      if (val <= 0) continue;
      const barH = Math.max(1, val * h);
      const x = i * binWidth;
      const y = h - barH;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(x, y, Math.max(1, binWidth - 0.5), barH);
    }
  }, [densityBins]);

  return (
    <div
      id="argon-song-progress"
      className={`absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 w-[min(90vw,850px)] flex items-center gap-3 pointer-events-none select-none z-30 ${className}`}
    >
      {/* Current elapsed time label */}
      <span
        ref={timeLabelRef}
        className="font-display text-[11px] font-bold text-white/80 tabular-nums shrink-0 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
      >
        0:00
      </span>

      {/* Pill-shaped progress track with density histogram */}
      <div className="flex-1 h-[10px] sm:h-[12px] rounded-full bg-slate-950/85 border border-white/15 p-[2px] relative overflow-hidden">
        {/* Background density histogram */}
        <canvas
          ref={setMergedCanvasRef}
          width={256}
          height={16}
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        />

        {/* Elapsed white fill */}
        <div
          ref={progressBarRef}
          className="h-full rounded-full bg-white transition-none relative z-10"
          style={{ width: '0%' }}
        />
      </div>

      {/* Remaining time label */}
      <span
        ref={timeLeftLabelRef}
        className="font-display text-[11px] font-bold text-white/80 tabular-nums shrink-0 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
      >
        -0:00
      </span>
    </div>
  );
});

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
export const ManiaHud = React.memo(function ManiaHud({
  score,
  hp,
  accuracy = 100,
  combo = 0,
  comboPopKey = 0,
  penar,
  showPenar = true,
  keyCount = 4,
  keyLabels = [],
  playfieldWidthPercent = 40,
  isReplayMode = false,
  isAutoplay = false,
  progressBarRef,
  densityCanvasRef,
  densityBins,
  timeLabelRef,
  timeLeftLabelRef,
  leftHitErrorCanvasRef,
  rightHitErrorCanvasRef,
  className = '',
}: ManiaHudProps) {
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

          {/* Score Counter: chrome rail + glass, origin top-left */}
          <div
            className="absolute top-0 left-0 w-full h-full flex items-start justify-start"
            style={{
              transform: 'translateY(4px)',
            }}
          >
            <ArgonScoreCounter score={score} className="text-[26px]" />
          </div>
        </div>

        {/* Replay indicator if in replay spectator mode */}
        {isReplayMode && (
          <div className="mt-2 ml-12 flex items-center gap-2 bg-cyan-950/85 border border-cyan-400/40 text-cyan-400 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-[0.2em]">
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

      {/* BOTTOM-LEFT: Combo Counter. The number updates every render (fast
          tier) but the pop animation only re-fires when comboPopKey changes
          (slow 3Hz tier) via the remount key. */}
      <div className={`absolute left-4 sm:left-[50px] ${isReplayMode || isAutoplay ? 'bottom-24 sm:bottom-28' : 'bottom-6 sm:bottom-8'}`}>
        <ArgonComboCounter key={`argon-combo-pop-${comboPopKey}`} combo={combo} />
      </div>

      {/* BOTTOM-RIGHT: Key Counter */}
      <div className={`absolute right-4 sm:right-[50px] ${isReplayMode || isAutoplay ? 'bottom-24 sm:bottom-28' : 'bottom-8 sm:bottom-12'}`}>
        <ArgonKeyCounter keyCount={keyCount} keyLabels={keyLabels} />
      </div>

      {/* BOTTOM-CENTER: Song Progress (When not in replay scrubber mode) */}
      {!isReplayMode && !isAutoplay && (
        <ArgonSongProgress
          progressBarRef={progressBarRef}
          densityCanvasRef={densityCanvasRef}
          densityBins={densityBins}
          timeLabelRef={timeLabelRef}
          timeLeftLabelRef={timeLeftLabelRef}
        />
      )}
    </div>
  );
});

export default ManiaHud;
