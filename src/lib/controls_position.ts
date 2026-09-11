import { StorageEvents, WidgetLocation, type ReactRNPlugin, type RNPlugin } from '@remnote/plugin-sdk';

export type ControlsPosition = 'right' | 'under' | 'toolbar';
export const CONTROLS_POSITION_KEY = 'rr-smart-tts:controls-position:v1';
export const normalizeControlsPosition = (value: unknown): ControlsPosition =>
  value === 'under' || value === 'toolbar' ? value : 'right';
export async function getControlsPosition(plugin: RNPlugin) {
  return normalizeControlsPosition(await plugin.storage.getSynced(CONTROLS_POSITION_KEY));
}

export async function registerControlsPosition(plugin: ReactRNPlugin) {
  let disposed = false;
  let location: WidgetLocation | undefined;
  let pending = Promise.resolve();
  const update = () => {
    pending = pending.then(async () => {
      const position = await getControlsPosition(plugin);
      if (disposed) return;
      const next = position === 'toolbar' ? WidgetLocation.QueueToolbar : WidgetLocation.FlashcardUnder;
      if (next === location) return;
      if (location) await plugin.app.unregisterWidget('smart_tts', location);
      if (disposed) return;
      await plugin.app.registerWidget('smart_tts', next, {
        dimensions: { height: 'auto', width: next === WidgetLocation.QueueToolbar ? 280 : '100%' },
      });
      location = next;
    });
    return pending;
  };
  const changed = () => { void update().catch(() => plugin.app.toast('Could not change controls position. Reload the plugin to retry.')); };
  plugin.event.addListener(StorageEvents.StorageSyncedChange, CONTROLS_POSITION_KEY, changed);
  await update();
  return () => {
    disposed = true;
    plugin.event.removeListener(StorageEvents.StorageSyncedChange, CONTROLS_POSITION_KEY, changed);
  };
}
