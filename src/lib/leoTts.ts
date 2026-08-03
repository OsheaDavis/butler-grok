const XAI_TTS = 'https://api.x.ai/v1/tts';

let currentAudio: HTMLAudioElement | null = null;

export function stopLeoAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (window.butler?.leoStop) {
    void window.butler.leoStop();
  }
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Speak with xAI Grok TTS voice **leo**.
 * Prefers Electron main-process playback (Windows MediaPlayer).
 * onStart fires only when audio actually begins (not during TTS download).
 */
export async function speakWithLeo(
  apiKey: string,
  text: string,
  opts?: { onStart?: () => void; onEnd?: () => void; onError?: (msg: string) => void }
): Promise<{ ok: true; cancelled?: boolean } | { ok: false; error: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: 'No API key' };

  const clean = text
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]{0,40})\]\([^)]+\)/g, '$1')
    .trim()
    .slice(0, 4000);

  if (!clean) {
    opts?.onEnd?.();
    return { ok: false, error: 'Nothing to speak' };
  }

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }

  // --- Preferred path: Electron main process ---
  if (window.butler?.leoSpeak) {
    let started = false;
    let endNotified = false;
    const notifyEnd = () => {
      if (endNotified) return;
      endNotified = true;
      opts?.onEnd?.();
    };
    const unsub = window.butler.onLeoAudio?.((p) => {
      if (p?.phase === 'start' && !started) {
        started = true;
        opts?.onStart?.();
      }
      // End after we actually started (ignore pre-clear noise)
      if (p?.phase === 'end' && started) {
        notifyEnd();
      }
    });

    try {
      // Do NOT call onStart here — wait for LEO_PLAY_START from main
      const r = await window.butler.leoSpeak(key, clean);
      unsub?.();
      if (r.ok) {
        notifyEnd();
        return { ok: true, cancelled: Boolean(r.cancelled) };
      }
      opts?.onError?.(r.error);
      notifyEnd();
      return { ok: false, error: r.error };
    } catch (e) {
      unsub?.();
      const err = String(e);
      if (/abort|cancel|kill|SIG/i.test(err)) {
        notifyEnd();
        return { ok: true, cancelled: true };
      }
      opts?.onError?.(err);
      notifyEnd();
      return { ok: false, error: err };
    }
  }

  // --- Browser / non-Electron fallback ---
  try {
    const res = await fetch(XAI_TTS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: clean,
        voice_id: 'leo',
        language: 'en',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err = `TTS ${res.status}: ${body.slice(0, 160)}`;
      opts?.onError?.(err);
      opts?.onEnd?.();
      return { ok: false, error: err };
    }

    const raw = await res.arrayBuffer();
    if (raw.byteLength < 100) {
      const err = 'Leo TTS returned empty audio';
      opts?.onError?.(err);
      opts?.onEnd?.();
      return { ok: false, error: err };
    }

    const blob = new Blob([raw], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    currentAudio = audio;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };

    await new Promise<void>((resolve, reject) => {
      const done = () => {
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('error', onErr);
        resolve();
      };
      const onReady = () => done();
      const onErr = () => {
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('error', onErr);
        reject(new Error('Audio load failed'));
      };
      audio.addEventListener('canplaythrough', onReady);
      audio.addEventListener('error', onErr);
      setTimeout(done, 2000);
      audio.load();
    });

    // Only signal start when playback really begins
    audio.onplay = () => opts?.onStart?.();
    audio.onended = () => {
      cleanup();
      opts?.onEnd?.();
    };
    audio.onerror = () => {
      cleanup();
      opts?.onError?.('Audio playback failed');
      opts?.onEnd?.();
    };

    try {
      await audio.play();
    } catch (playErr) {
      cleanup();
      const err = `Playback blocked: ${String(playErr)}`;
      opts?.onError?.(err);
      opts?.onEnd?.();
      return { ok: false, error: err };
    }

    // Wait until ended so caller knows duration
    await new Promise<void>((resolve) => {
      const prev = audio.onended;
      audio.onended = () => {
        cleanup();
        opts?.onEnd?.();
        resolve();
      };
      // if already ended somehow
      if (audio.ended) {
        cleanup();
        opts?.onEnd?.();
        resolve();
      }
      void prev;
    });

    return { ok: true };
  } catch (e) {
    const err = String(e);
    opts?.onError?.(err);
    opts?.onEnd?.();
    return { ok: false, error: err };
  }
}

/** Quick connectivity check for Leo TTS (short sample). */
export async function testLeoTts(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: 'Paste an API key first.' };

  try {
    const r = await speakWithLeo(key, 'Hello. Butler Grok is ready. This is the Leo voice.');
    if (r.ok) {
      return {
        ok: true,
        message: 'Leo voice works — you should hear a short test line (not Windows TTS).',
      };
    }
    return { ok: false, message: `Leo failed: ${r.error}` };
  } catch (e) {
    return { ok: false, message: `Network error: ${String(e)}` };
  }
}
