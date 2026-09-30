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

import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { useMemo } from 'react';
import metadata from '../../../metadata.json';
import { beatPeriodSeconds, LAZER_PINK_LIGHT, useLazerReducedMotion } from './motion';

export const LAZER_COOKIE_BAR_COUNT = 72;
export const LAZER_COOKIE_TITLE = 'Rhythm Mania';
export const LAZER_COOKIE_VERSION = metadata.version;
export const LAZER_COOKIE_MARK = `${LAZER_COOKIE_TITLE} ${LAZER_COOKIE_VERSION}`;

function splitCookieLabel(label: string): { title: string; version: string } {
  const trimmed = label.trim();
  // Display-only version tag: accepts `v` + anything (v1, v1 Beta, vBeta),
  // bare numeric versions (1.0.0), and word channels (latest, beta, alpha,
  // preview, rc, stable, next, dev, nightly, canary) with optional trailers.
  // Gameplay version tags (PENAR, star-rating, beatmap Version, replay schema)
  // stay numeric-only elsewhere; this splitter is user-facing chrome only.
  const match = trimmed.match(/^(.*?)\s+(v\S.*|latest(?:\s+.*)?|beta(?:\s+.*)?|alpha(?:\s+.*)?|preview(?:\s+.*)?|rc(?:\s+.*)?|stable(?:\s+.*)?|next(?:\s+.*)?|dev(?:\s+.*)?|nightly(?:\s+.*)?|canary(?:\s+.*)?|\d[\w.\-]*(?:\s+.*)?)\s*$/i);
  if (match) return { title: match[1].trim() || trimmed, version: match[2].trim() };
  return { title: trimmed, version: '' };
}

type TriangleSpec = { cx: number; cy: number; r: number; rot: number; opacity: number };

const INNER_TRIANGLES: readonly TriangleSpec[] = [
  { cx: 50, cy: 46, r: 34, rot: 0, opacity: 0.34 },
  { cx: 38, cy: 58, r: 22, rot: 18, opacity: 0.28 },
  { cx: 66, cy: 40, r: 18, rot: -12, opacity: 0.3 },
  { cx: 58, cy: 68, r: 16, rot: 8, opacity: 0.22 },
  { cx: 28, cy: 36, r: 14, rot: -22, opacity: 0.26 },
  { cx: 74, cy: 62, r: 20, rot: 26, opacity: 0.24 },
  { cx: 46, cy: 28, r: 12, rot: 6, opacity: 0.2 },
  { cx: 32, cy: 72, r: 10, rot: -8, opacity: 0.22 },
  { cx: 70, cy: 24, r: 11, rot: 14, opacity: 0.18 },
  { cx: 22, cy: 52, r: 9, rot: 30, opacity: 0.2 },
  { cx: 80, cy: 48, r: 13, rot: -18, opacity: 0.22 },
  { cx: 54, cy: 80, r: 15, rot: 4, opacity: 0.18 },
];

function trianglePoints(cx: number, cy: number, r: number, rotDeg: number): string {
  const rot = (rotDeg * Math.PI) / 180;
  const pts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const a = rot + -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function idleSpectrum(index: number, count: number = LAZER_COOKIE_BAR_COUNT): number {
  const t = index / count;
  const wave =
    0.16 +
    0.48 * Math.abs(Math.sin(index * 0.73)) +
    0.22 * Math.abs(Math.cos(index * 0.29 + 1.1)) +
    0.18 * Math.abs(Math.sin(t * Math.PI * 14));
  return Math.max(0.1, Math.min(1, wave));
}

export type LazerCookieProps = {
  size?: number;
  label?: string;
  bpm?: number;
  pulse?: boolean;
  spectrum?: readonly number[];
  showSpectrum?: boolean;
  showDisc?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onHoverChange?: (hovered: boolean) => void;
};

export function LazerCookie({
  size = 280,
  label = LAZER_COOKIE_MARK,
  bpm = 60,
  pulse = true,
  spectrum,
  showSpectrum = true,
  showDisc = true,
  className,
  style,
  onClick,
  onHoverChange,
}: LazerCookieProps) {
  const reduced = useLazerReducedMotion();
  const pulsing = pulse && !reduced;
  const period = beatPeriodSeconds(bpm);
  const classes = ['lazer-cookie', pulsing ? 'is-pulsing' : '', className].filter(Boolean).join(' ');
  const liveSpectrum = spectrum != null;
  const mark = label.trim() || LAZER_COOKIE_MARK;
  const { title, version } = splitCookieLabel(mark);

  // Memoized: the 72-bar array was rebuilt on every parent render (hover
  // peaks, phase springs) even though it only depends on the spectrum.
  const bars = useMemo(
    () => Array.from({ length: LAZER_COOKIE_BAR_COUNT }, (_, i) => {
      if (liveSpectrum) {
        const sample = spectrum[i % spectrum.length];
        return Math.max(0, Math.min(1, Number.isFinite(sample) ? sample : 0));
      }
      return idleSpectrum(i);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveSpectrum, spectrum],
  );

  const cx = 50;
  const cy = 50;
  const innerR = 32.4;
  const barWidth = 1.0;
  const maxLen = 21;

  const content = (
    <div className="lazer-cookie-pulse">
      {showSpectrum && (
        <svg className="lazer-cookie-spectrum" viewBox="0 0 100 100" aria-hidden="true">
          {bars.map((amp, i) => {
            const angle = (i / LAZER_COOKIE_BAR_COUNT) * 360;
            const len = 4.2 + amp * maxLen;
            return (
              <g key={i} transform={`rotate(${angle} ${cx} ${cy})`}>
                <rect
                  className={liveSpectrum ? 'lazer-cookie-bar' : 'lazer-cookie-bar is-idle'}
                  x={cx - barWidth / 2}
                  y={cy - innerR - len}
                  width={barWidth}
                  height={len}
                  rx={barWidth / 2}
                  style={liveSpectrum ? undefined : { animationDelay: `-${(i / LAZER_COOKIE_BAR_COUNT) * 1.6}s` }}
                />
              </g>
            );
          })}
        </svg>
      )}
      {showDisc && (
      <div className="lazer-cookie-disc">
        <svg className="lazer-cookie-triangles" viewBox="0 0 100 100" aria-hidden="true">
          {INNER_TRIANGLES.map((tri, i) => (
            <polygon
              key={i}
              points={trianglePoints(tri.cx, tri.cy, tri.r, tri.rot)}
              fill="none"
              stroke={LAZER_PINK_LIGHT}
              strokeWidth="0.7"
              opacity={tri.opacity}
            />
          ))}
        </svg>
        <span className="lazer-cookie-mark">
          <span className="lazer-cookie-title">{title}</span>
          {version && <span className="lazer-cookie-version">{version}</span>}
        </span>
      </div>
      )}
    </div>
  );

  const mergedStyle: CSSProperties = {
    '--lazer-cookie-size': `${size}px`,
    '--lazer-beat-period': `${period}s`,
    ...style,
  } as CSSProperties;

  const shared = {
    id: 'lazer-cookie',
    className: classes,
    style: mergedStyle,
    'aria-label': 'RhythmMania',
    'data-lazer-cookie': '',
  };

  if (onClick) {
    return (
      <button
        type="button"
        {...shared}
        onClick={onClick}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
      >
        {content}
      </button>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
  };

  return (
    <div {...shared} role="img" onKeyDown={onKeyDown}>
      {content}
    </div>
  );
}
