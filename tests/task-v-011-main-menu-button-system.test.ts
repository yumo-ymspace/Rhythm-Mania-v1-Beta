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
import { MainMenu } from '../src/components/MainMenu';
import { ButtonSystem } from '../src/ui/lazer/ButtonSystem';

describe('TASK-V-011: main menu button system', () => {
  it('renders ButtonSystem in top-level phase with settings, play, edit, browse, exit', () => {
    const html = renderToStaticMarkup(
      React.createElement(ButtonSystem, {
        phase: 'top-level',
        onSelectPlay: () => undefined,
        onSelectSolo: () => undefined,
        onOpenSettings: () => undefined,
        onOpenBrowse: () => undefined,
        onBackToTopLevel: () => undefined,
      })
    );

    expect(html).toContain('data-button-system-phase="top-level"');
    expect(html).toContain('id="menu-btn-settings"');
    expect(html).toContain('id="menu-btn-play"');
    expect(html).toContain('id="menu-btn-edit"');
    expect(html).toContain('id="menu-btn-browse"');
    expect(html).toContain('id="menu-btn-exit"');

    // edit is disabled
    expect(html).toContain('disabled=""');
    expect(html).toContain('title="Beatmap editor is coming in a future update"');
  });

  it('renders ButtonSystem in play phase with back, solo, multi, playlists', () => {
    const html = renderToStaticMarkup(
      React.createElement(ButtonSystem, {
        phase: 'play',
        onSelectPlay: () => undefined,
        onSelectSolo: () => undefined,
        onOpenSettings: () => undefined,
        onOpenBrowse: () => undefined,
        onBackToTopLevel: () => undefined,
      })
    );

    expect(html).toContain('data-button-system-phase="play"');
    expect(html).toContain('id="menu-btn-back"');
    expect(html).toContain('id="menu-btn-solo"');
    expect(html).toContain('id="menu-btn-multi"');
    expect(html).toContain('id="menu-btn-playlists"');

    // multi and playlists are disabled
    expect(html).toContain('title="Multiplayer is coming in a future update"');
    expect(html).toContain('title="Playlists are coming in a future update"');
  });

  it('renders MainMenu in idle by default without button strip', () => {
    const html = renderToStaticMarkup(
      React.createElement(MainMenu, {
        onNavigate: () => undefined,
        onOpenSettings: () => undefined,
      })
    );

    expect(html).toContain('data-menu-phase="idle"');
    expect(html).not.toContain('data-button-system-phase');
  });
});
