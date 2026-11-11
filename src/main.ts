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
import {
  ARP_PATTERN_LABELS,
  Arpeggiator,
  type ArpPattern,
  type ArpRate,
} from "./arp";
import {
  clearSettings,
  loadSettings,
  saveSettings,
  type StoredSettings,
  type VisualMode,
} from "./settings";
import { MidiInput, midiNoteName, padForMidiNote, type MidiStatus } from "./midi";
import { OrbScene } from "./orb";
import {
  SONG_BASS,
  SONG_BEATS,
  SONG_DRUMS,
  SONG_HORN,
  SONG_LEAD,
  SONG_PIANO,
  SONG_STRINGS,
} from "./rickroll-song";

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
const viewOrb = must<HTMLButtonElement>("#view-orb");
const viewScope = must<HTMLButtonElement>("#view-scope");
const cutoff = must<HTMLInputElement>("#cutoff");
const cutoffOut = must<HTMLOutputElement>("#cutoff-out");
const delay = must<HTMLInputElement>("#delay");
const delayOut = must<HTMLOutputElement>("#delay-out");
const space = must<HTMLInputElement>("#space");
const spaceOut = must<HTMLOutputElement>("#space-out");
const muteButton = must<HTMLButtonElement>("#mute");
const muteLabel = must<HTMLElement>("#mute-label");
const midiButton = must<HTMLButtonElement>("#midi");
const midiLabel = must<HTMLElement>("#midi-label");
const recordButton = must<HTMLButtonElement>("#record");
const recordLabel = must<HTMLElement>("#record-label");
const takeButton = must<HTMLButtonElement>("#take");
const takeLabel = must<HTMLElement>("#take-label");
const takeDialog = must<HTMLDialogElement>("#take-dialog");
const takeClose = must<HTMLButtonElement>("#take-close");
const takeMeta = must<HTMLElement>("#take-meta");
const takeAudio = must<HTMLAudioElement>("#take-audio");
const takeDownload = must<HTMLAnchorElement>("#take-download");
const takeDiscard = must<HTMLButtonElement>("#take-discard");
const demoButton = must<HTMLButtonElement>("#demo");
const demoLabel = must<HTMLElement>("#demo-label");
const demoSub = must<HTMLElement>("#demo-sub");
const arpToggle = must<HTMLButtonElement>("#arp-toggle");
const arpState = must<HTMLElement>("#arp-state");
const arpLatch = must<HTMLButtonElement>("#arp-latch");
const arpPatternButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-pattern]"),
);
const arpRateButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-rate]"),
);
const tempoInput = must<HTMLInputElement>("#tempo");
const tempoOut = must<HTMLOutputElement>("#tempo-out");
const keybedHint = must<HTMLElement>("#keybed-hint");
const keybedMeta = must<HTMLElement>("#keybed-meta");
const presetButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".preset"),
);
const about = must<HTMLDialogElement>("#about");
const aboutOpen = must<HTMLButtonElement>("#about-open");
const aboutClose = must<HTMLButtonElement>("#about-close");
const resetInstrumentButton = must<HTMLButtonElement>("#reset-instrument");
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

/** MIDI note number to the matching one-octave pad, where one exists. */
function midiVisualIndex(midi: number): number {
  return Math.max(0, Math.min(9, (midi - 48) * 0.5 + 3.5));
}

interface MidiNoteState {
  source: string;
  padIndex: number | null;
  velocity: number;
}

const activeSources = new Map<string, number>();
const midiActive = new Map<number, MidiNoteState>();
let midiReadoutActive = false;
const noteCounts = new Array<number>(NOTES.length).fill(0);
const heldKeys = new Set<string>();
const glidePointers = new Map<number, string>();
const pads: HTMLButtonElement[] = [];
const padNotes = NOTES.slice(0, KEYBED_SIZE);
let lastNote = -1;
let readoutTimer: number | null = null;
let arpStepNote = -1;
let arpStepTimer: number | null = null;
let arpChord: number[] = [];
let tempo = 100;
interface RecordingSession {
  recorder: MediaRecorder;
  chunks: BlobPart[];
  startedAt: number;
  stoppedAt: number | null;
  mimeType: string;
}
let recording: RecordingSession | null = null;
let recordTicker: number | null = null;
let recordLimitTimer: number | null = null;
let takeUrl: string | null = null;
let takeDuration = 0;
const storedSettings = loadSettings();
let visualMode: VisualMode = storedSettings.visual ?? "orb";

function isUserSource(source: string): boolean {
  return !source.startsWith("demo:");
}

/** Notes physically held on the pads or keyboard, in keyboard order. */
function userHeldNotes(): number[] {
  const notes = new Set<number>();
  for (const [source, noteIndex] of activeSources) {
    if (isUserSource(source)) notes.add(noteIndex);
  }
  return [...notes].sort((a, b) => a - b);
}

/**
 * The arp's note pool. With latch on, released notes stay in the chord until
 * a new chord is started; with latch off, it mirrors the physical keys.
 */
function arpPoolNotes(): number[] {
  return arp.latch ? arpChord : userHeldNotes();
}

