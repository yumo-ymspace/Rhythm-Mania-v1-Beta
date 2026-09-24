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

import { useEffect, useRef } from 'react';
import { useLazerReducedMotion } from './motion';

/** Idle menu field — dark navy of `hud/first menu 1.png`. */
export const LAZER_TRIANGLE_FIELD_BG = '#0d1520';
export const LAZER_TRIANGLE_COLOUR_DARK = '#0d1520';
export const LAZER_TRIANGLE_COLOUR_LIGHT = '#2a3a50';

/** osu.Game Triangles.cs */
export const LAZER_TRIANGLE_SIZE = 100;
export const LAZER_TRIANGLE_SCALE = 2.6;
export const LAZER_TRIANGLE_VELOCITY = 50;
export const LAZER_TRIANGLE_EQUILATERAL = 0.866;
export const LAZER_FILLED_MAX = 72;

/** Lazer IntroTriangles: 22ms spawn / 120ms fade. Browser cap keeps it cheap. */
export const LAZER_OUTLINE_SPAWN_LAZER_MS = 22;
export const LAZER_OUTLINE_SPAWN_MS = 50;
export const LAZER_OUTLINE_FADE_MS = 120;
export const LAZER_OUTLINE_MAX = 48;

const OUTLINE_COLOURS = [
  '255,255,255',
  '255,180,220',
  '233,103,161',
  '170,230,210',
  '190,205,255',
] as const;

type FilledTri = {
  x: number;
  y: number;
  scale: number;
  shade: number;
  flip: boolean;
};

type OutlineTri = {
  x: number;
  y: number;
  size: number;
  rot: number;
  born: number;
  life: number;
  colour: string;
  flip: boolean;
  sparkle: boolean;
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function shadeFill(t: number): string {
  const d = 0x0d1520;
  const l = 0x2a3a50;
  const dr = (d >> 16) & 255;
  const dg = (d >> 8) & 255;
  const db = d & 255;
  const lr = (l >> 16) & 255;
  const lg = (l >> 8) & 255;
  const lb = l & 255;
  return `rgb(${lerpChannel(dr, lr, t)}, ${lerpChannel(dg, lg, t)}, ${lerpChannel(db, lb, t)})`;
}

// Precomputed fill shades: the per-frame loop used to allocate one `rgb()`
// string per triangle per frame (~70 allocs/frame of GC pressure). The
// table quantizes shade once at module load; the hot path is an index.
const SHADE_TABLE_SIZE = 32;
const SHADE_TABLE: readonly string[] = Array.from(
  { length: SHADE_TABLE_SIZE },
  (_, i) => shadeFill(i / (SHADE_TABLE_SIZE - 1)),
);

function tableShadeFill(t: number): string {
  const idx = Math.max(0, Math.min(SHADE_TABLE_SIZE - 1, Math.round(t * (SHADE_TABLE_SIZE - 1))));
  return SHADE_TABLE[idx];
}

// Paint throttle: the field is ambient background motion — 30fps is
// visually identical for slow-drifting triangles at half the fill cost.
const TRIANGLE_FRAME_INTERVAL_MS = 1000 / 30;

function gaussian(rng: () => number): number {
  const u1 = Math.max(1e-6, 1 - rng());
  const u2 = 1 - rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
}

function drawEquilateral(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  flip: boolean,
) {
  const h = size * LAZER_TRIANGLE_EQUILATERAL;
  ctx.beginPath();
  if (flip) {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + size / 2, y);
    ctx.lineTo(x - size / 2, y);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + size / 2, y + h);
    ctx.lineTo(x - size / 2, y + h);
  }
  ctx.closePath();
}

function createFilled(rng: () => number, width: number, height: number, randomY: boolean): FilledTri {
  const scale = Math.max(LAZER_TRIANGLE_SCALE * (0.5 + 0.16 * gaussian(rng)), 0.1);
  const size = LAZER_TRIANGLE_SIZE * scale;
  const h = size * LAZER_TRIANGLE_EQUILATERAL;
  const y = randomY ? rng() * (height + h) - h * 0.3 : height + rng() * h;
  return {
    x: rng() * width,
    y,
    scale,
    shade: rng(),
    flip: rng() < 0.42,
  };
}

function createOutline(rng: () => number, width: number, height: number, now: number, sparkle: boolean): OutlineTri {
  const towardCentre = rng() < 0.55;
  const x = towardCentre ? width * (0.28 + rng() * 0.44) : rng() * width;
  const y = towardCentre ? height * (0.22 + rng() * 0.56) : rng() * height;
  const size = sparkle ? (rng() + 0.2) * 80 : 48 + rng() * 160;
  return {
    x,
    y,
    size,
    rot: rng() * Math.PI * 2,
    born: now,
    life: sparkle ? LAZER_OUTLINE_FADE_MS : 1800 + rng() * 4200,
    colour: OUTLINE_COLOURS[Math.floor(rng() * OUTLINE_COLOURS.length)],
    flip: rng() < 0.5,
    sparkle,
  };
}

