<div align="center">

https://github.com/user-attachments/assets/20b9a6d3-5a69-4bb5-9805-8a9da5fef40e

[![Tests](https://github.com/jimmerioles/wave/actions/workflows/test.yml/badge.svg)](https://github.com/jimmerioles/wave/actions/workflows/test.yml) [![Deploy to GitHub Pages](https://github.com/jimmerioles/wave/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/jimmerioles/wave/actions/workflows/deploy-pages.yml)

**Live demo:** https://jimmerioles.github.io/wave/

**Case study:** https://jimmerioles.github.io/wave/case-study.html

# Wave: the playable synth

**Eight keys, five moods, one warm little instrument.**

</div>

Wave is a browser synthesizer where the page is the instrument. Hold a key or
tap a pad, and the orb, rings and meters answer the sound you are making,
because they read the live audio signal rather than a loop. It is a small
prototype for people who care about interaction design and the web platform,
and an argument that a landing page can be the product demo.

## Features

- **Eight-voice synth.** Three oscillators per voice, a shared resonant filter,
  ping-pong delay, convolution reverb, soft clip and compressor.
- **Five presets, five motions.** Bloom, Glass, Tape, Haze and Pulse reshape the
  sound and the stage.
- **Arp with latch.** Up, down, up/down and random patterns at 1/4, 1/8, 1/16
  and 1/8T, on a shared 50 to 160 BPM clock.
- **First Light.** An original 12-bar cue played through the live voices, with a
  filter ride that hands control back when you touch it.
- **Record a take.** Capture the master mix with MediaRecorder and download it.
- **MIDI input.** Note on/off and velocity from any connected device. Notes in
  C3 to C4 light the pads.
- **Live stage.** Orb and oscilloscope views drawn from the same analyser, with a
  reduced-motion fallback.
- **No samples, no backend.** Every sound is synthesized at runtime; the build is
  static files.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit suite
npm run build     # type-check + production build
npm run preview   # serve dist/ at /wave/
```

The production build is static files on GitHub Pages. Vite, TypeScript and
Vitest are dev-only.

## Use it

- Hold `A` `S` `D` `F` `G` `H` `J` `K`, or press and hold a pad. Drag across
  pads to glissando; multi-touch works too.
- **Arp** turns held or latched notes into a pattern. Pick a pattern and rate,
  then set the shared tempo. `Esc` stops the pattern.
- **Bloom / Glass / Tape / Haze / Pulse** change the voice and the stage.
  **Filter**, **Echo** and **Space** shape the mix.
- **Orb / Scope** switches the stage. **Play First Light** performs the demo at
  the current tempo; `Esc` stops it.
- **Rec** records the master mix. **Sound on** mutes and unmutes without
  stopping the visuals. **About** has the reset.
- Connect a MIDI keyboard from the top bar. Audio starts on the first pointer or
  key gesture.

There is a hidden synth-pop edit behind the wave mark. Triple-tap it, or try the
Konami code.

## How it works

One key press wakes a voice: three detuned oscillators into a shared filter,
delay, reverb, soft clip and compressor. An analyser taps the chain, and the
stage draws its waveform and frequency data. The arpeggiator schedules notes
against the audio clock, and First Light is note data played through the same
voices. Mute sits after the analyser, so the stage keeps moving with the sound
off. [ARCHITECTURE.md](ARCHITECTURE.md) maps the code.

## Tests

`npm test` covers settings validation, MIDI parsing and pad mapping, arp math,
and frequency helpers. Audio, visuals, the demo, recording and physical MIDI
devices are manual browser checks.

## Limits

- The keybed is one octave. The demo uses D4 and E4 above it, but the pads stop
  at C4.
- First Light is a fixed 12-bar cue, not a sequencer. Tempo is adjustable; the
  arrangement is not.
- The arp is monophonic per step and has no swing or per-step editing.
- Recording is session-only MediaRecorder output, capped at three minutes, with
  no WAV export or sharing. Some browsers omit duration metadata until playback.
- MIDI covers note on/off and velocity. CC, pitch bend and clock are ignored.

## Credits

First Light is an original composition for this prototype.

The hidden easter egg is a short synthesized quote of "Never Gonna Give You Up,"
written by Mike Stock, Matt Aitken and Pete Waterman and performed by Rick
Astley. All rights remain with the writers and publishers.

## License

No license has been published for this prototype. The code and original music
are shared for review; all rights reserved.
