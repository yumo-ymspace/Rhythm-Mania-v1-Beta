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
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManiaHud, ArgonHealthDisplay, ArgonScoreCounter, ArgonWedgePieces, ArgonSongProgress } from '../src/components/ManiaHud';
import { computeSongDensityBins, DENSITY_BIN_COUNT } from '../src/render/argonSkin';
import type { HitObject } from '../src/types';

describe('ManiaHud and Argon HUD components (TASK-052)', () => {
  it('renders ManiaHud with health display, wedges, and score counter', () => {
    const html = renderToStaticMarkup(
      React.createElement(ManiaHud, { score: 42702, hp: 85 })
    );

    expect(html).toContain('id="mania-hud"');
    expect(html).toContain('id="argon-health-display"');
    expect(html).toContain('id="argon-score-counter"');
    expect(html).toContain('42702');
  });

  it('ArgonHealthDisplay clamps health to 0..100 and renders horizontal accent line', () => {
    const html85 = renderToStaticMarkup(
      React.createElement(ArgonHealthDisplay, { hp: 85 })
    );
    expect(html85).toContain('width:85%');
    expect(html85).toContain('aria-valuenow="85"');
    // Accent line is 45px wide
    expect(html85).toContain('w-[45px]');

    // Clamps over 100
    const html120 = renderToStaticMarkup(
      React.createElement(ArgonHealthDisplay, { hp: 120 })
    );
    expect(html120).toContain('width:100%');
    expect(html120).toContain('aria-valuenow="100"');

    // Clamps below 0
    const htmlNeg = renderToStaticMarkup(
      React.createElement(ArgonHealthDisplay, { hp: -10 })
    );
    expect(htmlNeg).toContain('width:0%');
    expect(htmlNeg).toContain('aria-valuenow="0"');
  });

  it('ArgonScoreCounter displays 6 digits with wireframe template and no "Score" label', () => {
    // Score 0: 5 wireframe zeros + 1 active zero, each digit in its own fixed slot
    const html0 = renderToStaticMarkup(
      React.createElement(ArgonScoreCounter, { score: 0 })
    );
    expect(html0).not.toContain('SCORE');
    expect(html0).not.toContain('>Score<');
    // 6 fixed-width digit slots, 5 of them wireframe placeholders
    expect(html0.match(/w-\[1ch\]/g)).toHaveLength(6);
    expect(html0.match(/opacity-25/g)).toHaveLength(5);
    expect(html0.match(/>0</g)).toHaveLength(6);

    // Score 42702: 1 wireframe zero + one slot per digit of 42702
    const html42k = renderToStaticMarkup(
      React.createElement(ArgonScoreCounter, { score: 42702 })
    );
    expect(html42k).toContain('>0<');
    expect(html42k).toContain('>4<');
    expect(html42k).toContain('>2<');
    expect(html42k).toContain('>7<');
    expect(html42k.match(/w-\[1ch\]/g)).toHaveLength(6);
    expect(html42k.match(/opacity-25/g)).toHaveLength(1);

    // Score 1,000,000: 7 slots, no leading wireframe zeros
    const html1m = renderToStaticMarkup(
      React.createElement(ArgonScoreCounter, { score: 1000000 })
    );
    expect(html1m).toContain('>1<');
    expect(html1m.match(/w-\[1ch\]/g)).toHaveLength(7);
    expect(html1m).not.toContain('opacity-25');
  });

  it('ArgonWedgePieces renders stacked wedges with shear matrix and #66CCFF accent', () => {
    const html = renderToStaticMarkup(
      React.createElement(ArgonWedgePieces, { width: 380, height: 72 })
    );

    // Matrix shear (1 0 0.8 1 0 0)
    expect(html).toContain('matrix(1 0 0.8 1 0 0)');
    // Both front and back offset wedges
    expect(html).toContain('translate(4, 5)');
    expect(html).toContain('translate(0, 0)');
    // Accent colour #66CCFF
    expect(html).toContain('#66CCFF');
  });

  it('shows replay badge only when isReplayMode is true', () => {
    const htmlNormal = renderToStaticMarkup(
      React.createElement(ManiaHud, { score: 100, hp: 100, isReplayMode: false })
    );
    expect(htmlNormal).not.toContain('REPLAY');

    const htmlReplay = renderToStaticMarkup(
      React.createElement(ManiaHud, { score: 100, hp: 100, isReplayMode: true })
    );
    expect(htmlReplay).toContain('REPLAY');
  });

  it('TASK-V-052: computes 64 rate-invariant map-time density bins normalized to peak 1.0', () => {
    // Empty notes returns 64 zeros
    const emptyBins = computeSongDensityBins([]);
    expect(emptyBins).toHaveLength(DENSITY_BIN_COUNT);
    expect(Array.from(emptyBins).every((v) => v === 0)).toBe(true);

    // Notes at distinct map times across 100,000ms duration
    const testNotes: HitObject[] = [
      { id: '1', time: 0, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false },
      { id: '2', time: 25000, column: 1, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false },
      { id: '3', time: 50000, column: 2, type: 'hold', endTime: 55000, isHit: false, isReleased: false, isMissed: false, isHoldFailed: false },
      { id: '4', time: 50000, column: 3, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false }, // two notes at 50,000ms (peak)
      { id: '5', time: 99999, column: 0, type: 'normal', isHit: false, isReleased: false, isMissed: false, isHoldFailed: false },
    ];
    const bins = computeSongDensityBins(testNotes, 100000);
    expect(bins).toHaveLength(64);

    // Bin 0 (0ms) has 1 note -> 0.5
    expect(bins[0]).toBe(0.5);
    // Bin 16 (25000ms = 25% * 64 = 16) has 1 note -> 0.5
    expect(bins[16]).toBe(0.5);
    // Bin 32 (50000ms = 50% * 64 = 32) has 2 notes -> maxCount=2, normalized to 1.0
    expect(bins[32]).toBe(1.0);
    // Bin 63 (99999ms) has 1 note -> 0.5
    expect(bins[63]).toBe(0.5);
    // An empty bin
    expect(bins[10]).toBe(0);
  });

  it('TASK-V-052: renders ArgonSongProgress with density histogram canvas and progress pill', () => {
    const dummyBins = new Float32Array(64);
    dummyBins[0] = 1.0;
    dummyBins[32] = 0.5;

    const html = renderToStaticMarkup(
      React.createElement(ArgonSongProgress, {
        densityBins: dummyBins,
      })
    );

    expect(html).toContain('id="argon-song-progress"');
    // Contains density histogram canvas
    expect(html).toContain('<canvas');
    expect(html).toContain('width="256"');
    expect(html).toContain('height="16"');
    // Contains elapsed and remaining time labels
    expect(html).toContain('0:00');
    expect(html).toContain('-0:00');
  });

  it('TASK-V-052: passes densityBins to ArgonSongProgress inside ManiaHud', () => {
    const dummyBins = new Float32Array(64);
    dummyBins[10] = 1.0;

    const html = renderToStaticMarkup(
      React.createElement(ManiaHud, {
        score: 500000,
        hp: 100,
        densityBins: dummyBins,
        isReplayMode: false,
        isAutoplay: false,
      })
    );

    expect(html).toContain('id="argon-song-progress"');
    expect(html).toContain('<canvas');
  });
});

