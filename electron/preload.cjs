const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('butler', {
  getInfo: () => ipcRenderer.invoke('app:get-info'),
  quit: () => ipcRenderer.invoke('app:quit'),
  minimize: () => ipcRenderer.invoke('app:minimize'),
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
  /** Play Leo TTS via main process (reliable Windows audio, not browser HTMLAudio). */
  leoSpeak: (apiKey, text) => ipcRenderer.invoke('leo:speak', { apiKey, text }),
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
