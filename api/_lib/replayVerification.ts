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

import crypto from 'crypto';
import JSZip from 'jszip';
import { parseHoldTailTime } from '../../src/utils/holdTiming.js';

export type ChecksumAlgorithm = 'md5' | 'sha256';

export interface CanonicalNote {
  lane: number;
  timeMs: number;
  endTimeMs?: number;
}

export interface CanonicalTimingPoint {
  timeMs: number;
  beatLength: number;
  uninherited: boolean;
  svMultiplier: number;
}

/** Server-side mania chart JSON persisted on catalog activation. */
export interface CanonicalChart {
  chartRevisionId: string;
  checksum: string;
  checksumAlgorithm: ChecksumAlgorithm;
  keyCount: number;
  mode: 3;
  overallDifficulty: number;
  hpDrainRate: number;
  durationMs: number;
  notes: readonly CanonicalNote[];
  timingPoints: readonly CanonicalTimingPoint[];
}


const MAX_NOTES = 20_000;
const MAX_TIMING_POINTS = 5_000;
const MAX_OSU_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_ARCHIVE_ENTRY_BYTES = 80 * 1024 * 1024;
const MIRROR_HOSTS = new Set(['catboy.best', 'mirror.nekoha.moe']);
const MIRROR_CONNECT_TIMEOUT_MS = 5_000;
const MIRROR_READ_TIMEOUT_MS = 5_000;
const MIRROR_TOTAL_TIMEOUT_MS = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function decodeCanonicalChart(value: unknown): CanonicalChart | null {
  if (!isRecord(value) || value.mode !== 3 || !integer(value.keyCount, 1, 10)) return null;
  if (
    typeof value.chartRevisionId !== 'string' || value.chartRevisionId.length < 1 || value.chartRevisionId.length > 256 ||
    typeof value.checksum !== 'string' || !/^[a-f0-9]{32}$|^[a-f0-9]{64}$/i.test(value.checksum) || !finiteNumber(value.overallDifficulty, 0, 10) ||
    !finiteNumber(value.hpDrainRate, 0, 10) || !finiteNumber(value.durationMs, 1, 86_400_000) ||
    (value.checksumAlgorithm !== 'md5' && value.checksumAlgorithm !== 'sha256') ||
    !Array.isArray(value.notes) || value.notes.length === 0 || value.notes.length > MAX_NOTES ||
    !Array.isArray(value.timingPoints) || value.timingPoints.length > MAX_TIMING_POINTS
  ) return null;
  const notes: CanonicalNote[] = [];
  for (const rawNote of value.notes) {
    if (!isRecord(rawNote) || !integer(rawNote.lane, 0, value.keyCount - 1) || !finiteNumber(rawNote.timeMs, 0, 86_400_000)) return null;
    if (rawNote.endTimeMs !== undefined && !finiteNumber(rawNote.endTimeMs, rawNote.timeMs + 1, 86_400_000)) return null;
    notes.push({ lane: rawNote.lane, timeMs: rawNote.timeMs, ...(rawNote.endTimeMs === undefined ? {} : { endTimeMs: rawNote.endTimeMs }) });
  }
  const timingPoints: CanonicalTimingPoint[] = [];
  for (const rawPoint of value.timingPoints) {
    if (!isRecord(rawPoint) || !finiteNumber(rawPoint.timeMs, -86_400_000, 86_400_000) || !finiteNumber(rawPoint.beatLength, 0.001, 86_400_000) || typeof rawPoint.uninherited !== 'boolean' || !finiteNumber(rawPoint.svMultiplier, -100, 100)) return null;
    timingPoints.push({ timeMs: rawPoint.timeMs, beatLength: rawPoint.beatLength, uninherited: rawPoint.uninherited, svMultiplier: rawPoint.svMultiplier });
  }
  return {
    chartRevisionId: value.chartRevisionId,
    checksum: value.checksum,
    checksumAlgorithm: value.checksumAlgorithm,
    keyCount: value.keyCount,
    mode: 3,
    overallDifficulty: value.overallDifficulty,
    hpDrainRate: value.hpDrainRate,
    durationMs: value.durationMs,
    notes,
    timingPoints,
  };
}

export interface MirrorChartExpectation {
  sourceChartId: number;
  filename: string;
  checksum: string;
  keyCount: number;
  chartRevisionId: string;
}

interface ZipDataInfo {
  compressedSize?: number;
  uncompressedSize?: number;
}

type ZipEntryStream = {
  on(event: 'data', listener: (chunk: Uint8Array) => void): ZipEntryStream;
  on(event: 'error' | 'end', listener: (error?: unknown) => void): ZipEntryStream;
  pause(): ZipEntryStream;
  resume(): ZipEntryStream;
};

