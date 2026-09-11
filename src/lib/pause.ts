// Internal control token, never sent to the speech engine.
export const CLOZE_PAUSE = '\uE000';
export const displaySpeechText = (text: string) => text.split(CLOZE_PAUSE).join(' [1s pause] ');
