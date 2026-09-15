import type { PhysicalSide, SmartTTSConfig } from './config';
import { resolveVoice } from './voices';
import { CLOZE_PAUSE } from './pause';

let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let current: SpeechSynthesisUtterance | undefined;

export function stopSpeech() {
  generation += 1;
  if (current) { current.onend = null; current.onerror = null; }
  current = undefined;
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = undefined;
  try { globalThis.speechSynthesis?.cancel(); } catch { /* Engine unavailable. */ }
}

function play(text: string, config: SmartTTSConfig, side: PhysicalSide, report: (status: string) => void, done = () => {}) {
  if (!text.trim()) { report('Nothing remains after filtering.'); return; }
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
    report('Speech is not available in this RemNote context.');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  const preference = side === 'front' ? config.frontVoice : config.backVoice;
  const resolved = resolveVoice(speechSynthesis.getVoices(), preference);
  utterance.voice = resolved.voice || null;
  if (preference.language || resolved.voice?.lang) utterance.lang = preference.language || resolved.voice!.lang;
  utterance.rate = side === 'front' ? config.frontRate : config.backRate;
  utterance.pitch = side === 'front' ? config.frontPitch : config.backPitch;
  utterance.volume = config.volume;
  current = utterance;
  const finish = () => {
    // An old utterance's delayed end/error must never cancel its replacement.
    if (current !== utterance) return;
    current = undefined;
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = undefined;
  };
  utterance.onend = () => {
    if (current !== utterance) return;
    finish();
    done();
  };
  utterance.onerror = (event) => {
    if (current !== utterance) return;
    finish();
    report('Speech failed (' + event.error + '). Try a different voice or press Play again.');
  };
  report(resolved.status);
  speechSynthesis.speak(utterance);
  if (typeof window !== 'undefined' && (window as any).chrome && current === utterance) {
    keepAliveTimer = setInterval(() => {
      if (current !== utterance) return;
      try { speechSynthesis.pause(); speechSynthesis.resume(); } catch { finish(); }
    }, 10_000);
  }
}

function playSequence(text: string, config: SmartTTSConfig, side: PhysicalSide, report: (status: string) => void) {
  const request = generation;
  const parts = text.split(CLOZE_PAUSE);
  let index = 0;
  const advance = () => {
    if (request !== generation) return;
    const part = parts[index++];
    const done = () => {
      if (request !== generation || index >= parts.length) return;
      try { advance(); } catch { stopSpeech(); report('Speech could not start. Try another voice.'); }
    };
    if (part.trim()) play(part, config, side, report, done);
    else if (parts.length > 1) done();
    else report('Nothing remains after filtering.');
  };
  advance();
}

export function speakText(text: string, config: SmartTTSConfig, side: PhysicalSide = 'front', report = (_: string) => {}) {
  stopSpeech();
  try { playSequence(text, config, side, report); }
  catch { stopSpeech(); report('Speech could not start. Try another voice.'); }
}

export async function speakPreparedText(
  prepare: () => Promise<string>, config: SmartTTSConfig, side: PhysicalSide, report = (_: string) => {}
) {
  stopSpeech();
  const request = generation;
  let text: string;
  try {
    text = await prepare();
  } catch {
    if (request === generation) { stopSpeech(); report('Could not read the ' + side + ' text. Try Preview current card in settings.'); }
    return;
  }
  if (request !== generation) return;
  try {
    playSequence(text, config, side, report);
  } catch {
    stopSpeech();
    report('The ' + side + ' voice could not start. Try another voice or Automatic for chosen language.');
  }
}
