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

import React, { useEffect, useState } from 'react';
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
}: SongSelectCarouselProps) {
  if (songGroups.length === 0) {
    return (
      <div className="bg-[#0c0c14]/80 border border-white/10 p-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 shadow-xl gap-2">
        <Info className="h-6 w-6 text-slate-500" />
        <p className="text-xs font-sans font-black tracking-widest uppercase">No beatmaps matches discovered</p>
        <p className="text-[10px] text-slate-500 font-mono max-w-xs uppercase">Tweak your star rating boundaries or search query</p>
      </div>
    );
  }

  // Viewport carousel taper (osu!lazer-style): every panel's left offset is
  // a continuous function of that panel's own pixel distance from the
  // vertical centre of what is currently on screen — nothing is quantized
  // to index steps, so lengths glide smoothly while scrolling. Only the
  // centred panel is longest; the rest scale along it. Selected panels keep
  // an extra extension on top so they read longer than the rest.
  const focusKey = expandedSongKey || selectedGroupKey;
  let focusIndex = songGroups.findIndex((g) => g.songKey === focusKey);
  if (focusIndex < 0) focusIndex = 0;
  // Per-group indent in px, recomputed every frame while scrolling.
  const [taperIndents, setTaperIndents] = useState<number[] | null>(null);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    const MAX_INDENT_PX = 120;
    const RANGE_PX = 300;
    let raf = 0;
    const update = () => {
      raf = 0;
      const items = container.querySelectorAll<HTMLElement>('.lazer-carousel-taper-item');
      if (items.length === 0) return;
      const viewCenter = container.scrollTop + container.clientHeight / 2;
      const next: number[] = new Array(items.length);
      items.forEach((el, idx) => {
        const center = el.offsetTop + el.offsetHeight / 2;
        const t = Math.min(1, Math.abs(center - viewCenter) / RANGE_PX);
        next[idx] = Math.round(MAX_INDENT_PX * Math.pow(t, 0.85));
      });
      setTaperIndents((prev) => {
        if (prev && prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
        return next;
      });
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    container.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Re-measure after expand/collapse animations settle (heights change).
    const t = window.setTimeout(update, 320);
    return () => {
      container.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [containerRef, songGroups.length, expandedSongKey]);

  return (
    <div
      ref={containerRef}
      className="lazer-carousel-scroll lazer-carousel-taper flex-1 overflow-y-auto overflow-x-hidden pl-4 pr-2 flex flex-col gap-1.5 relative z-10 min-h-0"
      id="song-select-carousel-container"
    >
      {songGroups.map((group, groupIndex) => {
        const isGroupActive = selectedGroupKey === group.songKey;
        // Expansion is driven only by expandedSongKey so clicking the active
        // banner toggles (closes) its diff list while keeping selection.
        const isExpanded = expandedSongKey === group.songKey;
        // Continuous scroll-driven indent (0 at the viewport centre); falls
        // back to the discrete focus index before the first measurement.
        const fallbackIndentPx = Math.min(Math.abs(groupIndex - focusIndex), 5) * 24;
        const baseIndentPx = taperIndents?.[groupIndex] ?? fallbackIndentPx;
        // Selected song extends clearly past the rest on both sides,
        // clamped to never clip the container pad.
        const taperIndentPx = Math.max(0, baseIndentPx - (isGroupActive ? 30 : 0));
        const taperExtendRightPx = isGroupActive ? -8 : 0;
        const groupBannerUrl = group.coverUrl || group.bgUrl || DEFAULT_BANNER;
        const sortedDiffs = [...group.maps].sort((a, b) => getStarRating(a) - getStarRating(b));
        const rankBadge = getRankStatusBadge(group);
        const uniqueKeys = Array.from(new Set(group.maps.map(m => m.keyCount).filter(Boolean)))
          .sort((a, b) => Number(a) - Number(b));
        const diffDots = sortedDiffs.slice(0, 12).map((m) => getDiffDotColor(getStarRating(m)));

        return (
          <motion.div
            key={group.songKey}
            layout
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-1 lazer-carousel-taper-item"
            style={{ marginLeft: taperIndentPx, marginRight: taperExtendRightPx }}
            ref={isGroupActive ? activeItemRef : undefined}
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
                  className="overflow-hidden pl-3 pr-1 flex flex-col gap-1"
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
                          marginLeft: isDiffSelected ? -6 : 0,
                          marginRight: isDiffSelected ? -6 : 0,
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
          </motion.div>
        );
      })}
    </div>
  );
}
