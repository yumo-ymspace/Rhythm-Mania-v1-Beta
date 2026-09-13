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
  Info as InfoIcon,
  Ban as BanIcon,
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
  LAZER_MENU_LEAD_WIDTH_PX,
  LAZER_MENU_SETTINGS_WIDTH_PX,
  useLazerReducedMotion,
} from './motion';


export type ButtonSystemPhase = 'top-level' | 'play';

/** A single stackable toast notification. */
type ToastNotification = {
  id: string;
  title: string;
  detail?: string;
  iconType: 'info' | 'ban';
  /**
   * Set to true just before removal on click, so that AnimatePresence
   * captures the throw-left exit animation rather than the slide-right one.
   */
  clickDismissed: boolean;
};

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
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  /** Per-notification auto-dismiss timers. */
  const timerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Notification helpers ---

  const clearNotifTimer = (id: string) => {
    const t = timerMapRef.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timerMapRef.current.delete(id);
    }
  };

  const removeNotification = useCallback((id: string) => {
    clearNotifTimer(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback(
    (title: string, detail: string | undefined, iconType: 'info' | 'ban') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setNotifications(prev => [
        ...prev,
        { id, title, detail, iconType, clickDismissed: false },
      ]);
      const t = setTimeout(() => removeNotification(id), 2400);
      timerMapRef.current.set(id, t);
    },
    [removeNotification],
  );

  /**
   * Dismiss a notification via click using a two-step approach:
   * 1. Mark clickDismissed: true → React re-renders with the throw-left exit prop.
   * 2. Remove in the next animation frame → AnimatePresence captures the updated exit.
   */
  const handleClickDismiss = useCallback(
    (id: string) => {
      clearNotifTimer(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, clickDismissed: true } : n)),
      );
      requestAnimationFrame(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      });
    },
    [],
  );

  // Cleanup all timers on unmount.
  useEffect(() => {
    return () => {
      timerMapRef.current.forEach(t => clearTimeout(t));
      timerMapRef.current.clear();
    };
  }, []);

  // --- Feature actions ---

  const showComingSoon = useCallback(
    (feature: string) => {
      addNotification('Coming soon', feature, 'info');
    },
    [addNotification],
  );

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

      {/* Stacking notification area — fixed top-right, grows downward */}
      <div className="lazer-notification-stack">
        <AnimatePresence>
          {notifications.map(notif => (
            <motion.aside
              key={notif.id}
              className="lazer-coming-soon"
              role="status"
              aria-live="polite"
              layout
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={
                notif.clickDismissed
                  ? {
                      opacity: 0,
                      x: -340,
                      y: 28,
                      rotate: -14,
                      transition: { duration: 0.42, ease: [0.4, 0, 0.9, 0.55] },
                    }
                  : {
                      opacity: 0,
                      x: 48,
                      transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
                    }
              }
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => handleClickDismiss(notif.id)}
            >
              <span className="lazer-coming-soon-icon" aria-hidden="true">
                {notif.iconType === 'info' ? (
                  <InfoIcon className="w-4 h-4" strokeWidth={2.4} />
                ) : (
                  <BanIcon className="w-4 h-4" strokeWidth={2.4} />
                )}
              </span>
              <span className="lazer-coming-soon-copy">
                <span className="lazer-coming-soon-title">{notif.title}</span>
                {notif.detail && (
                  <span className="lazer-coming-soon-detail">{notif.detail}</span>
                )}
              </span>
            </motion.aside>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
