import { speakWithLeo } from './leoTts';

/**
 * Serial Leo clips through the existing `leo:speak` MediaPlayer streamer.
 * One clip at a time — a new speak would stop the current player.
 */
export function createLeoSpeakQueue(opts: {
  getApiKey: () => string;
  isCancelled: () => boolean;
  onFirstAudioStart: () => void;
  onQueueIdle: () => void;
  onError?: (msg: string) => void;
}) {
  const pending: string[] = [];
  let generation = 0;
  let pumping = false;
  let closed = false;
  let heardAudio = false;
  let used = false;

  const reset = () => {
    generation += 1;
    pending.length = 0;
    pumping = false;
    closed = false;
    heardAudio = false;
    used = false;
  };

  const enqueue = (text: string) => {
    const t = text.trim();
    if (!t || opts.isCancelled()) return;
    used = true;
    pending.push(t);
    void pump();
  };

  const finish = () => {
    closed = true;
    if (!pumping && pending.length === 0) {
      opts.onQueueIdle();
      return;
    }
    void pump();
  };

  async function pump() {
    if (pumping) return;
    pumping = true;
    const gen = generation;
    while (pending.length > 0 && gen === generation && !opts.isCancelled()) {
      const text = pending.shift()!;
      const r = await speakWithLeo(opts.getApiKey(), text, {
        onStart: () => {
          if (gen !== generation || opts.isCancelled()) return;
          if (!heardAudio) {
            heardAudio = true;
            opts.onFirstAudioStart();
          }
        },
      });
      if (gen !== generation || opts.isCancelled() || (r.ok && r.cancelled)) {
        pending.length = 0;
        break;
      }
      if (!r.ok) {
        opts.onError?.(r.error);
        pending.length = 0;
        closed = true;
        pumping = false;
        opts.onQueueIdle();
        return;
      }
    }
    pumping = false;
    if (gen === generation && pending.length === 0 && closed && !opts.isCancelled()) {
      opts.onQueueIdle();
    }
  }

  return {
    reset,
    enqueue,
    finish,
    wasUsed: () => used,
    heardAudio: () => heardAudio,
  };
}
