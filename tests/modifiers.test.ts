/*
 * Tests for src/utils/modifiers.ts and score multipliers (TASK-034)
 */

import { describe, it, expect } from 'vitest';
import { sanitizeGameplayMods, MOD_SCORE_MULTIPLIERS } from '../src/utils/modifiers';
import { computeModMultiplier } from '../src/ruleset/mania/scoreProcessor';

describe('Gameplay Modifiers (TASK-034)', () => {
  describe('MOD_SCORE_MULTIPLIERS', () => {
    it('has 0.50x multipliers for EZ, NF, HT', () => {
      expect(MOD_SCORE_MULTIPLIERS.EZ).toBe(0.5);
      expect(MOD_SCORE_MULTIPLIERS.NF).toBe(0.5);
      expect(MOD_SCORE_MULTIPLIERS.HT).toBe(0.5);
    });

    it('has 1.00x multipliers for HR, SD, PF, DT, NC, HD, FI, Cover, FL, MR, IN', () => {
      expect(MOD_SCORE_MULTIPLIERS.HR).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.SD).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.PF).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.DT).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.NC).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.HD).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.FI).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.Cover).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.FL).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.MR).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.IN).toBe(1.0);
    });

    it('has 0.80x multiplier for Constant Speed (CS)', () => {
      expect(MOD_SCORE_MULTIPLIERS.CS).toBe(0.8);
      expect(MOD_SCORE_MULTIPLIERS.ConstantSpeed).toBe(0.8);
    });

    it('has 0.90x multipliers for Hold Off (HO) and No Release (NR)', () => {
      expect(MOD_SCORE_MULTIPLIERS.HO).toBe(0.9);
      expect(MOD_SCORE_MULTIPLIERS.HoldOff).toBe(0.9);
      expect(MOD_SCORE_MULTIPLIERS.NR).toBe(0.9);
      expect(MOD_SCORE_MULTIPLIERS.NoRelease).toBe(0.9);
    });

    it('has 0.90x multipliers for key conversion mods K1-K10', () => {
      for (let k = 1; k <= 10; k++) {
        expect(MOD_SCORE_MULTIPLIERS[`K${k}`]).toBe(0.9);
      }
    });
  });

  describe('computeModMultiplier', () => {
    it('returns 1.0 for empty or null mods', () => {
      expect(computeModMultiplier([])).toBe(1.0);
      expect(computeModMultiplier(null)).toBe(1.0);
      expect(computeModMultiplier(undefined)).toBe(1.0);
    });

    it('returns 1.0 for 1.0x mods (SD, PF, NC, DT, HR, HD, MR, IN)', () => {
      expect(computeModMultiplier(['SD'])).toBe(1.0);
      expect(computeModMultiplier(['PF'])).toBe(1.0);
      expect(computeModMultiplier(['NC'])).toBe(1.0);
      expect(computeModMultiplier(['MR'])).toBe(1.0);
      expect(computeModMultiplier(['IN'])).toBe(1.0);
      expect(computeModMultiplier(['NC', 'HD', 'HR', 'MR'])).toBe(1.0);
    });

    it('multiplies factors correctly', () => {
      expect(computeModMultiplier(['NF'])).toBe(0.5);
      expect(computeModMultiplier(['EZ'])).toBe(0.5);
      expect(computeModMultiplier(['CS'])).toBe(0.8);
      expect(computeModMultiplier(['HO'])).toBe(0.9);
      expect(computeModMultiplier(['NR'])).toBe(0.9);
      expect(computeModMultiplier(['NF', 'EZ'])).toBe(0.25);
      expect(computeModMultiplier(['NF', 'K7'])).toBeCloseTo(0.45);
      expect(computeModMultiplier(['CS', 'NR'])).toBeCloseTo(0.72);
    });
  });

  describe('sanitizeGameplayMods', () => {
    it('keeps valid mods (SD, PF, NC, MR, CS, IN, HO, NR, etc.)', () => {
      expect(sanitizeGameplayMods(['SD'])).toEqual(['SD']);
      expect(sanitizeGameplayMods(['PF'])).toEqual(['PF']);
      expect(sanitizeGameplayMods(['NC'])).toEqual(['NC']);
      expect(sanitizeGameplayMods(['MR'])).toEqual(['MR']);
      expect(sanitizeGameplayMods(['CS'])).toEqual(['CS']);
      expect(sanitizeGameplayMods(['IN'])).toEqual(['IN']);
      expect(sanitizeGameplayMods(['HO'])).toEqual(['HO']);
      expect(sanitizeGameplayMods(['NR'])).toEqual(['NR']);
      expect(sanitizeGameplayMods(['mirror', 'constantspeed'])).toEqual(['MR', 'CS']);
    });

    it('enforces IN vs HO exclusivity', () => {
      expect(sanitizeGameplayMods(['IN', 'HO'])).toEqual(['IN']);
      expect(sanitizeGameplayMods(['HO', 'IN'])).toEqual(['HO']);
    });

    it('enforces HO vs NR exclusivity', () => {
      expect(sanitizeGameplayMods(['HO', 'NR'])).toEqual(['HO']);
      expect(sanitizeGameplayMods(['NR', 'HO'])).toEqual(['NR']);
    });

    it('enforces SD vs PF exclusivity', () => {
      expect(sanitizeGameplayMods(['SD', 'PF'])).toEqual(['SD']);
      expect(sanitizeGameplayMods(['PF', 'SD'])).toEqual(['PF']);
    });

    it('enforces NF vs SD / PF exclusivity', () => {
      expect(sanitizeGameplayMods(['NF', 'SD'])).toEqual(['NF']);
      expect(sanitizeGameplayMods(['SD', 'NF'])).toEqual(['SD']);
      expect(sanitizeGameplayMods(['NF', 'PF'])).toEqual(['NF']);
      expect(sanitizeGameplayMods(['PF', 'NF'])).toEqual(['PF']);
    });

    it('enforces EZ vs SD / PF exclusivity', () => {
      expect(sanitizeGameplayMods(['EZ', 'SD'])).toEqual(['EZ']);
      expect(sanitizeGameplayMods(['SD', 'EZ'])).toEqual(['SD']);
      expect(sanitizeGameplayMods(['EZ', 'PF'])).toEqual(['EZ']);
      expect(sanitizeGameplayMods(['PF', 'EZ'])).toEqual(['PF']);
    });

    it('enforces DT vs NC and HT vs NC exclusivity', () => {
      expect(sanitizeGameplayMods(['DT', 'NC'])).toEqual(['DT']);
      expect(sanitizeGameplayMods(['NC', 'DT'])).toEqual(['NC']);
      expect(sanitizeGameplayMods(['HT', 'NC'])).toEqual(['HT']);
      expect(sanitizeGameplayMods(['NC', 'HT'])).toEqual(['NC']);
    });

    it('enforces EZ vs HR exclusivity', () => {
      expect(sanitizeGameplayMods(['EZ', 'HR'])).toEqual(['EZ']);
      expect(sanitizeGameplayMods(['HR', 'EZ'])).toEqual(['HR']);
    });

    it('enforces visual cover mod exclusivity', () => {
      expect(sanitizeGameplayMods(['HD', 'FI'])).toEqual(['HD']);
      expect(sanitizeGameplayMods(['Cover', 'FL'])).toEqual(['Cover']);
    });

    it('enforces single key mod exclusivity', () => {
      expect(sanitizeGameplayMods(['K4', 'K7'])).toEqual(['K4']);
      expect(sanitizeGameplayMods(['K10', 'K1'])).toEqual(['K10']);
    });
  });
});
