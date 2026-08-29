import type { ParsedManiaBeatmap, RawHitObject } from '../beatmap/types';
import { ManiaHitWindows, HitResult } from './hitWindows';
import { EZ_HIT_WINDOW_DIFFICULTY_MULTIPLIER, HR_HIT_WINDOW_DIFFICULTY_MULTIPLIER } from './hitWindows';
import { ManiaHealthProcessor } from './health';
import { ManiaScoreProcessor } from './score';
import {
  isSilverRankMods,
  keyCountOverride,
  playbackRateFor,
  remapColumns,
  scoreMultiplierFor,
  type ModAcronym,
} from './mods';

export type LiveJudgement = {
  result: HitResult;
  offsetMs: number;
  column: number;
  time: number;
};

export type PlayNote = {
  id: number;
  column: number;
  startTime: number;
  endTime: number;
  isHold: boolean;
  headJudged: boolean;
  tailJudged: boolean;
  holding: boolean;
  missedHead: boolean;
  bodyBroken: boolean;
};

export class ManiaGameplay {
  public readonly keyCount: number;
  public readonly windows: ManiaHitWindows;
  public readonly score: ManiaScoreProcessor;
  public readonly health: ManiaHealthProcessor;
  public readonly notes: PlayNote[];
  public readonly rate: number;
  public lastJudgement: LiveJudgement | null = null;
  public finished = false;

  private readonly heads: PlayNote[][];
  private headCursor: number[];
  private auto: boolean;
  private suddenDeath: boolean;
  private perfectMod: boolean;
  private accuracyChallenge: boolean;

  constructor(beatmap: ParsedManiaBeatmap, mods: ModAcronym[]) {
    this.rate = playbackRateFor(mods);
    const nativeKeys = beatmap.difficulty.keyCount;
    const forced = keyCountOverride(mods);
    this.keyCount = forced ?? nativeKeys;

    const difficultyMultiplier = mods.includes('HR')
      ? HR_HIT_WINDOW_DIFFICULTY_MULTIPLIER
      : mods.includes('EZ')
        ? EZ_HIT_WINDOW_DIFFICULTY_MULTIPLIER
        : 1;

    this.windows = new ManiaHitWindows({
      overallDifficulty: beatmap.difficulty.overallDifficulty,
      speedMultiplier: this.rate,
      difficultyMultiplier,
      classicModActive: mods.includes('CL'),
    });

    let objects = beatmap.hitObjects.map((o) => ({ ...o }));
    if (mods.includes('HO')) {
      objects = objects.map((o) => ({ ...o, isHold: false, endTime: o.startTime }));
    }
    if (forced !== null && forced !== nativeKeys) {
      objects = convertKeyCount(objects, nativeKeys, forced);
    }
    const columns = remapColumns(
      objects.map((o) => o.column),
      this.keyCount,
      mods,
    );
    objects = objects.map((o, i) => ({ ...o, column: columns[i] ?? o.column }));

    this.notes = objects.map((o, id) => toPlayNote(id, o));
    this.heads = Array.from({ length: this.keyCount }, () => []);
    for (const note of this.notes) this.heads[note.column]?.push(note);
    for (const col of this.heads) col.sort((a, b) => a.startTime - b.startTime);
    this.headCursor = new Array(this.keyCount).fill(0);

    const judgements = this.notes.reduce((n, o) => n + (o.isHold ? 2 : 1), 0);
    this.score = new ManiaScoreProcessor(judgements, scoreMultiplierFor(mods), isSilverRankMods(mods));
    this.health = new ManiaHealthProcessor(beatmap.difficulty.hpDrainRate, mods.includes('NF') || mods.includes('AT') || mods.includes('CN'));
    this.auto = mods.includes('AT') || mods.includes('CN');
    this.suddenDeath = mods.includes('SD');
    this.perfectMod = mods.includes('PF');
    this.accuracyChallenge = mods.includes('AC');
  }

  public update(nowMs: number, inputs: { column: number; type: 'down' | 'up'; timeMs: number }[]): void {
    if (this.health.failed) return;

    if (this.auto) this.runAuto(nowMs);

    for (const input of inputs) {
      if (input.type === 'down') this.onDown(input.column, input.timeMs);
      else this.onUp(input.column, input.timeMs);
    }

    this.autoMiss(nowMs);

    const last = this.notes[this.notes.length - 1];
    if (last && nowMs > last.endTime + 1500 && this.notes.every((n) => n.headJudged && (!n.isHold || n.tailJudged))) {
      this.finished = true;
    }
  }

