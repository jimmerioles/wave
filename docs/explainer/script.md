# Wave: the playable synth, explained

A 3:15 animated explainer for the Wave prototype. 1920 × 1080, 30 fps,
stereo.

- **Watch:** the inline player in the [repository README](../../README.md#watch-the-explainer)
- **Poster:** [wave-explainer-poster.jpg](wave-explainer-poster.jpg)
- **Companion docs:** [ARCHITECTURE.md](../../ARCHITECTURE.md),
  [CONCEPT.md](../../CONCEPT.md)

The film follows one key press through the instrument: the voice, the shared
effects chain, the analyser that paints the stage, the audio clock behind the
arp, and the note data behind *First Light*. It is made in the spirit of a
3Blue1Brown explainer: dark field, deliberate pacing, diagrams that build, and
a single idea carried from start to finish.

## Chapters

| Time | Chapter | On screen |
| --- | --- | --- |
| 0:01 | Cold open | The wordmark, three claims, then the live page. The stage lifts out of the page as a match cut. |
| 0:22 | The signal | Two crossed-out cards (a video loop, a fake spectrum) give way to the real stage and a live analyser trace. |
| 0:39 | One voice | The A key, three oscillators converging on one voice, the ADSR envelope, and eight voice meters. |
| 1:04 | The shared chain | Voice to bus to filter to soft clip, compressor, analyser, mute and out. Delay and reverb sit in a send rack. |
| 1:28 | The quiet trick | The mute switch sits after the analyser. The speakers go silent, the stage keeps breathing. |
| 1:43 | Two views | Waveform ring, spectrum ticks, and three springs settling under the actual stage. |
| 2:05 | The clock | Arp steps, a 120 ms lookahead window, a magnified scheduler, and the real timeout constants. |
| 2:21 | First Light is data | Every note event in the cue, the filter ride, and the moment the player takes the filter back. |
| 2:37 | Five moods | Five orbs, one engine, five motion signatures: breathes, shimmers, drags, drifts, snaps. |
| 2:55 | A small instrument | The numbers, the stack, and the end card. |

## Narration

### 0:01 · Cold open

> Here's a strange idea for a landing page. Don't tell people about the
> instrument. Hand them one. Eight keys. Five moods. No samples. This is Wave,
> a synthesizer that lives entirely in the browser. And everything you're about
> to see is drawn from the sound it makes.

### 0:22 · The signal

> There is no waveform video playing on a loop. No pre-rendered spectrum. The
> orb on the stage is reading the actual audio signal, sixty times a second,
> and painting what it finds. The page isn't illustrating sound. It's listening
> to it.

### 0:39 · One voice

> Follow one key press. You hold the A key, and a voice wakes up. Three
> oscillators: a saw, a triangle, a sine, tuned slightly apart so they shimmer
> against each other. An envelope shapes the note. A fast attack, a decay to a
> sustain, and a long release when you let go. Eight voices like this one can
> run at once.

### 1:04 · The shared chain

> They all feed one shared chain. A resonant low-pass filter. A stereo
> ping-pong delay, and a convolution reverb built from a generated impulse
> response. Then a soft clipper and a compressor, so a fistful of keys never
> turns into a mess. At the end, an analyser takes a copy of the signal for the
> stage.

### 1:28 · The quiet trick

> Notice where the mute switch sits. After the analyser. So when you turn the
> sound off, the speakers go quiet, but the instrument keeps breathing on
> screen. The visuals never lie, even in silence.

### 1:43 · Two views

> The orb reads two views of the same signal. The time domain, a waveform
> wrapped into a ring. And the frequency domain, a spray of ticks for the
> energy in each band. Springs smooth the level, the bass and the treble, so
> the motion has weight. It settles, instead of twitching.

### 2:05 · The clock

> Time is the other instrument. The arpeggiator doesn't trust the page clock.
> It looks a hundred and twenty milliseconds ahead, and schedules real notes on
> the audio clock, so the pattern stays steady even when the drawing gets busy.

### 2:21 · First Light is data

> And the demo, First Light, isn't a recording either. It's a list of note
> events, played through the same voices you play by hand. The filter rides the
> arrangement. The moment you touch it, control comes back to you.

### 2:37 · Five moods

> Five presets reshape the oscillators, the filter, the envelope, the delay and
> the space. Each one also gets its own way of moving. Glass shimmers. Tape
> drags. Haze drifts. Pulse snaps. Bloom breathes.

### 2:55 · A small instrument

> All of it is TypeScript, Canvas and the Web Audio API. No audio files, no
> runtime libraries, no backend. Just a small instrument, with a page wrapped
> around it. Hold a key, and the page answers.

## How it was made

- **Format:** 1920 × 1080, 30 fps, 5,854 frames, 3:15.1, H.264 High with AAC
  stereo at 48 kHz.
- **Visuals:** the real app was captured at 1600 × 1000, then the stage and
  keybed crops were used inside a deterministic Canvas 2D renderer. The
  diagrams, type, springs, piano roll and match cuts are drawn per frame, not
  edited from stock footage. Frames were encoded in Chromium with WebCodecs
  (VP9) and mastered to H.264.
- **Narration:** a synthetic neural voice, generated sentence by sentence. The
  scene timings are driven by those sentence durations, so the diagrams land on
  the words.
- **Music:** *First Light* and a sustained Haze pad were recorded from the
  prototype's master bus, then arranged under the narration with gentle
  sidechain ducking. The Haze pad is crossfaded into a seamless loop.
- **Loudness:** -16.0 LUFS integrated, true peak -3.4 dBTP.
- **Scope:** the explainer is a separate production. The app itself still has
  no runtime dependencies and no audio files.

## Credits

- Wave prototype and *First Light*: Jim Merioles.
- Narration: synthetic neural voice, generated for this explainer.
- Visuals, edit and mix: produced for the Wave prototype.
