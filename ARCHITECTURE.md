# How Wave works

Wave is a single-page browser synthesizer. Every sound is generated live in the
browser, and every visual is drawn live from that sound. There are no audio
files, no backend, and no runtime libraries.

This document is a map of the codebase. For the feature list and controls, see
the [README](README.md). For the original brief, see [CONCEPT.md](CONCEPT.md).

## The cast of files

Think of the app as a small band with a conductor and a painter.

| File | Job |
| --- | --- |
| `index.html` | The static shell: layout, copy, buttons, sliders |
| `src/style.css` | The look, responsive layout, reduced-motion styles |
| `src/main.ts` | The conductor: input, UI, demo, recording, MIDI, persistence |
| `src/audio.ts` | The instrument: audio graph, voices, presets, synth band |
| `src/orb.ts` | The painter: orb, oscilloscope, particles, springs |
| `src/arp.ts` | The arpeggiator clock and pattern logic |
| `src/demo.ts` | First Light's timing and filter ride |
| `src/egg.ts` | Easter egg pad mapping and the Konami matcher |
| `src/format.ts` | Recording readout formatting and MIME choice |
| `src/midi.ts` | Web MIDI access and message parsing |
| `src/settings.ts` | Safe `localStorage` save and load |
| `src/rickroll-song.ts` | Note data for the easter egg |

## Follow one key press

This is the whole system in one path:

1. You press `A`. The keydown handler in `main.ts` calls `press(0, "key:A")`.
2. `press()` does three things: starts a note in the synth, lights the pad, and
   fires a visual burst.
3. `engine.noteOn()` creates a voice in `audio.ts`. Each voice has three
   oscillators (saw, triangle, sine), some detune, and its own volume envelope:
   quick attack, decay to a sustain level, then release when you let go.
4. The voice joins a shared chain:

   ```text
   voice -> bus -> low-pass filter -> high-pass rumble filter
         -> soft clipper -> compressor -> analyser
         -> master volume -> mute switch -> speakers
   ```

   The echo and reverb are sends that branch off the bus and return through the
   same filter.

5. When you release the key, the voice fades out over the preset's release
   time, then disconnects itself.
6. The analyser exposes the live waveform and frequency data. `orb.ts` reads it
   every animation frame, smooths the level, bass, and treble with small
   springs, and draws the orb, rings, ticks, and particles.

One detail worth knowing: mute happens after the analyser. That is why the
visuals keep dancing when the sound is off.

## Why sound waits for a click

Browsers block audio until the user interacts with the page.
`engine.ensure()` creates the `AudioContext` on the first pointer or key event.
When the tab is hidden, the context suspends and the demo stops. When you come
back, it resumes on the next gesture.

## Demo, arp, and recording

**First Light** is not a separate audio player. It is a list of events in
`main.ts` shaped like `[start beat, note, length, velocity]`. The demo sets
timers against the page clock and calls the same `press()` and `release()` you
trigger by hand. The filter sweep is recalculated on each animation frame, which
is why the stage opens and closes with the cue.

The **arpeggiator** reads the notes you hold or latch, picks the next one by
pattern, and schedules real notes about 120 ms ahead using the audio clock.
Visual pad flashes are scheduled separately with `setTimeout`. That split keeps
the rhythm steady even if drawing slows down.

**Recording** taps the master mix before the mute switch, feeds it into
`MediaRecorder`, and keeps the result as a blob in memory. The take dialog
previews it and offers a download.

**MIDI** notes go into the same synth voices. Notes inside C3 to C4 also light
the pads; notes outside that range still play.

**Settings** are saved to `localStorage` after a short debounce, and every value
is validated on load. Bad stored values are simply ignored.

**The easter egg** has its own small synth band graph in `audio.ts` plus note
data in `rickroll-song.ts`. It schedules notes in a rolling two-second window
and stops cleanly when you press Escape.

## Build and test

This is a standard Vite and TypeScript project with no runtime dependencies:

```bash
npm run dev      # local dev server
npm test         # Vitest unit tests for the pure logic
npm run build    # type-check then build to dist/
npm run preview  # serve the production build at /wave/
```

Vite, TypeScript, and Vitest are dev tools only. The deployed output is static
files on GitHub Pages under `/wave/`.

The build also emits `case-study.html`, a separate editorial page that tells
the story of the instrument. It has its own stylesheet and never loads the
synth, so the app stays a single page. The story lives in `case-study.html`;
the styles are in `src/case-study.css`, and the two small behaviours (read
progress and shot list focus) are in `src/case-study.ts`.

## Where to look for a change

- **Sound:** `PRESETS` and `createVoice()` in `src/audio.ts`
- **Look:** `src/style.css` for layout, `src/orb.ts` for canvas drawing
- **Demo song:** `DEMO_NOTES` in `src/main.ts`
- **Demo timing and filter:** `src/demo.ts`
- **Controls:** `index.html` for markup, then the matching handler in
  `src/main.ts`
- **Timing:** `src/arp.ts`
- **Storage rules:** `src/settings.ts`
- **Easter egg mapping and Konami code:** `src/egg.ts`

## Suggested reading order

1. `CONCEPT.md` for the intent.
2. `index.html` for the page structure.
3. `src/main.ts` for how everything is wired together.
4. `src/audio.ts` for how a note becomes sound.
5. `src/orb.ts` for how sound becomes pixels.
6. The small modules (`arp.ts`, `demo.ts`, `egg.ts`, `format.ts`, `midi.ts`,
   `settings.ts`) as needed.
