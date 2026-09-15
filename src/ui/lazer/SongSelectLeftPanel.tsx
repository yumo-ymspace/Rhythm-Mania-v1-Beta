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
import {
  Heart, Play, Clock, Activity, Award, Info, ChevronDown
} from 'lucide-react';
import { Beatmap, GameSettings, PlayHistoryRecord } from '../../types';
import { calculateDominantBpm } from '../../utils/beatmapParser';

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
  getDifficultyColor: (rating: number) => string;
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

          {/* 2. DIFFICULTY & MAPPER LINE */}
          <div className="flex items-center gap-2 mt-2.5">
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-black ${getDifficultyColor(0)}`}>
              ★ -
            </span>
            <div className="text-[12px] font-bold text-slate-100 truncate">
              <span className="text-emerald-300 font-bold mr-1.5">-</span>
              <span className="text-white/50 font-normal">mapped by</span>{' '}
              <span className="text-slate-100 font-normal">-</span>
            </div>
          </div>

          {/* 3. MANIA STATS ROW */}
          <div className="grid grid-cols-5 gap-3 mt-3">
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
              <div className="flex items-center gap-2 ml-3">
                <span className="lazer-ranking-pill">
                  <span className="opacity-60 font-bold">Scope</span>
                  <span>Local</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </span>
                <span className="lazer-ranking-pill">
                  <span className="opacity-60 font-bold">Sort</span>
                  <span>Score</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </span>
                <span className="lazer-ranking-pill opacity-80">Selected Mods</span>
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
                  <div className={`text-sm font-black mt-1 ${getDifficultyColor(0)}`}>★ -</div>
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

        {/* 2. DIFFICULTY & MAPPER LINE */}
        <div className="flex items-center gap-2 mt-2.5">
          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-black ${getDifficultyColor(currentStarRating)}`}>
            ★ {currentStarRating.toFixed(2)}
          </span>
          <div className="text-[12px] font-bold text-slate-100 truncate">
            <span className="text-emerald-300 font-bold mr-1.5">{selectedMap.difficulty}</span>
            <span className="text-white/50 font-normal">mapped by</span>{' '}
            <span className="text-slate-100 font-normal">{selectedMap.creator || 'Unknown'}</span>
          </div>
        </div>

        {/* 3. MANIA STATS ROW */}
        <div className="grid grid-cols-5 gap-3 mt-3">
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
            <div className="flex items-center gap-2 ml-3">
              <span className="lazer-ranking-pill">
                <span className="opacity-60 font-bold">Scope</span>
                <span>Local</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </span>
              <span className="lazer-ranking-pill">
                <span className="opacity-60 font-bold">Sort</span>
                <span>Score</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </span>
              <span className="lazer-ranking-pill opacity-80">Selected Mods</span>
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
                <div className={`text-sm font-black mt-1 ${getDifficultyColor(currentStarRating)}`}>★ {currentStarRating.toFixed(2)}</div>
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
        ) : localScores.length === 0 ? (
          /* EMPTY LOCAL RANKING STATE — hud/songselect.jpg centered notice */
          <div className="h-full min-h-[220px] flex items-center justify-center text-white/85 gap-2.5 font-sans font-normal text-[15px] pt-10">
            <Info className="h-5 w-5 opacity-90 shrink-0" />
            <span>No records yet!</span>
          </div>
        ) : (
          /* POPULATED LOCAL RANKING LIST */
          <div className="space-y-1.5 pt-2">
            {localScores.map((score, idx) => (
              <div
                key={score.id || idx}
                className="p-2.5 bg-black/50 border border-white/5 hover:border-white/20 rounded-xl flex items-center justify-between gap-3 text-xs font-mono transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Rank badge */}
                  <span className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-black shrink-0 ${
                    idx === 0 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' :
                    idx === 1 ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/40' :
                    idx === 2 ? 'bg-orange-400/20 text-orange-300 border border-orange-400/40' :
                    'bg-white/5 text-slate-400 border border-white/10'
                  }`}>
                    #{idx + 1}
                  </span>

                  {/* Grade letter badge */}
                  <span className={`w-7 h-6 flex items-center justify-center rounded text-[10px] font-black shrink-0 ${getGradeBadgeClass(score.grade)}`}>
                    {score.grade}
                  </span>

                  {/* Score details */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white text-sm tracking-tight">
                        {score.score.toLocaleString()}
                      </span>
                      {score.mods && score.mods.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          {score.mods.map((mod) => (
                            <span key={mod} className="px-1 py-0.2 bg-white/10 rounded text-[8px] font-black text-slate-300">
                              {mod}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                      <span>{score.accuracy.toFixed(2)}%</span>
                      <span>•</span>
                      <span>{score.maxCombo}x</span>
                      <span>•</span>
                      <span className="truncate max-w-[100px] text-slate-500">
                        {score.playedBy || settings.localDisplayName || 'Guest'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Replay Spectate Button */}
                {onWatchReplay && (
                  <button
                    type="button"
                    onClick={() => onWatchReplay(score, selectedMap)}
                    className="p-2 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-300 rounded-lg transition cursor-pointer shrink-0"
                    title="Watch Local Replay"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </button>
                )}
              </div>
            ))}
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