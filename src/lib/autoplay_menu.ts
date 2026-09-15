import { PluginCommandMenuLocation, type ReactRNPlugin } from '@remnote/plugin-sdk';
import { getConfigScopes, getEffectiveConfig, setScopeConfig, type SmartTTSConfig } from './config';

export const hasAutoplay = (config: SmartTTSConfig) =>
  config.autoPlayQuestion || config.autoPlayAnswer || config.autoPlayPhysicalFront || config.autoPlayPhysicalBack;

export async function registerAutoplayMenu(plugin: ReactRNPlugin) {
  let disposed = false, busy = false, lastName = '';
  const update = async (remId?: string) => {
    if (disposed || busy) return;
    busy = true;
    try {
      if (!remId) {
        try { remId = (await (await plugin.queue.getCurrentCard())?.getRem())?._id; }
        catch { /* Queue may not be open during activation. */ }
      }
      const config = remId ? (await getEffectiveConfig(plugin, remId)).config : undefined;
      const name = 'RR Smart TTS: ' + (config ? 'Auto-Play ' + (hasAutoplay(config) ? 'Off' : 'On') : 'Toggle Auto-Play');
      if (disposed || name === lastName) return;
      await plugin.app.registerMenuItem({
        id: 'rr-smart-tts-toggle-autoplay', name, location: PluginCommandMenuLocation.QueueMenu,
        action: async ({ remId }: { remId?: string }) => {
          if (!remId) remId = (await (await plugin.queue.getCurrentCard())?.getRem())?._id;
          const scopes = await getConfigScopes(plugin, remId);
          const target = scopes.find(scope => scope.kind !== 'global');
          if (!target) { await plugin.app.toast('RR Smart TTS: No document or folder scope found.'); return; }
          const { config } = await getEffectiveConfig(plugin, remId);
          const enabled = !hasAutoplay(config);
          await setScopeConfig(plugin, target.id, { ...config,
            autoPlayQuestion: enabled, autoPlayAnswer: enabled,
            autoPlayPhysicalFront: false, autoPlayPhysicalBack: false });
          await update(remId);
          await plugin.app.toast(`RR Smart TTS Auto-Play ${enabled ? 'On' : 'Off'} for ${target.name}.`);
        },
      });
      lastName = name;
    } finally { busy = false; }
  };
  await update();
  // No per-open label callback exists in the SDK. Reconcile current-card and
  // inherited-setting changes, serially, without re-registering unchanged labels.
  const timer = setInterval(() => { void update().catch(() => {}); }, 750);
  return () => { disposed = true; clearInterval(timer); };
}
