import "./style.css";
import {
  KEYBED_SIZE,
  NOTES,
  PRESETS,
  RickrollAudio,
  cutoffFromSlider,
  formatHz,
  type PresetKey,
  SynthEngine,
} from "./audio";
import { OrbScene } from "./orb";

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const engine = new SynthEngine();

const canvas = must<HTMLCanvasElement>("#orb");
const stage = must<HTMLElement>("#stage");
const keybed = must<HTMLElement>("#keybed");
const noteReadout = must<HTMLElement>("#note-readout");
const noteSub = must<HTMLElement>("#note-sub");
const meterBars = must<HTMLElement>("#meter-bars");
const meterValue = must<HTMLElement>("#meter-value");
const stagePreset = must<HTMLElement>("#stage-preset");
const cutoff = must<HTMLInputElement>("#cutoff");
const cutoffOut = must<HTMLOutputElement>("#cutoff-out");
const delay = must<HTMLInputElement>("#delay");
const delayOut = must<HTMLOutputElement>("#delay-out");
const muteButton = must<HTMLButtonElement>("#mute");
const muteLabel = must<HTMLElement>("#mute-label");
const demoButton = must<HTMLButtonElement>("#demo");
const demoLabel = must<HTMLElement>("#demo-label");
const demoSub = must<HTMLElement>("#demo-sub");
const presetButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".preset"),
);
const about = must<HTMLDialogElement>("#about");
const aboutOpen = must<HTMLButtonElement>("#about-open");
const aboutClose = must<HTMLButtonElement>("#about-close");
const brand = must<HTMLAnchorElement>(".brand");
const eggToast = must<HTMLElement>("#egg-toast");

const NOTE_ACCENTS = [
  "#ff6a4d",
  "#ff7c54",
  "#ff9660",
  "#ffb871",
  "#ffd98d",
  "#d3e7a0",
  "#9ef0bd",
  "#6df3cd",
];

const activeSources = new Map<string, number>();
const noteCounts = new Array<number>(NOTES.length).fill(0);
const heldKeys = new Set<string>();
const pads: HTMLButtonElement[] = [];
const padNotes = NOTES.slice(0, KEYBED_SIZE);
let lastNote = -1;
let readoutTimer: number | null = null;

function buildKeybed(): void {
  padNotes.forEach((note, index) => {
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "pad";
    pad.dataset.note = String(index);
    pad.setAttribute("aria-label", `Play ${note.name} with the ${note.key} key`);
    pad.setAttribute("aria-pressed", "false");
    pad.style.setProperty("--pad-accent", NOTE_ACCENTS[index] ?? "#ff6a4d");

    pad.innerHTML = `
      <span class="pad-top">
        <span class="pad-note">${note.name}</span>
        <span class="pad-index">0${index + 1}</span>
      </span>
      <span class="pad-key">${note.key}</span>
      <span class="pad-bar" aria-hidden="true"></span>
    `;

    const sourceFor = (pointerId: number): string => `pointer:${pointerId}`;

    pad.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      try {
        pad.setPointerCapture(event.pointerId);
      } catch {
        /* Capture is a nicety; the note still plays. */
      }
      engine.ensure();
      press(index, sourceFor(event.pointerId));
    });

    const endPointer = (event: PointerEvent): void => {
      release(sourceFor(event.pointerId));
    };

    pad.addEventListener("pointerup", endPointer);
    pad.addEventListener("pointercancel", endPointer);
    pad.addEventListener("lostpointercapture", endPointer);

    pad.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const rect = pad.getBoundingClientRect();
      pad.style.setProperty("--px", `${event.clientX - rect.left}px`);
      pad.style.setProperty("--py", `${event.clientY - rect.top}px`);
    });

    pad.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (event.repeat) return;
      const source = `padkey:${index}:${event.code}`;
      engine.ensure();
      press(index, source);
    });

    pad.addEventListener("keyup", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      release(`padkey:${index}:${event.code}`);
    });

    pad.addEventListener("blur", () => {
      release(`padkey:${index}:Space`);
      release(`padkey:${index}:Enter`);
    });

    keybed.append(pad);
    pads.push(pad);
  });
}

