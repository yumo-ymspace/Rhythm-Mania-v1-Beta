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
import { isArgonSkin } from '../../render/argonSkin';
import type { PlayfieldVisualSettings } from '../../render/types';

/** osu!framework Easing.OutQuint — house settle ease. */
export const LAZER_EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
/** osu!framework Easing.OutExpo — logo return, button contract, click flash. */
export const LAZER_EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
/** osu!framework Easing.InSine — button-bar flatten. */
export const LAZER_EASE_IN_SINE = [0.12, 0, 0.39, 0] as const;
/** osu!framework Easing.InOutSine — hover icon tilt on beat. */
export const LAZER_EASE_IN_OUT_SINE = [0.37, 0, 0.63, 1] as const;

/** Menu button hover width only. */
export const LAZER_HOVER_WIDTH_SPRING = {
  type: 'spring',
  duration: 0.5,
  bounce: 0.35,
} as const;

export const LAZER_SHEAR_DEG = -11.31;
export const LAZER_UNSHEAR_DEG = 11.31;
/** WEDGE_WIDTH / BUTTON_AREA_HEIGHT (20 / 100). */
export const LAZER_MENU_WEDGE = 0.2;

export const LAZER_PINK = '#e967a1';
export const LAZER_PINK_LIGHT = '#ff7db7';
export const LAZER_YELLOW = '#ffcc22';
export const LAZER_YELLOW_DARK = '#eeaa00';
export const LAZER_GREEN = '#88b300';
export const LAZER_QUIT = 'rgb(170, 27, 39)';
export const LAZER_PLAY = 'rgb(102, 68, 204)';
export const LAZER_EDIT = 'rgb(238, 170, 0)';
export const LAZER_BROWSE = 'rgb(165, 204, 0)';
export const LAZER_EXIT = 'rgb(238, 51, 153)';
export const LAZER_BACK = 'rgb(51, 58, 94)';
export const LAZER_SETTINGS = 'rgb(85, 85, 85)';
export const LAZER_BAR_GRAY = 'rgb(50, 50, 50)';
export const LAZER_BACK_FOOTER = '#e91e8a';

/** Durations in seconds for Motion. CSS counterparts live on html[data-ui="lazer"]. */
export const LAZER_DURATION = {
  menuButton: 0.5,
  menuButtonFade: 500 / 6 / 1000,
  menuExplode: 0.2,
  menuHover: 0.5,
  barFade: 0.3,
  barFlatten: 0.3,
  barRestore: 0.4,
  logoToTopLevel: 0.2,
  logoToIdle: 0.8,
  barDelay: 0.15,
  overlay: 0.2,
  tooltip: 0.15,
  popover: 0.18,
  resultsHero: 0.35,
  carousel: 0.3,
  clickFlash: 0.8,
  logoPark: 5,
  logoParkFade: 0.3,
} as const;

export const LAZER_MENU_BUTTON_WIDTH_PX = 140;
export const LAZER_HOVER_SCALE = 1.2;
export const LAZER_BOUNCE_COMPRESSION = 0.9;
export const LAZER_BOUNCE_ROTATION_DEG = 8;
export const LAZER_OVERLAY_BG_ALPHA = 0.75;
export const LAZER_COOKIE_PULSE_AMP = 0.04;

export const LAZER_CSS_VARS = [
  '--lazer-ease-out-quint',
  '--lazer-ease-out-expo',
  '--lazer-ease-in-sine',
  '--lazer-ease-in-out-sine',
  '--lazer-shear',
  '--lazer-unshear',
  '--lazer-menu-wedge',
  '--lazer-pink',
  '--lazer-pink-light',
  '--lazer-yellow',
  '--lazer-yellow-dark',
  '--lazer-green',
  '--lazer-quit',
  '--lazer-play',
  '--lazer-edit',
  '--lazer-browse',
  '--lazer-exit',
  '--lazer-back',
  '--lazer-settings',
  '--lazer-bar-gray',
  '--lazer-back-footer',
] as const;

export function lazerTransition(
  durationSec: number,
  ease: readonly number[] = LAZER_EASE_OUT_QUINT,
) {
  return { duration: durationSec, ease: [...ease] };
}

export function beatPeriodSeconds(bpm: number): number {
  const safe = Number.isFinite(bpm) && bpm > 0 ? bpm : 60;
  return 60 / safe;
}

export type LazerChromeAttrs = {
  skin: 'argon' | 'legacy';
  ui: 'lazer' | null;
};

export function resolveLazerChrome(settings: PlayfieldVisualSettings): LazerChromeAttrs {
  const argon = isArgonSkin(settings);
  return {
    skin: argon ? 'argon' : 'legacy',
    ui: argon ? 'lazer' : null,
  };
}

export function applyLazerChrome(settings: PlayfieldVisualSettings, root: HTMLElement = document.documentElement): void {
  const chrome = resolveLazerChrome(settings);
  root.dataset.skin = chrome.skin;
  if (chrome.ui) {
    root.dataset.ui = chrome.ui;
  } else {
    delete root.dataset.ui;
  }
}

export function useLazerReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return reduced;
}
