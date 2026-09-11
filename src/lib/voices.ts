import type { RNPlugin } from '@remnote/plugin-sdk';
import type { VoicePreference } from './config';

export type VoiceInfo = {
  name: string;
  lang: string;
  voiceURI?: string;
  default?: boolean;
  localService?: boolean;
};

export const VOICE_CACHE_KEY = 'rr-smart-tts:voices:session:v1';

function serializeVoice(voice: SpeechSynthesisVoice): VoiceInfo {
  return {
    name: voice.name,
    lang: voice.lang,
    voiceURI: voice.voiceURI,
    default: voice.default,
    localService: voice.localService,
  };
}

export function getLocalVoiceInfo(): VoiceInfo[] {
  try {
    return speechSynthesis.getVoices().map(serializeVoice);
  } catch {
    return [];
  }
}

export async function cacheAvailableVoices(plugin: RNPlugin): Promise<VoiceInfo[]> {
  const voices = getLocalVoiceInfo();
  if (voices.length > 0) {
    await plugin.storage.setSession(VOICE_CACHE_KEY, voices);
  }
  return voices;
}

export async function getCachedVoices(plugin: RNPlugin): Promise<VoiceInfo[]> {
  return (await plugin.storage.getSession<VoiceInfo[]>(VOICE_CACHE_KEY)) || [];
}

export function mergeVoiceLists(...lists: VoiceInfo[][]): VoiceInfo[] {
  const seen = new Set<string>();
  const merged: VoiceInfo[] = [];
  for (const list of lists) {
    for (const voice of list) {
      const key = `${voice.voiceURI || voice.name}\u0000${voice.lang}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(voice);
    }
  }
  return merged.sort((a, b) =>
    `${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`)
  );
}

/** Only pass voices obtained from the context that will perform playback. */
export function resolveVoice<T extends VoiceInfo>(voices: T[], preference: VoicePreference) {
  const language = preference.language.toLowerCase();
  const compatible = (voice: T) => !language || voice.lang.toLowerCase() === language;
  const selected = (preference.uri && voices.find((v) => v.voiceURI === preference.uri && compatible(v))) ||
    (preference.name && voices.find((v) => v.name === preference.name && compatible(v))) || undefined;
  const languageVoice = language ? voices.find((v) => v.lang.toLowerCase() === language) ||
    voices.find((v) => v.lang.toLowerCase().split('-')[0] === language.split('-')[0]) : undefined;
  const voice = selected || languageVoice;
  const fallback = Boolean((preference.name || preference.uri) && !selected);
  const status = fallback
    ? `Saved voice unavailable here. Using ${voice?.name || (language ? `the system voice for ${preference.language}` : 'the system default')}.`
    : voice ? `${voice.name} — ${voice.lang}` : language ? `System voice for ${preference.language}` : 'System default voice';
  return { voice, fallback, status };
}
