# RR Smart TTS


## What's new in 0.3.0

- Voice discovery now retries automatically and also imports voices discovered by RemNote's main plugin context.
- A small reload button next to the voice dropdown refreshes the available voice list.
- Front / Back / Stop controls now use RemNote's fixed queue toolbar instead of scrolling with flashcard content.
- The review bar is intentionally minimal: no settings button and no spoken-text preview.
- Folder scopes are labeled as folders even if RemNote also reports them as documents.
- The settings popup uses the full popup viewport and scrolls cleanly without nested clipping.

**RR Smart TTS** is a document-aware, filtered text-to-speech plugin for RemNote flashcards.

It is designed for cards where the visible text contains information that should not be spoken aloud, such as transliterations, grammar notes, IPA, hints, or metadata.

## Main features

- Speak the flashcard front or back on demand.
- Independent auto-play for the **question phase**, **answer phase**, **physical front side**, and **physical back side**.
- Skip *italic* text before speech.
- Optionally skip **bold** text.
- Remove text inside:
  - `(parentheses)`
  - `[square brackets]`
  - `{curly braces}`
- Optionally remove URLs.
- Add custom JavaScript regular expressions for project-specific filters.
- Configure voice, speech rate, and pitch.
- Store settings per document or folder using stable RemNote IDs.
- Fall back to global defaults when a document/folder has no override.
- Works with forward, backward, cloze, and multiline flashcards.
- Mobile support is enabled in the plugin manifest.

## Example

Visible flashcard text:

```text
घर [ghar] (masculine) means house.
```

With square-bracket and parenthesis filters enabled, RR Smart TTS speaks:

```text
घर means house.
```

If the transliteration is formatted in italics, the **Skip italic text** filter can remove it even without brackets.

## Configuration hierarchy

RR Smart TTS stores configuration by stable RemNote IDs rather than document names. Renaming a document or folder therefore does not disconnect its TTS settings.

When a flashcard is shown, the plugin searches for the most specific stored configuration in this order:

1. Current document
2. Parent folders
3. Global defaults

The first stored configuration is used.


## Autoplay modes

RR Smart TTS separates **review phase** from **physical card side**:

- **Auto-play question phase** — speak whatever side RemNote currently shows as the question.
- **Auto-play answer phase** — speak whatever side is revealed as the answer.
- **Auto-play physical front side** — speak the card front whenever the front becomes visible, even on backward cards where that happens after revealing the answer.
- **Auto-play physical back side** — speak the card back whenever the back becomes visible.

The four switches can be combined freely. If two enabled rules point to the same visible side in the same phase, RR Smart TTS speaks it only once.

Example: if a target language is always stored on the physical front, enable only **Auto-play physical front side**. A forward card will speak it as the question; a backward card will speak it after the answer is revealed.

For cloze cards, RemNote's cloze question is treated as the physical front and the revealed cloze content as the physical back.

## Flashcard controls

During review, RR Smart TTS renders controls below the flashcard:

- **Front** — speak the semantic front of the card.
- **Back** — speak the semantic back of the card.
- **Stop** — cancel speech.
- **Settings** — open configuration for the current document/folder hierarchy.

The RemNote flashcard queue menu also contains:

- `RR Smart TTS: Configure this document`
- `RR Smart TTS: Toggle question/answer auto-play for this document`

A command named `RR Smart TTS: Global settings` opens the global defaults.

## Custom regex filters

You can define one JavaScript regular expression per line. Do not include `/.../` delimiters.

Example:

```text
\bIPA:\s*[^,.;]+
```

Invalid expressions are highlighted and cannot be saved.

## Important note about RemNote's standard Text to Speech plugin

RR Smart TTS is intended to replace the normal TTS playback for cards where filtering is needed. If both plugins auto-play the same card, both may attempt to use the browser speech engine. Disable auto-play in the standard RemNote TTS plugin for those cards/decks.

## Development

Requirements:

- Node.js
- npm
- Git

Install dependencies:

```bash
npm install
```

Run a local development server:

```bash
npm run dev
```

Then load the plugin in RemNote from the Developer plugin URL:

```text
http://localhost:8080
```

The development server also listens on `0.0.0.0`, which can help with LAN testing. Whether a mobile RemNote build accepts a LAN developer URL depends on the RemNote client.

Type-check:

```bash
npm run check-types
```

Build a local package (Git is not required for this step):

```bash
npm run build
```

Validate the plugin manifest from inside a Git repository:

```bash
npm run validate
```

For a release build that validates first:

```bash
npm run release
```

`npm run build` and `npm run release` create:

```text
PluginZip.zip
```

## Storage keys

Global defaults:

```text
rr-smart-tts:global:v1
```

Per document/folder configuration:

```text
rr-smart-tts:scope:v1:<stable-rem-id>
```

## Privacy

RR Smart TTS does not send flashcard content to an external server. Speech is produced through the browser/device `speechSynthesis` API and uses the voices exposed by the current operating system/browser runtime.

## Credits

The plugin architecture follows RemNote's public plugin SDK and takes inspiration from the official RemNote Text to Speech example plugin, especially its flashcard widget placement, queue event handling, cloze handling, and use of the browser Speech Synthesis API.

## Author

Roland Russwurm

## License

MIT


### Cross-device voices

Voice names are provided by the operating system/browser. A voice selected on desktop may not exist on Android or another device. If the stored voice name is unavailable, RR Smart TTS falls back to the device default voice.
