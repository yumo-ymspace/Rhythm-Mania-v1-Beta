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
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SongSelectFooter } from '../src/ui/lazer/SongSelectFooter';

describe('TASK-V-020: song select shell + footer + parked cookie', () => {
  it('renders SongSelectFooter with Back, Mods, Random, Options and parked LazerCookie', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongSelectFooter, {
        onBack: () => {},
        onOpenMods: () => {},
        onRandom: () => {},
        onToggleOptions: () => {},
        onStartPlay: () => {},
        canPlay: true,
        selectedModsCount: 2,
        previewBpm: 180,
        isOptionsOpen: false,
      })
    );

    expect(html).toContain('id="song-select-lazer-footer"');
    expect(html).toContain('id="lazer-footer-back"');
    expect(html).toContain('Back');
    expect(html).toContain('id="bottom-mods-button"');
    expect(html).toContain('Mods');
    expect(html).not.toContain('lazer-footer-hotkey-badge');
    expect(html).not.toContain('>F1<');
    expect(html).toContain('2'); // selected mods count badge
    expect(html).toContain('id="bottom-random-button"');
    expect(html).toContain('Random');
    expect(html).not.toContain('>F2<');
    expect(html).toContain('id="bottom-options-button"');
    expect(html).toContain('Options');
    expect(html).not.toContain('>F3<');
    expect(html).toContain('lazer-parked-cookie');
    expect(html).toContain('data-lazer-cookie');
  });

  it('renders active class on options button when isOptionsOpen is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongSelectFooter, {
        onBack: () => {},
        onOpenMods: () => {},
        onRandom: () => {},
        onToggleOptions: () => {},
        onStartPlay: () => {},
        canPlay: false,
        selectedModsCount: 0,
        previewBpm: 140,
        isOptionsOpen: true,
        optionsContent: React.createElement('div', { id: 'test-options-popover' }, 'Options Popover Content'),
      })
    );

    expect(html).toContain('id="bottom-options-button"');
    expect(html).toContain('is-active');
    expect(html).toContain('id="test-options-popover"');
    expect(html).toContain('cursor-not-allowed opacity-50');
  });
});
