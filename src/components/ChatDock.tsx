import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  DEFAULT_CHAT_HEIGHT,
  MAX_CHAT_HEIGHT,
  MIN_CHAT_HEIGHT,
} from '../lib/types';
import { ChatCompose } from './chat/ChatCompose';
import { ChatToolbar } from './chat/ChatToolbar';
import { ChatTranscript } from './chat/ChatTranscript';
import type { ChatDockProps } from './chat/chatDockTypes';
import { useChatListen } from './chat/useChatListen';

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
  hasApiKey,
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
}: ChatDockProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [openThinkingIds, setOpenThinkingIds] = useState<Record<string, boolean>>({});
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const listen = useChatListen({
    useCloudStt,
    hasApiKey,
    onDraft,
    onToast,
    onListeningChange,
    inputRef,
  });

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
      <ChatToolbar
        variant={variant}
        conversation={conversation}
        activeProject={activeProject}
        onClearProject={onClearProject}
        projectConversations={projectConversations}
        onSelectConversation={onSelectConversation}
        folders={folders}
        selectedFolderIds={selectedFolderIds}
        onToggleFolder={onToggleFolder}
        onNewConversation={onNewConversation}
        onSaveChat={onSaveChat}
        onSaveAsProject={onSaveAsProject}
        onFloatChat={onFloatChat}
        speaking={speaking}
        onStopVoice={onStopVoice}
        micOn={micOn}
        listening={listen.listening}
        transcribing={listen.transcribing}
        chatBusy={chatBusy}
        useCloudStt={useCloudStt}
        speakLabel={listen.speakLabel}
        onListenOnce={() => void listen.listenOnce()}
        onToggleMic={onToggleMic}
      />
      <ChatTranscript
        conversation={conversation}
        activeProject={activeProject}
        chatBusy={chatBusy}
        liveReply={liveReply}
        thinkingText={thinkingText}
        showThinkingPane={showThinkingPane}
        liveThinking={liveThinking}
        openThinkingIds={openThinkingIds}
        setOpenThinkingIds={setOpenThinkingIds}
        onRemoveImageUrl={onRemoveImageUrl}
        endRef={endRef}
        thinkingRef={thinkingRef}
      />
      <ChatCompose
        draft={draft}
        onDraft={onDraft}
        onSend={onSend}
        chatBusy={chatBusy}
        listening={listen.listening}
        transcribing={listen.transcribing}
        speaking={speaking}
        onUserActivity={onUserActivity}
        chatAttachment={chatAttachment}
        onClearAttachment={onClearAttachment}
        onAttachDisplayId={onAttachDisplayId}
        stopListening={listen.stopListening}
        inputRef={inputRef}
      />
    </section>
  );
}
