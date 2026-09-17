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

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Info } from 'lucide-react';
import { Beatmap, PlayHistoryRecord } from '../../types';
import { sanitizeCssUrl } from '../../utils/securityLimits';

export interface CarouselSongGroup {
  songKey: string;
  title: string;
  artist: string;
  creator?: string;
  coverUrl?: string;
  packageId?: string;
  bgUrl?: string;
  difficultiesSummary?: string[];
  maps: Beatmap[];
}

export interface CarouselCenterSignal {
  /** songKey of the group to centre. */
  key: string;
  /** Increment to trigger a new one-time centre, even for the same key. */
  nonce: number;
}

export interface SongSelectCarouselProps {
  songGroups: CarouselSongGroup[];
  selectedGroupKey?: string;
  expandedSongKey?: string;
  selectedMapId?: string;
  favoriteSongs: string[];
  playHistory: PlayHistoryRecord[];
  onSelectGroup: (group: CarouselSongGroup) => void;
  onSelectDifficulty: (map: Beatmap) => void;
  onStartPlay: (map: Beatmap) => void;
  onToggleFavorite: (songKey: string) => void;
  getStarRating: (map: Beatmap) => number;
  getDifficultyColor: (rating: number) => string;
  getGradeBadgeClass: (grade: string) => string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  activeItemRef?: React.RefObject<HTMLDivElement | null>;
  /** One-time "centre this group" request (selection / random / keyboard). */
  centerSignal?: CarouselCenterSignal;
}

const DEFAULT_BANNER = '/backgrounds/Ferineon.webp';

/**
 * Maps difficulty star rating to a 10-dot filled count
 */
function getStarDotCount(starRating: number): number {
  return Math.max(1, Math.min(10, Math.round(starRating)));
}

/**
 * osu!lazer-style difficulty tint. Matches hud/songselect refs:
 * ~0-1.5 blue, 1.5-2.5 teal/green, 2.5-3.5 olive/yellow,
 * 3.5-4.5 orange, 4.5+ pink/red.
 */
export function getDiffTint(starRating: number): { bg: string; edge: string; pill: string } {
  if (starRating < 1.5) return {
    bg: 'linear-gradient(90deg, rgba(56,130,190,0.92) 0%, rgba(43,95,150,0.88) 100%)',
    edge: '#7dd3fc',
    pill: 'bg-sky-950/70 text-sky-200 border border-sky-300/40',
  };
  if (starRating < 2.5) return {
    bg: 'linear-gradient(90deg, rgba(46,160,140,0.92) 0%, rgba(34,120,115,0.88) 100%)',
    edge: '#5eead4',
    pill: 'bg-teal-950/70 text-teal-100 border border-teal-300/40',
  };
  if (starRating < 3.5) return {
    bg: 'linear-gradient(90deg, rgba(150,150,60,0.90) 0%, rgba(110,110,45,0.88) 100%)',
    edge: '#fde047',
    pill: 'bg-yellow-950/70 text-yellow-100 border border-yellow-300/40',
  };
  if (starRating < 4.5) return {
    bg: 'linear-gradient(90deg, rgba(180,120,50,0.92) 0%, rgba(140,90,35,0.88) 100%)',
    edge: '#fdba74',
    pill: 'bg-orange-950/70 text-orange-100 border border-orange-300/40',
  };
  return {
    bg: 'linear-gradient(90deg, rgba(170,60,110,0.92) 0%, rgba(120,40,85,0.88) 100%)',
    edge: '#f9a8d4',
    pill: 'bg-pink-950/70 text-pink-100 border border-pink-300/40',
  };
}

/**
 * Small per-difficulty color dots shown on the set card (hud refs).
 * Same hue ramp as the expanded rows.
 */
function getDiffDotColor(starRating: number): string {
  if (starRating < 1.5) return '#7dd3fc';
  if (starRating < 2.5) return '#5eead4';
  if (starRating < 3.5) return '#fde047';
  if (starRating < 4.5) return '#fdba74';
  return '#f9a8d4';
}

