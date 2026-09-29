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
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';
import { sanitizeSettings } from '../src/utils/securityLimits';
import {
  DEFAULT_RENDER_DPR,
  getEffectiveDpr,
  sanitizeRenderDpr,
} from '../src/render/displayScale';
import { cachedHexToRgba, clearColorCaches, darkenCached, getCachedRgb01 } from '../src/render/colorCache';
import { getVisibleNotes } from '../src/render/noteVisibility';
import type { HitObject } from '../src/types';
import type { PlayfieldVisualSettings, VisibleNote } from '../src/render/types';

describe('renderDpr user setting', () => {
  it('defaults to balanced 1.5x', () => {
    expect(DEFAULT_SETTINGS.renderDpr).toBe(1.5);
    expect(DEFAULT_RENDER_DPR).toBe(1.5);
    expect(sanitizeSettings({}, DEFAULT_SETTINGS).renderDpr).toBe(1.5);
  });

  it('accepts 1, 1.5, 2 as number or string', () => {
    expect(sanitizeRenderDpr(1)).toBe(1);
    expect(sanitizeRenderDpr(1.5)).toBe(1.5);
    expect(sanitizeRenderDpr(2)).toBe(2);
    expect(sanitizeRenderDpr('1')).toBe(1);
    expect(sanitizeRenderDpr('1.5')).toBe(1.5);
    expect(sanitizeRenderDpr('2')).toBe(2);
    expect(sanitizeSettings({ renderDpr: 2 }, DEFAULT_SETTINGS).renderDpr).toBe(2);
    expect(sanitizeSettings({ renderDpr: '1' }, DEFAULT_SETTINGS).renderDpr).toBe(1);
  });

  it('rejects hostile values to the default', () => {
    expect(sanitizeRenderDpr(0)).toBe(1.5);
    expect(sanitizeRenderDpr(3)).toBe(1.5);
    expect(sanitizeRenderDpr(NaN)).toBe(1.5);
    expect(sanitizeRenderDpr('sharp')).toBe(1.5);
    expect(sanitizeSettings({ renderDpr: 99 }, DEFAULT_SETTINGS).renderDpr).toBe(1.5);
  });

  it('migrates the removed limitDprToOne boolean', () => {
    expect(sanitizeSettings({ limitDprToOne: true }, DEFAULT_SETTINGS).renderDpr).toBe(1);
    expect(sanitizeSettings({ limitDprToOne: false }, DEFAULT_SETTINGS).renderDpr).toBe(1.5);
    expect(sanitizeSettings({ renderDpr: 2, limitDprToOne: true }, DEFAULT_SETTINGS).renderDpr).toBe(2);
  });

  it('drops limitDprToOne from sanitized settings', () => {
    const clean = sanitizeSettings({ renderDpr: 2 }, DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
    expect('limitDprToOne' in clean).toBe(false);
    expect(getEffectiveDpr({ renderDpr: 2 })).toBe(2);
    expect(getEffectiveDpr({})).toBe(1.5);
    expect(getEffectiveDpr(null)).toBe(1.5);
  });
});

describe('color cache', () => {
  it('parses each unique color once and serves stable tuples', () => {
    clearColorCaches();
    const a = getCachedRgb01('#ff0000');
    const b = getCachedRgb01('#ff0000');
    expect(a).toBe(b);
    expect(a[0]).toBeCloseTo(1, 5);
    expect(a[1]).toBeCloseTo(0, 5);
  });

  it('darkens and lightens without string round-trips', () => {
    const [r, g, b] = darkenCached('#ffffff', 3);
    expect(r).toBeCloseTo(0.25, 5);
    expect(g).toBeCloseTo(0.25, 5);
    expect(b).toBeCloseTo(0.25, 5);
  });

  it('builds stable rgba strings for repeated alphas', () => {
    clearColorCaches();
    const a = cachedHexToRgba('#00b0ff', 0.5);
    const b = cachedHexToRgba('#00b0ff', 0.5);
    expect(a).toBe(b);
    expect(a.startsWith('rgba(')).toBe(true);
  });
});

describe('getVisibleNotes buffer reuse', () => {
  const settings: PlayfieldVisualSettings = {
    upsurfaceNoteMode: false,
    scrollSpeed: 21,
    audioOffset: 0,
    visualOffset: 0,
    noteOpacity: 1,
    selectedMods: [],
  };

  function makeNote(time: number): HitObject {
    return {
      id: `n-${time}`,
      time,
      column: 0,
      type: 'normal',
      isHit: false,
      isReleased: false,
      isMissed: false,
      isHoldFailed: false,
    };
  }

  it('reuses the provided output array without changing results', () => {
    const notes = [makeNote(1000), makeNote(2000), makeNote(3000)];
    const fresh = getVisibleNotes(notes, settings, 800, 600, 1000, 0.2);
    const out: VisibleNote[] = [];
    const reused = getVisibleNotes(notes, settings, 800, 600, 1000, 0.2, null, 0, [], out);
    expect(reused).toBe(out);
    expect(out.map((n) => n.id)).toEqual(fresh.map((n) => n.id));
    // Second call clears rather than appends.
    const again = getVisibleNotes(notes, settings, 800, 600, 2000, 0.2, null, 0, [], out);
    expect(again).toBe(out);
    expect(out.length).toBeGreaterThan(0);
  });
});
