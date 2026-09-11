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
  Play,
  History,
  Paintbrush,
  Github,
  BookOpen,
  MessageSquareWarning,
  ChevronRight,
} from 'lucide-react';
import metadata from '../../metadata.json';

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

const DiscordIcon = ({ className = "h-4 w-4 sm:h-5 sm:w-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} fill-current`}>
    <path d="M19.54 4.86A16.9 16.9 0 0 0 15.4 3.57l-.5 1.02a15.6 15.6 0 0 0-5.8 0l-.5-1.02a16.9 16.9 0 0 0-4.14 1.29C1.84 8.73 1.13 12.5 1.48 16.2a16.7 16.7 0 0 0 5.1 2.58l1.23-1.65c-.68-.25-1.33-.56-1.94-.92l.47-.36c3.74 1.75 8.03 1.75 11.72 0l.48.36c-.62.36-1.27.67-1.95.92l1.23 1.65a16.7 16.7 0 0 0 5.1-2.58c.41-4.29-.7-8.02-3.38-11.34ZM8.5 14.03c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2c1.12 0 2.02.99 2 2.2 0 1.21-.88 2.2-2 2.2Zm7 0c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2c1.12 0 2.02.99 2 2.2s-.88 2.2-2 2.2Z" />
  </svg>
);

const ResourceLinks = () => (
  <nav aria-label="Community and support links" className="flex items-center gap-1.5 sm:gap-2">
    {RESOURCE_LINKS.map(({ label, href, icon: Icon }) => (
      <a
        key={label}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className="group relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-white/10 bg-[#0d1424]/80 text-white/70 shadow-md backdrop-blur-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-white/25 hover:bg-[#18233c] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        {Icon === 'discord' ? <DiscordIcon /> : <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={2.2} />}
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#0b101b] px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
          {label}
        </span>
      </a>
    ))}
  </nav>
);

/**
 * Lightweight floating triangles background simulating osu!(lazer) ambient particles.
 */
const AmbientTrianglesCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;

    interface TriangleParticle {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      angle: number;
      spin: number;
      color: string;
      baseAlpha: number;
    }

    const PARTICLE_COUNT = 32;
    const COLORS = [
      'rgba(6, 182, 212, ',   // cyan
      'rgba(168, 85, 247, ',  // purple
      'rgba(236, 72, 153, ',  // pink
      'rgba(99, 102, 241, ',  // indigo
    ];

    let particles: TriangleParticle[] = [];

    const initParticles = (w: number, h: number) => {
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: 14 + Math.random() * 36,
          speedY: 0.25 + Math.random() * 0.6,
          speedX: (Math.random() - 0.5) * 0.2,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.008,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          baseAlpha: 0.04 + Math.random() * 0.1,
        });
      }
    };

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particles.length === 0) {
        initParticles(width, height);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const drawTriangle = (cx: number, cy: number, size: number, angle: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      const h = size * (Math.sqrt(3) / 2);
      ctx.moveTo(0, -h * (2 / 3));
      ctx.lineTo(size / 2, h / 3);
      ctx.lineTo(-size / 2, h / 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          p.y -= p.speedY;
          p.x += p.speedX;
          p.angle += p.spin;

          if (p.y < -p.size) {
            p.y = height + p.size;
            p.x = Math.random() * width;
          }
          if (p.x < -p.size) p.x = width + p.size;
          if (p.x > width + p.size) p.x = -p.size;
        }

        // Fade near top and bottom edges
        const edgeDist = Math.min(p.y, height - p.y);
        const fade = Math.min(1, Math.max(0, edgeDist / 120));
        const alpha = p.baseAlpha * fade;

        ctx.fillStyle = `${p.color}${alpha.toFixed(3)})`;
        drawTriangle(p.x, p.y, p.size, p.angle);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
    />
  );
};

