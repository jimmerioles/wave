/**
 * Wave's arpeggiator.
 *
 * The arp reads the notes the player is holding and steps through them on the
 * shared tempo. Notes are scheduled against `AudioContext.currentTime` with a
 * short lookahead, so the pattern stays steady even when the main thread is
 * busy. Pad flashes are scheduled separately and are only cosmetic.
 */

import type { SynthEngine } from "./audio";

export type ArpPattern = "up" | "down" | "updown" | "random";
export type ArpRate = "1/4" | "1/8" | "1/16" | "1/8T";

export const ARP_PATTERN_LABELS: Record<ArpPattern, string> = {
  up: "up",
  down: "down",
  updown: "up/down",
  random: "random",
};

/** How long one arp step lasts, measured in beats. */
export const ARP_RATE_BEATS: Record<ArpRate, number> = {
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
  "1/8T": 1 / 3,
};

const LOOKAHEAD_SECONDS = 0.12;
const TICK_MS = 28;

export class Arpeggiator {
  enabled = false;
  latch = false;
  pattern: ArpPattern = "up";
  rate: ArpRate = "1/8";

  private pool: number[] = [];
  private poolKey = "";
  private timer: number | null = null;
  private nextAt = 0;
  private step = 0;
  private lastRandomNote = -1;
  private visualTimers = new Set<number>();
  private runToken = 0;

  constructor(
    private readonly engine: SynthEngine,
    private readonly getNotes: () => number[],
    private readonly getTempo: () => number,
    private readonly onStep: (noteIndex: number, durationMs: number) => void,
    private readonly onStop: () => void,
  ) {}

  get isPlaying(): boolean {
    return this.enabled && this.timer !== null;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.stopClock();
      return;
    }
    this.refresh();
  }

  setLatch(latch: boolean): void {
    this.latch = latch;
    this.refresh();
  }

  setPattern(pattern: ArpPattern): void {
    this.pattern = pattern;
    this.step = 0;
    this.lastRandomNote = -1;
  }

  setRate(rate: ArpRate): void {
    this.rate = rate;
  }

  /** Recompute the note pool after input, latch or enable changes. */
  refresh(): void {
    if (!this.enabled) {
      this.stopClock();
      return;
    }

    const pool = this.getNotes();
    const poolKey = pool.join(",");

    if (poolKey !== this.poolKey) {
      this.poolKey = poolKey;
      this.step = 0;
      this.lastRandomNote = -1;
    }

    this.pool = pool;

    if (pool.length === 0) {
      this.stopClock();
    } else if (this.timer === null) {
      this.startClock();
    }
  }

  /** Stop the pattern but keep the arp armed. */
  stop(): void {
    this.pool = [];
    this.poolKey = "";
    this.stopClock();
  }

  private startClock(): void {
    const ctx = this.engine.audioContext;
    if (!ctx) return;

    this.runToken++;
    this.nextAt = ctx.currentTime + 0.04;
    this.timer = window.setInterval(this.tick, TICK_MS);
    this.tick();
  }

  private stopClock(): void {
    const wasRunning = this.timer !== null;

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    for (const timer of this.visualTimers) clearTimeout(timer);
    this.visualTimers.clear();
    this.runToken++;

    if (wasRunning) this.onStop();
  }

  private tick = (): void => {
    const ctx = this.engine.audioContext;
    if (!ctx || !this.enabled || this.pool.length === 0) {
      this.stopClock();
      return;
    }

    const now = ctx.currentTime;
    // After a main-thread stall, do not dump a burst of late notes.
    if (this.nextAt < now - 0.2) this.nextAt = now + 0.03;

    const horizon = now + LOOKAHEAD_SECONDS;
    let guard = 0;

    while (this.nextAt < horizon && guard++ < 16) {
      const noteIndex = this.nextNote();
      const stepSeconds = (60 / this.getTempo()) * ARP_RATE_BEATS[this.rate];
      const duration = Math.max(0.06, stepSeconds * 0.72);

      this.engine.playScheduled(noteIndex, this.nextAt, duration);
      this.scheduleVisual(noteIndex, this.nextAt, stepSeconds);
      this.nextAt += stepSeconds;
    }
  };

  private nextNote(): number {
    const pool = this.pool;
    const size = pool.length;
    let index = 0;

    switch (this.pattern) {
      case "down":
        index = size - 1 - (this.step % size);
        break;
      case "updown": {
        const cycle = Math.max(1, 2 * size - 2);
        const position = this.step % cycle;
        index = position < size ? position : cycle - position;
        break;
      }
      case "random": {
        index = Math.floor(Math.random() * size);
        if (size > 1 && pool[index] === this.lastRandomNote) {
          index = (index + 1 + Math.floor(Math.random() * (size - 1))) % size;
        }
        break;
      }
      default:
        index = this.step % size;
        break;
    }

    this.step++;

    const note = pool[index];
    this.lastRandomNote = note;
    return note;
  }

  private scheduleVisual(
    noteIndex: number,
    when: number,
    stepSeconds: number,
  ): void {
    const ctx = this.engine.audioContext;
    if (!ctx) return;

    const token = this.runToken;
    const delay = Math.max(0, (when - ctx.currentTime) * 1000);
    const timer = window.setTimeout(() => {
      this.visualTimers.delete(timer);
      if (!this.isPlaying || token !== this.runToken) return;
      this.onStep(noteIndex, stepSeconds * 1000);
    }, delay);

    this.visualTimers.add(timer);
  }
}
