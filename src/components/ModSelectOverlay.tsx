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

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, RotateCcw, Sparkles, Sliders,
  Infinity as InfinityIcon, Rewind, FastForward, ArrowUpToLine,
  Skull, Award, Target, SquareSlash, Eye, Layers, Flashlight,
  Zap, FlipHorizontal, Shuffle, Gauge, ArrowUpDown, Ban,
  Clock, TrendingUp, TrendingDown, Activity, VolumeX, Film,
  Keyboard, MousePointerClick, AlertTriangle
} from 'lucide-react';
import { GameSettings } from '../types';
import { computeModMultiplier } from '../ruleset/mania/scoreProcessor';
import { sanitizeGameplayMods } from '../utils/modifiers';

export type ModCategory = 'reduction' | 'increase' | 'automation' | 'conversion' | 'fun';

export interface ModItem {
  id: string;
  name: string;
  acronym: string;
  title: string;
  category: ModCategory;
  multiplier: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  exclusiveWith?: readonly string[];
}

export const MOD_CATEGORIES: { id: ModCategory; name: string; description: string; color: string; bgClass: string; textClass: string; borderClass: string; glowColor: string }[] = [
  {
    id: 'reduction',
    name: 'Difficulty Reduction',
    description: 'Make the map easier or more forgiving.',
    color: '#10b981',
    bgClass: 'bg-emerald-500/15',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/40',
    glowColor: 'rgba(16, 185, 129, 0.35)',
  },
  {
    id: 'increase',
    name: 'Difficulty Increase',
    description: 'Add challenge and push your limits.',
    color: '#f43f5e',
    bgClass: 'bg-rose-500/15',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/40',
    glowColor: 'rgba(244, 63, 94, 0.35)',
  },
  {
    id: 'automation',
    name: 'Automation',
    description: 'Sit back and enjoy the show.',
    color: '#0ea5e9',
    bgClass: 'bg-sky-500/15',
    textClass: 'text-sky-400',
    borderClass: 'border-sky-500/40',
    glowColor: 'rgba(14, 165, 233, 0.35)',
  },
  {
    id: 'conversion',
    name: 'Conversion',
    description: 'Transform gameplay mechanics and key counts.',
    color: '#a855f7',
    bgClass: 'bg-purple-500/15',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/40',
    glowColor: 'rgba(168, 85, 247, 0.35)',
  },
  {
    id: 'fun',
    name: 'Fun',
    description: 'Quirky experiments and dynamic speeds.',
    color: '#f59e0b',
    bgClass: 'bg-amber-500/15',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/40',
    glowColor: 'rgba(245, 158, 11, 0.35)',
  },
];