function userSourceCount(): number {
  let count = 0;
  for (const source of activeSources.keys()) {
    if (isUserSource(source)) count++;
  }
  return count;
}

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
      const source = sourceFor(event.pointerId);
      glidePointers.set(event.pointerId, source);
      press(index, source);
    });

    const endPointer = (event: PointerEvent): void => {
      glidePointers.delete(event.pointerId);
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

function padIndexAtPoint(clientX: number, clientY: number): number | null {
  const element = document.elementFromPoint(clientX, clientY);
  const pad = element?.closest<HTMLButtonElement>(".pad");
  if (!pad) return null;
  const index = Number(pad.dataset.note);
  return Number.isInteger(index) ? index : null;
}

/** Drag across the keybed to play one note after another. */
window.addEventListener(
  "pointermove",
  (event) => {
    const source = glidePointers.get(event.pointerId);
    if (!source) return;

    const next = padIndexAtPoint(event.clientX, event.clientY);
    const current = activeSources.get(source);
    if (next === current) return;

    if (current !== undefined) release(source);
    if (next !== null) {
      engine.ensure();
      press(next, source);
    }
  },
  { passive: true },
);

const endGlide = (event: PointerEvent): void => {
  const source = glidePointers.get(event.pointerId);
  if (!source) return;
  glidePointers.delete(event.pointerId);
  release(source);
};

window.addEventListener("pointerup", endGlide, { passive: true });
window.addEventListener("pointercancel", endGlide, { passive: true });

function syncPlayingState(): void {
  document.body.classList.toggle(
    "is-playing",
    activeSources.size > 0 ||
      midiActive.size > 0 ||
      demoPlaying ||
      eggPlaying ||
      arp.isPlaying,
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
    if (activeSources.size > 0 || arp.isPlaying || midiReadoutActive) return;
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
  const user = isUserSource(source);
  if (user) midiReadoutActive = false;

  // Latch builds a chord that survives key-up. A press with nothing else
  // held starts a new chord.
  if (user && arp.enabled && arp.latch) {
    if (userSourceCount() === 0) arpChord = [];
    if (!arpChord.includes(noteIndex)) {
      arpChord = [...arpChord, noteIndex].sort((a, b) => a - b);
    }
  }

  activeSources.set(source, noteIndex);
  noteCounts[noteIndex] = (noteCounts[noteIndex] ?? 0) + 1;

  if (noteCounts[noteIndex] === 1 && !(user && arp.enabled)) {
    engine.noteOn(noteIndex, velocity);
    orb.burst(noteIndex);
  }

  lastNote = noteIndex;
  setPadState(noteIndex, true);
  setReadout(noteIndex);

  if (user) {
    arp.refresh();
    syncArpPads();
  }

  syncPlayingState();
}

function release(source: string, releaseSeconds?: number): void {
  const noteIndex = activeSources.get(source);
  if (noteIndex === undefined) return;

  const user = isUserSource(source);

  activeSources.delete(source);
  noteCounts[noteIndex] = Math.max(0, (noteCounts[noteIndex] ?? 1) - 1);

  if (noteCounts[noteIndex] === 0) {
    if (!(user && arp.enabled)) {
      engine.noteOff(noteIndex, releaseSeconds);
    }
    setPadState(noteIndex, false);
  }

  if (user) {
    arp.refresh();
    syncArpPads();
  }

  if (activeSources.size === 0) {
    if (!arp.isPlaying) resetReadoutSoon();
  } else {
    const remaining = [...activeSources.values()][activeSources.size - 1];
    if (remaining !== undefined) setReadout(remaining);
  }

  syncPlayingState();
}

function releaseAll(): void {
  releaseMidiNotes();
  for (const source of [...activeSources.keys()]) release(source);
  heldKeys.clear();
  glidePointers.clear();
  arpChord = [];
  arp.stop();
  syncArpPads();
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
   Arpeggiator
   ------------------------------------------------------------------------- */

const arp = new Arpeggiator(
  engine,
  arpPoolNotes,
  () => tempo,
  showArpStep,
  clearArpStep,
);

function showArpStep(noteIndex: number, durationMs: number): void {
  if (!arp.enabled) return;

  if (arpStepTimer !== null) {
    clearTimeout(arpStepTimer);
    arpStepTimer = null;
  }
  for (const pad of pads) pad.classList.remove("is-arp-step");

  arpStepNote = noteIndex;
  pads[noteIndex]?.classList.add("is-arp-step");

  lastNote = noteIndex;
  if (!midiReadoutActive) {
    noteReadout.textContent = NOTES[noteIndex]?.name ?? "—";
    noteSub.textContent = `arp · ${ARP_PATTERN_LABELS[arp.pattern]}`;
    noteReadout.classList.add("is-live");
  }
  orb.burst(noteIndex);

  arpStepTimer = window.setTimeout(() => {
    if (arpStepNote !== noteIndex) return;
    pads[noteIndex]?.classList.remove("is-arp-step");
    arpStepNote = -1;
    arpStepTimer = null;
  }, Math.max(90, durationMs * 0.82));
}

function clearArpStep(): void {
  if (arpStepTimer !== null) {
    clearTimeout(arpStepTimer);
    arpStepTimer = null;
  }
  for (const pad of pads) pad.classList.remove("is-arp-step");
  arpStepNote = -1;

  if (midiReadoutActive) {
    syncPlayingState();
    return;
  }

  if (activeSources.size > 0) {
    const remaining = [...activeSources.values()][activeSources.size - 1];
    if (remaining !== undefined) setReadout(remaining);
    syncPlayingState();
    return;
  }

  noteReadout.textContent = lastNote >= 0 ? NOTES[lastNote].name : "—";
  noteSub.textContent = lastNote >= 0 ? "released" : "hold a key";
  noteReadout.classList.remove("is-live");
  syncPlayingState();
}

function syncArpPads(): void {
  const latched = new Set(arp.latch ? arpChord : []);
  for (const [index, pad] of pads.entries()) {
    pad.classList.toggle(
      "is-latched",
      arp.enabled && arp.latch && latched.has(index),
    );
  }
}

function updateArpMeta(): void {
  document.body.classList.toggle("is-arp", arp.enabled);

  keybedMeta.textContent = arp.enabled
    ? `Arp · ${ARP_PATTERN_LABELS[arp.pattern]} · ${arp.rate} · ${tempo} BPM${
        arp.latch ? " · latch" : ""
      }`
    : "A–K · 8 voices · polyphonic";

  keybedHint.textContent = arp.enabled
    ? arp.latch
      ? "Hold a chord. Latch it. Let it run."
      : "Hold a chord. Let it run."
    : "Hold a key. Shape the wave.";
}

function syncArpUi(): void {
  arpToggle.setAttribute("aria-pressed", String(arp.enabled));
  arpToggle.setAttribute(
    "aria-label",
    `Arpeggiator ${arp.enabled ? "on" : "off"}`,
  );
  arpState.textContent = arp.enabled ? "On" : "Off";
  arpLatch.setAttribute("aria-pressed", String(arp.latch));

  for (const button of arpPatternButtons) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.pattern === arp.pattern),
    );
  }
  for (const button of arpRateButtons) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.rate === arp.rate),
    );
  }

  updateArpMeta();
  syncArpPads();
}

