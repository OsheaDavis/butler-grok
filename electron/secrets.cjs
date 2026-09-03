const fs = require('fs');
const path = require('path');

/** @type {string | null} */
let keyFilePath = null;
/** @type {{ isEncryptionAvailable: () => boolean, encryptString: (s: string) => Buffer, decryptString: (b: Buffer) => string } | null} */
let storage = null;

function initSecrets(opts) {
  keyFilePath = String(opts.filePath);
  storage = opts.safeStorage;
}

function assertReady() {
  if (!keyFilePath || !storage) {
    throw new Error('Secrets store not initialized');
  }
}

function hasApiKey() {
  try {
    assertReady();
    if (!fs.existsSync(keyFilePath)) return false;
    return fs.statSync(keyFilePath).size > 0;
  } catch {
    return false;
  }
}

/** Main-process only. Never send this string over IPC. */
function getApiKey() {
  try {
    assertReady();
    if (!fs.existsSync(keyFilePath)) return '';
    const buf = fs.readFileSync(keyFilePath);
    if (!buf.length) return '';
    if (!storage.isEncryptionAvailable()) return '';
    return String(storage.decryptString(buf) || '').trim();
  } catch {
    return '';
  }
}

function clearApiKey() {
  assertReady();
  try {
    if (fs.existsSync(keyFilePath)) fs.unlinkSync(keyFilePath);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

function setApiKey(raw) {
  assertReady();
  const key = String(raw || '').trim();
  if (!key) return clearApiKey();
  if (!storage.isEncryptionAvailable()) {
    return { ok: false, error: 'OS encryption is not available on this machine.' };
  }
  try {
    const dir = path.dirname(keyFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buf = storage.encryptString(key);
    fs.writeFileSync(keyFilePath, buf);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not encrypt and store the API key.' };
  }
}

function stripApiKeyFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = { ...value };
  if (typeof out.apiKey === 'string') out.apiKey = '';
  if (out.settings && typeof out.settings === 'object' && !Array.isArray(out.settings)) {
    out.settings = { ...out.settings, apiKey: '' };
  }
  return out;
}

/**
 * Move a plaintext apiKey from loaded JSON into safeStorage once, then strip it.
 * @returns {{ data: unknown, migrated: boolean }}
 */
function migrateAndStripSecrets(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { data, migrated: false };
  }
  let migrated = false;
  const obj = { ...data };

  const take = (raw) => {
    const k = String(raw || '').trim();
    if (!k) return;
    if (!hasApiKey()) setApiKey(k);
    migrated = true;
  };

  if (typeof obj.apiKey === 'string' && obj.apiKey.trim()) {
    take(obj.apiKey);
    obj.apiKey = '';
  }
  if (obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings)) {
    const nested = { ...obj.settings };
    if (typeof nested.apiKey === 'string' && nested.apiKey.trim()) {
      take(nested.apiKey);
      nested.apiKey = '';
      obj.settings = nested;
    }
  }

  return { data: stripApiKeyFields(obj), migrated };
}

module.exports = {
  initSecrets,
  hasApiKey,
  getApiKey,
  setApiKey,
  clearApiKey,
  stripApiKeyFields,
  migrateAndStripSecrets,
};
