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

export class TempMemoryCache {
  private static cache: Map<string, ArrayBuffer> = new Map();

  /**
   * Temporarily holds a downloaded ZIP buffer in memory.
   * Stores the reference without cloning: callers must not mutate or detach
   * the buffer after set(), and must call remove() in a finally block.
   */
  public static set(packageId: string, buffer: ArrayBuffer): void {
    if (!packageId || !Number.isSafeInteger(buffer.byteLength)) return;
    this.cache.set(packageId, buffer);
  }

  public static get(packageId: string): ArrayBuffer | null {
    return this.cache.get(packageId) ?? null;
  }

  public static remove(packageId: string): void {
    this.cache.delete(packageId);
  }

  public static clear(): void {
    this.cache.clear();
  }
}