  private runAuto(nowMs: number): void {
    for (const note of this.notes) {
      if (!note.headJudged && nowMs >= note.startTime) {
        this.judgeHead(note, 0);
        if (note.isHold) note.holding = true;
      }
      if (note.isHold && !note.tailJudged && nowMs >= note.endTime) {
        this.judgeTail(note, 0);
        note.holding = false;
      }
    }
  }

  private onDown(column: number, timeMs: number): void {
    const note = this.nextUnjudgedHead(column);
    if (!note) return;
    const delta = timeMs - note.startTime;
    if (delta < -this.windows.miss) return; // ghost tap
    if (Math.abs(delta) <= this.windows.miss) {
      this.judgeHead(note, delta);
      if (note.isHold && note.headJudged) note.holding = true;
    }
  }

  private onUp(column: number, timeMs: number): void {
    const held = this.heads[column]?.find((n) => n.isHold && n.holding && !n.tailJudged);
    if (!held) return;
    held.holding = false;
    const delta = timeMs - held.endTime;
    const earlyBody = timeMs < held.endTime - this.windows.miss * 1.5;
    if (earlyBody && held.headJudged && !held.missedHead) {
      this.applyResult(HitResult.ComboBreak, 0, column, false);
      held.bodyBroken = true;
      return;
    }
    if (this.windows.canBeHit(delta, true)) {
      this.judgeTail(held, delta);
    }
  }

  private autoMiss(nowMs: number): void {
    for (const note of this.notes) {
      if (!note.headJudged && nowMs - note.startTime > this.windows.miss) {
        this.judgeHead(note, nowMs - note.startTime, true);
      }
      if (note.isHold && !note.tailJudged && nowMs - note.endTime > this.windows.miss * 1.5) {
        this.judgeTail(note, nowMs - note.endTime, true);
      }
    }
  }

  private nextUnjudgedHead(column: number): PlayNote | undefined {
    const list = this.heads[column];
    if (!list) return undefined;
    let i = this.headCursor[column] ?? 0;
    while (i < list.length && list[i].headJudged) i += 1;
    this.headCursor[column] = i;
    return list[i];
  }

  private judgeHead(note: PlayNote, delta: number, forceMiss = false): void {
    if (note.headJudged) return;
    note.headJudged = true;
    const result = forceMiss ? HitResult.Miss : this.windows.judgeNote(delta);
    if (result === HitResult.None) {
      note.headJudged = false;
      return;
    }
    if (result === HitResult.Miss) note.missedHead = true;
    this.applyResult(result, delta, note.column, true);
  }

  private judgeTail(note: PlayNote, delta: number, forceMiss = false): void {
    if (note.tailJudged) return;
    note.tailJudged = true;
    note.holding = false;
    let result = forceMiss ? HitResult.Miss : this.windows.judgeTail(delta);
    if (note.bodyBroken && result !== HitResult.Miss && result !== HitResult.None) {
      // Early body release prevents judgements higher than Meh (lazer ScoreV2-like).
      if (result === HitResult.Perfect || result === HitResult.Great || result === HitResult.Good || result === HitResult.Ok) {
        result = HitResult.Meh;
        if (delta > 0) result = HitResult.Miss;
      }
    }
    if (result === HitResult.None) {
      note.tailJudged = false;
      return;
    }
    this.applyResult(result, delta, note.column, true);
  }

  private applyResult(result: HitResult, offset: number, column: number, isHeadOrTail: boolean): void {
    this.score.apply(result, result === HitResult.Miss || result === HitResult.ComboBreak ? undefined : offset);
    this.health.apply(result, isHeadOrTail);
    if (result !== HitResult.ComboBreak) {
      this.lastJudgement = { result, offsetMs: offset, column, time: performance.now() };
    }
    if (this.suddenDeath && result === HitResult.Miss) this.health.failed = true;
    if (this.perfectMod && result !== HitResult.Perfect && result !== HitResult.Great && resultAffectsScore(result)) {
      this.health.failed = true;
    }
    if (this.accuracyChallenge && (result === HitResult.Meh || result === HitResult.Miss)) {
      this.health.failed = true;
    }
  }
}

function resultAffectsScore(result: HitResult): boolean {
  return result !== HitResult.None && result !== HitResult.ComboBreak;
}

function toPlayNote(id: number, o: RawHitObject): PlayNote {
  return {
    id,
    column: o.column,
    startTime: o.startTime,
    endTime: o.isHold ? o.endTime : o.startTime,
    isHold: o.isHold,
    headJudged: false,
    tailJudged: !o.isHold,
    holding: false,
    missedHead: false,
    bodyBroken: false,
  };
}

function convertKeyCount(objects: RawHitObject[], from: number, to: number): RawHitObject[] {
  if (from === to) return objects;
  return objects.map((o) => ({
    ...o,
    column: Math.max(0, Math.min(to - 1, Math.floor((o.column * to) / from))),
  }));
}
