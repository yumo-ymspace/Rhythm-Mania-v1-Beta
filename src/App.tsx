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

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { MainMenu } from './components/MainMenu';
import SettingsScreen from './components/SettingsScreen';
import PersonalHistoryScreen from './components/PersonalHistoryScreen';
import OnlineBeatmapCatalog from './components/OnlineBeatmapCatalog';
import SkinScreen from './components/SkinScreen';
import { GameScreen, GameSettings, Beatmap, ScoreState, ReplayFrame, PlayHistoryRecord } from './types';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import SongSelect from './components/SongSelect';
import GameplayCanvas from './components/GameplayCanvas';
import ResultsScreen from './components/ResultsScreen';
import JSZip from 'jszip';
import { storageManager } from './utils/storageManager';
import { convertBeatmapKeyCount, parseBeatmap } from './utils/beatmapParser';
import { preloadBeatmapBackgrounds, unpackBeatmap } from './utils/unpackHelper';
import { sanitizeSettings, sanitizeHistoryRecord, sanitizeCssUrl, MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, createZipExtractionBudget, decodeBoundedUtf8 } from './utils/securityLimits';
import { createPlayHistoryRecord, migrateAndNormalizeBeatmaps, computeBeatmapHash, findMatchingBeatmap } from './utils/replayManager';
import { HOLD_TICK_RULES_VERSION, holdTickIntervalMs } from './utils/holdTickRules';
import { LAZER_HOLD_RULES_VERSION } from './ruleset/mania/holdNote';
import { applyBeatmapMods } from './ruleset/mania/beatmapMods';
import { extractZipEntry } from './utils/zipResolver';
import { AssetLifecycleManager } from './utils/assetLifecycle';
import { computeChecksum, inferChecksumAlgorithm } from './utils/checksum';
import {
  fetchOfficialChartsForSet,
  findOfficialChartByChecksum,
  officialChartRevisionId,
} from './utils/mirrorStarRatings';
import { FullscreenManager } from './utils/fullscreenManager';
import { previewPlayer } from './utils/previewPlayer';
import { MENU_FALLBACK_TRACK, menuMusic } from './utils/menuMusic';
import type { PreparedLaunchTrack } from './utils/launchMenuTrack';
import { findLaunchMenuTrackMap } from './utils/launchMenuTrack';
import LoadingScreen from './components/LoadingScreen';
import { downloadBeatmapsetArchive, searchOsuBeatmapSetId } from './utils/osuTokenManager';
import { resolveSkinTheme } from './render/skinTheme';
import { cssColorToHex, parseCssColor } from './render/color';
import { applyLazerChrome, LazerDebugSmoke, LazerToolbar } from './ui/lazer';
import type { LazerMenuPhase } from './components/MainMenu';
import LazerCursor from './components/LazerCursor';
import GlobalFpsOverlay from './components/GlobalFpsOverlay';


const DEFAULT_MENU_BACKGROUNDS = [
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
] as const;

function getRandomDefaultBackground(): string {
  return `/backgrounds/${DEFAULT_MENU_BACKGROUNDS[Math.floor(Math.random() * DEFAULT_MENU_BACKGROUNDS.length)]}`;
}

const PAGE_TRANSITION_VARIANTS = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }
} satisfies Variants;

const LOCAL_STORAGE_SETTINGS_KEY = 'rhythm_mania_v1_settings';
const LOCAL_STORAGE_CUSTOM_MAPS_KEY = 'rhythm_mania_v1_custom_maps';

import {
  DEFAULT_SETTINGS,
  PLAYFIELD_WIDTH_MAX,
  PLAYFIELD_WIDTH_MIN,
  HISTORY_LIMIT_UNLIMITED,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
} from './components/settings/defaultSettings';

type AppRoute = {
  screen: GameScreen;
  settingsOpen: boolean;
};

function isRemovedProfilePath(pathname: string): boolean {
  return pathname === '/profile' || pathname.startsWith('/profile/');
}

/** Effective output level for the game launch menu song. */
function launchMusicLevel(s: GameSettings): number {
  const slider = Number.isFinite(s.launchMusicVolume) ? s.launchMusicVolume : 0.1;
  return s.musicVolume * slider * s.masterVolume;
}

function resolveRoute(pathname: string): AppRoute {
  const paths: Record<string, GameScreen> = {
    '/select': 'select',
    '/play': 'play',
    '/results': 'results',
    '/history': 'history',
    '/settings': 'menu',
    '/skins': 'skins',
  };
  return {
    screen: paths[pathname] || 'menu',
    settingsOpen: pathname === '/settings',
  };
}

