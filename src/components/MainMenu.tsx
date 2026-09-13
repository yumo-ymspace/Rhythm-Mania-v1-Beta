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

import { Github, BookOpen, MessageSquareWarning } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LazerCookie,
  TriangleField,
  ButtonSystem,
  type ButtonSystemPhase,
  LAZER_DURATION,
  LAZER_EASE_IN_SINE,
  LAZER_EASE_OUT_EXPO,
  lazerCompactCookieX,
  useLazerReducedMotion,
} from '../ui/lazer';

export type LazerMenuPhase = 'idle' | 'top-level' | 'play';

export interface MainMenuItem {
  id: 'select' | 'history' | 'skins' | 'settings';
  title: string;
  subtitle: string;
  badge?: string;
  icon: 'play' | 'history' | 'skins' | 'settings';
  accentColor: string;
  gradient: string;
  primary?: boolean;
}

/** Kept for TASK-080 fixtures. Idle chrome no longer renders these cards. */
export const MAIN_MENU_ITEMS: readonly MainMenuItem[] = [
  {
    id: 'select',
    title: 'Play',
    subtitle: 'Solo mania beatmaps',
    badge: 'SOLO',
    icon: 'play',
    accentColor: '#ec4899',
    gradient: 'from-[#8b5cf6] via-[#a855f7] to-[#ec4899]',
    primary: true,
  },
  {
    id: 'history',
    title: 'History',
    subtitle: 'Local scores & replay theater',
    badge: 'LOCAL',
    icon: 'history',
    accentColor: '#f59e0b',
    gradient: 'from-[#d97706] to-[#f59e0b]',
  },
  {
    id: 'skins',
    title: 'Skins',
    subtitle: 'Argon & playfield themes',
    badge: 'THEMES',
    icon: 'skins',
    accentColor: '#06b6d4',
    gradient: 'from-[#0284c7] to-[#06b6d4]',
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'Key binds, audio & options',
    badge: 'OPTIONS',
    icon: 'settings',
    accentColor: '#94a3b8',
    gradient: 'from-[#475569] to-[#64748b]',
  },
] as const;

export const RESOURCE_LINKS = [
  { label: 'Discord', href: 'https://discord.rhythm-mania.com', icon: 'discord' },
  { label: 'Github', href: 'https://github.com/yumo-ymspace/RhythmMania', icon: Github },
  { label: 'Wiki', href: 'https://wiki.rhythm-mania.com', icon: BookOpen },
  { label: 'Bug Report', href: 'https://bug-report.rhythm-mania.com', icon: MessageSquareWarning },
] as const;