function setArpEnabled(enabled: boolean, resumeHeld = true): void {
  if (arp.enabled === enabled) {
    syncArpUi();
    return;
  }

  if (enabled) {
    if (demoPlaying) stopDemo();
    if (eggPlaying) stopEgg();

    for (const noteIndex of userHeldNotes()) engine.noteOff(noteIndex, 0.06);
    arpChord = arp.latch ? userHeldNotes() : [];
    arp.setEnabled(true);
  } else {
    arp.setEnabled(false);
    arpChord = [];

    if (resumeHeld) {
      const held = userHeldNotes();
      for (const noteIndex of held) {
        if ((noteCounts[noteIndex] ?? 0) > 0) {
          engine.noteOn(noteIndex, 1);
          orb.burst(noteIndex);
        }
      }
      if (held.length > 0) setReadout(held[held.length - 1]);
    }
  }

  syncArpUi();
  syncPlayingState();
  persistSoon();
}

arpToggle.addEventListener("click", () => setArpEnabled(!arp.enabled));

arpLatch.addEventListener("click", () => {
  const next = !arp.latch;
  if (next) {
    arpChord = userHeldNotes();
  } else {
    arpChord = [];
  }
  arp.setLatch(next);
  syncArpUi();
  syncPlayingState();
  persistSoon();
});

for (const button of arpPatternButtons) {
  button.addEventListener("click", () => {
    const pattern = button.dataset.pattern as ArpPattern;
    arp.setPattern(pattern);
    syncArpUi();
    persistSoon();
  });
}

for (const button of arpRateButtons) {
  button.addEventListener("click", () => {
    const rate = button.dataset.rate as ArpRate;
    arp.setRate(rate);
    syncArpUi();
    persistSoon();
  });
}

function setViewMode(mode: VisualMode, persist = true): void {
  visualMode = mode;
  orb.setMode(mode);
  viewOrb.setAttribute("aria-pressed", String(mode === "orb"));
  viewScope.setAttribute("aria-pressed", String(mode === "scope"));
  document.body.classList.toggle("is-scope", mode === "scope");
  if (persist) persistSoon();
}

viewOrb.addEventListener("click", () => setViewMode("orb"));
viewScope.addEventListener("click", () => setViewMode("scope"));

/* -------------------------------------------------------------------------
   Presets and controls
   ------------------------------------------------------------------------- */

let currentPreset: PresetKey = storedSettings.preset ?? "bloom";
let persistTimer: number | null = null;

function currentSettings(): StoredSettings {
  return {
    preset: currentPreset,
    cutoff: Number(cutoff.value),
    echo: Number(delay.value),
    space: Number(space.value),
    tempo,
    arpEnabled: arp.enabled,
    arpLatch: arp.latch,
    arpPattern: arp.pattern,
    arpRate: arp.rate,
    visual: visualMode,
  };
}

function persistNow(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  saveSettings(currentSettings());
}

function persistSoon(): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    saveSettings(currentSettings());
  }, 160);
}

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
  persistSoon();
}

function syncEcho(): void {
  const value = Number(delay.value);
  engine.setEcho(value / 100);
  delayOut.textContent = `${value}%`;
  delay.setAttribute("aria-valuetext", `${value} percent echo`);
  paintRange(delay);
  persistSoon();
}

function syncSpace(): void {
  const value = Number(space.value);
  engine.setSpace(value);
  spaceOut.textContent = `${value}%`;
  space.setAttribute("aria-valuetext", `${value} percent reverb`);
  paintRange(space);
  persistSoon();
}

function syncTempo(): void {
  tempo = Number(tempoInput.value);
  tempoOut.textContent = `${tempo} BPM`;
  tempoInput.setAttribute("aria-valuetext", `${tempo} beats per minute`);
  paintRange(tempoInput);

  if (!demoPlaying && !eggPlaying) demoSub.textContent = demoSubText();
  updateArpMeta();
  persistSoon();
}

function applyPreset(key: PresetKey, syncControls = true): void {
  // A preset click takes the filter back from the demo's automation.
  releaseDemoFilter();
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
    space.value = String(preset.space);
  }
  syncCutoff();
  syncEcho();
  syncSpace();
  persistSoon();
}

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    const key = button.dataset.preset as PresetKey | undefined;
    if (key && key in PRESETS) {
      applyPreset(key);
    }
  });
}

cutoff.addEventListener("input", () => {
  // A hand on the filter takes the demo's automation off the rails.
  releaseDemoFilter();
  syncCutoff();
});
delay.addEventListener("input", syncEcho);
space.addEventListener("input", syncSpace);
tempoInput.addEventListener("input", syncTempo);

/* -------------------------------------------------------------------------
   Demo: "First Light"

   An original 12-bar cue written for the instrument, in C major / A minor.
   It wakes on an A minor chord, builds through four arpeggiated bars, lifts
   into the hook, leaves one high E4 hanging, then resolves on a full Cadd9.
   The melody stays inside the eight pads; D4/E4 add color above the keybed,
   with E4 saved for the opening ping and the climax. Default tempo: 100 BPM.
   ------------------------------------------------------------------------- */

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

/** [start beat, note index, length in beats, velocity, release seconds] */
type DemoEvent = readonly [number, number, number, number?, number?];