export default function App() {
  const [path, setPath] = useState<string>(() => typeof window !== 'undefined' ? window.location.pathname : '/');
  const initialRoute = resolveRoute(typeof window !== 'undefined' ? window.location.pathname : '/');
  const [currentScreen, setCurrentScreen] = useState<GameScreen>(initialRoute.screen);
  const [selectedBeatmap, setSelectedBeatmap] = useState<Beatmap | null>(null);

  // Song Select can remain mounted during the page transition, so cut its
  // independent HTMLAudio preview before gameplay takes over audio focus.
  useEffect(() => {
    if (currentScreen === 'play') {
      previewPlayer.stopImmediately();
    }
  }, [currentScreen]);

  const navigateToPath = useCallback((href: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== href) {
      window.history.pushState({}, '', href);
    }
    setPath(href);
  }, []);

  const navigateScreen = useCallback((screen: GameScreen) => {
    const href = screen === 'menu' ? '/' : `/${screen}`;
    navigateToPath(href);
  }, [navigateToPath]);

  const openSettings = useCallback(() => setShowSettings(true), []);

  const leaveProfilePath = useCallback((screen: GameScreen = 'menu') => {
    navigateScreen(screen);
  }, [navigateScreen]);

  // Listen to popstate for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync screen from URL path. Retired /profile routes fall back to the menu.
  useEffect(() => {
    const route = resolveRoute(path);
    if (isRemovedProfilePath(path) || ((route.screen === 'play' || route.screen === 'results') && !selectedBeatmap)) {
      setCurrentScreen('menu');
      setShowSettings(false);
      if (typeof window !== 'undefined' && window.location.pathname === path) {
        window.history.replaceState({}, '', '/');
      }
      if (path !== '/') setPath('/');
      return;
    }
    setCurrentScreen(route.screen);
    setShowSettings(route.settingsOpen);
  }, [path, selectedBeatmap]);

  // Globally intercept local link clicks to enable single-page transitions
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href && href.startsWith('/')) {
          e.preventDefault();
          window.history.pushState({}, '', href);
          setPath(new URL(href, window.location.origin).pathname);
        }
      }
    };
    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, []);
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  const [lastHitErrors, setLastHitErrors] = useState<number[] | null>(null);
  const [customMaps, setCustomMaps] = useState<Beatmap[]>([]);
  const [settings, setSettings] = useState<GameSettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedSettingsText = localStorage.getItem('rhythm_mania_v1_settings');
        if (savedSettingsText) {
          const parsed = JSON.parse(savedSettingsText);
          return sanitizeSettings(parsed, DEFAULT_SETTINGS);
        }
      } catch (e) {
        console.warn('Failed reading settings from local storage, fallback applied.');
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [menuBgUrl] = useState<string>(() => getRandomDefaultBackground());
  const [skinBgUrl] = useState<string>(() => getRandomDefaultBackground());
  const [historyBgUrl, setHistoryBgUrl] = useState<string>(() => getRandomDefaultBackground());

  // Song Select owns its own backdrop (dim overlay + triangle-field fallback
  // in SongSelect.tsx), so 'select' resolves to no unified background here.
  // Rendering the undimmed unified copy underneath it made the Song Select
  // dim ineffective mid-switch (the bright copy showed through the fading
  // dimmed copy, even at 100% dim) and the mismatched geometry (bg-fixed vs
  // scale-105) read as a positional jump on diff/song switches.
  const activeBackgroundUrl = React.useMemo(() => {
    if (currentScreen === 'select') return '';
    if (currentScreen === 'history') return historyBgUrl;
    if (currentScreen === 'skins') return skinBgUrl;
    if (currentScreen === 'results') {
      return selectedBeatmap?.bgUrl || menuBgUrl;
    }
    return menuBgUrl;
  }, [currentScreen, historyBgUrl, skinBgUrl, selectedBeatmap, menuBgUrl]);

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showFindBeatmapOverlay, setShowFindBeatmapOverlay] = useState<boolean>(false);
  const [menuPhase, setMenuPhase] = useState<LazerMenuPhase>('idle');
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState<boolean>(false);

  // Performance history states
  const [playHistory, setPlayHistory] = useState<PlayHistoryRecord[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number>(50);

  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      applyLazerChrome(settings);
    }
  }, [settings]);

  const [activeReplayRecord, setActiveReplayRecord] = useState<PlayHistoryRecord | null>(null);
  const [downloadingSetIds, setDownloadingSetIds] = useState<number[]>([]);
  const replayLoadGenerationRef = useRef(0);
  const [viewingHistoryResult, setViewingHistoryResult] = useState(false);
  // Tracks whether the user has played a map this browser session. Used to
  // decide whether Song Select should auto-resume the last selected map: only
  // post-gameplay returns auto-select; fresh app loads do not.
  const [hasPlayedThisSession, setHasPlayedThisSession] = useState(false);
  // True once the IndexedDB/legacy map load settles, so launch menu music can
  // resolve the beatmapset-2153231 track against the real installed-song pool.
  const [mapsReady, setMapsReady] = useState(false);
  // Launch menu music: the loading screen's start button plays the audio file
  // from beatmapset 2153231 when it is installed, otherwise the bundled
  // `triangles.mp3` fallback track, and starts it audibly.
  // Returning to the menu resumes the resolved track.
  const menuChoiceRef = useRef<{ rolled: boolean; mapId: string | null }>({ rolled: false, mapId: null });
  const menuMusicGenRef = useRef(0);
  // Boot gate: the loading screen owns the launch until its start button
  // fires. The click is a real user gesture, so the launch song starts
  // audibly at once instead of fighting browser autoplay policy.
  // The boot loading screen only runs on a fresh root (/) launch. Refreshing
  // or deep-linking into /select or any other page boots straight in.
  const [booted, setBooted] = useState(
    () => typeof window === 'undefined' || window.location.pathname !== '/',
  );

  // Fired synchronously from the start-button click (a real user gesture),
  // so the launch song starts audibly at once. The curtain lifts later via
  // handleBootEntered once the farewell sequence finishes.
  const handleBootStartPressed = useCallback((track: PreparedLaunchTrack) => {
    menuChoiceRef.current = { rolled: true, mapId: track.mapId };
    menuMusic.play(
      track.src ?? MENU_FALLBACK_TRACK,
      launchMusicLevel(settings),
    );
  }, [settings]);

  const handleBootEntered = useCallback(() => {
    setBooted(true);
  }, []);

  // Before boot completes, ignore every input outside the loading screen so
  // stray key presses can't trigger menu sounds or navigate behind the black
  // curtain. Capture-phase runs before the menus' own window listeners, and
  // events targeting the loading screen (the start button) stay exempt.
  useEffect(() => {
    if (booted) return;
    const block = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('#boot-loading-screen')) return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', block, true);
    window.addEventListener('keyup', block, true);
    window.addEventListener('pointerdown', block, true);
    window.addEventListener('pointerup', block, true);
    window.addEventListener('wheel', block, { capture: true, passive: false });
    return () => {
      window.removeEventListener('keydown', block, true);
      window.removeEventListener('keyup', block, true);
      window.removeEventListener('pointerdown', block, true);
      window.removeEventListener('pointerup', block, true);
      window.removeEventListener('wheel', block, { capture: true });
    };
  }, [booted]);

  useEffect(() => {
    menuMusic.setVolume(launchMusicLevel(settings));
  }, [settings]);

  useEffect(() => {
    if (!booted) {
      menuMusic.stop();
      return;
    }
    if (currentScreen !== 'menu') {
      menuMusicGenRef.current++;
      menuMusic.stop();
      return;
    }
    if (!mapsReady) return;
    const volume = launchMusicLevel(settings);

    const playMapTrack = async (map: Beatmap, generation: number) => {
      try {
        const cached = storageManager.lruMediaCache.get(map.id);
        let src = cached?.audioUrl || map.audioUrl;
        if (!src) {
          const clone: Beatmap = {
            ...map,
            notes: map.notes ? map.notes.map(n => ({ ...n })) : [],
          };
          await unpackBeatmap(clone);
          const fresh = storageManager.lruMediaCache.get(map.id);
          src = fresh?.audioUrl || clone.audioUrl;
        }
        if (menuMusicGenRef.current !== generation) return;
        if (src) {
          menuMusic.play(src, launchMusicLevel(settings));
        } else {
          menuMusic.play(MENU_FALLBACK_TRACK, launchMusicLevel(settings));
        }
      } catch (err) {
        console.warn('Menu music track unpack failed, falling back:', err instanceof Error ? err.message : String(err));
        if (menuMusicGenRef.current !== generation) return;
        menuMusic.play(MENU_FALLBACK_TRACK, launchMusicLevel(settings));
      }
    };

    if (!menuChoiceRef.current.rolled) {
      menuChoiceRef.current.rolled = true;
      const picked = findLaunchMenuTrackMap(customMaps);
      if (!picked) {
        menuChoiceRef.current.mapId = null;
        menuMusic.play(MENU_FALLBACK_TRACK, volume);
        return;
      }
      menuChoiceRef.current.mapId = picked.id;
      const generation = ++menuMusicGenRef.current;
      void playMapTrack(picked, generation);
      return;
    }

    if (menuMusic.isPlaying()) return;
    const chosenId = menuChoiceRef.current.mapId;
    if (!chosenId) {
      menuMusic.play(MENU_FALLBACK_TRACK, volume);
      return;
    }
    const chosen = customMaps.find(m => m.id === chosenId);
    if (!chosen) {
      menuMusic.play(MENU_FALLBACK_TRACK, volume);
      return;
    }
    const generation = ++menuMusicGenRef.current;
    void playMapTrack(chosen, generation);
  }, [booted, currentScreen, mapsReady, customMaps, settings]);

  const activePlayBeatmap = React.useMemo(() => {
    if (!selectedBeatmap) return null;
    
    const activeMods = activeReplayRecord
      ? (activeReplayRecord.mods || activeReplayRecord.recordedSettings?.selectedMods || [])
      : (settings.selectedMods || []);
    
    return applyBeatmapMods(selectedBeatmap, activeMods, { difficultyAdjust: settings.difficultyAdjust });
  }, [selectedBeatmap, settings.selectedMods, settings.difficultyAdjust, activeReplayRecord]);

  // Preload default backgrounds for instant, low-latency visual performance
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const defaultBgs = [
        '/backgrounds/- Y u m i J i-.webp',
        '/backgrounds/Arushii.webp',
        '/backgrounds/Ferineon.webp',
        '/backgrounds/MPDisplay.webp',
        '/backgrounds/PEALEERD_TAK.webp',
        '/backgrounds/Porukana.webp',
        '/backgrounds/RedcXca.webp',
        '/backgrounds/Sm0llBanana.webp',
        '/backgrounds/THICC Jeff.webp',
        '/backgrounds/Triantafyllia.webp',
        '/backgrounds/YellowX21.webp',
        '/backgrounds/mimile1606.webp',
        '/backgrounds/nikio.webp',
        '/backgrounds/serr.webp',
        '/backgrounds/soncak.webp',
        '/backgrounds/wxyz.webp'
      ];
      defaultBgs.forEach(src => {
        const img = new Image();
        img.src = src;
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedHistory = localStorage.getItem('rhythm_mania_v1_play_history');
        if (storedHistory) {
          const parsed = JSON.parse(storedHistory);
          if (Array.isArray(parsed)) {
            const sanitized = parsed
              .map(item => sanitizeHistoryRecord(item, DEFAULT_SETTINGS, customMaps, {
                allowFailed: Boolean((item as { replaySource?: string } | null)?.replaySource === 'imported'),
              }))
              .filter((item): item is PlayHistoryRecord => item !== null);
            setPlayHistory(sanitized);
            if (sanitized.length !== parsed.length) {
              localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(sanitized));
            }
          }
        }
        
        const storedLimit = localStorage.getItem('rhythm_mania_v1_history_limit');
        if (storedLimit) {
          const parsedLimit = Number(storedLimit);
           if (parsedLimit === 9999 || parsedLimit === HISTORY_LIMIT_UNLIMITED || storedLimit.toLowerCase() === 'unlimited') {
             setHistoryLimit(HISTORY_LIMIT_UNLIMITED);
           } else if (!isNaN(parsedLimit) && parsedLimit >= 5 && parsedLimit <= 500) {
            setHistoryLimit(parsedLimit);
          } else {
            setHistoryLimit(50);
          }
        }
      } catch (e) {
        console.error('Failed to load local history logs:', e);
      }
    }
  }, []);

  // Re-migrate play history when customMaps become available to populate catalog identity & beatmap hashes
  useEffect(() => {
    if (customMaps.length === 0 || playHistory.length === 0) return;
    setPlayHistory(prev => {
      let changed = false;
      const reSanitized = prev.map(record => {
        const migrated = sanitizeHistoryRecord(record, DEFAULT_SETTINGS, customMaps, {
          allowFailed: record.replaySource === 'imported',
        });
        if (!migrated) {
          changed = true;
          return null;
        }
        if (
          migrated.catalogSetId !== record.catalogSetId ||
          migrated.catalogMapId !== record.catalogMapId ||
          migrated.beatmapHash !== record.beatmapHash ||
          migrated.schemaVersion !== record.schemaVersion ||
          migrated.isServerCatalogMap !== record.isServerCatalogMap ||
          migrated.uploadStatus !== record.uploadStatus
        ) {
          changed = true;
          return migrated;
        }
        return record;
      }).filter((item): item is PlayHistoryRecord => item !== null);

      if (changed && typeof window !== 'undefined') {
        try {
          localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(reSanitized));
        } catch (e) {
          console.error('Failed to persist re-migrated play history:', e);
        }
      }
      return changed ? reSanitized : prev;
    });
  }, [customMaps]);

  const handleClearHistory = () => {
    setPlayHistory([]);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('rhythm_mania_v1_play_history');
      } catch (e) {
        console.error('Failed to wipe local history logs:', e);
      }
    }
  };

  const handleDeleteHistoryRecord = (id: string) => {
    setPlayHistory(prev => {
      const updated = prev.filter(r => r.id !== id);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to persist history deleted state:', e);
        }
      }
      return updated;
    });
  };

  // Merges sanitized imported replay records into history; returns how many were new.
  // Also auto-downloads any missing beatmapsets referenced by sourceSetId.
  const extractRecordSourceSetId = (record: PlayHistoryRecord | any): number | null => {
    if (typeof record?.sourceSetId === 'number' && Number.isFinite(record.sourceSetId) && record.sourceSetId > 0) {
      return record.sourceSetId;
    }
    const chartRevisionId = record?.chartRevisionId;
    if (typeof chartRevisionId === 'string') {
      const match = /^osuapi_(\d+)/.exec(chartRevisionId);
      if (match) return Number(match[1]);
    }
    const catalogSetId = record?.catalogSetId;
    if (typeof catalogSetId === 'string') {
      const match = /^osuapi_(\d+)$/.exec(catalogSetId);
      if (match) return Number(match[1]);
    }
    const beatmapId = record?.beatmapId;
    if (typeof beatmapId === 'string') {
      const match = /^osuapi_(\d+)/.exec(beatmapId);
      if (match) return Number(match[1]);
    }
    return null;
  };

  const handleImportRecords = (records: PlayHistoryRecord[]): number => {
    const existingIds = new Set(playHistory.map(r => r.id));
    const fresh = records.filter(r => !existingIds.has(r.id));
    if (fresh.length === 0) return 0;
    setPlayHistory(prev => {
       const merged = historyLimit > 0 ? [...fresh, ...prev].slice(0, historyLimit) : [...fresh, ...prev];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(merged));
        } catch (e) {
          console.error('Failed to persist imported replays:', e);
        }
      }
      return merged;
    });
    void (async () => {
      const resolvedSetIds: number[] = [];
      for (const r of fresh) {
        let setId = extractRecordSourceSetId(r);
        if (!setId && r.beatmapTitle) {
          setId = await searchOsuBeatmapSetId(r.beatmapTitle, r.beatmapArtist);
        }
        if (typeof setId === 'number' && Number.isFinite(setId) && setId > 0 && !resolvedSetIds.includes(setId)) {
          resolvedSetIds.push(setId);
        }
      }
      const missingSetIds = resolvedSetIds.filter(setId =>
        !customMaps.some(m => m.sourceSetId === setId || String(m.catalogSetId || '').replace(/^osuapi_/, '') === String(setId))
      );
      if (missingSetIds.length > 0) {
        setDownloadingSetIds(prev => Array.from(new Set([...prev, ...missingSetIds])));
      }
      for (const setId of missingSetIds) {
        try {
          const blob = await downloadBeatmapsetArchive(setId, () => {}, () => {}, MAX_COMPRESSED_SIZE_BYTES);
          if (blob.size > MAX_COMPRESSED_SIZE_BYTES) continue;
          const arrayBuffer = await blob.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);
          validateZipLimits(zip);
          const extractionBudget = createZipExtractionBudget();
          const osuFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.osu') && !zip.files[f].dir);
          if (osuFiles.length === 0) continue;
          const importedMaps: Beatmap[] = [];
          const pkgId = `osuapi_${setId}`;
          const staged: Array<{ parsed: Beatmap; rawContent: ArrayBuffer; md5: string; sha256: string }> = [];
          for (const fileKey of osuFiles) {
            const rawContent = await extractZipEntry(zip.files[fileKey], fileKey, extractionBudget);
            const content = decodeBoundedUtf8(rawContent, `Beatmap file ${fileKey}`);
            const parsed = parseBeatmap(content, fileKey);
            if (!parsed) continue;
            const md5 = await computeChecksum(rawContent, 'md5');
            const sha256 = await computeChecksum(rawContent, 'sha256');
            staged.push({ parsed, rawContent, md5: md5.toLowerCase(), sha256: sha256.toLowerCase() });
          }
          if (staged.length === 0) continue;
          const officialCharts = await fetchOfficialChartsForSet(
            setId,
            staged[0]?.parsed.title,
            staged[0]?.parsed.artist,
          );
          for (const item of staged) {
            const { parsed, md5, sha256 } = item;
            const matched = findOfficialChartByChecksum(officialCharts, md5, sha256);
            const chartRevisionId = matched
              ? officialChartRevisionId(setId, matched)
              : `osuapi_${setId}_b0_${md5}`;
            (parsed as unknown as Record<string, unknown>).id = chartRevisionId;
            (parsed as unknown as Record<string, unknown>).catalogSetId = pkgId;
            (parsed as unknown as Record<string, unknown>).catalogMapId = chartRevisionId;
            (parsed as unknown as Record<string, unknown>).chartRevisionId = chartRevisionId;
            (parsed as unknown as Record<string, unknown>).checksum = matched
              ? matched.checksum.toLowerCase()
              : md5;
            (parsed as unknown as Record<string, unknown>).checksumMd5 = md5;
            (parsed as unknown as Record<string, unknown>).checksumSha256 = sha256;
            (parsed as unknown as Record<string, unknown>).checksumAlgorithm = matched
              ? inferChecksumAlgorithm(matched.checksum)
              : 'md5';
            if (matched && Number.isFinite(matched.starRating) && matched.starRating >= 0) {
              (parsed as unknown as Record<string, unknown>).starRating = Number(matched.starRating);
              (parsed as unknown as Record<string, unknown>).starRatingSource = 'osu-api-download';
              (parsed as unknown as Record<string, unknown>).starRatingVersion = undefined;
            }
            (parsed as unknown as Record<string, unknown>).isServerMap = true;
            (parsed as unknown as Record<string, unknown>).packageId = pkgId;
            (parsed as unknown as Record<string, unknown>).parentPackageId = pkgId;
            (parsed as unknown as Record<string, unknown>).sourceSetId = setId;
            (parsed as unknown as Record<string, unknown>).coverUrl = `https://assets.ppy.sh/beatmaps/${setId}/covers/slimcover@2x.jpg`;
            (parsed as unknown as Record<string, unknown>).isCached = true;
            (parsed as unknown as Record<string, unknown>).beatmapHash = computeBeatmapHash(parsed);
            importedMaps.push(parsed as Beatmap);
          }
          if (importedMaps.length > 0) {
            await storageManager.savePackageWithBeatmaps(pkgId, `Beatmapset ${setId}`, new Blob([arrayBuffer]), importedMaps);
            setCustomMaps(prev => {
              const existing = new Set(prev.map(m => m.id));
              const newOnes = importedMaps.filter(m => !existing.has(m.id));
              return [...newOnes, ...prev];
            });
            preloadBeatmapBackgrounds(importedMaps);
          }
        } catch (e) {
          console.warn(`Auto-download for beatmapset ${setId} failed:`, e);
        } finally {
          setDownloadingSetIds(prev => prev.filter(id => id !== setId));
        }
      }
    })();
    return fresh.length;
  };

  const handleSetHistoryLimit = (limit: number) => {
    const normalizedLimit = limit === 9999 || limit === HISTORY_LIMIT_UNLIMITED
      ? HISTORY_LIMIT_UNLIMITED
      : Math.max(5, Math.min(500, limit));
    setHistoryLimit(normalizedLimit);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('rhythm_mania_v1_history_limit', normalizedLimit === HISTORY_LIMIT_UNLIMITED ? 'unlimited' : String(normalizedLimit));
        
        // Trim current logs that overflow the threshold
        setPlayHistory(prev => {
          if (normalizedLimit > 0 && prev.length > normalizedLimit) {
            const truncated = prev.slice(0, normalizedLimit);
            localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(truncated));
            return truncated;
          }
          return prev;
        });
      } catch (e) {
        console.error('Failed to update history retention policy:', e);
      }
    }
  };

  const handleWatchReplay = async (
    record: PlayHistoryRecord,
    providedMap?: Beatmap
  ): Promise<{ success: boolean; error?: string }> => {
    const operation = ++replayLoadGenerationRef.current;
    const isCurrentOperation = () => replayLoadGenerationRef.current === operation;
    let targetMap = providedMap;

    if (!targetMap) {
      targetMap = findMatchingBeatmap(record, customMaps) || undefined;
    }

    if (!targetMap) {
      try {
        const storedMaps = await storageManager.getAllBeatmaps();
        const found = findMatchingBeatmap(record, storedMaps);
        if (found) {
          targetMap = found;
          setCustomMaps(prev => {
            if (!prev.some(m => m.id === found.id)) return [found, ...prev];
            return prev;
          });
        }
      } catch (err) {
        console.warn('Error querying IndexedDB in handleWatchReplay:', err);
      }
    }

    if (targetMap) {
      if (!isCurrentOperation()) return { success: false, error: 'Replay loading was superseded.' };

      const cached = storageManager.lruMediaCache.get(targetMap.id);
      const cloned: Beatmap = {
        ...targetMap,
        audioUrl: cached?.audioUrl || targetMap.audioUrl,
        videoUrl: cached?.videoUrl || targetMap.videoUrl,
        bgUrl: cached?.bgUrl || targetMap.bgUrl,
        notes: targetMap.notes ? targetMap.notes.map(n => ({ ...n })) : []
      };

      setSelectedBeatmap(cloned);
      setActiveReplayRecord(record);
      setViewingHistoryResult(false);
      navigateScreen('play');
      return { success: true };
    }

    // Auto-download missing osu! mirror beatmaps for replay playback (browser → Catboy/Nekoha).
    // Catalog chart/set APIs were removed in the offline cut (TASK-009).
    const catalogSetId = record.catalogSetId;
    const chartRevisionId = record.chartRevisionId;
    let sourceSetId = extractRecordSourceSetId(record);

    if (!sourceSetId && record.beatmapTitle) {
      try {
        const foundId = await searchOsuBeatmapSetId(record.beatmapTitle, record.beatmapArtist);
        if (foundId) sourceSetId = foundId;
      } catch (err) {
        console.warn('Error searching osu! catalog for replay beatmapset:', err);
      }
    }

    if (!sourceSetId) {
      return {
        success: false,
        error: 'Beatmap is missing locally and could not be located in the osu! mirror for auto-download.'
      };
    }

    setDownloadingSetIds(prev => Array.from(new Set([...prev, sourceSetId!])));

    try {
      const blob = await downloadBeatmapsetArchive(
        sourceSetId,
        () => {},
        () => {},
        MAX_COMPRESSED_SIZE_BYTES,
      );
      if (!isCurrentOperation()) return { success: false, error: 'Replay loading was superseded.' };
      if (blob.size > MAX_COMPRESSED_SIZE_BYTES) throw new Error('Security Exception: Downloaded package exceeds the size limit.');
      const arrayBuffer = await blob.arrayBuffer();

      const zip = await JSZip.loadAsync(arrayBuffer);
      validateZipLimits(zip);
      const extractionBudget = createZipExtractionBudget();
      const osuFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.osu') && !zip.files[f].dir);
      if (osuFiles.length === 0) throw new Error('No .osu files in beatmap package');

      const importedMaps: Beatmap[] = [];
      const pkgId = catalogSetId || (sourceSetId ? `osuapi_${sourceSetId}` : null) || (chartRevisionId && /^osuapi_\d+/.test(chartRevisionId) ? chartRevisionId.split('_').slice(0, 2).join('_') : null);
      if (!pkgId) throw new Error('Replay has no verified cloud set identity');
      const targetChecksum = typeof record.checksum === 'string' ? record.checksum.toLowerCase() : null;

      const stagedReplay: Array<{ fileKey: string; parsed: Beatmap; md5: string; sha256: string }> = [];
      for (const fileKey of osuFiles) {
        const rawContent = await extractZipEntry(zip.files[fileKey], fileKey, extractionBudget);
        const content = decodeBoundedUtf8(rawContent, `Beatmap file ${fileKey}`);
        const parsed = parseBeatmap(content, fileKey);
        if (!parsed) continue;

        const [md5, sha256] = await Promise.all([
          computeChecksum(rawContent, 'md5'),
          computeChecksum(rawContent, 'sha256'),
        ]);
        stagedReplay.push({ fileKey, parsed, md5: md5.toLowerCase(), sha256: sha256.toLowerCase() });
      }
      const replayOfficialCharts = sourceSetId
        ? await fetchOfficialChartsForSet(
            sourceSetId,
            stagedReplay[0]?.parsed.title,
            stagedReplay[0]?.parsed.artist,
          )
        : [];

      for (const item of stagedReplay) {
        const { parsed, md5, sha256 } = item;
        const official = findOfficialChartByChecksum(replayOfficialCharts, md5, sha256);

        const isTarget = Boolean(
          (targetChecksum && (md5.toLowerCase() === targetChecksum || sha256.toLowerCase() === targetChecksum)) ||
          (chartRevisionId && (chartRevisionId.includes(md5) || chartRevisionId.includes(sha256))) ||
          (official && chartRevisionId === officialChartRevisionId(sourceSetId!, official)) ||
          (record.beatmapDifficulty && parsed.difficulty?.toLowerCase() === record.beatmapDifficulty.toLowerCase() && parsed.keyCount === record.keyCount)
        );

        const officialRevisionId = official && sourceSetId ? officialChartRevisionId(sourceSetId, official) : null;
        const mapChartRevisionId = isTarget && chartRevisionId
          ? chartRevisionId
          : (officialRevisionId || `osuapi_${sourceSetId}_b0_${md5}`);

        const mapId = isTarget && chartRevisionId ? chartRevisionId : mapChartRevisionId;

        const fullMap: Beatmap & Record<string, unknown> = {
          ...parsed,
          id: mapId,
          catalogSetId: pkgId,
          catalogMapId: mapChartRevisionId,
          chartRevisionId: isTarget ? (chartRevisionId || mapChartRevisionId) : mapChartRevisionId,
          checksum: official ? official.checksum.toLowerCase() : md5,
          checksumAlgorithm: official ? inferChecksumAlgorithm(official.checksum) : 'md5',
          isServerMap: Boolean(isTarget),
          packageId: pkgId,
          parentPackageId: pkgId,
          sourceSetId: sourceSetId || parsed.sourceSetId,
          coverUrl: (sourceSetId || parsed.sourceSetId)
            ? `https://assets.ppy.sh/beatmaps/${sourceSetId || parsed.sourceSetId}/covers/slimcover@2x.jpg`
            : parsed.coverUrl,
          isCached: true,
          beatmapHash: computeBeatmapHash(parsed),
        };
        if (official && Number.isFinite(official.starRating) && official.starRating >= 0) {
          fullMap.starRating = Number(official.starRating);
          fullMap.starRatingSource = 'osu-api-download';
          fullMap.starRatingVersion = undefined;
        }
        importedMaps.push(fullMap as Beatmap);
      }

      if (importedMaps.length === 0) throw new Error('Failed to parse beatmap files');

      await storageManager.savePackageWithBeatmaps(pkgId, importedMaps[0]?.title || 'Downloaded Beatmap', new Blob([arrayBuffer]), importedMaps);
      preloadBeatmapBackgrounds(importedMaps);
      if (!isCurrentOperation()) return { success: false, error: 'Replay loading was superseded.' };

      setCustomMaps(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newOnes = importedMaps.filter(m => !existingIds.has(m.id));
        return [...newOnes, ...prev];
      });

      const matchMap = importedMaps.find(m =>
        (targetChecksum && (m.checksum?.toLowerCase() === targetChecksum)) ||
        (chartRevisionId && (m.chartRevisionId === chartRevisionId || m.id === chartRevisionId)) ||
        (record.catalogMapId && (m.catalogMapId === record.catalogMapId || m.id === record.catalogMapId)) ||
        (record.beatmapId && m.id === record.beatmapId) ||
        (record.beatmapDifficulty && m.difficulty?.toLowerCase() === record.beatmapDifficulty.toLowerCase() && m.keyCount === record.keyCount) ||
        (m.keyCount === record.keyCount)
      ) || importedMaps[0];

      if (!isCurrentOperation()) return { success: false, error: 'Replay loading was superseded.' };

      const cachedMatch = storageManager.lruMediaCache.get(matchMap.id);
      const clonedMatch: Beatmap = {
        ...matchMap,
        audioUrl: cachedMatch?.audioUrl || matchMap.audioUrl,
        videoUrl: cachedMatch?.videoUrl || matchMap.videoUrl,
        bgUrl: cachedMatch?.bgUrl || matchMap.bgUrl,
        notes: matchMap.notes ? matchMap.notes.map(n => ({ ...n })) : []
      };

      setSelectedBeatmap(clonedMatch);
      setActiveReplayRecord(record);
      setViewingHistoryResult(false);
      navigateScreen('play');
      return { success: true };
    } catch (e: unknown) {
      console.error('Failed to auto-download mirror beatmap for replay:', e);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to auto-download mirror beatmap for replay playback'
      };
    } finally {
      if (sourceSetId) {
        setDownloadingSetIds(prev => prev.filter(id => id !== sourceSetId));
      }
    }
  };

  // Dynamically apply selected skin colors to the site theme/UI elements!
  useEffect(() => {
    const accentHex = cssColorToHex(resolveSkinTheme(settings).colors.cyan, '#00b0ff');
    const { r, g, b } = parseCssColor(accentHex);

    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--skin-accent', accentHex);
      document.documentElement.style.setProperty('--skin-accent-rgb', `${r}, ${g}, ${b}`);
    }
  }, [settings.skinId, settings.customSkinColors]);

  // Autoscroll to the top of the viewport whenever a page component loads or changes
  // Lock body overflow on gameplay screen to prevent any unwanted scrolling context
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.getElementById('application-container')?.scrollTo({ top: 0, behavior: 'auto' });
    if (currentScreen === 'play' || showSettings) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    };
  }, [currentScreen, showSettings]);

  // Debounced settings persistence to local storage
  const isInitialSettingsLoad = useRef(true);
  useEffect(() => {
    if (isInitialSettingsLoad.current) {
      isInitialSettingsLoad.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
      } catch (err) {
        console.error("Failed to serialize settings:", err instanceof Error ? err.message : String(err));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    const loadMapsFromIndexedDB = async () => {
      const loadLegacyMaps = async () => {
        try {
          const savedCustomMapsText = localStorage.getItem(LOCAL_STORAGE_CUSTOM_MAPS_KEY);
          if (!savedCustomMapsText) return;
          const parsed: unknown = JSON.parse(savedCustomMapsText);
          if (!Array.isArray(parsed) || parsed.length === 0) return;
          const { maps: migratedMaps } = await migrateAndNormalizeBeatmaps(parsed);
          setCustomMaps(migratedMaps);
          for (const map of migratedMaps) {
            try {
              await storageManager.saveBeatmap(map);
            } catch (error) {
              console.warn('Could not migrate a legacy custom map into IndexedDB:', error instanceof Error ? error.message : String(error));
            }
          }
        } catch (error) {
          console.warn('Could not retrieve legacy custom maps:', error instanceof Error ? error.message : String(error));
        }
      };

      try {
        const maps = await storageManager.getAllBeatmaps();
        if (maps && maps.length > 0) {
          const { maps: migratedMaps } = await migrateAndNormalizeBeatmaps(maps);
          setCustomMaps(migratedMaps);
        } else {
          await loadLegacyMaps();
        }
      } catch (err) {
        console.warn('Could not retrieve custom maps from IndexedDB:', err instanceof Error ? err.message : String(err));
        await loadLegacyMaps();
      }
    };
    loadMapsFromIndexedDB().finally(() => {
      setMapsReady(true);
    });
  }, []);

  // Bundled startup map: "ranked triangles" (beatmapset 2153231). Download once
  // on first load when it is not already installed so fresh users have a
  // playable ranked map immediately.
  const bundledStartupDownloadRef = useRef(false);
  useEffect(() => {
    if (bundledStartupDownloadRef.current) return;
    bundledStartupDownloadRef.current = true;
    const BUNDLED_STARTUP_SET_ID = 2153231;
    const downloadBundledStartupMap = async () => {
      try {
        const stored = await storageManager.getAllBeatmaps();
        const installed = stored.filter((m) =>
          (m as Beatmap & { sourceSetId?: number }).sourceSetId === BUNDLED_STARTUP_SET_ID ||
          String((m as Beatmap & { catalogSetId?: string }).catalogSetId || '').replace(/^osuapi_/, '') === String(BUNDLED_STARTUP_SET_ID) ||
          (m as Beatmap & { packageId?: string }).packageId === `osuapi_${BUNDLED_STARTUP_SET_ID}` ||
          (m as Beatmap & { parentPackageId?: string }).parentPackageId === `osuapi_${BUNDLED_STARTUP_SET_ID}`
        );
        if (installed.length > 0) {
          // Backfill official star ratings for installs predating the
          // mirror-rating lookup (they fell back to the local heuristic).
          const missing = installed.filter((m) =>
            typeof (m as Beatmap).starRating !== 'number' ||
            (m as Beatmap).starRatingSource !== 'osu-api-download',
          );
          if (missing.length > 0) {
            try {
              const charts = await fetchOfficialChartsForSet(
                BUNDLED_STARTUP_SET_ID,
                installed[0]?.title,
                installed[0]?.artist,
              );
              if (charts.length > 0) {
                let patched = 0;
                for (const m of missing) {
                  const checksum = String((m as Beatmap).checksum || '').toLowerCase();
                  if (!checksum) continue;
                  const matched = charts.find((c) => c.checksum.toLowerCase() === checksum);
                  if (!matched || !Number.isFinite(matched.starRating) || matched.starRating < 0) continue;
                  const next = {
                    ...m,
                    id: officialChartRevisionId(BUNDLED_STARTUP_SET_ID, matched),
                    catalogMapId: officialChartRevisionId(BUNDLED_STARTUP_SET_ID, matched),
                    chartRevisionId: officialChartRevisionId(BUNDLED_STARTUP_SET_ID, matched),
                    checksum: matched.checksum.toLowerCase(),
                    checksumAlgorithm: inferChecksumAlgorithm(matched.checksum),
                    starRating: Number(matched.starRating),
                    starRatingSource: 'osu-api-download' as const,
                    starRatingVersion: undefined,
                  } as Beatmap;
                  await storageManager.saveBeatmap(next);
                  patched++;
                }
                if (patched > 0) {
                  const refreshed = await storageManager.getAllBeatmaps();
                  const { maps: migratedMaps } = await migrateAndNormalizeBeatmaps(refreshed);
                  setCustomMaps(migratedMaps);
                }
              }
            } catch (err) {
              console.warn('Bundled startup map rating backfill failed:', err instanceof Error ? err.message : String(err));
            }
          }
          return;
        }
        setDownloadingSetIds((prev) => prev.includes(BUNDLED_STARTUP_SET_ID) ? prev : [...prev, BUNDLED_STARTUP_SET_ID]);
        const blob = await downloadBeatmapsetArchive(BUNDLED_STARTUP_SET_ID, () => {}, () => {}, MAX_COMPRESSED_SIZE_BYTES);
        if (!blob || blob.size === 0 || blob.size > MAX_COMPRESSED_SIZE_BYTES) return;
        const arrayBuffer = await blob.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        validateZipLimits(zip);
        const extractionBudget = createZipExtractionBudget();
        const osuFiles = Object.keys(zip.files).filter((f) => f.toLowerCase().endsWith('.osu') && !zip.files[f].dir);
        if (osuFiles.length === 0) return;
        const pkgId = `osuapi_${BUNDLED_STARTUP_SET_ID}`;
        const stagedBundled: Array<{ parsed: Beatmap; md5: string; sha256: string }> = [];
        for (const fileKey of osuFiles) {
          const rawContent = await extractZipEntry(zip.files[fileKey], fileKey, extractionBudget);
          const content = decodeBoundedUtf8(rawContent, `Beatmap file ${fileKey}`);
          const parsed = parseBeatmap(content, fileKey);
          if (!parsed || parsed.notes.length === 0) continue;
          const md5 = await computeChecksum(rawContent, 'md5');
          const sha256 = await computeChecksum(rawContent, 'sha256').catch(() => '');
          stagedBundled.push({ parsed, md5: md5.toLowerCase(), sha256: String(sha256 || '').toLowerCase() });
        }
        if (stagedBundled.length === 0) return;
        const bundledCharts = await fetchOfficialChartsForSet(
          BUNDLED_STARTUP_SET_ID,
          stagedBundled[0]?.parsed.title,
          stagedBundled[0]?.parsed.artist,
        );
        const importedMaps: Beatmap[] = [];
        for (const item of stagedBundled) {
          const { parsed, md5, sha256 } = item;
          const matched = findOfficialChartByChecksum(bundledCharts, md5, sha256);
          const chartRevisionId = matched
            ? officialChartRevisionId(BUNDLED_STARTUP_SET_ID, matched)
            : `osuapi_${BUNDLED_STARTUP_SET_ID}_b0_${md5}`;
          const fullMap = {
            ...parsed,
            id: chartRevisionId,
            catalogSetId: pkgId,
            catalogMapId: chartRevisionId,
            chartRevisionId,
            checksum: matched ? matched.checksum.toLowerCase() : md5,
            checksumAlgorithm: matched ? inferChecksumAlgorithm(matched.checksum) : 'md5',
            isServerMap: true,
            packageId: pkgId,
            parentPackageId: pkgId,
            sourceSetId: BUNDLED_STARTUP_SET_ID,
            coverUrl: `https://assets.ppy.sh/beatmaps/${BUNDLED_STARTUP_SET_ID}/covers/slimcover@2x.jpg`,
            isCached: true,
            beatmapHash: computeBeatmapHash(parsed),
          } as Beatmap & Record<string, unknown>;
          if (matched && Number.isFinite(matched.starRating) && matched.starRating >= 0) {
            fullMap.starRating = Number(matched.starRating);
            fullMap.starRatingSource = 'osu-api-download';
            fullMap.starRatingVersion = undefined;
          }
          importedMaps.push(fullMap as Beatmap);
        }
        if (importedMaps.length === 0) return;
        await storageManager.savePackageWithBeatmaps(pkgId, importedMaps[0]?.title || 'Ranked Triangles', new Blob([arrayBuffer]), importedMaps);
        preloadBeatmapBackgrounds(importedMaps);
        setCustomMaps((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = importedMaps.filter((m) => !existingIds.has(m.id));
          return fresh.length > 0 ? [...fresh, ...prev] : prev;
        });
      } catch (err) {
        console.warn('Bundled startup map auto-download failed:', err instanceof Error ? err.message : String(err));
      } finally {
        setDownloadingSetIds((prev) => prev.filter((id) => id !== BUNDLED_STARTUP_SET_ID));
      }
    };
    void downloadBundledStartupMap();
  }, []);

  const updateSettings = useCallback((newSettings: Partial<GameSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      const widthMin = PLAYFIELD_WIDTH_MIN;
      const widthMax = PLAYFIELD_WIDTH_MAX;
      const requestedWidth = Number(updated.playfieldWidthPercent !== undefined ? updated.playfieldWidthPercent : 40);
       const playfieldWidthPercent = Number.isFinite(requestedWidth)
        ? Math.max(widthMin, Math.min(widthMax, requestedWidth))
         : Math.max(widthMin, Math.min(widthMax, 40));
      const safePayload: GameSettings = {
        scrollSpeed: Number(updated.scrollSpeed !== undefined ? updated.scrollSpeed : 21),
        lockScrollSpeedDuringPlay: updated.lockScrollSpeedDuringPlay !== false,
        audioOffset: Number(updated.audioOffset !== undefined ? updated.audioOffset : 0),
        visualOffset: Number(updated.visualOffset !== undefined ? updated.visualOffset : 0),
        hitsoundVolume: Number(updated.hitsoundVolume !== undefined ? updated.hitsoundVolume : 0.60),
        musicVolume: Number(updated.musicVolume !== undefined ? updated.musicVolume : 0.75),
        previewVolume: Number(updated.previewVolume !== undefined ? updated.previewVolume : 0.70),
        launchMusicVolume: Number(updated.launchMusicVolume !== undefined ? updated.launchMusicVolume : 0.10),
        masterVolume: Number(updated.masterVolume !== undefined ? updated.masterVolume : 1.0),
        keyMode: Number(updated.keyMode !== undefined ? updated.keyMode : 4),
        bindings: {},
        upsurfaceNoteMode: (updated.upsurfaceNoteMode === true || String(updated.upsurfaceNoteMode) === 'true'),
        videoOpacity: 1.0,
        backgroundDim: Number(updated.backgroundDim !== undefined ? updated.backgroundDim : 0.60),
        songSelectBackgroundDim: Number(updated.songSelectBackgroundDim !== undefined ? updated.songSelectBackgroundDim : 0),
        disableVideo: Boolean(updated.disableVideo),
        videoOffset: Number(updated.videoOffset !== undefined ? updated.videoOffset : 0),
        disableComboBurst: Boolean(updated.disableComboBurst),
        renderDpr: (() => {
          const num = Number(updated.renderDpr);
          if (num === 1 || num === 1.5 || num === 2) return num;
          return 1.5;
        })(),
        skinId: updated.skinId === 'rhythmmania-3d' ? 'argon' : (updated.skinId || 'argon'),
        customSkinColors: updated.customSkinColors,
        customSkinName: updated.customSkinName,
        squareRenderStyle: updated.squareRenderStyle === 'rhythmplus-dynamic'
          ? 'rhythmplus-dynamic'
          : updated.squareRenderStyle === 'rhythmplus' ? 'rhythmplus' : undefined,
         receptorColorsByKeyCount: updated.receptorColorsByKeyCount || {},
        noteOpacity: updated.noteOpacity !== undefined ? Number(updated.noteOpacity) : 1.0,
        receptorOpacity: updated.receptorOpacity !== undefined ? Number(updated.receptorOpacity) : 1.0,
        judgementOpacity: updated.judgementOpacity !== undefined ? Number(updated.judgementOpacity) : 1.0,
         judgementSize: updated.judgementSize !== undefined ? Number(updated.judgementSize) : 1.0,
         judgementPositionY: updated.judgementPositionY !== undefined ? Math.max(20, Math.min(85, Number(updated.judgementPositionY))) : 50,
        laneSeparatorOpacity: updated.laneSeparatorOpacity !== undefined ? Number(updated.laneSeparatorOpacity) : 0.30,
        noteSizeMultiplier: updated.noteSizeMultiplier !== undefined ? Math.max(0.60, Math.min(1.00, Number(updated.noteSizeMultiplier))) : 1.0,
        receptorSizeMultiplier: updated.receptorSizeMultiplier !== undefined ? Math.max(0.60, Math.min(1.00, Number(updated.receptorSizeMultiplier))) : 1.0,
         playfieldWidthPercent,
        selectedMods: updated.selectedMods || [],
        bindPause: updated.bindPause !== undefined ? String(updated.bindPause) : 'escape',
        bindRetry: updated.bindRetry !== undefined ? String(updated.bindRetry) : 'r',
        bindSkipIntro: updated.bindSkipIntro !== undefined ? String(updated.bindSkipIntro) : 'enter',
        enableMapSV: updated.enableMapSV !== false,
        enableSongPreview: updated.enableSongPreview !== false,
        showFpsCounter: Boolean(updated.showFpsCounter),
        uncappedMenuMotion: Boolean(updated.uncappedMenuMotion),
        menuCursorEnabled: updated.menuCursorEnabled !== false,
        showPenarDuringPlay: updated.showPenarDuringPlay !== undefined ? Boolean(updated.showPenarDuringPlay) : true,
        localDisplayName: updated.localDisplayName !== undefined ? String(updated.localDisplayName).slice(0, 32) : '',
        difficultyAdjust: updated.difficultyAdjust,
      };

      if (updated.bindings) {
        for (const k of Object.keys(updated.bindings)) {
          const numKey = Number(k);
          if (!isNaN(numKey) && Array.isArray(updated.bindings[numKey])) {
            safePayload.bindings[numKey] = updated.bindings[numKey].map(bind => String(bind));
          }
        }
      }

      return safePayload;
    });
  }, []);

  const handleImportBeatmap = async (map: Beatmap) => {
    setCustomMaps(prev => {
      const filtered = prev.filter(m => m.id !== map.id);
      return [map, ...filtered];
    });
    try {
      await storageManager.saveBeatmap(map);
    } catch (e) {
      console.error('Failed to persist imported beatmap to IndexedDB:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleImportPackage = async (packageId: string, name: string, blob: Blob, maps: Beatmap[]) => {
    await storageManager.savePackageWithBeatmaps(packageId, name, blob, maps);
    setCustomMaps(prev => {
      const importedIds = new Set(maps.map(map => map.id));
      return [...maps, ...prev.filter(map => !importedIds.has(map.id))];
    });
    // Unzip song art immediately (background-only) so Song Select backdrops
    // and banners are ready before the user browses to the new songs.
    preloadBeatmapBackgrounds(maps);
  };

  const handleDeleteSongGroup = async (mapIds: string[]) => {
    try {
      for (const mapId of mapIds) {
        await storageManager.deleteBeatmapAndCleanup(mapId);
      }
      setCustomMaps(prev => prev.filter(m => !mapIds.includes(m.id)));
      setSelectedBeatmap(prev => prev && mapIds.includes(prev.id) ? null : prev);
    } catch (e) {
      console.error('Failed to delete song group:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleSelectMap = (map: Beatmap) => {
    replayLoadGenerationRef.current++;
    setActiveReplayRecord(null); // Fresh clean live playthrough
    const cloned = {
      ...map,
      notes: map.notes ? map.notes.map(n => ({ ...n })) : []
    };
    setSelectedBeatmap(cloned);
    setHasPlayedThisSession(true);
    navigateScreen('play');
  };

  const releaseBeatmapAssets = (map: Beatmap | null) => {
    if (!map) return;
    const cached = storageManager.lruMediaCache.get(map.id);
    if (!cached) {
      AssetLifecycleManager.releaseSpecific(map.audioUrl);
      AssetLifecycleManager.releaseSpecific(map.videoUrl);
      AssetLifecycleManager.releaseSpecific(map.bgUrl);
      for (const url of Object.values(map.hitSoundUrls || {})) AssetLifecycleManager.releaseSpecific(url);
      return;
    }
    for (const [current, retained] of [
      [map.audioUrl, cached.audioUrl],
      [map.videoUrl, cached.videoUrl],
      [map.bgUrl, cached.bgUrl],
    ] as Array<[string | undefined, string]>) {
      if (current && current !== retained) AssetLifecycleManager.releaseSpecific(current);
    }
    for (const [name, current] of Object.entries(map.hitSoundUrls || {})) {
      if (current && current !== cached.hitSoundUrls[name]) AssetLifecycleManager.releaseSpecific(current);
    }
  };

  const handleGameplayFinish = (finalScore: ScoreState, replayFrames: ReplayFrame[] = [], hitErrors?: number[]) => {
    // Session-only precision samples; never persisted (AGENTS.md storage contract).
    setLastHitErrors(hitErrors && hitErrors.length > 0 ? [...hitErrors] : null);
    void FullscreenManager.exitFocusMode();

    // Only commit to performance logs if they are NOT playing a spectator replay and it's a mania map (mode 3, or undefined/null/keyCount in mania range)
    const isMania = selectedBeatmap && (
      selectedBeatmap.mode === 3 ||
      selectedBeatmap.mode === undefined ||
      selectedBeatmap.mode === null ||
      (selectedBeatmap.keyCount >= 1 && selectedBeatmap.keyCount <= 10)
    );

    const newRecordId = `play_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    const hasNoFailMod = (settings.selectedMods || []).some(mod => mod.toUpperCase() === 'NF');
    const shouldKeepRun = !finalScore.failed || hasNoFailMod;

    if (selectedBeatmap && !activeReplayRecord && isMania && (finalScore.completed || finalScore.failed) && !finalScore.isAutoplay && shouldKeepRun) {
      const targetBm = activePlayBeatmap || selectedBeatmap;
      const localName = settings.localDisplayName?.trim();

      const newRecord = createPlayHistoryRecord({
        id: newRecordId,
        timestamp: Date.now(),
        beatmap: targetBm,
        scoreState: finalScore,
        replayFrames,
        recordedSettings: settings,
        mods: settings.selectedMods,
        replaySource: 'guest-local',
        holdRules: { holdRulesVersion: LAZER_HOLD_RULES_VERSION },
      });
      if (localName) newRecord.playedBy = localName;

      setPlayHistory(prev => {
         const appended = historyLimit > 0 ? [newRecord, ...prev].slice(0, historyLimit) : [newRecord, ...prev];
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(appended));
          } catch (e) {
            console.error('History save error:', e);
          }
        }
        return appended;
      });
    }

    if (!finalScore.completed || finalScore.failed) {
      // "pre exited or failed maps will not get the score screen/ will just replay the song/ go back to the song select"
      releaseBeatmapAssets(selectedBeatmap);
      setActiveReplayRecord(null);
      setSelectedBeatmap(null);
      setScoreState(null);
       navigateScreen('select');
      return;
    }

    // Do NOT clear spectator frames here so that the results selection knows we are in replay mode.
    // When finishing a spectator replay, anchor the results screen to that exact record so the
    // detailed options (watch/export/delete) resolve for own-history replays; for autoplay and
    // others' replays (not in playHistory) the lookup naturally yields no activeRecord, which
    // keeps the limited results view as intended.
    setScoreState({ ...finalScore, recordId: activeReplayRecord?.id || newRecordId });
    navigateScreen('results');
  };

  const handleRetrySong = () => {
    replayLoadGenerationRef.current++;
    releaseBeatmapAssets(selectedBeatmap);
    setActiveReplayRecord(null);
    setLastHitErrors(null);
    setSelectedBeatmap(null);
    navigateScreen('select');
  };

  // Lazer toolbar is position:fixed (out of flow), so the main viewport must
  // reserve its height — otherwise page tops (e.g. Song Select search/filters)
  // render underneath it. All skins use the Argon top bar (single implementation).
  const showLazerToolbar = !(currentScreen === 'menu' && menuPhase === 'idle') && currentScreen !== 'play';

  return (
    <div
      id="application-container" 
      className={`bg-[#050508] text-white flex flex-col font-sans selection:bg-cyan-300 selection:text-[#041321] relative h-screen h-dvh ${
        (currentScreen === 'menu' || currentScreen === 'play' || currentScreen === 'select' || currentScreen === 'history' || currentScreen === 'results' || currentScreen === 'skins') ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'
      }`}
    >
      <LazerDebugSmoke />
      {/* UNIFIED DYNAMIC CROSS-FADING BACKGROUND LAYER */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none bg-[#050508]">
        <AnimatePresence initial={false}>
          {currentScreen !== 'play' && currentScreen !== 'menu' && activeBackgroundUrl && (
            <motion.div
              key={activeBackgroundUrl}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-fixed"
              style={{
                backgroundImage: `url("${sanitizeCssUrl(activeBackgroundUrl)}")`
              }}
            />
          )}
        </AnimatePresence>
        {/* Atmospheric vignette to ensure contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25 pointer-events-none" />
      </div>

      {/* Soft glow backdrop (no grid overlay — background art stays clean) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-1">
        <div className="absolute top-[-300px] left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-100px] right-10 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      </div>

      {/* 1. ARGON TOP BAR (all skins, single implementation) */}
      {/* Hidden on menu idle cookie and during live play. */}
      <LazerToolbar
        visible={showLazerToolbar}
        onOpenSettings={openSettings}
        onGoHome={() => {
          setMenuPhase('idle');
          leaveProfilePath('menu');
        }}
        onOpenListing={() => setShowFindBeatmapOverlay((prev) => !prev)}
        onToggleNowPlaying={() => setIsNowPlayingOpen((prev) => !prev)}
        isListingOpen={showFindBeatmapOverlay}
        isNowPlayingOpen={isNowPlayingOpen}
        localDisplayName={settings.localDisplayName}
      />

      {/* 2. CORE VIEWPORTS */}
      <main
        id="app-main-viewport"
        className={`flex-1 flex flex-col min-h-0 relative ${
          (currentScreen === 'menu' || currentScreen === 'play' || currentScreen === 'select' || currentScreen === 'history' || currentScreen === 'results' || currentScreen === 'skins')
            ? 'w-full h-full'
            : 'py-6 md:py-12 px-4 md:px-6 z-10'
        }${showLazerToolbar ? ' pt-[40px]' : ''}`}
      >
        <AnimatePresence mode="wait">
          {currentScreen === 'menu' && (
            <motion.div
              key="menu"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full relative"
            >
              <MainMenu
                onNavigate={(screen) => {
                  leaveProfilePath(screen as GameScreen);
                }}
                onOpenSettings={openSettings}
                onOpenBrowse={() => setShowFindBeatmapOverlay(true)}
                phase={menuPhase}
                onPhaseChange={setMenuPhase}
                inputDisabled={showSettings || showFindBeatmapOverlay}
                menuMotionUncapped={settings.uncappedMenuMotion === true}
              />
            </motion.div>
          )}

          {currentScreen === 'skins' && (
            <motion.div
              key="skins"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full w-full overflow-hidden"
            >
                <SkinScreen
                  settings={settings}
                  updateSettings={updateSettings}
                  onBack={() => navigateScreen('menu')}
                />
            </motion.div>
          )}

          {currentScreen === 'select' && (
            <motion.div
              key="select"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full flex-1 min-h-0 h-full flex flex-col"
            >
              <SongSelect
                settings={settings}
                updateSettings={updateSettings}
                onSelectMap={handleSelectMap}
                onOpenSettings={openSettings}
                customMaps={customMaps}
                shouldAutoSelectOnMount={hasPlayedThisSession}
                isLoading={!mapsReady}
                 onImportBeatmap={handleImportBeatmap}
                 onImportPackage={handleImportPackage}
                onDeleteSongGroup={handleDeleteSongGroup}
                onBack={() => navigateScreen('menu')}
                onOpenOnlineCatalog={() => setShowFindBeatmapOverlay(true)}
                onWatchReplay={handleWatchReplay}
                playHistory={playHistory}
              />
            </motion.div>
          )}

          {currentScreen === 'play' && selectedBeatmap && activePlayBeatmap && (
            <motion.div
              key="play"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full flex-1 flex flex-col"
            >
                <GameplayCanvas
                  beatmap={activePlayBeatmap}
                  settings={settings}
                  updateSettings={updateSettings}
                  onFinish={handleGameplayFinish}
                  onBack={() => {
                    replayLoadGenerationRef.current++;
                    void FullscreenManager.exitFocusMode();
                    const returnScreen = activeReplayRecord ? 'history' : 'select';
                    setActiveReplayRecord(null);
                    releaseBeatmapAssets(selectedBeatmap);
                    setSelectedBeatmap(null);
                    navigateScreen(returnScreen);
                  }}
                  replayRecord={activeReplayRecord}
                />
            </motion.div>
          )}

          {currentScreen === 'results' && scoreState && selectedBeatmap && activePlayBeatmap && (
            <motion.div
              key="results"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full overflow-hidden flex items-center justify-center"
            >
              <ResultsScreen
                scoreState={scoreState}
                beatmap={activePlayBeatmap}
                playHistory={playHistory}
                currentMods={settings.selectedMods}
                hitErrors={lastHitErrors}
                onRetry={handleRetrySong}
                onWatchReplay={(record) => {
                  setViewingHistoryResult(false);
                  return handleWatchReplay(record);
                }}
                onDeleteRecord={handleDeleteHistoryRecord}
                onBack={() => {
                  replayLoadGenerationRef.current++;
                  void FullscreenManager.exitFocusMode();
                  const returnScreen = activeReplayRecord ? 'history' : (viewingHistoryResult ? 'history' : 'select');
                  setActiveReplayRecord(null);
                  setViewingHistoryResult(false);
                  releaseBeatmapAssets(selectedBeatmap);
                  setSelectedBeatmap(null);
                  navigateScreen(returnScreen);
                }}
                onBackToHistory={viewingHistoryResult ? () => {
                  releaseBeatmapAssets(selectedBeatmap);
                  setViewingHistoryResult(false);
                  setScoreState(null);
                  setSelectedBeatmap(null);
                  navigateScreen('history');
                } : undefined}
              />
            </motion.div>
          )}

          {currentScreen === 'history' && (
            <motion.div
              key="history"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full overflow-hidden"
            >
                <PersonalHistoryScreen
                  history={playHistory}
                  allBeatmaps={customMaps}
                  setHistoryBgUrl={setHistoryBgUrl}
                  downloadingSetIds={downloadingSetIds}
                  onWatchReplay={(record) => {
                    setViewingHistoryResult(false);
                    return handleWatchReplay(record);
                  }}
                  onViewResult={(record) => {
                    setActiveReplayRecord(null);
                    setLastHitErrors(null);
                    setScoreState(record.scoreState);
                    const baseId = record.beatmapId.includes('_converted_')
                      ? record.beatmapId.split('_converted_')[0]
                      : record.beatmapId;
                    const bm = customMaps.find(m =>
                      m.id === record.beatmapId ||
                      (baseId && m.id === baseId) ||
                      (record.catalogMapId && m.catalogMapId === record.catalogMapId) ||
                      (record.beatmapHash && m.beatmapHash === record.beatmapHash)
                    );
                    if (bm) {
                        const cloned = {
                          ...bm,
                          notes: bm.notes ? bm.notes.map(n => ({ ...n })) : []
                        };
                        setSelectedBeatmap(cloned);
                        setViewingHistoryResult(true);
                        navigateScreen('results');
                    }
                  }}
                  onClearHistory={handleClearHistory}
                  onDeleteRecord={handleDeleteHistoryRecord}
                  onImportRecords={handleImportRecords}
                  historyLimit={historyLimit}
                  onSetHistoryLimit={handleSetHistoryLimit}
                  settings={settings}
                  onBack={() => navigateScreen('menu')}
                  onSelectSong={() => navigateScreen('select')}
               />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <SettingsScreen
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        updateSettings={updateSettings}
      />

      <OnlineBeatmapCatalog
        open={showFindBeatmapOverlay}
        onClose={() => setShowFindBeatmapOverlay(false)}
        customMaps={customMaps}
        onImportPackage={handleImportPackage}
      />

      {!booted && (
        <LoadingScreen
          customMaps={customMaps}
          mapsReady={mapsReady}
          onStartPressed={handleBootStartPressed}
          onEntered={handleBootEntered}
        />
      )}

      {settings.showFpsCounter === true && (
        <GlobalFpsOverlay belowToolbar={showLazerToolbar} />
      )}

      <LazerCursor enabled={settings.menuCursorEnabled !== false} />
    </div>
  );
}
