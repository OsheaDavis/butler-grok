import type { AppData, Settings } from '../../lib/types';

export const SETTINGS_FILE = 'settings.json';
export const DATA_FILE = 'appdata.json';

export function browserFallbackLoad<T>(key: string, defaults: T): { data: T; recovered: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { data: defaults, recovered: false };
    return { data: JSON.parse(raw) as T, recovered: false };
  } catch {
    return { data: defaults, recovered: false };
  }
}

export function browserFallbackSave(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data));
}

export async function persistAppFiles(settings: Settings, data: AppData) {
  if (window.butler) {
    await window.butler.save(SETTINGS_FILE, { ...settings, apiKey: '' });
    await window.butler.save(DATA_FILE, data);
  } else {
    browserFallbackSave(SETTINGS_FILE, settings);
    browserFallbackSave(DATA_FILE, data);
  }
}
