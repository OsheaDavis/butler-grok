/**
 * Seed empty appdata so every window (main + Tasks panel) reads the same list.
 * Stable ids: two overlapping first-loads overwrite with the same two tasks, not four.
 */
function coerceList(value) {
  return Array.isArray(value) ? value : [];
}

function makeSampleTasks() {
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
  soon.setSeconds(0, 0);
  const later = new Date(Date.now() + 24 * 60 * 60 * 1000);
  later.setSeconds(0, 0);
  return [
    {
      id: 'task-sample-remind-chapter',
      title: 'Write Her Pride — Chapter 1 scene',
      type: 'remind',
      repeat: 'once',
      runAt: soon.toISOString(),
      enabled: true,
    },
    {
      id: 'task-sample-work-notes',
      title: 'Search notes for pride symbolism',
      type: 'work',
      repeat: 'once',
      runAt: later.toISOString(),
      prompt: 'Search project notes for themes about pride and honor.',
      enabled: true,
    },
  ];
}

/**
 * @returns {{ data: object, changed: boolean }}
 */
function seedAppDataIfNeeded(raw, defaults) {
  const data = { ...(defaults || {}), ...(raw || {}) };
  data.folders = coerceList(data.folders);
  data.projects = coerceList(data.projects);
  data.tasks = coerceList(data.tasks);
  data.conversations = coerceList(data.conversations);
  data.workItems = coerceList(data.workItems);
  data.displayItems = coerceList(data.displayItems);

  let changed = false;
  if (!data.sampleTasksApplied) {
    if (!data.tasks.length) {
      data.tasks = makeSampleTasks();
    }
    data.sampleTasksApplied = true;
    changed = true;
  }
  return { data, changed };
}

module.exports = { seedAppDataIfNeeded, makeSampleTasks, coerceList };
