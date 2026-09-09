import { describe, it, expect, beforeEach } from "vitest";
import { summariseWashDraftForTest } from "@/hooks/useIncompleteWashLog";
import { WASH_LOG_GROUPS } from "@/lib/washLogSteps";

const set = (key: string, value: unknown) =>
  localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));

describe("incomplete wash day log", () => {
  beforeEach(() => localStorage.clear());

  it("is nothing when no answers were given", () => {
    expect(summariseWashDraftForTest()).toBeNull();
    set("strand_wash_log_steps", { date: "2026-09-09", rows: {}, toolIds: [] });
    expect(summariseWashDraftForTest()).toBeNull();
  });

  it("lists the steps already filled in, with the date", () => {
    set("strand_wash_log_steps", {
      date: "2026-09-09",
      rows: {
        Cleanse: { productId: "p1", used: true },
        "Pre-poo": { productId: null, used: false, skipped: true },
      },
      toolIds: ["t1", "t2"],
    });
    const out = summariseWashDraftForTest();
    expect(out?.date).toBe("2026-09-09");
    expect(out?.filledSteps).toContain("Cleanse");
    expect(out?.skippedSteps).toContain("Pre-poo");
    expect(out?.toolCount).toBe(2);
    expect(out?.hasStyleAnswers).toBe(false);
  });

  it("counts second-screen answers too", () => {
    set("strand_wash_log_steps", { date: "2026-09-09", rows: {} });
    set("strand_wash_log_style", { note: "felt soft" });
    expect(summariseWashDraftForTest()?.hasStyleAnswers).toBe(true);
  });

  it("never surfaces an edit of a saved wash day as incomplete", () => {
    set("strand_wash_log_steps", {
      date: "2026-09-09",
      rows: { Cleanse: { productId: "p1", used: true } },
    });
    set("strand_wash_log_edit", { id: "abc" });
    expect(summariseWashDraftForTest()).toBeNull();
  });

  it("only ever holds one in-progress log — the draft keys are per member", () => {
    set("strand_wash_log_steps", { date: "2026-09-01", rows: { Cleanse: { productId: "p1" } } });
    set("strand_wash_log_steps", { date: "2026-09-08", rows: { Cleanse: { productId: "p2" } } });
    expect(summariseWashDraftForTest()?.date).toBe("2026-09-08");
  });

  it("Oil (Sealant) is a normal step, not a skippable one", () => {
    const oil = WASH_LOG_GROUPS.find((g) => g.key === "oil");
    expect(oil?.skippable).not.toBe(true);
  });
});
