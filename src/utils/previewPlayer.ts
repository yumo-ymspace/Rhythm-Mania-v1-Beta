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
 * Song preview for the Song Select screen.
 * Intentionally independent of the gameplay AudioEngine so previews never
 * disturb the Web Audio gameplay clock.
 *
 * Low-latency path (same approach as the menu clicks in `menuSounds.ts`):
 * each track is fetched + decoded to an AudioBuffer ahead of time, then
 * started with a synchronous `source.start(0, previewOffset)` on the
 * selection — no HTMLAudio fetch/demux/metadata/seek round-trip, and a
 * short 150ms fade-in instead of the old 600ms ramp. Tracks that haven't
 * finished decoding fall back to an HTMLAudio element while the buffer
 * warms in the background, so the next play of the same track is instant.
 */

const PREVIEW_BUFFER_CACHE_SIZE = 3;
const PREVIEW_FADE_IN_SEC = 0.15;
const PREVIEW_FADE_OUT_SEC = 0.2;
const PREVIEW_FALLBACK_FADE_IN_MS = 250;

function createPreviewContext(): AudioContext | null {
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

function clampPreviewVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.max(0, Math.min(1, volume));
}

class PreviewPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Decoded preview buffers ready for instant `start(0, offset)`, keyed by src URL. */
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private bufferedSource: AudioBufferSourceNode | null = null;
  private bufferedSrc: string | null = null;
  /** ctx.currentTime when the current buffered loop started (for position reads). */
  private loopStartCtxTime = 0;
  /** Buffer offset (seconds) the current buffered loop started at. */
  private loopStartOffsetSec = 0;
  private unlockArmed = false;

  private audio: HTMLAudioElement | null = null;
  private src: string | null = null;
  private previewStartSec = 0;
  private targetVolume = 0;
  private fadeTimer: number | null = null;
  /** Frozen readout captured on stop() so the panel keeps showing the
      pause position instead of snapping back to zero. */
  private frozenTime: number | null = null;
  private frozenDuration: number | null = null;
  /** Seek targets set while paused, consumed by the next play() of that src. */
  private pendingOffsets = new Map<string, number>();

  private clearFade(): void {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  /**
   * Resume the (suspended) context on the earliest user gesture so it is
   * already running before the first preview starts. Resume is cheap and
   * safe to call repeatedly; failures never throw out.
   */
  private armUnlock(): void {
    if (this.unlockArmed || typeof window === 'undefined') return;
    this.unlockArmed = true;
    const resume = (): void => {
      try {
        if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      } catch {
        /* ignore - play() retries resume synchronously */
      }
    };
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('pointerdown', resume, opts);
    window.addEventListener('keydown', resume, opts);
    window.addEventListener('touchstart', resume, opts);
    window.addEventListener('touchend', resume, opts);
  }

  private ensureContext(): boolean {
    if (this.ctx && this.master) return true;
    this.ctx = createPreviewContext();
    if (!this.ctx) return false;
    try {
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.master = null;
      return false;
    }
    this.armUnlock();
    return true;
  }

  /**
   * Fetch + decode a preview track in the background. Resolves with the
   * buffer (or null when buffering is impossible). Repeat calls for the
   * same src share one in-flight decode.
   */
  public warm(src: string): Promise<AudioBuffer | null> {
    try {
      if (!src || typeof window === 'undefined') return Promise.resolve(null);
      const cached = this.buffers.get(src);
      if (cached) return Promise.resolve(cached);
      const inflight = this.pending.get(src);
      if (inflight) return inflight;
      if (!this.ensureContext() || !this.ctx) return Promise.resolve(null);
      const task = (async (): Promise<AudioBuffer | null> => {
        try {
          const current = this.ctx;
          if (!current) return null;
          const isBlob = src.startsWith('blob:');
          const res = isBlob
            ? await fetch(src)
            : await fetch(src, { credentials: 'same-origin' });
          if (!res.ok) return null;
          const bytes = await res.arrayBuffer();
          const decoded = await current.decodeAudioData(bytes);
          this.buffers.set(src, decoded);
          // Bound memory: full-song buffers are large; evict the oldest
          // entry beyond the cap (never the track currently playing).
          if (this.buffers.size > PREVIEW_BUFFER_CACHE_SIZE) {
            for (const key of this.buffers.keys()) {
              if (key !== src && key !== this.bufferedSrc) {
                this.buffers.delete(key);
                break;
              }
            }
          }
          return decoded;
        } catch {
          return null;
        } finally {
          this.pending.delete(src);
        }
      })();
      this.pending.set(src, task);
      return task;
    } catch {
      return Promise.resolve(null);
    }
  }

  /** Clamp the requested preview offset into the track, defaulting to 40%. */
  private resolvePreviewOffset(durationSec: number, previewTimeMs: number): number {
    let start = Math.max(0, previewTimeMs / 1000);
    if (!Number.isFinite(start)) start = 0;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return start;
    if (start <= 0 || start >= durationSec - 1) return durationSec * 0.4;
    return Math.min(start, Math.max(0, durationSec - 0.5));
  }

  private stopBuffered(fadeOut: boolean): void {
    const source = this.bufferedSource;
    const src = this.bufferedSrc;
    this.bufferedSource = null;
    this.bufferedSrc = null;
    if (!source) return;
    try {
      source.onended = null;
      if (fadeOut && this.ctx && this.master && src) {
        const t = this.ctx.currentTime;
        try {
          this.master.gain.cancelScheduledValues(t);
          this.master.gain.setValueAtTime(Math.max(0, this.master.gain.value), t);
          this.master.gain.linearRampToValueAtTime(0, t + PREVIEW_FADE_OUT_SEC);
        } catch {
          /* fall through to an immediate stop */
        }
        const stale = source;
        window.setTimeout(() => {
          try { stale.stop(); } catch { /* already stopped */ }
          try { stale.disconnect(); } catch { /* ignore */ }
        }, PREVIEW_FADE_OUT_SEC * 1000 + 50);
      } else {
        try { source.stop(); } catch { /* already stopped */ }
        try { source.disconnect(); } catch { /* ignore */ }
      }
    } catch {
      /* stop must never throw out of the preview handoff */
    }
  }

  private stopFallback(): void {
    const a = this.audio;
    this.audio = null;
    this.src = null;
    if (a) this.releaseElement(a);
  }

  /** Synchronous instant start when the src is already decoded. */
  private playBuffered(src: string, previewTimeMs: number, volume: number): boolean {
    try {
      const buffer = this.buffers.get(src);
      if (!this.ctx || !this.master || !buffer) return false;
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      // Same track already previewing: just apply the volume.
      if (this.bufferedSource && this.bufferedSrc === src) {
        try {
          this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
        } catch {
          this.master.gain.value = volume;
        }
        return true;
      }
      this.stopFallback();
      this.stopBuffered(false);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      // Loop from the preview point like the old HTMLAudio `ended` handler.
      source.loop = true;
      const offset = this.resolvePreviewOffset(buffer.duration, previewTimeMs);
      try {
        source.loopStart = offset;
      } catch {
        /* some browsers ignore loopStart - playback still starts at offset */
      }
      source.connect(this.master);
      const t = this.ctx.currentTime;
      try {
        // start(0) = play on the next render quantum: lowest possible
        // latency. Short fade-in avoids a click without the old 600ms ramp.
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(0, t);
        this.master.gain.linearRampToValueAtTime(volume, t + PREVIEW_FADE_IN_SEC);
      } catch {
        this.master.gain.value = volume;
      }
      try {
        source.start(0, offset);
      } catch {
        try { source.disconnect(); } catch { /* noop */ }
        return false;
      }
      this.bufferedSource = source;
      this.bufferedSrc = src;
      this.loopStartCtxTime = this.ctx.currentTime;
      this.loopStartOffsetSec = offset;
      source.onended = () => {
        if (this.bufferedSource === source) {
          this.bufferedSource = null;
          this.bufferedSrc = null;
        }
        try { source.disconnect(); } catch { /* ignore */ }
      };
      return true;
    } catch {
      return false;
    }
  }

  private fadeTo(target: number, durationMs: number, onDone?: () => void): void {
    this.clearFade();
    const a = this.audio;
    if (!a) { onDone?.(); return; }
    const start = a.volume;
    const steps = Math.max(1, Math.round(durationMs / 50));
    let i = 0;
    this.fadeTimer = window.setInterval(() => {
      i++;
      const t = Math.min(1, i / steps);
      if (this.audio) {
        this.audio.volume = Math.max(0, Math.min(1, start + (target - start) * t));
      }
      if (i >= steps) {
        this.clearFade();
        onDone?.();
      }
    }, 50);
  }

  private releaseElement(a: HTMLAudioElement): void {
    try { a.pause(); } catch { /* noop */ }
    a.removeAttribute('src');
    try { a.load(); } catch { /* noop */ }
  }

  /** Fallback when Web Audio is missing or the buffer isn't decoded yet. */
  private playFallback(src: string, previewTimeMs: number, volume: number): void {
    if (this.audio && this.src === src) {
      this.fadeTo(volume, 200);
      this.audio.play().catch(() => { /* autoplay blocked */ });
      return;
    }

    this.stopBuffered(false);
    if (this.audio) {
      this.releaseElement(this.audio);
      this.audio = null;
      this.src = null;
    }
    this.clearFade();

    const a = new Audio();
    a.preload = 'auto';
    a.volume = 0;
    this.audio = a;
    this.src = src;

    const begin = () => {
      if (this.audio !== a) return;
      const dur = a.duration;
      const start = this.resolvePreviewOffset(
        Number.isFinite(dur) ? dur : NaN,
        previewTimeMs,
      );
      this.previewStartSec = start;
      try { a.currentTime = start; } catch { /* noop */ }
      a.play()
        .then(() => { if (this.audio === a) this.fadeTo(this.targetVolume, PREVIEW_FALLBACK_FADE_IN_MS); })
        .catch(() => { /* autoplay blocked */ });
    };

    a.addEventListener('loadedmetadata', begin, { once: true });
    a.addEventListener('ended', () => {
      if (this.audio !== a) return;
      try { a.currentTime = this.previewStartSec; } catch { /* noop */ }
      a.play().catch(() => { /* noop */ });
    });
    a.addEventListener('error', () => {
      if (this.audio !== a) return;
      this.releaseElement(a);
      this.audio = null;
      this.src = null;
    });
    a.src = src;
    if (a.readyState >= 1) begin();
  }

  /** Start (or continue) previewing a track. */
  public play(src: string, previewTimeMs: number, volume: number): void {
    if (!src || typeof window === 'undefined') return;
    const target = clampPreviewVolume(volume);
    this.targetVolume = target;
    this.frozenTime = null;
    this.frozenDuration = null;

    // A paused seek for this src wins over the default preview point.
    const pending = this.pendingOffsets.get(src);
    if (pending !== undefined) {
      this.pendingOffsets.delete(src);
      previewTimeMs = pending * 1000;
    }

    if (this.playBuffered(src, previewTimeMs, target)) return;
    // Warm the buffer in the background so the *next* play() is instant,
    // while this selection still makes sound via the HTMLAudio fallback.
    void this.warm(src);
    this.playFallback(src, previewTimeMs, target);
  }

  public setVolume(volume: number): void {
    const target = clampPreviewVolume(volume);
    this.targetVolume = target;
    try {
      if (this.bufferedSource && this.bufferedSrc && this.ctx && this.master) {
        try {
          this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
        } catch {
          this.master.gain.value = target;
        }
        return;
      }
    } catch {
      /* fall through to the fallback element */
    }
    if (this.audio && !this.audio.paused) this.fadeTo(target, 150);
  }

  /** Whether a preview track is currently audible (buffered or fallback). */
  public isPlaying(): boolean {
    if (this.bufferedSource && this.bufferedSrc) return true;
    return !!this.audio && !this.audio.paused;
  }

  private readLiveTime(): number | null {
    try {
      if (this.bufferedSource && this.bufferedSrc && this.ctx) {
        const buffer = this.buffers.get(this.bufferedSrc);
        const duration = buffer?.duration;
        if (!duration || !Number.isFinite(duration) || duration <= 0) return null;
        const elapsed = Math.max(0, this.ctx.currentTime - this.loopStartCtxTime);
        return (this.loopStartOffsetSec + elapsed) % duration;
      }
    } catch {
      /* fall through to the fallback element */
    }
    try {
      if (this.audio) {
        const t = this.audio.currentTime;
        if (typeof t === 'number' && Number.isFinite(t) && t >= 0) return t;
      }
    } catch {
      /* unknown position */
    }
    return null;
  }

  private readLiveDuration(): number | null {
    try {
      if (this.bufferedSrc) {
        const buffer = this.buffers.get(this.bufferedSrc);
        if (buffer && Number.isFinite(buffer.duration)) return buffer.duration;
      }
    } catch {
      /* fall through to the fallback element */
    }
    try {
      if (this.audio) {
        const dur = this.audio.duration;
        if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) return dur;
      }
    } catch {
      /* unknown duration */
    }
    return null;
  }

  /** Length of the current preview track in seconds (frozen pause value when idle). */
  public getDuration(): number {
    return this.readLiveDuration() ?? this.frozenDuration ?? 0;
  }

  /** Playback position in seconds (frozen pause value when idle). */
  public getCurrentTime(): number {
    return this.readLiveTime() ?? this.frozenTime ?? 0;
  }

  private freezePosition(): void {
    try {
      const liveTime = this.readLiveTime();
      if (liveTime !== null) this.frozenTime = liveTime;
      const liveDuration = this.readLiveDuration();
      if (liveDuration !== null) this.frozenDuration = liveDuration;
    } catch {
      /* freezing must never break stop() */
    }
  }

  /**
   * Set the resume position for `src` while paused (no audible playback).
   * The next play() of that src starts from `seconds`; the frozen readout
   * updates at once so the progress bar follows while paused.
   */
  public seekPaused(src: string, seconds: number): void {
    if (!src || !Number.isFinite(seconds)) return;
    try {
      const buffer = this.buffers.get(src);
      const duration = buffer && Number.isFinite(buffer.duration) ? buffer.duration : NaN;
      const target = Number.isFinite(duration) && duration > 0
        ? Math.max(0, Math.min(seconds, Math.max(0, duration - 0.05)))
        : Math.max(0, seconds);
      this.pendingOffsets.set(src, target);
      this.frozenTime = target;
      if (Number.isFinite(duration) && duration > 0) this.frozenDuration = duration;
    } catch {
      /* seek must never throw out of the now-playing handoff */
    }
    void this.warm(src);
  }

  /**
   * Seek the current preview track to `seconds` (clamped into the track).
   * Buffered loops restart at the offset; the fallback element seeks directly.
   * No-op when nothing is playing.
   */
  public seekTo(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    try {
      if (this.bufferedSource && this.bufferedSrc && this.ctx && this.master) {
        const buffer = this.buffers.get(this.bufferedSrc);
        if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) return;
        const offset = Math.max(0, Math.min(seconds, Math.max(0, buffer.duration - 0.05)));
        const src = this.bufferedSrc;
        const volume = this.master.gain.value;
        this.stopBuffered(false);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        try {
          source.loopStart = offset;
        } catch {
          /* some browsers ignore loopStart - playback still starts at offset */
        }
        source.connect(this.master);
        try {
          source.start(0, offset);
        } catch {
          try { source.disconnect(); } catch { /* noop */ }
          return;
        }
        this.bufferedSource = source;
        this.bufferedSrc = src;
        this.loopStartCtxTime = this.ctx.currentTime;
        this.loopStartOffsetSec = offset;
        try {
          this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
        } catch {
          this.master.gain.value = volume;
        }
        const active = source;
        source.onended = () => {
          if (this.bufferedSource === active) {
            this.bufferedSource = null;
            this.bufferedSrc = null;
          }
          try { active.disconnect(); } catch { /* ignore */ }
        };
        return;
      }
    } catch {
      /* fall through to the fallback element */
    }
    try {
      const a = this.audio;
      if (!a) return;
      const dur = a.duration;
      const max = Number.isFinite(dur) && dur > 0 ? dur : seconds;
      a.currentTime = Math.max(0, Math.min(seconds, Math.max(0, max - 0.05)));
    } catch {
      /* seek must never throw out of the now-playing handoff */
    }
  }

  /** Fade out and release the current preview (freezes the readout for pause display). */
  public stop(): void {
    this.freezePosition();
    const a = this.audio;
    if (this.bufferedSource) {
      this.stopBuffered(true);
    }
    if (!a) return;
    this.fadeTo(0, 300, () => {
      this.releaseElement(a);
      if (this.audio === a) {
        this.audio = null;
        this.src = null;
      }
    });
  }

  /** Stop synchronously before handing audio focus to gameplay (freezes the readout). */
  public stopImmediately(): void {
    this.freezePosition();
    const a = this.audio;
    this.clearFade();
    this.stopBuffered(false);
    this.audio = null;
    this.src = null;
    if (a) this.releaseElement(a);
  }
}

export const previewPlayer = new PreviewPlayer();
