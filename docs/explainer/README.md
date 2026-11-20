# Wave explainer

A 3:21 animated explainer for the Wave prototype.

- [wave-explainer.mp4](https://github.com/jimmerioles/wave/releases/download/explainer-v1/wave-explainer.mp4): 1920 × 1080, 30 fps, H.264 + AAC, 39 MB, published as a GitHub Release asset.
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
