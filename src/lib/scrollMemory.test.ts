import { describe, it, expect, beforeEach } from "vitest";
import { applyScrollMark, anchorProps, readScrollMark, saveScrollMark } from "@/lib/scrollMemory";

function makeContainer(height: number) {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: height, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
  el.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe("scrollMemory", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("round-trips a mark through sessionStorage keyed by location key", () => {
    saveScrollMark("k1", "/home", { offset: 240, anchorId: "anchor-a", sectionIds: ["section-alerts"] });
    expect(readScrollMark("k1", "/home")?.offset).toBe(240);
    expect(readScrollMark("k1", "/products")).toBeNull();
    expect(readScrollMark("k2", "/home")).toBeNull();
  });

  it("derives ids from record ids, not indexes", () => {
    expect(anchorProps("alert-abc/1")).toEqual({ id: "anchor-alert-abc-1", "data-scroll-anchor": "" });
    expect(anchorProps(null)).toEqual({});
  });

  it("restores to the anchor element when it still exists", () => {
    const container = makeContainer(2000);
    const el = document.createElement("div");
    el.id = "anchor-a";
    el.getBoundingClientRect = () => ({ top: 500 }) as DOMRect;
    container.appendChild(el);
    const outcome = applyScrollMark(container, { offset: 900, anchorId: "anchor-a", sectionIds: ["section-alerts"] });
    expect(outcome).toBe("anchor");
    expect(container.scrollTop).toBe(500 - 24);
  });

  it("degrades to the surviving container when the target element is gone", () => {
    const container = makeContainer(2000);
    const section = document.createElement("div");
    section.id = "section-alerts";
    section.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
    container.appendChild(section);
    const outcome = applyScrollMark(container, { offset: 900, anchorId: "anchor-gone", sectionIds: ["section-alerts"] });
    expect(outcome).toBe("section");
    expect(container.scrollTop).toBe(300 - 24);
  });

  it("falls back to the saved offset, then reports not-ready while content is short", () => {
    const tall = makeContainer(2000);
    expect(applyScrollMark(tall, { offset: 900, anchorId: "anchor-gone", sectionIds: ["gone"] })).toBe("offset");
    expect(tall.scrollTop).toBe(900);

    const short = makeContainer(400);
    expect(applyScrollMark(short, { offset: 900 })).toBeNull();
  });
});
