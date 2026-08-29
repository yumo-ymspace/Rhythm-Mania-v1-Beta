import type { ModAcronym } from '../engine/ruleset/mods';
import type { StoredBeatmap, StoredBeatmapSet, StoredLocalPlay, StoredSettings } from '../storage/db';
import type { ScoreRank } from '../engine/ruleset/score';
import type { HitResult } from '../engine/ruleset/hitWindows';

export type OsuUserPublic = {
  osuId: number;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  countryCode: string | null;
  pp: number | null;
  globalRank: number | null;
  level: number | null;
};

export type Screen = 'menu' | 'songSelect' | 'playing' | 'pause' | 'fail' | 'results' | 'settings';

export type PlayResult = {
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: ScoreRank;
  unstableRate: number;
  counts: Record<HitResult, number>;
  mods: ModAcronym[];
  beatmapId: string;
  title: string;
  version: string;
  failed: boolean;
};

export type GameState = {
  screen: Screen;
  user: OsuUserPublic | null;
  settings: StoredSettings;
  sets: StoredBeatmapSet[];
  beatmaps: StoredBeatmap[];
  selectedSetId: string | null;
  selectedBeatmapId: string | null;
  mods: ModAcronym[];
  search: string;
  playResult: PlayResult | null;
  localPlays: StoredLocalPlay[];
  error: string | null;
  bpm: number;
};
