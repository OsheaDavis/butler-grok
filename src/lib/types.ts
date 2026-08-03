export type ConnectionMode = 'A' | 'B' | 'C';

/** Fixed desk / system panels */
export type StaticPanelId =
  | 'folders'
  | 'conversations'
  | 'recent'
  | 'tasks'
  | 'projects'
  | 'currentlyOpen'
  | 'marketplace'
  | 'display'
  | 'chat';

/**
 * Per-project Display window: only that project's media.
 * Format: `projdisp:<projectId>`
 */
export type ProjectDisplayPanelId = `projdisp:${string}`;

export type PanelId = StaticPanelId | ProjectDisplayPanelId;

export const PROJ_DISP_PREFIX = 'projdisp:';

export function isProjectDisplayPanel(id: string): id is ProjectDisplayPanelId {
  return id.startsWith(PROJ_DISP_PREFIX);
}

export function projectDisplayPanelId(projectId: string): ProjectDisplayPanelId {
  return `${PROJ_DISP_PREFIX}${projectId}`;
}

export function projectIdFromDisplayPanel(id: ProjectDisplayPanelId): string {
  return id.slice(PROJ_DISP_PREFIX.length);
}

export type Point = { x: number; y: number };
export type Size = { w: number; h: number };

export type HomeTileLayout = {
  id: StaticPanelId;
  x: number;
  y: number;
};

