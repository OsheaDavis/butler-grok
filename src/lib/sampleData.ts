import { listTasks, type AppData, type Conversation, type FolderItem, type Project, type ScheduledTask } from './types';
import { uid } from './id';

/** Stable ids so main-process seed and renderer seed cannot double-create. */
export const SAMPLE_TASK_REMIND_ID = 'task-sample-remind-chapter';
export const SAMPLE_TASK_WORK_ID = 'task-sample-work-notes';

export function makeSampleTasks(): ScheduledTask[] {
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
  soon.setSeconds(0, 0);
  const later = new Date(Date.now() + 24 * 60 * 60 * 1000);
  later.setSeconds(0, 0);
  return [
    {
      id: SAMPLE_TASK_REMIND_ID,
      title: 'Write Her Pride — Chapter 1 scene',
      type: 'remind',
      repeat: 'once',
      runAt: soon.toISOString(),
      enabled: true,
    },
    {
      id: SAMPLE_TASK_WORK_ID,
      title: 'Search notes for pride symbolism',
      type: 'work',
      repeat: 'once',
      runAt: later.toISOString(),
      prompt: 'Search project notes for themes about pride and honor.',
      enabled: true,
    },
  ];
}

function asList<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

/** Demo content for testing phase when the desk is empty. */
export function ensureSampleData(data: AppData, homeDir?: string): AppData {
  let next: AppData = {
    ...data,
    folders: asList(data.folders),
    projects: asList(data.projects),
    tasks: listTasks(data),
    conversations: asList(data.conversations),
    workItems: asList(data.workItems),
    displayItems: asList(data.displayItems),
  };
  let changed = !Array.isArray(data.tasks) || !Array.isArray(data.folders);
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

  if (!next.sampleTasksApplied) {
    if (!next.tasks.length) {
      next = { ...next, tasks: makeSampleTasks() };
    }
    next = { ...next, sampleTasksApplied: true };
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
