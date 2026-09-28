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

export type NoteType = 'normal' | 'hold';
export type HoldRulesVersion = 1 | 2 | 3;

export type CloudBeatmapSource = 'osuapi';
export type CloudCatalogState = 'pending' | 'active';
export type StarRatingSource = 'osu-api-download' | 'chart-content' | 'legacy-fallback';

export interface CloudChartRef {
  chartRevisionId: string;
  cloudSetId: string;
  sourceChartId?: number;
  originalOsuFilename: string;
  checksum: string;
  checksumAlgorithm: 'md5' | 'sha256';
  difficulty: string;
  keyCount: number;
  mode: 3;
  isActive: boolean;
}

export interface CloudSetSummary {
  cloudSetId: string;
  source: CloudBeatmapSource;
  sourceSetId?: number;
  title: string;
  artist: string;
  creator: string;
  coverUrl?: string;
  state: CloudCatalogState;
  rankStatus?: string;
  downloadUrl?: string;
  charts: CloudChartRef[];
}

export interface HitSample {
  normalSet: number;
  additionSet: number;
  index: number;
  volume: number;
  filename?: string;
}

export interface HitObject {
  id: string;
  time: number; // in milliseconds
  column: number;
  type: NoteType;
  endTime?: number; // for hold notes (in milliseconds)
  
  // Gameplay state trackers
  hitTime?: number;    // timestamp when hit
  releaseTime?: number; // timestamp when released (for hold notes)
  isHit: boolean;
  isReleased: boolean;
  isMissed: boolean;
  isHoldFailed: boolean; // if released early
  isHeadHit?: boolean;
  tailEngagedTime?: number;
  tailRequiresRepress?: boolean;
  releaseGraceUntil?: number; // For brief key-bounces / re-keying
  isReleaseMissed?: boolean;
  isReleaseHit?: boolean;
  earlyReleaseTime?: number;
  tailResumedTime?: number;
  releaseZoneArmedTime?: number;
  nextTailTickTime?: number;
  tailTickStartTime?: number;
  tailTickEndTime?: number;
  tailTickIntervalMs?: number;
  tailMissRunActive?: boolean;
  clearedTailIntervals?: Array<{ startTime: number; endTime: number }>;
  missedTailIntervals?: Array<{ startTime: number; endTime: number }>;
  holdRulesVersion?: HoldRulesVersion;
  holdState?: import('./ruleset/mania/holdNote').HoldNoteState;
  hitSound?: number;
  hitSample?: HitSample;

  // Source coordinates retained for shared lane/visual fallback geometry.
  x?: number; // 0-512
  y?: number; // 0-384
}

export interface TimingControlPoint {
  timeMs: number;
  beatLength: number;
  uninherited: boolean;
  svMultiplier: number;
}

export interface BeatmapMetadata {
  title: string;
  artist: string;
  bpm: number;
  creator: string;
  difficulty: string;
  keyCount: number;
  duration: number; // in seconds
  audioUrl?: string;
  videoUrl?: string;
  videoStartTime?: number; // storyboard video start offset (in milliseconds)
  previewTime?: number; // .osu General:PreviewTime in ms; negative/undefined means unset
  bgUrl?: string;
  coverUrl?: string;
  hitSoundUrls?: Record<string, string>;
  id: string;
  mode?: 3; // osu!mania only

  // Canonical identity fields
  catalogSetId?: string | null;
  catalogMapId?: string | null;
  beatmapHash?: string;
  isServerMap?: boolean;
  chartRevisionId?: string | null;
  checksum?: string;
  checksumAlgorithm?: 'md5' | 'sha256';
  sourceSetId?: number;
  sourceChartId?: number;
  starRating?: number;
  starRatingSource?: StarRatingSource;
  starRatingVersion?: number;
}

