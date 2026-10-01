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

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { SlidersHorizontal, Shuffle, Sliders } from 'lucide-react';
import { FooterBackButton } from './FooterBackButton';
import { LazerCookie } from './LazerCookie';
import { Shear } from './Shear';
import { ALL_MODS } from '../../components/ModSelectOverlay';
import { computeModMultiplier } from '../../ruleset/mania/scoreProcessor';

/** Display acronym for a selected mod id (K-mods and unknown ids fall back to the id itself). */
function modAcronym(id: string): string {
  if (/^K(?:[1-9]|10)$/.test(id)) return id;
  return ALL_MODS.find(m => m.id === id)?.acronym ?? id;
}

export type SongSelectFooterProps = {
  onBack: () => void;
  onOpenMods: () => void;
  onRandom: () => void;
  onToggleOptions: () => void;
  onStartPlay: () => void;
  canPlay?: boolean;
  selectedModsCount?: number;
  /** Full selected mod id list; drives the expanded Mods button chips. */
  selectedMods?: string[];
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
  selectedMods = [],
  previewBpm = 120,
  isOptionsOpen = false,
  optionsContent,
}: SongSelectFooterProps) {
  const activeMods = selectedMods.length > 0 ? selectedMods : [];
  const modCount = activeMods.length > 0 ? activeMods.length : selectedModsCount;
  const multiplier = computeModMultiplier(activeMods);
  const isUnranked = activeMods.includes('AT') || activeMods.includes('CN');
  return (
    <div className="lazer-song-select-footer" id="song-select-lazer-footer">
      {/* Left cluster: long pink Back + bigger coloured Mods / Random / Options
          (hud refs bottom-left). */}
      <div className="lazer-footer-left lazer-footer-cluster">
        <FooterBackButton onClick={onBack} label="Back" />

        {/* Mods Button: grows horizontally when mods are selected and shows
            the active mod acronyms plus multiplier / UNRANKED chips above,
            lazer style. */}
        <button
          id="bottom-mods-button"
          type="button"
          onClick={onOpenMods}
          className={`lazer-footer-action-btn is-mods${modCount > 0 ? ' has-mods' : ''}`}
          aria-label={modCount > 0 ? `Game Modifiers, ${modCount} selected: ${activeMods.join(', ')}` : 'Game Modifiers'}
        >
          {modCount > 0 && (
            <span className="lazer-footer-mods-stats" aria-hidden="true">
              <span className="lazer-footer-mods-mult">{multiplier.toFixed(2)}x</span>
              {isUnranked && <span className="lazer-footer-mods-unranked">UNRANKED</span>}
            </span>
          )}
          <Shear className="lazer-footer-action-slab">
            <span className="lazer-footer-action-inner">
              <Sliders className="h-6 w-6 lazer-footer-action-icon" />
              <span className="lazer-footer-action-label-row">
                <span className="lazer-footer-action-label">Mods</span>
              </span>
              {modCount > 0 && (
                <span className="lazer-footer-mods-chips">
                  {activeMods.map(id => (
                    <span key={id} className="lazer-footer-mod-chip">
                      {modAcronym(id)}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </Shear>
        </button>

        {/* Random Button */}
        <button
          id="bottom-random-button"
          type="button"
          onClick={onRandom}
          className="lazer-footer-action-btn is-random"
          aria-label="Random Beatmap"
        >
          <Shear className="lazer-footer-action-slab">
            <span className="lazer-footer-action-inner">
              <Shuffle className="h-6 w-6 lazer-footer-action-icon" />
              <span className="lazer-footer-action-label-row">
                <span className="lazer-footer-action-label">Random</span>
              </span>
            </span>
          </Shear>
        </button>

        {/* Options Popover Anchor */}
        <div className="relative lazer-footer-options-anchor">
          <button
            id="bottom-options-button"
            type="button"
            onClick={onToggleOptions}
            className={`lazer-footer-action-btn is-options ${isOptionsOpen ? 'is-active' : ''}`}
            aria-label="Options Menu"
            aria-expanded={isOptionsOpen}
          >
            <Shear className="lazer-footer-action-slab">
              <span className="lazer-footer-action-inner">
                <SlidersHorizontal className="h-6 w-6 lazer-footer-action-icon" />
                <span className="lazer-footer-action-label-row">
                  <span className="lazer-footer-action-label">Options</span>
                </span>
              </span>
            </Shear>
          </button>

          {/* Options Popover container */}
          {isOptionsOpen && optionsContent}
        </div>
      </div>

      {/* Center spacer (tools now live in the left cluster) */}
      <div className="lazer-footer-center" aria-hidden="true" />

      {/* Right: Parked LazerCookie */}
      <div className="lazer-footer-right">
        <motion.div
          className="lazer-parked-cookie-wrapper"
          initial={{ scale: 0.9, opacity: 1 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <LazerCookie
            size={200}
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
