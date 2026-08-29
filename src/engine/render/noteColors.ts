export type NoteLaneType = '1' | '2' | 'S';

const PATTERNS: Record<number, NoteLaneType[]> = {
  1: ['S'],
  2: ['1', '1'],
  3: ['1', 'S', '1'],
  4: ['1', '2', '2', '1'],
  5: ['1', '2', 'S', '2', '1'],
  6: ['1', '2', '1', '1', '2', '1'],
  7: ['1', '2', '1', 'S', '1', '2', '1'],
  8: ['1', '2', '1', '2', '2', '1', '2', '1'],
  9: ['1', '2', '1', '2', 'S', '2', '1', '2', '1'],
  10: ['1', '2', '1', '2', 'S', 'S', '2', '1', '2', '1'],
};

export const LANE_COLORS: Record<NoteLaneType, number> = {
  '1': 0x00f0ff,
  '2': 0x0088ff,
  S: 0xffcc00,
};

export function laneType(keyCount: number, column: number): NoteLaneType {
  const pattern = PATTERNS[keyCount] ?? PATTERNS[4];
  return pattern[column] ?? '1';
}

export function laneColor(keyCount: number, column: number): number {
  return LANE_COLORS[laneType(keyCount, column)];
}

export const JUDGEMENT_COLORS: Record<string, string> = {
  Perfect: '#00F0FF',
  Great: '#FFCC00',
  Good: '#00FF66',
  Ok: '#0088FF',
  Meh: '#A0AEC0',
  Miss: '#FF1E56',
};
