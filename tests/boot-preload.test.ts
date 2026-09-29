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
 * Tests for the boot loading screen: static asset manifest coverage and
 * launch-track preparation (beatmapset 2153231 vs. fallback).
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
import {
  LAUNCH_MENU_BEATMAPSET_ID,
  findLaunchMenuTrackMap,
  isLaunchMenuSetMap,
  prepareLaunchMenuTrack,
} from '../src/utils/launchMenuTrack';
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

function fakeSetMap(overrides: Partial<Beatmap> = {}): Beatmap {
  return fakeMap({
    id: `osuapi_${LAUNCH_MENU_BEATMAPSET_ID}_b1_checksum`,
    catalogSetId: `osuapi_${LAUNCH_MENU_BEATMAPSET_ID}`,
    sourceSetId: LAUNCH_MENU_BEATMAPSET_ID,
    packageId: `osuapi_${LAUNCH_MENU_BEATMAPSET_ID}`,
    ...overrides,
  } as Partial<Beatmap>);
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

  it('falls back to triangles.mp3 when beatmapset 2153231 is not downloaded', async () => {
    mockedUnpack.mockClear();
    const track = await prepareLaunchMenuTrack([
      fakeMap({ id: 'other_map', audioUrl: 'blob:other-audio' }),
    ]);
    expect(track).toEqual({ mapId: null, src: null });
    expect(mockedUnpack).not.toHaveBeenCalled();
  });

  it('falls back when the 2153231 song has no unpackable audio', async () => {
    mockedUnpack.mockClear();
    const track = await prepareLaunchMenuTrack([fakeSetMap()]);
    expect(track).toEqual({ mapId: null, src: null });
    expect(mockedUnpack).toHaveBeenCalledTimes(1);
  });

  it('returns the 2153231 audio without unpacking when audio is ready', async () => {
    mockedUnpack.mockClear();
    const map = fakeSetMap({ id: 'osuapi_2153231_map_9', audioUrl: 'blob:fake-audio' });
    const track = await prepareLaunchMenuTrack([map]);
    expect(track).toEqual({ mapId: 'osuapi_2153231_map_9', src: 'blob:fake-audio' });
    expect(mockedUnpack).not.toHaveBeenCalled();
  });

  it('prefers the 2153231 set over other installed songs', async () => {
    mockedUnpack.mockClear();
    const other = fakeMap({ id: 'other_map', audioUrl: 'blob:other-audio' });
    const setMap = fakeSetMap({ id: 'osuapi_2153231_preferred', audioUrl: 'blob:set-audio' });
    expect(isLaunchMenuSetMap(setMap)).toBe(true);
    expect(isLaunchMenuSetMap(other)).toBe(false);
    expect(findLaunchMenuTrackMap([other, setMap])?.id).toBe('osuapi_2153231_preferred');
    const track = await prepareLaunchMenuTrack([other, setMap]);
    expect(track).toEqual({ mapId: 'osuapi_2153231_preferred', src: 'blob:set-audio' });
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
