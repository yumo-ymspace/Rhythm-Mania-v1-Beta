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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Play,
  Trash2,
  Search,
  Clock,
  Download,
  Upload,
  ArrowLeft,
  Music,
  CheckCircle2,
  AlertTriangle,
  Shuffle,
  ChevronDown,
  Check,
  X,
  Loader2,
  Award,
  Layers,
  Settings2,
  Calendar,
  Zap,
} from 'lucide-react';
import { PlayHistoryRecord, Beatmap, GameSettings } from '../types';
import { sanitizeCssUrl } from '../utils/securityLimits';
import { downloadReplayExport, parseReplayImport, MAX_IMPORT_FILE_BYTES } from '../utils/replayTransfer';
import { DEFAULT_SETTINGS, HISTORY_LIMIT_UNLIMITED } from './settings/defaultSettings';
import metadata from '../../metadata.json';
import { resolveStarRating } from '../utils/starRating';
import { getCatalogSetMetadata } from '../utils/catalogSetMetadata';
import { findMatchingBeatmap } from '../utils/replayManager';
import { formatPenar } from '../utils/penar';

interface PersonalHistoryScreenProps {
  history: PlayHistoryRecord[];
  allBeatmaps: Beatmap[];
  onWatchReplay: (record: PlayHistoryRecord) => Promise<{ success: boolean; error?: string }> | void;
  onViewResult?: (record: PlayHistoryRecord) => void;
  onClearHistory: () => void;
  onDeleteRecord: (id: string) => void;
  onImportRecords: (records: PlayHistoryRecord[]) => number;
  historyLimit: number;
  onSetHistoryLimit: (limit: number) => void;
  settings?: GameSettings;
  onBack?: () => void;
  onSelectSong?: () => void;
  setHistoryBgUrl?: (url: string) => void;
  downloadingSetIds?: number[];
}

type KeyCountFilter = 'all' | '4k' | '7k';
type GradeFilter = 'all' | 's' | 'a' | 'failed';
type SortOption = 'date_desc' | 'score_desc' | 'accuracy_desc';

const MENU_BACKGROUNDS = [
  '- Y u m i J i-.webp',
  'Arushii.webp',
  'Ferineon.webp',
  'MPDisplay.webp',
  'PEALEERD_TAK.webp',
  'Porukana.webp',
  'RedcXca.webp',
  'Sm0llBanana.webp',
  'THICC Jeff.webp',
  'Triantafyllia.webp',
  'YellowX21.webp',
  'mimile1606.webp',
  'nikio.webp',
  'serr.webp',
  'soncak.webp',
  'wxyz.webp',
];

const DEFAULT_SONG_BANNER = '/backgrounds/Ferineon.webp';

function extractRecordSourceSetId(item: any): number | null {
  let sourceSetId = Number(
    item?.sourceSetId || String(item?.catalogSetId || '').replace(/^osuapi_/, ''),
  );

  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) {
    const chartRevId = item?.chartRevisionId;
    if (typeof chartRevId === 'string') {
      const match = chartRevId.match(/^osuapi_(\d+)/);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
      }
    }
  }

  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) {
    const pkgId = item?.parentPackageId || item?.packageId;
    if (typeof pkgId === 'string') {
      const match = pkgId.match(/(?:osuapi_|pkg_)?(\d{1,10})/);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
      }
    }
  }

  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) {
    const bId = item?.beatmapId;
    if (typeof bId === 'string') {
      const match = bId.match(/^osuapi_(\d+)/);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
      }
    }
  }

  if ((!Number.isInteger(sourceSetId) || sourceSetId < 1) && typeof item?.originalContent === 'string') {
    const match = item.originalContent.match(/^BeatmapSetID\s*:\s*(\d+)/im);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
    }
  }

  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) return null;
  return sourceSetId;
}

function isRecordBeatmapDownloaded(rec: PlayHistoryRecord, allBeatmaps: Beatmap[]): boolean {
  return findMatchingBeatmap(rec, allBeatmaps) !== null;
}

function getSlimCoverUrl(item: any): string | undefined {
  const itemCoverUrl = typeof item?.coverUrl === 'string' ? item.coverUrl : undefined;
  if (itemCoverUrl) return itemCoverUrl;

  const sourceSetId = extractRecordSourceSetId(item);
  if (!Number.isInteger(sourceSetId) || !sourceSetId || sourceSetId < 1) return undefined;

  return getCatalogSetMetadata(sourceSetId)?.slimCoverUrl
    || `https://assets.ppy.sh/beatmaps/${sourceSetId}/covers/slimcover@2x.jpg`;
}

function getDifficultyColor(rating: number): string {
  if (rating < 2.0) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
  if (rating < 3.5) return 'text-sky-400 bg-sky-500/10 border-sky-500/25';
  if (rating < 5.0) return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
  if (rating < 6.5) return 'text-rose-400 bg-rose-500/10 border-rose-500/25';
  if (rating < 8.0) return 'text-purple-400 bg-purple-500/10 border-purple-500/25';
  return 'text-slate-100 bg-white/10 border-white/20';
}