function syncPlayingState(): void {
  document.body.classList.toggle(
    "is-playing",
    activeSources.size > 0 || demoPlaying || eggPlaying,
  );
}

function setPadState(noteIndex: number, active: boolean): void {
  const pad = pads[noteIndex];
  if (!pad) return;
  pad.classList.toggle("is-active", active);
  pad.setAttribute("aria-pressed", String(active));
}

function setReadout(noteIndex: number): void {
  if (readoutTimer !== null) {
    clearTimeout(readoutTimer);
    readoutTimer = null;
  }
  const note = NOTES[noteIndex];
  if (!note) return;

  noteReadout.textContent = note.name;
  const voices = activeSources.size;
  const label = note.demoOnly ? "demo" : note.key;
  noteSub.textContent =
    voices > 1 ? `${label} · ${voices} voices` : `${label} · held`;
  noteReadout.classList.add("is-live");
}

function resetReadoutSoon(): void {
  if (readoutTimer !== null) clearTimeout(readoutTimer);
  readoutTimer = window.setTimeout(() => {
    if (activeSources.size > 0) return;
    noteReadout.textContent = lastNote >= 0 ? NOTES[lastNote].name : "—";
    noteSub.textContent = lastNote >= 0 ? "released" : "hold a key";
    noteReadout.classList.remove("is-live");
  }, 240);
}

function press(noteIndex: number, source: string, velocity = 1): void {
  if (activeSources.has(source)) return;
  const note = NOTES[noteIndex];
  if (!note) return;

  engine.ensure();
  activeSources.set(source, noteIndex);
  noteCounts[noteIndex] = (noteCounts[noteIndex] ?? 0) + 1;

  if (noteCounts[noteIndex] === 1) {
    engine.noteOn(noteIndex, velocity);
    orb.burst(noteIndex);
  }

  lastNote = noteIndex;
  setPadState(noteIndex, true);
  setReadout(noteIndex);
  syncPlayingState();
}

function release(source: string, releaseSeconds?: number): void {
  const noteIndex = activeSources.get(source);
  if (noteIndex === undefined) return;

  activeSources.delete(source);
  noteCounts[noteIndex] = Math.max(0, (noteCounts[noteIndex] ?? 1) - 1);

  if (noteCounts[noteIndex] === 0) {
    engine.noteOff(noteIndex, releaseSeconds);
    setPadState(noteIndex, false);
  }

  if (activeSources.size === 0) {
    resetReadoutSoon();
  } else {
    const remaining = [...activeSources.values()][activeSources.size - 1];
    if (remaining !== undefined) setReadout(remaining);
  }

  syncPlayingState();
}

function releaseAll(): void {
  for (const source of [...activeSources.keys()]) release(source);
  heldKeys.clear();
}

buildKeybed();

const orb = new OrbScene(canvas, engine, (level, rms) => {
  const displayLevel = Math.max(0.06, Math.min(1, level));
  meterBars.style.setProperty("--l", displayLevel.toFixed(3));
  meterBars.classList.toggle("is-hot", displayLevel > 0.62);

  if (rms < 0.0015) {
    meterValue.textContent = "-∞ dB";
  } else {
    const db = Math.max(-48, Math.round(20 * Math.log10(rms)));
    meterValue.textContent = `${db > 0 ? "+" : ""}${db} dB`;
  }
});

/* -------------------------------------------------------------------------
   Presets and controls
   ------------------------------------------------------------------------- */

let currentPreset: PresetKey = "bloom";

function paintRange(input: HTMLInputElement): void {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const percent = ((value - min) / (max - min)) * 100;
  input.style.setProperty("--fill", `${percent.toFixed(2)}%`);
}

