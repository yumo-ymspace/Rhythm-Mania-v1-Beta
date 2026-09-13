/*
 * Tests for the boot loading screen: static asset manifest coverage and
 * launch-track preparation (fallback vs. installed song).
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/unpackHelper', () => ({
  unpackBeatmap: vi.fn(async () => {}),
}));

import { unpackBeatmap } from '../src/utils/unpackHelper';
import {
  BOOT_MENU_BACKGROUNDS,
  BOOT_STATIC_ASSETS,
} from '../src/utils/assetPreloader';
import { prepareLaunchMenuTrack } from '../src/utils/launchMenuTrack';
import LoadingScreen from '../src/components/LoadingScreen';
import type { Beatmap } from '../src/types';

const mockedUnpack = vi.mocked(unpackBeatmap);

function fakeMap(overrides: Partial<Beatmap> = {}): Beatmap {
  return {
    id: 'map_1',
    title: 'Triangles',
    artist: 'cYsmix',
    creator: 'cYsmix',
    difficulty: 'Insane',
    keyCount: 4,
    notes: [],
    audioUrl: '',
    ...overrides,
  } as Beatmap;
}

describe('boot static asset manifest', () => {
  it('covers every menu sound, background, skin preview, and chrome file', () => {
    expect(BOOT_STATIC_ASSETS.length).toBeGreaterThan(30);
    expect(new Set(BOOT_STATIC_ASSETS).size).toBe(BOOT_STATIC_ASSETS.length);
    for (const url of BOOT_STATIC_ASSETS) {
      expect(url.startsWith('/')).toBe(true);
    }
    expect(BOOT_MENU_BACKGROUNDS).toHaveLength(16);
    for (const name of BOOT_MENU_BACKGROUNDS) {
      expect(BOOT_STATIC_ASSETS).toContain(`/backgrounds/${name}`);
    }
    for (const sound of ['triangles.mp3', 'd1.mp3', 'd2.mp3', 'd3.mp3', 'click.mp3']) {
      expect(BOOT_STATIC_ASSETS).toContain(`/sounds/${sound}`);
    }
  });
});

describe('prepareLaunchMenuTrack', () => {
  it('resolves to the fallback track when no beatmaps are installed', async () => {
    mockedUnpack.mockClear();
    const track = await prepareLaunchMenuTrack([]);
    expect(track).toEqual({ mapId: null, src: null });
    expect(mockedUnpack).not.toHaveBeenCalled();
  });

  it('falls back when the rolled song has no unpackable audio', async () => {
    mockedUnpack.mockClear();
    // Pool of [fallback, song]: rand in [0.5, 1) rolls the song.
    const track = await prepareLaunchMenuTrack([fakeMap()], () => 0.75);
    expect(track).toEqual({ mapId: null, src: null });
    expect(mockedUnpack).toHaveBeenCalledTimes(1);
  });

  it('returns the installed song without unpacking when audio is ready', async () => {
    mockedUnpack.mockClear();
    const track = await prepareLaunchMenuTrack(
      [fakeMap({ id: 'map_9', audioUrl: 'blob:fake-audio' })],
      () => 0.75,
    );
    expect(track).toEqual({ mapId: 'map_9', src: 'blob:fake-audio' });
    expect(mockedUnpack).not.toHaveBeenCalled();
  });
});

describe('LoadingScreen initial markup', () => {
  it('covers the screen in black with only the white loading bar', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingScreen, {
        customMaps: [],
        mapsReady: false,
        onStartPressed: () => {},
        onEntered: () => {},
      }),
    );
    expect(html).toContain('id="boot-loading-screen"');
    expect(html).toContain('bg-black');
    expect(html).toContain('id="boot-loading-bar-fill"');
    expect(html).toContain('bg-white');
    expect(html).not.toContain('id="boot-start-button"');
  });
});
