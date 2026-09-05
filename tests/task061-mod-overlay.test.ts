/*
 * Tests for TASK-061: Mod overlay visual (categories, hex-ish buttons, incompat)
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_MODS,
  MOD_CATEGORIES,
  getConflictingMods,
} from '../src/components/ModSelectOverlay';
import { sanitizeGameplayMods } from '../src/utils/modifiers';
import { computeModMultiplier } from '../src/ruleset/mania/scoreProcessor';

describe('TASK-061: ModSelectOverlay - Categories and Incompatibility', () => {
  describe('Mod Categories', () => {
    it('defines all 5 standard osu!(lazer) categories', () => {
      const categoryIds = MOD_CATEGORIES.map(c => c.id);
      expect(categoryIds).toEqual([
        'reduction',
        'increase',
        'automation',
        'conversion',
        'fun',
      ]);
    });

    it('places every mod into a valid category', () => {
      const validCategories = new Set(MOD_CATEGORIES.map(c => c.id));
      for (const mod of ALL_MODS) {
        expect(validCategories.has(mod.category)).toBe(true);
        expect(mod.acronym).toBeTruthy();
        expect(mod.multiplier).toBeTruthy();
        expect(mod.description).toBeTruthy();
      }
    });

    it('contains all key mania mods across categories', () => {
      const modIds = new Set(ALL_MODS.map(m => m.id));
      // Reduction
      expect(modIds.has('NF')).toBe(true);
      expect(modIds.has('EZ')).toBe(true);
      expect(modIds.has('HT')).toBe(true);
      expect(modIds.has('NR')).toBe(true);

      // Increase
      expect(modIds.has('HR')).toBe(true);
      expect(modIds.has('SD')).toBe(true);
      expect(modIds.has('PF')).toBe(true);
      expect(modIds.has('AC')).toBe(true);
      expect(modIds.has('HD')).toBe(true);
      expect(modIds.has('FI')).toBe(true);
      expect(modIds.has('Cover')).toBe(true);
      expect(modIds.has('FL')).toBe(true);
      expect(modIds.has('DT')).toBe(true);
      expect(modIds.has('NC')).toBe(true);

      // Automation
      expect(modIds.has('AT')).toBe(true);
      expect(modIds.has('CN')).toBe(true);

      // Conversion
      expect(modIds.has('MR')).toBe(true);
      expect(modIds.has('RD')).toBe(true);
      expect(modIds.has('CS')).toBe(true);
      expect(modIds.has('IN')).toBe(true);
      expect(modIds.has('HO')).toBe(true);
      expect(modIds.has('CL')).toBe(true);
      expect(modIds.has('DA')).toBe(true);

      // Fun
      expect(modIds.has('WU')).toBe(true);
      expect(modIds.has('WD')).toBe(true);
      expect(modIds.has('AS')).toBe(true);
      expect(modIds.has('MU')).toBe(true);
    });
  });

  describe('Incompatibility Detection (getConflictingMods)', () => {
    it('returns empty array when no mods are active', () => {
      expect(getConflictingMods('EZ', [])).toEqual([]);
      expect(getConflictingMods('HR', [])).toEqual([]);
      expect(getConflictingMods('DT', [])).toEqual([]);
    });

    it('does not report conflict with self if already active', () => {
      expect(getConflictingMods('EZ', ['EZ'])).toEqual([]);
      expect(getConflictingMods('DT', ['DT'])).toEqual([]);
    });

    it('correctly detects EZ vs HR conflict (both directions)', () => {
      expect(getConflictingMods('EZ', ['HR'])).toContain('HR');
      expect(getConflictingMods('HR', ['EZ'])).toContain('EZ');
    });

    it('correctly detects rate-adjust conflicts (DT, HT, NC, WU, WD, AS)', () => {
      expect(getConflictingMods('HT', ['DT'])).toContain('DT');
      expect(getConflictingMods('DT', ['HT'])).toContain('HT');
      expect(getConflictingMods('NC', ['DT'])).toContain('DT');
      expect(getConflictingMods('WU', ['DT'])).toContain('DT');
      expect(getConflictingMods('WD', ['DT'])).toContain('DT');
      expect(getConflictingMods('AS', ['DT'])).toContain('DT');
    });

    it('correctly detects visual cover conflicts (HD, FI, Cover, FL)', () => {
      expect(getConflictingMods('FI', ['HD'])).toContain('HD');
      expect(getConflictingMods('Cover', ['HD'])).toContain('HD');
      expect(getConflictingMods('FL', ['HD'])).toContain('HD');
      expect(getConflictingMods('HD', ['Cover'])).toContain('Cover');
    });

    it('correctly detects sudden death / fail conflicts (NF vs SD, PF, AC)', () => {
      expect(getConflictingMods('SD', ['NF'])).toContain('NF');
      expect(getConflictingMods('PF', ['NF'])).toContain('NF');
      expect(getConflictingMods('AC', ['NF'])).toContain('NF');
      expect(getConflictingMods('NF', ['SD'])).toContain('SD');
    });

    it('correctly detects mirror vs random conflict', () => {
      expect(getConflictingMods('RD', ['MR'])).toContain('MR');
      expect(getConflictingMods('MR', ['RD'])).toContain('RD');
    });

    it('correctly detects invert vs hold off conflict', () => {
      expect(getConflictingMods('HO', ['IN'])).toContain('IN');
      expect(getConflictingMods('IN', ['HO'])).toContain('HO');
    });

    it('correctly detects hold off vs no release conflict', () => {
      expect(getConflictingMods('NR', ['HO'])).toContain('HO');
      expect(getConflictingMods('HO', ['NR'])).toContain('NR');
    });

    it('correctly detects automation conflict (AT vs CN)', () => {
      expect(getConflictingMods('CN', ['AT'])).toContain('AT');
      expect(getConflictingMods('AT', ['CN'])).toContain('CN');
    });

    it('correctly detects key count conflicts (K1-K10)', () => {
      expect(getConflictingMods('K7', ['K4'])).toContain('K4');
      expect(getConflictingMods('K4', ['K7'])).toContain('K7');
      expect(getConflictingMods('K4', ['K4'])).toEqual([]);
    });

    it('works in combination with sanitizeGameplayMods when resolving conflicts', () => {
      // Simulate user clicking HR while EZ and HD are active:
      const active = ['EZ', 'HD'];
      const conflicts = getConflictingMods('HR', active);
      expect(conflicts).toContain('EZ');

      const next = active.filter(m => !conflicts.includes(m));
      next.push('HR');

      const sanitized = sanitizeGameplayMods(next);
      expect(sanitized).toEqual(['HD', 'HR']);
      expect(computeModMultiplier(sanitized)).toBe(1.0);
    });
  });
});
