import { describe, it, expect } from "vitest";
import { uuid } from "@/lib/uuid";

const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuid()", () => {
  it("returns a UUID v4 shaped string", () => {
    expect(uuid()).toMatch(V4_RE);
  });

  it("produces unique values across calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(uuid());
    expect(set.size).toBe(100);
  });

  it("falls back when crypto.randomUUID is undefined (insecure context)", async () => {
    const original = (globalThis.crypto as Crypto & { randomUUID?: () => string }).randomUUID;
    try {
      // Simulate iOS Safari over plain http: randomUUID is undefined
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: undefined,
        configurable: true,
      });
      const { uuid: freshUuid } = await import("@/lib/uuid");
      const id = freshUuid();
      expect(id).toMatch(V4_RE);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: original,
        configurable: true,
      });
    }
  });
});
