/**
 * Display formatting for recorded takes.
 *
 * These helpers do no DOM work, so the recording readout can be tested without
 * a browser. `pickRecordMime` reads the MediaRecorder global at call time.
 */

const RECORD_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

/** Seconds to m:ss, flooring partial seconds. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A take always shows at least one second, so a short clip is not 0:00. */
export function formatTakeDuration(seconds: number): string {
  return formatClock(Math.max(1, Math.round(seconds)));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** The first MIME type the browser can record, or "" when none works. */
export function pickRecordMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of RECORD_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function mimeLabel(mime: string): string {
  if (mime.includes("mp4")) return "M4A/AAC";
  if (mime.includes("ogg")) return "Ogg/Opus";
  if (mime.includes("webm")) return "WebM/Opus";
  return "Audio";
}

export function extensionForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}
