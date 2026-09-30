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
import { Volume2, Check, X } from 'lucide-react';
import { mainAudio } from '../../audio/AudioEngine';

interface OffsetWizardModalProps {
  initial: number;
  onApply: (v: number) => void;
  onClose: () => void;
}

export default function OffsetWizardModal({ initial, onApply, onClose }: OffsetWizardModalProps) {
  const [step, setStep] = useState<'start' | 'tap' | 'apply'>('start');
  const [tapTimes, setTapTimesState] = useState<number[]>([]);
  const tapTimesRef = useRef<number[]>([]);
  const [beatProgress, setBeatProgress] = useState<number>(0);
  const [caliOffsetResult, setCaliOffsetResult] = useState<number | null>(null);
  const metronomeBpm = 120;
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const sessionStartRef = useRef<number>(0);
  const lastBeepedBeatRef = useRef<number>(-1);

  // Esc closes wizard only
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // prevent drawer from catching it
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clean up AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (step !== 'tap') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setBeatProgress(0);
      return;
    }

    const beatDurationMs = 60000 / metronomeBpm;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - sessionStartRef.current;
      const progress = (elapsed % beatDurationMs) / beatDurationMs;
      setBeatProgress(progress);
      
      const currentBeatIndex = Math.floor(elapsed / beatDurationMs);
      if (currentBeatIndex !== lastBeepedBeatRef.current) {
        lastBeepedBeatRef.current = currentBeatIndex;
        triggerWebBeep(1200, 0.02);
      }
    }, 16);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [step]);

  useEffect(() => {
    if (step !== 'tap') return;

    const handleSpacePress = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        registerTapEvent();
      }
    };

    window.addEventListener('keydown', handleSpacePress);
    return () => window.removeEventListener('keydown', handleSpacePress);
  }, [step]);

  const handleTapSurface = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (step === 'tap') {
      registerTapEvent();
    }
  };

  const triggerWebBeep = (freq: number, duration: number) => {
    try {
      const AudioCtxClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtxClass();
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch(e) {
      console.warn('Metronome audio beep error:', e);
    }
  };

  const registerTapEvent = () => {
    triggerWebBeep(700, 0.04);

    const beatDurationMs = 60000 / metronomeBpm;
    const elapsed = Date.now() - sessionStartRef.current;
    const remainder = elapsed % beatDurationMs;
    
    let diff = remainder;
    if (diff > beatDurationMs / 2) {
      diff = diff - beatDurationMs; 
    }

    const currentTimes = tapTimesRef.current;
    const updated = [...currentTimes, diff].slice(-8);
    tapTimesRef.current = updated;
    setTapTimesState(updated);

    if (updated.length >= 8) {
      const sum = updated.reduce((a, b) => a + b, 0);
      const mean = Math.round(sum / updated.length);
      setCaliOffsetResult(mean);
      setStep('apply');
    }
  };

  const startMetronome = () => {
    sessionStartRef.current = Date.now();
    lastBeepedBeatRef.current = -1;
    setStep('tap');
    tapTimesRef.current = [];
    setTapTimesState([]);
    setCaliOffsetResult(null);
  };

  const displayResult = caliOffsetResult !== null ? caliOffsetResult : 0;

  return (
    <div 
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-[#35344e] border border-black/30 rounded-md w-[400px] max-w-[90vw] p-6 shadow-2xl flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center pb-3 border-b border-black/30">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 font-sans">
            <Volume2 className="w-5 h-5 text-[var(--skin-accent)]" />
            Offset wizard
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-md text-[#9d9dbd] hover:text-white transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {step === 'start' && (
          <>
            <p className="text-sm text-[#cfcfe4] leading-relaxed font-sans">
              When you click Start, you will hear a metronome beat. Tap the pad (or press <strong>Spacebar</strong>) in time with the sound.
              <br/><br/>
              Do this 8 times consistently to calculate your hardware&apos;s audio latency offset.
              <br/><br/>
              <span className="text-xs text-[#8f8fa8]">
                Measured device output latency: {Math.round(mainAudio.getOutputLatencyMs())}ms
                (baseLatency + outputLatency). Enable &quot;Compensate output latency&quot; in
                Audio settings to subtract it automatically instead of baking it into your offset.
              </span>
            </p>
            <div className="flex justify-end pt-2">
              <button 
                onClick={startMetronome}
                className="px-5 py-2 rounded font-semibold bg-[var(--skin-accent)] text-slate-950 hover:bg-[var(--skin-accent)] hover:opacity-90 transition-opacity cursor-pointer shadow-md"
              >
                Start Metronome
              </button>
            </div>
          </>
        )}
        
        {step === 'tap' && (
          <div className="flex flex-col items-center justify-center py-4 gap-4">
            <button
              type="button"
              onPointerDown={handleTapSurface}
              className="w-full min-h-[180px] rounded-md border-2 border-[var(--skin-accent)]/40 bg-[#232234] active:bg-[var(--skin-accent)]/15 flex flex-col items-center justify-center gap-4 select-none touch-manipulation cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--skin-accent)]"
              aria-label="Tap to the beat"
            >
              <div className="w-24 h-24 rounded-full border-4 border-[#4a4980] flex flex-col items-center justify-center relative shadow-[0_0_20px_rgba(0,0,0,0.5)] pointer-events-none">
                 <div 
                    className="absolute inset-0 rounded-full bg-[var(--skin-accent)] opacity-20"
                    style={{ transform: `scale(${1 + Math.sin(beatProgress * Math.PI) * 0.15})` }}
                 />
                 <span className="text-3xl font-black text-white relative z-10">{tapTimes.length}</span>
                  <span className="text-[10px] text-[#8f8fa8] font-semibold relative z-10">of 8 taps</span>
              </div>
              <p className="text-sm text-[var(--skin-accent)] font-medium animate-pulse pointer-events-none px-4 text-center">
                Tap here (or Spacebar) to the beat!
              </p>
            </button>
          </div>
        )}
        
        {step === 'apply' && (
          <>
            <div className="flex flex-col items-center py-4 bg-[#232234] rounded-md border border-black/30">
              <span className="text-sm text-[#8f8fa8] font-sans">Calculated audio offset:</span>
              <span className={`text-4xl font-black tracking-tight mt-1 ${
                displayResult > 0 ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {displayResult > 0 ? '+' : ''}{displayResult}ms
              </span>
              <span className="text-xs text-[#6f6f92] mt-2 font-sans">
                Previous value: {initial > 0 ? '+' : ''}{initial}ms
              </span>
            </div>
            
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={startMetronome}
                className="px-4 py-2 rounded-md text-sm font-medium bg-white/[0.06] text-[#ececf5] hover:bg-white/[0.12] transition-colors cursor-pointer"
              >
                Retry
              </button>
              <button 
                onClick={() => { onApply(displayResult); }}
                className="px-5 py-2 rounded font-semibold bg-[var(--skin-accent)] text-slate-950 flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shadow-md"
              >
                <Check className="w-4 h-4" />
                Apply Offset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
