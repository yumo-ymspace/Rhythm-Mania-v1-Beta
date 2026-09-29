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

/*
 * Tests for the Now Playing player bar: track metadata, transport controls,
 * seek slider semantics, and no "Nothing to play" empty-state text.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NowPlayingPanel } from '../src/ui/lazer/NowPlayingPanel';

function renderPanel(track: React.ComponentProps<typeof NowPlayingPanel>['track']) {
  return renderToStaticMarkup(
    React.createElement(NowPlayingPanel, {
      track,
      isPlaying: true,
      currentTime: 30,
      duration: 180,
      shuffle: true,
      controlsEnabled: true,
      onToggleShuffle: vi.fn(),
      onPrevious: vi.fn(),
      onTogglePlay: vi.fn(),
      onNext: vi.fn(),
      onSeek: vi.fn(),
    }),
  );
}

describe('now playing panel', () => {
  it('renders track title/artist with transport controls and seek slider', () => {
    const html = renderPanel({
      kind: 'preview',
      title: 'Galaxy Collapse',
      artist: 'Kurokotei',
      bgUrl: '',
      src: 'blob:preview',
    });

    expect(html).toContain('id="now-playing-panel"');
    expect(html).toContain('Galaxy Collapse');
    expect(html).toContain('Kurokotei');
    expect(html).toContain('aria-label="Previous track"');
    expect(html).toContain('aria-label="Pause"');
    expect(html).toContain('aria-label="Next track"');
    expect(html).toContain('aria-label="Shuffle"');
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuemax="180"');
  });

  it('shows "Nothing Playing Now!" with no track and never a "Nothing to play" state', () => {
    const withTrack = renderPanel({
      kind: 'menu',
      title: 'triangles',
      artist: '',
      bgUrl: '',
      src: '/sounds/triangles.mp3',
    });
    const withoutTrack = renderPanel(null);

    expect(withTrack).not.toContain('Nothing to play');
    expect(withoutTrack).not.toContain('Nothing to play');
    expect(withoutTrack).toContain('Nothing Playing Now!');
    expect(withoutTrack).toContain('is-idle');
    expect(withoutTrack).toContain('id="now-playing-panel"');
  });

  it('shows "Loading song..." while a switch is in flight', () => {
    const html = renderToStaticMarkup(
      React.createElement(NowPlayingPanel, {
        track: { kind: 'preview', title: 'Old Song', artist: 'a', bgUrl: '', src: 'blob:old' },
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        shuffle: false,
        controlsEnabled: true,
        loading: true,
        onToggleShuffle: vi.fn(),
        onPrevious: vi.fn(),
        onTogglePlay: vi.fn(),
        onNext: vi.fn(),
        onSeek: vi.fn(),
      }),
    );

    expect(html).toContain('Loading song...');
    expect(html).not.toContain('Old Song');
  });

  it('disables controls when controlsEnabled is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(NowPlayingPanel, {
        track: { kind: 'preview', title: 't', artist: 'a', bgUrl: '', src: 'blob:x' },
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        shuffle: false,
        controlsEnabled: false,
        onToggleShuffle: vi.fn(),
        onPrevious: vi.fn(),
        onTogglePlay: vi.fn(),
        onNext: vi.fn(),
        onSeek: vi.fn(),
      }),
    );

    expect(html).toContain('disabled');
    expect(html).toContain('aria-label="Play"');
  });
});