function syncCutoff(): void {
  const value = Number(cutoff.value);
  engine.setCutoff(value);
  const hz = cutoffFromSlider(value);
  cutoffOut.textContent = formatHz(hz);
  cutoff.setAttribute("aria-valuetext", `${formatHz(hz)} cutoff`);
  paintRange(cutoff);
}

function syncEcho(): void {
  const value = Number(delay.value);
  engine.setEcho(value / 100);
  delayOut.textContent = `${value}%`;
  delay.setAttribute("aria-valuetext", `${value} percent echo`);
  paintRange(delay);
}

function applyPreset(key: PresetKey, syncControls = true): void {
  const preset = PRESETS[key];
  currentPreset = key;

  engine.setPreset(key);
  orb.setPreset(key);
  stagePreset.textContent = preset.name;
  stagePreset.dataset.preset = key;
  document.body.dataset.preset = key;

  for (const button of presetButtons) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.preset === currentPreset),
    );
  }

  if (syncControls) {
    cutoff.value = String(preset.cutoff);
    delay.value = String(preset.echo);
  }
  syncCutoff();
  syncEcho();
}

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    const key = button.dataset.preset as PresetKey | undefined;
    if (key && key in PRESETS) {
      applyPreset(key);
    }
  });
}

cutoff.addEventListener("input", syncCutoff);
delay.addEventListener("input", syncEcho);

/* -------------------------------------------------------------------------
   Demo: the chorus of "Goodness of God"

   A fixed, hand-arranged excerpt. The melody is written in C so it fits the
   C-major keybed; the two top notes (D4/E4) are demo-only. Bass roots sit
   under the melody to imply the F – C – G – Am progression. 4/4 at 63 BPM,
   one intro bar then eight chorus bars.
   ------------------------------------------------------------------------- */

const DEMO_BPM = 63;
const BEAT_MS = 60000 / DEMO_BPM;

const N = {
  C3: 0,
  D3: 1,
  E3: 2,
  F3: 3,
  G3: 4,
  A3: 5,
  B3: 6,
  C4: 7,
  D4: 8,
  E4: 9,
} as const;

/** [start beat, note index, length in beats, velocity] */
type DemoEvent = readonly [number, number, number, number?];

const DEMO_NOTES: readonly DemoEvent[] = [
  // Intro: one C-major bar, left to ring.
  [0, N.C3, 3.5, 0.5],
  [0.5, N.E3, 3, 0.46],
  [1, N.G3, 2.5, 0.44],
  [1.5, N.C4, 2, 0.4],

  // "All my life You have been faithful"
  [5, N.C4, 0.45],
  [5.5, N.C4, 0.45],
  [6, N.C4, 0.9],
  [7, N.B3, 0.45],
  [7.5, N.B3, 0.45],
  [8, N.A3, 0.45],
  [8.5, N.G3, 0.45],
  [9, N.C4, 2.5],
  [5, N.F3, 3.5, 0.5],
  [9, N.C3, 2.5, 0.48],

  // "All my life You have been so, so good"
  [13, N.C4, 0.45],
  [13.5, N.C4, 0.45],
  [14, N.C4, 0.9],
  [15, N.B3, 0.45],
  [15.5, N.B3, 0.45],
  [16, N.A3, 0.45],
  [16.5, N.G3, 0.45],
  [17, N.C4, 0.45],
  [17.5, N.D4, 1.5],
  [13, N.F3, 3, 0.5],
  [16, N.C3, 1.5, 0.48],
  [17.5, N.D3, 1.2, 0.46],

  // "With every breath that I am able"
  [21, N.C4, 0.45],
  [21.5, N.C4, 0.45],
  [22, N.C4, 0.45],
  [22.5, N.C4, 0.45],
  [23, N.B3, 0.45],
  [23.5, N.B3, 0.45],
  [24, N.A3, 0.45],
  [24.5, N.G3, 0.45],
  [25, N.C4, 1.5],
  [21, N.F3, 2, 0.5],
  [23, N.C3, 2, 0.48],
  [25, N.E3, 2, 0.44],

  // "I will sing of the goodness of God"
  [29, N.E4, 0.45],
  [29.5, N.D4, 0.45],
  [30, N.C4, 0.45],
  [30.5, N.D4, 0.45],
  [31, N.E4, 0.45],
  [31.5, N.E4, 0.45],
  [32, N.D4, 0.45],
  [32.5, N.C4, 0.45],
  [33, N.C4, 2.5],
  [29, N.F3, 2, 0.5],
  [31, N.D3, 2, 0.46],
  [33, N.C3, 2.5, 0.48],
];

