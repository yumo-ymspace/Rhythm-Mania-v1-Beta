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

interface SettingsToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}

export default function SettingsToggle({ checked, onChange, id }: SettingsToggleProps) {
  return (
    <label className="relative inline-flex items-center cursor-pointer select-none h-6 w-11 shrink-0">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        className={`w-11 h-6 rounded-full transition-colors duration-100 flex-shrink-0 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[#8a7dff]/60 border-2 ${
          checked
            ? 'bg-[#8a7dff] border-[#8a7dff]'
            : 'bg-transparent border-[#5b5a8a] hover:border-[#8a7dff]'
        }`}
      >
        <span
          className={`block mt-[1px] ml-[1px] bg-white w-[18px] h-[18px] rounded-full transition-transform duration-100 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </label>
  );
}
