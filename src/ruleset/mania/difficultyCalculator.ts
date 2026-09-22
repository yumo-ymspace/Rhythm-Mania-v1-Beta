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
 * osu!lazer-accurate osu!mania strain difficulty.
 * Ports ppy/osu ManiaDifficultyCalculator plus the mania Strain skill
 * (also mirrored by kionell/osu-mania-stable and osu-classes, MIT) onto
 * the native RhythmMania note model so star ratings need no external
 * dependency:
 * - objects ordered by the framework depth-limited quicksort on
 *   bankers-rounded start time (identical tie order to lazer ports)
 * - per-column individual strain (decay base 0.125) plus global overall
 *   strain (decay base 0.30), with identical hold overlap handling
 * - 400ms strain sections with 0.9 peak decay weighting
 * - STAR_SCALING_FACTOR 0.018
 * - DT/HT style clock rates scale object times before straining
 */

export interface ManiaDifficultyNote {
  time: number;
  column: number;
  type?: string;
  endTime?: number;
}

export interface ManiaDifficultyAttributes {
  starRating: number;
  maxCombo: number;
}

/**
 * Progressive (timed) mania difficulty, mirroring ppy/osu
 * `DifficultyCalculator.CalculateTimed` for the mania ruleset.
 *
 * Each entry holds the difficulty of the chart prefix ending at that
 * hitobject (original, non-clock-adjusted end time in ms), computed with the
 * same strain pass as {@link calculateManiaDifficultyAttributes}. The live
 * PENAR/PP counter must look up the star rating at the current progress time
 * (see {@link getTimedStarRatingAtTime}) instead of reusing the full-chart
 * star rating, exactly like lazer's `PerformancePointsCounter`, which pairs
 * each judgement with the timed difficulty attributes at that hitobject.
 * Using the full-chart rating for live display awards near-final PP after the
 * first few notes.
 */
export interface TimedManiaDifficultyAttributes {
  /** Original (non-clock-adjusted) hitobject end time in ms. */
  time: number;
  starRating: number;
  maxCombo: number;
}

const STAR_SCALING_FACTOR = 0.018;
const SECTION_LENGTH_MS = 400;
const PEAK_DECAY_WEIGHT = 0.9;
const INDIVIDUAL_DECAY_BASE = 0.125;
const OVERALL_DECAY_BASE = 0.3;
const RELEASE_THRESHOLD_MS = 24;
const ROUND_PRECISION_ERROR = 1e-15;
const SORT_DEPTH_LIMIT = 32;

function roundToEven(value: number): number {
  const truncated = value >> 0;
  if (Math.abs(0.5 - Math.abs(value - truncated)) <= ROUND_PRECISION_ERROR) {
    return 2 * Math.round(value / 2);
  }
  return Math.round(value);
}

interface OrderedNote {
  time: number;
  column: number;
  endTime: number;
  hold: boolean;
}

type NoteComparer = (a: OrderedNote, b: OrderedNote) => number;

function swapNotes(items: OrderedNote[], i: number, j: number): void {
  if (i !== j) {
    const temp = items[i];
    items[i] = items[j];
    items[j] = temp;
  }
}

function swapIfGreater(items: OrderedNote[], comparer: NoteComparer, a: number, b: number): void {
  if (a !== b && comparer(items[a], items[b]) > 0) {
    const temp = items[a];
    items[a] = items[b];
    items[b] = temp;
  }
}

function downHeap(items: OrderedNote[], comparer: NoteComparer, i: number, n: number, lo: number): void {
  const item = items[lo + i - 1];
  while (i <= n / 2) {
    let child = 2 * i;
    if (child < n && comparer(items[lo + child - 1], items[lo + child]) < 0) {
      child++;
    }
    if (comparer(item, items[lo + child - 1]) >= 0) {
      break;
    }
    items[lo + i - 1] = items[lo + child - 1];
    i = child;
  }
  items[lo + i - 1] = item;
}

function heapsort(items: OrderedNote[], comparer: NoteComparer, lo: number, hi: number): void {
  const n = hi - lo + 1;
  for (let i = n / 2; i >= 1; --i) {
    downHeap(items, comparer, i, n, lo);
  }
  for (let i = n; i > 1; --i) {
    swapNotes(items, lo, lo + i - 1);
    downHeap(items, comparer, 1, i - 1, lo);
  }
}