const DEMO_BEATS = 36;
const DEMO_LENGTH = DEMO_BEATS * BEAT_MS;
/** A shorter release keeps the demo melody legible against the pad presets. */
const DEMO_RELEASE = 0.38;

let demoTimers: number[] = [];
let demoPlaying = false;
let demoRun = 0;

function setDemoUi(playing: boolean): void {
  demoButton.classList.toggle("is-playing", playing);
  demoButton.setAttribute("aria-pressed", String(playing));
  demoButton.setAttribute(
    "aria-label",
    playing ? "Stop the demo" : "Play the chorus of Goodness of God",
  );
  demoLabel.textContent = playing ? "Stop demo" : "Play the chorus";
  demoSub.textContent = playing
    ? "Goodness of God · chorus"
    : "Goodness of God · 34s";
  syncPlayingState();
}

function startDemo(): void {
  if (eggPlaying) stopEgg();
  engine.ensure();

  // Reset the progress bar so each run starts from the left.
  demoButton.classList.remove("is-playing");
  void demoButton.offsetWidth;

  demoRun++;
  const run = demoRun;
  demoPlaying = true;
  demoButton.style.setProperty("--demo-ms", `${DEMO_LENGTH}ms`);
  setDemoUi(true);

  // Bass first on shared downbeats so the readout features the melody.
  const events = [...DEMO_NOTES].sort(
    (a, b) => a[0] - b[0] || (a[3] ?? 0.72) - (b[3] ?? 0.72),
  );
  events.forEach(([start, noteIndex, length, velocity], index) => {
    const source = `demo:${run}:${index}`;

    demoTimers.push(
      window.setTimeout(() => {
        if (!demoPlaying || run !== demoRun) return;
        press(noteIndex, source, velocity ?? 0.72);
      }, start * BEAT_MS + 40),
    );

    demoTimers.push(
      window.setTimeout(
        () => release(source, DEMO_RELEASE),
        (start + length) * BEAT_MS + 40,
      ),
    );
  });

  demoTimers.push(
    window.setTimeout(() => {
      if (run === demoRun) stopDemo();
    }, DEMO_LENGTH + 1500),
  );
}

function stopDemo(): void {
  if (!demoPlaying && demoTimers.length === 0) return;

  demoRun++;
  demoPlaying = false;
  for (const timer of demoTimers) clearTimeout(timer);
  demoTimers = [];

  for (const source of [...activeSources.keys()]) {
    if (source.startsWith("demo:")) release(source);
  }

  setDemoUi(false);
}

demoButton.addEventListener("click", () => {
  if (demoPlaying) {
    stopDemo();
  } else {
    startDemo();
  }
});

/* -------------------------------------------------------------------------
   Mute
   ------------------------------------------------------------------------- */

let muted = false;

muteButton.addEventListener("click", () => {
  muted = !muted;
  engine.setMuted(muted);
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.setAttribute(
    "aria-label",
    muted ? "Unmute sound" : "Mute sound",
  );
  muteLabel.textContent = muted ? "Muted" : "Sound on";
  document.body.classList.toggle("is-muted", muted);

  if (!muted) engine.ensure();
});

/* -------------------------------------------------------------------------
   Easter egg: the chorus of "Never Gonna Give You Up"

   A 12-second, 118 BPM synth-pop arrangement: bright lead, syncopated synth
   bass, drum machine and the Bb - C - Dm - C chord bed. The lead is
   transposed to C so it fits the keybed; the bass sits an octave below. It
   stops the main demo, borrows the stage for six bars, then puts everything
   back. Triggered by triple-tapping the brand or entering the Konami code.
   ------------------------------------------------------------------------- */

