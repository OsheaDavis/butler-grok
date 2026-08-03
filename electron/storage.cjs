const fs = require('fs');
const path = require('path');

/**
 * Crash-safe JSON write: write .tmp → rename over target; keep .bak of previous good file.
 */
function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = `${filePath}.tmp`;
  const bak = `${filePath}.bak`;
  const json = JSON.stringify(data, null, 2);

  fs.writeFileSync(tmp, json, 'utf8');

  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, bak);
    } catch {
      /* ignore bak failure */
    }
  }

  // On Windows, rename may fail if target exists — remove then rename
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* */
    }
    fs.renameSync(tmp, filePath);
  }
}

/**
 * Load JSON; if corrupt, try .bak. Returns { data, recovered }.
 */
function readJsonWithBackup(filePath, defaults) {
  const tryRead = (p) => {
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  };

  const main = tryRead(filePath);
  if (main !== null) return { data: main, recovered: false };

  const bak = tryRead(`${filePath}.bak`);
  if (bak !== null) return { data: bak, recovered: true };

  return { data: defaults, recovered: false };
}

module.exports = { atomicWriteJson, readJsonWithBackup };
