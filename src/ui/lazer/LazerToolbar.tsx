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
import {
  Settings as SettingsIcon,
  Home as HomeIcon,
  Code as ChangelogIcon,
  BookOpen as WikiIcon,
  Compass as ListingIcon,
  Music2 as MusicIcon,
  Bell as BellIcon,
  Github as GithubIcon,
  MessageSquareWarning as BugReportIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  LAZER_DURATION,
  LAZER_EASE_OUT_QUINT,
} from './motion';

const DiscordIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.075.075 0 0 1 .078.01c.12.098.246.195.373.288a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.893a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

export interface LazerTooltipData {
  title: string;
  subtitle?: string;
  shortcut?: string;
  align?: 'left' | 'right';
}

export interface ToolbarTooltipProps {
  data: LazerTooltipData | null;
  anchorRect: DOMRect | null;
}

export const ToolbarTooltip: React.FC<ToolbarTooltipProps> = ({ data, anchorRect }) => {
  if (!data || !anchorRect) return null;

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const isRight = data.align === 'right';

  // Position tooltip aligned either to the button's right edge or left edge, clamped inside viewport.
  const top = anchorRect.bottom + 6;
  const right = isRight ? Math.max(12, Math.min(winWidth - 12, winWidth - anchorRect.right)) : undefined;
  const left = !isRight ? Math.max(12, Math.min(winWidth - 220, anchorRect.left)) : undefined;

  return (
    <motion.div
      className={`lazer-toolbar-tooltip ${isRight ? 'is-align-right' : ''}`}
      role="tooltip"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: LAZER_DURATION.tooltip, ease: LAZER_EASE_OUT_QUINT }}
      style={{
        position: 'fixed',
        ...(isRight ? { right: `${right}px` } : { left: `${left}px` }),
        top: `${top}px`,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div className="lazer-toolbar-tooltip-content">
        <div className="lazer-toolbar-tooltip-main">
          <span className="lazer-toolbar-tooltip-title">{data.title}</span>
          {data.shortcut && (
            <span className="lazer-toolbar-tooltip-shortcut">{data.shortcut}</span>
          )}
        </div>
        {data.subtitle && (
          <span className="lazer-toolbar-tooltip-subtitle">{data.subtitle}</span>
        )}
      </div>
    </motion.div>
  );
};

export interface LazerToolbarProps {
  visible?: boolean;
  onOpenSettings?: () => void;
  onGoHome?: () => void;
  onOpenListing?: () => void;
  onToggleNowPlaying?: () => void;
  onNowPlayingHoverChange?: (hovering: boolean) => void;
  isListingOpen?: boolean;
  isNowPlayingOpen?: boolean;
  localDisplayName?: string;
  avatarUrl?: string;
  className?: string;
}

const SESSION_START_TIME = Date.now();

