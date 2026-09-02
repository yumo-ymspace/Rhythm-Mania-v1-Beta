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
      className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
        danger
          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
          : 'bg-[#193454]/70 text-slate-100 hover:bg-[#193454] hover:text-white border border-[#2d5584]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
      }`}
    >
      {label}
    </button>
  );
}
