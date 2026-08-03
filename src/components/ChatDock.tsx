import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Conversation, FolderItem, Project } from '../lib/types';
import {
  DEFAULT_CHAT_HEIGHT,
  MAX_CHAT_HEIGHT,
  MIN_CHAT_HEIGHT,
} from '../lib/types';
import {
  recorderExtension,
  startDictation,
  startMicRecording,
  transcribeWithXai,
} from '../lib/speech';
import { filterSlashMenu } from '../lib/slashCommands';
import { ChatMessageView } from './ChatMessageView';
import { AudioLevels } from './AudioLevels';

type Props = {
  conversation: Conversation | null;
  draft: string;
  onDraft: (v: string) => void;
  onSend: (text: string) => void;
  activeProject: Project | null;
  onClearProject: () => void;
  /** Chats belonging to the active project (or general when no project) */
  projectConversations?: Conversation[];
  onSelectConversation?: (id: string) => void;
  /** Turn current general chat into a new project */
  onSaveAsProject?: () => void;
  folders: FolderItem[];
  selectedFolderIds: string[];
  onToggleFolder: (id: string) => void;
  onSaveChat: () => void;
  onNewConversation?: () => void;
  chatBusy?: boolean;
  micOn?: boolean;
  onToggleMic?: () => void;
  /** When set (Mode B/C + key), Speak uses xAI STT instead of broken Electron Web Speech. */
  apiKey?: string;
  useCloudStt?: boolean;
  onToast?: (msg: string) => void;
  /** Dock (main window) or standalone floating OS panel. */
  variant?: 'dock' | 'window';
  chatHeight?: number;
  onChatHeight?: (h: number) => void;
  onFloatChat?: () => void;
  /** Live model “thinking” while streaming */
  liveThinking?: string;
  /** Live assistant text while streaming */
  liveReply?: string;
  /** Thinking kept after reply finishes */
  retainedThinking?: string;
  speaking?: boolean;
  onStopVoice?: () => void;
  /** Dropped image/video files from Explorer */
  onDropFiles?: (paths: string[]) => void;
  onRemoveImageUrl?: (url: string) => void;
  /** Typing activity (for welcome-after-quiet) */
  onUserActivity?: () => void;
  /** Speak / STT listening changed */
  onListeningChange?: (listening: boolean) => void;
  /** Display media attached for modify / recreate */
  chatAttachment?: {
    displayItemId: string;
    kind: string;
    src: string;
    displaySrc?: string;
    title: string;
  } | null;
  onClearAttachment?: () => void;
  onAttachDisplayId?: (id: string) => void;
};

