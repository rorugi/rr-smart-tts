# Changelog

## 0.4.18

- Disable native access in the manifest for marketplace review.
- Reject release packages that request native access.
- Document the required sandbox client checks for autoplay, voice selection, and review controls.

## 0.4.17

- Show the default replay shortcut when hovering over Front or Back.
- Remove the repeated plugin name from the replay shortcut commands.

## 0.4.16

- Added default review shortcuts: 6 replays Front and 7 replays Back.
- Route replay commands to the active card's speech controls, preserving voice preferences and cloze filtering.

## 0.4.1

- Moved Front / Back / Stop into FlashcardUnder, the same below-card slot as RemNote's standard TTS controls.
- Replaced the oversized popup with a bounded, responsive panel, independently scrolling settings, and a persistent Save / Close footer.
- Kept ordinary back text playable when optional multiline API calls fail; retained confirmed multiline answers and filtering.
- Distinguished speech-engine failures from text extraction failures.
- Added eight regression checks for placement, footer structure, and back-answer fallback; 50 tests now pass.
- Documented the difference between repository source files and the compiled installation ZIP.

## 0.4.0

- Added independent physical front/back voices and languages, with migration from the shared voice setting.
- Added local voice availability checks, language fallback, and playback status/error reporting.
- Cancelled pending speech on Stop/queue transitions and prevented stale utterance callbacks from cancelling newer speech.
- Replaced delayed queue refresh with QueueLoadCard and guarded asynchronous context loads.
- Refreshed active configuration on document/folder/global storage changes.
- Protected scope loading/saving against stale responses and disabled editing while saving/loading.
- Added current-card previews using the actual rich-text filtering pipeline.
- Preserved incomplete bracket groups and spacing around removed content.
- Added regression tests and Windows/Linux CI; release now checks types, tests, and validates before packaging.
- Loaded the production sandbox stylesheet and included smoke-test documentation in the package.

## 0.3.0

- Moved playback buttons into the fixed queue toolbar and simplified the review controls.
- Improved voice discovery and settings popup layout; distinguished folders from documents.

## 0.2.0

- Added four independent autoplay modes: question phase, answer phase, physical front side, and physical back side.
- Physical front/back autoplay now works independently of forward/backward review direction.
- Prevented duplicate speech when multiple enabled autoplay rules resolve to the same phase and side.
- Added v0.1 configuration compatibility for the previous question/answer autoplay fields.
- Updated configuration UI, queue menu wording, manifest description, and documentation.

## 0.1.0

- Initial RR Smart TTS release.
- Added filtered flashcard speech for front/back content.
- Added italic and bold formatting filters.
- Added parentheses, square-bracket, curly-brace, URL, and custom regex filters.
- Added per-document/folder settings using stable RemNote IDs.
- Added global defaults and folder/document fallback.
- Added voice, rate, pitch, auto-play, preview, and queue controls.
