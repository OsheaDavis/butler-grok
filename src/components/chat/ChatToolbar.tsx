import type { Conversation, FolderItem, Project } from '../../lib/types';

export function ChatToolbar({
  variant,
  conversation,
  activeProject,
  onClearProject,
  projectConversations,
  onSelectConversation,
  folders,
  selectedFolderIds,
  onToggleFolder,
  onNewConversation,
  onSaveChat,
  onSaveAsProject,
  onFloatChat,
  speaking,
  onStopVoice,
  micOn,
  listening,
  transcribing,
  chatBusy,
  useCloudStt,
  speakLabel,
  onListenOnce,
  onToggleMic,
}: {
  variant: 'dock' | 'window';
  conversation: Conversation | null;
  activeProject: Project | null;
  onClearProject: () => void;
  projectConversations: Conversation[];
  onSelectConversation?: (id: string) => void;
  folders: FolderItem[];
  selectedFolderIds: string[];
  onToggleFolder: (id: string) => void;
  onNewConversation?: () => void;
  onSaveChat: () => void;
  onSaveAsProject?: () => void;
  onFloatChat?: () => void;
  speaking?: boolean;
  onStopVoice?: () => void;
  micOn?: boolean;
  listening: boolean;
  transcribing: boolean;
  chatBusy?: boolean;
  useCloudStt?: boolean;
  speakLabel: string;
  onListenOnce: () => void;
  onToggleMic?: () => void;
}) {
  return (
    <div className="chat-meta">
      {activeProject ? (
        <span className="chip project-chat-chip" title="Only this project’s chats are shown">
          📁 Project: <strong>{activeProject.name}</strong>
          <button type="button" onClick={onClearProject} title="Leave project (back to general chat)">
            ✕ Leave
          </button>
        </span>
      ) : (
        <span className="chip muted-chip" title="General chat — not inside a project">
          General chat
        </span>
      )}
      {projectConversations.length > 0 && onSelectConversation ? (
        <label className="chat-thread-picker" title="Switch chats in this scope">
          <span className="muted">Chat</span>
          <select
            value={conversation?.id || ''}
            onChange={(e) => {
              if (e.target.value) onSelectConversation(e.target.value);
            }}
          >
            {projectConversations.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.saved ? '★ ' : '') +
                  (c.title || 'Untitled') +
                  (c.id === conversation?.id ? ' · now' : '')}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {folders.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`chip folder-chip ${selectedFolderIds.includes(f.id) ? 'selected' : ''}`}
          onClick={() => onToggleFolder(f.id)}
          title={f.path}
        >
          📁 {f.label}
        </button>
      ))}
      {onNewConversation ? (
        <button
          type="button"
          className="btn primary"
          onClick={onNewConversation}
          title={
            activeProject
              ? 'New chat inside this project'
              : 'Start a blank general conversation'
          }
        >
          {activeProject ? 'New project chat' : 'New conversation'}
        </button>
      ) : null}
      {conversation ? (
        <button type="button" className="btn" onClick={onSaveChat}>
          {activeProject ? 'Save in project' : 'Save chat'}
        </button>
      ) : null}
      {!activeProject && conversation?.messages?.length && onSaveAsProject ? (
        <button
          type="button"
          className="btn primary"
          onClick={onSaveAsProject}
          title="Turn this chat into a new project (keeps full history)"
        >
          📦 Save as project
        </button>
      ) : null}
      {variant === 'dock' && onFloatChat ? (
        <button
          type="button"
          className="btn"
          onClick={onFloatChat}
          title="Open chat in a large floating window you can move and resize"
        >
          ⧉ Float chat
        </button>
      ) : null}
      {speaking && onStopVoice ? (
        <button
          type="button"
          className="btn stop-voice"
          onClick={onStopVoice}
          title="Stop Butler speaking"
        >
          ⏹ Stop voice
        </button>
      ) : null}
      {micOn ? (
        <button
          type="button"
          className={`btn ${listening || transcribing ? 'primary' : ''}`}
          onClick={() => void onListenOnce()}
          disabled={transcribing || chatBusy}
          title={
            useCloudStt
              ? 'Speak: click (or focus chat), talk, press Enter to stop, Enter again to send'
              : 'Speak once into the chat box — Enter stops, Enter again sends'
          }
        >
          {speakLabel}
        </button>
      ) : null}
      {onToggleMic ? (
        <button type="button" className="btn" onClick={onToggleMic}>
          Mic {micOn ? 'On' : 'Off'}
        </button>
      ) : null}
    </div>
  );
}
