import { useEffect, useMemo, useState } from 'react';
// useMemo used for panel titles
import { useAppStore, type AppStore } from './hooks/useAppStore';
import { HomeTile, type TileLine } from './components/HomeTile';
import { FloatPanel } from './components/FloatPanel';
import { ButlerPanel } from './components/ButlerPanel';
import { ChatDock } from './components/ChatDock';
// AudioLevels is rendered inside ChatDock
import { SettingsModal } from './components/SettingsModal';
import { FirstRunWizard } from './components/FirstRunWizard';
import { CloseConfirm } from './components/CloseConfirm';
import {
  ConversationsBody,
  CurrentlyOpenBody,
  DisplayBody,
  FoldersBody,
  MarketplaceBody,
  ProjectsBody,
  TasksBody,
} from './components/panelBodies';
import {
  DEFAULT_CHAT_HEIGHT,
  DEFAULT_HOME_TILES,
  HOME_PANEL_IDS,
  PANEL_META,
  listTasks,
  isProjectDisplayPanel,
  panelTitle,
  projectIdFromDisplayPanel,
  type PanelId,
  type StaticPanelId,
} from './lib/types';
import { LIMITS } from './lib/limits';

const DEFAULT_FLOAT = { x: 40, y: 40, w: 440, h: 360 };

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

