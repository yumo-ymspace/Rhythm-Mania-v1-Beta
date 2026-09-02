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
import { sendError, sendJson } from './_lib/response.js';
import search from './catalog/_search.js';

function route(req: VercelRequest): string {
  const value = req.query._route;
  if (typeof value === 'string') return value.replace(/^\/+|\/+$/g, '');
  return (req.url || '').split('?')[0].replace(/^.*\/api\/catalog\//, '').replace(/\/+$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    switch (route(req)) {
      case 'search': return await search(req, res);
      default: return sendError(res, 404, 'Catalog route not found');
    }
  } catch (error) {
    console.error('Catalog router request failed:', error instanceof Error ? error.name : 'unknown');
    return sendJson(res, 500, { success: false, error: 'Catalog service unavailable' });
  }
}
