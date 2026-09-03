import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { AppStore } from '../hooks/useAppStore';

type Props = {
  store: AppStore;
  /**
   * null = General Display (only untagged media).
   * string = this project's private Display only.
   */
  projectId: string | null;
};

/**
 * Display review desk — one general panel, or one private panel per project.
 */
export function DisplayBody({ store, projectId }: Props) {
  const [urlIn, setUrlIn] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [resolving, setResolving] = useState(false);
  /** null = all in scope; '__unfiled__' = no library folder; else folder id */
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [voteFilter, setVoteFilter] = useState<'all' | 'pending' | 'liked' | 'passed' | 'chosen'>(
    'all'
  );
  const [newFolderName, setNewFolderName] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const project = projectId
    ? store.data.projects.find((p) => p.id === projectId) || null
    : null;
  const libraryFolders = project?.libraryFolders || [];

  const scopeItems = useMemo(() => {
    const all = store.data.displayItems || [];
    if (projectId) return all.filter((i) => i.projectId === projectId);
    return all.filter((i) => !i.projectId);
  }, [store.data.displayItems, projectId]);

  const list = useMemo(() => {
    return scopeItems.filter((i) => {
      if (folderFilter === '__unfiled__') {
        if (i.libraryFolderId) return false;
      } else if (folderFilter) {
        if (i.libraryFolderId !== folderFilter) return false;
      }
      const v = i.vote || 'pending';
      if (voteFilter !== 'all' && v !== voteFilter) return false;
      return true;
    });
  }, [scopeItems, folderFilter, voteFilter]);

  const active = list.find((i) => i.id === store.data.activeDisplayId) || list[0] || null;
  const previewSrc = active?.displaySrc || active?.src || '';
  const activeIdx = active ? list.findIndex((i) => i.id === active.id) : -1;
  const vote = active?.vote || 'pending';

  useEffect(() => {
    if (!list.length) return;
    if (!list.some((i) => i.id === store.data.activeDisplayId)) {
      store.setActiveDisplay(list[0].id);
    }
  }, [list, store]);

  useEffect(() => {
    if (!active || active.kind === 'link') return;
    const preview = active.displaySrc || '';
    if (preview.startsWith('data:') || preview.startsWith('butler-media:')) return;
    if (active.loadError && !preview) return;
    if (!window.butler?.mediaResolve) return;
    const toResolve = active.src || active.displaySrc;
    if (!toResolve) return;
    if (toResolve.startsWith('data:') || toResolve.startsWith('butler-media:')) return;
    let cancelled = false;
    setResolving(true);
    void (async () => {
      const r = await window.butler!.mediaResolve!(toResolve);
      if (cancelled) return;
      setResolving(false);
      if (r.ok && r.src) {
        store.patchDisplayItem(active.id, { displaySrc: r.src, loadError: undefined });
      } else {
        store.patchDisplayItem(active.id, {
          loadError: r.error || 'Could not load media',
          kind: r.isPage ? 'link' : active.kind,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.id, active?.src, active?.displaySrc, active?.loadError, active?.kind, store]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
      if (e.key === 'ArrowRight' && activeIdx >= 0 && activeIdx < list.length - 1) {
        store.setActiveDisplay(list[activeIdx + 1].id);
      }
      if (e.key === 'ArrowLeft' && activeIdx > 0) {
        store.setActiveDisplay(list[activeIdx - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, activeIdx, list, store]);

  const save = async (toDesktop: boolean) => {
    if (!active || !window.butler?.mediaSave) {
      store.showToast('Save is only available in the desktop app.');
      return;
    }
    if (active.kind === 'link') {
      store.showToast('Web page link — open externally to save.');
      return;
    }
    const r = await window.butler.mediaSave({
      src: active.displaySrc || active.src,
      title: active.title,
      kind: active.kind === 'video' ? 'video' : 'image',
      toDesktop,
    });
    if (r.cancelled) return;
    if (r.ok) {
      store.showToast(toDesktop ? `Saved to Desktop: ${r.filePath}` : `Saved: ${r.filePath}`);
    } else {
      store.showToast(r.error || 'Could not save media.');
    }
  };

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files
      .map((f) => (f as File & { path?: string }).path || '')
      .filter(Boolean);
    const uri = (
      e.dataTransfer.getData('text/uri-list') ||
      e.dataTransfer.getData('text/plain') ||
      ''
    ).trim();
    if (projectId) store.setActiveProject(projectId);
    if (paths.length) store.addDisplayFromPaths(paths);
    else if (uri) store.addDisplayFromUrl(uri.split('\n')[0].trim());
  };

  const openFullscreen = () => {
    if (active && (active.kind === 'image' || active.kind === 'video')) setFullscreen(true);
  };

  const addFolder = () => {
    if (!projectId) return;
    const n = newFolderName.trim();
    if (!n) return;
    store.addProjectLibraryFolder(projectId, n);
    setNewFolderName('');
  };

  const folderLabel = (fid?: string | null) => {
    if (!fid) return 'Unfiled';
    return libraryFolders.find((f) => f.id === fid)?.name || 'Folder';
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
    >
      <p className="panel-hint">
        {projectId && project ? (
          <>
            <strong>Display · {project.name}</strong> — only this project’s media. Add{' '}
            <strong>folders</strong> for NPCs, ships, etc. Click image for full screen.
          </>
        ) : (
          <>
            <strong>Display (General)</strong> — media not in a project. Open a project’s own
            Display from <strong>Projects → Open Display</strong>.
          </>
        )}
      </p>

      {projectId && project ? (
        <div className="display-folder-section">
          <div className="display-project-chips" role="tablist" aria-label="Project folders">
            <button
              type="button"
              className={`btn chip ${folderFilter === null ? 'primary' : ''}`}
              onClick={() => setFolderFilter(null)}
            >
              All ({scopeItems.length})
            </button>
            <button
              type="button"
              className={`btn chip ${folderFilter === '__unfiled__' ? 'primary' : ''}`}
              onClick={() => setFolderFilter('__unfiled__')}
            >
              Unfiled ({scopeItems.filter((i) => !i.libraryFolderId).length})
            </button>
            {libraryFolders.map((f) => {
              const n = scopeItems.filter((i) => i.libraryFolderId === f.id).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`btn chip ${folderFilter === f.id ? 'primary' : ''}`}
                  onClick={() => setFolderFilter(f.id)}
                >
                  📁 {f.name} ({n})
                </button>
              );
            })}
          </div>
          <div className="row-actions" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <input
              style={{ flex: 1, minWidth: 140 }}
              placeholder="New folder (e.g. Captain faces)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addFolder();
              }}
            />
            <button type="button" className="btn primary" onClick={addFolder}>
              Add folder
            </button>
            {folderFilter && folderFilter !== '__unfiled__' ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (confirm('Remove this folder? Media stays in the project (unfiled).')) {
                    store.removeProjectLibraryFolder(projectId, folderFilter);
                    setFolderFilter(null);
                  }
                }}
              >
                Remove folder
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="row-actions" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          className="search-box"
          style={{ flex: 1, margin: 0, minWidth: 140 }}
          placeholder="Paste image/video URL or page link…"
          value={urlIn}
          onChange={(e) => setUrlIn(e.target.value)}
        />
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (!urlIn.trim()) return;
            if (projectId) store.setActiveProject(projectId);
            store.addDisplayFromUrl(urlIn.trim());
            setUrlIn('');
          }}
        >
          Add
        </button>
      </div>

      <div className="row-actions" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        {(['all', 'pending', 'liked', 'passed', 'chosen'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`btn ${voteFilter === f ? 'primary' : ''}`}
            style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            onClick={() => setVoteFilter(f)}
          >
            {f === 'all' ? 'All votes' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {!list.length ? (
        <div className="empty display-empty-filter" style={{ padding: 24, textAlign: 'center' }}>
          {projectId ? (
            <>
              <p>
                <strong>No media in this project yet.</strong>
              </p>
              <p className="muted" style={{ marginTop: 8 }}>
                Use <strong>Continue chat</strong> on the project and create images, or paste/drag
                files here. Everything stays in this Display only.
              </p>
            </>
          ) : (
            <p>
              No general media. When a project is active, new images go to that project’s Display.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="display-stage" title="Click image for full screen">
            {resolving ? (
              <div className="empty" style={{ padding: 24 }}>
                Loading preview…
              </div>
            ) : active?.kind === 'link' ? (
              <div className="display-link-card">
                <div className="title">{active.title}</div>
                <div className="meta" style={{ wordBreak: 'break-all' }}>
                  {active.src}
                </div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void window.butler?.mediaOpenExternal?.(active.src)}
                >
                  Open in browser
                </button>
              </div>
            ) : active?.kind === 'video' ? (
              <video
                ref={videoRef}
                key={active.id}
                className="display-media display-media-clickable"
                src={previewSrc}
                controls
                playsInline
                onDoubleClick={openFullscreen}
              />
            ) : active ? (
              active.loadError && !active.displaySrc ? (
                <div className="display-link-card">
                  <div className="title">{active.title}</div>
                  <div className="meta">{active.loadError}</div>
                </div>
              ) : (
                <img
                  className="display-media display-media-clickable"
                  src={previewSrc}
                  alt={active.title}
                  draggable
                  onClick={openFullscreen}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    store.bringDisplayToChat(active.id);
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/x-butler-display',
                      active.id
                    );
                    e.dataTransfer.setData('text/uri-list', active.src);
                    e.dataTransfer.setData('text/plain', active.src);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title="Click full screen · Right-click or drag to chat to attach for edits"
                />
              )
            ) : null}
            {active && active.kind !== 'link' ? (
              <div className="display-stage-meta">
                {projectId ? folderLabel(active.libraryFolderId) : 'General'} · {vote} · click full
                screen
              </div>
            ) : null}
          </div>

          {fullscreen && active && active.kind !== 'link'
            ? createPortal(
                <div
                  className="display-fs-overlay"
                  role="dialog"
                  aria-modal="true"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setFullscreen(false);
                  }}
                >
                  <button
                    type="button"
                    className="btn display-fs-close"
                    onClick={() => setFullscreen(false)}
                  >
                    ✕ Exit full screen (Esc)
                  </button>
                  <div className="display-fs-body">
                    {active.kind === 'video' ? (
                      <video
                        key={`fs-${active.id}`}
                        className="display-fs-media"
                        src={previewSrc}
                        controls
                        autoPlay
                        playsInline
                      />
                    ) : (
                      <img className="display-fs-media" src={previewSrc} alt={active.title} />
                    )}
                  </div>
                  <div className="display-fs-nav">
                    <button
                      type="button"
                      className="btn"
                      disabled={activeIdx <= 0}
                      onClick={() =>
                        activeIdx > 0 && store.setActiveDisplay(list[activeIdx - 1].id)
                      }
                    >
                      ← Prev
                    </button>
                    <span className="muted">
                      {activeIdx + 1} / {list.length}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={activeIdx < 0 || activeIdx >= list.length - 1}
                      onClick={() =>
                        activeIdx >= 0 &&
                        activeIdx < list.length - 1 &&
                        store.setActiveDisplay(list[activeIdx + 1].id)
                      }
                    >
                      Next →
                    </button>
                  </div>
                </div>,
                document.body
              )
            : null}

          {active && active.kind !== 'link' ? (
            <div className="display-vote-row">
              <button
                type="button"
                className="btn primary"
                onClick={() => store.bringDisplayToChat(active.id)}
                title="Attach this media to chat so Butler knows which one to modify"
              >
                💬 Bring to chat
              </button>
              <button
                type="button"
                className={`btn vote-btn ${vote === 'liked' ? 'primary' : ''}`}
                onClick={() => store.setDisplayVote(active.id, 'liked')}
              >
                👍 Like
              </button>
              <button
                type="button"
                className={`btn vote-btn ${vote === 'passed' ? 'primary' : ''}`}
                onClick={() => store.setDisplayVote(active.id, 'passed')}
              >
                👎 Pass
              </button>
              <button
                type="button"
                className={`btn vote-btn ${vote === 'chosen' ? 'primary' : ''}`}
                onClick={() => {
                  store.setDisplayVote(active.id, 'chosen');
                  store.bringDisplayToChat(active.id);
                }}
                title="Mark as chosen and attach to chat"
              >
                ✓ Keep + to chat
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => store.setDisplayVote(active.id, 'pending')}
              >
                Clear vote
              </button>
            </div>
          ) : null}

          {active && projectId && libraryFolders.length ? (
            <div className="row-actions" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
              <span className="muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>
                Put in folder:
              </span>
              <button
                type="button"
                className={`btn ${!active.libraryFolderId ? 'primary' : ''}`}
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                onClick={() => store.assignDisplayToProject(active.id, projectId, null)}
              >
                Unfiled
              </button>
              {libraryFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`btn ${active.libraryFolderId === f.id ? 'primary' : ''}`}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  onClick={() => store.assignDisplayToProject(active.id, projectId, f.id)}
                >
                  📁 {f.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="row-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            {active && (active.kind === 'image' || active.kind === 'video') ? (
              <button type="button" className="btn primary" onClick={openFullscreen}>
                Full screen
              </button>
            ) : null}
            {active?.kind === 'image' || active?.kind === 'video' ? (
              <>
                <button type="button" className="btn" onClick={() => void save(false)}>
                  Save as…
                </button>
                <button type="button" className="btn" onClick={() => void save(true)}>
                  Save to Desktop
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={!active}
              onClick={() => void window.butler?.mediaOpenExternal?.(active?.src || '')}
            >
              Open externally
            </button>
            {active ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => store.removeDisplayItem(active.id)}
              >
                Remove
              </button>
            ) : null}
          </div>

          <h4 style={{ margin: '14px 0 8px' }}>Library ({list.length})</h4>
          <div className="display-thumbs">
            {list.map((it) => (
              <button
                key={it.id}
                type="button"
                className={`display-thumb ${active?.id === it.id ? 'active' : ''} vote-${it.vote || 'pending'}`}
                onClick={() => store.setActiveDisplay(it.id)}
                onDoubleClick={() => {
                  store.setActiveDisplay(it.id);
                  if (it.kind === 'image' || it.kind === 'video') setFullscreen(true);
                }}
                title={it.title}
              >
                {it.kind === 'video' ? (
                  <span className="display-thumb-label">▶</span>
                ) : it.kind === 'link' ? (
                  <span className="display-thumb-label">🔗</span>
                ) : (
                  <img src={it.displaySrc || it.src} alt="" />
                )}
                {(it.vote === 'liked' || it.vote === 'passed' || it.vote === 'chosen') && (
                  <span className="display-thumb-vote">
                    {it.vote === 'liked' ? '👍' : it.vote === 'passed' ? '👎' : '✓'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