export const ALL_MODS: ModItem[] = [
  // Difficulty Reduction
  {
    id: 'NF',
    name: 'No Fail',
    acronym: 'NF',
    title: 'No Fail (NF)',
    category: 'reduction',
    multiplier: '0.50x',
    icon: InfinityIcon,
    description: "You can't fail, no matter what.",
    exclusiveWith: ['SD', 'PF', 'AC'],
  },
  {
    id: 'EZ',
    name: 'Easy',
    acronym: 'EZ',
    title: 'Easy (EZ)',
    category: 'reduction',
    multiplier: '0.50x',
    icon: Sparkles,
    description: 'Larger hit windows, more forgiving health recovery.',
    exclusiveWith: ['HR', 'SD', 'PF', 'AC', 'DA'],
  },
  {
    id: 'HT',
    name: 'Half Time',
    acronym: 'HT',
    title: 'Half Time (HT)',
    category: 'reduction',
    multiplier: '0.50x',
    icon: Rewind,
    description: 'Slows down song playback to 0.75x speed.',
    exclusiveWith: ['DT', 'NC', 'WU', 'WD', 'AS'],
  },
  {
    id: 'NR',
    name: 'No Release',
    acronym: 'NR',
    title: 'No Release (NR)',
    category: 'reduction',
    multiplier: '0.90x',
    icon: MousePointerClick,
    description: 'Hold notes do not require timed release.',
    exclusiveWith: ['HO'],
  },

  // Difficulty Increase
  {
    id: 'HR',
    name: 'Hard Rock',
    acronym: 'HR',
    title: 'Hard Rock (HR)',
    category: 'increase',
    multiplier: '1.00x',
    icon: ArrowUpToLine,
    description: 'Tighter hit windows and harsher health requirements.',
    exclusiveWith: ['EZ', 'DA'],
  },
  {
    id: 'SD',
    name: 'Sudden Death',
    acronym: 'SD',
    title: 'Sudden Death (SD)',
    category: 'increase',
    multiplier: '1.00x',
    icon: Skull,
    description: 'Miss a note and you fail immediately.',
    exclusiveWith: ['NF', 'PF', 'AC', 'EZ'],
  },
  {
    id: 'PF',
    name: 'Perfect',
    acronym: 'PF',
    title: 'Perfect (PF)',
    category: 'increase',
    multiplier: '1.00x',
    icon: Award,
    description: 'Score below Great and you fail immediately.',
    exclusiveWith: ['NF', 'SD', 'AC', 'EZ'],
  },
  {
    id: 'AC',
    name: 'Accuracy Challenge',
    acronym: 'AC',
    title: 'Accuracy Challenge (AC)',
    category: 'increase',
    multiplier: '1.00x',
    icon: Target,
    description: 'Fail if your accuracy drops below threshold.',
    exclusiveWith: ['NF', 'SD', 'PF', 'EZ'],
  },
  {
    id: 'HD',
    name: 'Hidden',
    acronym: 'HD',
    title: 'Hidden (HD)',
    category: 'increase',
    multiplier: '1.00x',
    icon: SquareSlash,
    description: 'Notes fade out before reaching the receptor.',
    exclusiveWith: ['FI', 'Cover', 'CO', 'FL'],
  },
  {
    id: 'FI',
    name: 'Fade In',
    acronym: 'FI',
    title: 'Fade In (FI)',
    category: 'increase',
    multiplier: '1.00x',
    icon: Eye,
    description: 'Notes appear out of nowhere as they approach receptor.',
    exclusiveWith: ['HD', 'Cover', 'CO', 'FL'],
  },
  {
    id: 'Cover',
    name: 'Cover',
    acronym: 'CO',
    title: 'Cover (CO)',
    category: 'increase',
    multiplier: '1.00x',
    icon: Layers,
    description: 'Cover part of the visible playfield runway.',
    exclusiveWith: ['HD', 'FI', 'FL'],
  },
  {
    id: 'FL',
    name: 'Flashlight',
    acronym: 'FL',
    title: 'Flashlight (FL)',
    category: 'increase',
    multiplier: '1.00x',
    icon: Flashlight,
    description: 'Restricted illuminated view near the judgement line.',
    exclusiveWith: ['HD', 'FI', 'Cover', 'CO'],
  },
  {
    id: 'DT',
    name: 'Double Time',
    acronym: 'DT',
    title: 'Double Time (DT)',
    category: 'increase',
    multiplier: '1.00x',
    icon: FastForward,
    description: 'Speeds up song playback to 1.50x speed.',
    exclusiveWith: ['HT', 'NC', 'WU', 'WD', 'AS'],
  },
  {
    id: 'NC',
    name: 'Nightcore',
    acronym: 'NC',
    title: 'Nightcore (NC)',
    category: 'increase',
    multiplier: '1.00x',
    icon: Zap,
    description: 'Double Time speed with high-pitched audio.',
    exclusiveWith: ['HT', 'DT', 'WU', 'WD', 'AS'],
  },

  // Automation
  {
    id: 'AT',
    name: 'Autoplay',
    acronym: 'AP',
    title: 'Autoplay (AP)',
    category: 'automation',
    multiplier: 'UNRANKED',
    icon: Sparkles,
    description: 'Watch a deterministic perfect bot playthrough.',
    exclusiveWith: ['CN'],
  },
  {
    id: 'CN',
    name: 'Cinema',
    acronym: 'CN',
    title: 'Cinema (CN)',
    category: 'automation',
    multiplier: 'UNRANKED',
    icon: Film,
    description: 'Relax and watch the background video.',
    exclusiveWith: ['AT'],
  },

  // Conversion
  {
    id: 'MR',
    name: 'Mirror',
    acronym: 'MR',
    title: 'Mirror (MR)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: FlipHorizontal,
    description: 'Reverses the playfield column order horizontally.',
    exclusiveWith: ['RD'],
  },
  {
    id: 'RD',
    name: 'Random',
    acronym: 'RD',
    title: 'Random (RD)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: Shuffle,
    description: 'Deterministically shuffles columns.',
    exclusiveWith: ['MR'],
  },
  {
    id: 'CS',
    name: 'Constant Speed',
    acronym: 'CS',
    title: 'Constant Speed (CS)',
    category: 'conversion',
    multiplier: '0.80x',
    icon: Gauge,
    description: 'Disables all scroll velocity (SV) variations.',
  },
  {
    id: 'IN',
    name: 'Invert',
    acronym: 'IN',
    title: 'Invert (IN)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: ArrowUpDown,
    description: 'Turns rice notes into holds, and holds into rice notes.',
    exclusiveWith: ['HO'],
  },
  {
    id: 'HO',
    name: 'Hold Off',
    acronym: 'HO',
    title: 'Hold Off (HO)',
    category: 'conversion',
    multiplier: '0.90x',
    icon: Ban,
    description: 'Converts all hold notes to regular rice notes.',
    exclusiveWith: ['IN', 'NR'],
  },
  {
    id: 'CL',
    name: 'Classic',
    acronym: 'CL',
    title: 'Classic (CL)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: Clock,
    description: 'Restores legacy stable mania hit windows.',
  },
  {
    id: 'DA',
    name: 'Difficulty Adjust',
    acronym: 'DA',
    title: 'Difficulty Adjust (DA)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: Sliders,
    description: 'Customize Overall Difficulty and HP Drain Rate.',
    exclusiveWith: ['EZ', 'HR'],
  },

  // Fun
  {
    id: 'WU',
    name: 'Wind Up',
    acronym: 'WU',
    title: 'Wind Up (WU)',
    category: 'fun',
    multiplier: '1.00x',
    icon: TrendingUp,
    description: 'Song speed gradually accelerates as the map progresses.',
    exclusiveWith: ['HT', 'DT', 'NC', 'WD', 'AS'],
  },
  {
    id: 'WD',
    name: 'Wind Down',
    acronym: 'WD',
    title: 'Wind Down (WD)',
    category: 'fun',
    multiplier: '1.00x',
    icon: TrendingDown,
    description: 'Song speed gradually decelerates as the map progresses.',
    exclusiveWith: ['HT', 'DT', 'NC', 'WU', 'AS'],
  },
  {
    id: 'AS',
    name: 'Adaptive Speed',
    acronym: 'AS',
    title: 'Adaptive Speed (AS)',
    category: 'fun',
    multiplier: '1.00x',
    icon: Activity,
    description: 'Playback speed adapts dynamically to your performance.',
    exclusiveWith: ['HT', 'DT', 'NC', 'WU', 'WD'],
  },
  {
    id: 'MU',
    name: 'Muted',
    acronym: 'MU',
    title: 'Muted (MU)',
    category: 'fun',
    multiplier: '1.00x',
    icon: VolumeX,
    description: 'Mutes audio track when accuracy falls below target.',
  },
];