export interface Beatmap extends BeatmapMetadata {
  notes: HitObject[];
  hpDrainRate: number; // 0-10
  overallDifficulty: number; // 0-10 (affects judgement window)
  approachRate?: number; // 0-10 (display / DA; mania still ships AR in .osu)
  timingPoints: TimingControlPoint[];
  sliderMultiplier: number;
  baseBeatLength?: number;
  breaks?: Array<{ startTime: number; endTime: number }>;
}

export type JudgementType = 'marvelous' | 'perfect' | 'great' | 'good' | 'bad' | 'miss';

export interface ColumnJudgementCounts {
  column: number;
  marvelousCount: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  badCount: number;
  missCount: number;
}

export interface JudgementWindow {
  type: JudgementType;
  name: string;
  windowMs: number;
  baseScore: number;
  hpDelta: number;
  color: string;
  glowColor: string;
}

export interface PenarBreakdown {
  total: number | null; // null = not yet computed
  version: string; // e.g. 'penar-stub-0'
  starRating: number | null;
  accuracy: number;
  maxCombo: number;
  missCount: number;
  mods: string[];
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  hp: number; // 0 to 100
  perfectCount: number;
  marvelousCount: number;
  greatCount: number;
  goodCount: number;
  badCount: number;
  missCount: number;
  accuracy: number;
  completed: boolean;
  failed: boolean;
  recordId?: string;
  unstableRate: number | null;
  hitErrorSampleCount: number;
  comboBreakCount?: number;
  columnJudgements: ColumnJudgementCounts[];
  isAutoplay?: boolean;
  penar?: PenarBreakdown | null;
}

export interface ReplayFrame {
  time: number;
  keysPressed: boolean[];
}

export type ReplaySource = 'guest-local' | 'account-local' | 'server-remote' | 'imported';

export type UploadEligibility =
  | 'eligible'
  | 'ineligible_local_map'
  | 'ineligible_autoplay'
  | 'ineligible_failed'
  | 'ineligible_mode'
  | 'ineligible_no_replay_frames';

export type UploadStatus = 'local_only' | 'pending' | 'uploaded' | 'failed';

export interface ReplayClientInfo {
  userAgent: string;
  browser: string;
  os: string;
  platform: string;
  language: string;
  timezone: string;
  timezoneOffset: number;
  screenWidth?: number;
  screenHeight?: number;
  appVersion: string;
}

export interface PlayHistoryRecord {
  id: string;
  timestamp: number;
  beatmapId: string;
  beatmapTitle: string;
  beatmapArtist: string;
  keyCount: number;
  score: number;
  accuracy: number;
  maxCombo: number;
  grade: string;
  isFailed: boolean;
  scoreState: ScoreState;
  replayFrames: ReplayFrame[];
  recordedSettings?: Partial<GameSettings>;
  mods?: string[];

  // Versioned replay schema & canonical catalog identity fields
  schemaVersion?: number; // e.g. 3
  replaySource?: ReplaySource;
  catalogSetId?: string | null; // e.g., 'osuapi_12345'
  catalogMapId?: string | null; // e.g., 'osuapi_12345_b67890_checksum'
  chartRevisionId?: string | null;
  checksum?: string;
  checksumAlgorithm?: 'md5' | 'sha256';
  beatmapHash?: string; // deterministic hash of content or metadata
  uploadEligibility?: UploadEligibility;
  uploadStatus?: UploadStatus;
  isServerCatalogMap?: boolean;
  holdRulesVersion?: HoldRulesVersion;
  holdTickIntervalMs?: number;

  // Extended metadata for .rmr exports (v3)
  sourceSetId?: number | null;
  sourceChartId?: number | null;
  beatmapDifficulty?: string;
  playedBy?: string | null;
  clientInfo?: ReplayClientInfo | null;
}

export interface KeyBindings {
  [keys: number]: string[]; // maps column counts (1..10) to key arrays (e.g. ['d', 'f', 'j', 'k'])
}

export interface DifficultyAdjustSettings {
  overallDifficulty?: number; // 0..10
  hpDrainRate?: number; // 0..10
}

