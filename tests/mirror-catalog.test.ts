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
 * Tests for the unauthenticated mirror catalog: catboy.best primary,
 * Nekoha fallback. No network access; upstream fetch is stubbed.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  catboyIsMania,
  catboyStatusToString,
  mapCatboySet,
  mapNekohaSet,
  searchMirrorCatalog,
} from '../api/_lib/mirrorCatalog';

const CATBOY_SET = {
  SetID: 123456,
  RankedStatus: 1,
  Title: 'Mirror Song',
  Artist: 'Mirror Artist',
  Creator: 'Mapper',
  ChildrenBeatmaps: [
    {
      BeatmapID: 111,
      DiffName: '4K Insane',
      FileMD5: 'ABCDEF1234567890ABCDEF1234567890',
      Mode: 3,
      CS: 4,
      DifficultyRating: 3.5,
      BPM: 180,
    },
    {
      BeatmapID: 112,
      DiffName: 'Insane',
      FileMD5: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      Mode: 0,
      CS: 4,
      DifficultyRating: 4.2,
      BPM: 180,
    },
    {
      BeatmapID: 113,
      DiffName: '12K Overload',
      FileMD5: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      Mode: 3,
      CS: 12,
      DifficultyRating: 6.1,
      BPM: 180,
    },
  ],
};

const NEKOHA_SET = {
  id: 789012,
  title: 'Neko Song',
  artist: 'Neko Artist',
  creator: 'Neko Mapper',
  status: 'Loved',
  favourite_count: 42,
  bpm: 200,
  covers: {
    card: 'https://mirror.nekoha.moe/covers/card.jpg',
    slimcover: 'https://mirror.nekoha.moe/covers/slim.jpg',
  },
  beatmaps: [
    {
      id: 555,
      version: 'HD',
      mode: 'mania',
      mode_int: 3,
      cs: 3,
      difficulty_rating: 2.75,
      checksum: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      bpm: 200,
    },
    {
      id: 556,
      version: 'Hard',
      mode: 'osu',
      mode_int: 0,
      difficulty_rating: 3.1,
      checksum: 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      bpm: 200,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const result = handler(String(url));
      if (result instanceof Error) throw result;
      return {
        ok: true,
        status: 200,
        json: async () => result,
      };
    }),
  );
}

describe('catboy status mapping', () => {
  it('maps osu! API v1 integers to status strings', () => {
    expect(catboyStatusToString(-2)).toBe('graveyard');
    expect(catboyStatusToString(-1)).toBe('wip');
    expect(catboyStatusToString(0)).toBe('pending');
    expect(catboyStatusToString(1)).toBe('ranked');
    expect(catboyStatusToString(2)).toBe('approved');
    expect(catboyStatusToString(3)).toBe('qualified');
    expect(catboyStatusToString(4)).toBe('loved');
  });

  it('returns empty string for unknown statuses', () => {
    expect(catboyStatusToString(99)).toBe('');
    expect(catboyStatusToString(undefined)).toBe('');
  });
});

describe('mapCatboySet', () => {
  it('keeps mania charts only, derives key count from CS, lowercases md5', () => {
    const set = mapCatboySet(CATBOY_SET, new Set(['ranked']));
    expect(set).not.toBeNull();
    expect(set?.sourceSetId).toBe(123456);
    expect(set?.title).toBe('Mirror Song');
    expect(set?.status).toBe('ranked');
    expect(set?.charts).toHaveLength(1);
    expect(set?.charts[0]).toMatchObject({
      id: 111,
      version: '4K Insane',
      keyCount: 4,
      checksum: 'abcdef1234567890abcdef1234567890',
      starRating: 3.5,
    });
    expect(set?.bpm).toBe(180);
    expect(set?.slimCoverUrl).toBe('https://assets.ppy.sh/beatmaps/123456/covers/slimcover.jpg');
  });

  it('rejects sets whose status is not requested', () => {
    expect(mapCatboySet(CATBOY_SET, new Set(['graveyard']))).toBeNull();
  });

  it('rejects sets without eligible mania charts', () => {
    const stdOnly = {
      ...CATBOY_SET,
      ChildrenBeatmaps: [CATBOY_SET.ChildrenBeatmaps[1]],
    };
    expect(mapCatboySet(stdOnly, new Set(['ranked']))).toBeNull();
  });

  it('detects mania from the [NK] tag when catboy reports Mode 0', () => {
    // Live catboy shape (2026-09): Mode is degraded to 0 even for mania.
    expect(catboyIsMania({ Mode: 0, CS: 4, DiffName: '[4K] Easy' }).isMania).toBe(true);
    expect(catboyIsMania({ Mode: 0, CS: 7, DiffName: '[7K] Galactic Adventure' }).isMania).toBe(true);
  });

  it('maps Mode-0 [NK]-tagged children to keyed mania charts', () => {
    const degraded = {
      ...CATBOY_SET,
      ChildrenBeatmaps: [
        {
          BeatmapID: 4731780,
          DiffName: '[4K] Easy',
          FileMD5: '31A4076FBEA226EA5047AC2EDBEA6249',
          Mode: 0,
          CS: 4,
          DifficultyRating: 1.2,
          BPM: 190,
        },
      ],
    };
    const set = mapCatboySet(degraded, new Set(['ranked']));
    expect(set?.charts).toHaveLength(1);
    expect(set?.charts[0]).toMatchObject({ id: 4731780, keyCount: 4 });
    expect(set?.bpm).toBe(190);
  });

  it('rejects Mode-0 children without a matching [NK] tag', () => {
    // Same-song standard set: no key tag, fractional CS.
    expect(catboyIsMania({ Mode: 0, CS: 3.2, DiffName: 'Hard' }).isMania).toBe(false);
    expect(catboyIsMania({ Mode: 0, CS: 4, DiffName: 'Hard' }).isMania).toBe(false);
    expect(catboyIsMania({ Mode: 0, CS: 3, DiffName: '[4K] Easy' }).isMania).toBe(false);
    const stdOnly = {
      ...CATBOY_SET,
      ChildrenBeatmaps: [
        {
          BeatmapID: 4368603,
          DiffName: 'Hard',
          FileMD5: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          Mode: 0,
          CS: 3.2,
          DifficultyRating: 3.1,
          BPM: 190,
        },
      ],
    };
    expect(mapCatboySet(stdOnly, new Set(['ranked']))).toBeNull();
  });

  it('rejects invalid payloads', () => {
    expect(mapCatboySet(null, new Set(['ranked']))).toBeNull();
    expect(mapCatboySet({ SetID: 0 }, new Set(['ranked']))).toBeNull();
  });
});

