# Wave explainer

A 3:20 animated explainer for the Wave prototype.

- **Watch:** the inline player in the [repository README](../../README.md). The full 1080p file is on the [explainer release page](https://github.com/jimmerioles/wave/releases/tag/explainer).
- `wave-explainer-poster.jpg`: 1920 × 1080 screenshot of the live demo, used as the film's first frame.
- `script.md`: chapter timestamps, full narration, shot notes, credits.

The film is a standalone production. It is not loaded by the app and adds no
runtime dependencies to the prototype.

## Rebuild notes

The renderer is a deterministic Canvas 2D scene driven by a sentence-level
timeline. Frames were encoded with WebCodecs in Chromium, then mastered with
FFmpeg. The narration is Kokoro 82M `af_heart` at speed 0.88. The score is the
house *midnight tech* cue at 100 BPM in A major, rendered locally and trimmed to
the film.

If you change the narration, regenerate the sentence timings first, then re-trim
the music bed and rebuild the video. The diagrams use those timings for every
reveal.
