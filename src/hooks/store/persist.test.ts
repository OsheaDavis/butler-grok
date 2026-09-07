import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_DATA, DEFAULT_SETTINGS } from '../../lib/types';
import {
  DATA_FILE,
  SETTINGS_FILE,
  browserFallbackLoad,
  browserFallbackSave,
  persistAppFiles,
} from './persist';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserFallbackLoad / browserFallbackSave', () => {
  it('returns defaults when the key is missing', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(browserFallbackLoad('missing.json', { n: 1 })).toEqual({ data: { n: 1 }, recovered: false });
  });

  it('round-trips JSON through localStorage', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    browserFallbackSave('settings.json', { theme: 'dark' });
    expect(browserFallbackLoad('settings.json', { theme: 'light' })).toEqual({
      data: { theme: 'dark' },
      recovered: false,
    });
  });

  it('falls back to defaults when stored JSON is invalid', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{not-json',
      setItem: () => undefined,
    });
    expect(browserFallbackLoad('broken.json', { ok: true })).toEqual({ data: { ok: true }, recovered: false });
  });
});

describe('persistAppFiles', () => {
  it('writes settings without an API key when Electron storage is available', async () => {
    const saved: { file: string; data: unknown }[] = [];
    vi.stubGlobal('window', {
      butler: {
        save: async (file: string, data: unknown) => {
          saved.push({ file, data });
          return { ok: true };
        },
      },
    });

    await persistAppFiles({ ...DEFAULT_SETTINGS, apiKey: 'sk-should-not-persist' }, DEFAULT_APP_DATA);

    expect(saved.map((s) => s.file)).toEqual([SETTINGS_FILE, DATA_FILE]);
    const settings = saved[0].data as { apiKey: string };
    expect(settings.apiKey).toBe('');
  });

  it('uses localStorage when window.butler is missing', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', storage);

    await persistAppFiles(DEFAULT_SETTINGS, DEFAULT_APP_DATA);

    expect(storage.getItem(SETTINGS_FILE)).toContain('"connectionMode":"A"');
    expect(storage.getItem(DATA_FILE)).toContain('"conversations":[]');
  });
});
