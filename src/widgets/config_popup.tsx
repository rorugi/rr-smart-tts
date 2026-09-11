import { WidgetLocation, renderWidget, usePlugin, useRunAsync } from '@remnote/plugin-sdk';
import { useCallback, useEffect, useState } from 'react';
import '../style.css';
import {
  ConfigScope,
  DEFAULT_CONFIG,
  GLOBAL_SCOPE_ID,
  SmartTTSConfig,
  clearScopeConfig,
  getConfigScopes,
  getEffectiveConfig,
  getGlobalConfig,
  getInheritedConfigForScope,
  getScopeConfig,
  setScopeConfig,
} from '../lib/config';
import { applyPlainTextFilters, validateRegexLines } from '../lib/filter';
import { speakText, stopSpeech } from '../lib/speech';
import { cacheAvailableVoices, getCachedVoices, getLocalVoiceInfo, mergeVoiceLists } from '../lib/voices';
import type { VoiceInfo } from '../lib/voices';

const SAMPLE_TEXT = 'घर [ghar] (masculine) means house. {grammar note} This italic/transliteration example can also be filtered before speech.';

function ConfigPopup() {
  const plugin = usePlugin();
  const [selectedScopeId, setSelectedScopeId] = useState(GLOBAL_SCOPE_ID);
  const [config, setConfig] = useState<SmartTTSConfig>(DEFAULT_CONFIG);
  const [hasOwnConfig, setHasOwnConfig] = useState(true);
  const [regexText, setRegexText] = useState('');
  const [previewInput, setPreviewInput] = useState(SAMPLE_TEXT);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voiceStatus, setVoiceStatus] = useState('');

  const data = useRunAsync(async () => {
    const ctx = await plugin.widget.getWidgetContext<any>();
    const globalOnly = Boolean(ctx?.contextData?.globalOnly ?? ctx?.globalOnly);
    const remId = ctx?.contextData?.remId ?? ctx?.remId;
    const scopes = globalOnly
      ? [{ id: GLOBAL_SCOPE_ID, kind: 'global', name: 'Global defaults' } as ConfigScope]
      : await getConfigScopes(plugin, remId);
    const preferred = scopes.find((s) => s.kind === 'document') || scopes.find((s) => s.kind === 'folder') || scopes[0];
    return { ctx, scopes, preferred };
  }, []);

  useEffect(() => {
    if (!data?.preferred) return;
    setSelectedScopeId(data.preferred.id);
  }, [data?.preferred?.id]);

  useEffect(() => {
    const load = async () => {
      if (!selectedScopeId) return;
      if (selectedScopeId === GLOBAL_SCOPE_ID) {
        const global = await getGlobalConfig(plugin);
        setConfig(global);
        setHasOwnConfig(true);
        setRegexText(global.customRegex.join('\n'));
        return;
      }
      const own = await getScopeConfig(plugin, selectedScopeId);
      if (own) {
        setConfig(own);
        setHasOwnConfig(true);
        setRegexText(own.customRegex.join('\n'));
      } else {
        const inherited = await getInheritedConfigForScope(plugin, selectedScopeId);
        setConfig(inherited);
        setHasOwnConfig(false);
        setRegexText(inherited.customRegex.join('\n'));
      }
    };
    void load();
  }, [plugin, selectedScopeId, data]);

  const reloadVoices = useCallback(async (showStatus = false) => {
    const local = getLocalVoiceInfo();
    if (local.length > 0) {
      await cacheAvailableVoices(plugin);
    }
    const cached = await getCachedVoices(plugin);
    const merged = mergeVoiceLists(local, cached);
    setVoices(merged);
    if (showStatus) {
      setVoiceStatus(
        merged.length > 0
          ? `${merged.length} voice${merged.length === 1 ? '' : 's'} available.`
          : 'No voices exposed in this popup yet. Try reload again; RR Smart TTS also imports voices discovered by RemNote\'s main plugin context.'
      );
    }
  }, [plugin]);

  useEffect(() => {
    const handler = () => void reloadVoices(false);
    void reloadVoices(false);

    // Some Chromium/RemNote contexts populate voices asynchronously and do not
    // reliably fire voiceschanged, so retry briefly as a fallback.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      void reloadVoices(false);
      if (attempts >= 12) clearInterval(timer);
    }, 500);

    speechSynthesis.addEventListener?.('voiceschanged', handler);
    return () => {
      clearInterval(timer);
      speechSynthesis.removeEventListener?.('voiceschanged', handler);
    };
  }, [reloadVoices]);

  const regexLines = regexText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const invalidRegex = validateRegexLines(regexLines);
  const liveConfig = { ...config, customRegex: regexLines };
  const preview = applyPlainTextFilters(previewInput, liveConfig);

  const update = <K extends keyof SmartTTSConfig>(key: K, value: SmartTTSConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  if (!data) return <div className="rr-tts-panel">Loading RR Smart TTS settings…</div>;

  return (
    <div className="rr-tts-panel">
      <h1 className="rr-tts-title">RR Smart TTS</h1>
      <p className="rr-tts-subtitle">
        Filter flashcard text before it is spoken. Settings are stored by stable RemNote IDs, so renaming a document or folder does not lose its configuration.
      </p>

      <div className="rr-tts-field">
        <label>Configuration scope</label>
        <select className="rr-tts-select" value={selectedScopeId} onChange={(e) => setSelectedScopeId(e.target.value)}>
          {data.scopes.map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.kind === 'global' ? 'Global' : scope.kind === 'document' ? 'Document' : 'Folder'} — {scope.name}
            </option>
          ))}
        </select>
        <div className="rr-tts-scope-note">
          {selectedScopeId === GLOBAL_SCOPE_ID
            ? 'Used when no document or folder override exists.'
            : hasOwnConfig
            ? 'This scope has its own RR Smart TTS configuration.'
            : 'No override is stored here yet. The form currently shows inherited values; Save creates an override.'}
        </div>
      </div>

      <div className="rr-tts-section">
        <h3>Playback</h3>
        <div className="rr-tts-grid">
          <label className="rr-tts-check"><input type="checkbox" checked={config.enabled} onChange={(e) => update('enabled', e.target.checked)} /> Enable RR Smart TTS</label>
          <label className="rr-tts-check"><input type="checkbox" checked={config.autoPlayQuestion} onChange={(e) => update('autoPlayQuestion', e.target.checked)} /> Auto-play question phase</label>
          <label className="rr-tts-check"><input type="checkbox" checked={config.autoPlayAnswer} onChange={(e) => update('autoPlayAnswer', e.target.checked)} /> Auto-play answer phase</label>
          <label className="rr-tts-check"><input type="checkbox" checked={config.autoPlayPhysicalFront} onChange={(e) => update('autoPlayPhysicalFront', e.target.checked)} /> Auto-play physical front side</label>
          <label className="rr-tts-check"><input type="checkbox" checked={config.autoPlayPhysicalBack} onChange={(e) => update('autoPlayPhysicalBack', e.target.checked)} /> Auto-play physical back side</label>
        </div>
        <div className="rr-tts-scope-note">
          Question/Answer follow the current review phase. Physical Front/Back always follow the card side, so a backward card can speak its front only after the answer is revealed. Overlapping rules never speak the same phase twice.
        </div>
        <div className="rr-tts-field">
          <label>Voice</label>
          <div className="rr-tts-voice-row">
            <select className="rr-tts-select" value={config.voiceName} onChange={(e) => update('voiceName', e.target.value)}>
              <option value="">System default</option>
              {config.voiceName && !voices.some((voice) => voice.name === config.voiceName) && (
                <option value={config.voiceName}>{config.voiceName} (saved; currently unavailable)</option>
              )}
              {voices.map((voice) => (
                <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                  {voice.name} — {voice.lang}
                </option>
              ))}
            </select>
            <button
              className="rr-tts-icon-button"
              type="button"
              title="Reload available voices"
              aria-label="Reload available voices"
              onClick={() => void reloadVoices(true)}
            >
              ↻
            </button>
          </div>
          <div className="rr-tts-scope-note">
            {voiceStatus || `${voices.length} voice${voices.length === 1 ? '' : 's'} discovered.`}
          </div>
        </div>
        <div className="rr-tts-grid">
          <div className="rr-tts-field">
            <label>Rate: {config.rate.toFixed(2)}×</label>
            <input type="range" min="0.5" max="2" step="0.05" value={config.rate} onChange={(e) => update('rate', Number(e.target.value))} />
          </div>
          <div className="rr-tts-field">
            <label>Pitch: {config.pitch.toFixed(2)}</label>
            <input type="range" min="0" max="2" step="0.05" value={config.pitch} onChange={(e) => update('pitch', Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="rr-tts-section">
        <h3>Formatting filters</h3>
        <div className="rr-tts-grid">
          <label className="rr-tts-check"><input type="checkbox" checked={config.skipItalic} onChange={(e) => update('skipItalic', e.target.checked)} /> Skip italic text</label>
          <label className="rr-tts-check"><input type="checkbox" checked={config.skipBold} onChange={(e) => update('skipBold', e.target.checked)} /> Skip bold text</label>
        </div>
      </div>

      <div className="rr-tts-section">
        <h3>Content filters</h3>
        <div className="rr-tts-grid">
          <label className="rr-tts-check"><input type="checkbox" checked={config.removeParentheses} onChange={(e) => update('removeParentheses', e.target.checked)} /> Remove (parentheses)</label>
          <label className="rr-tts-check"><input type="checkbox" checked={config.removeSquareBrackets} onChange={(e) => update('removeSquareBrackets', e.target.checked)} /> Remove [square brackets]</label>
          <label className="rr-tts-check"><input type="checkbox" checked={config.removeCurlyBraces} onChange={(e) => update('removeCurlyBraces', e.target.checked)} /> Remove {'{curly braces}'}</label>
          <label className="rr-tts-check"><input type="checkbox" checked={config.removeUrls} onChange={(e) => update('removeUrls', e.target.checked)} /> Remove URLs</label>
        </div>
        <div className="rr-tts-field">
          <label>Custom removal regex — one JavaScript regular expression per line, without /delimiters/</label>
          <textarea className="rr-tts-textarea" value={regexText} onChange={(e) => setRegexText(e.target.value)} placeholder={'Example:\\bIPA:\\s*[^,.;]+'} />
          {invalidRegex.length > 0 && <div className="rr-tts-warning">Invalid pattern(s): {invalidRegex.join(' · ')}</div>}
        </div>
      </div>

      <div className="rr-tts-section">
        <h3>Filter preview</h3>
        <div className="rr-tts-field">
          <textarea className="rr-tts-textarea" value={previewInput} onChange={(e) => setPreviewInput(e.target.value)} />
        </div>
        <div className="rr-tts-preview">{preview || 'Nothing remains after filtering.'}</div>
        <div className="rr-tts-row" style={{ marginTop: 10 }}>
          <button className="rr-tts-button" onClick={() => speakText(preview, liveConfig)}>▶ Test preview</button>
          <button className="rr-tts-button" onClick={stopSpeech}>■ Stop</button>
        </div>
      </div>

      <div className="rr-tts-row rr-tts-section">
        <button
          className="rr-tts-button rr-tts-button-primary"
          disabled={invalidRegex.length > 0}
          onClick={async () => {
            await setScopeConfig(plugin, selectedScopeId, liveConfig);
            setHasOwnConfig(true);
            await plugin.app.toast('RR Smart TTS settings saved.');
          }}
        >
          Save
        </button>
        {selectedScopeId !== GLOBAL_SCOPE_ID && (
          <button
            className="rr-tts-button"
            onClick={async () => {
              await clearScopeConfig(plugin, selectedScopeId);
              setHasOwnConfig(false);
              const inherited = await getInheritedConfigForScope(plugin, selectedScopeId);
              setConfig(inherited);
              setRegexText(inherited.customRegex.join('\n'));
              await plugin.app.toast('Scope override removed.');
            }}
          >
            Use inherited settings
          </button>
        )}
        <div className="rr-tts-spacer" />
        <button className="rr-tts-button" onClick={() => plugin.widget.closePopup()}>Close</button>
      </div>
    </div>
  );
}

renderWidget(ConfigPopup);
