import { renderWidget, usePlugin, useRunAsync } from '@remnote/plugin-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../style.css';
import { displaySpeechText } from '../lib/pause';
import { CONTROLS_POSITION_KEY, ControlsPosition, getControlsPosition } from '../lib/controls_position';
import {
  ConfigScope,
  DEFAULT_CONFIG,
  GLOBAL_SCOPE_ID,
  SmartTTSConfig,
  PhysicalSide,
  VoicePreference,
  clearScopeConfig,
  getConfigScopes,
  getInheritedConfigForScope,
  getScopeConfig,
  setScopeConfig,
} from '../lib/config';
import { applyPlainTextFilters, validateRegexLines } from '../lib/filter';
import { speakText, stopSpeech } from '../lib/speech';
import { getLocalVoiceInfo, resolveVoice } from '../lib/voices';
import { getSemanticFrontText, getSemanticBackText } from '../lib/card_text';
import type { VoiceInfo } from '../lib/voices';

const SAMPLE_TEXT = 'घर [ghar] (masculine) means house. {grammar note} This italic/transliteration example can also be filtered before speech.';

function ConfigPopup() {
  const plugin = usePlugin();
  const [controlsPosition, setControlsPosition] = useState<ControlsPosition>('right');
  const [selectedScopeId, setSelectedScopeId] = useState(GLOBAL_SCOPE_ID);
  const [config, setConfig] = useState<SmartTTSConfig>(DEFAULT_CONFIG);
  const [hasOwnConfig, setHasOwnConfig] = useState(true);
  const [regexText, setRegexText] = useState('');
  const [previewInput, setPreviewInput] = useState(SAMPLE_TEXT);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [loadedScopeId, setLoadedScopeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewSide, setPreviewSide] = useState<PhysicalSide>('front');
  const [previewCard, setPreviewCard] = useState<{ rem: any; cardType: any }>();
  const [cardPreview, setCardPreview] = useState<{ original: string; spoken: string }>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewRequest = useRef(0);
  const mounted = useRef(true);
  const ready = loadedScopeId === selectedScopeId && !busy;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; previewRequest.current += 1; stopSpeech(); };
  }, []);

  const data = useRunAsync(async () => {
    const ctx = await plugin.widget.getWidgetContext<any>();
    const globalOnly = Boolean(ctx?.contextData?.globalOnly ?? ctx?.globalOnly);
    const remId = ctx?.contextData?.remId ?? ctx?.remId;
    const scopes = globalOnly
      ? [{ id: GLOBAL_SCOPE_ID, kind: 'global', name: 'Global defaults' } as ConfigScope]
      : await getConfigScopes(plugin, remId);
    const preferred = scopes.find((s) => s.kind === 'document') || scopes.find((s) => s.kind === 'folder') || scopes[0];
    const position = await getControlsPosition(plugin);
    return { ctx, scopes, preferred, position };
  }, []);

  useEffect(() => {
    if (!data?.preferred) return;
    setSelectedScopeId(data.preferred.id);
    setControlsPosition(data.position);
  }, [data?.preferred?.id]);

  useEffect(() => {
    let cancelled = false;
    setLoadedScopeId('');
    setError('');
    const load = async () => {
      try {
        const own = await getScopeConfig(plugin, selectedScopeId);
        const next = own || await getInheritedConfigForScope(plugin, selectedScopeId);
        if (cancelled) return;
        setConfig(next);
        setHasOwnConfig(Boolean(own));
        setRegexText(next.customRegex.join('\n'));
        setLoadedScopeId(selectedScopeId);
      } catch {
        if (!cancelled) setError('Could not load this scope. Select it again to retry.');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [plugin, selectedScopeId]);

  const reloadVoices = useCallback((showStatus = false) => {
    const local = getLocalVoiceInfo();
    setVoices(local);
    if (showStatus) setVoiceStatus(local.length
      ? local.length + ' voices available in this popup. Review playback checks availability again.'
      : 'No voices exposed here yet. Try reload, or choose a language for the system voice.');
  }, []);

  useEffect(() => {
    const handler = () => reloadVoices(false);
    handler();
    let attempts = 0;
    const timer = setInterval(() => {
      handler();
      if (++attempts >= 12) clearInterval(timer);
    }, 500);
    globalThis.speechSynthesis?.addEventListener?.('voiceschanged', handler);
    return () => {
      clearInterval(timer);
      globalThis.speechSynthesis?.removeEventListener?.('voiceschanged', handler);
    };
  }, [reloadVoices]);

  const regexLines = useMemo(() => regexText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [regexText]);
  const invalidRegex = useMemo(() => validateRegexLines(regexLines), [regexLines]);
  const liveConfig = useMemo(() => ({ ...config, customRegex: regexLines }), [config, regexLines]);
  const preview = previewCard ? cardPreview?.spoken || '' : applyPlainTextFilters(previewInput, liveConfig);

  useEffect(() => {
    let cancelled = false;
    setCardPreview(undefined);
    stopSpeech();
    if (!previewCard) return;
    const extract = previewSide === 'front' ? getSemanticFrontText : getSemanticBackText;
    const unfiltered = {
      ...liveConfig, pauseCloze: false, skipItalic: false, skipBold: false, removeParentheses: false,
      removeSquareBrackets: false, removeCurlyBraces: false, removeUrls: false, customRegex: [],
    };
    void Promise.all([
      extract(plugin, previewCard.rem, previewCard.cardType, unfiltered),
      extract(plugin, previewCard.rem, previewCard.cardType, liveConfig),
    ]).then(([original, spoken]) => {
      if (!cancelled) setCardPreview({ original, spoken });
    }).catch(() => { if (!cancelled) setError('Could not prepare this card preview.'); });
    return () => { cancelled = true; };
  }, [plugin, previewCard, previewSide, liveConfig]);

  const loadCurrentCard = async () => {
    const request = ++previewRequest.current;
    setPreviewBusy(true);
    setError('');
    stopSpeech();
    try {
      const card = await plugin.queue.getCurrentCard();
      const rem = await card?.getRem();
      const cardType = await card?.getType();
      if (request !== previewRequest.current || !mounted.current) return;
      if (!rem) { setError('Open a flashcard review to preview the current card.'); return; }
      setPreviewCard({ rem, cardType });
    } catch {
      if (mounted.current) setError('Could not load the current card.');
    } finally {
      if (mounted.current && request === previewRequest.current) setPreviewBusy(false);
    }
  };

  const save = async (inherit = false) => {
    if (!ready || (!inherit && invalidRegex.length)) return;
    setBusy(true);
    setError('');
    try {
      if (inherit) {
        await clearScopeConfig(plugin, selectedScopeId);
        const next = await getInheritedConfigForScope(plugin, selectedScopeId);
        if (!mounted.current) return;
        setConfig(next);
        setRegexText(next.customRegex.join('\n'));
        setHasOwnConfig(false);
      } else {
        await setScopeConfig(plugin, selectedScopeId, liveConfig);
        if (controlsPosition !== await getControlsPosition(plugin)) {
          await plugin.storage.setSynced(CONTROLS_POSITION_KEY, controlsPosition);
        }
        if (!mounted.current) return;
        setHasOwnConfig(true);
      }
      await plugin.app.toast(inherit ? 'Scope override removed.' : 'RR Smart TTS settings saved.');
    } catch {
      if (mounted.current) setError('Could not save settings. Please try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const update = <K extends keyof SmartTTSConfig>(key: K, value: SmartTTSConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  const voiceKey = (voice: { name: string; voiceURI?: string; lang: string }) =>
    JSON.stringify([voice.voiceURI || '', voice.name, voice.lang]);
  const voiceFields = (side: PhysicalSide) => {
    const field = side === 'front' ? 'frontVoice' : 'backVoice';
    const preference = config[field];
    const chosen = voices.find((v) =>
      (preference.uri ? v.voiceURI === preference.uri : v.name === preference.name) &&
      (!preference.language || v.lang.toLowerCase() === preference.language.toLowerCase()));
    const saved = Boolean(preference.name || preference.uri);
    const value = chosen ? voiceKey(chosen) : saved ? '__saved__' : '';
    const change = (next: VoicePreference) => update(field, next);
    return (
      <div className="rr-tts-field" key={side}>
        <label htmlFor={side + '-voice'}>{side === 'front' ? 'Front' : 'Back'} voice</label>
        <select id={side + '-voice'} className="rr-tts-select" value={value} onChange={(e) => {
          const voice = voices.find((v) => voiceKey(v) === e.target.value);
          change(voice ? { name: voice.name, uri: voice.voiceURI || '', language: voice.lang }
            : { name: '', uri: '', language: preference.language });
        }}>
          <option value="">Automatic for chosen language</option>
          {saved && !chosen && <option value="__saved__">{preference.name || preference.uri} (unavailable here)</option>}
          {voices.map((voice) => <option key={voiceKey(voice)} value={voiceKey(voice)}>{voice.name} — {voice.lang}</option>)}
        </select>
        <label htmlFor={side + '-language'}>{side === 'front' ? 'Front' : 'Back'} language</label>
        <input id={side + '-language'} className="rr-tts-input" list="rr-tts-languages"
          placeholder="System default, or e.g. hi-IN / en-US" value={preference.language}
          onChange={(e) => change({ ...preference, language: e.target.value.trim() })} />
        <div className="rr-tts-scope-note">{resolveVoice(voices, preference).status}</div>
      </div>
    );
  };

  if (!data) return <div className="rr-tts-panel rr-tts-panel-loading">Loading RR Smart TTS settings…</div>;

  return (
    <div className="rr-tts-panel">
      <div className="rr-tts-panel-body">
      <h1 className="rr-tts-title">RR Smart TTS</h1>
      <p className="rr-tts-subtitle">
        Filter flashcard text before it is spoken. Settings are stored by stable RemNote IDs, so renaming a document or folder does not lose its configuration.
      </p>

      <div className="rr-tts-field">
        <label>Configuration scope</label>
        <select className="rr-tts-select" disabled={busy} value={selectedScopeId} onChange={(e) => setSelectedScopeId(e.target.value)}>
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

      {error && <div className="rr-tts-warning" role="alert">{error}</div>}
      {!ready && <div role="status">{busy ? 'Saving…' : 'Loading settings…'}</div>}
      <fieldset className="rr-tts-settings" disabled={!ready}>
      <div className="rr-tts-section">
        <h3>Playback</h3>
        <div className="rr-tts-field">
          <label htmlFor="controls-position">Controls position</label>
          <select id="controls-position" className="rr-tts-select" value={controlsPosition} onChange={(e) => setControlsPosition(e.target.value as ControlsPosition)}>
            <option value="right">Right</option>
            <option value="under">Flashcard Under</option>
          </select>
          <div className="rr-tts-scope-note">Applies to all decks. Save to move the controls. Right stacks the buttons vertically.</div>
        </div>
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
        <div className="rr-tts-grid">{voiceFields('front')}{voiceFields('back')}</div>
        <datalist id="rr-tts-languages">
          {Array.from(new Set(voices.map((v) => v.lang))).sort().map((lang) => <option key={lang} value={lang} />)}
        </datalist>
        <div className="rr-tts-row">
          <button className="rr-tts-button" type="button" onClick={() => reloadVoices(true)}>↻ Reload voices</button>
          <span className="rr-tts-scope-note" role="status">{voiceStatus || voices.length + ' local voices discovered.'}</span>
        </div>
        <p className="rr-tts-scope-note">These settings follow the physical sides, including backward cards. The chosen language is kept when a voice is unavailable on another device.</p>
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
        <label className="rr-tts-check"><input type="checkbox" checked={config.pauseCloze} onChange={(e) => update('pauseCloze', e.target.checked)} /> Pause at hidden cloze (0.5 seconds) instead of saying “blank”</label>
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
        <div className="rr-tts-row">
          <button className="rr-tts-button" disabled={previewBusy} onClick={() => void loadCurrentCard()}>
            {previewBusy ? 'Loading card…' : 'Preview current card'}
          </button>
          <button className="rr-tts-button" onClick={() => {
            previewRequest.current += 1; setPreviewBusy(false); setPreviewCard(undefined);
          }}>Use sample text</button>
          <label>Side <select className="rr-tts-select" value={previewSide}
            onChange={(e) => setPreviewSide(e.target.value as PhysicalSide)}>
            <option value="front">Front</option><option value="back">Back</option>
          </select></label>
        </div>
        {previewCard ? <>
          <p>Original card text</p>
          <div className="rr-tts-preview">{cardPreview?.original ?? 'Preparing card preview…'}</div>
        </> : <div className="rr-tts-field">
          <textarea aria-label="Sample text" className="rr-tts-textarea" value={previewInput} onChange={(e) => setPreviewInput(e.target.value)} />
          <div className="rr-tts-scope-note">Sample text tests content filters. Preview a current card to test italic and bold filtering too.</div>
        </div>}
        <p>Spoken text</p>
        <div className="rr-tts-preview">{previewCard && !cardPreview ? 'Preparing…' : displaySpeechText(preview) || 'Nothing remains after filtering.'}</div>
        <div className="rr-tts-row" style={{ marginTop: 10 }}>
          <button className="rr-tts-button" disabled={previewBusy || Boolean(previewCard && !cardPreview) || !preview || invalidRegex.length > 0}
            onClick={() => speakText(preview, liveConfig, previewSide, setVoiceStatus)}>▶ Test {previewSide}</button>
          <button className="rr-tts-button" onClick={stopSpeech}>■ Stop</button>
        </div>
      </div>
      </fieldset>
      </div>

      <div className="rr-tts-row rr-tts-panel-footer">
        <button
          className="rr-tts-button rr-tts-button-primary"
          disabled={!ready || invalidRegex.length > 0}
          onClick={() => void save()}
        >
          Save
        </button>
        {selectedScopeId !== GLOBAL_SCOPE_ID && (
          <button
            className="rr-tts-button"
            disabled={!ready}
            onClick={() => void save(true)}
          >
            Use inherited settings
          </button>
        )}
        <div className="rr-tts-spacer" />
        <button className="rr-tts-button" disabled={busy} onClick={() => { stopSpeech(); void plugin.widget.closePopup(); }}>Close</button>
      </div>
    </div>
  );
}

renderWidget(ConfigPopup);
