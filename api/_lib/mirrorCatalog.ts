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
 * Unauthenticated mirror catalog: catboy.best (Mino) search is primary,
 * mirror.nekoha.moe search is the fallback. Both are public JSON APIs that
 * need no osu! OAuth token.
 *
 * Live shapes (verified):
 * - catboy: GET https://catboy.best/api/search?query=<q>&mode=3&status=<csv>
 *   returns an array of sets (capped at ~100, deterministic ordering).
 *   `mode=3` filters to mania server-side; `status` takes osu! API v1 ints
 *   (single or comma-separated: ranked=1, loved=4, graveyard=-2). Multi-status
 *   is queried with one request per status in parallel — a combined CSV lets
 *   graveyard drown the other statuses under the result cap.
 *   Set: { SetID, Artist, Title, Creator, RankedStatus (int), Favourites,
 *   ... }. Children: { BeatmapID, DiffName, FileMD5, Mode (0-3), CS (= keys
 *   for mania), DifficultyRating, BPM, ... } under ChildrenBeatmaps.
 *   NOTE (2026-09): catboy's `Mode` is currently degraded — mania
 *   difficulties (e.g. "[4K] Easy", CS 4) are returned as Mode 0. Mania is
 *   therefore detected via `catboyIsMania()`: Mode 3 wins, otherwise a
 *   `[NK]` (1-10) difficulty-name tag whose key count equals the integer CS.
 *   Download: https://catboy.best/d/<SetID>.
 * - nekoha: GET https://mirror.nekoha.moe/api/search?q=<q>&status=<csv>&mode=mania
 *   returns { beatmapsets: [...] } (100/page), each with a nested beatmaps[]
 *   ({ id, version, mode/mode_int, difficulty_rating, checksum (md5), bpm }).
 *   Documented in mirror-nekoha-moe/mirror-server README.
 *   Download: https://mirror.nekoha.moe/api/download/<SetID>.
 */

export interface MirrorChart {
  id: number;
  filename: string;
  version: string;
  keyCount: number;
  checksum: string;
  starRating: number;
}

export interface MirrorCatalogSet {
  sourceSetId: number;
  title: string;
  artist: string;
  creator: string;
  status: string;
  coverUrl?: string;
  slimCoverUrl?: string;
  charts: MirrorChart[];
  bpm?: number;
}

export type MirrorSearchStatus = 'ranked' | 'loved' | 'graveyard';

export const MIRROR_SEARCH_STATUSES: MirrorSearchStatus[] = ['ranked', 'loved', 'graveyard'];

export const CATBOY_SEARCH_ENDPOINT = 'https://catboy.best/api/search';
export const CATBOY_DOWNLOAD_ENDPOINT = 'https://catboy.best/d';
export const NEKOHA_SEARCH_ENDPOINT = 'https://mirror.nekoha.moe/api/search';
export const NEKOHA_DOWNLOAD_ENDPOINT = 'https://mirror.nekoha.moe/api/download';

const MAX_RESULTS = 50;
const UPSTREAM_TIMEOUT_MS = 15000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback;
}

/**
 * catboy RankedStatus uses osu! API v1 integers:
 * -2 graveyard, -1 wip, 0 pending, 1 ranked, 2 approved, 3 qualified, 4 loved.
 */
export function catboyStatusToString(status: unknown): string {
  switch (Number(status)) {
    case -2: return 'graveyard';
    case -1: return 'wip';
    case 0: return 'pending';
    case 1: return 'ranked';
    case 2: return 'approved';
    case 3: return 'qualified';
    case 4: return 'loved';
    default: return '';
  }
}

function toMirrorChart(input: {
  id: unknown;
  version: unknown;
  keyCount: unknown;
  checksum: unknown;
  starRating: unknown;
}): MirrorChart | null {
  const id = Number(input.id);
  const keyCount = Number(input.keyCount);
  const checksum = typeof input.checksum === 'string' ? input.checksum.toLowerCase() : '';
  if (!Number.isInteger(id) || id < 1) return null;
  if (!Number.isInteger(keyCount) || keyCount < 1 || keyCount > 10) return null;
  if (!checksum) return null;
  const starRating = Number(input.starRating);
  return {
    id,
    filename: `${id}.osu`,
    version: asString(input.version, 'Normal'),
    keyCount,
    checksum,
    starRating: Number.isFinite(starRating) ? starRating : 0,
  };
}

