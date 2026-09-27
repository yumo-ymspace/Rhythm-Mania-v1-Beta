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

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Search, ChevronLeft, ChevronDown, ChevronUp, Plus,
  Infinity as InfinityIcon, Rewind, FastForward, ArrowUpToLine,
  Skull, Award, Target, SquareSlash, Eye, Layers, Flashlight,
  Zap, FlipHorizontal, Shuffle, Gauge, ArrowUpDown, Ban,
  Clock, TrendingUp, TrendingDown, Activity, VolumeX, Film,
  Keyboard, MousePointerClick, Sparkles, Sliders, ArrowLeftRight,
  Sun, Columns2,
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
  /** Greyed visual chrome for stills we do not own yet (Daycore, Dual Stages). Never toggles. */
  comingSoon?: boolean;
}

/**
 * osu!lazer-inspired category palette.
 * Header background uses `color`; body text stays light on the dark olive panel.
 */
export const MOD_CATEGORIES: { id: ModCategory; name: string; description: string; color: string; bgClass: string; textClass: string; borderClass: string; glowColor: string }[] = [
  {
    id: 'reduction',
    name: 'Difficulty Reduction',
    description: 'Make the map easier or more forgiving.',
    color: '#9ee854',
    bgClass: 'bg-emerald-500/15',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/40',
    glowColor: 'rgba(158, 232, 84, 0.35)',
  },
  {
    id: 'increase',
    name: 'Difficulty Increase',
    description: 'Add challenge and push your limits.',
    color: '#ff5d5d',
    bgClass: 'bg-rose-500/15',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/40',
    glowColor: 'rgba(255, 93, 93, 0.35)',
  },
  {
    id: 'automation',
    name: 'Automation',
    description: 'Sit back and enjoy the show.',
    color: '#5ecdf1',
    bgClass: 'bg-sky-500/15',
    textClass: 'text-sky-400',
    borderClass: 'border-sky-500/40',
    glowColor: 'rgba(94, 205, 241, 0.35)',
  },
  {
    id: 'conversion',
    name: 'Conversion',
    description: 'Transform gameplay mechanics and key counts.',
    color: '#9d6bff',
    bgClass: 'bg-purple-500/15',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/40',
    glowColor: 'rgba(157, 107, 255, 0.35)',
  },
  {
    id: 'fun',
    name: 'Fun',
    description: 'Quirky experiments and dynamic speeds.',
    color: '#ff7ab8',
    bgClass: 'bg-amber-500/15',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/40',
    glowColor: 'rgba(255, 122, 184, 0.35)',
  },
];

export const PRESET_COLUMN_COLOR = '#e9d44a';