const DEMO_NOTES: readonly DemoEvent[] = [
  // Ignition: an A minor chord in the dark, a distant E4, then the 7th.
  [0, N.A3, 7.4, 0.46, 0.9],
  [0, N.E3, 7.4, 0.42, 0.9],
  [0, N.C4, 7.4, 0.38, 0.9],
  [2, N.E4, 1.6, 0.32, 1.2],
  [4, N.G3, 3.4, 0.36, 0.8],

  // Pulse: Am7 – F – C – G, bass roots and an eighth-note arp. The last two
  // beats of the G bar double to sixteenths, pulling into the lift.
  [8, N.A3, 3.4, 0.5, 0.3],
  [8, N.E3, 0.42, 0.34, 0.18],
  [8.5, N.C4, 0.42, 0.38, 0.18],
  [9, N.G3, 0.42, 0.32, 0.18],
  [9.5, N.C4, 0.42, 0.38, 0.18],
  [10, N.E3, 0.42, 0.34, 0.18],
  [10.5, N.G3, 0.42, 0.32, 0.18],
  [11, N.C4, 0.42, 0.38, 0.18],
  [11.5, N.E3, 0.42, 0.34, 0.18],

  [12, N.F3, 3.4, 0.5, 0.3],
  [12, N.C4, 0.42, 0.36, 0.18],
  [12.5, N.A3, 0.42, 0.32, 0.18],
  [13, N.C4, 0.42, 0.36, 0.18],
  [13.5, N.G3, 0.42, 0.3, 0.18],
  [14, N.A3, 0.42, 0.32, 0.18],
  [14.5, N.C4, 0.42, 0.36, 0.18],
  [15, N.G3, 0.42, 0.3, 0.18],
  [15.5, N.A3, 0.42, 0.32, 0.18],

  [16, N.C3, 3.4, 0.52, 0.3],
  [16, N.G3, 0.42, 0.34, 0.18],
  [16.5, N.E3, 0.42, 0.32, 0.18],
  [17, N.C4, 0.42, 0.38, 0.18],
  [17.5, N.G3, 0.42, 0.34, 0.18],
  [18, N.E3, 0.42, 0.32, 0.18],
  [18.5, N.C4, 0.42, 0.38, 0.18],
  [19, N.G3, 0.42, 0.34, 0.18],
  [19.5, N.E3, 0.42, 0.32, 0.18],

  [20, N.G3, 3.4, 0.5, 0.3],
  [20, N.D3, 0.42, 0.32, 0.18],
  [20.5, N.B3, 0.42, 0.34, 0.18],
  [21, N.E3, 0.42, 0.3, 0.18],
  [21.5, N.B3, 0.42, 0.34, 0.18],
  [22, N.D3, 0.36, 0.32, 0.15],
  [22.25, N.B3, 0.36, 0.34, 0.15],
  [22.5, N.E3, 0.36, 0.3, 0.15],
  [22.75, N.B3, 0.36, 0.34, 0.15],
  [23, N.D3, 0.36, 0.32, 0.15],
  [23.25, N.E3, 0.36, 0.3, 0.15],
  [23.5, N.B3, 0.36, 0.34, 0.15],
  [23.75, N.D3, 0.36, 0.32, 0.15],

  // Lift: F – G – Am – F. The bass takes the inversion that leaves the melody
  // free: F/C, G/D, Am/E, F/C. Chords are short stabs so the hook can breathe.
  [24, N.F3, 2.2, 0.48, 0.5],
  [24, N.C3, 1.8, 0.34, 0.4],
  [24, N.G3, 1.8, 0.32, 0.4],
  [24, N.A3, 1.0, 0.55, 0.35],
  [25, N.C4, 0.5, 0.5, 0.3],
  [25.5, N.A3, 0.5, 0.48, 0.3],
  [26, N.G3, 2.0, 0.52, 0.35],

  [28, N.D3, 3.4, 0.46, 0.5],
  [28, N.B3, 0.8, 0.3, 0.25],
  [28, N.E3, 1.8, 0.28, 0.4],
  [28, N.G3, 1.0, 0.55, 0.35],
  [29, N.B3, 0.5, 0.5, 0.3],
  [29.5, N.A3, 0.5, 0.48, 0.3],
  [30, N.G3, 2.0, 0.52, 0.35],

  [32, N.E3, 3.4, 0.46, 0.5],
  [32, N.C3, 1.8, 0.32, 0.4],
  [32, N.G3, 1.8, 0.3, 0.4],
  [32, N.A3, 1.0, 0.55, 0.35],
  [33, N.C4, 0.5, 0.5, 0.3],
  [33.5, N.B3, 0.5, 0.48, 0.3],
  [34, N.A3, 2.0, 0.52, 0.35],

  [36, N.C3, 3.4, 0.44, 0.5],
  [36, N.E3, 1.8, 0.28, 0.4],
  [36, N.G3, 1.8, 0.3, 0.4],
  [36, N.F3, 1.0, 0.55, 0.35],
  [37, N.A3, 0.5, 0.5, 0.3],
  [37.5, N.C4, 0.5, 0.48, 0.3],
  [38, N.A3, 2.0, 0.52, 0.35],

  // Breath: G with the high E4 hanging. The bass and chord leave on beat 3;
  // only the E4 and the reverb remain before the final chord.
  [40, N.G3, 1.8, 0.5, 0.4],
  [40, N.D3, 1.8, 0.34, 0.4],
  [40, N.B3, 1.8, 0.32, 0.4],
  [40, N.E4, 2.2, 0.6, 1.4],

  // Resolve: Cadd9, full voicing, filter closing across the release.
  [44, N.C3, 4.0, 0.5, 1.8],
  [44, N.E3, 4.0, 0.42, 1.8],
  [44, N.G3, 4.0, 0.4, 1.8],
  [44, N.C4, 4.0, 0.5, 1.8],
  [44, N.D4, 3.6, 0.34, 1.8],
  [44, N.E4, 3.6, 0.36, 1.8],
];

const DEMO_BEATS = 48;
/** A short release keeps the arp and hook legible against the pad presets. */
const DEMO_RELEASE = 0.38;

/** [beat, cutoff slider value] — the demo rides the shared filter. */
const DEMO_FILTER: readonly (readonly [number, number])[] = [
  [0, 22],
  [8, 36],
  [24, 64],
  [32, 72],
  [40, 82],
  [44, 78],
  [48, 34],
];