function ppySlimCover(setId: number): string {
  return `https://assets.ppy.sh/beatmaps/${setId}/covers/slimcover.jpg`;
}

/**
 * Catboy mania detection. `Mode === 3` is authoritative when present, but
 * catboy currently returns Mode 0 for mania difficulties, so a `[NK]`
 * difficulty-name tag (1K-10K) backed by a matching integer CS key count is
 * accepted as a fallback signal. A bare integer CS alone is NOT enough —
 * osu!standard maps can share those CS values.
 */
export function catboyIsMania(child: UnknownRecord): { isMania: boolean; keyCount: unknown } {
  if (Number(child.Mode) === 3) return { isMania: true, keyCount: child.CS };
  const version = typeof child.DiffName === 'string' ? child.DiffName : '';
  const tag = version.match(/\[\s*((?:10|[1-9]))\s*K\s*\]/i);
  const cs = Number(child.CS);
  if (tag && cs === Number(tag[1])) return { isMania: true, keyCount: cs };
  return { isMania: false, keyCount: child.CS };
}

export function mapCatboySet(raw: unknown, allowed: Set<string>): MirrorCatalogSet | null {
  if (!isRecord(raw)) return null;
  const sourceSetId = Number(raw.SetID);
  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) return null;
  const status = catboyStatusToString(raw.RankedStatus);
  if (!allowed.has(status)) return null;

  const charts = asRecords(raw.ChildrenBeatmaps)
    .map((child) => {
      const { isMania, keyCount } = catboyIsMania(child);
      if (!isMania) return null;
      return toMirrorChart({
        id: child.BeatmapID,
        version: child.DiffName,
        keyCount,
        checksum: child.FileMD5,
        starRating: child.DifficultyRating,
      });
    })
    .filter((chart): chart is MirrorChart => chart !== null);
  if (charts.length === 0) return null;

  let bpm: number | undefined;
  for (const child of asRecords(raw.ChildrenBeatmaps)) {
    if (!catboyIsMania(child).isMania) continue;
    const value = Number(child.BPM);
    if (Number.isFinite(value) && value > 0 && (bpm === undefined || value > bpm)) bpm = value;
  }

  const slimCoverUrl = ppySlimCover(sourceSetId);
  return {
    sourceSetId,
    title: asString(raw.Title, 'Unknown Title'),
    artist: asString(raw.Artist, 'Unknown Artist'),
    creator: asString(raw.Creator, 'Unknown Mapper'),
    status,
    coverUrl: slimCoverUrl,
    slimCoverUrl,
    charts,
    bpm,
  };
}

function nekohaIsMania(raw: UnknownRecord): boolean {
  if (Number(raw.mode_int) === 3) return true;
  const mode = typeof raw.mode === 'string' ? raw.mode.toLowerCase() : '';
  return mode === 'mania';
}

export function mapNekohaSet(raw: unknown, allowed: Set<string>): MirrorCatalogSet | null {
  if (!isRecord(raw)) return null;
  const sourceSetId = Number(raw.id);
  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) return null;
  const status = asString(raw.status, '').toLowerCase();
  if (!allowed.has(status)) return null;

  const charts = asRecords(raw.beatmaps)
    .filter(nekohaIsMania)
    .map((beatmap) =>
      toMirrorChart({
        id: beatmap.id,
        version: beatmap.version,
        keyCount: beatmap.cs,
        checksum: beatmap.checksum,
        starRating: beatmap.difficulty_rating,
      }),
    )
    .filter((chart): chart is MirrorChart => chart !== null);
  if (charts.length === 0) return null;

  const covers = isRecord(raw.covers) ? raw.covers : undefined;
  const slimCoverUrl = asString(covers?.slimcover, '') || ppySlimCover(sourceSetId);
  const coverUrl = asString(covers?.card, '') || slimCoverUrl;
  const bpmRaw = Number(raw.bpm);
  return {
    sourceSetId,
    title: asString(raw.title, 'Unknown Title'),
    artist: asString(raw.artist, 'Unknown Artist'),
    creator: asString(raw.creator, 'Unknown Mapper'),
    status,
    coverUrl,
    slimCoverUrl,
    charts,
    bpm: Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : undefined,
  };
}

