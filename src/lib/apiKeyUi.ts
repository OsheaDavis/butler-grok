/** Placeholder shown in the Settings / first-run password field when a key is stored in main. */
export const API_KEY_MASK = '••••••••••••••••';

export function isApiKeyMask(value: string): boolean {
  return value === API_KEY_MASK;
}