export function menuCookieSize(width: number, height: number): number {
  const vmin = Math.min(width, height);
  return Math.round(Math.min(400, Math.max(200, vmin * 0.52)));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function isIdleActivationKey(event: KeyboardEvent): boolean {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  if (isTypingTarget(event.target)) return false;
  if (event.key === 'Escape' || event.key === 'Tab') return false;
  if (/^F\d{1,2}$/.test(event.key)) return false;
  if (
    event.key === 'Shift' ||
    event.key === 'Control' ||
    event.key === 'Alt' ||
    event.key === 'Meta' ||
    event.key === 'CapsLock' ||
    event.key === 'NumLock' ||
    event.key === 'ScrollLock' ||
    event.key === 'Dead'
  ) {
    return false;
  }
  return event.key.length > 0;
}

export type MainMenuProps = {
  onNavigate: (screen: 'select' | 'history' | 'skins') => void;
  onOpenSettings: () => void;
  onOpenBrowse?: () => void;
};

export const MainMenu = ({
  onNavigate,
  onOpenSettings,
  onOpenBrowse,
}: MainMenuProps) => {
  const [phase, setPhase] = useState<LazerMenuPhase>('idle');
  const [cookieSize, setCookieSize] = useState(280);
  const [cookieHovered, setCookieHovered] = useState(false);
  const reducedMotion = useLazerReducedMotion();

  useEffect(() => {
    const update = () => setCookieSize(menuCookieSize(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const openTopLevel = useCallback(() => {
    setPhase('top-level');
  }, []);

  const openPlay = useCallback(() => {
    setPhase('play');
  }, []);

  const returnTopLevel = useCallback(() => {
    setPhase('top-level');
  }, []);

  const returnIdle = useCallback(() => {
    setPhase('idle');
  }, []);

  const handleSelectSolo = useCallback(() => {
    onNavigate('select');
  }, [onNavigate]);

  const handleCookieClick = useCallback(() => {
    if (phase === 'idle') {
      openTopLevel();
    } else if (phase === 'top-level') {
      openPlay();
    } else if (phase === 'play') {
      handleSelectSolo();
    }
  }, [phase, openTopLevel, openPlay, handleSelectSolo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.repeat) return;

      if (
        (event.key === 'Enter' || event.key === ' ') &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        handleCookieClick();
        return;
      }

      if (phase === 'idle' && isIdleActivationKey(event)) {
        event.preventDefault();
        openTopLevel();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (phase === 'play') {
          returnTopLevel();
        } else if (phase === 'top-level') {
          returnIdle();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, openTopLevel, returnTopLevel, returnIdle, handleCookieClick]);

  // idle: scale 1, centred
  // top-level / play: smaller cookie parked in the settings–play gap
  const isCompact = phase !== 'idle';
  const hoverBoost = !reducedMotion && cookieHovered ? 1.08 : 1;
  const targetScale = (isCompact ? 0.66 : 1.0) * hoverBoost;
  const cookieX = isCompact ? lazerCompactCookieX() : 0;

  const cookieMoveEase = isCompact
    ? ([0.22, 1, 0.36, 1] as [number, number, number, number])
    : ([0.16, 1, 0.3, 1] as [number, number, number, number]);
  const cookieMoveDuration = isCompact ? 0.55 : LAZER_DURATION.logoToIdle;

  const cookieTransition = reducedMotion
    ? { duration: 0 }
    : cookieHovered
      ? {
          scale: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
          x: { duration: cookieMoveDuration, ease: cookieMoveEase },
        }
      : {
          scale: { duration: cookieMoveDuration, ease: cookieMoveEase },
          x: { duration: cookieMoveDuration, ease: cookieMoveEase },
        };

  return (
    <div
      id="lazer-main-menu"
      className="lazer-main-menu"
      data-lazer-menu=""
      data-menu-phase={phase}
      role="main"
      aria-label="RhythmMania main menu"
    >
      <TriangleField />

      <motion.div
        className="lazer-cookie-rays"
        initial={false}
        animate={{ scale: targetScale, x: cookieX }}
        transition={cookieTransition}
        style={{ transformOrigin: 'center center' }}
        aria-hidden="true"
      >
        <LazerCookie
          size={cookieSize}
          bpm={60}
          pulse={false}
          showDisc={false}
        />
      </motion.div>

      <AnimatePresence>
        {phase !== 'idle' && (
          <ButtonSystem
            key="lazer-button-system"
            phase={phase as ButtonSystemPhase}
            onSelectPlay={openPlay}
            onSelectSolo={handleSelectSolo}
            onOpenSettings={onOpenSettings}
            onOpenBrowse={onOpenBrowse}
            onBackToTopLevel={returnTopLevel}
            onIdleTimeout={returnIdle}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="lazer-main-menu-cookie"
        initial={false}
        animate={{ scale: targetScale, x: cookieX }}
        transition={cookieTransition}
        style={{
          zIndex: 20,
          transformOrigin: 'center center',
        }}
      >
        <LazerCookie
          size={cookieSize}
          bpm={60}
          pulse={false}
          showSpectrum={false}
          onClick={handleCookieClick}
          onHoverChange={setCookieHovered}
        />
      </motion.div>
    </div>
  );
};

