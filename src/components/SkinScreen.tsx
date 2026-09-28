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

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Info, Paintbrush, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import type { GameSettings } from '../types';
import { isAtDefault, DEFAULT_SETTINGS } from './settings/defaultSettings';
import SettingsSlider from './settings/controls/SettingsSlider';
import LaneColorEditor from './settings/LaneColorEditor';
import {
  ARGON_COLOUR_YELLOW,
  ARGON_COLOUR_ORANGE,
  ARGON_COLOUR_PINK,
  ARGON_COLOUR_PURPLE,
} from '../render/argonSkin';

export type SkinStyleId = 'argon' | 'rhythmplus' | 'rhythmplus-dynamic';

export interface SkinStyle {
  id: SkinStyleId;
  label: string;
  category: 'default' | 'legacy';
  badge: string;
  subtitle: string;
  description: string;
  previewImage?: string;
}

export const DEFAULT_SKIN: SkinStyle = {
  id: 'argon',
  label: 'Argon',
  category: 'default',
  badge: 'DEFAULT',
  subtitle: 'Argon (lazer-style) Reference',
  description: 'Argon default mania skin. Authentic note geometry, receptors, darkened hold tails, and canonical 1K–10K column palettes on WebGL2.',
};

export const LEGACY_SKINS: SkinStyle[] = [
  {
    id: 'rhythmplus',
    label: 'RhythmPlus Classic',
    category: 'legacy',
    badge: 'LEGACY',
    subtitle: 'Slim classic bars',
    description: 'Slim classic bars with a clean, compact playfield read.',
    previewImage: '/skin/rhythmplus-classic-style-rectangular.webp',
  },
  {
    id: 'rhythmplus-dynamic',
    label: 'RhythmPlus Dynamic',
    category: 'legacy',
    badge: 'LEGACY',
    subtitle: 'Tall dynamic blocks',
    description: 'Tall hold blocks and bright timing bars for a more active read.',
    previewImage: '/skin/rhythmplus-dynamic-style-rectangular.webp',
  },
];

export const ALL_SKINS: SkinStyle[] = [DEFAULT_SKIN, ...LEGACY_SKINS];

export const getSelectedStyle = (settings: GameSettings): SkinStyleId => {
  if (!settings.skinId || settings.skinId === 'argon') return 'argon';
  if (settings.squareRenderStyle === 'rhythmplus-dynamic') return 'rhythmplus-dynamic';
  if (settings.squareRenderStyle === 'rhythmplus') return 'rhythmplus';
  return 'argon';
};

export const styleSettings = (style: SkinStyleId): Partial<GameSettings> => ({
  skinId: style === 'argon' ? 'argon' : 'custom',
  squareRenderStyle: style === 'argon'
    ? undefined
    : style === 'rhythmplus-dynamic'
      ? 'rhythmplus-dynamic'
      : 'rhythmplus',
});

/**
 * High-fidelity vector preview of the Argon 4K playfield.
 * Renders authentic column colours, note geometry, darkened LN tail, receptor, and judgement.
 */
function ArgonPlayfieldPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#0e1017] via-[#090a10] to-[#05060a]">
      <svg
        viewBox="0 0 240 280"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full select-none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="argon-lane-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.015" />
            <stop offset="85%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="argon-purple-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ARGON_COLOUR_PURPLE} stopOpacity="0" />
            <stop offset="60%" stopColor={ARGON_COLOUR_PURPLE} stopOpacity="0.25" />
            <stop offset="100%" stopColor={ARGON_COLOUR_PURPLE} stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="argon-orange-hold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a2a00" stopOpacity="0.45" />
            <stop offset="85%" stopColor={ARGON_COLOUR_ORANGE} stopOpacity="0.4" />
            <stop offset="100%" stopColor={ARGON_COLOUR_ORANGE} stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="argon-head-lip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Playfield stage runway */}
        <rect x="10" y="8" width="220" height="264" rx="4" fill="url(#argon-lane-bg)" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />

        {/* 4 Lanes (54px each, x = 12, 67, 122, 177) */}
        {/* Lane separator lines */}
        <line x1="66" y1="8" x2="66" y2="272" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1" />
        <line x1="121" y1="8" x2="121" y2="272" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1" />
        <line x1="176" y1="8" x2="176" y2="272" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1" />

        {/* Lane 4 (Purple) press key lighting */}
        <rect x="177" y="210" width="52" height="52" fill="url(#argon-purple-glow)" />

        {/* Lane 0 (Yellow): Falling note at Y=100 */}
        <g>
          <rect x="14" y="96" width="50" height="17" rx="3.4" fill={ARGON_COLOUR_YELLOW} />
          <rect x="14" y="96" width="50" height="4" rx="2" fill="url(#argon-head-lip)" />
        </g>

        {/* Lane 1 (Orange): Hold note (LN) */}
        {/* Hold Body */}
        <rect x="71" y="44" width="46" height="120" rx="2" fill="url(#argon-orange-hold)" />
        <line x1="71" y1="44" x2="71" y2="164" stroke={ARGON_COLOUR_ORANGE} strokeOpacity="0.5" strokeWidth="1" />
        <line x1="117" y1="44" x2="117" y2="164" stroke={ARGON_COLOUR_ORANGE} strokeOpacity="0.5" strokeWidth="1" />

        {/* Hold Tail (darkened tail cap with orange edge) */}
        <rect x="69" y="40" width="50" height="12" rx="3.4" fill="#6e2500" stroke={ARGON_COLOUR_ORANGE} strokeWidth="1" />
        <rect x="71" y="41" width="46" height="2" rx="1" fill="#ffffff" fillOpacity="0.4" />

        {/* Hold Head at Y=160 */}
        <rect x="69" y="158" width="50" height="17" rx="3.4" fill={ARGON_COLOUR_ORANGE} />
        <rect x="69" y="158" width="50" height="4" rx="2" fill="url(#argon-head-lip)" />

        {/* Lane 2 (Pink): Falling note at Y=55 */}
        <g>
          <rect x="124" y="52" width="50" height="17" rx="3.4" fill={ARGON_COLOUR_PINK} />
          <rect x="124" y="52" width="50" height="4" rx="2" fill="url(#argon-head-lip)" />
        </g>

        {/* Lane 3 (Purple): Note hitting the receptor at Y=224 */}
        <g>
          <rect x="178" y="222" width="50" height="17" rx="3.4" fill={ARGON_COLOUR_PURPLE} />
          <rect x="178" y="222" width="50" height="4.5" rx="2" fill="url(#argon-head-lip)" />
        </g>

        {/* Receptors bar (Hit target) at Y=236 */}
        <rect x="14" y="235" width="50" height="4" rx="1.5" fill="#ffffff" fillOpacity="0.25" stroke={ARGON_COLOUR_YELLOW} strokeOpacity="0.4" strokeWidth="0.8" />
        <rect x="69" y="235" width="50" height="4" rx="1.5" fill="#ffffff" fillOpacity="0.25" stroke={ARGON_COLOUR_ORANGE} strokeOpacity="0.4" strokeWidth="0.8" />
        <rect x="124" y="235" width="50" height="4" rx="1.5" fill="#ffffff" fillOpacity="0.25" stroke={ARGON_COLOUR_PINK} strokeOpacity="0.4" strokeWidth="0.8" />
        {/* Lane 3 receptor illuminated on press */}
        <rect x="178" y="234" width="50" height="6" rx="2" fill="#ffffff" fillOpacity="0.9" filter="drop-shadow(0 0 4px #cb3cec)" />

        {/* Receptor guide baseline */}
        <line x1="10" y1="239" x2="230" y2="239" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1" />

        {/* Judgement display: PERFECT (Argon cyan glow) */}
        {!compact && (
          <g>
            <text
              x="120"
              y="200"
              textAnchor="middle"
              fontFamily="Orbitron, system-ui, sans-serif"
              fontSize="13"
              fontWeight="800"
              letterSpacing="2"
              fill="#48c6ff"
              filter="drop-shadow(0 0 5px rgba(72,198,255,0.6))"
            >
              PERFECT
            </text>
            <text
              x="120"
              y="27"
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              fontSize="8"
              fontWeight="600"
              letterSpacing="1"
              fill="#ffffff"
              fillOpacity="0.35"
            >
              4K ARGON
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function SkinPreview({ styleId, compact = false }: { styleId: SkinStyleId; compact?: boolean }) {
  const style = ALL_SKINS.find((candidate) => candidate.id === styleId) || DEFAULT_SKIN;

  if (style.id === 'argon' || !style.previewImage) {
    return (
      <div className={`relative overflow-hidden border border-white/[0.09] bg-[#0c0d15] shadow-[0_14px_35px_rgba(0,0,0,0.3)] ${compact ? 'h-16 rounded-md' : 'h-[min(34vh,210px)] min-h-[150px] rounded-lg'}`}>
        <ArgonPlayfieldPreview compact={compact} />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden border border-white/[0.09] bg-[#11141b] shadow-[0_14px_35px_rgba(0,0,0,0.28)] ${compact ? 'h-16 rounded-md' : 'h-[min(34vh,210px)] min-h-[150px] rounded-lg'}`}>
      <img
        src={style.previewImage}
        alt={`${style.label} preview`}
        draggable={false}
        className="block h-full w-full object-contain"
      />
    </div>
  );
}

function SkinSetting({
  id,
  label,
  description,
  settings,
  updateSettings,
  className,
  children,
}: {
  id: keyof GameSettings;
  label: string;
  description: string;
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const changed = !isAtDefault(id, settings[id], DEFAULT_SETTINGS);

  return (
    <div className={`rounded-lg border border-white/[0.08] bg-[#11121d]/85 p-3.5${className ? ` ${className}` : ''}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-slate-100">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
        </div>
        {changed && (
          <button
            type="button"
            onClick={() => {
              const value = DEFAULT_SETTINGS[id];
              updateSettings({ [id]: Array.isArray(value) ? [...value] : value } as Partial<GameSettings>);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
            title="Reset to default"
            aria-label={`Reset ${label} to default`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex min-h-8 items-center justify-end">{children}</div>
    </div>
  );
}

export interface SkinScreenProps {
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
  onBack?: () => void;
}

export default function SkinScreen({
  settings,
  updateSettings,
  onBack,
}: SkinScreenProps) {
  const selectedStyle = getSelectedStyle(settings);
  const selectedSkin = ALL_SKINS.find((skin) => skin.id === selectedStyle) || DEFAULT_SKIN;
  const isArgon = selectedStyle === 'argon';
  const isRhythmPlus = selectedStyle === 'rhythmplus' || selectedStyle === 'rhythmplus-dynamic';

  const [skinSettingsQuery, setSkinSettingsQuery] = useState('');
  const normalizedSettingsQuery = skinSettingsQuery.trim().toLowerCase();
  const matchesSkinSetting = (label: string, description: string) =>
    !normalizedSettingsQuery || `${label} ${description}`.toLowerCase().includes(normalizedSettingsQuery);

  const hasVisibleSkinSetting = matchesSkinSetting('Lane colors', 'Set each lane color for every supported key count.')
    || matchesSkinSetting('Note size', 'Scale falling notes up or down.')
    || (!isRhythmPlus && matchesSkinSetting('Receptor size', 'Scale receptors relative to each lane width.'))
    || matchesSkinSetting('Note opacity', 'Set the opacity of falling notes.')
    || matchesSkinSetting('Receptor opacity', 'Set the opacity of landline receptors.')
    || matchesSkinSetting('Judgement text opacity', 'Set the visibility of PERFECT, GREAT, and other judgements.')
    || matchesSkinSetting('Judgement text size', 'Scale judgement text up or down.')
    || matchesSkinSetting('Judgement text position', 'Move judgement text vertically on the playfield.')
    || matchesSkinSetting('Lane separator opacity', 'Set the visibility of lane divider lines.');

  // Handle ESC key to go back
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onBack) {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const applyStyle = (style: SkinStyleId) => updateSettings(styleSettings(style));
  const updateNumber = (id: keyof GameSettings) => (value: number) => updateSettings({ [id]: value } as Partial<GameSettings>);

  const resetSkinSettings = () => updateSettings({
    ...styleSettings('argon'),
    receptorColorsByKeyCount: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.receptorColorsByKeyCount)),
    noteSizeMultiplier: DEFAULT_SETTINGS.noteSizeMultiplier,
    receptorSizeMultiplier: DEFAULT_SETTINGS.receptorSizeMultiplier,
    noteOpacity: DEFAULT_SETTINGS.noteOpacity,
    receptorOpacity: DEFAULT_SETTINGS.receptorOpacity,
    judgementOpacity: DEFAULT_SETTINGS.judgementOpacity,
    judgementSize: DEFAULT_SETTINGS.judgementSize,
    judgementPositionY: DEFAULT_SETTINGS.judgementPositionY,
    laneSeparatorOpacity: DEFAULT_SETTINGS.laneSeparatorOpacity,
  });

  return (
    <section className="relative h-full min-h-0 overflow-hidden bg-transparent text-white" aria-labelledby="skin-screen-title">
      <div className="relative mx-auto grid h-full min-h-0 w-full max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] gap-4 px-4 pt-3 sm:px-6 sm:pt-4 pb-[max(1rem,calc(0.5rem+env(safe-area-inset-bottom,0px)))] lg:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)] lg:grid-rows-1 lg:gap-5">
        
        {/* Left Column: Skin Selection & Preview */}
        <div className="flex min-h-0 flex-col overflow-hidden">
          
          {/* Header Bar */}
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 text-xs font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  aria-label="Back to main menu"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Back</span>
                </button>
              )}
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/30 shrink-0">
                <Paintbrush className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 id="skin-screen-title" className="text-lg font-bold tracking-tight text-white sm:text-xl truncate">
                  Skins
                </h1>
              </div>
            </div>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50">
                Argon Default · 2 Legacy
              </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            
            {/* Active Skin Preview Card */}
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-white/70">
                <span className="font-bold uppercase tracking-wider text-[11px] text-white">Preview</span>
                <span className="text-[10px] text-white/40">({selectedSkin.badge})</span>
              </div>
              <div className="flex items-center gap-1.5 truncate">
                {isArgon ? (
                  <span className="inline-flex items-center gap-1 rounded bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                    <Sparkles className="h-3 w-3" /> Reference
                  </span>
                ) : (
                  <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                    Legacy Skin
                  </span>
                )}
                <span className="truncate font-medium text-white">{selectedSkin.label}</span>
              </div>
            </div>

            <SkinPreview styleId={selectedStyle} />

            {/* Skins List Container */}
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div className="space-y-3 pb-2">
                
                {/* 1. Default Skin Section */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                      Default Skin (Argon)
                    </span>
                    <span className="text-[10px] text-white/40">Recommended</span>
                  </div>

                  <button
                    type="button"
                    aria-pressed={selectedStyle === DEFAULT_SKIN.id}
                    onClick={() => applyStyle(DEFAULT_SKIN.id)}
                    className={`group w-full rounded-lg border text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 p-2.5 flex items-center gap-3 ${
                      selectedStyle === DEFAULT_SKIN.id
                        ? 'border-cyan-400/50 bg-cyan-950/30 text-white ring-1 ring-cyan-400/30'
                        : 'border-white/[0.08] bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#0c0d15]">
                      <ArgonPlayfieldPreview compact />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">{DEFAULT_SKIN.label}</span>
                        <span className="rounded bg-cyan-400/20 px-1.5 py-0.2 text-[9px] font-bold text-cyan-200 uppercase tracking-wider">
                          Default
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-white/60">
                        {DEFAULT_SKIN.description}
                      </p>
                    </div>
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {selectedStyle === DEFAULT_SKIN.id ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-md">
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-white/20 group-hover:border-white/40" />
                      )}
                    </div>
                  </button>
                </div>

                {/* 2. Legacy Skins Section */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                      Legacy Skins
                    </span>
                    <span className="text-[10px] text-white/35">{LEGACY_SKINS.length} skins</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {LEGACY_SKINS.map((skin) => {
                      const isSelected = skin.id === selectedStyle;
                      return (
                        <button
                          key={skin.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => applyStyle(skin.id)}
                          className={`group min-w-0 rounded-lg border text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 p-1.5 ${
                            isSelected
                              ? 'border-white/40 bg-white/[0.1] text-white'
                              : 'border-white/[0.06] bg-white/[0.02] text-white/60 hover:border-white/15 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <div className="relative rounded-md overflow-hidden bg-black/40">
                            <SkinPreview styleId={skin.id} compact />
                            {isSelected && (
                              <span
                                className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-slate-950 shadow"
                                aria-label="Selected"
                              >
                                <Check className="h-3 w-3" strokeWidth={3} />
                              </span>
                            )}
                            <span className="absolute left-1.5 bottom-1.5 rounded bg-black/70 px-1 py-0.2 text-[8px] font-bold uppercase tracking-wider text-white/60">
                              Legacy
                            </span>
                          </div>
                          <span className="mt-1.5 block line-clamp-1 px-0.5 text-center text-[10px] font-medium leading-4 sm:text-[11px]">
                            {skin.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Skin Settings */}
        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1 pb-[max(1.5rem,calc(1rem+env(safe-area-inset-bottom,0px)))]">
          <div className="rounded-xl border border-white/[0.08] bg-[#0c0d16]/85 p-3.5 sm:p-4 shadow-xl">
            
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Skin Settings</h2>
                <p className="mt-1 text-xs text-white/45">Tune visual dimensions and appearance for gameplay.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" aria-hidden="true" />
                  <label htmlFor="skin-settings-search" className="sr-only">Search skin settings</label>
                  <input
                    id="skin-settings-search"
                    type="search"
                    value={skinSettingsQuery}
                    onChange={(event) => setSkinSettingsQuery(event.target.value)}
                    placeholder="Search settings..."
                    className="h-8 w-full rounded-md border border-white/[0.1] bg-black/35 pl-8 pr-8 text-xs text-white outline-none transition placeholder:text-white/30 focus:border-cyan-200/60 focus:ring-1 focus:ring-cyan-200/20"
                  />
                  {skinSettingsQuery && (
                    <button
                      type="button"
                      onClick={() => setSkinSettingsQuery('')}
                      className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                      aria-label="Clear skin settings search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={resetSkinSettings}
                  className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-bold text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            {/* Argon Notice Banner */}
            {isArgon && (
              <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-cyan-400/20 bg-cyan-950/20 p-2.5 text-xs text-cyan-200/90">
                <Info className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  <strong>Argon column palette:</strong> Argon enforces canonical column colors for each key count (4K: Yellow, Orange, Pink, Purple). Custom lane color overrides apply when a legacy skin is selected.
                </p>
              </div>
            )}

            <div className="grid gap-2.5 lg:grid-cols-2">
              {matchesSkinSetting('Lane colors', 'Set each lane color for every supported key count.') && (
                <SkinSetting
                  id="receptorColorsByKeyCount"
                  label="Lane colors"
                  description={isArgon ? "Custom colors for legacy skins (Argon uses its canonical palette)." : "Set each lane color for every supported key count."}
                  settings={settings}
                  updateSettings={updateSettings}
                  className="lg:col-span-2"
                >
                  <LaneColorEditor settings={settings} update={updateSettings} />
                </SkinSetting>
              )}

              {matchesSkinSetting('Note size', 'Scale falling notes up or down.') && (
                <SkinSetting id="noteSizeMultiplier" label="Note size" description="Scale falling notes up or down." settings={settings} updateSettings={updateSettings}>
                  <SettingsSlider id="skin-note-size" value={Number(settings.noteSizeMultiplier ?? 1)} min={0.60} max={1.00} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('noteSizeMultiplier')} />
                </SkinSetting>
              )}

              {!isRhythmPlus && matchesSkinSetting('Receptor size', 'Scale receptors relative to each lane width.') && (
                <SkinSetting id="receptorSizeMultiplier" label="Receptor size" description="Scale receptors relative to each lane width." settings={settings} updateSettings={updateSettings}>
                  <SettingsSlider id="skin-receptor-size" value={Number(settings.receptorSizeMultiplier ?? 1)} min={0.60} max={1.00} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('receptorSizeMultiplier')} />
                </SkinSetting>
              )}

              {matchesSkinSetting('Note opacity', 'Set the opacity of falling notes.') && (
                <SkinSetting id="noteOpacity" label="Note opacity" description="Set the opacity of falling notes." settings={settings} updateSettings={updateSettings}>
                  <SettingsSlider id="skin-note-opacity" value={Number(settings.noteOpacity ?? 1)} min={0.1} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('noteOpacity')} />
                </SkinSetting>
              )}

              {matchesSkinSetting('Receptor opacity', 'Set the opacity of landline receptors.') && (
                <SkinSetting id="receptorOpacity" label="Receptor opacity" description="Set the opacity of landline receptors." settings={settings} updateSettings={updateSettings}>
                  <SettingsSlider id="skin-receptor-opacity" value={Number(settings.receptorOpacity ?? 1)} min={0.1} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('receptorOpacity')} />
                </SkinSetting>
              )}

              {matchesSkinSetting('Judgement text opacity', 'Set the visibility of PERFECT, GREAT, and other judgements.') && (
                <SkinSetting id="judgementOpacity" label="Judgement text opacity" description="Set the visibility of PERFECT, GREAT, and other judgements." settings={settings} updateSettings={updateSettings}>
                  <SettingsSlider id="skin-judgement-opacity" value={Number(settings.judgementOpacity ?? 1)} min={0} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('judgementOpacity')} />
                </SkinSetting>
              )}

              {matchesSkinSetting('Judgement text size', 'Scale judgement text up or down.') && (
                <SkinSetting id="judgementSize" label="Judgement text size" description="Scale judgement text up or down." settings={settings} updateSettings={updateSettings}>
                  <SettingsSlider id="skin-judgement-size" value={Number(settings.judgementSize ?? 1)} min={0.5} max={1.5} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('judgementSize')} />
                </SkinSetting>
              )}

              {matchesSkinSetting('Judgement text position', 'Move judgement text vertically on the playfield.') && (
                <SkinSetting id="judgementPositionY" label="Judgement text position" description="Move judgement text vertically on the playfield." settings={settings} updateSettings={updateSettings}>
                  <SettingsSlider id="skin-judgement-position" value={Number(settings.judgementPositionY ?? 50)} min={20} max={85} step={1} suffix="%" onChange={updateNumber('judgementPositionY')} />
                </SkinSetting>
              )}

              {matchesSkinSetting('Lane separator opacity', 'Set the visibility of lane divider lines.') && (
                <SkinSetting id="laneSeparatorOpacity" label="Lane separator opacity" description="Set the visibility of lane divider lines." settings={settings} updateSettings={updateSettings}>
                  <SettingsSlider id="skin-lane-opacity" value={Number(settings.laneSeparatorOpacity ?? 0.3)} min={0} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('laneSeparatorOpacity')} />
                </SkinSetting>
              )}
            </div>

            {normalizedSettingsQuery && !hasVisibleSkinSetting && (
              <div className="mt-3 rounded-lg border border-dashed border-white/[0.12] bg-black/20 px-4 py-6 text-center text-xs text-white/50">
                No skin settings match &ldquo;{skinSettingsQuery}&rdquo;.
              </div>
            )}
          </div>
        </div>

      </div>
    </section>
  );
}
