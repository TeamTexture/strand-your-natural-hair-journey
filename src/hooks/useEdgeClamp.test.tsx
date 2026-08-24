import { describe, expect, it, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useEdgeClamp } from "./useEdgeClamp";

/**
 * The app renders inside a clipping 375px frame, so a bubble anchored to a
 * control near an edge is invisible rather than merely offset. These tests pin
 * the correction that keeps it on screen.
 */
const FRAME = { left: 100, right: 475 };

function mount(bubble: { left: number; right: number }) {
  const rects = new Map<string, { left: number; right: number }>([
    ["frame", FRAME],
    ["bubble", bubble],
  ]);

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const key = this.getAttribute("data-app-frame") !== null ? "frame" : "bubble";
      const r = rects.get(key)!;
      return {
        left: r.left,
        right: r.right,
        width: r.right - r.left,
        top: 0,
        bottom: 20,
        height: 20,
        x: r.left,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    },
  );

  let style: React.CSSProperties | undefined;
  const Probe = () => {
    const clamp = useEdgeClamp();
    style = clamp.style;
    return (
      <div data-app-frame>
        <span data-testid="bubble" ref={clamp.ref} style={clamp.style} />
      </div>
    );
  };
  render(<Probe />);
  return () => style;
}

afterEach(() => vi.restoreAllMocks());

describe("useEdgeClamp", () => {
  it("leaves a bubble that already fits untouched", () => {
    const style = mount({ left: 200, right: 300 });
    expect(style()).toBeUndefined();
  });

  it("pushes a bubble hanging off the left edge back inside", () => {
    // 190px bubble whose left edge sits 42px outside the frame.
    const style = mount({ left: 58, right: 248 });
    // 100 (frame) + 8 (margin) - 58 = 50
    expect(style()?.transform).toBe("translateX(50px)");
  });

  it("pulls a bubble hanging off the right edge back inside", () => {
    const style = mount({ left: 330, right: 500 });
    // 475 (frame) - 8 (margin) - 500 = -33
    expect(style()?.transform).toBe("translateX(-33px)");
  });

  it("aligns to the left edge when the bubble is wider than the frame", () => {
    const style = mount({ left: 60, right: 600 });
    expect(style()?.transform).toBe("translateX(48px)");
  });
});
