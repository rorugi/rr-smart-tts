import type { RNPlugin } from '@remnote/plugin-sdk';
import { detectVoicePlatform } from './platform';

// The Rem object is provided by the SDK at runtime, but SDK 0.0.46 does not
// export a public Rem type. Use a local compatibility alias for type checking.
type RemLike = any;

export type PhysicalSide = 'front' | 'back';
export type VoicePreference = { name: string; uri: string; language: string };

export type SmartTTSConfig = {
  enabled: boolean;
  autoPlayQuestion: boolean;
  autoPlayAnswer: boolean;
  autoPlayPhysicalFront: boolean;
  autoPlayPhysicalBack: boolean;
  pauseCloze: boolean;
  skipClozeQuestions: boolean;
  skipItalic: boolean;
  skipBold: boolean;
  removeParentheses: boolean;
  removeSquareBrackets: boolean;
  removeCurlyBraces: boolean;
  removeUrls: boolean;
  voiceName: string;
  frontVoice: VoicePreference;
  backVoice: VoicePreference;
  rate: number;
  pitch: number;
  frontRate: number;
  backRate: number;
  frontPitch: number;
  backPitch: number;
  volume: number;
  customRegex: string[];
  platformVoices?: Record<string, VoiceSettings>;
};
export type VoiceSettings = Pick<SmartTTSConfig, 'frontVoice' | 'backVoice'>;
const voiceSettings = (config: SmartTTSConfig): VoiceSettings => ({
  frontVoice: config.frontVoice, backVoice: config.backVoice,
});

export type ScopeKind = 'global' | 'document' | 'folder';

export type ConfigScope = {
  id: string;
  kind: ScopeKind;
  name: string;
};

export const GLOBAL_SCOPE_ID = '__global__';
const GLOBAL_KEY = 'rr-smart-tts:global:v1';
const SCOPE_PREFIX = 'rr-smart-tts:scope:v1:';
export const configStorageKey = (scopeId: string) => scopeId === GLOBAL_SCOPE_ID ? GLOBAL_KEY : `${SCOPE_PREFIX}${scopeId}`;

export const DEFAULT_CONFIG: SmartTTSConfig = {
  enabled: true,
  autoPlayQuestion: false,
  autoPlayAnswer: false,
  autoPlayPhysicalFront: false,
  autoPlayPhysicalBack: false,
  pauseCloze: false,
  skipClozeQuestions: false,
  skipItalic: true,
  skipBold: false,
  removeParentheses: true,
  removeSquareBrackets: true,
  removeCurlyBraces: true,
  removeUrls: false,
  voiceName: '',
  frontVoice: { name: '', uri: '', language: '' },
  backVoice: { name: '', uri: '', language: '' },
  rate: 1,
  pitch: 1,
  frontRate: 1,
  backRate: 1,
  frontPitch: 1,
  backPitch: 1,
  volume: 1,
  customRegex: [],
};

export const clampConfig = (value?: Partial<SmartTTSConfig> | null): SmartTTSConfig => {
  const raw = (value || {}) as Partial<SmartTTSConfig> & { autoPlayFront?: boolean; autoPlayBack?: boolean };
  const voice = (input?: VoicePreference): VoicePreference => ({
    name: typeof input?.name === 'string' ? input.name : typeof raw.voiceName === 'string' ? raw.voiceName : '',
    uri: typeof input?.uri === 'string' ? input.uri : '',
    language: typeof input?.language === 'string' ? input.language : '',
  });
  const number = (input: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(input ?? fallback);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // v0.1 compatibility: autoPlayFront/autoPlayBack meant question/answer phase.
    autoPlayQuestion: raw.autoPlayQuestion ?? raw.autoPlayFront ?? DEFAULT_CONFIG.autoPlayQuestion,
    autoPlayAnswer: raw.autoPlayAnswer ?? raw.autoPlayBack ?? DEFAULT_CONFIG.autoPlayAnswer,
    autoPlayPhysicalFront: raw.autoPlayPhysicalFront ?? DEFAULT_CONFIG.autoPlayPhysicalFront,
    autoPlayPhysicalBack: raw.autoPlayPhysicalBack ?? DEFAULT_CONFIG.autoPlayPhysicalBack,
    pauseCloze: raw.pauseCloze === true,
    skipClozeQuestions: raw.skipClozeQuestions === true,
    frontVoice: voice(raw.frontVoice),
    backVoice: voice(raw.backVoice),
    rate: number(raw.rate, DEFAULT_CONFIG.rate, 0.5, 2),
    pitch: number(raw.pitch, DEFAULT_CONFIG.pitch, 0, 2),
    frontRate: number(raw.frontRate, number(raw.rate, 1, 0.5, 2), 0.5, 2),
    backRate: number(raw.backRate, number(raw.rate, 1, 0.5, 2), 0.5, 2),
    frontPitch: number(raw.frontPitch, number(raw.pitch, 1, 0, 2), 0, 2),
    backPitch: number(raw.backPitch, number(raw.pitch, 1, 0, 2), 0, 2),
    volume: number(raw.volume, DEFAULT_CONFIG.volume, 0, 1),
    customRegex: Array.isArray(raw.customRegex) ? raw.customRegex.filter((x) => typeof x === 'string') : [],
  };
};

export async function getGlobalConfig(plugin: RNPlugin): Promise<SmartTTSConfig> {
  return resolvePlatformConfig(plugin, await plugin.storage.getSynced<Partial<SmartTTSConfig>>(GLOBAL_KEY));
}

