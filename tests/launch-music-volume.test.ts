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
 * Tests for the Game Launch Music Volume setting: default level, hostile
 * input sanitization, and settings-registry slider registration.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/components/settings/defaultSettings';
import { ROWS as SETTING_ROWS } from '../src/components/settings/settingsRegistry';
import { sanitizeSettings } from '../src/utils/securityLimits';

describe('Game Launch Music Volume', () => {
  it('defaults to 10% of music volume', () => {
    expect(DEFAULT_SETTINGS.launchMusicVolume).toBe(0.1);
    expect(sanitizeSettings({}, DEFAULT_SETTINGS).launchMusicVolume).toBe(0.1);
  });

  it('clamps hostile persisted values into 0..1', () => {
    expect(sanitizeSettings({ launchMusicVolume: 2 }, DEFAULT_SETTINGS).launchMusicVolume).toBe(1);
    expect(sanitizeSettings({ launchMusicVolume: -1 }, DEFAULT_SETTINGS).launchMusicVolume).toBe(0);
    expect(sanitizeSettings({ launchMusicVolume: 'loud' }, DEFAULT_SETTINGS).launchMusicVolume).toBe(0.1);
    expect(sanitizeSettings({ launchMusicVolume: 0.25 }, DEFAULT_SETTINGS).launchMusicVolume).toBe(0.25);
  });

  it('registers an audio slider row for the setting', () => {
    const row = SETTING_ROWS.find((r) => r.id === 'launchMusicVolume');
    expect(row).toBeDefined();
    expect(row?.section).toBe('audio');
    expect(row?.label).toBe('Game Launch Music Volume');
    expect(row?.control.kind).toBe('slider');
    expect(row?.defaultValue).toBe(0.1);
  });
});
