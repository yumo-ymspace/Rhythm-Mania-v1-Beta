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

import React from 'react';
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
      if (s === 'ranked') return { label: 'RANKED', bgClass: 'bg-emerald-500/90 text-white' };
      if (s === 'loved') return { label: 'LOVED', bgClass: 'bg-pink-500/90 text-white' };
      if (s === 'graveyard') return { label: 'GRAVEYARD', bgClass: 'bg-slate-600/90 text-slate-200' };
    }
    if (firstMap.catalogMapId || firstMap.isServerMap) {
      return { label: 'RANKED', bgClass: 'bg-emerald-500/90 text-white' };
    }
  }
  return { label: 'LOCAL', bgClass: 'bg-[#00e5ff]/25 text-[#00e5ff] border border-[#00e5ff]/40' };
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

  return (
    <div
      ref={containerRef}
      className="lazer-carousel-scroll flex-1 overflow-y-auto overflow-x-hidden pr-2 flex flex-col gap-2 relative z-10 min-h-0"
      id="song-select-carousel-container"
    >
      {songGroups.map((group) => {
        const isGroupActive = selectedGroupKey === group.songKey;
        const isExpanded = expandedSongKey === group.songKey || isGroupActive;
        const groupBannerUrl = group.coverUrl || DEFAULT_BANNER;
        const sortedDiffs = [...group.maps].sort((a, b) => getStarRating(a) - getStarRating(b));
        const rankBadge = getRankStatusBadge(group);
        const uniqueKeys = Array.from(new Set(group.maps.map(m => m.keyCount).filter(Boolean)))
          .sort((a, b) => Number(a) - Number(b));

        return (
          <motion.div
            key={group.songKey}
            layout
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-1.5"
            ref={isGroupActive ? activeItemRef : undefined}
          >
            {/* SET CARD (Compact Header) */}
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
              {/* Background Art with cover gradient */}
              <div
                className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-45 transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url("${sanitizeCssUrl(groupBannerUrl)}")` }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0d1017]/95 via-[#0d1017]/75 to-transparent pointer-events-none" />

              {/* Set Card Content */}
              <div className="relative flex items-center justify-between px-3.5 py-2.5 gap-3">
                <div className="flex flex-col text-left overflow-hidden min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    {/* Status Pill (Ranked / Loved / Graveyard / Local) */}
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-wider ${rankBadge.bgClass}`}>
                      {rankBadge.label}
                    </span>
                    <span className="text-[11px] font-mono text-slate-300 font-bold truncate">
                      {group.artist || 'Unknown Artist'}
                    </span>
                  </div>
                  <h4 className="font-extrabold font-sans text-sm sm:text-base text-white tracking-tight truncate leading-tight">
                    {group.title}
                  </h4>
                </div>

                {/* Right side of card: Key dots, Diffs count, Favorite */}
                <div className="flex items-center gap-2 shrink-0 select-none">
                  {/* Key Count Color Dots */}
                  {uniqueKeys.length > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-1 bg-black/40 border border-white/10 rounded">
                      {uniqueKeys.map((k) => (
                        <span
                          key={k}
                          title={`${k}K`}
                          className={`w-2 h-2 rounded-full inline-block ${getKeyDotColor(k)}`}
                        />
                      ))}
                    </div>
                  )}

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
                          : 'text-slate-500 hover:text-slate-300'
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
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden pl-4 pr-1 flex flex-col gap-1.5"
                >
                  {sortedDiffs.map((diff) => {
                    const isDiffSelected = selectedMapId === diff.id;
                    const rating = getStarRating(diff);
                    const dotCount = getStarDotCount(rating);
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
                      >
                        {/* Selected cyan indicator bar */}
                        {isDiffSelected && <div className="lazer-carousel-diff-bar" />}

                        <div className="flex items-center justify-between px-3.5 py-2 gap-2 relative z-10">
                          {/* Left: Star Pill, Key count, Diff Name + Mapper */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Star rating on coloured pill */}
                            <span className={`px-2 py-0.5 rounded font-mono font-black text-xs shrink-0 ${getDifficultyColor(rating)}`}>
                              ★ {rating.toFixed(2)}
                            </span>

                            {/* 10-dot star meter */}
                            <div className="lazer-star-meter hidden sm:flex" aria-hidden="true">
                              {Array.from({ length: 10 }, (_, i) => (
                                <span
                                  key={i}
                                  className={`lazer-star-meter-dot ${i < dotCount ? 'is-filled' : ''}`}
                                />
                              ))}
                            </div>

                            {/* [4K] Easy mapped by ... */}
                            <div className="flex items-center gap-1.5 truncate text-xs sm:text-sm">
                              <span className="font-mono font-bold text-slate-400 shrink-0">
                                [{diff.keyCount || 4}K]
                              </span>
                              <span className="font-extrabold text-white truncate">
                                {diff.difficulty}
                              </span>
                              {diff.creator && (
                                <span className="text-[10px] font-mono text-slate-400 truncate hidden md:inline">
                                  mapped by {diff.creator}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Local Grade badge + Ready status */}
                          <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                            {bestRecord && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${getGradeBadgeClass(bestRecord.grade)}`}>
                                {bestRecord.grade}
                              </span>
                            )}
                            {isDiffSelected && (
                              <span className="text-[10px] text-[#00e5ff] font-black tracking-wider uppercase animate-pulse">
                                READY
                              </span>
                            )}
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