function getGradeBadgeStyle(grade: string, isFailed?: boolean): { bg: string; text: string; border: string; glow: string } {
  if (isFailed || grade === 'F') {
    return {
      bg: 'bg-rose-600/15',
      text: 'text-rose-400',
      border: 'border-rose-600/40',
      glow: 'shadow-[0_0_10px_rgba(225,29,72,0.3)]',
    };
  }
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
    default:
      return {
        bg: 'bg-rose-400/15',
        text: 'text-rose-300',
        border: 'border-rose-400/40',
        glow: 'shadow-[0_0_10px_rgba(251,113,133,0.3)]',
      };
  }
}

function getGradeTheme(char: string, isFailed?: boolean) {
  if (isFailed || char === 'F') {
    return {
      char: 'F',
      textColor: 'text-rose-500',
      borderColor: 'border-rose-600/80',
      radialGlow: 'rgba(225, 29, 72, 0.25)',
      outerShadow: 'shadow-[0_0_45px_rgba(225,29,72,0.4)]',
      ringStroke: '#e11d48',
      accentColor: '#e11d48',
    };
  }
  switch (char) {
    case 'SS':
      return {
        char: 'SS',
        textColor: 'text-zinc-100',
        borderColor: 'border-zinc-200/80',
        radialGlow: 'rgba(255, 255, 255, 0.22)',
        outerShadow: 'shadow-[0_0_50px_rgba(255,255,255,0.4)]',
        ringStroke: '#f4f4f5',
        accentColor: '#ffffff',
      };
    case 'S':
      return {
        char: 'S',
        textColor: 'text-amber-300',
        borderColor: 'border-amber-400/80',
        radialGlow: 'rgba(251, 191, 36, 0.22)',
        outerShadow: 'shadow-[0_0_55px_rgba(251,191,36,0.45)]',
        ringStroke: '#facc15',
        accentColor: '#fbbf24',
      };
    case 'A':
      return {
        char: 'A',
        textColor: 'text-emerald-300',
        borderColor: 'border-emerald-400/80',
        radialGlow: 'rgba(52, 211, 153, 0.20)',
        outerShadow: 'shadow-[0_0_45px_rgba(52,211,153,0.35)]',
        ringStroke: '#34d399',
        accentColor: '#34d399',
      };
    case 'B':
      return {
        char: 'B',
        textColor: 'text-blue-300',
        borderColor: 'border-blue-400/80',
        radialGlow: 'rgba(96, 165, 250, 0.20)',
        outerShadow: 'shadow-[0_0_45px_rgba(96,165,250,0.35)]',
        ringStroke: '#60a5fa',
        accentColor: '#60a5fa',
      };
    case 'C':
      return {
        char: 'C',
        textColor: 'text-pink-300',
        borderColor: 'border-pink-400/80',
        radialGlow: 'rgba(244, 114, 182, 0.20)',
        outerShadow: 'shadow-[0_0_45px_rgba(244,114,182,0.35)]',
        ringStroke: '#f472b6',
        accentColor: '#f472b6',
      };
    case 'D':
    default:
      return {
        char: 'D',
        textColor: 'text-rose-400',
        borderColor: 'border-rose-400/80',
        radialGlow: 'rgba(251, 113, 133, 0.20)',
        outerShadow: 'shadow-[0_0_45px_rgba(251,113,133,0.35)]',
        ringStroke: '#fb7185',
        accentColor: '#fb7185',
      };
  }
}

