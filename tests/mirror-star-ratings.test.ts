import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchOfficialChartsForSet,
  findOfficialChartByChecksum,
  officialChartRevisionId,
} from '../src/utils/mirrorStarRatings';

const CHARTS = [
  { id: 4537000, filename: '4537000.osu', version: '[4K] welcome to the new era', keyCount: 4, checksum: 'e30cbc06e1a6ef09b97d80e71ed04871', starRating: 3.82021 },
  { id: 4562874, filename: '4562874.osu', version: '[4K] easy', keyCount: 4, checksum: '99d85238e5dd0221cfc8068352a7b3f9', starRating: 1.65833 },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('officialChartRevisionId', () => {
  it('matches the catalog download id format', () => {
    expect(officialChartRevisionId(2153231, CHARTS[0])).toBe(
      'osuapi_2153231_b4537000_e30cbc06e1a6ef09b97d80e71ed04871',
    );
  });
});

describe('findOfficialChartByChecksum', () => {
  it('matches md5 checksums case-insensitively', () => {
    const found = findOfficialChartByChecksum(CHARTS, 'E30CBC06E1A6EF09B97D80E71ED04871', 'x'.repeat(64));
    expect(found?.id).toBe(4537000);
  });

  it('matches sha256 checksums when the mirror uses 64-char hashes', () => {
    const shaCharts = [{ ...CHARTS[0], checksum: 'a'.repeat(64) }];
    expect(findOfficialChartByChecksum(shaCharts, 'b'.repeat(32), 'A'.repeat(64))?.id).toBe(4537000);
    expect(findOfficialChartByChecksum(shaCharts, 'b'.repeat(32), 'c'.repeat(64))).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(findOfficialChartByChecksum(CHARTS, '0'.repeat(32), '0'.repeat(64))).toBeNull();
  });
});

describe('fetchOfficialChartsForSet', () => {
  it('returns charts from the first-party search API when the set id matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [{ sourceSetId: 2153231, charts: CHARTS }] }),
      })),
    );
    await expect(fetchOfficialChartsForSet(2153231, 'triangles', 'cYsmix')).resolves.toEqual(CHARTS);
  });

  it('ignores non-matching sets from the search API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (String(url).includes('/api/catalog/search')) {
          return { ok: true, status: 200, json: async () => ({ data: [{ sourceSetId: 999, charts: CHARTS }] }) };
        }
        return { ok: true, status: 200, json: async () => [] };
      }),
    );
    await expect(fetchOfficialChartsForSet(2153231, 'triangles', 'cYsmix')).resolves.toEqual([]);
  });

  it('falls back to catboy when the first-party API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (String(url).includes('/api/catalog/search')) throw new Error('no api in vite dev');
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              SetID: 2153231,
              RankedStatus: 1,
              Title: 'triangles',
              Artist: 'cYsmix',
              Creator: 'Carpihat',
              ChildrenBeatmaps: [
                { BeatmapID: 4537000, DiffName: '[4K] welcome to the new era', FileMD5: 'E30CBC06E1A6EF09B97D80E71ED04871', Mode: 0, CS: 4, DifficultyRating: 3.82021, BPM: 160 },
                { BeatmapID: 4562874, DiffName: '[4K] easy', FileMD5: '99D85238E5DD0221CFC8068352A7B3F9', Mode: 0, CS: 4, DifficultyRating: 1.65833, BPM: 160 },
              ],
            },
          ],
        };
      }),
    );
    const charts = await fetchOfficialChartsForSet(2153231, 'triangles', 'cYsmix');
    expect(charts).toHaveLength(2);
    expect(charts[0]).toMatchObject({ id: 4537000, starRating: 3.82021 });
  });

  it('returns [] when both mirrors fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(fetchOfficialChartsForSet(2153231, 'triangles', 'cYsmix')).resolves.toEqual([]);
  });

  it('rejects invalid set ids without fetching', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    vi.stubGlobal('fetch', spy);
    await expect(fetchOfficialChartsForSet(0)).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
