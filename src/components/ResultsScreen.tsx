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

import React, { useState, useMemo } from 'react';
import { 
  RotateCcw, 
  ChevronLeft, 
  Video, 
  ArrowLeft, 
  Trash2, 
  Download, 
  Trophy, 
  Award,
  Layers
} from 'lucide-react';
import { Beatmap, ScoreState, PlayHistoryRecord } from '../types';
import { sanitizeCssUrl } from '../utils/securityLimits';
import { downloadReplayExport } from '../utils/replayTransfer';
import { computeGradeFromScoreState } from '../ruleset/mania/scoreProcessor';
import HitErrorGraph from './HitErrorGraph';
import { resolveStarRating } from '../utils/starRating';
import { getSpeedMultiplier } from '../ruleset/mania/hitWindows';
import { formatPenar } from '../utils/penar';

interface ResultsScreenProps {
  scoreState: ScoreState;
  beatmap: Beatmap;
  playHistory?: PlayHistoryRecord[];
  currentMods?: string[];
  hitErrors?: number[] | null;
  onRetry: () => void;
  onWatchReplay?: (record: PlayHistoryRecord) => Promise<{ success: boolean; error?: string }> | void;
  onBack: () => void;
  onBackToHistory?: () => void;
  onDeleteRecord?: (id: string) => void;
}

function getDifficultyColor(rating: number): string {
  if (rating < 2.0) return 'text-emerald-400';
  if (rating < 3.5) return 'text-sky-400';
  if (rating < 5.0) return 'text-amber-400';
  if (rating < 6.5) return 'text-rose-400';
  if (rating < 8.0) return 'text-purple-400';
  return 'text-slate-100';
}

function getGradeBadgeStyle(grade: string): { bg: string; text: string; border: string; glow: string } {
  switch (grade) {
    case 'SS':
      return {
        bg: 'bg-zinc-100/15',
        text: 'text-zinc-100',
        border: 'border-zinc-200/40',
        glow: 'shadow-[0_0_12px_rgba(255,255,255,0.35)]',
      };
    case 'S':
      return {
        bg: 'bg-amber-400/15',
        text: 'text-amber-300',
        border: 'border-amber-400/40',
        glow: 'shadow-[0_0_12px_rgba(250,204,21,0.35)]',
      };
    case 'A':
      return {
        bg: 'bg-emerald-400/15',
        text: 'text-emerald-300',
        border: 'border-emerald-400/40',
        glow: 'shadow-[0_0_10px_rgba(52,211,153,0.3)]',
      };
    case 'B':
      return {
        bg: 'bg-blue-400/15',
        text: 'text-blue-300',
        border: 'border-blue-400/40',
        glow: 'shadow-[0_0_10px_rgba(96,165,250,0.3)]',
      };
    case 'C':
      return {
        bg: 'bg-pink-400/15',
        text: 'text-pink-300',
        border: 'border-pink-400/40',
        glow: 'shadow-[0_0_10px_rgba(244,114,182,0.3)]',
      };
    case 'D':
      return {
        bg: 'bg-rose-400/15',
        text: 'text-rose-300',
        border: 'border-rose-400/40',
        glow: 'shadow-[0_0_10px_rgba(251,113,133,0.3)]',
      };
    case 'F':
    default:
      return {
        bg: 'bg-rose-600/15',
        text: 'text-rose-400',
        border: 'border-rose-600/40',
        glow: 'shadow-[0_0_10px_rgba(225,29,72,0.3)]',
      };
  }
}

