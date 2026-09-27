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

import React, { useState, useRef, useEffect, useCallback, useDeferredValue } from 'react';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Upload, Sliders, Play, Compass, Info, Trash2,
  Music, ArrowLeft, ChevronRight,
  ChevronDown, Star, Check, SlidersHorizontal, Shuffle,
  Clock, Heart, Award, X, Infinity as InfinityIcon,
  SquareSlash, Eye, Layers, Flashlight, Rewind, FastForward, ArrowUpToLine, Keyboard, Sparkles,
  Skull, Zap, FlipHorizontal, Gauge, ArrowUpDown, Ban, MousePointerClick,
  TrendingUp, TrendingDown, Activity, VolumeX, Film, Target
} from 'lucide-react';
import { Beatmap, GameSettings, PlayHistoryRecord } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { AssetLifecycleManager } from '../utils/assetLifecycle';
import { MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, sanitizeCssUrl, decodeBoundedUtf8, createZipExtractionBudget } from '../utils/securityLimits';
import { storageManager } from '../utils/storageManager';
import { preloadBeatmapBackgrounds, shouldUnpackVideo, unpackBeatmap } from '../utils/unpackHelper';
import { computeBeatmapHash } from '../utils/replayManager';
import { extractZipEntry } from '../utils/zipResolver';
import { previewPlayer } from '../utils/previewPlayer';
import { getCachedStarRating, getCachedNoteCounts, buildSongMapsIndex } from '../utils/songSelectCache';
import { calculateManiaDifficultyAttributes } from '../ruleset/mania/difficultyCalculator';
import { contrastTextOn, hexWithAlpha, sampleStarDifficultyColor, STRAIN_STAR_RATING_VERSION } from '../utils/starRating';
import { SCROLL_SPEED_MAX, SCROLL_SPEED_MIN } from './settings/defaultSettings';
import { computeScrollTravelTimeMs } from '../render/playfieldLayout';
import metadata from '../../metadata.json';
import { getCatalogSetMetadata } from '../utils/catalogSetMetadata';
import { computeModMultiplier } from '../ruleset/mania/scoreProcessor';
import ModSelectOverlay from './ModSelectOverlay';
import { SongSelectFooter, SongSelectCarousel, SongSelectLeftPanel } from '../ui/lazer';

const DEFAULT_SONG_BANNER = '/backgrounds/Ferineon.webp';

function recordMatchesSelectedChart(record: PlayHistoryRecord, map: Beatmap): boolean {
  if (record.beatmapId === map.id) return true;
  if (map.beatmapHash && record.beatmapHash === map.beatmapHash) return true;
  if (map.chartRevisionId && record.chartRevisionId === map.chartRevisionId) return true;
  if (map.catalogMapId && record.catalogMapId === map.catalogMapId) return true;
  return false;
}

function compareLocalScoreRows(a: PlayHistoryRecord, b: PlayHistoryRecord): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
  return (b.timestamp || 0) - (a.timestamp || 0);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getGradeBadgeClass(grade: string): string {
  switch (grade) {
    case 'SS':
    case 'S':
      return 'bg-amber-400/20 text-amber-300 border border-amber-400/40';
    case 'A':
      return 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/40';
    case 'B':
      return 'bg-blue-400/20 text-blue-300 border border-blue-400/40';
    case 'C':
      return 'bg-purple-400/20 text-purple-300 border border-purple-400/40';
    case 'D':
      return 'bg-rose-400/20 text-rose-300 border border-rose-400/40';
    default:
      return 'bg-slate-700/40 text-slate-300 border border-white/10';
  }
}

interface SongSelectProps {
  settings: GameSettings;
  updateSettings: (s: Partial<GameSettings>) => void;
  onSelectMap: (map: Beatmap) => void;
  onOpenSettings: () => void;
  customMaps: Beatmap[];
  onImportBeatmap: (map: Beatmap) => void;
  onImportPackage: (packageId: string, name: string, blob: Blob, maps: Beatmap[]) => Promise<void>;
  onDeleteSongGroup?: (mapIds: string[]) => void;
  setSongSelectBgUrl?: (url: string) => void;
  onBack?: () => void;
  onOpenOnlineCatalog?: () => void;
  onWatchReplay?: (record: PlayHistoryRecord, beatmap?: Beatmap) => Promise<{ success: boolean; error?: string }> | void;
  playHistory?: PlayHistoryRecord[];
  // When false (fresh app load), Song Select will not pre-select any map.
  // When true (returning from gameplay/replay), it resumes the last selected map.
  shouldAutoSelectOnMount?: boolean;
  // True while beatmaps are still loading (IndexedDB/migration). Shows a
  // bare spinner in the carousel until song banners are ready.
  isLoading?: boolean;
}