function depthLimitedQuickSort(
  items: OrderedNote[],
  comparer: NoteComparer,
  left: number,
  right: number,
  depthLimit: number,
): void {
  do {
    if (depthLimit === 0) {
      heapsort(items, comparer, left, right);
      return;
    }
    let i = left;
    let j = right;
    const middle = i + ((j - i) >> 1);
    swapIfGreater(items, comparer, i, middle);
    swapIfGreater(items, comparer, i, j);
    swapIfGreater(items, comparer, middle, j);
    const pivot = items[middle];
    do {
      while (comparer(items[i], pivot) < 0) {
        i++;
      }
      while (comparer(pivot, items[j]) < 0) {
        j--;
      }
      if (i > j) {
        break;
      }
      if (i < j) {
        const temp = items[i];
        items[i] = items[j];
        items[j] = temp;
      }
      i++;
      j--;
    } while (i <= j);
    depthLimit--;
    if (j - left <= right - i) {
      if (left < j) {
        depthLimitedQuickSort(items, comparer, left, j, depthLimit);
      }
      left = i;
      continue;
    }
    if (i < right) {
      depthLimitedQuickSort(items, comparer, i, right, depthLimit);
    }
    right = j;
  } while (left < right);
}

function orderNotesByStartTime(items: OrderedNote[]): OrderedNote[] {
  if (!items || items.length === 0) {
    return items;
  }
  depthLimitedQuickSort(
    items,
    (a, b) => roundToEven(a.time) - roundToEven(b.time),
    0,
    items.length - 1,
    SORT_DEPTH_LIMIT,
  );
  return items;
}

interface StrainObject {
  startTime: number;
  endTime: number;
  deltaTime: number;
  column: number;
}

function isHoldNote(note: ManiaDifficultyNote): boolean {
  if (note.type === 'hold') return true;
  return typeof note.endTime === 'number' && Number.isFinite(note.endTime) && note.endTime > note.time;
}

/**
 * Weighted sum of the highest section strain peaks (0.9 decay per rank),
 * scaled to star rating. Shared by the full-chart and timed paths so the
 * final timed entry is bit-identical to the full-chart star rating.
 */
function difficultyFromStrainPeaks(savedPeaks: readonly number[], currentPeak: number): number {
  const ordered = savedPeaks.concat(currentPeak).filter((peak) => peak > 0).sort((a, b) => b - a);
  let difficulty = 0;
  let weight = 1;
  for (const peak of ordered) {
    difficulty += peak * weight;
    weight *= PEAK_DECAY_WEIGHT;
  }
  return difficulty * STAR_SCALING_FACTOR;
}

function maxComboForNote(time: number, endTime: number, hold: boolean): number {
  return hold ? 1 + Math.trunc((endTime - time) / 100) : 1;
}

function endTimeOf(time: number, endTime: number, hold: boolean): number {
  return hold ? endTime : time;
}

/**
 * Computes lazer-equivalent mania difficulty attributes for a chart.
 * clockRate is the DT/HT style track rate (1.5 / 0.75, otherwise 1.0);
 * object times are scaled by it exactly like the lazer difficulty path.
 * Runs once per chart plus rate (O(n log n)); live PP reuses the result.
 */
