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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#232230] border border-black/30 rounded-md shadow-2xl max-w-sm w-full p-5 space-y-4 animate-in zoom-in-95 duration-200" role="dialog" aria-modal="true" aria-labelledby="settings-confirm-title">
        <div className="flex items-center gap-3 text-[#e8b400]">
          <AlertCircle className="w-5 h-5" />
          <h3 id="settings-confirm-title" className="text-base font-semibold text-white font-sans">Confirm action</h3>
        </div>
        <p className="text-[#cfcfe4] text-sm leading-relaxed font-sans">
          {message}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[#ececf5] transition-colors cursor-pointer text-[13px] font-semibold font-sans"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel(); // Close modal
            }}
            className="px-4 py-2 rounded-md bg-[#e0497a] hover:bg-[#f05e8d] text-white transition-colors cursor-pointer text-[13px] font-semibold font-sans active:scale-[0.98]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
