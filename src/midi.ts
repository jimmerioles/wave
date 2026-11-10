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

export interface MidiCallbacks {
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onStatus: (status: MidiStatus, devices: number) => void;
  onDisconnect: () => void;
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
    const data = event.data;
    if (!data || data.length < 2) return;

    const command = data[0] & 0xf0;
    const midi = data[1];

    if (command === 0x90 && data.length >= 3) {
      const velocity = data[2];
      if (velocity === 0) this.callbacks.onNoteOff(midi);
      else this.callbacks.onNoteOn(midi, velocity);
    } else if (command === 0x80) {
      this.callbacks.onNoteOff(midi);
    }
  };

  private setStatus(status: MidiStatus, devices: number): void {
    this.status = status;
    this.devices = devices;
    this.callbacks.onStatus(status, devices);
  }
}
