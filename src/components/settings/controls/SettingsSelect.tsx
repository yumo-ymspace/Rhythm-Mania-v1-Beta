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

interface SettingsSelectProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  id?: string;
}

export default function SettingsSelect({ value, options, onChange, id }: SettingsSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#121622] border border-white/10 text-slate-100 text-xs font-sans rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 cursor-pointer shadow-sm transition-all"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[#0b0e15] text-slate-100">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
