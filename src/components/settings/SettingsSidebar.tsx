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

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SECTIONS, SectionId } from './settingsRegistry';
import type { GameSettings } from '../../types';
import metadata from '../../../metadata.json';

interface SettingsSidebarProps {
  activeSection: SectionId;
  onSelect: (id: SectionId) => void;
  onRestoreAll: () => void;
  settings: GameSettings;
}

export default function SettingsSidebar({ activeSection, onSelect, onRestoreAll, settings }: SettingsSidebarProps) {
  return (
    <div className="w-full md:w-[240px] flex-none border-r border-white/[0.08] bg-[#090c13]/90 flex flex-col h-[200px] md:h-auto shrink-0 md:shrink backdrop-blur-xl select-none">
      <div className="p-5 pb-4 border-b border-white/[0.06]">
        <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-slate-400 uppercase mb-1">
          Preferences
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,176,255,0.8)]" />
          <h1 className="text-base font-sans font-black tracking-wider uppercase text-white">
            Settings
          </h1>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2.5 py-3 flex flex-col gap-1">
        {SECTIONS.filter((s) => !s.showWhen || s.showWhen(settings)).map((s) => {
          const Icon = s.icon;
          const isActive = s.id === activeSection;
          
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer ${
                isActive 
                  ? 'bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' 
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] font-medium'
              }`}
            >
              {/* Argon left accent bar */}
              <div 
                className={`w-1 self-stretch rounded-full transition-all duration-150 ${
                  isActive 
                    ? 'bg-cyan-400 shadow-[0_0_10px_rgba(0,176,255,0.7)]' 
                    : 'bg-transparent'
                }`} 
              />
              <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(0,176,255,0.4)]' : 'text-slate-400 group-hover:text-slate-200'}`} />
              <span className="text-sm font-sans tracking-wide truncate">{s.label}</span>
            </button>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-white/[0.08] bg-[#07090f]/60">
        <button
          onClick={onRestoreAll}
          className="w-full py-2.5 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/25 transition-all text-xs font-sans font-bold uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
          <span>Restore defaults</span>
        </button>
        <div className="text-[10px] text-center text-slate-500 font-mono tracking-widest uppercase mt-2.5">
          VERSION {metadata.version}
        </div>
      </div>
    </div>
  );
}
