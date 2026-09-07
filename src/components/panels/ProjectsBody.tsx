import { useState } from 'react';
import type { AppStore } from '../../hooks/useAppStore';
import { LIMITS } from '../../lib/limits';

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
