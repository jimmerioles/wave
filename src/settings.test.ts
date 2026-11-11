import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettings, type StoredSettings } from "./settings";

const KEY = "wave:settings:v1";

class MemoryStorage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

function useStorage(): Storage {
  const storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  return storage as unknown as Storage;
}

const full: StoredSettings = {
  preset: "haze",
  cutoff: 71,
  echo: 48,
  space: 77,
  tempo: 128,
  arpEnabled: true,
  arpLatch: true,
  arpPattern: "updown",
  arpRate: "1/16",
  visual: "scope",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings persistence", () => {
  it("round-trips a complete settings object", () => {
    const storage = useStorage();
    saveSettings(full);
    expect(storage.getItem(KEY)).not.toBeNull();
    expect(loadSettings()).toEqual(full);
  });

  it("starts empty when nothing is stored", () => {
    useStorage();
    expect(loadSettings()).toEqual({});
  });

  it("ignores corrupt or non-object JSON", () => {
    const storage = useStorage();
    storage.setItem(KEY, "{not json");
    expect(loadSettings()).toEqual({});
    storage.setItem(KEY, "null");
    expect(loadSettings()).toEqual({});
    storage.setItem(KEY, '"hello"');
    expect(loadSettings()).toEqual({});
    storage.setItem(KEY, "[]");
    expect(loadSettings()).toEqual({});
  });

  it("keeps valid fields and rounds numbers", () => {
    const storage = useStorage();
    storage.setItem(
      KEY,
      JSON.stringify({
        preset: "pulse",
        cutoff: 70.6,
        echo: 48,
        space: 77,
        tempo: 128,
        arpEnabled: true,
        arpLatch: true,
        arpPattern: "updown",
        arpRate: "1/16",
        visual: "scope",
      }),
    );
    expect(loadSettings()).toEqual({ ...full, preset: "pulse", cutoff: 71 });
  });

  it("ignores invalid values and clamps the rest", () => {
    const storage = useStorage();
    storage.setItem(
      KEY,
      JSON.stringify({
        preset: "toString",
        cutoff: 150.4,
        echo: -5,
        space: 150,
        tempo: 0,
        arpEnabled: "yes",
        arpLatch: 1,
        arpPattern: "sideways",
        arpRate: "1/3",
        visual: "vr",
      }),
    );
    expect(loadSettings()).toEqual({
      cutoff: 100,
      echo: 0,
      space: 100,
      tempo: 50,
    });
  });

  it("ignores non-finite numbers", () => {
    const storage = useStorage();
    storage.setItem(
      KEY,
      JSON.stringify({ cutoff: null, echo: Number.NaN, tempo: Number.POSITIVE_INFINITY }),
    );
    expect(loadSettings()).toEqual({});
  });

  it("loads quietly when storage throws", () => {
    const storage = useStorage();
    storage.getItem = () => {
      throw new Error("storage blocked");
    };
    expect(loadSettings()).toEqual({});
  });

  it("saves quietly when storage throws", () => {
    const storage = useStorage();
    storage.setItem = () => {
      throw new Error("storage blocked");
    };
    expect(() => saveSettings(full)).not.toThrow();
  });
});
