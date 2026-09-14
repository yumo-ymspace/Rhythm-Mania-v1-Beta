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
    <div className="w-full md:w-[210px] flex-none border-r border-black/30 bg-[#1a1926] flex flex-col h-[200px] md:h-auto shrink-0 md:shrink select-none">
      <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">
        {SECTIONS.filter((s) => !s.showWhen || s.showWhen(settings)).map((s) => {
          const Icon = s.icon;
          const isActive = s.id === activeSection;
          
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group relative flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors duration-100 cursor-pointer ${
                isActive
                  ? 'bg-transparent text-white font-semibold'
                  : 'text-[#9d9dbd] hover:text-white hover:bg-white/[0.04] font-normal'
              }`}
            >
              {/* Lazer left accent bar */}
              <div
                className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full transition-all duration-100 ${
                  isActive
                    ? 'bg-[#8a7dff]'
                    : 'bg-transparent'
                }`}
              />
              <Icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? 'text-white' : 'text-[#9d9dbd] group-hover:text-white'}`} />
              <span className="text-[13px] font-sans tracking-wide truncate pl-1">{s.label}</span>
            </button>
          );
        })}
      </div>
      
      <div className="p-3 border-t border-black/30 bg-[#15141f]">
        <button
          onClick={onRestoreAll}
          className="w-full py-2 px-3 rounded-md bg-[#e0497a]/15 hover:bg-[#e0497a]/25 text-[#f0a3b5] border border-[#e0497a]/30 transition-colors text-xs font-sans font-semibold flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restore defaults</span>
        </button>
        <div className="text-[10px] text-center text-[#6f6f92] font-sans mt-2">
          {metadata.version}
        </div>
      </div>
    </div>
  );
}
