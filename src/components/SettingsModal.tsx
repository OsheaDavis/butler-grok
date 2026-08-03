import { useState } from 'react';
import type { AppStore } from '../hooks/useAppStore';
import type { ConnectionMode } from '../lib/types';
import { testXaiKey } from '../lib/xaiChat';
import { testLeoTts } from '../lib/leoTts';

export function SettingsModal({ store }: { store: AppStore }) {
  const s = store.settings;
  const [showKey, setShowKey] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const setMode = (connectionMode: ConnectionMode) => store.updateSettings({ connectionMode });

  return (
    <div className="modal-backdrop" onClick={() => store.setSettingsOpen(false)}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p className="muted">
          Version <strong>{store.appInfo?.version || '0.1.0'}</strong>
          {store.appInfo?.dataDir ? ` · Data: ${store.appInfo.dataDir}` : ''}
        </p>

        <div className="settings-section">
          <h3>Grok Build updates</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Updates the <strong>Grok Build CLI</strong> on this PC (not Butler Grok itself). Runs in
            PowerShell so you can see progress.
          </p>
          <div className="row-actions" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${s.grokUpdateAlpha ? 'primary' : ''}`}
              onClick={() => store.updateSettings({ grokUpdateAlpha: !s.grokUpdateAlpha })}
            >
              Prefer alpha channel: {s.grokUpdateAlpha ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void store.openGrokTerminal('update-check')}
            >
              Check only
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                void store.openGrokTerminal(s.grokUpdateAlpha ? 'update-alpha' : 'update')
              }
            >
              Open update terminal
            </button>
          </div>
          <p className="disclaimer" style={{ marginTop: 8 }}>
            Copies the command and opens a helper window. Then:{' '}
            <strong>new tab → paste → Enter</strong>. Chat: <code>/update-alpha</code>.
          </p>
        </div>

        <div className="settings-section">
          <h3>Connection mode</h3>
          <div className="mode-cards">
            {(
              [
                ['A', 'Local Grok Build', 'Uses Grok Build on this PC. No API key for chat agent.'],
                ['B', 'xAI cloud API', 'Cloud Grok. Paste your API key below.'],
                ['C', 'Both', 'Cloud when useful + local Grok Build for real PC work.'],
              ] as const
            ).map(([mode, title, desc]) => (
              <button
                key={mode}
                type="button"
                className={`mode-card ${s.connectionMode === mode ? 'active' : ''}`}
                onClick={() => setMode(mode)}
              >
                <strong>
                  {mode} — {title}
                </strong>
                <span>{desc}</span>
              </button>
            ))}
          </div>
          {(s.connectionMode === 'B' || s.connectionMode === 'C') && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>xAI API key (stored only on this PC)</label>
              <div className="row-actions">
                <input
                  style={{ flex: 1 }}
                  type={showKey ? 'text' : 'password'}
                  value={s.apiKey}
                  onChange={(e) => store.updateSettings({ apiKey: e.target.value })}
                  placeholder="xai-…"
                  autoComplete="off"
                />
                <button type="button" className="btn" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={async () => {
                    if (!s.apiKey.trim()) {
                      setTestMsg('Paste a key first.');
                      return;
                    }
                    setTestMsg('Testing connection to xAI…');
                    const r = await testXaiKey(s.apiKey);
                    setTestMsg(r.message);
                    store.showToast(r.ok ? 'API key works — saved on this PC only.' : 'API test failed.');
                  }}
                >
                  Test connection
                </button>
              </div>
              {testMsg ? <p className="muted">{testMsg}</p> : null}
              <p className="disclaimer">
                Cloud mode uses your xAI account. Usage may count toward rate limits or billing on your account.
              </p>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Voice</h3>
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${s.micOn ? 'primary' : ''}`}
              onClick={() => store.updateSettings({ micOn: !s.micOn })}
            >
              Mic default: {s.micOn ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              className={`btn ${s.butlerVoiceOn ? 'primary' : ''}`}
              onClick={() => store.updateSettings({ butlerVoiceOn: !s.butlerVoiceOn })}
            >
              Butler voice default: {s.butlerVoiceOn ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              className={`btn ${s.muteSounds ? 'primary' : ''}`}
              onClick={() => store.updateSettings({ muteSounds: !s.muteSounds })}
            >
              Mute all sounds: {s.muteSounds ? 'Yes' : 'No'}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            With Mode B/C and an API key, Butler voice uses <strong>Leo</strong> (xAI TTS). If Leo fails,
            the app falls back to Windows system speech and shows a toast. Replay last reply uses the same
            path. <strong>Speak</strong> (mic) records your voice and uses xAI speech-to-text when cloud
            mode is on — click Speak, talk, click Stop.
          </p>
          {(s.connectionMode === 'B' || s.connectionMode === 'C') && (
            <div className="row-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  if (!s.apiKey.trim()) {
                    store.showToast('Paste an API key first.');
                    return;
                  }
                  store.showToast('Testing Leo voice…');
                  const r = await testLeoTts(s.apiKey);
                  store.showToast(r.message);
                }}
              >
                Test Leo voice
              </button>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Window & notifications</h3>
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${s.notifications ? 'primary' : ''}`}
              onClick={() => store.updateSettings({ notifications: !s.notifications })}
            >
              Notifications: {s.notifications ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              className={`btn ${s.minimizeToTray ? 'primary' : ''}`}
              onClick={() => store.updateSettings({ minimizeToTray: !s.minimizeToTray })}
            >
              Prefer tray minimize: {s.minimizeToTray ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              className={`btn ${s.startWithWindows ? 'primary' : ''}`}
              onClick={() => store.updateSettings({ startWithWindows: !s.startWithWindows })}
            >
              Start with Windows: {s.startWithWindows ? 'On' : 'Off'} (default off)
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Title bar: [−] minimizes, [✕] asks before quit (“All tasks will stop if closed.”).
          </p>
        </div>

        <div className="settings-section">
          <h3>Appearance</h3>
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              onClick={() =>
                store.updateSettings({ theme: s.theme === 'dark' ? 'light' : 'dark' })
              }
            >
              Theme: {s.theme}
            </button>
            <label className="btn" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              Font size
              <input
                type="range"
                min={0.85}
                max={1.25}
                step={0.05}
                value={s.fontScale}
                onChange={(e) => store.updateSettings({ fontScale: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>Data & privacy</h3>
          <p className="muted">
            Chats, projects, tasks, and settings stay on this computer under the Data folder. API keys are
            never uploaded by this app except when you use cloud Mode B/C to call xAI.
          </p>
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!window.butler) {
                  store.showToast('Export available in the desktop app.');
                  return;
                }
                const r = await window.butler.exportBackup();
                if (r.ok) store.showToast('Backup exported.');
              }}
            >
              Export backup
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!window.butler) return;
                const r = await window.butler.importBackup();
                if (r.ok) {
                  store.showToast('Backup imported. Restarting view…');
                  location.reload();
                }
              }}
            >
              Import backup
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const text = window.butler
                  ? await window.butler.diagnostics()
                  : JSON.stringify({ version: '0.1.0', note: 'browser' }, null, 2);
                await navigator.clipboard.writeText(text);
                store.showToast('Diagnostics copied to clipboard.');
              }}
            >
              Copy diagnostics
            </button>
            <button
              type="button"
              className={`btn ${s.demoMode ? 'primary' : ''}`}
              onClick={() => store.updateSettings({ demoMode: !s.demoMode })}
            >
              Demo mode: {s.demoMode ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <p className="disclaimer">
          Butler Grok is a third-party open-source project. Not an official xAI, X, SpaceX, or Grok product.
          Character images are project assets created for this app.
        </p>

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={() => store.setSettingsOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
