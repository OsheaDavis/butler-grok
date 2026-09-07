import { useEffect, useMemo } from 'react';
import type { AppStore } from '../../hooks/useAppStore';
import {
  isProjectDisplayPanel,
  panelTitle,
  projectIdFromDisplayPanel,
  type PanelId,
} from '../../lib/types';
import { renderBody } from './renderPanelBody';

/** Standalone OS window for one panel (can leave main app bounds). */
export function PanelWindowApp({ panelId, store }: { panelId: PanelId; store: AppStore }) {
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
