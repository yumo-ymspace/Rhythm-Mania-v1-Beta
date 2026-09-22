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

import { describe, expect, it } from 'vitest';
import type { HitObject } from '../src/types';
import type { PlayfieldVisualSettings } from '../src/render/types';
import { getVisibleNotes } from '../src/render/noteVisibility';
import { HOLD_TICK_RULES_VERSION, initializeHoldTailTicks } from '../src/utils/holdTickRules';
import { getScrollYPosition } from '../src/render/playfieldLayout';
import { isHoldBodyAnchored } from '../src/render/noteState';

const settings: PlayfieldVisualSettings = {
  upsurfaceNoteMode: false,
  scrollSpeed: 18,
  audioOffset: 0,
  visualOffset: 0,
};

function hold(overrides: Partial<HitObject> = {}): HitObject {
  return {
    id: 'hold',
    time: 1000,
    endTime: 3000,
    column: 0,
    type: 'hold',
    isHit: false,
    isReleased: false,
    isMissed: false,
    isHoldFailed: false,
    ...overrides,
  };
}

describe('long-note visibility', () => {
  it('keeps the unjudged remainder after an early release', () => {
    const [note] = getVisibleNotes(
      [hold({ isHit: true, isReleased: true, isHoldFailed: true, releaseTime: 1500 })],
      settings,
      800,
      600,
      2000,
      0.2,
    );

    expect(note).toMatchObject({ isReleased: true, isHoldFailed: true, bodyStartY: 800 });
    expect(note.endY).toBe(400);
  });

  it('keeps the remainder when only the middle was engaged', () => {
    const [note] = getVisibleNotes(
      [hold({ isHit: true, isMissed: true, isReleased: true, isHoldFailed: true, hitTime: 1800, releaseTime: 2000 })],
      settings,
      800,
      600,
      2100,
      0.2,
    );

    expect(note).toMatchObject({
      isMissed: true,
      isHoldFailed: true,
      bodyStartY: 820,
      hitSegmentStartY: 660,
      hitSegmentEndY: 620,
    });
    expect(note.endY).toBe(420);
  });

  it('keeps a released hold visible until its geometry leaves the screen', () => {
    expect(getVisibleNotes(
      [hold({ isHit: true, isReleased: true, releaseTime: 3000 })],
      settings,
      800,
      600,
      2000,
      0.2,
    )).toHaveLength(1);

    expect(getVisibleNotes(
      [hold({ isHit: true, isReleased: true, releaseTime: 3000 })],
      settings,
      800,
      600,
      5000,
      0.2,
    )).toHaveLength(0);
  });

  it('bridges endpoint Bad windows while keeping their ticks non-judged', () => {
    const tickHold = hold({ holdRulesVersion: HOLD_TICK_RULES_VERSION });
    initializeHoldTailTicks(tickHold, 30, 50);
    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 2000, 0.2);
    const [segment] = note.tailSegments || [];

    expect(segment).toBeDefined();
    expect(segment?.startY).toBe(getScrollYPosition(1000, 2000, 600, 0.2, false));
    expect(segment?.endY).toBe(getScrollYPosition(2970, 2000, 600, 0.2, false));
    expect(note.endpointTailSegment?.endY).toBe(getScrollYPosition(3000, 2000, 600, 0.2, false));
    expect(tickHold.nextTailTickTime).toBeGreaterThan(1030);
  });

  it('removes successfully consumed tail sections but keeps the remaining tail', () => {
    const tickHold = hold({ holdRulesVersion: HOLD_TICK_RULES_VERSION });
    initializeHoldTailTicks(tickHold, 30, 50);
    const firstTick = tickHold.tailTickStartTime as number;
    const interval = tickHold.tailTickIntervalMs as number;
    tickHold.clearedTailIntervals = [{ startTime: firstTick, endTime: firstTick + interval }];

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 2000, 0.2);
    expect(note.tailSegments).toHaveLength(2);
    expect(note.tailSegments?.[0].startY).toBe(getScrollYPosition(1000, 2000, 600, 0.2, false));
    expect(note.tailSegments?.[0].endY).toBe(getScrollYPosition(firstTick, 2000, 600, 0.2, false));
    expect(note.tailSegments?.[1].startY).toBe(getScrollYPosition(firstTick + interval, 2000, 600, 0.2, false));
    expect(note.tailSegments?.[1].endY).toBe(getScrollYPosition(2970, 2000, 600, 0.2, false));
    expect(note.endpointTailSegment?.endY).toBe(getScrollYPosition(3000, 2000, 600, 0.2, false));
  });

  it('moves a hit tail edge continuously from the receptor instead of deleting the endpoint bridge', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHeadHit: true,
      hitTime: 1000,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [atHead] = getVisibleNotes([tickHold], settings, 800, 600, 1000, 0.2);
    const [afterHead] = getVisibleNotes([tickHold], settings, 800, 600, 1050, 0.2);
    expect(atHead.tailSegments?.[0].startY).toBe(getScrollYPosition(1000, 1000, 600, 0.2, false));
    expect(afterHead.tailSegments?.[0].startY).toBe(getScrollYPosition(1050, 1050, 600, 0.2, false));
  });

  it('does not create a gap for a successful tick after the head is engaged', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHeadHit: true,
      hitTime: 1000,
      clearedTailIntervals: [{ startTime: 1030.000001, endTime: 1080.000001 }],
    });
    initializeHoldTailTicks(tickHold, 30, 50);
    tickHold.clearedTailIntervals = [{ startTime: 1030.000001, endTime: 1080.000001 }];

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 1050, 0.2);
    expect(note.tailSegments).toHaveLength(1);
    expect(note.tailSegments?.[0].startY).toBe(getScrollYPosition(1050, 1050, 600, 0.2, false));
  });

  it('trims the release edge only after a successful release', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHeadHit: true,
      hitTime: 1000,
      isReleased: true,
      isReleaseHit: true,
      releaseTime: 3000,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 2950, 0.2);
    expect(note.tailSegments?.[0].endY).toBe(getScrollYPosition(3000, 2950, 600, 0.2, false));
  });

  it('does not reconnect an early-released tail to the moving receptor', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHeadHit: true,
      hitTime: 1000,
      earlyReleaseTime: 1800,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 1900, 0.2);
    expect(note.tailSegments?.[0].startY).toBe(getScrollYPosition(1800, 1900, 600, 0.2, false));
    expect(note.tailSegments?.[0].startY).not.toBe(getScrollYPosition(1900, 1900, 600, 0.2, false));
    expect(isHoldBodyAnchored(note)).toBe(false);
  });

  it('keeps an early-released endpoint at the receptor until it is judged', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHeadHit: true,
      hitTime: 1000,
      earlyReleaseTime: 1800,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 3000, 0.2);
    expect(note.endY).toBe(600);
    expect(note.isReleaseHit).not.toBe(true);
  });

  it('does not ground a late-engaged tail after its endpoint has passed', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHit: true,
      tailEngagedTime: 1800,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 3200, 0.2);
    expect(note.isEndPassed).toBe(true);
    expect(isHoldBodyAnchored(note)).toBe(false);
    expect(note.tailSegments?.[0].endY).toBe(getScrollYPosition(2970, 3200, 600, 0.2, false));
    expect(note.tailSegments?.[0].endY).not.toBe(600);
  });

  it('stops a repeated early-release tail at the latest release', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHit: true,
      isMissed: true,
      isReleased: true,
      isReleaseMissed: true,
      tailEngagedTime: 1800,
      earlyReleaseTime: 2000,
      releaseTime: 2000,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 3200, 0.2);
    expect(note.tailSegments?.[0].endY).toBe(getScrollYPosition(2000, 3200, 600, 0.2, false));
    expect(note.tailSegments?.[0].endY).not.toBe(getScrollYPosition(2970, 3200, 600, 0.2, false));
  });

  it('does not redraw cleared late-tail ticks after an early release', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHit: true,
      isMissed: true,
      isReleased: true,
      isReleaseMissed: true,
      tailEngagedTime: 1800,
      earlyReleaseTime: 2000,
      releaseTime: 2000,
    });
    initializeHoldTailTicks(tickHold, 30, 50);
    tickHold.clearedTailIntervals = [
      { startTime: 1830, endTime: 1880 },
      { startTime: 1930, endTime: 1980 },
    ];

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 3200, 0.2);
    expect(note.tailSegments).toHaveLength(3);
    expect(note.tailSegments?.map(segment => segment.startY)).toEqual([
      getScrollYPosition(1000, 3200, 600, 0.2, false),
      getScrollYPosition(1880, 3200, 600, 0.2, false),
      getScrollYPosition(1980, 3200, 600, 0.2, false),
    ]);
    expect(note.tailSegments?.map(segment => segment.endY)).toEqual([
      getScrollYPosition(1830, 3200, 600, 0.2, false),
      getScrollYPosition(1930, 3200, 600, 0.2, false),
      getScrollYPosition(2000, 3200, 600, 0.2, false),
    ]);
  });

  it('keeps the unjudged endpoint Bad-window tail above the receptor', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHeadHit: true,
      hitTime: 1000,
      earlyReleaseTime: 1800,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 3000, 0.2);
    expect(note.endpointTailSegment).toEqual({
      startY: getScrollYPosition(2970, 3000, 600, 0.2, false),
      endY: 600,
    });
    expect(note.tailSegments?.[0].endY).toBe(getScrollYPosition(2970, 3000, 600, 0.2, false));
  });

  it('keeps the endpoint visible after a press inside the release timing zone', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHeadHit: true,
      hitTime: 1000,
      releaseZoneArmedTime: 2900,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 2950, 0.2);
    expect(note.tailSegments?.[0].endY).toBe(getScrollYPosition(2970, 2950, 600, 0.2, false));
    expect(note.endpointTailSegment?.endY).toBe(getScrollYPosition(3000, 2950, 600, 0.2, false));
    expect(note.isReleaseHit).not.toBe(true);
  });

  it('keeps a missed release visible without reconnecting its tail to the receptor', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      isHeadHit: true,
      hitTime: 1000,
      isReleased: true,
      isReleaseMissed: true,
      releaseTime: 2850,
      earlyReleaseTime: 2850,
    });
    initializeHoldTailTicks(tickHold, 30, 50);

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 2900, 0.2);
    expect(note.isReleaseMissed).toBe(true);
    expect(note.isReleaseHit).not.toBe(true);
    expect(note.tailSegments?.[0].startY).toBe(getScrollYPosition(2850, 2900, 600, 0.2, false));
    expect(note.tailSegments?.[0].startY).not.toBe(getScrollYPosition(2900, 2900, 600, 0.2, false));
  });

  it('uses the late tail engagement as a continuous receptor frontier', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      tailEngagedTime: 1800,
      missedTailIntervals: [
        { startTime: 1030.000001, endTime: 1080.000001 },
        { startTime: 1080.000001, endTime: 1130.000001 },
      ],
    });
    initializeHoldTailTicks(tickHold, 30, 50);
    tickHold.missedTailIntervals = [
      { startTime: 1030.000001, endTime: 1080.000001 },
      { startTime: 1080.000001, endTime: 1130.000001 },
    ];

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 1800, 0.2);
    expect(note.tailSegments).toHaveLength(2);
    expect(note.tailSegments?.[0].startY).toBe(getScrollYPosition(1000, 1800, 600, 0.2, false));
    expect(note.tailSegments?.[0].endY).toBe(getScrollYPosition(1800, 1800, 600, 0.2, false));
    expect(note.tailSegments?.[1].startY).toBe(getScrollYPosition(1800, 1800, 600, 0.2, false));
    expect(note.missedTailSegments).toHaveLength(1);
    expect(note.missedTailSegments?.[0].endY).toBe(getScrollYPosition(1800, 1800, 600, 0.2, false));
  });

  it('bridges a trailing missed run into a late engagement without separate tick blocks', () => {
    const tickHold = hold({
      holdRulesVersion: HOLD_TICK_RULES_VERSION,
      tailEngagedTime: 1140,
      missedTailIntervals: [{ startTime: 1030.000001, endTime: 1130.000001 }],
    });
    initializeHoldTailTicks(tickHold, 30, 50);
    tickHold.missedTailIntervals = [{ startTime: 1030.000001, endTime: 1130.000001 }];

    const [note] = getVisibleNotes([tickHold], settings, 800, 600, 1140, 0.2);
    expect(note.missedTailSegments?.[0].endY).toBe(getScrollYPosition(1140, 1140, 600, 0.2, false));
    expect(note.tailSegments?.[0].startY).toBe(getScrollYPosition(1000, 1140, 600, 0.2, false));
    expect(note.tailSegments?.[0].endY).toBe(getScrollYPosition(1140, 1140, 600, 0.2, false));
    expect(note.tailSegments?.[1].startY).toBe(getScrollYPosition(1140, 1140, 600, 0.2, false));
  });

  it('retains a missed hold head after the tail is engaged later', () => {
    const [note] = getVisibleNotes(
      [hold({
        holdRulesVersion: HOLD_TICK_RULES_VERSION,
        isMissed: true,
        isHit: true,
        tailEngagedTime: 1800,
        hitTime: 1800,
      })],
      settings,
      800,
      600,
      1800,
      0.2,
    );

    expect(note).toMatchObject({
      isMissed: true,
      isHit: true,
      y: getScrollYPosition(1000, 1800, 600, 0.2, false),
    });
  });
});

