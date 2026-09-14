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
import { Minus, Plus } from 'lucide-react';

interface SettingsSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  suffix?: string;
  id?: string;
  /** Bar-only rendering (no steppers/value badge) for side-by-side rows. */
  bare?: boolean;
}

/**
 * Click-to-edit value readout shown under a slider's title. Preserves the
 * exact-value entry the old inline badge offered.
 */
export function SliderValue({ value, min, max, format, suffix, onChange }: {
  value: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const submit = () => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
    setIsEditing(false);
  };

  const displayValue = format ? format(value) : `${value}${suffix ?? ''}`;

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            setInputValue(value.toString());
            setIsEditing(false);
          }
        }}
        className="mt-1 w-28 text-[15px] font-sans font-semibold bg-[#232234] border border-[#8a7dff] text-white rounded px-1.5 py-0.5 outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      title="Click to edit"
      className="mt-1 text-[15px] font-sans font-semibold text-[#ececf5] hover:text-white transition-colors cursor-text text-left"
    >
      {displayValue}
    </button>
  );
}

/** Pill thumb width in px. Must match .settings-slider thumb width in index.css. */
const THUMB_WIDTH_PX = 12;

export default function SettingsSlider({ value, min, max, step, onChange, format, suffix, id, bare }: SettingsSliderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDecrement = () => {
    const newVal = Math.max(min, value - step);
    // Handle floating point precision issues
    onChange(Number(newVal.toFixed(10)));
  };

  const handleIncrement = () => {
    const newVal = Math.min(max, value + step);
    onChange(Number(newVal.toFixed(10)));
  };

  const handleInputSubmit = () => {
    let parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      parsed = Math.max(min, Math.min(max, parsed));
      onChange(parsed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleInputSubmit();
    if (e.key === 'Escape') {
      setInputValue(value.toString());
      setIsEditing(false);
    }
  };

  const displayValue = format ? format(value) : `${value}${suffix ?? ''}`;
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;

  // The 16px pill travels with its center over [8px, W-8px], so a fill edge at
  // pct% of the full width would sit up to 8px away from the pill. Measure the
  // track and shift the gradient stop so the fill edge lands under the pill.
  const trackRef = useRef<HTMLInputElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setTrackWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);
  const thumbRatio = trackWidth > 0 ? THUMB_WIDTH_PX / trackWidth : 0;
  const fillPct = pct * (1 - thumbRatio) + thumbRatio * 50;

  const barClassName = "settings-slider";
  const barStyle = { background: `linear-gradient(to right, rgba(138, 125, 255, 0.55) ${fillPct}%, #16151f ${fillPct}%)` };

  if (bare) {
    return (
      <input
        ref={trackRef}
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={displayValue}
        className={barClassName}
        style={barStyle}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <button
        type="button"
        onClick={handleDecrement}
        className="w-7 h-7 flex items-center justify-center rounded-md bg-[#232234] text-[#9d9dbd] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a7dff]/60 active:scale-95 transition-all shrink-0 cursor-pointer"
        aria-label="Decrease value"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        ref={trackRef}
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`flex-1 ${barClassName}`}
        style={barStyle}
      />
      <button
        type="button"
        onClick={handleIncrement}
        className="w-7 h-7 flex items-center justify-center rounded-md bg-[#232234] text-[#9d9dbd] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a7dff]/60 active:scale-95 transition-all shrink-0 cursor-pointer"
        aria-label="Increase value"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleInputSubmit}
          onKeyDown={handleKeyDown}
          className="min-w-14 text-right text-xs font-sans bg-[#232234] border border-[#8a7dff] text-white rounded-md px-2 py-1 outline-none"
        />
      ) : (
        <span
          className="min-w-14 text-right text-xs font-sans text-[#ececf5] bg-[#232234] px-2 py-1 rounded-md cursor-text hover:text-white select-none"
          onClick={() => setIsEditing(true)}
          title="Click to edit"
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}
