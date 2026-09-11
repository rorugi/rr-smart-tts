# RR Smart TTS


## What's new in 0.4.11

- Keep the controls root mounted during startup so native RemNote can observe its height before settings finish loading.

## Added in 0.4.10

- Top uses a dedicated full-width row with centered controls and a stable minimum height.
- Controls remain visible while a card loads; startup retries are serial, bounded, and cancelled when review ends.

## Added in 0.4.9

- Cloze omission adds no timed silence; speech continues when the preceding segment ends.
- Top registers right-aligned controls in RemNote’s QueueBelowTopBar slot, including when no other widget uses it.
- Stop now has an outlined square icon in every layout.

## Added in 0.4.8

- Cloze question playback no longer appends the back/answer field.
- Hidden cloze pauses now last 0.5 seconds; settings and preview show the updated duration.

## Added in 0.4.7

- Removes Toolbar; previous Toolbar preferences fall back to Right.
- Optional **Pause at hidden cloze (1 second)** replaces the question-side blank with a timed gap; the revealed answer reads normally. Stop and card transitions cancel pending gaps.
- Flashcard Under is a plugin slot in the scrolling card area; it does not attach to the native TTS fixed footer.

## Added in 0.4.6

- Controls position offers Right (vertical stack), Flashcard Under (horizontal row), and Toolbar.
- Position applies globally and is saved with Save; existing installations default to Right.
- Stop is text-only in every layout.

## Added in 0.4.5

- Controls attach directly below the card, aligned right, using outlined speaker icons.
- Loads from card-scoped IDs instead of global queue state; no startup Retry row.
- Voice names stay in settings and do not appear in playback controls.

## Added in 0.4.4

- Mounts playback directly in the review screen so controls and physical-side autoplay do not depend on opening a floating window.
- Keeps controls at the top right in native mode, or right-aligned below the toolbar in sandbox mode.
- Card-loading failures show a status and Retry instead of hiding the controls.

## Added in 0.4.3

- Removes old below-card and toolbar registrations during upgrade.
- Anchors review controls to the top right.
- Settings use an intrinsic 400px scrolling body with a separate Save/Close footer.
- Builds the shared App.css expected by the RemNote SDK.

## Added in 0.4.2

- Fixed the settings popup shrinking to zero by giving its host a stable height.
- Front / Back / Stop float on the right during review and close when review ends.

## Added in 0.4.1

- Front / Back / Stop are below the card, alongside the standard TTS location.
- Settings scroll within the popup while Save and Close remain visible.
- Ordinary back answers remain playable if optional multiline lookups fail.
- Voice-engine errors are distinguished from card-text errors.

## Added in 0.4.0

- Separate front/back voices and language preferences, including backward cards.
- Stop, card completion, queue exit, and newer requests cancel pending speech.
- Card transitions use RemNote's card-loaded event instead of a fixed delay.
- Saved settings refresh during review; scope switching cannot save stale values.
- Current-card preview tests the same formatting and content filters used for speech.
- Unmatched opening brackets preserve remaining text; removed text does not join words.
- Regression tests and automated Windows/Linux build checks.

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
- Configure separate front/back voices and languages, plus shared speech rate and pitch.
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

During review, RR Smart TTS floats controls at the top right:

- **Front** — speak the semantic front of the card.
- **Back** — speak the semantic back of the card.
- **Stop** — cancel speech.

The RemNote flashcard queue menu also contains:

- `RR Smart TTS: Configure current document / folder`
- `RR Smart TTS: Toggle question/answer auto-play for current scope`

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

### Repository source versus installation ZIP

The GitHub repository contains the editable source: `src/`, `public/`, tests, documentation, `package.json`, the dependency lockfile, and build configuration. The `public/` folder holds static plugin metadata/assets; it is not a separate deployed website.

Building generates `dist/` and `PluginZip.zip`. The ZIP contains compiled JavaScript, CSS, a manifest, and documentation for RemNote to load. Its extracted contents are not the source project and should not replace the repository. Generated build files, ZIPs, and `node_modules/` are excluded from Git; distribute the installation ZIP through a GitHub Release or CI artifact.

### Build from source

Requirements:

- Node.js 22 or newer
- npm
- Git

Install dependencies:

```bash
npm ci
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

Run regression tests with `npm test`. For a release build that type-checks, tests, and validates first:

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

RR Smart TTS makes no direct network requests with flashcard content. It passes text to the browser/device `speechSynthesis` API. Voice processing depends on the selected operating-system/browser voice; some voices may use an online service. The plugin does not guarantee offline processing.

## Credits

The plugin architecture follows RemNote's public plugin SDK and takes inspiration from the official RemNote Text to Speech example plugin, especially its flashcard widget placement, queue event handling, cloze handling, and use of the browser Speech Synthesis API.

## Author

Roland Russwurm

## License

MIT


## Front/back voices and languages

Each document/folder configuration and the global defaults have independent **Front voice**, **Front language**, **Back voice**, and **Back language** settings. For example, choose Hindi (hi-IN) on the front and English (en-US) on the back. These follow the physical sides even when a backward card shows the back first. Existing shared voice settings are automatically carried over to both sides.

The dropdown lists voices exposed in the popup itself. Playback checks the voices available in the review context again. A saved voice unavailable there falls back to a matching language (then a regional match); if none is exposed, the language is passed to the system speech engine. Actual support depends on that device. A brief playback status identifies the selected voice or fallback.

Selecting a voice fills in its language. Choose **Automatic for chosen language** to let the plugin select a matching voice, or leave the language empty for the system default. Rate and pitch apply to both sides.

## Filter preview

Open a flashcard review and choose **Preview current card** in settings. Select Front or Back to compare original card text with the text that will be spoken. This preview uses the unsaved settings currently shown in the form, including italic/bold filters. **Test front/back** uses that side's voice. The sample-text mode only tests content filters because plain text has no formatting.

Settings are stored as a complete override for each scope. **Use inherited settings** removes that override. Save is disabled while a scope loads or a write is pending; errors are shown without discarding the form.

## Verification

The regression tests cover filtering, voice migration/fallback, forward/backward/cloze behavior, multiline content, inheritance, Stop and queue races, scope switching, current-card previews, and live settings updates. Speech and RemNote APIs are mocked in these tests. Before publishing, run the [RemNote smoke checks](docs/SMOKE_TEST.md) on the target desktop/mobile clients.