const EGG_BPM = 118;
const EGG_BEAT_MS = 60000 / EGG_BPM;
const EGG_BEATS = 24;
const EGG_BARS = 6;
const EGG_LENGTH = EGG_BEATS * EGG_BEAT_MS;
/** Milliseconds between the trigger and the first sample. */
const EGG_START_DELAY = 60;

type EggLead = readonly [beat: number, note: number, length: number];
type EggBass = readonly [beat: number, midi: number, length: number];
type EggChord = readonly [
  beat: number,
  midis: readonly number[],
  length: number,
];

const BASS_MIDI = {
  D2: 38,
  F2: 41,
  E2: 40,
  C2: 36,
  A1: 33,
  G1: 31,
} as const;

const EGG_LEAD: readonly EggLead[] = [
  // "Never gonna give you up"
  [1, N.D3, 0.46],
  [1.5, N.E3, 0.46],
  [2, N.F3, 0.23],
  [2.5, N.F3, 0.46],
  [3, N.G3, 0.46],
  [3.5, N.E3, 0.69],
  [4.25, N.D3, 0.23],
  [4.5, N.C3, 3.17],

  // "Never gonna let you down"
  [8.5, N.D3, 0.23],
  [9, N.D3, 0.46],
  [9.5, N.E3, 0.46],
  [10, N.F3, 0.46],
  [10.5, N.D3, 0.46],
  [11.5, N.C3, 0.46],
  [12, N.C4, 0.69],
  [13, N.C4, 0.46],
  [13.5, N.G3, 0.92],
  [14.5, N.A3, 0.46],
  [15, N.G3, 0.46],
  [15.5, N.F3, 0.46],

  // "Never gonna run around and desert you"
  [16.5, N.D3, 0.23],
  [17, N.D3, 0.46],
  [17.5, N.E3, 0.46],
  [18, N.F3, 0.46],
  [18.5, N.D3, 0.46],
  [19, N.F3, 0.46],
  [19.5, N.G3, 0.46],
  [20.5, N.E3, 0.46],
  [21, N.D3, 0.46],
  [21.5, N.E3, 0.92],
  [22.25, N.D3, 0.23],
  [22.5, N.C3, 1.42],
];

const EGG_BASS: readonly EggBass[] = [
  [0, BASS_MIDI.D2, 0.23],
  [0.5, BASS_MIDI.D2, 0.23],
  [0.75, BASS_MIDI.D2, 0.23],
  [1.25, BASS_MIDI.F2, 0.23],
  [1.5, BASS_MIDI.E2, 0.23],
  [2, BASS_MIDI.C2, 0.5],
  [2.5, BASS_MIDI.D2, 0.23],
  [3.5, BASS_MIDI.A1, 0.23],
  [3.75, BASS_MIDI.C2, 0.23],
  [4, BASS_MIDI.D2, 0.23],
  [4.5, BASS_MIDI.C2, 0.23],
  [4.75, BASS_MIDI.D2, 0.23],
  [5.25, BASS_MIDI.F2, 0.23],
  [5.5, BASS_MIDI.E2, 0.23],
  [7.5, BASS_MIDI.A1, 0.23],
  [7.75, BASS_MIDI.C2, 0.23],
  [8, BASS_MIDI.D2, 0.23],
  [8.5, BASS_MIDI.D2, 0.23],
  [8.75, BASS_MIDI.D2, 0.23],
  [9.25, BASS_MIDI.F2, 0.23],
  [9.5, BASS_MIDI.E2, 0.23],
  [10, BASS_MIDI.C2, 0.5],
  [10.5, BASS_MIDI.D2, 0.23],
  [11.5, BASS_MIDI.D2, 0.23],
  [11.75, BASS_MIDI.D2, 0.23],
  [12, BASS_MIDI.G1, 0.23],
  [12.5, BASS_MIDI.G1, 0.23],
  [12.75, BASS_MIDI.G1, 0.23],
  [13.25, BASS_MIDI.G1, 0.23],
  [13.5, BASS_MIDI.C2, 0.23],
  [14.5, BASS_MIDI.C2, 0.23],
  [14.75, BASS_MIDI.C2, 0.23],
  [15, BASS_MIDI.C2, 0.23],
  [15.5, BASS_MIDI.A1, 0.23],
  [15.75, BASS_MIDI.C2, 0.23],
  [16, BASS_MIDI.D2, 0.23],
  [16.5, BASS_MIDI.D2, 0.23],
  [16.75, BASS_MIDI.D2, 0.23],
  [17.25, BASS_MIDI.F2, 0.23],
  [17.5, BASS_MIDI.E2, 0.23],
  [18, BASS_MIDI.C2, 0.5],
  [18.5, BASS_MIDI.D2, 0.23],
  [19.5, BASS_MIDI.A1, 0.23],
  [19.75, BASS_MIDI.C2, 0.23],
  [20, BASS_MIDI.D2, 0.23],
  [20.5, BASS_MIDI.C2, 0.23],
  [20.75, BASS_MIDI.D2, 0.23],
  [21.25, BASS_MIDI.F2, 0.23],
  [21.5, BASS_MIDI.E2, 0.23],
  [23.5, BASS_MIDI.A1, 0.23],
  [23.75, BASS_MIDI.C2, 0.23],
];

