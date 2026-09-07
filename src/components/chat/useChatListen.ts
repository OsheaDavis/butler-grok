import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  recorderExtension,
  startDictation,
  startMicRecording,
  transcribeWithXai,
} from '../../lib/speech';

export function useChatListen(opts: {
  useCloudStt?: boolean;
  hasApiKey?: boolean;
  onDraft: (v: string) => void;
  onToast?: (msg: string) => void;
  onListeningChange?: (listening: boolean) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const { useCloudStt, hasApiKey, onDraft, onToast, onListeningChange, inputRef } = opts;
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const stopDictationRef = useRef<{ stop: () => void } | null>(null);
  const micRecRef = useRef<{ stop: () => Promise<Blob>; cancel: () => void } | null>(null);

  useEffect(() => {
    onListeningChange?.(listening || transcribing);
  }, [listening, transcribing, onListeningChange]);

  useEffect(() => {
    return () => {
      stopDictationRef.current?.stop();
      micRecRef.current?.cancel();
    };
  }, []);

  const toast = (msg: string) => onToast?.(msg);

  /** Stop recording and return transcribed text (or null). */
  const stopListening = async (): Promise<string | null> => {
    if (micRecRef.current) {
      setListening(false);
      setTranscribing(true);
      toast('Transcribing…');
      try {
        const blob = await micRecRef.current.stop();
        micRecRef.current = null;
        const name = recorderExtension(blob.type);
        const result = await transcribeWithXai(undefined, blob, name);
        if (result.ok) {
          onDraft(result.text);
          toast('Ready — press Enter again to send.');
          return result.text;
        }
        toast(result.error);
        return null;
      } catch (e) {
        toast(`Mic error: ${String(e)}`);
        return null;
      } finally {
        setTranscribing(false);
        window.setTimeout(() => inputRef.current?.focus(), 30);
      }
    }
    // Web Speech path: draft already updated live
    stopDictationRef.current?.stop();
    stopDictationRef.current = null;
    setListening(false);
    toast('Ready — press Enter again to send (or edit first).');
    window.setTimeout(() => inputRef.current?.focus(), 30);
    return null;
  };

  const listenOnce = async () => {
    if (transcribing) return;

    // Toggle: stop if already listening
    if (listening) {
      await stopListening();
      return;
    }

    const preferCloud = Boolean(useCloudStt && hasApiKey);

    if (preferCloud) {
      try {
        toast('Listening… press Enter or click Stop when done.');
        const rec = await startMicRecording();
        micRecRef.current = rec;
        setListening(true);
        window.setTimeout(() => inputRef.current?.focus(), 30);
      } catch (e) {
        const msg = String(e);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
          toast('Microphone blocked. Allow mic for Butler Grok in Windows Privacy settings.');
        } else {
          toast(`Could not open microphone: ${msg}`);
        }
        setListening(false);
      }
      return;
    }

    // Fallback: Chromium Web Speech (often fails in Electron)
    const handle = startDictation({
      onText: (text, isFinal) => {
        onDraft(text);
        if (isFinal) {
          setListening(false);
          stopDictationRef.current = null;
          toast('Ready — press Enter to send.');
        }
      },
      onError: (err) => {
        setListening(false);
        stopDictationRef.current = null;
        toast(
          err === 'not-allowed'
            ? 'Microphone blocked. Allow mic access for this app.'
            : `Speak failed (${err}). Turn on Mode B/C + API key for better speech recognition.`
        );
      },
      onEnd: () => {
        setListening(false);
        stopDictationRef.current = null;
      },
    });
    if (handle) {
      stopDictationRef.current = handle;
      setListening(true);
      toast('Listening… speak now, then press Enter to stop.');
      window.setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      toast('Speech recognition unavailable. Use Mode B/C + API key, or type instead.');
    }
  };

  const speakLabel = transcribing
    ? 'Transcribing…'
    : listening
      ? '⏹ Stop (Enter)'
      : '🎙 Speak';

  return { listening, transcribing, stopListening, listenOnce, speakLabel };
}
