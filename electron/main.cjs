const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Notification,
  Tray,
  Menu,
  nativeImage,
  session,
  clipboard,
  protocol,
  safeStorage,
  net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { atomicWriteJson, readJsonWithBackup } = require('./storage.cjs');
const { ALLOWED_STORAGE_FILES, resolveStoragePath } = require('./storagePath.cjs');
const {
  validateGrokCliArgs,
  isAllowedPluginName,
  isAllowedPluginSource,
} = require('./grokCliAllowlist.cjs');
const {
  initSecrets,
  hasApiKey,
  setApiKey,
  clearApiKey,
  stripApiKeyFields,
  migrateAndStripSecrets,
} = require('./secrets.cjs');
const xaiMain = require('./xaiMain.cjs');
const mediaProtocol = require('./mediaProtocol.cjs');

mediaProtocol.registerPrivilegedScheme(protocol);

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

let mainWindow = null;
let tray = null;
let allowQuit = false;
let minimizeToTray = false;
/** @type {Map<string, Electron.BrowserWindow>} */
const panelWindows = new Map();

const PANEL_TITLES = {
  folders: 'Folders',
  conversations: 'Conversations',
  recent: 'Recent Conversations',
  tasks: 'Tasks',
  projects: 'Projects',
  currentlyOpen: 'Currently Open',
  marketplace: 'Marketplace',
  display: 'Display (General)',
  chat: 'Chat',
};

function panelWindowTitle(panelId) {
  if (String(panelId).startsWith('projdisp:')) return 'Project Display';
  return PANEL_TITLES[panelId] || panelId;
}

function loadAppUrl(win, query = {}) {
  const useDevServer = isDev && process.env.BUTLER_PROD !== '1';
  if (useDevServer) {
    const q = new URLSearchParams(query).toString();
    win.loadURL(`http://localhost:5173/${q ? `?${q}` : ''}`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      query,
    });
  }
}

function openPanelWindow(panelId) {
  if (panelWindows.has(panelId)) {
    const existing = panelWindows.get(panelId);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return { ok: true, focused: true };
    }
    panelWindows.delete(panelId);
  }

  const isChat = panelId === 'chat';
  const isMarket = panelId === 'marketplace';
  const win = new BrowserWindow({
    width: isChat ? 720 : isMarket ? 640 : 500,
    height: isChat ? 720 : isMarket ? 680 : 560,
    minWidth: isChat ? 420 : 320,
    minHeight: isChat ? 400 : 280,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    title: `Butler Grok — ${panelWindowTitle(panelId)}`,
    // No parent → can move freely on any monitor, outside main window
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      webSecurity: true,
    },
  });

  loadAppUrl(win, { panel: panelId });
  panelWindows.set(panelId, win);

  win.on('closed', () => {
    panelWindows.delete(panelId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panel:closed', panelId);
    }
  });

  return { ok: true, focused: false };
}

function closePanelWindow(panelId) {
  const win = panelWindows.get(panelId);
  if (win && !win.isDestroyed()) {
    win.close();
  }
  panelWindows.delete(panelId);
  return { ok: true };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function assetPath(...parts) {
  if (isDev) return path.join(APP_ROOT, 'assets', ...parts);
  // packaged: extraResources → resources/assets
  return path.join(process.resourcesPath, 'assets', ...parts);
}

function createTray() {
  if (tray) return;
  let image = nativeImage.createEmpty();
  const iconFile = assetPath('butler-front.png');
  if (fs.existsSync(iconFile)) {
    image = nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 });
  }
  tray = new Tray(image);
  tray.setToolTip('Butler Grok');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Butler Grok',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Start Grok (PowerShell)',
      click: () => startGrokShell(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        allowQuit = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function resolveGrokExe() {
  const candidates = [
    path.join(os.homedir(), '.grok', 'bin', 'grok.exe'),
    path.join(os.homedir(), '.grok', 'bin', 'grok.cmd'),
    path.join(os.homedir(), '.local', 'bin', 'grok.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'grok';
}

/**
 * Open a persistent console window that runs a .cmd script.
 * Uses `start` so the console is detached from Electron and cannot flash-close
 * when the parent process continues.
 */
function openPersistentCmd(scriptPath, title) {
  const titleSafe = String(title || 'ButlerGrok').replace(/["&<>|]/g, ' ').slice(0, 40);
  // cmd /c start "window title" cmd /k script.cmd
  // First quoted token after start is ALWAYS the window title on Windows.
  const child = spawn(
    process.env.ComSpec || 'cmd.exe',
    ['/c', 'start', titleSafe, process.env.ComSpec || 'cmd.exe', '/k', scriptPath],
    {
      detached: true,
      shell: false,
      windowsHide: true, // hide the short-lived launcher; the started window is visible
      stdio: 'ignore',
      env: process.env,
      cwd: os.homedir(),
    }
  );
  child.on('error', (err) => {
    console.error('openPersistentCmd failed', err);
  });
  child.unref();
}

function startGrokShell() {
  const grokExe = resolveGrokExe();
  const grokDir = path.dirname(grokExe);
  const scriptsDir = path.join(DATA_DIR, 'tmp');
  if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `butler-start-grok-${Date.now()}.cmd`);
  const lines = [
    '@echo off',
    'setlocal EnableExtensions',
    'title Butler Grok - Start Grok Build',
    'echo === Butler Grok ===',
    'echo Starting Grok Build...',
    'echo.',
    `if not exist "${grokExe}" (`,
    '  echo ERROR: grok.exe not found.',
    '  echo Path: ' + grokExe,
    '  pause',
    '  exit /b 1',
    ')',
    `set "PATH=${grokDir};%PATH%"`,
    `cd /d "${grokDir}"`,
    'grok',
    'echo.',
    'echo Grok exited. Press any key to close...',
    'pause >nul',
  ];
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
  openPersistentCmd(scriptPath, 'Butler Grok - Grok Build');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b0f14',
    show: false,
    autoHideMenuBar: true,
    title: 'Butler Grok',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (allowQuit) return;
    if (minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    e.preventDefault();
    mainWindow.webContents.send('app:confirm-close');
  });

  loadAppUrl(mainWindow);
}

function dataPath(name) {
  return path.join(DATA_DIR, name);
}

function allowMediaPermissions() {
  // Speak / mic: Chromium asks for media; grant mic + camera checks in-app only.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = permission === 'media' || permission === 'mediaKeySystem' || permission === 'notifications';
    callback(allow);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'mediaKeySystem' || permission === 'notifications';
  });
}

app.whenReady().then(() => {
  ensureDataDir();
  initSecrets({
    filePath: path.join(app.getPath('userData'), 'xai-api-key.enc'),
    safeStorage,
  });
  mediaProtocol.registerHandler(protocol, net, DATA_DIR);
  allowMediaPermissions();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // keep tray alive only if not quitting — if all windows closed and not tray mode, quit
    if (!tray || allowQuit) app.quit();
  }
});

