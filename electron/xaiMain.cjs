const { getApiKey } = require('./secrets.cjs');

const XAI_BASE = 'https://api.x.ai/v1';
const MODEL_CANDIDATES = ['grok-4.5', 'grok-4', 'grok-3', 'grok-2-latest'];
const IMAGE_MODELS = ['grok-imagine-image-quality', 'grok-imagine-image'];
const ROLES = new Set(['system', 'user', 'assistant']);
const MAX_MESSAGES = 64;
const MAX_CONTENT = 200_000;
const MAX_PROMPT = 8_000;
const MAX_STT_BYTES = 20 * 1024 * 1024;

function noKeyError(kind) {
  if (kind === 'stt') return { ok: false, error: 'No API key for speech recognition.' };
  if (kind === 'test') return { ok: false, message: 'No API key provided.' };
  return { ok: false, error: 'No API key. Add one in Settings (Mode B or C).' };
}

function validateMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of raw) {
    const role = m && m.role;
    if (!ROLES.has(role)) return null;
    const content = String(m.content ?? '');
    if (content.length > MAX_CONTENT) return null;
    out.push({ role, content });
  }
  return out;
}

function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data);
  return null;
}

async function testStoredKey() {
  const key = getApiKey();
  if (!key) return noKeyError('test');
  try {
    const res = await fetch(`${XAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { ok: true, message: 'Connected to xAI — API key works.' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Key rejected (unauthorized). Check the key in your xAI console.' };
    }
    const text = await res.text();
    return { ok: false, message: `xAI responded ${res.status}: ${text.slice(0, 120)}` };
  } catch (err) {
    return { ok: false, message: `Network error: ${String(err)}` };
  }
}

/**
 * Stream chat completions. onReasoning/onContent receive (full, delta).
 */
async function chatCompletionStream(opts) {
  const key = getApiKey();
  if (!key) return noKeyError('chat');

  const messages = validateMessages(opts.messages);
  if (!messages) return { ok: false, error: 'Invalid chat messages.' };

  const requested = typeof opts.model === 'string' ? opts.model.trim() : '';
  const models =
    requested && MODEL_CANDIDATES.includes(requested)
      ? [requested, ...MODEL_CANDIDATES.filter((m) => m !== requested)]
      : MODEL_CANDIDATES;

  let lastError = 'Unknown error';
  const signal = opts.signal;

  for (const model of models) {
    try {
      const res = await fetch(`${XAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          stream: true,
        }),
        signal,
      });

      if (!res.ok) {
        const body = await res.text();
        lastError = `${res.status} (${model}): ${body.slice(0, 200)}`;
        if (res.status === 404 || /model/i.test(body)) continue;
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: 'API key unauthorized. Check Settings.' };
        }
        continue;
      }

      if (!res.body) {
        lastError = 'No stream body from API.';
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let thinking = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices && json.choices[0] && json.choices[0].delta;
            if (!delta) continue;
            const r = delta.reasoning_content || delta.reasoning || '';
            const c = delta.content || '';
            if (r) {
              thinking += r;
              if (opts.onReasoning) opts.onReasoning(thinking, r);
            }
            if (c) {
              content += c;
              if (opts.onContent) opts.onContent(content, c);
            }
          } catch {
            /* skip partial JSON */
          }
        }
      }

      if (!content.trim() && !thinking.trim()) {
        lastError = 'Empty stream from model.';
        continue;
      }
      return {
        ok: true,
        content: content.trim() || thinking.trim(),
        thinking: thinking.trim(),
        model,
      };
    } catch (err) {
      if (signal && signal.aborted) {
        return { ok: false, error: 'Cancelled' };
      }
      lastError = String(err);
    }
  }

  return { ok: false, error: lastError };
}

async function generateImage(promptRaw) {
  const key = getApiKey();
  if (!key) return noKeyError('image');
  const p = String(promptRaw || '').trim();
  if (!p) return { ok: false, error: 'Empty image prompt.' };
  if (p.length > MAX_PROMPT) return { ok: false, error: 'Image prompt too long.' };

  let lastError = 'Unknown error';
  for (const model of IMAGE_MODELS) {
    try {
      const res = await fetch(`${XAI_BASE}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: p,
          n: 1,
          response_format: 'url',
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        lastError = `${res.status} (${model}): ${body.slice(0, 180)}`;
        if (res.status === 404) continue;
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            error: 'API key not allowed for image generation. Check xAI console permissions.',
          };
        }
        continue;
      }
      const data = await res.json();
      const first = data && data.data && data.data[0];
      if (first && first.url) return { ok: true, url: first.url, model };
      if (first && first.b64_json) {
        return { ok: true, url: `data:image/png;base64,${first.b64_json}`, model };
      }
      lastError = 'Empty image response.';
    } catch (e) {
      lastError = String(e);
    }
  }
  return { ok: false, error: lastError };
}

async function transcribe(payload) {
  const key = getApiKey();
  if (!key) return noKeyError('stt');
  const buf = toBuffer(payload && payload.data);
  if (!buf || buf.length < 200) return { ok: false, error: 'Recording too short — try again.' };
  if (buf.length > MAX_STT_BYTES) return { ok: false, error: 'Recording too large.' };

  const mime = String((payload && payload.mime) || 'audio/webm').slice(0, 80);
  const filename =
    String((payload && payload.filename) || 'speech.webm').replace(/[^\w.-]/g, '') || 'speech.webm';

  try {
    const form = new FormData();
    form.append('language', 'en');
    form.append('format', 'true');
    const blob = new Blob([buf], { type: mime });
    form.append('file', blob, filename);

    const res = await fetch(`${XAI_BASE}/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Speech-to-text failed (${res.status}): ${body.slice(0, 140)}` };
    }

    const data = await res.json();
    const text = String((data && data.text) || '').trim();
    if (!text) return { ok: false, error: 'No speech detected — try again a bit louder.' };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `Mic/network error: ${String(e)}` };
  }
}

/**
 * Open a Leo TTS HTTP stream. Caller must consume `response.body` progressively.
 * Do not buffer the whole MP3 here — that kills first-audio latency.
 */
async function openLeoTtsStream(textRaw, signal) {
  const key = getApiKey();
  if (!key) return { ok: false, error: 'No API key' };
  const text = String(textRaw || '')
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]{0,40})\]\([^)]+\)/g, '$1')
    .trim()
    .slice(0, 4000);
  if (!text) return { ok: false, error: 'Nothing to speak' };

  try {
    const res = await fetch(`${XAI_BASE}/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        text,
        voice_id: 'leo',
        language: 'en',
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `TTS ${res.status}: ${body.slice(0, 160)}` };
    }
    if (!res.body) return { ok: false, error: 'Leo TTS returned no stream' };
    return { ok: true, response: res };
  } catch (e) {
    if (e && (e.name === 'AbortError' || signal?.aborted)) {
      return { ok: false, aborted: true, error: 'Cancelled' };
    }
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = {
  testStoredKey,
  chatCompletionStream,
  generateImage,
  transcribe,
  openLeoTtsStream,
};
