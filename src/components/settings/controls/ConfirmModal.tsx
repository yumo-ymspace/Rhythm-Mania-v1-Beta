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

import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ isOpen, message, onConfirm, onCancel }: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#071932] border border-[#1b3b64]/80 rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in zoom-in-95 duration-200" role="dialog" aria-modal="true" aria-labelledby="settings-confirm-title">
        <div className="flex items-center gap-3 text-amber-400">
          <AlertCircle className="w-6 h-6" />
           <h3 id="settings-confirm-title" className="text-lg font-bold text-white">Confirm Action</h3>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-[#193454]/70 text-slate-200 hover:bg-[#193454] hover:text-white border border-[#2d5584]/60 transition-colors cursor-pointer text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel(); // Close modal
            }}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors shadow-lg shadow-amber-900/50 cursor-pointer text-sm font-semibold"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
