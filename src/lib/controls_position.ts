import { WidgetLocation, type ReactRNPlugin, type RNPlugin } from '@remnote/plugin-sdk';
export type ControlsPosition = 'right' | 'under';
export const CONTROLS_POSITION_KEY = 'rr-smart-tts:controls-position:v1';
export const normalizeControlsPosition = (value: unknown): ControlsPosition => value === 'under' ? 'under' : 'right';
export async function getControlsPosition(plugin: RNPlugin) {
  return normalizeControlsPosition(await plugin.storage.getSynced(CONTROLS_POSITION_KEY));
}
export async function registerControlsPosition(plugin: ReactRNPlugin) {
  await plugin.app.registerWidget('smart_tts', WidgetLocation.FlashcardUnder, {
    dimensions: { height: 'auto', width: '100%' },
  });
  return () => {};
}
