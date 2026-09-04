const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('butler', {
  getInfo: () => ipcRenderer.invoke('app:get-info'),
  quit: () => ipcRenderer.invoke('app:quit'),
  minimize: () => ipcRenderer.invoke('app:minimize'),
  getWindowState: () => ipcRenderer.invoke('app:window-state'),
  onWindowState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
  setTrayMinimize: (enabled) => ipcRenderer.invoke('app:set-tray-minimize', enabled),
  setLoginItem: (enabled) => ipcRenderer.invoke('app:set-login-item', enabled),
  getLoginItem: () => ipcRenderer.invoke('app:get-login-item'),
  onConfirmClose: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:confirm-close', handler);
    return () => ipcRenderer.removeListener('app:confirm-close', handler);
  },
  openPanelWindow: (panelId) => ipcRenderer.invoke('panel:open', panelId),
  closePanelWindow: (panelId) => ipcRenderer.invoke('panel:close', panelId),
  listOpenPanels: () => ipcRenderer.invoke('panel:list-open'),
  onPanelClosed: (cb) => {
    const handler = (_e, panelId) => cb(panelId);
    ipcRenderer.on('panel:closed', handler);
    return () => ipcRenderer.removeListener('panel:closed', handler);
  },
  isPanelWindow: () => {
    const q = new URLSearchParams(window.location.search);
    return q.get('panel');
  },
  load: (fileName, defaults) => ipcRenderer.invoke('storage:load', fileName, defaults),
  save: (fileName, data) => ipcRenderer.invoke('storage:save', fileName, data),
  exportBackup: () => ipcRenderer.invoke('storage:export-backup'),
  importBackup: () => ipcRenderer.invoke('storage:import-backup'),
  grokStatus: () => ipcRenderer.invoke('grok:status'),
  grokStart: () => ipcRenderer.invoke('grok:start'),
  grokUpdate: (opts) => ipcRenderer.invoke('grok:update', opts || {}),
  grokOpenTerminal: (opts) => ipcRenderer.invoke('grok:open-terminal', opts || {}),
  grokRunWork: (payload) => ipcRenderer.invoke('grok:run-work', payload),
  grokCli: (args) => ipcRenderer.invoke('grok:cli', { args }),
  grokMarketplaceCatalog: () => ipcRenderer.invoke('grok:marketplace-catalog'),
  grokOpenInteractive: (hint) => ipcRenderer.invoke('grok:open-interactive', { hint }),
  /** Fresh Grok Build terminal scoped to one Butler project (context file + prompt). */
  grokOpenForProject: (payload) => ipcRenderer.invoke('grok:open-for-project', payload || {}),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  openPath: (p) => ipcRenderer.invoke('shell:open-path', p),
  mediaSave: (payload) => ipcRenderer.invoke('media:save', payload),
  mediaResolve: (src) => ipcRenderer.invoke('media:resolve', { src }),
  mediaOpenExternal: (url) => ipcRenderer.invoke('media:open-external', url),
  notify: (payload) => ipcRenderer.invoke('notify:show', payload),
  diagnostics: () => ipcRenderer.invoke('diagnostics:copy'),
  hasKey: () => ipcRenderer.invoke('secrets:has'),
  setKey: (key) => ipcRenderer.invoke('secrets:set', { key }),
  clearKey: () => ipcRenderer.invoke('secrets:clear'),
  testKey: () => ipcRenderer.invoke('secrets:test'),
  onSecretsChanged: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('secrets:changed', handler);
    return () => ipcRenderer.removeListener('secrets:changed', handler);
  },
  xaiChatStream: async (opts) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const handler = (_e, payload) => {
      if (!payload || payload.requestId !== requestId) return;
      if (payload.kind === 'reasoning') opts.onReasoning?.(payload.full, payload.delta);
      if (payload.kind === 'content') opts.onContent?.(payload.full, payload.delta);
    };
    ipcRenderer.on('xai:chat-chunk', handler);
    const abort = () => ipcRenderer.invoke('xai:chat-abort', { requestId });
    if (opts.signal) {
      if (opts.signal.aborted) {
        ipcRenderer.removeListener('xai:chat-chunk', handler);
        await abort();
        return { ok: false, error: 'Cancelled' };
      }
      opts.signal.addEventListener('abort', abort, { once: true });
    }
    try {
      return await ipcRenderer.invoke('xai:chat-stream', {
        requestId,
        messages: opts.messages,
        model: opts.model,
      });
    } finally {
      ipcRenderer.removeListener('xai:chat-chunk', handler);
    }
  },
  generateImage: (prompt) => ipcRenderer.invoke('xai:image', { prompt }),
  transcribe: (payload) => ipcRenderer.invoke('xai:stt', payload),
  /** Play Leo TTS via main process. Uses the key stored in main, not a renderer token. */
  leoSpeak: (textOrKey, maybeText) => {
    const text = typeof maybeText === 'string' ? maybeText : textOrKey;
    return ipcRenderer.invoke('leo:speak', { text });
  },
  leoStop: () => ipcRenderer.invoke('leo:stop'),
  /** phase: 'start' when audio actually plays; 'end' when finished/stopped */
  onLeoAudio: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('leo:audio', handler);
    return () => ipcRenderer.removeListener('leo:audio', handler);
  },
  /** Publish live thinking/reply to all Butler windows (main + float chat). */
  publishChatLive: (state) => ipcRenderer.invoke('chat:publish-live', state),
  onChatLive: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('chat:live', handler);
    return () => ipcRenderer.removeListener('chat:live', handler);
  },
  onStorageChanged: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('storage:changed', handler);
    return () => ipcRenderer.removeListener('storage:changed', handler);
  },
});
