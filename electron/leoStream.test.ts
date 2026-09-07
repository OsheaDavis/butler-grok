/**
 * Progressive Leo TTS serving — no xAI call, no Windows MediaPlayer.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  MIN_PLAY_BYTES,
  parseByteRange,
  createLeoDownloadState,
  writeStreamToGrowingFile,
  startLeoStreamServer,
  closeLeoStreamServer,
  buildLeoMediaPlayerScript,
} = require('./leoStream.cjs') as {
  MIN_PLAY_BYTES: number;
  parseByteRange: (header: string | undefined) => { start: number; end: number | null } | null;
  createLeoDownloadState: (contentLength: number | null) => {
    bytesWritten: number;
    finished: boolean;
    aborted: boolean;
  };
  writeStreamToGrowingFile: (
    chunks: AsyncIterable<Buffer>,
    file: string,
    state: { bytesWritten: number; finished: boolean },
    onProgress?: (n: number) => void
  ) => Promise<void>;
  startLeoStreamServer: (
    file: string,
    state: { bytesWritten: number; finished: boolean; aborted?: boolean }
  ) => Promise<{ server: { close: () => void }; url: string }>;
  closeLeoStreamServer: (server: { close: () => void }) => void;
  buildLeoMediaPlayerScript: (url: string) => string;
};

function tmpFile(name: string) {
  return path.join(os.tmpdir(), `butler-leo-${name}-${Date.now()}-${process.pid}.bin`);
}

function httpGet(url: string, headers: Record<string, string> = {}) {
  return new Promise<{
    status: number | undefined;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function getWhileGrowing(
  url: string,
  state: { finished: boolean }
) {
  return new Promise<{
    status: number | undefined;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
    receivedBeforeFinish: boolean;
  }>((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      let receivedBeforeFinish = false;
      res.on('data', (c) => {
        chunks.push(c);
        if (!state.finished) receivedBeforeFinish = true;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
          receivedBeforeFinish,
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function writeSlowly(
  filePath: string,
  state: { bytesWritten: number; finished: boolean },
  parts: Buffer[],
  gapMs: number
) {
  const fd = fs.openSync(filePath, 'w');
  try {
    for (const part of parts) {
      fs.writeSync(fd, part, 0, part.length, state.bytesWritten);
      state.bytesWritten += part.length;
      await new Promise((r) => setTimeout(r, gapMs));
    }
  } finally {
    fs.closeSync(fd);
    state.finished = true;
  }
}

describe('parseByteRange', () => {
  it('parses open-ended and closed ranges, and rejects inverted ones', () => {
    expect(parseByteRange(undefined)).toBeNull();
    expect(parseByteRange('bytes=0-')).toEqual({ start: 0, end: null });
    expect(parseByteRange('bytes=100-199')).toEqual({ start: 100, end: 199 });
    expect(parseByteRange('bytes=10-5')).toBeNull();
  });
});

describe('writeStreamToGrowingFile', () => {
  it('reports growing byte counts and finishes the file', async () => {
    const file = tmpFile('pipe');
    const state = createLeoDownloadState(null);
    const seen: number[] = [];
    async function* chunks() {
      yield Buffer.from('abc');
      yield Buffer.from('defgh');
    }
    await writeStreamToGrowingFile(chunks(), file, state, (n) => seen.push(n));
    expect(seen).toEqual([3, 8]);
    expect(state.bytesWritten).toBe(8);
    expect(state.finished).toBe(true);
    expect(fs.readFileSync(file).toString()).toBe('abcdefgh');
    fs.unlinkSync(file);
  });
});

describe('buildLeoMediaPlayerScript', () => {
  it('plays before LEO_PLAY_START and does not gate on NaturalDuration first', () => {
    const ps = buildLeoMediaPlayerScript('http://127.0.0.1:9/leo.mp3');
    expect(ps).toMatch(/LEO_PLAY_START/);
    expect(ps).toMatch(/\$mp\.Play\(\)/);
    expect(ps).toMatch(/Position\.TotalMilliseconds -le 0/);
    const playAt = ps.indexOf('$mp.Play()');
    const startAt = ps.indexOf("WriteLine('LEO_PLAY_START')");
    const durWait = ps.indexOf('while (-not $mp.NaturalDuration.HasTimeSpan)');
    expect(playAt).toBeGreaterThanOrEqual(0);
    expect(startAt).toBeGreaterThan(playAt);
    expect(durWait).toBeGreaterThan(startAt);
    expect(/ElapsedMilliseconds -gt 8000/.test(ps)).toBe(false);
  });
});

describe('startLeoStreamServer', () => {
  it('starts sending the HTTP body before the growing file is finished', async () => {
    const file = tmpFile('grow');
    fs.writeFileSync(file, Buffer.alloc(0));
    const state = createLeoDownloadState(null);
    const { server, url } = await startLeoStreamServer(file, state);
    try {
      const first = Buffer.alloc(2048, 1);
      const rest = Buffer.alloc(MIN_PLAY_BYTES, 2);
      const pending = getWhileGrowing(url, state);
      await writeSlowly(file, state, [first, rest], 40);
      const result = await pending;
      expect(result.status).toBe(200);
      expect(String(result.headers['content-type'])).toMatch(/audio\/mpeg/);
      expect(result.body.length).toBe(first.length + rest.length);
      expect(result.receivedBeforeFinish).toBe(true);
      expect(first.equals(result.body.subarray(0, first.length))).toBe(true);
    } finally {
      closeLeoStreamServer(server);
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  });

  it('serves a finished Range request as 206', async () => {
    const file = tmpFile('range');
    const payload = Buffer.from('abcdefghijklmnopqrstuvwxyz');
    fs.writeFileSync(file, payload);
    const state = createLeoDownloadState(payload.length);
    state.bytesWritten = payload.length;
    state.finished = true;
    const { server, url } = await startLeoStreamServer(file, state);
    try {
      const result = await httpGet(url, { Range: 'bytes=10-14' });
      expect(result.status).toBe(206);
      expect(result.body.toString()).toBe('klmno');
      expect(String(result.headers['content-range'])).toMatch(/bytes 10-14\/26/);
    } finally {
      closeLeoStreamServer(server);
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  });

  it('ends an in-flight GET when the download is aborted', async () => {
    const file = tmpFile('abort');
    fs.writeFileSync(file, Buffer.alloc(0));
    const state = createLeoDownloadState(null);
    const { server, url } = await startLeoStreamServer(file, state);
    try {
      const pending = getWhileGrowing(url, state);
      const first = Buffer.alloc(512, 7);
      const fd = fs.openSync(file, 'w');
      fs.writeSync(fd, first, 0, first.length, 0);
      state.bytesWritten = first.length;
      fs.closeSync(fd);
      await new Promise((r) => setTimeout(r, 30));
      state.aborted = true;
      state.finished = true;
      const result = await pending;
      expect(result.body.length).toBeGreaterThanOrEqual(1);
      expect(result.body.length).toBeLessThanOrEqual(first.length);
    } finally {
      closeLeoStreamServer(server);
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  });
});
