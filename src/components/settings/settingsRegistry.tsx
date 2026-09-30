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

import type { ReactNode } from 'react';
import {
  Gamepad2,
  Keyboard,
  Monitor,
  Paintbrush,
  SlidersHorizontal,
  Volume2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { GameSettings } from '../../types';
import {
  DEFAULT_SETTINGS,
  PLAYFIELD_WIDTH_MAX,
  PLAYFIELD_WIDTH_MIN,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
} from './defaultSettings';
import { computeScrollTravelTimeMs } from '../../render/playfieldLayout';
import BindingMatrix from './BindingMatrix';
import LaneColorEditor from './LaneColorEditor';
import SkinPicker from './SkinPicker';

export type SectionId =
  | 'general' | 'gameplay' | 'visual' | 'audio' | 'input' | 'skins' | 'miscellaneous';

export interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  showWhen?: (s: GameSettings) => boolean;
}

export const SECTIONS: SectionDef[] = [
  { id: 'general',       label: 'General',       description: 'Account-agnostic preferences for the client.', icon: SlidersHorizontal },
  { id: 'gameplay',      label: 'Gameplay',      description: 'Scroll speed, scroll direction, and timing.',      icon: Gamepad2 },
  { id: 'visual',        label: 'Visual',        description: 'Display, video, and pixel ratio.',        icon: Monitor },
  { id: 'audio',         label: 'Audio',         description: 'Volumes and the universal audio offset.',          icon: Volume2 },
  { id: 'input',         label: 'Input',         description: 'Keyboard bindings per key count.',                 icon: Keyboard },
  { id: 'skins',         label: 'Skins',         description: 'Skin selection, judgement text, lane separators, and lane colours.', icon: Paintbrush },
  { id: 'miscellaneous', label: 'Miscellaneous', description: 'Reset to defaults and other global actions.',      icon: Wrench },
];

export interface SubgroupDef {
  id: string;
  label: string;
  description: string;
}

export const SUBGROUPS: Record<string, SubgroupDef> = {
  Dim: { id: 'Dim', label: 'Dim', description: 'Control how dimmed each background is.' },
};

export type Control =
  | { kind: 'slider';    min: number; max: number; step: number; suffix?: string; format?: (v: number) => string; percent?: boolean }
  | { kind: 'toggle' }
  | { kind: 'text';      maxLength?: number; placeholder?: string }
  | { kind: 'select';    options: { value: string; label: string }[] }
  | { kind: 'button';    label: string; action: 'openWizard' | 'restoreAll' }
  | { kind: 'color-grid';keys: { index: number; label: string; desc: string }[] }
  | { kind: 'custom';    render: (api: RowApi) => ReactNode };

export interface RowApi {
  settings: GameSettings;
  update: (patch: Partial<GameSettings>) => void;
  resetRow: (id: string) => void;
  isChanged: boolean;
  openWizard: () => void;
}

export interface RowDef {
  id: string;
  section: SectionId;
  subgroup?: string;              // optional subsection header within a section
  label: string;
  description: string;
  control: Control;
  defaultValue: unknown;
  keywords?: string[];            // extra terms matched by search
  showWhen?: (s: GameSettings) => boolean;
}

const pct  = (v: number) => `${Math.round(v * 100)}%`;
const num  = (v: number, s?: string) => `${v}${s ?? ''}`;
const ms   = (v: number) => `${v}ms`;

/** True when a non-argon (legacy/custom bar) skin is selected. Argon enforces its canonical palette. */
const isNonArgonSkinSelected = (s: GameSettings): boolean => {
  if (!s.skinId || s.skinId === 'argon') return false;
  return s.squareRenderStyle === 'rhythmplus' || s.squareRenderStyle === 'rhythmplus-dynamic';
};

