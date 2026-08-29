/** Port of ppy/osu ManiaHitWindows.cs + IBeatmapDifficultyInfo.DifficultyRange. */

export enum HitResult {
  None = 0,
  Miss = 1,
  Meh = 2,
  Ok = 3,
  Good = 4,
  Great = 5,
  Perfect = 6,
  ComboBreak = 7,
}

export const PERFECT_WINDOW_RANGE = { min: 22.4, mid: 19.4, max: 13.9 } as const;
const GREAT_WINDOW_RANGE = { min: 64, mid: 49, max: 34 } as const;
const GOOD_WINDOW_RANGE = { min: 97, mid: 82, max: 67 } as const;
const OK_WINDOW_RANGE = { min: 127, mid: 112, max: 97 } as const;
const MEH_WINDOW_RANGE = { min: 151, mid: 136, max: 121 } as const;
const MISS_WINDOW_RANGE = { min: 188, mid: 173, max: 158 } as const;

export function difficultyRange(od: number, min: number, mid: number, max: number): number {
  if (od > 5) return mid + ((max - mid) * (od - 5)) / 5;
  if (od < 5) return mid + ((mid - min) * (od - 5)) / 5;
  return mid;
}

export type HitWindowsOptions = {
  overallDifficulty: number;
  speedMultiplier?: number;
  difficultyMultiplier?: number;
  classicModActive?: boolean;
  scoreV2Active?: boolean;
  isConvert?: boolean;
};

export class ManiaHitWindows {
  public perfect = 0;
  public great = 0;
  public good = 0;
  public ok = 0;
  public meh = 0;
  public miss = 0;

  constructor(options: HitWindowsOptions) {
    const od = Math.max(0, Math.min(10, options.overallDifficulty));
    const speed = options.speedMultiplier ?? 1;
    const difficulty = options.difficultyMultiplier ?? 1;
    const totalMultiplier = speed / difficulty;
    const classic = options.classicModActive === true && options.scoreV2Active !== true;

    const floorWindow = (value: number): number => Math.floor(value * totalMultiplier) + 0.5;

    if (classic) {
      if (options.isConvert) {
        this.perfect = floorWindow(16);
        this.great = floorWindow(Math.round(od) > 4 ? 34 : 47);
        this.good = floorWindow(Math.round(od) > 4 ? 67 : 77);
        this.ok = floorWindow(97);
        this.meh = floorWindow(121);
        this.miss = floorWindow(158);
      } else {
        const invertedOd = Math.max(0, Math.min(10, 10 - od));
        this.perfect = floorWindow(16);
        this.great = floorWindow(34 + 3 * invertedOd);
        this.good = floorWindow(67 + 3 * invertedOd);
        this.ok = floorWindow(97 + 3 * invertedOd);
        this.meh = floorWindow(121 + 3 * invertedOd);
        this.miss = floorWindow(158 + 3 * invertedOd);
      }
    } else {
      this.perfect = floorWindow(difficultyRange(od, PERFECT_WINDOW_RANGE.min, PERFECT_WINDOW_RANGE.mid, PERFECT_WINDOW_RANGE.max));
      this.great = floorWindow(difficultyRange(od, GREAT_WINDOW_RANGE.min, GREAT_WINDOW_RANGE.mid, GREAT_WINDOW_RANGE.max));
      this.good = floorWindow(difficultyRange(od, GOOD_WINDOW_RANGE.min, GOOD_WINDOW_RANGE.mid, GOOD_WINDOW_RANGE.max));
      this.ok = floorWindow(difficultyRange(od, OK_WINDOW_RANGE.min, OK_WINDOW_RANGE.mid, OK_WINDOW_RANGE.max));
      this.meh = floorWindow(difficultyRange(od, MEH_WINDOW_RANGE.min, MEH_WINDOW_RANGE.mid, MEH_WINDOW_RANGE.max));
      this.miss = floorWindow(difficultyRange(od, MISS_WINDOW_RANGE.min, MISS_WINDOW_RANGE.mid, MISS_WINDOW_RANGE.max));
    }
  }

  public windowFor(result: HitResult): number {
    switch (result) {
      case HitResult.Perfect:
        return this.perfect;
      case HitResult.Great:
        return this.great;
      case HitResult.Good:
        return this.good;
      case HitResult.Ok:
        return this.ok;
      case HitResult.Meh:
        return this.meh;
      case HitResult.Miss:
        return this.miss;
      default:
        return 0;
    }
  }

  public judge(deltaMs: number): HitResult {
    const absDelta = Math.abs(deltaMs);
    if (absDelta <= this.perfect) return HitResult.Perfect;
    if (absDelta <= this.great) return HitResult.Great;
    if (absDelta <= this.good) return HitResult.Good;
    if (absDelta <= this.ok) return HitResult.Ok;
    if (absDelta <= this.meh) return HitResult.Meh;
    if (absDelta <= this.miss) return HitResult.Miss;
    return HitResult.None;
  }

  /** Late Meh on head/tail is impossible in lazer → Miss. */
  public judgeNote(deltaMs: number): HitResult {
    const result = this.judge(deltaMs);
    if (result === HitResult.Meh && deltaMs > 0) return HitResult.Miss;
    return result;
  }

  /** Tail release: timeOffset is divided by 1.5 before judging (DrawableHoldNoteTail). */
  public judgeTail(deltaMs: number): HitResult {
    return this.judgeNote(deltaMs / 1.5);
  }

  public canBeHit(deltaMs: number, isTail = false): boolean {
    const window = isTail ? this.miss * 1.5 : this.miss;
    return Math.abs(deltaMs) <= window;
  }
}

export const EZ_HIT_WINDOW_DIFFICULTY_MULTIPLIER = 1 / 1.4;
export const HR_HIT_WINDOW_DIFFICULTY_MULTIPLIER = 1.4;
