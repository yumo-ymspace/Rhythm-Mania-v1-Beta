export interface RawHitObject {
  column: number;
  startTime: number;
  endTime: number;
  isHold: boolean;
  hitSound: number;
  hitSample: string;
}

export interface TimingPoint {
  time: number;
  beatLength: number;
  meter: number;
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  uninherited: boolean;
  effects: number;
}

export interface ParsedManiaBeatmap {
  general: {
    audioFilename: string;
    audioLeadIn: number;
    previewTime: number;
  };
  metadata: {
    title: string;
    titleUnicode: string;
    artist: string;
    artistUnicode: string;
    creator: string;
    version: string;
    beatmapId: number;
    beatmapSetId: number;
  };
  difficulty: {
    keyCount: number;
    overallDifficulty: number;
    hpDrainRate: number;
    sliderMultiplier: number;
    sliderTickRate: number;
  };
  backgroundFilename: string | null;
  timingPoints: TimingPoint[];
  hitObjects: RawHitObject[];
}

export function mapColumn(x: number, keyCount: number): number {
  return Math.max(0, Math.min(keyCount - 1, Math.floor((x * keyCount) / 512)));
}
