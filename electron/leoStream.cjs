'use strict';

/**
 * Progressive Leo TTS helper: write a growing MP3 and serve it on 127.0.0.1
 * so Windows MediaPlayer can start before the full file is on disk.
 * Do not switch this path to Chromium HTMLAudioElement (autoplay / silence bugs).
 */

const http = require('http');
const fs = require('fs');
const { Readable } = require('stream');

/** Start MediaPlayer once this many bytes are on disk (header + a few frames). */
const MIN_PLAY_BYTES = 4 * 1024;
/** Reject empty / truncated TTS bodies. */
const MIN_AUDIO_BYTES = 100;

function parseByteRange(header) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(String(header).trim());
  if (!m) return null;
  const start = m[1] === '' ? 0 : Number(m[1]);
  const end = m[2] === '' ? null : Number(m[2]);
  if (!Number.isFinite(start) || start < 0) return null;
  if (end != null && (!Number.isFinite(end) || end < start)) return null;
  return { start, end };
}

function createLeoDownloadState(contentLength) {
  const n = Number(contentLength);
  return {
    bytesWritten: 0,
    finished: false,
    aborted: false,
    contentLength: Number.isFinite(n) && n > 0 ? n : null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBytes(state, minBytes, timeoutMs) {
  const started = Date.now();
  while (!state.aborted && !state.finished && state.bytesWritten < minBytes) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Leo audio stream timed out');
    }
    await sleep(15);
  }
}

function readSliceSync(filePath, start, length) {
  if (length <= 0) return Buffer.alloc(0);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(Math.min(length, 64 * 1024));
    const n = fs.readSync(fd, buf, 0, buf.length, start);
    return n === buf.length ? buf : buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

async function pipeGrowingFile(filePath, res, startOffset, endInclusive, state) {
  let offset = startOffset;
  const maxEnd = endInclusive == null ? Infinity : endInclusive + 1;

  while (!res.destroyed && !state.aborted && offset < maxEnd) {
    const available = state.bytesWritten;
    if (offset < available) {
      const want = Math.min(64 * 1024, available - offset, maxEnd - offset);
      let chunk;
      try {
        chunk = readSliceSync(filePath, offset, want);
      } catch {
        break;
      }
      if (chunk.length === 0) {
        await sleep(15);
        continue;
      }
      offset += chunk.length;
      if (!res.write(chunk)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
      continue;
    }
    if (state.finished || state.aborted) break;
    await sleep(15);
  }
  if (!res.writableEnded) res.end();
}

function asAsyncIterable(readable) {
  if (!readable) throw new Error('Leo TTS returned no body');
  if (typeof readable[Symbol.asyncIterator] === 'function') return readable;
  if (typeof readable.getReader === 'function') return Readable.fromWeb(readable);
  throw new Error('Leo TTS body is not readable');
}

/**
 * Write a web/Node readable stream to `filePath`, updating `state.bytesWritten`
 * so the HTTP server can feed MediaPlayer before the download finishes.
 */
async function writeStreamToGrowingFile(readable, filePath, state, onProgress) {
  const fd = fs.openSync(filePath, 'w');
  try {
    for await (const chunk of asAsyncIterable(readable)) {
      if (state.aborted) break;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      try {
        fs.writeSync(fd, buf, 0, buf.length, state.bytesWritten);
      } catch (err) {
        if (state.aborted) break;
        throw err;
      }
      state.bytesWritten += buf.length;
      if (onProgress) onProgress(state.bytesWritten);
    }
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
    state.finished = true;
  }
}

function startLeoStreamServer(filePath, state) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = String(req.url || '/').split('?')[0];
      if (urlPath !== '/' && urlPath !== '/leo.mp3') {
        res.writeHead(404);
        res.end();
        return;
      }

      const serve = async () => {
        await waitForBytes(state, 1, 120000);
        if (state.aborted) {
          if (!res.headersSent) res.writeHead(503);
          res.end();
          return;
        }

        const total =
          state.contentLength != null
            ? state.contentLength
            : state.finished
              ? state.bytesWritten
              : null;

        const range = parseByteRange(req.headers.range);
        const headers = {
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          Connection: 'close',
        };

        if (range && total != null && range.start < total) {
          const safeEnd =
            range.end == null ? total - 1 : Math.min(range.end, total - 1);
          headers['Content-Range'] = `bytes ${range.start}-${safeEnd}/${total}`;
          headers['Content-Length'] = String(safeEnd - range.start + 1);
          res.writeHead(206, headers);
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          await pipeGrowingFile(filePath, res, range.start, safeEnd, state);
          return;
        }

        if (total != null) headers['Content-Length'] = String(total);
        const startAt = range && total == null ? range.start : 0;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        await pipeGrowingFile(filePath, res, startAt, total != null ? total - 1 : null, state);
      };

      serve().catch(() => {
        if (!res.writableEnded) {
          try {
            res.end();
          } catch {
            /* ignore */
          }
        }
      });
    });

    server.requestTimeout = 0;
    server.headersTimeout = 0;
    server.timeout = 0;
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}/leo.mp3`,
      });
    });
  });
}

function closeLeoStreamServer(server) {
  if (!server) return;
  try {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
  } catch {
    /* ignore */
  }
  try {
    server.close();
  } catch {
    /* ignore */
  }
}

/**
 * WPF MediaPlayer script. Play as soon as the source moves — do not block on
 * NaturalDuration (that wait was up to 8s of silence after the file was ready).
 * LEO_PLAY_START is printed only when Position advances (actual audio).
 */
function buildLeoMediaPlayerScript(audioUrl) {
  const uri = String(audioUrl).replace(/'/g, "''");
  return `
Add-Type -AssemblyName PresentationCore
$mp = New-Object System.Windows.Media.MediaPlayer
$mp.Volume = 1.0
$mp.Open([Uri]'${uri}')
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($mp.Position.TotalMilliseconds -le 0) {
  $mp.Play()
  Start-Sleep -Milliseconds 20
  if ($sw.ElapsedMilliseconds -gt 60000) { throw 'Leo audio failed to start' }
}
[Console]::Out.WriteLine('LEO_PLAY_START')
[Console]::Out.Flush()
while (-not $mp.NaturalDuration.HasTimeSpan) {
  Start-Sleep -Milliseconds 50
  if ($sw.ElapsedMilliseconds -gt 180000) { break }
}
if ($mp.NaturalDuration.HasTimeSpan) {
  $left = $mp.NaturalDuration.TimeSpan.TotalMilliseconds - $mp.Position.TotalMilliseconds
  if ($left -gt 0) { Start-Sleep -Milliseconds ([Math]::Ceiling($left) + 150) }
} else {
  $last = -1.0
  $stall = 0
  while ($stall -lt 12) {
    Start-Sleep -Milliseconds 100
    $p = $mp.Position.TotalMilliseconds
    if ([Math]::Abs($p - $last) -lt 1) { $stall++ } else { $stall = 0 }
    $last = $p
  }
}
$mp.Close()
`.trim();
}

module.exports = {
  MIN_PLAY_BYTES,
  MIN_AUDIO_BYTES,
  parseByteRange,
  createLeoDownloadState,
  writeStreamToGrowingFile,
  startLeoStreamServer,
  closeLeoStreamServer,
  buildLeoMediaPlayerScript,
};