function demoBeatMs(): number {
  return 60000 / tempo;
}

function demoDurationMs(): number {
  return DEMO_BEATS * demoBeatMs();
}

function demoSubText(): string {
  return `Wave · First Light · ${Math.round(demoDurationMs() / 1000)}s`;
}

/** The filter value at a beat, linearly interpolated between keyframes. */
function demoFilterAt(beat: number): number {
  const first = DEMO_FILTER[0];
  if (!first || beat <= first[0]) return first?.[1] ?? 22;

  for (let i = 1; i < DEMO_FILTER.length; i++) {
    const previous = DEMO_FILTER[i - 1];
    const current = DEMO_FILTER[i];
    if (!previous || !current) continue;
    if (beat <= current[0]) {
      const span = current[0] - previous[0];
      const t = span > 0 ? (beat - previous[0]) / span : 1;
      return previous[1] + (current[1] - previous[1]) * t;
    }
  }

  return DEMO_FILTER[DEMO_FILTER.length - 1]?.[1] ?? 34;
}

let demoTimers: number[] = [];
let demoPlaying = false;
let demoRun = 0;
let demoFilterFrame: number | null = null;
let demoFilterOwned = false;
let demoFilterBase = 0;
let demoFilterValue = -1;

/** Paint a cutoff value without saving it; the demo will restore the player's. */
function previewDemoFilter(value: number): void {
  cutoff.value = String(value);
  engine.setCutoff(value);
  const hz = cutoffFromSlider(value);
  cutoffOut.textContent = formatHz(hz);
  cutoff.setAttribute("aria-valuetext", `${formatHz(hz)} cutoff`);
  paintRange(cutoff);
}

function cancelDemoFilterFrame(): void {
  if (demoFilterFrame !== null) {
    cancelAnimationFrame(demoFilterFrame);
    demoFilterFrame = null;
  }
}

function startDemoFilter(run: number, startMs: number, beatMs: number): void {
  stopDemoFilter();
  demoFilterBase = Number(cutoff.value);
  demoFilterOwned = true;
  demoFilterValue = -1;

  const tick = (): void => {
    if (!demoPlaying || run !== demoRun || !demoFilterOwned) return;
    const beat = (performance.now() - startMs) / beatMs;
    const value = Math.round(demoFilterAt(beat));
    if (value !== demoFilterValue) {
      demoFilterValue = value;
      previewDemoFilter(value);
    }
    demoFilterFrame = requestAnimationFrame(tick);
  };

  demoFilterFrame = requestAnimationFrame(tick);
}

/** Stop the filter ride and hand the player's own cutoff back. */
function stopDemoFilter(): void {
  cancelDemoFilterFrame();
  if (!demoFilterOwned) return;

  demoFilterOwned = false;
  cutoff.value = String(demoFilterBase);
  syncCutoff();
}

/** The player took the filter back; keep their value and stop the ride. */
function releaseDemoFilter(): void {
  cancelDemoFilterFrame();
  demoFilterOwned = false;
}

function setDemoUi(playing: boolean): void {
  demoButton.classList.toggle("is-playing", playing);
  demoButton.setAttribute("aria-pressed", String(playing));
  demoButton.setAttribute(
    "aria-label",
    playing ? "Stop the demo" : "Play First Light, the Wave demo",
  );
  demoLabel.textContent = playing ? "Stop demo" : "Play First Light";
  demoSub.textContent = playing ? "First Light · playing" : demoSubText();
  syncPlayingState();
}

function startDemo(): void {
  if (eggPlaying) stopEgg();
  if (arp.enabled) setArpEnabled(false, false);
  engine.ensure();

  const beatMs = demoBeatMs();
  const totalMs = DEMO_BEATS * beatMs;
  const startMs = performance.now();

  // Reset the progress bar so each run starts from the left.
  demoButton.classList.remove("is-playing");
  void demoButton.offsetWidth;

  demoRun++;
  const run = demoRun;
  demoPlaying = true;
  demoButton.style.setProperty("--demo-ms", `${totalMs}ms`);
  setDemoUi(true);
  startDemoFilter(run, startMs, beatMs);

  // Bass first on shared downbeats so the readout features the melody.
  const events = [...DEMO_NOTES].sort(
    (a, b) => a[0] - b[0] || (a[3] ?? 0.72) - (b[3] ?? 0.72),
  );
  events.forEach(
    ([start, noteIndex, length, velocity, releaseSeconds], index) => {
      const source = `demo:${run}:${index}`;

      demoTimers.push(
        window.setTimeout(() => {
          if (!demoPlaying || run !== demoRun) return;
          press(noteIndex, source, velocity ?? 0.72);
        }, start * beatMs + 40),
      );

      demoTimers.push(
        window.setTimeout(
          () => release(source, releaseSeconds ?? DEMO_RELEASE),
          (start + length) * beatMs + 40,
        ),
      );
    },
  );

  demoTimers.push(
    window.setTimeout(() => {
      if (run === demoRun) stopDemo();
    }, totalMs + 2800),
  );
}

function stopDemo(): void {
  if (!demoPlaying && demoTimers.length === 0) {
    stopDemoFilter();
    return;
  }

  demoRun++;
  demoPlaying = false;
  for (const timer of demoTimers) clearTimeout(timer);
  demoTimers = [];
  stopDemoFilter();

  for (const source of [...activeSources.keys()]) {
    if (source.startsWith("demo:")) release(source);
  }

  setDemoUi(false);
}

