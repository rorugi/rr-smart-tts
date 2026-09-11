import type { RNPlugin } from '@remnote/plugin-sdk';

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
      const key = `${voice.name}\u0000${voice.lang}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(voice);
    }
  }
  return merged.sort((a, b) =>
    `${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`)
  );
}
