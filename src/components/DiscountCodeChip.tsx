import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  code: string;
  /** Visual style. `chip` = compact pill (used in the expanded banner);
   *  `block` = full-width card (used on the offer page and Discounts list). */
  variant?: "chip" | "block";
  /** Optional caption above the code in `block` variant. Defaults to "Discount code". */
  label?: string;
  className?: string;
  /** Fires when the code is successfully copied. Used to log analytics events. */
  onCopy?: () => void;
}

/** Copy the given text to the clipboard with a webview-safe fallback.
 *  Returns true when the copy succeeded via either the async Clipboard API or
 *  the legacy execCommand path. Never throws. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    // eslint-disable-next-line deprecation/deprecation
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Unified discount-code chip: real clipboard copy with async + execCommand
 *  fallback, "Copied ✓" flash, toast on success, text-selection fallback with
 *  a "press and hold" hint on failure. Stops propagation so tapping the code
 *  inside an expandable/link parent never collapses or navigates. */
const DiscountCodeChip = ({ code, variant = "chip", label = "Discount code", className, onCopy }: Props) => {
  const [copied, setCopied] = useState(false);
  const displayRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);

  const flash = () => {
    setCopied(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const selectText = () => {
    const node = displayRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const handleCopy = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = await copyTextToClipboard(code);
    if (ok) {
      flash();
      toast.success(`Code ${code} copied`);
      try { onCopy?.(); } catch { /* analytics should never break UX */ }
    } else {
      selectText();
      toast.message("Press and hold to copy", {
        description: `Code ${code} is selected — long-press to copy manually.`,
      });
    }
  };

  if (variant === "block") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy discount code ${code}`}
        className={cn(
          "w-full min-h-[44px] rounded-[12px] border border-dashed border-primary/40 bg-background/70",
          "px-3 py-2 flex flex-col items-center justify-center gap-0.5 cursor-pointer",
          "hover:bg-primary/5 active:bg-primary/10 transition-colors",
          className,
        )}
      >
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">
          {copied ? "Copied ✓" : label}
        </span>
        <span className="flex items-center gap-1.5">
          <span ref={displayRef} className="font-display text-lg text-primary tracking-widest select-all">
            {code}
          </span>
          {copied ? (
            <Check className="size-3.5 text-primary" />
          ) : (
            <Copy className="size-3.5 text-muted-foreground" />
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy discount code ${code}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/30",
        "px-2.5 py-2 min-h-[44px] cursor-pointer hover:bg-primary/15 active:bg-primary/20 transition-colors",
        className,
      )}
    >
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-body">
        {copied ? "Copied ✓" : "Tap to copy"}
      </span>
      <span ref={displayRef} className="font-body font-medium text-[12px] text-primary select-all">
        {code}
      </span>
      {copied ? (
        <Check className="size-3 text-primary" />
      ) : (
        <Copy className="size-3 text-muted-foreground" />
      )}
    </button>
  );
};

export default DiscountCodeChip;
