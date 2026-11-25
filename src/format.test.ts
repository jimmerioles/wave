import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extensionForMime,
  formatBytes,
  formatClock,
  formatTakeDuration,
  mimeLabel,
  pickRecordMime,
} from "./format";

function stubRecorder(supported: readonly string[]): void {
  vi.stubGlobal("MediaRecorder", {
    isTypeSupported: (type: string) => supported.includes(type),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatClock", () => {
  it("pads seconds and floors partial ones", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(59.99)).toBe("0:59");
  });

  it("rolls over at a minute", () => {
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(61)).toBe("1:01");
    expect(formatClock(3599)).toBe("59:59");
  });

  it("clamps negative input", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("formatTakeDuration", () => {
  it("shows at least one second", () => {
    expect(formatTakeDuration(0)).toBe("0:01");
    expect(formatTakeDuration(0.4)).toBe("0:01");
  });

  it("rounds to the nearest second", () => {
    expect(formatTakeDuration(59.4)).toBe("0:59");
    expect(formatTakeDuration(125.4)).toBe("2:05");
  });

  it("rounds up into the next minute", () => {
    expect(formatTakeDuration(59.5)).toBe("1:00");
  });
});

describe("formatBytes", () => {
  it("keeps small sizes in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("rounds kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB");
  });

  it("shows megabytes with one decimal", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("pickRecordMime", () => {
  it("returns an empty string without MediaRecorder", () => {
    expect(pickRecordMime()).toBe("");
  });

  it("prefers Opus in WebM when everything is supported", () => {
    stubRecorder([
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ]);
    expect(pickRecordMime()).toBe("audio/webm;codecs=opus");
  });

  it("falls back through the candidate list", () => {
    stubRecorder(["audio/webm"]);
    expect(pickRecordMime()).toBe("audio/webm");

    stubRecorder(["audio/ogg;codecs=opus"]);
    expect(pickRecordMime()).toBe("audio/ogg;codecs=opus");

    stubRecorder(["audio/mp4"]);
    expect(pickRecordMime()).toBe("audio/mp4");
  });

  it("returns an empty string when nothing is supported", () => {
    stubRecorder([]);
    expect(pickRecordMime()).toBe("");
  });
});

describe("mimeLabel", () => {
  it("names the container the browser recorded", () => {
    expect(mimeLabel("audio/webm;codecs=opus")).toBe("WebM/Opus");
    expect(mimeLabel("audio/ogg;codecs=opus")).toBe("Ogg/Opus");
    expect(mimeLabel("audio/mp4")).toBe("M4A/AAC");
  });

  it("falls back for unknown types", () => {
    expect(mimeLabel("")).toBe("Audio");
    expect(mimeLabel("audio/wav")).toBe("Audio");
  });
});

describe("extensionForMime", () => {
  it("maps MIME types to file extensions", () => {
    expect(extensionForMime("audio/mp4")).toBe("m4a");
    expect(extensionForMime("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
  });

  it("defaults to webm for unknown types", () => {
    expect(extensionForMime("")).toBe("webm");
    expect(extensionForMime("audio/wav")).toBe("webm");
  });
});
