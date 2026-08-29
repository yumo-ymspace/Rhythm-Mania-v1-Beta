import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { ModAcronym } from '../engine/ruleset/mods';
import { toggleMod } from '../engine/ruleset/mods';
import { db } from '../storage/db';
import { downloadFromCatboy, importOszPackage } from '../storage/osz';
import { ensureSampleChart } from '../sample/ensureSample';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';
import type { GameState, PlayResult, Screen } from './types';

type Action =
  | { type: 'hydrate'; state: Partial<GameState> }
  | { type: 'screen'; screen: Screen }
  | { type: 'search'; search: string }
  | { type: 'selectSet'; id: string }
  | { type: 'selectMap'; id: string }
  | { type: 'mods'; mods: ModAcronym[] }
  | { type: 'settings'; settings: GameState['settings'] }
  | { type: 'result'; result: PlayResult }
  | { type: 'error'; error: string | null }
  | { type: 'bpm'; bpm: number };

const initial: GameState = {
  screen: 'menu',
  user: null,
  settings: DEFAULT_SETTINGS,
  sets: [],
  beatmaps: [],
  selectedSetId: null,
  selectedBeatmapId: null,
  mods: [],
  search: '',
  playResult: null,
  localPlays: [],
  error: null,
  bpm: 140,
};

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.state };
    case 'screen':
      return { ...state, screen: action.screen, error: null };
    case 'search':
      return { ...state, search: action.search };
    case 'selectSet': {
      const maps = state.beatmaps.filter((b) => b.setId === action.id);
      return {
        ...state,
        selectedSetId: action.id,
        selectedBeatmapId: maps[0]?.id ?? null,
      };
    }
    case 'selectMap':
      return { ...state, selectedBeatmapId: action.id };
    case 'mods':
      return { ...state, mods: action.mods };
    case 'settings':
      return { ...state, settings: action.settings };
    case 'result':
      return { ...state, playResult: action.result, screen: action.result.failed ? 'fail' : 'results' };
    case 'error':
      return { ...state, error: action.error };
    case 'bpm':
      return { ...state, bpm: action.bpm };
    default:
      return state;
  }
}

type Store = GameState & {
  dispatch: Dispatch<Action>;
  go: (screen: Screen) => void;
  toggle: (mod: ModAcronym) => void;
  importFiles: (files: FileList | File[]) => Promise<void>;
  downloadSet: (setId: number) => Promise<void>;
  login: () => void;
  refreshLibrary: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const refreshLibrary = async (): Promise<void> => {
    const [sets, beatmaps, settings, user] = await Promise.all([
      db.beatmapSets.orderBy('dateAdded').reverse().toArray(),
      db.beatmaps.toArray(),
      loadSettings(),
      fetchMe(),
    ]);
    dispatch({
      type: 'hydrate',
      state: {
        sets,
        beatmaps,
        settings,
        user,
        selectedSetId: state.selectedSetId ?? sets[0]?.id ?? null,
        selectedBeatmapId:
          state.selectedBeatmapId ?? beatmaps.find((b) => b.setId === (state.selectedSetId ?? sets[0]?.id))?.id ?? beatmaps[0]?.id ?? null,
      },
    });
  };

  useEffect(() => {
    void (async () => {
      await ensureSampleChart();
      await refreshLibrary();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const store = useMemo<Store>(
    () => ({
      ...state,
      dispatch,
      go: (screen) => dispatch({ type: 'screen', screen }),
      toggle: (mod) => dispatch({ type: 'mods', mods: toggleMod(state.mods, mod) }),
      importFiles: async (files) => {
        try {
          for (const file of Array.from(files)) {
            if (!file.name.toLowerCase().endsWith('.osz') && file.type !== 'application/zip') continue;
            await importOszPackage(file, 'import');
          }
          await refreshLibrary();
        } catch (err) {
          dispatch({ type: 'error', error: err instanceof Error ? err.message : 'Import failed' });
        }
      },
      downloadSet: async (setId) => {
        try {
          dispatch({ type: 'error', error: null });
          await downloadFromCatboy(setId);
          await refreshLibrary();
        } catch (err) {
          dispatch({ type: 'error', error: err instanceof Error ? err.message : 'Download failed' });
        }
      },
      login: () => {
        window.location.href = '/api/auth/osu/url';
      },
      refreshLibrary,
    }),
    [state],
  );

  useEffect(() => {
    void saveSettings(state.settings);
  }, [state.settings]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useGame(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
}

async function fetchMe(): Promise<GameState['user']> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const data = (await res.json()) as { user: GameState['user'] };
    return data.user;
  } catch {
    return null;
  }
}
