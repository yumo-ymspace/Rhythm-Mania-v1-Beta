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
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  LAZER_DURATION,
  LAZER_EASE_OUT_QUINT,
  useLazerReducedMotion,
} from './motion';

export interface LazerTooltipData {
  title: string;
  subtitle?: string;
  shortcut?: string;
}

export interface ToolbarTooltipProps {
  data: LazerTooltipData | null;
  anchorRect: DOMRect | null;
}

export const ToolbarTooltip: React.FC<ToolbarTooltipProps> = ({ data, anchorRect }) => {
  const reducedMotion = useLazerReducedMotion();

  if (!data || !anchorRect) return null;

  // Position tooltip centered below the anchor element, clamped inside the viewport.
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const left = Math.max(12, Math.min(winWidth - 180, anchorRect.left + anchorRect.width / 2));
  const top = anchorRect.bottom + 6;


  return (
    <motion.div
      className="lazer-toolbar-tooltip"
      role="tooltip"
      initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: LAZER_DURATION.tooltip, ease: LAZER_EASE_OUT_QUINT }}
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        transform: 'translateX(-50%)',
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
  const [unimplementedNotice, setUnimplementedNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);

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

  const showDisabledNotice = (featureName: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setUnimplementedNotice(`${featureName} is not available yet.`);
    noticeTimerRef.current = setTimeout(() => {
      setUnimplementedNotice(null);
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

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
      className={`lazer-toolbar ${visible ? 'is-visible' : 'is-hidden'} ${className}`}
      data-lazer-toolbar=""
      role="banner"
      aria-label="osu! lazer top toolbar"
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
        {/* Aux tools (changelog, wiki) - hidden on small mobile */}
        <div className="lazer-toolbar-aux-tools">
          {/* Changelog */}
          <button
            type="button"
            className="lazer-toolbar-btn is-stub"
            aria-label="Changelog"
            onClick={() => showDisabledNotice('changelog')}
            onMouseEnter={(e) =>
              handleMouseEnter(e, {
                title: 'changelog',
                subtitle: 'development updates',
              })
            }
            onMouseLeave={handleMouseLeave}
          >
            <ChangelogIcon className="lazer-toolbar-icon" />
          </button>

          {/* Wiki */}
          <button
            type="button"
            className="lazer-toolbar-btn is-stub"
            aria-label="Wiki"
            onClick={() => showDisabledNotice('wiki')}
            onMouseEnter={(e) =>
              handleMouseEnter(e, {
                title: 'wiki',
                subtitle: 'knowledge base',
              })
            }
            onMouseLeave={handleMouseLeave}
          >
            <WikiIcon className="lazer-toolbar-icon" />
          </button>
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
              shortcut: 'CTRL-B',
            })
          }
          onMouseLeave={handleMouseLeave}
        >
          <ListingIcon className="lazer-toolbar-icon" />
        </button>

        {/* Now Playing */}
        <button
          type="button"
          id="toolbar-btn-now-playing"
          className={`lazer-toolbar-btn ${isNowPlayingOpen ? 'is-active-pink' : ''}`}
          aria-label="Now playing"
          aria-pressed={isNowPlayingOpen}
          onClick={onToggleNowPlaying}
          onMouseEnter={(e) =>
            handleMouseEnter(e, {
              title: 'now playing',
              subtitle: 'manage the currently playing track',
              shortcut: 'F6',
            })
          }
          onMouseLeave={handleMouseLeave}
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
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
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

      {/* Unimplemented action toast notice */}
      <AnimatePresence>
        {unimplementedNotice && (
          <motion.div
            className="lazer-toolbar-notice"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {unimplementedNotice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
