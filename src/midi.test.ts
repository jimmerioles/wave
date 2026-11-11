import { describe, expect, it } from "vitest";
import { midiNoteName, padForMidiNote, parseMidiMessage } from "./midi";

describe("parseMidiMessage", () => {
  it("parses note-on on any channel", () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 100]))).toEqual({
      type: "noteon",
      note: 60,
      velocity: 100,
    });
    expect(parseMidiMessage(new Uint8Array([0x9f, 72, 1]))).toEqual({
      type: "noteon",
      note: 72,
      velocity: 1,
    });
  });

  it("parses note-off", () => {
    expect(parseMidiMessage(new Uint8Array([0x80, 60, 64]))).toEqual({
      type: "noteoff",
      note: 60,
    });
    expect(parseMidiMessage(new Uint8Array([0x8f, 61, 0]))).toEqual({
      type: "noteoff",
      note: 61,
    });
  });

  it("treats note-on with zero velocity as note-off", () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 0]))).toEqual({
      type: "noteoff",
      note: 60,
    });
  });

  it("ignores incomplete messages", () => {
    expect(parseMidiMessage(new Uint8Array([0x90]))).toBeNull();
    expect(parseMidiMessage(new Uint8Array([0x90, 60]))).toBeNull();
    expect(parseMidiMessage(null)).toBeNull();
    expect(parseMidiMessage(undefined)).toBeNull();
    expect(parseMidiMessage(new Uint8Array())).toBeNull();
  });

  it("ignores non-note messages", () => {
    expect(parseMidiMessage(new Uint8Array([0xb0, 7, 100]))).toBeNull();
    expect(parseMidiMessage(new Uint8Array([0xe0, 0, 64]))).toBeNull();
    expect(parseMidiMessage(new Uint8Array([0xf8]))).toBeNull();
  });

  it("masks data bytes to seven bits", () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 0xff, 0xff]))).toEqual({
      type: "noteon",
      note: 127,
      velocity: 127,
    });
  });
});

describe("padForMidiNote", () => {
  it("maps the C-major keybed", () => {
    expect(padForMidiNote(48)).toBe(0);
    expect(padForMidiNote(50)).toBe(1);
    expect(padForMidiNote(52)).toBe(2);
    expect(padForMidiNote(53)).toBe(3);
    expect(padForMidiNote(55)).toBe(4);
    expect(padForMidiNote(57)).toBe(5);
    expect(padForMidiNote(59)).toBe(6);
    expect(padForMidiNote(60)).toBe(7);
  });

  it("returns null outside the keybed", () => {
    expect(padForMidiNote(47)).toBeNull();
    expect(padForMidiNote(49)).toBeNull();
    expect(padForMidiNote(61)).toBeNull();
    expect(padForMidiNote(72)).toBeNull();
  });
});

describe("midiNoteName", () => {
  it("names the keybed notes", () => {
    expect(midiNoteName(48)).toBe("C3");
    expect(midiNoteName(60)).toBe("C4");
    expect(midiNoteName(61)).toBe("C#4");
    expect(midiNoteName(69)).toBe("A4");
  });

  it("clamps out-of-range note numbers", () => {
    expect(midiNoteName(0)).toBe("C-1");
    expect(midiNoteName(127)).toBe("G9");
    expect(midiNoteName(-10)).toBe("C-1");
    expect(midiNoteName(200)).toBe("G9");
  });
});
