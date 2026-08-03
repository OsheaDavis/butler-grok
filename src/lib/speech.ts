/** System speech synthesis fallback when Leo TTS is unavailable. */
export function speakText(
  text: string,
  opts?: { onEnd?: () => void; onStart?: () => void }
): boolean {
  if (!('speechSynthesis' in window)) {
    opts?.onEnd?.();
    return false;
  }
  const clean = text.replace(/\*\*/g, '').replace(/#{1,6}\s/g, '').slice(0, 800);
  if (!clean.trim()) {
    opts?.onEnd?.();
    return false;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1;
  u.onstart = () => opts?.onStart?.();
  u.onend = () => opts?.onEnd?.();
  u.onerror = () => opts?.onEnd?.();
  window.speechSynthesis.speak(u);
  return true;
}

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((ev: {
        results: {
          [i: number]: { [j: number]: { transcript: string }; isFinal?: boolean; length: number };
          length: number;
        };
        length: number;
      }) => void)
    | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Web Speech API mic → text (often broken in Electron; prefer xAI STT). */
export function startDictation(opts: {
  onText: (text: string, isFinal: boolean) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
}): { stop: () => void } | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) {
    opts.onError?.('Speech recognition not available in this environment.');
    return null;
  }
  const rec = new SR();
  rec.lang = 'en-US';
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (ev) => {
    let text = '';
    let isFinal = false;
    for (let i = 0; i < ev.results.length; i++) {
      text += ev.results[i][0]?.transcript || '';
      if (ev.results[i].isFinal) isFinal = true;
    }
    opts.onText(text, isFinal);
  };
  rec.onerror = (ev) => {
    opts.onError?.(ev.error || 'mic error');
  };
  rec.onend = () => opts.onEnd?.();
  try {
    rec.start();
  } catch (e) {
    opts.onError?.(String(e));
    return null;
  }
  return { stop: () => rec.stop() };
}

const XAI_STT = 'https://api.x.ai/v1/stt';

/** Transcribe a recorded audio blob with xAI Speech-to-Text. */
export async function transcribeWithXai(
  apiKey: string,
  blob: Blob,
  filename = 'speech.webm'
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: 'No API key for speech recognition.' };
  if (!blob || blob.size < 200) return { ok: false, error: 'Recording too short — try again.' };

  try {
    const form = new FormData();
    form.append('language', 'en');
    form.append('format', 'true');
    // file must be last per xAI STT docs
    form.append('file', blob, filename);

    const res = await fetch(XAI_STT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Speech-to-text failed (${res.status}): ${body.slice(0, 140)}` };
    }

    const data = (await res.json()) as { text?: string };
    const text = (data.text || '').trim();
    if (!text) return { ok: false, error: 'No speech detected — try again a bit louder.' };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `Mic/network error: ${String(e)}` };
  }
}

function pickRecorderMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

/**
 * Open a mic stream. Tries default, then each listed audioinput device.
 * Throws a friendly Error if Windows reports no capture device.
 */
async function openMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone API not available in this app.');
  }

  // Unlock device labels (and ensure device list is fresh)
  try {
    await navigator.mediaDevices.enumerateDevices();
  } catch {
    /* ignore */
  }

  const attempts: MediaStreamConstraints[] = [
    {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    },
    { audio: true },
  ];

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === 'audioinput' && d.deviceId);
    for (const mic of mics) {
      attempts.push({
        audio: {
          deviceId: { exact: mic.deviceId },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    }
  } catch {
    /* ignore enumeration failures */
  }

  let lastErr: unknown = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
    }
  }

  const name = lastErr && typeof lastErr === 'object' && 'name' in lastErr ? String((lastErr as { name: string }).name) : '';
  if (name === 'NotFoundError' || String(lastErr).includes('Requested device not found')) {
    throw new Error(
      'No working microphone found. Windows only sees speakers right now (JBL/MOTU mics show as offline). Plug in a USB mic or headset, enable the JBL/Bluetooth mic, then check Windows Settings → Privacy → Microphone, and try Speak again.'
    );
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    throw new Error(
      'Microphone blocked. Allow mic access for Butler Grok in Windows Settings → Privacy → Microphone, then restart the app.'
    );
  }
  throw new Error(lastErr ? String(lastErr) : 'Could not open microphone.');
}

/**
 * Push-to-talk mic recorder for Electron.
 * Call start → user speaks → call stop() → resolves with audio Blob.
 */
export async function startMicRecording(): Promise<{
  stop: () => Promise<Blob>;
  cancel: () => void;
}> {
  const stream = await openMicStream();

  const mime = pickRecorderMime();
  const chunks: BlobPart[] = [];
  const recorder = mime
    ? new MediaRecorder(stream, { mimeType: mime })
    : new MediaRecorder(stream);

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  let resolveStop: ((b: Blob) => void) | null = null;
  let rejectStop: ((e: Error) => void) | null = null;
  let stopped = false;

  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const type = recorder.mimeType || mime || 'audio/webm';
    const blob = new Blob(chunks, { type });
    resolveStop?.(blob);
  };

  recorder.onerror = () => {
    stream.getTracks().forEach((t) => t.stop());
    rejectStop?.(new Error('Recording failed.'));
  };

  recorder.start(200);

  const stop = () =>
    new Promise<Blob>((resolve, reject) => {
      if (stopped) {
        resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        return;
      }
      stopped = true;
      resolveStop = resolve;
      rejectStop = reject;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        else {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        }
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

  const cancel = () => {
    stopped = true;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
  };

  return { stop, cancel };
}

export function recorderExtension(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'speech.m4a';
  if (mimeType.includes('ogg')) return 'speech.ogg';
  return 'speech.webm';
}
