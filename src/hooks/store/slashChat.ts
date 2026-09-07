import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AppData, PanelId } from '../../lib/types';
import { projectDisplayPanelId } from '../../lib/types';
import { LIMITS } from '../../lib/limits';
import { parseSlashCommand, type SlashResult } from '../../lib/slashCommands';
import { detectImagePrompt } from '../../lib/xaiImage';

export type SlashChatCtx = {
  dataRef: MutableRefObject<AppData>;
  setData: Dispatch<SetStateAction<AppData>>;
  appendMessages: (userText: string, assistantText: string, projectId?: string | null, thinking?: string) => void;
  startNewConversation: () => void;
  setSettingsOpen: (open: boolean) => void;
  openPanel: (id: PanelId) => void;
  openGrokTerminal: (
    kind:
      | 'update'
      | 'update-alpha'
      | 'update-check'
      | 'marketplace'
      | 'grok'
      | 'plugin-install'
      | 'plugin-update',
    extraArgs?: string
  ) => void | Promise<void>;
};

export type SlashChatOutcome =
  | { status: 'handled' }
  | { status: 'continue'; imagePrompt: string | null };

export function resolveChatPrompt(ctx: SlashChatCtx, trimmed: string): SlashChatOutcome {
  const {
    dataRef,
    setData,
    appendMessages,
    startNewConversation,
    setSettingsOpen,
    openPanel,
    openGrokTerminal,
  } = ctx;

  const slash = parseSlashCommand(trimmed);
  if (!slash) {
    return { status: 'continue', imagePrompt: detectImagePrompt(trimmed) };
  }

  setData((d) => ({ ...d, draft: '' }));
  return applySlashCommand(ctx, slash, trimmed);
}

function applySlashCommand(
  ctx: SlashChatCtx,
  slash: SlashResult,
  trimmed: string
): SlashChatOutcome {
  const {
    dataRef,
    setData,
    appendMessages,
    startNewConversation,
    setSettingsOpen,
    openPanel,
    openGrokTerminal,
  } = ctx;

        if (slash.type === 'help' || slash.type === 'unknown') {
          appendMessages(trimmed, slash.type === 'help' ? slash.text : slash.message);
          return { status: 'handled' };
        }
        if (slash.type === 'new-chat') {
          startNewConversation();
          appendMessages(trimmed, slash.message);
          return { status: 'handled' };
        }
        if (slash.type === 'settings') {
          setSettingsOpen(true);
          appendMessages(trimmed, slash.message);
          return { status: 'handled' };
        }
        if (slash.type === 'open-panel') {
          openPanel(slash.panel as PanelId);
          appendMessages(trimmed, slash.message);
          return { status: 'handled' };
        }
        if (slash.type === 'terminal') {
          if (slash.action === 'marketplace') openPanel('marketplace');
          void openGrokTerminal(
            slash.action === 'update'
              ? 'update'
              : slash.action === 'update-alpha'
                ? 'update-alpha'
                : slash.action === 'marketplace'
                  ? 'marketplace'
                  : 'grok'
          );
          appendMessages(trimmed, slash.message);
          return { status: 'handled' };
        }
        if (slash.type === 'save-chat') {
          const id = dataRef.current.activeConversationId;
          const target = dataRef.current.conversations.find((c) => c.id === id);
          if (!id || !target) {
            appendMessages(trimmed, 'No active conversation to save yet. Send a normal message first.');
            return { status: 'handled' };
          }
          const savedCount = dataRef.current.conversations.filter((c) => c.saved).length;
          if (!target.saved && savedCount >= LIMITS.savedConversations) {
            appendMessages(
              trimmed,
              `Maximum ${LIMITS.savedConversations} saved conversations. Remove one in Conversations first.`
            );
            return { status: 'handled' };
          }
          setData((d) => ({
            ...d,
            conversations: d.conversations.map((c) =>
              c.id === id ? { ...c, saved: true } : c
            ),
          }));
          appendMessages(trimmed, 'Conversation saved. Find it under **Conversations**.');
          return { status: 'handled' };
        }
        if (slash.type === 'sessions') {
          const recent = [...dataRef.current.conversations]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 10);
          const saved = dataRef.current.conversations.filter((c) => c.saved).slice(0, 20);
          const lines = [
            '**Recent chats**',
            ...(recent.length
              ? recent.map(
                  (c, i) =>
                    `${i + 1}. ${c.title || 'Untitled'} · ${new Date(c.updatedAt).toLocaleString()}${c.saved ? ' · saved' : ''}`
                )
              : ['(none yet)']),
            '',
            '**Saved chats**',
            ...(saved.length
              ? saved.map((c, i) => `${i + 1}. ${c.title || 'Untitled'}`)
              : ['(none — use /save)']),
            '',
            'Open the **Recent** or **Conversations** panels to resume one.',
          ];
          appendMessages(trimmed, lines.join('\n'));
          return { status: 'handled' };
        }
        if (slash.type === 'project') {
          if (!slash.name) {
            const list = dataRef.current.projects;
            const body = list.length
              ? list.map((p) => `· **${p.name}**${p.id === dataRef.current.activeProjectId ? ' ← active' : ''}`).join('\n')
              : '(no projects yet — create one in the Projects panel)';
            openPanel('projects');
            appendMessages(
              trimmed,
              `**Projects**\n${body}\n\nSet one with \`/project Name\` or click **Use** in Projects.`
            );
            return { status: 'handled' };
          }
          const q = slash.name.toLowerCase();
          const match =
            dataRef.current.projects.find((p) => p.name.toLowerCase() === q) ||
            dataRef.current.projects.find((p) => p.name.toLowerCase().includes(q));
          if (!match) {
            appendMessages(
              trimmed,
              `I couldn’t find a project matching “${slash.name}”. Create it in Projects or try another name.`
            );
            openPanel('projects');
            return { status: 'handled' };
          }
          setData((d) => ({ ...d, activeProjectId: match.id }));
          openPanel('projects');
          appendMessages(trimmed, `Active project is now **${match.name}**. New images from chat will tag to this project.`);
          return { status: 'handled' };
        }
        if (slash.type === 'vote') {
          const id = dataRef.current.activeDisplayId;
          const items = dataRef.current.displayItems || [];
          const active = items.find((i) => i.id === id) || items[0];
          if (!active) {
            appendMessages(trimmed, 'No Display item open. Generate or add media first, then /like /pass /keep.');
            const pid = dataRef.current.activeProjectId;
            if (pid) openPanel(projectDisplayPanelId(pid));
            else openPanel('display');
            return { status: 'handled' };
          }
          setData((d) => ({
            ...d,
            displayItems: (d.displayItems || []).map((i) =>
              i.id === active.id ? { ...i, vote: slash.vote } : i
            ),
            activeDisplayId: active.id,
          }));
          if (active.projectId) openPanel(projectDisplayPanelId(active.projectId));
          else openPanel('display');
          appendMessages(trimmed, slash.message + `\n\n_Item: ${active.title}_`);
          return { status: 'handled' };
        }
        if (slash.type === 'review') {
          const pid = dataRef.current.activeProjectId;
          if (!pid) {
            appendMessages(
              trimmed,
              'No active project. Use `/project Name` or **Continue chat** in Projects, then `/review`.'
            );
            openPanel('projects');
            return { status: 'handled' };
          }
          openPanel(projectDisplayPanelId(pid));
          appendMessages(trimmed, slash.message);
          return { status: 'handled' };
        }
        if (slash.type === 'imagine') {
          return { status: 'continue', imagePrompt: slash.prompt };
        }
        return { status: 'handled' };

  return { status: 'handled' };
}
