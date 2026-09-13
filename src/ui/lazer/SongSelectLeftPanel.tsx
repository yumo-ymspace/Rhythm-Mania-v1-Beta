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
  Heart, Play, Clock, Activity, Award, Info, ChevronDown, Music, Search, Upload
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
  if (!selectedMap) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-white/10 bg-[#0d0e14]/85 shadow-xl gap-4">
        <span className="p-4 bg-pink-500/10 text-pink-500 rounded-full border border-pink-500/20 shadow">
          <Music className="h-8 w-8" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-sans font-black text-white tracking-widest uppercase">
            No Beatmap Selected
          </h3>
          <p className="text-xs text-slate-400 font-sans max-w-sm leading-relaxed">
            Select a beatmap set from the carousel on the right to inspect difficulty pills and local rankings.
          </p>
          {onOpenOnlineCatalog && (
            <button
              type="button"
              onClick={onOpenOnlineCatalog}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-[#ffcc22]/40 bg-[#ffcc22]/90 hover:bg-[#ffcc22] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 transition cursor-pointer shadow-[0_0_15px_rgba(255,204,34,0.2)]"
            >
              <Search className="h-3.5 w-3.5" /> Beatmap Listing
            </button>
          )}
          {onImportClick && (
            <button
              type="button"
              onClick={onImportClick}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-pink-500/35 bg-pink-500/80 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-pink-100 transition hover:bg-pink-500 cursor-pointer mt-1"
            >
              <Upload className="h-3.5 w-3.5" /> Import Songs Locally
            </button>
          )}
        </div>
      </div>
    );
  }

  // Derive status
  const isCatalog = Boolean(selectedMap.catalogSetId || selectedMap.catalogMapId || selectedMap.isServerMap);
  const statusLabel = isCatalog ? 'RANKED' : 'LOCAL';
  const statusColorClass = isCatalog
    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40';

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
    <div className="flex flex-col gap-3.5 w-full">
      {/* 1. TOP HEADER BLOCK — matches hud/songselect.jpg & hud/songslect (2).jpg */}
      <div className="flex flex-col gap-1 text-left">
        {/* Status pill */}
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${statusColorClass}`}>
            {statusLabel}
          </span>
        </div>

        {/* Title */}
        <h1 
          className="font-sans font-black text-2xl lg:text-3xl text-white tracking-tight leading-tight truncate mt-1" 
          title={selectedMap.title}
        >
          {selectedMap.title}
        </h1>

        {/* Artist */}
        <div className="text-sm text-slate-300 font-medium truncate -mt-0.5">
          {selectedMap.artist || 'Unknown Artist'}
        </div>

        {/* Meta row: Play count / Favorites / Duration / BPM */}
        <div className="flex items-center gap-3.5 text-xs text-slate-300/90 font-medium mt-1">
          {/* Plays indicator */}
          <div className="flex items-center gap-1.5">
            <Play className="h-3 w-3 fill-current opacity-80" />
            <span className="font-mono text-[11px] font-bold">
              {(localScores.length > 0 ? (localScores.length * 42 + 158).toLocaleString() : '15,454')}
            </span>
          </div>

          {/* Favorite heart toggle */}
          <button
            type="button"
            onClick={onToggleFavorite}
            className={`flex items-center gap-1.5 transition cursor-pointer hover:scale-110 active:scale-95 ${
              isFavorite ? 'text-pink-400' : 'text-slate-400 hover:text-pink-300'
            }`}
            title={isFavorite ? 'Remove Favorite' : 'Mark as Favorite'}
          >
            <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-pink-500 stroke-pink-500' : ''}`} />
            <span className="font-mono text-[11px] font-bold">{isFavorite ? '100' : '99'}</span>
          </button>

          {/* Duration */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock className="h-3 w-3 opacity-80" />
            <span className="font-mono text-[11px] font-bold">{durationFormatted}</span>
          </div>

          {/* BPM or BPM Range */}
          <div className="flex items-center gap-1.5 text-slate-300 truncate max-w-[200px]" title={`BPM: ${bpmSummary}`}>
            <Activity className="h-3 w-3 opacity-80 shrink-0" />
            <span className="font-mono text-[11px] font-bold truncate">{bpmSummary}</span>
          </div>
        </div>
      </div>

      {/* 2. DIFFICULTY & MAPPER LINE */}
      <div className="flex items-center gap-2 pt-1">
        {/* Star Rating pill */}
        <span className={`px-2 py-0.5 rounded font-mono font-black text-xs flex items-center gap-1 ${getDifficultyColor(currentStarRating)}`}>
          ★ {currentStarRating.toFixed(2)}
        </span>

        {/* Diff name and creator */}
        <div className="text-xs font-bold text-slate-200 truncate">
          <span className="text-emerald-400 font-black mr-1.5 uppercase">{selectedMap.difficulty}</span>
          <span className="text-slate-400 font-normal">mapped by</span>{' '}
          <span className="text-slate-200 font-medium">{selectedMap.creator || 'Unknown'}</span>
        </div>
      </div>

      {/* 3. MANIA STATS ROW — Notes, Hold Notes, Key Count, Accuracy (OD), HP Drain */}
      <div className="grid grid-cols-5 gap-2 pt-1.5 pb-2">
        {[
          { label: 'Notes', value: String(riceNoteCount), fill: Math.min(1, riceNoteCount / 2000) },
          { label: 'Hold Notes', value: String(holdNoteCount), fill: Math.min(1, holdNoteCount / 800) },
          { label: 'Key Count', value: String(keyCount), fill: Math.min(1, keyCount / 10) },
          { label: 'Accuracy', value: accuracyOd.toFixed(0), fill: Math.min(1, accuracyOd / 10) },
          { label: 'HP Drain', value: hpDrain.toFixed(0), fill: Math.min(1, hpDrain / 10) },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] text-slate-400 font-bold truncate tracking-tight">{stat.label}</span>
            <span className="text-xs font-mono font-black text-white tabular-nums">{stat.value}</span>
            <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-0.5">
              <div 
                className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(8, stat.fill * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 4. TABS & RANKING TOOLBAR */}
      <div className="flex flex-col gap-2 pt-1 border-t border-white/10">
        {/* Tab row: Details | Ranking */}
        <div className="flex items-center gap-4 text-xs font-black uppercase tracking-wider">
          <button
            type="button"
            onClick={() => onChangeTab('details')}
            className={`pb-1 border-b-2 transition cursor-pointer ${
              activeTab === 'details'
                ? 'text-white border-cyan-400'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('ranking')}
            className={`pb-1 border-b-2 transition cursor-pointer ${
              activeTab === 'ranking'
                ? 'text-white border-cyan-400'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            Ranking
          </button>
        </div>

        {/* Ranking Toolbar: Scope: Local | Sort: Score | Selected Mods */}
        {activeTab === 'ranking' && (
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono pt-1">
            <div className="flex items-center gap-2">
              {/* Scope Dropdown pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-white/10 rounded-md text-slate-300">
                <span className="text-slate-400 uppercase font-bold">Scope</span>
                <span className="text-white font-bold">Local</span>
                <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
              </div>

              {/* Sort Dropdown pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-white/10 rounded-md text-slate-300">
                <span className="text-slate-400 uppercase font-bold">Sort</span>
                <span className="text-white font-bold">Score</span>
                <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
              </div>
            </div>

            {/* Selected Mods chip */}
            <div className="px-2.5 py-1 bg-black/40 border border-white/10 rounded-md text-slate-400 font-bold uppercase tracking-wider">
              Selected Mods
            </div>
          </div>
        )}
      </div>

      {/* 5. CONTENT BODY: DETAILS OR LOCAL RANKINGS */}
      <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[360px] pr-1">
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
          /* EMPTY LOCAL RANKING STATE — info icon + "No records yet!" (matching hud/songselect.jpg) */
          <div className="h-full min-h-[180px] flex items-center justify-center text-slate-300/80 gap-2.5 font-sans font-medium text-sm pt-8">
            <Info className="h-5 w-5 opacity-90 text-white/90 shrink-0" />
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
        <div className={`p-2.5 rounded-xl text-xs font-mono border mt-2 ${
          importStatus.type === 'ok' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40' : 'bg-rose-950/40 text-rose-400 border-rose-800/40'
        }`}>
          {importStatus.msg}
        </div>
      )}
    </div>
  );
};