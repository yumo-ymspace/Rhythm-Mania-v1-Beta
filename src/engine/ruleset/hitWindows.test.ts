import { describe, expect, it } from 'vitest';
import { HitResult, ManiaHitWindows, difficultyRange } from './hitWindows';
import { mapColumn } from '../beatmap/types';
import { ScrollPositionCalculator } from '../beatmap/scroll';
import { ManiaScoreProcessor, rankFromScore } from './score';
import { parseOsu } from '../beatmap/parser';
import { ManiaGameplay } from './gameplay';

describe('ManiaHitWindows', () => {
  it('uses DifficultyRange then floor * multiplier + 0.5 (not constant 16ms Perfect)', () => {
    const hw = new ManiaHitWindows({ overallDifficulty: 5 });
    expect(difficultyRange(5, 22.4, 19.4, 13.9)).toBe(19.4);
    expect(hw.perfect).toBe(Math.floor(19.4) + 0.5);
    expect(hw.great).toBe(Math.floor(49) + 0.5);
    expect(hw.good).toBe(Math.floor(82) + 0.5);
    expect(hw.ok).toBe(Math.floor(112) + 0.5);
    expect(hw.meh).toBe(Math.floor(136) + 0.5);
    expect(hw.miss).toBe(Math.floor(173) + 0.5);
  });

  it('matches OD 0 / 10 DifficultyRange table', () => {
    expect(difficultyRange(0, 22.4, 19.4, 13.9)).toBeCloseTo(22.4);
    expect(difficultyRange(10, 22.4, 19.4, 13.9)).toBeCloseTo(13.9);
    expect(difficultyRange(0, 64, 49, 34)).toBe(64);
    expect(difficultyRange(10, 64, 49, 34)).toBe(34);
  });

  it('Classic Perfect is 16ms-based, not lazer Perfect range', () => {
    const hw = new ManiaHitWindows({ overallDifficulty: 5, classicModActive: true });
    expect(hw.perfect).toBe(Math.floor(16) + 0.5);
  });

  it('late Meh becomes Miss', () => {
    const hw = new ManiaHitWindows({ overallDifficulty: 5 });
    const lateMeh = hw.ok + 1;
    expect(hw.judge(lateMeh)).toBe(HitResult.Meh);
    expect(hw.judgeNote(lateMeh)).toBe(HitResult.Miss);
  });
});

describe('column mapping', () => {
  it('maps 512-space into 4K and 7K', () => {
    expect(mapColumn(0, 4)).toBe(0);
    expect(mapColumn(127, 4)).toBe(0);
    expect(mapColumn(128, 4)).toBe(1);
    expect(mapColumn(256, 4)).toBe(2);
    expect(mapColumn(384, 4)).toBe(3);
    expect(mapColumn(512, 4)).toBe(3);
    expect(mapColumn(256, 7)).toBe(3);
    expect(mapColumn(512, 7)).toBe(6);
  });
});

describe('ScrollPositionCalculator', () => {
  it('does not reset SV to 1.0 on red timing points', () => {
    const calc = new ScrollPositionCalculator(
      [
        { time: 0, beatLength: 500, meter: 4, sampleSet: 0, sampleIndex: 0, volume: 100, uninherited: true, effects: 0 },
        { time: 1000, beatLength: -50, meter: 4, sampleSet: 0, sampleIndex: 0, volume: 100, uninherited: false, effects: 0 },
        { time: 2000, beatLength: 400, meter: 4, sampleSet: 0, sampleIndex: 0, volume: 100, uninherited: true, effects: 0 },
      ],
      4000,
    );
    const d1 = calc.getVisualPosition(1500) - calc.getVisualPosition(1000);
    const d2 = calc.getVisualPosition(2500) - calc.getVisualPosition(2000);
    expect(d1).toBeCloseTo(500 * 2);
    expect(d2).toBeCloseTo(500 * 2);
  });
});

describe('ManiaScoreProcessor', () => {
  it('all Perfect reaches 1_000_000', () => {
    const n = 40;
    const proc = new ManiaScoreProcessor(n);
    for (let i = 0; i < n; i++) proc.apply(HitResult.Perfect, 0);
    expect(proc.totalScore).toBe(1_000_000);
    expect(proc.accuracy).toBe(1);
  });

  it('SS with mixed Perfect/Great', () => {
    const n = 20;
    const proc = new ManiaScoreProcessor(n);
    for (let i = 0; i < 10; i++) proc.apply(HitResult.Perfect, 0);
    for (let i = 0; i < 10; i++) proc.apply(HitResult.Great, 0);
    expect(proc.rank).toBe('X');
    expect(rankFromScore(proc.accuracy)).toBe('S');
  });
});

const MINI_OSU = `osu file format v14
[General]
AudioFilename: a.mp3
Mode: 3
[Metadata]
Title:t
Artist:a
Creator:c
Version:v
[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:5
[TimingPoints]
0,500,4,0,0,100,1,0
[HitObjects]
36,192,1000,128,0,2000:0:0:0:0:
`;

describe('holds', () => {
  it('ComboBreak on early LN release', () => {
    const beatmap = parseOsu(MINI_OSU);
    const game = new ManiaGameplay(beatmap, []);
    game.update(1000, [{ column: 0, type: 'down', timeMs: 1000 }]);
    expect(game.score.combo).toBe(1);
    game.update(1200, [{ column: 0, type: 'up', timeMs: 1200 }]);
    expect(game.score.combo).toBe(0);
    expect(game.score.counts[HitResult.ComboBreak]).toBe(1);
  });
});
