import type { RefObject } from 'react';
import { filterSlashMenu } from '../../lib/slashCommands';
import { AudioLevels } from '../AudioLevels';
import type { ChatDockProps } from './chatDockTypes';

export function ChatCompose({
  draft,
  onDraft,
  onSend,
  chatBusy,
  listening,
  transcribing,
  speaking,
  onUserActivity,
  chatAttachment,
  onClearAttachment,
  onAttachDisplayId,
  stopListening,
  inputRef,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onSend: (text: string) => void;
  chatBusy?: boolean;
  listening: boolean;
  transcribing: boolean;
  speaking?: boolean;
  onUserActivity?: () => void;
  chatAttachment: ChatDockProps['chatAttachment'];
  onClearAttachment?: () => void;
  onAttachDisplayId?: (id: string) => void;
  stopListening: () => Promise<string | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const slashSuggestions = filterSlashMenu(draft);
  const showSlashMenu = slashSuggestions.length > 0;

  return (
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
            const composing =
              e.nativeEvent.isComposing || e.keyCode === 229;
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
              if (composing) return;
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
          onClick={() => {
            if (!draft.trim() || chatBusy || transcribing || listening) return;
            onSend(draft);
          }}
          title={listening ? 'Stop speaking first (Enter)' : 'Send (Enter)'}
        >
          {chatBusy ? '…' : listening ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
