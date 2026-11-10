# Wave — the playable synth

A landing page for a browser synthesizer where the hero is the instrument.
Hold a key or tap a pad, and the orb, rings, particles and meters answer the
sound you make. No video, no waveform loop, no samples.

![Wave — the playable synth](docs/wave-idle.webp)

Wave is one of five prototype studies in high-craft interactive landing pages:
static-first, one signature interaction, a physical metaphor, sound only on
gesture, and a reduced-motion fallback.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build     # type-check + production build
npm run preview   # serve the production build
```

## Play it

- **Hold** `A` `S` `D` `F` `G` `H` `J` `K`, or press and hold any pad.
- **Bloom / Glass / Tape** change the oscillator mix, filter, envelope and
  delay character — and tint the orb to match.
- **Filter** sweeps the shared low-pass cutoff. **Echo** controls how much of
  the ping-pong delay returns.
- **Play a demo** performs an 8-second generative phrase. Each run varies the
  melody slightly. `Esc` stops it early.
- **Sound on** mutes and unmutes. The visualizer keeps reacting while muted.
- **About** opens a short prototype note.

Audio starts only after the first pointer or key gesture. Nothing autoplays.
The master output is intentionally low (0.2) and compressed.

## What is implemented

**Sound**
- Eight-voice polyphony with three oscillators per voice (saw, triangle, sine).
- Shared resonant low-pass filter, per-note ADSR envelope, detuned layers.
- Stereo ping-pong delay with damped feedback, soft-clip saturation and a
  master compressor.
- `AnalyserNode` drives every visual response; mute is applied after the
  analyser so the instrument stays alive visually with sound off.
- AudioContext suspends when the page is hidden and resumes on the next
  gesture.

**Visual instrument**
- Canvas 2D orb with a solar core, warped bands and a pointer-following
  highlight.
- Live waveform ring from time-domain audio, plus circular spectrum ticks and
  slow orbit arcs.
- Soft springs on level, bass, treble and pointer parallax.
- Note-on particles and expanding ripples; ambient drifting motes.
- Canvas loop stops when reduced motion is requested or the stage leaves the
  viewport. The reduced-motion scene is a calm static orb with a DOM level
  meter.

**Page**
- Typography: Space Grotesk + Instrument Serif accents + JetBrains Mono.
- Deep navy field, coral sunset hero, mint/cyan signal accents.
- Responsive composition at 1280×800 and 390×844. Mobile pads reflow to a
  4×2 grid; the page fits without scrolling at those target sizes.
- Keyboard-accessible pad buttons with visible focus states, `aria-pressed`,
  a focus-trapped About dialog and native range controls.
- Keyboard notes are suppressed while a control or dialog is focused.
- Pointer events support multi-touch pads, capture, and idle cancellation.

## Structure

```
index.html        static shell, copy, controls
src/style.css     layout, identity, responsive + reduced-motion styles
src/audio.ts      Web Audio graph, presets, voices, note helpers
src/orb.ts        Canvas 2D visualizer and particle system
src/main.ts       pad/keyboard input, preset + slider wiring, demo, lifecycle
CONCEPT.md        original brief
```

There are no runtime dependencies beyond Vite and TypeScript. Fonts come from
Google Fonts; everything visual is CSS, SVG or Canvas, and every sound is
synthesized at runtime.

## Rough edges / next steps

- The demo is a varied contour, not a full sequencer. There is no tempo control,
  loop length or timeline editing.
- No reverb, arpeggiator, MIDI input, recording/export, or preset saving yet.
- The circular spectrum maps lower frequencies to more ticks for looks, not
  scientific accuracy.
- The synth has been built and interaction-tested headlessly; the audio graph
  has not been tuned on every output device.
- The About dialog is the whole "product" story — there is no downstream app,
  pricing or docs page behind the prototype.
- Possible next pass: add a simple oscilloscope mode, per-preset motion
  signatures, pointer glissando across pads, and a shareable recorded loop.
