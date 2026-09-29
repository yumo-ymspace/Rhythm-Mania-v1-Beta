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
 * Tests for the Uncapped Menu Motion setting and the expanded FPS counter:
 * default level, hostile input sanitization, and settings-registry rows.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';
import { ROWS as SETTING_ROWS } from '../src/components/settings/settingsRegistry';
import { sanitizeSettings } from '../src/utils/securityLimits';

describe('Uncapped Menu Motion', () => {
  it('defaults to the eco throttle (off)', () => {
    expect(DEFAULT_SETTINGS.uncappedMenuMotion).toBe(false);
    expect(sanitizeSettings({}, DEFAULT_SETTINGS).uncappedMenuMotion).toBe(false);
  });

  it('coerces hostile persisted values to boolean', () => {
    expect(sanitizeSettings({ uncappedMenuMotion: true }, DEFAULT_SETTINGS).uncappedMenuMotion).toBe(true);
    expect(sanitizeSettings({ uncappedMenuMotion: 1 }, DEFAULT_SETTINGS).uncappedMenuMotion).toBe(true);
    expect(sanitizeSettings({ uncappedMenuMotion: 'yes' }, DEFAULT_SETTINGS).uncappedMenuMotion).toBe(true);
    expect(sanitizeSettings({ uncappedMenuMotion: 0 }, DEFAULT_SETTINGS).uncappedMenuMotion).toBe(false);
    expect(sanitizeSettings({ uncappedMenuMotion: null }, DEFAULT_SETTINGS).uncappedMenuMotion).toBe(false);
  });

  it('registers a visual toggle row for the setting', () => {
    const row = SETTING_ROWS.find((r) => r.id === 'uncappedMenuMotion');
    expect(row).toBeDefined();
    expect(row?.section).toBe('visual');
    expect(row?.control.kind).toBe('toggle');
    expect(row?.defaultValue).toBe(false);
  });
});

describe('FPS counter readout', () => {
  it('registers a visual toggle row describing every screen', () => {
    const row = SETTING_ROWS.find((r) => r.id === 'showFpsCounter');
    expect(row).toBeDefined();
    expect(row?.section).toBe('visual');
    expect(row?.control.kind).toBe('toggle');
    expect(row?.description).toMatch(/every screen/i);
  });
});
