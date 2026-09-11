const { test } = require('node:test');
const assert = require('node:assert/strict');
const QueueEvent = { QueueEnter: 'enter', QueueLoadCard: 'load', QueueExit: 'exit' };
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  return name === '@remnote/plugin-sdk' ? { QueueEvent } : originalLoad.call(this, name, ...args);
};
const { attachFloatingControls } = require('../src/lib/floating_controls');
Module._load = originalLoad;
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(current = Promise.resolve(undefined)) {
  const listeners = new Map(), opened = [], closed = [];
  const plugin = {
    event: { addListener: (event, key, fn) => listeners.set(event, fn), removeListener: (event) => listeners.delete(event) },
    queue: { getCurrentCard: () => current },
    app: { toast: async () => {} },
    window: {
      openFloatingWidget: async (...args) => { opened.push(args); return 'controls'; },
      closeFloatingWidget: async id => { closed.push(id); },
      isFloatingWidgetOpen: async () => true,
    },
  };
  return { plugin, opened, closed, listeners, emit: event => listeners.get(event)?.() };
}
test('one right-hand group survives repeated card events and closes on exit', async () => {
  const h = setup(); const detach = attachFloatingControls(h.plugin);
  h.emit(QueueEvent.QueueEnter); h.emit(QueueEvent.QueueLoadCard); await tick();
  assert.deepEqual(h.opened, [['smart_tts', { right: 16, top: 96 }, 'rr-smart-tts-floating-host', false]]);
  h.emit(QueueEvent.QueueExit); await tick(); assert.deepEqual(h.closed, ['controls']);
  await detach(); assert.equal(h.listeners.size, 0);
});
test('exit closes a widget whose open RPC was still pending', async () => {
  const h = setup(), opening = deferred();
  h.plugin.window.openFloatingWidget = () => opening.promise;
  const detach = attachFloatingControls(h.plugin);
  h.emit(QueueEvent.QueueEnter); await tick(); h.emit(QueueEvent.QueueExit);
  opening.resolve('late'); await tick(); assert.deepEqual(h.closed, ['late']); await detach();
});
test('a stale initial card lookup cannot reopen controls after exit', async () => {
  const initial = deferred(), h = setup(initial.promise), detach = attachFloatingControls(h.plugin);
  h.emit(QueueEvent.QueueExit); initial.resolve({}); await tick();
  assert.equal(h.opened.length, 0); await detach();
});
test('reload during review opens controls and deactivation closes them', async () => {
  const h = setup(Promise.resolve({})), detach = attachFloatingControls(h.plugin);
  await tick(); assert.equal(h.opened.length, 1); await detach(); assert.deepEqual(h.closed, ['controls']);
});
