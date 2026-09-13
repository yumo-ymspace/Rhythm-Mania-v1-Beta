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

import { useEffect, useState } from 'react';
import { FooterBackButton } from './FooterBackButton';
import { LazerCookie } from './LazerCookie';
import { Shear } from './Shear';

function debugRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === 'lazer-cookie';
}

/** Isolated primitive smoke. Does not restyle MainMenu. */
export function LazerDebugSmoke() {
  const [show, setShow] = useState(debugRequested);

  useEffect(() => {
    setShow(debugRequested());
  }, []);

  if (!show) return null;

  return (
    <div
      id="lazer-debug-smoke"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'grid',
        placeItems: 'center',
        background: '#0d1520',
      }}
    >
      <LazerCookie size={280} bpm={60} />
      <div style={{ position: 'absolute', left: 24, bottom: 24 }}>
        <FooterBackButton />
      </div>
      <Shear
        className="lazer-debug-shear-swatch"
        style={{
          position: 'absolute',
          right: 24,
          bottom: 24,
          width: 140,
          height: 50,
          background: 'var(--lazer-play)',
        }}
      >
        <span style={{ color: '#fff', fontSize: 14 }}>shear</span>
      </Shear>
    </div>
  );
}
