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

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import {
  Search, X, Music, Check, Loader, Download, Info, ChevronDown,
  LayoutGrid, ListMusic,
} from 'lucide-react';
import { FooterBackButton } from '../ui/lazer/FooterBackButton';
import { Beatmap } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { storageManager } from '../utils/storageManager';
import { MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, createZipExtractionBudget, decodeBoundedUtf8 } from '../utils/securityLimits';
import { computeBeatmapHash } from '../utils/replayManager';
import { extractZipEntry } from '../utils/zipResolver';
import { computeChecksum, inferChecksumAlgorithm } from '../utils/checksum';
import { saveCatalogSetMetadata } from '../utils/catalogSetMetadata';
import {
  downloadBeatmapsetArchive,
} from '../utils/osuTokenManager';
import {
  MIRROR_SEARCH_STATUSES,
  searchCatboy,
} from '../../api/_lib/mirrorCatalog';

interface OnlineBeatmapCatalogProps {
  open: boolean;
  onClose: () => void;
  customMaps: Beatmap[];
  onImportPackage: (packageId: string, name: string, blob: Blob, maps: Beatmap[]) => Promise<void>;
}

type CatalogChart = {
  id: number;
  checksum: string;
  version?: string;
  filename?: string;
  originalOsuFilename?: string;
  chartRevisionId?: string;
  name?: string;
  sourceChartId?: number;
  checksumAlgorithm?: string;
  keyCount?: number;
  starRating?: number;
};

type CatalogSet = {
  id: string;
  sourceSetId: number;
  title: string;
  artist: string;
  creator: string;
  status?: string;
  coverUrl?: string;
  slimCoverUrl?: string;
  charts?: CatalogChart[];
  difficulties?: CatalogChart[];
  bpm?: number;
};

const SEARCH_CATEGORIES = ['Any', 'Loved', 'Ranked', 'Graveyard'] as const;

