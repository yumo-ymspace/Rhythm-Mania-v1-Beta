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
 * Single parallelogram slab behind the score digits: straight vertical left
 * edge, right edge slanted like `/` (top-right corner sits further right
 * than the bottom-right). Flat fills only — no stroke/box outline. A second
 * slab offset by (4, 5) sits behind for depth.
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
  // `/` slant: top-right extends `slant` px further right than bottom-right.
  const slant = Math.min(64, Math.round(height * 0.66));
  const points = `0,0 ${width},0 ${width - slant},${height} 0,${height}`;

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

        {/* Back slab (offset 4, 5) */}
        <g transform="translate(4, 5)">
          <polygon points={points} fill="url(#argonWedgeBackdrop)" opacity="0.6" />
          <polygon points={points} fill="url(#argonWedgeGradient)" opacity="0.6" />
        </g>

        {/* Front slab (offset 0, 0) */}
        <g transform="translate(0, 0)">
          <polygon points={points} fill="url(#argonWedgeBackdrop)" />
          <polygon points={points} fill="url(#argonWedgeGradient)" />
        </g>
      </svg>
    </div>
  );
});

/**
 * ArgonHealthDisplay component
 * The thick flat chrome rail (flat top with a smooth bent down-leg on the
 * right) IS the health bar, with a thin hairline extending left. HP depletes
 * the chrome fill from right to left over a dark empty track; below 20 the
 * fill turns red. No pill/capsule — the score digits sit plainly underneath.
 * The fill is a single flat stroke: no inner highlight or shadow strokes,
 * so no seam line shows inside the tube.
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
  // Long rail with wide, soft elbows: flat top, gradual sweep into the
  // diagonal, rounded ease (no kink) into the final horizontal leg.
  const railPath = 'M 52 10 H 224 C 250 10 262 15 271 30 L 278 41 C 281 47 285 48 291 48 H 352';

  return (
    <div
      className={`relative pointer-events-none select-none ${className}`}
      style={{ width: 360, height: 56 }}
    >
      <div
        id="argon-health-display"
        role="progressbar"
        aria-valuenow={Math.round(clampedHp)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Health"
      >
        <svg
          width={400}
          height={92}
          viewBox="-20 -18 400 92"
          className="overflow-visible absolute block"
          style={{ left: -20, top: -18 }}
          aria-hidden="true"
        >
          <defs>
            {/* Near-white vertical sheen: the gradient maps over the whole
                rail bounding box, so the diagonal would sit in any dark
                middle band — keep mid stops bright so the bend never grays */}
            <linearGradient id="healthChrome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="42%" stopColor="#f5f8fb" />
              <stop offset="55%" stopColor="#e9eef3" />
              <stop offset="70%" stopColor="#f7fafc" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <linearGradient id="healthChromeLow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#ffd9de" />
              <stop offset="46%" stopColor="#f2556f" />
              <stop offset="54%" stopColor="#c22a44" />
              <stop offset="62%" stopColor="#fda4af" />
              <stop offset="80%" stopColor="#fff1f2" />
              <stop offset="100%" stopColor="#f3b3be" />
            </linearGradient>
            <linearGradient id="healthHairline" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7ed7fd" stopOpacity="0" />
              <stop offset="100%" stopColor="#9fd8f5" stopOpacity="0.65" />
            </linearGradient>
            {/* Ring masks: white band minus a wider-than-tube black core, so
                the outline floats with a transparent gap off the tube */}
            <mask id="railOutlineMask" maskUnits="userSpaceOnUse" x="-20" y="-18" width="400" height="92">
              <path d={railPath} fill="none" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
              <path d={railPath} fill="none" stroke="#000000" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
            </mask>
            <mask id="railHaloMask" maskUnits="userSpaceOnUse" x="-20" y="-18" width="400" height="92">
              <path d={railPath} fill="none" stroke="#ffffff" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" />
              <path d={railPath} fill="none" stroke="#000000" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
            </mask>
          </defs>

          {/* Thin hairline extending left from the rail */}
          <rect x="2" y="8" width="52" height="2" rx="1" fill="url(#healthHairline)" />

          {/* Rounded outline floating off the tube + faint outer glow */}
          <g mask="url(#railHaloMask)">
            <rect x="-20" y="-18" width="400" height="92" fill="rgba(226,236,245,0.20)" />
          </g>
          <g mask="url(#railOutlineMask)">
            <rect x="-20" y="-18" width="400" height="92" fill="rgba(232,240,248,0.6)" />
          </g>
          <g mask="url(#railOutlineMask)">
            <rect x="0" y="0" width="360" height="56" fill="rgba(232,240,248,0.6)" />
          </g>

          {/* Dark empty track along the full rail */}
          <path
            d={railPath}
            fill="none"
            stroke="rgba(6,11,22,0.9)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={railPath}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="11.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.35"
          />

          {/* HP fill: flat chrome, depleting right-to-left (dash from path start).
              No centered highlight or offset shadow: those painted a visible
              seam line inside the tube. */}
          {clampedHp > 0 && (
            <path
              d={railPath}
              fill="none"
              pathLength={100}
              strokeDasharray={`${clampedHp} 100`}
              stroke={isCritical ? 'url(#healthChromeLow)' : 'url(#healthChrome)'}
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>
    </div>
  );
});

