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

import React, { ReactNode } from 'react';
import { motion } from 'motion/react';
import { SlidersHorizontal, Shuffle, Sliders } from 'lucide-react';
import { FooterBackButton } from './FooterBackButton';
import { LazerCookie } from './LazerCookie';
import { Shear } from './Shear';

export type SongSelectFooterProps = {
  onBack: () => void;
  onOpenMods: () => void;
  onRandom: () => void;
  onToggleOptions: () => void;
  onStartPlay: () => void;
  canPlay?: boolean;
  selectedModsCount?: number;
  previewBpm?: number;
  isOptionsOpen?: boolean;
  optionsContent?: ReactNode;
};

export function SongSelectFooter({
  onBack,
  onOpenMods,
  onRandom,
  onToggleOptions,
  onStartPlay,
  canPlay = true,
  selectedModsCount = 0,
  previewBpm = 120,
  isOptionsOpen = false,
  optionsContent,
}: SongSelectFooterProps) {
  return (
    <div className="lazer-song-select-footer" id="song-select-lazer-footer">
      {/* Left: Sheared pink Back button */}
      <div className="lazer-footer-left">
        <FooterBackButton onClick={onBack} label="Back" />
      </div>

      {/* Center Tools: Mods, Random, Options */}
      <div className="lazer-footer-center">
        {/* Mods Button (F1) */}
        <button
          id="bottom-mods-button"
          type="button"
          onClick={onOpenMods}
          className="lazer-footer-action-btn"
          aria-label="Game Modifiers"
        >
          <Shear className="lazer-footer-action-slab">
            <span className="lazer-footer-action-inner">
              <Sliders className="h-4 w-4 text-[#a3e635]" />
              <span className="lazer-footer-action-label">Mods</span>
              <span className="lazer-footer-hotkey-badge">F1</span>
              {selectedModsCount > 0 && (
                <span className="lazer-footer-action-badge">
                  {selectedModsCount}
                </span>
              )}
            </span>
          </Shear>
        </button>

        {/* Random Button (F2) */}
        <button
          id="bottom-random-button"
          type="button"
          onClick={onRandom}
          className="lazer-footer-action-btn"
          aria-label="Random Beatmap"
        >
          <Shear className="lazer-footer-action-slab">
            <span className="lazer-footer-action-inner">
              <Shuffle className="h-4 w-4 text-[#38bdf8]" />
              <span className="lazer-footer-action-label">Random</span>
              <span className="lazer-footer-hotkey-badge">F2</span>
            </span>
          </Shear>
        </button>

        {/* Options Popover Anchor (F3) */}
        <div className="relative">
          <button
            id="bottom-options-button"
            type="button"
            onClick={onToggleOptions}
            className={`lazer-footer-action-btn ${isOptionsOpen ? 'is-active' : ''}`}
            aria-label="Options Menu"
            aria-expanded={isOptionsOpen}
          >
            <Shear className="lazer-footer-action-slab">
              <span className="lazer-footer-action-inner">
                <SlidersHorizontal className="h-4 w-4 text-[#c084fc]" />
                <span className="lazer-footer-action-label">Options</span>
                <span className="lazer-footer-hotkey-badge">F3</span>
              </span>
            </Shear>
          </button>

          {/* Options Popover container */}
          {isOptionsOpen && optionsContent}
        </div>
      </div>

      {/* Right: Parked LazerCookie */}
      <div className="lazer-footer-right">
        <motion.div
          className="lazer-parked-cookie-wrapper"
          initial={{ scale: 0.9, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <LazerCookie
            size={96}
            bpm={previewBpm || 120}
            pulse={true}
            showSpectrum={true}
            showDisc={true}
            className={`lazer-parked-cookie ${canPlay ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
            onClick={canPlay ? () => onStartPlay() : undefined}
          />
        </motion.div>
      </div>
    </div>
  );
}
