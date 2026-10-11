import { FocusEvents, QueueEvent, WindowEvents, type ReactRNPlugin } from '@remnote/plugin-sdk';
import type { PhysicalSide } from './config';

export const REPLAY_REQUEST_KEY = 'rr-smart-tts:replay-request:v1';
export type ReplayRequest = { id: string; cardId: string; side: PhysicalSide };
export const REPLAY_SHORTCUTS = { front: '6', back: '7' } as const;

export async function registerReplayShortcuts(plugin: ReactRNPlugin) {
  let sequence = 0;
  let disposed = false, exited = false, enabled = false;
  let revision = 0;
  let checks = 0;
  let pending = Promise.resolve();
  let registered: boolean | undefined;

  const canReplay = async () => {
    if (disposed || exited) return false;
    try {
      const [card, focusedRem, typingAnswer] = await Promise.all([
        plugin.queue.getCurrentCard(),
        plugin.focus.getFocusedRem(),
        plugin.queue.isTypeAnswerEnabled(),
      ]);
      return !!card && !focusedRem && !typingAnswer && !disposed && !exited;
    } catch {
      // If context cannot be determined, leave ordinary typing alone.
      return false;
    }
  };
  const register = async (active: boolean) => {
    enabled = active;
    for (const side of ['front', 'back'] as const) await plugin.app.registerCommand({
      id: 'rr-smart-tts-replay-' + side,
      name: 'Replay ' + (side === 'front' ? 'Front' : 'Back'),
      description: 'Replay the physical ' + side + ' of the current flashcard.',
      // Removing the binding itself is essential: an action guard alone still
      // lets RemNote consume digits in the editor. Empty explicitly clears it.
      keyboardShortcut: active ? REPLAY_SHORTCUTS[side] : '',
      action: async () => {
        if (!enabled || !await canReplay()) return;
        const card = await plugin.queue.getCurrentCard();
        if (!card || !enabled || disposed || exited) return;
        // Playback belongs to the visible speech widget, not the background index.
        await plugin.storage.setSession(REPLAY_REQUEST_KEY, {
          id: Date.now() + ':' + ++sequence,
          cardId: card._id,
          side,
        } satisfies ReplayRequest);
      },
    });
    registered = active;
  };
  const refresh = () => {
    const request = ++revision;
    checks += 1;
    pending = pending.catch(() => {}).then(async () => {
      if (disposed) return;
      const active = await canReplay();
      if (disposed || request !== revision) return;
      if (registered !== active) await register(active);
    }).finally(() => { checks -= 1; });
    return pending;
  };
  const update = () => { void refresh().catch(() => {}); };
  const enter = () => { exited = false; update(); };
  const exit = () => { exited = true; enabled = false; update(); };
  const listeners: [string, () => void][] = [
    [QueueEvent.QueueEnter, enter], [QueueEvent.QueueExit, exit],
    [QueueEvent.QueueLoadCard, update], [QueueEvent.QueueCompleteCard, update],
    [FocusEvents.FocusedRemChange, update], [WindowEvents.FocusedPaneChange, update],
  ];
  // Clear the old global defaults on upgrade before checking review context.
  await register(false);
  listeners.forEach(([event, callback]) => plugin.event.addListener(event, undefined, callback));
  await refresh();
  const timer = setInterval(() => { if (!checks) update(); }, 500);
  return async () => {
    disposed = true; enabled = false; revision += 1;
    clearInterval(timer);
    listeners.forEach(([event, callback]) => plugin.event.removeListener(event, undefined, callback));
    await pending.catch(() => {});
    await register(false);
  };
}
