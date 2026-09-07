import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from './hooks/useAppStore';
import { ChatDock } from './components/ChatDock';
import { SettingsModal } from './components/SettingsModal';
import { FirstRunWizard } from './components/FirstRunWizard';
import { CloseConfirm } from './components/CloseConfirm';
import { ConnectionBanner, TitleBar } from './components/app/TitleBar';
import { DeskWorkspace } from './components/app/DeskWorkspace';
import { PanelWindowApp } from './components/app/PanelWindowApp';
import { scopedConversations } from './components/app/renderPanelBody';
import { buildTileCounts, buildTileLines, buildTileStatus } from './components/app/homeTiles';
import {
  DEFAULT_CHAT_HEIGHT,
  DEFAULT_HOME_TILES,
  HOME_PANEL_IDS,
  PANEL_META,
  isProjectDisplayPanel,
  type PanelId,
  type StaticPanelId,
} from './lib/types';

function getPanelIdFromUrl(): PanelId | null {
  try {
    const q = new URLSearchParams(window.location.search).get('panel');
    if (!q) return null;
    if (isProjectDisplayPanel(q)) return q;
    if (q in PANEL_META) return q as StaticPanelId;
  } catch {
    /* */
  }
  return null;
}

export default function App() {
  const store = useAppStore();
  const panelMode = getPanelIdFromUrl();
  const chatH = store.settings.chatHeight || DEFAULT_CHAT_HEIGHT;
  const [windowMaximized, setWindowMaximized] = useState(false);

  useEffect(() => {
    const applyChrome = (s?: {
      maximized?: boolean;
      insetTop?: number;
      insetRight?: number;
      insetBottom?: number;
      insetLeft?: number;
    }) => {
      const maximized = Boolean(s?.maximized);
      setWindowMaximized(maximized);
      const root = document.documentElement;
      root.style.setProperty('--max-inset-top', `${Number(s?.insetTop) || 0}px`);
      root.style.setProperty('--max-inset-right', `${Number(s?.insetRight) || 0}px`);
      root.style.setProperty('--max-inset-bottom', `${Number(s?.insetBottom) || 0}px`);
      root.style.setProperty('--max-inset-left', `${Number(s?.insetLeft) || 0}px`);
    };
    if (!window.butler?.getWindowState && !window.butler?.onWindowState) return;
    void window.butler.getWindowState?.().then((s) => applyChrome(s));
    return window.butler.onWindowState?.((s) => applyChrome(s));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = store.settings.theme;
    document.documentElement.style.setProperty(
      '--font-scale',
      String(store.settings.fontScale || 1)
    );
    document.documentElement.style.setProperty('--chat-h', `${chatH}px`);
  }, [store.settings.theme, store.settings.fontScale, chatH]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panelMode) {
          store.closePanel(panelMode);
          window.close();
          return;
        }
        if (store.openFloats.length) {
          const top = [...store.openFloats].sort(
            (a, b) => (store.floatZ[b] || 0) - (store.floatZ[a] || 0)
          )[0];
          if (top) store.closePanel(top);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, panelMode]);

  const tiles = (store.settings.homeTiles?.length
    ? store.settings.homeTiles
    : DEFAULT_HOME_TILES
  ).filter((t) => HOME_PANEL_IDS.includes(t.id));

  const tileLines = useMemo(
    () => buildTileLines(store),
    [store.data, store.savedConversations, store.recentConversations, store.grokConnected]
  );

  const tileCounts = useMemo(
    () => buildTileCounts(store),
    [store.data, store.savedConversations, store.recentConversations]
  );

  const tileStatus = useMemo(
    () => buildTileStatus(store),
    [store.data, store.grokConnected]
  );

  if (panelMode) {
    return <PanelWindowApp panelId={panelMode} store={store} />;
  }

  if (!store.ready) {
    return (
      <div className="app" style={{ placeItems: 'center', display: 'grid' }}>
        <div className="muted">Starting Butler Grok…</div>
      </div>
    );
  }

  return (
    <div
      className={`app${windowMaximized ? ' is-maximized' : ''}`}
      style={{
        gridTemplateRows: store.banner
          ? 'auto auto 1fr var(--chat-h)'
          : 'auto 1fr var(--chat-h)',
      }}
    >
      <TitleBar store={store} />
      <ConnectionBanner store={store} />
      <DeskWorkspace
        store={store}
        tiles={tiles}
        tileLines={tileLines}
        tileCounts={tileCounts}
        tileStatus={tileStatus}
      />

      <ChatDock
        variant="dock"
        conversation={store.activeConversation}
        draft={store.data.draft}
        onDraft={(draft) => store.updateData({ draft })}
        onSend={(t) => void store.sendChat(t)}
        activeProject={store.activeProject}
        onClearProject={store.leaveProjectContext}
        projectConversations={scopedConversations(store)}
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
        chatHeight={chatH}
        onChatHeight={(h) => store.updateSettings({ chatHeight: h })}
        onFloatChat={() => store.openPanel('chat')}
        liveThinking={store.liveThinking}
        liveReply={store.liveReply}
        retainedThinking={store.retainedThinking}
        speaking={store.speaking}
        onStopVoice={store.stopVoice}
        onUserActivity={store.noteUserActivity}
        onListeningChange={store.setUserListening}
        chatAttachment={store.data.chatAttachment}
        onClearAttachment={store.clearChatAttachment}
        onAttachDisplayId={store.bringDisplayToChat}
        onDropFiles={(paths) => store.addDisplayFromPaths(paths)}
        onRemoveImageUrl={(url) => {
          // Hide from Display library when user hits − on a chat thumb
          const match = (store.data.displayItems || []).find(
            (i) => i.src === url || i.displaySrc === url
          );
          if (match) store.removeDisplayItem(match.id);
          else store.showToast('Removed from chat view.');
        }}
      />

      {store.settingsOpen ? <SettingsModal store={store} /> : null}
      {store.firstRunOpen ? <FirstRunWizard store={store} /> : null}
      {store.closeConfirmOpen ? <CloseConfirm store={store} /> : null}
      {store.toast ? <div className="toast">{store.toast}</div> : null}
    </div>
  );
}
