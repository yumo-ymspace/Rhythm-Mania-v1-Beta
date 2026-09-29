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

/**
 * Launch/menu background music.
 *
 * - When beatmapset 2153231 is installed, the start-button song is that set's
 *   audio file.
 * - Otherwise the menu loops the bundled `triangles.mp3` fallback track.
 *
 * Low-latency path (same approach as the d1/d2/d3 menu clicks in
 * `menuSounds.ts`): every track is fetched + decoded to an AudioBuffer ahead
 * of time, then started with a synchronous `source.start(0)` inside the real
 * user gesture. That skips the HTMLAudio load pipeline (fetch headers ->
 * demux -> first-frame decode -> `canplay` -> play) which is where the old
 * `triangles.mp3` startup delay came from — especially visible on the 3 MB
 * fallback file versus the ~50 KB d1/d2/d3 clicks.
 *
 * The Web Audio context is created with `latencyHint: 'interactive'` and
 * resumed on the earliest gesture, so by the time the boot start button fires
 * the clock is already running and `start(0)` sounds on the next render
 * quantum. Unbuffered / unsupported environments fall back to the previous
 * HTMLAudio loop and warm the buffer in the background for next time.
 */

/** Bundled fallback menu track served from `public/sounds/`. */
export const MENU_FALLBACK_TRACK = '/sounds/triangles.mp3';

/**
 * Legacy uniform random pool picker, retained for compatibility.
 * Index 0 is the bundled fallback track; indices 1..poolSize-1 are songs.
 * The start-button track no longer rolls randomly; see `launchMenuTrack.ts`.
 */
export function pickMenuMusicIndex(poolSize: number, rand: () => number = Math.random): number {
  if (!Number.isFinite(poolSize) || poolSize <= 1) return 0;
  const size = Math.floor(poolSize);
  const r = rand();
  const clamped = Number.isFinite(r) ? Math.min(0.999999999, Math.max(0, r)) : 0;
  return Math.min(size - 1, Math.floor(clamped * size));
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.max(0, Math.min(1, volume));
}

function createMenuMusicContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioCtxClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return null;
    try {
      return new AudioCtxClass({ latencyHint: 'interactive' });
    } catch {
      return new AudioCtxClass();
    }
  } catch {
    return null;
  }
}

/** Dedicated low-latency context for menu music (never the gameplay clock). */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Decoded buffers ready for instant `start(0)` playback, keyed by src URL. */
const buffers = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<void>>();
/** Resume offsets (seconds into the loop) so stop()/play() keeps position. */
const resumeOffsets = new Map<string, number>();
let preloaded = false;
let unlockArmed = false;

/**
 * Resume the (suspended) context on the earliest user gesture so it is
 * already running before the boot start button fires. Resume is cheap and
 * safe to call repeatedly; failures never throw out.
 */
function armUnlock(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;
  const resume = (): void => {
    try {
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    } catch {
      /* ignore - play() retries resume synchronously */
    }
  };
  const opts: AddEventListenerOptions = { passive: true };
  window.addEventListener('pointerdown', resume, opts);
  window.addEventListener('keydown', resume, opts);
  window.addEventListener('touchstart', resume, opts);
  window.addEventListener('touchend', resume, opts);
  window.addEventListener('mousedown', resume, opts);
}

function ensureContext(): boolean {
  if (ctx && master) return true;
  ctx = createMenuMusicContext();
  if (!ctx) return false;
  try {
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
    return false;
  }
  armUnlock();
  return true;
}

