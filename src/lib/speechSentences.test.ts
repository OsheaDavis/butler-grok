import assert from 'node:assert/strict';
import {
  SPEECH_CHAR_BUDGET,
  SPEECH_SHORT_NOTE,
  consumeSpeechPieces,
  flushSpeechRemainder,
  prepareStreamingSpeech,
  takeCompleteSentences,
} from './speechSentences.ts';

function testTakeComplete() {
  const mid = takeCompleteSentences('Hello there. How are you?');
  assert.deepEqual(mid.ready, ['Hello there.']);
  assert.equal(mid.rest, 'How are you?');

  const wait = takeCompleteSentences('Hello there.');
  assert.deepEqual(wait.ready, []);
  assert.equal(wait.rest, 'Hello there.');

  const spaced = takeCompleteSentences('Hello there. ');
  assert.deepEqual(spaced.ready, ['Hello there.']);
  assert.equal(spaced.rest, '');

  const decimal = takeCompleteSentences('Use 3.14 as pi. Next.');
  assert.deepEqual(decimal.ready, ['Use 3.14 as pi.']);

  const abbrev = takeCompleteSentences('Dr. Smith is here. Next line. ');
  assert.deepEqual(abbrev.ready, ['Dr. Smith is here.', 'Next line.']);
}

function testFences() {
  const open = prepareStreamingSpeech('Hi there. ```js\nconsole.log(1)');
  assert.equal(open.includes('console.log'), false);
  assert.match(open, /Hi there\./);

  const closed = prepareStreamingSpeech('Hi. ```js\nfoo\n``` Bye.');
  assert.match(closed, /code block omitted for voice/);
  assert.match(closed, /Bye\./);
}

function testStreamingChunks() {
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
  assert.deepEqual(heard, ['Hello there.', 'How are you?', 'More text later.']);
}

function testBudget() {
  const long = `${'Word. '.repeat(200)}End. `;
  const prepared = prepareStreamingSpeech(long);
  const r = consumeSpeechPieces(prepared, 0, 0);
  const spoken = r.pieces.join('').length;
  assert.ok(spoken <= SPEECH_CHAR_BUDGET + SPEECH_SHORT_NOTE.length);
  assert.equal(r.exhausted, true);
}

function testFlushShortReply() {
  const prepared = prepareStreamingSpeech('Just a short clause without a pause');
  assert.deepEqual(takeCompleteSentences(prepared).ready, []);
  assert.equal(flushSpeechRemainder(prepared, 0, 0), 'Just a short clause without a pause');
}

testTakeComplete();
testFences();
testStreamingChunks();
testBudget();
testFlushShortReply();
console.log('speechSentences tests ok');
