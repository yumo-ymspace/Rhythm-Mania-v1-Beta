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

import React, { useEffect, useRef, useCallback } from 'react';
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
import { ComingSoonNotificationStack, useComingSoonToasts } from './ComingSoonNotifications';
import {
  LAZER_SETTINGS,
  LAZER_PLAY,
  LAZER_EDIT,
  LAZER_BROWSE,
  LAZER_EXIT,
  LAZER_BACK,
  LAZER_DURATION,
  LAZER_EASE_OUT_QUINT,
  LAZER_MENU_LEAD_WIDTH_PX,
  LAZER_MENU_SETTINGS_WIDTH_PX,
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
  const {
    toasts: notifications,
    showComingSoon,
    addToast: addNotification,
    handleClickDismiss,
  } = useComingSoonToasts();

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Feature actions ---

  const handleExitClick = useCallback(() => {
    addNotification("You can't exit!", "You're not going nowhere!", 'ban');
  }, [addNotification]);

  // --- Idle timer ---

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (onIdleTimeout) {
      idleTimerRef.current = setTimeout(() => onIdleTimeout(), 15000);
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
            : {
                duration: LAZER_DURATION.barRestore,
                delay: 0.18,
                ease: LAZER_EASE_OUT_QUINT,
              }
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
                  baseWidth={LAZER_MENU_SETTINGS_WIDTH_PX}
                  hoverScale={1.12}
                  onClick={onOpenSettings}
                />
              ) : (
                <MenuButton
                  key="btn-back"
                  id="menu-btn-back"
                  label="back"
                  icon={<BackIcon className="w-6 h-6" />}
                  color={LAZER_BACK}
                  baseWidth={LAZER_MENU_SETTINGS_WIDTH_PX}
                  hoverScale={1.12}
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
                  baseWidth={LAZER_MENU_LEAD_WIDTH_PX}
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
                  onClick={() => showComingSoon('Beatmap editor')}
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
                  baseWidth={LAZER_MENU_LEAD_WIDTH_PX}
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
                  onClick={() => showComingSoon('Multiplayer')}
                />
              )}
              {phase === 'play' && (
                <MenuButton
                  key="btn-playlists"
                  id="menu-btn-playlists"
                  label="playlists"
                  icon={<PlaylistsIcon className="w-6 h-6" />}
                  color="rgb(85, 55, 170)"
                  onClick={() => showComingSoon('Playlists')}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Stacking notification area — fixed top-right, grows downward.
          Shares the same coming-soon system as the toolbar Now Playing button. */}
      <ComingSoonNotificationStack toasts={notifications} onDismiss={handleClickDismiss} />
    </div>
  );
};
