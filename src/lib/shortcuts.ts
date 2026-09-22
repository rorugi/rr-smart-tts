import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import type { PhysicalSide } from './config';

export const REPLAY_REQUEST_KEY = 'rr-smart-tts:replay-request:v1';
export type ReplayRequest = { id: string; cardId: string; side: PhysicalSide };

export async function registerReplayShortcuts(plugin: ReactRNPlugin) {
  let sequence = 0;
  for (const [side, key] of [['front', '6'], ['back', '7']] as const) {
    await plugin.app.registerCommand({
      id: 'rr-smart-tts-replay-' + side,
      name: 'RR Smart TTS: Replay ' + (side === 'front' ? 'Front' : 'Back'),
      description: 'Replay the physical ' + side + ' of the current flashcard.',
      keyboardShortcut: key,
      action: async () => {
        const card = await plugin.queue.getCurrentCard();
        if (!card) return;
        // Playback belongs to the visible speech widget, not the background index.
        await plugin.storage.setSession(REPLAY_REQUEST_KEY, {
          id: Date.now() + ':' + ++sequence,
          cardId: card._id,
          side,
        } satisfies ReplayRequest);
      },
    });
  }
}
