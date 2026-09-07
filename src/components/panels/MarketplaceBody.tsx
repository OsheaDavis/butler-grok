import { useEffect, useMemo, useState } from 'react';
import type { AppStore } from '../../hooks/useAppStore';

type PluginRow = {
  status?: string;
  name: string;
  version?: string;
  source?: string;
  marketplace?: string;
  path?: string;
  repo_key?: string;
  description?: string;
};

/** Grok Build marketplace: list / install / update plugins; MCP helpers + auth via Grok TUI. */
export function MarketplaceBody({ store }: { store: AppStore }) {
  const [loading, setLoading] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [mcpText, setMcpText] = useState('');
  const [filter, setFilter] = useState('');
  const [log, setLog] = useState('');
  const [installSource, setInstallSource] = useState('');
  const [tab, setTab] = useState<'plugins' | 'mcp'>('plugins');

  const refresh = async () => {
    if (!window.butler?.grokCli) {
      store.showToast('Grok CLI bridge not available — run Butler as the desktop app.');
      return;
    }
    setLoading(true);
    setLog('');
    try {
      await window.butler.grokCli(['plugin', 'marketplace', 'update']);
      const list = await window.butler.grokCli(['plugin', 'list', '--json', '--available']);
      let rows: PluginRow[] = [];
      if (!list.ok && !list.stdout.trim()) {
        setLog(list.stderr || 'Could not list plugins. Is grok on PATH?');
      } else {
        try {
          const parsed = JSON.parse(list.stdout) as PluginRow[];
          rows = Array.isArray(parsed) ? parsed : [];
        } catch {
          setLog('Unexpected plugin list format.\n' + list.stdout.slice(0, 400));
        }
      }

      // Merge local marketplace catalog so not-yet-installed plugins show Install
      if (window.butler.grokMarketplaceCatalog) {
        const cat = await window.butler.grokMarketplaceCatalog();
        if (cat.ok && cat.plugins?.length) {
          const normalize = (n: string) =>
            (n || '')
              .toLowerCase()
              .replace(/-mcp$/, '')
              .replace(/_mcp$/, '')
              .replace(/-plugin$/, '');
          const byName = new Map(rows.map((r) => [normalize(r.name), r]));
          // Also index by source repo basename
          for (const r of rows) {
            const src = (r.source || '').toLowerCase();
            const m = /github\.com\/[^/]+\/([^/.]+)/.exec(src);
            if (m) byName.set(normalize(m[1]), r);
          }
          for (const p of cat.plugins) {
            const key = normalize(p.name);
            if (!key) continue;
            const existing =
              byName.get(key) ||
              byName.get(normalize(p.name + '-mcp')) ||
              rows.find(
                (r) =>
                  normalize(r.name) === key ||
                  (r.source &&
                    p.source &&
                    r.source.replace(/\.git$/, '') === p.source.replace(/\.git$/, ''))
              );
            if (existing) {
              if (!existing.source && p.source) existing.source = p.source;
              if (!existing.description && p.description) existing.description = p.description;
              // Prefer catalog display name but keep installed status
              if (existing.status === 'installed' && p.name) {
                existing.name = existing.name || p.name;
              }
            } else {
              byName.set(key, {
                name: p.name,
                status: 'available',
                source: p.source,
                marketplace: p.marketplace,
                description: p.description,
              });
            }
          }
          // Dedupe by normalized name
          const seen = new Set<string>();
          rows = [...byName.values()]
            .filter((r) => {
              const nk = normalize(r.name);
              if (seen.has(nk)) return false;
              seen.add(nk);
              return true;
            })
            .sort((a, b) => {
              const ai = a.status === 'installed' ? 0 : 1;
              const bi = b.status === 'installed' ? 0 : 1;
              if (ai !== bi) return ai - bi;
              return a.name.localeCompare(b.name);
            });
        }
      }

      setPlugins(rows);

      const mcp = await window.butler.grokCli(['mcp', 'list']);
      setMcpText((mcp.stdout || mcp.stderr || 'No MCP output').trim());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return plugins;
    return plugins.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.source?.toLowerCase().includes(q) ||
        p.marketplace?.toLowerCase().includes(q) ||
        p.status?.toLowerCase().includes(q)
    );
  }, [plugins, filter]);

  const installedCount = plugins.filter((p) => p.status === 'installed').length;

  const runInstall = async (source: string, name?: string) => {
    if (!source.trim()) return;
    setBusyName(name || source);

    // Try silent install first (with full grok path); fall back to terminal
    if (window.butler?.grokCli) {
      store.showToast(`Installing ${name || source}…`);
      const r = await window.butler.grokCli(['plugin', 'install', source.trim(), '--trust']);
      const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
      setLog(out + `\nexit ${r.code}`);
      const already =
        /already installed/i.test(out) || /already installed/i.test(r.stderr || '');
      if (r.ok || already) {
        setBusyName(null);
        store.showToast(
          already
            ? `${name || source} is already installed — list refreshed.`
            : `Installed ${name || source}`
        );
        await refresh();
        return;
      }
      // Fall through to terminal so user can see the error
      store.showToast('Silent install failed — opening terminal…');
    }

    if (window.butler?.grokOpenTerminal) {
      await window.butler.grokOpenTerminal({
        kind: 'plugin-install',
        extraArgs: source.trim(),
      });
      setBusyName(null);
      setLog(
        `Opened terminal ready to install:\n  grok plugin install ${source.trim()} --trust\n\nPress any key in that window to run.`
      );
      store.showToast('Copied install command — new tab → paste → Enter');
      return;
    }

    setBusyName(null);
    store.showToast('Grok CLI not available.');
  };

  const runUninstall = async (name: string) => {
    if (!window.butler?.grokCli || !name) return;
    if (!confirm(`Uninstall plugin “${name}”?`)) return;
    setBusyName(name);
    const r = await window.butler.grokCli(['plugin', 'uninstall', name]);
    setBusyName(null);
    setLog((r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '') + `\nexit ${r.code}`);
    store.showToast(r.ok ? `Uninstalled ${name}` : `Uninstall failed — see log`);
    await refresh();
  };

  const runUpdatePlugin = async (name: string) => {
    if (!name) return;
    setBusyName(name);
    if (window.butler?.grokOpenTerminal) {
      await window.butler.grokOpenTerminal({ kind: 'plugin-update', extraArgs: name });
      setBusyName(null);
      setLog(
        `Plugin update command copied.\n\n1. Open a NEW TAB (Ctrl+Shift+T or +)\n2. Paste\n3. Enter\n\nCommand: grok plugin update ${name}`
      );
      store.showToast('Copied update command — new tab → paste → Enter');
      return;
    }
    if (!window.butler?.grokCli) {
      setBusyName(null);
      return;
    }
    const r = await window.butler.grokCli(['plugin', 'update', name]);
    setBusyName(null);
    setLog((r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '') + `\nexit ${r.code}`);
    store.showToast(r.ok ? `Updated ${name}` : `Update failed — see log`);
    await refresh();
  };

  return (
    <>
      <p className="panel-hint">
        Grok Build <strong>Marketplace</strong> inside Butler Grok.
      </p>
      <div
        className="panel-hint"
        style={{
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'rgba(124, 156, 255, 0.06)',
          fontSize: '0.8rem',
          lineHeight: 1.4,
        }}
      >
        <strong>Simple (Butler buttons)</strong>
        <br />
        • List plugins · Install / Update / Remove
        <br />
        • Install opens a helper: command is copied → <strong>new tab → paste → Enter</strong>
        <br />
        <strong style={{ display: 'inline-block', marginTop: 6 }}>Advanced (full Grok Marketplace)</strong>
        <br />
        • Click <strong>Advanced: Grok Marketplace</strong>
        <br />
        • New tab → paste <code>grok</code> → Enter → press <code>/</code> → Marketplace
        <br />
        • Use that for OAuth / complex installs, then Refresh here
      </div>
      <div className="row-actions" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${tab === 'plugins' ? 'primary' : ''}`}
          onClick={() => setTab('plugins')}
        >
          Plugins ({installedCount}/{plugins.length || '…'})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'mcp' ? 'primary' : ''}`}
          onClick={() => setTab('mcp')}
        >
          MCP servers
        </button>
        <button type="button" className="btn" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => void store.openGrokTerminal('marketplace')}
          title="Copies 'grok' and shows steps: new tab → paste → Enter → / Marketplace"
        >
          Advanced: Grok Marketplace
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void store.openGrokTerminal('grok')}
          title="Copies 'grok' — open new tab, paste, Enter"
        >
          Start Grok (new tab paste)
        </button>
      </div>

      {tab === 'plugins' ? (
        <>
          <input
            className="search-box"
            placeholder="Search plugins…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="row-actions" style={{ marginBottom: 10, alignItems: 'center' }}>
            <input
              className="search-box"
              style={{ flex: 1, margin: 0 }}
              placeholder="Install from git URL or GitHub user/repo"
              value={installSource}
              onChange={(e) => setInstallSource(e.target.value)}
            />
            <button
              type="button"
              className="btn primary"
              disabled={!installSource.trim() || Boolean(busyName)}
              onClick={() => void runInstall(installSource)}
            >
              Install
            </button>
          </div>
          {!filtered.length ? (
            <div className="empty">
              {loading
                ? 'Loading marketplace…'
                : 'No plugins listed. Click Refresh (needs Grok Build on PATH).'}
            </div>
          ) : (
            <div className="list">
              {filtered.map((p) => {
                const installed = p.status === 'installed';
                const key = p.repo_key || p.name + (p.source || '');
                const source = p.source || '';
                return (
                  <div key={key} className="list-item">
                    <div className="grow">
                      <div className="title">
                        {p.name}{' '}
                        <span className="meta" style={{ marginLeft: 6 }}>
                          {installed ? '✓ installed' : p.status || 'available'}
                          {p.version ? ` · v${p.version}` : ''}
                        </span>
                      </div>
                      {p.description ? (
                        <div className="meta" style={{ marginTop: 2 }}>
                          {p.description.slice(0, 160)}
                          {p.description.length > 160 ? '…' : ''}
                        </div>
                      ) : null}
                      <div className="meta">
                        {p.marketplace ? `${p.marketplace} · ` : ''}
                        {source || p.path || ''}
                      </div>
                    </div>
                    <div className="row-actions">
                      {installed ? (
                        <>
                          <button
                            type="button"
                            className="btn"
                            disabled={Boolean(busyName)}
                            onClick={() => void runUpdatePlugin(p.name)}
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            className="btn danger"
                            disabled={Boolean(busyName)}
                            onClick={() => void runUninstall(p.name)}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn primary"
                          disabled={!source || Boolean(busyName)}
                          onClick={() => void runInstall(source, p.name)}
                        >
                          {busyName === p.name || busyName === source ? '…' : 'Install'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="panel-hint">
            MCP servers often come with plugins. If status shows <em>auth required</em>, open Grok Build
            and complete login there, then Refresh here. Advanced: add a server with{' '}
            <code>grok mcp add</code> in the Grok terminal.
          </p>
          <pre className="cli-log">{mcpText || '(empty)'}</pre>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!window.butler?.grokCli) return;
                setLoading(true);
                const r = await window.butler.grokCli(['mcp', 'doctor']);
                setMcpText((r.stdout || r.stderr || '').trim());
                setLoading(false);
              }}
            >
              Run MCP doctor
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                void window.butler?.grokOpenInteractive?.(
                  'Complete MCP OAuth / login for any red servers, then return to Butler and refresh Marketplace.'
                )
              }
            >
              Authenticate in Grok
            </button>
          </div>
        </>
      )}

      {log ? (
        <>
          <h4 style={{ margin: '14px 0 6px' }}>Last command output</h4>
          <pre className="cli-log">{log.slice(0, 4000)}</pre>
        </>
      ) : null}
    </>
  );
}
