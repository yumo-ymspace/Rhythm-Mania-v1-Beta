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

import { Check } from 'lucide-react';
import type { GameSettings } from '../../types';
import {
  ARGON_COLOUR_ORANGE,
  ARGON_COLOUR_PINK,
  ARGON_COLOUR_PURPLE,
  ARGON_COLOUR_YELLOW,
} from '../../render/argonSkin';
import {
  ALL_SKINS,
  getSelectedStyle,
  styleSettings,
  type SkinStyle,
  type SkinStyleId,
} from './skinStyles';

function SkinThumb({ skin }: { skin: SkinStyle }) {
  if (skin.previewImage) {
    return (
      <img
        src={skin.previewImage}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-11 w-16 shrink-0 rounded-md border border-white/10 bg-black/40 object-cover"
      />
    );
  }
  // Argon: mini 4K column-colour swatch.
  const cols = [ARGON_COLOUR_YELLOW, ARGON_COLOUR_ORANGE, ARGON_COLOUR_PINK, ARGON_COLOUR_PURPLE];
  return (
    <span aria-hidden="true" className="flex h-11 w-16 shrink-0 items-stretch gap-0.5 overflow-hidden rounded-md border border-white/10 bg-[#0c0d15] p-1.5">
      {cols.map((c) => (
        <span key={c} className="min-w-0 flex-1 rounded-sm" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

export default function SkinPicker({
  settings,
  update,
}: {
  settings: GameSettings;
  update: (patch: Partial<GameSettings>) => void;
}) {
  const selected = getSelectedStyle(settings);
  const apply = (style: SkinStyleId) => update(styleSettings(style));

  return (
    <div className="w-full space-y-1.5">
      {ALL_SKINS.map((skin) => {
        const isSelected = skin.id === selected;
        const isArgon = skin.id === 'argon';
        return (
          <button
            key={skin.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => apply(skin.id)}
            className={`group flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
              isSelected
                ? isArgon
                  ? 'border-cyan-400/50 bg-cyan-950/30 text-white ring-1 ring-cyan-400/30'
                  : 'border-white/40 bg-white/[0.1] text-white'
                : 'border-white/[0.08] bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.07] hover:text-white'
            }`}
          >
            <SkinThumb skin={skin} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold text-white">{skin.label}</span>
                <span className={`rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider ${
                  isArgon ? 'bg-cyan-400/20 text-cyan-200' : 'bg-amber-400/15 text-amber-200'
                }`}>
                  {skin.badge}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] leading-4 text-white/55">
                {skin.subtitle}
              </span>
            </span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              {isSelected ? (
                <span className={`flex h-5 w-5 items-center justify-center rounded-full shadow-md ${
                  isArgon ? 'bg-cyan-400 text-slate-950' : 'bg-white text-slate-950'
                }`}>
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              ) : (
                <span className="h-4 w-4 rounded-full border border-white/20 group-hover:border-white/40" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
