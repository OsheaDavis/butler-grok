/**
 * Allowlisted `grok` argv shapes for grok:cli IPC.
 * Spawn stays shell:false; this still blocks unexpected flags and traversal.
 */

const MAX_TOKEN_LEN = 400;
const MAX_ARGS = 8;

function hasControlChars(s) {
  return /[\x00-\x1f\x7f]/.test(s);
}

function isAllowedPluginName(s) {
  if (typeof s !== 'string' || !s || s.length > MAX_TOKEN_LEN) return false;
  if (s.startsWith('-') || s.includes('..') || s.includes('\\')) return false;
  if (hasControlChars(s) || /\s/.test(s)) return false;
  if (s.startsWith('@')) {
    return /^@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(s);
  }
  return /^[A-Za-z0-9._-]+$/.test(s);
}

function isAllowedPluginSource(s) {
  if (typeof s !== 'string' || !s || s.length > MAX_TOKEN_LEN) return false;
  if (s.startsWith('-') || s.includes('..') || /\s/.test(s) || hasControlChars(s)) return false;
  if (isAllowedPluginName(s)) return true;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (u.search || u.hash) return false;
    if (!/^[A-Za-z0-9.-]+$/.test(u.hostname)) return false;
    if (u.pathname.includes('..') || u.pathname.includes('\\')) return false;
    return true;
  } catch {
    return false;
  }
}

function eq(args, expected) {
  return args.length === expected.length && expected.every((v, i) => args[i] === v);
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, args: string[] } | { ok: false, error: string }}
 */
function validateGrokCliArgs(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ARGS) {
    return { ok: false, error: 'Rejected grok CLI args: empty or too many tokens' };
  }
  const args = raw.map((a) => String(a));
  if (args.some((a) => !a || a.length > MAX_TOKEN_LEN)) {
    return { ok: false, error: 'Rejected grok CLI args: empty or oversized token' };
  }
  if (args.some((a) => hasControlChars(a))) {
    return { ok: false, error: 'Rejected grok CLI args: control characters' };
  }

  if (eq(args, ['plugin', 'marketplace', 'update'])) return { ok: true, args };
  if (eq(args, ['plugin', 'list', '--json', '--available'])) return { ok: true, args };
  if (eq(args, ['mcp', 'list'])) return { ok: true, args };
  if (eq(args, ['mcp', 'doctor'])) return { ok: true, args };

  if (args.length === 4 && args[0] === 'plugin' && args[1] === 'install' && args[3] === '--trust') {
    if (!isAllowedPluginSource(args[2])) {
      return { ok: false, error: 'Rejected grok CLI args: invalid plugin source' };
    }
    return { ok: true, args };
  }

  if (args.length === 3 && args[0] === 'plugin' && (args[1] === 'uninstall' || args[1] === 'update')) {
    if (!isAllowedPluginName(args[2])) {
      return { ok: false, error: 'Rejected grok CLI args: invalid plugin name' };
    }
    return { ok: true, args };
  }

  return { ok: false, error: 'Rejected grok CLI args: command not allowlisted' };
}

module.exports = {
  validateGrokCliArgs,
  isAllowedPluginName,
  isAllowedPluginSource,
};
