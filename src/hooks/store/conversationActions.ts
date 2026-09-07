import type { AppData, ChatMessage, Conversation, Project, Settings } from '../../lib/types';
import { uid } from '../../lib/id';

export function ensureActiveConversationData(d: AppData): { next: AppData; conversation: Conversation } {
  if (d.activeConversationId) {
    const found = d.conversations.find((c) => c.id === d.activeConversationId);
    if (found) return { next: d, conversation: found };
  }
  const conv: Conversation = {
    id: uid('conv'),
    title: 'New chat',
    messages: [],
    projectId: d.activeProjectId,
    folderIds: [...d.selectedFolderIdsForNewChat],
    updatedAt: new Date().toISOString(),
    saved: false,
  };
  return {
    conversation: conv,
    next: {
      ...d,
      conversations: [conv, ...d.conversations].slice(0, 40),
      activeConversationId: conv.id,
    },
  };
}

export function appendChatMessages(
  prev: AppData,
  userText: string,
  assistantText: string,
  projectId?: string | null,
  thinking?: string
): AppData {
  const now = new Date().toISOString();
  const userMsg: ChatMessage = {
    id: uid('msg'),
    role: 'user',
    content: userText,
    createdAt: now,
  };
  const asstMsg: ChatMessage = {
    id: uid('msg'),
    role: 'assistant',
    content: assistantText,
    createdAt: now,
    thinking: thinking?.trim() || undefined,
  };
  let convs = [...prev.conversations];
  let activeId = prev.activeConversationId;
  let conv = convs.find((c) => c.id === activeId);
  if (!conv) {
    conv = {
      id: uid('conv'),
      title: userText.slice(0, 48) || 'New chat',
      messages: [],
      projectId: projectId ?? prev.activeProjectId,
      folderIds: [...prev.selectedFolderIdsForNewChat],
      updatedAt: now,
      saved: false,
    };
    convs = [conv, ...convs];
    activeId = conv.id;
  }
  convs = convs.map((c) =>
    c.id === activeId
      ? {
          ...c,
          title: c.messages.length === 0 ? userText.slice(0, 48) || c.title : c.title,
          messages: [...c.messages, userMsg, asstMsg],
          updatedAt: now,
          projectId: projectId !== undefined ? projectId : c.projectId,
        }
      : c
  );
  return {
    ...prev,
    conversations: convs.slice(0, 40),
    activeConversationId: activeId,
    draft: '',
  };
}

export function localButlerReplyText(
  userText: string,
  actionAck: string | null,
  settings: Settings,
  grokConnected: boolean,
  project?: Project | null
): string {
  if (actionAck) return actionAck;
  const proj = project ? ` (project: ${project.name})` : '';
  const mode = settings.connectionMode;
  if (settings.demoMode) {
    return (
      `I'm Butler Grok${proj}. Demo mode is on — I can organize projects, tasks, and panels. ` +
      `Turn off Demo mode in Settings and use Mode B/C with an API key for full cloud chat. ` +
      `You said: “${userText.slice(0, 180)}${userText.length > 180 ? '…' : ''}”`
    );
  }
  if (mode === 'A') {
    return (
      `I'm Butler Grok${proj}. Mode A uses Grok Build on this PC for agent work. ` +
      (grokConnected
        ? 'Grok Build is detected. For full coding sessions use Start Grok; here I still help with projects, tasks, and notes. '
        : 'Grok Build is not detected yet — click Start Grok. ') +
      `You said: “${userText.slice(0, 180)}${userText.length > 180 ? '…' : ''}”`
    );
  }
  return `I'm Butler Grok${proj}. Add an API key in Settings for cloud replies, or enable Demo mode.`;
}
