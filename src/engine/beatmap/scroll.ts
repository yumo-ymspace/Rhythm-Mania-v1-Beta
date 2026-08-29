import type { TimingPoint } from './types';

export interface ScrollSegment {
  startTime: number;
  endTime: number;
  multiplier: number;
  cumulativeDistanceStart: number;
}

export class ScrollPositionCalculator {
  private segments: ScrollSegment[] = [];

  constructor(timingPoints: TimingPoint[], mapDuration: number, constantSpeed = false) {
    this.buildSegments(timingPoints, mapDuration, constantSpeed);
  }

  private buildSegments(timingPoints: TimingPoint[], mapDuration: number, constantSpeed: boolean): void {
    const sorted = [...timingPoints].sort((a, b) => a.time - b.time);
    let currentMultiplier = 1;
    let lastTime = 0;
    let runningDistance = 0;

    for (const tp of sorted) {
      const time = Math.max(0, tp.time);
      if (time > lastTime) {
        this.segments.push({
          startTime: lastTime,
          endTime: time,
          multiplier: currentMultiplier,
          cumulativeDistanceStart: runningDistance,
        });
        runningDistance += (time - lastTime) * currentMultiplier;
        lastTime = time;
      }
      if (!constantSpeed && !tp.uninherited) {
        currentMultiplier = -100 / tp.beatLength;
      }
      // Uninherited (red) BPM points do not reset SV to 1.0.
    }

    this.segments.push({
      startTime: lastTime,
      endTime: mapDuration + 10_000,
      multiplier: currentMultiplier,
      cumulativeDistanceStart: runningDistance,
    });
  }

  public getVisualPosition(time: number): number {
    if (this.segments.length === 0) return time;
    let low = 0;
    let high = this.segments.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const seg = this.segments[mid];
      if (time >= seg.startTime && time < seg.endTime) {
        return seg.cumulativeDistanceStart + (time - seg.startTime) * seg.multiplier;
      }
      if (time < seg.startTime) high = mid - 1;
      else low = mid + 1;
    }
    const last = this.segments[this.segments.length - 1];
    return last.cumulativeDistanceStart + (time - last.startTime) * last.multiplier;
  }
}

export function initialBpm(timingPoints: TimingPoint[]): number {
  const first = timingPoints.find((tp) => tp.uninherited && tp.beatLength > 0);
  if (!first) return 120;
  return 60000 / first.beatLength;
}
