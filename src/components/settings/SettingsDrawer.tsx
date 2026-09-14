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

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { GameSettings } from '../../types';
import SettingsSidebar from './SettingsSidebar';
import SettingsPane from './SettingsPane';
import OffsetWizardModal from './OffsetWizardModal';
import ConfirmModal from './controls/ConfirmModal';
import { SectionId, SECTIONS, ROWS } from './settingsRegistry';
import {
  BABYLON_PLAYFIELD_WIDTH_MAX,
  BABYLON_PLAYFIELD_WIDTH_MIN,
  isAtDefault,
  DEFAULT_SETTINGS,
} from './defaultSettings';
import * as LucideIcons from 'lucide-react';
import metadata from '../../../metadata.json';
import SettingsToggle from './controls/SettingsToggle';
import SettingsSlider from './controls/SettingsSlider';
import SettingsSelect from './controls/SettingsSelect';
import SettingsButton from './controls/SettingsButton';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
}

export default function SettingsDrawer({ open, onClose, settings, updateSettings }: SettingsDrawerProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [query, setQuery] = useState('');
  const [shaking, setShaking] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (shaking) {
      const t = setTimeout(() => setShaking(false), 250);
      return () => clearTimeout(t);
    }
  }, [shaking]);

  useEffect(() => {
    if (!open) return;
    // Drop focus from any background control so Space/Enter can't re-trigger
    // it while the settings menu is open.
    const active = document.activeElement as HTMLElement | null;
    if (active && !active.closest?.('[data-settings-drawer], [role="dialog"]')) {
      active.blur();
    }
    // Text fields handle their own keys (Enter applies a manual value edit,
    // Escape cancels it). Capture-phase stopPropagation below would otherwise
    // swallow those keys before React ever sees them, so leave them alone.
    // Background listeners already ignore typing targets on their own.
    const isTextEditingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag === 'INPUT') {
        const type = (target as HTMLInputElement).type;
        return type === 'text' || type === 'search' || type === 'number';
      }
      return false;
    };
    // Capture-phase trap: while settings are open, Space/Enter belong only to
    // the settings menu, and Escape closes settings instead of the menu behind.
    // stopPropagation here runs before background window listeners (main menu,
    // song select, etc.) so they never see these keys.
    const trap = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) return;
      if (e.key === 'Escape') {
        if (confirmOpen || wizardOpen) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      // The offset wizard listens for Space on window to register taps.
      if (wizardOpen && e.key === ' ') return;
      if (e.key === 'Enter' || e.key === ' ') {
        const target = e.target as HTMLElement | null;
        const inside = Boolean(target?.closest?.('[data-settings-drawer], [role="dialog"]'));
        // Always hide the key from background listeners.
        e.stopPropagation();
        if (!inside) {
          // Focus is still on the menu behind: swallow so Space/Enter can't
          // trigger it. Native settings controls keep their default behavior.
          e.preventDefault();
        }
      }
    };
    // Also swallow Space keyup from a background focused button (native click
    // activation happens on keyup for Space).
    const trapKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (isTextEditingTarget(e.target)) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('[data-settings-drawer], [role="dialog"]')) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', trap, true);
    window.addEventListener('keyup', trapKeyUp, true);
    return () => {
      window.removeEventListener('keydown', trap, true);
      window.removeEventListener('keyup', trapKeyUp, true);
    };
  }, [open, onClose, confirmOpen, wizardOpen]);

  const resetRow = (id: string) => {
    // If it's a complex object like bindings, we need to deep copy from DEFAULT_SETTINGS
    const dv = id in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[id as keyof GameSettings] : undefined;
    let val = dv;
    if (dv && typeof dv === 'object') {
      val = JSON.parse(JSON.stringify(dv));
    }
    updateSettings({ [id]: val });
  };

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

  const handleRestoreRequest = () => {
    setConfirmOpen(true);
  };

  const restoreAll = () => {
    updateSettings({
      ...DEFAULT_SETTINGS,
      customSkinName: undefined,
      videoOffset: 0,
      disableVideo: false,
      disableParticles: false,
      limitDprToOne: false,
    });
  };

  if (isMobile) {
    const sectionDef = SECTIONS.find(s => s.id === activeSection);
    const rows = ROWS.filter(r => r.section === activeSection).filter(r => {
      if (r.showWhen && !r.showWhen(settings)) return false;
      return true;
    });

    return (
      <>
        <AnimatePresence>
          {open && (
            <motion.div
              key="mobile-settings"
              data-settings-drawer
              className="fixed inset-0 z-50 bg-gradient-to-b from-[#0e121b] via-[#0b0e14] to-[#07090e] flex flex-col font-sans select-none overflow-hidden"
              initial={{ x: '100vw' }}
              animate={{ x: 0 }}
              exit={{ x: '100vw' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            >
              {/* Header */}
              <div className="flex-none px-4 py-4 border-b border-white/[0.08] flex items-center gap-3 bg-[#0a0d14]/95 backdrop-blur-md">
                <button
                  onClick={onClose}
                  className="p-2 -ml-1 rounded-xl bg-white/5 border border-white/10 text-slate-300 active:scale-95 transition cursor-pointer"
                >
                  <LucideIcons.ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,176,255,0.8)]" />
                  <h1 className="text-base font-black uppercase tracking-wider text-white">Settings</h1>
                </div>
              </div>

              {/* Category selector */}
              <div className="flex-none bg-[#090c12]/80 border-b border-white/[0.08] flex flex-wrap gap-2 px-4 py-3 justify-center">
                {SECTIONS.filter(s => s.id !== 'input' && (!s.showWhen || s.showWhen(settings))).map((s) => {
                  const Icon = s.icon;
                  const isActive = s.id === activeSection;

                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black tracking-wider uppercase font-sans transition-all duration-150 shrink-0 cursor-pointer ${
                        isActive 
                          ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_12px_rgba(0,176,255,0.25)]' 
                          : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-300' : 'text-slate-400'}`} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Section with scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]">
                {sectionDef && (
                  <div className="mb-2">
                    <h2 className="text-xl font-sans font-black text-white uppercase tracking-wider">{sectionDef.label}</h2>
                    <p className="text-xs text-slate-400 font-mono mt-1 uppercase tracking-wide leading-relaxed">{sectionDef.description}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {rows.map((row) => {
                    const currentValue = settings[row.id as keyof GameSettings];
                    // Action buttons (e.g. the offset wizard opener) have no
                    // stored value, so they are never marked changed.
                    const isChanged = row.control.kind === 'button' ? false : !isAtDefault(row.id, currentValue);

                    let controlNode = null;
                    let handleMobileSliderReset: (() => void) | null = null;
                    if (row.control.kind === 'toggle') {
                      controlNode = (
                        <div className="scale-95 origin-right">
                          <SettingsToggle
                            id={`setting-mobile-${row.id}`}
                            checked={Boolean(currentValue)}
                            onChange={(v) => updateSettings({ [row.id]: v })}
                          />
                        </div>
                      );
                    } else if (row.control.kind === 'slider') {
                      const isPercent = row.control.percent === true;
                      const baseMin = row.id === 'playfieldWidthPercent' && settings.renderEngine === 'babylon'
                        ? BABYLON_PLAYFIELD_WIDTH_MIN
                        : (row.id === 'noteSizeMultiplier' || row.id === 'receptorSizeMultiplier')
                          ? 0.60
                        : row.control.min;
                      const baseMax = row.id === 'playfieldWidthPercent' && settings.renderEngine === 'babylon'
                        ? BABYLON_PLAYFIELD_WIDTH_MAX
                        : (row.id === 'noteSizeMultiplier' || row.id === 'receptorSizeMultiplier')
                          ? 1.00
                        : row.control.max;
                      // Percent sliders show whole 0-100 integers and parse back to 0-1.
                      const sliderMin = isPercent ? Math.round(baseMin * 100) : baseMin;
                      const sliderMax = isPercent ? Math.round(baseMax * 100) : baseMax;
                      const sliderStep = isPercent ? 1 : row.control.step;
                      const toDisplay = (v: number) => isPercent ? Math.round(v * 100) : Math.round(v);
                      const fromDisplay = (d: number) => isPercent ? Math.round(d) / 100 : Math.round(d);
                      const sliderVal = Number(currentValue);
                      const sliderDefault = Number(DEFAULT_SETTINGS[row.id as keyof GameSettings] ?? baseMin);
                      const flash = sliderFlash && sliderFlash.id === row.id ? sliderFlash : null;
                      const displayVal = flash
                        ? Math.round(flash.from + (flash.to - flash.from) * flash.progress)
                        : toDisplay(sliderVal);
                      handleMobileSliderReset = () => {
                        resetRow(row.id);
                        flashSliderReset(row.id, toDisplay(sliderVal), toDisplay(sliderDefault));
                      };
                      controlNode = (
                        <div className="w-full">
                          <SettingsSlider
                            id={`setting-mobile-${row.id}`}
                            value={displayVal}
                            min={sliderMin}
                            max={sliderMax}
                            step={sliderStep}
                            format={isPercent ? (v: number) => `${v}%` : row.control.format}
                            suffix={isPercent ? undefined : row.control.suffix}
                            onChange={(d) => {
                              cancelSliderFlash();
                              updateSettings({ [row.id]: fromDisplay(d) });
                            }}
                          />
                        </div>
                      );
                    } else if (row.control.kind === 'select') {
                      controlNode = (
                        <div className="relative">
                          <SettingsSelect
                            id={`setting-mobile-${row.id}`}
                            value={String(currentValue)}
                            options={row.control.options}
                            onChange={(v) => updateSettings({ [row.id]: v })}
                          />
                        </div>
                      );
                    } else if (row.control.kind === 'button') {
                      const action = row.control.action;
                      controlNode = (
                        <SettingsButton
                          id={`setting-mobile-${row.id}`}
                          label={row.control.label}
                          danger={action === 'restoreAll'}
                          onClick={() => {
                            if (action === 'openWizard') setWizardOpen(true);
                            if (action === 'restoreAll') handleRestoreRequest();
                          }}
                        />
                      );
                    } else if (row.control.kind === 'custom') {
                      controlNode = row.control.render({
                        settings,
                        update: updateSettings,
                        resetRow,
                        isChanged,
                        openWizard: () => setWizardOpen(true),
                      });
                    }

                     const isCustomOrComplex = row.id === 'bindings' || row.control.kind === 'color-grid';
                    const isVertical = isCustomOrComplex || row.control.kind === 'slider';
                    const isResettable = row.control.kind !== 'button' && row.control.kind !== 'custom';

                    return (
                      <div
                        key={row.id}
                        className={`relative bg-[#0e121b]/90 border border-white/[0.08] px-4 py-2.5 rounded-xl flex ${
                          isVertical ? 'flex-col gap-4' : 'flex-row items-center justify-between gap-4'
                        } text-left`}
                      >
                        <label htmlFor={`setting-mobile-${row.id}`} className="flex flex-col justify-center min-w-0 flex-1 cursor-pointer">
                          <span className="text-sm font-sans font-bold text-white leading-tight uppercase tracking-wider">
                            {row.label}
                          </span>
                          {(!isCustomOrComplex || row.control.kind === 'slider') && (
                            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed font-mono uppercase">
                              {row.description}
                            </p>
                          )}
                        </label>

                        <div className={`flex items-center gap-1 ${isVertical ? 'w-full' : 'shrink-0'}`}>
                          <div className="min-w-0 flex-1">
                            {controlNode}
                          </div>
                          {isResettable ? (
                            isChanged ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (handleMobileSliderReset) handleMobileSliderReset();
                                  else resetRow(row.id);
                                }}
                                title={`Reset "${row.label}" to default`}
                                aria-label={`Reset "${row.label}" to default`}
                                className="flex w-7 h-9 shrink-0 items-center justify-center rounded-lg border border-[#a99bff]/40 bg-[#8a7dff]/30 text-white hover:bg-[#8a7dff]/45 active:scale-95 transition cursor-pointer"
                              >
                                <LucideIcons.RotateCcw className="w-4 h-4" />
                              </button>
                            ) : (
                              <span aria-hidden="true" className="w-7 h-9 shrink-0" />
                            )
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Restore Defaults & Version Sticky Footer */}
              <div className="absolute bottom-0 inset-x-0 p-4 pb-[max(1.5rem,calc(0.75rem+env(safe-area-inset-bottom,0px)))] bg-gradient-to-t from-[#07090e] via-[#07090e]/95 to-transparent border-t border-white/[0.08] flex flex-col items-center">
                <button
                  onClick={handleRestoreRequest}
                  className="w-full py-3 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 active:scale-95 text-rose-200 font-sans font-black text-xs uppercase tracking-widest rounded-xl transition shadow-lg cursor-pointer"
                >
                  Restore defaults
                </button>
                <div className="text-[10px] text-slate-500 font-mono mt-2 uppercase tracking-widest">
                  VERSION {metadata.version}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ConfirmModal
          isOpen={confirmOpen}
          message="Reset every setting to its default value?"
          onConfirm={() => {
            restoreAll();
            setConfirmOpen(false);
          }}
          onCancel={() => setConfirmOpen(false)}
        />

        {wizardOpen && (
          <OffsetWizardModal
            initial={settings.audioOffset}
            onApply={(v) => {
              updateSettings({ audioOffset: v });
              setWizardOpen(false);
            }}
            onClose={() => setWizardOpen(false)}
          />
        )}

      </>
    );
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div 
              key="backdrop"
              className="fixed inset-0 z-40 backdrop-blur-sm"
              style={{
                backgroundColor: `rgba(0, 0, 0, ${settings.settingsMenuBackgroundDim !== undefined ? settings.settingsMenuBackgroundDim : 0.60})`
              }}
              onClick={onClose} 
              aria-hidden 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside
              key="drawer"
              data-settings-drawer
              className="settings-shell fixed inset-y-0 left-0 z-50 w-full md:w-[640px] md:max-w-[92vw] flex flex-col md:flex-row"
              initial={{ x: '-100%', opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <SettingsSidebar 
                activeSection={activeSection} 
                onSelect={setActiveSection}
                onRestoreAll={handleRestoreRequest} 
                settings={settings}
              />
              <div className="flex-1 flex flex-col min-w-0">
                <SettingsPane
                  activeSection={activeSection}
                  query={query}
                  onQueryChange={setQuery}
                  onClose={onClose}
                  shaking={shaking}
                  settings={settings}
                  update={updateSettings}
                  resetRow={resetRow}
                  onNoResults={() => setShaking(true)}
                  openWizard={() => setWizardOpen(true)}
                  restoreAll={handleRestoreRequest}
                  isAtDefault={isAtDefault}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={confirmOpen}
        message="Reset every setting to its default value?"
        onConfirm={restoreAll}
        onCancel={() => setConfirmOpen(false)}
      />

      {wizardOpen && (
        <OffsetWizardModal
          initial={settings.audioOffset}
          onApply={(v) => { updateSettings({ audioOffset: v }); setWizardOpen(false); }}
          onClose={() => setWizardOpen(false)}
        />
      )}
      
    </>
  );
}