// --- IPC ---

ipcMain.handle('app:get-info', async () => ({
  version: VERSION,
  dataDir: DATA_DIR,
  isDev,
  platform: process.platform,
  homeDir: app.getPath('home'),
}));

ipcMain.handle('panel:open', async (_e, panelId) => openPanelWindow(String(panelId)));
ipcMain.handle('panel:close', async (_e, panelId) => closePanelWindow(String(panelId)));
ipcMain.handle('panel:list-open', async () => [...panelWindows.keys()]);

ipcMain.handle('app:quit', async () => {
  allowQuit = true;
  app.quit();
});

ipcMain.handle('app:minimize', async () => {
  if (!mainWindow) return;
  if (minimizeToTray) {
    mainWindow.hide();
  } else {
    mainWindow.minimize();
  }
});

ipcMain.handle('app:set-tray-minimize', async (_e, enabled) => {
  minimizeToTray = Boolean(enabled);
  return { ok: true };
});

ipcMain.handle('app:set-login-item', async (_e, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: isDev ? [] : [],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('app:get-login-item', async () => {
  try {
    const s = app.getLoginItemSettings();
    return { openAtLogin: Boolean(s.openAtLogin) };
  } catch {
    return { openAtLogin: false };
  }
});

ipcMain.handle('storage:load', async (_e, fileName, defaults) => {
  ensureDataDir();
  const resolved = resolveStoragePath(DATA_DIR, fileName);
  if (!resolved.ok) {
    return { data: defaults, recovered: false, error: resolved.error };
  }
  const result = readJsonWithBackup(resolved.path, defaults);
  const migrated = migrateAndStripSecrets(result.data);
  if (migrated.migrated) {
    try {
      atomicWriteJson(resolved.path, migrated.data);
    } catch {
      /* keep serving stripped data even if rewrite fails */
    }
  }
  return { data: migrated.data, recovered: result.recovered };
});

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

ipcMain.handle('storage:save', async (e, fileName, data) => {
  ensureDataDir();
  const resolved = resolveStoragePath(DATA_DIR, fileName);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const migrated = migrateAndStripSecrets(data);
  atomicWriteJson(resolved.path, migrated.data);
  // Sync other windows only (not the saver — avoids reload/save loops)
  broadcastAll('storage:changed', { fileName: resolved.fileName }, e.sender.id);
  return { ok: true };
});

/** Live chat stream + busy state shared across main + panel windows. */
ipcMain.handle('chat:publish-live', async (e, state) => {
  // Include sender too is fine for chat:live, but skip sender so owner keeps local state only
  broadcastAll('chat:live', state || {}, e.sender.id);
  return { ok: true };
});

ipcMain.handle('storage:export-backup', async () => {
  ensureDataDir();
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Butler Grok backup',
    defaultPath: `butler-grok-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  const files = fs.readdirSync(DATA_DIR).filter((f) => ALLOWED_STORAGE_FILES.has(f));
  const bundle = { exportedAt: new Date().toISOString(), version: VERSION, files: {} };
  for (const f of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      bundle.files[f] = stripApiKeyFields(parsed);
    } catch {
      /* skip */
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('storage:import-backup', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Butler Grok backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths?.[0]) return { ok: false };
  try {
    const bundle = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!bundle.files) return { ok: false, error: 'Invalid backup file' };
    ensureDataDir();
    for (const [name, data] of Object.entries(bundle.files)) {
      const resolved = resolveStoragePath(DATA_DIR, name);
      if (!resolved.ok) continue;
      const migrated = migrateAndStripSecrets(data);
      atomicWriteJson(resolved.path, migrated.data);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('grok:status', async () => {
  return new Promise((resolve) => {
    const child = spawn('where', ['grok'], { shell: true, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', (code) => {
      resolve({
        onPath: code === 0 && out.trim().length > 0,
        pathHint: out.trim().split(/\r?\n/)[0] || null,
        connected: code === 0 && out.trim().length > 0,
      });
    });
    child.on('error', () => resolve({ onPath: false, pathHint: null, connected: false }));
  });
});

ipcMain.handle('grok:start', async () => {
  startGrokShell();
  return { ok: true };
});

/**
 * Open a helper window with clear steps.
 * On this PC, running from the auto-opened console often fails; a NEW TAB works.
 * So we: copy the command, tell user to open a new tab, paste, Enter.
 * @param {{ kind: string, extraArgs?: string }} payload
 */
ipcMain.handle('grok:open-terminal', async (_e, payload) => {
  const kind = String(payload?.kind || 'grok');
  const extraArgsRaw = String(payload?.extraArgs || '').trim();
  const extraArgs =
    (kind === 'plugin-install' && isAllowedPluginSource(extraArgsRaw)) ||
    (kind === 'plugin-update' && isAllowedPluginName(extraArgsRaw))
      ? extraArgsRaw
      : '';
  const grokExe = resolveGrokExe();
  const grokDir = path.dirname(grokExe);

  let title = 'Butler Grok helper';
  let intro = '';
  let command = 'grok';
  /** @type {string[]} */
  let steps = [];

  if (kind === 'update-alpha') {
    title = 'Grok Update (alpha)';
    intro = 'Update Grok Build (alpha)';
    command = 'grok update --alpha';
    steps = [
      '1. Open a NEW TAB in this terminal (Ctrl+Shift+T  or  click +)',
      '2. Right-click in the NEW tab to PASTE',
      '3. Press Enter',
      '',
      'If paste fails, type exactly:',
      '   grok update --alpha',
    ];
  } else if (kind === 'update-check') {
    title = 'Grok Update (check)';
    intro = 'Check for updates only (no install)';
    command = 'grok update --check';
    steps = [
      '1. Open a NEW TAB (Ctrl+Shift+T  or  click +)',
      '2. Right-click in the NEW tab to PASTE',
      '3. Press Enter',
    ];
  } else if (kind === 'update') {
    title = 'Grok Update (stable)';
    intro = 'Update Grok Build (stable)';
    command = 'grok update --stable';
    steps = [
      '1. Open a NEW TAB (Ctrl+Shift+T  or  click +)',
      '2. Right-click in the NEW tab to PASTE',
      '3. Press Enter',
    ];
  } else if (kind === 'plugin-install' && extraArgs) {
    title = 'Grok plugin install';
    intro = 'Install a Grok Build plugin';
    command = `grok plugin install ${extraArgs} --trust`;
    steps = [
      '1. Open a NEW TAB (Ctrl+Shift+T  or  click +)',
      '2. Right-click in the NEW tab to PASTE',
      '3. Press Enter',
      '',
      'If it says already installed, that is OK.',
    ];
  } else if (kind === 'plugin-update' && extraArgs) {
    title = 'Grok plugin update';
    intro = 'Update a Grok Build plugin';
    command = `grok plugin update ${extraArgs}`;
    steps = [
      '1. Open a NEW TAB (Ctrl+Shift+T  or  click +)',
      '2. Right-click in the NEW tab to PASTE',
      '3. Press Enter',
    ];
  } else if (kind === 'marketplace') {
    title = 'Grok Marketplace helper';
    intro = 'Advanced: install/update plugins inside Grok Build';
    command = 'grok';
    steps = [
      '1. Open a NEW TAB (Ctrl+Shift+T  or  click +)',
      '2. Right-click in the NEW tab to PASTE  (pastes: grok)',
      '3. Press Enter  - Grok Build TUI opens',
      '4. In Grok Build, press /  (slash) for commands',
      '5. Open Marketplace  (or type marketplace if listed)',
      '6. Follow the on-screen steps to install / update / auth',
      '',
      'Tip: You can also use Butler Marketplace Install buttons;',
      '     they copy a plugin install command for a new tab too.',
    ];
  } else {
    title = 'Grok Build helper';
    intro = 'Start Grok Build';
    command = 'grok';
    steps = [
      '1. Open a NEW TAB (Ctrl+Shift+T  or  click +)',
      '2. Right-click in the NEW tab to PASTE  (pastes: grok)',
      '3. Press Enter',
    ];
  }

  try {
    clipboard.writeText(command);
  } catch {
    /* ignore */
  }

  const scriptsDir = path.join(DATA_DIR, 'tmp');
  if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `butler-term-${Date.now()}.cmd`);

  const lines = [
    '@echo off',
    `title ${title.replace(/[<>|&]/g, ' ')}`,
    `set "PATH=${grokDir};%PATH%"`,
    `cd /d "${grokDir}"`,
    'echo.',
    'echo ================================================',
    'echo   Butler Grok helper  (keep this window open)',
    'echo ================================================',
    'echo.',
    `echo ${intro}`,
    'echo.',
    'echo Command is COPIED to your clipboard:',
    'echo.',
    `echo     ${command}`,
    'echo.',
    'echo IMPORTANT: Run it in a NEW TAB (not always this window).',
    'echo.',
    ...steps.map((s) => (s ? `echo ${s}` : 'echo.')),
    'echo.',
    'echo ------------------------------------------------',
    'echo This window is only instructions. You can leave it open.',
    'echo.',
  ];

  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
  openPersistentCmd(scriptPath, title);

  return {
    ok: true,
    kind,
    grokExe,
    command,
    copied: true,
    usedWindowsTerminal: false,
    scriptPath,
  };
});

/** Settings / legacy — same new-tab + paste helper */
ipcMain.handle('grok:update', async (_e, payload) => {
  const alpha = Boolean(payload?.alpha);
  const checkOnly = Boolean(payload?.checkOnly);
  const command = checkOnly
    ? 'grok update --check'
    : alpha
      ? 'grok update --alpha'
      : 'grok update --stable';
  const grokExe = resolveGrokExe();
  const grokDir = path.dirname(grokExe);
  try {
    clipboard.writeText(command);
  } catch {
    /* ignore */
  }
  const scriptsDir = path.join(DATA_DIR, 'tmp');
  if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, `butler-update-${Date.now()}.cmd`);
  const lines = [
    '@echo off',
    'title Butler Grok - Grok Update',
    `set "PATH=${grokDir};%PATH%"`,
    `cd /d "${grokDir}"`,
    'echo.',
    'echo ================================================',
    'echo   Butler Grok - update helper',
    'echo ================================================',
    'echo.',
    'echo Command COPIED to clipboard:',
    `echo     ${command}`,
    'echo.',
    'echo Do this:',
    'echo   1. Open a NEW TAB  (Ctrl+Shift+T  or  click +)',
    'echo   2. Right-click in the NEW tab to PASTE',
    'echo   3. Press Enter',
    'echo.',
    'echo This window is only instructions.',
    'echo.',
  ];
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
  openPersistentCmd(scriptPath, 'Butler Grok - Grok Update');
  return { ok: true, alpha, checkOnly, grokExe, command, copied: true };
});

/** Save a remote or data: URL image/video to a user-chosen path or Desktop. */
ipcMain.handle('media:save', async (_e, payload) => {
  const src = String(payload?.src || '');
  const title = String(payload?.title || 'media');
  const kind = payload?.kind === 'video' ? 'video' : 'image';
  const toDesktop = Boolean(payload?.toDesktop);
  if (!src) return { ok: false, error: 'No media source' };

  try {
    let buffer;
    let ext = kind === 'video' ? 'mp4' : 'png';

    if (src.startsWith('data:')) {
      const match = /^data:([^;]+);base64,(.+)$/i.exec(src);
      if (!match) return { ok: false, error: 'Invalid data URL' };
      const mime = match[1].toLowerCase();
      if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
      else if (mime.includes('webp')) ext = 'webp';
      else if (mime.includes('gif')) ext = 'gif';
      else if (mime.includes('png')) ext = 'png';
      else if (mime.includes('mp4')) ext = 'mp4';
      else if (mime.includes('webm')) ext = 'webm';
      buffer = Buffer.from(match[2], 'base64');
    } else if (src.startsWith('butler-media:')) {
      const local = mediaProtocol.localPathFromButlerMedia(DATA_DIR, src);
      if (!local) return { ok: false, error: 'Cached media not found' };
      buffer = fs.readFileSync(local);
      const pathGuess = path.extname(local).replace('.', '');
      if (pathGuess) ext = pathGuess;
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await fetch(src);
      if (!res.ok) return { ok: false, error: `Download failed (${res.status})` };
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
      else if (ct.includes('webp')) ext = 'webp';
      else if (ct.includes('gif')) ext = 'gif';
      else if (ct.includes('png')) ext = 'png';
      else if (ct.includes('mp4')) ext = 'mp4';
      else if (ct.includes('webm')) ext = 'webm';
      else {
        const pathGuess = src.split('?')[0].split('.').pop();
        if (pathGuess && pathGuess.length <= 5) ext = pathGuess;
      }
      buffer = Buffer.from(await res.arrayBuffer());
    } else if (fs.existsSync(src)) {
      buffer = fs.readFileSync(src);
      const pathGuess = path.extname(src).replace('.', '');
      if (pathGuess) ext = pathGuess;
    } else {
      return { ok: false, error: 'Unsupported media source' };
    }

    const safeBase = title.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 40) || 'butler-media';
    const defaultName = `${safeBase}-${Date.now()}.${ext}`;

    let target;
    if (toDesktop) {
      target = path.join(app.getPath('desktop'), defaultName);
    } else {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow || undefined, {
        title: 'Save media',
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters:
          kind === 'video'
            ? [
                { name: 'Video', extensions: ['mp4', 'webm', 'mov'] },
                { name: 'All', extensions: ['*'] },
              ]
            : [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
                { name: 'All', extensions: ['*'] },
              ],
      });
      if (canceled || !filePath) return { ok: false, cancelled: true };
      target = filePath;
    }

    fs.writeFileSync(target, buffer);
    return { ok: true, filePath: target };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

/**
 * Download remote media into Data/media-cache and return a butler-media: URL
 * (or a data: URL for modest images) so Display works with webSecurity on.
 */
ipcMain.handle('media:resolve', async (_e, payload) => {
  const src = String(payload?.src || '').trim();
  if (!src) return { ok: false, error: 'No source' };

  try {
    if (src.startsWith('data:')) return { ok: true, src, cached: false };
    if (src.startsWith('butler-media:')) {
      const local = mediaProtocol.localPathFromButlerMedia(DATA_DIR, src);
      if (!local) return { ok: false, error: 'Cached media not found', src };
      return { ok: true, src, cached: true, localPath: local };
    }
    if (src.startsWith('file:')) {
      return mediaProtocol.importLocalFile(DATA_DIR, mediaProtocol.fileUrlToPathSafe(src));
    }
    if (fs.existsSync(src)) {
      return mediaProtocol.importLocalFile(DATA_DIR, src);
    }

    if (!/^https?:\/\//i.test(src)) {
      return { ok: false, error: 'Not a remote URL' };
    }

    const cacheDir = mediaProtocol.cacheDir(DATA_DIR);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const crypto = require('crypto');
    const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 16);
    let ext = 'bin';
    const pathPart = src.split('?')[0];
    const m = /\.([a-z0-9]{2,5})$/i.exec(pathPart);
    if (m) ext = m[1].toLowerCase();

    const existing = fs.readdirSync(cacheDir).find((f) => f.startsWith(hash + '.'));
    if (existing && mediaProtocol.isSafeCacheName(existing)) {
      const full = path.join(cacheDir, existing);
      return cachedMediaResult(full, existing);
    }

    const res = await fetch(src, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      return { ok: false, error: `Download failed (${res.status})`, src };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
    else if (ct.includes('png')) ext = 'png';
    else if (ct.includes('webp')) ext = 'webp';
    else if (ct.includes('gif')) ext = 'gif';
    else if (ct.includes('mp4')) ext = 'mp4';
    else if (ct.includes('webm')) ext = 'webm';
    else if (ct.includes('html')) {
      return {
        ok: false,
        error: 'URL is a web page, not a direct image/video file',
        src,
        isPage: true,
      };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) return { ok: false, error: 'Empty download', src };

    const safeExt = String(ext).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const fileName = `${hash}.${safeExt}`;
    if (!mediaProtocol.isSafeCacheName(fileName)) {
      return { ok: false, error: 'Bad cache name', src };
    }
    const filePath = path.join(cacheDir, fileName);
    fs.writeFileSync(filePath, buf);
    return cachedMediaResult(filePath, fileName, buf);
  } catch (e) {
    return { ok: false, error: String(e?.message || e), src };
  }
});

function cachedMediaResult(filePath, fileName, buf) {
  const ext = path.extname(fileName).replace('.', '').toLowerCase();
  const body = buf || fs.readFileSync(filePath);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext) && body.length < 12_000_000) {
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'svg'
          ? 'image/svg+xml'
          : `image/${ext}`;
    return {
      ok: true,
      src: `data:${mime};base64,${body.toString('base64')}`,
      cached: true,
      localPath: filePath,
    };
  }
  return {
    ok: true,
    src: mediaProtocol.butlerMediaUrl(fileName),
    cached: true,
    localPath: filePath,
  };
}

ipcMain.handle('media:open-external', async (_e, url) => {
  const u = String(url || '');
  if (!u) return { ok: false };
  if (u.startsWith('butler-media:')) {
    const local = mediaProtocol.localPathFromButlerMedia(DATA_DIR, u);
    if (!local) return { ok: false };
    await shell.openPath(local);
    return { ok: true };
  }
  if (u.startsWith('http') || u.startsWith('file:') || u.startsWith('data:')) {
    // data: URLs: write temp and open
    if (u.startsWith('data:')) {
      try {
        const match = /^data:([^;]+);base64,(.+)$/i.exec(u);
        if (!match) return { ok: false };
        const ext = match[1].includes('png') ? 'png' : match[1].includes('jpeg') ? 'jpg' : 'bin';
        const tmp = path.join(DATA_DIR, 'tmp', `open-${Date.now()}.${ext}`);
        if (!fs.existsSync(path.dirname(tmp))) fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, Buffer.from(match[2], 'base64'));
        await shell.openPath(tmp);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
    await shell.openExternal(u);
    return { ok: true };
  }
  if (fs.existsSync(u)) {
    await shell.openPath(u);
    return { ok: true };
  }
  return { ok: false };
});

/**
 * Run a non-interactive `grok` subcommand and return stdout/stderr.
 * Used for marketplace list/install/update and MCP helpers.
 */
ipcMain.handle('grok:cli', async (_e, payload) => {
  const validated = validateGrokCliArgs(payload?.args);
  if (!validated.ok) {
    return { ok: false, code: -1, stdout: '', stderr: validated.error };
  }
  const args = validated.args;

  // Prefer full path — Electron's PATH often misses ~/.grok/bin
  const grokExe = resolveGrokExe();
  return new Promise((resolve) => {
    const child = spawn(grokExe, args, {
      shell: false,
      windowsHide: true,
      env: { ...process.env },
      cwd: os.homedir(),
    });
    let stdout = '';
    let stderr = '';
    const max = 2_000_000;
    child.stdout?.on('data', (d) => {
      if (stdout.length < max) stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      if (stderr.length < max) stderr += d.toString();
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: stderr || 'Command timed out (60s)',
      });
    }, 60_000);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: String(err.message || err) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
});

/**
 * Read xAI marketplace catalog from local cache (marketplace.json under ~/.grok/marketplace-cache).
 */
ipcMain.handle('grok:marketplace-catalog', async () => {
  try {
    const root = path.join(os.homedir(), '.grok', 'marketplace-cache');
    if (!fs.existsSync(root)) return { ok: false, plugins: [], error: 'No marketplace cache yet' };
    const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    const plugins = [];
    for (const d of dirs) {
      const mp = path.join(root, d.name, '.grok-plugin', 'marketplace.json');
      if (!fs.existsSync(mp)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(mp, 'utf8'));
        const list = Array.isArray(raw.plugins) ? raw.plugins : [];
        for (const p of list) {
          let source = '';
          if (p.source?.url) source = p.source.url;
          else if (p.source?.path) source = p.source.path;
          plugins.push({
            name: p.name,
            description: p.description || '',
            category: p.category || '',
            source,
            marketplace: raw.name || raw.description || 'marketplace',
          });
        }
      } catch {
        /* skip bad file */
      }
    }
    return { ok: true, plugins };
  } catch (e) {
    return { ok: false, plugins: [], error: String(e?.message || e) };
  }
});

/** Open interactive Grok so user can complete OAuth / marketplace auth. */
ipcMain.handle('grok:open-interactive', async (_e, payload) => {
  const hint = String(payload?.hint || 'Open Marketplace (plugins) or complete MCP login if prompted.');
  const safeHint = hint.replace(/'/g, "''");
  spawn(
    'powershell.exe',
    [
      '-NoExit',
      '-Command',
      `Write-Host '=== Butler Grok → Grok Build ===' -ForegroundColor Cyan; Write-Host '${safeHint}' -ForegroundColor Yellow; Write-Host ''; grok`,
    ],
    { detached: true, shell: false, windowsHide: false }
  ).unref();
  return { ok: true };
});

/**
 * Open a fresh Grok Build console dedicated to one Butler project.
 * Uses the same reliable cmd/start launcher as Start Grok (not a flash-closed PS spawn).
 */
ipcMain.handle('grok:open-for-project', async (_e, payload) => {
  try {
    ensureDataDir();
    const id = String(payload?.id || 'project');
    const name = String(payload?.name || 'Project').slice(0, 120);
    const instructions = String(payload?.instructions || '').slice(0, 8000);
    const resumeNote = String(payload?.resumeNote || '').slice(0, 1000);
    const ctxDir = path.join(DATA_DIR, 'project-contexts');
    if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true });
    const safeId = id.replace(/[^\w.-]+/g, '_');
    const ctxFile = path.join(ctxDir, `${safeId}.md`);
    const body = [
      `# Butler Grok project: ${name}`,
      '',
      'This Grok Build session is dedicated to this project. Prefer staying on this work.',
      '',
      '## Instructions',
      instructions || '(none yet)',
      '',
      '## Resume note',
      resumeNote || '(none)',
      '',
      `Context file: ${ctxFile}`,
      '',
    ].join('\n');
    fs.writeFileSync(ctxFile, body, 'utf8');

    const grokExe = resolveGrokExe();
    const grokDir = path.dirname(grokExe);
    const scriptsDir = path.join(DATA_DIR, 'tmp');
    if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
    const scriptPath = path.join(scriptsDir, `butler-project-grok-${safeId}-${Date.now()}.cmd`);
    // Keep prompt short — long args break cmd
    const starter = `Butler project: ${name}. Read context file: ${ctxFile}`;
    const lines = [
      '@echo off',
      'setlocal EnableExtensions',
      `title Butler Grok - Project ${name.replace(/[^a-zA-Z0-9 _-]/g, ' ').slice(0, 40)}`,
      'echo === Butler Grok project to Grok Build ===',
      `echo Project: ${name.replace(/[&<>|^]/g, ' ')}`,
      `echo Context: ${ctxFile}`,
      'echo This window is for THIS project only.',
      'echo.',
      `if exist "${ctxFile}" (`,
      `  type "${ctxFile}"`,
      '  echo.',
      ')',
      `if not exist "${grokExe}" (`,
      '  echo ERROR: grok.exe not found.',
      `  echo Looked for: ${grokExe}`,
      '  echo Install Grok Build, then try again.',
      '  pause',
      '  exit /b 1',
      ')',
      `set "PATH=${grokDir};%PATH%"`,
      `cd /d "${os.homedir()}"`,
      'echo Starting Grok Build...',
      'echo.',
      // Quote path if needed; pass starter as first arg when supported
      `"${grokExe}" "${starter.replace(/"/g, '')}"`,
      'echo.',
      'echo Grok exited. Press any key to close this window...',
      'pause >nul',
    ];
    fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
    openPersistentCmd(scriptPath, `BG Project ${name.slice(0, 20)}`);

    // Also copy a ready command for new-tab paste (fallback if window hard to spot)
    try {
      const { clipboard } = require('electron');
      clipboard.writeText(`grok "Butler project: ${name}. Read: ${ctxFile}"`);
    } catch {
      /* ignore */
    }

    return { ok: true, contextPath: ctxFile, grokPath: grokExe, scriptPath };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

/**
 * Best-effort work job: journal to disk + open PowerShell with Grok Build and the prompt visible.
 */
ipcMain.handle('grok:run-work', async (_e, payload) => {
  ensureDataDir();
  const jobsDir = path.join(DATA_DIR, 'work-jobs');
  if (!fs.existsSync(jobsDir)) fs.mkdirSync(jobsDir, { recursive: true });

  const jobId = payload?.jobId || `job_${Date.now()}`;
  const title = String(payload?.title || 'Work task');
  const prompt = String(payload?.prompt || title);
  const jobFile = path.join(jobsDir, `${jobId}.json`);

  atomicWriteJson(jobFile, {
    id: jobId,
    title,
    prompt,
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  const status = await new Promise((resolve) => {
    const child = spawn('where', ['grok'], { shell: true, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', (code) => {
      resolve({
        onPath: code === 0 && out.trim().length > 0,
      });
    });
    child.on('error', () => resolve({ onPath: false }));
  });

  const safeTitle = title.replace(/'/g, "''");
  const safePrompt = prompt.replace(/'/g, "''");
  const jobFileEsc = jobFile.replace(/'/g, "''");
  // Also write a plain .txt the user (or Grok) can open easily
  const txtFile = path.join(jobsDir, `${jobId}.txt`);
  fs.writeFileSync(
    txtFile,
    `Butler Grok work job\nTitle: ${title}\n\n${prompt}\n`,
    'utf8'
  );
  const txtEsc = txtFile.replace(/'/g, "''");

  const ps = [
    `Write-Host '=== Butler Grok work job ===' -ForegroundColor Cyan;`,
    `Write-Host 'Title: ${safeTitle}';`,
    `Write-Host 'Job file: ${jobFileEsc}';`,
    `Write-Host 'Prompt file: ${txtEsc}';`,
    `try { Set-Clipboard -Value @'\n${safePrompt}\n'@; Write-Host 'Prompt copied to clipboard.' -ForegroundColor Green } catch { };`,
    `Write-Host ''; Write-Host 'Prompt:' -ForegroundColor Yellow;`,
    `Write-Host @'`,
    safePrompt,
    `'@;`,
    `Write-Host '';`,
    status.onPath
      ? `Write-Host 'Starting grok… Paste the prompt (Ctrl+V) into Grok Build if needed.' -ForegroundColor Green; grok;`
      : `Write-Host 'grok not found on PATH. Install/start Grok Build, then paste the prompt from clipboard.' -ForegroundColor Red;`,
  ].join(' ');

  spawn('powershell.exe', ['-NoExit', '-Command', ps], {
    detached: true,
    shell: false,
    windowsHide: false,
  }).unref();

  return { ok: true, jobId, jobFile, grokOnPath: status.onPath };
});

ipcMain.handle('dialog:pick-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose folder',
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths?.[0]) return null;
  return filePaths[0];
});

ipcMain.handle('shell:open-path', async (_e, p) => {
  if (p) await shell.openPath(p);
});

ipcMain.handle('notify:show', async (_e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title: title || 'Butler Grok', body: body || '' }).show();
  }
  return { ok: true };
});

ipcMain.handle('diagnostics:copy', async () => {
  const info = {
    version: VERSION,
    dataDir: DATA_DIR,
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    time: new Date().toISOString(),
    hasApiKey: hasApiKey(),
  };
  return JSON.stringify(info, null, 2);
});

function broadcastSecretsChanged() {
  broadcastAll('secrets:changed', { hasKey: hasApiKey() });
}

ipcMain.handle('secrets:has', async () => ({ hasKey: hasApiKey() }));

ipcMain.handle('secrets:set', async (_e, payload) => {
  const key = String(payload?.key || '').trim();
  const r = setApiKey(key);
  if (r.ok) broadcastSecretsChanged();
  return r;
});

ipcMain.handle('secrets:clear', async () => {
  const r = clearApiKey();
  broadcastSecretsChanged();
  return r;
});

ipcMain.handle('secrets:test', async () => xaiMain.testStoredKey());

ipcMain.handle('xai:image', async (_e, payload) => xaiMain.generateImage(payload?.prompt));

ipcMain.handle('xai:stt', async (_e, payload) => xaiMain.transcribe(payload || {}));

/** @type {Map<string, AbortController>} */
const chatAborts = new Map();

ipcMain.handle('xai:chat-abort', async (_e, payload) => {
  const id = String(payload?.requestId || '');
  const ac = chatAborts.get(id);
  if (ac) ac.abort();
  return { ok: true };
});

ipcMain.handle('xai:chat-stream', async (e, payload) => {
  const requestId = String(payload?.requestId || '');
  if (!requestId || requestId.length > 80) {
    return { ok: false, error: 'Invalid stream request' };
  }
  const ac = new AbortController();
  chatAborts.set(requestId, ac);
  try {
    return await xaiMain.chatCompletionStream({
      messages: payload?.messages,
      model: payload?.model,
      signal: ac.signal,
      onReasoning: (full, delta) => {
        try {
          e.sender.send('xai:chat-chunk', { requestId, kind: 'reasoning', full, delta });
        } catch {
          /* ignore */
        }
      },
      onContent: (full, delta) => {
        try {
          e.sender.send('xai:chat-chunk', { requestId, kind: 'content', full, delta });
        } catch {
          /* ignore */
        }
      },
    });
  } finally {
    chatAborts.delete(requestId);
  }
});

/** @type {import('child_process').ChildProcess | null} */
let leoPlayerProc = null;
let leoTempFile = null;
/** When true, killing the player is intentional (Stop voice) — not a failure. */
let leoStopRequested = false;

function stopLeoPlaybackMain(opts = {}) {
  const userStop = Boolean(opts.userStop);
  const hadPlayer = Boolean(leoPlayerProc && !leoPlayerProc.killed);
  if (userStop) leoStopRequested = true;
  if (leoPlayerProc && !leoPlayerProc.killed) {
    try {
      leoPlayerProc.kill();
    } catch {
      /* ignore */
    }
  }
  leoPlayerProc = null;
  if (leoTempFile && fs.existsSync(leoTempFile)) {
    try {
      fs.unlinkSync(leoTempFile);
    } catch {
      /* ignore */
    }
  }
  leoTempFile = null;
  // Only notify UI if something was playing or user hit Stop (not pre-clear before a new speak)
  if (hadPlayer || userStop) {
    try {
      broadcastAll('leo:audio', { phase: 'end', cancelled: userStop });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fetch Leo TTS in the main process and play with Windows MediaPlayer.
 * Uses the key stored in safeStorage — renderer must not pass a Bearer token.
 */
ipcMain.handle('leo:speak', async (_e, payload) => {
  const text = String(payload?.text || '')
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]{0,40})\]\([^)]+\)/g, '$1')
    .trim()
    .slice(0, 4000);

  if (!text) return { ok: false, error: 'Nothing to speak' };

  // Stop any previous clip without treating it as a user "Stop voice"
  leoStopRequested = false;
  stopLeoPlaybackMain({ userStop: false });

  try {
    const tts = await xaiMain.fetchLeoTtsBuffer(text);
    if (!tts.ok) return { ok: false, error: tts.error };
    const buf = tts.buffer;

    const tmpDir = path.join(DATA_DIR, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const file = path.join(tmpDir, `leo-${Date.now()}.mp3`);
    fs.writeFileSync(file, buf);
    leoTempFile = file;

    // Play MP3 via WPF MediaPlayer (default Windows playback device).
    // Prints LEO_PLAY_START on stdout the moment audio actually begins so the UI
    // can sync speak animation + VU meter (not during TTS download).
    const fileUri = 'file:///' + file.replace(/\\/g, '/');
    const ps = `
Add-Type -AssemblyName PresentationCore
$mp = New-Object System.Windows.Media.MediaPlayer
$mp.Open([Uri]'${fileUri.replace(/'/g, "''")}')
$sw = [Diagnostics.Stopwatch]::StartNew()
while (-not $mp.NaturalDuration.HasTimeSpan) {
  Start-Sleep -Milliseconds 50
  if ($sw.ElapsedMilliseconds -gt 8000) { throw 'Leo audio failed to load' }
}
$mp.Volume = 1.0
$mp.Play()
[Console]::Out.WriteLine('LEO_PLAY_START')
[Console]::Out.Flush()
# Slightly shorter pad than before to reduce tail lag after speech ends
$durMs = [Math]::Ceiling($mp.NaturalDuration.TimeSpan.TotalMilliseconds) + 120
Start-Sleep -Milliseconds $durMs
$mp.Close()
`.trim();

    const playResult = await new Promise((resolve) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        { windowsHide: true }
      );
      leoPlayerProc = child;
      let err = '';
      let started = false;
      child.stdout.on('data', (d) => {
        const s = d.toString();
        if (!started && s.includes('LEO_PLAY_START')) {
          started = true;
          broadcastAll('leo:audio', { phase: 'start' });
        }
      });
      child.stderr.on('data', (d) => {
        err += d.toString();
      });
      child.on('error', (e) => {
        broadcastAll('leo:audio', { phase: 'end', error: String(e.message || e) });
        resolve({ ok: false, error: String(e.message || e) });
      });
      child.on('close', (code) => {
        if (leoPlayerProc === child) leoPlayerProc = null;
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch {
          /* ignore */
        }
        if (leoTempFile === file) leoTempFile = null;
        // User hit Stop voice — success path, do NOT fall back to Windows TTS
        if (leoStopRequested) {
          leoStopRequested = false;
          broadcastAll('leo:audio', { phase: 'end', cancelled: true });
          resolve({ ok: true, cancelled: true });
          return;
        }
        broadcastAll('leo:audio', { phase: 'end', cancelled: false });
        if (code === 0) resolve({ ok: true });
        else resolve({ ok: false, error: err.trim() || `Player exited ${code}` });
      });
    });

    return playResult;
  } catch (e) {
    if (leoStopRequested) {
      leoStopRequested = false;
      return { ok: true, cancelled: true };
    }
    stopLeoPlaybackMain();
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('leo:stop', async () => {
  stopLeoPlaybackMain({ userStop: true });
  return { ok: true, cancelled: true };
});
