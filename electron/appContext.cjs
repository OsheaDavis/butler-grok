const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const APP_ROOT = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
/**
 * User data location (never commit this folder).
 * Priority:
 * 1. BUTLER_DATA_DIR env
 * 2. Legacy path C:\Grok Build\Butler Grok\Data (existing installs)
 * 3. Electron userData/Data (portable for new contributors)
 */
const LEGACY_DATA_DIR = path.join('C:', 'Grok Build', 'Butler Grok', 'Data');
function resolveDataDir() {
  if (process.env.BUTLER_DATA_DIR) return process.env.BUTLER_DATA_DIR;
  try {
    if (fs.existsSync(LEGACY_DATA_DIR) || fs.existsSync(path.dirname(LEGACY_DATA_DIR))) {
      return LEGACY_DATA_DIR;
    }
  } catch {
    /* ignore */
  }
  return path.join(app.getPath('userData'), 'Data');
}
const DATA_DIR = resolveDataDir();
const VERSION = '0.1.0';

/** Shared mutable main-process state (windows, tray, quit flags). */
const state = {
  mainWindow: null,
  tray: null,
  allowQuit: false,
  minimizeToTray: false,
  /** @type {Map<string, Electron.BrowserWindow>} */
  panelWindows: new Map(),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function dataPath(name) {
  return path.join(DATA_DIR, name);
}

function assetPath(...parts) {
  if (isDev) return path.join(APP_ROOT, 'assets', ...parts);
  // packaged: extraResources → resources/assets
  return path.join(process.resourcesPath, 'assets', ...parts);
}

function broadcastAll(channel, payload, exceptWebContentsId) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win && !win.isDestroyed()) {
      if (
        exceptWebContentsId != null &&
        win.webContents.id === exceptWebContentsId
      ) {
        continue;
      }
      try {
        win.webContents.send(channel, payload);
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = {
  isDev,
  APP_ROOT,
  LEGACY_DATA_DIR,
  DATA_DIR,
  VERSION,
  state,
  resolveDataDir,
  ensureDataDir,
  dataPath,
  assetPath,
  broadcastAll,
};
