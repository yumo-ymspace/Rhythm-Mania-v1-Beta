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

import React, { useMemo, useState } from 'react';
import {
  Heart, Play, Clock, Activity, Award, Info, ChevronDown, Lock, Check
} from 'lucide-react';
import { Beatmap, GameSettings, PlayHistoryRecord } from '../../types';
import { calculateDominantBpm } from '../../utils/beatmapParser';

export type RankingSortKey = 'score' | 'accuracy' | 'combo' | 'recent';

export const RANKING_SORT_OPTIONS: Array<{ key: RankingSortKey; label: string }> = [
  { key: 'score', label: 'Score' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'combo', label: 'Combo' },
  { key: 'recent', label: 'Recent' },
];

export function formatRankingAge(timestamp: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - (timestamp || now));
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}hr${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}dy${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years}yr${years === 1 ? '' : 's'}`;
}

export function areModsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const na = [...(a || [])].sort();
  const nb = [...(b || [])].sort();
  if (na.length !== nb.length) return false;
  return na.every((m, i) => m === nb[i]);
}

export function sortRankingScores(
  scores: PlayHistoryRecord[],
  sortKey: RankingSortKey,
): PlayHistoryRecord[] {
  const rows = scores.slice();
  switch (sortKey) {
    case 'accuracy':
      rows.sort((a, b) => b.accuracy - a.accuracy || b.score - a.score || (b.timestamp || 0) - (a.timestamp || 0));
      break;
    case 'combo':
      rows.sort((a, b) => b.maxCombo - a.maxCombo || b.score - a.score || (b.timestamp || 0) - (a.timestamp || 0));
      break;
    case 'recent':
      rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      break;
    case 'score':
    default:
      rows.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || (b.timestamp || 0) - (a.timestamp || 0));
      break;
  }
  return rows;
}

export interface SongSelectLeftPanelProps {
  selectedMap: Beatmap | null;
  currentStarRating: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  activeTab: 'details' | 'ranking';
  onChangeTab: (tab: 'details' | 'ranking') => void;
  localScores: PlayHistoryRecord[];
  onWatchReplay?: (record: PlayHistoryRecord, beatmap?: Beatmap) => Promise<{ success: boolean; error?: string }> | void;
  settings: GameSettings;
  getDifficultyColor: (rating: number) => React.CSSProperties;
  getGradeBadgeClass: (grade: string) => string;
  onOpenOnlineCatalog?: () => void;
  onImportClick?: () => void;
  importStatus?: { type: 'ok' | 'err'; msg: string } | null;
}

/**
 * Calculates a clean BPM representation (single BPM or a range like "135-520 (mostly 270)")
 * based on the beatmap's uninherited timing points.
 */
export function computeBpmSummary(map: Beatmap | null): string {
  if (!map) return '120';
  const timingPoints = map.timingPoints || [];
  const uninherited = timingPoints.filter((tp) => tp.uninherited && tp.beatLength > 0);

  if (uninherited.length === 0) {
    return String(Math.round(map.bpm || 120));
  }

  const bpms = uninherited.map((tp) => Math.round(60000 / tp.beatLength)).filter((b) => b > 10 && b < 1000);
  if (bpms.length === 0) {
    return String(Math.round(map.bpm || 120));
  }

  const minBpm = Math.min(...bpms);
  const maxBpm = Math.max(...bpms);

  if (minBpm === maxBpm || maxBpm - minBpm < 3) {
    return String(minBpm);
  }

  // Calculate dominant BPM across duration
  const dominant = calculateDominantBpm(
    uninherited.map((tp) => ({ time: tp.timeMs, beatLength: tp.beatLength })),
    (map.duration || 120) * 1000
  );

  return `${minBpm}-${maxBpm} (mostly ${dominant})`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const SongSelectLeftPanel: React.FC<SongSelectLeftPanelProps> = ({
  selectedMap,
  currentStarRating,
  isFavorite,
  onToggleFavorite,
  activeTab,
  onChangeTab,
  localScores,
  onWatchReplay,
  settings,
  getDifficultyColor,
  getGradeBadgeClass,
  onOpenOnlineCatalog,
  onImportClick,
  importStatus,
}) => {
  // Ranking toolbar state (local scope only — no online scores).
  const [rankingSort, setRankingSort] = useState<RankingSortKey>('score');
  const [modsOnly, setModsOnly] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const activeSortLabel =
    RANKING_SORT_OPTIONS.find((o) => o.key === rankingSort)?.label || 'Score';
  const selectedMods = settings.selectedMods || [];

  const displayedScores = useMemo(() => {
    const pool = modsOnly
      ? localScores.filter((s) => areModsEqual(s.mods, selectedMods))
      : localScores;
    return sortRankingScores(pool, rankingSort);
  }, [localScores, modsOnly, selectedMods, rankingSort]);

  // No selection: render a blank skeleton of the map-details layout so the
  // panel keeps its shape. Textual details stay blank or "-" as appropriate.
  if (!selectedMap) {
    return (
      <div className="flex flex-col gap-3 w-full h-full min-h-0 overflow-hidden lazer-song-wedge-wrap" aria-label="No beatmap selected">
        {/* 1. TOP HEADER BLOCK SKELETON — pinned, never scrolls off */}
        <div className="lazer-song-wedge flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="lazer-status-pill is-graveyard">-</span>
          </div>

          {/* Title (blank, height preserved) */}
          <h1
            className="font-sans font-bold text-[26px] lg:text-[30px] tracking-tight leading-[1.05] truncate mt-1.5 text-transparent select-none"
            aria-hidden="true"
          >
            &nbsp;
          </h1>

          {/* Artist (blank, height preserved) */}
          <div className="text-[13px] truncate select-none text-transparent" aria-hidden="true">
            &nbsp;
          </div>

          {/* Meta row: plays / favorites / duration / bpm */}
          <div className="flex items-center gap-4 text-[12px] text-white/80 font-normal mt-1.5">
            <div className="flex items-center gap-1.5" title="Local plays">
              <Play className="h-3 w-3 fill-current opacity-80" />
              <span className="tabular-nums">-</span>
            </div>

            <span className="flex items-center gap-1.5 text-white/70" title="Favorite">
              <Heart className="h-3.5 w-3.5" />
              <span className="tabular-nums">-</span>
            </span>

            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 opacity-80" />
              <span className="tabular-nums">-</span>
            </div>

            <div className="flex items-center gap-1.5 truncate max-w-[220px]" title="BPM: -">
              <Activity className="h-3 w-3 opacity-80 shrink-0" />
              <span className="tabular-nums truncate">-</span>
            </div>
          </div>

          {/* 2+3. INFO BOX SKELETON — same slanted shell, blank values */}
          <div className="lazer-song-infobox">
          {/* 2. DIFFICULTY & MAPPER LINE */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-black" style={getDifficultyColor(0)}>
              ★ -
            </span>
            <div className="text-[12px] font-bold text-slate-100 truncate">
              <span className="text-emerald-300 font-bold mr-1.5">-</span>
              <span className="text-white/50 font-normal">mapped by</span>{' '}
              <span className="text-slate-100 font-normal">-</span>
            </div>
          </div>

          {/* 3. MANIA STATS STRIP SKELETON — same dark strip, blank values */}
          <div className="lazer-song-statbox">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Notes' },
              { label: 'Hold Notes' },
              { label: 'Key Count' },
              { label: 'Accuracy' },
              { label: 'HP Drain' },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1 min-w-0">
                <span className="text-[10px] text-white/55 font-normal truncate">{stat.label}</span>
                <span className="text-[12px] font-bold text-white tabular-nums">-</span>
                <div className="h-[3px] rounded-full bg-white/15 overflow-hidden mt-0.5">
                  <div
                    className="h-full bg-white/80 rounded-full"
                    style={{ width: '8%' }}
                  />
                </div>
              </div>
           ))}
          </div>
        </div>
        </div>
      </div>

        {/* 4. TABS & RANKING TOOLBAR */}
        <div className="flex flex-col gap-2 mt-1 flex-shrink-0">
          <div className="flex items-center gap-4 text-[12px] font-bold">
            <button
              type="button"
              onClick={() => onChangeTab('details')}
              className={`pb-1 border-b-2 transition cursor-pointer ${
                activeTab === 'details'
                  ? 'text-white border-white'
                  : 'text-white/50 hover:text-white/85 border-transparent'
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => onChangeTab('ranking')}
              className={`pb-1 border-b-2 transition cursor-pointer ${
                activeTab === 'ranking'
                  ? 'text-white border-white'
                  : 'text-white/50 hover:text-white/85 border-transparent'
              }`}
            >
              Ranking
            </button>

            {activeTab === 'ranking' && (
              <div className="flex items-center gap-2 ml-3 flex-wrap">
                <span
                  className="lazer-ranking-pill is-scope is-locked"
                  title="Online rankings unavailable — local scores only"
                  aria-disabled="true"
                >
                  <span className="opacity-60 font-bold">Scope</span>
                  <span>Local</span>
                  <Lock className="h-3 w-3 opacity-60" />
                </span>
                <span className="lazer-ranking-sort-wrap">
                  <button
                    type="button"
                    onClick={() => setSortOpen((v) => !v)}
                    className="lazer-ranking-pill is-button"
                    aria-haspopup="listbox"
                    aria-expanded={sortOpen}
                  >
                    <span className="opacity-60 font-bold">Sort</span>
                    <span>{activeSortLabel}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                  {sortOpen && (
                    <>
                      <span
                        className="fixed inset-0 z-30 cursor-default"
                        onClick={() => setSortOpen(false)}
                      />
                      <span className="lazer-ranking-sort-menu" role="listbox">
                        {RANKING_SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            role="option"
                            aria-selected={rankingSort === opt.key}
                            onClick={() => {
                              setRankingSort(opt.key);
                              setSortOpen(false);
                            }}
                            className={`lazer-ranking-sort-option${rankingSort === opt.key ? ' is-selected' : ''}`}
                          >
                            {opt.label}
                            {rankingSort === opt.key && <Check className="h-3 w-3" />}
                          </button>
                        ))}
                      </span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setModsOnly((v) => !v)}
                  className={`lazer-ranking-pill is-button${modsOnly ? ' is-active' : ' opacity-80'}`}
                  aria-pressed={modsOnly}
                  title={
                    selectedMods.length === 0
                      ? 'Show only plays with no mods'
                      : `Show only plays set with: ${selectedMods.join(' ')}`
                  }
                >
                  Selected Mods
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 5. CONTENT BODY: BLANK DETAILS OR EMPTY RANKING — the only scroll region */}
        <div className="flex-1 min-h-0 overflow-y-auto lazer-left-content-scroll min-h-[220px] max-h-[360px]">
          {activeTab === 'details' ? (
            <div className="space-y-3 text-xs font-mono pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                  <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Length</div>
                  <div className="text-sm font-black text-white mt-1">-</div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                  <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">BPM</div>
                  <div className="text-sm font-black text-white mt-1">-</div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                  <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Total Objects</div>
                  <div className="text-sm font-black text-white mt-1">-</div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Stars</div>
                <div className="text-sm font-black mt-1" style={getDifficultyColor(0)}>★ -</div>
                </div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-3 text-slate-300 leading-relaxed">
                <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider mb-1">Difficulty Info</div>
                <div className="font-sans font-bold text-white text-sm">-</div>
                <div className="mt-2 text-[10px] text-slate-500">
                  Local ranking only — records set on this device for the selected chart.
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[220px] flex items-center justify-center text-white/85 gap-2.5 font-sans font-normal text-[15px] pt-10">
              <Info className="h-5 w-5 opacity-90 shrink-0" />
              <span>No records yet!</span>
            </div>
          )}
        </div>

        {importStatus && (
          <div className={`p-2.5 rounded-xl text-xs font-mono border mt-2 flex-shrink-0 ${
            importStatus.type === 'ok' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40' : 'bg-rose-950/40 text-rose-400 border-rose-800/40'
          }`}>
            {importStatus.msg}
          </div>
        )}
      </div>
    );
  }

  // Derive status
  const rawStatus = String((selectedMap as any).rankStatus || (selectedMap as any).status || '').toLowerCase();
  const isCatalog = Boolean(selectedMap.catalogSetId || selectedMap.catalogMapId || selectedMap.isServerMap);
  const statusLabel = rawStatus === 'loved' ? 'LOVED' : rawStatus === 'graveyard' ? 'GRAVEYARD' : isCatalog || rawStatus === 'ranked' ? 'RANKED' : 'LOCAL';
  const statusPillClass = statusLabel === 'RANKED'
    ? 'lazer-status-pill is-ranked'
    : statusLabel === 'LOVED'
      ? 'lazer-status-pill is-loved'
      : 'lazer-status-pill is-graveyard';

  // Stats calculation
  const noteCount = selectedMap.notes?.length ?? 0;
  const holdNoteCount = selectedMap.notes?.filter((n) => n.endTime != null).length ?? 0;
  const riceNoteCount = Math.max(0, noteCount - holdNoteCount);
  const keyCount = selectedMap.keyCount || 4;
  const accuracyOd = selectedMap.overallDifficulty ?? 8;
  const hpDrain = selectedMap.hpDrainRate ?? 5;
  const bpmSummary = computeBpmSummary(selectedMap);
  const durationFormatted = formatDuration(selectedMap.duration || 0);

  return (
    <div className="flex flex-col gap-3 w-full h-full min-h-0 overflow-hidden lazer-song-wedge-wrap">
      {/* 1. TOP HEADER BLOCK — hud/songselect.jpg: status, title, artist, plays/favs/length/bpm */}
      <div className="lazer-song-wedge flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={statusPillClass}>
            {statusLabel}
          </span>
        </div>

        {/* Title */}
        <h1
          className="font-sans font-bold text-[26px] lg:text-[30px] text-white tracking-tight leading-[1.05] truncate mt-1.5"
          title={selectedMap.title}
        >
          {selectedMap.title}
        </h1>

        {/* Artist */}
        <div className="text-[13px] text-slate-200/90 font-normal truncate">
          {selectedMap.artist || 'Unknown Artist'}
        </div>

        {/* Meta row: plays / favorites / duration / bpm */}
        <div className="flex items-center gap-4 text-[12px] text-white/80 font-normal mt-1.5">
          <div className="flex items-center gap-1.5" title="Local plays">
            <Play className="h-3 w-3 fill-current opacity-80" />
            <span className="tabular-nums">
              {localScores.length > 0 ? localScores.length.toLocaleString() : '-'}
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleFavorite}
            className={`flex items-center gap-1.5 transition cursor-pointer hover:scale-110 active:scale-95 ${
              isFavorite ? 'text-pink-300' : 'text-white/70 hover:text-pink-200'
            }`}
            title={isFavorite ? 'Remove Favorite' : 'Mark as Favorite'}
          >
            <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-pink-400 stroke-pink-400' : ''}`} />
            <span className="tabular-nums">{isFavorite ? '1' : '-'}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 opacity-80" />
            <span className="tabular-nums">{durationFormatted}</span>
          </div>

          <div className="flex items-center gap-1.5 truncate max-w-[220px]" title={`BPM: ${bpmSummary}`}>
            <Activity className="h-3 w-3 opacity-80 shrink-0" />
            <span className="tabular-nums truncate">{bpmSummary}</span>
          </div>
        </div>

        {/* 2+3. INFO BOX — slanted shell holding the difficulty/mapper
            line and the stats strip (same style as the wedge, 85% opaque). */}
        <div className="lazer-song-infobox">
        {/* 2. DIFFICULTY & MAPPER LINE */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-black" style={getDifficultyColor(currentStarRating)}>
            ★ {currentStarRating.toFixed(2)}
          </span>
          <div className="text-[12px] font-bold text-slate-100 truncate">
            <span className="text-emerald-300 font-bold mr-1.5">{selectedMap.difficulty}</span>
            <span className="text-white/50 font-normal">mapped by</span>{' '}
            <span className="text-slate-100 font-normal">{selectedMap.creator || 'Unknown'}</span>
          </div>
        </div>

        {/* 3. MANIA STATS STRIP — dark rounded parallelogram pinned flush
            to the wedge's bottom-left; straight square corners on the left
            so it connects with the shell. */}
        <div className="lazer-song-statbox">
          <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Notes', value: String(riceNoteCount), fill: Math.min(1, riceNoteCount / 2000) },
            { label: 'Hold Notes', value: String(holdNoteCount), fill: Math.min(1, holdNoteCount / 800) },
            { label: 'Key Count', value: String(keyCount), fill: Math.min(1, keyCount / 10) },
            { label: 'Accuracy', value: accuracyOd.toFixed(0), fill: Math.min(1, accuracyOd / 10) },
            { label: 'HP Drain', value: hpDrain.toFixed(0), fill: Math.min(1, hpDrain / 10) },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] text-white/55 font-normal truncate">{stat.label}</span>
              <span className="text-[12px] font-bold text-white tabular-nums">{stat.value}</span>
              <div className="h-[3px] rounded-full bg-white/15 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-white/80 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(8, stat.fill * 100)}%` }}
                />
              </div>
            </div>
          ))}
          </div>
        </div>
        </div>
      </div>

      {/* 4. TABS & RANKING TOOLBAR — hud refs: Details | Ranking + Scope/Sort/Selected Mods pills */}
      <div className="flex flex-col gap-2 mt-1 flex-shrink-0">
        <div className="flex items-center gap-4 text-[12px] font-bold">
          <button
            type="button"
            onClick={() => onChangeTab('details')}
            className={`pb-1 border-b-2 transition cursor-pointer ${
              activeTab === 'details'
                ? 'text-white border-white'
                : 'text-white/50 hover:text-white/85 border-transparent'
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('ranking')}
            className={`pb-1 border-b-2 transition cursor-pointer ${
              activeTab === 'ranking'
                ? 'text-white border-white'
                : 'text-white/50 hover:text-white/85 border-transparent'
            }`}
          >
            Ranking
          </button>

          {activeTab === 'ranking' && (
            <div className="flex items-center gap-2 ml-3 flex-wrap">
              <span
                className="lazer-ranking-pill is-scope is-locked"
                title="Online rankings unavailable — local scores only"
                aria-disabled="true"
              >
                <span className="opacity-60 font-bold">Scope</span>
                <span>Local</span>
                <Lock className="h-3 w-3 opacity-60" />
              </span>
              <span className="lazer-ranking-sort-wrap">
                <button
                  type="button"
                  onClick={() => setSortOpen((v) => !v)}
                  className="lazer-ranking-pill is-button"
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                >
                  <span className="opacity-60 font-bold">Sort</span>
                  <span>{activeSortLabel}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                {sortOpen && (
                  <>
                    <span
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setSortOpen(false)}
                    />
                    <span className="lazer-ranking-sort-menu" role="listbox">
                      {RANKING_SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          role="option"
                          aria-selected={rankingSort === opt.key}
                          onClick={() => {
                            setRankingSort(opt.key);
                            setSortOpen(false);
                          }}
                          className={`lazer-ranking-sort-option${rankingSort === opt.key ? ' is-selected' : ''}`}
                        >
                          {opt.label}
                          {rankingSort === opt.key && <Check className="h-3 w-3" />}
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => setModsOnly((v) => !v)}
                className={`lazer-ranking-pill is-button${modsOnly ? ' is-active' : ' opacity-80'}`}
                aria-pressed={modsOnly}
                title={
                  selectedMods.length === 0
                    ? 'Show only plays with no mods'
                    : `Show only plays set with: ${selectedMods.join(' ')}`
                }
              >
                Selected Mods
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. CONTENT BODY: DETAILS OR LOCAL RANKINGS — the only scroll region */}
      <div className="flex-1 min-h-0 overflow-y-auto lazer-left-content-scroll min-h-[220px] max-h-[360px]">
        {activeTab === 'details' ? (
          <div className="space-y-3 text-xs font-mono pt-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Length</div>
                <div className="text-sm font-black text-white mt-1">{durationFormatted}</div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">BPM</div>
                <div className="text-sm font-black text-white mt-1">{bpmSummary}</div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Total Objects</div>
                <div className="text-sm font-black text-white mt-1">{noteCount}</div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Stars</div>
                <div className="text-sm font-black mt-1" style={getDifficultyColor(currentStarRating)}>★ {currentStarRating.toFixed(2)}</div>
              </div>
            </div>
            <div className="rounded-xl bg-black/40 border border-white/5 p-3 text-slate-300 leading-relaxed">
              <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider mb-1">Difficulty Info</div>
              <div className="font-sans font-bold text-white text-sm">{selectedMap.difficulty}</div>
              <div className="mt-2 text-[10px] text-slate-500">
                Local ranking only — records set on this device for the selected chart.
              </div>
            </div>
          </div>
        ) : displayedScores.length === 0 ? (
          localScores.length === 0 ? (
            /* EMPTY LOCAL RANKING STATE — hud/songselect.jpg centered notice */
            <div className="h-full min-h-[220px] flex items-center justify-center text-white/85 gap-2.5 font-sans font-normal text-[15px] pt-10">
              <Info className="h-5 w-5 opacity-90 shrink-0" />
              <span>No records yet!</span>
            </div>
          ) : (
            /* FILTERED EMPTY STATE — scores exist but none match Selected Mods */
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-2 text-white/70 font-sans text-[13px] pt-10 text-center px-6">
              <Info className="h-5 w-5 opacity-80 shrink-0" />
              <span>No records with the selected mods yet!</span>
              <button
                type="button"
                onClick={() => setModsOnly(false)}
                className="mt-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[11px] font-bold transition cursor-pointer"
              >
                Show all local scores
              </button>
            </div>
          )
        ) : (
          /* LOCAL RANKING LIST — visual-refs/hud/leftscores base, local scope only */
          <div className="lazer-ranking-list">
            <div className="lazer-ranking-personal-best">
              Personal Best (#1 of {displayedScores.length})
              {modsOnly && (
                <span className="lazer-ranking-personal-best-mods">
                  {selectedMods.length === 0 ? 'Nomod' : selectedMods.join(' ')}
                </span>
              )}
            </div>
            {displayedScores.map((score, idx) => {
              const playerName = score.playedBy || settings.localDisplayName || 'Guest';
              const initial = (playerName.trim().charAt(0) || 'G').toUpperCase();
              const grade = String(score.grade || 'F').toUpperCase();
              return (
                <div
                  key={score.id || idx}
                  data-grade={grade}
                  className={`lazer-ranking-row${idx === 0 ? ' is-personal-best' : ''}`}
                >
                  <span className="lazer-ranking-pos">#{idx + 1}</span>
                  <span className="lazer-ranking-avatar" aria-hidden="true">
                    {initial}
                  </span>
                  <span className="lazer-ranking-identity">
                    <span className="lazer-ranking-age">{formatRankingAge(score.timestamp)}</span>
                    <span className="lazer-ranking-name" title={playerName}>
                      {playerName}
                    </span>
                    {score.mods && score.mods.length > 0 && (
                      <span className="lazer-ranking-mods">
                        {score.mods.map((mod) => (
                          <span key={mod} className="lazer-ranking-mod">
                            {mod}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="lazer-ranking-combo">
                    <span className="lazer-ranking-cap">Max Combo</span>
                    <span className="lazer-ranking-combo-val">{score.maxCombo}x</span>
                  </span>
                  <span className="lazer-ranking-acc">
                    <span className="lazer-ranking-cap">Accuracy</span>
                    <span className="lazer-ranking-acc-val">{score.accuracy.toFixed(2)}%</span>
                  </span>
                  <span className="lazer-ranking-score">{score.score.toLocaleString()}</span>
                  <span className={`lazer-ranking-grade is-${grade.toLowerCase()}`} title={`Grade ${grade}`}>
                    {grade}
                  </span>
                  {onWatchReplay && (
                    <button
                      type="button"
                      onClick={() => onWatchReplay(score, selectedMap)}
                      className="lazer-ranking-replay"
                      title="Watch Local Replay"
                      aria-label={`Watch replay of ${score.score.toLocaleString()} by ${playerName}`}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {importStatus && (
        <div className={`p-2.5 rounded-xl text-xs font-mono border mt-2 flex-shrink-0 ${
          importStatus.type === 'ok' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40' : 'bg-rose-950/40 text-rose-400 border-rose-800/40'
        }`}>
          {importStatus.msg}
        </div>
      )}
    </div>
  );
};