export default function SongSelect({
  settings,
  updateSettings,
  onSelectMap,
  onOpenSettings,
  customMaps,
  onImportBeatmap,
  onImportPackage,
  onDeleteSongGroup,
  setSongSelectBgUrl,
  onBack,
  onOpenOnlineCatalog,
  onWatchReplay,
  playHistory = [],
  shouldAutoSelectOnMount = false,
  isLoading = false,
}: SongSelectProps) {
  // Search & Basic UI State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCustomMapId, setSelectedCustomMapId] = useState<string>(() => {
    if (typeof window !== 'undefined' && shouldAutoSelectOnMount) {
      const savedLastId = localStorage.getItem('rhythm_mania_v1_last_selected_map_id');
      if (savedLastId) return savedLastId;
    }
    return '';
  });
  const [lastSelectedDifficultyBySong, setLastSelectedDifficultyBySong] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('rhythm_mania_v1_last_diff_by_song');
        return saved ? JSON.parse(saved) : {};
      } catch (e) {
        console.warn('Failed to load last selected difficulty by song:', e);
      }
    }
    return {};
  });
  const lastSelectedDifficultyBySongRef = useRef(lastSelectedDifficultyBySong);
  lastSelectedDifficultyBySongRef.current = lastSelectedDifficultyBySong;
  const [unpackTrigger, setUnpackTrigger] = useState<number>(0);
  const [manualExpandedSongKey, setManualExpandedSongKey] = useState<string | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState<boolean>(false);
  const carouselContainerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLDivElement | null>(null);
  // The filter stack floats over the top of the carousel (which runs up to
  // the toolbar), so the scroll content reserves a top spacer matching the
  // stack height to keep the first banners from hiding underneath it.
  const filterStackRef = useRef<HTMLDivElement | null>(null);
  const [filterStackH, setFilterStackH] = useState(0);
  useEffect(() => {
    const el = filterStackRef.current;
    if (!el) return;
    const measure = () => setFilterStackH(el.offsetHeight);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, []);

  // One-time carousel centring (osu!lazer ScrollToSelection behaviour):
  // explicit selections request a single animated centre of the chosen
  // group; free scrolling afterwards is never forced back. The carousel
  // owns the animation and skips it when already centred.
  const [carouselCenterSignal, setCarouselCenterSignal] = useState<{ key: string; nonce: number } | undefined>(undefined);
  const carouselCenterNonceRef = useRef(0);
  const requestCarouselCenter = useCallback((songKey: string) => {
    if (!songKey) return;
    carouselCenterNonceRef.current += 1;
    setCarouselCenterSignal({ key: songKey, nonce: carouselCenterNonceRef.current });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') onOpenSettings();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenSettings]);

  const [scrollSpeedToast, setScrollSpeedToast] = useState<string | null>(null);
  const scrollSpeedToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // F3 / F4 and Ctrl+/- / Ctrl+= for scroll speed adjustment on song select
  useEffect(() => {
    const handleScrollSpeedKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      let delta = 0;
      if (e.key === 'F3') {
        delta = -1;
      } else if (e.key === 'F4') {
        delta = 1;
      } else if (e.ctrlKey || e.metaKey) {
        if (e.key === '-' || e.key === '_') {
          delta = -1;
        } else if (e.key === '=' || e.key === '+') {
          delta = 1;
        }
      }

      if (delta !== 0) {
        e.preventDefault();
        const currentSpeed = settings.scrollSpeed ?? 21;
        const newSpeed = Math.max(SCROLL_SPEED_MIN, Math.min(SCROLL_SPEED_MAX, currentSpeed + delta));
        if (newSpeed !== currentSpeed) {
          updateSettings({ scrollSpeed: newSpeed });
        }
        const travelMs = computeScrollTravelTimeMs(newSpeed);
        setScrollSpeedToast(`${newSpeed}x (~${travelMs}ms)`);
        if (scrollSpeedToastTimeoutRef.current) clearTimeout(scrollSpeedToastTimeoutRef.current);
        scrollSpeedToastTimeoutRef.current = setTimeout(() => {
          setScrollSpeedToast(null);
        }, 1500);
      }
    };

    window.addEventListener('keydown', handleScrollSpeedKeyDown);
    return () => {
      window.removeEventListener('keydown', handleScrollSpeedKeyDown);
      if (scrollSpeedToastTimeoutRef.current) clearTimeout(scrollSpeedToastTimeoutRef.current);
    };
  }, [settings.scrollSpeed, updateSettings]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  
  const [songDeleteConfirmKey, setSongDeleteConfirmKey] = useState<string | null>(null);


  // High-fidelity options, filters, details state variables
  const [showPreplayOptions, setShowPreplayOptions] = useState<boolean>(false);
  const [minStar, setMinStar] = useState<number>(0.0);
  const [maxStar, setMaxStar] = useState<number>(10.0);
  const [sortBy, setSortBy] = useState<string>('Title');
  const [groupBy, setGroupBy] = useState<string>('None');
  const [collectionFilter, setCollectionFilter] = useState<string>('All beatmaps');
  const [openFilterMenu, setOpenFilterMenu] = useState<'sort' | 'group' | 'collection' | null>(null);
  const [showModsModal, setShowModsModal] = useState<boolean>(false);
  const [leftPanelTab, setLeftPanelTab] = useState<'details' | 'ranking'>('ranking');
  const starTrackRef = useRef<HTMLDivElement | null>(null);
  const starDragTargetRef = useRef<'min' | 'max' | null>(null);

  const clampStar = (v: number): number => Math.max(0, Math.min(10, Math.round(v * 10) / 10));

  const setStarBound = (which: 'min' | 'max', v: number) => {
    const nv = clampStar(v);
    if (which === 'min') {
      setMinStar(nv);
      if (nv > maxStar) setMaxStar(nv);
    } else {
      setMaxStar(nv);
      if (nv < minStar) setMinStar(nv);
    }
  };

  const starValueFromClientX = (clientX: number): number => {
    const el = starTrackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clampStar(((clientX - rect.left) / rect.width) * 10);
  };

  const handleStarTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = starValueFromClientX(e.clientX);
    const distMin = Math.abs(v - minStar);
    const distMax = Math.abs(v - maxStar);
    const target: 'min' | 'max' = distMin <= distMax ? 'min' : 'max';
    starDragTargetRef.current = target;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setStarBound(target, v);
  };

  const handleStarTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = starDragTargetRef.current;
    if (!target) return;
    setStarBound(target, starValueFromClientX(e.clientX));
  };

  const endStarDrag = () => {
    starDragTargetRef.current = null;
  };

  const handleStarTrackWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const step = e.deltaY > 0 ? -0.1 : 0.1;
    if (e.shiftKey) {
      setStarBound('max', maxStar + step);
    } else {
      setStarBound('min', minStar + step);
    }
  };

  // Favorites: stable song-group keys persisted to localStorage
  const [favoriteSongs, setFavoriteSongs] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('rhythm_mania_v1_favorite_songs');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed
              .filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 300)
              .slice(0, 5000);
          }
        }
      } catch (e) {
        console.warn('Failed to load favorite songs:', e);
      }
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('rhythm_mania_v1_favorite_songs', JSON.stringify(favoriteSongs));
    } catch (e) {
      console.warn('Failed to save favorite songs:', e);
    }
  }, [favoriteSongs]);

  const toggleFavorite = useCallback((songKey: string) => {
    setFavoriteSongs(prev =>
      prev.includes(songKey) ? prev.filter(k => k !== songKey) : [...prev, songKey]
    );
  }, []);





  // Clean raw local custom URL allocations prior to page reload/destruction
  useEffect(() => {
    return () => {
      // Intentionally NOT clearing blob URLs here, as those are required during gameplay and passed verbatim.
      // AssetLifecycleManager.clearAll(); (Removed to fix Audio Failed to Decode issues during handoff)
    };
  }, []);

  // Determine actual star rating dynamically (memoized per chart so
  // filtering/sorting/grouping never re-walks note arrays per render).
  // Stable reference so the carousel does not re-render on every parent render.
  const getStarRating = useCallback((map: any) => getCachedStarRating(map as Beatmap), []);

  // Difficulty pill/text colours: official osu!lazer star-difficulty colour
  // as a tinted chip (light colours read in their own colour, dark colours
  // in grey). Stable reference so the left panel does not re-render.
  const getDifficultyColor = useCallback((rating: number): React.CSSProperties => {
    const base = sampleStarDifficultyColor(rating);
    const text = contrastTextOn(base) === '#ffffff' ? '#cfd3da' : base;
    return {
      color: text,
      backgroundColor: hexWithAlpha(base, 0.16),
      border: `1px solid ${hexWithAlpha(base, 0.45)}`,
    };
  }, []);

  // Resolve locally stored uploads and previously downloaded mirror maps.
  const mergedCustomMaps = React.useMemo((): Beatmap[] => {
    const resolvedCustomMaps: Beatmap[] = [];
    
    // 1. Incorporate local custom maps with media blob checks
    customMaps.forEach((map) => {
      const cached = storageManager.lruMediaCache.get(map.id);
      resolvedCustomMaps.push({
        ...map,
        audioUrl: cached?.audioUrl || map.audioUrl,
        videoUrl: cached?.videoUrl || map.videoUrl,
        bgUrl: cached?.bgUrl || map.bgUrl,
        isCached: true,
        mode: map.mode !== undefined ? map.mode : 3
      } as any);
    });

    return resolvedCustomMaps;
  }, [customMaps, unpackTrigger]);



  // Save selected map ID to local storage for persistent selection
  useEffect(() => {
    if (selectedCustomMapId) {
      localStorage.setItem('rhythm_mania_v1_last_selected_map_id', selectedCustomMapId);
    }
  }, [selectedCustomMapId]);

  // Stable song-key helpers: referenced by the cached diff index and all
  // grouping memos. useCallback keeps their identity stable so downstream
  // useMemo caches are not invalidated on every render.
  const getArtistTitleKey = useCallback((map: any) => {
    const mapArtist = map.artist || 'Unknown';
    const mapTitle = map.title || 'Untitled';
    return `${mapArtist.toLowerCase().trim()} - ${mapTitle.toLowerCase().trim()}`;
  }, []);

  const getMapSongKey = useCallback((map: any) => {
    const mapPkgId = map.parentPackageId || (map.packageId ? map.packageId.replace(/^pkg_/, '') : undefined);
    if (mapPkgId) return `package_${mapPkgId}`;
    // Standalone imports have no package identity. Keep same-name imports
    // separate instead of collapsing them into one song group.
    return map.id ? `local_map_${map.id}` : getArtistTitleKey(map);
  }, [getArtistTitleKey]);

  // Deferred search keeps typing responsive: the input updates immediately
  // while the expensive filter/sort/group pass runs at lower priority.
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const getSlimCoverUrl = (map: any): string | undefined => {
    const mapCoverUrl = typeof map?.coverUrl === 'string' ? map.coverUrl : undefined;
    if (mapCoverUrl) return mapCoverUrl;

    let sourceSetId = Number(
      map?.sourceSetId || String(map?.catalogSetId || '').replace(/^osuapi_/, ''),
    );

    if (!Number.isInteger(sourceSetId) || sourceSetId < 1) {
      const pkgId = map?.parentPackageId || map?.packageId;
      if (typeof pkgId === 'string') {
        const match = pkgId.match(/(?:osuapi_|pkg_)?(\d{1,10})/);
        if (match) {
          const parsed = Number(match[1]);
          if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
        }
      }
    }

    if ((!Number.isInteger(sourceSetId) || sourceSetId < 1) && typeof map?.originalContent === 'string') {
      const match = map.originalContent.match(/^BeatmapSetID\s*:\s*(\d+)/im);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
      }
    }

    if (!Number.isInteger(sourceSetId) || sourceSetId < 1) return undefined;

    return getCatalogSetMetadata(sourceSetId)?.slimCoverUrl
      || `https://assets.ppy.sh/beatmaps/${sourceSetId}/covers/slimcover@2x.jpg`;
  };

  // Cached diff index: songKey -> sibling diffs. Built once per map-array
  // change so expanding a song banner, resolving the remembered difficulty,
  // and reading the current song's diffs are O(1) lookups instead of O(n)
  // scans — no .osz unpack is needed to list diff names/info.
  const songMapsByKey = React.useMemo(
    () => buildSongMapsIndex(mergedCustomMaps, getMapSongKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mergedCustomMaps],
  );

  // Filter and prepare display beatmaps. Star ratings come from the
  // memoized cache (no per-render note walks); search uses the deferred
  // value so typing never blocks on the filter/sort pass.
  const filteredCustomMaps = React.useMemo(() => {
    const q = deferredSearchTerm.trim().toLowerCase();
    const hasQuery = q.length > 0;
    return mergedCustomMaps.filter(map => {
       // Song Select exposes osu!mania charts only.
       if (map.mode !== undefined && map.mode !== 3) return false;

      // Filter by search text query
      if (hasQuery) {
        const title = (map.title || '').toLowerCase();
        const artist = (map.artist || '').toLowerCase();
        const creator = (map.creator || '').toLowerCase();
        if (!title.includes(q) && !artist.includes(q) && !(creator && creator.includes(q))) return false;
      }

      // Filter by dynamic star limits
      const rating = getStarRating(map);
      if (rating < minStar || rating > maxStar) return false;

      // Filter by collection
      if (collectionFilter === 'Favorites') {
        if (!favoriteSongs.includes(getMapSongKey(map))) return false;
      }

      return true;
    }).sort((a, b) => {
      if (groupBy === 'Artist') {
        const c = a.artist.localeCompare(b.artist);
        if (c !== 0) return c;
      } else if (groupBy === 'Creator') {
        const c = (a.creator || '').localeCompare(b.creator || '');
        if (c !== 0) return c;
      }
      if (sortBy === 'Title') return a.title.localeCompare(b.title);
      if (sortBy === 'Artist') return a.artist.localeCompare(b.artist);
      if (sortBy === 'Difficulty') return getStarRating(b) - getStarRating(a);
      if (sortBy === 'BPM') return (b.bpm || 0) - (a.bpm || 0);
      if (sortBy === 'Length') return (b.duration || 0) - (a.duration || 0);
      if (sortBy === 'Date Added') {
        const delta = ((b as any).importedAt || 0) - ((a as any).importedAt || 0);
        return delta !== 0 ? delta : a.title.localeCompare(b.title);
      }
      return 0;
    });
  }, [mergedCustomMaps, deferredSearchTerm, minStar, maxStar, collectionFilter, sortBy, groupBy, favoriteSongs, getStarRating, getMapSongKey]);

  const persistLastDifficultyForMap = useCallback((map: any) => {
    if (!map?.id) return;
    const keys = new Set<string>([getMapSongKey(map), getArtistTitleKey(map)]);
    if (map.parentPackageId) keys.add(`package_${map.parentPackageId}`);
    if (map.packageId) keys.add(`package_${String(map.packageId).replace(/^pkg_/, '')}`);
    // Difficulty name fallback (used when map ids are rebuilt on re-import)
    const metaKey = `diffname:${getArtistTitleKey(map)}`;

    setLastSelectedDifficultyBySong(prev => {
      const updated = { ...prev };
      keys.forEach((k) => { updated[k] = map.id; });
      if (map.difficulty) updated[metaKey] = String(map.difficulty);
      lastSelectedDifficultyBySongRef.current = updated;
      try {
        localStorage.setItem('rhythm_mania_v1_last_diff_by_song', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save last selected difficulty by song:', e);
      }
      return updated;
    });
  }, [getMapSongKey, getArtistTitleKey]);

  // Save selected difficulty for the song (selection changes are rare;
  // a single linear find here is negligible vs the per-frame filter path).
  useEffect(() => {
    if (selectedCustomMapId) {
      const selectedMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId);
      if (selectedMap) {
        persistLastDifficultyForMap(selectedMap);
      }
    }
  }, [selectedCustomMapId, mergedCustomMaps, persistLastDifficultyForMap]);

  // Load last selected map ID on mount/update if none is currently selected.
  // Suppressed on fresh app loads (shouldAutoSelectOnMount === false) so the
  // user starts with a clean, unselected Song Select; only returns from a
  // finished/quit gameplay session opt into auto-resuming the last played map.
  useEffect(() => {
    if (!shouldAutoSelectOnMount) return;
    if (!selectedCustomMapId && filteredCustomMaps.length > 0) {
      const savedLastId = localStorage.getItem('rhythm_mania_v1_last_selected_map_id');
      if (savedLastId) {
        const exists = filteredCustomMaps.some(m => m.id === savedLastId);
        if (exists) {
          const savedMap = filteredCustomMaps.find(m => m.id === savedLastId);
          if (savedMap) {
            handleSelectCustomMap(savedMap);
            requestCarouselCenter(getMapSongKey(savedMap));
            return;
          }
        }
      }

      const defaultMap = filteredCustomMaps[0];
      if (defaultMap) {
        handleSelectCustomMap(defaultMap);
        requestCarouselCenter(getMapSongKey(defaultMap));
      }
    }
  }, [filteredCustomMaps, selectedCustomMapId, shouldAutoSelectOnMount]);

  // Group maps by normalized artist & title
  const songGroups = React.useMemo(() => {
    const groupsMap = new Map<string, {
      songKey: string;
      title: string;
      artist: string;
      creator?: string;
      coverUrl?: string;
      packageId?: string;
      bgUrl?: string;
      difficultiesSummary?: string[];
      maps: typeof filteredCustomMaps;
    }>();

    filteredCustomMaps.forEach((map) => {
      const songKey = getMapSongKey(map);
      
      let group = groupsMap.get(songKey);
      if (!group) {
        const mapTitle = map.title || 'Untitled';
        const mapArtist = map.artist || 'Unknown';
        group = {
          songKey,
          title: mapTitle,
          artist: mapArtist,
          creator: map.creator || (map as any).creator,
            coverUrl: getSlimCoverUrl(map),
          packageId: (map as any).packageId,
          bgUrl: map.bgUrl,
          difficultiesSummary: (map as any).difficultiesSummary || (map as any).difficultsSummary || [],
          maps: []
        };
        groupsMap.set(songKey, group);
      } else {
        if (!group.bgUrl && map.bgUrl) group.bgUrl = map.bgUrl;
        if (!group.coverUrl) group.coverUrl = getSlimCoverUrl(map);
        if (!group.creator && map.creator) group.creator = map.creator;
      }
      
      const mapDiffs = (map as any).difficultiesSummary || (map as any).difficultsSummary;
      if (mapDiffs && mapDiffs.length > (group.difficultiesSummary?.length || 0)) {
        group.difficultiesSummary = mapDiffs;
      }
      
      group.maps.push(map);
    });

    return Array.from(groupsMap.values());
  }, [filteredCustomMaps]);

  const activeSongKey = React.useMemo(() => {
    const selected = filteredCustomMaps.find(m => m.id === selectedCustomMapId);
    if (!selected) return '';
    return getMapSongKey(selected);
  }, [selectedCustomMapId, filteredCustomMaps]);

  const expandedSongKey = manualExpandedSongKey !== null ? manualExpandedSongKey : activeSongKey;

  // O(1) id lookup so selection/expand never scans the library.
  const mapById = React.useMemo(() => {
    const index = new Map<string, Beatmap>();
    for (const m of mergedCustomMaps) index.set(m.id, m);
    return index;
  }, [mergedCustomMaps]);

  const selectedCustomMapIdRef = useRef(selectedCustomMapId);
  selectedCustomMapIdRef.current = selectedCustomMapId;

  const resolveGroupTargetMap = useCallback((group: any) => {
    const pool: any[] = [];
    const seen = new Set<string>();
    const pushAll = (maps: any[] | undefined) => {
      (maps || []).forEach((m) => {
        if (m?.id && !seen.has(m.id)) {
          seen.add(m.id);
          pool.push(m);
        }
      });
    };
    pushAll(group.maps);
    // Include unfiltered sibling diffs (star/search filters can hide the last-picked difficulty from group.maps).
    // Served from the cached songKey -> diffs index: no scan, no .osz unpack.
    const artistTitleKey = getArtistTitleKey(group);
    pushAll(songMapsByKey.get(group.songKey));
    if (group.songKey === artistTitleKey) {
      // Legacy artist-title groups: siblings share the key already.
    } else {
      for (const m of mergedCustomMaps) {
        if (getArtistTitleKey(m) === artistTitleKey && !seen.has(m.id)) {
          pushAll([m]);
          break;
        }
      }
    }

    if (pool.length === 0) return null;

    const memory = lastSelectedDifficultyBySongRef.current;
    const candidateIds = [
      memory[group.songKey],
      memory[artistTitleKey],
      group.packageId ? memory[`package_${String(group.packageId).replace(/^pkg_/, '')}`] : undefined,
    ].filter(Boolean) as string[];

    for (const savedMapId of candidateIds) {
      const found = pool.find((m) => m.id === savedMapId);
      if (found) return found;
    }

    const savedDiffName = memory[`diffname:${artistTitleKey}`];
    if (savedDiffName) {
      const byName = pool.find((m) => String(m.difficulty || '') === savedDiffName);
      if (byName) return byName;
    }

    // Prefer keeping the currently selected difficulty when re-clicking the active group
    const current = pool.find((m) => m.id === selectedCustomMapIdRef.current);
    if (current) return current;

    return pool[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songMapsByKey, getArtistTitleKey, getMapSongKey, mergedCustomMaps]);

  const selectedCustomMap = React.useMemo(
    () => (selectedCustomMapId ? mapById.get(selectedCustomMapId) || null : null),
    [mapById, selectedCustomMapId],
  );

  const chartLocalScores = React.useMemo(() => {
    if (!selectedCustomMap) return [];
    return playHistory
      .filter((record) => recordMatchesSelectedChart(record, selectedCustomMap))
      .slice()
      .sort(compareLocalScoreRows);
  }, [playHistory, selectedCustomMap]);

  // Background cover images (Always ensure we have a beautiful wallpaper background with vibrant, lively colors)
  // Group-stable: one URL per song, so switching difficulties inside a
  // song never swaps the image (per-diff blob URLs of identical art
  // used to reload/flash the backdrop on every switch).
  const selectedGroupForBg = React.useMemo(() => {
    if (!selectedCustomMap) return null;
    const songKey = getMapSongKey(selectedCustomMap);
    return songGroups.find(g => g.songKey === songKey) || null;
  }, [selectedCustomMap, songGroups]);

  const groupBgUrl = React.useMemo(() => {
    if (!selectedGroupForBg) return '';
    const found = selectedGroupForBg.maps.find(
      (m) => m.bgUrl && m.bgUrl !== '/backgrounds/default.svg' && m.bgUrl !== '/backgrounds/Ferineon.webp',
    );
    return found?.bgUrl || '';
  }, [selectedGroupForBg]);

  // Displayed backdrop holds the last image until the next one is fully
  // preloaded — it never unmounts or flashes mid-switch.
  const [displayedBgUrl, setDisplayedBgUrl] = useState('');
  const displayedBgUrlRef = useRef('');
  const pendingBgRef = useRef('');
  const defaultRandomBgRef = React.useRef<string | null>(null);

  const getDefaultRandomBg = () => {
    if (!defaultRandomBgRef.current) {
      const bgs = [
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
        'wxyz.webp'
      ];
      defaultRandomBgRef.current = bgs[Math.floor(Math.random() * bgs.length)];
    }
    return `/backgrounds/${defaultRandomBgRef.current}`;
  };

  useEffect(() => {
    if (groupBgUrl) {
      if (groupBgUrl === displayedBgUrlRef.current || groupBgUrl === pendingBgRef.current) return;
      const next = groupBgUrl;
      pendingBgRef.current = next;
      const img = new Image();
      const apply = () => {
        // A newer request superseded this one — drop the stale load.
        if (pendingBgRef.current !== next) return;
        pendingBgRef.current = '';
        if (displayedBgUrlRef.current === next) return;
        displayedBgUrlRef.current = next;
        setDisplayedBgUrl(next);
      };
      img.onload = apply;
      img.onerror = apply;
      img.src = next;
    } else if (!selectedCustomMap) {
      const fallback = getDefaultRandomBg();
      pendingBgRef.current = '';
      if (displayedBgUrlRef.current !== fallback) {
        displayedBgUrlRef.current = fallback;
        setDisplayedBgUrl(fallback);
      }
    }
    // No clearing while a new group's art is still unpacking — the old
    // backdrop holds instead of flashing away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBgUrl, selectedCustomMap]);

  useEffect(() => {
    if (typeof setSongSelectBgUrl === 'function' && displayedBgUrl) {
      setSongSelectBgUrl(displayedBgUrl);
    }
  }, [displayedBgUrl, setSongSelectBgUrl]);

  // Neighbour prefetch: unzip + decode the song art for the groups around
  // the selection so carousel scrolling and backdrop swaps stay instant.
  // Runs at idle priority with bounded concurrency (see unpackHelper).
  useEffect(() => {
    if (songGroups.length === 0) return;
    let selectedIndex = songGroups.findIndex((g) => g.songKey === activeSongKey);
    if (selectedIndex < 0) selectedIndex = 0;
    const neighbours: Beatmap[] = [];
    for (let offset = -3; offset <= 3; offset += 1) {
      if (offset === 0) continue;
      const group = songGroups[selectedIndex + offset];
      const rep = group?.maps?.[0] as Beatmap | undefined;
      if (rep?.id) neighbours.push(rep);
    }
    if (neighbours.length > 0) preloadBeatmapBackgrounds(neighbours);
    // Remote catalog covers need no unzip — warm the browser image cache.
    for (let offset = -3; offset <= 3; offset += 1) {
      if (offset === 0) continue;
      const cover = songGroups[selectedIndex + offset]?.coverUrl;
      if (typeof cover === 'string' && cover.startsWith('http')) {
        try {
          const img = new Image();
          (img as { decoding?: string }).decoding = 'async';
          img.src = cover;
        } catch {
          // prefetch is best-effort
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songGroups, activeSongKey]);

  const selectedGroup = React.useMemo(() => {
    if (!selectedCustomMap) return null;
    const songKey = getMapSongKey(selectedCustomMap);
    return songGroups.find(g => g.songKey === songKey) || null;
  }, [selectedCustomMap, songGroups]);

  // Extract all compiled difficulties for the currently selected track regardless of star thresholds/filter bounds.
  // Served from the cached index — no scan, no unpack.
  const currentSongMaps = React.useMemo(() => {
    if (!selectedCustomMap) return [];
    const songKey = getMapSongKey(selectedCustomMap);
    return songMapsByKey.get(songKey) || [];
  }, [selectedCustomMap, songMapsByKey, getMapSongKey]);

  const availableKeyCounts = React.useMemo(() => {
    return Array.from(new Set(currentSongMaps.map(m => m.keyCount).filter(Boolean)));
  }, [currentSongMaps]);

  // Automatically remove conflicting key change mods when switching to a song group that has native difficulties for those keys
  useEffect(() => {
    const activeMods = settings.selectedMods || [];
    const activeKeyChangeMod = activeMods.find(m => /^K(?:[1-9]|10)$/.test(m));
    
    if (activeKeyChangeMod) {
      const keyCount = parseInt(activeKeyChangeMod.substring(1), 10);
      if (availableKeyCounts.includes(keyCount)) {
        const newMods = activeMods.filter(m => m !== activeKeyChangeMod);
        if (newMods.length !== activeMods.length) {
          updateSettings({ selectedMods: newMods });
        }
      }
    }
  }, [availableKeyCounts, settings.selectedMods, updateSettings]);


  // Two-tier selection: the diff list/banner expands instantly from cached
  // metadata (no I/O). Media unpack runs in the background:
  //  - background-only unpack fires immediately (persisted IndexedDB art or
  //    a cheap unzip) so the backdrop appears fast;
  //  - the full audio/video unpack is debounced, so fast keyboard scrolling
  //    or rapid banner clicks never queue a full .osz decompress per step.
  const unpackGenerationRef = useRef(0);
  const fullUnpackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (fullUnpackTimerRef.current) clearTimeout(fullUnpackTimerRef.current);
  }, []);

  const applyCachedMediaToMap = (map: Beatmap, skipVideo: boolean) => {
    const cached = storageManager.lruMediaCache.get(map.id);
    if (cached) {
      if (cached.audioUrl) map.audioUrl = cached.audioUrl;
      if (cached.bgUrl) map.bgUrl = cached.bgUrl;
      if (skipVideo) {
        if (map.videoUrl && map.videoUrl !== cached.videoUrl && map.videoUrl.startsWith('blob:')) {
          AssetLifecycleManager.releaseSpecific(map.videoUrl);
        }
        map.videoUrl = '';
      } else if (cached.videoUrl) map.videoUrl = cached.videoUrl;
    } else if (skipVideo && map.videoUrl?.startsWith('blob:')) {
      AssetLifecycleManager.releaseSpecific(map.videoUrl);
      map.videoUrl = '';
    }
    return cached;
  };

  const handleSelectCustomMap = useCallback(async (map: Beatmap, forceUnpack = false) => {
    const skipVideo = settings.disableVideo === true;
    const wantsVideo = shouldUnpackVideo((map as any).videoFilename || '', { skipVideo });
    const cacheReady = (c: { audioUrl: string; videoUrl: string; bgUrl: string } | null) =>
      !!(c?.audioUrl && c?.bgUrl && (!wantsVideo || c.videoUrl));

    if (map.id === selectedCustomMapIdRef.current) {
      const cached = applyCachedMediaToMap(map, skipVideo);
      if (!forceUnpack && cacheReady(cached)) return;
    }

    // Instant: selection state + persisted difficulty. The UI (diff list,
    // left panel, carousel highlight) renders from cached data immediately.
    setSelectedCustomMapId(map.id);
    persistLastDifficultyForMap(map);

    const generation = ++unpackGenerationRef.current;
    const isStale = () => unpackGenerationRef.current !== generation;

    if (forceUnpack) {
      if (fullUnpackTimerRef.current) {
        clearTimeout(fullUnpackTimerRef.current);
        fullUnpackTimerRef.current = null;
      }
      try {
        await unpackBeatmap(map, true, { skipVideo });
        if (isStale()) return;
        applyCachedMediaToMap(map, skipVideo);
        setUnpackTrigger(prev => prev + 1);
      } catch (err) {
        if (!isStale()) console.warn('Unpacker encountered an issue resolving map media channels:', err);
      }
      return;
    }

    // Tier 1: background art only — cheap, never blocks the diff list.
    try {
      await unpackBeatmap(map, false, { backgroundOnly: true });
      if (isStale()) return;
      applyCachedMediaToMap(map, skipVideo);
      setUnpackTrigger(prev => prev + 1);
    } catch {
      // Best-effort; the full unpack below retries.
    }
    if (isStale()) return;

    const cachedAfterBg = storageManager.lruMediaCache.get(map.id);
    if (cacheReady(cachedAfterBg)) return;

    // Tier 2: full audio/video unpack, debounced so rapid navigation
    // coalesces into a single decompress for the settled selection.
    // skipVideo avoids inflating video bytes when background video is disabled.
    if (fullUnpackTimerRef.current) clearTimeout(fullUnpackTimerRef.current);
    fullUnpackTimerRef.current = setTimeout(() => {
      fullUnpackTimerRef.current = null;
      void (async () => {
        try {
          await unpackBeatmap(map, false, { skipVideo });
          if (isStale()) return;
          applyCachedMediaToMap(map, skipVideo);
          setUnpackTrigger(prev => prev + 1);
        } catch (err) {
          if (!isStale()) console.warn('Unpacker encountered an issue resolving map media channels:', err);
        }
      })();
    }, 350);
  }, [settings.disableVideo]);

  // Refs keep carousel callbacks stable so memoized cards don't re-render
  // on every selection — only the groups whose active/expanded state
  // changed re-render.
  const selectedCustomMapRef = useRef(selectedCustomMap);
  selectedCustomMapRef.current = selectedCustomMap;

  const handleSelectGroup = useCallback((group: any) => {
    // Clicking a banner always leaves its diff list open, even when it is
    // already expanded — there is no click-to-collapse. The list only goes
    // away when another song opens its diffs. Media unpack follows in the
    // background and never blocks the banner/diff list.
    setManualExpandedSongKey(group.songKey);
    const targetMap = resolveGroupTargetMap(group);
    if (targetMap) {
      void handleSelectCustomMap(targetMap);
    }
    // One-time centre of the newly selected song (not sticky).
    requestCarouselCenter(group.songKey);
  }, [resolveGroupTargetMap, handleSelectCustomMap, requestCarouselCenter]);

  // Song preview: play audio for the currently selected map once its media has
  // been unpacked (blob URL available). O(1) lookup via the id index.
  const isStartingPlayRef = useRef(false);

  useEffect(() => {
    if (isStartingPlayRef.current) return;
    if (!settings.enableSongPreview || !selectedCustomMapId) {
      previewPlayer.stop();
      return;
    }
    const map = mapById.get(selectedCustomMapId);
    if (!map?.audioUrl || !map.audioUrl.startsWith('blob:')) {
      previewPlayer.stop();
      return;
    }
    const previewMs = (map.previewTime != null && map.previewTime >= 0)
      ? map.previewTime
      : (map.duration || 180) * 1000 * 0.4;
    previewPlayer.play(map.audioUrl, previewMs, settings.musicVolume * settings.previewVolume * settings.masterVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomMapId, unpackTrigger, mapById, settings.enableSongPreview, settings.previewVolume, settings.masterVolume]);

  // Keep preview volume in sync with the music volume setting
  useEffect(() => {
    previewPlayer.setVolume(settings.musicVolume * settings.previewVolume * settings.masterVolume);
  }, [settings.musicVolume, settings.previewVolume, settings.masterVolume]);

  // Stop preview when leaving Song Select
  useEffect(() => () => previewPlayer.stop(), []);

  const handleStartPlay = useCallback(async (mapOverride?: Beatmap) => {
    const activeMap = mapOverride || selectedCustomMapRef.current;
    if (activeMap) {
      isStartingPlayRef.current = true;
      previewPlayer.stopImmediately();

      try {
        await handleSelectCustomMap(activeMap, true);
      } catch (e) {
        console.error('Failed unpacking media prior to gameplay:', e);
      }
      // Forced unpacking can retrigger the preview effect while this handler
      // is awaiting media. Invalidate any preview again at the handoff point.
      previewPlayer.stopImmediately();
      onSelectMap(activeMap);
    }
  }, [handleSelectCustomMap, onSelectMap]);

  // Latest random-select callback for the global keyboard handler without
  // pulling a later-declared const into the deps array (TDZ).
  const handleSelectRandomRef = useRef<() => void>(() => {});
  const handleStartPlayRef = useRef<(m?: Beatmap) => Promise<void>>(async () => {});

  // Global keyboard shortcuts on song select
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (showModsModal) {
          setShowModsModal(false);
        } else if (showOptionsMenu) {
          setShowOptionsMenu(false);
        } else if (openFilterMenu) {
          setOpenFilterMenu(null);
        } else if (onBack) {
          onBack();
        }
      } else if (e.key === 'Enter') {
        if (!showModsModal && !showOptionsMenu && !openFilterMenu && selectedCustomMap) {
          e.preventDefault();
          void handleStartPlayRef.current();
        }
      } else if (e.key === 'F1') {
        // While a beatmap-listing dropdown is open, keys stay confined to it.
        if (showOptionsMenu || openFilterMenu) return;
        e.preventDefault();
        setShowModsModal((prev) => !prev);
      } else if (e.key === 'F2') {
        // Random select is a Song Select action, not a dropdown action.
        if (showModsModal || showOptionsMenu || openFilterMenu) return;
        e.preventDefault();
        handleSelectRandomRef.current();
      } else if (e.key === 'ArrowDown') {
        if (!showModsModal && !showOptionsMenu && !openFilterMenu && filteredCustomMaps.length > 0) {
          e.preventDefault();
          const currentIdx = filteredCustomMaps.findIndex((m) => m.id === selectedCustomMapId);
          const next = currentIdx === -1
            ? filteredCustomMaps[0]
            : filteredCustomMaps[currentIdx + 1];
          if (next) {
            const nextKey = getMapSongKey(next);
            if (nextKey !== expandedSongKey) setManualExpandedSongKey(nextKey);
            handleSelectCustomMap(next);
            requestCarouselCenter(nextKey);
          }
        }
      } else if (e.key === 'ArrowUp') {
        if (!showModsModal && !showOptionsMenu && !openFilterMenu && filteredCustomMaps.length > 0) {
          e.preventDefault();
          const currentIdx = filteredCustomMaps.findIndex((m) => m.id === selectedCustomMapId);
          if (currentIdx > 0) {
            const next = filteredCustomMaps[currentIdx - 1];
            const nextKey = getMapSongKey(next);
            if (nextKey !== expandedSongKey) setManualExpandedSongKey(nextKey);
            handleSelectCustomMap(next);
            requestCarouselCenter(nextKey);
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    // handleSelectRandom/handleStartPlay are defined below; they are stable
    // useCallbacks and are read via refs to avoid a use-before-declaration
    // TDZ in the deps array. See randomRef/startPlayRef below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModsModal, showOptionsMenu, openFilterMenu, onBack, selectedCustomMap, selectedCustomMapId, filteredCustomMaps, expandedSongKey, getMapSongKey, handleSelectCustomMap, requestCarouselCenter]);

  // Uploader drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processImportedFile(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processImportedFile(file);
    }
  };

  const processImportedFile = async (file: File) => {
    const isZip = file.name.toLowerCase().endsWith('.osz') || file.name.toLowerCase().endsWith('.zip');
    const isSingleOsu = file.name.toLowerCase().endsWith('.osu');

    if (!isZip && !isSingleOsu) {
      setImportStatus({ type: 'err', msg: 'Supports beatmap or compressed .osz game files.' });
      return;
    }

    setImportStatus({ type: 'ok', msg: `Decompressing & importing ${file.name}...` });

    try {
      if (isSingleOsu) {
        const text = decodeBoundedUtf8(await file.arrayBuffer(), 'Beatmap text');
        const customId = `local_diff_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const parsedMap = parseBeatmap(text, customId);
        if (parsedMap.notes.length === 0) {
          throw new Error('Beatmap has no playable hit notes.');
        }
        const media = parseMediaPaths(text);
        
        const mapWithMeta = parsedMap as any;
        mapWithMeta.audioFilename = media.audioFilename;
        mapWithMeta.videoFilename = media.videoFilename;
        mapWithMeta.bgFilename = media.bgFilename;
        mapWithMeta.originalContent = text;
        mapWithMeta.isServerMap = false;
        mapWithMeta.catalogSetId = null;
        mapWithMeta.catalogMapId = null;
        mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);
        // Lazer-strain star rating feeds the PP curve; the legacy heuristic
        // diverged from official ratings, so never bake it here.
        mapWithMeta.starRating = Math.round(
          calculateManiaDifficultyAttributes(parsedMap.notes, parsedMap.keyCount, 1).starRating * 100,
        ) / 100;
        mapWithMeta.starRatingSource = 'chart-content';
        mapWithMeta.starRatingVersion = STRAIN_STAR_RATING_VERSION;

        onImportBeatmap(parsedMap);
        setImportStatus({ type: 'ok', msg: `Successfully imported "${parsedMap.title}" - [${parsedMap.difficulty}] difficulty!` });
        setSelectedCustomMapId(parsedMap.id);
        requestCarouselCenter(getMapSongKey(parsedMap));
      } else {
        if (file.size > MAX_COMPRESSED_SIZE_BYTES) {
          throw new Error(`Security Exception: Uploaded file size exceeds limit (${(file.size / (1024 * 1024)).toFixed(1)} MB, limit: ${(MAX_COMPRESSED_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
        }
        const zip = await JSZip.loadAsync(file);
        validateZipLimits(zip);
        
         const extractionBudget = createZipExtractionBudget();
         const fileNames = Object.keys(zip.files);
        const beatmapFiles: { name: string; content: string }[] = [];

        for (const name of fileNames) {
          if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
             const raw = await extractZipEntry(zip.files[name], name, extractionBudget);
             const content = decodeBoundedUtf8(raw, `Beatmap file ${name}`);
            beatmapFiles.push({ name, content });
          }
        }

        if (beatmapFiles.length === 0) {
          throw new Error('Empty package structure. No beatmap files discovered.');
        }

         const packageId = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
         const stagedMaps: Beatmap[] = [];
         let successCount = 0;
        let lastId = '';

        for (let i = 0; i < beatmapFiles.length; i++) {
          const beatmapStr = beatmapFiles[i];
          const mapId = `${packageId}_idx${i}`;
          const parsedMap = parseBeatmap(beatmapStr.content, mapId);

          if (parsedMap.notes.length > 0) {
            const media = parseMediaPaths(beatmapStr.content);
            const mapWithMeta = parsedMap as any;
            mapWithMeta.packageId = packageId;
            mapWithMeta.audioFilename = media.audioFilename;
            mapWithMeta.videoFilename = media.videoFilename;
            mapWithMeta.bgFilename = media.bgFilename;
            mapWithMeta.originalContent = beatmapStr.content;
            mapWithMeta.isCached = true;
            mapWithMeta.isServerMap = false;
            mapWithMeta.catalogSetId = null;
            mapWithMeta.catalogMapId = null;
            mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);
            mapWithMeta.starRating = Math.round(
              calculateManiaDifficultyAttributes(parsedMap.notes, parsedMap.keyCount, 1).starRating * 100,
            ) / 100;
            mapWithMeta.starRatingSource = 'chart-content';
            mapWithMeta.starRatingVersion = STRAIN_STAR_RATING_VERSION;

             stagedMaps.push(parsedMap);
            successCount++;
            lastId = parsedMap.id;
          }
        }

        if (successCount > 0) {
           await onImportPackage(packageId, file.name, file, stagedMaps);
           setImportStatus({ type: 'ok', msg: `Successfully unpacked ${successCount} playable difficulties!` });
          if (lastId) {
            setSelectedCustomMapId(lastId);
            const lastMap = stagedMaps.find((m) => m.id === lastId);
            if (lastMap) requestCarouselCenter(getMapSongKey(lastMap));
          }
        } else {
          throw new Error('No playable difficulties found in package.');
        }
      }
    } catch (err: unknown) {
      setImportStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failure processing package structure.' });
    } finally {
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const handleSelectRandom = useCallback(() => {
    if (songGroups.length === 0) return;
    // Pick a random song group, then a random difficulty inside it so the
    // carousel centres and expands the random pick like a manual selection.
    // Sibling diffs come from the cached index — no scan, no unpack.
    const randomGroup = songGroups[Math.floor(Math.random() * songGroups.length)];
    if (!randomGroup) return;
    const pool = randomGroup.maps.length > 0
      ? randomGroup.maps
      : (songMapsByKey.get(randomGroup.songKey) || []);
    const target = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : filteredCustomMaps[Math.floor(Math.random() * filteredCustomMaps.length)];
    if (!target) return;
    setManualExpandedSongKey(randomGroup.songKey);
    void handleSelectCustomMap(target);
    requestCarouselCenter(randomGroup.songKey);
  }, [songGroups, songMapsByKey, filteredCustomMaps, handleSelectCustomMap, requestCarouselCenter]);

  const handleDeleteSelectedSet = useCallback(() => {
    if (!selectedCustomMap || !onDeleteSongGroup) return;
    const songKey = getMapSongKey(selectedCustomMap);
    const mapIds = (songMapsByKey.get(songKey) || []).map((map) => map.id);
    if (songDeleteConfirmKey === songKey) {
      void onDeleteSongGroup(mapIds);
      setSelectedCustomMapId('');
      setSongDeleteConfirmKey(null);
    } else {
      setSongDeleteConfirmKey(songKey);
    }
  }, [selectedCustomMap, onDeleteSongGroup, getMapSongKey, songMapsByKey, songDeleteConfirmKey]);

  // Stable carousel callbacks so diff rows don't re-render on every parent render.
  const handleSelectDifficulty = useCallback((diff: Beatmap) => {
    void handleSelectCustomMap(diff);
    requestCarouselCenter(getMapSongKey(diff));
  }, [handleSelectCustomMap, requestCarouselCenter, getMapSongKey]);

  // Keep the global keyboard handler on the latest callbacks without
  // pulling later-declared consts into its deps array (TDZ).
  useEffect(() => {
    handleSelectRandomRef.current = handleSelectRandom;
  }, [handleSelectRandom]);
  useEffect(() => {
    handleStartPlayRef.current = handleStartPlay;
  }, [handleStartPlay]);

  // Extract selected beatmap statistics (lazer V2 mania wedge: Notes / Hold Notes / Key Count / AR / Accuracy / HP)
  // Note counts are memoized per chart — no per-render note-array walk.
  const currentStarRating = selectedCustomMap ? getStarRating(selectedCustomMap) : 0.0;
  const selectedRiceNoteCount = selectedCustomMap
    ? getCachedNoteCounts(selectedCustomMap).rice
    : 0;
  const selectedApproachRate = selectedCustomMap?.approachRate ?? selectedCustomMap?.overallDifficulty ?? 5;
  const selectedAccuracyOd = selectedCustomMap?.overallDifficulty ?? 8;
  const selectedHpDrain = selectedCustomMap?.hpDrainRate ?? 5;

  return (
    <div
      className="relative w-full h-full min-h-0 text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent"
    >
      {/* 1. Full-bleed background cover artwork with no dim overlay.
          Group-stable + preloaded + cross-fading in place: no slide,
          no flash when changing difficulties or songs. */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <AnimatePresence initial={false}>
          {displayedBgUrl && (
            <motion.div
              key={displayedBgUrl}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 bg-cover bg-center scale-105"
              style={{
                backgroundImage: `url("${sanitizeCssUrl(displayedBgUrl)}")`,
              }}
            />
          )}
        </AnimatePresence>
      </div>
      {/* Version Tag */}
      <div className="absolute bottom-20 left-6 text-[10px] text-white/30 font-mono z-30 select-none pointer-events-none block">
        {metadata.version}
      </div>

      {/* Floating Scroll Speed Toast */}
      {scrollSpeedToast && (
        <div
          id="song-select-scroll-toast"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-55 bg-slate-950/95 border border-amber-400/60 shadow-[0_0_25px_rgba(251,191,36,0.35)] text-amber-400 font-mono text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-full flex items-center gap-3 animate-fade-in pointer-events-none"
        >
          <span className="animate-pulse">⚡ SCROLL SPEED</span>
          <span className="text-white bg-slate-900 border border-slate-750 px-2.5 py-0.5 rounded-md font-bold">
            {scrollSpeedToast}
          </span>
        </div>
      )}

      {/* Hidden File Input for Beatmap Import */}
      <input 
        ref={fileInputRef}
        type="file" 
        accept=".osu,.osz,.zip"
        onChange={handleFileSelect}
        className="hidden" 
      />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 w-full z-10 relative overflow-hidden flex flex-col lg:flex-row pb-[36px] md:pb-[48px] min-h-0">
        
        {/* =======================================================
            LEFT COLUMN: INFO WEDGE & LOCAL RANKING — transparent, hud refs
            ======================================================= */}
        <div className="w-full lg:w-[596px] xl:w-[676px] flex-col h-full min-h-0 pl-0 pr-4 lg:pr-4 pt-0 pb-4 lg:pb-6 gap-4 overflow-hidden flex-shrink-0 flex">
          <SongSelectLeftPanel
            selectedMap={selectedCustomMap}
            currentStarRating={currentStarRating}
            isFavorite={selectedCustomMap ? favoriteSongs.includes(getMapSongKey(selectedCustomMap)) : false}
            onToggleFavorite={() => {
              if (selectedCustomMap) toggleFavorite(getMapSongKey(selectedCustomMap));
            }}
            activeTab={leftPanelTab}
            onChangeTab={setLeftPanelTab}
            localScores={chartLocalScores}
            onWatchReplay={onWatchReplay}
            settings={settings}
            getDifficultyColor={getDifficultyColor}
            getGradeBadgeClass={getGradeBadgeClass}
            onOpenOnlineCatalog={onOpenOnlineCatalog}
            onImportClick={() => fileInputRef.current?.click()}
            importStatus={importStatus}
          />
        </div>

        {/* =======================================================
            RIGHT COLUMN: SEARCH, FILTER, AND CAROUSEL — hud/songselect.jpg
            ======================================================= */}
        <div className="relative flex-1 flex-col h-full min-h-0 pl-4 pr-2 lg:pl-4 lg:pr-3 pt-0 pb-0 gap-2 overflow-hidden lg:flex-none lg:ml-auto lg:w-[49%] lg:min-w-[400px] lg:max-w-[704px] xl:max-w-[744px] flex">

          {/* TOP-RIGHT FILTER BOX — floating overlay: the carousel runs
              full-height to the toolbar behind this shell. */}
          <div className="lazer-song-filter-stack" ref={filterStackRef}>
          {/* SEARCH BOX — italic placeholder, yellow matches, magnifier */}
          <div className="relative flex-shrink-0 lazer-song-search">
            <input
              id="song-search-input"
              type="text"
              placeholder="search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="lazer-song-search-input"
            />
            {searchTerm === '' && (
              <span className="lazer-song-search-matches">{songGroups.length} matches</span>
            )}
            <Search className="lazer-song-search-icon" />
          </div>

          {/* STAR RATING RAINBOW BAR + Show converts — drag/scroll directly on the bar */}
          <div className="flex-shrink-0 flex items-center gap-2 lazer-song-filter-star">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="lazer-filter-tab">Star Rating</span>
              <div
                className="lazer-starbar is-interactive"
                title="Drag the thumbs, click the bar, or scroll (Shift+scroll for max) to filter"
                onDoubleClick={() => { setMinStar(0); setMaxStar(10); }}
              >
                <span className="lazer-starbar-value">{minStar.toFixed(1)}</span>
                <div
                  ref={starTrackRef}
                  className="lazer-starbar-track is-draggable"
                  role="slider"
                  aria-label="Minimum star rating"
                  aria-valuemin={0}
                  aria-valuemax={10}
                  aria-valuenow={minStar}
                  tabIndex={0}
                  onPointerDown={handleStarTrackPointerDown}
                  onPointerMove={handleStarTrackPointerMove}
                  onPointerUp={endStarDrag}
                  onPointerCancel={endStarDrag}
                  onWheel={handleStarTrackWheel}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      setStarBound(e.shiftKey ? 'max' : 'min', (e.shiftKey ? maxStar : minStar) - 0.1);
                    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      setStarBound(e.shiftKey ? 'max' : 'min', (e.shiftKey ? maxStar : minStar) + 0.1);
                    } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      setMinStar(0);
                      setMaxStar(10);
                    }
                  }}
                >
                  <span
                    className="lazer-starbar-dim is-left"
                    style={{ width: `${Math.max(0, Math.min(100, (minStar / 10) * 100))}%` }}
                  />
                  <span
                    className="lazer-starbar-dim is-right"
                    style={{ width: `${Math.max(0, Math.min(100, 100 - (maxStar / 10) * 100))}%` }}
                  />
                  <span
                    className="lazer-starbar-thumb is-min"
                    style={{ left: `${Math.max(0, Math.min(100, (minStar / 10) * 100))}%` }}
                  />
                  <span
                    className="lazer-starbar-thumb is-max"
                    style={{ left: `${Math.max(0, Math.min(100, (maxStar / 10) * 100))}%` }}
                  />
                </div>
                <span className="lazer-starbar-value is-max">{maxStar >= 10 ? '∞' : maxStar.toFixed(1)}</span>
              </div>
            </div>
            <span className="lazer-filter-tab opacity-80 hidden sm:inline-flex">Show converts</span>
          </div>

          {/* SORT / GROUP / COLLECTION ROW — slanted pills, row stays unclipped for dropdowns */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2 relative z-20 lazer-song-filter-row">
            {([
              { key: 'sort' as const, label: 'Sort', value: sortBy, options: ['Title', 'Artist', 'Difficulty', 'BPM', 'Length', 'Date Added'] },
              { key: 'group' as const, label: 'Group', value: groupBy, options: ['None', 'Artist', 'Creator'] },
              { key: 'collection' as const, label: 'Collection', value: collectionFilter, options: ['All beatmaps', 'Downloaded', 'Favorites'] },
            ]).map((dd) => (
              <div key={dd.key} className="relative flex items-center gap-1.5">
                <span className="lazer-filter-tab">{dd.label}</span>
                <button
                  type="button"
                  onClick={() => setOpenFilterMenu(openFilterMenu === dd.key ? null : dd.key)}
                  className="lazer-filter-select"
                >
                  <span className="truncate max-w-[140px]">{dd.value}</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
                {openFilterMenu === dd.key && (
                  <>
                    <div className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenFilterMenu(null)} />
                    <div className="absolute left-0 top-full mt-1 z-40 bg-[#12121a] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[150px]">
                      {dd.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            if (dd.key === 'sort') setSortBy(opt);
                            else if (dd.key === 'group') setGroupBy(opt);
                            else setCollectionFilter(opt);
                            setOpenFilterMenu(null);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-sans transition-colors cursor-pointer ${
                            dd.value === opt ? 'text-white bg-white/10 font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {opt}
                          {dd.value === opt && <Check className="h-3 w-3" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          </div>

          {/* CAROUSEL SETS AND DIFFICULTY PILLS (TASK-V-021) */}
          <SongSelectCarousel
            songGroups={songGroups}
            selectedGroupKey={selectedGroup?.songKey}
            expandedSongKey={expandedSongKey}
            selectedMapId={selectedCustomMapId}
            favoriteSongs={favoriteSongs}
            playHistory={playHistory}
            onSelectGroup={handleSelectGroup}
            onSelectDifficulty={handleSelectDifficulty}
            onStartPlay={handleStartPlay}
            onToggleFavorite={toggleFavorite}
            getStarRating={getStarRating}
            getGradeBadgeClass={getGradeBadgeClass}
            containerRef={carouselContainerRef}
            activeItemRef={activeItemRef}
            centerSignal={carouselCenterSignal}
            isLoading={isLoading}
            topOverlayPx={filterStackH}
          />

        </div>
      </div>

      {/* =======================================================
          4. DOCKED BOTTOM TOOLBAR: SongSelectFooter (TASK-V-020)
          ======================================================= */}
      <SongSelectFooter
        onBack={() => onBack?.()}
        onOpenMods={() => setShowModsModal(true)}
        onRandom={handleSelectRandom}
        onToggleOptions={() => setShowOptionsMenu(prev => !prev)}
        onStartPlay={() => handleStartPlay()}
        canPlay={Boolean(selectedCustomMap)}
        selectedModsCount={(settings.selectedMods || []).length}
        previewBpm={selectedCustomMap?.bpm || 120}
        isOptionsOpen={showOptionsMenu}
        optionsContent={
          <>
            <div className="fixed inset-0 z-45 cursor-default" onClick={() => setShowOptionsMenu(false)} />
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 bg-[#12121c] border border-white/15 rounded-xl shadow-2xl p-2 min-w-[220px] flex flex-col gap-1 text-xs font-mono">
              {selectedCustomMap && onDeleteSongGroup && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedSet}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                    songDeleteConfirmKey === getMapSongKey(selectedCustomMap)
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  <span>{songDeleteConfirmKey === getMapSongKey(selectedCustomMap) ? 'Confirm Delete Set' : 'Delete Beatmap Set'}</span>
                </button>
              )}
              {onOpenOnlineCatalog && (
                <button
                  type="button"
                  onClick={() => { setShowOptionsMenu(false); onOpenOnlineCatalog(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-slate-300 hover:bg-white/5 hover:text-white transition cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5 text-[#ffcc22]" />
                  <span>Beatmap Listing</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowOptionsMenu(false); fileInputRef.current?.click(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-slate-300 hover:bg-white/5 hover:text-white transition cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5 text-pink-400" />
                <span>Import Songs (.osz / .osu)</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowOptionsMenu(false); onOpenSettings(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-slate-300 hover:bg-white/5 hover:text-white transition cursor-pointer"
              >
                <Sliders className="h-3.5 w-3.5 text-amber-400" />
                <span>Game Settings</span>
              </button>
            </div>
          </>
        }
      />

      {/* =======================================================
          MODS INTERACTIVE OVERLAY SCREEN
          ======================================================= */}
      <ModSelectOverlay
        isOpen={showModsModal}
        onClose={() => setShowModsModal(false)}
        selectedMods={settings.selectedMods || []}
        onUpdateMods={(mods) => updateSettings({ selectedMods: mods })}
        availableKeyCounts={availableKeyCounts}
        difficultyAdjust={settings.difficultyAdjust}
        onUpdateDifficultyAdjust={(da) => updateSettings({ difficultyAdjust: da })}
        defaultOd={selectedCustomMap?.overallDifficulty ?? 8}
        defaultHp={selectedCustomMap?.hpDrainRate ?? 5}
        beatmapStats={{
          stars: currentStarRating,
          bpm: selectedCustomMap?.bpm,
          keyCount: selectedCustomMap?.keyCount,
          od: selectedCustomMap?.overallDifficulty,
          hp: selectedCustomMap?.hpDrainRate,
        }}
      />

    </div>
  );
}
