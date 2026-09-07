const { app, ipcMain, dialog, shell, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const { atomicWriteJson, readJsonWithBackup } = require('./storage.cjs');
const { seedAppDataIfNeeded } = require('./sampleSeed.cjs');
const { ALLOWED_STORAGE_FILES, resolveStoragePath } = require('./storagePath.cjs');
const {
  hasApiKey,
  setApiKey,
  clearApiKey,
  stripApiKeyFields,
  migrateAndStripSecrets,
} = require('./secrets.cjs');
const xaiMain = require('./xaiMain.cjs');
const { DATA_DIR, VERSION, isDev, state, ensureDataDir, broadcastAll } = require('./appContext.cjs');
const { openPanelWindow, closePanelWindow, getWindowStatePayload } = require('./windows.cjs');

function registerCoreIpc() {
ipcMain.handle('app:get-info', async () => ({
  version: VERSION,
  dataDir: DATA_DIR,
  isDev,
  platform: process.platform,
  homeDir: app.getPath('home'),
}));

ipcMain.handle('panel:open', async (_e, panelId) => openPanelWindow(String(panelId)));
ipcMain.handle('panel:close', async (_e, panelId) => closePanelWindow(String(panelId)));
ipcMain.handle('panel:list-open', async () => [...state.panelWindows.keys()]);

ipcMain.handle('app:quit', async () => {
  state.allowQuit = true;
  app.quit();
});

ipcMain.handle('app:minimize', async () => {
  if (!state.mainWindow) return;
  if (state.minimizeToTray) {
    state.mainWindow.hide();
  } else {
    state.mainWindow.minimize();
  }
});

ipcMain.handle('app:window-state', async () => getWindowStatePayload(state.mainWindow));

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
  let data = migrated.data;
  if (String(resolved.fileName) === 'appdata.json') {
    const seeded = seedAppDataIfNeeded(data, defaults);
    if (seeded.changed) {
      try {
        atomicWriteJson(resolved.path, seeded.data);
      } catch {
        /* keep serving seeded data even if rewrite fails */
      }
    }
    data = seeded.data;
  }
  return { data, recovered: result.recovered };
});

ipcMain.handle('app:set-tray-minimize', async (_e, enabled) => {
  state.minimizeToTray = Boolean(enabled);
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
  const { canceled, filePath } = await dialog.showSaveDialog(state.mainWindow, {
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
  const { canceled, filePaths } = await dialog.showOpenDialog(state.mainWindow, {
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

ipcMain.handle('dialog:pick-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(state.mainWindow, {
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

}

module.exports = { registerCoreIpc };
