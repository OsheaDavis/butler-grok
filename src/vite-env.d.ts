/// <reference types="vite/client" />

export type GrokStatus = {
  onPath: boolean;
  pathHint: string | null;
  connected: boolean;
};

export type StorageLoadResult<T> = {
  data: T;
  recovered: boolean;
};

export interface ButlerAPI {
  getInfo: () => Promise<{
    version: string;
    dataDir: string;
    isDev: boolean;
    platform: string;
    homeDir?: string;
  }>;
  quit: () => Promise<void>;
  minimize: () => Promise<void>;
  setTrayMinimize: (enabled: boolean) => Promise<{ ok: boolean }>;
  setLoginItem: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  getLoginItem: () => Promise<{ openAtLogin: boolean }>;
  onConfirmClose: (cb: () => void) => () => void;
  openPanelWindow: (panelId: string) => Promise<{ ok: boolean; focused?: boolean }>;
  closePanelWindow: (panelId: string) => Promise<{ ok: boolean }>;
  listOpenPanels: () => Promise<string[]>;
  onPanelClosed: (cb: (panelId: string) => void) => () => void;
  isPanelWindow: () => string | null;
  load: <T>(fileName: string, defaults: T) => Promise<StorageLoadResult<T>>;
  save: (fileName: string, data: unknown) => Promise<{ ok: boolean }>;
  exportBackup: () => Promise<{ ok: boolean; filePath?: string }>;
  importBackup: () => Promise<{ ok: boolean; error?: string }>;
  grokStatus: () => Promise<GrokStatus>;
  grokStart: () => Promise<{ ok: boolean }>;
  grokUpdate: (opts?: {
    alpha?: boolean;
    checkOnly?: boolean;
  }) => Promise<{ ok: boolean; alpha?: boolean; checkOnly?: boolean }>;
  grokOpenTerminal: (opts?: {
    kind?:
      | 'update'
      | 'update-alpha'
      | 'update-check'
      | 'marketplace'
      | 'grok'
      | 'plugin-install'
      | 'plugin-update';
    extraArgs?: string;
  }) => Promise<{
    ok: boolean;
    kind?: string;
    grokExe?: string;
    usedWindowsTerminal?: boolean;
    scriptPath?: string;
  }>;
  grokRunWork: (payload: {
    jobId: string;
    title: string;
    prompt: string;
  }) => Promise<{ ok: boolean; jobId?: string; jobFile?: string; grokOnPath?: boolean }>;
  grokCli: (
    args: string[]
  ) => Promise<{ ok: boolean; code: number; stdout: string; stderr: string }>;
  grokMarketplaceCatalog: () => Promise<{
    ok: boolean;
    plugins: {
      name: string;
      description?: string;
      category?: string;
      source?: string;
      marketplace?: string;
    }[];
    error?: string;
  }>;
  grokOpenInteractive: (hint?: string) => Promise<{ ok: boolean }>;
  grokOpenForProject: (payload: {
    id: string;
    name: string;
    instructions?: string;
    resumeNote?: string;
  }) => Promise<{ ok: boolean; contextPath?: string; error?: string }>;
  pickFolder: () => Promise<string | null>;
  openPath: (p: string) => Promise<void>;
  mediaSave: (payload: {
    src: string;
    title?: string;
    kind?: 'image' | 'video';
    toDesktop?: boolean;
  }) => Promise<{ ok: boolean; filePath?: string; cancelled?: boolean; error?: string }>;
  mediaResolve: (src: string) => Promise<{
    ok: boolean;
    src?: string;
    cached?: boolean;
    localPath?: string;
    error?: string;
    isPage?: boolean;
  }>;
  mediaOpenExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
  notify: (payload: { title?: string; body?: string }) => Promise<{ ok: boolean }>;
  diagnostics: () => Promise<string>;
  leoSpeak: (
    apiKey: string,
    text: string
  ) => Promise<{ ok: true; cancelled?: boolean } | { ok: false; error: string }>;
  leoStop: () => Promise<{ ok: boolean; cancelled?: boolean }>;
  /** Fires when Leo audio actually starts/ends (main process player). */
  onLeoAudio?: (
    cb: (payload: { phase: 'start' | 'end'; cancelled?: boolean; error?: string }) => void
  ) => () => void;
  publishChatLive: (state: {
    busy?: boolean;
    thinking?: string;
    reply?: string;
    retainedThinking?: string;
  }) => Promise<{ ok: boolean }>;
  onChatLive: (
    cb: (state: {
      busy?: boolean;
      thinking?: string;
      reply?: string;
      retainedThinking?: string;
    }) => void
  ) => () => void;
  onStorageChanged: (cb: (payload: { fileName: string }) => void) => () => void;
}

declare global {
  interface Window {
    butler?: ButlerAPI;
  }
}

export {};
