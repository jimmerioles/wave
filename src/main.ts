import "./style.css";
import {
  KEYBED_SIZE,
  NOTES,
  PRESETS,
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
   Easter egg: a short synth quote of "Never Gonna Give You Up"

   The melody is transposed to C so it fits the keybed; E4 is one of the
   demo-only notes. It stops the main demo, borrows the stage for 16 beats at
   113 BPM, then puts everything back. Triggered by triple-tapping the brand
   or entering the Konami code.
   ------------------------------------------------------------------------- */

const EGG_BPM = 113;
const EGG_BEAT_MS = 60000 / EGG_BPM;
const EGG_BEATS = 16;
const EGG_LENGTH = EGG_BEATS * EGG_BEAT_MS;
const EGG_RELEASE = 0.22;

const EGG_EVENTS: readonly DemoEvent[] = [
  // "Never gonna give you up"
  [0, N.G3, 0.4],
  [0.5, N.A3, 0.4],
  [1, N.C4, 0.4],
  [1.5, N.A3, 0.4],
  [2, N.E4, 0.4],
  [2.5, N.E4, 0.4],
  [3, N.D4, 1.0],

  // "Never gonna let you down"
  [4, N.G3, 0.4],
  [4.5, N.A3, 0.4],
  [5, N.C4, 0.4],
  [5.5, N.A3, 0.4],
  [6, N.D4, 0.4],
  [6.5, N.D4, 0.4],
  [7, N.C4, 0.25],
  [7.25, N.B3, 0.25],
  [7.5, N.A3, 0.5],

  // "Never gonna run around and desert you"
  [8, N.G3, 0.4],
  [8.5, N.A3, 0.4],
  [9, N.C4, 0.4],
  [9.5, N.A3, 0.4],
  [10, N.C4, 0.4],
  [10.5, N.D4, 0.4],
  [11, N.B3, 0.4],
  [11.5, N.G3, 0.4],
  [12, N.G3, 0.4],
  [12.5, N.D4, 0.4],
  [13, N.C4, 3.0],

  // A small C-major cushion under the last note.
  [13, N.C3, 3.0, 0.46],
  [13, N.E3, 3.0, 0.44],
];

let eggTimers: number[] = [];
let eggPlaying = false;
let eggRun = 0;
let eggToastTimer: number | null = null;

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

function startEgg(): void {
  if (eggPlaying) return;
  if (demoPlaying) stopDemo();

  engine.ensure();
  eggRun++;
  const run = eggRun;
  eggPlaying = true;

  document.body.classList.add("is-rolled");
  stagePreset.textContent = "Rolled";
  stagePreset.dataset.preset = "glass";
  document.body.dataset.preset = "glass";
  setEggToast(
    muted ? "you just got wave-rolled (silently)" : "you just got wave-rolled",
    true,
  );
  syncPlayingState();

  // Bass notes first on shared beats so the readout features the melody.
  const events = [...EGG_EVENTS].sort(
    (a, b) => a[0] - b[0] || (a[3] ?? 0.7) - (b[3] ?? 0.7),
  );

  events.forEach(([start, noteIndex, length, velocity], index) => {
    const source = `egg:${run}:${index}`;

    eggTimers.push(
      window.setTimeout(() => {
        if (!eggPlaying || run !== eggRun) return;
        press(noteIndex, source, velocity ?? 0.7);
      }, start * EGG_BEAT_MS + 40),
    );

    eggTimers.push(
      window.setTimeout(
        () => release(source, EGG_RELEASE),
        (start + length) * EGG_BEAT_MS + 40,
      ),
    );
  });

  eggTimers.push(
    window.setTimeout(() => {
      if (run === eggRun) stopEgg();
    }, EGG_LENGTH + 900),
  );
}

function stopEgg(): void {
  if (!eggPlaying && eggTimers.length === 0) return;

  eggRun++;
  eggPlaying = false;
  for (const timer of eggTimers) clearTimeout(timer);
  eggTimers = [];

  for (const source of [...activeSources.keys()]) {
    if (source.startsWith("egg:")) release(source);
  }

  document.body.classList.remove("is-rolled");
  stagePreset.textContent = PRESETS[currentPreset].name;
  stagePreset.dataset.preset = currentPreset;
  document.body.dataset.preset = currentPreset;
  setEggToast("", false);
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
