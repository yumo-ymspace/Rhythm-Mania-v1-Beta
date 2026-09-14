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
import { Check, ChevronDown } from 'lucide-react';

interface SettingsSelectProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  id?: string;
}

/**
 * Custom dropdown replacing the native `<select>`.
 *
 * A native select renders its open option list as an OS-level popup outside
 * the document cascade, so the lazer custom cursor (`cursor: none`) cannot
 * reach it and the system cursor leaks through. This button + listbox popup
 * is plain DOM, so the custom cursor stays in control everywhere.
 */
export default function SettingsSelect({ value, options, onChange, id }: SettingsSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value) ?? options[0];

  // Sync the keyboard-active option whenever the popup opens or value changes.
  useEffect(() => {
    if (open) {
      setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
    }
  }, [open, value, options]);

  // Close on outside pointer press.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open ]);

  // Keep the keyboard-active option in view.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const choose = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) choose(opt.value);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-32">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
        className="w-full flex items-center justify-between gap-2 bg-[#232234] border border-black/30 text-[#ececf5] text-[13px] font-sans rounded-md px-3 py-2 focus:outline-none focus:border-[#8a7dff]/60 cursor-pointer transition-colors min-w-32"
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[#9d9dbd] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-activedescendant={`${listboxId}-opt-${activeIndex}`}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute left-0 right-0 top-full mt-1 min-w-full max-h-56 overflow-y-auto z-50 bg-[#232234] border border-black/40 rounded-md shadow-xl shadow-black/50 py-1 outline-none"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  id={`${listboxId}-opt-${i}`}
                  data-index={i}
                  aria-selected={isSelected}
                  onClick={() => choose(opt.value)}
                  onMouseMove={() => setActiveIndex(i)}
                  onFocus={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] font-sans text-left transition-colors cursor-pointer focus:outline-none ${
                    isActive ? 'bg-[#8a7dff]/25 text-white' : 'text-[#ececf5]'
                  }`}
                >
                  <span className="w-4 shrink-0 flex items-center justify-center">
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#8a7dff]" />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
