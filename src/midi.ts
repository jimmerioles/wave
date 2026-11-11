/**
 * Web MIDI input.
 *
 * Access is requested only from a button gesture. Every connected input is
 * attached, and note-on/off is forwarded with its raw velocity. Other MIDI
 * messages (CC, pitch bend, clock) are ignored for now.
 */

export type MidiStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "unsupported"
  | "denied";

export type ParsedMidiMessage =
  | { type: "noteon"; note: number; velocity: number }
  | { type: "noteoff"; note: number };

export interface MidiCallbacks {
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onStatus: (status: MidiStatus, devices: number) => void;
  onDisconnect: () => void;
}

/** MIDI note number to the matching one-octave pad, where one exists. */
const MIDI_PAD: Record<number, number> = {
  48: 0,
  50: 1,
  52: 2,
  53: 3,
  55: 4,
  57: 5,
  59: 6,
  60: 7,
};

const MIDI_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function clampMidi(midi: number): number {
  return Math.max(0, Math.min(127, Math.round(midi)));
}

export function padForMidiNote(midi: number): number | null {
  return MIDI_PAD[clampMidi(midi)] ?? null;
}

export function midiNoteName(midi: number): string {
  const safe = clampMidi(midi);
  return `${MIDI_NAMES[safe % 12]}${Math.floor(safe / 12) - 1}`;
}

/**
 * Parse the subset of MIDI we act on. Note-on with velocity 0 is a note-off,
 * as required by the MIDI spec.
 */
export function parseMidiMessage(
  data: Uint8Array | null | undefined,
): ParsedMidiMessage | null {
  if (!data || data.length < 2) return null;

  const command = data[0] & 0xf0;
  const note = data[1] & 0x7f;

  if (command === 0x90) {
    if (data.length < 3) return null;
    const velocity = data[2] & 0x7f;
    return velocity === 0
      ? { type: "noteoff", note }
      : { type: "noteon", note, velocity };
  }

  if (command === 0x80) {
    return { type: "noteoff", note };
  }

  return null;
}

export class MidiInput {
  private access: MIDIAccess | null = null;
  private status: MidiStatus = "idle";
  private devices = 0;
  private starting = false;

  constructor(private readonly callbacks: MidiCallbacks) {}

  get supported(): boolean {
    return typeof navigator.requestMIDIAccess === "function";
  }

  get state(): MidiStatus {
    return this.status;
  }

  get deviceCount(): number {
    return this.devices;
  }

  async connect(): Promise<void> {
    if (!this.supported) {
      this.setStatus("unsupported", 0);
      return;
    }
    if (this.access) {
      this.refresh();
      return;
    }
    if (this.starting) return;

    this.starting = true;
    this.setStatus("connecting", this.devices);

    try {
      const request = navigator.requestMIDIAccess({ sysex: false });
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error("MIDI access request timed out")),
          12000,
        );
      });
      this.access = await Promise.race([request, timeout]);
      this.access.onstatechange = () => this.refresh();
      this.refresh();
    } catch {
      this.setStatus("denied", 0);
    } finally {
      this.starting = false;
    }
  }

  private refresh(): void {
    if (!this.access) return;

    let count = 0;
    for (const input of this.access.inputs.values()) {
      count++;
      input.onmidimessage = this.handleMessage;
    }

    if (count < this.devices) this.callbacks.onDisconnect();
    this.setStatus("ready", count);
  }

  private handleMessage = (event: MIDIMessageEvent): void => {
    const message = parseMidiMessage(event.data);
    if (!message) return;

    if (message.type === "noteon") {
      this.callbacks.onNoteOn(message.note, message.velocity);
    } else {
      this.callbacks.onNoteOff(message.note);
    }
  };

  private setStatus(status: MidiStatus, devices: number): void {
    this.status = status;
    this.devices = devices;
    this.callbacks.onStatus(status, devices);
  }
}
