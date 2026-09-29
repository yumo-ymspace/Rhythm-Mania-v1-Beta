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

export const MIN_KEY_COUNT = 1;
export const MAX_KEY_COUNT = 10;
export const SUPPORTED_KEY_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function isSupportedKeyCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_KEY_COUNT && value <= MAX_KEY_COUNT;
}
