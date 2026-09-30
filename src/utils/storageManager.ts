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

import { Beatmap, CloudBeatmapSource, HitObject, TimingControlPoint } from '../types';
import { AssetLifecycleManager, getMediaCacheKey } from './assetLifecycle';
import { TempMemoryCache } from './tempMemoryCache';
import {
  isSafeAssetUrl,
  isTrustedCatalogCoverUrl,
  MAX_BEATMAP_NOTES,
  MAX_BEATMAP_TIMING_POINTS,
  MAX_COMPRESSED_SIZE_BYTES,
  MAX_MEDIA_URL_LENGTH,
  MAX_OSU_TEXT_BYTES,
} from './securityLimits';

export interface SavedBeatmap extends Beatmap {
  packageId?: string;
  parentPackageId?: string;
  audioFilename?: string;
  videoFilename?: string | null;
  bgFilename?: string | null;
  originalContent?: string;
  isServerMap?: boolean;
  cloudSetId?: string;
  chartRevisionId?: string;
  source?: CloudBeatmapSource;
  sourceSetId?: number;
  sourceChartId?: number;
  originalOsuFilename?: string;
  checksum?: string;
  checksumAlgorithm?: 'md5' | 'sha256';
  importedAt?: number; // epoch ms when first saved locally; used by "Date Added" sort
  starRating?: number;
  starRatingSource?: 'osu-api-download' | 'chart-content' | 'legacy-fallback';
  starRatingVersion?: number;
  isCached?: boolean;
}

export interface PackageRecord {
  id: string;
  name: string;
  zipData?: ArrayBuffer;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function safeString(value: unknown, maxLength: number, fallback = ''): string {
  return typeof value === 'string' && value.length <= maxLength ? value : fallback;
}

/**
 * Byte-aware text guard for .osu content: the budget is UTF-8 bytes
 * (MAX_OSU_TEXT_BYTES), not JS char count. Checks char length first as a
 * cheap prefilter, then the encoded byte length, so multi-byte content is
 * measured consistently in one place.
 */
function safeBoundedText(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string' || value.length > maxBytes) return '';
  return new TextEncoder().encode(value).byteLength > maxBytes ? '' : value;
}

function safeMediaUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_MEDIA_URL_LENGTH) return '';
  return !value || isSafeAssetUrl(value) ? value : '';
}

function safeCoverUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_MEDIA_URL_LENGTH) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (isSafeAssetUrl(trimmed) || isTrustedCatalogCoverUrl(trimmed)) return trimmed;
  return undefined;
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  if (name === 'QuotaExceededError') return true;
  // Legacy DOMException numeric code for quota errors.
  return (err as { code?: unknown }).code === 22;
}

function isPackageRecord(value: unknown, expectedId: string): value is PackageRecord {
  if (!isRecord(value) || value.id !== expectedId || !(value.zipData instanceof ArrayBuffer)) return false;
  return value.zipData.byteLength <= MAX_COMPRESSED_SIZE_BYTES;
}

function sanitizeHitObject(value: unknown, index: number, keyCount: number): HitObject | null {
  if (!isRecord(value)) return null;
  const time = finiteNumber(value.time, 0, 10000000);
  const column = finiteNumber(value.column, 0, keyCount - 1);
  if (time === null || column === null || !Number.isInteger(column)) return null;
  const type = value.type === 'normal' || value.type === 'hold' ? value.type : null;
  if (!type) return null;
  const note: HitObject = {
    id: safeString(value.id, 200, `stored_note_${index}`),
    time,
    column,
    type,
    isHit: Boolean(value.isHit),
    isReleased: Boolean(value.isReleased),
    isMissed: Boolean(value.isMissed),
    isHoldFailed: Boolean(value.isHoldFailed),
  };
  const endTime = value.endTime === undefined ? undefined : finiteNumber(value.endTime, time + 1, 10000000);
  if (value.endTime !== undefined && endTime === null) return null;
  if (endTime !== undefined && endTime !== null) note.endTime = endTime;
  for (const field of ['hitTime', 'releaseTime', 'releaseGraceUntil'] as const) {
    if (value[field] !== undefined) {
      const number = finiteNumber(value[field], 0, 10000000);
      if (number === null) return null;
      note[field] = number;
    }
  }
  for (const field of ['x', 'y', 'hitSound'] as const) {
    if (value[field] !== undefined) {
      const max = field === 'x' ? 512 : field === 'y' ? 384 : 255;
      const number = finiteNumber(value[field], 0, max);
      if (number === null) return null;
      note[field] = number;
    }
  }
  if (isRecord(value.hitSample)) {
    const normalSet = finiteNumber(value.hitSample.normalSet, 0, 1000);
    const additionSet = finiteNumber(value.hitSample.additionSet, 0, 1000);
    const sampleIndex = finiteNumber(value.hitSample.index, 0, 1000);
    const volume = finiteNumber(value.hitSample.volume, 0, 1000);
    if (normalSet === null || additionSet === null || sampleIndex === null || volume === null) return null;
    note.hitSample = {
      normalSet,
      additionSet,
      index: sampleIndex,
      volume,
      filename: value.hitSample.filename === undefined ? undefined : safeString(value.hitSample.filename, 512),
    };
  }
  return note;
}

