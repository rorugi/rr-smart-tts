# RemNote smoke checks

These checks require real RemNote clients and installed speech voices. Automated tests mock those APIs and cannot establish audible playback or mobile support.

1. Load the built plugin in RemNote. Open a document with forward, backward, cloze, and multiline cards. Confirm Front / Back / Stop appear below the card in the standard TTS location, not over the title bar.
2. In that document's settings, choose Hindi (hi-IN) for Front and English (en-US) for Back. Test both previews and both manual review buttons. Confirm that backward cards retain the same physical-side voices.
3. Enable question/answer autoplay and both physical-side rules. Each revealed phase should speak once. Grade quickly, move back to a previous card, and leave the queue during speech. No old card should start speaking later.
4. Press Stop immediately after Play on a long multiline card. Pending extraction should not restart playback. Replace a long utterance with a short one and confirm the old completion event cannot cut off the new one.
5. Save voice/rate changes during review. Confirm the next manual playback uses them on the same card. Toggle autoplay from the queue menu and disable the plugin in settings. Confirm changes apply without advancing.
6. Open settings and switch scopes rapidly. Save should stay disabled until the selected scope loads. Confirm document settings override parent folders, and Use inherited settings restores the nearest parent configuration. Resize the window and scroll to the final preview fields: Save and Close must remain visible in the footer.
7. Preview a current card containing italics, bold text, nested brackets, an unfinished bracket, and adjacent words around a removed note. Compare original/spoken text and verify audible results. Try both front and back, including clozes and multiline answers.
8. Open the same settings on another device where the chosen voice is absent. Confirm the saved preference remains visible, playback reports fallback, and the language is retained. Reload voices after installing or enabling a voice.
9. Repeat on each supported mobile client. Check popup scrolling, controls at narrow widths, voice discovery, user-initiated playback, and autoplay after a user gesture. Record client/OS versions and any engine restrictions before publishing.