function getGradeCircleClass(grade: string): string {
  switch (grade) {
    case 'SS':
    case 'S':
      return 'bg-amber-300 text-amber-950';
    case 'A':
      return 'bg-emerald-300 text-emerald-950';
    case 'B':
      return 'bg-sky-300 text-sky-950';
    case 'C':
      return 'bg-violet-300 text-violet-950';
    case 'D':
      return 'bg-rose-300 text-rose-950';
    default:
      return 'bg-slate-300 text-slate-800';
  }
}

/**
 * Returns color classes for key count badge dots
 */
function getKeyDotColor(keyCount: number): string {
  switch (keyCount) {
    case 4: return 'bg-cyan-400';
    case 5: return 'bg-emerald-400';
    case 6: return 'bg-amber-400';
    case 7: return 'bg-rose-400';
    case 8: return 'bg-purple-400';
    default: return 'bg-blue-400';
  }
}

/**
 * Returns rank status badge info (Ranked, Loved, Graveyard, or Local)
 */
function getRankStatusBadge(group: CarouselSongGroup): { label: string; bgClass: string } {
  // Check if any map in group is server-approved / catalog map
  const firstMap = group.maps[0];
  if (firstMap) {
    const status = (firstMap as any).rankStatus || (firstMap as any).status;
    if (status) {
      const s = String(status).toLowerCase();
      if (s === 'ranked') return { label: 'RANKED', bgClass: 'lazer-status-pill is-ranked' };
      if (s === 'loved') return { label: 'LOVED', bgClass: 'lazer-status-pill is-loved' };
      if (s === 'graveyard') return { label: 'GRAVEYARD', bgClass: 'lazer-status-pill is-graveyard' };
    }
    if (firstMap.catalogMapId || firstMap.isServerMap) {
      return { label: 'RANKED', bgClass: 'lazer-status-pill is-ranked' };
    }
  }
  return { label: 'LOCAL', bgClass: 'lazer-status-pill is-graveyard' };
}

