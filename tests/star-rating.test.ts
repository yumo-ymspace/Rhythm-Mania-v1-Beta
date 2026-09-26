import { describe, expect, it } from 'vitest';
import { calculateChartStarRating } from '../src/utils/chartStarRating';
import { resolveStarRating } from '../src/utils/starRating';
import { sanitizeSavedBeatmap } from '../src/utils/storageManager';
import type { Beatmap, HitObject } from '../src/types';

function note(time: number, column: number, endTime?: number): HitObject {
  return {
    id: `${time}-${column}`,
    time,
    column,
    type: endTime === undefined ? 'normal' : 'hold',
    endTime,
    isHit: false,
    isReleased: false,
    isMissed: false,
    isHoldFailed: false,
  };
}

function mapWithNotes(notes: HitObject[], overrides: Partial<Beatmap> = {}): Beatmap {
  return {
    id: 'map-a',
    title: 'Title',
    artist: 'Artist',
    creator: 'Mapper',
    difficulty: 'Easy',
    bpm: 180,
    keyCount: 4,
    duration: 10,
    notes,
    hpDrainRate: 5,
    overallDifficulty: 5,
    timingPoints: [],
    sliderMultiplier: 1.4,
    ...overrides,
  };
}

describe('chart star ratings', () => {
  it('returns zero for an empty chart', () => {
    expect(calculateChartStarRating(mapWithNotes([]))).toBe(0);
  });

  it('is deterministic and independent of names and IDs', () => {
    const notes = [note(0, 0), note(250, 1), note(500, 2), note(750, 3)];
    const first = calculateChartStarRating(mapWithNotes(notes));
    const second = calculateChartStarRating(mapWithNotes(notes, { id: 'different', difficulty: 'Expert' }));
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
  });

  it('increases with denser content and pattern complexity', () => {
    const sparse = calculateChartStarRating(mapWithNotes([note(0, 0), note(4000, 1)]));
    const dense = calculateChartStarRating(mapWithNotes([
      note(0, 0), note(100, 1), note(200, 2), note(300, 3),
      note(400, 0), note(500, 1), note(600, 2), note(700, 3),
    ]));
    expect(dense).toBeGreaterThan(sparse);
  });

  it('accounts for chords, jacks, and holds', () => {
    const simple = calculateChartStarRating(mapWithNotes([note(0, 0), note(1000, 1), note(2000, 2)]));
    const complex = calculateChartStarRating(mapWithNotes([
      note(0, 0, 1000), note(0, 1, 1000), note(100, 0), note(200, 0), note(300, 0),
    ]));
    expect(complex).toBeGreaterThan(simple);
  });

  it('accepts unsorted notes and infers duration when metadata is missing', () => {
    const rating = calculateChartStarRating(mapWithNotes([note(1000, 1), note(0, 0)], { duration: 0 }));
    expect(Number.isFinite(rating)).toBe(true);
    expect(rating).toBeGreaterThan(0);
  });

  it('prefers a valid osu API snapshot over chart content', () => {
    const map = mapWithNotes([note(0, 0), note(100, 1), note(200, 2)], { starRating: 7.123 });
    expect(resolveStarRating(map)).toBe(7.12);
    expect(resolveStarRating({ ...map, starRating: 0 })).toBe(0);
  });

  it('trusts official osu-api-download snapshots at 1x rate', () => {
    const notes = [note(0, 0), note(100, 1), note(200, 2), note(300, 3)];
    const map = mapWithNotes(notes, { starRating: 3.82, starRatingSource: 'osu-api-download' });
    expect(resolveStarRating(map)).toBe(3.82);
    expect(resolveStarRating(map, 1)).toBe(3.82);
  });

  it('ignores legacy heuristic (chart-content v1) values and recomputes strain', () => {
    const notes = [note(0, 0), note(100, 1), note(200, 2), note(300, 3)];
    const map = mapWithNotes(notes, {
      starRating: 7.12,
      starRatingSource: 'chart-content',
      starRatingVersion: 1,
    });
    const resolved = resolveStarRating(map);
    // The stored heuristic must not leak into the PP curve.
    expect(resolved).not.toBe(7.12);
    expect(resolved).toBe(resolveStarRating(mapWithNotes(notes)));
  });

  it('trusts fresh local strain (chart-content v2) values without recompute', () => {
    const notes = [note(0, 0), note(100, 1), note(200, 2), note(300, 3)];
    const fresh = mapWithNotes(notes, {
      starRating: 1.23,
      starRatingSource: 'chart-content',
      starRatingVersion: 2,
    });
    expect(resolveStarRating(fresh)).toBe(1.23);
  });

  it('recomputes at the adjusted clock rate so DT/HT flow through SR, not PP', () => {
    const notes = Array.from({ length: 200 }, (_, i) => note(1000 + i * 120, i % 4));
    const base = resolveStarRating(mapWithNotes(notes), 1);
    const dt = resolveStarRating(mapWithNotes(notes), 1.5);
    const ht = resolveStarRating(mapWithNotes(notes), 0.75);
    expect(base).toBeGreaterThan(0);
    // Rate scaling changes strain: DT rates up, HT rates down.
    expect(dt).not.toBe(base);
    expect(ht).not.toBe(base);
    // Official snapshots are NM numbers: a rate-adjusted lookup recomputes.
    const official = mapWithNotes(notes, { starRating: 3.82, starRatingSource: 'osu-api-download' });
    expect(resolveStarRating(official, 1.5)).not.toBe(3.82);
    expect(resolveStarRating(official, 1.5)).toBe(dt);
  });
});

describe('saved beatmap star-rating sanitization', () => {
  it('preserves valid rating metadata', () => {
    const saved = sanitizeSavedBeatmap({ ...mapWithNotes([note(0, 0)]), starRating: 4.25, starRatingSource: 'osu-api-download' });
    expect(saved?.starRating).toBe(4.25);
    expect(saved?.starRatingSource).toBe('osu-api-download');
  });

  it('rejects invalid ratings', () => {
    expect(sanitizeSavedBeatmap({ ...mapWithNotes([note(0, 0)]), starRating: 21 })).toBeNull();
    expect(sanitizeSavedBeatmap({ ...mapWithNotes([note(0, 0)]), starRatingVersion: 1.5 })).toBeNull();
  });
});
