// Shared clipboard utility. The browser Clipboard API silently fails in many
// real-world contexts (sandboxed iframes, non-secure contexts, some mobile
// in-app browsers). When that happens we fall back to the legacy
// `document.execCommand("copy")` trick using a hidden textarea, which works
// almost everywhere.
//
// Returns true when the copy succeeds so the caller can toast accordingly.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Modern Clipboard API (only works in secure contexts with the right
  //    permissions — and Lovable's preview iframe blocks it sometimes).
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }

  // 2. Legacy fallback using a hidden textarea + execCommand("copy").
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Try the native share sheet first (mobile), then fall back to copying the
 * URL to the clipboard. Returns the action taken so the caller can choose
 * the appropriate toast.
 */
export async function shareOrCopyLink(
  data: { title?: string; text?: string; url: string },
): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      // User cancelled — treat as no-op so we don't double-toast.
      const name = (e as { name?: string })?.name;
      if (name === "AbortError") return "shared";
      // Otherwise fall through to clipboard.
    }
  }
  const ok = await copyToClipboard(data.url);
  return ok ? "copied" : "failed";
}
