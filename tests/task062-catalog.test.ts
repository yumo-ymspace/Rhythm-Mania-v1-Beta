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
 * Tests for TASK-062: Catalog overlay Argon tokens & offline catalog boundaries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveCatalogSetMetadata,
  getCatalogSetMetadata,
} from '../src/utils/catalogSetMetadata';
import { MAX_COMPRESSED_SIZE_BYTES } from '../src/utils/securityLimits';
import catalogRouter from '../api/catalog-router';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock localStorage for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
});

function createMockReqRes(query: Record<string, string> = {}, method = 'GET') {
  const req = {
    method,
    query,
    headers: {},
    url: '/api/catalog',
  } as unknown as VercelRequest;

  let statusCode = 200;
  let responseData: any = null;

  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    setHeader: () => res,
    end: () => res,
  } as unknown as VercelResponse;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData,
  };
}

describe('TASK-062: Catalog Router & Offline Boundaries', () => {
  describe('Stateless Catalog Router', () => {
    it('rejects removed database endpoints with 404 (chart, set, register-download, activate-download)', async () => {
      const removedEndpoints = [
        'chart',
        'set',
        'download',
        'register-download',
        'activate-download',
      ];

      for (const endpoint of removedEndpoints) {
        const { req, res, getStatusCode, getData } = createMockReqRes({ _route: endpoint });
        await catalogRouter(req, res);
        expect(getStatusCode()).toBe(404);
        expect(getData()).toEqual({
          success: false,
          error: 'Catalog route not found',
        });
      }
    });

    it('routes search to the mirror handler without requiring an osu! token', async () => {
      // No query: 400, not 401. Search is unauthenticated (catboy.best primary).
      const { req, res, getStatusCode, getData } = createMockReqRes({ _route: 'search' });
      await catalogRouter(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getData()?.error).toMatch(/query is required/i);
    });

    it('rejects unsupported search statuses', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({ _route: 'search', q: 'x', s: 'wip' });
      await catalogRouter(req, res);
      expect(getStatusCode()).toBe(400);
      expect(getData()?.error).toMatch(/ranked, loved, graveyard, or any/i);
    });

    it('returns mirror sets with stable osuapi_ ids and mania-only charts', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => [
            {
              SetID: 424242,
              RankedStatus: 1,
              Title: 'Router Song',
              Artist: 'Router Artist',
              Creator: 'Router Mapper',
              ChildrenBeatmaps: [
                {
                  BeatmapID: 777,
                  DiffName: '7K Extra',
                  FileMD5: 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
                  Mode: 3,
                  CS: 7,
                  DifficultyRating: 4.4,
                  BPM: 190,
                },
                {
                  BeatmapID: 778,
                  DiffName: 'Insane',
                  FileMD5: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
                  Mode: 0,
                  CS: 4,
                  DifficultyRating: 4.0,
                  BPM: 190,
                },
              ],
            },
          ],
        })),
      );
      try {
        const { req, res, getStatusCode, getData } = createMockReqRes({
          _route: 'search',
          q: 'router song',
          s: 'ranked',
        });
        await catalogRouter(req, res);
        expect(getStatusCode()).toBe(200);
        const data = getData();
        expect(data?.success).toBe(true);
        expect(data?.data).toHaveLength(1);
        expect(data?.data[0]).toMatchObject({
          id: 'osuapi_424242',
          sourceSetId: 424242,
          source: 'mirror',
          status: 'ranked',
        });
        expect(data?.data[0]?.charts).toHaveLength(1);
        expect(data?.data[0]?.charts[0]).toMatchObject({ id: 777, keyCount: 7 });
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('Catalog Set Metadata Local Storage', () => {
    beforeEach(() => {
      localStorageMock.clear();
    });

    it('saves and retrieves catalog set metadata', () => {
      saveCatalogSetMetadata({
        sourceSetId: 12345,
        title: 'Test Song',
        artist: 'Test Artist',
        creator: 'Test Mapper',
        slimCoverUrl: 'https://assets.ppy.sh/beatmaps/12345/covers/slimcover.jpg',
      });

      const retrieved = getCatalogSetMetadata(12345);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.sourceSetId).toBe(12345);
      expect(retrieved?.title).toBe('Test Song');
      expect(retrieved?.artist).toBe('Test Artist');
      expect(retrieved?.creator).toBe('Test Mapper');
      expect(retrieved?.slimCoverUrl).toBe('https://assets.ppy.sh/beatmaps/12345/covers/slimcover.jpg');
      expect(retrieved?.savedAt).toBeGreaterThan(0);
    });

    it('rejects unapproved cover URLs for security', () => {
      saveCatalogSetMetadata({
        sourceSetId: 67890,
        title: 'Evil Cover Song',
        artist: 'Test Artist',
        creator: 'Test Mapper',
        slimCoverUrl: 'https://malicious-site.com/image.jpg',
      });

      const retrieved = getCatalogSetMetadata(67890);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.slimCoverUrl).toBeUndefined();
    });

    it('returns null for non-existent set id', () => {
      expect(getCatalogSetMetadata(999999)).toBeNull();
    });
  });

  describe('Download Limits', () => {
    it('enforces 100 MiB compressed package limit', () => {
      expect(MAX_COMPRESSED_SIZE_BYTES).toBe(100 * 1024 * 1024);
    });
  });
});
