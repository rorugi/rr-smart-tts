const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const Renderer = require('react-test-renderer');
const Module = require('node:module');
const { act } = Renderer;
let api, Popup, Toolbar, root;
const events = { QueueLoadCard: 'load', QueueCompleteCard: 'complete', QueueEnter: 'enter', QueueExit: 'exit', RevealAnswer: 'reveal' };
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === '@remnote/plugin-sdk') return {
    usePlugin: () => api,
    renderWidget: (component) => { if (component.name === 'ConfigPopup') Popup = component; else Toolbar = component; },
    useRunAsync: (fn, deps) => {
      const [value, setValue] = React.useState();
      React.useEffect(() => { let active = true; fn().then((v) => { if (active) setValue(v); }); return () => { active = false; }; }, deps);
      return value;
    },
    QueueEvent: events,
    StorageEvents: { StorageSyncedChange: 'storage' },
    useAPIEventListener: (event, key, callback) => {
      React.useEffect(() => {
        api.event.addListener(event, key, callback);
        return () => api.event.removeListener(event, key, callback);
      }, [event, key, callback]);
    },
  };
  return originalLoad.call(this, name, ...args);
};
require.extensions['.css'] = () => {};
require('../src/widgets/config_popup');
require('../src/widgets/smart_tts');
Module._load = originalLoad;

const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const voiceList = [{ name: 'Hindi', voiceURI: 'hi', lang: 'hi-IN' }, { name: 'English', voiceURI: 'en', lang: 'en-US' }];
function setup() {
  const values = new Map([
    ['rr-smart-tts:global:v1', { rate: 1 }],
    ['rr-smart-tts:scope:v1:doc', { rate: 1.5 }],
    ['rr-smart-tts:scope:v1:folder', { rate: 1.75 }],
  ]);
  const writes = [], spoken = [];
  const rems = {};
  for (const [id, parent, doc, folder] of [['card', 'doc', false, false], ['doc', 'folder', true, false], ['folder', null, true, true]]) {
    rems[id] = {
      _id: id, text: [id], backText: ['back'], isDocument: async () => doc, isFolder: async () => folder,
      getParentRem: async () => rems[parent], getChildrenRem: async () => [],
    };
  }
  const listeners = new Map();
  let current = { _id: 'a', getRem: async () => rems.card, getType: async () => 'forward' };
  api = {
    widget: { getWidgetContext: async () => ({ remId: 'card' }), closePopup: async () => {} },
    storage: { getSynced: async (key) => values.get(key), setSynced: async (key, value) => {
      values.set(key, value); writes.push([key, value]); emit('storage', key);
    } },
    rem: { findOne: async (id) => rems[id] },
    richText: { toString: async (nodes) => nodes.map((n) => typeof n === 'string' ? n : n.text || '').join('') },
    queue: { getCurrentCard: async () => current, hasRevealedAnswer: async () => false },
    app: { toast: async () => {} },
    event: {
      addListener: (event, key, callback) => {
        const id = JSON.stringify([event, key]);
        if (!listeners.has(id)) listeners.set(id, new Set());
        listeners.get(id).add(callback);
      },
      removeListener: (event, key, callback) => listeners.get(JSON.stringify([event, key]))?.delete(callback),
    },
  };
  function emit(event, key) { for (const callback of [...(listeners.get(JSON.stringify([event, key])) || [])]) callback(); }
  global.speechSynthesis = { getVoices: () => voiceList, cancel: () => {}, speak: (u) => spoken.push(u), addEventListener: () => {}, removeEventListener: () => {} };
  global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  return { values, writes, rems, emit, spoken, setCurrent: (card) => { current = card; } };
}
const mount = async (Component) => act(async () => { root = Renderer.create(React.createElement(Component)); await tick(); });
const button = (text) => root.root.findAllByType('button').find((b) => b.children.join('') === text);
const scopeSelect = () => root.root.findAllByType('select')[0];
const rate = () => root.root.findAllByType('input').find((i) => i.props.type === 'range' && i.props.min === '0.5').props.value;
afterEach(async () => {
  if (root) { await act(async () => root.unmount()); root = undefined; }
  delete global.speechSynthesis; delete global.SpeechSynthesisUtterance;
});

