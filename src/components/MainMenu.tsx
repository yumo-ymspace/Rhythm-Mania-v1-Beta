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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { playMenuSound } from '../utils/menuSounds';

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
  if (vmin <= 480) {
    return Math.round(Math.max(200, Math.min(220, vmin * 0.54)));
  }
  // Desktop / tablet: noticeably bigger RM cookie (450px - 580px)
  return Math.round(Math.min(580, Math.max(420, vmin * 0.72)));
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
  phase?: LazerMenuPhase;
  onPhaseChange?: (phase: LazerMenuPhase) => void;
};

export const MainMenu = ({
  onNavigate,
  onOpenSettings,
  onOpenBrowse,
  phase: controlledPhase,
  onPhaseChange,
}: MainMenuProps) => {
  const [internalPhase, setInternalPhase] = useState<LazerMenuPhase>('idle');
  const phase = controlledPhase !== undefined ? controlledPhase : internalPhase;
  const setPhase = useCallback((p: LazerMenuPhase) => {
    setInternalPhase(p);
    onPhaseChange?.(p);
  }, [onPhaseChange]);

  const [cookieSize, setCookieSize] = useState(440);
  const [cookieHovered, setCookieHovered] = useState(false);
  const [isCookieClicking, setIsCookieClicking] = useState(false);
  const reducedMotion = useLazerReducedMotion();

  // Logical phase ref: mirrors React state synchronously so rapid presses
  // between renders can't act on a stale phase (which skipped d2).
  const phaseRef = useRef<LazerMenuPhase>('idle');
  // Pending idle -> top-level timer (cookie click waits 70ms for the click peak).
  const idleTimerRef = useRef<number | null>(null);
  // Set once the play-phase navigation fires; blocks repeat d3 on key mash.
  const soloNavigatedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== 'play') soloNavigatedRef.current = false;
  }, [phase]);

  useEffect(() => () => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
  }, []);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    const update = () => setCookieSize(menuCookieSize(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const openTopLevel = useCallback(() => {
    phaseRef.current = 'top-level';
    setPhase('top-level');
  }, [setPhase]);

  const openPlay = useCallback(() => {
    phaseRef.current = 'play';
    setPhase('play');
  }, [setPhase]);

  const returnTopLevel = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    phaseRef.current = 'top-level';
    setPhase('top-level');
  }, [setPhase]);

  const returnIdle = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    soloNavigatedRef.current = false;
    phaseRef.current = 'idle';
    setPhase('idle');
  }, [setPhase]);

  const handleSelectSolo = useCallback(() => {
    if (soloNavigatedRef.current) return;
    soloNavigatedRef.current = true;
    onNavigate('select');
  }, [onNavigate]);

  const handleSelectPlayWithSound = useCallback(() => {
    // Guard stale double-clicks: only the top-level -> play edge plays d2.
    if (phaseRef.current !== 'top-level') return;
    playMenuSound('d2');
    openPlay();
  }, [openPlay]);

  const handleSelectSoloWithSound = useCallback(() => {
    if (soloNavigatedRef.current) return;
    playMenuSound('d3');
    handleSelectSolo();
  }, [handleSelectSolo]);

  const handleCookieClick = useCallback(() => {
    // Drop focus so a focused cookie button can't re-fire via native
    // Enter/Space activation on top of this handler (double d3).
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.id === 'lazer-cookie' || active.closest?.('#lazer-cookie'))) {
      active.blur();
    }
    if (!reducedMotion) {
      setIsCookieClicking(true);
      window.setTimeout(() => setIsCookieClicking(false), 90);
    }
    const logical = phaseRef.current;
    if (logical === 'idle' && idleTimerRef.current === null) {
      playMenuSound('d1');
      // Promote logically right away so a fast follow-up press lands on the
      // top-level edge (d2) instead of replaying d1 while state is pending.
      phaseRef.current = 'top-level';
      // Transition right as the click peak is hit so enlargement flows seamlessly into shrinking
      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;
        openTopLevel();
      }, 70);
    } else if (logical === 'idle') {
      // Fast follow-up during the 70ms idle transition: skip straight to
      // play so d2 is never skipped.
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      playMenuSound('d2');
      openPlay();
    } else if (logical === 'top-level') {
      playMenuSound('d2');
      openPlay();
    } else {
      if (soloNavigatedRef.current) return;
      playMenuSound('d3');
      handleSelectSolo();
    }
  }, [reducedMotion, openTopLevel, openPlay, handleSelectSolo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.repeat) return;

      // Focused cookie button already fires a native click on Enter/Space;
      // handling it here too would double-play the sound.
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('#lazer-cookie')) return;

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

      if (phaseRef.current === 'idle' && isIdleActivationKey(event)) {
        event.preventDefault();
        handleCookieClick();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (phaseRef.current === 'play') {
          returnTopLevel();
        } else if (phaseRef.current === 'top-level') {
          returnIdle();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openTopLevel, returnTopLevel, returnIdle, handleCookieClick]);

  // idle: scale 1, centred
  // top-level / play: smaller cookie parked in the settings–play gap
  const isCompact = phase !== 'idle';
  const hoverBoost = !reducedMotion && cookieHovered ? 1.08 : 1;
  const clickBoost = !reducedMotion && isCookieClicking ? 1.15 : 1;
  // While idle cookie is 420-580px, compact bar cookie scales to 0.48 so it fits the horizontal bar neatly
  const targetScale = (isCompact ? 0.48 : 1.0) * hoverBoost * clickBoost;
  const cookieX = isCompact ? lazerCompactCookieX() : 0;

  // Single unified spring configuration for scale and position so shrinking and moving happen simultaneously
  const compactMotionSpring = { type: 'spring', duration: 0.45, bounce: 0.1 } as const;

  const cookieTransition = reducedMotion
    ? { duration: 0 }
    : {
        scale: isCookieClicking && !isCompact
          ? { type: 'spring', duration: 0.1, bounce: 0.2 }
          : isCompact
            ? compactMotionSpring
            : { type: 'spring', duration: 0.46, bounce: 0.3 },
        x: isCompact
          ? compactMotionSpring
          : { type: 'spring', duration: 0.48, bounce: 0.28 },
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
            onSelectPlay={handleSelectPlayWithSound}
            onSelectSolo={handleSelectSoloWithSound}
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

