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
import { MainMenu, menuCookieSize } from '../src/components/MainMenu';
import {
  filledTriangleAimCount,
  LAZER_COOKIE_MARK,
  LAZER_COOKIE_TITLE,
  LAZER_COOKIE_VERSION,
  LAZER_FILLED_MAX,
  LAZER_OUTLINE_FADE_MS,
  LAZER_OUTLINE_SPAWN_LAZER_MS,
  LAZER_OUTLINE_SPAWN_MS,
  LAZER_TRIANGLE_COLOUR_DARK,
  LAZER_TRIANGLE_COLOUR_LIGHT,
  LAZER_TRIANGLE_FIELD_BG,
} from '../src/ui/lazer';

const TOKEN_CSS = readFileSync(resolve(import.meta.dirname, '../src/ui/lazer/tokens.css'), 'utf8');

function renderMenu(): string {
  return renderToStaticMarkup(
    React.createElement(MainMenu, {
      onNavigate: () => undefined,
      onOpenSettings: () => undefined,
    }),
  );
}

describe('TASK-V-010: main menu idle', () => {
  it('renders a full-bleed idle field with centred RM cookie and triangle canvas', () => {
    const html = renderMenu();
    expect(html).toContain('id="lazer-main-menu"');
    expect(html).toContain('data-menu-phase="idle"');
    expect(html).toContain('id="lazer-cookie"');
    expect(html).toContain('id="lazer-triangle-field"');
    expect(html).toContain(LAZER_COOKIE_TITLE);
    expect(html).toContain(LAZER_COOKIE_VERSION);
    expect(html).toContain('lazer-cookie-spectrum');
    // Brand chrome must not use the osu! mark — the only allowed mention is
    // the legal non-affiliation disclaimer strip.
    const withoutLegal = html.replace(/<div class="pointer-events-none flex flex-wrap.*?<\/div>/s, '');
    expect(withoutLegal.toLowerCase()).not.toContain('osu');
    expect(html).toContain('Not affiliated with ppy / osu!');
    expect(html).toContain('terms and conditions');
    expect(html).toContain('privacy policy');
  });

  it('does not render the stacked action cards, footer, or toolbar chrome', () => {
    const html = renderMenu();
    expect(html).not.toContain('Click to play');
    expect(html).not.toContain('SOLO');
    expect(html).not.toContain('id="main-header"');
    expect(html).not.toContain('lazer-footer-back');
    expect(html).not.toMatch(/settings<\/span>/i);
  });

  it('locks the navy field colours and capped outline spawn from the plan', () => {
    expect(LAZER_TRIANGLE_FIELD_BG).toBe('#0d1520');
    expect(LAZER_TRIANGLE_COLOUR_DARK).toBe('#0d1520');
    expect(LAZER_TRIANGLE_COLOUR_LIGHT.toLowerCase()).toMatch(/^#[0-9a-f]{6}$/);
    expect(LAZER_OUTLINE_SPAWN_LAZER_MS).toBe(22);
    expect(LAZER_OUTLINE_FADE_MS).toBe(120);
    expect(LAZER_OUTLINE_SPAWN_MS).toBeGreaterThanOrEqual(LAZER_OUTLINE_SPAWN_LAZER_MS);
    expect(filledTriangleAimCount(1280, 720)).toBeLessThanOrEqual(LAZER_FILLED_MAX);
    expect(TOKEN_CSS).toContain('.lazer-main-menu');
    expect(TOKEN_CSS).toContain('--lazer-menu-field');
  });

  it('keeps the cookie large enough to tap on a phone viewport', () => {
    expect(menuCookieSize(1280, 720)).toBeGreaterThanOrEqual(280);
    expect(menuCookieSize(390, 844)).toBeGreaterThanOrEqual(200);
    expect(menuCookieSize(390, 844)).toBeLessThanOrEqual(220);
  });
});
