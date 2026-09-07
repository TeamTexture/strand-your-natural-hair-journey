/**
 * Detects a phone that is laying the page out at desktop width (Chrome/Samsung
 * Internet "Desktop site" mode, or a very low page zoom). In that state the
 * browser reports a layout viewport around 980px and then shrinks the whole
 * page to fit the screen, so the visual viewport scale drops well below 1.
 *
 * Pure and side-effect free so it can be unit tested. Never changes the layout
 * viewport or the viewport meta.
 */

export const ZOOMED_OUT_SCALE_THRESHOLD = 0.75;

export interface ViewportZoomInput {
  /** window.visualViewport.scale — 1 on a correctly sized phone. */
  scale: number;
  /** matchMedia("(pointer: coarse)").matches */
  pointerCoarse: boolean;
}

export function isViewportZoomedOut({ scale, pointerCoarse }: ViewportZoomInput): boolean {
  if (!pointerCoarse) return false;
  if (!Number.isFinite(scale) || scale <= 0) return false;
  return scale < ZOOMED_OUT_SCALE_THRESHOLD;
}

export const ZOOM_ATTR = "data-viewport-zoomed-out";
export const ZOOM_SCALE_VAR = "--strand-vv-scale";

function readScale(): number {
  const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
  return vv?.scale ?? 1;
}

function pointerIsCoarse(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Measured snapshot of the current viewport, used for detection and evidence. */
export function measureViewport() {
  const scale = readScale();
  const pointerCoarse = pointerIsCoarse();
  return {
    scale,
    pointerCoarse,
    innerWidth: typeof window !== "undefined" ? window.innerWidth : 0,
    innerHeight: typeof window !== "undefined" ? window.innerHeight : 0,
    screenWidth: typeof window !== "undefined" ? window.screen?.width ?? 0 : 0,
    screenHeight: typeof window !== "undefined" ? window.screen?.height ?? 0 : 0,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1,
    zoomedOut: isViewportZoomedOut({ scale, pointerCoarse }),
  };
}

/**
 * Second signal, kept for evidence only: on Desktop site mode innerWidth is far
 * wider than the device's own screen width in CSS px.
 */
export function innerWidthExceedsScreen(innerWidth: number, screenWidth: number): boolean {
  if (!innerWidth || !screenWidth) return false;
  return innerWidth > screenWidth * 1.5;
}

/** Applies/removes the html attribute + CSS variable. Returns the current state. */
export function syncViewportZoomAttribute(): boolean {
  if (typeof document === "undefined") return false;
  // No visualViewport means the scale cannot be measured (older browsers, test
  // environments) — leave whatever state is already set untouched.
  if (typeof window === "undefined" || !window.visualViewport) {
    return document.documentElement.hasAttribute(ZOOM_ATTR);
  }
  const { scale, zoomedOut } = measureViewport();
  const root = document.documentElement;
  if (zoomedOut) {
    root.setAttribute(ZOOM_ATTR, "1");
    root.style.setProperty(ZOOM_SCALE_VAR, String(scale));
  } else {
    root.removeAttribute(ZOOM_ATTR);
    root.style.removeProperty(ZOOM_SCALE_VAR);
  }
  return zoomedOut;
}

/** Wires detection to load + visualViewport resize/scroll. Returns a cleanup fn. */
export function watchViewportZoom(onChange?: (zoomedOut: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const run = () => {
    const state = syncViewportZoomAttribute();
    onChange?.(state);
  };
  run();
  const vv = window.visualViewport;
  vv?.addEventListener("resize", run);
  vv?.addEventListener("scroll", run);
  window.addEventListener("orientationchange", run);
  return () => {
    vv?.removeEventListener("resize", run);
    vv?.removeEventListener("scroll", run);
    window.removeEventListener("orientationchange", run);
  };
}
