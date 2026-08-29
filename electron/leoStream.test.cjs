'use strict';

/**
 * Node-only checks for progressive Leo TTS serving.
 * Does not call xAI and does not require Windows MediaPlayer.
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MIN_PLAY_BYTES,
  parseByteRange,
  createLeoDownloadState,
  writeStreamToGrowingFile,
  startLeoStreamServer,
  closeLeoStreamServer,
  buildLeoMediaPlayerScript,
} = require('./leoStream.cjs');

function tmpFile(name) {
  return path.join(os.tmpdir(), `butler-leo-${name}-${Date.now()}-${process.pid}.bin`);
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      const chunks = [];
      let receivedBeforeFinish = false;
      res.on('data', (c) => {
        chunks.push(c);
        if (typeof res._markBeforeFinish === 'function') {
          receivedBeforeFinish = res._markBeforeFinish();
        }
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

async function getWhileGrowing(url, state) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
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

async function writeSlowly(filePath, state, parts, gapMs) {
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

async function testParseRange() {
  assert.deepStrictEqual(parseByteRange(undefined), null);
  assert.deepStrictEqual(parseByteRange('bytes=0-'), { start: 0, end: null });
  assert.deepStrictEqual(parseByteRange('bytes=100-199'), { start: 100, end: 199 });
  assert.deepStrictEqual(parseByteRange('bytes=10-5'), null);
}

async function testProgressiveGet() {
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
    assert.strictEqual(result.status, 200);
    assert.match(String(result.headers['content-type']), /audio\/mpeg/);
    assert.strictEqual(result.body.length, first.length + rest.length);
    assert.ok(result.receivedBeforeFinish, 'HTTP body should start before the file is finished');
    assert.ok(first.equals(result.body.subarray(0, first.length)));
  } finally {
    closeLeoStreamServer(server);
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

async function testRangeWithLength() {
  const file = tmpFile('range');
  const payload = Buffer.from('abcdefghijklmnopqrstuvwxyz');
  fs.writeFileSync(file, payload);
  const state = createLeoDownloadState(payload.length);
  state.bytesWritten = payload.length;
  state.finished = true;
  const { server, url } = await startLeoStreamServer(file, state);
  try {
    const result = await httpGet(url, { Range: 'bytes=10-14' });
    assert.strictEqual(result.status, 206);
    assert.strictEqual(result.body.toString(), 'klmno');
    assert.match(String(result.headers['content-range']), /bytes 10-14\/26/);
  } finally {
    closeLeoStreamServer(server);
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

async function testAbortEndsGet() {
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
    assert.ok(result.body.length >= 1, 'should have flushed the first bytes');
    assert.ok(result.body.length <= first.length);
  } finally {
    closeLeoStreamServer(server);
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

async function testWriteStreamProgress() {
  const file = tmpFile('pipe');
  const state = createLeoDownloadState(null);
  const seen = [];
  async function* chunks() {
    yield Buffer.from('abc');
    yield Buffer.from('defgh');
  }
  await writeStreamToGrowingFile(chunks(), file, state, (n) => seen.push(n));
  assert.deepStrictEqual(seen, [3, 8]);
  assert.strictEqual(state.bytesWritten, 8);
  assert.strictEqual(state.finished, true);
  assert.strictEqual(fs.readFileSync(file).toString(), 'abcdefgh');
  fs.unlinkSync(file);
}

async function testPlayerScript() {
  const ps = buildLeoMediaPlayerScript('http://127.0.0.1:9/leo.mp3');
  assert.match(ps, /LEO_PLAY_START/);
  assert.match(ps, /\$mp\.Play\(\)/);
  assert.match(ps, /Position\.TotalMilliseconds -le 0/);
  const playAt = ps.indexOf('$mp.Play()');
  const startAt = ps.indexOf("WriteLine('LEO_PLAY_START')");
  const durWait = ps.indexOf('while (-not $mp.NaturalDuration.HasTimeSpan)');
  assert.ok(playAt >= 0 && startAt > playAt, 'Play must happen before LEO_PLAY_START');
  assert.ok(durWait > startAt, 'NaturalDuration wait must be after audio start, not a pre-Play gate');
  assert.ok(!/ElapsedMilliseconds -gt 8000/.test(ps), 'old 8s pre-Play duration gate must be gone');
}

(async () => {
  await testParseRange();
  await testWriteStreamProgress();
  await testPlayerScript();
  await testProgressiveGet();
  await testRangeWithLength();
  await testAbortEndsGet();
  console.log('leoStream tests ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
