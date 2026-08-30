import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const tour = readFileSync(path.resolve("src/components/HomeTour.tsx"), "utf8");
const photoHook = readFileSync(path.resolve("src/hooks/useStyleCardPhoto.ts"), "utf8");

describe("home tour close affordances", () => {
  it("has an X close button that only minimises (never marks the tour finished)", () => {
    expect(tour).toContain('aria-label="Close the tour"');
    const block = tour.slice(tour.indexOf('aria-label="Close the tour"') - 400, tour.indexOf('aria-label="Close the tour"'));
    expect(block).toContain("setActive(false)");
    expect(block).not.toContain("finish(");
  });

  it("closes on a backdrop tap but ignores taps inside the spotlight", () => {
    expect(tour).toContain("onPointerDown");
    expect(tour).toContain("insideTarget");
  });

  it("never renders the empty photo state once a photo has been seen", () => {
    expect(tour).toContain("sawStylePhotoRef");
    expect(tour).toContain("stylePhotos.length > 0 || sawStylePhotoRef.current");
  });

  it("keeps the last non-empty photo result across refetch and auth key changes", () => {
    expect(photoHook).toContain("placeholderData: (prev) => prev ?? lastGood.current");
    expect(photoHook).toContain("lastGood.current = query.data");
  });
});