demoButton.addEventListener("click", () => {
  if (eggPlaying) {
    stopEgg();
    return;
  }

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
   Recording: capture the master mix into a shareable take
   ------------------------------------------------------------------------- */

const RECORD_LIMIT_MS = 3 * 60 * 1000;

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function formatTakeDuration(seconds: number): string {
  return formatClock(Math.max(1, Math.round(seconds)));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function pickRecordMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function mimeLabel(mime: string): string {
  if (mime.includes("mp4")) return "M4A/AAC";
  if (mime.includes("ogg")) return "Ogg/Opus";
  if (mime.includes("webm")) return "WebM/Opus";
  return "Audio";
}

function extensionForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function setRecordingUi(active: boolean): void {
  recordButton.setAttribute("aria-pressed", String(active));
  recordButton.setAttribute(
    "aria-label",
    active ? "Stop recording" : "Start recording",
  );
  recordLabel.textContent = active ? "0:00" : "Rec";
  document.body.classList.toggle("is-recording", active);
}

function discardTake(): void {
  if (takeUrl) {
    URL.revokeObjectURL(takeUrl);
    takeUrl = null;
  }
  takeDuration = 0;
  takeAudio.pause();
  takeAudio.removeAttribute("src");
  takeAudio.load();
  takeDownload.removeAttribute("href");
  takeButton.hidden = true;
  if (takeDialog.open) takeDialog.close();
}

function finishRecording(session: RecordingSession): void {
  if (recording !== session) return;
  recording = null;
  setRecordingUi(false);

  const blob = new Blob(session.chunks, {
    type: session.mimeType || "audio/webm",
  });
  if (blob.size === 0) {
    setEggToast("nothing recorded — try again", true, 3200);
    return;
  }

  discardTake();
  const endedAt = session.stoppedAt ?? performance.now();
  takeDuration = (endedAt - session.startedAt) / 1000;
  takeUrl = URL.createObjectURL(blob);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const extension = extensionForMime(session.mimeType);
  takeAudio.src = takeUrl;
  takeAudio.load();
  takeMeta.textContent = `${formatTakeDuration(takeDuration)} · ${formatBytes(
    blob.size,
  )} · ${mimeLabel(session.mimeType)}`;
  takeDownload.href = takeUrl;
  takeDownload.download = `wave-take-${stamp}.${extension}`;
  takeLabel.textContent = formatTakeDuration(takeDuration);
  takeButton.setAttribute(
    "aria-label",
    `Open take, ${formatTakeDuration(takeDuration)}`,
  );
  takeButton.hidden = false;
  takeDialog.showModal();
}

function startRecording(): void {
  if (recording) return;
  if (typeof MediaRecorder === "undefined") {
    setEggToast("recording is not supported here", true, 3600);
    return;
  }

  const stream = engine.createRecordingStream();
  if (!stream) {
    setEggToast("recording is not supported here", true, 3600);
    return;
  }

  const mimeType = pickRecordMime();
  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
  } catch {
    setEggToast("could not start the recorder", true, 3600);
    return;
  }

  discardTake();

  const session: RecordingSession = {
    recorder: mediaRecorder,
    chunks: [],
    startedAt: performance.now(),
    stoppedAt: null,
    mimeType: mediaRecorder.mimeType || mimeType,
  };
  recording = session;

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) session.chunks.push(event.data);
  };
  mediaRecorder.onerror = () => {
    if (recording !== session) return;
    recording = null;
    setRecordingUi(false);
    if (recordTicker !== null) {
      clearInterval(recordTicker);
      recordTicker = null;
    }
    if (recordLimitTimer !== null) {
      clearTimeout(recordLimitTimer);
      recordLimitTimer = null;
    }
    setEggToast("recording stopped unexpectedly", true, 3600);
  };
  mediaRecorder.onstop = () => finishRecording(session);

  try {
    mediaRecorder.start(250);
  } catch {
    recording = null;
    setRecordingUi(false);
    setEggToast("could not start the recorder", true, 3600);
    return;
  }

  setRecordingUi(true);
  recordTicker = window.setInterval(() => {
    const elapsed = (performance.now() - session.startedAt) / 1000;
    recordLabel.textContent = formatClock(elapsed);
    recordButton.setAttribute(
      "aria-label",
      `Stop recording, ${formatClock(elapsed)}`,
    );
  }, 250);
  recordLimitTimer = window.setTimeout(stopRecording, RECORD_LIMIT_MS);
}

function stopRecording(): void {
  if (!recording) return;
  if (recordTicker !== null) {
    clearInterval(recordTicker);
    recordTicker = null;
  }
  if (recordLimitTimer !== null) {
    clearTimeout(recordLimitTimer);
    recordLimitTimer = null;
  }

  const session = recording;
  if (session.stoppedAt === null) session.stoppedAt = performance.now();
  setRecordingUi(false);

  if (session.recorder.state !== "inactive") {
    session.recorder.stop();
  } else {
    finishRecording(session);
  }
}

recordButton.addEventListener("click", () => {
  if (recording && recording.recorder.state !== "inactive") {
    stopRecording();
  } else {
    startRecording();
  }
});

takeButton.addEventListener("click", () => {
  if (takeUrl && !takeDialog.open) takeDialog.showModal();
});

takeClose.addEventListener("click", () => takeDialog.close());
takeDialog.addEventListener("click", (event) => {
  if (event.target === takeDialog) takeDialog.close();
});
takeDiscard.addEventListener("click", discardTake);

/* -------------------------------------------------------------------------
   MIDI input
   ------------------------------------------------------------------------- */

function setMidiReadout(note: number, velocity: number): void {
  midiReadoutActive = true;
  if (readoutTimer !== null) {
    clearTimeout(readoutTimer);
    readoutTimer = null;
  }
  noteReadout.textContent = midiNoteName(note);
  noteSub.textContent = `midi · vel ${Math.round(velocity)}`;
  noteReadout.classList.add("is-live");
}

function restoreReadoutAfterMidi(): void {
  if (activeSources.size > 0) {
    const remaining = [...activeSources.values()][activeSources.size - 1];
    if (remaining !== undefined) setReadout(remaining);
    return;
  }

  if (midiActive.size > 0) {
    const last = [...midiActive.entries()][midiActive.size - 1];
    if (last) {
      setMidiReadout(last[0], last[1].velocity);
      return;
    }
  }

  noteReadout.textContent = lastNote >= 0 ? NOTES[lastNote].name : "—";
  noteSub.textContent = lastNote >= 0 ? "released" : "hold a key";
  noteReadout.classList.remove("is-live");
}

