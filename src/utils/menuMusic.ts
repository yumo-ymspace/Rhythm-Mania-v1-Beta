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
 * - With no beatmaps installed, the menu loops `triangles.mp3`.
 * - With beatmaps installed, launch picks uniformly at random between
 *   `triangles.mp3` (pool index 0) and every installed song.
 *
 * Uses plain HTMLAudio so menu music never disturbs the Web Audio gameplay
 * clock or the Song Select preview player. Autoplay rejections (browser
 * autoplay policy) are retried on the next user gesture instead of throwing.
 */

/** Bundled fallback menu track served from `public/sounds/`. */
export const MENU_FALLBACK_TRACK = '/sounds/triangles.mp3';

/**
 * Pick a uniform random pool index for launch menu music.
 * Index 0 is the bundled fallback track; indices 1..poolSize-1 are songs.
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

class MenuMusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private src: string | null = null;
  private unlockArmed = false;

  public getCurrentSrc(): string | null {
    return this.src;
  }

  public isPlaying(): boolean {
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

  /** Start (or resume) the given track, looping until stopped. */
  public play(src: string, volume: number): void {
    if (!src || typeof window === 'undefined' || typeof Audio === 'undefined') return;
    const target = clampVolume(volume);

    if (this.audio && this.src === src) {
      this.audio.volume = target;
      if (this.audio.paused) {
        this.audio.play().catch(() => this.armAutoplayUnlock());
      }
      return;
    }

    this.stop();
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

  public setVolume(volume: number): void {
    if (this.audio) {
      this.audio.volume = clampVolume(volume);
    }
  }

  /** Pause menu music (keeps the track so returning to the menu resumes). */
  public stop(): void {
    const a = this.audio;
    if (!a) return;
    try {
      a.pause();
    } catch {
      /* noop */
    }
  }

  /** Fully release the menu music element (e.g. permanent teardown). */
  public release(): void {
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
