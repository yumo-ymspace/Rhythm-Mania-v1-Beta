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

import React, { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import SettingInfoTip from './InfoTip';

interface SettingsRowProps {
  id: string;
  label: string;
  description: string;
  isChanged: boolean;
  onReset: () => void;
  children: ReactNode;
  valueNode?: ReactNode;
  key?: string;
  /** Show the per-setting reset icon when the value differs from default. */
  showReset?: boolean;
  /** Push the info tip to the right edge so it lines up across slider rows. */
  alignInfoRight?: boolean;
}

export default function SettingsRow({ id, label, description, isChanged, onReset, children, valueNode, showReset = true, alignInfoRight = false }: SettingsRowProps) {
  return (
    <div className="settings-row group">
      <div className="settings-rail" aria-hidden="true" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <label htmlFor={`setting-${id}`} className={`text-[13px] font-sans font-medium text-[#ececf5] select-none cursor-pointer ${alignInfoRight ? 'flex-1' : ''}`}>
            {label}
          </label>
          {description ? <SettingInfoTip label={label} text={description} /> : null}
        </div>
        {valueNode}
      </div>
      <div className="flex items-center justify-end gap-1 shrink-0 -mr-1">
        {children}
        {showReset ? (
          isChanged ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              title={`Reset "${label}" to default`}
              aria-label={`Reset "${label}" to default`}
              className="flex w-7 h-9 shrink-0 items-center justify-center rounded-lg border border-[#a99bff]/40 bg-[#8a7dff]/30 text-white hover:bg-[#8a7dff]/45 active:scale-95 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : (
            <span aria-hidden="true" className="w-7 h-9 shrink-0" />
          )
        ) : null}
      </div>
    </div>
  );
}