export function filledTriangleAimCount(width: number, height: number): number {
  const raw = (width * height * 0.002) / (LAZER_TRIANGLE_SCALE * LAZER_TRIANGLE_SCALE);
  return Math.max(24, Math.min(LAZER_FILLED_MAX, Math.round(raw)));
}

export function TriangleField({ className, uncapped = false }: { className?: string; uncapped?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useLazerReducedMotion();
  // Read once per effect run so the hot loop never touches props.
  const uncappedRef = useRef(uncapped);
  uncappedRef.current = uncapped;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animId = 0;
    let lastTs = 0;
    let lastOutlineSpawn = 0;
    let running = true;

    const rng = mulberry32(0x524d3031);
    let filled: FilledTri[] = [];
    let outlines: OutlineTri[] = [];

    const resize = () => {
      // Cap DPR below the device maximum: at 1.5x the full-screen triangle
      // fills cost ~44% fewer pixels than 2x with no visible difference for
      // flat-shaded ambient shapes.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, canvas.clientWidth || window.innerWidth);
      height = Math.max(1, canvas.clientHeight || window.innerHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const aim = filledTriangleAimCount(width, height);
      if (filled.length !== aim) {
        filled = [];
        for (let i = 0; i < aim; i++) filled.push(createFilled(rng, width, height, true));
        filled.sort((a, b) => b.scale - a.scale);
      }
    };

    const seedOutlines = (now: number) => {
      outlines = [];
      const ambient = 22;
      for (let i = 0; i < ambient; i++) {
        const tri = createOutline(rng, width, height, now, false);
        tri.born = now - rng() * tri.life * 0.85;
        outlines.push(tri);
      }
    };

    const paint = (now: number, dtSec: number, animate: boolean) => {
      ctx.fillStyle = LAZER_TRIANGLE_FIELD_BG;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < filled.length; i++) {
        const t = filled[i];
        const size = LAZER_TRIANGLE_SIZE * t.scale;
        const h = size * LAZER_TRIANGLE_EQUILATERAL;
        if (animate) {
          const pxPerSec = (LAZER_TRIANGLE_VELOCITY / LAZER_TRIANGLE_SCALE) * Math.max(0.5, t.scale);
          t.y -= pxPerSec * dtSec;
          if (t.y + h < 0) {
            t.y = height + rng() * h * 0.4;
            t.x = rng() * width;
          }
        }
        ctx.fillStyle = tableShadeFill(t.shade);
        drawEquilateral(ctx, t.x, t.y, size, t.flip);
        ctx.fill();
      }

      if (!animate) return;

      if (now - lastOutlineSpawn >= LAZER_OUTLINE_SPAWN_MS) {
        lastOutlineSpawn = now;
        const sparkle = rng() < 0.35;
        if (outlines.length < LAZER_OUTLINE_MAX) {
          outlines.push(createOutline(rng, width, height, now, sparkle));
        }
      }

      ctx.lineJoin = 'round';
      for (let i = outlines.length - 1; i >= 0; i--) {
        const o = outlines[i];
        const age = now - o.born;
        if (age >= o.life) {
          outlines.splice(i, 1);
          continue;
        }
        let alpha: number;
        if (o.sparkle) {
          alpha = Math.max(0, 1 - age / o.life);
        } else {
          const fadeIn = Math.min(1, age / 180);
          const fadeOut = age > o.life - 700 ? Math.max(0, (o.life - age) / 700) : 1;
          alpha = fadeIn * fadeOut * 0.72;
        }
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(o.rot);
        ctx.strokeStyle = `rgba(${o.colour},${alpha.toFixed(3)})`;
        ctx.lineWidth = o.sparkle ? 1.2 : Math.max(1.4, o.size * 0.018);
        drawEquilateral(ctx, 0, -o.size * 0.2, o.size, o.flip);
        ctx.stroke();
        ctx.restore();
      }
    };

    resize();
    const now0 = performance.now();
    seedOutlines(now0);
    lastOutlineSpawn = now0;
    paint(now0, 0, !reduced);

    const onResize = () => {
      resize();
      paint(performance.now(), 0, !reduced);
    };
    window.addEventListener('resize', onResize);

    if (reduced) {
      return () => {
        running = false;
        window.removeEventListener('resize', onResize);
      };
    }

    let lastPaintTs = 0;
    const tick = (ts: number) => {
      if (!running) return;
      // Skip the paint when the tab is hidden (rAF already throttles, but
      // the guard also covers spurious wakeups) and throttle ambient
      // motion to ~30fps. dt still spans the real elapsed time so drift
      // speed is unchanged when frames are skipped.
      if (document.hidden) {
        lastTs = ts;
        animId = requestAnimationFrame(tick);
        return;
      }
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      // Eco throttle (~30fps) unless the uncapped-menu-motion setting is on,
      // in which case every vsync paints. dt spans real elapsed time either
      // way, so drift speed is unchanged. Read via ref so toggling the
      // setting never re-seeds the field.
      if (uncappedRef.current || ts - lastPaintTs >= TRIANGLE_FRAME_INTERVAL_MS) {
        lastPaintTs = ts;
        paint(ts, dt, true);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      id="lazer-triangle-field"
      className={['lazer-triangle-field', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      data-lazer-triangle-field=""
    />
  );
}
