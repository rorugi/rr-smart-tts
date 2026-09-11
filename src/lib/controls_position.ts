import { StorageEvents, WidgetLocation, type ReactRNPlugin, type RNPlugin } from '@remnote/plugin-sdk';
export type ControlsPosition = 'right' | 'under' | 'top';
export const CONTROLS_POSITION_KEY = 'rr-smart-tts:controls-position:v1';
export const normalizeControlsPosition = (value: unknown): ControlsPosition => value === 'under' || value === 'top' ? value : 'right';
export async function getControlsPosition(plugin: RNPlugin) {
  return normalizeControlsPosition(await plugin.storage.getSynced(CONTROLS_POSITION_KEY));
}
export async function registerControlsPosition(plugin: ReactRNPlugin) {
  let disposed = false;
  let location: WidgetLocation | undefined;
  let pending = Promise.resolve();
  const update = () => {
    pending = pending.catch(() => {}).then(async () => {
      const position = await getControlsPosition(plugin);
      if (disposed) return;
      const next = position === 'top' ? WidgetLocation.QueueBelowTopBar : WidgetLocation.FlashcardUnder;
      if (next === location) return;
      if (location) { await plugin.app.unregisterWidget('smart_tts', location); location = undefined; }
      if (disposed) return;
      // RemNote creates the below-top-bar slot when a widget is registered there.
      await plugin.app.registerWidget('smart_tts', next, { dimensions: { height: 'auto', width: '100%' } });
      location = next;
    });
    return pending;
  };
  const changed = () => { void update().catch(() => plugin.app.toast('Could not move speech controls. Try saving again.')); };
  plugin.event.addListener(StorageEvents.StorageSyncedChange, CONTROLS_POSITION_KEY, changed);
  try { await update(); } catch (error) { plugin.event.removeListener(StorageEvents.StorageSyncedChange, CONTROLS_POSITION_KEY, changed); throw error; }
  return () => { disposed = true; plugin.event.removeListener(StorageEvents.StorageSyncedChange, CONTROLS_POSITION_KEY, changed); };
}
