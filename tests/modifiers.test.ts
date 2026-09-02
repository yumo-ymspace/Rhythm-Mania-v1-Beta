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

    it('has 1.00x multipliers for HR, SD, PF, DT, NC, HD, FI, Cover, FL', () => {
      expect(MOD_SCORE_MULTIPLIERS.HR).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.SD).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.PF).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.DT).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.NC).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.HD).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.FI).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.Cover).toBe(1.0);
      expect(MOD_SCORE_MULTIPLIERS.FL).toBe(1.0);
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

    it('returns 1.0 for 1.0x mods (SD, PF, NC, DT, HR, HD)', () => {
      expect(computeModMultiplier(['SD'])).toBe(1.0);
      expect(computeModMultiplier(['PF'])).toBe(1.0);
      expect(computeModMultiplier(['NC'])).toBe(1.0);
      expect(computeModMultiplier(['NC', 'HD', 'HR'])).toBe(1.0);
    });

    it('multiplies factors correctly', () => {
      expect(computeModMultiplier(['NF'])).toBe(0.5);
      expect(computeModMultiplier(['EZ'])).toBe(0.5);
      expect(computeModMultiplier(['NF', 'EZ'])).toBe(0.25);
      expect(computeModMultiplier(['NF', 'K7'])).toBeCloseTo(0.45);
    });
  });

  describe('sanitizeGameplayMods', () => {
    it('keeps valid mods (SD, PF, NC, etc.)', () => {
      expect(sanitizeGameplayMods(['SD'])).toEqual(['SD']);
      expect(sanitizeGameplayMods(['PF'])).toEqual(['PF']);
      expect(sanitizeGameplayMods(['NC'])).toEqual(['NC']);
      expect(sanitizeGameplayMods(['nc', 'hr'])).toEqual(['NC', 'HR']);
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
