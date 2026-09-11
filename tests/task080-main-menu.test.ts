/*
 * Tests for TASK-080: Main menu logo pulse + stacked actions; no account chip
 */

import { describe, it, expect } from 'vitest';
import { MAIN_MENU_ITEMS, RESOURCE_LINKS } from '../src/components/MainMenu';

describe('TASK-080: Main Menu - Lazer Parity and Stacked Actions', () => {
  describe('Main Menu Action Definitions', () => {
    it('defines exactly 4 core offline destinations', () => {
      const ids = MAIN_MENU_ITEMS.map((item) => item.id);
      expect(ids).toEqual(['select', 'history', 'skins', 'settings']);
    });

    it('designates Play (select) as the primary action', () => {
      const playItem = MAIN_MENU_ITEMS.find((item) => item.id === 'select');
      expect(playItem).toBeDefined();
      expect(playItem?.primary).toBe(true);
      expect(playItem?.title).toBe('Play');
      expect(playItem?.subtitle).toContain('mania');
      expect(playItem?.icon).toBe('play');
    });

    it('contains valid secondary actions for history, skins, and settings', () => {
      const historyItem = MAIN_MENU_ITEMS.find((item) => item.id === 'history');
      expect(historyItem).toBeDefined();
      expect(historyItem?.title).toBe('History');
      expect(historyItem?.primary).toBeFalsy();

      const skinsItem = MAIN_MENU_ITEMS.find((item) => item.id === 'skins');
      expect(skinsItem).toBeDefined();
      expect(skinsItem?.title).toBe('Skins');
      expect(skinsItem?.primary).toBeFalsy();

      const settingsItem = MAIN_MENU_ITEMS.find((item) => item.id === 'settings');
      expect(settingsItem).toBeDefined();
      expect(settingsItem?.title).toBe('Settings');
      expect(settingsItem?.primary).toBeFalsy();
    });

    it('has non-empty titles, subtitles, and accent colors for every item', () => {
      for (const item of MAIN_MENU_ITEMS) {
        expect(item.title.trim().length).toBeGreaterThan(0);
        expect(item.subtitle.trim().length).toBeGreaterThan(0);
        expect(item.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(item.gradient.trim().length).toBeGreaterThan(0);
      }
    });

    it('does NOT contain account, login, or profile actions (offline client architecture)', () => {
      const allText = MAIN_MENU_ITEMS.map(
        (i) => `${i.id} ${i.title} ${i.subtitle} ${i.badge || ''}`
      ).join(' ').toLowerCase();

      expect(allText).not.toContain('login');
      expect(allText).not.toContain('sign in');
      expect(allText).not.toContain('account');
      expect(allText).not.toContain('profile');
    });
  });

  describe('Resource and Community Links', () => {
    it('defines Discord, Github, Wiki, and Bug Report links', () => {
      const labels = RESOURCE_LINKS.map((link) => link.label);
      expect(labels).toEqual(['Discord', 'Github', 'Wiki', 'Bug Report']);

      for (const link of RESOURCE_LINKS) {
        expect(link.href.startsWith('https://')).toBe(true);
      }
    });
  });
});
