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

import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export type GameplayMenuMode = 'pause' | 'fail';

export interface PauseOverlayProps {
  isOpen: boolean;
  /** Pause shows Continue; fail is the same overlay without OnResume. */
  mode?: GameplayMenuMode;
  onResume?: () => void;
  onRetry: () => void;
  onExit: () => void;
  retryCount?: number;
  songProgressPercent?: number;
  accuracyPercent?: number;
  beatmapTitle?: string;
  beatmapArtist?: string;
  beatmapVersion?: string;
  mods?: string[];
}

export default function PauseOverlay({
  isOpen,
  mode = 'pause',
  onResume,
  onRetry,
  onExit,
  retryCount = 0,
  songProgressPercent = 0,
  accuracyPercent = 100,
  beatmapTitle,
  beatmapArtist,
  beatmapVersion,
  mods = [],
}: PauseOverlayProps) {
  const isFail = mode === 'fail';

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // PauseOverlay Back/Esc → first button (Continue). FailOverlay Back → last button (Quit).
        if (isFail) onExit();
        else onResume?.();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        e.stopPropagation();
        onRetry();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen, isFail, onResume, onRetry, onExit]);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id={isFail ? 'game-fail-overlay' : 'game-paused-overlay'}
          role="dialog"
          aria-modal="true"
          aria-label={isFail ? 'Track failed' : 'Game paused'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center select-none bg-black/75 p-4 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex flex-col items-center mb-6 text-center">
            <h2 className="text-[48px] leading-tight font-black tracking-tight text-[#ffcc22] font-sans drop-shadow-[0_2px_12px_rgba(255,204,34,0.35)]">
              {isFail ? 'failed' : 'paused'}
            </h2>
            {(beatmapTitle || beatmapArtist) && (
              <p className="text-sm text-slate-300 font-sans font-medium mt-1 drop-shadow-sm max-w-lg truncate px-4">
                {beatmapArtist ? `${beatmapArtist} – ` : ''}
                <span className="font-semibold text-white">{beatmapTitle}</span>
                {beatmapVersion && (
                  <span className="text-amber-300/80 font-normal ml-1.5">[{beatmapVersion}]</span>
                )}
              </p>
            )}

            {mods.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
                {mods.map((mod) => (
                  <span
                    key={mod}
                    className="px-2 py-0.5 text-[10px] font-black uppercase font-mono tracking-wider rounded bg-white/10 text-white border border-white/15"
                  >
                    {mod}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons Stack (Argon layout: height 80, horizontal padding 50, 2px gap) */}
          <div className="w-full max-w-[440px] flex flex-col gap-[2px]">
            {!isFail && onResume && (
              <button
                id="pause-resume-btn"
                type="button"
                onClick={onResume}
                className="h-[80px] px-[50px] w-full flex items-center justify-center bg-[#26aa55] hover:bg-[#2ec564] active:bg-[#209449] text-white font-sans font-black text-2xl tracking-wide rounded-t-xl transition-all duration-150 border-t border-white/20 hover:shadow-[0_0_24px_rgba(46,197,100,0.4)] active:scale-[0.99] cursor-pointer"
              >
                Continue
              </button>
            )}

            <button
              id={isFail ? 'fail-retry-btn' : 'pause-retry-btn'}
              type="button"
              onClick={onRetry}
              className={`h-[80px] px-[50px] w-full flex items-center justify-center bg-[#e59900] hover:bg-[#f5a623] active:bg-[#cc8800] text-white font-sans font-black text-2xl tracking-wide transition-all duration-150 border-t border-white/20 hover:shadow-[0_0_24px_rgba(245,166,35,0.4)] active:scale-[0.99] cursor-pointer ${isFail ? 'rounded-t-xl' : ''}`}
            >
              Retry
            </button>

            <button
              id={isFail ? 'fail-quit-btn' : 'pause-quit-btn'}
              type="button"
              onClick={onExit}
              className="h-[80px] px-[50px] w-full flex items-center justify-center bg-[#aa1b27] hover:bg-[#c42533] active:bg-[#8f1620] text-white font-sans font-black text-2xl tracking-wide rounded-b-xl transition-all duration-150 border-t border-white/20 hover:shadow-[0_0_24px_rgba(170,27,39,0.45)] active:scale-[0.99] cursor-pointer"
            >
              Quit
            </button>
          </div>

          {/* Under buttons: retry count, song progress %, accuracy */}
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-slate-400 font-mono tracking-wider select-none">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 uppercase font-sans font-semibold text-[11px]">retries:</span>
              <span className="font-bold text-slate-200">{retryCount}</span>
            </div>
            <span className="text-slate-600 font-sans">•</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 uppercase font-sans font-semibold text-[11px]">progress:</span>
              <span className="font-bold text-slate-200">{Math.round(songProgressPercent)}%</span>
            </div>
            <span className="text-slate-600 font-sans">•</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 uppercase font-sans font-semibold text-[11px]">accuracy:</span>
              <span className="font-bold text-slate-200">{accuracyPercent.toFixed(2)}%</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
