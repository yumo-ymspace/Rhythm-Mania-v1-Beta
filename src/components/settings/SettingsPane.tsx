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

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { GameSettings } from '../../types';
import type { SectionId, RowDef } from './settingsRegistry';
import { SECTIONS, SUBGROUPS, ROWS } from './settingsRegistry';
import SettingsRow from './SettingsRow';
import SettingsToggle from './controls/SettingsToggle';
import SettingsSlider, { SliderValue } from './controls/SettingsSlider';
import SettingsSelect from './controls/SettingsSelect';
import SettingsButton from './controls/SettingsButton';
import SettingsText from './controls/SettingsText';
import SettingsSearchBar from './SettingsSearchBar';

interface SettingsPaneProps {
  activeSection: SectionId;
  query: string;
  onQueryChange: (v: string) => void;
  onClose: () => void;
  shaking: boolean;
  settings: GameSettings;
  update: (patch: Partial<GameSettings>) => void;
  resetRow: (id: string) => void;
  onNoResults: () => void;
  openWizard: () => void;
  restoreAll: () => void;
  isAtDefault: (id: string, value: unknown) => boolean;
}

export default function SettingsPane({
  activeSection,
  query,
  onQueryChange,
  onClose,
  shaking,
  settings,
  update,
  resetRow,
  onNoResults,
  openWizard,
  restoreAll,
  isAtDefault,
}: SettingsPaneProps) {
  const q = query.trim().toLowerCase();
  const wasNoResultsRef = useRef(false);

  const rows = ROWS.filter(r => {
    if (q) return true; // If searching, ignore section filter initially
    return r.section === activeSection;
  }).filter(r => {
    if (r.showWhen && !r.showWhen(settings)) return false;
    if (!q) return true;
    const combined = [r.label, r.description, ...(r.keywords || [])].join(' ').toLowerCase();
    return combined.includes(q);
  });

  useEffect(() => {
    const hasNoResults = Boolean(q) && rows.length === 0;
    if (hasNoResults && !wasNoResultsRef.current) {
      onNoResults();
    }
    wasNoResultsRef.current = hasNoResults;
  }, [q, rows.length, onNoResults]);

  const sectionDef = SECTIONS.find(s => s.id === activeSection);

  // Bouncy purely-visual reset animation: the setting itself jumps to its
  // default instantly while the slider display springs there over ~280ms.
  const sliderAnimRef = useRef<number | null>(null);
  const [sliderFlash, setSliderFlash] = useState<{ id: string; from: number; to: number; progress: number } | null>(null);
  useEffect(() => () => {
    if (sliderAnimRef.current !== null) cancelAnimationFrame(sliderAnimRef.current);
  }, []);
  const cancelSliderFlash = () => {
    if (sliderAnimRef.current !== null) {
      cancelAnimationFrame(sliderAnimRef.current);
      sliderAnimRef.current = null;
    }
    setSliderFlash(null);
  };
  const flashSliderReset = (rowId: string, from: number, to: number) => {
    if (sliderAnimRef.current !== null) cancelAnimationFrame(sliderAnimRef.current);
    if (from === to) return;
    const durationMs = 280;
    const start = performance.now();
    setSliderFlash({ id: rowId, from, to, progress: 0 });
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const c = 1.70158;
      const eased = 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
      if (t < 1) {
        setSliderFlash({ id: rowId, from, to, progress: eased });
        sliderAnimRef.current = requestAnimationFrame(tick);
      } else {
        sliderAnimRef.current = null;
        setSliderFlash(null);
      }
    };
    sliderAnimRef.current = requestAnimationFrame(tick);
  };

  const renderRow = (row: RowDef) => {
    // Need to pass the isChanged value. Action buttons (e.g. the
    // offset wizard opener) have no stored value, so they are never
    // marked changed.
    const currentValue = settings[row.id as keyof GameSettings];
    const isChanged = row.control.kind === 'button' ? false : !isAtDefault(row.id, currentValue);

    let controlNode = null;
    let valueNode: ReactNode = null;
    let handleSliderReset: (() => void) | null = null;
    if (row.control.kind === 'toggle') {
      controlNode = (
        <SettingsToggle
          id={`setting-${row.id}`}
          checked={Boolean(currentValue)}
          onChange={(v) => update({ [row.id]: v })}
        />
      );
    } else if (row.control.kind === 'slider') {
      const isPercent = row.control.percent === true;
      const baseMin = (row.id === 'noteSizeMultiplier' || row.id === 'receptorSizeMultiplier')
          ? 0.60
        : row.control.min;
      const baseMax = (row.id === 'noteSizeMultiplier' || row.id === 'receptorSizeMultiplier')
          ? 1.00
        : row.control.max;
      // Percent sliders show whole 0-100 integers and parse back to 0-1.
      const sliderMin = isPercent ? Math.round(baseMin * 100) : baseMin;
      const sliderMax = isPercent ? Math.round(baseMax * 100) : baseMax;
      const sliderStep = isPercent ? 1 : row.control.step;
      const toDisplay = (v: number) => isPercent ? Math.round(v * 100) : Math.round(v);
      const fromDisplay = (d: number) => isPercent ? Math.round(d) / 100 : Math.round(d);
      const sliderVal = currentValue === undefined || currentValue === null || Number.isNaN(Number(currentValue))
        ? Number(row.defaultValue ?? 0)
        : Number(currentValue);
      const sliderDefault = Number(row.defaultValue ?? baseMin);
      const flash = sliderFlash && sliderFlash.id === row.id ? sliderFlash : null;
      const displayVal = flash
        ? Math.round(flash.from + (flash.to - flash.from) * flash.progress)
        : toDisplay(sliderVal);
      handleSliderReset = () => {
        resetRow(row.id);
        flashSliderReset(row.id, toDisplay(sliderVal), toDisplay(sliderDefault));
      };
      const cancelAndUpdateSlider = (d: number) => {
        cancelSliderFlash();
        update({ [row.id]: fromDisplay(d) });
      };
      valueNode = (
        <SliderValue
          value={displayVal}
          min={sliderMin}
          max={sliderMax}
          format={isPercent ? (v: number) => `${v}%` : row.control.format}
          suffix={isPercent ? undefined : row.control.suffix}
          onChange={cancelAndUpdateSlider}
        />
      );
      controlNode = (
        <div className="w-32 sm:w-40">
          <SettingsSlider
            id={`setting-${row.id}`}
            value={displayVal}
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            onChange={cancelAndUpdateSlider}
            bare
          />
        </div>
      );
    } else if (row.control.kind === 'text') {
      controlNode = (
        <SettingsText
          id={`setting-${row.id}`}
          value={typeof currentValue === 'string' ? currentValue : String(row.defaultValue ?? '')}
          maxLength={row.control.maxLength}
          placeholder={row.control.placeholder}
          onChange={(v) => update({ [row.id]: v })}
        />
      );
    } else if (row.control.kind === 'select') {
      controlNode = (
        <SettingsSelect
          id={`setting-${row.id}`}
          value={currentValue !== undefined ? String(currentValue) : (row.defaultValue !== undefined ? String(row.defaultValue) : '')}
          options={row.control.options}
          onChange={(v) => update({ [row.id]: v })}
        />
      );
    } else if (row.control.kind === 'button') {
      const action = row.control.action;
      controlNode = (
        <SettingsButton
          id={`setting-${row.id}`}
          label={row.control.label}
          danger={action === 'restoreAll'}
          onClick={() => {
            if (action === 'openWizard') openWizard();
            if (action === 'restoreAll') restoreAll();
          }}
        />
      );
    } else if (row.control.kind === 'custom') {
      controlNode = row.control.render({
        settings,
        update,
        resetRow,
        isChanged,
        openWizard,
      });

       if (row.id === 'bindings') {
        return <div key={row.id} className="w-full">{controlNode}</div>;
      }
    }

    const isResettable = row.control.kind !== 'button' && row.control.kind !== 'custom';
    return (
      <SettingsRow
        key={row.id}
        id={row.id}
        label={row.label}
        description={row.description}
        isChanged={isChanged}
        onReset={handleSliderReset ?? (() => resetRow(row.id))}
        valueNode={valueNode}
        showReset={isResettable}
        alignInfoRight={row.control.kind === 'slider'}
      >
        {controlNode}
      </SettingsRow>
    );
  };

  // Split section rows into main rows and named subgroups (e.g. Visual -> Dim).
  // Subgroups render after the main rows with their own section-style header.
  const mainRows = q ? rows : rows.filter((r) => !r.subgroup);
  const subgroupOrder: string[] = [];
  const subgroupRows: Record<string, RowDef[]> = {};
  if (!q) {
    for (const r of rows) {
      if (!r.subgroup) continue;
      if (!subgroupRows[r.subgroup]) {
        subgroupRows[r.subgroup] = [];
        subgroupOrder.push(r.subgroup);
      }
      subgroupRows[r.subgroup].push(r);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6 bg-[#302e39]">
      <div className="-mx-5 px-5 pt-5 pb-3 bg-[#26252d] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-none font-sans font-semibold text-white">settings</h1>
          <p className="text-xs text-[#a3a3c2] font-sans mt-1.5">change the way RhythmMania behaves</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-[#9d9dbd] hover:text-white bg-white/[0.05] hover:bg-white/[0.1] rounded-md transition-colors flex-none cursor-pointer active:scale-95"
          title="Close (Esc)"
          aria-label="Close settings"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <SettingsSearchBar value={query} onChange={onQueryChange} onClose={onClose} shaking={shaking} />
      {!q && sectionDef && (
        <div className="mt-3 mb-3">
          <h2 className="text-xl font-sans font-semibold text-white">{sectionDef.label}</h2>
          <p className="text-xs text-[#a3a3c2] font-sans mt-1">{sectionDef.description}</p>
        </div>
      )}

      {q && rows.length === 0 ? (
        <div className="text-[#a3a3c2] font-sans text-sm mt-8">
          No settings match &ldquo;{query}&rdquo;.
        </div>
      ) : q ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => renderRow(row))}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {mainRows.map((row) => renderRow(row))}
          </div>
          {subgroupOrder.map((name) => {
            const def = SUBGROUPS[name];
            return (
              <div key={name}>
                <div className="mt-3 mb-3">
                  <h2 className="text-xl font-sans font-semibold text-white">{def?.label ?? name}</h2>
                  {def?.description ? (
                    <p className="text-xs text-[#a3a3c2] font-sans mt-1">{def.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  {subgroupRows[name].map((row) => renderRow(row))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
