import { describe, expect, it } from 'vitest';
import {
  SPEECH_CHAR_BUDGET,
  SPEECH_SHORT_NOTE,
  consumeSpeechPieces,
  flushSpeechRemainder,
  prepareStreamingSpeech,
  takeCompleteSentences,
} from './speechSentences';

describe('takeCompleteSentences', () => {
  it('releases a finished sentence and keeps the unfinished tail', () => {
    const mid = takeCompleteSentences('Hello there. How are you?');
    expect(mid.ready).toEqual(['Hello there.']);
    expect(mid.rest).toBe('How are you?');
  });

  it('waits when the only sentence has no following whitespace', () => {
    const wait = takeCompleteSentences('Hello there.');
    expect(wait.ready).toEqual([]);
    expect(wait.rest).toBe('Hello there.');
  });

  it('releases a sentence that ends with trailing space', () => {
    const spaced = takeCompleteSentences('Hello there. ');
    expect(spaced.ready).toEqual(['Hello there.']);
    expect(spaced.rest).toBe('');
  });

  it('does not split decimals like 3.14', () => {
    const decimal = takeCompleteSentences('Use 3.14 as pi. Next.');
    expect(decimal.ready).toEqual(['Use 3.14 as pi.']);
  });

  it('keeps short Dr.-style abbreviations attached', () => {
    const abbrev = takeCompleteSentences('Dr. Smith is here. Next line. ');
    expect(abbrev.ready).toEqual(['Dr. Smith is here.', 'Next line.']);
  });
});

describe('prepareStreamingSpeech', () => {
  it('drops an unclosed code fence so raw code is not spoken', () => {
    const open = prepareStreamingSpeech('Hi there. ```js\nconsole.log(1)');
    expect(open.includes('console.log')).toBe(false);
    expect(open).toMatch(/Hi there\./);
  });

  it('replaces a closed fence with a short voice note', () => {
    const closed = prepareStreamingSpeech('Hi. ```js\nfoo\n``` Bye.');
    expect(closed).toMatch(/code block omitted for voice/);
    expect(closed).toMatch(/Bye\./);
  });
});

describe('consumeSpeechPieces + flushSpeechRemainder', () => {
  it('speaks complete sentences as the stream grows, then flushes the tail', () => {
    const chunks = ['Hello there', '. How are', ' you? More text', ' later.'];
    let full = '';
    let taken = 0;
    let spoken = 0;
    const heard: string[] = [];
    for (const c of chunks) {
      full += c;
      const prepared = prepareStreamingSpeech(full);
      const r = consumeSpeechPieces(prepared, taken, spoken);
      taken = r.nextTaken;
      spoken = r.nextSpokenChars;
      heard.push(...r.pieces);
    }
    const tail = flushSpeechRemainder(prepareStreamingSpeech(full), taken, spoken);
    if (tail) heard.push(tail);
    expect(heard).toEqual(['Hello there.', 'How are you?', 'More text later.']);
  });

  it('stops at the voice character budget', () => {
    const long = `${'Word. '.repeat(200)}End. `;
    const prepared = prepareStreamingSpeech(long);
    const r = consumeSpeechPieces(prepared, 0, 0);
    const spoken = r.pieces.join('').length;
    expect(spoken).toBeLessThanOrEqual(SPEECH_CHAR_BUDGET + SPEECH_SHORT_NOTE.length);
    expect(r.exhausted).toBe(true);
  });

  it('flushes a short reply that never hit a sentence boundary', () => {
    const prepared = prepareStreamingSpeech('Just a short clause without a pause');
    expect(takeCompleteSentences(prepared).ready).toEqual([]);
    expect(flushSpeechRemainder(prepared, 0, 0)).toBe('Just a short clause without a pause');
  });
});