const EGG_CHORDS: readonly EggChord[] = [
  // Bbmaj7 - C - Bbmaj7 - Dm7 - C - Bbmaj7 - C
  [0, [58, 62, 65, 69], 4],
  [4, [60, 64, 67], 4],
  [8, [58, 62, 65, 69], 4],
  [12, [62, 65, 69, 72], 1.5],
  [13.5, [60, 64, 67], 2.5],
  [16, [58, 62, 65, 69], 4],
  [20, [60, 64, 67], 4],
];

let eggTimers: number[] = [];
let eggPlaying = false;
let eggRun = 0;
let eggToastTimer: number | null = null;
let eggAudio: RickrollAudio | null = null;

function setEggToast(text: string, visible: boolean): void {
  eggToast.textContent = text;
  eggToast.classList.toggle("is-visible", visible);

  if (eggToastTimer !== null) {
    clearTimeout(eggToastTimer);
    eggToastTimer = null;
  }

  if (visible) {
    eggToastTimer = window.setTimeout(() => {
      eggToast.classList.remove("is-visible");
      eggToastTimer = null;
    }, 3200);
  }
}

function isNoteHeldByUser(noteIndex: number): boolean {
  for (const value of activeSources.values()) {
    if (value === noteIndex) return true;
  }
  return false;
}

