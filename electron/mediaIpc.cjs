const { app, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const mediaProtocol = require('./mediaProtocol.cjs');
const { DATA_DIR, state } = require('./appContext.cjs');

function registerMediaIpc() {
/** Save a remote or data: URL image/video to a user-chosen path or Desktop. */
ipcMain.handle('media:save', async (_e, payload) => {
  const src = String(payload?.src || '');
  const title = String(payload?.title || 'media');
  const kind = payload?.kind === 'video' ? 'video' : 'image';
  const toDesktop = Boolean(payload?.toDesktop);
  if (!src) return { ok: false, error: 'No media source' };

  try {
    let buffer;
    let ext = kind === 'video' ? 'mp4' : 'png';

    if (src.startsWith('data:')) {
      const match = /^data:([^;]+);base64,(.+)$/i.exec(src);
      if (!match) return { ok: false, error: 'Invalid data URL' };
      const mime = match[1].toLowerCase();
      if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
      else if (mime.includes('webp')) ext = 'webp';
      else if (mime.includes('gif')) ext = 'gif';
      else if (mime.includes('png')) ext = 'png';
      else if (mime.includes('mp4')) ext = 'mp4';
      else if (mime.includes('webm')) ext = 'webm';
      buffer = Buffer.from(match[2], 'base64');
    } else if (src.startsWith('butler-media:')) {
      const local = mediaProtocol.localPathFromButlerMedia(DATA_DIR, src);
      if (!local) return { ok: false, error: 'Cached media not found' };
      buffer = fs.readFileSync(local);
      const pathGuess = path.extname(local).replace('.', '');
      if (pathGuess) ext = pathGuess;
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await fetch(src);
      if (!res.ok) return { ok: false, error: `Download failed (${res.status})` };
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
      else if (ct.includes('webp')) ext = 'webp';
      else if (ct.includes('gif')) ext = 'gif';
      else if (ct.includes('png')) ext = 'png';
      else if (ct.includes('mp4')) ext = 'mp4';
      else if (ct.includes('webm')) ext = 'webm';
      else {
        const pathGuess = src.split('?')[0].split('.').pop();
        if (pathGuess && pathGuess.length <= 5) ext = pathGuess;
      }
      buffer = Buffer.from(await res.arrayBuffer());
    } else if (fs.existsSync(src)) {
      buffer = fs.readFileSync(src);
      const pathGuess = path.extname(src).replace('.', '');
      if (pathGuess) ext = pathGuess;
    } else {
      return { ok: false, error: 'Unsupported media source' };
    }

    const safeBase = title.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 40) || 'butler-media';
    const defaultName = `${safeBase}-${Date.now()}.${ext}`;

    let target;
    if (toDesktop) {
      target = path.join(app.getPath('desktop'), defaultName);
    } else {
      const { canceled, filePath } = await dialog.showSaveDialog(state.mainWindow || undefined, {
        title: 'Save media',
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        filters:
          kind === 'video'
            ? [
                { name: 'Video', extensions: ['mp4', 'webm', 'mov'] },
                { name: 'All', extensions: ['*'] },
              ]
            : [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
                { name: 'All', extensions: ['*'] },
              ],
      });
      if (canceled || !filePath) return { ok: false, cancelled: true };
      target = filePath;
    }

    fs.writeFileSync(target, buffer);
    return { ok: true, filePath: target };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

/**
 * Download remote media into Data/media-cache and return a butler-media: URL
 * (or a data: URL for modest images) so Display works with webSecurity on.
 */
ipcMain.handle('media:resolve', async (_e, payload) => {
  const src = String(payload?.src || '').trim();
  if (!src) return { ok: false, error: 'No source' };

  try {
    if (src.startsWith('data:')) return { ok: true, src, cached: false };
    if (src.startsWith('butler-media:')) {
      const local = mediaProtocol.localPathFromButlerMedia(DATA_DIR, src);
      if (!local) return { ok: false, error: 'Cached media not found', src };
      return { ok: true, src, cached: true, localPath: local };
    }
    if (src.startsWith('file:')) {
      return mediaProtocol.importLocalFile(DATA_DIR, mediaProtocol.fileUrlToPathSafe(src));
    }
    if (fs.existsSync(src)) {
      return mediaProtocol.importLocalFile(DATA_DIR, src);
    }

    if (!/^https?:\/\//i.test(src)) {
      return { ok: false, error: 'Not a remote URL' };
    }

    const cacheDir = mediaProtocol.cacheDir(DATA_DIR);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const crypto = require('crypto');
    const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 16);
    let ext = 'bin';
    const pathPart = src.split('?')[0];
    const m = /\.([a-z0-9]{2,5})$/i.exec(pathPart);
    if (m) ext = m[1].toLowerCase();

    const existing = fs.readdirSync(cacheDir).find((f) => f.startsWith(hash + '.'));
    if (existing && mediaProtocol.isSafeCacheName(existing)) {
      const full = path.join(cacheDir, existing);
      return cachedMediaResult(full, existing);
    }

    const res = await fetch(src, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      return { ok: false, error: `Download failed (${res.status})`, src };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
    else if (ct.includes('png')) ext = 'png';
    else if (ct.includes('webp')) ext = 'webp';
    else if (ct.includes('gif')) ext = 'gif';
    else if (ct.includes('mp4')) ext = 'mp4';
    else if (ct.includes('webm')) ext = 'webm';
    else if (ct.includes('html')) {
      return {
        ok: false,
        error: 'URL is a web page, not a direct image/video file',
        src,
        isPage: true,
      };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) return { ok: false, error: 'Empty download', src };

    const safeExt = String(ext).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const fileName = `${hash}.${safeExt}`;
    if (!mediaProtocol.isSafeCacheName(fileName)) {
      return { ok: false, error: 'Bad cache name', src };
    }
    const filePath = path.join(cacheDir, fileName);
    fs.writeFileSync(filePath, buf);
    return cachedMediaResult(filePath, fileName, buf);
  } catch (e) {
    return { ok: false, error: String(e?.message || e), src };
  }
});

function cachedMediaResult(filePath, fileName, buf) {
  const ext = path.extname(fileName).replace('.', '').toLowerCase();
  const body = buf || fs.readFileSync(filePath);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext) && body.length < 12_000_000) {
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'svg'
          ? 'image/svg+xml'
          : `image/${ext}`;
    return {
      ok: true,
      src: `data:${mime};base64,${body.toString('base64')}`,
      cached: true,
      localPath: filePath,
    };
  }
  return {
    ok: true,
    src: mediaProtocol.butlerMediaUrl(fileName),
    cached: true,
    localPath: filePath,
  };
}

ipcMain.handle('media:open-external', async (_e, url) => {
  const u = String(url || '');
  if (!u) return { ok: false };
  if (u.startsWith('butler-media:')) {
    const local = mediaProtocol.localPathFromButlerMedia(DATA_DIR, u);
    if (!local) return { ok: false };
    await shell.openPath(local);
    return { ok: true };
  }
  if (u.startsWith('http') || u.startsWith('file:') || u.startsWith('data:')) {
    // data: URLs: write temp and open
    if (u.startsWith('data:')) {
      try {
        const match = /^data:([^;]+);base64,(.+)$/i.exec(u);
        if (!match) return { ok: false };
        const ext = match[1].includes('png') ? 'png' : match[1].includes('jpeg') ? 'jpg' : 'bin';
        const tmp = path.join(DATA_DIR, 'tmp', `open-${Date.now()}.${ext}`);
        if (!fs.existsSync(path.dirname(tmp))) fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, Buffer.from(match[2], 'base64'));
        await shell.openPath(tmp);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
    await shell.openExternal(u);
    return { ok: true };
  }
  if (fs.existsSync(u)) {
    await shell.openPath(u);
    return { ok: true };
  }
  return { ok: false };
});

}

module.exports = { registerMediaIpc };
