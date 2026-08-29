import { Application, Container, Graphics, Text } from 'pixi.js';
import type { PlayNote } from '../ruleset/gameplay';
import { HitResult } from '../ruleset/hitWindows';
import { laneColor } from './noteColors';
import type { ScrollPositionCalculator } from '../beatmap/scroll';

const NOTE_H = 18;
const COL_W = 64;
const RECEPTOR_H = 16;

export class ManiaStage {
  public readonly app: Application;
  private readonly stageRoot = new Container();
  private readonly lighting = new Container();
  private readonly holds = new Container();
  private readonly notes = new Container();
  private readonly receptors = new Container();
  private readonly hud = new Container();
  private notePool: Graphics[] = [];
  private holdPool: Graphics[] = [];
  private lightGfx: Graphics[] = [];
  private comboText: Text;
  private judgeText: Text;
  private keyCount = 4;
  private hitPosition = 0;
  private trackHeight = 720;
  private scrollDuration = 500;
  private upscroll = false;
  private lastJudge = '';
  private lastJudgeAt = 0;

  constructor(app: Application) {
    this.app = app;
    this.comboText = new Text({
      text: '',
      style: { fill: '#ffffff', fontFamily: 'Exo 2', fontSize: 42, fontWeight: '900' },
    });
    this.judgeText = new Text({
      text: '',
      style: { fill: '#00F0FF', fontFamily: 'Inter', fontSize: 22, fontWeight: '800' },
    });
    this.comboText.anchor.set(0.5);
    this.judgeText.anchor.set(0.5);
    this.stageRoot.addChild(this.lighting, this.holds, this.notes, this.receptors, this.hud);
    this.hud.addChild(this.comboText, this.judgeText);
    app.stage.addChild(this.stageRoot);
  }

  public layout(keyCount: number, height: number, width: number, scrollDuration: number, upscroll: boolean): void {
    this.keyCount = keyCount;
    this.trackHeight = height;
    this.scrollDuration = scrollDuration;
    this.upscroll = upscroll;
    this.hitPosition = upscroll ? 80 : height - 80;
    const totalW = keyCount * COL_W;
    this.stageRoot.x = (width - totalW) / 2;
    this.stageRoot.y = 0;

    this.receptors.removeChildren();
    this.lighting.removeChildren();
    this.lightGfx = [];
    const bg = new Graphics().rect(0, 0, totalW, height).fill({ color: 0x0a0c10, alpha: 0.88 });
    this.receptors.addChildAt(bg, 0);
    for (let i = 0; i < keyCount; i++) {
      const color = laneColor(keyCount, i);
      const line = new Graphics()
        .rect(i * COL_W, 0, 1, height)
        .fill({ color: 0xffffff, alpha: 0.06 });
      this.receptors.addChild(line);
      const rec = new Graphics()
        .roundRect(i * COL_W + 2, this.hitPosition - RECEPTOR_H / 2, COL_W - 4, RECEPTOR_H, 4)
        .fill({ color, alpha: 0.22 })
        .stroke({ color, width: 2 });
      this.receptors.addChild(rec);
      const light = new Graphics();
      this.lightGfx.push(light);
      this.lighting.addChild(light);
    }
    this.comboText.position.set(totalW / 2, this.hitPosition - (upscroll ? -48 : 48));
    this.judgeText.position.set(totalW / 2, this.hitPosition - (upscroll ? -84 : 84));
  }

  public showJudgement(result: HitResult, combo: number): void {
    const labels: Partial<Record<HitResult, string>> = {
      [HitResult.Perfect]: 'PERFECT',
      [HitResult.Great]: 'GREAT',
      [HitResult.Good]: 'GOOD',
      [HitResult.Ok]: 'OK',
      [HitResult.Meh]: 'MEH',
      [HitResult.Miss]: 'MISS',
    };
    const colors: Partial<Record<HitResult, string>> = {
      [HitResult.Perfect]: '#00F0FF',
      [HitResult.Great]: '#FFCC00',
      [HitResult.Good]: '#00FF66',
      [HitResult.Ok]: '#0088FF',
      [HitResult.Meh]: '#A0AEC0',
      [HitResult.Miss]: '#FF1E56',
    };
    this.lastJudge = labels[result] ?? '';
    this.lastJudgeAt = performance.now();
    this.judgeText.text = this.lastJudge;
    this.judgeText.style.fill = colors[result] ?? '#fff';
    this.comboText.text = combo > 0 ? String(combo) : '';
  }

