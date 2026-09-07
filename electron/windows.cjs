const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  session,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { isDev, state, assetPath } = require('./appContext.cjs');
const { startGrokShell } = require('./grokShell.cjs');

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

/**
 * Windows maximized windows often report bounds larger than the work area,
 * so the right-hand header (Update Grok / Leo / gear) is painted off-screen.
 */
function getWindowStatePayload(win) {
  if (!win || win.isDestroyed()) {
    return { maximized: false, insetTop: 0, insetRight: 0, insetBottom: 0, insetLeft: 0 };
  }
  const maximized = win.isMaximized() || win.isFullScreen();
  if (!maximized) {
    return { maximized: false, insetTop: 0, insetRight: 0, insetBottom: 0, insetLeft: 0 };
  }
  let insetTop = 0;
  let insetRight = 0;
  let insetBottom = 0;
  let insetLeft = 0;
  try {
    const display = screen.getDisplayMatching(win.getBounds());
    const wa = display.workArea;
    const b = win.getBounds();
    insetTop = Math.max(0, wa.y - b.y);
    insetLeft = Math.max(0, wa.x - b.x);
    insetRight = Math.max(0, b.x + b.width - (wa.x + wa.width));
    insetBottom = Math.max(0, b.y + b.height - (wa.y + wa.height));
  } catch {
    /* keep zeros */
  }
  // Even when Electron reports a perfect fit, Win11 DWM still clips a few CSS px.
  if (process.platform === 'win32') {
    insetRight = Math.max(insetRight, 16);
    insetTop = Math.max(insetTop, 8);
  }
  return { maximized: true, insetTop, insetRight, insetBottom, insetLeft };
}

/** Bring a panel in front of a maximized main window (Windows often hides new BrowserWindows). */
function raiseWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (process.platform === 'win32') {
    win.setAlwaysOnTop(true);
    win.setAlwaysOnTop(false);
  }
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
  if (state.panelWindows.has(panelId)) {
    const existing = state.panelWindows.get(panelId);
    if (existing && !existing.isDestroyed()) {
      raiseWindow(existing);
      return { ok: true, focused: true };
    }
    state.panelWindows.delete(panelId);
  }

  const isChat = panelId === 'chat';
  const isMarket = panelId === 'marketplace';
  const win = new BrowserWindow({
    width: isChat ? 720 : isMarket ? 640 : 500,
    height: isChat ? 720 : isMarket ? 680 : 560,
    minWidth: isChat ? 420 : 320,
    minHeight: isChat ? 400 : 280,
    backgroundColor: '#0b0f14',
    show: false,
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
  state.panelWindows.set(panelId, win);

  win.on('closed', () => {
    state.panelWindows.delete(panelId);
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('panel:closed', panelId);
    }
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    win.once('ready-to-show', () => {
      raiseWindow(win);
      finish({ ok: true, focused: false });
    });
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      console.error('panel load failed', panelId, code, desc);
      if (!win.isDestroyed()) raiseWindow(win);
      finish({ ok: false });
    });
    setTimeout(() => {
      if (!win.isDestroyed()) raiseWindow(win);
      finish({ ok: true, focused: false });
    }, 4000);
  });
}

function closePanelWindow(panelId) {
  const win = state.panelWindows.get(panelId);
  if (win && !win.isDestroyed()) {
    win.close();
  }
  state.panelWindows.delete(panelId);
  return { ok: true };
}

function createTray() {
  if (state.tray) return;
  let image = nativeImage.createEmpty();
  const iconFile = assetPath('butler-front.png');
  if (fs.existsSync(iconFile)) {
    image = nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 });
  }
  state.tray = new Tray(image);
  state.tray.setToolTip('Butler Grok');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Butler Grok',
      click: () => {
        if (state.mainWindow) {
          state.mainWindow.show();
          state.mainWindow.focus();
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
        state.allowQuit = true;
        app.quit();
      },
    },
  ]);
  state.tray.setContextMenu(contextMenu);
  state.tray.on('double-click', () => {
    if (state.mainWindow) {
      state.mainWindow.show();
      state.mainWindow.focus();
    }
  });
}

function createWindow() {
  state.mainWindow = new BrowserWindow({
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

  const sendWindowState = () => {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
    try {
      state.mainWindow.webContents.send('window:state', getWindowStatePayload(state.mainWindow));
    } catch {
      /* ignore */
    }
  };
  state.mainWindow.once('ready-to-show', () => {
    state.mainWindow.show();
    sendWindowState();
  });
  state.mainWindow.on('maximize', sendWindowState);
  state.mainWindow.on('unmaximize', sendWindowState);
  state.mainWindow.on('enter-full-screen', sendWindowState);
  state.mainWindow.on('leave-full-screen', sendWindowState);
  state.mainWindow.on('resize', () => {
    if (state.mainWindow && !state.mainWindow.isDestroyed() && state.mainWindow.isMaximized()) {
      sendWindowState();
    }
  });

  state.mainWindow.on('close', (e) => {
    if (state.allowQuit) return;
    if (state.minimizeToTray) {
      e.preventDefault();
      state.mainWindow.hide();
      return;
    }
    e.preventDefault();
    state.mainWindow.webContents.send('app:confirm-close');
  });

  loadAppUrl(state.mainWindow);
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


module.exports = {
  PANEL_TITLES,
  panelWindowTitle,
  getWindowStatePayload,
  raiseWindow,
  loadAppUrl,
  openPanelWindow,
  closePanelWindow,
  createTray,
  createWindow,
  allowMediaPermissions,
};
