import { describe, expect, it } from "vitest";
import {
  DEMO_BEATS,
  DEMO_FILTER,
  demoBeatMs,
  demoDurationMs,
  demoFilterAt,
  demoSubText,
} from "./demo";

describe("demo timing", () => {
  it("converts tempo to milliseconds per beat", () => {
    expect(demoBeatMs(60)).toBeCloseTo(1000);
    expect(demoBeatMs(100)).toBeCloseTo(600);
    expect(demoBeatMs(120)).toBeCloseTo(500);
  });

  it("runs for DEMO_BEATS beats", () => {
    expect(demoDurationMs(100)).toBeCloseTo(28800);
    expect(demoDurationMs(120)).toBeCloseTo(24000);
  });

  it("describes the demo length in whole seconds", () => {
    expect(demoSubText(100)).toBe("Wave · First Light · 29s");
    expect(demoSubText(120)).toBe("Wave · First Light · 24s");
  });
});

describe("DEMO_FILTER", () => {
  it("starts at the first beat and ends at the last", () => {
    expect(DEMO_FILTER[0]?.[0]).toBe(0);
    expect(DEMO_FILTER[DEMO_FILTER.length - 1]?.[0]).toBe(DEMO_BEATS);
  });

  it("keeps keyframes in beat order", () => {
    for (let i = 1; i < DEMO_FILTER.length; i++) {
      expect(DEMO_FILTER[i][0]).toBeGreaterThan(DEMO_FILTER[i - 1][0]);
    }
  });

  it("uses slider values", () => {
    for (const [, value] of DEMO_FILTER) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe("demoFilterAt", () => {
  it("returns each keyframe exactly", () => {
    for (const [beat, value] of DEMO_FILTER) {
      expect(demoFilterAt(beat)).toBeCloseTo(value);
    }
  });

  it("interpolates between keyframes", () => {
    expect(demoFilterAt(4)).toBeCloseTo(29);
    expect(demoFilterAt(16)).toBeCloseTo(50);
    expect(demoFilterAt(28)).toBeCloseTo(68);
    expect(demoFilterAt(36)).toBeCloseTo(77);
    expect(demoFilterAt(42)).toBeCloseTo(80);
    expect(demoFilterAt(46)).toBeCloseTo(56);
  });

  it("holds the first value before the start", () => {
    expect(demoFilterAt(-10)).toBeCloseTo(DEMO_FILTER[0][1]);
  });

  it("holds the last value after the end", () => {
    expect(demoFilterAt(100)).toBeCloseTo(
      DEMO_FILTER[DEMO_FILTER.length - 1][1],
    );
  });
});