/**
 * Returns a list of active mod IDs that conflict with the given modId.
 */
export function getConflictingMods(modId: string, activeMods: string[]): string[] {
  if (activeMods.includes(modId)) return [];

  const conflicts = new Set<string>();

  // Direct exclusiveWith declared on this mod
  const modDef = ALL_MODS.find(m => m.id === modId);
  if (modDef?.exclusiveWith) {
    for (const ex of modDef.exclusiveWith) {
      if (activeMods.includes(ex)) {
        conflicts.add(ex);
      }
    }
  }

  // Active mods that declare modId as exclusive
  for (const active of activeMods) {
    const activeDef = ALL_MODS.find(m => m.id === active);
    if (activeDef?.exclusiveWith?.includes(modId)) {
      conflicts.add(active);
    }
  }

  // Key conversion mods are mutually exclusive
  if (/^K(?:[1-9]|10)$/.test(modId)) {
    for (const active of activeMods) {
      if (/^K(?:[1-9]|10)$/.test(active) && active !== modId) {
        conflicts.add(active);
      }
    }
  }

  return Array.from(conflicts);
}

interface HexModButtonProps {
  id: string;
  acronym: string;
  name: string;
  multiplier: string;
  categoryColor: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  conflictingMods: string[];
  isDisabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}

