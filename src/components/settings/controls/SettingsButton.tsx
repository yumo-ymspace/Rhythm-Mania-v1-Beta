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

interface SettingsButtonProps {
  label: string;
  onClick: () => void;
  danger?: boolean;
  id?: string;
}

export default function SettingsButton({ label, onClick, danger, id }: SettingsButtonProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-xs font-bold font-sans uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-sm ${
        danger
          ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30'
          : 'bg-white/[0.06] text-white hover:bg-white/[0.12] hover:border-cyan-400/40 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
      }`}
    >
      {label}
    </button>
  );
}