  public draw(
    now: number,
    notes: PlayNote[],
    scroll: ScrollPositionCalculator,
    pressed: boolean[],
    hidden: boolean,
    fadeIn: boolean,
  ): void {
    const currentDist = scroll.getVisualPosition(now);
    let ni = 0;
    let hi = 0;
    for (const note of notes) {
      if (note.headJudged && (!note.isHold || note.tailJudged)) continue;
      const startDist = scroll.getVisualPosition(note.startTime);
      const yHead = this.yFromDelta(startDist - currentDist);
      if (note.isHold) {
        const endDist = scroll.getVisualPosition(note.endTime);
        const yTail = this.yFromDelta(endDist - currentDist);
        const gfx = this.holdAt(hi++);
        const top = Math.min(yHead, yTail);
        const h = Math.abs(yTail - yHead) + NOTE_H;
        const color = laneColor(this.keyCount, note.column);
        gfx.clear();
        gfx.roundRect(note.column * COL_W + 8, top, COL_W - 16, h, 6);
        gfx.fill({ color, alpha: 0.7 });
        gfx.visible = true;
      }
      if (!note.headJudged) {
        const gfx = this.noteAt(ni++);
        const color = laneColor(this.keyCount, note.column);
        let alpha = 1;
        const dist = Math.abs(yHead - this.hitPosition);
        if (hidden) alpha = Math.min(1, dist / 220);
        if (fadeIn) alpha = Math.min(1, 1 - dist / 420);
        gfx.clear();
        gfx.roundRect(note.column * COL_W + 4, yHead - NOTE_H / 2, COL_W - 8, NOTE_H, 6);
        gfx.fill({ color, alpha });
        gfx.stroke({ color: 0xffffff, width: 1, alpha: 0.35 * alpha });
        gfx.visible = true;
      }
    }
    for (let i = ni; i < this.notePool.length; i++) this.notePool[i].visible = false;
    for (let i = hi; i < this.holdPool.length; i++) this.holdPool[i].visible = false;

    for (let c = 0; c < this.keyCount; c++) {
      const light = this.lightGfx[c];
      if (!light) continue;
      light.clear();
      if (pressed[c]) {
        const color = laneColor(this.keyCount, c);
        const y0 = this.upscroll ? this.hitPosition : 0;
        const h = this.upscroll ? this.trackHeight - this.hitPosition : this.hitPosition;
        light.rect(c * COL_W + 4, y0, COL_W - 8, h).fill({ color, alpha: 0.12 });
      }
    }

    const age = performance.now() - this.lastJudgeAt;
    this.judgeText.alpha = age > 400 ? Math.max(0, 1 - (age - 400) / 300) : 1;
  }

  public destroy(): void {
    this.app.destroy(true);
  }

  private yFromDelta(deltaDist: number): number {
    const travel = (deltaDist / this.scrollDuration) * (this.upscroll ? this.hitPosition : this.hitPosition);
    return this.upscroll ? this.hitPosition + travel : this.hitPosition - travel;
  }

  private noteAt(i: number): Graphics {
    if (!this.notePool[i]) {
      const g = new Graphics();
      this.notes.addChild(g);
      this.notePool[i] = g;
    }
    return this.notePool[i];
  }

  private holdAt(i: number): Graphics {
    if (!this.holdPool[i]) {
      const g = new Graphics();
      this.holds.addChild(g);
      this.holdPool[i] = g;
    }
    return this.holdPool[i];
  }
}
