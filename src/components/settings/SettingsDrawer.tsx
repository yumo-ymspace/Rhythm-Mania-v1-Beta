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
import { motion, AnimatePresence } from 'motion/react';
import type { GameSettings } from '../../types';
import SettingsSidebar from './SettingsSidebar';
import SettingsPane from './SettingsPane';
import OffsetWizardModal from './OffsetWizardModal';
import ConfirmModal from './controls/ConfirmModal';
import { SectionId } from './settingsRegistry';
import {
  isAtDefault,
  DEFAULT_SETTINGS,
} from './defaultSettings';

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

  const handleRestoreRequest = () => {
    setConfirmOpen(true);
  };

  const restoreAll = () => {
    updateSettings({
      ...DEFAULT_SETTINGS,
      customSkinName: undefined,
      videoOffset: 0,
      disableVideo: false,
      disableComboBurst: false,
    });
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div 
              key="backdrop"
              className="fixed inset-0 z-40 backdrop-blur-sm"
              style={{
                backgroundColor: `rgba(0, 0, 0, ${settings.settingsMenuBackgroundDim !== undefined ? settings.settingsMenuBackgroundDim : 0})`
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
