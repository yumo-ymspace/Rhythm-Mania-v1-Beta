/*
 * Tests for Beatmap Mod Transformations (TASK-035)
 * Mirror (MR), Constant Speed (CS), Invert (IN), Hold Off (HO), No Release (NR)
 */

import { describe, it, expect } from 'vitest';
import type { Beatmap, HitObject } from '../src/types';
import {
  applyMirrorMod,
  applyHoldOffMod,
  applyInvertMod,
  applyBeatmapMods,
  isNoReleaseMod,
  isConstantSpeedMod,
} from '../src/ruleset/mania/beatmapMods';
import { createScrollModel, getScrollDelta, getScrollPosition } from '../src/render/scrollVelocity';
import {
  createHoldNoteState,
  autoReleaseHoldTail,
  onHoldKeyPress,
  missHoldHead,
} from '../src/ruleset/mania/holdNote';
import { getJudgementWindows } from '../src/ruleset/mania/hitWindows';
import { simulateManiaReplay } from '../src/ruleset/mania/replaySimulator';

function createNote(params: { id: string; time: number; column: number; type?: 'normal' | 'hold'; endTime?: number }): HitObject {
  return {
    id: params.id,
    time: params.time,
    column: params.column,
    type: params.type || 'normal',
    endTime: params.endTime,
    isHit: false,
    isReleased: false,
    isMissed: false,
    isHoldFailed: false,
  };
}

function createMockBeatmap(overrides?: Partial<Beatmap>): Beatmap {
  return {
    id: 'test_map',
    title: 'Test Song',
    artist: 'Test Artist',
    creator: 'Test Creator',
    difficulty: 'Normal',
    bpm: 120,
    keyCount: 4,
    duration: 10,
    hpDrainRate: 5,
    overallDifficulty: 8,
    mode: 3,
    sliderMultiplier: 1.4,
    baseBeatLength: 500,
    timingPoints: [
      { timeMs: 0, beatLength: 500, uninherited: true, svMultiplier: 1.0 },
      { timeMs: 1000, beatLength: -50, uninherited: false, svMultiplier: 2.0 },
      { timeMs: 2000, beatLength: -200, uninherited: false, svMultiplier: 0.5 },
    ],
    notes: [
      createNote({ id: 'n1', time: 1000, column: 0, type: 'normal' }),
      createNote({ id: 'n2', time: 1200, column: 1, type: 'normal' }),
      createNote({ id: 'n3', time: 1400, column: 0, type: 'hold', endTime: 1800 }),
      createNote({ id: 'n4', time: 1600, column: 2, type: 'normal' }),
      createNote({ id: 'n5', time: 2000, column: 0, type: 'normal' }),
      createNote({ id: 'n6', time: 2200, column: 3, type: 'normal' }),
    ],
    ...overrides,
  };
}

