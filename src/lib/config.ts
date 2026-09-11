import type { RNPlugin } from '@remnote/plugin-sdk';

// The Rem object is provided by the SDK at runtime, but SDK 0.0.46 does not
// export a public Rem type. Use a local compatibility alias for type checking.
type RemLike = any;

export type SmartTTSConfig = {
  enabled: boolean;
  autoPlayQuestion: boolean;
  autoPlayAnswer: boolean;
  autoPlayPhysicalFront: boolean;
  autoPlayPhysicalBack: boolean;
  skipItalic: boolean;
  skipBold: boolean;
  removeParentheses: boolean;
  removeSquareBrackets: boolean;
  removeCurlyBraces: boolean;
  removeUrls: boolean;
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  customRegex: string[];
};

export type ScopeKind = 'global' | 'document' | 'folder';

export type ConfigScope = {
  id: string;
  kind: ScopeKind;
  name: string;
};

export const GLOBAL_SCOPE_ID = '__global__';
const GLOBAL_KEY = 'rr-smart-tts:global:v1';
const SCOPE_PREFIX = 'rr-smart-tts:scope:v1:';

export const DEFAULT_CONFIG: SmartTTSConfig = {
  enabled: true,
  autoPlayQuestion: false,
  autoPlayAnswer: false,
  autoPlayPhysicalFront: false,
  autoPlayPhysicalBack: false,
  skipItalic: true,
  skipBold: false,
  removeParentheses: true,
  removeSquareBrackets: true,
  removeCurlyBraces: true,
  removeUrls: false,
  voiceName: '',
  rate: 1,
  pitch: 1,
  volume: 1,
  customRegex: [],
};

export const clampConfig = (value?: Partial<SmartTTSConfig> | null): SmartTTSConfig => {
  const raw = (value || {}) as Partial<SmartTTSConfig> & { autoPlayFront?: boolean; autoPlayBack?: boolean };
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // v0.1 compatibility: autoPlayFront/autoPlayBack meant question/answer phase.
    autoPlayQuestion: raw.autoPlayQuestion ?? raw.autoPlayFront ?? DEFAULT_CONFIG.autoPlayQuestion,
    autoPlayAnswer: raw.autoPlayAnswer ?? raw.autoPlayBack ?? DEFAULT_CONFIG.autoPlayAnswer,
    autoPlayPhysicalFront: raw.autoPlayPhysicalFront ?? DEFAULT_CONFIG.autoPlayPhysicalFront,
    autoPlayPhysicalBack: raw.autoPlayPhysicalBack ?? DEFAULT_CONFIG.autoPlayPhysicalBack,
    rate: Math.min(2, Math.max(0.5, Number(raw.rate ?? DEFAULT_CONFIG.rate))),
    pitch: Math.min(2, Math.max(0, Number(raw.pitch ?? DEFAULT_CONFIG.pitch))),
    volume: Math.min(1, Math.max(0, Number(raw.volume ?? DEFAULT_CONFIG.volume))),
    customRegex: Array.isArray(raw.customRegex) ? raw.customRegex.filter((x) => typeof x === 'string') : [],
  };
};

export async function getGlobalConfig(plugin: RNPlugin): Promise<SmartTTSConfig> {
  return clampConfig(await plugin.storage.getSynced<Partial<SmartTTSConfig>>(GLOBAL_KEY));
}

export async function setGlobalConfig(plugin: RNPlugin, config: SmartTTSConfig) {
  await plugin.storage.setSynced(GLOBAL_KEY, clampConfig(config));
}

export async function getScopeConfig(plugin: RNPlugin, scopeId: string): Promise<SmartTTSConfig | null> {
  if (!scopeId || scopeId === GLOBAL_SCOPE_ID) return getGlobalConfig(plugin);
  const raw = await plugin.storage.getSynced<Partial<SmartTTSConfig> | null>(`${SCOPE_PREFIX}${scopeId}`);
  return raw ? clampConfig(raw) : null;
}

export async function setScopeConfig(plugin: RNPlugin, scopeId: string, config: SmartTTSConfig) {
  if (scopeId === GLOBAL_SCOPE_ID) return setGlobalConfig(plugin, config);
  await plugin.storage.setSynced(`${SCOPE_PREFIX}${scopeId}`, clampConfig(config));
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
export async function getEffectiveConfig(plugin: RNPlugin, startRemId?: string): Promise<{ config: SmartTTSConfig; source: ConfigScope }> {
  const scopes = await getConfigScopes(plugin, startRemId);
  for (const scope of scopes) {
    if (scope.id === GLOBAL_SCOPE_ID) {
      return { config: await getGlobalConfig(plugin), source: scope };
    }
    const scoped = await getScopeConfig(plugin, scope.id);
    if (scoped) return { config: scoped, source: scope };
  }
  return { config: DEFAULT_CONFIG, source: { id: GLOBAL_SCOPE_ID, kind: 'global', name: 'Global defaults' } };
}
