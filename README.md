# Wave — the playable synth

**Live demo:** https://jimmerioles.github.io/wave/

A landing page for a browser synthesizer where the hero is the instrument.
Hold a key or tap a pad, and the orb, rings, particles and meters answer the
sound you make. No video, no waveform loop, no samples.

The demo button plays a short, synthesized arrangement of the chorus of
“Goodness of God” — melody and bass, scheduled through the same eight-voice
instrument you play by hand.

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
npm run preview   # serve the production build at /wave/
```

## Play it

- **Hold** `A` `S` `D` `F` `G` `H` `J` `K`, or press and hold any pad. The
  pads cover a full C-major scale from C3 to C4.
- **Arp** turns held notes into a pattern. Choose Up, Down, Up/Down or Random,
  set the rate to 1/4, 1/8, 1/16 or 1/8T, and use **Latch** to keep the chord
  running after you let go. Starting a new chord replaces the latched one.
  `Esc` stops the pattern.
- **Tempo** sets the shared clock, 50–160 BPM. It drives both the arp and the
  demo; the demo's duration label updates before the next play.
- **Bloom / Glass / Tape** change the oscillator mix, filter, envelope and
  delay character — and tint the orb to match.
- **Filter** sweeps the shared low-pass cutoff. **Echo** controls how much of
  the ping-pong delay returns.
- **Play the chorus** performs an arrangement of “Goodness of God” at the
  current tempo. The demo adds two high notes above the keybed for the chorus
  lift. `Esc` stops it early.
- **Sound on** mutes and unmutes. The visualizer keeps reacting while muted.
- **About** opens a short prototype note and the demo credit.

Audio starts only after the first pointer or key gesture. Nothing autoplays.
The master output is intentionally low (0.2) and compressed.

## Easter egg

Triple-tap the wave mark, or enter the Konami code
(`↑` `↑` `↓` `↓` `←` `→` `←` `→` `B` `A`). A ~1:22, 113 BPM synth-pop edit in
the original A-flat key plays: the tom-fill intro, verse 1, pre-chorus and the
first chorus, with a bright lead, synth bass, piano, strings, horn and drum
machine. The demo button becomes a stop/progress control while it plays; `Esc`
also stops it and the stage returns to the current preset. If sound is off,
the gag is visual-only. The About dialog has a small hint.

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

**Demo**
- A fixed chorus arrangement of “Goodness of God” in C: one intro bar plus
  eight chorus bars, melody and bass scheduled into the live synth.
- The tempo control retimes the arrangement; the default is 63 BPM. The keybed
  exposes eight pads (C3–C4). The demo uses two extra high notes (D4/E4)
  internally for the chorus lift; they have no pads.

**Arp**
- A lookahead scheduler drives the arp from `AudioContext.currentTime`, not
  `setTimeout`, so the pattern stays steady at fast rates.
- Four patterns (up, down, up/down, random), four rates (1/4, 1/8, 1/16,
  1/8T), latch, and a shared 50–160 BPM tempo.
- Held and latched pads light the current step; latched notes keep a warm
  outline after release. The arp and demo are mutually exclusive.
- The demo uses the same tempo clock: changing tempo before pressing play
  retimes the whole chorus.

**Easter egg**
- A hidden ~1:22 synth-pop edit of “Never Gonna Give You Up” at 113 BPM:
  the tom-fill intro, verse 1, pre-chorus and the first chorus, with a bright
  detuned lead, synth bass, piano, strings, horn and drum machine, all
  synthesized at runtime from reference note data.
- Triggered by triple-tapping the brand mark or the Konami code. The demo
  button becomes a stop/progress control during playback; `Esc` also stops it.
  It stops the main demo, restores the stage, respects mute and reduced motion.
- Notes are scheduled in a rolling two-second window, and each note's audio
  chain disconnects when it ends. During the egg the orb runs at 30fps with
  fewer particles and no canvas shadow blur.

**Page**
- Typography: Space Grotesk + Instrument Serif accents + JetBrains Mono.
- Deep navy field, coral sunset hero, mint/cyan signal accents.
- Responsive composition at 1280×800 and 390×844. Mobile pads reflow to a
  4×2 grid; the page fits without scrolling at those target sizes.
- Keyboard-accessible pad buttons with visible focus states, `aria-pressed`,
  a focus-trapped About dialog and native range controls.
- Arp toggles and pattern/rate choices expose `aria-pressed`; the tempo range
  announces its BPM value.
- Keyboard notes stay live after clicking a button or link; they are suppressed
  only while a text field, range control or dialog has focus.
- Pointer events support multi-touch pads, capture, and idle cancellation.

## Structure

```
index.html        static shell, copy, controls
src/style.css     layout, identity, responsive + reduced-motion styles
src/audio.ts      Web Audio graph, presets, voices, note helpers
src/arp.ts        lookahead arpeggiator scheduler and pattern logic
src/orb.ts        Canvas 2D visualizer and particle system
src/main.ts       pad/keyboard input, preset + slider wiring, demo, lifecycle
CONCEPT.md        original brief
```

There are no runtime dependencies beyond Vite and TypeScript. Fonts come from
Google Fonts; everything visual is CSS, SVG or Canvas, and every sound is
synthesized at runtime.

## Roadmap

Four candidate next passes, roughly in order of leverage:

1. **Record & share a loop.** Record the master output with `MediaRecorder`,
   preview the take, and download a shareable WebM/WAV clip.
2. **Sound design pass.** Add a reverb, a couple more presets, and persist the
   chosen preset, filter, echo and arp settings in `localStorage`.
3. **Visual polish.** An oscilloscope mode, per-preset motion signatures,
   pointer glissando across pads, and further mobile layout refinements.
4. **MIDI input.** Web MIDI detection with note-on/off and velocity mapped into
   the existing engine and keybed.

## Rough edges

- The demo is a fixed chorus arrangement, not a full song player or sequencer.
  Tempo is adjustable, but there is no loop length or timeline editing.
- The keybed is one octave. The demo reaches two notes above it internally, but
  those notes are not playable from the pads.
- The arp is monophonic per step and has no swing or per-step editing yet.
- The circular spectrum maps lower frequencies to more ticks for looks, not
  scientific accuracy.
- The synth has been built and interaction-tested headlessly; the audio graph
  has not been tuned on every output device.
- The About dialog is the whole "product" story — there is no downstream app,
  pricing or docs page behind the prototype.

## Credits

“Goodness of God” (CCLI #7117726) words and music by Jenn Johnson, Jason
Ingram, Ben Fielding, Ed Cash and Brian Johnson. The demo is a short
synthesized arrangement used for this prototype; all rights belong to the
writers and publishers.

“Never Gonna Give You Up” was performed by Rick Astley and written by Mike
Stock, Matt Aitken and Pete Waterman. The easter egg is a short synthesized
quote used for this prototype; all rights belong to the writers and publishers.
