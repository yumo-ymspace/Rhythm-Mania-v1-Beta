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

import { ChevronLeft } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Shear } from './Shear';

export type FooterBackButtonProps = {
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function FooterBackButton({
  onClick,
  label = 'Back',
  disabled = false,
  className,
  style,
}: FooterBackButtonProps) {
  const classes = ['lazer-footer-back', className].filter(Boolean).join(' ');
  return (
    <button
      id="lazer-footer-back"
      type="button"
      className={classes}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <Shear className="lazer-footer-back-slab">
        <span className="lazer-footer-back-inner">
          <ChevronLeft aria-hidden="true" />
          {label}
        </span>
      </Shear>
    </button>
  );
}