export function calculateManiaDifficultyAttributes(
  notes: ReadonlyArray<ManiaDifficultyNote> | undefined | null,
  keyCount: number,
  clockRate?: number,
): ManiaDifficultyAttributes {
  const columns = Number.isInteger(keyCount) ? Math.min(10, Math.max(1, keyCount)) : 4;
  const rate = typeof clockRate === 'number' && Number.isFinite(clockRate) && clockRate > 0 ? clockRate : 1;

  const valid: OrderedNote[] = [];
  if (Array.isArray(notes)) {
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (!note || typeof note.time !== 'number' || !Number.isFinite(note.time)) continue;
      if (!Number.isInteger(note.column) || note.column < 0 || note.column >= columns) continue;
      const hold = isHoldNote(note);
      const endTime = hold && typeof note.endTime === 'number' && Number.isFinite(note.endTime) && note.endTime > note.time
        ? note.endTime
        : note.time;
      valid.push({ time: note.time, column: note.column, endTime, hold });
    }
  }

  orderNotesByStartTime(valid);

  let maxCombo = 0;
  for (const note of valid) {
    maxCombo += maxComboForNote(note.time, note.endTime, note.hold);
  }

  if (valid.length === 0) {
    return { starRating: 0, maxCombo: 0 };
  }

  const objects: StrainObject[] = [];
  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const previous = valid[i - 1];
    objects.push({
      startTime: current.time / rate,
      endTime: current.endTime / rate,
      deltaTime: (current.time - previous.time) / rate,
      column: current.column,
    });
  }

  const individualStrains = new Array<number>(columns).fill(0);
  const columnStartTimes = new Array<number>(columns).fill(0);
  const columnEndTimes = new Array<number>(columns).fill(0);
  let individualStrain = 0;
  let overallStrain = 1;
  let sectionPeak = 0;
  let sectionEnd = 0;
  const strainPeaks: number[] = [];

  for (let i = 0; i < objects.length; i++) {
    const current = objects[i];
    if (i === 0) {
      sectionEnd = Math.ceil(current.startTime / SECTION_LENGTH_MS) * SECTION_LENGTH_MS;
    }
    while (current.startTime > sectionEnd) {
      strainPeaks.push(sectionPeak);
      const previousStart = i > 0 ? objects[i - 1].startTime : 0;
      sectionPeak =
        individualStrain * Math.pow(INDIVIDUAL_DECAY_BASE, (sectionEnd - previousStart) / 1000) +
        overallStrain * Math.pow(OVERALL_DECAY_BASE, (sectionEnd - previousStart) / 1000);
      sectionEnd += SECTION_LENGTH_MS;
    }

    const startTime = current.startTime;
    const endTime = current.endTime;
    const column = current.column;
    let overlapping = false;
    let closestEndTime = Math.abs(endTime - startTime);
    let holdFactor = 1;
    let holdAddition = 0;
    for (let c = 0; c < columns; c++) {
      const columnEnd = columnEndTimes[c];
      const coversStart = columnEnd - 1 > startTime;
      const coveredByEnd = endTime - 1 > columnEnd;
      const extendsBeyondEnd = columnEnd - 1 > endTime;
      overlapping = overlapping || (coversStart && coveredByEnd);
      if (extendsBeyondEnd) holdFactor = 1.25;
      closestEndTime = Math.min(closestEndTime, Math.abs(endTime - columnEnd));
    }
    if (overlapping) {
      holdAddition = 1 / (1 + Math.exp(0.5 * (RELEASE_THRESHOLD_MS - closestEndTime)));
    }

    individualStrains[column] =
      individualStrains[column] * Math.pow(INDIVIDUAL_DECAY_BASE, (startTime - columnStartTimes[column]) / 1000) +
      2.0 * holdFactor;
    individualStrain = current.deltaTime <= 1
      ? Math.max(individualStrain, individualStrains[column])
      : individualStrains[column];
    overallStrain =
      overallStrain * Math.pow(OVERALL_DECAY_BASE, current.deltaTime / 1000) +
      (1 + holdAddition) * holdFactor;
    columnStartTimes[column] = startTime;
    columnEndTimes[column] = endTime;

    const strain = individualStrain + overallStrain;
    if (strain > sectionPeak) sectionPeak = strain;
  }
  strainPeaks.push(sectionPeak);

  return { starRating: difficultyFromStrainPeaks(strainPeaks, 0), maxCombo };
}

/**
 * Computes lazer-equivalent progressive (timed) mania difficulty attributes.
 * Runs the same strain pass as {@link calculateManiaDifficultyAttributes} but
 * records the star rating after each hitobject, mirroring ppy/osu
 * `DifficultyCalculator.CalculateTimed` (one entry per hitobject, evaluated
 * from the strain peaks processed so far).
 *
 * Entries carry original (non-clock-adjusted) end times for binary-search
 * lookup via {@link getTimedStarRatingAtTime}; strain itself still uses
 * clock-rate-scaled times exactly like the full-chart path. The returned
 * array is sorted by ascending time with an enforced non-decreasing star
 * rating (overlapping hold end times can otherwise invert adjacent entries).
 * The final entry is bit-identical to the full-chart star rating and max
 * combo. Returns an empty array when there are no valid notes.
 */
