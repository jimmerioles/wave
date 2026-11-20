# Wave explainer

A 3:15 animated explainer for the Wave prototype.

- **Watch:** the inline player in the [repository README](../../README.md#watch-the-explainer). The full 1080p file is on the [explainer release page](https://github.com/jimmerioles/wave/releases/tag/explainer).
- `wave-explainer-poster.jpg`: opening frame, 1920 × 1080.
- `script.md`: chapter timestamps, full narration, shot notes, credits.

The film is a standalone production. It is not loaded by the app and adds no
runtime dependencies to the prototype.

## Rebuild notes

The renderer is a deterministic Canvas 2D scene driven by a sentence-level
timeline. Frames were encoded with WebCodecs in Chromium, then mastered with
FFmpeg. The music is captured from the prototype itself: *First Light* and a
sustained Haze pad, both recorded from the master bus before the mute switch.

If you change the narration, regenerate the sentence timings first, then rebuild
the music bed and the video. The diagrams use those timings for every reveal.
