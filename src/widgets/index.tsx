import {
  declareIndexPlugin,
  PluginCommandMenuLocation,
  type ReactRNPlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import '../style.css';
import { getConfigScopes, getEffectiveConfig, getScopeConfig, setScopeConfig } from '../lib/config';

async function openConfigForContext(plugin: ReactRNPlugin, remId?: string, cardId?: string) {
  await plugin.widget.openPopup('config_popup', { remId, cardId });
}

async function onActivate(plugin: ReactRNPlugin) {
  // QueueToolbar stays with RemNote's fixed review controls instead of scrolling with card content.
  await plugin.app.registerWidget('smart_tts', WidgetLocation.QueueToolbar, {
    dimensions: { height: 'auto', width: 'auto' },
  });

  await plugin.app.registerWidget('config_popup', WidgetLocation.Popup, {
    dimensions: { height: 860, width: 820 },
  });

  await plugin.app.registerMenuItem({
    id: 'rr-smart-tts-configure',
    name: 'RR Smart TTS: Configure current document / folder',
    location: PluginCommandMenuLocation.QueueMenu,
    action: async ({ remId, cardId }: { remId?: string; cardId?: string }) => {
      await openConfigForContext(plugin, remId, cardId);
    },
  });

  await plugin.app.registerMenuItem({
    id: 'rr-smart-tts-toggle-autoplay',
    name: 'RR Smart TTS: Toggle question/answer auto-play for current scope',
    location: PluginCommandMenuLocation.QueueMenu,
    action: async ({ remId }: { remId?: string }) => {
      const scopes = await getConfigScopes(plugin, remId);
      const target = scopes.find((scope) => scope.kind !== 'global');
      if (!target) {
        await plugin.app.toast('RR Smart TTS: No document or folder scope found.');
        return;
      }
      const existing = await getScopeConfig(plugin, target.id);
      const effective = existing || (await getEffectiveConfig(plugin, remId)).config;
      const nextEnabled = !(effective.autoPlayQuestion && effective.autoPlayAnswer);
      const next = { ...effective, autoPlayQuestion: nextEnabled, autoPlayAnswer: nextEnabled };
      await setScopeConfig(plugin, target.id, next);
      await plugin.app.toast(
        `RR Smart TTS question/answer auto-play ${nextEnabled ? 'enabled' : 'disabled'} for ${target.name}.`
      );
    },
  });

  await plugin.app.registerCommand({
    id: 'rr-smart-tts-global-settings',
    name: 'RR Smart TTS: Global settings',
    description: 'Open the global defaults for RR Smart TTS.',
    action: async () => {
      await plugin.widget.openPopup('config_popup', { globalOnly: true });
    },
  });

}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
