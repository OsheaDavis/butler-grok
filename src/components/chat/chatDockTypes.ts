import type { Conversation, FolderItem, Project } from '../../lib/types';

export type ChatDockProps = {
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
  /** When set (Mode B/C + key stored in main), Speak uses xAI STT. */
  hasApiKey?: boolean;
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