/**
 * ArgonScoreCounter component
 * Plain digits with no capsule, label, or rail: tabular digits with faint
 * wireframe leading zeros, sitting underneath the chrome-rail health bar.
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

  // Every digit (and every wireframe placeholder) gets its own fixed-width
  // slot so Orbitron's proportional figures can't push neighbouring digits
  // around as the score counts up. Each slot is 1ch wide with a centered
  // glyph; a glyph wider than its slot overflows symmetrically without moving
  // layout, and the whole counter stays right-anchored. Index keys keep the
  // slot nodes stable across score updates instead of remounting them.
  return (
    <div
      id="argon-score-counter"
      className={`font-display font-medium tabular-nums select-none flex items-baseline justify-end leading-none tracking-[0.12em] ${className}`}
      aria-label={`Score: ${safeScore}`}
    >
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
 * Positioned bottom-left, scale ~1.3, static size (no pop on combo increase).
 */
export const ArgonComboCounter = React.memo(function ArgonComboCounter({
  combo = 0,
  className = '',
}: {
  combo?: number;
  className?: string;
}) {
  if (combo <= 0) return null;

  return (
    <div
      id="argon-combo-counter"
      className={`flex flex-col items-start leading-none font-display select-none pointer-events-none origin-bottom-left scale-125 sm:scale-[1.3] [text-shadow:0_2px_6px_rgba(0,0,0,0.95)] ${className}`}
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
          className="w-8 sm:w-9 h-11 sm:h-12 rounded-lg bg-slate-950/85 border border-white/15 flex flex-col items-center justify-between py-1 px-0.5 transition-all duration-50 ease-out"
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
 * Two vertical BarHitErrorMeters docked to the screen left/right edges.
 */
export const ArgonDualHitErrorMeters = React.memo(function ArgonDualHitErrorMeters({
  leftCanvasRef,
  rightCanvasRef,
  className = '',
}: {
  playfieldWidthPercent?: number;
  leftCanvasRef?: React.Ref<HTMLCanvasElement>;
  rightCanvasRef?: React.Ref<HTMLCanvasElement>;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none select-none ${className}`}>
      {/* Left Hit Error Meter (screen left edge) */}
      <div
        id="argon-hit-error-left"
        className="absolute top-1/2 -translate-y-1/2 z-25 flex flex-col items-center gap-1"
        style={{
          left: '10px',
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

      {/* Right Hit Error Meter (screen right edge; X-Flipped canvas only; labels stay readable) */}
      <div
        id="argon-hit-error-right"
        className="absolute top-1/2 -translate-y-1/2 z-25 flex flex-col items-center gap-1"
        style={{
          right: '10px',
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
  penar,
  showPenar = true,
  keyCount = 4,
  keyLabels = [],
  playfieldWidthPercent = 15,
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
      {/* TOP-LEFT CLUSTER: flush to the screen left edge */}
      <div className="absolute top-2.5 sm:top-5 left-0 flex flex-col items-start origin-top-left scale-[0.62] sm:scale-[0.88] md:scale-100">
        {/* Health bar: thick glossy chrome rail on the topmost layer */}
        <div className="relative z-50 -mb-6">
          <ArgonHealthDisplay hp={hp} />
        </div>

        {/* Score slab + digits */}
        <div className="relative" style={{ width: 320, height: 60 }}>
          {/* Parallelogram score slab (straight left, `/` slant right) */}
          <ArgonWedgePieces width={320} height={60} />

          {/* Score Counter: plain digits, shifted left */}
          <div
            className="absolute top-0 left-0 w-full h-full flex items-start justify-end pr-20 sm:pr-24"
            style={{
              transform: 'translateY(12px)',
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

      {/* BOTTOM-LEFT: Combo Counter. Static size, updates every render (fast tier). */}
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
