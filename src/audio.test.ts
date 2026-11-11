import { describe, expect, it } from "vitest";
import { cutoffFromSlider, formatHz, midiToHz } from "./audio";

describe("cutoffFromSlider", () => {
  it("clamps the slider range", () => {
    expect(cutoffFromSlider(-20)).toBeCloseTo(170);
    expect(cutoffFromSlider(120)).toBeCloseTo(8200);
  });

  it("increases monotonically", () => {
    const values = [0, 20, 40, 60, 80, 100].map(cutoffFromSlider);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("moves exponentially through the middle", () => {
    expect(cutoffFromSlider(50)).toBeCloseTo(Math.sqrt(170 * 8200), 5);
  });
});

describe("formatHz", () => {
  it("formats low frequencies as Hz", () => {
    expect(formatHz(170)).toBe("170 Hz");
    expect(formatHz(999)).toBe("999 Hz");
  });

  it("formats kilohertz with one decimal below 10 kHz", () => {
    expect(formatHz(1000)).toBe("1.0 kHz");
    expect(formatHz(1500)).toBe("1.5 kHz");
  });

  it("rounds kilohertz at 10 kHz and above", () => {
    expect(formatHz(10000)).toBe("10 kHz");
    expect(formatHz(12500)).toBe("13 kHz");
  });
});

describe("midiToHz", () => {
  it("anchors A4 at 440 Hz", () => {
    expect(midiToHz(69)).toBeCloseTo(440);
  });

  it("halves one octave down", () => {
    expect(midiToHz(57)).toBeCloseTo(220);
  });

  it("matches middle C", () => {
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
  });
});
