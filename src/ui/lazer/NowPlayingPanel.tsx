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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CirclePause as PauseCircleIcon,
  CirclePlay as PlayCircleIcon,
  ListMusic as PlaylistIcon,
  Shuffle as ShuffleIcon,
  SkipBack as PrevIcon,
  SkipForward as NextIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { LAZER_DURATION, LAZER_EASE_OUT_QUINT } from './motion';
import { sanitizeCssUrl } from '../../utils/securityLimits';
import type { NowPlayingTrack } from '../../utils/nowPlaying';

export interface NowPlayingPanelProps {
  /** Resolved track, or null before anything has played (panel shows blank, controls disabled). */
  track: NowPlayingTrack | null;
  /** Whether the owning player is currently audible. */
  isPlaying: boolean;
  /** Playback position in seconds (display only; ignored while seeking). */
  currentTime: number;
  /** Track length in seconds (0 when unknown — bar renders indeterminate). */
  duration: number;
  /** Shuffle mode for next/previous picks. */
  shuffle: boolean;
  /** False during gameplay/results (mirrors lazer AllowTrackControl=false). */
  controlsEnabled: boolean;
  onToggleShuffle: () => void;
  onPrevious: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  /** Committed seek target in seconds (drag end / click / keyboard). */
  onSeek: (seconds: number) => void;
  onClosePlaylistSoon?: () => void;
  /** Hover intent for the App-level hover-to-open (button or panel keeps it alive). */
  onHoverChange?: (hovering: boolean) => void;
  /** Inline positioning (App centres the panel on the toolbar button). */
  style?: React.CSSProperties;
}

function progressRatio(currentTime: number, duration: number): number {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, currentTime / duration));
}

/**
 * Now Playing player bar, mirroring osu!lazer's `NowPlayingOverlay` player
 * section (400x130 art-backed card, title/artist top-right, shuffle left,
 * prev/play/next centre, playlist toggle right, yellow seekable progress
 * along the bottom). The scrolling lazer playlist itself is deferred — the
 * playlist button stays as a disabled coming-soon slot.
 */
