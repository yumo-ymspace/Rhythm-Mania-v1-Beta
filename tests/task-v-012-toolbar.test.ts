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
import { LazerToolbar, ToolbarTooltip } from '../src/ui/lazer/LazerToolbar';

describe('TASK-V-012: lazer toolbar + hover tooltips', () => {
  it('renders LazerToolbar in visible state with core buttons and mania active', () => {
    const html = renderToStaticMarkup(
      React.createElement(LazerToolbar, {
        visible: true,
        localDisplayName: 'TestPlayer',
        isListingOpen: false,
        isNowPlayingOpen: false,
      })
    );

    expect(html).toContain('id="lazer-toolbar"');
    expect(html).toContain('is-visible');
    expect(html).toContain('id="toolbar-btn-settings"');
    expect(html).toContain('id="toolbar-btn-home"');
    expect(html).toContain('href="https://changelog.rhythm-mania.com"');
    expect(html).toContain('href="https://discord.rhythm-mania.com"');
    expect(html).toContain('href="https://github.rhythm-mania.com"');
    expect(html).toContain('href="https://bug-report.rhythm-mania.com"');
    expect(html).toContain('href="https://wiki.rhythm-mania.com"');
    expect(html).toContain('id="toolbar-btn-listing"');
    expect(html).toContain('id="toolbar-btn-now-playing"');
    expect(html).toContain('id="toolbar-profile"');
    expect(html).toContain('TestPlayer');
    expect(html).toContain('id="toolbar-clock"');
    expect(html).toContain('id="toolbar-btn-notifications"');
  });

  it('renders active pink state on listing button when listing is open', () => {
    const html = renderToStaticMarkup(
      React.createElement(LazerToolbar, {
        visible: true,
        isListingOpen: true,
      })
    );

    expect(html).toContain('id="toolbar-btn-listing" class="lazer-toolbar-btn is-active-pink"');
  });

  it('renders active pink state on now-playing button when now playing is open', () => {
    const html = renderToStaticMarkup(
      React.createElement(LazerToolbar, {
        visible: true,
        isNowPlayingOpen: true,
      })
    );

    expect(html).toContain('id="toolbar-btn-now-playing" class="lazer-toolbar-btn is-active-pink"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('renders hidden state when visible=false', () => {
    const html = renderToStaticMarkup(
      React.createElement(LazerToolbar, {
        visible: false,
      })
    );

    expect(html).toContain('is-hidden');
  });

  it('renders ToolbarTooltip correctly with title, subtitle, and shortcut', () => {
    const mockRect = {
      left: 100,
      top: 0,
      right: 140,
      bottom: 40,
      width: 40,
      height: 40,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const html = renderToStaticMarkup(
      React.createElement(ToolbarTooltip, {
        data: {
          title: 'beatmap listing',
          subtitle: 'browse for new beatmaps',
          shortcut: 'CTRL-B',
        },
        anchorRect: mockRect,
      })
    );

    expect(html).toContain('lazer-toolbar-tooltip');
    expect(html).toContain('beatmap listing');
    expect(html).toContain('browse for new beatmaps');
    expect(html).toContain('CTRL-B');
  });

  it('renders ToolbarTooltip with align=right correctly', () => {
    const mockRect = {
      left: 1100,
      top: 0,
      right: 1200,
      bottom: 40,
      width: 100,
      height: 40,
      x: 1100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const html = renderToStaticMarkup(
      React.createElement(ToolbarTooltip, {
        data: {
          title: 'clock',
          subtitle: 'session elapsed: 00:00:00',
          align: 'right',
        },
        anchorRect: mockRect,
      })
    );

    expect(html).toContain('lazer-toolbar-tooltip');
    expect(html).toContain('is-align-right');
    expect(html).toContain('clock');
    expect(html).toContain('session elapsed: 00:00:00');
  });
});