function startEgg(): void {
  if (eggPlaying) return;
  engine.ensure();

  const ctx = engine.audioContext;
  const destination = engine.analyser;
  if (!ctx || !destination) return;

  if (demoPlaying) stopDemo();

  eggRun++;
  const run = eggRun;
  eggPlaying = true;
  eggTimers = [];

  document.body.classList.add("is-rolled");
  stagePreset.textContent = "Rolled";
  stagePreset.dataset.preset = "glass";
  document.body.dataset.preset = "glass";
  setEggToast(
    muted ? "you just got wave-rolled (silently)" : "you just got wave-rolled",
    true,
  );
  noteReadout.textContent = "♪";
  noteSub.textContent = "never gonna";
  noteReadout.classList.add("is-live");
  syncPlayingState();

  const audio = new RickrollAudio(ctx, destination);
  eggAudio = audio;
  const startAt = ctx.currentTime + EGG_START_DELAY / 1000;
  const beatSec = 60 / EGG_BPM;

  for (const [beat, noteIndex, length] of EGG_LEAD) {
    const note = NOTES[noteIndex];
    if (!note) continue;
    audio.playLead(
      note.frequency,
      startAt + beat * beatSec,
      length * beatSec,
      0.9,
    );
  }

  for (const [beat, midi, length] of EGG_BASS) {
    audio.playBass(midi, startAt + beat * beatSec, length * beatSec, 0.95);
  }

  for (const [beat, midis, length] of EGG_CHORDS) {
    audio.playChord(midis, startAt + beat * beatSec, length * beatSec, 0.55);
  }

  for (let bar = 0; bar < EGG_BARS; bar++) {
    const b = bar * 4;
    audio.kick(startAt + b * beatSec, 0.95);
    audio.kick(startAt + (b + 2) * beatSec, 0.9);
    audio.snare(startAt + (b + 1) * beatSec, 0.85);
    audio.snare(startAt + (b + 3) * beatSec, 0.85);

    for (let i = 0; i < 4; i++) {
      audio.hat(startAt + (b + i) * beatSec, i === 0 ? 0.8 : 0.65);
    }
    audio.hat(startAt + (b + 0.5) * beatSec, 0.6, true);
    audio.hat(startAt + (b + 1.5) * beatSec, 0.5);
    audio.hat(startAt + (b + 1.75) * beatSec, 0.4);
    audio.hat(startAt + (b + 2.5) * beatSec, 0.65, true);
    audio.hat(startAt + (b + 3.5) * beatSec, 0.6, true);
  }

  audio.crash(startAt, 0.9);
  audio.crash(startAt + 22 * beatSec, 0.6);

  for (const [beat, noteIndex, length] of EGG_LEAD) {
    const atMs = EGG_START_DELAY + beat * EGG_BEAT_MS;
    const lengthMs = Math.max(110, length * EGG_BEAT_MS);
    eggTimers.push(
      window.setTimeout(() => {
        if (!eggPlaying || run !== eggRun) return;
        if (!isNoteHeldByUser(noteIndex)) {
          setPadState(noteIndex, true);
          orb.burst(noteIndex);
        }
        eggTimers.push(
          window.setTimeout(() => {
            if (!eggPlaying || run !== eggRun) return;
            if (!isNoteHeldByUser(noteIndex)) {
              setPadState(noteIndex, false);
            }
          }, lengthMs),
        );
      }, atMs),
    );
  }

  eggTimers.push(
    window.setTimeout(() => {
      if (run === eggRun) stopEgg();
    }, EGG_LENGTH + 1500),
  );
}

function stopEgg(): void {
  if (!eggPlaying && eggTimers.length === 0 && !eggAudio) return;

  eggRun++;
  eggPlaying = false;
  for (const timer of eggTimers) clearTimeout(timer);
  eggTimers = [];

  eggAudio?.stop();
  eggAudio = null;

  for (let i = 0; i < KEYBED_SIZE; i++) {
    if (!isNoteHeldByUser(i)) setPadState(i, false);
  }

  document.body.classList.remove("is-rolled");
  stagePreset.textContent = PRESETS[currentPreset].name;
  stagePreset.dataset.preset = currentPreset;
  document.body.dataset.preset = currentPreset;
  setEggToast("", false);

  if (activeSources.size > 0) {
    const remaining = [...activeSources.values()][activeSources.size - 1];
    if (remaining !== undefined) setReadout(remaining);
  } else {
    noteReadout.textContent = lastNote >= 0 ? NOTES[lastNote].name : "—";
    noteSub.textContent = lastNote >= 0 ? "released" : "hold a key";
    noteReadout.classList.remove("is-live");
  }

  syncPlayingState();
}

let brandTaps = 0;
let brandTapTimer: number | null = null;

brand.addEventListener("click", (event) => {
  brandTaps++;
  if (brandTapTimer !== null) {
    clearTimeout(brandTapTimer);
    brandTapTimer = null;
  }

  if (brandTaps >= 3) {
    event.preventDefault();
    brandTaps = 0;
    brand.blur();
    startEgg();
    return;
  }

  brandTapTimer = window.setTimeout(() => {
    brandTaps = 0;
    brandTapTimer = null;
  }, 800);
});