/**
 * Argon-style hexagonal mod button.
 * Uses a crisp regular hexagon shape with layered highlights, acronym, and multiplier.
 */
export const HexModButton: React.FC<HexModButtonProps> = ({
  acronym,
  name,
  multiplier,
  categoryColor,
  icon: Icon,
  isActive,
  conflictingMods,
  isDisabled = false,
  disabledReason,
  onClick,
}) => {
  const isConflicting = conflictingMods.length > 0;

  // Tooltip content
  const tooltip = isDisabled
    ? disabledReason
    : isConflicting
    ? `Incompatible with ${conflictingMods.join(', ')} (click to swap)`
    : `${name} (${acronym}) - ${multiplier}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={isActive}
      className={`group relative flex flex-col items-center gap-1.5 p-1 rounded-xl transition-all select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
        isDisabled
          ? 'cursor-not-allowed opacity-35'
          : isConflicting
          ? 'opacity-40 hover:opacity-85'
          : 'hover:scale-105 active:scale-95'
      }`}
    >
      {/* Hexagon Shape Container */}
      <div className="relative w-[76px] h-[88px] sm:w-[84px] sm:h-[96px] flex items-center justify-center">
        {/* SVG Regular Hexagon (pointy top/bottom) */}
        <svg
          viewBox="0 0 100 115"
          className="absolute inset-0 w-full h-full overflow-visible transition-all duration-200"
          style={{
            filter: isActive ? `drop-shadow(0 0 14px ${categoryColor})` : undefined,
          }}
        >
          {/* Base Hexagon Background */}
          <polygon
            points="50 3, 97 29, 97 86, 50 112, 3 86, 3 29"
            fill={isActive ? categoryColor : '#16171d'}
            fillOpacity={isActive ? 0.28 : 0.85}
            stroke={isActive ? categoryColor : isConflicting ? 'rgba(239, 68, 68, 0.45)' : 'rgba(255, 255, 255, 0.14)'}
            strokeWidth={isActive ? 3.5 : isConflicting ? 2 : 1.75}
            strokeLinejoin="round"
            className="transition-all duration-200 group-hover:stroke-white/35"
          />

          {/* Inner Accent Inset Line when active */}
          {isActive && (
            <polygon
              points="50 9, 91 32, 91 83, 50 106, 9 83, 9 32"
              fill="none"
              stroke={categoryColor}
              strokeWidth={1}
              strokeOpacity={0.6}
            />
          )}
        </svg>

        {/* Inner Content on top of Hexagon */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-2 pointer-events-none">
          {/* Multiplier Tag */}
          <span
            className={`text-[9px] sm:text-[10px] font-mono font-black tracking-tight leading-none mb-1 transition-colors ${
              isActive ? 'text-white' : 'text-white/55 group-hover:text-white/80'
            }`}
          >
            {multiplier}
          </span>

          {/* Mod Icon & Acronym */}
          <div className="flex items-center justify-center gap-1">
            <Icon
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] transition-colors ${
                isActive ? 'text-white' : 'text-white/70 group-hover:text-white'
              }`}
            />
            <span
              className={`text-sm sm:text-base font-black tracking-wider leading-none transition-colors ${
                isActive ? 'text-white' : 'text-white/85 group-hover:text-white'
              }`}
            >
              {acronym}
            </span>
          </div>

          {/* Active status indicator dot */}
          {isActive && (
            <div
              className="mt-1 w-1.5 h-1.5 rounded-full shadow-[0_0_6px_currentColor]"
              style={{ backgroundColor: categoryColor, color: categoryColor }}
            />
          )}

          {/* Conflict warning badge */}
          {isConflicting && !isActive && (
            <div className="absolute -top-1.5 -right-1.5 bg-rose-500/90 text-white rounded-full p-0.5 shadow-md">
              <AlertTriangle className="w-2.5 h-2.5" />
            </div>
          )}
        </div>
      </div>

      {/* Mod Label Below */}
      <span
        className={`max-w-[88px] text-[10px] sm:text-[11px] font-semibold text-center truncate leading-tight transition-colors ${
          isActive ? 'text-white font-bold' : 'text-white/60 group-hover:text-white/90'
        }`}
      >
        {name}
      </span>
    </button>
  );
};

