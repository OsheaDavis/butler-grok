import { describe, expect, it, vi, afterEach } from 'vitest';
import { LIMITS } from '../../lib/limits';
import { DEFAULT_APP_DATA, type AppData, type ScheduledTask, type WorkItem } from '../../lib/types';
import { buildTileCounts, buildTileLines, buildTileStatus } from './homeTiles';

function emptyStore(overrides: Partial<Parameters<typeof buildTileLines>[0]> = {}) {
  return {
    data: { ...DEFAULT_APP_DATA },
    savedConversations: [] as { title: string }[],
    recentConversations: [] as { title: string }[],
    grokConnected: false,
    ...overrides,
  };
}

function remind(partial: Partial<ScheduledTask> & Pick<ScheduledTask, 'id' | 'title' | 'runAt'>): ScheduledTask {
  return {
    type: 'remind',
    repeat: 'once',
    enabled: true,
    ...partial,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildTileLines', () => {
  it('uses empty-state copy when the desk has nothing yet', () => {
    const lines = buildTileLines(emptyStore());
    expect(lines.folders).toEqual([{ text: 'No folders yet' }]);
    expect(lines.conversations).toEqual([{ text: 'No saved chats yet' }]);
    expect(lines.recent).toEqual([{ text: 'No recent chats yet' }]);
    expect(lines.tasks).toEqual([{ text: 'No tasks yet' }]);
    expect(lines.projects).toEqual([{ text: 'No projects yet' }]);
    expect(lines.currentlyOpen).toEqual([{ text: 'Nothing open yet' }]);
    expect(lines.display[0].text).toBe('General chat images');
    expect(lines.marketplace[0].text).toBe('Start Grok for marketplace');
  });

  it('shows the first two enabled tasks and marketplace when Grok is connected', () => {
    const data: AppData = {
      ...DEFAULT_APP_DATA,
      tasks: [
        remind({ id: 'a', title: 'Later', runAt: '2026-09-08T10:00:00.000Z' }),
        remind({ id: 'b', title: 'Sooner', runAt: '2026-09-07T09:00:00.000Z' }),
        { ...remind({ id: 'c', title: 'Off', runAt: '2026-09-07T08:00:00.000Z' }), enabled: false },
      ],
      projects: [
        {
          id: 'p1',
          name: 'Her Pride',
          instructions: '',
          conversationIds: [],
          folderIds: [],
          libraryFolders: [],
          resumeNote: 'next scene',
          updatedAt: '2026-09-07T00:00:00.000Z',
        },
      ],
      displayItems: [
        {
          id: 'd1',
          kind: 'image',
          src: 'https://example.com/a.png',
          title: 'A',
          createdAt: '2026-09-07T00:00:00.000Z',
          source: 'chat',
        },
      ],
    };
    const lines = buildTileLines(
      emptyStore({
        data,
        grokConnected: true,
      })
    );
    expect(lines.tasks.map((t) => t.text)).toEqual(['Sooner', 'Later']);
    expect(lines.tasks[0].wave).toBe(true);
    expect(lines.projects[0].text).toBe('Her Pride · next scene');
    expect(lines.display[0].text).toBe('1 general item(s)');
    expect(lines.marketplace[0].text).toBe('Grok plugins & MCP');
  });
});

describe('buildTileCounts', () => {
  it('shares the Tasks array length with the Tasks tile and uses project cap', () => {
    const data: AppData = {
      ...DEFAULT_APP_DATA,
      tasks: [
        remind({ id: 'a', title: 'One', runAt: '2026-09-07T09:00:00.000Z' }),
        remind({ id: 'b', title: 'Two', runAt: '2026-09-07T10:00:00.000Z' }),
      ],
      workItems: [{ id: 'w1', title: 'Job', status: 'running', source: 'manual' }],
    };
    const counts = buildTileCounts(emptyStore({ data }));
    expect(counts.tasks).toBe('2/10');
    expect(counts.projects).toBe(`0/${LIMITS.projects}`);
    expect(counts.currentlyOpen).toBe('1');
    expect(counts.display).toBe('0');
  });
});

describe('buildTileStatus', () => {
  it('warns on enabled reminders and marks marketplace when Grok is up', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    const data: AppData = {
      ...DEFAULT_APP_DATA,
      activeProjectId: 'p1',
      tasks: [remind({ id: 'a', title: 'Ping', runAt: '2026-09-07T12:10:00.000Z' })],
      workItems: [{ id: 'w1', title: 'Job', status: 'running', source: 'chat' } satisfies WorkItem],
    };
    const status = buildTileStatus(emptyStore({ data, grokConnected: true }));
    expect(status.tasks).toBe('warn');
    expect(status.projects).toBe('ok');
    expect(status.currentlyOpen).toBe('ok');
    expect(status.marketplace).toBe('ok');
  });
});