export const ALL_MODS: ModItem[] = [
  // Difficulty Reduction (lazer still order: EZ, NF, HT, DC, NR)
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
    id: 'HT',
    name: 'Half Time',
    acronym: 'HT',
    title: 'Half Time (HT)',
    category: 'reduction',
    multiplier: '0.30x',
    icon: Rewind,
    description: 'Slows down song playback to 0.75x speed.',
    exclusiveWith: ['DT', 'NC', 'WU', 'WD', 'AS'],
  },
  {
    id: 'DC',
    name: 'Daycore',
    acronym: 'DC',
    title: 'Daycore (DC)',
    category: 'reduction',
    multiplier: '0.30x',
    icon: Sun,
    description: 'Dreamy slowed-down playback. Coming soon.',
    exclusiveWith: ['DT', 'NC', 'WU', 'WD', 'AS'],
    comingSoon: true,
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

  // Difficulty Increase (lazer still order: HR, SD, PF, DT, NC, FI, HD, Cover, FL, AC)
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

  // Conversion (lazer still order: RD, Dual Stages, MR, DA, Classic, Invert, CS, Hold Off)
  {
    id: 'RD',
    name: 'Random',
    acronym: 'RD',
    title: 'Random (RD)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: Shuffle,
    description: 'Shuffle around the keys!',
    exclusiveWith: ['MR'],
  },
  {
    id: 'DS',
    name: 'Dual Stages',
    acronym: 'DS',
    title: 'Dual Stages (DS)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: Columns2,
    description: 'Double the stages, double the fun! Coming soon.',
    comingSoon: true,
  },
  {
    id: 'MR',
    name: 'Mirror',
    acronym: 'MR',
    title: 'Mirror (MR)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: FlipHorizontal,
    description: 'Notes are flipped horizontally.',
    exclusiveWith: ['RD'],
  },
  {
    id: 'DA',
    name: 'Difficulty Adjust',
    acronym: 'DA',
    title: 'Difficulty Adjust (DA)',
    category: 'conversion',
    multiplier: '0.50x',
    icon: Sliders,
    description: "Override a beatmap's difficulty settings.",
    exclusiveWith: ['EZ', 'HR'],
  },
  {
    id: 'CL',
    name: 'Classic',
    acronym: 'CL',
    title: 'Classic (CL)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: Clock,
    description: 'Feeling nostalgic?',
  },
  {
    id: 'IN',
    name: 'Invert',
    acronym: 'IN',
    title: 'Invert (IN)',
    category: 'conversion',
    multiplier: '1.00x',
    icon: ArrowUpDown,
    description: 'Hold the keys. To the end.',
    exclusiveWith: ['HO'],
  },
  {
    id: 'CS',
    name: 'Constant Speed',
    acronym: 'CS',
    title: 'Constant Speed (CS)',
    category: 'conversion',
    multiplier: '0.90x',
    icon: Gauge,
    description: 'No more tricky speed changes!',
  },
  {
    id: 'HO',
    name: 'Hold Off',
    acronym: 'HO',
    title: 'Hold Off (HO)',
    category: 'conversion',
    multiplier: '0.90x',
    icon: Ban,
    description: 'Replaces all hold notes with normal notes.',
    exclusiveWith: ['IN', 'NR'],
  },

  // Fun (lazer still order: WU, WD, MU, AS)
  {
    id: 'WU',
    name: 'Wind Up',
    acronym: 'WU',
    title: 'Wind Up (WU)',
    category: 'fun',
    multiplier: '0.50x',
    icon: TrendingUp,
    description: 'Can you keep up?',
    exclusiveWith: ['HT', 'DT', 'NC', 'WD', 'AS'],
  },
  {
    id: 'WD',
    name: 'Wind Down',
    acronym: 'WD',
    title: 'Wind Down (WD)',
    category: 'fun',
    multiplier: '0.50x',
    icon: TrendingDown,
    description: 'Sloooow doooown...',
    exclusiveWith: ['HT', 'DT', 'NC', 'WU', 'AS'],
  },
  {
    id: 'MU',
    name: 'Muted',
    acronym: 'MU',
    title: 'Muted (MU)',
    category: 'fun',
    multiplier: '1.00x',
    icon: VolumeX,
    description: 'Can you still feel the rhythm without music?',
  },
  {
    id: 'AS',
    name: 'Adaptive Speed',
    acronym: 'AS',
    title: 'Adaptive Speed (AS)',
    category: 'fun',
    multiplier: '0.50x',
    icon: Activity,
    description: 'Let track speed adapt to you.',
    exclusiveWith: ['HT', 'DT', 'NC', 'WU', 'WD'],
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

interface LazerModCardProps {
  mod: ModItem;
  categoryColor: string;
  isActive: boolean;
  conflictingMods: string[];
  onClick: () => void;
}

const HEX_CLIP = 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)';

/**
 * osu!lazer-style mod row: hex icon on the left, bold name plus
 * single-line description on the right. Selected rows fill with the
 * category colour; incompatible rows dim until hovered; coming-soon
 * rows render greyed and never toggle.
 */
export const LazerModCard: React.FC<LazerModCardProps> = ({
  mod,
  categoryColor,
  isActive,
  conflictingMods,
  onClick,
}) => {
  const Icon = mod.icon;
  const isComingSoon = mod.comingSoon === true;
  const isConflicting = conflictingMods.length > 0 && !isActive && !isComingSoon;
  const tooltipText = isComingSoon
    ? `${mod.title} - Coming soon`
    : isConflicting
      ? `${mod.description} Incompatible with: ${conflictingMods.join(', ')} (click to swap)`
      : `${mod.title} - ${mod.description} (${mod.multiplier})`;

  if (isComingSoon) {
    return (
      <div className="group relative">
        <div
          title={tooltipText}
          aria-label={tooltipText}
          aria-disabled="true"
          className="w-full flex items-center gap-3 rounded-lg pl-2 pr-3 py-[7px] text-left border opacity-45 saturate-50 cursor-not-allowed select-none"
          style={{ backgroundColor: 'rgba(52, 64, 51, 0.75)', borderColor: 'rgba(255,255,255,0.06)', color: '#cfd6cd' }}
        >
          <span
            className="w-9 h-9 shrink-0 grid place-items-center"
            style={{ clipPath: HEX_CLIP, backgroundColor: '#1c231c' }}
          >
            <Icon className="w-4 h-4 opacity-70" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold leading-tight truncate">{mod.name}</span>
            <span className="block text-[11px] leading-tight truncate text-white/40">
              Coming soon
            </span>
          </span>
        </div>
        <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-30 hidden group-hover:block w-[248px] rounded-lg bg-black/95 border border-white/15 px-3 py-2 shadow-2xl">
          <span className="block text-[12px] font-bold text-white leading-snug">{mod.name}</span>
          <span className="block text-[11px] text-white/70 leading-snug mt-0.5">{mod.description}</span>
          <span className="block mt-1.5 text-[10px] uppercase tracking-wider text-white/50 font-bold">Coming soon</span>
        </span>
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        title={tooltipText}
        aria-label={tooltipText}
        aria-pressed={isActive}
        className={`w-full flex items-center gap-3 rounded-lg pl-2 pr-3 py-[7px] text-left border transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
          isActive ? 'shadow-[0_4px_18px_rgba(0,0,0,0.45)]' : ''
        } ${isConflicting ? 'opacity-40 hover:opacity-90' : 'hover:brightness-110 active:scale-[0.98]'}`}
        style={
          isActive
            ? { backgroundColor: categoryColor, borderColor: categoryColor, color: '#10160f' }
            : { backgroundColor: 'rgba(66, 82, 63, 0.85)', borderColor: 'rgba(255,255,255,0.07)', color: '#f2f5ef' }
        }
      >
        <span
          className="w-9 h-9 shrink-0 grid place-items-center"
          style={{
            clipPath: HEX_CLIP,
            backgroundColor: isActive ? 'rgba(0,0,0,0.32)' : '#222b22',
          }}
        >
          <Icon className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold leading-tight truncate">{mod.name}</span>
          <span
            className="block text-[11px] leading-tight truncate"
            style={{ color: isActive ? 'rgba(16,22,15,0.72)' : 'rgba(242,245,239,0.62)' }}
          >
            {mod.description}
          </span>
        </span>
      </button>

      {/* Hover tooltip, lazer style: dark card with description + incompat pills */}
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-30 hidden group-hover:block w-[248px] rounded-lg bg-black/95 border border-white/15 px-3 py-2 shadow-2xl">
        <span className="block text-[12px] font-bold text-white leading-snug">{mod.name}</span>
        <span className="block text-[11px] text-white/70 leading-snug mt-0.5">{mod.description}</span>
        {isConflicting ? (
          <span className="block mt-1.5">
            <span className="block text-[10px] uppercase tracking-wider text-white/50 font-bold">Incompatible with:</span>
            <span className="flex flex-wrap gap-1 mt-1">
              {conflictingMods.map(c => (
                <span key={c} className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/80 text-white">
                  {c}
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span className="block mt-1.5 text-[10px] uppercase tracking-wider text-white/50 font-bold">Compatible with all mods</span>
        )}
      </span>
    </div>
  );
};

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
 * Backwards-compatible hex button wrapper, restyled as a lazer row card.
 * Kept so existing imports keep working; new code should use LazerModCard.
 */
export const HexModButton: React.FC<HexModButtonProps> = ({
  id,
  name,
  multiplier,
  categoryColor,
  icon,
  isActive,
  conflictingMods,
  isDisabled = false,
  disabledReason,
  onClick,
}) => {
  const found = ALL_MODS.find(m => m.id === id);
  const mod: ModItem = found ?? {
    id,
    name,
    acronym: id,
    title: `${name} (${id})`,
    category: 'conversion',
    multiplier,
    icon,
    description: disabledReason ?? multiplier,
  };
  void multiplier;
  if (isDisabled) {
    return (
      <button
        type="button"
        disabled
        title={disabledReason}
        aria-label={disabledReason}
        className="w-full flex items-center gap-3 rounded-lg pl-2 pr-3 py-[7px] text-left border opacity-30 cursor-not-allowed"
        style={{ backgroundColor: 'rgba(66, 82, 63, 0.85)', borderColor: 'rgba(255,255,255,0.07)', color: '#f2f5ef' }}
      >
        <span className="w-9 h-9 shrink-0 grid place-items-center" style={{ clipPath: HEX_CLIP, backgroundColor: '#222b22' }}>
          {React.createElement(icon, { className: 'w-4 h-4' })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold leading-tight truncate">{name}</span>
          <span className="block text-[11px] leading-tight truncate text-white/50">{disabledReason ?? ''}</span>
        </span>
      </button>
    );
  }
  return <LazerModCard mod={{ ...mod, icon }} categoryColor={categoryColor} isActive={isActive} conflictingMods={conflictingMods} onClick={onClick} />;
};

export interface BeatmapStatsSummary {
  stars?: number;
  bpm?: number;
  keyCount?: number;
  od?: number;
  hp?: number;
}

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
  beatmapStats?: BeatmapStatsSummary;
}

interface ModPreset {
  name: string;
  mods: string[];
}

const PRESETS_KEY = 'rhythm_mania_v1_mod_presets';
const COLUMN_CLIP = 'polygon(26px 0, 100% 0, calc(100% - 26px) 100%, 0 100%)';

function loadPresets(): ModPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is ModPreset => typeof p === 'object' && p !== null && typeof (p as ModPreset).name === 'string' && Array.isArray((p as ModPreset).mods))
      .slice(0, 20)
      .map(p => ({ name: p.name.slice(0, 32), mods: sanitizeGameplayMods(p.mods.filter(m => typeof m === 'string')).slice(0, 24) }));
  } catch {
    return [];
  }
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
  beatmapStats,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [presets, setPresets] = useState<ModPreset[]>(() => loadPresets());

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setCustomiseOpen(false);
    }
  }, [isOpen]);

  // Compute live score multiplier
  const currentMultiplier = useMemo(() => {
    return computeModMultiplier(selectedMods);
  }, [selectedMods]);

  const isUnranked = useMemo(() => {
    return selectedMods.includes('AT') || selectedMods.includes('CN');
  }, [selectedMods]);

  // Handle clicking a regular mod (coming-soon rows never toggle)
  const handleToggleMod = (mod: ModItem) => {
    if (mod.comingSoon) return;
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

  const persistPresets = (next: ModPreset[]) => {
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      // storage may be unavailable; presets stay in memory only
    }
  };

  const handleSavePreset = () => {
    if (selectedMods.length === 0) return;
    const next: ModPreset[] = [...presets, { name: `Preset ${presets.length + 1}`, mods: [...selectedMods] }].slice(-20);
    persistPresets(next);
  };

  // Filter mods by query (lazer search filters rows inside each column)
  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (mod: ModItem) => {
    if (!query) return true;
    return (
      mod.name.toLowerCase().includes(query) ||
      mod.acronym.toLowerCase().includes(query) ||
      mod.description.toLowerCase().includes(query) ||
      mod.id.toLowerCase().includes(query)
    );
  };

  const stars = beatmapStats?.stars;
  const bpm = beatmapStats?.bpm;
  const keyCount = beatmapStats?.keyCount;
  const od = beatmapStats?.od;
  const hp = beatmapStats?.hp;
  const firstActiveMod = selectedMods.length > 0 ? ALL_MODS.find(m => m.id === selectedMods[0]) : undefined;
  const FirstActiveIcon = firstActiveMod?.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="mod-select-lazer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex flex-col bg-black/60 font-sans text-slate-100"
          style={{ willChange: 'opacity' }}
        >
          {/* Dim + blur the song select behind, click outside panels closes */}
          <button
            type="button"
            aria-label="Close mod select"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
          />
          <div className="relative flex-1 min-h-0 flex flex-col">
            {/* Top info banner */}
            <div className="flex-none mx-2 sm:mx-6 lg:mx-10 mt-2 rounded-xl bg-[#2f442f]/95 border border-white/10 shadow-[0_10px_36px_rgba(0,0,0,0.55)] px-5 py-3 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-[15px] font-bold tracking-wide text-white">Mod Select</h1>
                <p className="text-[11px] text-white/60 leading-snug mt-0.5">
                  Mods provide different ways to enjoy gameplay. Some have an effect on the score you can achieve during ranked play. Others are just for fun.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                title="Close Mod Select (Esc)"
                className="h-8 w-8 shrink-0 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search + Customise toolbar */}
            <div className="flex-none mx-2 sm:mx-6 lg:mx-10 mt-3 flex items-center gap-3">
              <div className="flex items-center bg-[#2b3b2b]/95 border border-white/10 rounded-xl overflow-hidden w-[280px] max-w-[46vw] focus-within:border-white/25 transition">
                <input
                  type="text"
                  placeholder="tab to search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Tab') e.preventDefault();
                  }}
                  className="flex-1 min-w-0 bg-transparent px-4 py-2.5 text-[13px] text-white placeholder-white/45 focus:outline-none"
                />
                <span className="flex-none self-stretch w-12 grid place-items-center bg-[#3a4f3a]/80 border-l border-white/10">
                  <Search className="w-4 h-4 text-white/75" />
                </span>
              </div>

              <div className="flex-1" />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCustomiseOpen(v => !v)}
                  aria-expanded={customiseOpen}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold transition cursor-pointer border ${
                    customiseOpen
                      ? 'bg-[#7ee65a] text-[#10210f] border-[#7ee65a]'
                      : 'bg-[#2b3b2b]/95 text-white/75 border-white/10 hover:text-white'
                  }`}
                >
                  <span>Customise</span>
                  {customiseOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {customiseOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] w-[320px] max-w-[80vw] rounded-xl overflow-hidden border border-white/10 shadow-2xl z-40">
                    <div className="bg-[#7ee65a] text-[#10210f] px-4 py-2 text-[13px] font-bold flex items-center justify-between">
                      <span>Customise</span>
                      <ChevronUp className="w-4 h-4" />
                    </div>
                    <div className="bg-[#232f23]/95 backdrop-blur px-4 py-4 flex flex-col gap-4">
                      {selectedMods.includes('DA') && onUpdateDifficultyAdjust ? (
                        <>
                          <div>
                            <div className="flex items-center justify-between text-[12px]">
                              <span className="font-bold text-white">Difficulty Adjust</span>
                              <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80">DA</span>
                            </div>
                          </div>
                          <label className="block">
                            <span className="block text-[11px] text-white/60 mb-1">Overall Difficulty (OD)</span>
                            <span className="flex items-center gap-2">
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
                                className="flex-1 accent-[#9ee854] h-1.5 cursor-pointer"
                              />
                              <span className="text-[12px] font-mono font-bold text-white w-7 text-right">
                                {(difficultyAdjust?.overallDifficulty ?? defaultOd).toFixed(1)}
                              </span>
                            </span>
                          </label>
                          <label className="block">
                            <span className="block text-[11px] text-white/60 mb-1">HP Drain Rate (HP)</span>
                            <span className="flex items-center gap-2">
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
                                className="flex-1 accent-[#9ee854] h-1.5 cursor-pointer"
                              />
                              <span className="text-[12px] font-mono font-bold text-white w-7 text-right">
                                {(difficultyAdjust?.hpDrainRate ?? defaultHp).toFixed(1)}
                              </span>
                            </span>
                          </label>
                        </>
                      ) : (
                        <p className="text-[12px] text-white/60 leading-snug">
                          Select a customisable mod (for example <span className="text-white font-bold">Difficulty Adjust</span> in Conversion) to tweak its settings here.
                        </p>
                      )}
                      {selectedMods.length > 0 && (
                        <div className="pt-3 border-t border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-white/45 font-bold mb-1.5">Active mods</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedMods.map(id => (
                              <span key={id} className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-white/10 text-white/85 border border-white/10">
                                {id}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Columns: sheared lazer panels with independent vertical scroll per column.
                The slanted background is a clipped paint-only layer (pointer-events-none).
                Row content lives in an unclipped overlay inset by ~30px so the
                per-column scrollbar is never cut by the slant. The row itself is
                h-full (not min-h-full) so tall columns scroll instead of growing
                and getting clipped by the outer overflow-y-hidden. */}
            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden lazer-columns-scroll">
              <div className="flex gap-4 lg:gap-5 px-2 sm:px-6 lg:px-10 py-4 items-stretch h-full w-max min-w-full">
                {/* Personal Presets column */}
                <section aria-label="Personal Presets" className="relative w-[270px] lg:w-[290px] shrink-0 h-full min-h-0 flex flex-col">
                  <div
                    aria-hidden
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{ clipPath: COLUMN_CLIP, backgroundColor: '#2c3a2d' }}
                  >
                    <div className="h-[40px] w-full" style={{ backgroundColor: PRESET_COLUMN_COLOR }} />
                  </div>
                  <div className="relative flex-1 min-h-0 h-full flex flex-col px-[30px]">
                    <header className="flex-none h-[40px] flex items-center text-[13px] font-bold truncate" style={{ color: '#141a10' }}>
                      Personal Presets
                    </header>
                    <div
                      role="region"
                      aria-label="Personal presets list"
                      tabIndex={0}
                      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-3 pr-1 flex flex-col gap-2 lazer-column-scroll outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded"
                    >
                      <button
                        type="button"
                        onClick={handleSavePreset}
                        disabled={selectedMods.length === 0}
                        title={selectedMods.length === 0 ? 'Select mods first, then save them as a preset' : 'Save current mods as a preset'}
                        className="w-full rounded-lg bg-black/25 border border-white/10 hover:border-white/25 hover:bg-black/35 transition py-4 grid place-items-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-5 h-5 text-white/80" />
                      </button>
                      {presets.length === 0 && (
                        <p className="text-[11px] text-white/40 leading-snug text-center mt-1">
                          Save your current mod combo for one-tap reuse.
                        </p>
                      )}
                      {presets.map((preset, idx) => (
                        <div key={`${preset.name}-${idx}`} className="group/preset relative">
                          <button
                            type="button"
                            onClick={() => onUpdateMods(sanitizeGameplayMods(preset.mods))}
                            title={`Apply ${preset.name}: ${preset.mods.join(', ') || 'no mods'}`}
                            className="w-full rounded-lg bg-[#42523f]/80 hover:bg-[#4b5f46] border border-white/[0.06] pl-2 pr-8 py-2 text-left transition cursor-pointer"
                          >
                            <span className="block text-[13px] font-bold text-white truncate">{preset.name}</span>
                            <span className="block text-[11px] text-white/55 truncate font-mono">
                              {preset.mods.length > 0 ? preset.mods.join(' + ') : 'No mods'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => persistPresets(presets.filter((_, i) => i !== idx))}
                            title={`Delete ${preset.name}`}
                            aria-label={`Delete ${preset.name}`}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md hidden group-hover/preset:grid place-items-center bg-black/40 hover:bg-rose-500/70 text-white/70 hover:text-white transition cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {MOD_CATEGORIES.map(cat => {
                  const catMods = ALL_MODS.filter(m => m.category === cat.id && matchesQuery(m));
                  const showKeySection =
                    cat.id === 'conversion' && (!query || 'key conversion 1k 2k 3k 4k 5k 6k 7k 8k 9k 10k keys'.includes(query));
                  if (catMods.length === 0 && !showKeySection) return null;
                  return (
                    <section key={cat.id} aria-label={cat.name} className="relative w-[290px] lg:w-[310px] shrink-0 h-full min-h-0 flex flex-col">
                      <div
                        aria-hidden
                        className="absolute inset-0 overflow-hidden pointer-events-none"
                        style={{ clipPath: COLUMN_CLIP, backgroundColor: '#2c3a2d' }}
                      >
                        <div className="h-[40px] w-full" style={{ backgroundColor: cat.color }} />
                      </div>
                      <div className="relative flex-1 min-h-0 h-full flex flex-col px-[30px]">
                        <header className="flex-none h-[40px] flex items-center text-[13px] font-bold truncate" style={{ color: '#141a10' }}>
                          {cat.name}
                        </header>
                        <div
                          role="region"
                          aria-label={`${cat.name} mods list`}
                          tabIndex={0}
                          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-3 pr-1 flex flex-col gap-2 lazer-column-scroll outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded"
                        >
                          {catMods.map(mod => (
                            <LazerModCard
                              key={mod.id}
                              mod={mod}
                              categoryColor={cat.color}
                              isActive={selectedMods.includes(mod.id)}
                              conflictingMods={getConflictingMods(mod.id, selectedMods)}
                              onClick={() => handleToggleMod(mod)}
                            />
                          ))}

                          {cat.id === 'conversion' && showKeySection && (
                            <div className="mt-1 pt-2 border-t border-white/10">
                              <p className="text-[10px] uppercase tracking-wider text-white/45 font-bold mb-1.5 px-0.5">
                                Key Conversion
                              </p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => {
                                  const id = `K${k}`;
                                  const isActive = selectedMods.includes(id);
                                  const isNative = availableKeyCounts.includes(k);
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      disabled={isNative}
                                      onClick={() => !isNative && handleToggleKeyMod(k)}
                                      title={isNative ? `${k}K is already native to this beatmap` : `Convert playfield to ${k}K (0.90x)`}
                                      className={`rounded-md px-2 py-1.5 text-[12px] font-mono font-bold border transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 ${
                                        isActive ? '' : 'bg-[#42523f]/80 border-white/[0.06] text-white/85 hover:bg-[#4b5f46]'
                                      }`}
                                      style={isActive ? { backgroundColor: cat.color, borderColor: cat.color, color: '#10160f' } : undefined}
                                    >
                                      {k}K
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>

            {/* Bottom action bar */}
            <footer className="flex-none bg-[#20261f]/95 border-t border-white/10 px-2 sm:px-6 lg:px-10 pt-4 pb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="-skew-x-[12deg] rounded-lg bg-[#f23a9c] hover:brightness-110 active:scale-95 transition px-6 sm:px-8 py-2.5 cursor-pointer"
              >
                <span className="skew-x-[12deg] flex items-center gap-2 text-[13px] font-bold text-white">
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </span>
              </button>

              <div className="relative">
                {(selectedMods.length > 0 || isUnranked) && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap">
                    {firstActiveMod && FirstActiveIcon && (
                      <span className="flex items-center gap-1.5 rounded-full bg-[#2c362c] border border-white/15 pl-1.5 pr-2.5 py-0.5 text-[11px] font-mono font-bold text-white shadow-lg">
                        <span
                          className="w-5 h-5 grid place-items-center text-white"
                          style={{ clipPath: HEX_CLIP, backgroundColor: MOD_CATEGORIES.find(c => c.id === firstActiveMod.category)?.color ?? '#666' }}
                        >
                          <FirstActiveIcon className="w-3 h-3" />
                        </span>
                        {currentMultiplier.toFixed(2)}x
                      </span>
                    )}
                    {isUnranked && (
                      <span className="rounded-full bg-[#e9d44a] px-2.5 py-1 text-[10px] font-black tracking-wide text-[#141a10] shadow-lg">
                        UNRANKED
                      </span>
                    )}
                  </span>
                )}
                <div className="-skew-x-[12deg] rounded-lg bg-[#8fe35a] px-6 sm:px-9 py-2.5">
                  <span className="skew-x-[12deg] flex flex-col items-center leading-none text-[#10210f]">
                    <ArrowLeftRight className="w-4 h-4" />
                    <span className="text-[11px] font-bold mt-0.5">Mods{selectedMods.length > 0 ? ` (${selectedMods.length})` : ''}</span>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onUpdateMods([])}
                className="-skew-x-[12deg] rounded-lg bg-[#2c332c] hover:bg-[#384138] border border-white/10 transition px-6 sm:px-10 py-2.5 cursor-pointer"
              >
                <span className="skew-x-[12deg] block text-[12px] font-bold text-white/80">Deselect All</span>
              </button>

              <div className="flex-1" />

              {/* Beatmap stat cluster */}
              <div className="hidden md:flex items-center gap-4">
                {stars !== undefined && (
                  <span className="rounded-full bg-[#3fa35c]/25 border border-[#3fa35c]/50 px-2.5 py-1 text-[12px] font-bold text-[#7bd88f]">
                    ★ {stars.toFixed(2)}
                  </span>
                )}
                {bpm !== undefined && <span className="text-[13px] font-bold text-white whitespace-nowrap">{Math.round(bpm)} BPM</span>}
                {keyCount !== undefined && (
                  <span className="text-center leading-tight">
                    <span className="block text-[9px] font-bold text-white/45">KC</span>
                    <span className="block text-[13px] font-bold text-white">{keyCount.toFixed(1)}</span>
                  </span>
                )}
                {od !== undefined && (
                  <span className="text-center leading-tight">
                    <span className="block text-[9px] font-bold text-white/45">OD</span>
                    <span className="block text-[13px] font-bold text-white">{od.toFixed(1)}</span>
                  </span>
                )}
                {hp !== undefined && (
                  <span className="text-center leading-tight">
                    <span className="block text-[9px] font-bold text-white/45">HP</span>
                    <span className="block text-[13px] font-bold text-white">{hp.toFixed(1)}</span>
                  </span>
                )}
                <span
                  className={`-skew-x-[12deg] rounded-lg px-5 py-2 text-[12px] font-bold ${
                    isUnranked ? 'bg-[#e9d44a] text-[#141a10]' : 'bg-[#2c332c] text-white/80 border border-white/10'
                  }`}
                >
                  <span className="skew-x-[12deg] block">{isUnranked ? 'Unranked' : 'Ranked'}</span>
                </span>
                <span className="text-[13px] font-mono font-bold text-white whitespace-nowrap">{currentMultiplier.toFixed(2)}x</span>
              </div>

              {/* Compact multiplier for small screens */}
              <div className="flex md:hidden items-center gap-2">
                <span
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                    isUnranked ? 'bg-[#e9d44a] text-[#141a10]' : 'bg-[#2c332c] text-white/80 border border-white/10'
                  }`}
                >
                  {isUnranked ? 'Unranked' : `${currentMultiplier.toFixed(2)}x`}
                </span>
              </div>
            </footer>
          </div>

          <style>{`
            .lazer-columns-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.35) transparent; }
            .lazer-columns-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
            .lazer-columns-scroll::-webkit-scrollbar-track { background: transparent; }
            .lazer-columns-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.35); border-radius: 9999px; }
            /* Per-column vertical scroll: lazer white rail, always visible when overflowing. */
            .lazer-column-scroll {
              scrollbar-width: thin;
              scrollbar-color: rgba(255,255,255,0.7) transparent;
              scrollbar-gutter: stable;
              overscroll-behavior-y: contain;
              overscroll-behavior-x: none;
            }
            .lazer-column-scroll::-webkit-scrollbar { width: 8px; }
            .lazer-column-scroll::-webkit-scrollbar-track { background: transparent; }
            .lazer-column-scroll::-webkit-scrollbar-thumb {
              background: rgba(255,255,255,0.7);
              border-radius: 9999px;
              border: 2px solid transparent;
              background-clip: content-box;
            }
            .lazer-column-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.9); background-clip: content-box; }
            .lazer-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.55) transparent; }
            .lazer-scroll::-webkit-scrollbar { width: 5px; }
            .lazer-scroll::-webkit-scrollbar-track { background: transparent; }
            .lazer-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.55); border-radius: 9999px; }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ModSelectOverlay;