/** Runtime guard for records read from IndexedDB or legacy localStorage. */
export function sanitizeSavedBeatmap(raw: unknown): SavedBeatmap | null {
  if (!isRecord(raw)) return null;
  const keyCount = finiteNumber(raw.keyCount, 1, 10);
  const duration = finiteNumber(raw.duration, 0, 10000000);
  const bpm = finiteNumber(raw.bpm, 0.01, 10000);
  const hpDrainRate = finiteNumber(raw.hpDrainRate, 0, 10);
  const overallDifficulty = finiteNumber(raw.overallDifficulty, 0, 10);
  const approachRateParsed = raw.approachRate === undefined ? undefined : finiteNumber(raw.approachRate, 0, 10);
  if (raw.approachRate !== undefined && approachRateParsed === null) return null;
  const sliderMultiplier = finiteNumber(raw.sliderMultiplier, 0.001, 10);
  if (keyCount === null || duration === null || bpm === null || hpDrainRate === null || overallDifficulty === null || sliderMultiplier === null ||
      !Number.isInteger(keyCount) || !Array.isArray(raw.notes) || raw.notes.length > MAX_BEATMAP_NOTES ||
      !Array.isArray(raw.timingPoints) || raw.timingPoints.length > MAX_BEATMAP_TIMING_POINTS) return null;
  const approachRate = approachRateParsed ?? overallDifficulty;

  const notes: HitObject[] = [];
  for (let i = 0; i < raw.notes.length; i++) {
    const note = sanitizeHitObject(raw.notes[i], i, keyCount);
    if (!note || note.column >= keyCount) return null;
    notes.push(note);
  }
  const timingPoints: TimingControlPoint[] = [];
  for (const point of raw.timingPoints) {
    if (!isRecord(point)) return null;
    const timeMs = finiteNumber(point.timeMs, -1000000, 10000000);
    const beatLength = finiteNumber(point.beatLength, -600000, 600000);
    const svMultiplier = finiteNumber(point.svMultiplier, -1000, 1000);
    if (timeMs === null || beatLength === null || beatLength === 0 || svMultiplier === null || typeof point.uninherited !== 'boolean') return null;
    timingPoints.push({ timeMs, beatLength, uninherited: point.uninherited, svMultiplier });
  }
  const mode = raw.mode === undefined ? 3 : finiteNumber(raw.mode, 3, 3);
  if (mode === null || !Number.isInteger(keyCount)) return null;
  const baseBeatLength = raw.baseBeatLength === undefined ? undefined : finiteNumber(raw.baseBeatLength, 0.001, 600000);
  if (raw.baseBeatLength !== undefined && baseBeatLength === null) return null;
  const breaks: Array<{ startTime: number; endTime: number }> = [];
  if (raw.breaks !== undefined) {
    if (!Array.isArray(raw.breaks) || raw.breaks.length > 10000) return null;
    for (const item of raw.breaks) {
      if (!isRecord(item)) return null;
      const startTime = finiteNumber(item.startTime, 0, 10000000);
      const endTime = finiteNumber(item.endTime, 0, 10000000);
      if (startTime === null || endTime === null || endTime <= startTime) return null;
      breaks.push({ startTime, endTime });
    }
  }
  const hitSoundUrls: Record<string, string> = {};
  if (raw.hitSoundUrls !== undefined) {
    if (!isRecord(raw.hitSoundUrls) || Object.keys(raw.hitSoundUrls).length > 100) return null;
    for (const [name, url] of Object.entries(raw.hitSoundUrls)) hitSoundUrls[safeString(name, 512)] = safeMediaUrl(url);
  }
  const originalContent = raw.originalContent === undefined ? undefined : safeBoundedText(raw.originalContent, MAX_OSU_TEXT_BYTES);
  if (raw.originalContent !== undefined && originalContent === '') return null;
  const starRating = raw.starRating === undefined ? undefined : finiteNumber(raw.starRating, 0, 20);
  if (raw.starRating !== undefined && starRating === null) return null;
  const starRatingSource = raw.starRatingSource === 'osu-api-download' || raw.starRatingSource === 'chart-content' || raw.starRatingSource === 'legacy-fallback'
    ? raw.starRatingSource
    : undefined;
  const starRatingVersion = raw.starRatingVersion === undefined ? undefined : finiteNumber(raw.starRatingVersion, 1, 100);
  if (raw.starRatingVersion !== undefined && (starRatingVersion === null || !Number.isInteger(starRatingVersion))) return null;
  let sourceSetId = raw.sourceSetId === undefined ? undefined : finiteNumber(raw.sourceSetId, 1, 2147483647) ?? undefined;
  if (sourceSetId === undefined && originalContent) {
    const match = originalContent.match(/^BeatmapSetID\s*:\s*(\d+)/im);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
    }
  }
  let sourceChartId = raw.sourceChartId === undefined ? undefined : finiteNumber(raw.sourceChartId, 1, 2147483647) ?? undefined;
  if (sourceChartId === undefined && originalContent) {
    const match = originalContent.match(/^BeatmapID\s*:\s*(\d+)/im);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isInteger(parsed) && parsed > 0) sourceChartId = parsed;
    }
  }
  const coverUrl = safeCoverUrl(raw.coverUrl) || (sourceSetId ? `https://assets.ppy.sh/beatmaps/${sourceSetId}/covers/slimcover@2x.jpg` : undefined);
  // Rank status is written at catalog-download time (OnlineBeatmapCatalog);
  // the allowlist must preserve it or every reload would drop it and the
  // song banners would fall back to LOCAL. Source truth is kept verbatim
  // (approved/qualified included); display mapping lives in the resolver.
  const rankStatusRaw = typeof raw.rankStatus === 'string' ? raw.rankStatus.toLowerCase().slice(0, 16) : undefined;
  const rankStatus = rankStatusRaw === 'ranked' || rankStatusRaw === 'approved' || rankStatusRaw === 'qualified'
    || rankStatusRaw === 'loved' || rankStatusRaw === 'graveyard' || rankStatusRaw === 'pending' || rankStatusRaw === 'wip'
    ? rankStatusRaw
    : undefined;
  const result: SavedBeatmap = {
    id: safeString(raw.id, 300),
    title: safeString(raw.title, 300, 'Unknown Title'),
    artist: safeString(raw.artist, 300, 'Unknown Artist'),
    creator: safeString(raw.creator, 300, 'Unknown Mapper'),
    difficulty: safeString(raw.difficulty, 200, 'Normal'),
    bpm,
    keyCount,
    duration,
    notes,
    hpDrainRate,
    overallDifficulty,
    approachRate,
    timingPoints,
    sliderMultiplier,
    baseBeatLength: baseBeatLength ?? undefined,
    breaks,
    audioUrl: safeMediaUrl(raw.audioUrl),
    videoUrl: safeMediaUrl(raw.videoUrl),
    bgUrl: safeMediaUrl(raw.bgUrl),
    coverUrl,
    hitSoundUrls,
    videoStartTime: raw.videoStartTime === undefined ? undefined : finiteNumber(raw.videoStartTime, -1000000, 10000000) ?? undefined,
    previewTime: raw.previewTime === undefined ? undefined : finiteNumber(raw.previewTime, -1, 10000000) ?? undefined,
    mode: 3,
        catalogSetId: typeof raw.catalogSetId === 'string' || raw.catalogSetId === null ? raw.catalogSetId : null,
    catalogMapId: typeof raw.catalogMapId === 'string' || raw.catalogMapId === null ? raw.catalogMapId : null,
    rankStatus,    beatmapHash: safeString(raw.beatmapHash, 256) || undefined,
    isServerMap: Boolean(raw.isServerMap),
    chartRevisionId: typeof raw.chartRevisionId === 'string' ? raw.chartRevisionId : undefined,
    checksum: safeString(raw.checksum, 128) || undefined,
    checksumAlgorithm: raw.checksumAlgorithm === 'md5' || raw.checksumAlgorithm === 'sha256' ? raw.checksumAlgorithm : undefined,
    packageId: safeString(raw.packageId, 300) || undefined,
    parentPackageId: safeString(raw.parentPackageId, 300) || undefined,
    audioFilename: safeString(raw.audioFilename, 512) || undefined,
    videoFilename: raw.videoFilename === null ? null : safeString(raw.videoFilename, 512) || undefined,
    bgFilename: raw.bgFilename === null ? null : safeString(raw.bgFilename, 512) || undefined,
    originalContent,
    cloudSetId: safeString(raw.cloudSetId, 300) || undefined,
    source: raw.source === 'osuapi' ? 'osuapi' : undefined,
    sourceSetId,
    sourceChartId,
    originalOsuFilename: safeString(raw.originalOsuFilename, 512) || undefined,
    importedAt: raw.importedAt === undefined ? undefined : finiteNumber(raw.importedAt, 0, 2000000000000) ?? undefined,
    starRating: starRating ?? undefined,
    starRatingSource,
    starRatingVersion: starRatingVersion ?? undefined,
    isCached: raw.isCached === undefined ? undefined : Boolean(raw.isCached),
  };
  if (!result.id) return null;
  return result;
}

