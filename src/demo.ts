/**
 * First Light's timing and filter ride.
 *
 * The demo's note data stays in `main.ts`. This module holds the small pure
 * pieces that decide how long the demo runs and how the shared filter moves
 * over it.
 */

export const DEMO_BEATS = 48;

/** [beat, cutoff slider value]: the demo rides the shared filter. */
export const DEMO_FILTER: readonly (readonly [number, number])[] = [
  [0, 22],
  [8, 36],
  [24, 64],
  [32, 72],
  [40, 82],
  [44, 78],
  [48, 34],
];

export function demoBeatMs(tempo: number): number {
  return 60000 / tempo;
}

export function demoDurationMs(tempo: number): number {
  return DEMO_BEATS * demoBeatMs(tempo);
}

export function demoSubText(tempo: number): string {
  return `Wave · First Light · ${Math.round(demoDurationMs(tempo) / 1000)}s`;
}

/** The filter value at a beat, linearly interpolated between keyframes. */
export function demoFilterAt(beat: number): number {
  const first = DEMO_FILTER[0];
  if (!first || beat <= first[0]) return first?.[1] ?? 22;

  for (let i = 1; i < DEMO_FILTER.length; i++) {
    const previous = DEMO_FILTER[i - 1];
    const current = DEMO_FILTER[i];
    if (!previous || !current) continue;
    if (beat <= current[0]) {
      const span = current[0] - previous[0];
      const t = span > 0 ? (beat - previous[0]) / span : 1;
      return previous[1] + (current[1] - previous[1]) * t;
    }
  }

  return DEMO_FILTER[DEMO_FILTER.length - 1]?.[1] ?? 34;
}
