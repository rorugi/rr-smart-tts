const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { clampConfig, DEFAULT_CONFIG, getEffectiveConfig, getInheritedConfigForScope } = require('../src/lib/config');
const { applyPlainTextFilters, richTextToSpeechText, validateRegexLines } = require('../src/lib/filter');
const { getSemanticFrontText, getSemanticBackText } = require('../src/lib/card_text');
const { resolveVoice } = require('../src/lib/voices');
const { speakText, speakPreparedText, stopSpeech } = require('../src/lib/speech');
const { ReviewController, physicalSideForPhase } = require('../src/lib/review');

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const flatten = (nodes) => nodes.map((n) => typeof n === 'string' ? n : n.text || '').join('');
const plugin = { richText: { toString: async (nodes) => flatten(nodes) } };

test('migrates the shared voice to both physical sides without changing legacy autoplay', () => {
  const config = clampConfig({ voiceName: 'Legacy', autoPlayFront: true });
  assert.equal(config.frontVoice.name, 'Legacy');
  assert.equal(config.backVoice.name, 'Legacy');
  assert.equal(config.autoPlayQuestion, true);
  assert.equal(config.autoPlayPhysicalFront, false);
});
test('explicit automatic side preference survives legacy migration', () => {
  const config = clampConfig({ voiceName: 'Legacy', frontVoice: { name: '', uri: '', language: 'hi-IN' } });
  assert.equal(config.frontVoice.name, '');
  assert.equal(config.frontVoice.language, 'hi-IN');
  assert.equal(config.backVoice.name, 'Legacy');
});
test('invalid numeric settings fall back to finite defaults', () => {
  const config = clampConfig({ rate: 'bad', pitch: NaN, volume: Infinity });
  assert.equal(config.rate, 1);
  assert.equal(config.pitch, 1);
  assert.equal(config.volume, 1);
});
for (const [input, expected] of [
  ['घर [ghar] (masculine) means house.', 'घर means house.'],
  ['one[note]two', 'one two'],
  ['Hello (note', 'Hello (note'],
  ['before (outer [inner] note) after', 'before after'],
  ['before (outer [inner] note', 'before (outer [inner] note'],
  ['unmatched ) stays', 'unmatched ) stays'],
  ['A (mismatched] rest', 'A (mismatched] rest'],
]) {
  test('filters brackets safely: ' + input, () => assert.equal(applyPlainTextFilters(input, DEFAULT_CONFIG), expected));
}
test('disabled bracket filters preserve bracketed text', () => {
  assert.equal(applyPlainTextFilters('one[note]two', clampConfig({ removeSquareBrackets: false })), 'one[note]two');
});
test('formatting removal preserves word boundaries and unknown nodes', async () => {
  const nodes = ['one', { i: 'm', l: true, text: 'hint' }, 'two', { i: 'unknown', text: ' end' }];
  assert.equal(await richTextToSpeechText(plugin, nodes, DEFAULT_CONFIG), 'one two end');
});
test('bold filtering is optional', async () => {
  const nodes = ['one ', { i: 'm', b: true, text: 'bold' }];
  assert.equal(await richTextToSpeechText(plugin, nodes, DEFAULT_CONFIG), 'one bold');
  assert.equal(await richTextToSpeechText(plugin, nodes, clampConfig({ skipBold: true })), 'one');
});
test('invalid regex is reported and does not prevent other filters', () => {
  assert.deepEqual(validateRegexLines(['[', 'hint']), ['[']);
  assert.equal(applyPlainTextFilters('hello hint', clampConfig({ customRegex: ['[', 'hint'] })), 'hello');
});
test('cloze front hides only the tested cloze and back reveals it', async () => {
  const rem = { text: ['A ', { i: 'm', cId: 'one', text: 'house' }, ' and ', { i: 'm', cId: 'two', text: 'tree' }] };
  assert.equal(await getSemanticFrontText(plugin, rem, { clozeId: 'one' }, DEFAULT_CONFIG), 'A blank and tree');
  assert.equal(await getSemanticBackText(plugin, rem, { clozeId: 'one' }, DEFAULT_CONFIG), 'A house and tree');
});
test('multiline back includes card items, applies formatting filters, and preserves order', async () => {
  const child = (text, item) => ({ text, isCardItem: async () => item });
  const rem = { backText: ['unused'], getChildrenRem: async () => [
    child(['first'], true), child(['note'], false),
    child(['second ', { i: 'm', l: true, text: 'hint' }], true),
  ] };
  assert.equal(await getSemanticBackText(plugin, rem, 'forward', DEFAULT_CONFIG), 'first, second');
});

