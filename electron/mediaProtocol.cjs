const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL, fileURLToPath } = require('url');

const SCHEME = 'butler-media';

function cacheDir(dataDir) {
  return path.join(dataDir, 'media-cache');
}

function isSafeCacheName(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/.test(name);
}

function butlerMediaUrl(fileName) {
  return `${SCHEME}://cache/${encodeURIComponent(fileName)}`;
}

function registerPrivilegedScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * @returns {string | null} absolute file path inside media-cache
 */
function resolveButlerMediaPath(dataDir, requestUrl) {
  let u;
  try {
    u = new URL(requestUrl);
  } catch {
    return null;
  }
  if (u.protocol !== `${SCHEME}:`) return null;
  if (u.hostname !== 'cache') return null;
  const name = decodeURIComponent((u.pathname || '').replace(/^\//, ''));
  if (!isSafeCacheName(name)) return null;
  const root = path.resolve(cacheDir(dataDir));
  const resolved = path.resolve(root, name);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

function localPathFromButlerMedia(dataDir, src) {
  const p = resolveButlerMediaPath(dataDir, src);
  if (!p || !fs.existsSync(p)) return null;
  return p;
}

function importLocalFile(dataDir, srcPath) {
  const resolved = path.resolve(srcPath);
  if (!fs.existsSync(resolved)) return { ok: false, error: 'File not found' };
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ok: false, error: 'File not found' };
  }
  if (!st.isFile()) return { ok: false, error: 'Not a file' };

  const dir = cacheDir(dataDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext =
    (path.extname(resolved).replace('.', '') || 'bin')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 5) || 'bin';
  const hash = crypto.createHash('sha1').update(resolved).digest('hex').slice(0, 16);
  const name = `${hash}.${ext}`;
  if (!isSafeCacheName(name)) return { ok: false, error: 'Bad cache name' };
  const dest = path.join(dir, name);
  if (!fs.existsSync(dest)) fs.copyFileSync(resolved, dest);
  return { ok: true, src: butlerMediaUrl(name), localPath: dest, cached: true };
}

function fileUrlToPathSafe(src) {
  try {
    return fileURLToPath(src);
  } catch {
    const stripped = String(src).replace(/^file:\/+/i, '');
    return path.resolve(stripped);
  }
}

function registerHandler(protocol, net, dataDir) {
  protocol.handle(SCHEME, (request) => {
    const filePath = resolveButlerMediaPath(dataDir, request.url);
    if (!filePath || !fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    return net.fetch(pathToFileURL(filePath).href);
  });
}

module.exports = {
  SCHEME,
  cacheDir,
  butlerMediaUrl,
  isSafeCacheName,
  registerPrivilegedScheme,
  registerHandler,
  resolveButlerMediaPath,
  localPathFromButlerMedia,
  importLocalFile,
  fileUrlToPathSafe,
};
