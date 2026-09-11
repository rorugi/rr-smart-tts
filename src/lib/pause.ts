// Internal segment boundary for an omitted cloze; no extra delay is added.
export const CLOZE_PAUSE = '\uE000';
export const displaySpeechText = (text: string) => text.split(CLOZE_PAUSE).join(' [cloze omitted] ');
