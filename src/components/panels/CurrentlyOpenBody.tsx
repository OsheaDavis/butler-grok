import type { AppStore } from '../../hooks/useAppStore';
import { listTasks } from '../../lib/types';
import { MiniButlerWave } from '../MiniButlerWave';

export function CurrentlyOpenBody({ store }: { store: AppStore }) {
  const upcoming = [...listTasks(store.data)]
    .filter((t) => t.enabled)
    .sort((a, b) => a.runAt.localeCompare(b.runAt))
    .slice(0, 5);
  const running = store.data.workItems.filter((w) => w.status === 'running' || w.status === 'pending');
  const recent = store.data.workItems.filter((w) => w.status !== 'running' && w.status !== 'pending').slice(0, 5);

  return (
    <>
      <p className="panel-hint">
        Live desk: work running now and what will fire soon. Long books live under Projects; execution lives here.
      </p>
      <h4 style={{ margin: '0 0 8px' }}>Running</h4>
      {!running.length ? (
        <div className="empty" style={{ padding: 12 }}>
          Nothing running right now.
        </div>
      ) : (
        <div className="list">
          {running.map((w) => (
            <div key={w.id} className="list-item">
              <div className="grow">
                <div className="title">{w.title}</div>
                <div className="meta">
                  {w.status} · {w.detail}
                </div>
              </div>
              <button
                type="button"
                className="btn danger"
                onClick={() =>
                  store.updateData((d) => ({
                    ...d,
                    workItems: d.workItems.map((x) =>
                      x.id === w.id
                        ? { ...x, status: 'cancelled', finishedAt: new Date().toISOString() }
                        : x
                    ),
                  }))
                }
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
      <h4 style={{ margin: '16px 0 8px' }}>Upcoming tasks</h4>
      {!upcoming.length ? (
        <div className="empty" style={{ padding: 12 }}>
          No upcoming tasks.
        </div>
      ) : (
        <div className="list">
          {upcoming.map((t) => (
            <div key={t.id} className="list-item">
              {store.waveTaskId === t.id || t.type === 'remind' ? (
                <MiniButlerWave title="Butler reminder" />
              ) : null}
              <div className="grow">
                <div className="title">{t.title}</div>
                <div className="meta">
                  {t.type} · {new Date(t.runAt).toLocaleString()}
                </div>
              </div>
              <button type="button" className="btn" onClick={() => store.openPanel('tasks')}>
                Open Tasks
              </button>
            </div>
          ))}
        </div>
      )}
      {recent.length ? (
        <>
          <h4 style={{ margin: '16px 0 8px' }}>Recently finished</h4>
          <div className="list">
            {recent.map((w) => (
              <div key={w.id} className="list-item">
                <div className="grow">
                  <div className="title">
                    {w.title} · {w.status}
                  </div>
                  <div className="meta">{w.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

