import type { AppStore } from '../hooks/useAppStore';
import type { ConnectionMode } from '../lib/types';

export function FirstRunWizard({ store }: { store: AppStore }) {
  const s = store.settings;
  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Welcome to Butler Grok</h2>
        <p className="muted">
          A simple desk for chatting with Grok Build — with a Butler on the side. Third-party app, not
          official xAI.
        </p>

        <div className="field">
          <label>1. How should Butler connect?</label>
          <div className="mode-cards">
            {(
              [
                ['A', 'This PC (Grok Build)'],
                ['B', 'Cloud (API key)'],
                ['C', 'Both'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`mode-card ${s.connectionMode === mode ? 'active' : ''}`}
                onClick={() => store.updateSettings({ connectionMode: mode as ConnectionMode })}
              >
                <strong>{mode}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {(s.connectionMode === 'B' || s.connectionMode === 'C') && (
          <div className="field">
            <label>2. Paste xAI API key (optional now — you can add later in Settings)</label>
            <input
              type="password"
              value={s.apiKey}
              onChange={(e) => store.updateSettings({ apiKey: e.target.value })}
              placeholder="xai-…"
            />
          </div>
        )}

        <div className="field">
          <label>3. Grok Build status</label>
          <div className="status-pill" style={{ width: 'fit-content' }}>
            <span className={`dot ${store.grokConnected ? 'ok' : ''}`} />
            {store.grokConnected ? 'Grok found on PATH' : 'Grok not detected yet'}
          </div>
          <div className="row-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => void store.refreshGrokStatus()}>
              Recheck
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void window.butler?.grokStart()}
            >
              Start Grok (PowerShell)
            </button>
          </div>
        </div>

        <p className="panel-hint">
          Tip: create a project like “Her Pride”, then say “resume Her Pride” in chat — Butler will open
          the Projects panel for you.
        </p>

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={store.completeFirstRun}>
            Enter Butler Grok
          </button>
        </div>
      </div>
    </div>
  );
}
