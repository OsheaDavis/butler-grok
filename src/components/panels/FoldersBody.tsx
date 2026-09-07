import type { AppStore } from '../../hooks/useAppStore';

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