function scopedConversations(store: AppStore) {
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

function ChatPanelBody({ store }: { store: AppStore }) {
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

function renderBody(id: PanelId, store: AppStore) {
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

/** Standalone OS window for one panel (can leave main app bounds). */
function PanelWindowApp({ panelId, store }: { panelId: PanelId; store: AppStore }) {
  const title = useMemo(() => {
    if (isProjectDisplayPanel(panelId)) {
      const pid = projectIdFromDisplayPanel(panelId);
      const name = store.data.projects.find((p) => p.id === pid)?.name;
      return panelTitle(panelId, name);
    }
    return panelTitle(panelId);
  }, [panelId, store.data.projects]);

  useEffect(() => {
    document.documentElement.dataset.theme = store.settings.theme;
    document.title = `Butler Grok — ${title}`;
  }, [title, store.settings.theme]);

  if (!store.ready) {
    return (
      <div className="panel-window-app" style={{ placeItems: 'center', display: 'grid' }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="panel-window-app" data-theme={store.settings.theme}>
      <div className="panel-window-bar">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          title="Close panel"
          onClick={() => {
            store.closePanel(panelId);
            window.close();
          }}
        >
          ✕
        </button>
      </div>
      <div
        className={`panel-window-body ${panelId === 'chat' ? 'panel-window-body-chat' : ''}`}
      >
        {renderBody(panelId, store)}
      </div>
    </div>
  );
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

  const tileLines = useMemo(() => {
    const folders = store.data.folders.slice(0, 2).map((f) => ({ text: f.label }));
    const saved = store.savedConversations.slice(0, 2).map((c) => ({
      text: c.title || 'Saved chat',
    }));
    const recent = store.recentConversations.slice(0, 2).map((c) => ({
      text: c.title || 'Recent chat',
    }));
    const allTasks = listTasks(store.data);
    const tasks = [...allTasks]
      .filter((t) => t.enabled)
      .sort((a, b) => a.runAt.localeCompare(b.runAt))
      .slice(0, 2)
      .map((t) => ({
        text: t.title,
        wave: t.type === 'remind',
      }));
    const projects = store.data.projects.slice(0, 2).map((p) => ({
      text: p.name + (p.resumeNote ? ` · ${p.resumeNote}` : ''),
    }));
    const running = store.data.workItems
      .filter((w) => w.status === 'running' || w.status === 'pending')
      .slice(0, 2)
      .map((w) => ({ text: `${w.title} (${w.status})` }));
    const upcoming = [...allTasks]
      .filter((t) => t.enabled)
      .sort((a, b) => a.runAt.localeCompare(b.runAt))
      .slice(0, 2)
      .map((t) => ({
        text: t.title,
        wave: t.type === 'remind',
      }));

    const generalCount = (store.data.displayItems || []).filter((i) => !i.projectId).length;
    return {
      folders: folders.length ? folders : [{ text: 'No folders yet' }],
      conversations: saved.length ? saved : [{ text: 'No saved chats yet' }],
      recent: recent.length ? recent : [{ text: 'No recent chats yet' }],
      tasks: tasks.length ? tasks : [{ text: 'No tasks yet' }],
      projects: projects.length ? projects : [{ text: 'No projects yet' }],
      currentlyOpen:
        running.length || upcoming.length
          ? [...running, ...upcoming].slice(0, 2)
          : [{ text: 'Nothing open yet' }],
      marketplace: [
        { text: store.grokConnected ? 'Grok plugins & MCP' : 'Start Grok for marketplace' },
        { text: 'Install · update · auth' },
      ],
      display: generalCount
        ? [{ text: `${generalCount} general item(s)` }, { text: 'Project media → Projects' }]
        : [{ text: 'General chat images' }, { text: 'Project Display is separate' }],
      chat: [{ text: 'Main chat' }],
    } as Record<StaticPanelId, TileLine[]>;
  }, [store.data, store.savedConversations, store.recentConversations, store.grokConnected]);

  const tileCounts = useMemo(
    () =>
      ({
        folders: `${store.data.folders.length}/20`,
        conversations: `${store.savedConversations.length}/20`,
        recent: `${store.recentConversations.length}/10`,
        tasks: `${listTasks(store.data).length}/10`,
        projects: `${store.data.projects.length}/${LIMITS.projects}`,
        currentlyOpen: `${store.data.workItems.filter((w) => w.status === 'running').length}`,
        marketplace: '·',
        display: `${(store.data.displayItems || []).filter((i) => !i.projectId).length}`,
        chat: '',
      }) as Record<StaticPanelId, string>,
    [store.data, store.savedConversations, store.recentConversations]
  );

  const tileStatus = useMemo(() => {
    const allTasks = listTasks(store.data);
    const dueSoon = allTasks.some(
      (t) => t.enabled && new Date(t.runAt).getTime() - Date.now() < 15 * 60 * 1000
    );
    const running = store.data.workItems.some((w) => w.status === 'running');
    return {
      folders: null,
      conversations: null,
      recent: null,
      tasks: dueSoon || allTasks.some((t) => t.type === 'remind' && t.enabled)
        ? ('warn' as const)
        : null,
      projects: store.data.activeProjectId ? ('ok' as const) : null,
      currentlyOpen: running ? ('ok' as const) : dueSoon ? ('warn' as const) : null,
      marketplace: store.grokConnected ? ('ok' as const) : null,
      display: null,
      chat: null,
    } as Record<StaticPanelId, 'ok' | 'warn' | null>;
  }, [store.data, store.grokConnected]);

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
      <header className="titlebar">
        <div className="brand">
          <div className="brand-mark" title="Butler Grok" />
          Butler Grok
          <span className="sub">unofficial Grok Build Interface · Butler Grok</span>
        </div>
        <div className="title-actions">
          <div className="status-group">
            <div className="status-pill" title="Grok Build on PATH">
              <span className={`dot ${store.grokConnected ? 'ok' : ''}`} />
              Grok Build
            </div>
            <button
              type="button"
              className="icon-btn primary"
              title="Open PowerShell and run grok"
              onClick={() => void window.butler?.grokStart()}
            >
              Start Grok
            </button>
            <button
              type="button"
              className="icon-btn"
              title={
                store.settings.grokUpdateAlpha
                  ? 'Open terminal with: grok update --alpha (press Enter)'
                  : 'Open terminal with: grok update --stable (press Enter)'
              }
              onClick={() =>
                void store.openGrokTerminal(
                  store.settings.grokUpdateAlpha ? 'update-alpha' : 'update'
                )
              }
            >
              Update Grok
            </button>
            <div className="status-pill" title="Cloud API / Leo voice ready when key works">
              <span className={`dot ${store.leoReady || store.apiOk ? 'ok' : ''}`} />
              Leo / API
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="Settings"
            onClick={() => store.setSettingsOpen(true)}
          >
            ⚙
          </button>
          <div className="win-btns">
            <button
              type="button"
              title="Minimize"
              onClick={() => void window.butler?.minimize()}
            >
              −
            </button>
            <button
              type="button"
              className="close"
              title="Close"
              onClick={() => store.setCloseConfirmOpen(true)}
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      {store.banner ? (
        <div className="conn-banner">
          <span>{store.banner}</span>
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => void store.refreshGrokStatus()}>
              Retry
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void window.butler?.grokStart()}
            >
              Start Grok
            </button>
            <button type="button" className="btn" onClick={() => store.setSettingsOpen(true)}>
              Settings
            </button>
            <button type="button" className="btn" onClick={() => store.setBanner(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="workspace">
        <div className="desk">
          {tiles.map((t) => (
            <HomeTile
              key={t.id}
              id={t.id}
              x={t.x}
              y={t.y}
              lines={tileLines[t.id]}
              countLabel={tileCounts[t.id]}
              status={tileStatus[t.id]}
              onMove={store.moveHomeTile}
              onOpen={store.openPanel}
            />
          ))}
          {/* Absolute tiles don't expand the desk — spacer creates scroll room below chat */}
          <div
            className="desk-scroll-spacer"
            style={{
              top: 0,
              height:
                Math.max(
                  400,
                  ...tiles.map((t) => t.y + 222 + 48),
                  0
                ) + 'px',
            }}
          />

          {store.openFloats.length ? (
            <div className="float-layer">
              {store.openFloats.map((id) => {
                const layout = store.settings.floatLayouts[id] || DEFAULT_FLOAT;
                const pname = isProjectDisplayPanel(id)
                  ? store.data.projects.find((p) => p.id === projectIdFromDisplayPanel(id))
                      ?.name
                  : null;
                return (
                  <FloatPanel
                    key={id}
                    id={id}
                    title={panelTitle(id, pname)}
                    x={layout.x}
                    y={layout.y}
                    w={layout.w}
                    h={layout.h}
                    z={store.floatZ[id] || 10}
                    onFocus={() => store.focusPanel(id)}
                    onClose={() => store.closePanel(id)}
                    onChange={(next) => store.saveFloatLayout(id, next)}
                  >
                    {renderBody(id, store)}
                  </FloatPanel>
                );
              })}
            </div>
          ) : null}
        </div>

        <ButlerPanel
          speaking={store.speaking}
          thinking={store.chatBusy}
          chatBusy={store.chatBusy}
          pointingPanel={store.pointingPanel}
          lastEngagedAt={store.lastEngagedAt}
          welcomePulse={store.welcomePulse}
          userListening={store.userListening}
          micOn={store.settings.micOn}
          butlerVoiceOn={store.settings.butlerVoiceOn}
          onToggleMic={() => store.updateSettings({ micOn: !store.settings.micOn })}
          onToggleVoice={() =>
            store.updateSettings({ butlerVoiceOn: !store.settings.butlerVoiceOn })
          }
          onReplay={store.replayLast}
          onStopVoice={store.stopVoice}
        />
      </div>

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