/* -------------------------------------------------------------------------
   About dialog
   ------------------------------------------------------------------------- */

aboutOpen.addEventListener("click", () => {
  about.showModal();
});

aboutClose.addEventListener("click", () => {
  about.close();
});

about.addEventListener("click", (event) => {
  if (event.target === about) about.close();
});

/* -------------------------------------------------------------------------
   Computer keyboard
   ------------------------------------------------------------------------- */

const KEY_CODE_MAP: Record<string, number> = {
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  KeyF: 3,
  KeyG: 4,
  KeyH: 5,
  KeyJ: 6,
  KeyK: 7,
};

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
] as const;

let konamiIndex = 0;

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, [contenteditable='true'], [role='slider'], [role='button']",
    ),
  );
}

function trackKonami(event: KeyboardEvent): boolean {
  if (event.code === KONAMI[konamiIndex]) {
    konamiIndex++;
    if (konamiIndex === KONAMI.length) {
      konamiIndex = 0;
      startEgg();
      return true;
    }
  } else {
    konamiIndex = event.code === KONAMI[0] ? 1 : 0;
  }

  return false;
}

window.addEventListener("keydown", (event) => {
  if (about.open) {
    konamiIndex = 0;
    return;
  }

  if (event.key === "Escape") {
    if (eggPlaying) {
      stopEgg();
      return;
    }
    if (demoPlaying) {
      stopDemo();
      return;
    }
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    konamiIndex = 0;
    return;
  }
  if (event.repeat) return;

  const target = event.target;
  const targetIsRange =
    target instanceof HTMLInputElement && target.type === "range";
  const targetIsText =
    target instanceof Element &&
    Boolean(
      target.closest(
        "textarea, select, [contenteditable='true'], input:not([type='range'])",
      ),
    );

  // Range inputs keep their arrow keys; text fields keep every key.
  if (targetIsRange || targetIsText) {
    konamiIndex = 0;
    return;
  }

  // Buttons and links can still host the Konami code, even though they keep
  // note keys from firing while focused.
  if (trackKonami(event)) return;
  if (isInteractiveTarget(target)) return;

  const noteIndex = KEY_CODE_MAP[event.code];
  if (noteIndex === undefined) return;
  if (heldKeys.has(event.code)) return;

  event.preventDefault();
  heldKeys.add(event.code);
  press(noteIndex, `key:${event.code}`);
});

window.addEventListener("keyup", (event) => {
  if (!heldKeys.has(event.code)) return;
  heldKeys.delete(event.code);
  release(`key:${event.code}`);
});

/* -------------------------------------------------------------------------
   Stage pointer parallax + keyboard-style hover
   ------------------------------------------------------------------------- */

stage.addEventListener("pointermove", (event) => {
  const rect = stage.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  orb.setPointer(nx, ny);
  stage.style.setProperty(
    "--mx",
    `${((event.clientX - rect.left) / rect.width) * 100}%`,
  );
  stage.style.setProperty(
    "--my",
    `${((event.clientY - rect.top) / rect.height) * 100}%`,
  );
});

stage.addEventListener("pointerleave", () => {
  orb.setPointer(0, 0);
  stage.style.setProperty("--mx", "50%");
  stage.style.setProperty("--my", "50%");
});

/* -------------------------------------------------------------------------
   First gesture, page visibility, and cleanup
   ------------------------------------------------------------------------- */

const unlockAudio = (): void => engine.ensure();
window.addEventListener("pointerdown", unlockAudio, {
  capture: true,
  once: true,
  passive: true,
});
window.addEventListener("keydown", unlockAudio, {
  capture: true,
  once: true,
});

window.addEventListener("blur", () => {
  konamiIndex = 0;
  stopDemo();
  stopEgg();
  releaseAll();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopDemo();
    stopEgg();
    releaseAll();
    void engine.suspend();
  } else {
    void engine.resume();
  }
});

// Keep the initial UI honest before any sound has been made.
noteReadout.textContent = "—";
noteSub.textContent = "hold a key";
applyPreset("bloom");