export interface ModSelectOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMods: string[];
  onUpdateMods: (mods: string[]) => void;
  availableKeyCounts?: number[];
  difficultyAdjust?: GameSettings['difficultyAdjust'];
  onUpdateDifficultyAdjust?: (da: NonNullable<GameSettings['difficultyAdjust']>) => void;
  defaultOd?: number;
  defaultHp?: number;
}

export const ModSelectOverlay: React.FC<ModSelectOverlayProps> = ({
  isOpen,
  onClose,
  selectedMods,
  onUpdateMods,
  availableKeyCounts = [4],
  difficultyAdjust,
  onUpdateDifficultyAdjust,
  defaultOd = 8,
  defaultHp = 5,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<ModCategory | 'all'>('all');

  // Compute live score multiplier
  const currentMultiplier = useMemo(() => {
    return computeModMultiplier(selectedMods);
  }, [selectedMods]);

  const isUnranked = useMemo(() => {
    return selectedMods.includes('AT') || selectedMods.includes('CN');
  }, [selectedMods]);

  // Handle clicking a regular mod
  const handleToggleMod = (mod: ModItem) => {
    if (selectedMods.includes(mod.id)) {
      // Remove mod
      const nextMods = selectedMods.filter(m => m !== mod.id);
      onUpdateMods(sanitizeGameplayMods(nextMods));
    } else {
      // Add mod, removing any conflicting mods
      const conflicts = getConflictingMods(mod.id, selectedMods);
      const nextMods = selectedMods.filter(m => !conflicts.includes(m));
      nextMods.push(mod.id);
      onUpdateMods(sanitizeGameplayMods(nextMods));
    }
  };

  // Handle key conversion toggle
  const handleToggleKeyMod = (keyCount: number) => {
    const id = `K${keyCount}`;
    if (selectedMods.includes(id)) {
      const nextMods = selectedMods.filter(m => m !== id);
      onUpdateMods(sanitizeGameplayMods(nextMods));
    } else {
      // Remove other K-mods
      const nextMods = selectedMods.filter(m => !/^K(?:[1-9]|10)$/.test(m));
      nextMods.push(id);
      onUpdateMods(sanitizeGameplayMods(nextMods));
    }
  };

  // Filter mods by query
  const filteredMods = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return ALL_MODS.filter(mod => {
      if (selectedCategoryTab !== 'all' && mod.category !== selectedCategoryTab) {
        return false;
      }
      if (!query) return true;
      return (
        mod.name.toLowerCase().includes(query) ||
        mod.acronym.toLowerCase().includes(query) ||
        mod.description.toLowerCase().includes(query) ||
        mod.id.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, selectedCategoryTab]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="mod-select-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md cursor-pointer"
          />

          {/* Modal Container */}
          <motion.div
            key="mod-select-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            className="fixed inset-2 sm:inset-5 md:inset-8 lg:inset-[5vh_auto] lg:left-1/2 lg:-translate-x-1/2 z-[110] w-auto lg:w-[min(1180px,calc(100vw-48px))] max-h-[calc(100vh-16px)] md:max-h-[90vh] bg-[#14151b]/95 border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.85)] flex flex-col rounded-2xl overflow-hidden font-sans text-slate-100"
            style={{ willChange: 'opacity' }}
          >
            {/* Header: Title, Live Multiplier, Close Button */}
            <div className="flex-none px-5 sm:px-8 py-4 border-b border-white/[.08] bg-[#1a1b24] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff80a5] shadow-[0_0_8px_#ff80a5]" />
                    Mod Select
                  </h1>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/10">
                    Argon
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mt-1 tracking-wide">
                  Customize gameplay rules, difficulty, and mechanics.
                </p>
              </div>

              {/* Multiplier badge and controls */}
              <div className="flex items-center gap-3">
                {/* Score Multiplier Display */}
                <div
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                    isUnranked
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : currentMultiplier < 1
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : currentMultiplier > 1
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : 'bg-white/10 border-white/15 text-white/90'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-white/60">Multiplier:</span>
                  <span className="text-sm font-black">
                    {currentMultiplier.toFixed(2)}x
                  </span>
                  {isUnranked && (
                    <span className="text-[10px] bg-sky-500/30 text-sky-200 px-1.5 py-0.5 rounded uppercase font-sans font-bold tracking-wider">
                      Unranked
                    </span>
                  )}
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition flex items-center justify-center cursor-pointer"
                  title="Close Mod Select (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Subheader: Category Navigation Tabs & Search */}
            <div className="flex-none px-5 sm:px-8 py-2.5 bg-[#171821] border-b border-white/[.06] flex flex-wrap items-center justify-between gap-3">
              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedCategoryTab === 'all'
                      ? 'bg-white/20 text-white shadow-sm'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  All ({ALL_MODS.length})
                </button>

                {MOD_CATEGORIES.map(cat => {
                  const isTabActive = selectedCategoryTab === cat.id;
                  const catMods = ALL_MODS.filter(m => m.category === cat.id);
                  const activeCount = selectedMods.filter(m => catMods.some(cm => cm.id === m)).length;
                  return (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => setSelectedCategoryTab(cat.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        isTabActive
                          ? `${cat.bgClass} ${cat.textClass} border ${cat.borderClass} shadow-sm`
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span>{cat.name}</span>
                      {activeCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-white/20 text-[9px] flex items-center justify-center font-mono font-bold">
                          {activeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative flex items-center w-full sm:w-56">
                <Search className="absolute left-2.5 w-3.5 h-3.5 text-white/40 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search mods..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#1e202a] border border-white/10 rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#ff80a5]/60 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-white/40 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Selected Mods Summary Bar (if any active) */}
            {selectedMods.length > 0 && (
              <div className="flex-none px-5 sm:px-8 py-2 bg-[#101117]/90 border-b border-white/[.05] flex items-center gap-2 overflow-x-auto scrollbar-none">
                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider whitespace-nowrap">
                  Active ({selectedMods.length}):
                </span>
                <div className="flex items-center gap-1.5">
                  {selectedMods.map(modId => {
                    const mod = ALL_MODS.find(m => m.id === modId);
                    const isKey = /^K(?:[1-9]|10)$/.test(modId);
                    const displayName = mod ? mod.acronym : modId;
                    return (
                      <button
                        type="button"
                        key={modId}
                        onClick={() => {
                          const nextMods = selectedMods.filter(m => m !== modId);
                          onUpdateMods(sanitizeGameplayMods(nextMods));
                        }}
                        title={`Click to remove ${mod?.name || modId}`}
                        className="group flex items-center gap-1 px-2 py-0.5 bg-white/10 hover:bg-rose-500/20 hover:border-rose-500/40 border border-white/15 rounded-md text-xs font-mono font-bold text-white transition cursor-pointer"
                      >
                        <span>{isKey ? `${modId.substring(1)}K` : displayName}</span>
                        <X className="w-3 h-3 text-white/40 group-hover:text-rose-400" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Scrollable Categories Content */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 min-h-0 bg-[#121319] flex flex-col gap-8">
              {MOD_CATEGORIES.map(cat => {
                // If a category tab is selected and not 'all', skip other categories
                if (selectedCategoryTab !== 'all' && selectedCategoryTab !== cat.id) {
                  return null;
                }

                const catMods = filteredMods.filter(m => m.category === cat.id);
                if (catMods.length === 0 && (!searchQuery || cat.id !== 'conversion')) {
                  return null;
                }

                return (
                  <section key={cat.id} className="flex flex-col gap-3.5">
                    {/* Category Header */}
                    <div className="flex items-center justify-between border-b border-white/[.07] pb-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: cat.color }}
                        />
                        <h2 className="text-sm font-black uppercase tracking-wider text-white">
                          {cat.name}
                        </h2>
                        <span className="text-[11px] text-white/40 hidden sm:inline">
                          — {cat.description}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-white/50">
                        {catMods.length} mods
                      </div>
                    </div>

                    {/* Mod Hex Buttons Grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4 justify-items-center">
                      {catMods.map(mod => {
                        const isActive = selectedMods.includes(mod.id);
                        const conflicts = getConflictingMods(mod.id, selectedMods);

                        return (
                          <HexModButton
                            key={mod.id}
                            id={mod.id}
                            acronym={mod.acronym}
                            name={mod.name}
                            multiplier={mod.multiplier}
                            categoryColor={cat.color}
                            icon={mod.icon}
                            isActive={isActive}
                            conflictingMods={conflicts}
                            onClick={() => handleToggleMod(mod)}
                          />
                        );
                      })}
                    </div>

                    {/* Key Conversion Sub-section (Inside Conversion category) */}
                    {cat.id === 'conversion' && (!searchQuery || 'key conversion'.includes(searchQuery.toLowerCase())) && (
                      <div className="mt-4 pt-4 border-t border-white/[.05] flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-white/80 uppercase tracking-wider">
                            <Keyboard className="w-3.5 h-3.5 text-purple-400" />
                            <span>Key Count Conversion (1K – 10K)</span>
                          </div>
                          <span className="text-[10px] font-mono text-white/40">
                            0.90x Multiplier
                          </span>
                        </div>

                        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 justify-items-center">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => {
                            const id = `K${k}`;
                            const isActive = selectedMods.includes(id);
                            const isNative = availableKeyCounts.includes(k);
                            const conflicts = getConflictingMods(id, selectedMods);

                            return (
                              <HexModButton
                                key={id}
                                id={id}
                                acronym={`${k}K`}
                                name={`${k} Keys`}
                                multiplier="0.90x"
                                categoryColor={cat.color}
                                icon={Keyboard}
                                isActive={isActive}
                                conflictingMods={conflicts}
                                isDisabled={isNative}
                                disabledReason={`${k}K is already native to this beatmap`}
                                onClick={() => !isNative && handleToggleKeyMod(k)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}

              {/* Difficulty Adjust (DA) Customization Slider Panel */}
              {selectedMods.includes('DA') && onUpdateDifficultyAdjust && (
                <div className="mt-2 p-5 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 flex flex-col gap-4">
                  <div className="flex items-center gap-2 font-black text-sm text-yellow-300">
                    <Sliders className="w-4 h-4 text-yellow-400" />
                    <span>Difficulty Adjust (DA) Settings</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
                    {/* OD Slider */}
                    <div className="flex flex-col gap-2 p-3 bg-black/30 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-white/80">Overall Difficulty (OD):</span>
                        <span className="font-mono font-black text-yellow-400 text-sm">
                          {(difficultyAdjust?.overallDifficulty ?? defaultOd).toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={difficultyAdjust?.overallDifficulty ?? defaultOd}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          onUpdateDifficultyAdjust({
                            ...(difficultyAdjust || {}),
                            overallDifficulty: val,
                          });
                        }}
                        className="accent-yellow-400 h-1.5 rounded-lg cursor-pointer"
                      />
                      <span className="text-[10px] text-white/40">Default: {defaultOd.toFixed(1)}</span>
                    </div>

                    {/* HP Drain Slider */}
                    <div className="flex flex-col gap-2 p-3 bg-black/30 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-white/80">HP Drain Rate (HP):</span>
                        <span className="font-mono font-black text-yellow-400 text-sm">
                          {(difficultyAdjust?.hpDrainRate ?? defaultHp).toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={difficultyAdjust?.hpDrainRate ?? defaultHp}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          onUpdateDifficultyAdjust({
                            ...(difficultyAdjust || {}),
                            hpDrainRate: val,
                          });
                        }}
                        className="accent-yellow-400 h-1.5 rounded-lg cursor-pointer"
                      />
                      <span className="text-[10px] text-white/40">Default: {defaultHp.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer: Reset & Close */}
            <div className="flex-none px-6 sm:px-8 py-3.5 bg-[#161720] border-t border-white/[.08] flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => onUpdateMods([])}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-xs font-mono font-bold transition cursor-pointer border border-white/10"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Mods</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-[#ff80a5] hover:brightness-110 active:scale-95 text-slate-950 font-black font-sans text-xs rounded-xl transition cursor-pointer uppercase tracking-wider shadow-[0_0_15px_rgba(255,128,165,0.4)]"
              >
                Apply Selection
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ModSelectOverlay;
