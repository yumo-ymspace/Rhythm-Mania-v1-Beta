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

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Info, Loader2 } from 'lucide-react';
import { Beatmap, PlayHistoryRecord } from '../../types';
import { sanitizeCssUrl } from '../../utils/securityLimits';
import { buildBackgroundCacheKey, storageManager } from '../../utils/storageManager';
import { AssetLifecycleManager, isBrowserPlayableVideoFilename } from '../../utils/assetLifecycle';

// Layout effects run before paint (no first-frame flash); on the server
// they fall back to passive effects to avoid SSR warnings.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

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
  /** True while beatmaps are still loading (IndexedDB/migration). Shows a bare spinner instead of the empty box. */
  isLoading?: boolean;
}

const DEFAULT_BANNER = '/backgrounds/Ferineon.webp';

function isUsableMemoryBg(url: unknown): url is string {
  return typeof url === 'string'
    && url.length > 0
    && url !== DEFAULT_BANNER
    && url !== '/backgrounds/default.svg';
}

/**
 * Shared promise cache for persisted background lookups so sibling diffs
 * sharing one art file hit IndexedDB once and reuse a single blob URL.
 */
const persistedBannerUrlCache = new Map<string, Promise<string | null>>();

function getPersistedBannerUrl(packageId: string, bgFilename: string): Promise<string | null> {
  const key = buildBackgroundCacheKey(packageId, bgFilename);
  if (!key) return Promise.resolve(null);
  const pending = persistedBannerUrlCache.get(key);
  if (pending) return pending;
  const next = (async (): Promise<string | null> => {
    try {
      const cached = await storageManager.getCachedBackground(key);
      if (!cached) return null;
      return AssetLifecycleManager.registerArrayBuffer(cached.data, cached.mime);
    } catch {
      return null;
    }
  })();
  persistedBannerUrlCache.set(key, next);
  next.catch(() => {
    // A failed lookup must not poison later retries (e.g. art persisted after).
    if (persistedBannerUrlCache.get(key) === next) persistedBannerUrlCache.delete(key);
  });
  return next;
}

/**
 * Song banner art: slimcover from assets.ppy.sh when it exists/loads, else
 * the local background png/jpg centred and smallened (contain, not cover).
 * Local art is read from the memory cache first, then the persisted
 * IndexedDB backgrounds store (written at download time), so the fallback
 * shows quickly without re-decompressing the .osz.
 */
