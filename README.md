# RR Smart TTS

RR Smart TTS reads your RemNote flashcards aloud with separate front and back voices, flexible autoplay, and filters that keep speech focused on what you want to learn.

## What's new in 0.4.15

- Save different voices and languages for each platform.
- See the detected platform in settings.
- Keep your front and back rate and pitch settings across platforms.

## Getting started

1. Open **RR Smart TTS: Settings** from the command menu or the flashcard menu.
2. Choose **Global Defaults** or settings for the current document or folder.
3. Select the voices and languages for the front and back of your cards.
4. Choose your formatting filters and autoplay preferences, then save.

During review, use **Front** or **Back** to read that side of the card, and **Stop** to stop playback.

## Voices and playback

Front and back can each use their own voice, language, rate, and pitch. This is useful for cards with a different language on each side.

Voice and language choices are saved separately for the detected platform within your selected document, folder, or global settings. For example, you can choose different voices in the desktop app and an Android browser. Settings show which platform you are configuring.

Rate and pitch remain shared across platforms, with independent values for front and back. Filters and autoplay preferences also apply across platforms.

Available voices depend on your device and browser. If a selected voice is unavailable, the plugin falls back to a voice matching the selected language when possible. Speech may be unavailable in some app or browser contexts.

## Autoplay

Choose when cards should be read automatically:

- **Question** — when a question appears.
- **Answer** — when the answer is revealed.
- **Physical front** — when the original front of the card is shown.
- **Physical back** — when the original back of the card is shown.

Physical-side options are useful for reverse cards: the original front keeps its front voice even when it appears as the answer. Overlapping options do not read the same side twice.

The flashcard menu shows **RR Smart TTS: Auto-Play On** or **RR Smart TTS: Auto-Play Off**, indicating the action you can take. Turning autoplay off disables all four options; turning it on enables question and answer playback.

If you also use RemNote's built-in TTS, disable autoplay in one of the plugins to avoid duplicate speech.

## Formatting filters

Choose which parts of a card to leave out of speech:

- Italic or bold text.
- Text inside parentheses, square brackets, or curly braces.
- URLs.
- Text matching your custom regular expressions.
- Hidden cloze placeholders, without adding a pause.

Enable **Skip cloze questions** to prevent all playback while a cloze question is awaiting an answer. Playback becomes available again after you reveal the answer.

For example, filtering square brackets and parentheses turns:

> घर [ghar] (masculine) means house.

Into:

> घर means house.

Use the settings preview to check how your current card will sound before saving. Custom regular expressions use one pattern per line, without surrounding slashes.

## Settings for documents and folders

Settings can apply globally or to a specific document or folder. The most specific saved settings take priority: the current document, then its parent folders, then **Global Defaults**.

When you open settings from a document, the scope selector includes that document and its available parents. If there is no current document, only **Global Defaults** is available.

Choose **Use inherited settings** to remove that scope's custom settings and use its parent or global settings again.

## Control placement

- **Right** — stacks the buttons vertically on the right.
- **Flashcard Under** — centers the buttons below the card content; they scroll with the card.
- **Top** — centers the buttons in a separate row below the top bars.

## Privacy

RR Smart TTS uses your device or browser's speech service and does not directly send card text to an external server. Some voices provided by your system may use an online speech service.

## About

Created by Roland Russwurm. Licensed under the MIT License.
