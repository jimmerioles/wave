import { describe, expect, it } from "vitest";
import { advanceKonami, eggPadForMidi, KONAMI } from "./egg";

describe("eggPadForMidi", () => {
  it("maps the A-flat major scale to the C major pads", () => {
    expect(eggPadForMidi(70)).toBe(1); // B-flat
    expect(eggPadForMidi(60)).toBe(2); // C
    expect(eggPadForMidi(61)).toBe(3); // D-flat
    expect(eggPadForMidi(63)).toBe(4); // E-flat
    expect(eggPadForMidi(65)).toBe(5); // F
    expect(eggPadForMidi(67)).toBe(6); // G
    expect(eggPadForMidi(68)).toBe(7); // A-flat
  });

  it("folds the low A-flat onto the bottom pad", () => {
    expect(eggPadForMidi(56)).toBe(0);
    expect(eggPadForMidi(44)).toBe(0);
  });

  it("folds high A-flats onto the top pad", () => {
    expect(eggPadForMidi(80)).toBe(7);
    expect(eggPadForMidi(92)).toBe(7);
  });

  it("leaves chromatic passing notes without a pad", () => {
    for (const midi of [62, 64, 66, 69, 71]) {
      expect(eggPadForMidi(midi)).toBeNull();
    }
  });

  it("wraps negative note numbers by pitch class", () => {
    expect(eggPadForMidi(-4)).toBe(0); // A-flat below MIDI 0
  });

  it("always returns a real keybed pad", () => {
    for (let midi = 0; midi <= 127; midi++) {
      const pad = eggPadForMidi(midi);
      if (pad !== null) {
        expect(pad).toBeGreaterThanOrEqual(0);
        expect(pad).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe("advanceKonami", () => {
  it("walks the code without matching early", () => {
    let index = 0;
    for (let i = 0; i < KONAMI.length - 1; i++) {
      const step = advanceKonami(index, KONAMI[i]);
      index = step.index;
      expect(step.matched).toBe(false);
    }

    expect(index).toBe(KONAMI.length - 1);
  });

  it("matches on the final key and resets", () => {
    let index = 0;
    for (let i = 0; i < KONAMI.length - 1; i++) {
      index = advanceKonami(index, KONAMI[i]).index;
    }

    const done = advanceKonami(index, KONAMI[KONAMI.length - 1]);
    expect(done).toEqual({ index: 0, matched: true });
  });

  it("resets on an unrelated key", () => {
    let index = advanceKonami(0, "ArrowUp").index;
    index = advanceKonami(index, "ArrowUp").index;
    expect(index).toBe(2);

    const step = advanceKonami(index, "KeyA");
    expect(step).toEqual({ index: 0, matched: false });
  });

  it("restarts when the wrong key is the first key", () => {
    let index = advanceKonami(0, "ArrowUp").index;
    index = advanceKonami(index, "ArrowUp").index;

    const step = advanceKonami(index, "ArrowUp");
    expect(step).toEqual({ index: 1, matched: false });
  });

  it("ignores noise between attempts", () => {
    let index = advanceKonami(0, "ArrowUp").index;
    index = advanceKonami(index, "KeyX").index;
    expect(index).toBe(0);

    let matched = false;
    for (const code of KONAMI) {
      const step = advanceKonami(index, code);
      index = step.index;
      matched = step.matched;
    }

    expect(matched).toBe(true);
    expect(index).toBe(0);
  });

  it("can run the code twice", () => {
    let index = 0;
    let matches = 0;
    for (const code of [...KONAMI, ...KONAMI]) {
      const step = advanceKonami(index, code);
      index = step.index;
      if (step.matched) matches++;
    }

    expect(matches).toBe(2);
  });
});
