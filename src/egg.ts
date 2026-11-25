/**
 * Easter egg mappings.
 *
 * The song is in A-flat major but the pads are in C major, so the keybed
 * mirrors pitch classes. The Konami matcher is a pure state transition; the
 * caller owns the side effect of starting the song.
 */

/**
 * Map an A-flat-major note to the C-major pad that mirrors it. The song spans
 * more octaves than the keybed, so pitch class picks the scale degree and the
 * top A-flat folds onto the top C. Chromatic passing notes have no pad.
 */
const EGG_PAD_BY_PITCH_CLASS: Record<number, number> = {
  10: 1, // B-flat
  0: 2, // C
  1: 3, // D-flat
  3: 4, // E-flat
  5: 5, // F
  7: 6, // G
};

export function eggPadForMidi(midi: number): number | null {
  const pitchClass = ((midi % 12) + 12) % 12;
  if (pitchClass === 8) return midi >= 68 ? 7 : 0;
  return EGG_PAD_BY_PITCH_CLASS[pitchClass] ?? null;
}

export const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
] as const;

export interface KonamiStep {
  /** Index of the next expected key. */
  index: number;
  /** True when the code just completed; the caller triggers the egg. */
  matched: boolean;
}

/** Advance the Konami matcher by one key code. */
export function advanceKonami(index: number, code: string): KonamiStep {
  if (code === KONAMI[index]) {
    const next = index + 1;
    if (next === KONAMI.length) return { index: 0, matched: true };
    return { index: next, matched: false };
  }

  return { index: code === KONAMI[0] ? 1 : 0, matched: false };
}
