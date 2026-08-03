import type { PanelId, Project, StaticPanelId } from './types';

export type UiAction =
  | { type: 'open-panel'; panel: PanelId }
  | { type: 'open-project'; projectId: string; projectName: string }
  | { type: 'none' };

const PANEL_PHRASES: { panel: StaticPanelId; words: string[] }[] = [
  { panel: 'projects', words: ['project', 'projects'] },
  { panel: 'tasks', words: ['task', 'tasks', 'schedule', 'reminder'] },
  { panel: 'currentlyOpen', words: ['currently open', 'what is running', "what's running", 'ongoing'] },
  { panel: 'folders', words: ['folder', 'folders', 'location', 'locations'] },
  { panel: 'conversations', words: ['saved conversation', 'saved chat'] },
  { panel: 'recent', words: ['recent conversation', 'recent chat'] },
  { panel: 'marketplace', words: ['marketplace', 'plugins', 'plugin', 'mcp'] },
  { panel: 'display', words: ['display', 'preview', 'preview panel'] },
  { panel: 'chat', words: ['float chat', 'chat window', 'enlarge chat'] },
];

export function detectUiAction(text: string, projects: Project[]): UiAction {
  const lower = text.toLowerCase();

  // Resume / open named project
  for (const p of projects) {
    const name = p.name.toLowerCase();
    if (
      name &&
      (lower.includes(name) ||
        lower.includes(`project ${name}`) ||
        lower.includes(`"${name}"`))
    ) {
      if (
        /resume|open|continue|start|work on|pick up|her pride/i.test(lower) ||
        lower.includes(name)
      ) {
        return { type: 'open-project', projectId: p.id, projectName: p.name };
      }
    }
  }

  // Explicit "open X panel"
  if (/\b(open|show|bring up|enlarge)\b/i.test(lower)) {
    for (const { panel, words } of PANEL_PHRASES) {
      if (words.some((w) => lower.includes(w))) {
        return { type: 'open-panel', panel };
      }
    }
  }

  return { type: 'none' };
}

export function assistantAckForAction(action: UiAction, resumeNote?: string): string | null {
  if (action.type === 'open-project') {
    const extra = resumeNote
      ? ` Picking up from: ${resumeNote}`
      : ' Continuing from the last place we left off.';
    return `Yes — opening **${action.projectName}** and bringing it to the front.${extra} Let's continue with the next part.`;
  }
  if (action.type === 'open-panel') {
    const labels: Record<StaticPanelId, string> = {
      folders: 'Folders',
      conversations: 'Conversations',
      recent: 'Recent Conversations',
      tasks: 'Tasks',
      projects: 'Projects',
      currentlyOpen: 'Currently Open',
      marketplace: 'Marketplace',
      display: 'Display',
      chat: 'Chat',
    };
    return `Opening **${labels[action.panel as StaticPanelId] || action.panel}** for you.`;
  }
  return null;
}
