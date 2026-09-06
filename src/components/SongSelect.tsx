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

import React, { useState, useRef, useEffect } from 'react';
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
import { isBrowserPlayableVideoFilename } from '../utils/assetLifecycle';
import { MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, sanitizeCssUrl, decodeBoundedUtf8, createZipExtractionBudget } from '../utils/securityLimits';
import { storageManager } from '../utils/storageManager';
import { unpackBeatmap } from '../utils/unpackHelper';
import { computeBeatmapHash } from '../utils/replayManager';
import { extractZipEntry } from '../utils/zipResolver';
import { previewPlayer } from '../utils/previewPlayer';
import { resolveStarRating } from '../utils/starRating';
import { calculateChartStarRating, CHART_STAR_RATING_VERSION } from '../utils/chartStarRating';
import { SCROLL_SPEED_MAX, SCROLL_SPEED_MIN } from './settings/defaultSettings';
import { computeScrollTravelTimeMs } from '../render/playfieldLayout';
import metadata from '../../metadata.json';
import { getCatalogSetMetadata } from '../utils/catalogSetMetadata';
import { computeModMultiplier } from '../ruleset/mania/scoreProcessor';
import ModSelectOverlay from './ModSelectOverlay';

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
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
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
  const [mobileTab, setMobileTab] = useState<'carousel' | 'ranking'>('carousel');

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
  const [collectionFilter, setCollectionFilter] = useState<string>('Downloaded');
  const [openFilterMenu, setOpenFilterMenu] = useState<'sort' | 'star' | null>(null);
  const [showModsModal, setShowModsModal] = useState<boolean>(false);
  const [leftPanelTab, setLeftPanelTab] = useState<'details' | 'ranking'>('ranking');

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

  const toggleFavorite = (songKey: string) => {
    setFavoriteSongs(prev =>
      prev.includes(songKey) ? prev.filter(k => k !== songKey) : [...prev, songKey]
    );
  };





  // Clean raw local custom URL allocations prior to page reload/destruction
  useEffect(() => {
    return () => {
      // Intentionally NOT clearing blob URLs here, as those are required during gameplay and passed verbatim.
      // AssetLifecycleManager.clearAll(); (Removed to fix Audio Failed to Decode issues during handoff)
    };
  }, []);

  // Determine actual star rating dynamically
  const getStarRating = (map: any) => resolveStarRating(map);

  const getDifficultyColor = (rating: number) => {
    if (rating < 2.0) return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
    if (rating < 3.0) return 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20';
    if (rating < 4.0) return 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
    if (rating < 5.0) return 'text-orange-400 bg-orange-500/10 border border-orange-500/20';
    if (rating < 6.5) return 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
    return 'text-purple-400 bg-purple-500/10 border border-purple-500/20';
  };

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

  const getArtistTitleKey = (map: any) => {
    const mapArtist = map.artist || 'Unknown';
    const mapTitle = map.title || 'Untitled';
    return `${mapArtist.toLowerCase().trim()} - ${mapTitle.toLowerCase().trim()}`;
  };

  const getMapSongKey = (map: any) => {
    const mapPkgId = map.parentPackageId || (map.packageId ? map.packageId.replace(/^pkg_/, '') : undefined);
    if (mapPkgId) return `package_${mapPkgId}`;
    // Standalone imports have no package identity. Keep same-name imports
    // separate instead of collapsing them into one song group.
    return map.id ? `local_map_${map.id}` : getArtistTitleKey(map);
  };

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

  // Filter and prepare display beatmaps
  const filteredCustomMaps = React.useMemo(() => {
    return mergedCustomMaps.filter(map => {
       // Song Select exposes osu!mania charts only.
       if (map.mode !== undefined && map.mode !== 3) return false;

      // Filter by search text query
      const matchesSearch = map.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            map.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (map.creator && map.creator.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!matchesSearch) return false;

      // Filter by dynamic star limits
      const rating = getStarRating(map);
      if (rating < minStar || rating > maxStar) return false;

      // Filter by collection
      if (collectionFilter === 'Favorites') {
        if (!favoriteSongs.includes(getMapSongKey(map))) return false;
      }

      return true;
    }).sort((a, b) => {
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
  }, [mergedCustomMaps, searchTerm, minStar, maxStar, collectionFilter, sortBy, favoriteSongs]);

  const persistLastDifficultyForMap = (map: any) => {
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
  };

  // Save selected difficulty for the song
  useEffect(() => {
    if (selectedCustomMapId) {
      const selectedMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId);
      if (selectedMap) {
        persistLastDifficultyForMap(selectedMap);
      }
    }
  }, [selectedCustomMapId, mergedCustomMaps]);

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
            return;
          }
        }
      }

      const defaultMap = filteredCustomMaps[0];
      if (defaultMap) {
        handleSelectCustomMap(defaultMap);
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

  const resolveGroupTargetMap = (group: any) => {
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
    // Include unfiltered sibling diffs (star/search filters can hide the last-picked difficulty from group.maps)
    const artistTitleKey = getArtistTitleKey(group);
    mergedCustomMaps.forEach((m) => {
      if (getMapSongKey(m) === group.songKey || (group.songKey === artistTitleKey && getArtistTitleKey(m) === artistTitleKey)) {
        pushAll([m]);
      }
    });

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
    const current = pool.find((m) => m.id === selectedCustomMapId);
    if (current) return current;

    return pool[0];
  };

  const handleSelectGroup = (group: any) => {
    const targetMap = resolveGroupTargetMap(group);

    if (expandedSongKey === group.songKey) {
      setManualExpandedSongKey('');
    } else {
      setManualExpandedSongKey(group.songKey);
      if (targetMap) {
        handleSelectCustomMap(targetMap);
      }
    }
  };

  const selectedCustomMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId) || null;

  const chartLocalScores = React.useMemo(() => {
    if (!selectedCustomMap) return [];
    return playHistory
      .filter((record) => recordMatchesSelectedChart(record, selectedCustomMap))
      .slice()
      .sort(compareLocalScoreRows);
  }, [playHistory, selectedCustomMap]);

  // Background cover images (Always ensure we have a beautiful wallpaper background with vibrant, lively colors)
  const selectBgUrl = selectedCustomMap?.bgUrl || '';

  const defaultRandomBgRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (typeof setSongSelectBgUrl === 'function') {
      if (selectBgUrl && selectBgUrl !== '/backgrounds/default.svg' && selectBgUrl !== '/backgrounds/Ferineon.webp') {
        setSongSelectBgUrl(selectBgUrl);
      } else if (!selectedCustomMap) {
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
        setSongSelectBgUrl(`/backgrounds/${defaultRandomBgRef.current}`);
      }
    }
  }, [selectBgUrl, selectedCustomMap, setSongSelectBgUrl, unpackTrigger]);

  const selectedGroup = React.useMemo(() => {
    if (!selectedCustomMap) return null;
    const songKey = getMapSongKey(selectedCustomMap);
    return songGroups.find(g => g.songKey === songKey) || null;
  }, [selectedCustomMap, songGroups]);

  // Extract all compiled difficulties for the currently selected track regardless of star thresholds/filter bounds
  const currentSongMaps = React.useMemo(() => {
    if (!selectedCustomMap) return [];
    const songKey = getMapSongKey(selectedCustomMap);
    return mergedCustomMaps.filter(m => getMapSongKey(m) === songKey);
  }, [selectedCustomMap, mergedCustomMaps]);

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


  // Core map asset extraction and mounting
  const handleSelectCustomMap = async (map: Beatmap, forceUnpack = false) => {
    const wantsVideo = isBrowserPlayableVideoFilename((map as any).videoFilename || '');
    const cacheReady = (c: { audioUrl: string; videoUrl: string; bgUrl: string } | null) =>
      !!(c?.audioUrl && c?.bgUrl && (!wantsVideo || c.videoUrl));

    if (map.id === selectedCustomMapId) {
      const cached = storageManager.lruMediaCache.get(map.id);
      if (cacheReady(cached)) {
        map.audioUrl = cached!.audioUrl;
        map.bgUrl = cached!.bgUrl;
        map.videoUrl = cached!.videoUrl || '';
      }
      if (!forceUnpack && cacheReady(cached)) {
        return;
      }
    }
    
    setSelectedCustomMapId(map.id);
    persistLastDifficultyForMap(map);
    
    try {
      await unpackBeatmap(map, forceUnpack);
      const cached = storageManager.lruMediaCache.get(map.id);
      if (cached) {
        map.audioUrl = cached.audioUrl || map.audioUrl;
        map.bgUrl = cached.bgUrl || map.bgUrl;
        map.videoUrl = cached.videoUrl || map.videoUrl;
      }
      setUnpackTrigger(prev => prev + 1);
    } catch (err) {
      console.warn('Unpacker encountered an issue resolving map media channels:', err);
    }
  };

  // Song preview: play audio for the currently selected map once its media has
  // been unpacked (blob URL available).
  const isStartingPlayRef = useRef(false);

  useEffect(() => {
    if (isStartingPlayRef.current) return;
    if (!settings.enableSongPreview || !selectedCustomMapId) {
      previewPlayer.stop();
      return;
    }
    const map = mergedCustomMaps.find(m => m.id === selectedCustomMapId);
    if (!map?.audioUrl || !map.audioUrl.startsWith('blob:')) {
      previewPlayer.stop();
      return;
    }
    const previewMs = (map.previewTime != null && map.previewTime >= 0)
      ? map.previewTime
      : (map.duration || 180) * 1000 * 0.4;
    previewPlayer.play(map.audioUrl, previewMs, settings.musicVolume * settings.previewVolume * settings.masterVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomMapId, unpackTrigger, mergedCustomMaps, settings.enableSongPreview, settings.previewVolume, settings.masterVolume]);

  // Keep preview volume in sync with the music volume setting
  useEffect(() => {
    previewPlayer.setVolume(settings.musicVolume * settings.previewVolume * settings.masterVolume);
  }, [settings.musicVolume, settings.previewVolume, settings.masterVolume]);

  // Stop preview when leaving Song Select
  useEffect(() => () => previewPlayer.stop(), []);

  const handleStartPlay = async (mapOverride?: Beatmap) => {
    const activeMap = mapOverride || selectedCustomMap;
    if (activeMap) {
      isStartingPlayRef.current = true;
      previewPlayer.stopImmediately();

      const isMobileDevice = typeof window !== 'undefined' && (
        window.innerWidth <= 1024 && (
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
          window.innerWidth <= 768 ||
          window.innerHeight < 500
        )
      );

      if (isMobileDevice) {
        const elem = document.documentElement;
        try {
          if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => console.log('Fullscreen rejected:', err));
          } else if ((elem as any).webkitRequestFullscreen) {
            (elem as any).webkitRequestFullscreen();
          }
        } catch (fullscreenErr) {
          console.warn('Browser standard fullscreen is unsupported inside frames:', fullscreenErr);
        }
      }

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
  };

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
        if (!showModsModal && !showOptionsMenu && selectedCustomMap) {
          e.preventDefault();
          handleStartPlay();
        }
      } else if (e.key === 'F1') {
        e.preventDefault();
        setShowModsModal((prev) => !prev);
      } else if (e.key === 'F2') {
        e.preventDefault();
        handleSelectRandom();
      } else if (e.key === 'ArrowDown') {
        if (!showModsModal && filteredCustomMaps.length > 0) {
          e.preventDefault();
          const currentIdx = filteredCustomMaps.findIndex((m) => m.id === selectedCustomMapId);
          if (currentIdx === -1) {
            handleSelectCustomMap(filteredCustomMaps[0]);
          } else if (currentIdx < filteredCustomMaps.length - 1) {
            handleSelectCustomMap(filteredCustomMaps[currentIdx + 1]);
          }
        }
      } else if (e.key === 'ArrowUp') {
        if (!showModsModal && filteredCustomMaps.length > 0) {
          e.preventDefault();
          const currentIdx = filteredCustomMaps.findIndex((m) => m.id === selectedCustomMapId);
          if (currentIdx > 0) {
            handleSelectCustomMap(filteredCustomMaps[currentIdx - 1]);
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showModsModal, showOptionsMenu, openFilterMenu, onBack, selectedCustomMap, selectedCustomMapId, filteredCustomMaps]);

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
        mapWithMeta.starRating = calculateChartStarRating(parsedMap);
        mapWithMeta.starRatingSource = 'chart-content';
        mapWithMeta.starRatingVersion = CHART_STAR_RATING_VERSION;

        onImportBeatmap(parsedMap);
        setImportStatus({ type: 'ok', msg: `Successfully imported "${parsedMap.title}" - [${parsedMap.difficulty}] difficulty!` });
        setSelectedCustomMapId(parsedMap.id);
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
            mapWithMeta.starRating = calculateChartStarRating(parsedMap);
            mapWithMeta.starRatingSource = 'chart-content';
            mapWithMeta.starRatingVersion = CHART_STAR_RATING_VERSION;

             stagedMaps.push(parsedMap);
            successCount++;
            lastId = parsedMap.id;
          }
        }

        if (successCount > 0) {
           await onImportPackage(packageId, file.name, file, stagedMaps);
           setImportStatus({ type: 'ok', msg: `Successfully unpacked ${successCount} playable difficulties!` });
          if (lastId) setSelectedCustomMapId(lastId);
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

  const handleSelectRandom = () => {
    if (filteredCustomMaps.length > 0) {
      const randomIndex = Math.floor(Math.random() * filteredCustomMaps.length);
      handleSelectCustomMap(filteredCustomMaps[randomIndex]);
    }
  };

  const handleDeleteSelectedSet = () => {
    if (!selectedCustomMap || !onDeleteSongGroup) return;
    const songKey = getMapSongKey(selectedCustomMap);
    const mapIds = mergedCustomMaps
      .filter((map) => getMapSongKey(map) === songKey)
      .map((map) => map.id);
    if (songDeleteConfirmKey === songKey) {
      void onDeleteSongGroup(mapIds);
      setSelectedCustomMapId('');
      setSongDeleteConfirmKey(null);
    } else {
      setSongDeleteConfirmKey(songKey);
    }
  };

  // Extract selected beatmap statistics (lazer V2 mania wedge: Notes / Hold Notes / Key Count / AR / Accuracy / HP)
  const currentStarRating = selectedCustomMap ? getStarRating(selectedCustomMap) : 0.0;
  const selectedNoteCount = selectedCustomMap?.notes?.length ?? 0;
  const selectedHoldNoteCount = selectedCustomMap?.notes?.filter((n) => n.endTime != null).length ?? 0;
  const selectedRiceNoteCount = Math.max(0, selectedNoteCount - selectedHoldNoteCount);
  const selectedApproachRate = selectedCustomMap?.approachRate ?? selectedCustomMap?.overallDifficulty ?? 5;
  const selectedAccuracyOd = selectedCustomMap?.overallDifficulty ?? 8;
  const selectedHpDrain = selectedCustomMap?.hpDrainRate ?? 5;

  return (
    <div 
      className="relative w-full h-[calc(100dvh_-_60px)] sm:h-[calc(100dvh_-_68px)] text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent"
    >
      {/* 1. Full-bleed background cover artwork with light blur */}
      {selectBgUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center pointer-events-none transition-all duration-700 scale-105"
          style={{
            backgroundImage: `url("${sanitizeCssUrl(selectBgUrl)}")`,
            zIndex: 0
          }}
        />
      )}
      <div 
        className="absolute inset-0 bg-[#07070c]/70 backdrop-blur-[3px] pointer-events-none"
        style={{ zIndex: 1 }}
      />

      {/* Version Tag */}
      <div className="absolute bottom-20 left-6 text-[10px] text-white/30 font-mono z-30 select-none pointer-events-none hidden lg:block">
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

      {/* Mobile Tab Switcher */}
      {isMobile && (
        <div className="flex items-center justify-center p-1.5 bg-black/60 backdrop-blur-md border-b border-white/10 z-20 shrink-0 gap-1.5 px-4">
          <button
            type="button"
            onClick={() => setMobileTab('carousel')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition ${
              mobileTab === 'carousel'
                ? 'bg-skin-accent/25 text-skin-accent border border-skin-accent/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Beatmaps ({songGroups.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('ranking')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition ${
              mobileTab === 'ranking'
                ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Local Scores {chartLocalScores.length > 0 && `(${chartLocalScores.length})`}
          </button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 w-full z-10 relative overflow-hidden flex flex-col lg:flex-row pb-16 min-h-0">
        
        {/* =======================================================
            LEFT COLUMN: INFO WEDGE & LOCAL RANKING PANEL
            ======================================================= */}
        <div className={`w-full lg:w-[480px] xl:w-[520px] flex-col h-full min-h-0 border-r border-white/10 bg-[#06060a]/60 backdrop-blur-md p-4 lg:p-6 gap-4 overflow-y-auto ${
          isMobile && mobileTab !== 'ranking' ? 'hidden' : 'flex'
        }`}>
          {selectedCustomMap ? (
            <div className="flex flex-col gap-4">
              
              {/* TOP INFO WEDGE — lazer V2 Argon-like skewed panel */}
              <div
                className="relative overflow-hidden border border-white/10 bg-[#101018]/90 p-4 lg:p-5 shadow-2xl flex flex-col gap-3.5"
                style={{ clipPath: 'polygon(0 0, 100% 0, 96% 100%, 0 100%)' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-pink-500/5 pointer-events-none" />
                <div className="absolute -top-12 -left-8 w-40 h-40 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />

                <div className="flex items-start justify-between gap-3 relative z-10">
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-[9px] font-black uppercase tracking-[0.2em] text-slate-200">
                        Local
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-mono font-black text-[10px] ${getDifficultyColor(currentStarRating)}`}>
                        ★ {currentStarRating.toFixed(2)}
                      </span>
                    </div>
                    <h1 className="font-sans font-black text-xl lg:text-2xl text-white tracking-tight leading-tight truncate" title={selectedCustomMap.title}>
                      {selectedCustomMap.title}
                    </h1>
                    <span className="text-[11px] text-slate-300 font-sans truncate mt-0.5">
                      {selectedCustomMap.artist || 'Unknown Artist'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono uppercase mt-0.5 truncate">
                      mapped by {selectedCustomMap.creator || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-md text-xs font-mono font-black text-slate-100 shadow-inner">
                      {selectedCustomMap.keyCount || 4}K
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 truncate max-w-[120px]" title={selectedCustomMap.difficulty}>
                      {selectedCustomMap.difficulty}
                    </span>
                  </div>
                </div>

                {/* Mania wedge stats matching lazer V2 */}
                <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5 pt-1">
                  {[
                    { label: 'Notes', value: String(selectedRiceNoteCount), fill: Math.min(1, selectedRiceNoteCount / 2000) },
                    { label: 'Hold Notes', value: String(selectedHoldNoteCount), fill: Math.min(1, selectedHoldNoteCount / 800) },
                    { label: 'Key Count', value: String(selectedCustomMap.keyCount || 4), fill: Math.min(1, (selectedCustomMap.keyCount || 4) / 10) },
                    { label: 'Approach Rate', value: selectedApproachRate.toFixed(1), fill: Math.min(1, selectedApproachRate / 10) },
                    { label: 'Accuracy', value: selectedAccuracyOd.toFixed(1), fill: Math.min(1, selectedAccuracyOd / 10) },
                    { label: 'HP Drain', value: selectedHpDrain.toFixed(1), fill: Math.min(1, selectedHpDrain / 10) },
                  ].map((stat) => (
                    <div key={stat.label} className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-wide truncate">{stat.label}</span>
                        <span className="text-xs font-mono font-black text-white tabular-nums">{stat.value}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/50 border border-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-pink-500/80 to-cyan-400/80"
                          style={{ width: `${Math.max(6, stat.fill * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Details / Ranking tabs + Local scope (lazer V2 IA; Local only) */}
              <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-white/10 bg-[#0a0a10]/70 overflow-hidden shadow-xl">
                <div className="px-3 py-2 border-b border-white/10 bg-black/40 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setLeftPanelTab('details')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                        leftPanelTab === 'details'
                          ? 'bg-white/15 text-white border border-white/20'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeftPanelTab('ranking')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                        leftPanelTab === 'ranking'
                          ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      Ranking
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono font-black uppercase tracking-widest text-cyan-300">
                    <Award className="h-3.5 w-3.5" />
                    <span>Scope: Local</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[160px]">
                  {leftPanelTab === 'details' ? (
                    <div className="space-y-3 text-xs font-mono">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                          <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Length</div>
                          <div className="text-sm font-black text-white mt-1">{formatDuration(selectedCustomMap.duration || 0)}</div>
                        </div>
                        <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                          <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">BPM</div>
                          <div className="text-sm font-black text-white mt-1">{selectedCustomMap.bpm || 120}</div>
                        </div>
                        <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                          <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Objects</div>
                          <div className="text-sm font-black text-white mt-1">{selectedNoteCount}</div>
                        </div>
                        <div className="rounded-xl bg-black/40 border border-white/5 p-3">
                          <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider">Stars</div>
                          <div className={`text-sm font-black mt-1 ${getDifficultyColor(currentStarRating)}`}>★ {currentStarRating.toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="rounded-xl bg-black/40 border border-white/5 p-3 text-slate-300 leading-relaxed">
                        <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider mb-1">Difficulty</div>
                        <div className="font-sans font-bold text-white">{selectedCustomMap.difficulty}</div>
                        <div className="mt-2 text-[10px] text-slate-500">
                          Local ranking only — scores on this device for the selected chart.
                        </div>
                      </div>
                    </div>
                  ) : chartLocalScores.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                      <Award className="h-8 w-8 opacity-30 text-slate-400" />
                      <p className="font-sans font-bold text-xs uppercase tracking-wider text-slate-400">Leaderboards are not available for this beatmap!</p>
                      <p className="text-[10px] font-mono text-slate-600">No local plays yet — play this chart to set a personal record on this device.</p>
                    </div>
                  ) : (
                    chartLocalScores.map((score, idx) => (
                      <div
                        key={score.id || idx}
                        className="p-3 bg-black/50 border border-white/5 hover:border-white/15 rounded-xl flex items-center justify-between gap-3 text-xs font-mono transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-black shrink-0 ${
                            idx === 0 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' :
                            idx === 1 ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/40' :
                            idx === 2 ? 'bg-orange-400/20 text-orange-300 border border-orange-400/40' :
                            'bg-white/5 text-slate-400 border border-white/10'
                          }`}>
                            #{idx + 1}
                          </span>
                          <span className={`w-7 h-6 flex items-center justify-center rounded text-[10px] font-black shrink-0 ${getGradeBadgeClass(score.grade)}`}>
                            {score.grade}
                          </span>
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
                        {onWatchReplay && (
                          <button
                            type="button"
                            onClick={() => onWatchReplay(score, selectedCustomMap)}
                            className="p-2 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-300 rounded-lg transition cursor-pointer shrink-0"
                            title="Watch Local Replay"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          ) : (
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-pink-500/35 bg-pink-500/80 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-pink-100 transition hover:bg-pink-500 cursor-pointer mt-1"
                >
                  <Upload className="h-3.5 w-3.5" /> Import Songs Locally
                </button>
              </div>
            </div>
          )}

          {importStatus && (
            <div className={`p-2.5 rounded-xl text-xs font-mono border ${
              importStatus.type === 'ok' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40' : 'bg-rose-950/40 text-rose-400 border-rose-800/40'
            }`}>
              {importStatus.msg}
            </div>
          )}
        </div>

        {/* =======================================================
            RIGHT COLUMN: SEARCH, FILTER, AND CAROUSEL WITH EXPANDABLE DIFF PILLS
            ======================================================= */}
        <div className={`flex-1 flex-col h-full min-h-0 p-4 lg:p-6 gap-3 overflow-hidden ${
          isMobile && mobileTab !== 'carousel' ? 'hidden' : 'flex'
        }`}>
          
          {/* SEARCH INTERFACE */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input 
              id="song-search-input"
              type="text"
              placeholder="Search by title, artist, creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-24 py-3 bg-[#0d0e14]/90 border border-white/10 rounded-xl font-sans text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-skin-accent/60 focus:ring-1 focus:ring-skin-accent/40 transition-all shadow-lg"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-[#1b1c24] border border-white/10 text-[9px] font-mono text-slate-400 font-bold rounded">
              {filteredCustomMaps.length} matches
            </span>
          </div>

          {/* FILTER / SORT TOOLBAR */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2 relative z-20">
            {/* Collection chips */}
            <div className="flex items-center gap-0.5 bg-[#0d0e14] border border-white/10 rounded-lg p-0.5">
              {([
                { id: 'Downloaded', label: 'Downloaded' },
                { id: 'Favorites', label: 'Favorites' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCollectionFilter(opt.id)}
                  className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    collectionFilter === opt.id
                      ? 'bg-skin-accent/25 text-skin-accent border border-skin-accent/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenFilterMenu(openFilterMenu === 'sort' ? null : 'sort')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d0e14] border border-white/10 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300 hover:text-white hover:border-white/20 transition-all cursor-pointer"
              >
                Sort: <span className="text-white">{sortBy}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {openFilterMenu === 'sort' && (
                <>
                  <div className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenFilterMenu(null)} />
                  <div className="absolute left-0 top-full mt-1 z-40 bg-[#12121a] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[140px]">
                    {['Title', 'Artist', 'Difficulty', 'BPM', 'Length', 'Date Added'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => { setSortBy(opt); setOpenFilterMenu(null); }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                          sortBy === opt ? 'text-skin-accent bg-skin-accent/10' : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {opt}
                        {sortBy === opt && <Check className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Star range popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenFilterMenu(openFilterMenu === 'star' ? null : 'star')}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#0d0e14] border rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  minStar > 0 || maxStar < 10
                    ? 'border-amber-500/40 text-amber-300'
                    : 'border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                }`}
              >
                <Star className="h-3 w-3" />
                {minStar.toFixed(1)}–{maxStar.toFixed(1)}
              </button>
              {openFilterMenu === 'star' && (
                <>
                  <div className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenFilterMenu(null)} />
                  <div className="absolute left-0 top-full mt-1 z-40 bg-[#12121a] border border-white/10 rounded-lg shadow-2xl p-3 w-56 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase tracking-wider">
                        <span>Min stars</span><span className="text-white">{minStar.toFixed(1)}</span>
                      </div>
                      <input
                        type="range" min={0} max={10} step={0.1} value={minStar}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setMinStar(v);
                          if (v > maxStar) setMaxStar(v);
                        }}
                        className="w-full accent-amber-400"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase tracking-wider">
                        <span>Max stars</span><span className="text-white">{maxStar.toFixed(1)}</span>
                      </div>
                      <input
                        type="range" min={0} max={10} step={0.1} value={maxStar}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setMaxStar(v);
                          if (v < minStar) setMinStar(v);
                        }}
                        className="w-full accent-amber-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { setMinStar(0); setMaxStar(10); }}
                      className="self-end text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* CAROUSEL SETS AND DIFFICULTY PILLS */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 flex flex-col gap-2 relative z-10 min-h-0">
            {songGroups.length > 0 ? (
              songGroups.map((group) => {
                const isGroupActive = selectedGroup?.songKey === group.songKey;
                const isExpanded = expandedSongKey === group.songKey || isGroupActive;
                const groupBannerUrl = group.coverUrl || DEFAULT_SONG_BANNER;
                const sortedDiffs = [...group.maps].sort((a, b) => getStarRating(a) - getStarRating(b));

                return (
                  <div key={group.songKey} className="flex flex-col gap-1.5 transition-all">
                    
                    {/* SET CARD */}
                    <div 
                      role="button"
                      tabIndex={0}
                      aria-pressed={isGroupActive}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelectGroup(group);
                        }
                      }}
                      onClick={() => handleSelectGroup(group)}
                      className={`group relative border rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-200 shadow-md ${
                        isGroupActive
                          ? 'border-skin-accent shadow-[0_0_20px_rgba(var(--skin-accent-rgb),0.3)] bg-[#181524]/85'
                          : 'border-white/10 bg-[#0c0c14]/80 hover:bg-[#141420]/90 hover:border-white/20'
                      }`}
                    >
                      <img
                        src={groupBannerUrl}
                        className="absolute inset-0 h-full w-full object-cover opacity-60 pointer-events-none transition-transform duration-300 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                        loading="eager"
                        decoding="async"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = DEFAULT_SONG_BANNER;
                        }}
                        alt=""
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/40 pointer-events-none" />

                      <div className="relative flex items-center justify-between p-3.5 py-3 gap-3">
                        <div className="flex flex-col text-left overflow-hidden min-w-0 flex-1">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-skin-accent mb-0.5 leading-none font-bold">
                            {group.artist || 'Unknown Artist'}
                          </span>
                          <h4 className="font-extrabold font-sans text-base lg:text-lg text-white tracking-tight truncate leading-tight">
                            {group.title}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 uppercase font-bold tracking-normal">
                            mapped by {group.creator || 'alevi'}
                          </span>
                        </div>

                        {/* Right side of card: Favorite + Keys + Diff count */}
                        <div className="flex items-center gap-2 shrink-0 select-none">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(group.songKey); }}
                            title={favoriteSongs.includes(group.songKey) ? 'Remove from favorites' : 'Add to favorites'}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <Heart className={`h-4 w-4 transition-colors ${
                              favoriteSongs.includes(group.songKey)
                                ? 'fill-rose-500 text-rose-500'
                                : 'text-slate-500 group-hover:text-slate-300'
                            }`} />
                          </button>
                          
                          {group.maps?.length > 0 && (
                            <span className="px-2 py-1 bg-black/50 border border-white/10 rounded text-[10px] font-mono font-black text-slate-300">
                              {Array.from(new Set(group.maps.map(m => m.keyCount).filter(Boolean)))
                                .sort((a, b) => Number(a) - Number(b))
                                .map(k => `${k}K`)
                                .join('/')}
                            </span>
                          )}

                          <span className="px-2 py-1 bg-white/10 border border-white/15 rounded text-[10px] font-mono font-bold text-slate-200">
                            {group.maps.length} {group.maps.length === 1 ? 'diff' : 'diffs'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* EXPANDED DIFFICULTY PILLS */}
                    {isExpanded && (
                      <div className="pl-4 pr-1 py-1 flex flex-col gap-1.5 animate-fade-in">
                        {sortedDiffs.map((diff) => {
                          const isDiffSelected = selectedCustomMapId === diff.id;
                          const rating = getStarRating(diff);
                          const bestRecord = playHistory
                            .filter(r => recordMatchesSelectedChart(r, diff))
                            .sort(compareLocalScoreRows)[0];

                          return (
                            <div
                              key={diff.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (isDiffSelected) {
                                  handleStartPlay(diff);
                                } else {
                                  handleSelectCustomMap(diff);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (isDiffSelected) {
                                    handleStartPlay(diff);
                                  } else {
                                    handleSelectCustomMap(diff);
                                  }
                                }
                              }}
                              className={`group/pill flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all cursor-pointer shadow-sm select-none ${
                                isDiffSelected
                                  ? 'bg-skin-accent/20 border-skin-accent text-white shadow-[0_0_15px_rgba(var(--skin-accent-rgb),0.3)] translate-x-1'
                                  : 'bg-[#101018]/85 hover:bg-[#161622] border-white/10 hover:border-white/20 text-slate-300 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span className={`px-2 py-0.5 rounded font-mono font-black text-xs shrink-0 ${getDifficultyColor(rating)}`}>
                                  ★ {rating.toFixed(2)}
                                </span>
                                <span className="font-bold text-xs sm:text-sm truncate">
                                  {diff.difficulty}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                                <span className="px-1.5 py-0.5 bg-black/40 border border-white/10 rounded text-[9px] font-bold text-slate-400">
                                  {diff.keyCount || 4}K
                                </span>
                                {bestRecord && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${getGradeBadgeClass(bestRecord.grade)}`}>
                                    {bestRecord.grade}
                                  </span>
                                )}
                                {isDiffSelected && (
                                  <span className="text-[10px] text-skin-accent font-black animate-pulse uppercase">
                                    READY
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })
            ) : (
              <div className="bg-[#0c0c14]/80 border border-white/10 p-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 shadow-xl gap-2">
                <Info className="h-6 w-6 text-slate-500" />
                <p className="text-xs font-sans font-black tracking-widest uppercase">No beatmaps matches discovered</p>
                <p className="text-[10px] text-slate-500 font-mono max-w-xs uppercase">Tweak your star rating boundaries or search query</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* =======================================================
          4. DOCKED BOTTOM TOOLBAR: BACK, MODS, RANDOM, OPTIONS, PLAY
          ======================================================= */}
      <div className="fixed bottom-0 inset-x-0 h-16 bg-[#07070a]/95 backdrop-blur-md border-t border-white/10 z-40 flex items-center justify-between px-4 lg:px-8 select-none">
        
        {/* Left: Back button */}
        <button
          id="bottom-back-button"
          type="button"
          onClick={() => onBack?.()}
          className="flex items-center gap-2 px-3.5 sm:px-4 py-2 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 hover:border-white/20 rounded-xl text-xs font-mono font-black uppercase tracking-wider text-slate-300 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
          <span className="text-[9px] text-slate-500 border border-white/10 px-1 py-0.2 rounded hidden sm:inline">ESC</span>
        </button>

        {/* Center: Mods, Random, Options tools */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mods Button */}
          <button
            id="bottom-mods-button"
            type="button"
            onClick={() => setShowModsModal(true)}
            className="relative flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-[#1a1d22] hover:bg-[#22272e] active:scale-95 border border-white/10 rounded-xl text-xs font-sans font-black uppercase tracking-wider text-white transition cursor-pointer shadow-md"
          >
            <ArrowUpDown className="h-4 w-4 text-[#a3e635]" />
            <span>Mods</span>
            <span className="text-[9px] font-mono text-slate-400 border border-white/10 px-1 py-0.2 rounded hidden sm:inline">F1</span>
            {(settings.selectedMods || []).length > 0 && (
              <span className="ml-0.5 sm:ml-1 px-1.5 py-0.5 bg-[#a3e635] text-slate-950 rounded-full text-[9px] font-mono font-black leading-none">
                {(settings.selectedMods || []).length}
              </span>
            )}
          </button>

          {/* Random Button */}
          <button
            id="bottom-random-button"
            type="button"
            onClick={handleSelectRandom}
            className="flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 bg-[#1a1d22] hover:bg-[#22272e] active:scale-95 border border-white/10 rounded-xl text-xs font-sans font-black uppercase tracking-wider text-white transition cursor-pointer shadow-md"
          >
            <Shuffle className="h-4 w-4 text-[#38bdf8]" />
            <span>Random</span>
            <span className="text-[9px] font-mono text-slate-400 border border-white/10 px-1 py-0.2 rounded hidden sm:inline">F2</span>
          </button>

          {/* Options Button */}
          <div className="relative">
            <button
              id="bottom-options-button"
              type="button"
              onClick={() => setShowOptionsMenu(prev => !prev)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#1a1d22] hover:bg-[#22272e] active:scale-95 border border-white/10 rounded-xl text-xs font-sans font-black uppercase tracking-wider text-white transition cursor-pointer shadow-md"
            >
              <SlidersHorizontal className="h-4 w-4 text-purple-400" />
              <span>Options</span>
              <span className="text-[9px] font-mono text-slate-400 border border-white/10 px-1 py-0.2 rounded hidden sm:inline">F3</span>
            </button>

            {/* Options Popover */}
            {showOptionsMenu && (
              <>
                <div className="fixed inset-0 z-45 cursor-default" onClick={() => setShowOptionsMenu(false)} />
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 bg-[#12121c] border border-white/15 rounded-xl shadow-2xl p-2 min-w-[220px] flex flex-col gap-1 text-xs font-mono">
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
            )}
          </div>
        </div>

        {/* Right: Primary Play Button */}
        <button
          id="bottom-play-button"
          type="button"
          disabled={!selectedCustomMap}
          onClick={() => handleStartPlay()}
          className="flex items-center gap-2.5 sm:gap-3 px-5 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 text-slate-950 font-sans font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(236,72,153,0.35)] transition-all cursor-pointer"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>Play</span>
          <span className="text-[9px] font-mono font-bold bg-slate-950/30 text-white px-1.5 py-0.5 rounded hidden sm:inline">Enter</span>
        </button>

      </div>

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
      />

    </div>
  );
}
