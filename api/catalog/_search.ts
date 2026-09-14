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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  MIRROR_SEARCH_STATUSES,
  searchMirrorCatalog,
  type MirrorSearchStatus,
} from '../_lib/mirrorCatalog.js';
import { handleCors, sendError, sendJson } from '../_lib/response.js';

function parseStatus(value: unknown): MirrorSearchStatus[] | null {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : 'ranked';
  if (raw === 'any') return [...MIRROR_SEARCH_STATUSES];
  if ((MIRROR_SEARCH_STATUSES as string[]).includes(raw)) return [raw as MirrorSearchStatus];
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  try {
    const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (!text) return sendError(res, 400, 'Search query is required');

    const statuses = parseStatus(req.query.s);
    if (!statuses) {
      return sendError(res, 400, 'Status must be ranked, loved, graveyard, or any');
    }

    const sets = await searchMirrorCatalog(text, statuses);

    return sendJson(res, 200, {
      success: true,
      data: sets.map((set) => ({
        ...set,
        id: `osuapi_${set.sourceSetId}`,
        source: 'mirror',
        catalogState: 'pending',
      })),
      meta: { status: statuses.length === 1 ? statuses[0] : 'any' },
    });
  } catch (error) {
    console.error('Catalog search failed:', error instanceof Error ? error.name : 'unknown');
    return sendError(res, 500, 'Mirror catalog search failed');
  }
}