export function calculateTimedManiaDifficultyAttributes(
  notes: ReadonlyArray<ManiaDifficultyNote> | undefined | null,
  keyCount: number,
  clockRate?: number,
): TimedManiaDifficultyAttributes[] {
  const columns = Number.isInteger(keyCount) ? Math.min(10, Math.max(1, keyCount)) : 4;
  const rate = typeof clockRate === 'number' && Number.isFinite(clockRate) && clockRate > 0 ? clockRate : 1;

  const valid: OrderedNote[] = [];
  if (Array.isArray(notes)) {
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (!note || typeof note.time !== 'number' || !Number.isFinite(note.time)) continue;
      if (!Number.isInteger(note.column) || note.column < 0 || note.column >= columns) continue;
      const hold = isHoldNote(note);
      const endTime = hold && typeof note.endTime === 'number' && Number.isFinite(note.endTime) && note.endTime > note.time
        ? note.endTime
        : note.time;
      valid.push({ time: note.time, column: note.column, endTime, hold });
    }
  }

  orderNotesByStartTime(valid);

  if (valid.length === 0) {
    return [];
  }

  const objects: StrainObject[] = [];
  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const previous = valid[i - 1];
    objects.push({
      startTime: current.time / rate,
      endTime: current.endTime / rate,
      deltaTime: (current.time - previous.time) / rate,
      column: current.column,
    });
  }

  const timed: TimedManiaDifficultyAttributes[] = [];
  let runningMaxCombo = maxComboForNote(valid[0].time, valid[0].endTime, valid[0].hold);
  // The first hitobject generates no strain (same as the lazer skill pass),
  // so its progressive difficulty is always 0.
  timed.push({
    time: endTimeOf(valid[0].time, valid[0].endTime, valid[0].hold),
    starRating: 0,
    maxCombo: runningMaxCombo,
  });

  const individualStrains = new Array<number>(columns).fill(0);
  const columnStartTimes = new Array<number>(columns).fill(0);
  const columnEndTimes = new Array<number>(columns).fill(0);
  let individualStrain = 0;
  let overallStrain = 1;
  let sectionPeak = 0;
  let sectionEnd = 0;
  const strainPeaks: number[] = [];

  for (let i = 0; i < objects.length; i++) {
    const current = objects[i];
    if (i === 0) {
      sectionEnd = Math.ceil(current.startTime / SECTION_LENGTH_MS) * SECTION_LENGTH_MS;
    }
    while (current.startTime > sectionEnd) {
      strainPeaks.push(sectionPeak);
      const previousStart = i > 0 ? objects[i - 1].startTime : 0;
      sectionPeak =
        individualStrain * Math.pow(INDIVIDUAL_DECAY_BASE, (sectionEnd - previousStart) / 1000) +
        overallStrain * Math.pow(OVERALL_DECAY_BASE, (sectionEnd - previousStart) / 1000);
      sectionEnd += SECTION_LENGTH_MS;
    }

    const startTime = current.startTime;
    const endTime = current.endTime;
    const column = current.column;
    let overlapping = false;
    let closestEndTime = Math.abs(endTime - startTime);
    let holdFactor = 1;
    let holdAddition = 0;
    for (let c = 0; c < columns; c++) {
      const columnEnd = columnEndTimes[c];
      const coversStart = columnEnd - 1 > startTime;
      const coveredByEnd = endTime - 1 > columnEnd;
      const extendsBeyondEnd = columnEnd - 1 > endTime;
      overlapping = overlapping || (coversStart && coveredByEnd);
      if (extendsBeyondEnd) holdFactor = 1.25;
      closestEndTime = Math.min(closestEndTime, Math.abs(endTime - columnEnd));
    }
    if (overlapping) {
      holdAddition = 1 / (1 + Math.exp(0.5 * (RELEASE_THRESHOLD_MS - closestEndTime)));
    }

    individualStrains[column] =
      individualStrains[column] * Math.pow(INDIVIDUAL_DECAY_BASE, (startTime - columnStartTimes[column]) / 1000) +
      2.0 * holdFactor;
    individualStrain = current.deltaTime <= 1
      ? Math.max(individualStrain, individualStrains[column])
      : individualStrains[column];
    overallStrain =
      overallStrain * Math.pow(OVERALL_DECAY_BASE, current.deltaTime / 1000) +
      (1 + holdAddition) * holdFactor;
    columnStartTimes[column] = startTime;
    columnEndTimes[column] = endTime;

    const strain = individualStrain + overallStrain;
    if (strain > sectionPeak) sectionPeak = strain;

    const note = valid[i + 1];
    runningMaxCombo += maxComboForNote(note.time, note.endTime, note.hold);
    timed.push({
      time: endTimeOf(note.time, note.endTime, note.hold),
      starRating: difficultyFromStrainPeaks(strainPeaks, sectionPeak),
      maxCombo: runningMaxCombo,
    });
  }

  // Binary-search lookup requires ascending time order; overlapping hold end
  // times can invert adjacent generation-order entries, so stable-sort by
  // time and enforce a non-decreasing rating.
  timed.sort((a, b) => a.time - b.time);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].starRating < timed[i - 1].starRating) {
      timed[i] = { ...timed[i], starRating: timed[i - 1].starRating };
    }
    if (timed[i].maxCombo < timed[i - 1].maxCombo) {
      timed[i] = { ...timed[i], maxCombo: timed[i - 1].maxCombo };
    }
  }

  return timed;
}

/**
 * Returns the progressive star rating at a progress time (original,
 * non-clock-adjusted ms), mirroring lazer `PerformancePointsCounter`
 * timed-attribute lookup: the last entry with `time <= progressTime`, or 0
 * before the first entry. Returns 0 for empty input.
 */
export function getTimedStarRatingAtTime(
  timed: ReadonlyArray<TimedManiaDifficultyAttributes> | undefined | null,
  progressTime: number,
): number {
  if (!Array.isArray(timed) || timed.length === 0) return 0;
  if (typeof progressTime !== 'number' || !Number.isFinite(progressTime)) return 0;
  let lo = 0;
  let hi = timed.length - 1;
  let result = 0;
  let found = false;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timed[mid].time <= progressTime) {
      result = timed[mid].starRating;
      found = true;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found ? result : 0;
}