describe('Beatmap Mods (TASK-035)', () => {
  describe('Mirror Mod (MR)', () => {
    it('flips columns horizontally for 4K', () => {
      const map = createMockBeatmap({ keyCount: 4 });
      const mirrored = applyMirrorMod(map);

      // Col 0 -> Col 3, Col 1 -> Col 2, Col 2 -> Col 1, Col 3 -> Col 0
      const n1 = mirrored.notes.find((n) => n.id === 'n1')!;
      expect(n1.column).toBe(3);

      const n2 = mirrored.notes.find((n) => n.id === 'n2')!;
      expect(n2.column).toBe(2);

      const n4 = mirrored.notes.find((n) => n.id === 'n4')!;
      expect(n4.column).toBe(1);

      const n6 = mirrored.notes.find((n) => n.id === 'n6')!;
      expect(n6.column).toBe(0);
    });

    it('flips columns horizontally for 7K', () => {
      const map: Beatmap = {
        ...createMockBeatmap(),
        keyCount: 7,
        notes: [
          createNote({ id: 'a', time: 100, column: 0, type: 'normal' }),
          createNote({ id: 'b', time: 200, column: 3, type: 'normal' }),
          createNote({ id: 'c', time: 300, column: 6, type: 'normal' }),
        ],
      };
      const mirrored = applyMirrorMod(map);
      expect(mirrored.notes.find((n) => n.id === 'a')?.column).toBe(6);
      expect(mirrored.notes.find((n) => n.id === 'b')?.column).toBe(3); // middle column stays in middle
      expect(mirrored.notes.find((n) => n.id === 'c')?.column).toBe(0);
    });

    it('preserves sorting by time', () => {
      const map = createMockBeatmap();
      const mirrored = applyMirrorMod(map);
      for (let i = 1; i < mirrored.notes.length; i++) {
        expect(mirrored.notes[i].time).toBeGreaterThanOrEqual(mirrored.notes[i - 1].time);
      }
    });
  });

  describe('Hold Off Mod (HO)', () => {
    it('converts all hold notes to regular notes with undefined endTime', () => {
      const map = createMockBeatmap();
      const holdOffMap = applyHoldOffMod(map);

      expect(holdOffMap.notes.every((n) => n.type === 'normal')).toBe(true);
      expect(holdOffMap.notes.every((n) => n.endTime === undefined)).toBe(true);

      const originalHold = holdOffMap.notes.find((n) => n.id === 'n3')!;
      expect(originalHold.type).toBe('normal');
      expect(originalHold.endTime).toBeUndefined();
      expect(originalHold.time).toBe(1400);
      expect(originalHold.column).toBe(0);
    });
  });

  describe('Invert Mod (IN)', () => {
    it('converts hold notes to regular notes, and regular notes to hold notes ending at next note in column', () => {
      const map: Beatmap = {
        ...createMockBeatmap(),
        keyCount: 4,
        notes: [
          // Column 0: note at 1000, hold from 1400 to 1800, note at 2000
          createNote({ id: 'c0_1', time: 1000, column: 0, type: 'normal' }),
          createNote({ id: 'c0_2', time: 1400, column: 0, type: 'hold', endTime: 1800 }),
          createNote({ id: 'c0_3', time: 2000, column: 0, type: 'normal' }),
          // Column 1: single note at 1500 (last in column)
          createNote({ id: 'c1_1', time: 1500, column: 1, type: 'normal' }),
        ],
      };

      const inverted = applyInvertMod(map);

      // c0_1 was normal, next note in col 0 is at 1400 -> becomes hold [1000, 1400]
      const n1 = inverted.notes.find((n) => n.id === 'c0_1')!;
      expect(n1.type).toBe('hold');
      expect(n1.time).toBe(1000);
      expect(n1.endTime).toBe(1400);

      // c0_2 was hold -> becomes normal note at 1400
      const n2 = inverted.notes.find((n) => n.id === 'c0_2')!;
      expect(n2.type).toBe('normal');
      expect(n2.time).toBe(1400);
      expect(n2.endTime).toBeUndefined();

      // c0_3 was normal, last note in col 0 -> remains normal note at 2000
      const n3 = inverted.notes.find((n) => n.id === 'c0_3')!;
      expect(n3.type).toBe('normal');
      expect(n3.time).toBe(2000);
      expect(n3.endTime).toBeUndefined();

      // c1_1 was normal, only note in col 1 -> remains normal note at 1500
      const n4 = inverted.notes.find((n) => n.id === 'c1_1')!;
      expect(n4.type).toBe('normal');
      expect(n4.time).toBe(1500);
      expect(n4.endTime).toBeUndefined();
    });
  });

  describe('Constant Speed Mod (CS)', () => {
    it('disables SV changes so scroll position is strictly linear', () => {
      const map = createMockBeatmap();
      // SV enabled:
      const modelWithSv = createScrollModel(map, true);
      // SV disabled (Constant Speed):
      const modelConstantSpeed = createScrollModel(map, false);

      expect(modelConstantSpeed.isEnabled).toBe(false);

      // With SV disabled, getScrollPosition(t) = t
      expect(getScrollPosition(modelConstantSpeed, 500)).toBe(500);
      expect(getScrollPosition(modelConstantSpeed, 1500)).toBe(1500);
      expect(getScrollPosition(modelConstantSpeed, 2500)).toBe(2500);

      expect(getScrollDelta(modelConstantSpeed, 1000, 2000)).toBe(1000);

      // Whereas modelWithSv has 2.0x multiplier between 1000 and 2000
      expect(getScrollDelta(modelWithSv, 1000, 2000)).toBe(2000);
    });

    it('isConstantSpeedMod detects CS correctly', () => {
      expect(isConstantSpeedMod(['CS'])).toBe(true);
      expect(isConstantSpeedMod(['ConstantSpeed'])).toBe(true);
      expect(isConstantSpeedMod(['HD', 'CS'])).toBe(true);
      expect(isConstantSpeedMod(['HD', 'DT'])).toBe(false);
      expect(isConstantSpeedMod(null)).toBe(false);
    });
  });

  describe('No Release Mod (NR)', () => {
    it('isNoReleaseMod detects NR correctly', () => {
      expect(isNoReleaseMod(['NR'])).toBe(true);
      expect(isNoReleaseMod(['NoRelease'])).toBe(true);
      expect(isNoReleaseMod(['NR', 'HD'])).toBe(true);
      expect(isNoReleaseMod(['EZ'])).toBe(false);
      expect(isNoReleaseMod(null)).toBe(false);
    });

    it('autoReleaseHoldTail judges tail on time with 0 error if held', () => {
      const windows = getJudgementWindows(8, 1.0, 1.0);
      const state = createHoldNoteState({
        id: 'h1',
        startTime: 1000,
        endTime: 2000,
        column: 0,
      });

      // Press head at 1000
      const headHit = onHoldKeyPress(state, 1000, windows);
      expect(headHit?.kind).toBe('head_hit');
      expect(state.isHolding).toBe(true);
      expect(state.isTailJudged).toBe(false);

      // At endTime 2000, auto-release fires while key is still held
      const tailAction = autoReleaseHoldTail(state, windows);
      expect(tailAction).not.toBeNull();
      expect(tailAction?.kind).toBe('tail_hit');
      if (tailAction?.kind === 'tail_hit') {
        expect(tailAction.judgement).toBe('marvelous');
        expect(tailAction.rawOffsetMs).toBe(0);
        expect(tailAction.effectiveErrorMs).toBe(0);
        expect(tailAction.isCapped).toBe(false);
      }
      expect(state.isTailJudged).toBe(true);
      expect(state.isComplete).toBe(true);
      expect(state.isHolding).toBe(false);
    });

    it('autoReleaseHoldTail caps at Meh if head was missed', () => {
      const windows = getJudgementWindows(8, 1.0, 1.0);
      const state = createHoldNoteState({
        id: 'h2',
        startTime: 1000,
        endTime: 2000,
        column: 0,
      });

      // Head timed out
      missHoldHead(state, 1200);
      expect(state.headMissed).toBe(true);

      // Player re-presses mid-body at 1500
      onHoldKeyPress(state, 1500, windows);
      expect(state.isHolding).toBe(true);

      // Auto-release fires at 2000
      const tailAction = autoReleaseHoldTail(state, windows);
      expect(tailAction?.kind).toBe('tail_hit');
      if (tailAction?.kind === 'tail_hit') {
        expect(tailAction.judgement).toBe('bad'); // Meh cap
        expect(tailAction.isCapped).toBe(true);
      }
    });

    it('simulates replay with No Release mod correctly without releasing key', () => {
      const map: Beatmap = {
        ...createMockBeatmap(),
        keyCount: 4,
        notes: [
          createNote({ id: 'h1', time: 1000, column: 0, type: 'hold', endTime: 2000 }),
        ],
      };

      // Player presses key 0 at 1000 and holds continuously through 3000 (never releases)
      const replayFrames = [
        { time: 0, keysPressed: [false, false, false, false] },
        { time: 1000, keysPressed: [true, false, false, false] },
        { time: 2000, keysPressed: [true, false, false, false] },
        { time: 2500, keysPressed: [true, false, false, false] },
        { time: 3000, keysPressed: [false, false, false, false] },
      ];

      const simResult = simulateManiaReplay({
        beatmap: map,
        replayFrames,
        selectedMods: ['NR'],
      });

      // Head (Marvelous) + Tail (auto-released Marvelous) -> 2 Marvelous hits, 2 combo, 100% accuracy
      expect(simResult.scoreState.missCount).toBe(0);
      expect(simResult.scoreState.marvelousCount).toBe(2);
      expect(simResult.scoreState.combo).toBe(2);
      expect(simResult.scoreState.accuracy).toBe(100);
    });
  });

  describe('applyBeatmapMods (combined pipeline)', () => {
    it('applies K-conversion, Invert, and Mirror in pipeline', () => {
      const map: Beatmap = {
        ...createMockBeatmap(),
        keyCount: 4,
        notes: [
          createNote({ id: 'n1', time: 1000, column: 0, type: 'normal' }),
          createNote({ id: 'n2', time: 1500, column: 0, type: 'normal' }),
        ],
      };

      // With MR + IN:
      // IN turns n1 into hold [1000, 1500], n2 stays normal at 1500
      // MR flips col 0 -> col 3
      const transformed = applyBeatmapMods(map, ['MR', 'IN']);
      expect(transformed.notes.length).toBe(2);
      const n1 = transformed.notes.find((n) => n.id === 'n1')!;
      expect(n1.type).toBe('hold');
      expect(n1.endTime).toBe(1500);
      expect(n1.column).toBe(3);

      const n2 = transformed.notes.find((n) => n.id === 'n2')!;
      expect(n2.type).toBe('normal');
      expect(n2.column).toBe(3);
    });

    it('applies K-conversion with Hold Off', () => {
      const map: Beatmap = {
        ...createMockBeatmap(),
        keyCount: 4,
        notes: [
          createNote({ id: 'h1', time: 1000, column: 0, type: 'hold', endTime: 1800 }),
          createNote({ id: 'h2', time: 1200, column: 3, type: 'hold', endTime: 1900 }),
        ],
      };

      const transformed = applyBeatmapMods(map, ['K7', 'HO']);
      expect(transformed.keyCount).toBe(7);
      expect(transformed.notes.every((n) => n.type === 'normal')).toBe(true);
      expect(transformed.notes.every((n) => n.endTime === undefined)).toBe(true);
    });
  });
});
