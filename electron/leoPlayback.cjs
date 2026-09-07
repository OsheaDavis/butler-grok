const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  MIN_PLAY_BYTES,
  MIN_AUDIO_BYTES,
  createLeoDownloadState,
  writeStreamToGrowingFile,
  startLeoStreamServer,
  closeLeoStreamServer,
  buildLeoMediaPlayerScript,
} = require('./leoStream.cjs');
const xaiMain = require('./xaiMain.cjs');
const { DATA_DIR, broadcastAll } = require('./appContext.cjs');

function registerLeoIpc() {
/** @type {import('child_process').ChildProcess | null} */
let leoPlayerProc = null;
let leoTempFile = null;
/** When true, killing the player is intentional (Stop voice) — not a failure. */
let leoStopRequested = false;
/** Bumped on each leo:speak so a replaced clip does not fall through to Windows TTS. */
let leoSpeakEpoch = 0;
/** @type {AbortController | null} */
let leoAbortController = null;
/** @type {import('http').Server | null} */
let leoStreamServer = null;
/** @type {{ aborted?: boolean } | null} */
let leoStreamState = null;

function stopLeoPlaybackMain(opts = {}) {
  const userStop = Boolean(opts.userStop);
  const hadPlayer = Boolean(leoPlayerProc && !leoPlayerProc.killed);
  if (userStop) leoStopRequested = true;
  if (leoStreamState) leoStreamState.aborted = true;
  if (leoAbortController) {
    try {
      leoAbortController.abort();
    } catch {
      /* ignore */
    }
    leoAbortController = null;
  }
  closeLeoStreamServer(leoStreamServer);
  leoStreamServer = null;
  if (leoPlayerProc && !leoPlayerProc.killed) {
    try {
      leoPlayerProc.kill();
    } catch {
      /* ignore */
    }
  }
  leoPlayerProc = null;
  if (leoTempFile && fs.existsSync(leoTempFile)) {
    try {
      fs.unlinkSync(leoTempFile);
    } catch {
      /* ignore */
    }
  }
  leoTempFile = null;
  // Only notify UI if something was playing or user hit Stop (not pre-clear before a new speak)
  if (hadPlayer || userStop) {
    try {
      broadcastAll('leo:audio', { phase: 'end', cancelled: userStop });
    } catch {
      /* ignore */
    }
  }
}

function spawnLeoMediaPlayer(audioUrl, file, epoch) {
  const ps = buildLeoMediaPlayerScript(audioUrl);
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true }
    );
    leoPlayerProc = child;
    let err = '';
    let started = false;
    child.stdout.on('data', (d) => {
      const s = d.toString();
      if (!started && s.includes('LEO_PLAY_START')) {
        started = true;
        broadcastAll('leo:audio', { phase: 'start' });
      }
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      if (epoch !== leoSpeakEpoch) {
        resolve({ ok: true, cancelled: true });
        return;
      }
      broadcastAll('leo:audio', { phase: 'end', error: String(e.message || e) });
      resolve({ ok: false, error: String(e.message || e) });
    });
    child.on('close', (code) => {
      if (leoPlayerProc === child) leoPlayerProc = null;
      closeLeoStreamServer(leoStreamServer);
      if (leoStreamServer) leoStreamServer = null;
      try {
        if (file && fs.existsSync(file)) fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
      if (leoTempFile === file) leoTempFile = null;
      if (epoch !== leoSpeakEpoch) {
        resolve({ ok: true, cancelled: true });
        return;
      }
      // User hit Stop voice — success path, do NOT fall back to Windows TTS
      if (leoStopRequested) {
        leoStopRequested = false;
        broadcastAll('leo:audio', { phase: 'end', cancelled: true });
        resolve({ ok: true, cancelled: true });
        return;
      }
      broadcastAll('leo:audio', { phase: 'end', cancelled: false });
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: err.trim() || `Player exited ${code}` });
    });
  });
}

/**
 * Fetch Leo TTS in the main process and play with Windows MediaPlayer.
 * Streams bytes to a localhost progressive URL so playback can start before
 * the full MP3 is on disk. Uses the key stored in safeStorage — renderer
 * must not pass a Bearer token. Avoids Chromium HTMLAudioElement.
 */
ipcMain.handle('leo:speak', async (_e, payload) => {
  const text = String(payload?.text || '')
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]{0,40})\]\([^)]+\)/g, '$1')
    .trim()
    .slice(0, 4000);

  if (!text) return { ok: false, error: 'Nothing to speak' };

  const epoch = ++leoSpeakEpoch;
  // Stop any previous clip without treating it as a user "Stop voice"
  leoStopRequested = false;
  stopLeoPlaybackMain({ userStop: false });

  const ac = new AbortController();
  leoAbortController = ac;

  try {
    const tts = await xaiMain.openLeoTtsStream(text, ac.signal);
    if (!tts.ok) {
      if (tts.aborted || leoStopRequested || epoch !== leoSpeakEpoch) {
        return { ok: true, cancelled: true };
      }
      return { ok: false, error: tts.error };
    }
    const res = tts.response;

    if (leoStopRequested || epoch !== leoSpeakEpoch) {
      return { ok: true, cancelled: true };
    }

    const clHeader = res.headers.get('content-length');
    const contentLength = clHeader ? Number(clHeader) : null;
    const state = createLeoDownloadState(contentLength);
    leoStreamState = state;

    const tmpDir = path.join(DATA_DIR, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const file = path.join(tmpDir, `leo-${Date.now()}.mp3`);
    fs.writeFileSync(file, Buffer.alloc(0));
    leoTempFile = file;

    let streamUrl = null;
    try {
      const started = await startLeoStreamServer(file, state);
      leoStreamServer = started.server;
      streamUrl = started.url;
    } catch {
      streamUrl = null;
    }

    const playUrl = streamUrl || `file:///${file.replace(/\\/g, '/')}`;
    /** @type {Promise<{ ok: boolean, cancelled?: boolean, error?: string }> | null} */
    let playerPromise = null;
    const startPlayer = () => {
      if (playerPromise || state.aborted || leoStopRequested || epoch !== leoSpeakEpoch) {
        return;
      }
      playerPromise = spawnLeoMediaPlayer(playUrl, file, epoch);
    };

    await writeStreamToGrowingFile(res.body, file, state, (bytes) => {
      if (streamUrl && bytes >= MIN_PLAY_BYTES) startPlayer();
    });

    if (leoStopRequested || state.aborted || epoch !== leoSpeakEpoch) {
      return { ok: true, cancelled: true };
    }
    if (state.bytesWritten < MIN_AUDIO_BYTES) {
      stopLeoPlaybackMain();
      return { ok: false, error: 'Leo TTS returned empty audio' };
    }

    startPlayer();
    if (!playerPromise) {
      stopLeoPlaybackMain();
      return { ok: false, error: 'Leo audio player did not start' };
    }
    return await playerPromise;
  } catch (e) {
    if (leoStopRequested || epoch !== leoSpeakEpoch || e?.name === 'AbortError') {
      leoStopRequested = false;
      return { ok: true, cancelled: true };
    }
    stopLeoPlaybackMain();
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('leo:stop', async () => {
  stopLeoPlaybackMain({ userStop: true });
  return { ok: true, cancelled: true };
});

}

module.exports = { registerLeoIpc };
