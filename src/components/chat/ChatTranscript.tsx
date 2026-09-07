import type { RefObject } from 'react';
import type { Conversation, Project } from '../../lib/types';
import { ChatMessageView } from '../ChatMessageView';

export function ChatTranscript({
  conversation,
  activeProject,
  chatBusy,
  liveReply,
  thinkingText,
  showThinkingPane,
  liveThinking,
  openThinkingIds,
  setOpenThinkingIds,
  onRemoveImageUrl,
  endRef,
  thinkingRef,
}: {
  conversation: Conversation | null;
  activeProject: Project | null;
  chatBusy?: boolean;
  liveReply?: string;
  thinkingText: string;
  showThinkingPane: boolean;
  liveThinking?: string;
  openThinkingIds: Record<string, boolean>;
  setOpenThinkingIds: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  onRemoveImageUrl?: (url: string) => void;
  endRef: RefObject<HTMLDivElement | null>;
  thinkingRef: RefObject<HTMLDivElement | null>;
}) {
  return (
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
  );
}