test('document overrides folder, folder overrides global; inherited config skips self', async () => {
  const values = new Map([
    ['rr-smart-tts:global:v1', { rate: 1 }],
    ['rr-smart-tts:scope:v1:folder', { rate: 1.25 }],
    ['rr-smart-tts:scope:v1:doc', { rate: 1.5 }],
  ]);
  const rems = {};
  for (const [id, parent, doc, folder] of [['card', 'doc', false, false], ['doc', 'folder', true, false], ['folder', null, true, true]]) {
    rems[id] = { _id: id, text: [id], isDocument: async () => doc, isFolder: async () => folder, getParentRem: async () => rems[parent] };
  }
  const api = { ...plugin, storage: { getSynced: async (key) => values.get(key) }, rem: { findOne: async (id) => rems[id] } };
  assert.equal((await getEffectiveConfig(api, 'card')).config.rate, 1.5);
  assert.equal((await getInheritedConfigForScope(api, 'doc')).rate, 1.25);
  values.delete('rr-smart-tts:scope:v1:doc');
  assert.equal((await getEffectiveConfig(api, 'card')).source.kind, 'folder');
  values.delete('rr-smart-tts:scope:v1:folder');
  assert.equal((await getEffectiveConfig(api, 'card')).config.rate, 1);
});

const voices = [
  { name: 'Hindi', voiceURI: 'hi', lang: 'hi-IN' },
  { name: 'English', voiceURI: 'en', lang: 'en-US' },
];
test('missing voice falls back by language instead of the unrelated default', () => {
  const result = resolveVoice(voices, { name: 'Desktop Hindi', uri: 'gone', language: 'hi-IN' });
  assert.equal(result.voice, voices[0]);
  assert.equal(result.fallback, true);
  assert.match(result.status, /unavailable/);
});
test('language fallback supports another regional voice', () => {
  assert.equal(resolveVoice(voices, { name: '', uri: '', language: 'en-GB' }).voice, voices[1]);
});
test('voice URI disambiguates identical names', () => {
  const list = [{ name: 'Same', voiceURI: 'a', lang: 'en-US' }, { name: 'Same', voiceURI: 'b', lang: 'en-US' }];
  assert.equal(resolveVoice(list, { name: 'Same', uri: 'b', language: 'en-US' }).voice.voiceURI, 'b');
});
test('no local voices leaves language available for system selection', () => {
  const result = resolveVoice([], { name: 'Missing', uri: '', language: 'hi-IN' });
  assert.equal(result.voice, undefined);
  assert.match(result.status, /hi-IN/);
});

let spoken, cancels;
beforeEach(() => {
  spoken = []; cancels = 0;
  global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  global.speechSynthesis = { cancel: () => cancels++, getVoices: () => voices, speak: (u) => spoken.push(u) };
});
afterEach(() => { stopSpeech(); delete global.speechSynthesis; delete global.SpeechSynthesisUtterance; });
test('each physical side uses its own voice and language', () => {
  const config = clampConfig({
    frontVoice: { name: 'Hindi', uri: 'hi', language: 'hi-IN' },
    backVoice: { name: 'English', uri: 'en', language: 'en-US' },
  });
  speakText('घर', config, 'front');
  speakText('house', config, 'back');
  assert.deepEqual(spoken.map((u) => [u.voice.voiceURI, u.lang]), [['hi', 'hi-IN'], ['en', 'en-US']]);
});
test('Stop invalidates pending text extraction', async () => {
  const text = deferred();
  const work = speakPreparedText(() => text.promise, DEFAULT_CONFIG, 'front');
  stopSpeech();
  text.resolve('too late');
  await work;
  assert.equal(spoken.length, 0);
});
test('a newer request wins even if the earlier extraction resolves last', async () => {
  const text = deferred();
  const work = speakPreparedText(() => text.promise, DEFAULT_CONFIG, 'front');
  await speakPreparedText(async () => 'new', DEFAULT_CONFIG, 'back');
  text.resolve('old'); await work;
  assert.deepEqual(spoken.map((u) => u.text), ['new']);
});
test('late completion callback cannot cancel a replacement utterance', () => {
  speakText('old', DEFAULT_CONFIG);
  const oldEnd = spoken[0].onend;
  speakText('new', DEFAULT_CONFIG);
  const before = cancels;
  oldEnd();
  assert.equal(cancels, before);
  assert.notEqual(spoken[1].onend, null);
});
test('missing speech API reports an actionable status', () => {
  delete global.speechSynthesis;
  let status;
  speakText('text', DEFAULT_CONFIG, 'front', (s) => { status = s; });
  assert.match(status, /not available/);
});

