/**
 * Shared app-wide scroll restoration.
 *
 * One mechanism, no per-page copies. Positions are keyed by React Router's
 * `location.key` (so the same route visited twice never shares a position) and
 * stored in `sessionStorage` (survives reload, dies with the session).
 *
 * Restoration prefers ANCHOR TARGETS over raw pixel offsets: whatever the
 * member last tapped (marked with `data-scroll-anchor` + a stable `id`) is
 * scrolled back into comfortable view. If that element is gone — an alert was
 * resolved, a row deleted — we degrade to its nearest surviving
 * `[data-scroll-section]` container, then to the saved offset, then to the top.
 */

export interface ScrollMark {
  offset: number;
  /** id of the element the member tapped before navigating away. */
  anchorId?: string;
  /** ids of that element's `[data-scroll-section]` ancestors, nearest first. */
  sectionIds?: string[];
}

const PREFIX = "strand.scroll.";
/** Padding above the restored element so it isn't flush to the top edge. */
export const ANCHOR_TOP_PADDING = 24;

/**
 * Storage key. `location.key` is the primary discriminator (the same route
 * visited twice never shares a position); the pathname is appended only because
 * React Router reuses the literal key "default" for the first history entry
 * after a full page load, which would otherwise collide across routes.
 */
export function scrollKey(locationKey: string, pathname = "") {
  return `${PREFIX}${locationKey}::${pathname}`;
}

export function saveScrollMark(locationKey: string, pathname: string, mark: ScrollMark) {
  try {
    sessionStorage.setItem(scrollKey(locationKey, pathname), JSON.stringify(mark));
  } catch {
    /* storage unavailable — restoration simply degrades to top of page */
  }
}

export function readScrollMark(locationKey: string, pathname = ""): ScrollMark | null {
  try {
    const raw = sessionStorage.getItem(scrollKey(locationKey, pathname));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScrollMark;
    return typeof parsed?.offset === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearScrollMark(locationKey: string, pathname = "") {
  try {
    sessionStorage.removeItem(scrollKey(locationKey, pathname));
  } catch {
    /* no-op */
  }
}

/* ------------------------------------------------------------------ */
/* Anchor capture                                                      */
/* ------------------------------------------------------------------ */

let pendingAnchor: { anchorId: string; sectionIds: string[] } | null = null;

/** Record a tapped element as the anchor for the current page's next save. */
export function markScrollAnchor(el: Element | null) {
  const anchor = el?.closest<HTMLElement>("[data-scroll-anchor]");
  if (!anchor?.id) return;
  const sectionIds: string[] = [];
  let node: HTMLElement | null = anchor.parentElement;
  while (node) {
    const section = node.closest<HTMLElement>("[data-scroll-section]");
    if (!section) break;
    if (section.id) sectionIds.push(section.id);
    node = section.parentElement;
  }
  pendingAnchor = { anchorId: anchor.id, sectionIds };
}

export function takePendingAnchor() {
  const a = pendingAnchor;
  pendingAnchor = null;
  return a;
}

export function peekPendingAnchor() {
  return pendingAnchor;
}

/** `id` + marker attribute for anything that navigates away. Derive from record ids. */
export function anchorProps(id: string | number | null | undefined) {
  if (id === null || id === undefined || id === "") return {};
  const safe = String(id).replace(/[^a-zA-Z0-9_-]+/g, "-");
  return { id: `anchor-${safe}`, "data-scroll-anchor": "" } as const;
}

/* ------------------------------------------------------------------ */
/* Applying a mark to a scroll container                               */
/* ------------------------------------------------------------------ */

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type RestoreOutcome = "anchor" | "section" | "offset" | "top";

function scrollToElement(container: HTMLElement, el: HTMLElement) {
  const top =
    el.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop -
    ANCHOR_TOP_PADDING;
  container.scrollTop = Math.max(0, top);
}

/**
 * Apply a saved mark. Returns the strategy used, or null when nothing could be
 * applied yet (page still too short) so the caller can retry.
 */
export function applyScrollMark(
  container: HTMLElement,
  mark: ScrollMark,
): RestoreOutcome | null {
  if (mark.anchorId) {
    const el = document.getElementById(mark.anchorId);
    if (el && container.contains(el)) {
      scrollToElement(container, el);
      return "anchor";
    }
  }
  for (const sectionId of mark.sectionIds ?? []) {
    const el = document.getElementById(sectionId);
    if (el && container.contains(el)) {
      scrollToElement(container, el);
      return "section";
    }
  }
  const max = container.scrollHeight - container.clientHeight;
  if (mark.offset <= 0) return "top";
  if (max <= 0) return null; // content hasn't rendered yet — retry
  if (max + 4 < mark.offset) {
    // Page is shorter than it was; still growing. Scroll as far as we can and retry.
    container.scrollTop = max;
    return null;
  }
  container.scrollTop = mark.offset;
  return "offset";
}