export type FloatState = {
  id: PanelId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export type Settings = {
  connectionMode: ConnectionMode;
  apiKey: string;
  micOn: boolean;
  butlerVoiceOn: boolean;
  theme: 'dark' | 'light';
  fontScale: number;
  muteSounds: boolean;
  demoMode: boolean;
  startWithWindows: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  firstRunDone: boolean;
  /** Prefer Grok Build alpha channel when updating from Butler */
  grokUpdateAlpha?: boolean;
  /** Bump when default desk layout changes (taller tiles, etc.) */
  layoutVersion?: number;
  /** Docked chat height in px (user can drag to enlarge). */
  chatHeight?: number;
  homeTiles: HomeTileLayout[];
  /** Includes dynamic project display panels (projdisp:…) */
  floatLayouts: Partial<Record<string, { x: number; y: number; w: number; h: number }>>;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  /** Optional model “thinking” / reasoning notes (shown in a side pane, not the main reply). */
  thinking?: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  projectId?: string | null;
  folderIds?: string[];
  updatedAt: string;
  saved: boolean;
};

export type FolderItem = {
  id: string;
  path: string;
  label: string;
};

/** Virtual folder inside a project library (not necessarily a PC path). */
export type ProjectLibraryFolder = {
  id: string;
  name: string;
  /** Optional nesting later; Phase A uses flat list (parentId null). */
  parentId?: string | null;
};

export type Project = {
  id: string;
  name: string;
  instructions: string;
  conversationIds: string[];
  /** Linked PC folder ids from the Folders tile */
  folderIds: string[];
  /** In-project library folders for art / review organization */
  libraryFolders: ProjectLibraryFolder[];
  resumeNote: string;
  updatedAt: string;
};

/** Review vote on a Display item (for project art reviews). */
export type DisplayVote = 'pending' | 'liked' | 'passed' | 'chosen';

export type TaskType = 'remind' | 'work';
export type TaskRepeat = 'once' | 'daily' | 'weekly';

export type ScheduledTask = {
  id: string;
  title: string;
  type: TaskType;
  repeat: TaskRepeat;
  runAt: string;
  prompt?: string;
  enabled: boolean;
  lastRunAt?: string | null;
  missed?: boolean;
};

export type WorkItem = {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  source: 'task' | 'manual' | 'chat';
  startedAt?: string;
  finishedAt?: string;
  detail?: string;
};

/** Media shown in the Display panel (from chat or manual URL). */
export type DisplayItem = {
  id: string;
  /** image/video = show media; link = page URL card (open externally) */
  kind: 'image' | 'video' | 'link';
  src: string;
  /** Optional local/data URL after cache resolve (stable in-panel preview) */
  displaySrc?: string;
  title: string;
  createdAt: string;
  source: 'chat' | 'manual';
  /** Last resolve error for empty preview diagnostics */
  loadError?: string;
  /** Linked project (null = unassigned / general library) */
  projectId?: string | null;
  /** Optional project library folder */
  libraryFolderId?: string | null;
  /** Review vote for creative pick workflows */
  vote?: DisplayVote;
  note?: string;
};

/** Media the user brought from Display into chat (for modify / recreate). */
export type ChatAttachment = {
  displayItemId: string;
  kind: 'image' | 'video' | 'link';
  src: string;
  displaySrc?: string;
  title: string;
  projectId?: string | null;
};

export type AppData = {
  conversations: Conversation[];
  folders: FolderItem[];
  projects: Project[];
  tasks: ScheduledTask[];
  workItems: WorkItem[];
  displayItems: DisplayItem[];
  activeDisplayId: string | null;
  activeConversationId: string | null;
  activeProjectId: string | null;
  draft: string;
  selectedFolderIdsForNewChat: string[];
  /** Image/video user attached from Display for the next message */
  chatAttachment: ChatAttachment | null;
};

export const PANEL_META: Record<
  StaticPanelId,
  { title: string; short: string; max?: number; subtitle: string; home?: boolean }
> = {
  folders: { title: 'Folders', short: 'Folders', max: 20, subtitle: 'Saved PC paths', home: true },
  conversations: {
    title: 'Conversations',
    short: 'Saved',
    max: 20,
    subtitle: 'Saved chats (you choose)',
    home: true,
  },
  recent: {
    title: 'Recent Conversations',
    short: 'Recent',
    max: 10,
    subtitle: 'Last 10 chats (auto)',
    home: true,
  },
  tasks: { title: 'Tasks', short: 'Tasks', max: 10, subtitle: 'Reminders & work', home: true },
  projects: { title: 'Projects', short: 'Projects', max: 10, subtitle: 'Long jobs', home: true },
  currentlyOpen: {
    title: 'Currently Open',
    short: 'Open',
    subtitle: 'Running & upcoming',
    home: true,
  },
  marketplace: {
    title: 'Marketplace',
    short: 'Market',
    subtitle: 'Grok plugins & MCP',
    home: true,
  },
  display: {
    title: 'Display (General)',
    short: 'Display',
    subtitle: 'Chat images not in a project',
    home: true,
  },
  chat: {
    title: 'Chat',
    short: 'Chat',
    subtitle: 'Main conversation',
    home: false,
  },
};

/** Resolve title for static or per-project display panels. */
export function panelTitle(id: PanelId, projectName?: string | null): string {
  if (isProjectDisplayPanel(id)) {
    return projectName ? `Display · ${projectName}` : 'Project Display';
  }
  return PANEL_META[id as StaticPanelId]?.title || String(id);
}

/** Home desk tiles only (chat floats separately). */
export const HOME_PANEL_IDS: StaticPanelId[] = (
  Object.keys(PANEL_META) as StaticPanelId[]
).filter((id) => PANEL_META[id].home !== false);

// 3 columns × 3 rows for 8 home tiles (chat is not a desk tile)
export const DEFAULT_HOME_TILES: HomeTileLayout[] = [
  { id: 'folders', x: 16, y: 12 },
  { id: 'conversations', x: 284, y: 12 },
  { id: 'recent', x: 552, y: 12 },
  { id: 'tasks', x: 16, y: 250 },
  { id: 'projects', x: 284, y: 250 },
  { id: 'currentlyOpen', x: 552, y: 250 },
  { id: 'marketplace', x: 16, y: 488 },
  { id: 'display', x: 284, y: 488 },
];

export type FloatLayout = { x: number; y: number; w: number; h: number };

export const DEFAULT_CHAT_HEIGHT = 220;
export const MIN_CHAT_HEIGHT = 140;
export const MAX_CHAT_HEIGHT = 560;

export const DEFAULT_SETTINGS: Settings = {
  connectionMode: 'A',
  apiKey: '',
  micOn: false,
  butlerVoiceOn: false,
  theme: 'dark',
  fontScale: 1,
  muteSounds: false,
  demoMode: true,
  startWithWindows: false,
  minimizeToTray: false,
  notifications: true,
  firstRunDone: false,
  grokUpdateAlpha: false,
  layoutVersion: 4,
  chatHeight: DEFAULT_CHAT_HEIGHT,
  homeTiles: DEFAULT_HOME_TILES,
  floatLayouts: {},
};

export const DEFAULT_APP_DATA: AppData = {
  conversations: [],
  folders: [],
  projects: [],
  tasks: [],
  workItems: [],
  displayItems: [],
  activeDisplayId: null,
  activeConversationId: null,
  activeProjectId: null,
  draft: '',
  selectedFolderIdsForNewChat: [],
  chatAttachment: null,
};
