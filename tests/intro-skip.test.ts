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

import { describe, it, expect } from 'vitest';
import {
  INTRO_SKIP_THRESHOLD_MS,
  INTRO_SKIP_LEAD_IN_MS,
  INTRO_SKIP_WINDOW_END_OFFSET_MS,
  INTRO_SKIP_HARD_CUTOFF_MS,
  isIntroSkippable,
  computeSkipTargetMs,
  isSkipWindowActive,
  canPerformSkip,
} from '../src/utils/introSkip';

describe('introSkip utility', () => {
  describe('isIntroSkippable', () => {
    it('returns false for invalid or negative firstNoteTime', () => {
      expect(isIntroSkippable(NaN)).toBe(false);
      expect(isIntroSkippable(Infinity)).toBe(false);
      expect(isIntroSkippable(-500)).toBe(false);
      expect(isIntroSkippable(0)).toBe(false);
    });

    it('returns false when firstNoteTime is less than or equal to threshold', () => {
      expect(isIntroSkippable(1000)).toBe(false);
      expect(isIntroSkippable(2000)).toBe(false);
      expect(isIntroSkippable(INTRO_SKIP_THRESHOLD_MS)).toBe(false);
    });

    it('returns true when firstNoteTime exceeds threshold', () => {
      expect(isIntroSkippable(INTRO_SKIP_THRESHOLD_MS + 1)).toBe(true);
      expect(isIntroSkippable(5000)).toBe(true);
      expect(isIntroSkippable(12000)).toBe(true);
    });

    it('supports custom threshold parameter', () => {
      expect(isIntroSkippable(3000, 2500)).toBe(true);
      expect(isIntroSkippable(2000, 2500)).toBe(false);
    });
  });

  describe('computeSkipTargetMs', () => {
    it('returns 0 for non-finite values', () => {
      expect(computeSkipTargetMs(NaN)).toBe(0);
      expect(computeSkipTargetMs(Infinity)).toBe(0);
    });

    it('clamps to 0 when firstNoteTime is less than leadInMs', () => {
      expect(computeSkipTargetMs(1500)).toBe(0);
      expect(computeSkipTargetMs(2000)).toBe(0);
    });

    it('subtracts leadInMs when firstNoteTime is greater than leadInMs', () => {
      expect(computeSkipTargetMs(6000)).toBe(6000 - INTRO_SKIP_LEAD_IN_MS);
      expect(computeSkipTargetMs(10000)).toBe(8000);
      expect(computeSkipTargetMs(10000, 3000)).toBe(7000);
    });
  });

  describe('isSkipWindowActive', () => {
    const firstNoteTime = 8000;

    it('returns false if hasSkipped is true', () => {
      expect(isSkipWindowActive(1000, firstNoteTime, true)).toBe(false);
    });

    it('returns false if beatmap intro is not skippable', () => {
      expect(isSkipWindowActive(1000, 2500, false)).toBe(false);
    });

    it('returns false for non-finite songTime', () => {
      expect(isSkipWindowActive(NaN, firstNoteTime, false)).toBe(false);
      expect(isSkipWindowActive(Infinity, firstNoteTime, false)).toBe(false);
    });

    it('returns true during lead-in (negative time) and early playback', () => {
      expect(isSkipWindowActive(-1500, firstNoteTime, false)).toBe(true);
      expect(isSkipWindowActive(0, firstNoteTime, false)).toBe(true);
      expect(isSkipWindowActive(4000, firstNoteTime, false)).toBe(true);
    });

    it('returns false once songTime enters the end offset buffer', () => {
      const cutoffTime = firstNoteTime - INTRO_SKIP_WINDOW_END_OFFSET_MS;
      expect(isSkipWindowActive(cutoffTime - 1, firstNoteTime, false)).toBe(true);
      expect(isSkipWindowActive(cutoffTime, firstNoteTime, false)).toBe(false);
      expect(isSkipWindowActive(cutoffTime + 100, firstNoteTime, false)).toBe(false);
      expect(isSkipWindowActive(firstNoteTime, firstNoteTime, false)).toBe(false);
    });
  });

  describe('canPerformSkip', () => {
    const firstNoteTime = 8000;

    it('returns true during normal active window', () => {
      expect(canPerformSkip(0, firstNoteTime, false)).toBe(true);
      expect(canPerformSkip(2000, firstNoteTime, false)).toBe(true);
    });

    it('returns false if skip window is not active', () => {
      expect(canPerformSkip(0, firstNoteTime, true)).toBe(false);
      expect(canPerformSkip(7900, firstNoteTime, false)).toBe(false);
    });

    it('returns false if songTime is past hard cutoff', () => {
      const hardCutoff = firstNoteTime - INTRO_SKIP_HARD_CUTOFF_MS;
      expect(canPerformSkip(hardCutoff + 50, firstNoteTime, false)).toBe(false);
    });
  });
});
