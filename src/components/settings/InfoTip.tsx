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

import React, { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';

interface SettingInfoTipProps {
  label: string;
  text: string;
}

const TIP_WIDTH = 240;

/**
 * Small "i" affordance that reveals a setting's description in a floating
 * tooltip on hover/focus. Rendered with `position: fixed` so it is never
 * clipped by the settings scroll container; hidden on scroll/resize so it
 * cannot detach from its icon.
 */
export default function SettingInfoTip({ label, text }: SettingInfoTipProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(window.innerWidth - TIP_WIDTH - 8, r.left + r.width / 2 - TIP_WIDTH / 2));
    const above = r.top >= 200;
    setPos({ left, top: above ? r.top - 10 : r.bottom + 10, above });
  };

  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={tipId}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        className="p-0.5 -m-0.5 text-[#8f8fa8] hover:text-white focus-visible:text-white focus:outline-none transition-colors cursor-help shrink-0"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {pos && (
        <div
          id={tipId}
          role="tooltip"
          className="fixed z-[70] rounded-md bg-[#1d1c2d] border border-black/40 shadow-2xl px-3 py-2 text-[11px] leading-snug text-[#cfcfe4] font-sans"
          style={{
            left: pos.left,
            top: pos.top,
            width: TIP_WIDTH,
            transform: pos.above ? 'translateY(-100%)' : undefined,
          }}
        >
          {text}
        </div>
      )}
    </>
  );
}