describe('mapNekohaSet', () => {
  it('maps nekoha shape with mirror covers', () => {
    const set = mapNekohaSet(NEKOHA_SET, new Set(['loved']));
    expect(set).not.toBeNull();
    expect(set?.sourceSetId).toBe(789012);
    expect(set?.status).toBe('loved');
    expect(set?.slimCoverUrl).toBe('https://mirror.nekoha.moe/covers/slim.jpg');
    expect(set?.coverUrl).toBe('https://mirror.nekoha.moe/covers/card.jpg');
    expect(set?.charts).toHaveLength(1);
    expect(set?.charts[0]).toMatchObject({
      id: 555,
      version: 'HD',
      keyCount: 3,
      checksum: 'cccccccccccccccccccccccccccccccc',
      starRating: 2.75,
    });
  });

  it('falls back to ppy covers when the mirror provides none', () => {
    const set = mapNekohaSet({ ...NEKOHA_SET, covers: undefined }, new Set(['loved']));
    expect(set?.slimCoverUrl).toBe('https://assets.ppy.sh/beatmaps/789012/covers/slimcover.jpg');
  });

  it('rejects sets whose status is not requested', () => {
    expect(mapNekohaSet(NEKOHA_SET, new Set(['ranked']))).toBeNull();
  });
});

describe('searchMirrorCatalog failover', () => {
  it('returns catboy results without calling nekoha', async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return [CATBOY_SET];
    });
    const sets = await searchMirrorCatalog('mirror song', ['ranked']);
    expect(sets).toHaveLength(1);
    expect(sets[0].sourceSetId).toBe(123456);
    expect(seen.some((url) => url.includes('catboy.best'))).toBe(true);
    expect(seen.some((url) => url.includes('nekoha'))).toBe(false);
  });

  it('sends server-side mode and status filters to catboy', async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return [CATBOY_SET];
    });
    await searchMirrorCatalog('mirror song', ['ranked']);
    const catboyUrls = seen.filter((url) => url.includes('catboy.best'));
    expect(catboyUrls).toHaveLength(1);
    expect(catboyUrls[0]).toContain('mode=3');
    expect(catboyUrls[0]).toContain('status=1');
  });

  it('queries each status in parallel and dedupes sets', async () => {
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return [CATBOY_SET];
    });
    const sets = await searchMirrorCatalog('mirror song', ['ranked', 'loved']);
    const catboyUrls = seen.filter((url) => url.includes('catboy.best'));
    expect(catboyUrls).toHaveLength(2);
    expect(catboyUrls.some((url) => url.includes('status=1'))).toBe(true);
    expect(catboyUrls.some((url) => url.includes('status=4'))).toBe(true);
    // Same set returned by both status requests: merged once.
    expect(sets).toHaveLength(1);
    expect(sets[0].sourceSetId).toBe(123456);
  });

  it('uses fulfilled status requests when one of them fails', async () => {
    stubFetch((url) => {
      if (url.includes('status=4')) return new Error('loved shard down');
      if (url.includes('catboy.best')) return [CATBOY_SET];
      return { beatmapsets: [NEKOHA_SET] };
    });
    const sets = await searchMirrorCatalog('mirror song', ['ranked', 'loved']);
    expect(sets).toHaveLength(1);
    expect(sets[0].sourceSetId).toBe(123456);
  });

  it('falls back to nekoha when catboy errors', async () => {
    stubFetch((url) => {
      if (url.includes('catboy.best')) return new Error('boom');
      return { beatmapsets: [NEKOHA_SET] };
    });
    const sets = await searchMirrorCatalog('neko song', ['loved']);
    expect(sets).toHaveLength(1);
    expect(sets[0].sourceSetId).toBe(789012);
  });

  it('falls back to nekoha when catboy has no eligible mania sets', async () => {
    stubFetch((url) => {
      if (url.includes('catboy.best')) return [{ ...CATBOY_SET, RankedStatus: 0 }];
      return { beatmapsets: [NEKOHA_SET] };
    });
    const sets = await searchMirrorCatalog('neko song', ['loved']);
    expect(sets).toHaveLength(1);
    expect(sets[0].sourceSetId).toBe(789012);
  });

  it('throws when both mirrors fail', async () => {
    stubFetch(() => new Error('down'));
    await expect(searchMirrorCatalog('anything', ['ranked'])).rejects.toThrow();
  });

  it('returns the catboy result (even empty) when nekoha is down', async () => {
    stubFetch((url) => {
      if (url.includes('catboy.best')) return [{ ...CATBOY_SET, RankedStatus: 0 }];
      return new Error('nekoha offline');
    });
    await expect(searchMirrorCatalog('neko song', ['loved'])).resolves.toEqual([]);
  });

  it('returns no results for an empty query without fetching', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    vi.stubGlobal('fetch', spy);
    expect(await searchMirrorCatalog('   ', ['ranked'])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
