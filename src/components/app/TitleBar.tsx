import type { AppStore } from '../../hooks/useAppStore';

export function TitleBar({ store }: { store: AppStore }) {
  return (
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
  );
}

export function ConnectionBanner({ store }: { store: AppStore }) {
  if (!store.banner) return null;
  return (
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
  );
}
