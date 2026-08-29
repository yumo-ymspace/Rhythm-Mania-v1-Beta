import { HitResult } from './hitWindows';

export type ScoreRank = 'XH' | 'X' | 'SH' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

const COMBO_BASE = 4;

export function getBaseScoreForResult(result: HitResult): number {
  switch (result) {
    case HitResult.Perfect:
      return 305;
    case HitResult.Great:
      return 300;
    case HitResult.Good:
      return 200;
    case HitResult.Ok:
      return 100;
    case HitResult.Meh:
      return 50;
    default:
      return 0;
  }
}

function getBaseComboScoreForResult(result: HitResult): number {
  if (result === HitResult.Perfect) return 300;
  return getBaseScoreForResult(result);
}

export function resultIncreasesCombo(result: HitResult): boolean {
  return (
    result === HitResult.Perfect ||
    result === HitResult.Great ||
    result === HitResult.Good ||
    result === HitResult.Ok ||
    result === HitResult.Meh
  );
}

export function resultBreaksCombo(result: HitResult): boolean {
  return result === HitResult.Miss || result === HitResult.ComboBreak;
}

export function resultAffectsAccuracy(result: HitResult): boolean {
  return (
    result === HitResult.Perfect ||
    result === HitResult.Great ||
    result === HitResult.Good ||
    result === HitResult.Ok ||
    result === HitResult.Meh ||
    result === HitResult.Miss
  );
}

function comboScoreChange(result: HitResult, comboAfter: number): number {
  const base = getBaseComboScoreForResult(result);
  const factor = Math.min(Math.max(0.5, Math.log(comboAfter) / Math.log(COMBO_BASE)), Math.log(400) / Math.log(COMBO_BASE));
  return base * factor;
}

export class ManiaScoreProcessor {
  public combo = 0;
  public maxCombo = 0;
  public accuracy = 1;
  public totalScore = 0;
  public rank: ScoreRank = 'X';
  public counts: Record<HitResult, number> = {
    [HitResult.None]: 0,
    [HitResult.Miss]: 0,
    [HitResult.Meh]: 0,
    [HitResult.Ok]: 0,
    [HitResult.Good]: 0,
    [HitResult.Great]: 0,
    [HitResult.Perfect]: 0,
    [HitResult.ComboBreak]: 0,
  };
  public hitErrors: number[] = [];

  private currentBaseScore = 0;
  private currentMaximumBaseScore = 0;
  private currentAccuracyJudgementCount = 0;
  private currentComboPortion = 0;
  private currentBonusPortion = 0;
  private maximumComboPortion = 0;
  private maximumAccuracyJudgementCount = 0;
  private scoreMultiplier: number;
  private silver: boolean;

  constructor(judgementCount: number, scoreMultiplier = 1, silver = false) {
    this.scoreMultiplier = scoreMultiplier;
    this.silver = silver;
    this.maximumAccuracyJudgementCount = judgementCount;
    this.maximumComboPortion = simulateMaxComboPortion(judgementCount);
  }

  public apply(result: HitResult, timeOffsetMs?: number): void {
    this.counts[result] += 1;

    if (resultIncreasesCombo(result)) this.combo += 1;
    else if (resultBreaksCombo(result)) this.combo = 0;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    if (resultAffectsAccuracy(result)) {
      this.currentMaximumBaseScore += 305;
      this.currentAccuracyJudgementCount += 1;
      this.currentBaseScore += getBaseScoreForResult(result);
    }

    if (result !== HitResult.ComboBreak && resultAffectsAccuracy(result)) {
      this.currentComboPortion += comboScoreChange(result, this.combo);
    }

    if (timeOffsetMs !== undefined && result !== HitResult.Miss && result !== HitResult.ComboBreak && result !== HitResult.None) {
      this.hitErrors.push(timeOffsetMs);
    }

    this.updateScore();
  }

  public unstableRate(): number {
    const n = this.hitErrors.length;
    if (n < 2) return 0;
    const mean = this.hitErrors.reduce((a, b) => a + b, 0) / n;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = this.hitErrors[i] - mean;
      sum += d * d;
    }
    return 10 * Math.sqrt(sum / (n - 1));
  }

  private updateScore(): void {
    this.accuracy = this.currentMaximumBaseScore > 0 ? this.currentBaseScore / this.currentMaximumBaseScore : 1;
    const comboProgress = this.maximumComboPortion > 0 ? this.currentComboPortion / this.maximumComboPortion : 1;
    const accuracyProgress =
      this.maximumAccuracyJudgementCount > 0 ? this.currentAccuracyJudgementCount / this.maximumAccuracyJudgementCount : 1;
    const raw =
      150000 * comboProgress +
      850000 * Math.pow(this.accuracy, 2 + 2 * this.accuracy) * accuracyProgress +
      this.currentBonusPortion;
    this.totalScore = Math.round(raw * this.scoreMultiplier);
    this.rank = this.computeRank();
  }

  private computeRank(): ScoreRank {
    let rank = rankFromScore(this.accuracy);
    if (rank === 'S') {
      const imperfect =
        this.counts[HitResult.Good] > 0 ||
        this.counts[HitResult.Ok] > 0 ||
        this.counts[HitResult.Meh] > 0 ||
        this.counts[HitResult.Miss] > 0;
      if (!imperfect) rank = 'X';
    }
    if (this.silver) {
      if (rank === 'X') return 'XH';
      if (rank === 'S') return 'SH';
    }
    return rank;
  }
}

export function rankFromScore(accuracy: number): Exclude<ScoreRank, 'XH' | 'SH' | 'F'> {
  if (accuracy === 1) return 'X';
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.9) return 'A';
  if (accuracy >= 0.8) return 'B';
  if (accuracy >= 0.7) return 'C';
  return 'D';
}

function simulateMaxComboPortion(judgementCount: number): number {
  let combo = 0;
  let portion = 0;
  for (let i = 0; i < judgementCount; i++) {
    combo += 1;
    portion += comboScoreChange(HitResult.Perfect, combo);
  }
  return portion;
}
