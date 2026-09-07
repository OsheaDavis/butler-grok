import { useMemo, useState } from 'react';
import type { AppStore } from '../../hooks/useAppStore';

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
