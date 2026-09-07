const { app, BrowserWindow, protocol, safeStorage, net } = require('electron');
const path = require('path');
const mediaProtocol = require('./mediaProtocol.cjs');
const { initSecrets } = require('./secrets.cjs');
const { DATA_DIR, state, ensureDataDir } = require('./appContext.cjs');
const { createWindow, createTray, allowMediaPermissions } = require('./windows.cjs');
const { registerCoreIpc } = require('./coreIpc.cjs');
const { registerGrokIpc } = require('./grokIpc.cjs');
const { registerMediaIpc } = require('./mediaIpc.cjs');
const { registerLeoIpc } = require('./leoPlayback.cjs');

mediaProtocol.registerPrivilegedScheme(protocol);

registerCoreIpc();
registerGrokIpc();
registerMediaIpc();
registerLeoIpc();

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
    if (!state.tray || state.allowQuit) app.quit();
  }
});
