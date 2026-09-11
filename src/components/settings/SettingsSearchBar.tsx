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
    <div className="flex-none px-6 py-4 border-b border-white/[0.08] bg-[#080b11]/70 backdrop-blur-md flex items-center justify-between gap-4">
      <div className={`relative flex-1 max-w-sm ${shaking ? 'settings-shake' : ''}`}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/80 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search settings... (Ctrl+F)"
          className="w-full bg-[#0f1420] border border-white/10 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 transition-all font-sans"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition-colors"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      
      <button 
        onClick={onClose}
        className="p-2 text-slate-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 rounded-xl transition-all flex-none cursor-pointer active:scale-95 shadow-sm"
        title="Close (Esc)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
