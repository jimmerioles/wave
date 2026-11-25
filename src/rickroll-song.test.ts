import { describe, expect, it } from "vitest";
import {
  SONG_BASS,
  SONG_BEATS,
  SONG_CHORUS_START,
  SONG_DRUMS,
  SONG_FIRST_CHORUS_END,
  SONG_HORN,
  SONG_LEAD,
  SONG_LEAD_START,
  SONG_PIANO,
  SONG_STRINGS,
  type SongDrumKind,
} from "./rickroll-song";

type MelodicEvent = readonly [number, number, number, number];

const MELODIC_VOICES: Record<string, readonly MelodicEvent[]> = {
  lead: SONG_LEAD,
  bass: SONG_BASS,
  strings: SONG_STRINGS,
  horn: SONG_HORN,
};

const DRUM_KINDS: readonly SongDrumKind[] = [
  "kick",
  "snare",
  "hat",
  "openhat",
  "tom",
  "crash",
];

/** The chart is quantised to sixteenth notes. */
function expectOnGrid(value: number): void {
  expect(Math.abs(value * 4 - Math.round(value * 4))).toBeLessThan(1e-9);
}

function expectMidiNote(note: number): void {
  expect(Number.isInteger(note)).toBe(true);
  expect(note).toBeGreaterThanOrEqual(0);
  expect(note).toBeLessThanOrEqual(127);
}

function expectVelocity(velocity: number): void {
  expect(velocity).toBeGreaterThan(0);
  expect(velocity).toBeLessThanOrEqual(1);
}

describe("song section markers", () => {
  it("keeps the sections in order", () => {
    expect(SONG_LEAD_START).toBeLessThan(SONG_CHORUS_START);
    expect(SONG_CHORUS_START).toBeLessThan(SONG_FIRST_CHORUS_END);
    expect(SONG_FIRST_CHORUS_END).toBeLessThan(SONG_BEATS);
  });

  it("gives the first chorus eight bars", () => {
    expect(SONG_FIRST_CHORUS_END - SONG_CHORUS_START).toBe(32);
  });

  it("starts the lead where the vocal enters", () => {
    expect(SONG_LEAD[0]?.[0]).toBe(SONG_LEAD_START);
  });
});

for (const [name, events] of Object.entries(MELODIC_VOICES)) {
  describe(`${name} voice`, () => {
    it("has events", () => {
      expect(events.length).toBeGreaterThan(0);
    });

    it("is sorted by start beat", () => {
      for (let i = 1; i < events.length; i++) {
        expect(events[i][0]).toBeGreaterThanOrEqual(events[i - 1][0]);
      }
    });

    it("starts inside the song", () => {
      for (const [at] of events) {
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThanOrEqual(SONG_BEATS);
      }
    });

    it("sits on the sixteenth-note grid", () => {
      for (const [at, , length] of events) {
        expectOnGrid(at);
        expectOnGrid(length);
        expect(length).toBeGreaterThan(0);
      }
    });

    it("uses valid MIDI notes", () => {
      for (const [, note] of events) {
        expectMidiNote(note);
      }
    });

    it("uses velocities between 0 and 1", () => {
      for (const [, , , velocity] of events) {
        expectVelocity(velocity);
      }
    });
  });
}

describe("piano voice", () => {
  it("has events", () => {
    expect(SONG_PIANO.length).toBeGreaterThan(0);
  });

  it("is sorted by start beat", () => {
    for (let i = 1; i < SONG_PIANO.length; i++) {
      expect(SONG_PIANO[i][0]).toBeGreaterThanOrEqual(SONG_PIANO[i - 1][0]);
    }
  });

  it("starts inside the song and lasts a positive time", () => {
    for (const [at, , length] of SONG_PIANO) {
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThanOrEqual(SONG_BEATS);
      expectOnGrid(at);
      expectOnGrid(length);
      expect(length).toBeGreaterThan(0);
    }
  });

  it("plays non-empty, ascending chords of MIDI notes", () => {
    for (const [, notes] of SONG_PIANO) {
      expect(notes.length).toBeGreaterThan(0);
      for (let i = 0; i < notes.length; i++) {
        expectMidiNote(notes[i]);
        if (i > 0) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
      }
    }
  });

  it("uses velocities between 0 and 1", () => {
    for (const [, , , velocity] of SONG_PIANO) {
      expectVelocity(velocity);
    }
  });
});

describe("drum voice", () => {
  it("has hits", () => {
    expect(SONG_DRUMS.length).toBeGreaterThan(0);
  });

  it("is sorted by start beat", () => {
    for (let i = 1; i < SONG_DRUMS.length; i++) {
      expect(SONG_DRUMS[i][0]).toBeGreaterThanOrEqual(SONG_DRUMS[i - 1][0]);
    }
  });

  it("starts inside the song on the sixteenth-note grid", () => {
    for (const [at] of SONG_DRUMS) {
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThanOrEqual(SONG_BEATS);
      expectOnGrid(at);
    }
  });

  it("uses known drum kinds", () => {
    for (const [, kind] of SONG_DRUMS) {
      expect(DRUM_KINDS).toContain(kind);
    }
  });

  it("uses velocities between 0 and 1", () => {
    for (const [, , , velocity] of SONG_DRUMS) {
      expectVelocity(velocity);
    }
  });

  it("gives toms a frequency and other drums none", () => {
    for (const [, kind, frequency] of SONG_DRUMS) {
      if (kind === "tom") {
        expect(frequency).toBeGreaterThan(0);
      } else {
        expect(frequency).toBe(0);
      }
    }
  });
});
