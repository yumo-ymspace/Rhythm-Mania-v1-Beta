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
import { Keyboard, Pause, RotateCcw, Gamepad2 } from 'lucide-react';
import type { GameSettings } from '../../types';
import SettingInfoTip from './InfoTip';

interface BindingMatrixProps {
  settings: GameSettings;
  update: (patch: Partial<GameSettings>) => void;
}

interface ActiveRebind {
  type: 'gameplay' | 'shortcut';
  keyCount?: number;
  colIndex?: number;
  settingId?: keyof GameSettings;
  label: string;
}

export default function BindingMatrix({ settings, update }: BindingMatrixProps) {
  const [activeRebind, setActiveRebind] = useState<ActiveRebind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Clear errors on starting a new rebind
  useEffect(() => {
    if (activeRebind) {
      setErrorMsg(null);
    }
  }, [activeRebind]);

  useEffect(() => {
    if (!activeRebind) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      
      const pressedKey = e.key;
      const lowerKey = pressedKey.toLowerCase();
      
      // Use Tab to cancel rebinding so that users can bind any key (including Escape or Space)
      if (lowerKey === 'tab') {
        setActiveRebind(null);
        setErrorMsg(null);
        return;
      }

      if (activeRebind.type === 'gameplay' && activeRebind.keyCount !== undefined && activeRebind.colIndex !== undefined) {
        const keyCount = activeRebind.keyCount;
        const colIdx = activeRebind.colIndex;
        const bindingsCopy = JSON.parse(JSON.stringify(settings.bindings));
        const columns = bindingsCopy[keyCount] || [];

        // Check if the pressed key is already bound to another column in the same key mode
        const isDuplicate = columns.some((k: string, idx: number) => idx !== colIdx && k.toLowerCase() === lowerKey);

        if (isDuplicate) {
          setErrorMsg(`Key "${pressedKey.toUpperCase()}" is already bound to another lane in ${keyCount}K mode!`);
          return;
        }

        if (bindingsCopy[keyCount]) {
          bindingsCopy[keyCount][colIdx] = lowerKey;
          update({ bindings: bindingsCopy });
        }
      } else if (activeRebind.type === 'shortcut' && activeRebind.settingId) {
        update({ [activeRebind.settingId]: lowerKey });
      }

      setActiveRebind(null);
      setErrorMsg(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRebind, settings.bindings, update]);

  const formatKeyName = (key: string | undefined): string => {
    if (!key) return 'NONE';
    const lower = key.toLowerCase();
    if (lower === ' ') return 'SPACE';
    if (lower === 'escape') return 'ESC';
    if (lower === 'control') return 'CTRL';
    if (lower === 'shift') return 'SHIFT';
    if (lower === 'alt') return 'ALT';
    if (lower === 'meta') return 'META';
    if (lower === 'arrowup') return '▲';
    if (lower === 'arrowdown') return '▼';
    if (lower === 'arrowleft') return '◀';
    if (lower === 'arrowright') return '▶';
    return key.toUpperCase();
  };

  return (
    <div className="flex flex-col gap-6 mt-1 mb-4">
      {/* Active Rebind & Error Message Notification Header */}
      {(activeRebind || errorMsg) && (
        <div className={`p-3 rounded-md border flex items-center justify-between transition-all duration-200 ${
          errorMsg 
            ? 'bg-rose-950/40 border-rose-500/30 text-rose-200 settings-shake' 
            : 'bg-[#3a3880]/80 border-[#8a7dff]/40 text-[#e3defc] animate-pulse'
        }`}>
          <div className="flex items-center gap-2 text-xs">
            {errorMsg ? (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-[#8a7dff] animate-ping" />
            )}
            <span>
              {errorMsg ? (
                <span>{errorMsg}</span>
              ) : (
                <span>Rebinding <strong className="text-[#cfc8ff] font-bold">{activeRebind?.label}</strong>. Press any key...</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {errorMsg && activeRebind && (
              <span className="text-[10px] text-rose-400/85 mr-1 font-sans">Press another key or Tab to exit</span>
            )}
            <span className="text-[10px] bg-[#232234] border border-black/30 text-[#a3a3c2] px-1.5 py-0.5 rounded font-mono">
              Tab to Cancel
            </span>
          </div>
        </div>
      )}

      {/* ── SECTION 1: GAMEPLAY LANE KEYBINDS (SHOWN IN COMPACT ROWS) ──────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 pb-2 border-b border-black/30">
          <Gamepad2 className="w-4 h-4 text-[#8a7dff]" />
          <h3 className="text-[13px] font-semibold text-white font-sans">
            Gameplay Lane Keybinds
          </h3>
        </div>

        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
            const columns = settings.bindings[num as keyof typeof settings.bindings] || [];
            return (
              <div 
                key={num} 
                className="py-2.5 px-3.5 rounded-md bg-[#282740] border border-transparent flex flex-row items-center justify-between gap-4 hover:border-white/15 transition-all"
              >
                {/* Compact Row Label */}
                <div className="flex items-center min-w-10">
                  <span className="text-xs font-black text-white font-sans">{num}K</span>
                </div>

                {/* Streamlined Keys Container (Single Row Placement) */}
                <div className="flex gap-1.5 justify-end flex-wrap">
                  {columns.map((colKey, idx) => {
                    const isRebindingNow = activeRebind?.type === 'gameplay' && activeRebind?.keyCount === num && activeRebind?.colIndex === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveRebind({ 
                          type: 'gameplay', 
                          keyCount: num, 
                          colIndex: idx, 
                          label: `${num}K - Column ${idx + 1}` 
                        })}
                        className={`min-w-11 h-9 px-2 font-mono text-xs font-bold rounded-md transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer border focus:outline-none focus:ring-1 focus:ring-[#8a7dff]/40 ${
                          isRebindingNow 
                            ? 'bg-[#8a7dff]/20 text-[#b3a9ff] border-[#8a7dff]/60 animate-pulse shadow-[0_0_12px_rgba(138,125,255,0.35)]' 
                            : 'bg-[#232234] border-white/10 hover:border-[#8a7dff]/40 hover:bg-white/[0.06] text-[#ececf5] hover:text-white'
                        }`}
                      >
                        <span className="text-[8px] text-[#8f8fa8] scale-75 font-sans leading-none">
                          C{idx + 1}
                        </span>
                        <span className="text-xs leading-none">
                          {isRebindingNow ? '?' : formatKeyName(colKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 2: SHORTCUT & UTILITY BINDINGS ─────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 pb-2 border-b border-black/30">
          <Keyboard className="w-4 h-4 text-[#8a7dff]" />
          <h3 className="text-[13px] font-semibold text-white font-sans">
            Gameplay Shortcuts
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Pause / Resume */}
          <div className="flex items-center justify-between p-3 rounded-md bg-[#282740] border border-transparent hover:border-white/15 transition-all">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-[#ececf5] flex items-center gap-1.5 font-sans">
                <Pause className="w-3.5 h-3.5 text-[#8a7dff]" /> Pause / Resume
                <SettingInfoTip label="Pause / Resume" text="Pauses or resumes active song play" />
              </span>
            </div>
            <button
              onClick={() => setActiveRebind({ 
                type: 'shortcut', 
                settingId: 'bindPause', 
                label: 'Pause / Resume' 
              })}
              className={`min-w-16 h-8 px-2.5 font-mono text-xs font-bold rounded-md transition-all cursor-pointer border ${
                activeRebind?.settingId === 'bindPause'
                  ? 'bg-[#8a7dff]/20 text-[#b3a9ff] border-[#8a7dff]/60 animate-pulse'
                  : 'bg-[#232234] border-white/10 hover:border-[#8a7dff]/40 hover:bg-white/[0.06] text-[#ececf5] hover:text-white'
              }`}
            >
              {activeRebind?.settingId === 'bindPause' ? '?' : formatKeyName(settings.bindPause || 'escape')}
            </button>
          </div>

          {/* Quick Restart */}
          <div className="flex items-center justify-between p-3 rounded-md bg-[#282740] border border-transparent hover:border-white/15 transition-all">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-[#ececf5] flex items-center gap-1.5 font-sans">
                <RotateCcw className="w-3.5 h-3.5 text-[#8a7dff]" /> Quick Restart / Retry
                <SettingInfoTip label="Quick Restart / Retry" text="Instantly reloads and restarts current map" />
              </span>
            </div>
            <button
              onClick={() => setActiveRebind({ 
                type: 'shortcut', 
                settingId: 'bindRetry', 
                label: 'Quick Restart / Retry' 
              })}
              className={`min-w-16 h-8 px-2.5 font-mono text-xs font-bold rounded-md transition-all cursor-pointer border ${
                activeRebind?.settingId === 'bindRetry'
                  ? 'bg-[#8a7dff]/20 text-[#b3a9ff] border-[#8a7dff]/60 animate-pulse'
                  : 'bg-[#232234] border-white/10 hover:border-[#8a7dff]/40 hover:bg-white/[0.06] text-[#ececf5] hover:text-white'
              }`}
            >
              {activeRebind?.settingId === 'bindRetry' ? '?' : formatKeyName(settings.bindRetry || 'r')}
            </button>
          </div>

          {/* Skip Intro */}
          <div className="flex items-center justify-between p-3 rounded-md bg-[#282740] border border-transparent hover:border-white/15 transition-all">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-[#ececf5] flex items-center gap-1.5 font-sans">
                <span className="text-[11px] text-[#8a7dff]">⏭</span> Skip Intro
                <SettingInfoTip label="Skip Intro" text="Jump over long silence before first note" />
              </span>
            </div>
            <button
              onClick={() => setActiveRebind({ 
                type: 'shortcut', 
                settingId: 'bindSkipIntro', 
                label: 'Skip Intro' 
              })}
              className={`min-w-16 h-8 px-2.5 font-mono text-xs font-bold rounded-md transition-all cursor-pointer border ${
                activeRebind?.settingId === 'bindSkipIntro'
                  ? 'bg-[#8a7dff]/20 text-[#b3a9ff] border-[#8a7dff]/60 animate-pulse'
                  : 'bg-[#232234] border-white/10 hover:border-[#8a7dff]/40 hover:bg-white/[0.06] text-[#ececf5] hover:text-white'
              }`}
            >
              {activeRebind?.settingId === 'bindSkipIntro' ? '?' : formatKeyName((settings as unknown as Record<string, string>).bindSkipIntro || 'enter')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
