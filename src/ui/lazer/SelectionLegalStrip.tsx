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

export const TERMS_URL = 'https://terms-of-service.rhythm-mania.com';
export const PRIVACY_URL = 'https://privacy-policy.rhythm-mania.com';

export type SelectionLegalStripProps = {
  /** Extra classes for positioning (e.g. fixed above the song-select footer). */
  className?: string;
};

/**
 * Shared legal strip for the selection surfaces (Song Select + mirror
 * Beatmap Listing). Left: non-affiliation / content-ownership note.
 * Right: terms + privacy acceptance with hyperlinks.
 */
export function SelectionLegalStrip({ className = '' }: SelectionLegalStripProps) {
  return (
    <div
      className={`pointer-events-none flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-3 py-1 text-[10px] leading-4 text-white/40 ${className}`}
    >
      <span className="min-w-0">
        Not affiliated with ppy / osu!. All beatmaps/music belong to their mappers/artists.
      </span>
      <span className="min-w-0">
        By using RhythmMania you acknowledge and accept the{' '}
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto underline decoration-white/30 underline-offset-2 transition-colors hover:text-white/80"
        >
          terms and conditions
        </a>{' '}
        and{' '}
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto underline decoration-white/30 underline-offset-2 transition-colors hover:text-white/80"
        >
          privacy policy
        </a>
        .
      </span>
    </div>
  );
}
