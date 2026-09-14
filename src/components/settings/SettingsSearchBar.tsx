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

import React, { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SettingsSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  shaking: boolean;
}

export default function SettingsSearchBar({ value, onChange, onClose, shaking }: SettingsSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + F to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      
      // Esc clears search or closes drawer
      if (e.key === 'Escape') {
        if (value) {
          onChange('');
          e.stopPropagation();
        } else {
          onClose();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, onChange, onClose]);

  return (
    <div className="sticky top-0 z-20 -mx-5 px-5 py-3 bg-[#26252d] backdrop-blur-sm border-b border-black/20">
      <div className={`flex items-center gap-2 ${shaking ? 'settings-shake' : ''}`}>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="type to search"
            className="w-full bg-[#232234] border border-black/30 rounded-md pl-3 pr-9 py-2 text-[13px] text-white placeholder-[#6f6f92] focus:outline-none focus:border-[#8a7dff]/60 transition-colors font-sans"
          />
          {value ? (
            <button
              onClick={() => onChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#9d9dbd] hover:text-white transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white pointer-events-none" />
          )}
        </div>
      </div>
    </div>
  );
}
