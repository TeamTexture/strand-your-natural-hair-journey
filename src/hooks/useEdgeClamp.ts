import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps a floating element (tooltip, popover, hint bubble) fully inside the
 * app frame.
 *
 * STRAND renders inside a 375px-wide phone frame that clips its contents, so an
 * absolutely positioned bubble anchored to a control near an edge silently gets
 * cut in half. This measures the element against the frame after it renders and
 * nudges it horizontally by just enough to fit.
 *
 * Usage:
 *   const clamp = useEdgeClamp();
 *   <span ref={clamp.ref} style={clamp.style} className="absolute right-0 …" />
 */
export function useEdgeClamp(margin = 8) {
  const [shift, setShift] = useState(0);
  const nodeRef = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;

    // Measure without the current correction so the maths never compounds.
    const previous = node.style.transform;
    node.style.transform = "none";
    const rect = node.getBoundingClientRect();
    node.style.transform = previous;

    const frame = node.closest("[data-app-frame]");
    const bounds = frame
      ? frame.getBoundingClientRect()
      : ({ left: 0, right: window.innerWidth } as DOMRect);

    let next = 0;
    if (rect.left < bounds.left + margin) {
      next = bounds.left + margin - rect.left;
    } else if (rect.right > bounds.right - margin) {
      next = bounds.right - margin - rect.right;
    }
    // Never push the element out of the opposite edge on a very narrow frame.
    const overshoot = rect.width - (bounds.right - bounds.left - margin * 2);
    if (overshoot > 0) next = bounds.left + margin - rect.left;

    setShift((current) => (Math.abs(current - next) > 0.5 ? next : current));
  }, [margin]);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      if (node) measure();
      else setShift(0);
    },
    [measure],
  );

  useEffect(() => {
    if (!nodeRef.current) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [measure, shift]);

  return {
    ref,
    style: shift ? { transform: `translateX(${shift}px)` } : undefined,
  };
}

export default useEdgeClamp;
