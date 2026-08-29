import Dexie, { type Table } from 'dexie';

export interface StoredBeatmapSet {
  id: string;
  title: string;
  artist: string;
  creator: string;
  coverImageBlob?: Blob;
  audioBlob: Blob;
  dateAdded: number;
  source: 'import' | 'download' | 'sample';
}

export interface StoredBeatmap {
  id: string;
  setId: string;
  version: string;
  keyCount: number;
  overallDifficulty: number;
  hpDrainRate: number;
  starRating: number;
  lengthMs: number;
  objectCount: number;
  rawOsuContent: string;
}

export interface StoredLocalPlay {
  id?: number;
  beatmapId: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  unstableRate: number;
  judgments: {
    perfect: number;
    great: number;
    good: number;
    ok: number;
    meh: number;
    miss: number;
  };
  mods: string[];
  timestamp: number;
}

export interface StoredSettings {
  id: 'settings';
  masterVolume: number;
  musicVolume: number;
  hitsoundVolume: number;
  userOffsetMs: number;
  scrollDurationMs: number;
  upscroll: boolean;
  backgroundDim: number;
  binds: Record<number, string[]>;
}

export class OsuManiaDatabase extends Dexie {
  beatmapSets!: Table<StoredBeatmapSet, string>;
  beatmaps!: Table<StoredBeatmap, string>;
  localPlays!: Table<StoredLocalPlay, number>;
  settings!: Table<StoredSettings, string>;

  constructor() {
    super('OsuManiaWebDB');
    this.version(1).stores({
      beatmapSets: 'id, title, artist, creator, dateAdded',
      beatmaps: 'id, setId, keyCount, starRating',
      localPlays: '++id, beatmapId, timestamp',
      settings: 'id',
    });
  }
}

export const db = new OsuManiaDatabase();