export default function OnlineBeatmapCatalog({
  open,
  onClose,
  customMaps,
  onImportPackage,
}: OnlineBeatmapCatalogProps) {
  const [mirrorManifest, setMirrorManifest] = useState<CatalogSet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [catalogRequestState, setCatalogRequestState] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearchTerm, setSubmittedSearchTerm] = useState('');
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [searchCategory, setSearchCategory] = useState<(typeof SEARCH_CATEGORIES)[number]>('Ranked');
  const [sortBy, setSortBy] = useState<'Title' | 'Artist' | 'Difficulty'>('Title');
  const [downloadingMapId, setDownloadingMapId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);
  const [downloadQueue, setDownloadQueue] = useState<CatalogSet[]>([]);
  const downloadQueueRef = useRef<CatalogSet[]>([]);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIsLoading(false);
  }, [open]);

  useEffect(() => {
    if (!open || !submittedSearchTerm.trim()) {
      if (open && !submittedSearchTerm.trim()) {
        setMirrorManifest([]);
        setCatalogRequestState('idle');
        setIsLoading(false);
      }
      return;
    }

    const controller = new AbortController();
    const requestTerm = submittedSearchTerm.trim();

    const fetchManifest = async () => {
      setIsLoading(true);
      setCatalogRequestState('loading');
      setCatalogError(null);
      setMirrorManifest([]);
      try {
        // Server searches catboy.best first, Nekoha fallback. No login needed.
        // Bare `vite dev` serves no /api/* routes, and the mirrors can be
        // down independently, so fall back to querying catboy.best directly
        // from the browser when the first-party API is unreachable.
        const status = searchCategory === 'Any' ? 'any' : searchCategory.toLowerCase();
        let rows: any[] = [];
        let apiError: string | null = null;
        try {
          const response = await fetch(
            `/api/catalog/search?q=${encodeURIComponent(requestTerm)}&s=${status}`,
            {
              headers: { Accept: 'application/json' },
              signal: controller.signal,
            },
          );
          const result = await response.json().catch(() => null);
          if (!response.ok) throw new Error((result && result.error) || 'Mirror catalog search failed');
          rows = result && Array.isArray(result.data) ? result.data : [];
        } catch (err) {
          if (controller.signal.aborted) throw err;
          apiError = err instanceof Error ? err.message : 'Mirror catalog search failed';
          // Same search path as the API route: catboy serves its JSON with
          // CORS `*`, so the browser can query it directly.
          const statuses = searchCategory === 'Any'
            ? [...MIRROR_SEARCH_STATUSES]
            : [searchCategory.toLowerCase()];
          try {
            rows = await searchCatboy(requestTerm, new Set<string>(statuses));
          } catch {
            throw new Error(apiError);
          }
        }
        const merged = new Map<number, CatalogSet>();
        for (const item of rows) {
          const sourceSetId = Number(item.sourceSetId);
          if (!Number.isInteger(sourceSetId) || sourceSetId < 1) continue;
          if (merged.has(sourceSetId)) continue;
          merged.set(sourceSetId, {
            id: item.id || `osuapi_${sourceSetId}`,
            sourceSetId,
            title: item.title || 'Unknown Title',
            artist: item.artist || 'Unknown Artist',
            creator: item.creator || 'Unknown Mapper',
            status: item.status,
            coverUrl: item.coverUrl,
            slimCoverUrl: item.slimCoverUrl,
            charts: Array.isArray(item.charts) ? item.charts : [],
            bpm: item.bpm,
          });
        }
        if (controller.signal.aborted) return;
        setMirrorManifest(Array.from(merged.values()));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Unable to load online beatmap manifest.', err);
        setMirrorManifest([]);
        setCatalogError(err instanceof Error ? err.message : 'Mirror catalog search failed');
      } finally {
        if (controller.signal.aborted) return;
        setIsLoading(false);
        setCatalogRequestState('loaded');
      }
    };

    void fetchManifest();
    return () => controller.abort();
  }, [open, submittedSearchTerm, searchCategory]);

  useEffect(() => {
    if (!open || searchTerm === submittedSearchTerm) return;
    const timer = window.setTimeout(() => setSubmittedSearchTerm(searchTerm), 4000);
    return () => window.clearTimeout(timer);
  }, [open, searchTerm, submittedSearchTerm]);

  useEffect(() => {
    if (!open || searchTerm === filterSearchTerm) return;
    const timer = window.setTimeout(() => setFilterSearchTerm(searchTerm), 1500);
    return () => window.clearTimeout(timer);
  }, [open, searchTerm, filterSearchTerm]);

  useEffect(() => {
    if (!open) return;
    // Drop focus from any background control so Space/Enter can't re-trigger
    // it while the beatmap listing is open (same pattern as SettingsDrawer).
    const active = document.activeElement as HTMLElement | null;
    if (active && !active.closest?.('[data-beatmap-listing], [role="dialog"]')) {
      active.blur();
    }
    // Text fields handle their own keys (Enter searches, Escape cancels).
    // Capture-phase stopPropagation below would otherwise swallow those keys
    // before React ever sees them, so leave them alone. Background listeners
    // (Song Select, toolbar) already ignore typing targets on their own.
    const isTextEditingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag === 'INPUT') {
        const type = (target as HTMLInputElement).type;
        return type === 'text' || type === 'search' || type === 'number';
      }
      return false;
    };
    const isInsideListing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(target.closest?.('[data-beatmap-listing], [role="dialog"]'));
    // Keys the Song Select screen treats as global actions. While the listing
    // is open these must stay confined to the listing and never leak behind.
    const SONG_SELECT_KEYS = new Set([
      'Enter',
      ' ',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'F1',
      'F2',
      'F3',
      'F4',
      'F6',
    ]);
    // Capture-phase trap: runs before background window listeners (song
    // select, toolbar) so they never see these keys.
    const trap = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) {
        // Let the search field handle typing/Enter. Escape still closes the
        // listing without leaking to Song Select behind it.
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      // Ctrl/Cmd chords owned by Song Select / toolbar (open settings,
      // scroll-speed, listing toggle) must not fire behind the listing.
      if (e.ctrlKey || e.metaKey) {
        e.stopPropagation();
        const k = e.key.toLowerCase();
        if (k === 'o' || k === 'b' || e.key === '-' || e.key === '_' || e.key === '=' || e.key === '+') {
          e.preventDefault();
        }
        return;
      }
      if (SONG_SELECT_KEYS.has(e.key)) {
        // Always hide the key from background listeners.
        e.stopPropagation();
        if (!isInsideListing(e.target)) {
          // Focus is still on the screen behind: swallow so Space/Enter can't
          // trigger it. Native listing controls keep their default behavior.
          e.preventDefault();
        } else if (e.key.startsWith('F')) {
          e.preventDefault();
        }
      }
    };
    // Also swallow Space/Enter keyup from a background focused button (native
    // click activation happens on keyup for Space).
    const trapKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (isTextEditingTarget(e.target)) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('[data-beatmap-listing], [role="dialog"]')) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', trap, true);
    window.addEventListener('keyup', trapKeyUp, true);
    return () => {
      window.removeEventListener('keydown', trap, true);
      window.removeEventListener('keyup', trapKeyUp, true);
    };
  }, [open, onClose]);

  const handleDownload = async (s: CatalogSet) => {
    const mirrorSetId = s.id;
    const mirrorSetTitle = s.title;
    const workingSet = {
      ...s,
      difficulties: (s.charts || s.difficulties || []).map((chart) => ({
        ...chart,
        sourceChartId: chart.id,
        checksum: chart.checksum.toLowerCase(),
        chartRevisionId: `osuapi_${s.sourceSetId}_b${chart.id}_${chart.checksum.toLowerCase()}`,
        name: chart.version || chart.name,
        originalOsuFilename: chart.filename || chart.originalOsuFilename,
        checksumAlgorithm: inferChecksumAlgorithm(chart.checksum),
      })),
    };
    let packageStaged = false;

    setDownloadingMapId(mirrorSetId);
    setDownloadProgress({ loaded: 0, total: 0, percentage: 0 });
    setImportStatus({ type: 'ok', msg: 'Preparing local download…' });

    try {
      if (!s.sourceSetId) throw new Error('The result is missing its osu! beatmap set id.');

      const blob = await downloadBeatmapsetArchive(
        s.sourceSetId,
        (msg) => setImportStatus({ type: 'ok', msg }),
        (loaded, total) => {
          setDownloadProgress({
            loaded,
            total,
            percentage: total ? Math.round((loaded / total) * 100) : 0,
          });
        },
        MAX_COMPRESSED_SIZE_BYTES,
      );
      if (blob.size > MAX_COMPRESSED_SIZE_BYTES) throw new Error('Security Exception: Downloaded package exceeds the size limit.');

      setImportStatus({ type: 'ok', msg: 'Storing package and cache...' });

      const packageId = workingSet.id;
      const zip = await JSZip.loadAsync(blob);
      validateZipLimits(zip);
      const extractionBudget = createZipExtractionBudget();
      const fileNames = Object.keys(zip.files);
      const beatmapFiles: { name: string; content: string; raw: ArrayBuffer }[] = [];

      for (const name of fileNames) {
        if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
          const raw = await extractZipEntry(zip.files[name], name, extractionBudget);
          beatmapFiles.push({
            name,
            content: decodeBoundedUtf8(raw, `Beatmap file ${name}`),
            raw,
          });
        }
      }

      if (beatmapFiles.length === 0) throw new Error('Invalid package structure.');

      let importedCount = 0;
      const importedMaps: Beatmap[] = [];
      const diffs = workingSet.difficulties || [];

      for (const beatmapStr of beatmapFiles) {
        const [md5, sha256] = await Promise.all([
          computeChecksum(beatmapStr.raw, 'md5'),
          computeChecksum(beatmapStr.raw, 'sha256'),
        ]);
        const matchedDiff = diffs.find((diff) => {
          const expected = diff.checksum?.toLowerCase();
          if (!expected) return false;
          return expected === (expected.length === 64 ? sha256 : md5);
        });
        if (!matchedDiff?.chartRevisionId) continue;

        const parsedMap = parseBeatmap(beatmapStr.content, matchedDiff.chartRevisionId);
        if (parsedMap.notes.length === 0) continue;

        const media = parseMediaPaths(beatmapStr.content);
        const mapWithMeta = parsedMap as Beatmap & Record<string, unknown>;
        mapWithMeta.packageId = packageId;
        mapWithMeta.parentPackageId = packageId;
        mapWithMeta.catalogSetId = packageId;
        mapWithMeta.sourceSetId = s.sourceSetId;
        mapWithMeta.catalogMapId = matchedDiff.chartRevisionId;
        mapWithMeta.chartRevisionId = matchedDiff.chartRevisionId;
        mapWithMeta.checksum = matchedDiff.checksum?.toLowerCase();
        mapWithMeta.checksumAlgorithm = matchedDiff.checksumAlgorithm === 'sha256' || matchedDiff.checksum?.length === 64 ? 'sha256' : 'md5';
        mapWithMeta.audioFilename = media.audioFilename;
        mapWithMeta.videoFilename = media.videoFilename;
        mapWithMeta.bgFilename = media.bgFilename;
        mapWithMeta.coverUrl = s.slimCoverUrl || s.coverUrl;
        mapWithMeta.originalContent = beatmapStr.content;
        mapWithMeta.isServerMap = false;
        mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);
        if (Number.isFinite(matchedDiff.starRating) && Number(matchedDiff.starRating) >= 0) {
          mapWithMeta.starRating = Number(matchedDiff.starRating);
          mapWithMeta.starRatingSource = 'osu-api-download';
        }
        mapWithMeta.starRatingVersion = undefined;
        parsedMap.audioUrl = '';
        parsedMap.videoUrl = '';
        parsedMap.bgUrl = '';

        importedMaps.push(parsedMap);
        importedCount++;
      }

      if (importedCount === 0) throw new Error('No valid playable difficulties found inside.');

      await onImportPackage(packageId, `${mirrorSetTitle}.osz`, blob, importedMaps);
      saveCatalogSetMetadata({
        sourceSetId: s.sourceSetId,
        title: s.title,
        artist: s.artist,
        creator: s.creator,
        slimCoverUrl: s.slimCoverUrl,
      });
      packageStaged = true;

      setImportStatus({
        type: 'ok',
        msg: `Successfully downloaded "${mirrorSetTitle}"!`,
      });
      setDownloadNotice(`${mirrorSetTitle} has been downloaded.`);
      window.setTimeout(() => setDownloadNotice(null), 6000);
    } catch (err: unknown) {
      console.error('Downloader error:', err instanceof Error ? err.message : String(err));
      if (packageStaged) {
        try {
          await storageManager.deletePackageAndAllBeatmaps(workingSet.id || mirrorSetId);
          if (workingSet.id !== mirrorSetId) {
            await storageManager.deletePackageAndAllBeatmaps(mirrorSetId);
          }
        } catch {
          // ignore cleanup errors
        }
      }
      setImportStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Download error. Check network connection.',
      });
    } finally {
      setDownloadingMapId(null);
      setDownloadProgress(null);
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const enqueueDownload = (s: CatalogSet) => {
    const alreadyQueued = downloadQueueRef.current.some((queued) => queued.id === s.id);
    if (alreadyQueued || downloadingMapId === s.id) return;
    downloadQueueRef.current = [...downloadQueueRef.current, s];
    setDownloadQueue(downloadQueueRef.current);
  };

  useEffect(() => {
    if (downloadingMapId || downloadQueueRef.current.length === 0) return;
    const [next, ...remaining] = downloadQueueRef.current;
    downloadQueueRef.current = remaining;
    setDownloadQueue(remaining);
    void handleDownload(next);
  }, [downloadQueue, downloadingMapId]);

  const filteredManifest = mirrorManifest.filter((s) => {
    if (!filterSearchTerm) return true;
    const q = filterSearchTerm.toLowerCase();
    return (
      (s.title || '').toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q) ||
      (s.creator || '').toLowerCase().includes(q)
    );
  });

  const sortedManifest = [...filteredManifest].sort((a, b) => {
    if (sortBy === 'Artist') return (a.artist || '').localeCompare(b.artist || '');
    if (sortBy === 'Difficulty') {
      const chartsA = a.charts || a.difficulties || [];
      const chartsB = b.charts || b.difficulties || [];
      const maxA = chartsA.reduce((m, c) => Math.max(m, Number(c.starRating ?? 0) || 0), 0);
      const maxB = chartsB.reduce((m, c) => Math.max(m, Number(c.starRating ?? 0) || 0), 0);
      if (maxB !== maxA) return maxB - maxA;
      return (a.title || '').localeCompare(b.title || '');
    }
    return (a.title || '').localeCompare(b.title || '');
  });

  const revealSet = (setId: string) => {
    setExpandedSetId((current) => current === setId ? null : setId);
  };

  const getDifficultyBadge = (rating: number) => {
    if (rating < 2.0) return 'text-emerald-300 bg-emerald-500/20 border-emerald-400/30';
    if (rating < 3.0) return 'text-cyan-300 bg-cyan-500/20 border-cyan-400/30';
    if (rating < 4.0) return 'text-amber-300 bg-amber-500/20 border-amber-400/30';
    if (rating < 5.0) return 'text-orange-300 bg-orange-500/20 border-orange-400/30';
    if (rating < 6.5) return 'text-rose-300 bg-rose-500/20 border-rose-400/30';
    return 'text-purple-300 bg-purple-500/20 border-purple-400/30';
  };

  const statusPillClass = (status?: string) => {
    if (status === 'ranked') return 'lazer-status-pill is-ranked';
    if (status === 'loved') return 'lazer-status-pill is-loved';
    return 'lazer-status-pill is-graveyard';
  };

  const setMaxStars = (s: CatalogSet): number => {
    const charts = s.charts || s.difficulties || [];
    let max = 0;
    for (const c of charts) {
      const r = Number(c.starRating ?? 0);
      if (Number.isFinite(r) && r > max) max = r;
    }
    return max;
  };

  // Lazer difficulty tick spectrum (green -> yellow -> orange -> red -> purple).
  const diffTickColor = (index: number, filled: number): string => {
    if (index >= filled) return 'rgba(255,255,255,0.18)';
    const t = filled <= 1 ? 0 : index / (filled - 1);
    if (t < 0.25) return '#88b300';
    if (t < 0.45) return '#ffcc22';
    if (t < 0.65) return '#ff9933';
    if (t < 0.85) return '#ff4d6d';
    return '#c77dff';
  };

  const DifficultyTicks = ({ stars }: { stars: number }) => {
    const filled = Math.max(1, Math.min(10, Math.round(stars)));
    return (
      <span className="flex items-center gap-[2px]" aria-label={`${stars.toFixed(2)} stars`}>
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="lazer-diff-dot"
            style={{ background: diffTickColor(i, filled) }}
          />
        ))}
      </span>
    );
  };

  const headerDownloadMessage = importStatus?.msg
    || (downloadingMapId ? 'Downloading beatmap…' : downloadQueue.length > 0 ? `${downloadQueue.length} beatmap${downloadQueue.length === 1 ? '' : 's'} queued…` : null);

  // ---- Lazer filter row: only selectable Categories (Any/Ranked/Loved/Graveyard).
  // Sort row: Title / Artist / Difficulty only.
  const SORT_WIRED: ('Title' | 'Artist' | 'Difficulty')[] = ['Title', 'Artist', 'Difficulty'];

  const FilterMatrix = () => (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <span className="lazer-filter-label w-[92px] shrink-0 pt-[3px]">Categories</span>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {SEARCH_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSearchCategory(category)}
              className={`lazer-filter-chip is-wired ${searchCategory === category ? 'is-selected' : ''}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const closedDownloadNotice = !open && downloadNotice ? (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed right-4 top-4 z-[130] flex max-w-sm items-stretch overflow-hidden rounded-2xl border border-white/15 bg-[#141522]/95 text-white shadow-[0_15px_40px_rgba(0,0,0,0.7),0_0_20px_rgba(255,204,34,0.1)] backdrop-blur-xl"
    >
      <div className="flex w-12 shrink-0 items-center justify-center border-r border-emerald-500/30 bg-emerald-500/20 text-emerald-400">
        <Check className="h-5 w-5" />
      </div>
      <div className="px-4 py-3 text-sm font-medium leading-snug">{downloadNotice}</div>
    </motion.div>
  ) : null;

  return (
    <>
      <AnimatePresence>{closedDownloadNotice}</AnimatePresence>
      <AnimatePresence>
        {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          <motion.div
            key="catalog-panel"
            ref={containerRef}
            data-beatmap-listing
            role="dialog"
            aria-label="beatmap listing"
            className="lazer-listing-panel fixed z-[110] top-[40px] bottom-0 inset-x-2 lg:left-[102px] lg:right-[102px] flex flex-col overflow-hidden font-sans text-slate-200"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'opacity' }}
          >
            <div className="lazer-listing-topbar relative flex-none px-4 md:px-8 pt-4 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-slate-300" aria-hidden="true">
                  <ListMusic className="h-6 w-6" />
                </span>
                <h1 className="lazer-listing-title">beatmap listing</h1>
              </div>

              {headerDownloadMessage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`pointer-events-none absolute left-1/2 top-1/2 hidden w-[42%] -translate-x-1/2 -translate-y-1/2 flex-col items-stretch justify-center gap-1 truncate rounded-xl border px-3 py-2 text-center text-[10px] font-mono sm:flex sm:text-xs shadow-lg backdrop-blur-md ${
                    importStatus?.type !== 'err'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-emerald-950/40'
                      : 'bg-rose-950/80 text-rose-300 border-rose-500/40 shadow-rose-950/40'
                  }`}
                >
                  <div className="flex min-w-0 items-center justify-center gap-2">
                    <Info className="h-4 w-4 shrink-0" />
                    <span className="truncate">{headerDownloadMessage}</span>
                  </div>
                  {downloadingMapId && downloadProgress && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-black/40">
                      <div className="h-full bg-gradient-to-r from-[#ffcc22] to-amber-300 transition-[width] duration-200 shadow-[0_0_8px_rgba(255,204,34,0.6)]" style={{ width: `${downloadProgress.percentage}%` }} />
                    </div>
                  )}
                </motion.div>
              )}

              <button
                onClick={onClose}
                className="p-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white transition duration-150 cursor-pointer"
                title="Close listing"
                aria-label="Close listing"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <>
                <div className="relative flex-none px-4 md:px-8 pt-3 pb-4">
                  <div className="lazer-listing-search relative flex items-center">
                    <input
                      type="text"
                      placeholder="type in keywords..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setFilterSearchTerm(searchTerm);
                          setSubmittedSearchTerm(searchTerm);
                        }
                      }}
                      aria-label="Search beatmaps"
                      className="w-full bg-transparent pl-4 pr-12 py-2.5 font-sans text-sm text-white placeholder-[#8b909b] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFilterSearchTerm(searchTerm);
                        setSubmittedSearchTerm(searchTerm);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-[#e967a1] transition-colors cursor-pointer"
                      title="Search"
                      aria-label="Search"
                    >
                      <Search className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-3">
                    <FilterMatrix />
                  </div>

                  {/* lazer wave divider */}
                  <svg className="mt-3 block h-[10px] w-full text-black/40" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M0 6 Q 25 0 50 5 T 100 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </div>

                <div className="lazer-listing-sortbar flex-none px-4 md:px-8 py-1.5 flex items-center gap-1 overflow-x-auto">
                  <span className="lazer-filter-label shrink-0 mr-1">Sort by</span>
                  {SORT_WIRED.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSortBy(opt)}
                      className={`lazer-sort-btn shrink-0 ${sortBy === opt ? 'is-selected' : ''}`}
                    >
                      {opt}
                    </button>
                  ))}
                  <span className="ml-auto flex items-center gap-2 shrink-0 pl-2">
                    <span className="text-slate-300" title="Grid view">
                      <LayoutGrid className="h-4 w-4" />
                    </span>
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 min-h-0">
                  {catalogError && (
                    <div className="p-3 mb-4 rounded-md text-xs font-mono border bg-rose-950/30 text-rose-300 border-rose-500/30">
                      {catalogError}
                    </div>
                  )}
                  {isLoading ? (
                    <div className="py-16 text-center">
                      <Loader className="h-8 w-8 mx-auto mb-3 animate-spin text-slate-300" />
                      <p className="lazer-listing-empty">Searching beatmaps…</p>
                    </div>
                  ) : !submittedSearchTerm.trim() ? (
                    <div className="py-16 text-center">
                      <p className="lazer-listing-empty">Type in keywords above to browse for new beatmaps.</p>
                    </div>
                  ) : catalogRequestState !== 'loaded' ? (
                    <div className="py-16 text-center">
                      <Loader className="h-8 w-8 mx-auto mb-3 animate-spin text-slate-300" />
                      <p className="lazer-listing-empty">Searching beatmaps…</p>
                    </div>
                  ) : sortedManifest.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 items-start gap-3 pb-4">
                      {sortedManifest.map((s) => {
                        const isDownloading = downloadingMapId === s.id;
                        const isQueued = downloadQueue.some((queued) => queued.id === s.id);
                        const isDownloaded = customMaps.some(
                          (m) =>
                            (m as Beatmap & { parentPackageId?: string; packageId?: string }).parentPackageId === s.id ||
                            (m as Beatmap & { packageId?: string }).packageId === `pkg_${s.id}`,
                        );

                        const expanded = expandedSetId === s.id;
                        const charts = s.charts || s.difficulties || [];
                        return (
                          <div
                            key={s.id}
                            className={`lazer-listing-card group ${expanded ? 'is-expanded' : ''}`}
                            onClick={() => revealSet(s.id)}
                          >
                            <div className="flex gap-2.5 p-2.5 items-stretch cursor-pointer">
                              <div className="h-14 w-20 shrink-0 self-center overflow-hidden rounded bg-black/40">
                                {(s.slimCoverUrl || s.coverUrl) ? (
                                  <img src={s.slimCoverUrl || s.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <Music className="h-6 w-6 text-white/30" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <h4 className="font-semibold text-[14px] text-white leading-tight truncate">
                                  {s.title}
                                </h4>
                                <p className="text-[12px] text-[#cfd3da] truncate">
                                  by {s.artist}
                                </p>
                                <p className="text-[11px] text-[#9aa0ab] truncate">mapped by {s.creator || 'Unknown'}</p>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <span className={statusPillClass(s.status)}>
                                    {(s.status || 'graveyard').toUpperCase()}
                                  </span>
                                  <DifficultyTicks stars={setMaxStars(s)} />
                                  <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                </div>
                              </div>
                              <div className="shrink-0 self-center" onClick={(event) => event.stopPropagation()}>
                                {isDownloaded ? (
                                  <div className="flex flex-col items-center gap-0.5 text-emerald-300 select-none bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1.5 rounded-md" title="Downloaded">
                                    <Check className="h-4 w-4 stroke-[2.5]" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider">READY</span>
                                  </div>
                                ) : isDownloading ? (
                                  <div className="flex flex-col items-center gap-1 text-cyan-300 bg-cyan-500/10 border border-cyan-400/30 px-2.5 py-1.5 rounded-md animate-pulse" title="Downloading">
                                    <Loader className="h-4 w-4 animate-spin" />
                                    <span className="text-[8px] font-bold uppercase">{downloadProgress?.percentage || 0}%</span>
                                  </div>
                                ) : isQueued ? (
                                  <div className="flex flex-col items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-slate-300" title="Queued">
                                    <Loader className="h-4 w-4 animate-spin" />
                                    <span className="text-[8px] font-bold uppercase tracking-wider">QUEUED</span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => enqueueDownload(s)}
                                    className="p-2.5 bg-white/[0.07] hover:bg-[#00e5ff]/25 text-white rounded-md border border-white/15 hover:border-[#00e5ff]/50 transition-all duration-150 active:scale-95 flex items-center justify-center cursor-pointer"
                                    title="Download map pack"
                                    aria-label={`Download ${s.title}`}
                                  >
                                    <Download className="h-4 w-4 stroke-[2.2]" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isDownloading && downloadProgress && (
                              <div className="h-[3px] bg-black/40">
                                <div className="h-full bg-[#00e5ff] transition-[width] duration-200" style={{ width: `${downloadProgress.percentage}%` }} />
                              </div>
                            )}
                            {expanded && (
                              <div className="border-t border-white/10 bg-black/35 px-2.5 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5" onClick={(event) => event.stopPropagation()}>
                                {charts.length > 0 ? charts.map((chart, index) => {
                                  const rating = Number(chart.starRating ?? 0);
                                  return (
                                    <div key={`${chart.id}-${index}`} className="flex items-center justify-between gap-2 rounded bg-white/[0.05] border border-white/10 hover:border-[#00e5ff]/50 px-2.5 py-1.5 text-xs text-slate-200 transition-colors">
                                      <span className="truncate">
                                        <b className="text-white font-bold mr-1">{chart.keyCount ? `${chart.keyCount}K` : ''}</b>
                                        {chart.version || chart.name || 'Unknown'}
                                      </span>
                                      <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono font-bold text-[10px] border ${getDifficultyBadge(rating)}`}>
                                        ★ {rating.toFixed(2)}
                                      </span>
                                    </div>
                                  );
                                }) : (
                                  <span className="text-xs text-slate-400 col-span-full py-1">Difficulty details unavailable.</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-16 px-8 flex flex-col items-center justify-center text-center">
                      <p className="lazer-listing-empty">… nope, nothing found.</p>
                    </div>
                  )}
                </div>
                <div className="flex-none flex items-center justify-between px-4 md:px-8 py-2.5 border-t border-white/10 bg-black/25">
                  <FooterBackButton onClick={onClose} label="back" />
                  {(sortedManifest.length > 0 || submittedSearchTerm.trim()) && (
                    <span className="text-[11px] text-[#9aa0ab]">
                      {sortedManifest.length > 0
                        ? `${sortedManifest.length} ${sortedManifest.length === 1 ? 'match' : 'matches'}`
                        : 'no matches'}
                    </span>
                  )}
                </div>
              </>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </>
  );
}