async function warmOne(src: string): Promise<void> {
  const existing = pending.get(src);
  if (existing) {
    await existing;
    return;
  }
  if (!ensureContext() || !ctx) return;
  const task = (async () => {
    try {
      if (buffers.has(src)) return;
      const isBlob = src.startsWith('blob:');
      const res = isBlob
        ? await fetch(src)
        : await fetch(src, { credentials: 'same-origin' });
      if (!res.ok) return;
      const bytes = await res.arrayBuffer();
      // decodeAudioData detaches `bytes`; each src decodes its own copy.
      const current = ctx;
      if (!current) return;
      const decoded = await current.decodeAudioData(bytes);
      buffers.set(src, decoded);
      // Cap the cache: the fallback plus one or two installed songs is all
      // the menu ever needs; evict the oldest entry beyond that.
      if (buffers.size > 3) {
        const oldest = buffers.keys().next().value as string | undefined;
        if (oldest && oldest !== src && oldest !== MENU_FALLBACK_TRACK) {
          buffers.delete(oldest);
          resumeOffsets.delete(oldest);
        }
      }
    } catch {
      /* decode/fetch failure falls back to HTMLAudio at play time */
    } finally {
      pending.delete(src);
    }
  })();
  pending.set(src, task);
  await task;
}

/**
 * Fetch + decode a menu track in the background so a later `play()` hits the
 * instant Web Audio path. Safe to call repeatedly; resolves when the buffer
 * is ready (or when buffering is impossible).
 */
export function warmMenuMusic(src: string): Promise<void> {
  try {
    if (!src || typeof window === 'undefined') return Promise.resolve();
    if (buffers.has(src)) return Promise.resolve();
    return warmOne(src);
  } catch {
    return Promise.resolve();
  }
}

/**
 * Fetch + decode the bundled fallback track immediately.
 * Safe to call multiple times; subsequent calls are no-ops.
 * Call this as early as possible (main.tsx) so the boot start button is instant.
 */
export function preloadMenuMusic(): void {
  try {
    if (preloaded || typeof window === 'undefined') return;
    preloaded = true;
    if (!ensureContext()) return; // No Web Audio: play() uses the HTMLAudio fallback.
    void warmOne(MENU_FALLBACK_TRACK);
  } catch {
    /* never break startup because of music */
  }
}

class MenuMusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private src: string | null = null;
  private bufferedSrc: string | null = null;
  private bufferedSource: AudioBufferSourceNode | null = null;
  /** ctx.currentTime when the current loop started (for resume offsets). */
  private loopStartCtxTime = 0;
  /** Buffer offset (seconds) the current loop started at. */
  private loopStartOffsetSec = 0;
  private unlockArmed = false;

  public getCurrentSrc(): string | null {
    return this.bufferedSrc ?? this.src;
  }

  public isPlaying(): boolean {
    if (this.bufferedSource && this.bufferedSrc) return true;
    return !!this.audio && !this.audio.paused;
  }

  private armAutoplayUnlock(): void {
    if (this.unlockArmed || typeof window === 'undefined') return;
    this.unlockArmed = true;
    const retry = () => {
      this.unlockArmed = false;
      const a = this.audio;
      if (!a || !a.paused) return;
      a.play().catch(() => {
        this.armAutoplayUnlock();
      });
    };
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener('pointerdown', retry, opts);
    window.addEventListener('keydown', retry, opts);
    window.addEventListener('touchstart', retry, opts);
    window.addEventListener('touchend', retry, opts);
    window.addEventListener('mousedown', retry, opts);
  }

  private stopBuffered(): void {
    const source = this.bufferedSource;
    const src = this.bufferedSrc;
    this.bufferedSource = null;
    this.bufferedSrc = null;
    if (!source) return;
    try {
      // Remember where the loop was so play() resumes instead of restarting.
      if (src && ctx) {
        const buffer = buffers.get(src);
        if (buffer && buffer.duration > 0) {
          const elapsed = Math.max(0, ctx.currentTime - this.loopStartCtxTime);
          resumeOffsets.set(src, (this.loopStartOffsetSec + elapsed) % buffer.duration);
        }
      }
    } catch {
      /* offset bookkeeping must never break stop() */
    }
    try {
      source.onended = null;
      source.stop();
    } catch {
      /* already stopped */
    }
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
  }

  private stopFallback(): void {
    const a = this.audio;
    if (!a) return;
    try {
      a.pause();
    } catch {
      /* noop */
    }
  }

  /** Synchronous instant start when the src is already decoded. */
  private playBuffered(src: string, target: number): boolean {
    try {
      const buffer = buffers.get(src);
      if (!ctx || !master || !buffer) return false;
      if (ctx.state === 'suspended') void ctx.resume();
      this.stopFallback();
      // Same buffered track already looping: just apply the volume.
      if (this.bufferedSource && this.bufferedSrc === src) {
        try {
          master.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
        } catch {
          master.gain.value = target;
        }
        return true;
      }
      this.stopBuffered();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = 0;
      try {
        source.loopEnd = buffer.duration;
      } catch {
        /* some browsers ignore loopEnd - default full-buffer loop applies */
      }
      source.connect(master);
      let offset = resumeOffsets.get(src) ?? 0;
      if (!Number.isFinite(offset) || offset < 0 || offset >= buffer.duration) offset = 0;
      try {
        master.gain.setTargetAtTime(target, ctx.currentTime, 0.015);
      } catch {
        master.gain.value = target;
      }
      try {
        // start(0) = play on the next render quantum: lowest possible latency.
        // `offset` only resumes a paused loop; a fresh track starts at 0.
        if (offset > 0) source.start(0, offset);
        else source.start(0);
      } catch {
        try {
          source.disconnect();
        } catch {
          /* noop */
        }
        return false;
      }
      this.bufferedSource = source;
      this.bufferedSrc = src;
      this.loopStartCtxTime = ctx.currentTime;
      this.loopStartOffsetSec = offset;
      source.onended = () => {
        if (this.bufferedSource === source) {
          this.bufferedSource = null;
          this.bufferedSrc = null;
        }
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
      };
      return true;
    } catch {
      return false;
    }
  }

  /** Fallback when Web Audio is missing or the buffer isn't decoded yet. */
  private playFallback(src: string, target: number): void {
    if (this.audio && this.src === src) {
      this.audio.volume = target;
      if (this.audio.paused) {
        this.audio.play().catch(() => this.armAutoplayUnlock());
      }
      return;
    }

    this.stopBuffered();
    this.stopFallback();
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.loop = true;
      a.volume = target;
      this.audio = a;
      this.src = src;
      a.src = src;
      a.play().catch(() => this.armAutoplayUnlock());
    } catch {
      this.audio = null;
      this.src = null;
    }
  }

  /** Start (or resume) the given track, looping until stopped. */
  public play(src: string, volume: number): void {
    if (!src || typeof window === 'undefined' || typeof Audio === 'undefined') return;
    const target = clampVolume(volume);

    if (this.playBuffered(src, target)) return;
    // Warm the buffer in the background so the *next* play() is instant,
    // while this press still makes sound via the HTMLAudio fallback.
    void warmMenuMusic(src);
    this.playFallback(src, target);
  }

  public setVolume(volume: number): void {
    const target = clampVolume(volume);
    try {
      if (this.bufferedSource && this.bufferedSrc && ctx && master) {
        try {
          master.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
        } catch {
          master.gain.value = target;
        }
        return;
      }
    } catch {
      /* fall through to the fallback element */
    }
    if (this.audio) {
      this.audio.volume = target;
    }
  }

  /** Pause menu music (keeps the track so returning to the menu resumes). */
  public stop(): void {
    this.stopBuffered();
    this.stopFallback();
  }

  /** Fully release the menu music element (e.g. permanent teardown). */
  public release(): void {
    this.stopBuffered();
    resumeOffsets.clear();
    const a = this.audio;
    this.audio = null;
    this.src = null;
    if (!a) return;
    try {
      a.pause();
    } catch {
      /* noop */
    }
    try {
      a.removeAttribute('src');
      a.load();
    } catch {
      /* noop */
    }
  }
}

export const menuMusic = new MenuMusicPlayer();
