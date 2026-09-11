import type { SmartTTSConfig } from './config';

let keepAliveTimer: ReturnType<typeof setInterval> | undefined;

export function stopSpeech() {
  try {
    speechSynthesis.cancel();
  } catch {
    // Speech synthesis can be unavailable in unusual embedded browser contexts.
  }
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = undefined;
}

export function speakText(text: string, config: SmartTTSConfig) {
  if (!text.trim()) return;
  stopSpeech();

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  if (config.voiceName) {
    utterance.voice = voices.find((voice) => voice.name === config.voiceName) || null;
  }
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;
  utterance.volume = config.volume;
  utterance.onend = stopSpeech;
  utterance.onerror = stopSpeech;

  speechSynthesis.speak(utterance);

  // Chromium may stop long utterances after a while unless speech is periodically resumed.
  if ((window as any)?.chrome) {
    try {
      speechSynthesis.pause();
      speechSynthesis.resume();
      keepAliveTimer = setInterval(() => {
        speechSynthesis.pause();
        speechSynthesis.resume();
      }, 10_000);
    } catch {
      // No keep-alive is required on engines that do not expose these methods reliably.
    }
  }
}
