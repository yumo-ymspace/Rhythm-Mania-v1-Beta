/*
 * Tests for TASK-062: Catalog overlay Argon tokens & offline catalog boundaries
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

    it('routes search to the search handler (which requires Authorization bearer)', async () => {
      const { req, res, getStatusCode, getData } = createMockReqRes({ _route: 'search' });
      await catalogRouter(req, res);
      // Without token, search returns 401
      expect(getStatusCode()).toBe(401);
      expect(getData()?.error).toMatch(/Connect osu!/i);
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