export const ROWS: RowDef[] = [
  // ── GENERAL ───────────────────────────────────────────────────────────
  {
    id: 'localDisplayName', section: 'general', label: 'Display name',
    description: 'Optional name stored on this device and written onto new local play-history rows. This is not an account.',
    control: { kind: 'text', maxLength: 32, placeholder: 'Player' },
    defaultValue: DEFAULT_SETTINGS.localDisplayName,
    keywords: ['name', 'player', 'display', 'local', 'guest'],
  },
  {
    id: 'menuCursorEnabled', section: 'general', label: 'Lazer menu cursor',
    description: 'Replace the system pointer with the lazer-style arrow cursor.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.menuCursorEnabled,
    keywords: ['cursor', 'lazer', 'pointer', 'mouse', 'arrow'],
  },
  {
    id: 'enableSongPreview', section: 'general', label: 'Song preview audio',
    description: 'Play a preview of the song when selecting it on the Song Select screen.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.enableSongPreview,
    keywords: ['preview', 'song', 'select', 'music', 'listen'],
  },

  // ── VISUAL ────────────────────────────────────────────────────────────
  {
    id: 'playfieldWidthPercent', section: 'visual', label: 'Playfield width',
    description: 'How wide the lanes are, as a percentage of the screen width.',
    control: { kind: 'slider', min: PLAYFIELD_WIDTH_MIN, max: PLAYFIELD_WIDTH_MAX, step: 1, suffix: '%' },
    defaultValue: DEFAULT_SETTINGS.playfieldWidthPercent,
  },
  {
    id: 'backgroundDim', section: 'visual', subgroup: 'Dim', label: 'Gameplay Background Dim',
    description: 'How much to dim the background while playing.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.backgroundDim,
    keywords: ['gameplay', 'background', 'dim', 'play', 'shield', 'darken', 'opacity'],
  },
  {
    id: 'songSelectBackgroundDim', section: 'visual', subgroup: 'Dim', label: 'Song Select Background Dim',
    description: 'How much to dim the cover artwork picture on the Song Select screen.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.songSelectBackgroundDim,
    keywords: ['song', 'select', 'background', 'cover', 'artwork', 'picture', 'dim', 'darken', 'brightness', 'opacity'],
  },
  {
    id: 'disableVideo', section: 'visual', label: 'Disable background video',
    description: 'Enable or disable the beatmap background video entirely.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.disableVideo,
  },
  {
    id: 'videoOffset', section: 'visual', label: 'Video offset',
    description: 'Shift the video forward (+) or backward (-) in milliseconds.',
    control: { kind: 'slider', min: -500, max: 500, step: 10, format: ms },
    defaultValue: DEFAULT_SETTINGS.videoOffset,
    showWhen: (s) => !s.disableVideo,
  },
  {
    id: 'disableComboBurst', section: 'visual', label: 'Disable combo burst',
    description: 'Hide the combo milestone popup shown every 50 combo during gameplay.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.disableComboBurst,
    keywords: ['combo', 'burst', 'milestone', 'popup', '50', 'celebration'],
  },
  {
    id: 'showFpsCounter', section: 'visual', label: 'Show FPS counter',
    description: 'Display a small performance readout (FPS, frame time, input latency) in the corner on every screen.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.showFpsCounter,
    keywords: ['fps', 'frames', 'frame', 'time', 'latency', 'input', 'performance', 'counter'],
  },
  {
    id: 'uncappedMenuMotion', section: 'visual', label: 'Uncapped menu motion',
    description: 'Render the animated menu background at the full display rate instead of the ~30fps eco throttle. Uses more GPU.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.uncappedMenuMotion,
    keywords: ['menu', 'background', 'fps', 'frames', 'uncapped', 'throttle', 'motion', 'triangles', 'performance', 'gpu'],
  },
  {
    id: 'renderDpr', section: 'visual', label: 'Render resolution',
    description: 'Canvas pixel ratio. 1 is fastest, 1.5 is balanced, 2 is sharpest with the highest GPU cost.',
    control: { kind: 'select', options: [
      { value: '1', label: '1x (performance)' },
      { value: '1.5', label: '1.5x (balanced)' },
      { value: '2', label: '2x (sharp)' },
    ]},
    defaultValue: DEFAULT_SETTINGS.renderDpr,
    keywords: ['dpr', 'resolution', 'pixel', 'ratio', 'retina', 'performance', 'gpu', 'sharp'],
  },
  // ── GAMEPLAY ──────────────────────────────────────────────────────────
  {
    id: 'scrollSpeed', section: 'gameplay', label: 'Scroll speed',
    description: 'How fast notes travel down the lanes. Higher = faster. At speed 21, notes take ~575ms to reach the receptor.',
    control: {
      kind: 'slider',
      min: SCROLL_SPEED_MIN,
      max: SCROLL_SPEED_MAX,
      step: 1,
      format: (v: number) => `${v} (~${computeScrollTravelTimeMs(v)}ms)`,
    },
    defaultValue: DEFAULT_SETTINGS.scrollSpeed,
    keywords: ['scroll', 'speed', 'velocity', 'travel', 'ms'],
  },
  {
    id: 'lockScrollSpeedDuringPlay', section: 'gameplay', label: 'Lock scroll speed during play',
    description: 'Prevent changing scroll speed while playing a beatmap (matching osu!(lazer) behavior).',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.lockScrollSpeedDuringPlay,
    keywords: ['scroll', 'lock', 'speed', 'gameplay', 'mid-map'],
  },
  {
    id: 'showPenarDuringPlay', section: 'gameplay', label: 'Show PENAR during play',
    description: 'Display the PENAR (Performance Evaluation & Numerical Achievement Rating) counter below accuracy during gameplay.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.showPenarDuringPlay,
    keywords: ['penar', 'pp', 'counter', 'performance', 'rating'],
  },
  {
    id: 'upsurfaceNoteMode', section: 'gameplay', label: 'Scroll direction',
    description: 'If on, notes move up from below instead of falling from above.',
    control: { kind: 'select', options: [
      { value: 'false', label: 'Down (default)' },
      { value: 'true',  label: 'Up' },
    ]},
    defaultValue: DEFAULT_SETTINGS.upsurfaceNoteMode,
  },
  {
    id: 'visualOffset', section: 'gameplay', label: 'Visual offset',
    description: 'Shift visual notes forward (+) or backward (-) in milliseconds.',
    control: { kind: 'slider', min: -300, max: 300, step: 5, format: ms },
    defaultValue: DEFAULT_SETTINGS.visualOffset,
  },
  {
    id: 'enableMapSV', section: 'gameplay', label: 'Map scroll velocity (SV)',
    description: 'Apply beatmap SV/BPM scroll changes. Off = constant scroll speed.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.enableMapSV,
    keywords: ['sv', 'scroll', 'velocity', 'bpm', 'speed'],
  },

  // ── AUDIO ─────────────────────────────────────────────────────────────
  {
    id: 'musicVolume', section: 'audio', label: 'Music volume',
    description: 'Volume of the playing track before the master volume.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.musicVolume,
  },
  {
    id: 'previewVolume', section: 'audio', label: 'Song preview volume',
    description: 'Volume multiplier for Song Select previews. Default is 70% of music volume.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.previewVolume,
  },
  {
    id: 'launchMusicVolume', section: 'audio', label: 'Game Launch Music Volume',
    description: 'Volume multiplier for the song that plays on the game launch menu. Default is 10% of music volume.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.launchMusicVolume,
    keywords: ['launch', 'menu', 'startup', 'title', 'music'],
  },
  {
    id: 'masterVolume', section: 'audio', label: 'Master volume',
    description: 'Overall volume applied to music and hitsounds during gameplay.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.masterVolume,
  },
  {
    id: 'hitsoundVolume', section: 'audio', label: 'Hitsound volume',
    description: 'Volume of the system hitsounds on note hits.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.hitsoundVolume,
  },
  {
    id: 'audioOffset', section: 'audio', label: 'Universal audio offset',
    description: 'Milliseconds added to every beatmap. Use the wizard to find your value.',
    control: { kind: 'slider', min: -300, max: 300, step: 5, format: ms },
    defaultValue: DEFAULT_SETTINGS.audioOffset,
  },
  {
    id: 'compensateOutputLatency', section: 'audio', label: 'Compensate output latency',
    description: 'Subtract the measured device output latency (baseLatency + outputLatency) from the judgement clock. Keep off if you already baked it into your offset.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.compensateOutputLatency,
    keywords: ['latency', 'output', 'bluetooth', 'offset', 'calibration', 'audio'],
  },
  {
    id: 'offsetWizard', section: 'audio', label: 'Offset wizard',
    description: 'Tap along with a metronome to measure your audio latency.',
    control: { kind: 'button', label: 'Open wizard', action: 'openWizard' },
    defaultValue: null,
  },

  // ── INPUT ─────────────────────────────────────────────────────────────
  {
    id: 'bindings', section: 'input', label: '',
    description: '',
    control: { kind: 'custom', render: (api) => <BindingMatrix {...api} /> },
    defaultValue: DEFAULT_SETTINGS.bindings,
  },

  // ── SKINS ─────────────────────────────────────────────────────────────
  {
    id: 'skinId', section: 'skins', label: 'Skin',
    description: 'Argon default or a legacy RhythmPlus bar skin. Argon enforces canonical column colours per key count.',
    control: { kind: 'custom', render: (api) => <SkinPicker settings={api.settings} update={api.update} /> },
    defaultValue: DEFAULT_SETTINGS.skinId,
    keywords: ['skin', 'theme', 'argon', 'rhythmplus', 'legacy', 'classic', 'dynamic', 'appearance'],
  },
  {
    id: 'judgementOpacity', section: 'skins', label: 'Judgement text opacity',
    description: 'Set the visibility of PERFECT, GREAT, and other judgements.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.judgementOpacity,
    keywords: ['judgement', 'judgment', 'text', 'perfect', 'great', 'opacity', 'skin'],
  },
  {
    id: 'judgementSize', section: 'skins', label: 'Judgement text size',
    description: 'Scale judgement text from 10% to 100% of its full size (default 50%).',
    control: { kind: 'slider', min: 0.1, max: 1.0, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.judgementSize,
    keywords: ['judgement', 'judgment', 'text', 'size', 'scale', 'skin'],
  },
  {
    id: 'judgementPositionY', section: 'skins', label: 'Judgement text position',
    description: 'Vertical position as a percentage of the playfield height measured from the top — 20% sits near the top, 85% sits down by the receptors (default 50%, centre).',
    control: { kind: 'slider', min: 20, max: 85, step: 1, suffix: '%' },
    defaultValue: DEFAULT_SETTINGS.judgementPositionY,
    keywords: ['judgement', 'judgment', 'text', 'position', 'vertical', 'height', 'skin'],
  },
  {
    id: 'laneSeparatorOpacity', section: 'skins', label: 'Lane separator opacity',
    description: 'Set the visibility of lane divider lines.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct, percent: true },
    defaultValue: DEFAULT_SETTINGS.laneSeparatorOpacity,
    keywords: ['lane', 'separator', 'divider', 'line', 'opacity', 'skin'],
  },
  {
    id: 'receptorColorsByKeyCount', section: 'skins', label: 'Lane colours',
    description: 'Set each lane colour for every supported key count. Hidden while the Argon skin is selected (Argon uses its canonical palette).',
    control: { kind: 'custom', render: (api) => <LaneColorEditor settings={api.settings} update={api.update} /> },
    defaultValue: DEFAULT_SETTINGS.receptorColorsByKeyCount,
    keywords: ['lane', 'colour', 'color', 'receptor', 'column', 'palette', 'skin'],
    showWhen: isNonArgonSkinSelected,
  },

  // ── MISCELLANEOUS ─────────────────────────────────────────────────────
  {
    id: 'restoreDefaults', section: 'miscellaneous', label: 'Restore all defaults',
    description: 'Reset every setting on this page to its default value.',
    control: { kind: 'button', label: 'Restore', action: 'restoreAll' },
    defaultValue: null,
  },
];
