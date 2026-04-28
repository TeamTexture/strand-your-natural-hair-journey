// Phase 2 Step 3b — guided dual-photo capture for product scans.
//
// The Claude path on `product-analyse` (audit PHASE_2_AUDIT.md §5 Step 3)
// requires BOTH the front of the product (brand + product name) and the
// back (ingredient panel). This sheet walks the user through Step 1 →
// Step 2 with clear instructions, thumbnails, retake affordance, and a
// Submit button that only enables when both photos are present.
//
// On submit, both files are handed to `useProductScan().startScan`,
// which uploads both to the `product-photos` bucket and routes to
// /products/scanning where the function is invoked with the
// dual-photo body shape: `{ photos: { front, back }, context, force }`.
//
// No "skip the back" / "I only have one" escape hatch — strict by design.

import { useRef, useState, useEffect } from "react";
import { Camera, ImagePlus, RotateCcw, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Slot = "front" | "back";

export interface DualPhotoCaptureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once both photos are captured and the user taps Analyse. */
  onSubmit: (front: File, back: File) => void | Promise<void>;
  /** Whether the parent flow is currently uploading / analysing. Disables submit and prevents close. */
  busy?: boolean;
  /** Prefer the device camera for capture (vs. picking from camera roll). */
  preferCamera?: boolean;
}

const slotPreviewUrl = (file: File | null) =>
  file ? URL.createObjectURL(file) : null;

const DualPhotoCaptureSheet = ({
  open,
  onOpenChange,
  onSubmit,
  busy = false,
  preferCamera = true,
}: DualPhotoCaptureSheetProps) => {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>("front");
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // Reset whenever the sheet closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setFront(null);
      setBack(null);
      setActiveSlot("front");
    }
  }, [open]);

  // Auto-advance from front to back once front is captured.
  useEffect(() => {
    if (front && !back) setActiveSlot("back");
  }, [front, back]);

  const triggerCapture = (slot: Slot) => {
    setActiveSlot(slot);
    (slot === "front" ? frontInputRef : backInputRef).current?.click();
  };

  const handleFile = (slot: Slot) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (slot === "front") setFront(f);
      else setBack(f);
    }
    e.target.value = "";
  };

  const canSubmit = !!front && !!back && !busy;

  const handleSubmit = async () => {
    if (!front || !back) return;
    await onSubmit(front, back);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <SheetContent side="bottom" className="rounded-t-[20px] max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-lg">Scan a product</SheetTitle>
          <SheetDescription className="text-[12px] leading-relaxed">
            STRAND needs <strong className="font-semibold">both sides</strong> of the product to read the brand,
            the full INCI list, and the directions — so the analysis is for the
            real product, not a guess.
          </SheetDescription>
        </SheetHeader>

        {/* Hidden file inputs — one per slot, each scoped so retake replaces only that slot */}
        <input
          ref={frontInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          {...(preferCamera ? { capture: "environment" as const } : {})}
          className="hidden"
          onChange={handleFile("front")}
          data-testid="front-input"
        />
        <input
          ref={backInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          {...(preferCamera ? { capture: "environment" as const } : {})}
          className="hidden"
          onChange={handleFile("back")}
          data-testid="back-input"
        />

        <div className="mt-4 space-y-3">
          <PhotoSlot
            label="Step 1 — Front of the product"
            hint="Brand name, product name, claims."
            slot="front"
            file={front}
            active={activeSlot === "front"}
            done={!!front}
            disabled={busy}
            onCapture={() => triggerCapture("front")}
            onRetake={() => triggerCapture("front")}
          />
          <PhotoSlot
            label="Step 2 — Back of the product"
            hint="The ingredients panel — the small print INCI list."
            slot="back"
            file={back}
            active={activeSlot === "back"}
            done={!!back}
            disabled={busy || !front}
            onCapture={() => triggerCapture("back")}
            onRetake={() => triggerCapture("back")}
          />
        </div>

        <Button
          variant="gold"
          size="pill"
          className="mt-5"
          disabled={!canSubmit}
          onClick={handleSubmit}
          data-testid="submit-btn"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Preparing photos…
            </span>
          ) : front && back ? (
            "Analyse this product"
          ) : (
            "Add both photos to continue"
          )}
        </Button>

        <p className="mt-3 text-[11px] text-muted-foreground text-center leading-snug px-2">
          Both photos are needed so STRAND can match the real INCI list to your hair profile, not just what's on the front.
        </p>
      </SheetContent>
    </Sheet>
  );
};

interface PhotoSlotProps {
  label: string;
  hint: string;
  slot: Slot;
  file: File | null;
  active: boolean;
  done: boolean;
  disabled: boolean;
  onCapture: () => void;
  onRetake: () => void;
}

const PhotoSlot = ({ label, hint, file, active, done, disabled, onCapture, onRetake }: PhotoSlotProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = slotPreviewUrl(file);
    setPreviewUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <div
      className={cn(
        "rounded-[14px] border p-3 transition-colors",
        done
          ? "border-primary/60 bg-primary/5"
          : active
            ? "border-primary bg-card"
            : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail / framing slot */}
        <button
          type="button"
          onClick={onCapture}
          disabled={disabled}
          className={cn(
            "relative shrink-0 size-[88px] rounded-[10px] overflow-hidden border-2 border-dashed flex items-center justify-center bg-secondary/40",
            done ? "border-transparent" : active ? "border-primary/70" : "border-border",
            disabled && "opacity-50",
          )}
          aria-label={done ? `Retake ${label}` : `Capture ${label}`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <Camera className="size-7 text-primary/70" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.12em] text-primary font-medium">
            {label.split(" — ")[0]}
          </p>
          <p className="text-sm font-medium mt-0.5 leading-tight">
            {label.split(" — ")[1] ?? label}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>

          <div className="mt-2 flex gap-2">
            {done ? (
              <button
                type="button"
                onClick={onRetake}
                disabled={disabled}
                className="inline-flex items-center gap-1 text-[11px] text-primary uppercase tracking-[0.1em] font-medium disabled:opacity-50"
              >
                <RotateCcw className="size-3" />
                Retake
              </button>
            ) : (
              <button
                type="button"
                onClick={onCapture}
                disabled={disabled}
                className="inline-flex items-center gap-1 text-[11px] text-primary uppercase tracking-[0.1em] font-medium disabled:opacity-50"
              >
                <ImagePlus className="size-3" />
                {active ? "Capture now" : "Capture"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DualPhotoCaptureSheet;
