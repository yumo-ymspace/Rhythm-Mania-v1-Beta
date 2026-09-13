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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';
import {
  beatPeriodSeconds,
  FooterBackButton,
  idleSpectrum,
  LAZER_BACK_FOOTER,
  LAZER_COOKIE_BAR_COUNT,
  LAZER_COOKIE_MARK,
  LAZER_COOKIE_TITLE,
  LAZER_COOKIE_VERSION,
  LAZER_CSS_VARS,
  LAZER_DURATION,
  LAZER_EASE_IN_OUT_SINE,
  LAZER_EASE_IN_SINE,
  LAZER_EASE_OUT_EXPO,
  LAZER_EASE_OUT_QUINT,
  LAZER_HOVER_WIDTH_SPRING,
  LAZER_MENU_WEDGE,
  LAZER_PINK,
  LAZER_PINK_LIGHT,
  LAZER_SHEAR_DEG,
  LAZER_UNSHEAR_DEG,
  LazerCookie,
  resolveLazerChrome,
  Shear,
} from '../src/ui/lazer';

const TOKEN_CSS = readFileSync(resolve(import.meta.dirname, '../src/ui/lazer/tokens.css'), 'utf8');

function visualSettings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('TASK-V-001: lazer motion tokens and primitives', () => {
  it('locks the house easings and shear from the plan', () => {
    expect(LAZER_EASE_OUT_QUINT).toEqual([0.22, 1, 0.36, 1]);
    expect(LAZER_EASE_OUT_EXPO).toEqual([0.16, 1, 0.3, 1]);
    expect(LAZER_EASE_IN_SINE).toEqual([0.12, 0, 0.39, 0]);
    expect(LAZER_EASE_IN_OUT_SINE).toEqual([0.37, 0, 0.63, 1]);
    expect(LAZER_HOVER_WIDTH_SPRING).toEqual({ type: 'spring', duration: 0.5, bounce: 0.35 });
    expect(LAZER_SHEAR_DEG).toBe(-11.31);
    expect(LAZER_UNSHEAR_DEG).toBe(11.31);
    expect(LAZER_MENU_WEDGE).toBe(0.2);
    expect(LAZER_DURATION.menuButton).toBe(0.5);
    expect(LAZER_DURATION.menuButtonFade).toBeCloseTo(500 / 6 / 1000);
    expect(LAZER_DURATION.overlay).toBe(0.2);
    expect(LAZER_PINK).toBe('#e967a1');
    expect(LAZER_PINK_LIGHT).toBe('#ff7db7');
    expect(LAZER_BACK_FOOTER).toBe('#e91e8a');
  });

  it('scopes CSS tokens to html[data-ui="lazer"] and includes reduced-motion', () => {
    expect(TOKEN_CSS).toContain('html[data-ui="lazer"]');
    expect(TOKEN_CSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(TOKEN_CSS).toContain('--lazer-dur-overlay: 200ms');
    expect(TOKEN_CSS).toContain('--lazer-cookie-pulse-amp: 1');
    for (const name of LAZER_CSS_VARS) {
      expect(TOKEN_CSS).toContain(`${name}:`);
    }
    expect(TOKEN_CSS.toLowerCase()).not.toContain('osu!');
  });

  it('enables lazer chrome for Argon and drops it for legacy skins', () => {
    expect(resolveLazerChrome(visualSettings())).toEqual({ skin: 'argon', ui: 'lazer' });
    expect(resolveLazerChrome(visualSettings({ skinId: 'argon' }))).toEqual({ skin: 'argon', ui: 'lazer' });
    expect(resolveLazerChrome(visualSettings({ skinId: 'rhythmmania' }))).toEqual({ skin: 'legacy', ui: null });
    expect(resolveLazerChrome(visualSettings({ playfieldStyle: 'circle' }))).toEqual({ skin: 'legacy', ui: null });
  });

  it('renders the cookie as an RM disc with spectrum and inner triangles, never osu!', () => {
    const html = renderToStaticMarkup(React.createElement(LazerCookie, { size: 280, pulse: false }));
    expect(html).toContain('id="lazer-cookie"');
    expect(html).toContain('data-lazer-cookie');
    expect(html).toContain(LAZER_COOKIE_MARK.split(' ')[0]);
    expect(html).toContain(LAZER_COOKIE_TITLE);
    expect(html).toContain(LAZER_COOKIE_VERSION);
    expect(html).toContain('lazer-cookie-spectrum');
    expect(html).toContain('lazer-cookie-triangles');
    expect(html).toContain('aria-label="RhythmMania"');
    expect(html.toLowerCase()).not.toContain('osu');
    expect((html.match(/lazer-cookie-bar/g) ?? []).length).toBe(LAZER_COOKIE_BAR_COUNT);
    expect(idleSpectrum(0)).toBeGreaterThan(0);
    expect(idleSpectrum(0)).toBeLessThanOrEqual(1);
  });

  it('shears the wrapper and unshears children', () => {
    const html = renderToStaticMarkup(
      React.createElement(Shear, null, React.createElement('span', null, 'Back')),
    );
    expect(html).toContain('lazer-shear');
    expect(html).toContain('lazer-unshear');
    expect(html).toContain('Back');
  });

  it('renders the footer Back pill with shear', () => {
    const html = renderToStaticMarkup(React.createElement(FooterBackButton, { label: 'Back' }));
    expect(html).toContain('id="lazer-footer-back"');
    expect(html).toContain('lazer-footer-back');
    expect(html).toContain('lazer-shear');
    expect(html).toContain('Back');
    expect(html.toLowerCase()).not.toContain('osu');
  });

  it('maps idle BPM to a beat period', () => {
    expect(beatPeriodSeconds(60)).toBe(1);
    expect(beatPeriodSeconds(120)).toBe(0.5);
    expect(beatPeriodSeconds(0)).toBe(1);
  });
});