const DB_NAME = 'RhythmManiaDB';
const DB_VERSION = 6;

/**
 * Persistent cross-session background-art cache (IndexedDB `backgrounds`
 * store). Blob URLs are memory-only and die with the tab, so without this
 * every session re-decompresses each .osz to show song art. This store keeps
 * the extracted image bytes (keyed by package + image filename, so sibling
 * diffs sharing one art file store it once) with an LRU cap.
 *
 * Why not localStorage or an unlimited memory cache: localStorage is
 * synchronous, string-only, and capped around ~5MB total (a single song
 * backdrop can exceed that); an unbounded blob-URL cache grows RSS without
 * limit and eventually crashes the renderer. IndexedDB is async, binary,
 * and quota-managed by the browser.
 */
export const MAX_PERSISTED_BG_BYTES = 20 * 1024 * 1024;
export const MAX_PERSISTED_BGS = 200;

const PERSISTED_BG_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

export interface CachedBackground {
  data: ArrayBuffer;
  mime: string;
}

/**
 * Stable persistent key for extracted art. Filenames are lowercased and
 * reduced to their basename so `BG/Foo.PNG` and `foo.png` share one entry.
 * Returns null for unusable inputs (callers then skip persistence).
 */
export function buildBackgroundCacheKey(packageId: string, filename: string): string | null {
  if (!packageId || packageId.length > 300 || !filename) return null;
  const base = filename.split(/[/\\]/).pop() || '';
  const normalized = base.toLowerCase();
  if (!normalized || normalized.length > 512 || normalized === '.' || normalized === '..') return null;
  return `bg:${packageId}:${normalized}`;
}

