import { describe, it, expect } from "vitest";
import { parseSyncMode } from "../src/watcher.js";

describe("parseSyncMode()", () => {
  it("undefined → off", () => {
    expect(parseSyncMode(undefined)).toBe("off");
  });

  it('"off" → off', () => {
    expect(parseSyncMode("off")).toBe("off");
  });

  it('"watch" → watch', () => {
    expect(parseSyncMode("watch")).toBe("watch");
  });

  it('"poll:30" → { poll: 30 }', () => {
    expect(parseSyncMode("poll:30")).toEqual({ poll: 30 });
  });

  it('"poll:2" → { poll: 5 } (floors at 5s)', () => {
    expect(parseSyncMode("poll:2")).toEqual({ poll: 5 });
  });

  it('"poll:0" → { poll: 5 } (floors at 5s)', () => {
    expect(parseSyncMode("poll:0")).toEqual({ poll: 5 });
  });

  it('"poll:60" → { poll: 60 }', () => {
    expect(parseSyncMode("poll:60")).toEqual({ poll: 60 });
  });

  it('"garbage" → off (with stderr warning)', () => {
    const original = process.stderr.write;
    let written = "";
    process.stderr.write = ((chunk: string) => {
      written += chunk;
      return true;
    }) as any;

    const result = parseSyncMode("garbage");

    process.stderr.write = original;
    expect(result).toBe("off");
    expect(written).toContain("Unknown IMESSAGE_SYNC");
  });

  it('"poll:" (no number) → off', () => {
    const original = process.stderr.write;
    process.stderr.write = (() => true) as any;

    const result = parseSyncMode("poll:");

    process.stderr.write = original;
    expect(result).toBe("off");
  });
});
