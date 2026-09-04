import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import type { AppStore } from '../hooks/useAppStore';
import { listTasks } from '../lib/types';
import { LIMITS } from '../lib/limits';
import { MiniButlerWave } from './MiniButlerWave';

export function FoldersBody({ store }: { store: AppStore }) {
  return (
    <>
      <p className="panel-hint">
        Save up to 20 folders. Click folder chips above the chat to use them in a new conversation.
      </p>
      <div className="row-actions" style={{ marginBottom: 12 }}>
        <button type="button" className="btn primary" onClick={() => void store.addFolder()}>
          Add folder ({store.data.folders.length}/20)
        </button>
      </div>
      {!store.data.folders.length ? (
        <div className="empty">No folders yet. Add places you often work (e.g. your book files).</div>
      ) : (
        <div className="list">
          {store.data.folders.map((f) => (
            <div key={f.id} className="list-item">
              <div className="grow">
                <div className="title">{f.label}</div>
                <div className="meta">{f.path}</div>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.butler?.openPath(f.path)}
                >
                  Open
                </button>
                <button type="button" className="btn danger" onClick={() => store.removeFolder(f.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ConversationsBody({
  store,
  mode,
}: {
  store: AppStore;
  mode: 'saved' | 'recent';
}) {
  const [q, setQ] = useState('');
  const list =
    mode === 'saved' ? store.savedConversations : store.recentConversations;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(s) ||
        c.messages.some((m) => m.content.toLowerCase().includes(s))
    );
  }, [list, q]);

  return (
    <>
      <p className="panel-hint">
        {mode === 'saved'
          ? 'Chats you explicitly save (max 20).'
          : 'Last 10 chats automatically. Resume anytime.'}
      </p>
      <input
        className="search-box"
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!filtered.length ? (
        <div className="empty">
          {mode === 'saved' ? 'No saved conversations yet. Use Save chat in the chat bar.' : 'No recent chats yet.'}
        </div>
      ) : (
        <div className="list">
          {filtered.map((c) => (
            <div key={c.id} className="list-item">
              <div className="grow">
                <div className="title">{c.title || 'Untitled'}</div>
                <div className="meta">
                  {new Date(c.updatedAt).toLocaleString()} · {c.messages.length} messages
                  {c.saved ? ' · saved' : ''}
                </div>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    store.resumeConversation(c.id);
                    store.closePanel(mode === 'saved' ? 'conversations' : 'recent');
                  }}
                >
                  Resume
                </button>
                {mode === 'recent' && !c.saved ? (
                  <button type="button" className="btn" onClick={() => store.saveConversation(c.id)}>
                    Save
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    if (confirm('Delete this conversation?')) store.deleteConversation(c.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function projectChats(store: AppStore, projectId: string) {
  return (store.data.conversations || [])
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function ProjectsBody({ store }: { store: AppStore }) {
  const [name, setName] = useState('');
  const [folderDraft, setFolderDraft] = useState<Record<string, string>>({});
  const active = store.data.activeProjectId;
  const mediaCount = (projectId: string) =>
    (store.data.displayItems || []).filter((i) => i.projectId === projectId).length;

  return (
    <>
      <p className="panel-hint">
        Long-running work (book, game, brand). Max 10. Say resume project in chat or use{' '}
        <code>/project Name</code>. Add <strong>library folders</strong> for art (NPCs, ships).
        Media in Display can tag to a project.
      </p>
      <div className="field">
        <label>New project name</label>
        <div className="row-actions">
          <input
            style={{ flex: 1 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Her Pride / Space Rangers"
          />
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              store.addProject(name);
              setName('');
            }}
          >
            Add ({store.data.projects.length}/{LIMITS.projects})
          </button>
        </div>
      </div>
      {!store.data.projects.length ? (
        <div className="empty">
          No projects yet. Create one for your game or book, then generate art into Display.
        </div>
      ) : (
        <div className="list">
          {store.data.projects.map((p) => {
            const libs = p.libraryFolders || [];
            return (
              <div
                key={p.id}
                className="list-item"
                style={
                  p.id === active
                    ? { borderColor: 'rgba(124,156,255,0.6)', flexWrap: 'wrap' }
                    : { flexWrap: 'wrap' }
                }
              >
                <div className="grow" style={{ minWidth: 200 }}>
                  <div className="title">
                    {p.name} {p.id === active ? '· active' : ''} ·{' '}
                    <span className="meta">{mediaCount(p.id)} media</span>
                  </div>
                  <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
                    <label>Instructions</label>
                    <textarea
                      value={p.instructions}
                      onChange={(e) => store.updateProject(p.id, { instructions: e.target.value })}
                      placeholder="Project goals, style, constraints..."
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Resume note (last section)</label>
                    <input
                      value={p.resumeNote}
                      onChange={(e) => store.updateProject(p.id, { resumeNote: e.target.value })}
                      placeholder="e.g. Chapter 4 draft ending"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Project library folders</label>
                    <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 6px' }}>
                      Organize art for review (e.g. NPC faces, ships). You or Butler can add more.
                    </p>
                    <div className="row-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
                      {libs.length ? (
                        libs.map((f) => (
                          <span key={f.id} className="project-lib-chip">
                            📁 {f.name}
                            <button
                              type="button"
                              className="chip-x"
                              title="Remove folder"
                              onClick={() => store.removeProjectLibraryFolder(p.id, f.id)}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>
                          No folders yet
                        </span>
                      )}
                    </div>
                    <div className="row-actions" style={{ marginTop: 6 }}>
                      <input
                        style={{ flex: 1 }}
                        placeholder="New folder name (Captain faces)"
                        value={folderDraft[p.id] || ''}
                        onChange={(e) =>
                          setFolderDraft((d) => ({ ...d, [p.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const n = (folderDraft[p.id] || '').trim();
                            if (n) {
                              store.addProjectLibraryFolder(p.id, n);
                              setFolderDraft((d) => ({ ...d, [p.id]: '' }));
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          const n = (folderDraft[p.id] || '').trim();
                          if (!n) return;
                          store.addProjectLibraryFolder(p.id, n);
                          setFolderDraft((d) => ({ ...d, [p.id]: '' }));
                        }}
                      >
                        Add folder
                      </button>
                    </div>
                  </div>
                  {store.data.folders.length ? (
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>PC folders (saved paths) for this project</label>
                      <div className="row-actions">
                        {store.data.folders.map((f) => {
                          const on = p.folderIds.includes(f.id);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              className={`btn ${on ? 'primary' : ''}`}
                              onClick={() =>
                                store.updateProject(p.id, {
                                  folderIds: on
                                    ? p.folderIds.filter((x) => x !== f.id)
                                    : [...p.folderIds, f.id],
                                })
                              }
                            >
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="meta" style={{ marginTop: 6 }}>
                    Chats: {projectChats(store, p.id).length} · Saved:{' '}
                    {projectChats(store, p.id).filter((c) => c.saved).length}/20 · Updated{' '}
                    {new Date(p.updatedAt).toLocaleString()}
                  </div>
                  {projectChats(store, p.id).length ? (
                    <div className="project-chat-list">
                      <div className="muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
                        Project chats (only these appear when you’re in this project)
                      </div>
                      {projectChats(store, p.id)
                        .slice(0, 8)
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="project-chat-row"
                            onClick={() => {
                              store.selectConversation(c.id);
                              store.openPanel('chat');
                            }}
                          >
                            <span>
                              {c.saved ? '★ ' : ''}
                              {c.title || 'Untitled'}
                            </span>
                            <span className="meta">
                              {c.messages.length} msgs ·{' '}
                              {new Date(c.updatedAt).toLocaleDateString()}
                            </span>
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
                <div className="row-actions" style={{ flexDirection: 'column' }}>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => store.openProjectChat(p.id, 'continue')}
                    title="Open chat linked to this project (float chat beside you)"
                  >
                    💬 Continue chat
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => store.openProjectChat(p.id, 'new')}
                    title="Start a fresh chat still inside this project"
                  >
                    New project chat
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void store.openGrokForProject(p.id)}
                    title="Open a separate Grok Build terminal for this project only"
                  >
                    ⚡ Open Grok Build
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      store.setActiveProject(p.id);
                      store.openDisplayFor(p.id);
                      store.showToast(`Display · ${p.name} (this project only)`);
                    }}
                  >
                    Open Display
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      if (confirm(`Remove project ${p.name}?`)) store.removeProject(p.id);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

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

type PluginRow = {
  status?: string;
  name: string;
  version?: string;
  source?: string;
  marketplace?: string;
  path?: string;
  repo_key?: string;
  description?: string;
};

/** Grok Build marketplace: list / install / update plugins; MCP helpers + auth via Grok TUI. */
export function MarketplaceBody({ store }: { store: AppStore }) {
  const [loading, setLoading] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [mcpText, setMcpText] = useState('');
  const [filter, setFilter] = useState('');
  const [log, setLog] = useState('');
  const [installSource, setInstallSource] = useState('');
  const [tab, setTab] = useState<'plugins' | 'mcp'>('plugins');

  const refresh = async () => {
    if (!window.butler?.grokCli) {
      store.showToast('Grok CLI bridge not available — run Butler as the desktop app.');
      return;
    }
    setLoading(true);
    setLog('');
    try {
      await window.butler.grokCli(['plugin', 'marketplace', 'update']);
      const list = await window.butler.grokCli(['plugin', 'list', '--json', '--available']);
      let rows: PluginRow[] = [];
      if (!list.ok && !list.stdout.trim()) {
        setLog(list.stderr || 'Could not list plugins. Is grok on PATH?');
      } else {
        try {
          const parsed = JSON.parse(list.stdout) as PluginRow[];
          rows = Array.isArray(parsed) ? parsed : [];
        } catch {
          setLog('Unexpected plugin list format.\n' + list.stdout.slice(0, 400));
        }
      }

      // Merge local marketplace catalog so not-yet-installed plugins show Install
      if (window.butler.grokMarketplaceCatalog) {
        const cat = await window.butler.grokMarketplaceCatalog();
        if (cat.ok && cat.plugins?.length) {
          const normalize = (n: string) =>
            (n || '')
              .toLowerCase()
              .replace(/-mcp$/, '')
              .replace(/_mcp$/, '')
              .replace(/-plugin$/, '');
          const byName = new Map(rows.map((r) => [normalize(r.name), r]));
          // Also index by source repo basename
          for (const r of rows) {
            const src = (r.source || '').toLowerCase();
            const m = /github\.com\/[^/]+\/([^/.]+)/.exec(src);
            if (m) byName.set(normalize(m[1]), r);
          }
          for (const p of cat.plugins) {
            const key = normalize(p.name);
            if (!key) continue;
            const existing =
              byName.get(key) ||
              byName.get(normalize(p.name + '-mcp')) ||
              rows.find(
                (r) =>
                  normalize(r.name) === key ||
                  (r.source &&
                    p.source &&
                    r.source.replace(/\.git$/, '') === p.source.replace(/\.git$/, ''))
              );
            if (existing) {
              if (!existing.source && p.source) existing.source = p.source;
              if (!existing.description && p.description) existing.description = p.description;
              // Prefer catalog display name but keep installed status
              if (existing.status === 'installed' && p.name) {
                existing.name = existing.name || p.name;
              }
            } else {
              byName.set(key, {
                name: p.name,
                status: 'available',
                source: p.source,
                marketplace: p.marketplace,
                description: p.description,
              });
            }
          }
          // Dedupe by normalized name
          const seen = new Set<string>();
          rows = [...byName.values()]
            .filter((r) => {
              const nk = normalize(r.name);
              if (seen.has(nk)) return false;
              seen.add(nk);
              return true;
            })
            .sort((a, b) => {
              const ai = a.status === 'installed' ? 0 : 1;
              const bi = b.status === 'installed' ? 0 : 1;
              if (ai !== bi) return ai - bi;
              return a.name.localeCompare(b.name);
            });
        }
      }

      setPlugins(rows);

      const mcp = await window.butler.grokCli(['mcp', 'list']);
      setMcpText((mcp.stdout || mcp.stderr || 'No MCP output').trim());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return plugins;
    return plugins.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.source?.toLowerCase().includes(q) ||
        p.marketplace?.toLowerCase().includes(q) ||
        p.status?.toLowerCase().includes(q)
    );
  }, [plugins, filter]);

  const installedCount = plugins.filter((p) => p.status === 'installed').length;

  const runInstall = async (source: string, name?: string) => {
    if (!source.trim()) return;
    setBusyName(name || source);

    // Try silent install first (with full grok path); fall back to terminal
    if (window.butler?.grokCli) {
      store.showToast(`Installing ${name || source}…`);
      const r = await window.butler.grokCli(['plugin', 'install', source.trim(), '--trust']);
      const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
      setLog(out + `\nexit ${r.code}`);
      const already =
        /already installed/i.test(out) || /already installed/i.test(r.stderr || '');
      if (r.ok || already) {
        setBusyName(null);
        store.showToast(
          already
            ? `${name || source} is already installed — list refreshed.`
            : `Installed ${name || source}`
        );
        await refresh();
        return;
      }
      // Fall through to terminal so user can see the error
      store.showToast('Silent install failed — opening terminal…');
    }

    if (window.butler?.grokOpenTerminal) {
      await window.butler.grokOpenTerminal({
        kind: 'plugin-install',
        extraArgs: source.trim(),
      });
      setBusyName(null);
      setLog(
        `Opened terminal ready to install:\n  grok plugin install ${source.trim()} --trust\n\nPress any key in that window to run.`
      );
      store.showToast('Copied install command — new tab → paste → Enter');
      return;
    }

    setBusyName(null);
    store.showToast('Grok CLI not available.');
  };

  const runUninstall = async (name: string) => {
    if (!window.butler?.grokCli || !name) return;
    if (!confirm(`Uninstall plugin “${name}”?`)) return;
    setBusyName(name);
    const r = await window.butler.grokCli(['plugin', 'uninstall', name]);
    setBusyName(null);
    setLog((r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '') + `\nexit ${r.code}`);
    store.showToast(r.ok ? `Uninstalled ${name}` : `Uninstall failed — see log`);
    await refresh();
  };

  const runUpdatePlugin = async (name: string) => {
    if (!name) return;
    setBusyName(name);
    if (window.butler?.grokOpenTerminal) {
      await window.butler.grokOpenTerminal({ kind: 'plugin-update', extraArgs: name });
      setBusyName(null);
      setLog(
        `Plugin update command copied.\n\n1. Open a NEW TAB (Ctrl+Shift+T or +)\n2. Paste\n3. Enter\n\nCommand: grok plugin update ${name}`
      );
      store.showToast('Copied update command — new tab → paste → Enter');
      return;
    }
    if (!window.butler?.grokCli) {
      setBusyName(null);
      return;
    }
    const r = await window.butler.grokCli(['plugin', 'update', name]);
    setBusyName(null);
    setLog((r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '') + `\nexit ${r.code}`);
    store.showToast(r.ok ? `Updated ${name}` : `Update failed — see log`);
    await refresh();
  };

  return (
    <>
      <p className="panel-hint">
        Grok Build <strong>Marketplace</strong> inside Butler Grok.
      </p>
      <div
        className="panel-hint"
        style={{
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'rgba(124, 156, 255, 0.06)',
          fontSize: '0.8rem',
          lineHeight: 1.4,
        }}
      >
        <strong>Simple (Butler buttons)</strong>
        <br />
        • List plugins · Install / Update / Remove
        <br />
        • Install opens a helper: command is copied → <strong>new tab → paste → Enter</strong>
        <br />
        <strong style={{ display: 'inline-block', marginTop: 6 }}>Advanced (full Grok Marketplace)</strong>
        <br />
        • Click <strong>Advanced: Grok Marketplace</strong>
        <br />
        • New tab → paste <code>grok</code> → Enter → press <code>/</code> → Marketplace
        <br />
        • Use that for OAuth / complex installs, then Refresh here
      </div>
      <div className="row-actions" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${tab === 'plugins' ? 'primary' : ''}`}
          onClick={() => setTab('plugins')}
        >
          Plugins ({installedCount}/{plugins.length || '…'})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'mcp' ? 'primary' : ''}`}
          onClick={() => setTab('mcp')}
        >
          MCP servers
        </button>
        <button type="button" className="btn" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => void store.openGrokTerminal('marketplace')}
          title="Copies 'grok' and shows steps: new tab → paste → Enter → / Marketplace"
        >
          Advanced: Grok Marketplace
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void store.openGrokTerminal('grok')}
          title="Copies 'grok' — open new tab, paste, Enter"
        >
          Start Grok (new tab paste)
        </button>
      </div>

      {tab === 'plugins' ? (
        <>
          <input
            className="search-box"
            placeholder="Search plugins…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="row-actions" style={{ marginBottom: 10, alignItems: 'center' }}>
            <input
              className="search-box"
              style={{ flex: 1, margin: 0 }}
              placeholder="Install from git URL or GitHub user/repo"
              value={installSource}
              onChange={(e) => setInstallSource(e.target.value)}
            />
            <button
              type="button"
              className="btn primary"
              disabled={!installSource.trim() || Boolean(busyName)}
              onClick={() => void runInstall(installSource)}
            >
              Install
            </button>
          </div>
          {!filtered.length ? (
            <div className="empty">
              {loading
                ? 'Loading marketplace…'
                : 'No plugins listed. Click Refresh (needs Grok Build on PATH).'}
            </div>
          ) : (
            <div className="list">
              {filtered.map((p) => {
                const installed = p.status === 'installed';
                const key = p.repo_key || p.name + (p.source || '');
                const source = p.source || '';
                return (
                  <div key={key} className="list-item">
                    <div className="grow">
                      <div className="title">
                        {p.name}{' '}
                        <span className="meta" style={{ marginLeft: 6 }}>
                          {installed ? '✓ installed' : p.status || 'available'}
                          {p.version ? ` · v${p.version}` : ''}
                        </span>
                      </div>
                      {p.description ? (
                        <div className="meta" style={{ marginTop: 2 }}>
                          {p.description.slice(0, 160)}
                          {p.description.length > 160 ? '…' : ''}
                        </div>
                      ) : null}
                      <div className="meta">
                        {p.marketplace ? `${p.marketplace} · ` : ''}
                        {source || p.path || ''}
                      </div>
                    </div>
                    <div className="row-actions">
                      {installed ? (
                        <>
                          <button
                            type="button"
                            className="btn"
                            disabled={Boolean(busyName)}
                            onClick={() => void runUpdatePlugin(p.name)}
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            className="btn danger"
                            disabled={Boolean(busyName)}
                            onClick={() => void runUninstall(p.name)}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn primary"
                          disabled={!source || Boolean(busyName)}
                          onClick={() => void runInstall(source, p.name)}
                        >
                          {busyName === p.name || busyName === source ? '…' : 'Install'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="panel-hint">
            MCP servers often come with plugins. If status shows <em>auth required</em>, open Grok Build
            and complete login there, then Refresh here. Advanced: add a server with{' '}
            <code>grok mcp add</code> in the Grok terminal.
          </p>
          <pre className="cli-log">{mcpText || '(empty)'}</pre>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!window.butler?.grokCli) return;
                setLoading(true);
                const r = await window.butler.grokCli(['mcp', 'doctor']);
                setMcpText((r.stdout || r.stderr || '').trim());
                setLoading(false);
              }}
            >
              Run MCP doctor
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                void window.butler?.grokOpenInteractive?.(
                  'Complete MCP OAuth / login for any red servers, then return to Butler and refresh Marketplace.'
                )
              }
            >
              Authenticate in Grok
            </button>
          </div>
        </>
      )}

      {log ? (
        <>
          <h4 style={{ margin: '14px 0 6px' }}>Last command output</h4>
          <pre className="cli-log">{log.slice(0, 4000)}</pre>
        </>
      ) : null}
    </>
  );
}

export { DisplayBody } from './DisplayBody';