export default function PersonalHistoryScreen({
  history,
  allBeatmaps,
  onWatchReplay,
  onViewResult,
  onClearHistory,
  onDeleteRecord,
  onImportRecords,
  historyLimit,
  onSetHistoryLimit,
  onBack,
  onSelectSong,
  setHistoryBgUrl,
  downloadingSetIds = [],
}: PersonalHistoryScreenProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [keyFilter, setKeyFilter] = useState<KeyCountFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(() => history[0]?.id || null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<{ text: string; isError?: boolean } | null>(null);
  const [mobileTab, setMobileTab] = useState<'details' | 'list'>('list');
  const [openFilterMenu, setOpenFilterMenu] = useState<'sort' | 'retention' | null>(null);
  const [isLaunchingReplay, setIsLaunchingReplay] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [randomBg] = useState(() => `/backgrounds/${MENU_BACKGROUNDS[Math.floor(Math.random() * MENU_BACKGROUNDS.length)]}`);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
      if (openFilterMenu) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-filter-menu]')) {
          setOpenFilterMenu(null);
        }
      }
    };
    if (showSettingsMenu || openFilterMenu) {
      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettingsMenu, openFilterMenu]);

  const handleImportFile = async (file: File) => {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setImportNotice({ text: 'Import failed: file exceeds the 64 MB limit.', isError: true });
      return;
    }
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const { records, rejectedCount } = parseReplayImport(text, DEFAULT_SETTINGS, allBeatmaps);
      if (records.length === 0) {
        setImportNotice({ text: 'Import failed: no valid replay records found in file.', isError: true });
        return;
      }
      const added = onImportRecords(records);
      if (records.length > 0 && records[0]?.id) {
        setSelectedRecordId(records[0].id);
        setMobileTab('details');
      }
      const skipped = records.length - added;
      setImportNotice({
        text: `Imported ${added} run${added === 1 ? '' : 's'}` + (skipped > 0 ? ` (${skipped} skipped)` : '') + (rejectedCount > 0 ? ` (${rejectedCount} rejected)` : '') + '.',
        isError: false,
      });
    } catch {
      setImportNotice({ text: 'Import failed: could not read the file.', isError: true });
    }
  };

  useEffect(() => {
    if (!importNotice) return;
    const t = setTimeout(() => setImportNotice(null), 4000);
    return () => clearTimeout(t);
  }, [importNotice]);

  const resolvedRecords = useMemo(() => {
    return history.map(rec => {
      const baseId = rec.beatmapId.includes('_converted_') ? rec.beatmapId.split('_converted_')[0] : rec.beatmapId;
      const matchedMap = allBeatmaps.find(b =>
        b.id === rec.beatmapId ||
        (baseId && b.id === baseId) ||
        (rec.catalogMapId && b.catalogMapId === rec.catalogMapId) ||
        (rec.beatmapHash && b.beatmapHash === rec.beatmapHash)
      );
      const coverUrl = (matchedMap as any)?.coverUrl || (matchedMap ? getSlimCoverUrl(matchedMap) : undefined) || getSlimCoverUrl(rec);
      return {
        ...rec,
        bgUrl: matchedMap?.bgUrl,
        coverUrl,
        difficultyName: matchedMap?.difficulty || `${rec.keyCount}K`,
        starRating: matchedMap ? resolveStarRating(matchedMap) : 4.50,
      };
    });
  }, [history, allBeatmaps]);

  const filteredHistory = useMemo(() => {
    return resolvedRecords
      .filter(rec => {
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const modsText = rec.mods && rec.mods.length > 0 ? rec.mods.join(' ') : '';
          if (
            !rec.beatmapTitle.toLowerCase().includes(q) &&
            !rec.beatmapArtist.toLowerCase().includes(q) &&
            !rec.difficultyName.toLowerCase().includes(q) &&
            !modsText.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        if (keyFilter === '4k' && rec.keyCount !== 4) return false;
        if (keyFilter === '7k' && rec.keyCount !== 7) return false;
        if (gradeFilter === 's' && rec.grade !== 'S' && rec.grade !== 'SS') return false;
        if (gradeFilter === 'a' && rec.grade !== 'A') return false;
        if (gradeFilter === 'failed' && !rec.isFailed && rec.grade !== 'F') return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score_desc') return b.score - a.score;
        if (sortBy === 'accuracy_desc') return b.accuracy - a.accuracy;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
  }, [resolvedRecords, searchTerm, keyFilter, gradeFilter, sortBy]);

  useEffect(() => {
    if (filteredHistory.length > 0) {
      if (!selectedRecordId || !filteredHistory.some(r => r.id === selectedRecordId)) {
        setSelectedRecordId(filteredHistory[0].id);
      }
    } else {
      setSelectedRecordId(null);
    }
  }, [filteredHistory, selectedRecordId]);

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) return null;
    return resolvedRecords.find(r => r.id === selectedRecordId) || null;
  }, [resolvedRecords, selectedRecordId]);

  const currentBgUrl = selectedRecord?.bgUrl || randomBg || DEFAULT_SONG_BANNER;

  useEffect(() => {
    if (setHistoryBgUrl) setHistoryBgUrl(currentBgUrl || DEFAULT_SONG_BANNER);
  }, [currentBgUrl, setHistoryBgUrl]);

  const isRecordDownloading = (rec: PlayHistoryRecord) => {
    const isDownloaded = isRecordBeatmapDownloaded(rec, allBeatmaps);
    if (isDownloaded) return false;
    const setId = extractRecordSourceSetId(rec);
    return Boolean(setId && downloadingSetIds.includes(setId));
  };

  const isSelectedRecordDownloading = selectedRecord ? isRecordDownloading(selectedRecord) : false;

  const handleDeleteRecord = (id: string) => {
    if (selectedRecordId === id) {
      const remaining = filteredHistory.filter(r => r.id !== id);
      setSelectedRecordId(remaining.length > 0 ? remaining[0].id : null);
    }
    setConfirmDeleteId(null);
    onDeleteRecord(id);
  };

  const handleWatchRecord = async (record: PlayHistoryRecord) => {
    setIsLaunchingReplay(true);
    try {
      const result = await onWatchReplay(record);
      if (result && !result.success) {
        setImportNotice({ text: result.error || 'Replay playback could not be started.', isError: true });
      }
    } finally {
      setIsLaunchingReplay(false);
    }
  };

  const getRelativeTime = (ts?: number) => {
    if (!ts) return 'Unknown';
    const d = Date.now() - ts;
    const m = Math.floor(d / 60000);
    const h = Math.floor(m / 60);
    const days = Math.floor(h / 24);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const formatDate = (ts?: number) => {
    if (!ts) return 'Unknown';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Unknown';
    }
  };

  const handleExportAll = () => {
    if (filteredHistory.length === 0) return;
    downloadReplayExport(filteredHistory, `RhythmMania_History_${new Date().toISOString().slice(0, 10)}`);
  };

  const handleSelectRandom = () => {
    if (filteredHistory.length === 0) return;
    const randomItem = filteredHistory[Math.floor(Math.random() * filteredHistory.length)];
    setSelectedRecordId(randomItem.id);
  };

  const handleTriggerImport = () => {
    importInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await handleImportFile(f);
  };

  // Selected record stats and judgements
  const activeGradeTheme = selectedRecord
    ? getGradeTheme(selectedRecord.grade, selectedRecord.isFailed)
    : null;

  const activeJudgements = useMemo(() => {
    if (!selectedRecord?.scoreState) return [];
    const ss = selectedRecord.scoreState;
    const total =
      (ss.marvelousCount || 0) +
      (ss.perfectCount || 0) +
      (ss.greatCount || 0) +
      (ss.goodCount || 0) +
      (ss.badCount || 0) +
      (ss.missCount || 0) || 1;

    return [
      {
        name: 'Perfect',
        count: ss.marvelousCount || 0,
        color: '#22d3ee',
        pillClass: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
        barClass: 'bg-cyan-400',
        pct: (((ss.marvelousCount || 0) / total) * 100).toFixed(1),
      },
      {
        name: 'Great',
        count: ss.perfectCount || 0,
        color: '#3b82f6',
        pillClass: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
        barClass: 'bg-blue-400',
        pct: (((ss.perfectCount || 0) / total) * 100).toFixed(1),
      },
      {
        name: 'Good',
        count: ss.greatCount || 0,
        color: '#4ade80',
        pillClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        barClass: 'bg-emerald-400',
        pct: (((ss.greatCount || 0) / total) * 100).toFixed(1),
      },
      {
        name: 'Ok',
        count: ss.goodCount || 0,
        color: '#fb923c',
        pillClass: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
        barClass: 'bg-orange-400',
        pct: (((ss.goodCount || 0) / total) * 100).toFixed(1),
      },
      {
        name: 'Meh',
        count: ss.badCount || 0,
        color: '#facc15',
        pillClass: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
        barClass: 'bg-yellow-400',
        pct: (((ss.badCount || 0) / total) * 100).toFixed(1),
      },
      {
        name: 'Miss',
        count: ss.missCount || 0,
        color: '#ef4444',
        pillClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
        barClass: 'bg-rose-500',
        pct: (((ss.missCount || 0) / total) * 100).toFixed(1),
      },
    ];
  }, [selectedRecord]);

  return (
    <div
      id="personal-history-screen"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col h-[calc(100dvh_-_60px)] sm:h-[calc(100dvh_-_68px)] w-full text-slate-100 overflow-hidden bg-zinc-950 select-none font-sans"
    >
      {/* 1. FULL VIEWPORT AMBIENT BEATMAP BACKGROUND */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center pointer-events-none filter blur-md opacity-25 scale-105 transition-all duration-700"
        style={{ backgroundImage: sanitizeCssUrl(currentBgUrl) }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-zinc-950/85 via-zinc-950/90 to-zinc-950 pointer-events-none" />

      {/* Hidden Replay Import Input */}
      <input
        ref={importInputRef}
        type="file"
        accept=".rmr,.json,application/json,application/x-rhythmmania-replay"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportFile(f);
          e.target.value = '';
        }}
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-md border-2 border-dashed border-skin-accent m-4 rounded-3xl pointer-events-none animate-pulse">
          <Upload className="h-16 w-16 text-skin-accent mb-3 animate-bounce" />
          <h3 className="text-xl font-sans font-black text-white uppercase tracking-widest">
            Drop Replay File Here
          </h3>
          <p className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-wider">
            Supports .rmr and .json replay exports
          </p>
        </div>
      )}

      {/* Alert Notice Toast */}
      {importNotice && (
        <div
          role="alert"
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 flex items-center justify-between gap-3 text-xs font-medium backdrop-blur-xl border rounded-2xl shadow-2xl max-w-lg w-[90%] ${
            importNotice.isError
              ? 'bg-rose-950/90 border-rose-500/30 text-rose-200'
              : 'bg-zinc-900/90 border-cyan-500/30 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {importNotice.isError ? (
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" />
            )}
            <span className="truncate">{importNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportNotice(null)}
            className="p-1 rounded-lg text-white/50 hover:text-white shrink-0 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showConfirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-white/10 p-6 shadow-2xl text-center flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-1">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-sans font-black text-white uppercase tracking-wider">
              Clear All Play History?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              This will permanently erase all {resolvedRecords.length} locally saved play records and replay telemetry from this device.
            </p>
            <div className="flex gap-2.5 mt-3">
              <button
                type="button"
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-bold text-slate-300 transition-all uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearHistory();
                  setSelectedRecordId(null);
                  setShowConfirmClear(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-all uppercase tracking-wider shadow-lg shadow-rose-600/30"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Tab Switcher (< lg screens) */}
      <div className="lg:hidden flex items-center justify-center gap-2 px-4 py-2 bg-zinc-950/80 border-b border-white/10 z-20 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('list')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'list'
              ? 'bg-skin-accent text-slate-950 shadow-md'
              : 'bg-white/5 text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Plays ({filteredHistory.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('details')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'details'
              ? 'bg-skin-accent text-slate-950 shadow-md'
              : 'bg-white/5 text-slate-400 hover:text-white'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Selected Replay</span>
        </button>
      </div>

      {/* 2. MAIN WORKSPACE: 2-COLUMN SPLIT (DESKTOP) */}
      <div className="flex-1 w-full min-h-0 overflow-hidden flex z-10 p-3 sm:p-4 lg:p-6 gap-4 lg:gap-6">
        
        {/* ============================================================== */}
        {/* COLUMN 1: SELECTED REPLAY HERO & DETAILS (LEFT) */}
        {/* ============================================================== */}
        <aside
          className={`w-full lg:w-[420px] xl:w-[480px] shrink-0 h-full overflow-y-auto flex-col gap-4 pr-1 ${
            mobileTab === 'details' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {selectedRecord ? (
            <div className="flex flex-col gap-4">
              
              {/* HERO CARD */}
              <div className="w-full bg-zinc-950/85 backdrop-blur-xl border border-white/10 rounded-3xl p-4 sm:p-5 shadow-2xl relative overflow-hidden flex flex-col gap-3 sm:gap-4 shrink-0">
                
                {/* Ambient Radial Glow */}
                {activeGradeTheme && (
                  <div
                    className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full pointer-events-none filter blur-3xl opacity-35 transition-all duration-700"
                    style={{ backgroundColor: activeGradeTheme.radialGlow }}
                  />
                )}

                {/* Header Tag + Date */}
                <div className="flex items-center justify-between gap-2 z-10">
                  <span className="px-3 py-1 bg-skin-accent-dim text-skin-accent text-[9px] tracking-widest uppercase font-mono font-black border border-skin-accent/25 rounded-full">
                    Selected Replay
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                    <Calendar className="h-3 w-3 text-slate-500" />
                    <span>{formatDate(selectedRecord.timestamp)}</span>
                    <span>•</span>
                    <span>{getRelativeTime(selectedRecord.timestamp)}</span>
                  </div>
                </div>

                {/* Grade Ring & Song Metadata */}
                <div className="flex items-center gap-4 z-10">
                  {/* Argon Grade Hero Badge */}
                  {activeGradeTheme && (
                    <div
                      className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 ${activeGradeTheme.borderColor} ${activeGradeTheme.outerShadow} flex flex-col items-center justify-center shrink-0 transition-all duration-500`}
                      style={{ backgroundColor: activeGradeTheme.radialGlow }}
                    >
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
                          stroke={activeGradeTheme.ringStroke}
                          strokeWidth="3"
                          strokeDasharray="289"
                          strokeDashoffset={289 - (289 * (selectedRecord.accuracy / 100))}
                          strokeLinecap="round"
                          className="transition-all duration-700"
                        />
                      </svg>
                      <span className={`font-sans font-black tracking-tight text-3xl sm:text-4xl leading-none uppercase ${activeGradeTheme.textColor} select-none drop-shadow z-10`}>
                        {activeGradeTheme.char}
                      </span>
                      <span className="text-white/95 text-[10px] sm:text-xs font-mono font-black tracking-wider mt-0.5 drop-shadow z-10">
                        {selectedRecord.accuracy.toFixed(2)}%
                      </span>
                    </div>
                  )}

                  {/* Title & Difficulty info */}
                  <div className="flex flex-col min-w-0 flex-1 text-left">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold truncate">
                      {selectedRecord.beatmapArtist || 'Unknown Artist'}
                    </span>
                    <h2 className="font-sans font-black text-xl sm:text-2xl text-white tracking-tight truncate leading-tight mt-0.5">
                      {selectedRecord.beatmapTitle}
                    </h2>
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${getDifficultyColor(selectedRecord.starRating)}`}>
                        ★ {selectedRecord.starRating.toFixed(2)}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-white/5 border border-white/10 text-slate-300">
                        {selectedRecord.difficultyName}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-skin-accent-dim text-skin-accent border border-skin-accent/20">
                        {selectedRecord.keyCount}K
                      </span>
                      {selectedRecord.playedBy && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono uppercase bg-white/5 border border-white/10 text-slate-400">
                          {selectedRecord.playedBy}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score & Primary Metrics */}
                <div className="flex flex-col gap-1 border-t border-white/10 pt-3 z-10">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-sans font-black text-slate-400 uppercase tracking-wider">
                      Total Score
                    </span>
                    {selectedRecord.mods && selectedRecord.mods.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {selectedRecord.mods.map(m => (
                          <span key={m} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30">
                            {m}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[9px] font-mono uppercase text-slate-500 font-bold">
                        No Mods
                      </span>
                    )}
                  </div>
                  <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight font-sans tabular-nums leading-none">
                    {selectedRecord.score.toLocaleString()}
                  </h1>
                  
                  {/* Secondary Metrics: Accuracy / Combo / PENAR */}
                  <div className="grid grid-cols-3 gap-2 pt-3 mt-1 border-t border-white/5 text-center sm:text-left">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                        Accuracy
                      </span>
                      <span className="text-sm sm:text-base font-black text-white font-mono tabular-nums">
                        {selectedRecord.accuracy.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                        Max Combo
                      </span>
                      <span className="text-sm sm:text-base font-black text-white font-mono tabular-nums">
                        {selectedRecord.maxCombo.toLocaleString()}x
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                        PENAR
                      </span>
                      <span className="text-sm sm:text-base font-black text-white font-mono">
                        {formatPenar(selectedRecord.scoreState?.penar)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Downloading Notification */}
                {isSelectedRecordDownloading && (
                  <div className="flex items-center gap-2.5 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-300 text-xs font-mono animate-pulse z-10">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400 shrink-0" />
                    <span className="text-[10px] uppercase font-bold tracking-wider">
                      Downloading original beatmapset...
                    </span>
                  </div>
                )}

                {/* Action Buttons Row */}
                <div className="flex flex-col gap-2 pt-2 z-10">
                  <div className="flex items-center gap-2">
                    {/* Watch Replay Button */}
                    <button
                      type="button"
                      id="main-left-play-button"
                      onClick={() => void handleWatchRecord(selectedRecord)}
                      disabled={isSelectedRecordDownloading || isLaunchingReplay || !selectedRecord.replayFrames || selectedRecord.replayFrames.length === 0}
                      className={`flex-1 py-2.5 sm:py-3 px-4 bg-skin-accent hover:bg-skin-accent-hover text-slate-950 font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-skin-accent/20 active:scale-95 transition-all outline-none cursor-pointer disabled:opacity-30 disabled:pointer-events-none`}
                    >
                      {isLaunchingReplay ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 fill-current text-slate-950" />
                          <span>Watch Replay</span>
                        </>
                      )}
                    </button>

                    {/* View Result Button */}
                    {onViewResult && (
                      <button
                        type="button"
                        id="history-view-results-button"
                        onClick={() => onViewResult(selectedRecord)}
                        className="py-2.5 sm:py-3 px-4 bg-zinc-900/90 hover:bg-zinc-800 text-white font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 border border-white/10 hover:border-white/20 active:scale-95 transition-all outline-none cursor-pointer shadow-md"
                        title="View Result Screen"
                      >
                        <Award className="h-4 w-4 text-amber-400" />
                        <span className="hidden sm:inline">Results</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Export Single Replay */}
                    <button
                      type="button"
                      onClick={() => downloadReplayExport([selectedRecord], `${selectedRecord.beatmapArtist} - ${selectedRecord.beatmapTitle}`)}
                      className="flex-1 py-2 px-3 bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-slate-300 hover:text-white rounded-xl flex items-center justify-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export RMR</span>
                    </button>

                    {/* Delete Record with Confirm */}
                    {confirmDeleteId === selectedRecord.id ? (
                      <div className="flex-1 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(selectedRecord.id)}
                          className="flex-1 py-2 px-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-mono font-black uppercase tracking-wider transition-all"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="py-2 px-2 bg-zinc-800 text-slate-300 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(selectedRecord.id)}
                        className="py-2 px-3 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-500/30 text-rose-400 rounded-xl flex items-center justify-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                        title="Delete this replay record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>

              </div>

              {/* JUDGEMENTS BREAKDOWN CARD */}
              {selectedRecord.scoreState && activeJudgements.length > 0 && (
                <div className="w-full bg-zinc-950/85 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-skin-accent" />
                      <span>Judgements</span>
                    </h3>
                    {selectedRecord.scoreState.unstableRate != null && (
                      <span className="text-[10px] font-mono text-slate-400 font-bold">
                        UR: {selectedRecord.scoreState.unstableRate.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {activeJudgements.map(j => (
                      <div
                        key={j.name}
                        className="bg-zinc-900/60 border border-white/5 rounded-xl p-2.5 flex flex-col justify-between gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${j.pillClass}`}>
                            {j.name}
                          </span>
                          <span className="font-mono text-sm font-black text-white tabular-nums">
                            {j.count.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full flex items-center gap-1.5">
                          <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${j.barClass} rounded-full transition-all duration-500`}
                              style={{ width: `${j.pct}%` }}
                            />
                          </div>
                          <span className="text-[8px] font-mono text-slate-500 shrink-0">
                            {j.pct}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            /* Empty selection state */
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-zinc-950/60 border border-white/10 rounded-3xl text-slate-500 space-y-2">
              <Clock className="h-8 w-8 opacity-30 text-slate-400" />
              <p className="font-sans font-bold text-xs uppercase tracking-wider text-slate-400">
                No replay selected
              </p>
              <p className="text-[10px] font-mono text-slate-600">
                Select a replay from the list on the right to inspect its stats.
              </p>
            </div>
          )}
        </aside>

        {/* ============================================================== */}
        {/* COLUMN 2: SEARCH, FILTERS & REPLAYS LIST (RIGHT) */}
        {/* ============================================================== */}
        <main
          className={`flex-1 min-w-0 h-full flex-col gap-3 overflow-hidden ${
            mobileTab === 'list' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* TOP SEARCH & FILTER BAR */}
          <div className="w-full bg-zinc-950/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col gap-2.5 shrink-0 shadow-lg relative z-30">
            {/* Search Input */}
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="history-search-input"
                type="text"
                placeholder="Search replays by title, artist, difficulty, mods..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-24 py-2.5 bg-zinc-900/90 border border-white/10 rounded-xl font-sans text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-skin-accent/50 focus:ring-1 focus:ring-skin-accent/30 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-white/5 border border-white/10 text-[9px] font-mono text-slate-400 font-bold rounded-md">
                {filteredHistory.length} matches
              </span>
            </div>

            {/* Filter Pills Row */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Key Mode Filter */}
                <div className="flex items-center bg-zinc-900 p-0.5 rounded-xl border border-white/10">
                  {(['all', '4k', '7k'] as KeyCountFilter[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setKeyFilter(mode)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
                        keyFilter === mode
                          ? 'bg-skin-accent text-slate-950 shadow-sm font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode === 'all' ? 'All Keys' : mode.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Grade Filter */}
                <div className="flex items-center bg-zinc-900 p-0.5 rounded-xl border border-white/10">
                  {([
                    { id: 'all', label: 'All' },
                    { id: 's', label: 'S / SS' },
                    { id: 'a', label: 'A' },
                    { id: 'failed', label: 'Fails' },
                  ] as { id: GradeFilter; label: string }[]).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGradeFilter(g.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
                        gradeFilter === g.id
                          ? 'bg-skin-accent text-slate-950 shadow-sm font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort Dropdown & History Settings */}
              <div className="flex items-center gap-1.5 relative" data-filter-menu>
                <button
                  type="button"
                  onClick={() => setOpenFilterMenu(openFilterMenu === 'sort' ? null : 'sort')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300 hover:text-white hover:border-white/20 transition-all"
                >
                  <span className="text-slate-500">Sort:</span>
                  <span className="text-white">
                    {sortBy === 'date_desc' ? 'Recent' : sortBy === 'score_desc' ? 'Score' : 'Accuracy'}
                  </span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>

                {openFilterMenu === 'sort' && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[140px] text-xs">
                    {([
                      { id: 'date_desc', label: 'Recent' },
                      { id: 'score_desc', label: 'Score' },
                      { id: 'accuracy_desc', label: 'Accuracy' },
                    ] as { id: SortOption; label: string }[]).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSortBy(opt.id);
                          setOpenFilterMenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                          sortBy === opt.id
                            ? 'text-skin-accent bg-skin-accent/10 font-bold'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {sortBy === opt.id && <Check className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* History Options Dropdown */}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
                    title="History Settings & Actions"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>

                  {showSettingsMenu && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 rounded-2xl bg-zinc-900/98 border border-white/20 shadow-[0_16px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-2 min-w-[200px] text-xs flex flex-col gap-1">
                      <div className="px-3 py-2 border-b border-white/10">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                          Retention Limit
                        </span>
                        <select
                          value={historyLimit}
                          onChange={(e) => onSetHistoryLimit(Number(e.target.value))}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-slate-200 outline-none text-xs"
                        >
                          <option value="10">Keep last 10 plays</option>
                          <option value="25">Keep last 25 plays</option>
                          <option value="50">Keep last 50 plays</option>
                          <option value="100">Keep last 100 plays</option>
                          <option value={HISTORY_LIMIT_UNLIMITED}>Unlimited plays</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsMenu(false);
                          handleExportAll();
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                      >
                        <Download className="h-3.5 w-3.5 text-cyan-400" />
                        <span>Export All Records</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsMenu(false);
                          handleTriggerImport();
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                      >
                        <Upload className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Import Replay File</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsMenu(false);
                          setShowConfirmClear(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors text-left font-semibold"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Clear All History</span>
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* SCROLLABLE REPLAYS LIST */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {filteredHistory.length > 0 ? (
              filteredHistory.map((rec, idx) => {
                const isSelected = selectedRecordId === rec.id;
                const banner = rec.coverUrl || DEFAULT_SONG_BANNER;
                const badgeStyle = getGradeBadgeStyle(rec.grade, rec.isFailed);
                const isItemDownloading = isRecordDownloading(rec);

                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => {
                      setSelectedRecordId(rec.id);
                      setMobileTab('details');
                    }}
                    className={`w-full text-left rounded-2xl border transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col p-3.5 gap-2 ${
                      isSelected
                        ? 'bg-zinc-900/90 border-skin-accent shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                        : 'bg-zinc-950/70 hover:bg-zinc-900/60 border-white/5 hover:border-white/15'
                    }`}
                  >
                    {/* Background Banner with Gradient Tint */}
                    <img
                      src={banner}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-15 pointer-events-none"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = DEFAULT_SONG_BANNER;
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/80 to-zinc-950/60 pointer-events-none" />

                    {/* Active highlight bar */}
                    {isSelected && (
                      <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-skin-accent shadow-sm" />
                    )}

                    {/* Primary Row: Rank + Grade + Title/Artist + Star Rating */}
                    <div className="relative flex items-center justify-between gap-3 z-10">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Grade Badge */}
                        <span
                          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-black font-mono shrink-0 border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border} ${badgeStyle.glow}`}
                        >
                          {rec.grade}
                        </span>

                        {/* Title & Artist */}
                        <div className="flex flex-col min-w-0 text-left">
                          <h4 className="font-sans font-black text-sm sm:text-base text-white tracking-tight truncate leading-tight">
                            {rec.beatmapTitle}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono uppercase truncate mt-0.5">
                            {rec.beatmapArtist || 'Unknown Artist'} • <span className="text-slate-300 font-bold">{rec.difficultyName}</span> • {rec.keyCount}K
                          </span>
                        </div>
                      </div>

                      {/* Right Meta: Star Rating & Relative Time */}
                      <div className="flex flex-col items-end shrink-0 gap-1">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${getDifficultyColor(rec.starRating)}`}>
                          ★ {rec.starRating.toFixed(2)}
                        </span>
                        <span className="text-[9px] font-mono text-slate-500">
                          {getRelativeTime(rec.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Secondary Row: Score, Accuracy, Max Combo, PENAR, Mods */}
                    <div className="relative flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-white/5 z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-black text-sm tabular-nums">
                          {rec.score.toLocaleString()}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-cyan-300 font-bold tabular-nums">
                          {rec.accuracy.toFixed(2)}%
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-300">
                          {rec.maxCombo}x
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400">
                          PENAR: {formatPenar(rec.scoreState?.penar)}
                        </span>
                      </div>

                      {/* Mod Pills / Downloading Indicator */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isItemDownloading && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-mono text-cyan-300 bg-cyan-500/15 px-1.5 py-0.5 rounded-md border border-cyan-500/30 animate-pulse">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            <span>Downloading</span>
                          </span>
                        )}
                        {rec.mods && rec.mods.length > 0 ? (
                          <div className="flex items-center gap-0.5">
                            {rec.mods.map((m) => (
                              <span
                                key={m}
                                className="px-1.5 py-0.2 bg-pink-500/15 border border-pink-500/30 rounded text-[9px] font-black font-mono text-pink-300"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                  </button>
                );
              })
            ) : (
              /* Empty Search / Filter State */
              <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-zinc-950/60 border border-white/10 rounded-3xl text-slate-500 space-y-3">
                <Clock className="h-8 w-8 opacity-30 text-slate-400" />
                <div className="flex flex-col gap-1">
                  <p className="font-sans font-black text-sm uppercase tracking-wider text-slate-300">
                    No replay matches found
                  </p>
                  <p className="text-xs font-mono text-slate-500 max-w-sm">
                    {searchTerm || keyFilter !== 'all' || gradeFilter !== 'all'
                      ? 'Try clearing or changing your search filters to find more plays.'
                      : 'Play beatmaps or import replay files to populate your history.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {onSelectSong && (
                    <button
                      type="button"
                      onClick={onSelectSong}
                      className="px-4 py-2 bg-skin-accent hover:bg-skin-accent-hover text-slate-950 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      Go to Song Select
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleTriggerImport}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    Import Replay
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

      </div>

      {/* 3. DOCKED FOOTER ACTION BAR */}
      <footer className="h-16 w-full bg-zinc-950/90 backdrop-blur-md border-t border-white/10 px-4 md:px-8 flex items-center justify-between z-20 shrink-0">
        
        {/* Left: Back Button */}
        <button
          type="button"
          onClick={() => onBack?.()}
          className="py-2.5 px-4 md:px-6 bg-zinc-900/90 hover:bg-zinc-800 text-white font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 border border-white/10 hover:border-white/20 active:scale-95 transition-all outline-none cursor-pointer shadow-md"
        >
          <ArrowLeft className="h-4 w-4 text-cyan-400" />
          <span>Back</span>
        </button>

        {/* Center / Right: Actions */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Song Select Shortcut */}
          {onSelectSong && (
            <button
              type="button"
              onClick={onSelectSong}
              className="py-2.5 px-3 md:px-5 bg-zinc-900/90 hover:bg-zinc-800 text-white font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 border border-white/10 hover:border-white/20 active:scale-95 transition-all outline-none cursor-pointer shadow-md"
            >
              <Music className="h-4 w-4 text-amber-400" />
              <span className="hidden sm:inline">Song Select</span>
            </button>
          )}

          {/* Random Replay Button */}
          <button
            type="button"
            onClick={handleSelectRandom}
            disabled={filteredHistory.length === 0}
            className="py-2.5 px-3 md:px-5 bg-zinc-900/90 hover:bg-zinc-800 text-white font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 border border-white/10 hover:border-white/20 active:scale-95 transition-all outline-none cursor-pointer shadow-md disabled:opacity-30 disabled:pointer-events-none"
            title="Select a random replay from the list"
          >
            <Shuffle className="h-4 w-4 text-sky-400" />
            <span className="hidden sm:inline">Random</span>
          </button>

          {/* Import Button */}
          <button
            type="button"
            onClick={handleTriggerImport}
            className="py-2.5 px-4 md:px-6 bg-skin-accent hover:bg-skin-accent-hover text-slate-950 font-sans font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 active:scale-95 transition-all outline-none cursor-pointer shadow-lg shadow-skin-accent/20"
          >
            <Upload className="h-4 w-4 text-slate-950" />
            <span>Import</span>
          </button>
        </div>

      </footer>
    </div>
  );
}