export default function ResultsScreen({
  scoreState,
  beatmap,
  playHistory = [],
  currentMods,
  hitErrors,
  onRetry,
  onWatchReplay,
  onBack,
  onBackToHistory,
  onDeleteRecord
}: ResultsScreenProps) {
  // 1. Gather all local non-failed records for this beatmap on this device
  const mapRecords = useMemo(() => {
    const baseId = beatmap.id.includes('_converted_')
      ? beatmap.id.split('_converted_')[0]
      : beatmap.id;
    return playHistory
      .filter(r =>
        !r.isFailed && (
          r.beatmapId === beatmap.id ||
          (baseId && r.beatmapId === baseId) ||
          (beatmap.catalogMapId && r.catalogMapId === beatmap.catalogMapId) ||
          (beatmap.beatmapHash && r.beatmapHash === beatmap.beatmapHash) ||
          (beatmap.chartRevisionId && r.chartRevisionId === beatmap.chartRevisionId)
        )
      );
  }, [playHistory, beatmap.id, beatmap.catalogMapId, beatmap.beatmapHash, beatmap.chartRevisionId]);

  // Sort toggle for local score panel: 'rank' (score desc) or 'recent' (date desc)
  const [scoreListSort, setScoreListSort] = useState<'rank' | 'recent'>('rank');

  // Sorted local scores list
  const sortedMapRecords = useMemo(() => {
    const list = [...mapRecords];
    if (scoreListSort === 'rank') {
      return list.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
    }
    return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [mapRecords, scoreListSort]);

  // 2. Local selection state for inspecting runs
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  // 3. Resolve active run or fallback to current scoreState
  const activeRecord = useMemo(() => {
    if (selectedRecordId) {
      return mapRecords.find(r => r.id === selectedRecordId) || null;
    }
    if (scoreState.recordId) {
      const matchById = mapRecords.find(r => r.id === scoreState.recordId);
      if (matchById) return matchById;
    }
    return null;
  }, [selectedRecordId, mapRecords, scoreState]);

  const activeScoreState = activeRecord ? activeRecord.scoreState : scoreState;
  const activeMods = activeRecord ? activeRecord.mods : (currentMods || undefined);

  const {
    score,
    maxCombo,
    accuracy,
    marvelousCount,
    perfectCount,
    greatCount,
    goodCount,
    badCount,
    missCount
  } = activeScoreState;

  // Grade character and Argon theme styling
  const gradeChar = computeGradeFromScoreState(activeScoreState);

  const getGradeTheme = (char: string) => {
    switch (char) {
      case 'SS':
        return {
          char: 'SS',
          textColor: 'text-zinc-100',
          borderColor: 'border-zinc-200/80',
          radialGlow: 'rgba(255, 255, 255, 0.22)',
          outerShadow: 'shadow-[0_0_50px_rgba(255,255,255,0.4)]',
          ringStroke: '#f4f4f5',
          accentColor: '#ffffff'
        };
      case 'S':
        return {
          char: 'S',
          textColor: 'text-amber-300',
          borderColor: 'border-amber-400/80',
          radialGlow: 'rgba(251, 191, 36, 0.22)',
          outerShadow: 'shadow-[0_0_55px_rgba(251,191,36,0.45)]',
          ringStroke: '#facc15',
          accentColor: '#fbbf24'
        };
      case 'A':
        return {
          char: 'A',
          textColor: 'text-emerald-300',
          borderColor: 'border-emerald-400/80',
          radialGlow: 'rgba(52, 211, 153, 0.20)',
          outerShadow: 'shadow-[0_0_45px_rgba(52,211,153,0.35)]',
          ringStroke: '#34d399',
          accentColor: '#34d399'
        };
      case 'B':
        return {
          char: 'B',
          textColor: 'text-blue-300',
          borderColor: 'border-blue-400/80',
          radialGlow: 'rgba(96, 165, 250, 0.20)',
          outerShadow: 'shadow-[0_0_45px_rgba(96,165,250,0.35)]',
          ringStroke: '#60a5fa',
          accentColor: '#60a5fa'
        };
      case 'C':
        return {
          char: 'C',
          textColor: 'text-pink-300',
          borderColor: 'border-pink-400/80',
          radialGlow: 'rgba(244, 114, 182, 0.20)',
          outerShadow: 'shadow-[0_0_45px_rgba(244,114,182,0.35)]',
          ringStroke: '#f472b6',
          accentColor: '#f472b6'
        };
      case 'D':
        return {
          char: 'D',
          textColor: 'text-rose-400',
          borderColor: 'border-rose-400/80',
          radialGlow: 'rgba(251, 113, 133, 0.20)',
          outerShadow: 'shadow-[0_0_45px_rgba(251,113,133,0.35)]',
          ringStroke: '#fb7185',
          accentColor: '#fb7185'
        };
      case 'F':
      default:
        return {
          char: 'F',
          textColor: 'text-rose-500',
          borderColor: 'border-rose-600/80',
          radialGlow: 'rgba(225, 29, 72, 0.25)',
          outerShadow: 'shadow-[0_0_45px_rgba(225,29,72,0.4)]',
          ringStroke: '#e11d48',
          accentColor: '#e11d48'
        };
    }
  };

  const gradeTheme = getGradeTheme(gradeChar);

  // Check if this active run is the all-time local high score on this device
  const isNewRecord = useMemo(() => {
    if (activeScoreState.isAutoplay || (activeMods && activeMods.includes('AT'))) return false;
    if (mapRecords.length <= 1) return true;
    const otherScores = mapRecords
      .filter(r => r.id !== (activeRecord?.id || scoreState.recordId))
      .map(r => r.score);
    if (otherScores.length === 0) return true;
    return score >= Math.max(...otherScores);
  }, [mapRecords, activeRecord, scoreState.recordId, score, activeScoreState.isAutoplay, activeMods]);

  const formatDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Unknown';
    }
  };

  // Star rating shown must be the one that drove the PP curve: the stored
  // PENAR breakdown carries the exact (rate-adjusted) strain SR from gameplay.
  // Fall back to a rate-aware resolve so DT/HT displays stay consistent.
  const penarStarRating = activeScoreState.penar &&
    typeof activeScoreState.penar.starRating === 'number' &&
    Number.isFinite(activeScoreState.penar.starRating) &&
    activeScoreState.penar.starRating >= 0
    ? activeScoreState.penar.starRating
    : null;
  const starRating = penarStarRating ?? resolveStarRating(beatmap, getSpeedMultiplier(activeMods));
  const totalJudgements = (marvelousCount + perfectCount + greatCount + goodCount + badCount + missCount) || 1;

  // osu!(lazer) mania judgement stats list
  const judgements = [
    {
      name: 'Perfect',
      count: marvelousCount,
      color: '#22d3ee',
      pillClass: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
      barClass: 'bg-cyan-400',
    },
    {
      name: 'Great',
      count: perfectCount,
      color: '#3b82f6',
      pillClass: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
      barClass: 'bg-blue-400',
    },
    {
      name: 'Good',
      count: greatCount,
      color: '#4ade80',
      pillClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      barClass: 'bg-emerald-400',
    },
    {
      name: 'Ok',
      count: goodCount,
      color: '#fb923c',
      pillClass: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
      barClass: 'bg-orange-400',
    },
    {
      name: 'Meh',
      count: badCount,
      color: '#facc15',
      pillClass: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
      barClass: 'bg-yellow-400',
    },
    {
      name: 'Miss',
      count: missCount,
      color: '#ef4444',
      pillClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
      barClass: 'bg-rose-500',
    },
  ];

  return (
    <div 
      id="results-screen-container" 
      className="relative flex flex-col h-full w-full text-slate-100 overflow-hidden bg-zinc-950 select-none"
    >
      {/* 1. FULL VIEWPORT AMBIENT BEATMAP BACKGROUND */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center pointer-events-none filter blur-md opacity-25 scale-105 transition-all duration-700"
        style={{ backgroundImage: sanitizeCssUrl(beatmap.bgUrl || '/backgrounds/nikio.webp') }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-zinc-950/80 via-zinc-950/90 to-zinc-950 pointer-events-none" />

      {/* 2. TOP HEADER / BEATMAP INFO CARD */}
      <header className="h-16 w-full bg-zinc-950/85 backdrop-blur-md border-b border-white/10 px-4 md:px-8 flex items-center justify-between z-20 relative shrink-0">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          {onBackToHistory && (
            <button 
              onClick={onBackToHistory}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-white flex items-center gap-1.5 transition-all cursor-pointer border border-white/10 font-bold text-xs uppercase tracking-wider shrink-0"
              title="Back to Performance History"
            >
              <ChevronLeft className="w-4 h-4 text-skin-accent" />
              <span>History</span>
            </button>
          )}

          <div className="flex flex-col text-left min-w-0">
            <h2 className="text-sm md:text-base font-black text-white font-sans truncate tracking-tight leading-tight">
              {beatmap.title}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold tracking-wider mt-0.5 truncate">
              <span className="truncate">{beatmap.artist}</span>
              <span>•</span>
              <span className="font-bold text-slate-300 truncate">[{beatmap.difficulty}]</span>
              <span>•</span>
              <span className={`font-black ${getDifficultyColor(starRating)}`}>★ {starRating.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Right Header Chips */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="px-3 py-1 bg-skin-accent-dim text-skin-accent text-[10px] tracking-widest font-mono font-black border border-skin-accent/25 rounded-full shadow-lg">
            {beatmap.keyCount}K
          </span>
        </div>
      </header>

      {/* 3. MAIN BODY: TWO-COLUMN LAYOUT */}
      <div className="flex-1 w-full overflow-hidden flex z-10">
        
        {/* ============================================================== */}
        {/* COLUMN 1: LOCAL SCORES PANEL (This Device Only) */}
        {/* ============================================================== */}
        <aside 
          className="w-full lg:w-80 xl:w-96 shrink-0 h-full bg-zinc-950/70 border-r border-white/10 flex-col flex"
        >
          {/* Panel Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-zinc-900/40">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  Local Ranking
                </h3>
                <p className="text-[9px] font-mono text-slate-400">
                  Scores on this device ({mapRecords.length})
                </p>
              </div>
            </div>

            {/* Sort Toggle */}
            <div className="flex items-center bg-zinc-950/80 p-0.5 rounded-lg border border-white/10 text-[10px] font-mono">
              <button
                onClick={() => setScoreListSort('rank')}
                className={`px-2 py-0.5 rounded font-bold uppercase transition-all ${
                  scoreListSort === 'rank' ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Sort by highest score"
              >
                Score
              </button>
              <button
                onClick={() => setScoreListSort('recent')}
                className={`px-2 py-0.5 rounded font-bold uppercase transition-all ${
                  scoreListSort === 'recent' ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Sort by most recent"
              >
                Date
              </button>
            </div>
          </div>

          {/* Scores Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {sortedMapRecords.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                <Award className="h-8 w-8 opacity-30 text-slate-400" />
                <p className="font-sans font-bold text-xs uppercase tracking-wider text-slate-400">
                  No local plays recorded
                </p>
                <p className="text-[10px] font-mono text-slate-600">
                  Scores achieved on this device will appear here.
                </p>
              </div>
            ) : (
              sortedMapRecords.map((run, idx) => {
                const isSelected = activeRecord ? activeRecord.id === run.id : (!selectedRecordId && run.id === scoreState.recordId);
                const badgeStyle = getGradeBadgeStyle(run.grade);

                return (
                  <button
                    key={run.id || idx}
                    type="button"
                    onClick={() => {
                      setSelectedRecordId(run.id);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-zinc-900/90 border-skin-accent shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                        : 'bg-zinc-950/60 hover:bg-zinc-900/50 border-white/5 hover:border-white/15'
                    }`}
                  >
                    {/* Active highlight marker */}
                    {isSelected && (
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-skin-accent" />
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Rank Badge */}
                        <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-black shrink-0 font-mono ${
                          idx === 0 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' :
                          idx === 1 ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/40' :
                          idx === 2 ? 'bg-orange-400/20 text-orange-300 border border-orange-400/40' :
                          'bg-white/5 text-slate-400 border border-white/10'
                        }`}>
                          #{idx + 1}
                        </span>

                        {/* Grade Badge */}
                        <span className={`w-7 h-5 flex items-center justify-center rounded text-[10px] font-black font-mono shrink-0 border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border} ${badgeStyle.glow}`}>
                          {run.grade}
                        </span>

                        {/* Total Score */}
                        <span className="font-mono font-black text-sm text-white tracking-tight">
                          {run.score.toLocaleString()}
                        </span>
                      </div>

                      {/* Active Tag */}
                      {isSelected && (
                        <span className="text-[8px] font-black uppercase font-mono px-1.5 py-0.5 rounded bg-skin-accent/20 text-skin-accent border border-skin-accent/40">
                          Viewing
                        </span>
                      )}
                    </div>

                    {/* Secondary Row: Accuracy, Max Combo, Date, Mods */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pl-7">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-200">{run.accuracy.toFixed(2)}%</span>
                        <span>•</span>
                        <span>{run.maxCombo}x</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {run.mods && run.mods.length > 0 && (
                          <div className="flex items-center gap-0.5 mr-1">
                            {run.mods.slice(0, 3).map(m => (
                              <span key={m} className="px-1 py-0.2 bg-white/10 rounded text-[8px] font-black text-pink-300">
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="text-slate-500">{formatDate(run.timestamp)}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ============================================================== */}
        {/* COLUMN 2: ARGON RESULTS HERO & DETAILS */}
        {/* ============================================================== */}
        <main 
          className="flex-1 h-full overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-start flex"
        >
          <div className="w-full max-w-4xl flex flex-col items-center gap-6 pb-20">
            
            {/* HERO CARD: GRADE EMBLEM + SCORE + ACCURACY + COMBO + PENAR */}
            <div className="w-full bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.7)] relative overflow-hidden">
              {/* Subtle background ambient glow for the grade */}
              <div 
                className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full pointer-events-none filter blur-3xl opacity-40 transition-all duration-700"
                style={{ backgroundColor: gradeTheme.radialGlow }}
              />

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-center relative z-10">
                
                {/* LEFT HERO: CIRCULAR ARGON GRADE BADGE */}
                <div className="md:col-span-4 flex flex-col items-center justify-center">
                  <div 
                    className={`relative w-36 h-36 md:w-44 md:h-44 rounded-full border-4 ${gradeTheme.borderColor} ${gradeTheme.outerShadow} flex flex-col items-center justify-center transition-all duration-500`}
                    style={{ backgroundColor: gradeTheme.radialGlow }}
                  >
                    {/* SVG ring accent */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                      <circle 
                        cx="50" cy="50" r="46" 
                        fill="none" 
                        stroke="rgba(255,255,255,0.06)" 
                        strokeWidth="3" 
                      />
                      <circle 
                        cx="50" cy="50" r="46" 
                        fill="none" 
                        stroke={gradeTheme.ringStroke} 
                        strokeWidth="3" 
                        strokeDasharray="289" 
                        strokeDashoffset={289 - (289 * (accuracy / 100))}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                    </svg>

                    {/* Giant Grade Letter */}
                    <span 
                      className={`font-sans font-black tracking-tight text-6xl md:text-7xl leading-none uppercase ${gradeTheme.textColor} select-none drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] z-10`}
                    >
                      {gradeTheme.char}
                    </span>

                    {/* Accuracy inside ring */}
                    <span className="text-white/95 text-xs md:text-sm font-mono font-black tracking-wider mt-1 drop-shadow z-10">
                      {accuracy.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* RIGHT HERO: SCORE, METRICS, PENAR, MODS */}
                <div className="md:col-span-8 flex flex-col items-center md:items-start text-center md:text-left gap-3">
                  
                  {/* Score Label + Badges */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-zinc-400 font-sans font-black text-xs uppercase tracking-widest">
                      Total Score
                    </span>

                    {(activeScoreState.isAutoplay || (activeMods && activeMods.includes('AT'))) ? (
                      <span className="px-2.5 py-0.5 bg-sky-500/20 text-sky-400 font-sans font-black text-[9px] uppercase tracking-wider rounded-lg border border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.25)]">
                        Unranked (Autoplay)
                      </span>
                    ) : isNewRecord ? (
                      <span className="px-2.5 py-0.5 bg-amber-500 text-slate-950 font-sans font-black text-[9px] uppercase tracking-wider rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse border border-white/25">
                        New Record
                      </span>
                    ) : null}
                  </div>

                  {/* Giant Score Readout */}
                  <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight font-sans leading-none">
                    {score.toLocaleString()}
                  </h1>

                  {/* Secondary Metrics Bar */}
                  <div className="grid grid-cols-3 gap-4 w-full max-w-md pt-2 border-t border-white/10 mt-1">
                    {/* Accuracy */}
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Accuracy
                      </span>
                      <span className="text-base font-black text-white font-mono">
                        {accuracy.toFixed(2)}%
                      </span>
                    </div>

                    {/* Max Combo */}
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Max Combo
                      </span>
                      <span className="text-base font-black text-white font-mono">
                        {maxCombo.toLocaleString()}x
                      </span>
                    </div>

                    {/* PENAR (never labelled pp) */}
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        PENAR
                      </span>
                      <span id="results-penar-value" className="text-base font-black text-white font-mono">
                        {formatPenar(activeScoreState.penar)}
                      </span>
                    </div>
                  </div>

                  {/* Mod Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1">
                      Mods:
                    </span>
                    {activeMods && activeMods.length > 0 ? (
                      activeMods.map(m => (
                        <span 
                          key={m} 
                          className="bg-pink-500/15 border border-pink-500/30 px-2.5 py-0.5 rounded text-[9px] uppercase tracking-widest font-mono text-pink-400 font-black shadow-sm"
                        >
                          {m}
                        </span>
                      ))
                    ) : (
                      <span className="bg-zinc-800/60 border border-white/5 px-2.5 py-0.5 rounded text-[9px] uppercase tracking-widest font-mono text-zinc-500 font-black">
                        No Mods
                      </span>
                    )}
                  </div>

                </div>

              </div>
            </div>

            {/* JUDGEMENTS BREAKDOWN CARD */}
            <div className="w-full bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-skin-accent" />
                <span>Judgement Breakdown</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {judgements.map(j => {
                  const percent = totalJudgements > 0 ? ((j.count / totalJudgements) * 100).toFixed(1) : '0.0';

                  return (
                    <div 
                      key={j.name}
                      className="bg-zinc-900/60 border border-white/5 rounded-2xl p-3 flex flex-col justify-between gap-2 hover:border-white/15 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${j.pillClass}`}>
                          {j.name}
                        </span>
                        <span className="font-mono text-lg font-black text-white tabular-nums">
                          {j.count.toLocaleString()}
                        </span>
                      </div>

                      {/* Percentage Bar */}
                      <div className="w-full flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${j.barClass} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.min(100, Math.max(0, (j.count / totalJudgements) * 100))}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0">
                          {percent}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* HIT ERROR GRAPH */}
            {hitErrors && hitErrors.length >= 2 && (!activeRecord || activeRecord.id === scoreState.recordId) && (
              <div className="w-full bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl">
                <HitErrorGraph errors={hitErrors} unstableRate={activeScoreState.unstableRate} />
              </div>
            )}

          </div>
        </main>

      </div>

      {/* 4. BOTTOM ACTION BAR (Fixed footer) */}
      <footer className="h-16 w-full bg-zinc-950/90 backdrop-blur-md border-t border-white/10 px-4 md:px-8 flex items-center justify-between z-20 shrink-0">
        
        {/* Left: Back Button */}
        <button
          id="results-select-btn"
          onClick={onBack}
          className="py-2.5 px-4 md:px-6 bg-zinc-900/90 hover:bg-zinc-800 text-white font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 border border-white/10 hover:border-white/20 active:scale-95 transition-all outline-none cursor-pointer shadow-md"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        {/* Center / Right: Primary Actions */}
        <div className="flex items-center gap-2 md:gap-3">
          
          {/* Retry Song */}
          <button
            id="results-retry-btn"
            onClick={onRetry}
            className="py-2.5 px-4 md:px-6 bg-skin-accent hover:bg-skin-accent-hover text-slate-950 font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 active:scale-95 transition-all outline-none cursor-pointer shadow-lg shadow-skin-accent/20"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Retry</span>
          </button>

          {/* Watch Replay */}
          {onWatchReplay && activeRecord && activeRecord.replayFrames && activeRecord.replayFrames.length > 0 && (
            <button
              id="results-watch-replay-btn"
              onClick={async () => {
                setReplayError(null);
                const result = await onWatchReplay(activeRecord);
                if (result && !result.success) setReplayError(result.error || 'Replay playback could not be started.');
              }}
              className="py-2.5 px-3 md:px-5 bg-cyan-600/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 active:scale-95 transition-all outline-none cursor-pointer shadow-md"
            >
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">Replay</span>
            </button>
          )}

          {/* Export Replay */}
          {activeRecord && (
            <button
              id="results-export-btn"
              title="Export this run as a replay file"
              onClick={() => downloadReplayExport([activeRecord], `${activeRecord.beatmapArtist} - ${activeRecord.beatmapTitle}`)}
              className="py-2.5 px-3 bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-slate-300 rounded-xl flex items-center justify-center active:scale-95 transition-all outline-none cursor-pointer shadow-md"
            >
              <Download className="h-4 w-4" />
            </button>
          )}

          {/* Delete Run */}
          {onDeleteRecord && (
            <button
              id="results-delete-btn"
              disabled={!activeRecord}
              onClick={() => {
                if (!activeRecord) return;
                if (!showConfirmDelete) {
                  setShowConfirmDelete(true);
                  setTimeout(() => setShowConfirmDelete(false), 3000);
                } else {
                  onDeleteRecord(activeRecord.id);
                  setSelectedRecordId(null);
                  setShowConfirmDelete(false);
                }
              }}
              className={`py-2.5 px-3 md:px-4 font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 active:scale-95 transition-all outline-none cursor-pointer shadow-md disabled:opacity-30 disabled:pointer-events-none transition-all duration-200 ${
                showConfirmDelete 
                  ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-400' 
                  : 'bg-rose-950/20 hover:bg-rose-900/30 border border-rose-500/30 text-rose-400'
              }`}
              title="Delete this play record from your history"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden md:inline">{showConfirmDelete ? 'Confirm?' : 'Delete'}</span>
            </button>
          )}

        </div>

      </footer>

      {/* Error alert toast if replay fails */}
      {replayError && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-rose-950 border border-rose-500 text-rose-200 text-xs px-4 py-2 rounded-xl shadow-2xl z-50 font-mono">
          {replayError}
        </div>
      )}

    </div>
  );
}