export const LazerToolbar: React.FC<LazerToolbarProps> = ({
  visible = true,
  onOpenSettings,
  onGoHome,
  onOpenListing,
  onToggleNowPlaying,
  onNowPlayingHoverChange,
  isListingOpen = false,
  isNowPlayingOpen = false,
  localDisplayName,
  avatarUrl = '/avatars/preset_01.png',
  className = '',
}) => {
  const [tooltip, setTooltip] = useState<{ data: LazerTooltipData; rect: DOMRect } | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [runningTime, setRunningTime] = useState('00:00:00');
  const [notificationCount, setNotificationCount] = useState<number>(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  // Notifications are populated at runtime by real events (e.g. coming-soon toasts pushed
  // via pushNotification). No fake/seed items are pre-loaded.
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; detail: string; time: string; read?: boolean }>>([]);
  const notifRef = useRef<HTMLDivElement | null>(null);
  // Keep the toolbar above the listing panel for the full exit animation so
  // the panel slides back up underneath the toolbar (mirroring the enter
  // animation) instead of sliding over it when `isListingOpen` flips false.
  const [isListingElevated, setIsListingElevated] = useState(isListingOpen);
  const listingElevateTimer = useRef<number | null>(null);

  useEffect(() => {
    if (isListingOpen) {
      if (listingElevateTimer.current !== null) {
        window.clearTimeout(listingElevateTimer.current);
        listingElevateTimer.current = null;
      }
      setIsListingElevated(true);
      return;
    }
    // Listing exit animation is 250ms; keep elevation slightly longer.
    listingElevateTimer.current = window.setTimeout(() => {
      setIsListingElevated(false);
      listingElevateTimer.current = null;
    }, 300);
    return () => {
      if (listingElevateTimer.current !== null) {
        window.clearTimeout(listingElevateTimer.current);
        listingElevateTimer.current = null;
      }
    };
  }, [isListingOpen]);

  // Live clock updating each second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format: h:mm:ss AM/PM
      let hours = now.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 becomes 12
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}:${seconds} ${ampm}`);

      // Running time: hh:mm:ss
      const elapsedSec = Math.floor((Date.now() - SESSION_START_TIME) / 1000);
      const runH = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
      const runM = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
      const runS = String(elapsedSec % 60).padStart(2, '0');
      setRunningTime(`${runH}:${runM}:${runS}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close notifications on outside click or Escape
  useEffect(() => {
    if (!isNotificationsOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const bell = document.getElementById('toolbar-btn-notifications');
      if (
        notifRef.current &&
        !notifRef.current.contains(e.target as Node) &&
        bell &&
        !bell.contains(e.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsNotificationsOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotificationsOpen]);

  const handleMouseEnter = (
    e: React.MouseEvent<HTMLElement>,
    data: LazerTooltipData
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ data, rect });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  const handleDismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      setNotificationCount(updated.filter((n) => !n.read).length);
      return updated;
    });
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
    setNotificationCount(0);
  };

  // Keyboard shortcut listener for F6 (now playing) and Ctrl+B (listing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'F6') {
        e.preventDefault();
        onToggleNowPlaying?.();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'b' || e.key === 'B')
      ) {
        e.preventDefault();
        onOpenListing?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleNowPlaying, onOpenListing]);

  const playerName = localDisplayName?.trim() || 'Guest';

  return (
    <div
      id="lazer-toolbar"
      className={`lazer-toolbar ${visible ? 'is-visible' : 'is-hidden'} ${isListingOpen || isListingElevated ? 'is-above-listing' : ''} ${className}`}
      data-lazer-toolbar=""
      role="banner"
      aria-label="RhythmMania top toolbar"
    >
      {/* Left Section: Settings, Home */}
      <div className="lazer-toolbar-section lazer-toolbar-left">
        {/* Settings button */}
        <button
          type="button"
          id="toolbar-btn-settings"
          className="lazer-toolbar-btn"
          aria-label="Settings"
          onClick={onOpenSettings}
          onMouseEnter={(e) =>
            handleMouseEnter(e, {
              title: 'settings',
              subtitle: 'change settings',
              shortcut: 'Ctrl+O',
            })
          }
          onMouseLeave={handleMouseLeave}
        >
          <SettingsIcon className="lazer-toolbar-icon" />
        </button>

        {/* Home button */}
        <button
          type="button"
          id="toolbar-btn-home"
          className="lazer-toolbar-btn"
          aria-label="Home"
          onClick={onGoHome}
          onMouseEnter={(e) =>
            handleMouseEnter(e, {
              title: 'home',
              subtitle: 'return to main menu',
            })
          }
          onMouseLeave={handleMouseLeave}
        >
          <HomeIcon className="lazer-toolbar-icon" />
        </button>
      </div>

      {/* Right Section: Utilities, Listing, Now-playing, Profile, Clock, Bell */}
      <div className="lazer-toolbar-section lazer-toolbar-right">
        {/* Aux tools (changelog, discord, github, bug report, wiki) - hidden on small mobile */}
        <div className="lazer-toolbar-aux-tools">
          {/* Changelog */}
          <a
            href="https://changelog.rhythm-mania.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lazer-toolbar-btn is-stub"
            aria-label="Changelog"
            onMouseEnter={(e) =>
              handleMouseEnter(e, {
                title: 'changelog',
                subtitle: 'development updates',
                align: 'right',
              })
            }
            onMouseLeave={handleMouseLeave}
          >
            <ChangelogIcon className="lazer-toolbar-icon" />
          </a>

          {/* Discord */}
          <a
            href="https://discord.rhythm-mania.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lazer-toolbar-btn is-stub"
            aria-label="Discord"
            onMouseEnter={(e) =>
              handleMouseEnter(e, {
                title: 'discord',
                subtitle: 'join community server',
                align: 'right',
              })
            }
            onMouseLeave={handleMouseLeave}
          >
            <DiscordIcon className="lazer-toolbar-icon" />
          </a>

          {/* GitHub */}
          <a
            href="https://github.rhythm-mania.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lazer-toolbar-btn is-stub"
            aria-label="GitHub"
            onMouseEnter={(e) =>
              handleMouseEnter(e, {
                title: 'github',
                subtitle: 'source code repository',
                align: 'right',
              })
            }
            onMouseLeave={handleMouseLeave}
          >
            <GithubIcon className="lazer-toolbar-icon" />
          </a>

          {/* Bug Report */}
          <a
            href="https://bug-report.rhythm-mania.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lazer-toolbar-btn is-stub"
            aria-label="Bug Report"
            onMouseEnter={(e) =>
              handleMouseEnter(e, {
                title: 'bug report',
                subtitle: 'report an issue or bug',
                align: 'right',
              })
            }
            onMouseLeave={handleMouseLeave}
          >
            <BugReportIcon className="lazer-toolbar-icon" />
          </a>

          {/* Wiki */}
          <a
            href="https://wiki.rhythm-mania.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lazer-toolbar-btn is-stub"
            aria-label="Wiki"
            onMouseEnter={(e) =>
              handleMouseEnter(e, {
                title: 'wiki',
                subtitle: 'knowledge base',
                align: 'right',
              })
            }
            onMouseLeave={handleMouseLeave}
          >
            <WikiIcon className="lazer-toolbar-icon" />
          </a>
        </div>

        {/* Primary Functional Buttons */}

        {/* Beatmap listing (Browse) */}
        <button
          type="button"
          id="toolbar-btn-listing"
          className={`lazer-toolbar-btn ${isListingOpen ? 'is-active-pink' : ''}`}
          aria-label="Beatmap listing"
          aria-pressed={isListingOpen}
          onClick={onOpenListing}
          onMouseEnter={(e) =>
            handleMouseEnter(e, {
              title: 'beatmap listing',
              subtitle: 'browse for new beatmaps',
              align: 'right',
            })
          }
          onMouseLeave={handleMouseLeave}
        >
          <ListingIcon className="lazer-toolbar-icon" />
        </button>

        {/* Now Playing (F6): hover opens the player bar, click pins it.
            No tooltip here — hovering shows the menu itself instead. */}
        <button
          type="button"
          id="toolbar-btn-now-playing"
          className={`lazer-toolbar-btn ${isNowPlayingOpen ? 'is-active-pink' : ''}`}
          aria-label="Now playing"
          aria-pressed={isNowPlayingOpen}
          onClick={onToggleNowPlaying}
          onMouseEnter={() => onNowPlayingHoverChange?.(true)}
          onMouseLeave={() => onNowPlayingHoverChange?.(false)}
        >
          <MusicIcon className="lazer-toolbar-icon" />
        </button>

        {/* Profile Card / User Badge */}
        <div
          id="toolbar-profile"
          className="lazer-toolbar-profile"
          onMouseEnter={(e) =>
            handleMouseEnter(e, {
              title: playerName,
              subtitle: 'view user profile',
              align: 'right',
            })
          }
          onMouseLeave={handleMouseLeave}
        >
          <span className="lazer-toolbar-username">{playerName}</span>
          <img
            src={avatarUrl}
            alt={`${playerName}'s avatar`}
            className="lazer-toolbar-avatar"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/avatars/preset_01.png';
            }}
          />
        </div>

        {/* Live Clock & Elapsed running session time */}
        <div
          id="toolbar-clock"
          className="lazer-toolbar-clock-container"
          onMouseEnter={(e) =>
            handleMouseEnter(e, {
              title: 'clock',
              subtitle: `session elapsed: ${runningTime}`,
              align: 'right',
            })
          }
          onMouseLeave={handleMouseLeave}
        >
          <div className="lazer-toolbar-clock-main">
            <span className="lazer-toolbar-clock-time">{currentTime}</span>
          </div>
          <div className="lazer-toolbar-clock-running">
            running {runningTime}
          </div>
        </div>

        {/* Notifications Bell */}
        <button
          type="button"
          id="toolbar-btn-notifications"
          className={`lazer-toolbar-btn lazer-toolbar-bell ${isNotificationsOpen ? 'is-active-pink' : ''}`}
          aria-label="Notifications"
          aria-expanded={isNotificationsOpen}
          onClick={() => {
            setIsNotificationsOpen((prev) => !prev);
            setTooltip(null);
          }}
          onMouseEnter={(e) =>
            handleMouseEnter(e, {
              title: 'notifications',
              subtitle: `${notifications.length} notification${notifications.length === 1 ? '' : 's'}`,
              align: 'right',
            })
          }
          onMouseLeave={handleMouseLeave}
        >
          <BellIcon className="lazer-toolbar-icon" />
          {notificationCount > 0 && (
            <span className="lazer-toolbar-badge">{notificationCount}</span>
          )}
        </button>
      </div>

      {/* Expanded Notifications Panel / Drawer */}
      <AnimatePresence>
        {isNotificationsOpen && (
          <motion.div
            id="toolbar-notifications-panel"
            ref={notifRef}
            className="lazer-notifications-panel"
            role="region"
            aria-label="Notifications panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: LAZER_DURATION.overlay, ease: LAZER_EASE_OUT_QUINT }}
          >
            <div className="lazer-notifications-header">
              <div className="lazer-notifications-title-row">
                <span className="lazer-notifications-title">Notifications</span>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    className="lazer-notifications-clear-btn"
                    onClick={handleClearAllNotifications}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="lazer-notifications-list">
              {notifications.length === 0 ? (
                <div className="lazer-notifications-empty">
                  <span>No notifications</span>
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="lazer-notification-item">
                    <div className="lazer-notification-icon-wrap">
                      <BellIcon className="lazer-notification-item-icon" />
                    </div>
                    <div className="lazer-notification-content">
                      <div className="lazer-notification-header-row">
                        <span className="lazer-notification-title">{n.title}</span>
                        <span className="lazer-notification-time">{n.time}</span>
                      </div>
                      <span className="lazer-notification-detail">{n.detail}</span>
                    </div>
                    <button
                      type="button"
                      className="lazer-notification-dismiss"
                      aria-label="Dismiss notification"
                      onClick={(e) => handleDismissNotification(n.id, e)}
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Tooltip Rendering */}
      <AnimatePresence>
        {tooltip && (
          <ToolbarTooltip data={tooltip.data} anchorRect={tooltip.rect} />
        )}
      </AnimatePresence>
    </div>
  );
};
