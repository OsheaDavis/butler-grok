/** Voice budget matches `textForSpeech` so streaming Speak stays as short as replay. */
export const SPEECH_CHAR_BUDGET = 900;
export const SPEECH_SHORT_NOTE =
  '… (reply shortened for voice — full text is in chat.)';

/**
 * Drop complete code fences (and an unclosed tail fence) so we do not speak raw code
 * while the chat stream is still filling in a block.
 */
export function prepareStreamingSpeech(text: string): string {
  let t = String(text || '');
  t = t.replace(/```[\s\S]*?```/g, ' [code block omitted for voice] ');
  const fences = t.match(/```/g);
  if (fences && fences.length % 2 === 1) {
    t = t.slice(0, t.lastIndexOf('```'));
  }
  return t;
}

/**
 * Pull finished sentences from a growing buffer. Periods wait for a following
 * whitespace so we do not split `3.14` / `file.txt`. Short `Dr.`-style tokens
 * stay attached until a later boundary or flush.
 */
export function takeCompleteSentences(buffer: string): { ready: string[]; rest: string } {
  const text = String(buffer || '');
  const ready: string[] = [];
  let start = 0;

  const skipWs = (i: number) => {
    while (i < text.length && /\s/.test(text[i])) i += 1;
    return i;
  };

  for (let i = 0; i < text.length; i += 1) {
    const end = sentenceEndIndex(text, i);
    if (end == null) continue;
    const raw = text.slice(start, end);
    const piece = raw.replace(/\s+/g, ' ').trim();
    const isPara = /\n\s*\n/.test(raw);
    const strongEnd = /[!?]$/.test(piece);
    if (!piece || (piece.length < 8 && !strongEnd && !isPara)) {
      continue;
    }
    ready.push(piece);
    start = skipWs(end);
    i = start - 1;
  }

  return { ready, rest: text.slice(start) };
}

function sentenceEndIndex(text: string, i: number): number | null {
  if (text[i] === '\n' && text[i + 1] === '\n') return i + 2;
  const ch = text[i];
  if (ch !== '.' && ch !== '!' && ch !== '?') return null;
  if (i === text.length - 1) return null;
  if (!/\s/.test(text[i + 1])) return null;
  if (ch === '.') {
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j += 1;
    if (j < text.length && /[a-z]/.test(text[j])) return null;
  }
  return i + 1;
}

export function consumeSpeechPieces(
  prepared: string,
  alreadyTaken: number,
  spokenChars: number
): {
  pieces: string[];
  nextTaken: number;
  nextSpokenChars: number;
  exhausted: boolean;
} {
  if (spokenChars >= SPEECH_CHAR_BUDGET) {
    return {
      pieces: [],
      nextTaken: prepared.length,
      nextSpokenChars: spokenChars,
      exhausted: true,
    };
  }

  const unread = prepared.slice(alreadyTaken);
  const { ready, rest } = takeCompleteSentences(unread);
  const pieces: string[] = [];
  let spoken = spokenChars;

  for (const raw of ready) {
    if (spoken >= SPEECH_CHAR_BUDGET) break;
    if (spoken + raw.length > SPEECH_CHAR_BUDGET) {
      const slice = raw.slice(0, SPEECH_CHAR_BUDGET - spoken).trim();
      if (slice) pieces.push(`${slice}${SPEECH_SHORT_NOTE}`);
      return {
        pieces,
        nextTaken: prepared.length,
        nextSpokenChars: SPEECH_CHAR_BUDGET,
        exhausted: true,
      };
    }
    pieces.push(raw);
    spoken += raw.length;
  }

  return {
    pieces,
    nextTaken: prepared.length - rest.length,
    nextSpokenChars: spoken,
    exhausted: spoken >= SPEECH_CHAR_BUDGET,
  };
}

export function flushSpeechRemainder(
  prepared: string,
  alreadyTaken: number,
  spokenChars: number
): string {
  if (spokenChars >= SPEECH_CHAR_BUDGET) return '';
  const rest = prepared.slice(alreadyTaken).replace(/\s+/g, ' ').trim();
  if (!rest) return '';
  if (spokenChars + rest.length > SPEECH_CHAR_BUDGET) {
    const slice = rest.slice(0, SPEECH_CHAR_BUDGET - spokenChars).trim();
    return slice ? `${slice}${SPEECH_SHORT_NOTE}` : '';
  }
  return rest;
}