/** Runtime guard for `backgrounds` records read from IndexedDB. */
export function sanitizeCachedBackgroundRecord(raw: unknown, expectedKey?: string): CachedBackground | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.key !== 'string' || raw.key.length > 400) return null;
  if (expectedKey !== undefined && raw.key !== expectedKey) return null;
  if (!(raw.data instanceof ArrayBuffer)) return null;
  if (raw.data.byteLength === 0 || raw.data.byteLength > MAX_PERSISTED_BG_BYTES) return null;
  if (typeof raw.mime !== 'string' || !PERSISTED_BG_MIMES.has(raw.mime)) return null;
  return { data: raw.data, mime: raw.mime };
}

class SimpleBlobCache {
  private cache = new Map<string, { audioUrl: string; videoUrl: string; bgUrl: string; hitSoundUrls: Record<string, string> }>();
  private order: string[] = [];

  constructor(private capacity = 8) {}

  public get(id: string) {
    const key = getMediaCacheKey(id);
    if (!this.cache.has(key)) return null;
    this.order = this.order.filter(k => k !== key).concat(key);
    return this.cache.get(key)!;
  }

  public put(id: string, urls: { audioUrl: string; videoUrl: string; bgUrl: string; hitSoundUrls?: Record<string, string> }) {
    const key = getMediaCacheKey(id);
    if (this.cache.has(key)) {
      const prev = this.cache.get(key)!;
      // Revoke replaced URLs that are no longer referenced
      if (prev.audioUrl && prev.audioUrl !== urls.audioUrl) AssetLifecycleManager.releaseSpecific(prev.audioUrl);
      if (prev.videoUrl && prev.videoUrl !== urls.videoUrl) AssetLifecycleManager.releaseSpecific(prev.videoUrl);
      if (prev.bgUrl && prev.bgUrl !== urls.bgUrl) AssetLifecycleManager.releaseSpecific(prev.bgUrl);
      for (const [name, url] of Object.entries(prev.hitSoundUrls)) {
        if (url && url !== urls.hitSoundUrls?.[name]) AssetLifecycleManager.releaseSpecific(url);
      }
      this.order = this.order.filter(k => k !== key);
    } else if (this.order.length >= this.capacity) {
      const oldest = this.order.shift();
      if (oldest) this.evict(oldest);
    }
    this.cache.set(key, { ...urls, hitSoundUrls: urls.hitSoundUrls || {} });
    this.order.push(key);
  }

