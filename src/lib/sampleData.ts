import type { AppData, Conversation, FolderItem, Project, ScheduledTask } from './types';
import { uid } from './id';

/** Demo content for testing phase when the desk is empty. */
export function ensureSampleData(data: AppData, homeDir?: string): AppData {
  let next = { ...data };
  let changed = false;
  const home = homeDir || 'C:\\Users\\Public';

  if (!next.folders.length) {
    const samples: FolderItem[] = [
      {
        id: uid('folder'),
        path: `${home}\\Documents`,
        label: 'Documents',
      },
      {
        id: uid('folder'),
        path: `${home}\\Downloads`,
        label: 'Downloads',
      },
      {
        id: uid('folder'),
        path: 'C:\\Grok Build\\Butler Grok',
        label: 'Butler Grok',
      },
    ];
    next = { ...next, folders: samples };
    changed = true;
  }

  if (!next.projects.length) {
    const p: Project = {
      id: uid('proj'),
      name: 'Her Pride',
      instructions:
        'Fantasy book project. Work chapter by chapter. Keep tone consistent. Resume from the last section note.',
      conversationIds: [],
      folderIds: next.folders.slice(0, 1).map((f) => f.id),
      libraryFolders: [
        { id: uid('plib'), name: 'Covers', parentId: null },
        { id: uid('plib'), name: 'Characters', parentId: null },
      ],
      resumeNote: 'Prologue complete — begin Chapter 1',
      updatedAt: new Date().toISOString(),
    };
    next = { ...next, projects: [p], activeProjectId: p.id };
    changed = true;
  }

  if (!next.tasks.length) {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
    soon.setSeconds(0, 0);
    const later = new Date(Date.now() + 24 * 60 * 60 * 1000);
    later.setSeconds(0, 0);
    const tasks: ScheduledTask[] = [
      {
        id: uid('task'),
        title: 'Write Her Pride — Chapter 1 scene',
        type: 'remind',
        repeat: 'once',
        runAt: soon.toISOString(),
        enabled: true,
      },
      {
        id: uid('task'),
        title: 'Search notes for pride symbolism',
        type: 'work',
        repeat: 'once',
        runAt: later.toISOString(),
        prompt: 'Search project notes for themes about pride and honor.',
        enabled: true,
      },
    ];
    next = { ...next, tasks };
    changed = true;
  }

  if (!next.conversations.length) {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: uid('conv'),
      title: 'Welcome to Butler Grok',
      messages: [
        {
          id: uid('msg'),
          role: 'assistant',
          content:
            'Welcome. Try opening Projects, or say “resume Her Pride”. Panels can float outside the main window.',
          createdAt: now,
        },
      ],
      projectId: next.activeProjectId,
      folderIds: [],
      updatedAt: now,
      saved: true,
    };
    next = {
      ...next,
      conversations: [conv],
      activeConversationId: conv.id,
    };
    changed = true;
  }

  return changed ? next : data;
}
