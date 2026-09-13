import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SongSelectLeftPanel, computeBpmSummary } from '../src/ui/lazer/SongSelectLeftPanel';
import { Beatmap, GameSettings, PlayHistoryRecord } from '../src/types';

import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';

describe('TASK-V-022 — Left title, stats, ranking', () => {
  const mockSettings: GameSettings = {
    ...DEFAULT_SETTINGS,
    localDisplayName: 'TestUser',
  };

  const mockBeatmap: Beatmap = {
    id: 'astro-notes-adv',
    title: 'AstroNotes.',
    artist: 'MisoilePunch',
    creator: 'Murumoo',
    difficulty: 'ADVANCED',
    bpm: 210,
    keyCount: 4,
    duration: 143,
    notes: [
      { id: 'n1', time: 1000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false },
      { id: 'n2', time: 1500, column: 1, type: 'hold', endTime: 2500, isHit: false, isReleased: false, isMissed: false, isHoldFailed: false },
    ],
    hpDrainRate: 7,
    overallDifficulty: 7,
    approachRate: 7,
    timingPoints: [
      { timeMs: 0, beatLength: 285.71, uninherited: true, svMultiplier: 1 }, // ~210 BPM
    ],
    sliderMultiplier: 1.4,
    baseBeatLength: 285.71,
    breaks: [],
    catalogSetId: '12345',
  };

  describe('computeBpmSummary', () => {
    it('returns single BPM when map has one or uniform uninherited timing point', () => {
      const summary = computeBpmSummary(mockBeatmap);
      expect(summary).toBe('210');
    });

    it('returns range with mostly dominant BPM for variable tempo beatmaps (matching hud/songslect (2).jpg)', () => {
      const variableMap: Beatmap = {
        ...mockBeatmap,
        duration: 405, // 6:45
        timingPoints: [
          { timeMs: 0, beatLength: 444.44, uninherited: true, svMultiplier: 1 }, // 135 BPM
          { timeMs: 10000, beatLength: 222.22, uninherited: true, svMultiplier: 1 }, // 270 BPM (dominant across 380s)
          { timeMs: 390000, beatLength: 115.38, uninherited: true, svMultiplier: 1 }, // 520 BPM
        ],
      };
      const summary = computeBpmSummary(variableMap);
      expect(summary).toContain('135-520');
      expect(summary).toContain('mostly 270');
    });
  });

  describe('SongSelectLeftPanel UI Render', () => {
    it('renders empty local ranking copy: Info icon + "No records yet!"', () => {
      const html = renderToStaticMarkup(
        React.createElement(SongSelectLeftPanel, {
          selectedMap: mockBeatmap,
          currentStarRating: 2.32,
          isFavorite: false,
          onToggleFavorite: vi.fn(),
          activeTab: 'ranking',
          onChangeTab: vi.fn(),
          localScores: [],
          settings: mockSettings,
          getDifficultyColor: () => 'text-emerald-400',
          getGradeBadgeClass: () => 'bg-emerald-500',
        })
      );

      // Verify Header details
      expect(html).toContain('AstroNotes.');
      expect(html).toContain('MisoilePunch');
      expect(html).toContain('ADVANCED');
      expect(html).toContain('Murumoo');
      expect(html).toContain('RANKED');
      expect(html).toContain('02:23'); // 143s duration
      expect(html).toContain('210');

      // Verify Mania Stats
      expect(html).toContain('Notes');
      expect(html).toContain('Hold Notes');
      expect(html).toContain('Key Count');
      expect(html).toContain('Accuracy');
      expect(html).toContain('HP Drain');

      // Verify Scope & Sort controls
      expect(html).toContain('Scope');
      expect(html).toContain('Local');
      expect(html).toContain('Sort');
      expect(html).toContain('Score');

      // Verify exact empty state copy: "No records yet!"
      expect(html).toContain('No records yet!');
      expect(html).not.toContain('Please sign in');
    });

    it('renders populated local score rows with rank, grade, score, and replay buttons', () => {
      const mockRecord: PlayHistoryRecord = {
        id: 'rec-1',
        timestamp: Date.now(),
        beatmapId: 'astro-notes-adv',
        beatmapTitle: 'AstroNotes.',
        beatmapArtist: 'MisoilePunch',
        keyCount: 4,
        score: 995420,
        accuracy: 99.85,
        maxCombo: 810,
        grade: 'SS',
        isFailed: false,
        scoreState: {
          score: 995420,
          accuracy: 99.85,
          combo: 810,
          maxCombo: 810,
          hp: 100,
          perfectCount: 800,
          marvelousCount: 10,
          greatCount: 0,
          goodCount: 0,
          badCount: 0,
          missCount: 0,
          completed: true,
          failed: false,
          unstableRate: 24.1,
          hitErrorSampleCount: 810,
          columnJudgements: [],
          isAutoplay: false,
        },
        replayFrames: [],
        mods: ['HD'],
      };

      const html = renderToStaticMarkup(
        React.createElement(SongSelectLeftPanel, {
          selectedMap: mockBeatmap,
          currentStarRating: 2.32,
          isFavorite: true,
          onToggleFavorite: vi.fn(),
          activeTab: 'ranking',
          onChangeTab: vi.fn(),
          localScores: [mockRecord],
          onWatchReplay: vi.fn(),
          settings: mockSettings,
          getDifficultyColor: () => 'text-emerald-400',
          getGradeBadgeClass: () => 'bg-amber-400',
        })
      );

      // Should render #1 rank and SS grade
      expect(html).toContain('#1');
      expect(html).toContain('SS');
      expect(html).toContain('995,420');
      expect(html).toContain('99.85%');
      expect(html).toContain('810x');
      expect(html).toContain('HD');
      expect(html).not.toContain('No records yet!');
    });
  });
});
