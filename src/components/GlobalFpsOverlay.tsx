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

/**
 * Always-on performance readout (gated by the `showFpsCounter` setting).
 *
 * Runs its own rAF loop and reports, twice per second via direct DOM
 * writes (no React re-renders):
 * - FPS: rAF callbacks per second (the browser presents at vsync, so this
 *   tops out at the display refresh rate — uncapped presentation is not
 *   possible on the web).
 * - Frame time: mean rAF-to-rAF interval in ms over the sample window.
 * - Input latency: time from the last key/pointer input to the next frame
 *   callback — i.e. how long an input waits for a frame. A lower bound on
 *   true input-to-photon latency, shown honestly as `in`.
 */
export default function GlobalFpsOverlay({ belowToolbar = false }: { belowToolbar?: boolean }) {
  const labelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let mounted = true;
    let frames = 0;
    let sampleStart = 0;
    let pendingInputAt: number | null = null;
    let lastInputLatencyMs: number | null = null;

    const onInput = () => {
      pendingInputAt = performance.now();
    };
    window.addEventListener('keydown', onInput, { passive: true });
    window.addEventListener('pointerdown', onInput, { passive: true });

    const tick = (now: number) => {
      if (!mounted) return;
      if (sampleStart === 0) {
        sampleStart = now;
        frames = 0;
      }
      frames += 1;
      if (pendingInputAt !== null) {
        lastInputLatencyMs = Math.max(0, now - pendingInputAt);
        pendingInputAt = null;
      }
      const elapsed = now - sampleStart;
      if (elapsed >= 500) {
        // Tab was hidden (rAF paused): restart the sample instead of
        // flashing a bogus single-digit readout on return.
        if (elapsed <= 5000 && labelRef.current) {
          const fps = Math.round((frames * 1000) / elapsed);
          const frameMs = (elapsed / Math.max(1, frames)).toFixed(1);
          const input = lastInputLatencyMs === null ? '—' : `${lastInputLatencyMs.toFixed(1)}ms`;
          labelRef.current.innerText = `${fps} FPS · ${frameMs}ms · in ${input}`;
        }
        frames = 0;
        sampleStart = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onInput);
      window.removeEventListener('pointerdown', onInput);
    };
  }, []);

  return (
    <span
      ref={labelRef}
      role="status"
      aria-label="Performance overlay"
      className={`fixed right-3 z-[95] font-mono text-[11px] font-bold text-emerald-300/90 bg-black/50 px-2 py-0.5 rounded pointer-events-none select-none ${
        belowToolbar ? 'top-[58px] max-[480px]:top-[46px]' : 'top-2'
      }`}
    />
  );
}
