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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings as SettingsIcon,
  Play as PlayIcon,
  Brush as EditIcon,
  Compass as BrowseIcon,
  XCircle as ExitIcon,
  ArrowLeft as BackIcon,
  User as SoloIcon,
  Globe as MultiIcon,
  Trophy as PlaylistsIcon,
} from 'lucide-react';
import { MenuButton } from './MenuButton';
import {
  LAZER_SETTINGS,
  LAZER_PLAY,
  LAZER_EDIT,
  LAZER_BROWSE,
  LAZER_EXIT,
  LAZER_BACK,
  LAZER_DURATION,
  LAZER_EASE_OUT_QUINT,
  useLazerReducedMotion,
} from './motion';

export type ButtonSystemPhase = 'top-level' | 'play';

export type ButtonSystemProps = {
  phase: ButtonSystemPhase;
  onSelectPlay: () => void;
  onSelectSolo: () => void;
  onOpenSettings: () => void;
  onOpenBrowse?: () => void;
  onBackToTopLevel: () => void;
  onIdleTimeout?: () => void;
  className?: string;
};

export const ButtonSystem: React.FC<ButtonSystemProps> = ({
  phase,
  onSelectPlay,
  onSelectSolo,
  onOpenSettings,
  onOpenBrowse,
  onBackToTopLevel,
  onIdleTimeout,
  className = '',
}) => {
  const reducedMotion = useLazerReducedMotion();
  const [showExitDialog, setShowExitDialog] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    if (onIdleTimeout) {
      idleTimerRef.current = setTimeout(() => {
        onIdleTimeout();
      }, 15000);
    }
  }, [onIdleTimeout]);

  useEffect(() => {
    resetIdleTimer();
    const handleActivity = () => resetIdleTimer();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('pointerdown', handleActivity);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('pointerdown', handleActivity);
    };
  }, [resetIdleTimer]);

  const handleExitClick = () => {
    setShowExitDialog(true);
  };

  const handleConfirmExit = () => {
    setShowExitDialog(false);
    onIdleTimeout?.();
  };

  return (
    <div
      className={`lazer-button-system ${className}`}
      data-button-system-phase={phase}
    >
      {/* 100px Grey Strip across viewport */}
      <motion.div
        className="lazer-button-strip"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        exit={{ scaleY: 0, opacity: 0 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: LAZER_DURATION.barRestore, ease: LAZER_EASE_OUT_QUINT }
        }
      >
        <div className="lazer-button-system-layout">
          {/* Left Button Slot (Settings or Back) */}
          <div className="lazer-button-group-left">
            <AnimatePresence mode="popLayout" initial={false}>
              {phase === 'top-level' ? (
                <MenuButton
                  key="btn-settings"
                  id="menu-btn-settings"
                  label="settings"
                  icon={<SettingsIcon className="w-6 h-6" />}
                  color={LAZER_SETTINGS}
                  onClick={onOpenSettings}
                />
              ) : (
                <MenuButton
                  key="btn-back"
                  id="menu-btn-back"
                  label="back"
                  icon={<BackIcon className="w-6 h-6" />}
                  color={LAZER_BACK}
                  onClick={onBackToTopLevel}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Center spacer reserved for the LazerCookie overlap */}
          <div className="lazer-button-system-spacer" aria-hidden="true" />

          {/* Right Button Group */}
          <div className="lazer-button-group-right">
            <AnimatePresence mode="popLayout" initial={false}>
              {phase === 'top-level' && (
                <MenuButton
                  key="btn-play"
                  id="menu-btn-play"
                  label="play"
                  icon={<PlayIcon className="w-6 h-6 fill-current" />}
                  color={LAZER_PLAY}
                  onClick={onSelectPlay}
                />
              )}
              {phase === 'top-level' && (
                <MenuButton
                  key="btn-edit"
                  id="menu-btn-edit"
                  label="edit"
                  icon={<EditIcon className="w-6 h-6" />}
                  color={LAZER_EDIT}
                  disabled
                  disabledTooltip="Beatmap editor is coming in a future update"
                />
              )}
              {phase === 'top-level' && (
                <MenuButton
                  key="btn-browse"
                  id="menu-btn-browse"
                  label="browse"
                  icon={<BrowseIcon className="w-6 h-6" />}
                  color={LAZER_BROWSE}
                  onClick={onOpenBrowse}
                />
              )}
              {phase === 'top-level' && (
                <MenuButton
                  key="btn-exit"
                  id="menu-btn-exit"
                  label="exit"
                  icon={<ExitIcon className="w-6 h-6" />}
                  color={LAZER_EXIT}
                  onClick={handleExitClick}
                />
              )}

              {phase === 'play' && (
                <MenuButton
                  key="btn-solo"
                  id="menu-btn-solo"
                  label="solo"
                  icon={<SoloIcon className="w-6 h-6" />}
                  color={LAZER_PLAY}
                  onClick={onSelectSolo}
                />
              )}
              {phase === 'play' && (
                <MenuButton
                  key="btn-multi"
                  id="menu-btn-multi"
                  label="multi"
                  icon={<MultiIcon className="w-6 h-6" />}
                  color="rgb(94, 63, 186)"
                  disabled
                  disabledTooltip="Multiplayer is coming in a future update"
                />
              )}
              {phase === 'play' && (
                <MenuButton
                  key="btn-playlists"
                  id="menu-btn-playlists"
                  label="playlists"
                  icon={<PlaylistsIcon className="w-6 h-6" />}
                  color="rgb(85, 55, 170)"
                  disabled
                  disabledTooltip="Playlists are coming in a future update"
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Exit Confirmation Dialog */}
      <AnimatePresence>
        {showExitDialog && (
          <motion.div
            id="lazer-exit-dialog-overlay"
            className="lazer-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              id="lazer-exit-dialog"
              className="lazer-dialog-box"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <h3 className="text-xl font-bold text-white mb-2">Quit RhythmMania?</h3>
              <p className="text-slate-300 text-sm mb-6">
                Are you sure you want to return to the idle screen?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  id="lazer-exit-dialog-cancel"
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition-colors"
                  onClick={() => setShowExitDialog(false)}
                >
                  Stay
                </button>
                <button
                  type="button"
                  id="lazer-exit-dialog-confirm"
                  className="px-4 py-2 rounded-lg bg-[#ee3399] hover:bg-[#ff44aa] text-white text-sm font-bold shadow-lg transition-colors"
                  onClick={handleConfirmExit}
                >
                  Exit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
