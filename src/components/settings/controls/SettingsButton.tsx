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
      className={`px-4 py-2 rounded-md text-[13px] font-semibold font-sans transition-colors active:scale-[0.98] cursor-pointer ${
        danger
          ? 'bg-[#e0497a]/15 text-[#f0a3b5] hover:bg-[#e0497a]/25 border border-[#e0497a]/30'
          : 'bg-[#6b5cff] text-white hover:bg-[#7d70ff]'
      }`}
    >
      {label}
    </button>
  );
}
