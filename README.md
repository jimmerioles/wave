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
npm test          # Vitest unit suite
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
- **Bloom / Glass / Tape / Haze / Pulse** change the oscillator mix, filter,
  envelope, delay and reverb character — and tint the orb to match. Each preset
  also has its own motion signature.
- **Orb / Scope** switches the stage between the orb and a live oscilloscope.
  The choice is saved with the rest of the settings.
- **Drag across the pads** to glissando from note to note. Multi-touch still
  works: each pointer can glide independently.
- **MIDI** requests Web MIDI access from the top bar. Connected inputs play
  through the same engine with velocity; notes in the C3–C4 range light the
  pads, and notes outside the keybed still play. MIDI can also feed the arp.
- **Filter** sweeps the shared low-pass cutoff. **Echo** controls how much of
  the ping-pong delay returns. **Space** sets the shared reverb return.
- **Play the chorus** performs an arrangement of “Goodness of God” at the
  current tempo. The demo adds two high notes above the keybed for the chorus
  lift. `Esc` stops it early.
- **Rec** records the master mix into a take. Click it again to stop; the take
  dialog previews the clip and offers a download. `Esc` also stops a recording.
- **Sound on** mutes and unmutes. The visualizer keeps reacting while muted.
- **About** opens a short prototype note and the demo credit. The dialog also
  has **Reset instrument**, which restores Bloom, the default filter/echo/space,
  63 BPM, arp off and Orb view, and clears the saved settings.

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
- One synth voice per pad (eight playable pads), three oscillators per voice
  (saw, triangle, sine); MIDI and demo notes reuse the same voice builder.
- Shared resonant low-pass filter, per-note ADSR envelope, detuned layers.
- Stereo ping-pong delay with damped feedback, soft-clip saturation and a
  master compressor.
- A convolution reverb with a generated stereo impulse response, shared by
  every voice and returned through the tone filter.
- `AnalyserNode` drives every visual response; mute is applied after the
  analyser so the instrument stays alive visually with sound off.
- AudioContext suspends when the page is hidden and resumes on the next
  gesture.
- Preset, filter, echo, space, tempo and arp settings persist in
  `localStorage` with validation and quiet failure when storage is unavailable.

**Visual instrument**
- Canvas 2D orb with a solar core, warped bands and a pointer-following
  highlight.
- Live waveform ring from time-domain audio, plus circular spectrum ticks and
  slow orbit arcs.
- Soft springs on level, bass, treble and pointer parallax.
- Note-on particles and expanding ripples; ambient drifting motes.
- A full-stage oscilloscope mode with a grid, delayed trace, bright trace and
  scanline. It uses the same analyser as the orb.
- Per-preset motion signatures: Glass shimmers, Tape drags, Haze drifts, Pulse
  snaps, Bloom breathes.
- Canvas loop stops when reduced motion is requested or the stage leaves the
  viewport. The reduced-motion scene is a calm static orb or scope with a DOM
  level meter.

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

**Recording**
- `MediaRecorder` taps the master bus before the mute gain, so a take can be
  captured with the speakers quiet.
- A finished take opens in a dialog with an audio preview, duration, file size,
  format and a download link. Takes are capped at three minutes and live only
  in the tab until discarded or replaced.
- Downloads use the browser's preferred recording format (WebM/Opus on
  Chromium and Firefox, M4A/AAC where that is the available option).

**MIDI**
- Web MIDI access is requested only from the top-bar button. Every connected
  input is attached, and device add/remove updates the button state.
- Note-on/off and velocity are mapped into the same voices. Notes in the
  C3–C4 range light and feed the pads; other notes play through the full-range
  MIDI voice path without a pad.
- In-range MIDI notes are ordinary input sources, so they work with latch and
  the arpeggiator. CC, pitch bend and clock messages are ignored.
- If access is denied or the browser does not support Web MIDI, the button
  reports it and the rest of the instrument keeps working.

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
- Pointer events support multi-touch pads, capture, glissando and idle
  cancellation.
- The preset, filter, echo, space, tempo, arp and orb / scope settings persist
  locally; invalid stored values are ignored.
- About includes a one-click reset that clears the persisted settings and
  restores the default instrument.

## Structure

```
index.html        static shell, copy, controls
src/style.css     layout, identity, responsive + reduced-motion styles
src/audio.ts      Web Audio graph, presets, voices, note helpers
src/arp.ts        lookahead arpeggiator scheduler and pattern logic
src/midi.ts       Web MIDI access, device tracking and message parsing
src/settings.ts   validated localStorage persistence
src/orb.ts        Canvas 2D visualizer and particle system
src/main.ts       input, presets, recording, demo, lifecycle
src/*.test.ts     Vitest unit tests for the pure logic
CONCEPT.md        original brief
```

There are no runtime dependencies. Vite, TypeScript and Vitest are dev-only;
fonts come from Google Fonts, everything visual is CSS, SVG or Canvas, and
every sound is synthesized at runtime.

## Tests

```bash
npm test          # one run
npm run test:watch
```

The unit suite covers settings validation and persistence, MIDI message parsing
and note-to-pad mapping, arp pattern/rate math, and the cutoff/frequency
helpers. The visualizer, audio timbre, MediaRecorder output and physical MIDI
devices remain manual/browser checks; they are not pixel- or device-tested.

## Roadmap

All five original roadmap passes are implemented: arpeggiator + tempo,
record & share, sound design + persistence, visual polish, and MIDI input.
The “Rough edges” below are the honest next candidates.

## Rough edges

- The demo is a fixed chorus arrangement, not a full song player or sequencer.
  Tempo is adjustable, but there is no loop length or timeline editing.
- The keybed is one octave. The demo reaches two notes above it internally, but
  those notes are not playable from the pads.
- The arp is monophonic per step and has no swing or per-step editing yet.
- Recording uses the browser's `MediaRecorder` container; there is no WAV
  export or server-side sharing. Takes are session-only.
- Browser-recorded WebM blobs do not always carry duration metadata, so the
  preview player can show 0:00 until played; the take dialog's timer is
  authoritative.
- MIDI covers note-on/off and velocity only. CC, sustain pedal, pitch bend and
  clock are ignored. Notes outside the one-octave keybed play without a pad.
- The circular spectrum maps lower frequencies to more ticks for looks, not
  scientific accuracy; the scope is likewise a stylized view, not a calibrated
  measurement.
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
