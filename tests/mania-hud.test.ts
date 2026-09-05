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
import { ManiaHud, ArgonHealthDisplay, ArgonScoreCounter, ArgonWedgePieces } from '../src/components/ManiaHud';

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
    // Score 0: 5 wireframe zeros + 1 active zero
    const html0 = renderToStaticMarkup(
      React.createElement(ArgonScoreCounter, { score: 0 })
    );
    expect(html0).toContain('00000');
    expect(html0).not.toContain('SCORE');
    expect(html0).not.toContain('>Score<');

    // Score 42702: 1 wireframe zero + 42702
    const html42k = renderToStaticMarkup(
      React.createElement(ArgonScoreCounter, { score: 42702 })
    );
    expect(html42k).toContain('>0<');
    expect(html42k).toContain('>42702<');

    // Score 1,000,000: no leading wireframe zeros
    const html1m = renderToStaticMarkup(
      React.createElement(ArgonScoreCounter, { score: 1000000 })
    );
    expect(html1m).toContain('>1000000<');
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
});
