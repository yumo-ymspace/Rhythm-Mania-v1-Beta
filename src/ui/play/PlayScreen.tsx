import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import { parseOsu } from '../../engine/beatmap/parser';
import { initialBpm, ScrollPositionCalculator } from '../../engine/beatmap/scroll';
import { AudioMasterClock } from '../../engine/clock/audioMasterClock';
import { defaultBindsFor } from '../../engine/input/bindings';
import { LowLatencyInputManager } from '../../engine/input/inputManager';
import { ManiaStage } from '../../engine/render/playfield';
import { ManiaGameplay } from '../../engine/ruleset/gameplay';
import { HitResult } from '../../engine/ruleset/hitWindows';
import { db } from '../../storage/db';
import { useGame } from '../../state/GameContext';
import type { PlayResult } from '../../state/types';
import { PauseFailOverlay } from '../screens/PauseFail';

type Session = {
  clock: AudioMasterClock;
  input: LowLatencyInputManager;
  gameplay: ManiaGameplay;
  stage: ManiaStage;
  scroll: ScrollPositionCalculator;
  raf: number;
  audioCtx: AudioContext;
  audioBuffer: AudioBuffer;
  duration: number;
  lastJudgeKey: string;
};

export function PlayScreen() {
  const game = useGame();
  const hostRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({ score: 0, acc: 1, hp: 1, combo: 0, progress: 0 });
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const onEsc = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      const s = sessionRef.current;
      if (!s || s.gameplay.health.failed) return;
      if (pausedRef.current) resume();
      else pause();
    };

    void (async () => {
      const mapRow = game.beatmaps.find((b) => b.id === game.selectedBeatmapId);
      const setRow = game.sets.find((s) => s.id === mapRow?.setId);
      const host = hostRef.current;
      if (!mapRow || !setRow || !host) {
        game.go('songSelect');
        return;
      }
      const beatmap = parseOsu(mapRow.rawOsuContent);
      game.dispatch({ type: 'bpm', bpm: initialBpm(beatmap.timingPoints) });
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(await setRow.audioBlob.arrayBuffer());
      if (cancelled) {
        void audioCtx.close();
        return;
      }
      const clock = new AudioMasterClock(audioCtx);
      clock.setOffsets(game.settings.userOffsetMs, 0);
      clock.setVolume(game.settings.masterVolume * game.settings.musicVolume);
      await clock.resume();

      const gameplay = new ManiaGameplay(beatmap, game.mods);
      const last = beatmap.hitObjects[beatmap.hitObjects.length - 1];
      const duration = Math.max(audioBuffer.duration * 1000, last?.endTime ?? 0);
      const scroll = new ScrollPositionCalculator(beatmap.timingPoints, duration, game.mods.includes('CS'));
      const binds = game.settings.binds[gameplay.keyCount] ?? defaultBindsFor(gameplay.keyCount);
      const input = new LowLatencyInputManager(gameplay.keyCount, binds);
      input.attach();

      const app = new Application();
      await app.init({
        background: '#08090D',
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio,
        resizeTo: host,
      });
      if (cancelled) {
        app.destroy(true);
        input.detach();
        void audioCtx.close();
        return;
      }
      host.appendChild(app.canvas as HTMLCanvasElement);
      const stage = new ManiaStage(app);
      stage.layout(
        gameplay.keyCount,
        host.clientHeight || 720,
        host.clientWidth || 1280,
        game.settings.scrollDurationMs,
        game.settings.upscroll,
      );

      clock.start(audioBuffer, 0, gameplay.rate);
      const session: Session = {
        clock,
        input,
        gameplay,
        stage,
        scroll,
        raf: 0,
        audioCtx,
        audioBuffer,
        duration,
        lastJudgeKey: '',
      };
      sessionRef.current = session;

      const tick = (): void => {
        const s = sessionRef.current;
        if (!s) return;
        if (!pausedRef.current) {
          const now = s.clock.getCurrentTime();
          const events = s.input.drainEvents().map((e) => ({
            column: e.column,
            type: e.type,
            timeMs: now + (e.timestamp - performance.now()) * s.clock.rate,
          }));
          s.gameplay.update(now, events);
          if (s.gameplay.lastJudgement) {
            const key = `${s.gameplay.lastJudgement.time}:${s.gameplay.lastJudgement.result}`;
            if (key !== s.lastJudgeKey) {
              s.lastJudgeKey = key;
              s.stage.showJudgement(s.gameplay.lastJudgement.result, s.gameplay.score.combo);
            }
          }
          s.stage.draw(
            now,
            s.gameplay.notes,
            s.scroll,
            s.input.pressed,
            game.mods.includes('HD'),
            game.mods.includes('FI'),
          );
          setHud({
            score: s.gameplay.score.totalScore,
            acc: s.gameplay.score.accuracy,
            hp: s.gameplay.health.health,
            combo: s.gameplay.score.combo,
            progress: Math.min(1, now / s.duration),
          });
          if (s.gameplay.health.failed) {
            void endPlay(true);
            return;
          }
          if (s.gameplay.finished || now > s.duration + 500) {
            void endPlay(false);
            return;
          }
        }
        s.raf = requestAnimationFrame(tick);
      };
      session.raf = requestAnimationFrame(tick);
      window.addEventListener('keydown', onEsc);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onEsc);
      destroySession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function destroySession(): void {
    const s = sessionRef.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    s.input.detach();
    s.clock.stop();
    s.stage.destroy();
    void s.audioCtx.close();
    sessionRef.current = null;
  }

  function pause(): void {
    const s = sessionRef.current;
    if (!s) return;
    s.clock.pause();
    pausedRef.current = true;
    setPaused(true);
  }

  function resume(): void {
    const s = sessionRef.current;
    if (!s) return;
    pausedRef.current = false;
    setPaused(false);
    s.clock.start(s.audioBuffer, s.clock.pausedPositionMs, s.clock.rate);
  }

  async function endPlay(failed: boolean): Promise<void> {
    if (finishing.current) return;
    finishing.current = true;
    const s = sessionRef.current;
    if (!s) return;
    s.clock.pause();
    const sc = s.gameplay.score;
    const result: PlayResult = {
      score: sc.totalScore,
      accuracy: sc.accuracy,
      maxCombo: sc.maxCombo,
      rank: failed ? 'F' : sc.rank,
      unstableRate: sc.unstableRate(),
      counts: { ...sc.counts },
      mods: game.mods,
      beatmapId: game.selectedBeatmapId ?? '',
      title: game.sets.find((x) => x.id === game.beatmaps.find((b) => b.id === game.selectedBeatmapId)?.setId)?.title ?? '',
      version: game.beatmaps.find((b) => b.id === game.selectedBeatmapId)?.version ?? '',
      failed,
    };
    if (game.selectedBeatmapId) {
      await db.localPlays.add({
        beatmapId: game.selectedBeatmapId,
        score: result.score,
        accuracy: result.accuracy,
        maxCombo: result.maxCombo,
        rank: result.rank,
        unstableRate: result.unstableRate,
        judgments: {
          perfect: sc.counts[HitResult.Perfect],
          great: sc.counts[HitResult.Great],
          good: sc.counts[HitResult.Good],
          ok: sc.counts[HitResult.Ok],
          meh: sc.counts[HitResult.Meh],
          miss: sc.counts[HitResult.Miss],
        },
        mods: game.mods,
        timestamp: Date.now(),
      });
    }
    destroySession();
    game.dispatch({ type: 'result', result });
  }

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-6 top-6 h-2 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-[#00FF66] to-[#00F0FF]" style={{ width: `${hud.hp * 100}%` }} />
        </div>
        <div className="absolute left-1/2 top-4 h-1 w-1/3 -translate-x-1/2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-[#00F0FF]" style={{ width: `${hud.progress * 100}%` }} />
        </div>
        <div className="absolute right-8 top-6 text-right">
          <div className="tabular-numbers text-4xl font-black">{hud.score.toLocaleString()}</div>
          <div className="tabular-numbers text-xl text-[#00F0FF]">{(hud.acc * 100).toFixed(2)}%</div>
        </div>
      </div>
      {paused && (
        <PauseFailOverlay
          failed={false}
          paused
          onResume={resume}
          onRetry={() => {
            destroySession();
            game.go('songSelect');
            queueMicrotask(() => game.go('playing'));
          }}
          onQuit={() => {
            destroySession();
            game.go('songSelect');
          }}
        />
      )}
    </div>
  );
}