export const NowPlayingPanel: React.FC<NowPlayingPanelProps> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  shuffle,
  controlsEnabled,
  onToggleShuffle,
  onPrevious,
  onTogglePlay,
  onNext,
  onSeek,
  onClosePlaylistSoon,
  onHoverChange,
  style,
}) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [seekRatio, setSeekRatio] = useState<number | null>(null);
  const seekingRef = useRef(false);
  // Displayed fill ratio, eased toward the target every frame so a pressed
  // point glides over instead of jumping or chasing the poll updates.
  const [displayRatio, setDisplayRatio] = useState(0);
  const displayRef = useRef(0);
  const targetRef = useRef(0);
  const pollRef = useRef({ currentTime: 0, duration: 0 });
  pollRef.current = {
    currentTime: Number.isFinite(currentTime) ? currentTime : 0,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
  };
  // Committed seek the polled position hasn't caught up to yet: hold the
  // target so the fill doesn't glide back to the stale value mid-flight.
  const commitRef = useRef<{ ratio: number; at: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const poll = pollRef.current;
      let target: number;
      if (seekingRef.current) {
        target = targetRef.current;
      } else {
        const commit = commitRef.current;
        const polled = poll.duration > 0 ? progressRatio(poll.currentTime, poll.duration) : 0;
        if (commit && (performance.now() - commit.at > 1200 || Math.abs(polled - commit.ratio) < 0.003)) {
          commitRef.current = null;
          target = polled;
        } else {
          target = commit ? commit.ratio : polled;
        }
      }
      targetRef.current = target;
      const cur = displayRef.current;
      const diff = target - cur;
      if (Math.abs(diff) < 0.0008) {
        if (cur !== target) {
          displayRef.current = target;
          setDisplayRatio(target);
        }
        return;
      }
      const next = cur + diff * 0.22;
      displayRef.current = next;
      setDisplayRatio(next);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // If the track identity changes mid-drag, drop the stale drag position.
  const trackKey = track ? `${track.kind}:${track.src}` : 'none';
  useEffect(() => {
    seekingRef.current = false;
    setSeekRatio(null);
  }, [trackKey]);

  const ratioToSeconds = useCallback((ratio: number): number => {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    return Math.max(0, Math.min(ratio, 1)) * safeDuration;
  }, [duration]);

  const ratioFromPointer = useCallback((clientX: number): number | null => {
    const bar = barRef.current;
    if (!bar) return null;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleBarPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!controlsEnabled || !track) return;
    const ratio = ratioFromPointer(e.clientX);
    if (ratio === null) return;
    seekingRef.current = true;
    setSeekRatio(ratio);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
  }, [controlsEnabled, track, ratioFromPointer]);

  const handleBarPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!seekingRef.current) return;
    const ratio = ratioFromPointer(e.clientX);
    if (ratio === null) return;
    // Direct manipulation follows the pointer exactly; a plain press (no
    // move) glides over via the eased display loop instead.
    setSeekRatio(ratio);
    targetRef.current = ratio;
    displayRef.current = ratio;
    setDisplayRatio(ratio);
  }, [ratioFromPointer]);

  const commitSeek = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!seekingRef.current) return;
    const ratio = ratioFromPointer(e.clientX) ?? seekRatio;
    seekingRef.current = false;
    setSeekRatio(null);
    if (ratio === null || !Number.isFinite(duration) || duration <= 0) return;
    commitRef.current = { ratio, at: performance.now() };
    onSeek(ratioToSeconds(ratio));
  }, [ratioFromPointer, seekRatio, duration, ratioToSeconds, onSeek]);

  const handleBarKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!controlsEnabled || !track || !Number.isFinite(duration) || duration <= 0) return;
    const step = duration * 0.02;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const base = Number.isFinite(currentTime) ? currentTime : 0;
      onSeek(Math.max(0, Math.min(duration, base + (e.key === 'ArrowRight' ? step : -step))));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onSeek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onSeek(duration);
    }
  }, [controlsEnabled, track, duration, currentTime, onSeek]);

  const title = track?.title || 'Nothing Playing Now!';
  const artist = track?.artist || '';
  const hasDuration = Number.isFinite(duration) && duration > 0;

  return (
    <motion.div
      id="now-playing-panel"
      className="lazer-now-playing"
      role="region"
      aria-label="Now playing"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: LAZER_DURATION.overlay, ease: LAZER_EASE_OUT_QUINT }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      style={style}
    >
      <div className="lazer-now-playing-art" aria-hidden="true">
        {track?.bgUrl ? (
          <img src={sanitizeCssUrl(track.bgUrl, '') || undefined} alt="" draggable={false} />
        ) : null}
        <div className="lazer-now-playing-art-dim" />
      </div>

      <div className="lazer-now-playing-meta">
        <div className="lazer-now-playing-title" title={title}>{title}</div>
        <div className="lazer-now-playing-artist" title={artist}>{artist}</div>
      </div>

      <div className="lazer-now-playing-controls">
        <button
          type="button"
          className={`lazer-now-playing-btn${shuffle ? ' is-on' : ''}`}
          aria-label="Shuffle"
          aria-pressed={shuffle}
          disabled={!controlsEnabled || !track}
          onClick={onToggleShuffle}
        >
          <ShuffleIcon className="lazer-now-playing-icon" />
        </button>

        <div className="lazer-now-playing-transport">
          <button
            type="button"
            className="lazer-now-playing-btn"
            aria-label="Previous track"
            disabled={!controlsEnabled || !track}
            onClick={onPrevious}
          >
            <PrevIcon className="lazer-now-playing-icon" />
          </button>
          <button
            type="button"
            className="lazer-now-playing-btn is-play"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            disabled={!controlsEnabled || !track}
            onClick={onTogglePlay}
          >
            {isPlaying
              ? <PauseCircleIcon className="lazer-now-playing-icon is-play-icon" />
              : <PlayCircleIcon className="lazer-now-playing-icon is-play-icon" />}
          </button>
          <button
            type="button"
            className="lazer-now-playing-btn"
            aria-label="Next track"
            disabled={!controlsEnabled || !track}
            onClick={onNext}
          >
            <NextIcon className="lazer-now-playing-icon" />
          </button>
        </div>

        <button
          type="button"
          className="lazer-now-playing-btn is-future"
          aria-label="Playlist (coming soon)"
          aria-disabled="true"
          onClick={onClosePlaylistSoon}
        >
          <PlaylistIcon className="lazer-now-playing-icon" />
        </button>
      </div>

      <div
        ref={barRef}
        className="lazer-now-playing-progress"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={hasDuration ? Math.round(duration) : 0}
        aria-valuenow={hasDuration ? Math.round(seekRatio !== null ? ratioToSeconds(seekRatio) : currentTime) : 0}
        tabIndex={controlsEnabled && track && hasDuration ? 0 : -1}
        onPointerDown={handleBarPointerDown}
        onPointerMove={handleBarPointerMove}
        onPointerUp={commitSeek}
        onPointerCancel={() => {
          seekingRef.current = false;
          setSeekRatio(null);
        }}
        onKeyDown={handleBarKeyDown}
      >
        <div className="lazer-now-playing-progress-track">
          <div
            className="lazer-now-playing-progress-fill"
            style={{ width: `${displayRatio * 100}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
};