test('switching scopes ignores stale loads and blocks Save until selected scope is ready', async () => {
  const h = setup();
  await mount(Popup);
  assert.equal(rate(), 1.5);
  const pending = deferred();
  const get = api.storage.getSynced;
  api.storage.getSynced = (key) => key.endsWith(':folder') ? pending.promise : get(key);
  await act(async () => { scopeSelect().props.onChange({ target: { value: 'folder' } }); await tick(); });
  assert.equal(button('Save').props.disabled, true);
  await act(async () => { button('Save').props.onClick(); await tick(); });
  assert.equal(h.writes.length, 0);
  await act(async () => { scopeSelect().props.onChange({ target: { value: '__global__' } }); await tick(); });
  assert.equal(rate(), 1);
  await act(async () => { pending.resolve({ rate: 2 }); await tick(); });
  assert.equal(rate(), 1);
  await act(async () => { button('Save').props.onClick(); await tick(); });
  assert.equal(h.writes[0][0], 'rr-smart-tts:global:v1');
  assert.equal(h.writes[0][1].rate, 1);
});

test('front/back voice selections are independent and persist with their languages', async () => {
  const h = setup(); await mount(Popup);
  await act(async () => {
    root.root.findByProps({ id: 'front-voice' }).props.onChange({ target: { value: JSON.stringify(['hi', 'Hindi', 'hi-IN']) } });
    root.root.findByProps({ id: 'back-voice' }).props.onChange({ target: { value: JSON.stringify(['en', 'English', 'en-US']) } });
  });
  await act(async () => { button('Save').props.onClick(); await tick(); });
  assert.deepEqual(h.writes[0][1].frontVoice, { name: 'Hindi', uri: 'hi', language: 'hi-IN' });
  assert.deepEqual(h.writes[0][1].backVoice, { name: 'English', uri: 'en', language: 'en-US' });
});

test('current-card preview uses formatting filters and updates when they change', async () => {
  const h = setup();
  h.rems.card.text = ['घर ', { i: 'm', l: true, text: 'ghar' }, ' [hint]'];
  await mount(Popup);
  await act(async () => { button('Preview current card').props.onClick(); await tick(); });
  const previews = () => root.root.findAllByProps({ className: 'rr-tts-preview' }).map((p) => p.children.join(''));
  assert.deepEqual(previews(), ['घर ghar [hint]', 'घर']);
  const italic = root.root.findAllByType('label').find((label) => label.children.includes(' Skip italic text')).findByType('input');
  await act(async () => { italic.props.onChange({ target: { checked: false } }); await tick(); });
  assert.deepEqual(previews(), ['घर ghar [hint]', 'घर ghar']);
});

test('saving remains locked until the write finishes and errors leave the form editable', async () => {
  setup(); await mount(Popup);
  const pending = deferred();
  api.storage.setSynced = () => pending.promise;
  await act(async () => { button('Save').props.onClick(); await tick(); });
  assert.equal(scopeSelect().props.disabled, true);
  assert.equal(button('Save').props.disabled, true);
  await act(async () => { pending.resolve(); await tick(); });
  assert.equal(button('Save').props.disabled, false);
  api.storage.setSynced = async () => { throw new Error('offline'); };
  await act(async () => { button('Save').props.onClick(); await tick(); });
  assert.equal(root.root.findByProps({ role: 'alert' }).children.join(''), 'Could not save settings. Please try again.');
  assert.equal(button('Save').props.disabled, false);
});

test('toolbar observes keyed scope changes without waiting for the next card', async () => {
  const h = setup(); await mount(Toolbar);
  await act(async () => {
    await api.storage.setSynced('rr-smart-tts:scope:v1:doc', { autoPlayQuestion: true, frontVoice: { name: 'Hindi', uri: 'hi', language: 'hi-IN' } });
    await tick();
  });
  assert.equal(h.spoken.length, 1);
  assert.equal(h.spoken[0].voice.voiceURI, 'hi');
  await act(async () => {
    await api.storage.setSynced('rr-smart-tts:scope:v1:doc', { enabled: false }); await tick();
  });
  assert.equal(root.root.findAllByType('button').length, 0);
});

test('toolbar completion clears old card and waits for the next load event', async () => {
  const h = setup();
  h.values.set('rr-smart-tts:scope:v1:doc', { autoPlayQuestion: true });
  await mount(Toolbar);
  assert.equal(h.spoken.length, 1);
  await act(async () => { h.emit('complete'); await tick(); });
  assert.equal(root.root.findAllByType('button').length, 0);
  assert.equal(h.spoken.length, 1);
  h.rems.card.text = ['new card'];
  h.setCurrent({ _id: 'b', getRem: async () => h.rems.card, getType: async () => 'forward' });
  await act(async () => { h.emit('load'); await tick(); });
  assert.equal(h.spoken.length, 2);
  assert.equal(h.spoken[1].text, 'new card');
});