export function ChatDock({
  conversation,
  draft,
  onDraft,
  onSend,
  activeProject,
  onClearProject,
  projectConversations = [],
  onSelectConversation,
  onSaveAsProject,
  folders,
  selectedFolderIds,
  onToggleFolder,
  onSaveChat,
  onNewConversation,
  chatBusy,
  micOn,
  onToggleMic,
  apiKey,
  useCloudStt,
  onToast,
  variant = 'dock',
  chatHeight = DEFAULT_CHAT_HEIGHT,
  onChatHeight,
  onFloatChat,
  liveThinking,
  liveReply,
  retainedThinking,
  speaking,
  onStopVoice,
  onDropFiles,
  onRemoveImageUrl,
  onUserActivity,
  onListeningChange,
  chatAttachment,
  onClearAttachment,
  onAttachDisplayId,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [openThinkingIds, setOpenThinkingIds] = useState<Record<string, boolean>>({});
  const stopDictationRef = useRef<{ stop: () => void } | null>(null);
  const micRecRef = useRef<{ stop: () => Promise<Blob>; cancel: () => void } | null>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    onListeningChange?.(listening || transcribing);
  }, [listening, transcribing, onListeningChange]);

  const onResizePointerDown = (e: ReactPointerEvent) => {
    if (variant !== 'dock' || !onChatHeight) return;
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: chatHeight };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onResizePointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current || !onChatHeight) return;
    // Drag handle up → taller chat
    const delta = dragRef.current.startY - e.clientY;
    const next = Math.min(
      MAX_CHAT_HEIGHT,
      Math.max(MIN_CHAT_HEIGHT, dragRef.current.startH + delta)
    );
    onChatHeight(next);
  };

  const onResizePointerUp = () => {
    dragRef.current = null;
  };

  const thinkingText = (liveThinking || retainedThinking || '').trim();
  const showThinkingPane = Boolean(chatBusy || thinkingText);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length, chatBusy, liveReply, liveThinking, retainedThinking]);

  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [liveThinking, retainedThinking]);

  // Auto-open working notes on the latest assistant message that has thinking
  useEffect(() => {
    const msgs = conversation?.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === 'assistant' && m.thinking) {
        setOpenThinkingIds((prev) => (prev[m.id] ? prev : { ...prev, [m.id]: true }));
        break;
      }
    }
  }, [conversation?.messages]);

  useEffect(() => {
    return () => {
      stopDictationRef.current?.stop();
      micRecRef.current?.cancel();
    };
  }, []);

  const toast = (msg: string) => onToast?.(msg);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /** Stop recording and return transcribed text (or null). */
  const stopListening = async (): Promise<string | null> => {
    if (micRecRef.current) {
      setListening(false);
      setTranscribing(true);
      toast('Transcribing…');
      try {
        const blob = await micRecRef.current.stop();
        micRecRef.current = null;
        const key = (apiKey || '').trim();
        const name = recorderExtension(blob.type);
        const result = await transcribeWithXai(key, blob, name);
        if (result.ok) {
          onDraft(result.text);
          toast('Ready — press Enter again to send.');
          return result.text;
        }
        toast(result.error);
        return null;
      } catch (e) {
        toast(`Mic error: ${String(e)}`);
        return null;
      } finally {
        setTranscribing(false);
        window.setTimeout(() => inputRef.current?.focus(), 30);
      }
    }
    // Web Speech path: draft already updated live
    stopDictationRef.current?.stop();
    stopDictationRef.current = null;
    setListening(false);
    toast('Ready — press Enter again to send (or edit first).');
    window.setTimeout(() => inputRef.current?.focus(), 30);
    return null;
  };

  const listenOnce = async () => {
    if (transcribing) return;

    // Toggle: stop if already listening
    if (listening) {
      await stopListening();
      return;
    }

    const preferCloud = Boolean(useCloudStt && apiKey?.trim());

    if (preferCloud) {
      try {
        toast('Listening… press Enter or click Stop when done.');
        const rec = await startMicRecording();
        micRecRef.current = rec;
        setListening(true);
        window.setTimeout(() => inputRef.current?.focus(), 30);
      } catch (e) {
        const msg = String(e);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
          toast('Microphone blocked. Allow mic for Butler Grok in Windows Privacy settings.');
        } else {
          toast(`Could not open microphone: ${msg}`);
        }
        setListening(false);
      }
      return;
    }

    // Fallback: Chromium Web Speech (often fails in Electron)
    const handle = startDictation({
      onText: (text, isFinal) => {
        onDraft(text);
        if (isFinal) {
          setListening(false);
          stopDictationRef.current = null;
          toast('Ready — press Enter to send.');
        }
      },
      onError: (err) => {
        setListening(false);
        stopDictationRef.current = null;
        toast(
          err === 'not-allowed'
            ? 'Microphone blocked. Allow mic access for this app.'
            : `Speak failed (${err}). Turn on Mode B/C + API key for better speech recognition.`
        );
      },
      onEnd: () => {
        setListening(false);
        stopDictationRef.current = null;
      },
    });
    if (handle) {
      stopDictationRef.current = handle;
      setListening(true);
      toast('Listening… speak now, then press Enter to stop.');
      window.setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      toast('Speech recognition unavailable. Use Mode B/C + API key, or type instead.');
    }
  };

  const speakLabel = transcribing
    ? 'Transcribing…'
    : listening
      ? '⏹ Stop (Enter)'
      : '🎙 Speak';

  const slashSuggestions = filterSlashMenu(draft);
  const showSlashMenu = slashSuggestions.length > 0;

  const onDragOver = (e: ReactDragEvent) => {
    if (!onDropFiles) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: ReactDragEvent) => {
    if (!onDropFiles) return;
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files
      .map((f) => (f as File & { path?: string }).path || '')
      .filter(Boolean);
    // Also allow dropping a URL string
    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (paths.length) onDropFiles(paths);
    else if (uri && /^https?:\/\//i.test(uri.trim())) onDropFiles([uri.trim()]);
  };

  return (
    <section
      className={`chat-dock ${variant === 'window' ? 'chat-dock-window' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {variant === 'dock' ? (
        <div
          className="chat-resize-handle"
          title="Drag up to make chat taller"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      ) : null}
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
            onClick={() => void listenOnce()}
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
      <div className="chat-messages">
        {!conversation?.messages.length && !chatBusy ? (
          <div className="empty" style={{ paddingTop: 8 }}>
            {activeProject ? (
              <>
                You’re in <strong>{activeProject.name}</strong>. Only this project’s chats show
                here. Pick up where you left off, create images, or review in the project’s Display.
              </>
            ) : (
              <>
                General chat. Like what you’re building? Click <strong>Save as project</strong> to
                keep it as its own workspace.
              </>
            )}
          </div>
        ) : (
          conversation?.messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <ChatMessageView
                content={m.content}
                role={m.role}
                onRemoveImageUrl={onRemoveImageUrl}
              />
              {m.role === 'assistant' && m.thinking ? (
                <>
                  <button
                    type="button"
                    className="thinking-toggle"
                    onClick={() =>
                      setOpenThinkingIds((prev) => ({
                        ...prev,
                        [m.id]: !prev[m.id],
                      }))
                    }
                  >
                    {openThinkingIds[m.id] ? 'Hide working notes' : 'Show working notes'}
                  </button>
                  {openThinkingIds[m.id] ? (
                    <div className="thinking-stored">{m.thinking}</div>
                  ) : null}
                </>
              ) : null}
            </div>
          ))
        )}
        {showThinkingPane || chatBusy ? (
          <div className="chat-live">
            {showThinkingPane ? (
              <div className="thinking-pane">
                <div className="thinking-pane-head">
                  <span>Working / thinking</span>
                  <span className="meta">
                    {chatBusy ? (liveThinking ? 'live' : 'starting…') : 'kept after reply'}
                  </span>
                </div>
                <div className="thinking-pane-body" ref={thinkingRef}>
                  {thinkingText ||
                    'Butler is working on your request. Detailed steps appear here when the model shares them; the main answer builds below.'}
                </div>
              </div>
            ) : null}
            {chatBusy ? (
              liveReply ? (
                <div className="msg assistant streaming">{liveReply}</div>
              ) : (
                <div className="msg assistant streaming">Preparing reply…</div>
              )
            ) : null}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div
        className="chat-compose"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-butler-display') || e.dataTransfer.types.includes('text/uri-list')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData('application/x-butler-display');
          if (id && onAttachDisplayId) {
            e.preventDefault();
            onAttachDisplayId(id);
          }
        }}
      >
        <AudioLevels
          micActive={Boolean(listening || transcribing)}
          leoSpeaking={Boolean(speaking)}
        />
        {chatAttachment ? (
          <div className="chat-attachment" title="This media is attached for your next message">
            <img
              src={chatAttachment.displaySrc || chatAttachment.src}
              alt=""
              className="chat-attachment-thumb"
            />
            <div className="chat-attachment-meta">
              <strong>Attached for edit</strong>
              <span className="muted">{chatAttachment.title}</span>
              <span className="muted" style={{ fontSize: '0.75rem' }}>
                Say what to change, then Send — Butler will recreate from this image.
              </span>
            </div>
            {onClearAttachment ? (
              <button type="button" className="btn" onClick={onClearAttachment}>
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
        {showSlashMenu ? (
          <div className="slash-menu" role="listbox" aria-label="Slash commands">
            {slashSuggestions.map((item) => (
              <button
                key={item.cmd}
                type="button"
                className="slash-menu-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onDraft(item.cmd);
                }}
              >
                <span className="slash-cmd">{item.cmd.trim()}</span>
                <span className="slash-desc">{item.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="slash-hint">
            Type <strong>/</strong> for commands (like Grok Build) · e.g. <strong>/imagine</strong> ·{' '}
            <strong>/update-alpha</strong>
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            value={draft}
            placeholder={
              listening
                ? 'Listening… press Enter to stop recording'
                : transcribing
                  ? 'Transcribing your speech…'
                  : 'Message Butler Grok…  (Enter to send · / for commands)'
            }
            rows={2}
            disabled={chatBusy || transcribing}
            onChange={(e) => {
              const v = e.target.value;
              if (v.length > draft.length) onUserActivity?.();
              onDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && showSlashMenu) {
                e.preventDefault();
                onDraft('');
                return;
              }
              if (e.key === 'Tab' && showSlashMenu && slashSuggestions[0]) {
                e.preventDefault();
                onDraft(slashSuggestions[0].cmd);
                return;
              }
              // Enter while listening → stop STT (do not send yet)
              if (e.key === 'Enter' && !e.shiftKey && listening) {
                e.preventDefault();
                void stopListening();
                return;
              }
              // Enter again → send transcript / typed message
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!chatBusy && !transcribing && !listening && draft.trim()) {
                  onSend(draft);
                }
              }
            }}
          />
          <button
            type="button"
            className="send"
            disabled={!draft.trim() || chatBusy || transcribing || listening}
            onClick={() => onSend(draft)}
            title={listening ? 'Stop speaking first (Enter)' : 'Send (Enter)'}
          >
            {chatBusy ? '…' : listening ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </section>
  );
}
