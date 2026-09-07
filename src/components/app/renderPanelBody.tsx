import { useMemo } from 'react';
import type { AppStore } from '../../hooks/useAppStore';
import { ChatDock } from '../ChatDock';
import {
  ConversationsBody,
  CurrentlyOpenBody,
  DisplayBody,
  FoldersBody,
  MarketplaceBody,
  ProjectsBody,
  TasksBody,
} from '../panelBodies';
import {
  isProjectDisplayPanel,
  projectIdFromDisplayPanel,
  type PanelId,
} from '../../lib/types';

export function scopedConversations(store: AppStore) {
  const pid = store.data.activeProjectId;
  const list = store.data.conversations || [];
  if (pid) {
    return list
      .filter((c) => c.projectId === pid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return list
    .filter((c) => !c.projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function ChatPanelBody({ store }: { store: AppStore }) {
  const scoped = useMemo(() => scopedConversations(store), [store.data]);
  return (
    <ChatDock
      variant="window"
      conversation={store.activeConversation}
      draft={store.data.draft}
      onDraft={(draft) => store.updateData({ draft })}
      onSend={(t) => void store.sendChat(t)}
      activeProject={store.activeProject}
      onClearProject={store.leaveProjectContext}
      projectConversations={scoped}
      onSelectConversation={store.selectConversation}
      onSaveAsProject={() => store.convertChatToProject()}
      folders={store.data.folders}
      selectedFolderIds={store.data.selectedFolderIdsForNewChat}
      onToggleFolder={(id) =>
        store.updateData((d) => ({
          ...d,
          selectedFolderIdsForNewChat: d.selectedFolderIdsForNewChat.includes(id)
            ? d.selectedFolderIdsForNewChat.filter((x) => x !== id)
            : [...d.selectedFolderIdsForNewChat, id],
        }))
      }
      onSaveChat={() => {
        if (store.data.activeConversationId) {
          store.saveConversation(store.data.activeConversationId);
        }
      }}
      onNewConversation={store.startNewConversation}
      chatBusy={store.chatBusy}
      micOn={store.settings.micOn}
      onToggleMic={() => store.updateSettings({ micOn: !store.settings.micOn })}
      hasApiKey={store.hasApiKey}
      useCloudStt={
        !store.settings.demoMode &&
        (store.settings.connectionMode === 'B' || store.settings.connectionMode === 'C') &&
        store.hasApiKey
      }
      onToast={store.showToast}
      liveThinking={store.liveThinking}
      liveReply={store.liveReply}
      retainedThinking={store.retainedThinking}
      speaking={store.speaking}
      onStopVoice={store.stopVoice}
      onUserActivity={store.noteUserActivity}
      onListeningChange={store.setUserListening}
      onDropFiles={(paths) => store.addDisplayFromPaths(paths)}
      chatAttachment={store.data.chatAttachment}
      onClearAttachment={store.clearChatAttachment}
      onAttachDisplayId={store.bringDisplayToChat}
    />
  );
}

export function renderBody(id: PanelId, store: AppStore) {
  if (isProjectDisplayPanel(id)) {
    return <DisplayBody store={store} projectId={projectIdFromDisplayPanel(id)} />;
  }
  switch (id) {
    case 'folders':
      return <FoldersBody store={store} />;
    case 'conversations':
      return <ConversationsBody store={store} mode="saved" />;
    case 'recent':
      return <ConversationsBody store={store} mode="recent" />;
    case 'tasks':
      return <TasksBody store={store} />;
    case 'projects':
      return <ProjectsBody store={store} />;
    case 'currentlyOpen':
      return <CurrentlyOpenBody store={store} />;
    case 'marketplace':
      return <MarketplaceBody store={store} />;
    case 'display':
      return <DisplayBody store={store} projectId={null} />;
    case 'chat':
      return <ChatPanelBody store={store} />;
    default:
      return <div className="empty">Unknown panel</div>;
  }
}
