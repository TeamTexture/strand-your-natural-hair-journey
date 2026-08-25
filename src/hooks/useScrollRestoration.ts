import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import {
  applyScrollMark,
  markScrollAnchor,
  readScrollMark,
  saveScrollMark,
  takePendingAnchor,
  peekPendingAnchor,
  type RestoreOutcome,
} from "@/lib/scrollMemory";

/** How long we keep retrying while async content fills the page in. */
const RESTORE_WINDOW_MS = 2500;

/**
 * App-wide scroll restoration for a scrollable container.
 *
 * Pages opt in simply by rendering `<ScreenLayout>` — this hook lives there, so
 * every scrollable route is covered without per-page code. Anything that
 * navigates away should carry a stable `id` plus `data-scroll-anchor`
 * (see `anchorProps` in `@/lib/scrollMemory`) so we can restore to the element
 * rather than a pixel offset.
 */
export function useScrollRestoration(ref: React.RefObject<HTMLElement>) {
  const { key, pathname } = useLocation();
  const navType = useNavigationType();
  const outcomeRef = useRef<RestoreOutcome | null>(null);
  const previousPathnameRef = useRef<string | null>(null);

  // Coordinate with the browser: we own scroll position, it does not.
  useEffect(() => {
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  // Save on scroll (rAF-throttled), on anchor taps, and on unmount.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const persist = () => {
      const anchor = peekPendingAnchor();
      saveScrollMark(key, pathname, {
        offset: el.scrollTop,
        anchorId: anchor?.anchorId,
        sectionIds: anchor?.sectionIds,
      });
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        persist();
      });
    };
    const onPointerDown = (e: Event) => {
      markScrollAnchor(e.target as Element | null);
      persist();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", onPointerDown, { capture: true } as EventListenerOptions);
      persist();
      // The anchor belongs to the page we are leaving only.
      takePendingAnchor();
    };
  }, [key, pathname, ref]);

  // Restore — on POP (back/forward through history) only. A fresh PUSH to a
  // different page starts at the top; same-page search/hash changes preserve
  // the user's current scroll position.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (navType !== "POP") {
      if (previousPathnameRef.current === pathname) {
        previousPathnameRef.current = pathname;
        return;
      }
      el.scrollTop = 0;
      previousPathnameRef.current = pathname;
      return;
    }
    previousPathnameRef.current = pathname;
    const mark = readScrollMark(key, pathname);
    if (!mark) return;

    let raf = 0;
    let cancelled = false;
    const started = performance.now();
    let lastHeight = -1;
    let stableFrames = 0;

    // Async content changes page height after mount, so keep re-applying until
    // the height settles (or the window expires) instead of restoring once.
    const tick = () => {
      if (cancelled || !ref.current) return;
      const node = ref.current;
      const outcome = applyScrollMark(node, mark);
      if (outcome) outcomeRef.current = outcome;
      const height = node.scrollHeight;
      stableFrames = height === lastHeight ? stableFrames + 1 : 0;
      lastHeight = height;
      const settled = outcome && outcome !== "top" && stableFrames >= 6;
      if (settled || performance.now() - started > RESTORE_WINDOW_MS) return;
      raf = requestAnimationFrame(tick);
    };
    tick();

    // A member scroll gesture wins immediately.
    const stop = () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
    el.addEventListener("wheel", stop, { passive: true, once: true });
    el.addEventListener("touchstart", stop, { passive: true, once: true });

    return () => {
      stop();
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
  }, [key, pathname, navType, ref]);

  return outcomeRef;
}

export default useScrollRestoration;
