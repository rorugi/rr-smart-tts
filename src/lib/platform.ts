import type { RNPlugin } from '@remnote/plugin-sdk';

export type VoicePlatform = { key: string; label: string };
const cache = new WeakMap<RNPlugin, Promise<VoicePlatform>>();
export function detectVoicePlatform(plugin: RNPlugin): Promise<VoicePlatform> {
  let result = cache.get(plugin);
  if (!result) {
    result = (async () => {
      const [platform, operatingSystem] = await Promise.all([
        plugin.app?.getPlatform?.().catch(() => undefined),
        plugin.app?.getOperatingSystem?.().catch(() => undefined),
      ]);
      const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
      const os = operatingSystem || (/Android/i.test(ua) ? 'android' : /iPhone|iPad/i.test(ua) ? 'ios' : /Windows/i.test(ua) ? 'windows' : /Macintosh/i.test(ua) ? 'mac' : /Linux/i.test(ua) ? 'linux' : 'unknown');
      const labels: Record<string, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS', unknown: 'Unknown OS' };
      // App/web comes from RemNote, not iframe/native-widget mode.
      const mode = platform || 'unknown';
      const browser = /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Edg/i.test(ua) ? 'Edge' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /OPR|Opera/i.test(ua) ? 'Opera' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Browser';
      return { key: mode + ':' + os + (mode === 'web' ? ':' + browser.toLowerCase().replace(/ /g, '-') : ''),
        label: labels[os] + (mode === 'app' ? ' app' : mode === 'web' ? ' · ' + browser : ' · platform unavailable') };
    })();
    cache.set(plugin, result);
  }
  return result;
}
