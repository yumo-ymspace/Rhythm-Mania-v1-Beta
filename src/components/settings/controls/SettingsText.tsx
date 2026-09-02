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

interface SettingsTextProps {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  maxLength?: number;
  placeholder?: string;
}

export default function SettingsText({
  value,
  onChange,
  id,
  maxLength = 32,
  placeholder,
}: SettingsTextProps) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      className="w-44 max-w-[min(11rem,40vw)] bg-[#0c223d]/90 border border-[#204572]/70 text-slate-100 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[var(--skin-accent)] focus:ring-1 focus:ring-[var(--skin-accent)]"
    />
  );
}
