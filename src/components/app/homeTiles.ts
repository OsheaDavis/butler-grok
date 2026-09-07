import type { TileLine } from '../HomeTile';
import { listTasks, type AppData, type StaticPanelId } from '../../lib/types';
import { LIMITS } from '../../lib/limits';

type TileStoreSlice = {
  data: AppData;
  savedConversations: { title: string }[];
  recentConversations: { title: string }[];
  grokConnected: boolean;
};

export function buildTileLines(store: TileStoreSlice): Record<StaticPanelId, TileLine[]> {
  const folders = store.data.folders.slice(0, 2).map((f) => ({ text: f.label }));
  const saved = store.savedConversations.slice(0, 2).map((c) => ({
    text: c.title || 'Saved chat',
  }));
  const recent = store.recentConversations.slice(0, 2).map((c) => ({
    text: c.title || 'Recent chat',
  }));
  const allTasks = listTasks(store.data);
  const tasks = [...allTasks]
    .filter((t) => t.enabled)
    .sort((a, b) => a.runAt.localeCompare(b.runAt))
    .slice(0, 2)
    .map((t) => ({
      text: t.title,
      wave: t.type === 'remind',
    }));
  const projects = store.data.projects.slice(0, 2).map((p) => ({
    text: p.name + (p.resumeNote ? ` · ${p.resumeNote}` : ''),
  }));
  const running = store.data.workItems
    .filter((w) => w.status === 'running' || w.status === 'pending')
    .slice(0, 2)
    .map((w) => ({ text: `${w.title} (${w.status})` }));
  const upcoming = [...allTasks]
    .filter((t) => t.enabled)
    .sort((a, b) => a.runAt.localeCompare(b.runAt))
    .slice(0, 2)
    .map((t) => ({
      text: t.title,
      wave: t.type === 'remind',
    }));

  const generalCount = (store.data.displayItems || []).filter((i) => !i.projectId).length;
  return {
    folders: folders.length ? folders : [{ text: 'No folders yet' }],
    conversations: saved.length ? saved : [{ text: 'No saved chats yet' }],
    recent: recent.length ? recent : [{ text: 'No recent chats yet' }],
    tasks: tasks.length ? tasks : [{ text: 'No tasks yet' }],
    projects: projects.length ? projects : [{ text: 'No projects yet' }],
    currentlyOpen:
      running.length || upcoming.length
        ? [...running, ...upcoming].slice(0, 2)
        : [{ text: 'Nothing open yet' }],
    marketplace: [
      { text: store.grokConnected ? 'Grok plugins & MCP' : 'Start Grok for marketplace' },
      { text: 'Install · update · auth' },
    ],
    display: generalCount
      ? [{ text: `${generalCount} general item(s)` }, { text: 'Project media → Projects' }]
      : [{ text: 'General chat images' }, { text: 'Project Display is separate' }],
    chat: [{ text: 'Main chat' }],
  };
}

export function buildTileCounts(store: TileStoreSlice): Record<StaticPanelId, string> {
  return {
    folders: `${store.data.folders.length}/20`,
    conversations: `${store.savedConversations.length}/20`,
    recent: `${store.recentConversations.length}/10`,
    tasks: `${listTasks(store.data).length}/10`,
    projects: `${store.data.projects.length}/${LIMITS.projects}`,
    currentlyOpen: `${store.data.workItems.filter((w) => w.status === 'running').length}`,
    marketplace: '·',
    display: `${(store.data.displayItems || []).filter((i) => !i.projectId).length}`,
    chat: '',
  };
}

export function buildTileStatus(
  store: TileStoreSlice
): Record<StaticPanelId, 'ok' | 'warn' | null> {
  const allTasks = listTasks(store.data);
  const dueSoon = allTasks.some(
    (t) => t.enabled && new Date(t.runAt).getTime() - Date.now() < 15 * 60 * 1000
  );
  const running = store.data.workItems.some((w) => w.status === 'running');
  return {
    folders: null,
    conversations: null,
    recent: null,
    tasks: dueSoon || allTasks.some((t) => t.type === 'remind' && t.enabled)
      ? ('warn' as const)
      : null,
    projects: store.data.activeProjectId ? ('ok' as const) : null,
    currentlyOpen: running ? ('ok' as const) : dueSoon ? ('warn' as const) : null,
    marketplace: store.grokConnected ? ('ok' as const) : null,
    display: null,
    chat: null,
  };
}