export function SongSelectCarousel({
  songGroups,
  selectedGroupKey,
  expandedSongKey,
  selectedMapId,
  favoriteSongs,
  playHistory,
  onSelectGroup,
  onSelectDifficulty,
  onStartPlay,
  onToggleFavorite,
  getStarRating,
  getDifficultyColor,
  getGradeBadgeClass,
  containerRef,
  activeItemRef,
  centerSignal,
}: SongSelectCarouselProps) {
  // Viewport carousel taper (osu!lazer-style): every panel's left offset is
  // a continuous function of that panel's own pixel distance from the
  // vertical centre of what is currently on screen — nothing is quantized
  // to index steps, so lengths glide smoothly while scrolling.
  //
  // Length hierarchy (always true, even mid-scroll):
  //   selected group  >  centred non-selected  >  edge non-selected
  // The selected group pins to full width regardless of viewport position;
  // non-selected groups taper from a base indent at the centre out to the
  // max indent at the edges.
  //
  // Performance: indents are written directly to the DOM inside a
  // rAF-throttled scroll handler. No React state per scroll frame, so fast
  // scrolling never re-renders the list. Group centres are cached (offsetTop
  // is scroll-invariant) so the hot path does no layout reads for groups;
  // difficulty rows are measured via getBoundingClientRect (their offsetTop
  // is relative to the group wrapper, not the scroll container, so it must
  // not be compared against the container-space viewport centre).
  const MAX_INDENT_PX = 120;
  const CENTER_INDENT_PX = 36;
  const RANGE_PX = 300;
  const SELECTED_RIGHT_EXTEND_PX = -6;
  // Difficulty-row taper: centred rows longest, edge rows shorter; the
  // selected row stays pinned near banner width above them all.
  const DIFF_BASE_ML_PX = 8;
  const DIFF_BASE_MR_PX = 6;
  const DIFF_SELECTED_ML_PX = -12;
  const DIFF_SELECTED_MR_PX = -2;
  const DIFF_RANGE_PX = 220;
  const DIFF_MAX_EXTRA_PX = 22;

  const focusKey = expandedSongKey || selectedGroupKey;
  let focusIndex = songGroups.findIndex((g) => g.songKey === focusKey);
  if (focusIndex < 0) focusIndex = 0;

  const selectedKeyRef = useRef(selectedGroupKey);
  selectedKeyRef.current = selectedGroupKey;
  const expandedKeyRef = useRef(expandedSongKey);
  expandedKeyRef.current = expandedSongKey;
  const selectedMapIdRef = useRef(selectedMapId);
  selectedMapIdRef.current = selectedMapId;
  const groupsRef = useRef(songGroups);
  groupsRef.current = songGroups;
  const itemEls = useRef(new Map<string, HTMLDivElement>());
  const centersCache = useRef(new Map<string, number>());
  const taperRaf = useRef(0);
  const progScrollRaf = useRef(0);
  // Top/bottom spacers let the first/last group reach the viewport centre,
  // so the centred item is always the longest (edges are never stuck short).
  const [edgeSpacerPx, setEdgeSpacerPx] = React.useState(8);

  const measureCenters = () => {
    const next = new Map<string, number>();
    for (const g of groupsRef.current) {
      const el = itemEls.current.get(g.songKey);
      if (el) next.set(g.songKey, el.offsetTop + el.offsetHeight / 2);
    }
    centersCache.current = next;
  };

  const measureEdgeSpacer = () => {
    const container = containerRef?.current;
    if (!container) return;
    // Half the viewport minus roughly half a banner, so edge groups can be
    // centred exactly by the one-time ScrollToSelection glide.
    const next = Math.max(8, Math.min(420, Math.round(container.clientHeight / 2 - 48)));
    setEdgeSpacerPx((prev) => (prev === next ? prev : next));
  };

  const updateTaper = () => {
    taperRaf.current = 0;
    const container = containerRef?.current;
    if (!container) return;
    const selectedKey = selectedKeyRef.current;
    const viewCenter = container.scrollTop + container.clientHeight / 2;
    for (const g of groupsRef.current) {
      const el = itemEls.current.get(g.songKey);
      if (!el) continue;
      if (g.songKey === selectedKey) {
        // Selected: pinned full-width, always longer than the rest.
        if (el.style.marginLeft !== '0px') el.style.marginLeft = '0px';
        if (el.style.marginRight !== `${SELECTED_RIGHT_EXTEND_PX}px`) el.style.marginRight = `${SELECTED_RIGHT_EXTEND_PX}px`;
        continue;
      }
      let center = centersCache.current.get(g.songKey);
      if (center === undefined) {
        center = el.offsetTop + el.offsetHeight / 2;
        centersCache.current.set(g.songKey, center);
      }
      const t = Math.min(1, Math.abs(center - viewCenter) / RANGE_PX);
      const indent = Math.round(CENTER_INDENT_PX + (MAX_INDENT_PX - CENTER_INDENT_PX) * Math.pow(t, 0.85));
      const left = `${indent}px`;
      if (el.style.marginLeft !== left) el.style.marginLeft = left;
      if (el.style.marginRight !== '0px') el.style.marginRight = '0px';
    }

    // Difficulty rows inside the expanded group taper with their own
    // viewport position (read phase first, writes after — no interleaved
    // layout thrash). Scoped to the single expanded group, so this stays
    // cheap no matter how long the list is. Rows are measured in container
    // space via getBoundingClientRect: row.offsetTop is relative to the
    // group wrapper (its offsetParent), which lives in a different
    // coordinate space than the container-space viewport centre.
    const expandedKey = expandedKeyRef.current;
    const selMapId = selectedMapIdRef.current;
    if (expandedKey) {
      const groupEl = itemEls.current.get(expandedKey);
      if (groupEl) {
        const rows = groupEl.querySelectorAll<HTMLElement>(':scope .lazer-carousel-diff-row');
        if (rows.length > 0) {
          const containerRect = container.getBoundingClientRect();
          const jobs: { el: HTMLElement; ml: string; mr: string }[] = [];
          rows.forEach((row) => {
            const id = row.dataset.diffId;
            if (!id) return;
            if (id === selMapId) {
              // Selected diff: pinned just inside the banner edges.
              jobs.push({ el: row, ml: `${DIFF_SELECTED_ML_PX}px`, mr: `${DIFF_SELECTED_MR_PX}px` });
              return;
            }
            const rect = row.getBoundingClientRect();
            const center = rect.top - containerRect.top + container.scrollTop + rect.height / 2;
            const t = Math.min(1, Math.abs(center - viewCenter) / DIFF_RANGE_PX);
            const extra = Math.round(DIFF_MAX_EXTRA_PX * Math.pow(t, 0.85));
            jobs.push({ el: row, ml: `${DIFF_BASE_ML_PX + extra}px`, mr: `${DIFF_BASE_MR_PX + extra}px` });
          });
          for (const j of jobs) {
            if (j.el.style.marginLeft !== j.ml) j.el.style.marginLeft = j.ml;
            if (j.el.style.marginRight !== j.mr) j.el.style.marginRight = j.mr;
          }
        }
      }
    }
  };

  const scheduleTaper = () => {
    if (taperRaf.current) return;
    taperRaf.current = requestAnimationFrame(updateTaper);
  };

  const cancelProgScroll = () => {
    if (progScrollRaf.current) {
      cancelAnimationFrame(progScrollRaf.current);
      progScrollRaf.current = 0;
    }
  };

  // Scroll + measure wiring. Group centres are (re)cached after layout
  // settles; the hot scroll path then does math + style writes only for
  // groups (no re-render). Diff rows are rect-measured per taper tick but
  // only inside the single expanded group.
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    measureCenters();
    measureEdgeSpacer();
    scheduleTaper();
    container.addEventListener('scroll', scheduleTaper, { passive: true });
    window.addEventListener('resize', () => { measureEdgeSpacer(); scheduleTaper(); });
    // Re-measure after expand/collapse animations settle (heights change).
    const t1 = window.setTimeout(() => { measureCenters(); scheduleTaper(); }, 120);
    const t2 = window.setTimeout(() => { measureCenters(); scheduleTaper(); }, 420);
    return () => {
      container.removeEventListener('scroll', scheduleTaper);
      window.removeEventListener('resize', scheduleTaper);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      if (taperRaf.current) cancelAnimationFrame(taperRaf.current);
      taperRaf.current = 0;
      cancelProgScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, songGroups.length, expandedSongKey, selectedGroupKey]);

  // Keep the taper in sync when the selection flips without a scroll
  // event (selection pins are direct style writes so they never wait for
  // the next scroll tick).
  useEffect(() => {
    scheduleTaper();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupKey, selectedMapId]);

  // One-time centring (osu!lazer ScrollToSelection): glide the requested
  // group's vertical centre to the viewport centre, then leave the scroll
  // alone — it is not sticky. Damped tracking keeps it snappy; user input
  // cancels it so it never fights manual scrolling. A settle correction
  // re-runs after the expand animation grows the centred group.
  useEffect(() => {
    if (!centerSignal) return;
    const container = containerRef?.current;
    if (!container) return;
    let attempts = 0;
    let cancelled = false;
    let settleTimer = 0;
    // Where the programmatic scroll left the container; used to detect
    // manual user scrolling before the settle correction runs.
    let expectedTop: number | null = null;
    const onUserInput = () => {
      cancelled = true;
      expectedTop = null;
      cancelProgScroll();
    };
    container.addEventListener('wheel', onUserInput, { passive: true });
    container.addEventListener('touchstart', onUserInput, { passive: true });
    container.addEventListener('pointerdown', onUserInput);

    // Damped glide toward a live-recomputed target (osu!framework-style
    // exponential damping, frame-rate independent). The destination is
    // re-read every frame, so expand/collapse height changes mid-flight
    // (e.g. the old group collapsing above the new one) are tracked in a
    // single smooth motion instead of landing wrong and jumping twice.
    const glideTo = (getDest: () => number | null, onDone?: () => void) => {
      cancelProgScroll();
      const t0 = performance.now();
      let last = t0;
      const step = (now: number) => {
        if (cancelled) return;
        const dest = getDest();
        if (dest === null) return;
        const dt = Math.min(64, Math.max(1, now - last));
        last = now;
        const cur = container.scrollTop;
        const diff = dest - cur;
        if ((Math.abs(diff) < 0.75 && now - t0 > 120) || now - t0 > 1000) {
          if (Math.abs(diff) < 0.75) container.scrollTop = dest;
          progScrollRaf.current = 0;
          expectedTop = container.scrollTop;
          measureCenters();
          scheduleTaper();
          onDone?.();
          return;
        }
        const a = 1 - Math.exp(-15 * dt / 1000);
        container.scrollTop = cur + diff * a;
        // Scroll events drive the taper; just ensure a tick is queued so
        // the highlight follows even if events coalesce mid-glide.
        scheduleTaper();
        progScrollRaf.current = requestAnimationFrame(step);
      };
      progScrollRaf.current = requestAnimationFrame(step);
    };

    const centreTarget = (el: HTMLElement): number => {
      const target = el.offsetTop + el.offsetHeight / 2 - container.clientHeight / 2;
      const max = Math.max(0, container.scrollHeight - container.clientHeight);
      return Math.max(0, Math.min(max, target));
    };

    const scheduleSettleCorrection = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (cancelled || expectedTop === null) return;
        const el = itemEls.current.get(centerSignal.key);
        if (!el) return;
        // User grabbed the scroll after we finished — leave it alone.
        if (Math.abs(container.scrollTop - expectedTop) > 8) return;
        measureCenters();
        const dest = centreTarget(el);
        if (Math.abs(dest - container.scrollTop) < 4) return;
        const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
          container.scrollTop = dest;
          expectedTop = dest;
          return;
        }
        glideTo(() => {
          const target = itemEls.current.get(centerSignal.key);
          return target ? centreTarget(target) : null;
        });
      }, 420);
    };

    const run = () => {
      if (cancelled) return;
      const el = itemEls.current.get(centerSignal.key);
      if (!el) {
        // List may not be laid out yet (mount / filter change) — retry.
        if (attempts++ < 10) {
          progScrollRaf.current = requestAnimationFrame(() => {
            progScrollRaf.current = 0;
            window.setTimeout(run, 50);
          });
        }
        return;
      }
      measureCenters();
      const clamped = centreTarget(el);
      const dist = clamped - container.scrollTop;
      if (Math.abs(dist) < 4) {
        expectedTop = clamped;
        scheduleSettleCorrection();
        return; // already centred — leave it alone
      }
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        container.scrollTop = clamped;
        expectedTop = clamped;
        scheduleSettleCorrection();
        return;
      }
      glideTo(() => {
        const target = itemEls.current.get(centerSignal.key);
        return target ? centreTarget(target) : null;
      }, scheduleSettleCorrection);
    };
    run();
    return () => {
      cancelled = true;
      window.clearTimeout(settleTimer);
      container.removeEventListener('wheel', onUserInput);
      container.removeEventListener('touchstart', onUserInput);
      container.removeEventListener('pointerdown', onUserInput);
      cancelProgScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerSignal?.nonce]);

  if (songGroups.length === 0) {
    return (
      <div className="bg-[#0c0c14]/80 border border-white/10 p-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 shadow-xl gap-2">
        <Info className="h-6 w-6 text-slate-500" />
        <p className="text-xs font-sans font-black tracking-widest uppercase">No beatmaps matches discovered</p>
        <p className="text-[10px] text-slate-500 font-mono max-w-xs uppercase">Tweak your star rating boundaries or search query</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      // pl-8/pr-5 reserve room for the hover slide (-4px) plus card glow so
      // non-selected cards never clip at the overflow-x edge on hover.
      className="lazer-carousel-scroll lazer-carousel-taper flex-1 overflow-y-auto overflow-x-hidden pl-8 pr-5 flex flex-col gap-1.5 relative z-10 min-h-0"
      id="song-select-carousel-container"
    >
      {/* Top spacer: lets the first group reach the viewport centre. */}
      <div aria-hidden="true" style={{ height: edgeSpacerPx, flexShrink: 0 }} />
      {songGroups.map((group, groupIndex) => {
        const isGroupActive = selectedGroupKey === group.songKey;
        // Expansion is driven only by expandedSongKey so clicking the active
        // banner toggles (closes) its diff list while keeping selection.
        const isExpanded = expandedSongKey === group.songKey;
        // First-paint indent before the rAF taper measures the viewport:
        // selected pins full-width; the rest fall back to the discrete
        // focus index. The scroll handler takes over immediately after.
        const fallbackIndentPx = isGroupActive
          ? 0
          : CENTER_INDENT_PX + Math.min(Math.abs(groupIndex - focusIndex), 5) * 16;
        const fallbackExtendRightPx = isGroupActive ? SELECTED_RIGHT_EXTEND_PX : 0;
        const groupBannerUrl = group.coverUrl || group.bgUrl || DEFAULT_BANNER;
        const sortedDiffs = [...group.maps].sort((a, b) => getStarRating(a) - getStarRating(b));
        const rankBadge = getRankStatusBadge(group);
        const uniqueKeys = Array.from(new Set(group.maps.map(m => m.keyCount).filter(Boolean)))
          .sort((a, b) => Number(a) - Number(b));
        const diffDots = sortedDiffs.slice(0, 12).map((m) => getDiffDotColor(getStarRating(m)));

        return (
          <div
            key={group.songKey}
            className="flex flex-col gap-1 lazer-carousel-taper-item"
            style={{ marginLeft: fallbackIndentPx, marginRight: fallbackExtendRightPx }}
            ref={(el) => {
              if (el) {
                itemEls.current.set(group.songKey, el);
              } else {
                itemEls.current.delete(group.songKey);
              }
              if (isGroupActive && activeItemRef) {
                activeItemRef.current = el;
              }
            }}
          >
            {/* SET CARD — hud/songselect.jpg: tall art card, status pill, title/artist, mode icon + diff dots */}
            <div
              role="button"
              tabIndex={0}
              aria-pressed={isGroupActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectGroup(group);
                }
              }}
              onClick={() => onSelectGroup(group)}
              className={`lazer-carousel-card ${isGroupActive ? 'is-active' : ''}`}
            >
              <div
                className="absolute inset-0 bg-cover bg-center pointer-events-none"
                style={{ backgroundImage: `url("${sanitizeCssUrl(groupBannerUrl)}")` }}
              />
              <div className="absolute inset-0 pointer-events-none lazer-carousel-card-shade" />

              {/* Set Card Content */}
              <div className="relative flex items-center justify-between px-3.5 py-2 gap-3 min-h-[56px]">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <div className="flex flex-col text-left overflow-hidden min-w-0 flex-1">
                    <h4 className="font-extrabold font-sans text-[15px] sm:text-base text-white tracking-tight truncate leading-tight order-first">
                      {group.title}
                    </h4>
                    <span className="text-[11px] font-sans text-slate-200/90 truncate">
                      {group.artist || 'Unknown Artist'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`px-1.5 py-px rounded text-[9px] font-mono font-black uppercase tracking-wider ${rankBadge.bgClass}`}>
                        {rankBadge.label}
                      </span>
                      {/* mania mode icon */}
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-white/50 text-[8px] font-black text-white/90" title="mania mode">
                        M
                      </span>
                      <span className="flex items-center gap-[3px]" aria-hidden="true">
                        {diffDots.map((c, i) => (
                          <span key={i} className="inline-block w-[5px] h-[10px] rounded-[2.5px]" style={{ background: c }} />
                        ))}
                      </span>
                      {uniqueKeys.length > 0 && (
                        <span className="flex items-center gap-1" aria-hidden="true">
                          {uniqueKeys.map((k) => (
                            <span key={k} title={`${k}K`} className={`w-2 h-2 rounded-full inline-block ${getKeyDotColor(k)}`} />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: diff count + favorite */}
                <div className="flex items-center gap-2 shrink-0 select-none">
                  <span className="px-2 py-0.5 bg-white/10 border border-white/15 rounded text-[10px] font-mono font-bold text-slate-200">
                    {group.maps.length} {group.maps.length === 1 ? 'diff' : 'diffs'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(group.songKey);
                    }}
                    title={favoriteSongs.includes(group.songKey) ? 'Remove from favorites' : 'Add to favorites'}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Heart
                      className={`h-4 w-4 transition-colors ${
                        favoriteSongs.includes(group.songKey)
                          ? 'fill-rose-500 text-rose-500'
                          : 'text-slate-300/70 hover:text-slate-100'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* EXPANDED DIFFICULTY ROWS */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden pl-5 pr-1 flex flex-col gap-1"
                >
                  {sortedDiffs.map((diff) => {
                    const isDiffSelected = selectedMapId === diff.id;
                    const rating = getStarRating(diff);
                    const dotCount = getStarDotCount(rating);
                    const tint = getDiffTint(rating);
                    const bestRecord = playHistory
                      .filter((r) => r.beatmapId === diff.id || (diff.beatmapHash && r.beatmapHash === diff.beatmapHash))
                      .sort((a, b) => (b.score !== a.score ? b.score - a.score : b.accuracy - a.accuracy))[0];

                    return (
                      <div
                        key={diff.id}
                        data-diff-id={diff.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (isDiffSelected) {
                            onStartPlay(diff);
                          } else {
                            onSelectDifficulty(diff);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (isDiffSelected) {
                              onStartPlay(diff);
                            } else {
                              onSelectDifficulty(diff);
                            }
                          }
                        }}
                        className={`lazer-carousel-diff-row ${isDiffSelected ? 'is-selected' : ''}`}
                        style={{
                          background: tint.bg,
                          borderColor: isDiffSelected ? tint.edge : undefined,
                          // First-paint base; the taper refines non-selected
                          // rows by viewport position right after. Selected
                          // diff reclaims the wrapper gutter to sit just
                          // inside the banner edges.
                          marginLeft: isDiffSelected ? DIFF_SELECTED_ML_PX : DIFF_BASE_ML_PX,
                          marginRight: isDiffSelected ? DIFF_SELECTED_MR_PX : DIFF_BASE_MR_PX,
                        }}
                      >
                        {/* Selected edge indicator */}
                        {isDiffSelected && <div className="lazer-carousel-diff-bar" style={{ background: tint.edge, boxShadow: `0 0 8px ${tint.edge}` }} />}

                        <div className="flex items-center justify-between px-3 py-2 gap-2 relative z-10">
                          {/* Left: grade circle, [4K] name, mapper */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {bestRecord ? (
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${getGradeCircleClass(bestRecord.grade)}`}>
                                {bestRecord.grade}
                              </span>
                            ) : (
                              <span className="w-6 h-6 rounded-full border border-white/40 flex items-center justify-center text-[9px] font-black text-white/70 shrink-0">
                                {diff.keyCount || 4}K
                              </span>
                            )}

                            <div className="flex items-center gap-1.5 truncate text-xs sm:text-[13px]">
                              <span className="font-sans font-bold text-white/95 truncate">
                                [{diff.keyCount || 4}K] {diff.difficulty}
                              </span>
                              {diff.creator && (
                                <span className="text-[10px] font-sans text-white/70 truncate hidden md:inline">
                                  mapped by {diff.creator}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: star pill + dots */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${tint.pill}`}>
                              ★ {rating.toFixed(2)}
                            </span>
                            <span className="lazer-star-meter hidden sm:flex items-center gap-[2px]" aria-hidden="true">
                              {Array.from({ length: 10 }, (_, i) => (
                                <span
                                  key={i}
                                  className={`lazer-star-meter-dot ${i < dotCount ? 'is-filled' : ''}`}
                                  style={i < dotCount ? undefined : { background: 'rgba(255,255,255,0.25)', boxShadow: 'none' }}
                                />
                              ))}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      {/* Bottom spacer: lets the last group reach the viewport centre. */}
      <div aria-hidden="true" style={{ height: edgeSpacerPx, flexShrink: 0 }} />
    </div>
  );
}
