/**
 * Small, versioned slice of the instrument that survives a reload.
 *
 * Storage can be unavailable (private windows, locked-down browsers), so both
 * directions fail quietly and the synth still starts from its defaults.
 */

import { PRESETS, type PresetKey } from "./audio";
import type { ArpPattern, ArpRate } from "./arp";

export type VisualMode = "orb" | "scope";

export interface StoredSettings {
  preset: PresetKey;
  cutoff: number;
  echo: number;
  space: number;
  tempo: number;
  arpEnabled: boolean;
  arpLatch: boolean;
  arpPattern: ArpPattern;
  arpRate: ArpRate;
  visual: VisualMode;
}

const KEY = "wave:settings:v1";

function isPresetKey(value: unknown): value is PresetKey {
  return typeof value === "string" && Object.hasOwn(PRESETS, value);
}

function isPattern(value: unknown): value is ArpPattern {
  return value === "up" || value === "down" || value === "updown" || value === "random";
}

function isRate(value: unknown): value is ArpRate {
  return value === "1/4" || value === "1/8" || value === "1/16" || value === "1/8T";
}

function isVisual(value: unknown): value is VisualMode {
  return value === "orb" || value === "scope";
}

function numberIn(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function loadSettings(): Partial<StoredSettings> {
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== "object") return {};
  const data = parsed as Record<string, unknown>;
  const out: Partial<StoredSettings> = {};

  if (isPresetKey(data.preset)) out.preset = data.preset;

  const cutoff = numberIn(data.cutoff, 0, 100);
  if (cutoff !== undefined) out.cutoff = cutoff;

  const echo = numberIn(data.echo, 0, 60);
  if (echo !== undefined) out.echo = echo;

  const space = numberIn(data.space, 0, 100);
  if (space !== undefined) out.space = space;

  const tempo = numberIn(data.tempo, 50, 160);
  if (tempo !== undefined) out.tempo = tempo;

  if (typeof data.arpEnabled === "boolean") out.arpEnabled = data.arpEnabled;
  if (typeof data.arpLatch === "boolean") out.arpLatch = data.arpLatch;
  if (isPattern(data.arpPattern)) out.arpPattern = data.arpPattern;
  if (isRate(data.arpRate)) out.arpRate = data.arpRate;
  if (isVisual(data.visual)) out.visual = data.visual;

  return out;
}

export function saveSettings(settings: StoredSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* Storage is a nicety; the instrument still works without it. */
  }
}
