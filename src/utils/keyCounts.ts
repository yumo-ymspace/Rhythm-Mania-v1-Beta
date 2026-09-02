export const MIN_KEY_COUNT = 1;
export const MAX_KEY_COUNT = 10;
export const SUPPORTED_KEY_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function isSupportedKeyCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_KEY_COUNT && value <= MAX_KEY_COUNT;
}
