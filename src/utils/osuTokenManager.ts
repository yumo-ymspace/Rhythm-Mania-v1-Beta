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

/**
 * Public mirror access: no osu! account or OAuth token required.
 * Search is served by GET /api/catalog/search (catboy.best primary,
 * Nekoha fallback, server-side). Downloads fetch the .osz directly from
 * catboy.best with a Nekoha fallback.
 */

import { CATBOY_DOWNLOAD_ENDPOINT, NEKOHA_DOWNLOAD_ENDPOINT } from '../../api/_lib/mirrorCatalog';

type MirrorRequestKind = 'api' | 'download';

const lastRequestAt: Record<MirrorRequestKind, number> = {
  api: 0,
  download: 0,
};

const API_MIN_INTERVAL_MS = 1000;
const DOWNLOAD_MIN_INTERVAL_MS = 6000;

export async function waitForOsuSlot(kind: MirrorRequestKind): Promise<void> {
  const minInterval = kind === 'download' ? DOWNLOAD_MIN_INTERVAL_MS : API_MIN_INTERVAL_MS;
  const now = Date.now();
  const waitMs = Math.max(0, lastRequestAt[kind] + minInterval - now);
  if (waitMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, waitMs));
  }
  lastRequestAt[kind] = Date.now();
}

async function streamToBlob(
  response: Response,
  maxBytes: number,
  onProgress: (loaded: number, total: number) => void,
): Promise<Blob> {
  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  if (totalBytes > maxBytes) {
    throw new Error(
      `Security Exception: Download size exceeds limit (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('ReadableStream is unsupported in this browser.');

  let loadedBytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loadedBytes += value.length;
    if (loadedBytes > maxBytes) {
      reader.cancel();
      throw new Error(
        `Security Exception: Download size limit exceeded (${(loadedBytes / (1024 * 1024)).toFixed(1)} MB)`,
      );
    }
    onProgress(loadedBytes, totalBytes);
  }

  return new Blob(
    chunks.map((chunk) => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      return copy.buffer;
    }),
    { type: 'application/octet-stream' },
  );
}

export async function downloadBeatmapsetArchive(
  sourceSetId: number,
  onStatus: (message: string) => void,
  onProgress: (loaded: number, total: number) => void,
  maxBytes: number,
): Promise<Blob> {
  await waitForOsuSlot('download');
  onStatus('Requesting download from Catboy mirror…');

  let catboyError = '';
  try {
    const response = await fetch(`${CATBOY_DOWNLOAD_ENDPOINT}/${sourceSetId}`);
    if (response.ok) {
      return await streamToBlob(response, maxBytes, onProgress);
    }
    catboyError = `Catboy mirror responded (${response.status})`;
  } catch (error) {
    catboyError = error instanceof Error ? error.message : 'Catboy mirror unreachable';
  }

  onStatus(`Catboy failed (${catboyError}). Trying Nekoha mirror…`);
  let nekohaResponse: Response;
  try {
    nekohaResponse = await fetch(`${NEKOHA_DOWNLOAD_ENDPOINT}/${sourceSetId}`);
  } catch (error) {
    throw new Error(`Download failed: ${catboyError}; Nekoha mirror unreachable`);
  }
  if (nekohaResponse.status === 410) {
    throw new Error('Download failed: beatmapset is unavailable on the mirrors (DMCA or missing audio)');
  }
  if (!nekohaResponse.ok) {
    throw new Error(`Download failed: Catboy (${catboyError}), Nekoha (${nekohaResponse.status})`);
  }
  return streamToBlob(nekohaResponse, maxBytes, onProgress);
}

export async function searchOsuBeatmapSetId(title: string, artist: string): Promise<number | null> {
  try {
    const cleanTerm = `${title} ${artist}`.trim();
    if (!cleanTerm) return null;
    await waitForOsuSlot('api');
    const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(cleanTerm)}&s=any`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json || !Array.isArray(json.data) || json.data.length === 0) return null;
    const lowerTitle = title.toLowerCase().trim();
    const lowerArtist = artist.toLowerCase().trim();
    const exactMatch = json.data.find((item: any) =>
      item.title?.toLowerCase().trim() === lowerTitle ||
      (item.title?.toLowerCase().includes(lowerTitle) && item.artist?.toLowerCase().includes(lowerArtist))
    );
    const matched = exactMatch || json.data[0];
    const setId = Number(matched.sourceSetId || String(matched.id || '').replace(/^osuapi_/, ''));
    return Number.isInteger(setId) && setId > 0 ? setId : null;
  } catch (err) {
    console.warn('Failed to search mirror catalog for replay beatmapset:', err);
    return null;
  }
}
