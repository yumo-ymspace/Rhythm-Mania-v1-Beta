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
 * Official star-rating lookup for mirror auto-downloads.
 *
 * The catalog UI already stores osu! `DifficultyRating` per diff (matched by
 * checksum) as `starRatingSource='osu-api-download'`. The `App.tsx`
 * auto-download paths (bundled Triangles set, missing-set restore, replay
 * restore) only knew the numeric `sourceSetId`, so they stored no rating and
 * Song Select fell back to the local density heuristic — e.g. Triangles
 * showed 2.24/2.91/3.27 instead of the official 1.65/2.22/2.96.
 *
 * This helper fetches the mirror set's chart list (same shape as the catalog
 * search API) and matches by file checksum, so auto-downloads store the same
 * official rating as catalog downloads. All failures resolve to an empty
 * list; callers must fall back to leaving the rating unset (heuristic
 * display) rather than throwing.
 */

import {
  MIRROR_SEARCH_STATUSES,
  searchCatboy,
  type MirrorChart,
} from '../../api/_lib/mirrorCatalog';

export type { MirrorChart };

interface CatalogSearchRow {
  sourceSetId?: unknown;
  id?: unknown;
  charts?: unknown;
}

function asCharts(value: unknown): MirrorChart[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is MirrorChart =>
      typeof c === 'object' &&
      c !== null &&
      Number.isInteger((c as MirrorChart).id) &&
      typeof (c as MirrorChart).checksum === 'string',
  );
}

function pickSetCharts(rows: unknown, sourceSetId: number): MirrorChart[] | null {
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as CatalogSearchRow;
    if (Number(r.sourceSetId) !== sourceSetId) continue;
    const charts = asCharts(r.charts);
    if (charts.length > 0) return charts;
    return [];
  }
  return null;
}

function buildQuery(sourceSetId: number, titleHint?: string, artistHint?: string): string {
  const hint = `${titleHint ?? ''} ${artistHint ?? ''}`.trim().replace(/\s+/g, ' ');
  if (hint.length >= 3) return hint.slice(0, 100);
  return String(sourceSetId);
}

/**
 * Fetch the mirror's official chart list (checksums + DifficultyRating) for a
 * set id. Tries the first-party `/api/catalog/search` first, then queries
 * catboy.best directly (bare `vite dev` serves no `/api/*` routes).
 */
export async function fetchOfficialChartsForSet(
  sourceSetId: number,
  titleHint?: string,
  artistHint?: string,
): Promise<MirrorChart[]> {
  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) return [];
  const query = buildQuery(sourceSetId, titleHint, artistHint);
  if (!query) return [];

  try {
    const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}&s=any`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
      const charts = pickSetCharts(json?.data, sourceSetId);
      if (charts && charts.length > 0) return charts;
    }
  } catch {
    // Fall through to the direct-mirror query below.
  }

  try {
    const sets = await searchCatboy(query, new Set<string>([...MIRROR_SEARCH_STATUSES]));
    const found = sets.find((s) => s.sourceSetId === sourceSetId);
    if (found && Array.isArray(found.charts) && found.charts.length > 0) return found.charts;
  } catch {
    // Mirror unreachable — caller falls back to heuristic display.
  }
  return [];
}

/** Match a downloaded .osu's checksums against the mirror chart list. */
export function findOfficialChartByChecksum(
  charts: readonly MirrorChart[],
  md5: string,
  sha256: string,
): MirrorChart | null {
  const md5Lower = md5.toLowerCase();
  const sha256Lower = sha256.toLowerCase();
  for (const chart of charts) {
    const expected = chart.checksum?.toLowerCase();
    if (!expected) continue;
    if (expected === (expected.length === 64 ? sha256Lower : md5Lower)) return chart;
  }
  return null;
}

/** Canonical chart revision id, identical to the catalog download path. */
export function officialChartRevisionId(sourceSetId: number, chart: MirrorChart): string {
  return `osuapi_${sourceSetId}_b${chart.id}_${chart.checksum.toLowerCase()}`;
}
