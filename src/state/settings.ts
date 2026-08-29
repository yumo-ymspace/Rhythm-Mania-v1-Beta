import { defaultBindsFor } from '../engine/input/bindings';
import { db, type StoredSettings } from '../storage/db';

export const DEFAULT_SETTINGS: StoredSettings = {
  id: 'settings',
  masterVolume: 0.8,
  musicVolume: 0.7,
  hitsoundVolume: 0.8,
  userOffsetMs: 0,
  scrollDurationMs: 500,
  upscroll: false,
  backgroundDim: 0.7,
  binds: {
    1: defaultBindsFor(1),
    2: defaultBindsFor(2),
    3: defaultBindsFor(3),
    4: defaultBindsFor(4),
    5: defaultBindsFor(5),
    6: defaultBindsFor(6),
    7: defaultBindsFor(7),
    8: defaultBindsFor(8),
    9: defaultBindsFor(9),
    10: defaultBindsFor(10),
  },
};

export async function loadSettings(): Promise<StoredSettings> {
  const stored = await db.settings.get('settings');
  if (!stored) {
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    binds: { ...DEFAULT_SETTINGS.binds, ...stored.binds },
  };
}

export async function saveSettings(next: StoredSettings): Promise<void> {
  await db.settings.put(next);
}
