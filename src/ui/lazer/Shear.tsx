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

import type { CSSProperties, ReactNode } from 'react';

export type ShearProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Unshear inner text/icons. Default true. */
  unshear?: boolean;
};

export function Shear({ children, className, style, unshear = true }: ShearProps) {
  const shearClass = className ? `lazer-shear ${className}` : 'lazer-shear';
  return (
    <div className={shearClass} style={style} data-lazer-shear="">
      {unshear ? <div className="lazer-unshear">{children}</div> : children}
    </div>
  );
}
