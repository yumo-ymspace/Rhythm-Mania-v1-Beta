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

/*
 * Settings must stack on top of the beatmap listing: opening settings
 * while the listing is open renders settings above it (previously the
 * settings drawer sat under the listing panel), and Escape closes the
 * topmost overlay first instead of both at once.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import SettingsDrawer from '../src/components/settings/SettingsDrawer';
import OnlineBeatmapCatalog from '../src/components/OnlineBeatmapCatalog';
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';

/**
 * Read the numeric z-index off the top-level overlay tag carrying `marker`
 * (only the overlay container matters — inner content like settings
 * dropdowns lives inside the drawer's own stacking context).
 */
function overlayZ(html: string, marker: string): number {
  const tag = html.match(new RegExp(`<[^>]*${marker}[^>]*>`))?.[0];
  expect(tag, `expected rendered html to contain ${marker}`).toBeDefined();
  const z = tag!.match(/z-\[(\d+)\]|z-(\d+)/);
  expect(z, `expected ${marker} tag to carry a z-index class`).not.toBeNull();
  return Number(z![1] ?? z![2]);
}

describe('settings stacks above the beatmap listing', () => {
  it('renders the settings backdrop/drawer above the listing backdrop/panel', () => {
    const settingsHtml = renderToStaticMarkup(
      React.createElement(SettingsDrawer, {
        open: true,
        onClose: () => {},
        settings: DEFAULT_SETTINGS,
        updateSettings: () => {},
      }),
    );
    const listingHtml = renderToStaticMarkup(
      React.createElement(OnlineBeatmapCatalog, {
        open: true,
        onClose: () => {},
        customMaps: [],
        onImportPackage: async () => {},
      }),
    );

    // Listing peaks at backdrop z-100 / panel z-110; the elevated
    // toolbar sits at z-120. The settings backdrop/drawer must clear all
    // of them so settings is never hidden behind the listing.
    expect(settingsHtml).toContain('z-[130]');
    expect(listingHtml).toContain('z-[100]');
    expect(overlayZ(settingsHtml, 'data-settings-drawer')).toBe(140);
    expect(overlayZ(listingHtml, 'data-beatmap-listing')).toBe(110);
    expect(overlayZ(settingsHtml, 'data-settings-drawer')).toBeGreaterThan(
      overlayZ(listingHtml, 'data-beatmap-listing'),
    );
  });

  it('listing Escape trap yields while the settings drawer is on top', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(testDir, '..', 'src', 'components', 'OnlineBeatmapCatalog.tsx'),
      'utf8',
    );
    // The capture-phase Escape handler must not close the listing when the
    // settings drawer is stacked above it (one Escape closes settings only).
    expect(source).toContain('[data-settings-drawer]');
    expect(source).toContain('isSettingsOnTop');
  });
});
