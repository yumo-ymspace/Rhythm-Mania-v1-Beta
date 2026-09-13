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
  disabled?: boolean;
  disabledTooltip?: string;
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
  disabled = false,
  disabledTooltip,
  buttonState = 'normal',
  className = '',
  style,
}) => {
  const reducedMotion = useLazerReducedMotion();
  const [isHovered, setIsHovered] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled) return;
    setIsFlashing(true);
    setTimeout(() => {
      setIsFlashing(false);
    }, (LAZER_DURATION.clickFlash || 0.8) * 1000);
    onClick?.();
  }, [disabled, onClick]);

  // Target width calculation:
  // normal: 140px (or ×1.5 = 210px when hovered)
  // exploding: 280px (×2)
  // contracting: 0px
  let targetWidth = LAZER_MENU_BUTTON_WIDTH_PX;
  let targetOpacity = disabled ? 0.6 : 1;

  if (buttonState === 'exploding') {
    targetWidth = LAZER_MENU_BUTTON_WIDTH_PX * 2;
    targetOpacity = 0;
  } else if (buttonState === 'contracting') {
    targetWidth = 0;
    targetOpacity = 0;
  } else if (isHovered && !disabled) {
    targetWidth = LAZER_MENU_BUTTON_WIDTH_PX * 1.5;
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
      className={`lazer-menu-button ${disabled ? 'is-disabled' : ''} ${className}`}
      style={{
        ...style,
        backgroundColor: color,
      }}
      animate={{
        width: targetWidth,
        opacity: targetOpacity,
      }}
      transition={transition}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? disabledTooltip : undefined}
      data-menu-button={label.toLowerCase()}
      aria-label={label}
    >
      <div className="lazer-menu-button-inner lazer-unshear">
        <div
          className={`lazer-menu-button-icon ${
            isHovered && !disabled && !reducedMotion ? 'is-bouncing' : ''
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