type ZipObjectWithStream = JSZip.JSZipObject & {
  internalStream?: (type: string) => ZipEntryStream;
};

function zipInfo(file: JSZip.JSZipObject): ZipDataInfo {
  const data = (file as unknown as { _data?: ZipDataInfo })._data;
  return data || {};
}

async function extractArchiveEntry(
  entry: JSZip.JSZipObject,
  budget: { totalBytes: number },
): Promise<Uint8Array> {
  const internalStream = (entry as ZipObjectWithStream).internalStream;
  if (!internalStream) throw new Error('Mirror archive streaming is unavailable');

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let failed = false;
    const stream = internalStream.call(entry, 'uint8array');
    stream
      .on('data', (chunk) => {
        if (failed) return;
        try {
          if (chunk.byteLength > MAX_ARCHIVE_ENTRY_BYTES || budget.totalBytes + chunk.byteLength > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
            throw new Error('Mirror archive expands beyond the limit');
          }
          budget.totalBytes += chunk.byteLength;
          chunks.push(chunk);
        } catch (error) {
          failed = true;
          stream.pause();
          reject(error);
        }
      })
      .on('error', (error) => {
        if (failed) return;
        failed = true;
        reject(error instanceof Error ? error : new Error('Failed to extract mirror archive entry'));
      })
      .on('end', () => {
        if (failed) return;
        const totalBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const result = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(result);
      })
      .resume();
  });
}

function approvedMirrorUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MIRROR_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function fetchArchive(url: string): Promise<Uint8Array> {
  if (!approvedMirrorUrl(url)) throw new Error('Unapproved mirror');
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), MIRROR_TOTAL_TIMEOUT_MS);
  try {
    let currentUrl = url;
    for (let redirect = 0; redirect <= 2; redirect++) {
      const response = await withTimeout(
        fetch(currentUrl, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/octet-stream' } }),
        MIRROR_CONNECT_TIMEOUT_MS,
        () => controller.abort(),
      );
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || !approvedMirrorUrl(new URL(location, currentUrl).toString())) throw new Error('Mirror redirect is not allowed');
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`Mirror returned ${response.status}`);
      const advertisedLength = Number(response.headers.get('content-length') || 0);
      if (advertisedLength > MAX_ARCHIVE_BYTES) throw new Error('Mirror archive is too large');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await withTimeout(reader.read(), MIRROR_READ_TIMEOUT_MS, () => controller.abort());
        if (part.done) break;
        if (!part.value) continue;
        size += part.value.byteLength;
        if (size > MAX_ARCHIVE_BYTES) {
          await reader.cancel();
          throw new Error('Mirror archive is too large');
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    }
    throw new Error('Too many mirror redirects');
  } finally {
    clearTimeout(totalTimer);
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error('Mirror request timed out'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_OSU_TEXT_BYTES) throw new Error('osu! chart text is too large');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function parseCanonicalOsu(content: string, chartRevisionId: string, checksum: string, checksumAlgorithm: ChecksumAlgorithm): CanonicalChart {
  if (new TextEncoder().encode(content).byteLength > MAX_OSU_TEXT_BYTES) throw new Error('osu! chart text is too large');
  let section = '';
  let mode = -1;
  let keyCount = 4;
  let od = 8;
  let hp = 8;
  const notes: CanonicalNote[] = [];
  const timingPoints: CanonicalTimingPoint[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) { section = line.slice(1, -1).toLowerCase(); continue; }
    if (section === 'general' && /^mode\s*:/i.test(line)) mode = Number(line.slice(line.indexOf(':') + 1).trim());
    if (section === 'difficulty') {
      const separator = line.indexOf(':');
      if (separator >= 0) {
        const key = line.slice(0, separator).trim().toLowerCase();
        const value = Number(line.slice(separator + 1).trim());
        if (key === 'circlesize') keyCount = value;
        else if (key === 'overalldifficulty') od = value;
        else if (key === 'hpdrainrate') hp = value;
      }
    }
    if (section === 'timingpoints') {
      const parts = line.split(',');
      const timeMs = Number(parts[0]);
      const beatLength = Number(parts[1]);
      if (!finiteNumber(timeMs, -86_400_000, 86_400_000) || !finiteNumber(beatLength, -86_400_000, 86_400_000) || beatLength === 0) throw new Error('Invalid timing point');
      const uninherited = parts.length < 7 || parts[6].trim() !== '0';
      timingPoints.push({ timeMs, beatLength: Math.abs(beatLength), uninherited, svMultiplier: uninherited ? 1 : 100 / Math.abs(beatLength) });
      if (timingPoints.length > MAX_TIMING_POINTS) throw new Error('Too many timing points');
    }
    if (section === 'hitobjects') {
      const parts = line.split(',');
      const x = Number(parts[0]);
      const timeMs = Number(parts[2]);
      const type = Number(parts[3]);
      if (!integer(x, 0, 512) || !finiteNumber(timeMs, 0, 86_400_000) || !Number.isInteger(type)) throw new Error('Invalid hit object');
      const objectKeyCount = Number.isInteger(keyCount) ? keyCount : 4;
      const lane = Math.min(objectKeyCount - 1, Math.floor(x / (512 / objectKeyCount)));
      if ((type & 128) !== 0) {
        const endTimeMs = parseHoldTailTime((parts[5] || '').split(':', 1)[0], timeMs, 86_400_000);
        if (endTimeMs === null) throw new Error('Invalid hold note');
        notes.push({ lane, timeMs, endTimeMs });
      } else {
        notes.push({ lane, timeMs });
      }
      if (notes.length > MAX_NOTES) throw new Error('Too many notes');
    }
  }
  if (mode !== 3 || !integer(keyCount, 1, 10) || !finiteNumber(od, 0, 10) || !finiteNumber(hp, 0, 10) || notes.length === 0) throw new Error('Chart is not a playable mania chart');
  notes.sort((left, right) => left.timeMs - right.timeMs || left.lane - right.lane);
  const maxTimeMs = notes.reduce((max, note) => Math.max(max, note.endTimeMs || note.timeMs), 0);
  return { chartRevisionId, checksum, checksumAlgorithm, keyCount, mode: 3, overallDifficulty: od, hpDrainRate: hp, durationMs: Math.min(86_400_000, maxTimeMs + 3_000), notes, timingPoints };
}

