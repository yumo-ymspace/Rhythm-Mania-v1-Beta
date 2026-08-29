export type ModAcronym =
  | 'EZ'
  | 'NF'
  | 'HT'
  | 'DC'
  | 'HR'
  | 'SD'
  | 'PF'
  | 'DT'
  | 'NC'
  | 'HD'
  | 'FI'
  | 'FL'
  | 'CO'
  | 'AC'
  | 'AT'
  | 'CN'
  | 'RD'
  | 'DS'
  | 'MR'
  | 'DA'
  | 'CL'
  | 'IN'
  | 'CS'
  | 'HO'
  | '1K'
  | '2K'
  | '3K'
  | '4K'
  | '5K'
  | '6K'
  | '7K'
  | '8K'
  | '9K'
  | '10K';

export type ModCategory = 'reduction' | 'increase' | 'automation' | 'conversion';

export type ModDef = {
  acronym: ModAcronym;
  name: string;
  category: ModCategory;
  scoreMultiplier: number;
  rate?: number;
  incompatible: ModAcronym[];
};

const KEY_MODS: ModAcronym[] = ['1K', '2K', '3K', '4K', '5K', '6K', '7K', '8K', '9K', '10K'];

export const MANIA_MODS: ModDef[] = [
  { acronym: 'EZ', name: 'Easy', category: 'reduction', scoreMultiplier: 0.5, incompatible: ['HR', 'AC'] },
  { acronym: 'NF', name: 'No Fail', category: 'reduction', scoreMultiplier: 0.5, incompatible: ['SD', 'PF', 'AC'] },
  { acronym: 'HT', name: 'Half Time', category: 'reduction', scoreMultiplier: 0.3, rate: 0.75, incompatible: ['DC', 'DT', 'NC'] },
  { acronym: 'DC', name: 'Daycore', category: 'reduction', scoreMultiplier: 0.3, rate: 0.75, incompatible: ['HT', 'DT', 'NC'] },
  { acronym: 'HR', name: 'Hard Rock', category: 'increase', scoreMultiplier: 1.06, incompatible: ['EZ'] },
  { acronym: 'SD', name: 'Sudden Death', category: 'increase', scoreMultiplier: 1, incompatible: ['NF', 'PF', 'AT', 'CN'] },
  { acronym: 'PF', name: 'Perfect', category: 'increase', scoreMultiplier: 1, incompatible: ['NF', 'SD', 'AT', 'CN'] },
  { acronym: 'DT', name: 'Double Time', category: 'increase', scoreMultiplier: 1.12, rate: 1.5, incompatible: ['NC', 'HT', 'DC'] },
  { acronym: 'NC', name: 'Nightcore', category: 'increase', scoreMultiplier: 1.12, rate: 1.5, incompatible: ['DT', 'HT', 'DC'] },
  { acronym: 'HD', name: 'Hidden', category: 'increase', scoreMultiplier: 1.06, incompatible: ['FI', 'CO'] },
  { acronym: 'FI', name: 'Fade In', category: 'increase', scoreMultiplier: 1.06, incompatible: ['HD', 'CO'] },
  { acronym: 'FL', name: 'Flashlight', category: 'increase', scoreMultiplier: 1.12, incompatible: [] },
  { acronym: 'CO', name: 'Cover', category: 'increase', scoreMultiplier: 1.06, incompatible: ['HD', 'FI'] },
  { acronym: 'AC', name: 'Accuracy Challenge', category: 'increase', scoreMultiplier: 1, incompatible: ['NF', 'EZ'] },
  { acronym: 'AT', name: 'Autoplay', category: 'automation', scoreMultiplier: 1, incompatible: ['CN', 'SD', 'PF'] },
  { acronym: 'CN', name: 'Cinema', category: 'automation', scoreMultiplier: 1, incompatible: ['AT'] },
  { acronym: 'RD', name: 'Random', category: 'conversion', scoreMultiplier: 1, incompatible: [] },
  { acronym: 'DS', name: 'Dual Stages', category: 'conversion', scoreMultiplier: 1, incompatible: [] },
  { acronym: 'MR', name: 'Mirror', category: 'conversion', scoreMultiplier: 1, incompatible: [] },
  { acronym: 'DA', name: 'Difficulty Adjust', category: 'conversion', scoreMultiplier: 1, incompatible: [] },
  { acronym: 'CL', name: 'Classic', category: 'conversion', scoreMultiplier: 1, incompatible: [] },
  { acronym: 'IN', name: 'Invert', category: 'conversion', scoreMultiplier: 1, incompatible: [] },
  { acronym: 'CS', name: 'Constant Speed', category: 'conversion', scoreMultiplier: 1, incompatible: [] },
  { acronym: 'HO', name: 'Hold Off', category: 'conversion', scoreMultiplier: 1, incompatible: [] },
  ...KEY_MODS.map((k) => ({
    acronym: k,
    name: k,
    category: 'conversion' as const,
    scoreMultiplier: 1,
    incompatible: KEY_MODS.filter((other) => other !== k),
  })),
];

export const MOD_BY_ACRONYM = new Map(MANIA_MODS.map((m) => [m.acronym, m]));

export function toggleMod(selected: ModAcronym[], acronym: ModAcronym): ModAcronym[] {
  const def = MOD_BY_ACRONYM.get(acronym);
  if (!def) return selected;
  if (selected.includes(acronym)) return selected.filter((m) => m !== acronym);
  const blocked = new Set(def.incompatible);
  return [...selected.filter((m) => !blocked.has(m)), acronym];
}

export function scoreMultiplierFor(selected: ModAcronym[]): number {
  return selected.reduce((acc, m) => acc * (MOD_BY_ACRONYM.get(m)?.scoreMultiplier ?? 1), 1);
}

export function playbackRateFor(selected: ModAcronym[]): number {
  const withRate = selected.map((m) => MOD_BY_ACRONYM.get(m)?.rate).find((r) => r !== undefined);
  return withRate ?? 1;
}

export function keyCountOverride(selected: ModAcronym[]): number | null {
  const key = selected.find((m) => KEY_MODS.includes(m));
  if (!key) return null;
  return Number(key.replace('K', ''));
}

export function isSilverRankMods(selected: ModAcronym[]): boolean {
  return selected.includes('HD') || selected.includes('FI') || selected.includes('FL');
}

export function remapColumns(columns: number[], keyCount: number, selected: ModAcronym[]): number[] {
  let mapped = [...columns];
  if (selected.includes('MR')) {
    mapped = mapped.map((c) => keyCount - 1 - c);
  }
  if (selected.includes('RD')) {
    const perm = seededPermutation(keyCount, 1);
    mapped = mapped.map((c) => perm[c] ?? c);
  }
  return mapped;
}

function seededPermutation(n: number, seed: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
