import { describe, expect, it, vi } from "vitest";
import { ARP_RATE_BEATS, arpStepSeconds, pickArpNote } from "./arp";

const pool = [0, 2, 4];

function sequence(
  pattern: "up" | "down" | "updown" | "random",
  length: number,
  last = -1,
) {
  return Array.from({ length }, (_, step) =>
    pickArpNote(pool, pattern, step, last),
  );
}

describe("pickArpNote", () => {
  it("walks up and repeats", () => {
    expect(sequence("up", 5)).toEqual([0, 2, 4, 0, 2]);
  });

  it("walks down and repeats", () => {
    expect(sequence("down", 5)).toEqual([4, 2, 0, 4, 2]);
  });

  it("bounces without repeating the endpoints", () => {
    expect(sequence("updown", 6)).toEqual([0, 2, 4, 2, 0, 2]);
  });

  it("handles a single-note pool for every pattern", () => {
    for (const pattern of ["up", "down", "updown", "random"] as const) {
      expect(pickArpNote([7], pattern, 0, -1, () => 0.9)).toBe(7);
    }
  });

  it("rejects an empty pool", () => {
    expect(() => pickArpNote([], "up", 0, -1)).toThrow(/empty pool/);
  });

  it("random picks stay inside the pool", () => {
    for (let step = 0; step < 20; step++) {
      expect(pool).toContain(
        pickArpNote(pool, "random", step, -1, () => 0.42),
      );
    }
  });

  it("random avoids an immediate repeat", () => {
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0);
    expect(pickArpNote(pool, "random", 0, 0, random)).toBe(2);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("random does not re-roll when the first pick is different", () => {
    const random = vi.fn().mockReturnValue(0);
    expect(pickArpNote(pool, "random", 0, 99, random)).toBe(0);
    expect(random).toHaveBeenCalledTimes(1);
  });
});

describe("arpStepSeconds", () => {
  it("maps a quarter note at 60 BPM to one second", () => {
    expect(arpStepSeconds(60, "1/4")).toBeCloseTo(1);
  });

  it("maps eighth and sixteenth notes at 120 BPM", () => {
    expect(arpStepSeconds(120, "1/8")).toBeCloseTo(0.25);
    expect(arpStepSeconds(120, "1/16")).toBeCloseTo(0.125);
  });

  it("maps an eighth-note triplet", () => {
    expect(arpStepSeconds(120, "1/8T")).toBeCloseTo(1 / 6);
  });

  it("does not divide by a zero tempo", () => {
    expect(arpStepSeconds(0, "1/4")).toBeCloseTo(60);
  });

  it("has the expected beat ratios", () => {
    expect(ARP_RATE_BEATS["1/4"]).toBe(1);
    expect(ARP_RATE_BEATS["1/8"]).toBe(0.5);
    expect(ARP_RATE_BEATS["1/16"]).toBe(0.25);
    expect(ARP_RATE_BEATS["1/8T"]).toBeCloseTo(1 / 3);
  });
});
