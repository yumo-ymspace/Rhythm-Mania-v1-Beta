import { HitResult } from './hitWindows';

/**
 * Port of ManiaHealthProcessor.GetHealthIncreaseFor.
 * ComputeDrainRate returns 0 (no continuous drain).
 * HpMultiplierNormal is 1 until the full LegacyDrainingHealthProcessor
 * recovery fit is ported; deltas still scale with map HP drain rate.
 */
export function healthDelta(result: HitResult, drainRate: number, isHeadOrTail: boolean, hpMultiplierNormal = 1): number {
  switch (result) {
    case HitResult.Miss:
      if (isHeadOrTail) return -(drainRate + 1) * 0.00375;
      return -(drainRate + 1) * 0.0075;
    case HitResult.Meh:
      return -(drainRate + 1) * 0.0016;
    case HitResult.Ok:
      return 0;
    case HitResult.Good:
      return hpMultiplierNormal * (0.004 - drainRate * 0.0004);
    case HitResult.Great:
      return hpMultiplierNormal * (0.005 - drainRate * 0.0005);
    case HitResult.Perfect:
      return hpMultiplierNormal * (0.0055 - drainRate * 0.0005);
    default:
      return 0;
  }
}

export class ManiaHealthProcessor {
  public health = 1;
  public failed = false;

  constructor(
    private readonly drainRate: number,
    private readonly noFail: boolean,
  ) {}

  public apply(result: HitResult, isHeadOrTail: boolean): void {
    if (this.failed && !this.noFail) return;
    this.health = Math.max(0, Math.min(1, this.health + healthDelta(result, this.drainRate, isHeadOrTail)));
    if (this.health <= 0 && !this.noFail) this.failed = true;
  }
}