export async function setGlobalConfig(plugin: RNPlugin, config: SmartTTSConfig) {
  await savePlatformConfig(plugin, GLOBAL_KEY, config);
}

async function resolvePlatformConfig(plugin: RNPlugin, raw?: Partial<SmartTTSConfig> | null): Promise<SmartTTSConfig> {
  const base = clampConfig(raw);
  const { key } = await detectVoicePlatform(plugin);
  const profile = base.platformVoices?.[key];
  return profile ? { ...base, ...voiceSettings(clampConfig({ ...base, ...profile })) } : base;
}

async function savePlatformConfig(plugin: RNPlugin, key: string, config: SmartTTSConfig) {
  const existing = clampConfig(await plugin.storage.getSynced<Partial<SmartTTSConfig>>(key));
  const platform = await detectVoicePlatform(plugin);
  // Keep legacy voices as fallback for platforms that have not been configured.
  // Read the stored map again so edits on this platform preserve other profiles.
  const next = clampConfig(config);
  await plugin.storage.setSynced(key, { ...next, ...voiceSettings(existing),
    platformVoices: { ...existing.platformVoices, [platform.key]: voiceSettings(next) } });
}

export async function getScopeConfig(plugin: RNPlugin, scopeId: string): Promise<SmartTTSConfig | null> {
  if (!scopeId || scopeId === GLOBAL_SCOPE_ID) return getGlobalConfig(plugin);
  const raw = await plugin.storage.getSynced<Partial<SmartTTSConfig> | null>(`${SCOPE_PREFIX}${scopeId}`);
  return raw ? resolvePlatformConfig(plugin, raw) : null;
}

export async function setScopeConfig(plugin: RNPlugin, scopeId: string, config: SmartTTSConfig) {
  if (scopeId === GLOBAL_SCOPE_ID) return setGlobalConfig(plugin, config);
  await savePlatformConfig(plugin, `${SCOPE_PREFIX}${scopeId}`, config);
}

export async function clearScopeConfig(plugin: RNPlugin, scopeId: string) {
  if (scopeId === GLOBAL_SCOPE_ID) {
    await plugin.storage.setSynced(GLOBAL_KEY, DEFAULT_CONFIG);
    return;
  }
  await plugin.storage.setSynced(`${SCOPE_PREFIX}${scopeId}`, null);
}

async function getRemName(plugin: RNPlugin, rem: RemLike): Promise<string> {
  try {
    return (await plugin.richText.toString(rem.text || [])) || 'Untitled';
  } catch {
    return 'Untitled';
  }
}

/**
 * Returns configuration targets from the nearest document/folder up to the root.
 * The first non-global entry is the most specific target.
 */
export async function getConfigScopes(plugin: RNPlugin, startRemId?: string): Promise<ConfigScope[]> {
  const scopes: ConfigScope[] = [];
  let rem: any = startRemId ? await plugin.rem.findOne(startRemId) : undefined;
  const seen = new Set<string>();

  for (let depth = 0; rem && depth < 80; depth += 1) {
    if (seen.has(rem._id)) break;
    seen.add(rem._id);

    let isDocument = false;
    let isFolder = false;
    try {
      [isDocument, isFolder] = await Promise.all([rem.isDocument(), rem.isFolder()]);
    } catch {
      // Some system rems do not expose every classification helper.
    }

    if (isDocument || isFolder) {
      scopes.push({
        id: rem._id,
        kind: isFolder ? 'folder' : 'document',
        name: await getRemName(plugin, rem),
      });
    }

    try {
      rem = await rem.getParentRem();
    } catch {
      rem = undefined;
    }
  }

  scopes.push({ id: GLOBAL_SCOPE_ID, kind: 'global', name: 'Global defaults' });
  return scopes;
}


export async function getInheritedConfigForScope(plugin: RNPlugin, scopeId: string): Promise<SmartTTSConfig> {
  if (!scopeId || scopeId === GLOBAL_SCOPE_ID) return getGlobalConfig(plugin);
  const scopeRem: any = await plugin.rem.findOne(scopeId);
  if (!scopeRem) return getGlobalConfig(plugin);
  let parent: any;
  try {
    parent = await scopeRem.getParentRem();
  } catch {
    parent = undefined;
  }
  if (!parent) return getGlobalConfig(plugin);
  return (await getEffectiveConfig(plugin, parent._id)).config;
}

/**
 * Effective settings use the most specific stored document/folder configuration.
 * If no scoped configuration exists, global defaults are used.
 */
export async function getEffectiveConfig(plugin: RNPlugin, startRemId?: string): Promise<{ config: SmartTTSConfig; source: ConfigScope; scopeIds: string[] }> {
  const scopes = await getConfigScopes(plugin, startRemId);
  const scopeIds = scopes.map((scope) => scope.id);
  for (const scope of scopes) {
    if (scope.id === GLOBAL_SCOPE_ID) {
      return { config: await getGlobalConfig(plugin), source: scope, scopeIds };
    }
    const scoped = await getScopeConfig(plugin, scope.id);
    if (scoped) return { config: scoped, source: scope, scopeIds };
  }
  return { config: DEFAULT_CONFIG, source: { id: GLOBAL_SCOPE_ID, kind: 'global', name: 'Global defaults' }, scopeIds };
}
