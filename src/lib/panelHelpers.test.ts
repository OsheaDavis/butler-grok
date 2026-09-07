import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_DATA,
  DEFAULT_HOME_TILES,
  HOME_PANEL_IDS,
  isProjectDisplayPanel,
  listTasks,
  mergeHomeTiles,
  panelTitle,
  projectDisplayPanelId,
  projectIdFromDisplayPanel,
  type ScheduledTask,
} from './types';

function task(partial: Partial<ScheduledTask> & Pick<ScheduledTask, 'id' | 'title'>): ScheduledTask {
  return {
    type: 'work',
    repeat: 'once',
    runAt: '2026-09-07T12:00:00.000Z',
    enabled: true,
    ...partial,
  };
}

describe('project Display panel ids', () => {
  it('builds, detects, and unwraps projdisp:<id>', () => {
    const id = projectDisplayPanelId('pride-1');
    expect(id).toBe('projdisp:pride-1');
    expect(isProjectDisplayPanel(id)).toBe(true);
    expect(isProjectDisplayPanel('display')).toBe(false);
    expect(projectIdFromDisplayPanel(id)).toBe('pride-1');
  });

  it('titles a project Display with the project name when known', () => {
    expect(panelTitle(projectDisplayPanelId('p1'), 'Her Pride')).toBe('Display · Her Pride');
    expect(panelTitle(projectDisplayPanelId('p1'))).toBe('Project Display');
    expect(panelTitle('display')).toBe('Display (General)');
  });
});

describe('mergeHomeTiles', () => {
  it('returns the default desk when nothing is saved', () => {
    expect(mergeHomeTiles()).toEqual(DEFAULT_HOME_TILES);
    expect(mergeHomeTiles([])).toEqual(DEFAULT_HOME_TILES);
  });

  it('keeps a saved layout and restores any dropped home tiles', () => {
    const saved = [{ id: 'folders' as const, x: 40, y: 8 }];
    const merged = mergeHomeTiles(saved);
    expect(merged[0]).toEqual(saved[0]);
    expect(merged.map((t) => t.id)).toEqual(expect.arrayContaining(HOME_PANEL_IDS));
    expect(new Set(merged.map((t) => t.id)).size).toBe(HOME_PANEL_IDS.length);
  });
});

describe('listTasks', () => {
  it('returns the persisted tasks array and treats missing as empty', () => {
    const tasks = [task({ id: 't1', title: 'Call back' })];
    expect(listTasks({ ...DEFAULT_APP_DATA, tasks })).toEqual(tasks);
    expect(listTasks(null)).toEqual([]);
    expect(listTasks(undefined)).toEqual([]);
    expect(listTasks({ tasks: undefined as unknown as ScheduledTask[] })).toEqual([]);
  });
});
