import { useState } from 'react';
import type { AppStore } from '../../hooks/useAppStore';
import { listTasks } from '../../lib/types';
import { LIMITS } from '../../lib/limits';
import { MiniButlerWave } from '../MiniButlerWave';

export function TasksBody({ store }: { store: AppStore }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'remind' | 'work'>('remind');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>('once');
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [prompt, setPrompt] = useState('');
  const tasks = listTasks(store.data);

  return (
    <>
      <p className="panel-hint">
        Up to 10 tasks. For <strong>work</strong> tasks you need <strong>Grok Build running</strong> and{' '}
        <strong>Butler Grok open</strong>. Closing the app stops all tasks.
      </p>
      {!tasks.length ? (
        <div className="empty" style={{ padding: 12 }}>
          No tasks yet.
        </div>
      ) : (
        <div className="list" style={{ marginBottom: 16 }}>
          {tasks.map((t) => (
            <div key={t.id} className="list-item">
              {store.waveTaskId === t.id || t.type === 'remind' ? (
                <MiniButlerWave title="Butler reminder" />
              ) : null}
              <div className="grow">
                <div className="title">
                  {t.title}{' '}
                  <span className="meta">
                    · {t.type === 'remind' ? 'Remind' : 'Work'} · {t.repeat}
                    {!t.enabled ? ' · off' : ''}
                    {t.missed ? ' · missed while closed' : ''}
                  </span>
                </div>
                <div className="meta">Next: {new Date(t.runAt).toLocaleString()}</div>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => store.updateTask(t.id, { enabled: !t.enabled })}
                >
                  {t.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" className="btn danger" onClick={() => store.removeTask(t.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Remind me to write" />
      </div>
      <div className="row-actions" style={{ marginBottom: 10 }}>
        <select value={type} onChange={(e) => setType(e.target.value as 'remind' | 'work')}>
          <option value="remind">Remind me</option>
          <option value="work">Real work (Grok Build)</option>
        </select>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value as 'once' | 'daily' | 'weekly')}>
          <option value="once">One time</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>
      {type === 'work' ? (
        <div className="field">
          <label>Work prompt</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What should Grok Build do?" />
        </div>
      ) : null}
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          if (!title.trim()) return;
          store.addTask({
            title: title.trim(),
            type,
            repeat,
            runAt: new Date(when).toISOString(),
            prompt: type === 'work' ? prompt : undefined,
            enabled: true,
          });
          setTitle('');
          setPrompt('');
        }}
      >
        Add task ({tasks.length}/10)
      </button>
    </>
  );
}
