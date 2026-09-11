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
}

export default function SettingsSlider({ value, min, max, step, onChange, format, suffix, id }: SettingsSliderProps) {
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
  
  return (
    <div className="flex items-center gap-2 w-full">
      <button 
        type="button"
        onClick={handleDecrement}
        className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.1] hover:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 active:scale-95 transition-all shrink-0 cursor-pointer"
        aria-label="Decrease value"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 w-full md:w-36 md:flex-none min-w-0 h-2 bg-[#121622] border border-white/10 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400/40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(34,211,238,0.6)]"
        style={{ accentColor: '#22d3ee' }}
      />
      <button 
        type="button"
        onClick={handleIncrement}
        className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.1] hover:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 active:scale-95 transition-all shrink-0 cursor-pointer"
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
          className="min-w-14 text-right text-xs font-mono bg-[#121622] border border-cyan-400 text-cyan-300 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-cyan-400/50"
        />
      ) : (
        <span 
          className="min-w-14 text-right text-xs font-mono text-cyan-300 bg-white/[0.03] border border-white/[0.08] px-2 py-1 rounded-lg cursor-text hover:border-white/20 select-none"
          onClick={() => setIsEditing(true)}
          title="Click to edit"
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}