test('ordinary back still plays when child lookup rejects', async () => {
  const rem = { backText: ['house [hint]'], getChildrenRem: async () => { throw new Error('RPC unavailable'); } };
  assert.equal(await getSemanticBackText(plugin, rem, 'forward', DEFAULT_CONFIG), 'house');
});
test('ordinary back still plays when child classification rejects', async () => {
  const rem = { backText: ['house'], getChildrenRem: async () => [
    { text: ['private note'], isCardItem: async () => { throw new Error('unsupported'); } },
  ] };
  assert.equal(await getSemanticBackText(plugin, rem, 'forward', DEFAULT_CONFIG), 'house');
});
test('a serialized ordinary Rem can speak without child methods', async () => {
  const rem = { _id: 'plain', backText: ['answer'] };
  assert.equal(await getSemanticBackText(plugin, rem, 'forward', DEFAULT_CONFIG), 'answer');
});
test('failed multiline lookups cannot resurrect filtered-out answer text', async () => {
  const rem = { backText: [{ i: 'm', l: true, text: 'hidden' }], getChildrenRem: async () => { throw new Error('unsupported'); } };
  assert.equal(await getSemanticBackText(plugin, rem, 'forward', DEFAULT_CONFIG), '');
});
test('empty known child list does not call optional multiline APIs', async () => {
  const rem = { children: [], backText: ['answer'], getChildrenRem: async () => { assert.fail('unneeded RPC'); } };
  assert.equal(await getSemanticBackText(plugin, rem, 'forward', DEFAULT_CONFIG), 'answer');
});
test('a voice engine exception is reported as playback failure, not text failure', async () => {
  global.speechSynthesis.speak = () => { throw new Error('voice unavailable'); };
  let status;
  await speakPreparedText(async () => 'answer', DEFAULT_CONFIG, 'back', (s) => { status = s; });
  assert.match(status, /back voice could not start/);
  assert.doesNotMatch(status, /read|prepare/);
});
const ctx = (cardId = 'a', options = {}) => ({
  cardId, rem: { _id: cardId }, cardType: 'forward', revealed: false,
  config: clampConfig({ autoPlayQuestion: true, autoPlayAnswer: true }), ...options,
});
function harness(load = async () => ctx()) {
  const plays = [], changes = [], errors = [];
  let configuration = ctx().config;
  const controller = new ReviewController({
    load, config: async () => configuration, changed: (c) => changes.push(c),
    speak: (c, side) => plays.push([c.cardId, side, c.config]),
    stop: stopSpeech, error: (e) => errors.push(e),
  });
  return { controller, plays, changes, errors, setConfig: (c) => { configuration = c; } };
}
test('completing a card clears it without replaying its question', async () => {
  const h = harness(); await h.controller.load(); h.controller.reveal(); h.controller.clear();
  h.controller.play('front');
  assert.deepEqual(h.plays.map((p) => p.slice(0, 2)), [['a', 'front'], ['a', 'back']]);
  assert.equal(h.changes.at(-1), undefined);
});
test('exit discards a still-loading context', async () => {
  const card = deferred(); const h = harness(() => card.promise);
  const work = h.controller.load(); h.controller.clear(); card.resolve(ctx()); await work;
  assert.equal(h.plays.length, 0);
  assert.equal(h.changes.at(-1), undefined);
});
test('Stop during card loading suppresses autoplay until a new phase', async () => {
  const card = deferred(); const h = harness(() => card.promise);
  const work = h.controller.load(); h.controller.stop(); card.resolve(ctx()); await work;
  assert.equal(h.plays.length, 0);
  h.controller.reveal();
  assert.equal(h.plays[0][1], 'back');
});
test('late older card load cannot replace the new card', async () => {
  const old = deferred(); let calls = 0;
  const h = harness(() => ++calls === 1 ? old.promise : Promise.resolve(ctx('b')));
  const first = h.controller.load(); await h.controller.load(); old.resolve(ctx('a')); await first;
  assert.deepEqual(h.plays.map((p) => p[0]), ['b']);
});
test('reveal while loading speaks only the answer', async () => {
  const card = deferred(); const h = harness(() => card.promise);
  const work = h.controller.load(); h.controller.reveal(); card.resolve(ctx()); await work;
  assert.deepEqual(h.plays.map((p) => p[1]), ['back']);
});
test('overlapping autoplay rules and duplicate reveals play a phase once', async () => {
  const h = harness(async () => ctx('a', { config: clampConfig({
    autoPlayQuestion: true, autoPlayAnswer: true, autoPlayPhysicalFront: true, autoPlayPhysicalBack: true,
  }) }));
  await h.controller.load(); h.controller.reveal(); h.controller.reveal();
  assert.deepEqual(h.plays.map((p) => p[1]), ['front', 'back']);
});
test('backward cards keep voices associated with physical sides', async () => {
  const h = harness(async () => ctx('a', { cardType: 'backward' }));
  await h.controller.load(); h.controller.reveal();
  assert.deepEqual(h.plays.map((p) => p[1]), ['back', 'front']);
  assert.equal(physicalSideForPhase({ clozeId: 'c' }, false), 'front');
  assert.equal(physicalSideForPhase({ clozeId: 'c' }, true), 'back');
});
test('saved settings update current playback without repeating an already spoken phase', async () => {
  const h = harness(); await h.controller.load();
  const next = clampConfig({ autoPlayQuestion: true, rate: 1.5 });
  h.setConfig(next); await h.controller.refreshConfig(); h.controller.play('front');
  assert.equal(h.plays.length, 2);
  assert.equal(h.plays[1][2].rate, 1.5);
});
test('enabling autoplay applies to the current unplayed phase', async () => {
  const h = harness(async () => ctx('a', { config: DEFAULT_CONFIG }));
  await h.controller.load(); await h.controller.refreshConfig();
  assert.equal(h.plays.length, 1);
});
test('disable prevents manual playback immediately after refresh', async () => {
  const h = harness(); await h.controller.load();
  h.setConfig(clampConfig({ enabled: false })); await h.controller.refreshConfig(); h.controller.play('front');
  assert.equal(h.plays.length, 1);
});

