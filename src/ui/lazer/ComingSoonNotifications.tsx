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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Ban as BanIcon, Info as InfoIcon } from 'lucide-react';

/**
 * A single stackable coming-soon toast notification.
 * Shared by the middle horizontal bar buttons (ButtonSystem) and the
 * top toolbar Now Playing button so both surfaces use the same system.
 */
export interface LazerToastNotice {
  id: string;
  title: string;
  detail?: string;
  iconType: 'info' | 'ban';
  /**
   * Set to true just before removal on click, so that AnimatePresence
   * captures the throw-left exit animation rather than the slide-right one.
   */
  clickDismissed: boolean;
}

const COMING_SOON_AUTO_DISMISS_MS = 2400;

export function useComingSoonToasts() {
  const [toasts, setToasts] = useState<LazerToastNotice[]>([]);
  const timerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearToastTimer = useCallback((id: string) => {
    const t = timerMapRef.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timerMapRef.current.delete(id);
    }
  }, []);

  const removeToast = useCallback(
    (id: string) => {
      clearToastTimer(id);
      setToasts((prev) => prev.filter((n) => n.id !== id));
    },
    [clearToastTimer],
  );

  const addToast = useCallback(
    (title: string, detail: string | undefined, iconType: 'info' | 'ban') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, title, detail, iconType, clickDismissed: false }]);
      const t = setTimeout(() => removeToast(id), COMING_SOON_AUTO_DISMISS_MS);
      timerMapRef.current.set(id, t);
    },
    [removeToast],
  );

  const showComingSoon = useCallback(
    (feature: string) => {
      addToast('Coming soon', feature, 'info');
    },
    [addToast],
  );

  /**
   * Dismiss a notification via click using a two-step approach:
   * 1. Mark clickDismissed: true → React re-renders with the throw-left exit prop.
   * 2. Remove in the next animation frame → AnimatePresence captures the updated exit.
   */
  const handleClickDismiss = useCallback(
    (id: string) => {
      clearToastTimer(id);
      setToasts((prev) => prev.map((n) => (n.id === id ? { ...n, clickDismissed: true } : n)));
      requestAnimationFrame(() => {
        setToasts((prev) => prev.filter((n) => n.id !== id));
      });
    },
    [clearToastTimer],
  );

  useEffect(() => {
    return () => {
      timerMapRef.current.forEach((t) => clearTimeout(t));
      timerMapRef.current.clear();
    };
  }, []);

  return { toasts, showComingSoon, addToast, removeToast, handleClickDismiss };
}

export const ComingSoonNotificationStack: React.FC<{
  toasts: LazerToastNotice[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  return (
    <div className="lazer-notification-stack">
      <AnimatePresence>
        {toasts.map((notif) => (
          <motion.aside
            key={notif.id}
            className="lazer-coming-soon"
            role="status"
            aria-live="polite"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onDismiss(notif.id)}
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
              {notif.detail && <span className="lazer-coming-soon-detail">{notif.detail}</span>}
            </span>
          </motion.aside>
        ))}
      </AnimatePresence>
    </div>
  );
};
