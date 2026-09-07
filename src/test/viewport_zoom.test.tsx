import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { isViewportZoomedOut, ZOOM_ATTR } from "@/lib/viewportZoom";
import DesktopSiteNotice from "@/components/DesktopSiteNotice";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute(ZOOM_ATTR);
  sessionStorage.clear();
});

describe("isViewportZoomedOut", () => {
  it("flags a coarse pointer at a heavily shrunk scale", () => {
    expect(isViewportZoomedOut({ scale: 0.42, pointerCoarse: true })).toBe(true);
  });
  it("does not flag a correctly sized phone", () => {
    expect(isViewportZoomedOut({ scale: 1, pointerCoarse: true })).toBe(false);
  });
  it("never flags a fine pointer (desktop)", () => {
    expect(isViewportZoomedOut({ scale: 0.42, pointerCoarse: false })).toBe(false);
  });
  it("uses 0.75 as the threshold", () => {
    expect(isViewportZoomedOut({ scale: 0.74, pointerCoarse: true })).toBe(true);
    expect(isViewportZoomedOut({ scale: 0.75, pointerCoarse: true })).toBe(false);
  });
});

describe("DesktopSiteNotice", () => {
  it("renders nothing when the attribute is absent", () => {
    const { container } = render(<DesktopSiteNotice />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the heading and RELOAD button when the attribute is present", () => {
    document.documentElement.setAttribute(ZOOM_ATTR, "1");
    render(<DesktopSiteNotice />);
    expect(screen.getByText("STRAND is showing at desktop size")).toBeTruthy();
    expect(screen.getByRole("button", { name: "RELOAD" })).toBeTruthy();
  });
});

describe("notice copy", () => {
  it("names Desktop site and avoids em dashes and exclamation marks", () => {
    document.documentElement.setAttribute(ZOOM_ATTR, "1");
    const { container } = render(<DesktopSiteNotice />);
    const text = container.textContent ?? "";
    expect(text).toContain("Desktop site");
    expect(text).not.toContain("—");
    expect(text).not.toContain("!");
  });
});


describe("index.css", () => {
  const css = readFileSync("src/index.css", "utf8");
  it("lifts the frame cap when zoomed out", () => {
    expect(css).toMatch(/html\[data-viewport-zoomed-out\] \[data-app-frame\] \{ max-width: none; \}/);
  });
});
