import {
  declareIndexPlugin,
  PluginCommandMenuLocation,
  type ReactRNPlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import '../style.css';
import { registerControlsPosition } from '../lib/controls_position';
let detachPosition: (() => void) | undefined;
import { registerAutoplayMenu } from '../lib/autoplay_menu';
import { registerReplayShortcuts } from '../lib/shortcuts';
let detachAutoplayMenu: (() => void) | undefined;

async function openConfigForContext(plugin: ReactRNPlugin, remId?: string, cardId?: string) {
  if (!remId) {
    // Capture the page before opening the popup, which can change focus.
    try {
      const pane = await plugin.window.getFocusedPaneId() || await plugin.window.getLastFocusedPane();
      if (pane) remId = await plugin.window.getOpenPaneRemId(pane);
    } catch { /* Fall back to the focused Rem below. */ }
    if (!remId) {
      try { remId = (await plugin.focus.getFocusedRem())?._id; } catch { /* No document is open. */ }
    }
  }
  await plugin.widget.openPopup('config_popup', { remId, cardId });
}

async function onActivate(plugin: ReactRNPlugin) {
  detachPosition?.();
  detachAutoplayMenu?.();
  await plugin.app.unregisterWidget('smart_tts', WidgetLocation.QueueToolbar);
  await plugin.app.unregisterWidget('smart_tts', WidgetLocation.FlashcardUnder);
  await plugin.app.unregisterWidget('smart_tts', WidgetLocation.QueueBelowTopBar);
  await plugin.app.unregisterWidget('config_popup', WidgetLocation.Popup);
  await plugin.app.unregisterWidget('smart_tts', WidgetLocation.FloatingWidget);
  await plugin.app.registerCSS('rr-smart-tts-floating-position', '');
  detachPosition = await registerControlsPosition(plugin);

  await plugin.app.registerWidget('config_popup', WidgetLocation.Popup, {
    // Measure intrinsic content; no child height depends on the popup viewport.
    dimensions: { height: 'auto', width: 720 },
  });

  await plugin.app.registerMenuItem({
    id: 'rr-smart-tts-configure',
    name: 'RR Smart TTS: Settings',
    location: PluginCommandMenuLocation.QueueMenu,
    action: async ({ remId, cardId }: { remId?: string; cardId?: string }) => {
      await openConfigForContext(plugin, remId, cardId);
    },
  });

  detachAutoplayMenu = await registerAutoplayMenu(plugin);
  await registerReplayShortcuts(plugin);

  await plugin.app.registerCommand({
    id: 'rr-smart-tts-global-settings',
    name: 'RR Smart TTS: Settings',
    description: 'Configure the current document or folder, or choose Global defaults.',
    action: async () => {
      await openConfigForContext(plugin);
    },
  });

}

async function onDeactivate(_: ReactRNPlugin) { detachPosition?.(); detachPosition = undefined; detachAutoplayMenu?.(); detachAutoplayMenu = undefined; }

declareIndexPlugin(onActivate, onDeactivate);
