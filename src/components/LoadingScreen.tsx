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

import { useEffect, useState } from 'react';
import type { Beatmap } from '../types';
import {
  BOOT_STATIC_ASSETS,
  preloadStaticAssets,
  waitForBootFonts,
} from '../utils/assetPreloader';
import {
  prepareLaunchMenuTrack,
  type PreparedLaunchTrack,
} from '../utils/launchMenuTrack';
import { MENU_FALLBACK_TRACK, warmMenuMusic } from '../utils/menuMusic';

export type { PreparedLaunchTrack };

interface LoadingScreenProps {
  customMaps: Beatmap[];
  mapsReady: boolean;
  /** Fired synchronously from the start-button click so the song starts audibly on the gesture. */
  onStartPressed: (track: PreparedLaunchTrack) => void;
  /** Fired after the farewell sequence finishes so the app can reveal the menu. */
  onEntered: () => void;
}

type Stage = 'loading' | 'ready' | 'blank' | 'welcome' | 'welcome-to' | 'white' | 'fade';

const BLANK_MS = 400;
const WELCOME_MS = 200;
const WELCOME_TO_MS = 1400;
const WHITE_MS = 250;
const FADE_MS = 1000;

/**
 * Full-screen boot gate. Covers everything in black with a single white
 * loading bar while bundled audio/images/fonts, the beatmap library, and the
 * launch song are actually loaded. When done it swaps the bar for a start
 * button. Pressing start clears to empty black, shows "welcome" then
 * "welcome to", flashes white, then fades away to reveal the first menu.
 */
export default function LoadingScreen({ customMaps, mapsReady, onStartPressed, onEntered }: LoadingScreenProps) {
  // Progress units: every static file + fonts + beatmap library + song prep.
  const totalUnits = BOOT_STATIC_ASSETS.length + 3;
  const [doneUnits, setDoneUnits] = useState(0);
  const [staticDone, setStaticDone] = useState(false);
  const [track, setTrack] = useState<PreparedLaunchTrack | null>(null);
  const [stage, setStage] = useState<Stage>('loading');

  // Phase 1: warm every bundled static file plus fonts.
  // Deliberately re-runnable (no started guard): React StrictMode
  // unmounts/remounts effects in dev, and a permanent guard would leave the
  // surviving pass with a cancelled run. Repeat fetches are cache-warm.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await preloadStaticAssets((done) => {
        if (!cancelled) setDoneUnits(done);
      });
      await waitForBootFonts();
      if (!cancelled) {
        setDoneUnits(BOOT_STATIC_ASSETS.length + 1);
        setStaticDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 2: once the beatmap library has loaded, prep the launch song.
  useEffect(() => {
    if (!staticDone || !mapsReady || track !== null) return;
    let cancelled = false;
    setDoneUnits(BOOT_STATIC_ASSETS.length + 2);
    void (async () => {
      const prepared = await prepareLaunchMenuTrack(customMaps);
      if (cancelled) return;
      // Decode the launch song to an AudioBuffer BEFORE showing the start
      // button, so the press fires a synchronous start(0) with no HTMLAudio
      // startup delay — the same instant path as the d1/d2/d3 menu clicks.
      try {
        await warmMenuMusic(prepared.src ?? MENU_FALLBACK_TRACK);
      } catch {
        /* play() still falls back to HTMLAudio if warming failed */
      }
      if (!cancelled) {
        setTrack(prepared);
        setDoneUnits(totalUnits);
        setStage('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticDone, mapsReady, track]);

  // Farewell sequence after the start button fires.
  useEffect(() => {
    if (stage === 'blank') {
      const timer = window.setTimeout(() => setStage('welcome'), BLANK_MS);
      return () => window.clearTimeout(timer);
    }
    if (stage === 'welcome') {
      const timer = window.setTimeout(() => setStage('welcome-to'), WELCOME_MS);
      return () => window.clearTimeout(timer);
    }
    if (stage === 'welcome-to') {
      const timer = window.setTimeout(() => setStage('white'), WELCOME_TO_MS);
      return () => window.clearTimeout(timer);
    }
    if (stage === 'white') {
      const timer = window.setTimeout(() => setStage('fade'), WHITE_MS);
      return () => window.clearTimeout(timer);
    }
    if (stage === 'fade') {
      const timer = window.setTimeout(onEntered, FADE_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [stage, onEntered]);

  const pct = Math.max(0, Math.min(100, (doneUnits / totalUnits) * 100));
  const isWhite = stage === 'white' || stage === 'fade';

  return (
    <div
      id="boot-loading-screen"
      className={`fixed inset-0 z-[100] flex items-center justify-center ${
        isWhite ? 'bg-white' : 'bg-black'
      } ${stage === 'fade' ? 'pointer-events-none opacity-0 transition-opacity duration-1000 ease-out' : ''}`}
      role="status"
      aria-label="Loading RhythmMania"
    >
      {stage === 'loading' && (
        <div
          id="boot-loading-bar-track"
          className="h-[3px] w-64 overflow-hidden rounded-full bg-white/15"
        >
          <div
            id="boot-loading-bar-fill"
            className="h-full bg-white transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {stage === 'ready' && track && (
        <button
          id="boot-start-button"
          type="button"
          onClick={() => {
            onStartPressed(track);
            setStage('blank');
          }}
          className="rounded-full bg-white px-12 py-3 text-lg font-black lowercase tracking-widest text-black transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
        >
          start!
        </button>
      )}
      {stage === 'welcome' && (
        <p className="text-xl font-light lowercase tracking-[0.35em] text-white">
          welcome
        </p>
      )}
      {stage === 'welcome-to' && (
        <p className="text-xl font-light lowercase tracking-[0.35em] text-white">
          welcome to
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {stage === 'ready'
          ? 'Loading complete. Press start to enter.'
          : stage === 'welcome' || stage === 'welcome-to'
            ? 'Welcome to RhythmMania.'
            : 'Loading game assets.'}
      </span>
    </div>
  );
}