describe('Hidden, Fade In, and Cover modifiers', () => {
  it('scales HD coverage from 160px to 400px based on combo (768px reference)', () => {
    // combo 0
    const [noteCombo0] = getVisibleNotes(
      [{ id: 'n1', time: 1000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['HD'] },
      800,
      600,
      1000, // note at receptorY (600)
      0.2,
      null,
      0
    );
    expect(noteCombo0.opacity).toBe(0); // at receptor, note is hidden

    // note at spawn (y = 0)
    const [noteAtSpawn] = getVisibleNotes(
      [{ id: 'n2', time: 4000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['HD'] },
      800,
      600,
      1000, // y = 600 - (4000-1000)*0.2 = 0
      0.2,
      null,
      0
    );
    expect(noteAtSpawn.opacity).toBe(1.0); // at spawn, note is fully visible
  });

  it('hides notes at spawn and reveals them near receptor with Fade In (FI)', () => {
    // note at spawn (y = 0)
    const [noteAtSpawn] = getVisibleNotes(
      [{ id: 'n1', time: 4000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['FI'] },
      800,
      600,
      1000, // y = 0
      0.2,
      null,
      0
    );
    expect(noteAtSpawn.opacity).toBe(0.0); // at spawn, note is hidden

    // note at receptor (y = 600)
    const [noteAtReceptor] = getVisibleNotes(
      [{ id: 'n2', time: 1000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['FI'] },
      800,
      600,
      1000, // y = 600
      0.2,
      null,
      0
    );
    expect(noteAtReceptor.opacity).toBe(1.0); // near receptor, note is visible
  });

  it('hides notes in the top half with Cover mod', () => {
    // note at spawn (y = 0, progress = 0)
    const [noteAtSpawn] = getVisibleNotes(
      [{ id: 'n1', time: 4000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['Cover'] },
      800,
      600,
      1000, // y = 0
      0.2,
      null,
      0
    );
    expect(noteAtSpawn.opacity).toBe(0.0);

    // note at receptor (y = 600, progress = 1.0)
    const [noteAtReceptor] = getVisibleNotes(
      [{ id: 'n2', time: 1000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['Cover'] },
      800,
      600,
      1000, // y = 600
      0.2,
      null,
      0
    );
    expect(noteAtReceptor.opacity).toBe(1.0);
  });

  it('retracts coverage during break periods so notes are fully visible', () => {
    const breaks = [{ startTime: 1500, endTime: 3500 }];
    const [noteInBreak] = getVisibleNotes(
      [{ id: 'n1', time: 2500, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['HD'] },
      800,
      600,
      2500, // in the middle of break
      0.2,
      null,
      100,
      breaks
    );
    // When break is active, HD coverage retracts and notes are visible
    expect(noteInBreak.opacity).toBe(1.0);
  });

  it('illuminates notes near the receptor and hides distant notes with Flashlight (FL)', () => {
    // Note right at receptor (y = 600, dist = 0)
    const [noteAtReceptor] = getVisibleNotes(
      [{ id: 'n1', time: 1000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['FL'] },
      800,
      600,
      1000, // y = 600
      0.2,
      null,
      0
    );
    expect(noteAtReceptor.opacity).toBe(1.0);

    // Note far away from receptor at spawn (y = 0, dist = 600 > 240)
    const [noteAtSpawn] = getVisibleNotes(
      [{ id: 'n2', time: 4000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['FL'] },
      800,
      600,
      1000, // y = 0
      0.2,
      null,
      0
    );
    expect(noteAtSpawn.opacity).toBe(0.0);
  });

  it('shrinks Flashlight radius as combo increases (>= 100 and >= 200)', () => {
    // Note at y = 430 (dist from 600 is 170px).
    // At combo 0 (radius 240, inner 108): dist 170 is in the fade zone -> partial opacity > 0
    const [noteCombo0] = getVisibleNotes(
      [{ id: 'n1', time: 1850, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['FL'] },
      800,
      600,
      1000, // y = 600 - 850*0.2 = 430, dist = 170
      0.2,
      null,
      0 // radius 240
    );
    expect(noteCombo0.opacity).toBeGreaterThan(0);

    // At combo 200 (radius 150): dist 170 > 150 -> opacity is 0.0 (outside shrunk radius)
    const [noteCombo200] = getVisibleNotes(
      [{ id: 'n1', time: 1850, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['FL'] },
      800,
      600,
      1000, // y = 430, dist = 170
      0.2,
      null,
      200 // radius 150
    );
    expect(noteCombo200.opacity).toBe(0.0);
  });

  it('restores full visibility during break periods under Flashlight (FL)', () => {
    const breaks = [{ startTime: 1500, endTime: 3500 }];
    const [noteInBreak] = getVisibleNotes(
      [{ id: 'n1', time: 4000, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }],
      { ...settings, selectedMods: ['FL'] },
      800,
      600,
      2500, // inside break
      0.2,
      null,
      200,
      breaks
    );
    // In break, coverage retracts and notes are visible
    expect(noteInBreak.opacity).toBe(1.0);
  });

  describe('TASK-051: lazer v3 hold body masking while held', () => {
    it('anchors hold body to receptorY while actively held at or past receptor', () => {
      const v3Hold = hold({
        holdRulesVersion: 3,
        isHit: true,
        holdState: {
          startTime: 1000,
          endTime: 3000,
          column: 0,
          isHeadJudged: true,
          headJudgement: 'marvelous',
          headMissed: false,
          isHolding: true,
          hasHoldBreak: false,
          bodyJudged: false,
          isTailJudged: false,
          tailJudgement: null,
          tailMissed: false,
          isTailCapped: false,
          isComplete: false,
        },
      });

      const [note] = getVisibleNotes([v3Hold], settings, 800, 600, 2000, 0.2);
      expect(note.isHolding).toBe(true);
      expect(note.bodyStartY).toBe(600); // grounded to receptorY
      expect(note.endY).toBe(400); // tail still approaching
      expect(isHoldBodyAnchored(note)).toBe(true);
    });

    it('anchors hold body to receptorY immediately on hit so the middle disappears into the receptor', () => {
      const v3Hold = hold({
        holdRulesVersion: 3,
        isHit: true,
        holdState: {
          startTime: 1000,
          endTime: 3000,
          column: 0,
          isHeadJudged: true,
          headJudgement: 'marvelous',
          headMissed: false,
          isHolding: true,
          hasHoldBreak: false,
          bodyJudged: false,
          isTailJudged: false,
          tailJudgement: null,
          tailMissed: false,
          isTailCapped: false,
          isComplete: false,
        },
      });

      // visualTime = 950: head at y = 600 - (1000 - 950)*0.2 = 590 (above receptor 600)
      // Once hit, the consumed middle is masked at the receptor instead of
      // trailing from the head position.
      const [note] = getVisibleNotes([v3Hold], settings, 800, 600, 950, 0.2);
      expect(note.isHolding).toBe(true);
      expect(note.bodyStartY).toBe(600); // grounded to receptorY on hit
      expect(isHoldBodyAnchored(note)).toBe(true);
    });

    it('starts unconsumed body at earlyReleaseTime after an early release break', () => {
      const v3Hold = hold({
        holdRulesVersion: 3,
        isHit: true,
        isHoldFailed: true,
        earlyReleaseTime: 1800,
        holdState: {
          startTime: 1000,
          endTime: 3000,
          column: 0,
          isHeadJudged: true,
          headJudgement: 'marvelous',
          headMissed: false,
          isHolding: false,
          hasHoldBreak: true,
          bodyJudged: true,
          isTailJudged: false,
          tailJudgement: null,
          tailMissed: false,
          isTailCapped: true,
          isComplete: false,
        },
      });

      // visualTime = 2200: release point at y = 600 - (1800 - 2200)*0.2 = 680
      const [note] = getVisibleNotes([v3Hold], settings, 800, 600, 2200, 0.2);
      expect(note.isHolding).toBe(false);
      expect(note.bodyStartY).toBe(680); // consumed portion before 1800 is not drawn
      expect(note.endY).toBe(440); // 600 - (3000 - 2200)*0.2 = 440
      expect(isHoldBodyAnchored(note)).toBe(false);
    });

    it('leaves missed hold note ungrounded scrolling past receptor', () => {
      const v3Hold = hold({
        holdRulesVersion: 3,
        isHit: false,
        isMissed: true,
      });

      const [note] = getVisibleNotes([v3Hold], settings, 800, 600, 2000, 0.2);
      expect(note.isHolding).toBe(false);
      expect(note.bodyStartY).toBe(800); // 600 - (1000 - 2000)*0.2 = 800
      expect(isHoldBodyAnchored(note)).toBe(false);
    });
  });
});
