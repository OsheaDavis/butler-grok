import type { MutableRefObject } from 'react';
import type { Settings } from '../../lib/types';
import { textForSpeech } from '../../lib/xaiChat';
import { speakText } from '../../lib/speech';
import { speakWithLeo, stopLeoAudio } from '../../lib/leoTts';
import {
  consumeSpeechPieces,
  flushSpeechRemainder,
  prepareStreamingSpeech,
} from '../../lib/speechSentences';

export type SpeechRuntimeRefs = {
  speechTakenRef: MutableRefObject<number>;
  speechSpokenCharsRef: MutableRefObject<number>;
  speechActiveRef: MutableRefObject<boolean>;
  voiceCancelledRef: MutableRefObject<boolean>;
  hasApiKeyRef: MutableRefObject<boolean>;
  settingsRef: MutableRefObject<Settings>;
  leoQueueRef: MutableRefObject<{
    reset: () => void;
    enqueue: (piece: string) => void;
    wasUsed: () => boolean;
    finish: () => void;
  }>;
};

export function resetStreamingSpeech(refs: SpeechRuntimeRefs) {
  refs.speechTakenRef.current = 0;
  refs.speechSpokenCharsRef.current = 0;
  refs.speechActiveRef.current = false;
  refs.leoQueueRef.current.reset();
}

export function beginStreamingSpeech(refs: SpeechRuntimeRefs): boolean {
  const s = refs.settingsRef.current;
  const canLeo =
    refs.hasApiKeyRef.current &&
    (s.connectionMode === 'B' || s.connectionMode === 'C') &&
    s.butlerVoiceOn &&
    !s.muteSounds;
  resetStreamingSpeech(refs);
  refs.voiceCancelledRef.current = false;
  if (!canLeo) return false;
  stopLeoAudio();
  refs.speechActiveRef.current = true;
  return true;
}

export function pushStreamingSpeech(refs: SpeechRuntimeRefs, full: string) {
  if (!refs.speechActiveRef.current || refs.voiceCancelledRef.current) return;
  const prepared = prepareStreamingSpeech(full);
  const next = consumeSpeechPieces(
    prepared,
    refs.speechTakenRef.current,
    refs.speechSpokenCharsRef.current
  );
  refs.speechTakenRef.current = next.nextTaken;
  refs.speechSpokenCharsRef.current = next.nextSpokenChars;
  for (const piece of next.pieces) {
    refs.leoQueueRef.current.enqueue(piece);
  }
}

export function finishStreamingSpeech(refs: SpeechRuntimeRefs, full: string): boolean {
  if (!refs.speechActiveRef.current) return false;
  if (refs.voiceCancelledRef.current) {
    resetStreamingSpeech(refs);
    return true;
  }
  const prepared = prepareStreamingSpeech(full);
  const tail = flushSpeechRemainder(
    prepared,
    refs.speechTakenRef.current,
    refs.speechSpokenCharsRef.current
  );
  if (tail) refs.leoQueueRef.current.enqueue(tail);
  const used = refs.leoQueueRef.current.wasUsed() || Boolean(tail);
  refs.leoQueueRef.current.finish();
  refs.speechActiveRef.current = false;
  return used;
}

export function stopVoicePlayback(
  refs: SpeechRuntimeRefs,
  setSpeaking: (v: boolean) => void,
  showToast: (msg: string) => void
) {
  refs.voiceCancelledRef.current = true;
  refs.speechActiveRef.current = false;
  refs.leoQueueRef.current.reset();
  stopLeoAudio();
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  setSpeaking(false);
  showToast('Voice stopped.');
}

export function speakReplyText(
  refs: SpeechRuntimeRefs,
  reply: string,
  setSpeaking: (v: boolean) => void,
  setLeoReady: (v: boolean) => void,
  showToast: (msg: string) => void
) {
  refs.voiceCancelledRef.current = false;
  // Do NOT set speaking yet — wait until audio actually starts (sync mouth video + VU)
  setSpeaking(false);
  const s = refs.settingsRef.current;
  if (!s.butlerVoiceOn || s.muteSounds) {
    return;
  }

  // Don't read huge code dumps aloud — speak a short summary-friendly version
  const spoken = textForSpeech(reply);
  if (!spoken) {
    return;
  }

  const canLeo =
    refs.hasApiKeyRef.current && (s.connectionMode === 'B' || s.connectionMode === 'C');

  // Stream TTS in main as bytes arrive; mouth/VU still wait for real LEO_PLAY_START

  const markStart = () => {
    if (refs.voiceCancelledRef.current) return;
    setSpeaking(true);
    setLeoReady(true);
  };
  const markEnd = () => setSpeaking(false);

  const fallbackSystem = (why?: string) => {
    if (refs.voiceCancelledRef.current) {
      markEnd();
      return;
    }
    if (why) {
      showToast(`Leo failed — using Windows voice. (${why.slice(0, 90)})`);
      setLeoReady(false);
    }
    const ok = speakText(spoken, {
      onStart: () => {
        if (refs.voiceCancelledRef.current) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            /* ignore */
          }
          markEnd();
          return;
        }
        markStart();
      },
      onEnd: markEnd,
    });
    if (!ok) markEnd();
  };

  if (canLeo) {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    void speakWithLeo(undefined, spoken, {
      onStart: markStart,
      onEnd: markEnd,
      onError: (msg) => {
        if (msg) setLeoReady(false);
      },
    }).then((r) => {
      if (refs.voiceCancelledRef.current || (r.ok && r.cancelled)) {
        markEnd();
        return;
      }
      if (!r.ok) {
        fallbackSystem(r.error);
      } else {
        setLeoReady(true);
        markEnd();
      }
    });
    return;
  }

  if (refs.voiceCancelledRef.current) {
    markEnd();
    return;
  }
  showToast('Cloud mode/key needed for Leo — using Windows voice.');
  const ok = speakText(spoken, {
    onStart: markStart,
    onEnd: markEnd,
  });
  if (!ok) markEnd();
}