export async function verifyMirrorArchive(sourceSetId: number, expectations: readonly MirrorChartExpectation[]): Promise<CanonicalChart[]> {
  const sources = [`https://catboy.best/d/${sourceSetId}`, `https://mirror.nekoha.moe/api/download/${sourceSetId}`];
  let bytes: Uint8Array | null = null;
  for (const source of sources) {
    try { bytes = await fetchArchive(source); break; } catch (error) {
      if (source === sources[sources.length - 1]) throw error;
    }
  }
  if (!bytes) throw new Error('Mirror archive unavailable');
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('Mirror archive has too many entries');
  const extractionBudget = { totalBytes: 0 };
  const extracted = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const info = zipInfo(entry);
    const size = info.uncompressedSize || 0;
    const compressed = info.compressedSize || 0;
    if (size > MAX_ARCHIVE_ENTRY_BYTES || compressed > MAX_ARCHIVE_BYTES) throw new Error('Mirror archive entry is too large');
    if (entry.dir) continue;

    // Count bytes as JSZip produces them so deceptive size headers cannot
    // allocate an unbounded entry before the aggregate limit is enforced.
    const content = await extractArchiveEntry(entry, extractionBudget);
    if (content.byteLength > MAX_ARCHIVE_ENTRY_BYTES) throw new Error('Mirror archive entry is too large');
    if (entry.name.toLowerCase().endsWith('.osu')) {
      if (content.byteLength > MAX_OSU_TEXT_BYTES) throw new Error('osu! chart text is too large');
      extracted.set(entry.name.split('/').pop()?.toLowerCase() || entry.name.toLowerCase(), content);
    }
  }
  const result: CanonicalChart[] = [];
  for (const expectation of expectations) {
    const expectedName = expectation.filename.split('/').pop()?.toLowerCase() || expectation.filename.toLowerCase();
    const bytesForChart = extracted.get(expectedName) || [...extracted.entries()].find(([name]) => name === `${expectation.sourceChartId}.osu`.toLowerCase())?.[1];
    if (!bytesForChart) throw new Error('Expected chart file is missing from mirror archive');
    const digest = crypto.createHash(expectation.checksum.length === 64 ? 'sha256' : 'md5').update(bytesForChart).digest('hex');
    if (digest.toLowerCase() !== expectation.checksum.toLowerCase()) throw new Error('Mirror chart checksum verification failed');
    const chart = parseCanonicalOsu(decodeUtf8(bytesForChart), expectation.chartRevisionId, digest, digest.length === 64 ? 'sha256' : 'md5');
    if (chart.keyCount !== expectation.keyCount || chart.mode !== 3) throw new Error('Mirror chart metadata verification failed');
    result.push(chart);
  }
  return result;
}