export const MainMenu = ({
  onNavigate,
  onOpenSettings,
}: {
  onNavigate: (screen: 'select' | 'history' | 'skins') => void;
  onOpenSettings: () => void;
}) => {
  const [showOptions, setShowOptions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard navigation: Escape closes options, P / Enter opens select or toggles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'Escape' && showOptions) {
        e.preventDefault();
        setShowOptions(false);
      } else if ((e.key === 'p' || e.key === 'P') && !showOptions) {
        e.preventDefault();
        setShowOptions(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOptions]);

  const handleActionClick = useCallback((item: MainMenuItem) => {
    if (item.id === 'settings') {
      onOpenSettings();
    } else {
      onNavigate(item.id);
    }
  }, [onNavigate, onOpenSettings]);

  const renderIcon = (iconName: MainMenuItem['icon']) => {
    switch (iconName) {
      case 'play':
        return <Play className="w-6 h-6 sm:w-7 sm:h-7 text-white fill-white shrink-0" />;
      case 'history':
        return <History className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0" />;
      case 'skins':
        return <Paintbrush className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />;
      case 'settings':
        return <SettingsIcon className="w-5 h-5 sm:w-6 sm:h-6 text-slate-300 shrink-0" />;
    }
  };

  return (
    <div
      ref={menuContainerRef}
      className="absolute inset-0 w-full h-full overflow-hidden flex flex-col items-center justify-center bg-transparent select-none"
    >
      {/* Dynamic Keyframes for beat pulse and ripple ring */}
      <style>{`
        @keyframes rmLogoBeat {
          0% { transform: scale(1); }
          12% { transform: scale(1.042); }
          24% { transform: scale(1.006); }
          36% { transform: scale(1.02); }
          65% { transform: scale(1); }
          100% { transform: scale(1); }
        }
        @keyframes rmRingBeat {
          0% { transform: scale(0.94); opacity: 0.6; }
          100% { transform: scale(1.36); opacity: 0; }
        }
        .animate-rm-logo-beat {
          animation: rmLogoBeat 0.9375s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
        }
        .animate-rm-ring-beat {
          animation: rmRingBeat 0.9375s cubic-bezier(0.1, 0.7, 0.1, 1) infinite;
        }
      `}</style>

      {/* 1. Ambient Background Particles (osu!lazer floating triangles) */}
      <AmbientTrianglesCanvas />

      {/* 2. Ambient dark gradients */}
      <div className="absolute inset-0 bg-radial from-transparent via-[#060a12]/40 to-[#03060c]/85 pointer-events-none z-0" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-0" />

      {/* Click outside backdrop when options are open to close menu */}
      {showOptions && (
        <div
          onClick={() => setShowOptions(false)}
          className="absolute inset-0 z-10 bg-black/25 backdrop-blur-[1px] transition-opacity duration-300 cursor-default"
          aria-hidden="true"
        />
      )}

      {/* 3. Central Interactive Area: Logo + Stacked Actions */}
      <div className="relative z-20 w-full max-w-5xl px-4 sm:px-6 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 lg:gap-14 my-auto">
        
        {/* CENTER PULSING LOGO */}
        <motion.div
          layout
          animate={{
            x: showOptions ? (isMobile ? 0 : -20) : 0,
            scale: showOptions ? (isMobile ? 0.88 : 0.92) : 1,
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="relative flex flex-col items-center justify-center shrink-0 cursor-pointer"
        >
          {/* Outward Expanding Beat Ripple Ring */}
          <div
            aria-hidden="true"
            className="animate-rm-ring-beat pointer-events-none absolute w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 lg:w-80 lg:h-80 rounded-full border-2 border-pink-500/40 bg-pink-500/10"
          />

          {/* Core Circular Logo Button */}
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowOptions(!showOptions)}
            role="button"
            tabIndex={0}
            aria-label="RhythmMania Main Menu Toggle"
            aria-expanded={showOptions}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowOptions(!showOptions);
              }
            }}
            className="w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 lg:w-80 lg:h-80 rounded-full bg-black/40 backdrop-blur-xl border-4 sm:border-[6px] border-white/25 shadow-[0_0_55px_rgba(236,72,153,0.38)] hover:border-white/45 hover:shadow-[0_0_75px_rgba(236,72,153,0.6)] active:border-white/60 relative flex flex-col items-center justify-center group transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-pink-400"
          >
            {/* Inner radial gradient aura */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-pink-600/30 via-purple-600/20 to-cyan-500/20 group-hover:from-pink-600/45 group-hover:to-cyan-500/30 pointer-events-none transition-colors duration-300" />
            
            {/* Wordmark beating to rhythm */}
            <div className="animate-rm-logo-beat flex flex-col items-center justify-center pointer-events-none z-10">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter text-white text-center leading-[1.05] drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
                Rhythm<br />
                <span className="bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent">
                  Mania
                </span>
              </h1>

              {/* Version badge */}
              <div className="mt-2.5 px-3 py-0.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm text-[11px] sm:text-xs font-mono font-bold tracking-[0.2em] text-white/90 shadow-sm">
                {metadata.version}
              </div>

              {/* Action hint when closed */}
              {!showOptions && (
                <span className="mt-2.5 text-[10px] sm:text-[11px] font-sans font-bold tracking-widest uppercase text-white/65 group-hover:text-white transition-colors">
                  Click to play
                </span>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* STACKED ACTION BUTTONS (osu!lazer style) */}
        <AnimatePresence>
          {showOptions && (
            <motion.div
              initial={{ opacity: 0, x: isMobile ? 0 : 30, y: isMobile ? 18 : 0, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: isMobile ? 0 : 20, y: isMobile ? 14 : 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="w-full max-w-[340px] sm:max-w-[380px] md:max-w-[390px] lg:max-w-[420px] flex flex-col gap-2.5 sm:gap-3 shrink-0 z-20"
            >
              {MAIN_MENU_ITEMS.map((item, idx) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.045, duration: 0.18, ease: 'easeOut' }}
                  whileHover={{ x: 6, scale: 1.015 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleActionClick(item)}
                  className={`group relative flex items-center gap-3.5 sm:gap-4 rounded-2xl p-3 sm:p-3.5 text-left transition-all duration-150 cursor-pointer shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060a12] ${
                    item.primary
                      ? 'bg-gradient-to-r from-[#7c3aed] via-[#9333ea] to-[#ec4899] text-white border border-white/30 shadow-[0_8px_24px_rgba(147,51,234,0.38)] hover:shadow-[0_10px_30px_rgba(236,72,153,0.5)] focus-visible:ring-pink-300'
                      : 'bg-[#0d1424]/90 hover:bg-[#152038]/95 border border-white/10 hover:border-white/25 text-white shadow-[0_6px_20px_rgba(0,0,0,0.3)] focus-visible:ring-cyan-400'
                  }`}
                >
                  {/* Left colored accent indicator line */}
                  <div
                    className={`w-1.5 self-stretch rounded-full shrink-0 transition-transform duration-150 group-hover:scale-y-110 ${
                      item.primary
                        ? 'bg-white shadow-[0_0_8px_white]'
                        : item.id === 'history'
                        ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                        : item.id === 'skins'
                        ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                        : 'bg-slate-300 shadow-[0_0_8px_rgba(203,213,225,0.6)]'
                    }`}
                  />

                  {/* Action Icon in styled container */}
                  <div
                    className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                      item.primary
                        ? 'bg-white/20 shadow-inner'
                        : 'bg-white/[0.06] border border-white/10 group-hover:bg-white/10'
                    }`}
                  >
                    {renderIcon(item.icon)}
                  </div>

                  {/* Title & Subtitle */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-sans font-black tracking-wide uppercase leading-none ${
                          item.primary
                            ? 'text-lg sm:text-xl text-white'
                            : 'text-base sm:text-lg text-white group-hover:text-cyan-200 transition-colors'
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-black tracking-wider uppercase ${
                            item.primary
                              ? 'bg-white/20 text-white'
                              : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs font-sans truncate mt-1 ${
                        item.primary ? 'text-white/85' : 'text-slate-400 group-hover:text-slate-300'
                      }`}
                    >
                      {item.subtitle}
                    </span>
                  </div>

                  {/* Right Chevron arrow indicator */}
                  <ChevronRight
                    className={`h-5 w-5 shrink-0 transition-transform duration-150 group-hover:translate-x-1 ${
                      item.primary ? 'text-white/80' : 'text-slate-500 group-hover:text-white/80'
                    }`}
                  />
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* 4. Footer & Resources (Quiet and clean, matching Argon) */}
      <footer className="absolute bottom-[max(1rem,calc(0.75rem+env(safe-area-inset-bottom,0px)))] inset-x-4 sm:inset-x-8 flex flex-col sm:flex-row items-center justify-between gap-2.5 z-30 pointer-events-auto">
        {/* Left: Version and quiet resource links */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-white/35 font-bold tracking-wider">
            {metadata.version}
          </span>
          <div className="h-3 w-px bg-white/15" />
          <ResourceLinks />
        </div>

        {/* Right: Terms & Privacy policy links */}
        <div className="text-[10px] sm:text-[11px] text-white/40 font-sans text-center sm:text-right max-w-sm">
          By using RhythmMania, you acknowledge the{' '}
          <a
            href="https://terms-of-service.rhythm-mania.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/60 hover:text-white underline transition-colors"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="https://privacy-policy.rhythm-mania.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/60 hover:text-white underline transition-colors"
          >
            Privacy Policy
          </a>
          .
        </div>
      </footer>
    </div>
  );
};
