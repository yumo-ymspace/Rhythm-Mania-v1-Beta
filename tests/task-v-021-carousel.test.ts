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
import { SongSelectCarousel, type CarouselSongGroup } from '../src/ui/lazer/SongSelectCarousel';
import type { Beatmap, PlayHistoryRecord } from '../src/types';

describe('TASK-V-021: Song Select Carousel', () => {
  const dummyMapA: Beatmap = {
    id: 'test-map-1',
    title: 'Test Track Alpha',
    artist: 'Artist One',
    bpm: 175,
    creator: 'MapperA',
    difficulty: 'Easy',
    keyCount: 4,
    duration: 120,
    notes: [],
    hpDrainRate: 5,
    overallDifficulty: 7,
    timingPoints: [],
    sliderMultiplier: 1.4,
  };

  const dummyMapB: Beatmap = {
    id: 'test-map-2',
    title: 'Test Track Alpha',
    artist: 'Artist One',
    bpm: 175,
    creator: 'MapperA',
    difficulty: 'Insane',
    keyCount: 4,
    duration: 120,
    notes: [],
    hpDrainRate: 6,
    overallDifficulty: 8.5,
    timingPoints: [],
    sliderMultiplier: 1.4,
  };

  const mockGroups: CarouselSongGroup[] = [
    {
      songKey: 'Artist One - Test Track Alpha',
      title: 'Test Track Alpha',
      artist: 'Artist One',
      creator: 'MapperA',
      maps: [dummyMapA, dummyMapB],
    },
  ];

  const mockHistory: PlayHistoryRecord[] = [
    {
      id: 'rec-1',
      beatmapId: 'test-map-1',
      beatmapTitle: 'Other Song',
      beatmapArtist: 'Artist',
      keyCount: 4,
      isFailed: false,
      replayFrames: [],
      score: 985000,
      accuracy: 99.2,
      grade: 'S',
      mods: [],
      timestamp: Date.now(),
      maxCombo: 500,
      scoreState: {
        score: 985000,
        accuracy: 99.2,
        combo: 500,
        maxCombo: 500,
        hp: 100,
        perfectCount: 90,
        marvelousCount: 400,
        greatCount: 10,
        goodCount: 0,
        badCount: 0,
        missCount: 0,
        completed: true,
        failed: false,
        unstableRate: 45.2,
        hitErrorSampleCount: 500,
        columnJudgements: [],
        isAutoplay: false,
      },
    },
  ];

  it('renders collapsed set card with title, artist, LOCAL pill, key dots, and mania pill', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongSelectCarousel, {
        songGroups: mockGroups,
        selectedGroupKey: 'Other Song',
        expandedSongKey: 'Other Song',
        selectedMapId: '',
        favoriteSongs: [],
        playHistory: [],
        onSelectGroup: () => {},
        onSelectDifficulty: () => {},
        onStartPlay: () => {},
        onToggleFavorite: () => {},
        getStarRating: (m) => (m.id === 'test-map-1' ? 2.4 : 5.8),
        getGradeBadgeClass: () => 'text-emerald-400',
      })
    );

    expect(html).toContain('Test Track Alpha');
    expect(html).toContain('Artist One');
    expect(html).toContain('LOCAL');
    expect(html).toContain('Mania');
    expect(html).not.toContain('diffs');
    expect(html).toContain('bg-cyan-400'); // 4K key dot color
  });

  it('renders expanded difficulty rows with star badge, 10-dot meter, and diff name', () => {
    const html = renderToStaticMarkup(
      React.createElement(SongSelectCarousel, {
        songGroups: mockGroups,
        selectedGroupKey: 'Artist One - Test Track Alpha',
        expandedSongKey: 'Artist One - Test Track Alpha',
        selectedMapId: 'test-map-1',
        favoriteSongs: [],
        playHistory: mockHistory,
        onSelectGroup: () => {},
        onSelectDifficulty: () => {},
        onStartPlay: () => {},
        onToggleFavorite: () => {},
        getStarRating: (m) => (m.id === 'test-map-1' ? 2.4 : 5.8),
        getGradeBadgeClass: () => 'text-emerald-400',
      })
    );

    expect(html).toContain('is-selected');
    expect(html).toContain('lazer-carousel-diff-bar');
    expect(html).toContain('★ 2.40');
    expect(html).toContain('Easy');
    expect(html).toContain('[4K]');
    expect(html).toContain('lazer-star-meter');
    expect(html).not.toContain('READY');
  });
});
