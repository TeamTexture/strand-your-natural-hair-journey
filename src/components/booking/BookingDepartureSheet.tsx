import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pre-departure sheet shown before a member leaves for a professional's
 * external booking page.
 *
 * Hard rule: the way forward is NEVER gated on the clipboard API. It fails in
 * real conditions (denied permissions, insecure context, old in-app webviews),
 * so confirm unlocks through three independent paths:
 *   1. a successful copy,
 *   2. an explicit "I've noted the code" acknowledgement (shown on failure),
 *   3. a 10-second timeout, unconditionally.
 * The code itself is always plain selectable text.
 */

export interface BookingDepartureTarget {
  proName: string;
  bookingUrl: string;
  discountCode?: string | null;
  discountDescription?: string | null;
}

const UNLOCK_AFTER_MS = 10_000;

const BookingDepartureSheet = ({
  open,
  onOpenChange,
  target,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: BookingDepartureTarget | null;
  /** Fired on confirm. Must write the outbound click row, then open the URL. */
  onConfirm: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const codeRef = useRef<HTMLElement | null>(null);

  const code = target?.discountCode?.trim() || "";
  const hasDiscount = !!code;

  // Reset per opening, and start the failsafe unlock timer.
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setCopyFailed(false);
    setAcknowledged(false);
    setTimedOut(false);
    setAnnouncement("");
    if (!hasDiscount) return;
    const id = window.setTimeout(() => setTimedOut(true), UNLOCK_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [open, hasDiscount]);

  const canConfirm = !hasDiscount || copied || acknowledged || timedOut;

  const selectCode = () => {
    const el = codeRef.current;
    if (!el || typeof window.getSelection !== "function") return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyFailed(false);
      setAnnouncement("Copied to clipboard");
    } catch {
      // Never dead-end. Fall back to select-and-acknowledge.
      setCopyFailed(true);
      selectCode();
      setAnnouncement(
        "Couldn't copy automatically. The code is selected — copy it by hand, then confirm you've noted it.",
      );
    }
  };

  if (!target) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] overflow-y-auto pb-6">
        <div className="px-5 pt-3 space-y-4">
          {hasDiscount ? (
            <>
              <div className="text-center space-y-1">
                <p className="text-[10px] font-body font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Your STRAND discount
                </p>
                <DrawerTitle className="font-display text-[22px] font-semibold leading-tight">
                  {target.proName}
                </DrawerTitle>
              </div>

              {/* The code: always selectable text, never an image. */}
              <div
                className={cn(
                  "rounded-[14px] border-2 border-dashed px-4 py-5 text-center transition-colors",
                  copied
                    ? "border-good bg-good/10"
                    : "border-primary bg-primary/5",
                )}
              >
                <code
                  ref={codeRef}
                  className="select-all font-mono text-[24px] font-semibold uppercase tracking-[0.22em] text-foreground break-all"
                  aria-label={`Discount code ${code.split("").join(" ")}`}
                >
                  {code}
                </code>
                {copied && (
                  <p className="mt-2 flex items-center justify-center gap-1 text-[11.5px] font-body font-semibold text-good">
                    <Check className="size-3.5" aria-hidden="true" />
                    Copied to clipboard
                  </p>
                )}
                {copyFailed && !copied && (
                  <p className="mt-2 text-[11.5px] font-body text-muted-foreground leading-snug">
                    Copying isn't available here. Select the code above and copy it
                    yourself.
                  </p>
                )}
              </div>

              {/* Verbatim professional copy. Never rewritten. */}
              {target.discountDescription?.trim() && (
                <DrawerDescription className="text-[13px] font-body leading-relaxed text-foreground/85 whitespace-pre-wrap text-center">
                  {target.discountDescription.trim()}
                </DrawerDescription>
              )}

              <p aria-live="polite" role="status" className="sr-only">
                {announcement}
              </p>

              {!copied && (
                <Button
                  onClick={copy}
                  className="w-full min-h-[48px] rounded-pill uppercase tracking-[0.08em] text-[11.5px]"
                >
                  <Copy className="size-4 mr-1.5" aria-hidden="true" />
                  Copy code
                </Button>
              )}

              {copyFailed && !copied && !acknowledged && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAcknowledged(true);
                    setAnnouncement("Code noted. You can confirm your appointment.");
                  }}
                  className="w-full min-h-[48px] rounded-pill uppercase tracking-[0.08em] text-[11.5px]"
                >
                  I've noted the code
                </Button>
              )}

              <div className="space-y-1.5">
                <Button
                  onClick={onConfirm}
                  disabled={!canConfirm}
                  variant={copied || acknowledged || timedOut ? "default" : "outline"}
                  aria-describedby="booking-confirm-hint"
                  className="w-full min-h-[48px] rounded-pill uppercase tracking-[0.08em] text-[11.5px]"
                >
                  Confirm appointment
                  <ExternalLink className="size-4 ml-1.5" aria-hidden="true" />
                </Button>
                <p
                  id="booking-confirm-hint"
                  className="text-[11px] font-body text-muted-foreground text-center leading-snug"
                >
                  {canConfirm
                    ? `Opens ${target.proName}'s booking page`
                    : "Copy your discount code first, then this button unlocks."}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="text-center space-y-1">
                <DrawerTitle className="font-display text-[22px] font-semibold leading-tight">
                  {target.proName}
                </DrawerTitle>
                <DrawerDescription className="text-[12.5px] font-body text-muted-foreground">
                  Opens {target.proName}'s booking page
                </DrawerDescription>
              </div>
              <Button
                onClick={onConfirm}
                className="w-full min-h-[48px] rounded-pill uppercase tracking-[0.08em] text-[11.5px]"
              >
                Confirm appointment
                <ExternalLink className="size-4 ml-1.5" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default BookingDepartureSheet;