function midiNoteOn(note: number, velocity: number): void {
  if (midiActive.has(note)) return;

  const padIndex = padForMidiNote(note);
  const source = `midi:${note}`;
  const normalized = Math.max(0.12, Math.min(1, velocity / 127));

  engine.ensure();

  if (padIndex !== null) {
    press(padIndex, source, normalized);
  } else {
    engine.midiNoteOn(note, normalized);
    orb.burst(midiVisualIndex(note));
    setMidiReadout(note, velocity);
  }

  midiActive.set(note, { source, padIndex, velocity });
  syncPlayingState();
}

function midiNoteOff(note: number): void {
  const active = midiActive.get(note);
  if (!active) return;
  midiActive.delete(note);

  if (active.padIndex !== null) {
    release(active.source);
  } else {
    engine.midiNoteOff(note);
  }

  const hasOutOfRange = [...midiActive.values()].some(
    (entry) => entry.padIndex === null,
  );
  if (!hasOutOfRange) midiReadoutActive = false;

  restoreReadoutAfterMidi();
  syncPlayingState();
}

function releaseMidiNotes(): void {
  for (const [note, active] of midiActive) {
    if (active.padIndex !== null) {
      release(active.source);
    } else {
      engine.midiNoteOff(note);
    }
  }
  midiActive.clear();
  midiReadoutActive = false;
  restoreReadoutAfterMidi();
  syncPlayingState();
}

function updateMidiUi(status: MidiStatus, devices: number): void {
  midiButton.dataset.state = status;
  midiButton.disabled = status === "unsupported";

  const label =
    status === "ready"
      ? devices > 0
        ? `MIDI ${devices}`
        : "MIDI"
      : status === "connecting"
        ? "MIDI…"
        : status === "denied"
          ? "MIDI off"
          : status === "unsupported"
            ? "No MIDI"
            : "MIDI";
  midiLabel.textContent = label;

  const description =
    status === "ready"
      ? `MIDI connected, ${devices} input${devices === 1 ? "" : "s"}`
      : status === "connecting"
        ? "Connecting MIDI"
        : status === "denied"
          ? "MIDI access was blocked or timed out, click to retry"
          : status === "unsupported"
            ? "MIDI is not supported in this browser"
            : "Connect MIDI input";
  midiButton.setAttribute("aria-label", description);
  midiButton.title = description;
}

const midi = new MidiInput({
  onNoteOn: midiNoteOn,
  onNoteOff: midiNoteOff,
  onStatus: updateMidiUi,
  onDisconnect: releaseMidiNotes,
});

midiButton.addEventListener("click", () => {
  if (!midi.supported) {
    setEggToast("MIDI is not supported here", true, 3600);
    return;
  }
  void midi.connect().then(() => {
    if (midi.state === "ready" && midi.deviceCount === 0) {
      setEggToast("no MIDI inputs found", true, 2800);
    }
  });
});

updateMidiUi(midi.supported ? "idle" : "unsupported", 0);

/* -------------------------------------------------------------------------
   Easter egg: the opening of "Never Gonna Give You Up"

   Intro, verse 1, pre-chorus and the first chorus, extracted from a reference
   MIDI in the original A-flat major key. The pads follow the lead's scale
   degrees; the bass, piano, strings, horn and drums are synthesized by
   RickrollAudio. Triggered by triple-tapping the brand or the Konami code.
   ------------------------------------------------------------------------- */

const EGG_BPM = 113;
const EGG_BEAT_MS = 60000 / EGG_BPM;
const EGG_BEATS = SONG_BEATS;
const EGG_LENGTH = EGG_BEATS * EGG_BEAT_MS;
/** Milliseconds between the trigger and the first sample. */
const EGG_START_DELAY = 60;
let eggTimers: number[] = [];
let eggPlaying = false;
let eggRun = 0;
let eggToastTimer: number | null = null;
let eggAudio: RickrollAudio | null = null;

