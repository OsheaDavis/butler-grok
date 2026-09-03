const path = require('path');

/** Renderer may only read/write these JSON files under DATA_DIR. */
const ALLOWED_STORAGE_FILES = new Set(['appdata.json', 'settings.json']);

/**
 * Resolve a renderer-supplied storage fileName to a path inside dataDir.
 * Rejects separators, `..`, absolute paths, and unknown names.
 *
 * @param {string} dataDir
 * @param {unknown} fileName
 * @returns {{ ok: true, path: string, fileName: string } | { ok: false, error: string }}
 */
function resolveStoragePath(dataDir, fileName) {
  const name = String(fileName ?? '');
  if (!name || !ALLOWED_STORAGE_FILES.has(name)) {
    return { ok: false, error: 'Storage file not allowed' };
  }
  if (name !== path.basename(name)) {
    return { ok: false, error: 'Storage file must be a basename' };
  }
  if (name.includes('..') || /[\\/]/.test(name) || path.isAbsolute(name)) {
    return { ok: false, error: 'Storage path rejected' };
  }
  const root = path.resolve(dataDir);
  const resolved = path.resolve(root, name);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'Storage path escapes data directory' };
  }
  return { ok: true, path: resolved, fileName: name };
}

module.exports = { ALLOWED_STORAGE_FILES, resolveStoragePath };