const { CLOZE_PAUSE } = require('../src/lib/pause');
test('cloze pause replaces only the tested hidden cloze and merges formatting fragments', async () => {
  const rem = { text: ['A ', { i: 'm', cId: 'one', text: 'red' }, { i: 'm', cId: 'one', b: true, text: ' house' }, ' and ', { i: 'm', cId: 'two', text: 'tree' }] };
  const config = clampConfig({ pauseCloze: true });
  assert.equal(await getSemanticFrontText(plugin, rem, { clozeId: 'one' }, config), 'A' + CLOZE_PAUSE + 'and tree');
  assert.equal(await getSemanticBackText(plugin, rem, { clozeId: 'one' }, config), 'A red house and tree');
});
test('speech waits half a second at the cloze and never speaks the pause token', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  speakText('before' + CLOZE_PAUSE + 'after', DEFAULT_CONFIG);
  assert.deepEqual(spoken.map(u => u.text), ['before']);
  spoken[0].onend();
  t.mock.timers.tick(499); assert.equal(spoken.length, 1);
  t.mock.timers.tick(1); assert.deepEqual(spoken.map(u => u.text), ['before', 'after']);
});
test('Stop and replacement cancel speech queued after a cloze pause', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  speakText('before' + CLOZE_PAUSE + 'stale', DEFAULT_CONFIG);
  spoken[0].onend(); stopSpeech(); t.mock.timers.tick(500);
  assert.equal(spoken.length, 1);
  speakText('again' + CLOZE_PAUSE + 'stale', DEFAULT_CONFIG);
  spoken[1].onend(); speakText('replacement', DEFAULT_CONFIG); t.mock.timers.tick(500);
  assert.deepEqual(spoken.map(u => u.text), ['before', 'again', 'replacement']);
});
test('a leading cloze pauses before speech and a trailing cloze speaks no marker', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  speakText(CLOZE_PAUSE + 'answer' + CLOZE_PAUSE, DEFAULT_CONFIG);
  assert.equal(spoken.length, 0); t.mock.timers.tick(500);
  assert.equal(spoken[0].text, 'answer'); spoken[0].onend(); t.mock.timers.tick(500);
  assert.equal(spoken.length, 1);
});

test('cloze question never reads the back field with either blank or pause mode', async () => {
  const rem = { text: ['The ', { i: 'm', cId: 'one', text: 'cat' }, ' sleeps.'], backText: ['SECRET BACK ANSWER'] };
  assert.equal(await getSemanticFrontText(plugin, rem, { clozeId: 'one' }, DEFAULT_CONFIG), 'The blank sleeps.');
  const text = await getSemanticFrontText(plugin, rem, { clozeId: 'one' }, clampConfig({ pauseCloze: true }));
  assert.equal(text, 'The' + CLOZE_PAUSE + 'sleeps.');
  assert.ok(!text.includes('SECRET'));
  assert.equal(await getSemanticBackText(plugin, rem, { clozeId: 'one' }, DEFAULT_CONFIG), 'The cat sleeps. SECRET BACK ANSWER');
});
