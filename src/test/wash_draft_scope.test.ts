// A wash-day draft belongs to exactly one entry: a new log, or one specific
// saved wash day being edited. Opening the other one throws the draft away.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/onboardingDraftStore", () => ({
  loadRemoteDraft: vi.fn(async () => null),
  saveRemoteDraft: vi.fn(),
  deleteRemoteDraft: vi.fn(),
  readLocalDraftTime: vi.fn(() => 0),
  writeLocalDraftTime: vi.fn(),
}));

import {
  readWashDraft,
  writeWashDraft,
  ensureWashDraftScope,
  readWashDraftScope,
  washDraftScope,
} from "@/lib/washDraft";

describe("wash draft scoping", () => {
  beforeEach(() => localStorage.clear());

  it("starts a fresh log blank after an edit was backed out of", () => {
    ensureWashDraftScope(washDraftScope("wd-1"));
    writeWashDraft("strand_wash_log_steps", { date: "2026-01-02", rows: { Cleanse: {} } });
    writeWashDraft("strand_wash_log_edit", { id: "wd-1" });

    const dropped = ensureWashDraftScope(washDraftScope(null));

    expect(dropped).toBe(true);
    expect(readWashDraftScope()).toBe("new");
    expect(readWashDraft("strand_wash_log_steps", null)).toBeNull();
    expect(readWashDraft("strand_wash_log_edit", null)).toBeNull();
  });

  it("an abandoned new log's photo, note and rating never reach an edit", () => {
    ensureWashDraftScope(washDraftScope(null));
    writeWashDraft("strand_wash_log_style", {
      mediaPath: "abandoned.jpg",
      note: "left behind",
      rating: 9,
    });

    ensureWashDraftScope(washDraftScope("wd-older"));

    expect(readWashDraft("strand_wash_log_style", null)).toBeNull();
    expect(readWashDraftScope()).toBe("edit:wd-older");
  });

  it("keeps the draft when the same entry is reopened", () => {
    ensureWashDraftScope(washDraftScope("wd-1"));
    writeWashDraft("strand_wash_log_steps", { date: "2026-01-02" });

    expect(ensureWashDraftScope(washDraftScope("wd-1"))).toBe(false);
    expect(readWashDraft<{ date?: string }>("strand_wash_log_steps", {}).date).toBe("2026-01-02");
  });
});
