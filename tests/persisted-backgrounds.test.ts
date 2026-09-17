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
 * Tests for the persistent cross-session background-art cache: key building
 * (package + image dedupes sibling diffs) and record sanitization (hostile
 * IndexedDB data must never reach the DOM).
 */

import { describe, expect, it } from 'vitest';
import {
  buildBackgroundCacheKey,
  MAX_PERSISTED_BG_BYTES,
  sanitizeCachedBackgroundRecord,
} from '../src/utils/storageManager';

function bgBytes(size: number): ArrayBuffer {
  return new Uint8Array(size).buffer as ArrayBuffer;
}

describe('buildBackgroundCacheKey', () => {
  it('keys art by package and image filename', () => {
    const key = buildBackgroundCacheKey('pkg_123', 'bg.jpg');
    expect(key).toBe('bg:pkg_123:bg.jpg');
  });

  it('normalizes case and strips directories so sibling diffs share one entry', () => {
    const a = buildBackgroundCacheKey('pkg_123', 'BG/Foo.PNG');
    const b = buildBackgroundCacheKey('pkg_123', 'foo.png');
    expect(a).toBe(b);
  });

  it('scopes keys per package', () => {
    expect(buildBackgroundCacheKey('pkg_1', 'bg.jpg')).not.toBe(
      buildBackgroundCacheKey('pkg_2', 'bg.jpg'),
    );
  });

  it('rejects unusable inputs', () => {
    expect(buildBackgroundCacheKey('', 'bg.jpg')).toBeNull();
    expect(buildBackgroundCacheKey('pkg_1', '')).toBeNull();
    expect(buildBackgroundCacheKey('pkg_1', '..')).toBeNull();
    expect(buildBackgroundCacheKey('x'.repeat(301), 'bg.jpg')).toBeNull();
  });
});

describe('sanitizeCachedBackgroundRecord', () => {
  const valid = {
    key: 'bg:pkg_1:bg.jpg',
    data: bgBytes(1024),
    mime: 'image/jpeg',
    updatedAt: Date.now(),
  };

  it('accepts a well-formed record', () => {
    const clean = sanitizeCachedBackgroundRecord(valid, 'bg:pkg_1:bg.jpg');
    expect(clean).not.toBeNull();
    expect(clean?.mime).toBe('image/jpeg');
    expect(clean?.data.byteLength).toBe(1024);
  });

  it('rejects key mismatch', () => {
    expect(sanitizeCachedBackgroundRecord(valid, 'bg:pkg_2:bg.jpg')).toBeNull();
  });

  it('rejects non-ArrayBuffer, empty, and oversized payloads', () => {
    expect(
      sanitizeCachedBackgroundRecord({ ...valid, data: 'not-bytes' }),
    ).toBeNull();
    expect(
      sanitizeCachedBackgroundRecord({ ...valid, data: bgBytes(0) }),
    ).toBeNull();
    expect(
      sanitizeCachedBackgroundRecord({ ...valid, data: bgBytes(MAX_PERSISTED_BG_BYTES + 1) }),
    ).toBeNull();
  });

  it('rejects untrusted mime types', () => {
    expect(
      sanitizeCachedBackgroundRecord({ ...valid, mime: 'text/html' }),
    ).toBeNull();
    expect(
      sanitizeCachedBackgroundRecord({ ...valid, mime: 'image/svg+xml' }),
    ).toBeNull();
  });

  it('rejects non-records', () => {
    expect(sanitizeCachedBackgroundRecord(null)).toBeNull();
    expect(sanitizeCachedBackgroundRecord([])).toBeNull();
    expect(sanitizeCachedBackgroundRecord('bg')).toBeNull();
  });
});
