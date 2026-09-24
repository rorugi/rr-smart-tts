# Native-access review: 0.4.18

The source and packaged manifests must set `requestNative: false`.

## Implementation review

Speech uses the browser's `speechSynthesis` and `SpeechSynthesisUtterance` APIs in the speech widget. Voice discovery uses `getVoices()` and the voices-changed event. Configuration, document hierarchy, queue state, shortcuts, and widget placement use the RemNote plugin SDK.

No explicit native API dependency was identified in the plugin source. This is a code-review finding, not confirmation of sandbox compatibility on every RemNote client. A sandbox may expose a different voice list or apply different user-activation restrictions.

## Automated verification

Run `npm run release`. Existing mocked tests cover:

- Question/answer and physical-side autoplay, forward and reverse cards, and cancellation on card changes.
- Independent front/back voice selection and persistence, language fallback, platform preferences, and rate/pitch.
- Front/Back replay, Stop, queue exit, stale requests, cloze filtering, and control placement/reconciliation.

Package checks verify that both manifests disable native access and that sandbox scripts/styles are included. These tests cannot establish actual audible playback or RemNote iframe permissions.

## Required client verification before resubmission

Status: **pending**. Record the RemNote version, OS/browser, installed plugin version, source commit, and each result. Test the packaged ZIP with native access disabled, after fully reloading RemNote.

| Check | Expected result | Result |
| --- | --- | --- |
| Voice selection | Available voices load; choose different front/back voices, save, reopen settings, and hear both selections. | Pending |
| Autoplay | Check question and answer autoplay, then physical-side autoplay, on forward and reverse cards over several card transitions. Each phase plays once. | Pending |
| Fresh-session playback | Test before and after a direct click on Front/Back. Record any user-gesture requirement or speech error. | Pending |
| Review controls | Front, Back, Stop, and shortcuts 6/7 work across multiple cards; Stop and queue exit cancel playback. | Pending |
| Placement | Right, Flashcard Under, and Top remain visible and follow the current card. Settings remain usable. | Pending |
| Filters and scopes | Formatting filters, Skip cloze questions, and document-specific voices still apply. | Pending |
| Other clients | Repeat on each supported desktop/mobile client available for testing; mark unavailable clients as untested. | Pending |

If anything fails, record the exact error, client, selected voice, card type, and whether manual playback or autoplay failed. Do not re-enable native access or claim that it is required without identifying the specific API or sandbox limitation.

The release handoff should identify the full source commit SHA and ZIP SHA-256. Do not describe this build as marketplace-tested or resubmit it until the required live checks have been completed.
