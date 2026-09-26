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
 * Regression tests for the `Disable background video` setting: when
 * skipVideo is set, unpackBeatmap must not inflate video bytes (no Blob URL
 * is materialized) and must release any previously cached video blob.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import JSZip from 'jszip';
import { shouldUnpackVideo, unpackBeatmap } from '../src/utils/unpackHelper';
import { storageManager, type SavedBeatmap } from '../src/utils/storageManager';
import { TempMemoryCache } from '../src/utils/tempMemoryCache';
import type { Beatmap } from '../src/types';

let blobCounter = 0;
const createdUrls: string[] = [];
const revokedUrls: string[] = [];

function installBlobStubs(): void {
  blobCounter = 0;
  createdUrls.length = 0;
  revokedUrls.length = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(
    (_b: Blob) => {
      const url = `blob:mock-${++blobCounter}`;
      createdUrls.push(url);
      return url;
    },
  );
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn(
    (u: string) => {
      revokedUrls.push(u);
    },
  );
}

let idCounter = 0;

function makeMap(): Beatmap {
  idCounter += 1;
  return {
    id: `skipvid-map-${idCounter}`,
    title: 'Title',
    artist: 'Artist',
    creator: 'Mapper',
    difficulty: 'Normal',
    bpm: 180,
    keyCount: 4,
    duration: 10,
    notes: [],
    hpDrainRate: 5,
    overallDifficulty: 5,
    timingPoints: [],
    sliderMultiplier: 1.4,
    packageId: `skipvid-pkg-${idCounter}`,
    audioFilename: 'audio.mp3',
    videoFilename: 'video.mp4',
    bgFilename: 'bg.jpg',
  } as unknown as Beatmap;
}

async function seedZip(packageId: string): Promise<void> {
  const zip = new JSZip();
  zip.file('audio.mp3', new Uint8Array([1, 2, 3, 4]));
  zip.file('video.mp4', new Uint8Array([5, 6, 7, 8]));
  zip.file('bg.jpg', new Uint8Array([9, 10, 11, 12]));
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  TempMemoryCache.set(packageId, buffer);
}

describe('shouldUnpackVideo', () => {
  it('requires a browser-playable video file and an enabled setting', () => {
    expect(shouldUnpackVideo('video.mp4')).toBe(true);
    expect(shouldUnpackVideo('movie.WEBM', { skipVideo: false })).toBe(true);
    expect(shouldUnpackVideo('video.mp4', { skipVideo: true })).toBe(false);
    expect(shouldUnpackVideo('movie.avi')).toBe(false);
    expect(shouldUnpackVideo('movie.mkv', { skipVideo: false })).toBe(false);
    expect(shouldUnpackVideo(undefined)).toBe(false);
    expect(shouldUnpackVideo('')).toBe(false);
  });
});

describe('unpackBeatmap skipVideo', () => {
  beforeEach(() => {
    storageManager.lruMediaCache.clearAll();
    TempMemoryCache.clear();
    installBlobStubs();
  });

  it('extracts audio, video, and background without skipVideo', async () => {
    const map = makeMap();
    await seedZip((map as SavedBeatmap).packageId!);
    await unpackBeatmap(map, false);

    expect(map.audioUrl?.startsWith('blob:')).toBe(true);
    expect(map.videoUrl?.startsWith('blob:')).toBe(true);
    expect(map.bgUrl?.startsWith('blob:')).toBe(true);
    expect(createdUrls).toHaveLength(3);
    const cached = storageManager.lruMediaCache.get(map.id);
    expect(cached?.videoUrl.startsWith('blob:')).toBe(true);
  });

  it('materializes no video Blob URL with skipVideo but keeps audio and background', async () => {
    const map = makeMap();
    await seedZip((map as SavedBeatmap).packageId!);
    await unpackBeatmap(map, false, { skipVideo: true });

    expect(map.audioUrl?.startsWith('blob:')).toBe(true);
    expect(map.videoUrl).toBe('');
    expect(map.bgUrl?.startsWith('blob:')).toBe(true);
    // Only audio + background blobs are created; video bytes are never inflated.
    expect(createdUrls).toHaveLength(2);
    const cached = storageManager.lruMediaCache.get(map.id);
    expect(cached?.videoUrl).toBe('');
  });

  it('releases a previously cached video blob when a later unpack skips video', async () => {
    const map = makeMap();
    const packageId = (map as SavedBeatmap).packageId!;
    await seedZip(packageId);
    await unpackBeatmap(map, false);
    const retainedVideo = map.videoUrl as string;
    expect(retainedVideo.startsWith('blob:')).toBe(true);

    // Second unpack hits the cache-complete path (audio+bg+hitsounds cached)
    // and must strip the retained video blob.
    await unpackBeatmap(map, false, { skipVideo: true });

    expect(map.videoUrl).toBe('');
    expect(storageManager.lruMediaCache.get(map.id)?.videoUrl).toBe('');
    expect(revokedUrls).toContain(retainedVideo);
  });

  it('force re-unpack with skipVideo drops video even when forced', async () => {
    const map = makeMap();
    const packageId = (map as SavedBeatmap).packageId!;
    await seedZip(packageId);
    await unpackBeatmap(map, false);
    expect((map.videoUrl as string).startsWith('blob:')).toBe(true);

    await seedZip(packageId);
    await unpackBeatmap(map, true, { skipVideo: true });

    expect(map.videoUrl).toBe('');
    expect(map.audioUrl?.startsWith('blob:')).toBe(true);
    expect(storageManager.lruMediaCache.get(map.id)?.videoUrl).toBe('');
  });
});