function setEggToast(
  text: string,
  visible: boolean,
  duration = 3200,
): void {
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
    }, duration);
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

  if (arp.enabled) setArpEnabled(false, false);
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
    muted ? "sound is off — tap the speaker" : "you just got wave-rolled",
    true,
    muted ? 6000 : 3200,
  );
  noteReadout.textContent = "♪";
  noteSub.textContent = "never gonna";
  noteReadout.classList.add("is-live");
  orb.setLowPower(true);

  // Turn the demo button into the egg's stop/progress control.
  demoButton.classList.remove("is-playing");
  void demoButton.offsetWidth;
  demoButton.style.setProperty("--demo-ms", `${EGG_LENGTH}ms`);
  demoButton.classList.add("is-playing");
  demoButton.setAttribute("aria-pressed", "true");
  demoButton.setAttribute("aria-label", "Stop the wave-rolled song");
  demoLabel.textContent = "Stop the song";
  demoSub.textContent = "wave-rolled · tap to stop";
  syncPlayingState();

  const audio = new RickrollAudio(ctx, destination);
  eggAudio = audio;
  const startAt = ctx.currentTime + EGG_START_DELAY / 1000;
  const beatSec = 60 / EGG_BPM;
  const midiHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

  type EggEvent = { at: number; play: () => void };
  const eggEvents: EggEvent[] = [];
  const introBoost = (at: number) => (at < 35 ? 1.35 : 1);

  for (const [at, midi, length, velocity] of SONG_LEAD) {
    eggEvents.push({
      at,
      play: () =>
        audio.playLead(
          midiHz(midi),
          startAt + at * beatSec,
          length * beatSec,
          velocity,
        ),
    });
  }

  for (const [at, midi, length, velocity] of SONG_BASS) {
    eggEvents.push({
      at,
      play: () =>
        audio.playBass(
          midi,
          startAt + at * beatSec,
          length * beatSec,
          Math.min(1, velocity * introBoost(at)),
        ),
    });
  }

  for (const [at, midis, length, velocity] of SONG_PIANO) {
    eggEvents.push({
      at,
      play: () =>
        audio.playPiano(
          midis,
          startAt + at * beatSec,
          length * beatSec,
          Math.min(1, velocity * 0.65 * introBoost(at)),
        ),
    });
  }

  for (const [at, midi, length, velocity] of SONG_STRINGS) {
    const boost = introBoost(at);
    eggEvents.push({
      at,
      play: () => {
        const time = startAt + at * beatSec;
        if (at < 35) {
          // The intro's high string line is the lead before the vocal enters.
          // Drop it an octave so it reads as a synth line, not a whistle.
          audio.playLead(
            midiHz(midi - 12),
            time,
            length * beatSec,
            Math.min(1, velocity * 0.55 * boost),
          );
        } else {
          audio.playChord(
            [midi],
            time,
            length * beatSec,
            Math.min(1, velocity * 0.35 * boost),
          );
        }
      },
    });
  }

  for (const [at, midi, length, velocity] of SONG_HORN) {
    const boost = introBoost(at);
    eggEvents.push({
      at,
      play: () =>
        audio.playChord(
          [midi],
          startAt + at * beatSec,
          length * beatSec,
          Math.min(1, velocity * (at < 35 ? 0.5 : 0.25) * boost),
        ),
    });
  }

  for (const [at, kind, frequency, velocity] of SONG_DRUMS) {
    const boost = introBoost(at);
    eggEvents.push({
      at,
      play: () => {
        const time = startAt + at * beatSec;
        const v = Math.min(1, velocity * boost);
        switch (kind) {
          case "kick":
            audio.kick(time, v);
            break;
          case "snare":
            audio.snare(time, v);
            break;
          case "hat":
            audio.hat(time, v * 0.85);
            break;
          case "openhat":
            audio.hat(time, v * 0.85, true);
            break;
          case "tom":
            audio.tom(time, frequency, v);
            break;
          case "crash":
            audio.crash(time, v);
            break;
        }
      },
    });
  }

  // Schedule only a two-second lookahead so a 1:22 arrangement does not create
  // every oscillator at once. This keeps mobile audio graphs healthy.
  eggEvents.sort((a, b) => a.at - b.at);
  let nextEggEvent = 0;
  const scheduleEggWindow = (): void => {
    const horizon = ctx.currentTime - startAt + 2;
    while (
      nextEggEvent < eggEvents.length &&
      eggEvents[nextEggEvent].at * beatSec <= horizon
    ) {
      eggEvents[nextEggEvent].play();
      nextEggEvent++;
    }

    if (nextEggEvent < eggEvents.length && eggPlaying) {
      eggTimers.push(window.setTimeout(scheduleEggWindow, 250));
    }
  };
  scheduleEggWindow();

  const keybedOffsets = [0, 2, 4, 5, 7, 9, 11, 12];
  for (const [at, midi, length] of SONG_LEAD) {
    // The lead is in A-flat; shift it to the C keybed for the visual only.
    const noteIndex = keybedOffsets.indexOf(midi - 8 - 48);
    if (noteIndex < 0 || noteIndex >= KEYBED_SIZE) continue;
    const atMs = EGG_START_DELAY + at * EGG_BEAT_MS;
    const lengthMs = Math.max(110, length * EGG_BEAT_MS);
    eggTimers.push(
      window.setTimeout(() => {
        if (!eggPlaying || run !== eggRun) return;
        if (!isNoteHeldByUser(noteIndex)) {
          setPadState(noteIndex, true);
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
    }, EGG_LENGTH + 3000),
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

  orb.setLowPower(false);
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

  setDemoUi(false);
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

function resetInstrument(): void {
  stopDemo();
  stopEgg();
  releaseAll();

  arp.setEnabled(false);
  arp.setLatch(false);
  arp.setPattern("up");
  arp.setRate("1/8");
  arpChord = [];

  applyPreset("bloom", true);
  tempoInput.value = "100";
  syncTempo();
  setViewMode("orb", false);
  syncArpUi();

  if (readoutTimer !== null) {
    clearTimeout(readoutTimer);
    readoutTimer = null;
  }
  lastNote = -1;
  noteReadout.textContent = "—";
  noteSub.textContent = "hold a key";
  noteReadout.classList.remove("is-live");

  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  clearSettings();
  syncPlayingState();
  setEggToast("instrument reset", true, 2600);
  about.close();
}

resetInstrumentButton.addEventListener("click", resetInstrument);

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
  // Letter keys do not activate buttons or links, so the synth stays playable
  // after clicking one. Range inputs and text fields need their keys.
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [role='slider']",
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
  if (about.open || takeDialog.open) {
    konamiIndex = 0;
    return;
  }

  if (event.key === "Escape") {
    if (recording) stopRecording();
    if (eggPlaying) {
      stopEgg();
      return;
    }
    if (demoPlaying) {
      stopDemo();
      return;
    }
    if (arp.isPlaying) {
      arpChord = [];
      arp.stop();
      syncArpPads();
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
    persistNow();
    stopDemo();
    stopEgg();
    stopRecording();
    releaseAll();
    void engine.suspend();
  } else {
    void engine.resume();
  }
});

// Keep the initial UI honest before any sound has been made.
noteReadout.textContent = "—";
noteSub.textContent = "hold a key";
applyPreset(currentPreset, true);

if (storedSettings.cutoff !== undefined) cutoff.value = String(storedSettings.cutoff);
if (storedSettings.echo !== undefined) delay.value = String(storedSettings.echo);
if (storedSettings.space !== undefined) space.value = String(storedSettings.space);
if (storedSettings.tempo !== undefined) {
  tempoInput.value = String(storedSettings.tempo);
}
if (storedSettings.arpPattern) arp.pattern = storedSettings.arpPattern;
if (storedSettings.arpRate) arp.rate = storedSettings.arpRate;
if (storedSettings.arpLatch) arp.latch = storedSettings.arpLatch;

syncCutoff();
syncEcho();
syncSpace();
syncTempo();
syncArpUi();
setViewMode(visualMode, false);

if (storedSettings.arpEnabled) setArpEnabled(true, false);