export interface GameSettings {
  scrollSpeed: number; // multiplier or speed factor (e.g., 20)
  lockScrollSpeedDuringPlay?: boolean; // lock scroll speed during gameplay (cannot change mid-map)
  audioOffset: number; // in milliseconds (positive means audio is delayed)
  visualOffset: number; // in milliseconds (positive means visual notes are delayed)
  hitsoundVolume: number; // 0 to 1
  musicVolume: number; // 0 to 1
  previewVolume: number; // 0 to 1 multiplier applied to song previews
  launchMusicVolume: number; // 0 to 1 multiplier applied to the game launch menu song
  masterVolume: number; // 0 to 1 applied to all gameplay audio
  keyMode: number; // 1..10
  bindings: KeyBindings;
  upsurfaceNoteMode: boolean; // whether notes scroll upwards rather than downwards
  videoOpacity: number; // background video opacity (0 to 1)
  backgroundDim: number; // gameplay background dim / solid-black lane background shielding opacity (0 to 1)
  songSelectBackgroundDim?: number; // song select cover artwork dim overlay opacity (0 to 1)
  disableVideo?: boolean; // whether background video playback is completely disabled
  videoOffset?: number; // manual user adjuster for video playback delay (milliseconds)
  disableComboBurst?: boolean; // hide the combo milestone burst popup
  renderDpr?: number; // user-selectable canvas device pixel ratio: 1, 1.5, or 2
  skinId?: string; // 'argon' (default) | 'custom' (RhythmPlus bar skins set 'custom' + squareRenderStyle)
  customSkinColors?: string[]; // user parsed custom colors: [blueKeyColor, whiteKeyColor, accentKeyColor, cyanKeyColor, holdNoteColor]
  customSkinName?: string;
  squareRenderStyle?: 'rhythmplus' | 'rhythmplus-dynamic';
  receptorColorsByKeyCount?: Record<number, string[]>; // per-lane receptor colors for 1K-10K
  noteOpacity?: number; // 0.1 to 1.0 (opacity for note visuals)
  receptorOpacity?: number; // 0.1 to 1.0 (opacity for landline keys receptors)

  noteSizeMultiplier?: number; // separate multiplier for falling notes
  receptorSizeMultiplier?: number; // scale multiplier for receptors

  judgementOpacity?: number; // 0.0 to 1.0 (opacity for judgement text)
  judgementSize?: number; // 0.5 to 1.5 (font size scaling multiplier)
  judgementPositionY?: number; // vertical screen position in percent
  laneSeparatorOpacity?: number; // 0.0 to 1.0 (opacity for lane divider lines)
  playfieldWidthPercent?: number; // width of lanes as percent of screen width (33 to 50)
  selectedMods?: string[]; // list of active gameplay modifiers (e.g., 'NF', 'HD', 'HR', 'DT')
  bindPause?: string; // gameplay pause/resume keybind
  bindRetry?: string; // gameplay quick retry keybind
  bindSkipIntro?: string; // gameplay skip-intro keybind
  compensateOutputLatency?: boolean; // subtract measured baseLatency+outputLatency from the judgement clock
  enableMapSV?: boolean;
  enableSongPreview?: boolean; // play an audio preview of the selected map on Song Select
  showFpsCounter?: boolean; // render a small performance readout (FPS, frame time, input latency) on every screen
  uncappedMenuMotion?: boolean; // render the menu background at full display rate instead of the ~30fps eco throttle
  showPenarDuringPlay?: boolean; // display PENAR slot below accuracy during gameplay
  localDisplayName?: string; // optional device-local player name; not an account
  menuCursorEnabled?: boolean; // lazer-style menu arrow cursor overlay
  difficultyAdjust?: DifficultyAdjustSettings; // Difficulty Adjust (DA) mod overrides
}

export type GameScreen = 'menu' | 'select' | 'play' | 'results' | 'settings' | 'skins' | 'calibrate' | 'history';