  public evict(id: string) {
    const key = getMediaCacheKey(id);
    const urls = this.cache.get(key);
    if (urls) {
      if (urls.audioUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.audioUrl);
      if (urls.videoUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.videoUrl);
      if (urls.bgUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.bgUrl);
      for (const url of Object.values(urls.hitSoundUrls)) AssetLifecycleManager.releaseSpecific(url);
    }
    this.cache.delete(key);
    this.order = this.order.filter(k => k !== key);
  }

  public clearAll() {
    for (const id of [...this.order]) this.evict(id);
    this.cache.clear();
    this.order = [];
  }
}

class StorageManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;
  // Holds unpacked audio/video/background blob URLs. Sized for the selected
  // chart plus preloaded neighbour backgrounds so switching songs in Song
  // Select does not re-unzip the .osz from IndexedDB every time.
  public lruMediaCache = new SimpleBlobCache(12);

  constructor() {
    // Keep pure sanitizers and replay helpers importable in Node/test contexts.
    if (typeof window !== 'undefined' && window.indexedDB) {
      this.initPromise = this.init();
    }
  }

  private init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onupgradeneeded = () => {
        const d = request.result;
        if (!d.objectStoreNames.contains('beatmaps')) d.createObjectStore('beatmaps', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('packages')) d.createObjectStore('packages', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('backgrounds')) {
          const store = d.createObjectStore('backgrounds', { keyPath: 'key' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        } else {
          // Defensive: a v6 database should always carry the recency index.
          const store = request.transaction?.objectStore('backgrounds');
          if (store && !store.indexNames.contains('updatedAt')) {
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) {
      try {
        return await this.initPromise;
      } catch (err) {
        this.initPromise = null;
        throw err;
      }
    }
    this.initPromise = this.init();
    try {
      return await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  public async savePackage(id: string, name: string, zipBlob: Blob): Promise<void> {
    if (!id || id.length > 300 || !name || name.length > 512 || !(zipBlob instanceof Blob) || zipBlob.size > MAX_COMPRESSED_SIZE_BYTES) {
      throw new Error('Security Exception: Invalid or oversized beatmap package.');
    }
    const database = await this.getDB();
    const arrayBuffer = await zipBlob.arrayBuffer();

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('packages', 'readwrite');
      const store = tx.objectStore('packages');
      store.put({ id, name, zipData: arrayBuffer.slice(0) });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to save beatmap package.'));
      tx.onabort = () => reject(tx.error || new Error('Beatmap package transaction aborted.'));
    });
    TempMemoryCache.set(id, arrayBuffer);
  }

  /** Atomically stages a package and all of its validated difficulties. */
  public async savePackageWithBeatmaps(
    id: string,
    name: string,
    zipBlob: Blob,
    beatmaps: Beatmap[],
  ): Promise<void> {
    if (!id || id.length > 300 || !name || name.length > 512 || !(zipBlob instanceof Blob) || zipBlob.size > MAX_COMPRESSED_SIZE_BYTES) {
      throw new Error('Security Exception: Invalid or oversized beatmap package.');
    }
    const records = beatmaps.map(sanitizeSavedBeatmap);
    if (records.some(record => record === null) || records.length !== beatmaps.length || records.length === 0) {
      throw new Error('Security Exception: Invalid beatmap package contents.');
    }
    const arrayBuffer = await zipBlob.arrayBuffer();
    const database = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['packages', 'beatmaps'], 'readwrite');
      tx.objectStore('packages').put({ id, name, zipData: arrayBuffer.slice(0) });
      for (const record of records) tx.objectStore('beatmaps').put({ ...record!, importedAt: record!.importedAt ?? Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to stage beatmap package.'));
      tx.onabort = () => reject(tx.error || new Error('Beatmap package transaction aborted.'));
    });
    TempMemoryCache.set(id, arrayBuffer);
  }

  public async saveBeatmap(beatmap: Beatmap): Promise<void> {
    const clean = sanitizeSavedBeatmap(beatmap);
    if (!clean) throw new Error('Security Exception: Invalid beatmap record.');
    const database = await this.getDB();
    const record: SavedBeatmap = { ...clean, importedAt: clean.importedAt ?? Date.now() };
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readwrite');
      tx.objectStore('beatmaps').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to save beatmap record.'));
    });
  }

  public async getAllBeatmaps(): Promise<SavedBeatmap[]> {
    const database = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readonly');
      const req = tx.objectStore('beatmaps').getAll();
      req.onsuccess = () => resolve((req.result as unknown[] || []).map(sanitizeSavedBeatmap).filter((map): map is SavedBeatmap => map !== null));
      req.onerror = () => reject(req.error);
    });
  }

  public async getPackage(id: string): Promise<Blob | null> {
    const database = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('packages', 'readonly');
      const req = tx.objectStore('packages').get(id);
      req.onsuccess = () => {
        const record: unknown = req.result;
        if (isPackageRecord(record, id)) {
          resolve(new Blob([record.zipData!], { type: 'application/octet-stream' }));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Read previously extracted background art. Returns null on miss or on any
   * invalid record (hostile/legacy IndexedDB data must never reach the DOM).
   */
  public async getCachedBackground(key: string): Promise<CachedBackground | null> {
    if (!key || key.length > 400) return null;
    const database = await this.getDB();
    const raw: unknown = await new Promise((resolve, reject) => {
      const tx = database.transaction('backgrounds', 'readonly');
      const req = tx.objectStore('backgrounds').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const clean = sanitizeCachedBackgroundRecord(raw, key);
    if (!clean) return null;
    // Touch recency for LRU (best-effort; a missing store on old profiles
    // simply resolves without the touch).
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('backgrounds', 'readwrite');
        const store = tx.objectStore('backgrounds');
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          const record = getReq.result;
          if (isRecord(record)) store.put({ ...record, updatedAt: Date.now() });
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
    } catch {
      // Recency touch is optional; the cached bytes above are still valid.
    }
    return clean;
  }

  /**
   * Persist extracted background art for cross-session reuse. Validates and
   * bounds everything (per-image bytes, total entry count via LRU eviction)
   * and degrades silently on quota errors so caching never breaks playback.
   */
  public async putCachedBackground(key: string, data: ArrayBuffer, mime: string): Promise<void> {
    if (!key || key.length > 400) return;
    if (!(data instanceof ArrayBuffer)) return;
    if (data.byteLength === 0 || data.byteLength > MAX_PERSISTED_BG_BYTES) return;
    if (!mime || !PERSISTED_BG_MIMES.has(mime)) return;
    const database = await this.getDB();
    const record = { key, data: data.slice(0), mime, updatedAt: Date.now() };
    const putOnce = (): Promise<void> => new Promise((resolve, reject) => {
      const tx = database.transaction('backgrounds', 'readwrite');
      tx.objectStore('backgrounds').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to cache background.'));
      tx.onabort = () => reject(tx.error || new Error('Background cache transaction aborted.'));
    });
    try {
      await putOnce();
    } catch (err) {
      // On quota pressure, drop the oldest half and retry once; if storage
      // is still unavailable, give up silently — playback never depends on
      // this cache.
      if (!isQuotaError(err)) return;
      try {
        await this.evictOldestBackgrounds(Math.ceil(MAX_PERSISTED_BGS / 2));
        await putOnce();
      } catch {
        return;
      }
    }
    try {
      const count = await new Promise<number>((resolve, reject) => {
        const tx = database.transaction('backgrounds', 'readonly');
        const req = tx.objectStore('backgrounds').count();
        req.onsuccess = () => resolve(Number(req.result) || 0);
        req.onerror = () => reject(req.error);
      });
      if (count > MAX_PERSISTED_BGS) {
        await this.evictOldestBackgrounds(count - MAX_PERSISTED_BGS);
      }
    } catch {
      // Cap enforcement is best-effort.
    }
  }

  /**
   * Drop all persisted art for a package (called when its last beatmap is
   * deleted). Best-effort: failures resolve silently.
   */
  public async deleteCachedBackgroundsForPackage(packageId: string): Promise<void> {
    if (!packageId || packageId.length > 300 || typeof window === 'undefined' || !window.indexedDB) return;
    try {
      const database = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('backgrounds', 'readwrite');
        const store = tx.objectStore('backgrounds');
        const prefix = `bg:${packageId}:`;
        // ':' (0x3A) is followed by ';' (0x3B): bounds all keys with prefix.
        const range = window.IDBKeyRange.bound(prefix, `bg:${packageId};`, false, true);
        const req = store.delete(range);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new Error('Background cleanup failed.'));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Background cleanup failed.'));
      });
    } catch {
      // Cleanup is optional; stale entries age out via the LRU cap.
    }
  }

  private async evictOldestBackgrounds(count: number): Promise<void> {
    if (!Number.isInteger(count) || count <= 0) return;
    const database = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      try {
        const tx = database.transaction('backgrounds', 'readwrite');
        const store = tx.objectStore('backgrounds');
        let index;
        try {
          index = store.index('updatedAt');
        } catch {
          // No recency index (unexpected) — clear nothing, resolve.
          done();
          return;
        }
        let deleted = 0;
        const cursorReq = index.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result as IDBCursorWithValue | null;
          if (!cursor || deleted >= count) {
            done();
            return;
          }
          try {
            cursor.delete();
          } catch {
            done();
            return;
          }
          deleted += 1;
          try {
            cursor.continue();
          } catch {
            done();
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error || new Error('Background eviction failed.'));
        tx.oncomplete = done;
        tx.onerror = () => reject(tx.error || new Error('Background eviction failed.'));
        tx.onabort = () => reject(tx.error || new Error('Background eviction aborted.'));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Background eviction failed.'));
      }
    });
  }

  public async deleteBeatmapAndCleanup(id: string): Promise<void> {
    const database = await this.getDB();
    this.lruMediaCache.evict(id);

    const beatmap: SavedBeatmap | null = await new Promise((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readonly');
      const req = tx.objectStore('beatmaps').get(id);
      req.onsuccess = () => resolve(sanitizeSavedBeatmap(req.result));
      req.onerror = () => reject(req.error);
    });

    if (!beatmap) return;

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readwrite');
      tx.objectStore('beatmaps').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (beatmap.packageId) {
      const pkgId = beatmap.packageId;
      const allMaps = await this.getAllBeatmaps();
      const referencesExist = allMaps.some(m => m.packageId === pkgId);

      if (!referencesExist) {
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction('packages', 'readwrite');
          tx.objectStore('packages').delete(pkgId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        TempMemoryCache.remove(pkgId);
        await this.deleteCachedBackgroundsForPackage(pkgId);
      }
    }
  }

  public async deletePackageAndAllBeatmaps(cloudSetId: string): Promise<void> {
    const database = await this.getDB();
    const packageId = cloudSetId;

    // 1. Clear TempMemoryCache
    TempMemoryCache.remove(packageId);

    // 2. Evict LRU cache
    this.lruMediaCache.evict(cloudSetId);

    // 3. Find and delete all beatmaps matching id prefix, parentPackageId, or packageId
    const allMaps = await this.getAllBeatmaps();
    const mapsToDelete = allMaps.filter(
      m => m.cloudSetId === cloudSetId || m.parentPackageId === cloudSetId || m.packageId === packageId
    );

    for (const m of mapsToDelete) {
      this.lruMediaCache.evict(m.id);
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('beatmaps', 'readwrite');
        tx.objectStore('beatmaps').delete(m.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // 4. Delete the package itself
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('packages', 'readwrite');
      tx.objectStore('packages').delete(packageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // 5. Drop persisted art for the removed package
    await this.deleteCachedBackgroundsForPackage(packageId);
  }
}

export const storageManager = new StorageManager();
