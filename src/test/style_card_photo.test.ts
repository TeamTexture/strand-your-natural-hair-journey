// Guardrail: the Current style card image resolution order.
// 1. pinned photo (main_photo_id) when it still exists
// 2. newest progress photo — taken_on desc nulls last, then created_at desc
// 3. null → caller falls back (baseline photo / placeholder)

import { describe, it, expect } from "vitest";
import { resolveStyleCardPhoto, sortProgressPhotos } from "@/hooks/useStyleCardPhoto";

const photos = [
  { id: "old", taken_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
  { id: "new", taken_on: "2026-06-01", created_at: "2026-02-01T10:00:00Z" },
  { id: "undated", taken_on: null, created_at: "2026-07-01T10:00:00Z" },
];

describe("style card photo resolution", () => {
  it("sorts by taken_on desc with nulls last", () => {
    expect(sortProgressPhotos(photos).map((p) => p.id)).toEqual(["new", "old", "undated"]);
  });

  it("auto mode (null pin) shows the newest photo", () => {
    expect(resolveStyleCardPhoto(null, photos)?.id).toBe("new");
  });

  it("honours an explicit pin", () => {
    expect(resolveStyleCardPhoto("old", photos)?.id).toBe("old");
  });

  it("falls back to the newest when the pinned photo is gone", () => {
    expect(resolveStyleCardPhoto("deleted", photos)?.id).toBe("new");
  });

  it("returns null when there are no progress photos", () => {
    expect(resolveStyleCardPhoto("old", [])).toBeNull();
  });
});