async function fetchJsonArray(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'RhythmMania/1.0 (+catalog-search)' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`mirror search failed (${response.status})`);
  return response.json();
}

/**
 * osu! API v1 status ints for the categories this catalog supports, for
 * catboy's server-side `status` filter.
 */
export const CATBOY_STATUS_INTS: Record<string, number> = {
  ranked: 1,
  loved: 4,
  graveyard: -2,
};

export function buildCatboySearchUrl(query: string, statusInt: number | null): string {
  const params = new URLSearchParams({ query, mode: '3' });
  if (statusInt !== null) params.set('status', String(statusInt));
  return `${CATBOY_SEARCH_ENDPOINT}?${params.toString()}`;
}

/**
 * Search catboy with one request per requested status in parallel (a combined
 * status CSV lets graveyard drown the other statuses under catboy's ~100
 * result cap). Raw sets are deduplicated by SetID before mapping. Throws
 * when every status request fails so the caller can try the next mirror.
 */
export async function searchCatboy(query: string, allowed: Set<string>): Promise<MirrorCatalogSet[]> {
  const statusInts = [...allowed]
    .map((status) => CATBOY_STATUS_INTS[status])
    .filter((value): value is number => Number.isInteger(value));
  const urls = (statusInts.length > 0 ? statusInts : [null]).map((statusInt) =>
    buildCatboySearchUrl(query, statusInt),
  );
  const settled = await Promise.allSettled(urls.map((url) => fetchJsonArray(url)));
  const fulfilled = settled.filter(
    (result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled',
  );
  if (fulfilled.length === 0) {
    throw new Error('mirror search failed for every requested status');
  }
  const seen = new Map<number, unknown>();
  for (const result of fulfilled) {
    if (!Array.isArray(result.value)) throw new Error('mirror search returned an unexpected shape');
    for (const raw of result.value) {
      if (!isRecord(raw)) continue;
      const sourceSetId = Number(raw.SetID);
      if (!Number.isInteger(sourceSetId) || sourceSetId < 1) continue;
      if (!seen.has(sourceSetId)) seen.set(sourceSetId, raw);
    }
  }
  return [...seen.values()]
    .map((raw) => mapCatboySet(raw, allowed))
    .filter((set): set is MirrorCatalogSet => set !== null);
}

async function searchNekoha(query: string, statuses: MirrorSearchStatus[]): Promise<MirrorCatalogSet[]> {
  const allowed = new Set<string>(statuses);
  const params = new URLSearchParams({
    q: query,
    status: statuses.join(','),
    mode: 'mania',
    page: '1',
  });
  const payload = await fetchJsonArray(`${NEKOHA_SEARCH_ENDPOINT}?${params.toString()}`);
  if (!isRecord(payload)) throw new Error('mirror search returned an unexpected shape');
  return asRecords(payload.beatmapsets)
    .map((raw) => mapNekohaSet(raw, allowed))
    .filter((set): set is MirrorCatalogSet => set !== null);
}

/**
 * Search the public mirrors: catboy.best first, nekoha fallback when catboy
 * errors or has no eligible mania sets. No authentication required.
 *
 * A failed Nekoha fallback must not turn a successful Catboy response into
 * an error: when Catboy succeeds (even with zero eligible sets), its result
 * is returned instead of throwing. Only when both mirrors fail does this
 * throw, so callers can report the outage.
 */
export async function searchMirrorCatalog(
  query: string,
  statuses: MirrorSearchStatus[],
): Promise<MirrorCatalogSet[]> {
  const text = query.trim().slice(0, 100);
  if (!text) return [];
  let primary: MirrorCatalogSet[] | null = null;
  try {
    primary = await searchCatboy(text, new Set<string>(statuses));
    if (primary.length > 0) return primary.slice(0, MAX_RESULTS);
  } catch (error) {
    console.warn('Catboy mirror search failed, trying Nekoha:', error instanceof Error ? error.message : 'unknown');
  }
  try {
    const fallback = await searchNekoha(text, statuses);
    return fallback.slice(0, MAX_RESULTS);
  } catch (error) {
    if (primary !== null) return primary.slice(0, MAX_RESULTS);
    throw error;
  }
}