function SongBannerArt({ group }: { group: CarouselSongGroup }) {
  const coverUrl = typeof group.coverUrl === 'string' && group.coverUrl.length > 0 ? group.coverUrl : undefined;
  const [coverFailed, setCoverFailed] = useState(false);
  const [localBg, setLocalBg] = useState<string>(() => (
    isUsableMemoryBg(group.bgUrl) ? (group.bgUrl as string) : ''
  ));

  useEffect(() => {
    setCoverFailed(false);
  }, [coverUrl]);

  // A later unpack/preload can fill group.bgUrl after first paint.
  useEffect(() => {
    if (isUsableMemoryBg(group.bgUrl) && group.bgUrl !== localBg) {
      setLocalBg(group.bgUrl as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.bgUrl]);

  // Fast IndexedDB fallback: no zip decompression, just the persisted bytes.
  useEffect(() => {
    if (localBg || typeof window === 'undefined') return;
    let cancelled = false;
    void (async () => {
      const candidates = group.maps.slice(0, 3);
      for (const map of candidates) {
        if (cancelled) return;
        const record = map as Beatmap & { packageId?: string; parentPackageId?: string; bgFilename?: string | null };
        const mem = storageManager.lruMediaCache.get(map.id)?.bgUrl;
        if (isUsableMemoryBg(mem)) {
          if (!cancelled) setLocalBg(mem as string);
          return;
        }
        const packageId = record.packageId || record.parentPackageId;
        const bgFilename = record.bgFilename;
        if (!packageId || !bgFilename || isBrowserPlayableVideoFilename(bgFilename)) continue;
        const url = await getPersistedBannerUrl(packageId, bgFilename);
        if (cancelled) return;
        if (url) {
          const existing = storageManager.lruMediaCache.get(map.id);
          storageManager.lruMediaCache.put(map.id, {
            audioUrl: existing?.audioUrl || '',
            videoUrl: existing?.videoUrl || '',
            bgUrl: url,
            hitSoundUrls: existing?.hitSoundUrls ? { ...existing.hitSoundUrls } : {},
          });
          setLocalBg(url);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.songKey, localBg]);

  if (coverUrl && !coverFailed) {
    return (
      <>
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: `url("${sanitizeCssUrl(coverUrl)}")` }}
        />
        {/* Hidden probe: background-image gives no load errors, so detect a
            missing slimcover here and fall back to the local background.
            Must be eager + rendered (1px, transparent): lazy + display:none
            images may never be fetched, so the error would never fire. */}
        <img
          src={coverUrl}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          onError={() => setCoverFailed(true)}
        />
      </>
    );
  }

  if (localBg) {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("${sanitizeCssUrl(localBg)}")`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
    );
  }

  return (
    <div
      className="absolute inset-0 bg-cover bg-center pointer-events-none"
      style={{ backgroundImage: `url("${sanitizeCssUrl(DEFAULT_BANNER)}")` }}
    />
  );
}

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
  isLoading = false,
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
  const MAX_INDENT_PX = 72;
  const CENTER_INDENT_PX = 16;
  const RANGE_PX = 300;
  // The native scrollbar is hidden (see tokens.css): a custom overlay thumb
  // floats over the art, so every banner ends exactly at the screen edge and
  // only the left indent tapers.
  const SELECTED_RIGHT_EXTEND_PX = 0;
  const UNSELECTED_RIGHT_OVERLAP_PX = 0;
  // Difficulty-row taper: every row sticks to the screen edge on the right
  // (the -4 cancels the wrapper gutter); unselected rows read slightly
  // shorter through their larger left indent, which still tapers with
  // viewport position. The selected row pins near banner width above them all.
  const DIFF_BASE_ML_PX = 8;
  const DIFF_BASE_MR_PX = -4;
  const DIFF_SELECTED_ML_PX = -12;
  const DIFF_SELECTED_MR_PX = -4;
  const DIFF_RANGE_PX = 220;
  const DIFF_MAX_EXTRA_PX = 26;

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
  // Custom overlay scrollbar thumb (the native bar is hidden so banners stay
  // flush). Written directly like the taper — no React state per scroll frame.
  const scrollThumbRef = useRef<HTMLDivElement | null>(null);
  // No top spacer: the list starts flush at the top and selection snaps to
  // the top edge (not the viewport centre), so there is never an empty gap
  // above the first card. A small bottom pad keeps the last card off the
  // footer edge.
  const TOP_SPACER_PX = 0;
  const BOTTOM_SPACER_PX = 12;
  // Gated until the first synchronous measure+taper pass completes, so the
  // list's first painted frame already has the measured top spacer and
  // correct indents instead of flashing fallback positions at the top.
  const [listReady, setListReady] = React.useState(false);

  const measureCenters = () => {
    const next = new Map<string, number>();
    for (const g of groupsRef.current) {
      const el = itemEls.current.get(g.songKey);
      if (el) next.set(g.songKey, el.offsetTop + el.offsetHeight / 2);
    }
    centersCache.current = next;
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
      // Every banner ends at the screen edge; only the left indent tapers.
      if (el.style.marginRight !== `${UNSELECTED_RIGHT_OVERLAP_PX}px`) el.style.marginRight = `${UNSELECTED_RIGHT_OVERLAP_PX}px`;
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
            // Left indent tapers; right stays stuck to the screen edge.
            jobs.push({ el: row, ml: `${DIFF_BASE_ML_PX + extra}px`, mr: `${DIFF_BASE_MR_PX}px` });
          });
          for (const j of jobs) {
            if (j.el.style.marginLeft !== j.ml) j.el.style.marginLeft = j.ml;
            if (j.el.style.marginRight !== j.mr) j.el.style.marginRight = j.mr;
          }
        }
      }
    }

    // Custom overlay scrollbar thumb: sized/positioned from live scroll
    // metrics so it tracks exactly like a native bar while floating over
    // the banner art. Hidden when nothing overflows.
    const thumb = scrollThumbRef.current;
    if (thumb) {
      const scrollable = container.scrollHeight - container.clientHeight;
      if (scrollable <= 1) {
        if (thumb.style.opacity !== '0') thumb.style.opacity = '0';
      } else {
        if (thumb.style.opacity !== '1') thumb.style.opacity = '1';
        const trackH = container.clientHeight;
        const thumbH = Math.max(28, Math.round((container.clientHeight / container.scrollHeight) * trackH));
        const top = Math.round((container.scrollTop / scrollable) * (trackH - thumbH));
        const height = `${thumbH}px`;
        const transform = `translateY(${top}px)`;
        if (thumb.style.height !== height) thumb.style.height = height;
        if (thumb.style.transform !== transform) thumb.style.transform = transform;
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
  //
  // Runs as a layout effect with a synchronous taper pass so the first
  // painted frame (e.g. when songs first appear after loading) already has
  // correct indents — no position jump at the top of the list.
  useIsomorphicLayoutEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    // Drop element/centre entries for groups that no longer exist, so
    // filter changes can't leave stale positions behind.
    if (itemEls.current.size > 0) {
      const alive = new Set(groupsRef.current.map((g) => g.songKey));
      for (const key of Array.from(itemEls.current.keys())) {
        if (!alive.has(key)) {
          itemEls.current.delete(key);
          centersCache.current.delete(key);
        }
      }
    }
    measureCenters();
    // Synchronous pre-paint pass: fallback indents from render are corrected
    // before anything reaches the screen.
    updateTaper();
    setListReady(groupsRef.current.length > 0);
    const handleResize = () => { scheduleTaper(); };
    container.addEventListener('scroll', scheduleTaper, { passive: true });
    window.addEventListener('resize', handleResize);
    // Re-measure after expand/collapse animations settle (heights change).
    const t1 = window.setTimeout(() => { measureCenters(); scheduleTaper(); }, 120);
    const t2 = window.setTimeout(() => { measureCenters(); scheduleTaper(); }, 420);
    return () => {
      container.removeEventListener('scroll', scheduleTaper);
      window.removeEventListener('resize', handleResize);
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

  // One-time top snap: glide the requested group's top to the container
  // top, then leave the scroll alone — it is not sticky. Damped tracking
  // keeps it snappy; user input cancels it so it never fights manual
  // scrolling. A settle correction re-runs after the expand animation
  // grows the snapped group.
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
      const target = el.offsetTop - TOP_SPACER_PX;
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

  // The scroll container stays mounted across loading → loaded → filtered
  // transitions (same element, same ref). Remounting it when songs first
  // appear resets scrollTop and replays the spacer/taper measurements from
  // scratch, which reads as a position glitch at the top of the list.
  // pl-4 reserves room for the hover slide (-4px) plus card glow on the left.
  // The wrapper bleeds through the column gutter (negative right margin) so
  // banners attach flush to the screen edge; the search/filter rows above
  // keep their own padding and stay inset. The overlay thumb floats over the
  // art because the native bar is hidden (it would otherwise sit between the
  // banners and the edge).
  const carouselWrapClassName =
    'flex-1 relative min-h-0 flex flex-col mr-[-8px] lg:mr-[-12px]';
  const carouselClassName =
    'lazer-carousel-scroll lazer-carousel-taper flex-1 overflow-y-auto overflow-x-hidden pl-4 pr-0 flex flex-col gap-1.5 relative z-10 min-h-0';
  const carouselOverlay = (
    <div className="pointer-events-none absolute top-0 bottom-0 right-0 w-[7px] z-20" aria-hidden="true">
      <div
        ref={scrollThumbRef}
        className="absolute right-[1px] top-0 w-[5px] rounded-full bg-white/30 shadow-[0_0_6px_rgba(0,0,0,0.55)]"
        style={{ opacity: 0 }}
      />
    </div>
  );

  if (songGroups.length === 0) {
    return (
      <div className={carouselWrapClassName}>
        <div
          ref={containerRef}
          className={carouselClassName}
          id="song-select-carousel-container"
        >
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center min-h-[240px]" role="status" aria-label="Loading beatmaps">
              <Loader2 className="h-8 w-8 text-white/70 animate-spin" />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-[240px]">
              <div className="bg-[#0c0c14]/80 border border-white/10 p-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 shadow-xl gap-2">
                <Info className="h-6 w-6 text-slate-500" />
                <p className="text-xs font-sans font-black tracking-widest uppercase">No beatmaps matches discovered</p>
                <p className="text-[10px] text-slate-500 font-mono max-w-xs uppercase">Tweak your star rating boundaries or search query</p>
              </div>
            </div>
          )}
        </div>
        {carouselOverlay}
      </div>
    );
  }

  return (
    <div className={carouselWrapClassName}>
      <div
        ref={containerRef}
        className={carouselClassName}
        id="song-select-carousel-container"
        // Hidden until the pre-paint taper pass lands, so fallback indents are
        // never flashed at the top when the banners first appear.
        style={listReady ? undefined : { visibility: 'hidden' }}
      >
      {/* Flush top: no gap above the first card; list snaps to the top. */}
      {TOP_SPACER_PX > 0 && (
        <div aria-hidden="true" style={{ height: TOP_SPACER_PX, flexShrink: 0 }} />
      )}
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
        const fallbackExtendRightPx = isGroupActive ? SELECTED_RIGHT_EXTEND_PX : UNSELECTED_RIGHT_OVERLAP_PX;
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
              <SongBannerArt group={group} />
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
                          // diff cancels the wrapper gutter to sit flush
                          // with the banner edge; unselected rows keep a
                          // right inset so they read slightly shorter.
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
      {/* Small bottom pad only; no centring gap. */}
      <div aria-hidden="true" style={{ height: BOTTOM_SPACER_PX, flexShrink: 0 }} />
      </div>
      {carouselOverlay}
    </div>
  );
}
