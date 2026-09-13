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

import React, { type CSSProperties, type ReactNode, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LAZER_MENU_BUTTON_WIDTH_PX,
  LAZER_HOVER_WIDTH_SPRING,
  LAZER_DURATION,
  LAZER_EASE_OUT_EXPO,
  useLazerReducedMotion,
} from './motion';

export type MenuButtonState = 'normal' | 'exploding' | 'contracting';

export type MenuButtonProps = {
  id: string;
  label: string;
  icon: ReactNode;
  color: string;
  onClick?: () => void;
  baseWidth?: number;
  hoverScale?: number;
  buttonState?: MenuButtonState;
  className?: string;
  style?: CSSProperties;
};

export const MenuButton: React.FC<MenuButtonProps> = ({
  id,
  label,
  icon,
  color,
  onClick,
  baseWidth = LAZER_MENU_BUTTON_WIDTH_PX,
  hoverScale = 1.5,
  buttonState = 'normal',
  className = '',
  style,
}) => {
  const reducedMotion = useLazerReducedMotion();
  const [isHovered, setIsHovered] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  const handleClick = useCallback(() => {
    setIsFlashing(true);
    setTimeout(() => {
      setIsFlashing(false);
    }, (LAZER_DURATION.clickFlash || 0.8) * 1000);
    onClick?.();
  }, [onClick]);

  // Target width calculation:
  // normal: 172px (or ×1.5 when hovered)
  // exploding: ×2
  // contracting: 0px
  let targetWidth = baseWidth;
  let targetOpacity = 1;

  if (buttonState === 'exploding') {
    targetWidth = baseWidth * 2;
    targetOpacity = 0;
  } else if (buttonState === 'contracting') {
    targetWidth = 0;
    targetOpacity = 0;
  } else if (isHovered) {
    targetWidth = baseWidth * hoverScale;
  }

  const transition = reducedMotion
    ? { duration: 0 }
    : buttonState === 'exploding'
      ? { duration: LAZER_DURATION.menuExplode, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }
      : isHovered
        ? LAZER_HOVER_WIDTH_SPRING
        : { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

  return (
    <motion.button
      id={id}
      type="button"
      className={`lazer-menu-button ${className}`}
      style={{
        ...style,
        backgroundColor: color,
      }}
      animate={{
        width: targetWidth,
        opacity: targetOpacity,
      }}
      transition={transition}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      data-menu-button={label.toLowerCase()}
      aria-label={label}
    >
      <div className="lazer-menu-button-inner lazer-unshear">
        <div
          className={`lazer-menu-button-icon ${
            isHovered && !reducedMotion ? 'is-bouncing' : ''
          }`}
        >
          {icon}
        </div>
        <span className="lazer-menu-button-label">{label}</span>
      </div>

      <AnimatePresence>
        {isFlashing && (
          <motion.div
            className="lazer-menu-button-flash"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: LAZER_DURATION.clickFlash,
              ease: LAZER_EASE_OUT_EXPO,
            }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
};
