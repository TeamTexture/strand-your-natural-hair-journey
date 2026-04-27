import { useEffect } from "react";

/**
 * Global fix for the on-screen keyboard obscuring inputs inside dialogs,
 * sheets, popovers, and any other floating surface.
 *
 * The mobile Safari / Chrome virtual keyboard shrinks `window.visualViewport`
 * but doesn't reflow the page, so a focused <input> at the bottom of an open
 * Sheet (e.g. the "Why are you removing this?" picker) ends up hidden behind
 * the keyboard.
 *
 * Strategy: when an input/textarea/contenteditable receives focus, wait one
 * frame (so the keyboard starts opening) and call `scrollIntoView` with a
 * generous block:"center". We also re-run on visualViewport resize so the
 * focused element is brought back into view if the keyboard re-opens after
 * being dismissed.
 *
 * Mounted once at the App root — covers the entire app.
 */
export function useKeyboardAwareInputs() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isEditable = (el: Element | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT") {
        // Skip non-text inputs (checkboxes, radios, buttons, etc.)
        const type = (el as HTMLInputElement).type;
        return ![
          "checkbox",
          "radio",
          "button",
          "submit",
          "reset",
          "range",
          "color",
          "file",
        ].includes(type);
      }
      if (tag === "TEXTAREA") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const scrollFocusedIntoView = (el: HTMLElement) => {
      // Two RAFs gives the virtual keyboard time to start animating in,
      // so visualViewport reflects the post-keyboard viewport height.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch {
            // Older browsers may not support smooth — fall back to default.
            el.scrollIntoView();
          }
        });
      });
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (isEditable(target)) scrollFocusedIntoView(target);
    };

    const onViewportResize = () => {
      const active = document.activeElement;
      if (isEditable(active)) scrollFocusedIntoView(active);
    };

    document.addEventListener("focusin", onFocusIn);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportResize);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      vv?.removeEventListener("resize", onViewportResize);
    };
  }, []);
}
