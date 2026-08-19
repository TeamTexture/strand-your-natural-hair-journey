import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import FilePickerButton from "@/components/FilePickerButton";
import StarRatingInput from "@/components/StarRatingInput";
import { Camera, ImagePlus, RotateCcw, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealName: string;
  saving?: boolean;
  onSubmit: (rating: number, photo: File | null) => void | Promise<void>;
}

/**
 * Bottom sheet for logging a saved meal she has cooked: optional photo,
 * required 1–5 star rating. The timestamp is stamped by the database and can
 * never be edited from here.
 */
const MealLogSheet = ({ open, onOpenChange, mealName, saving = false, onSubmit }: Props) => {
  const [rating, setRating] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRating(0);
      setPhoto(null);
    }
  }, [open]);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const submit = async () => {
    if (rating < 1) {
      toast.error("Give it a star rating first");
      return;
    }
    await onSubmit(rating, photo);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => (saving ? null : onOpenChange(v))}>
      <SheetContent side="bottom" className="rounded-t-[20px] px-5 pb-7 pt-5">
        <SheetHeader className="text-left space-y-1">
          <SheetTitle className="font-display text-[19px] leading-tight break-words">
            Log this meal
          </SheetTitle>
          <SheetDescription className="text-xs font-body break-words">
            {mealName}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          <div className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
              Photo (optional)
            </p>
            {previewUrl ? (
              <div className="space-y-2">
                <img
                  src={previewUrl}
                  alt="Your meal"
                  className="w-full h-40 object-cover rounded-[12px] border border-border"
                />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"
                >
                  <RotateCcw className="size-3.5" /> Retake
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <FilePickerButton
                  onPick={(f) => setPhoto(f)}
                  preferCamera
                  variant="outline"
                  className="h-auto py-3 rounded-[12px]"
                >
                  <Camera className="size-4 mb-1" />
                  <span className="text-[12px] font-semibold">Take a photo</span>
                </FilePickerButton>
                <FilePickerButton
                  onPick={(f) => setPhoto(f)}
                  variant="outline"
                  className="h-auto py-3 rounded-[12px]"
                >
                  <ImagePlus className="size-4 mb-1" />
                  <span className="text-[12px] font-semibold">From your camera roll</span>
                </FilePickerButton>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
              How was it?
            </p>
            <StarRatingInput value={rating} onChange={setRating} />
          </div>

          <p className="text-[11px] font-body text-muted-foreground leading-relaxed inline-flex items-start gap-1.5">
            <Clock className="size-3.5 shrink-0 mt-[1px]" />
            <span>The date and time are recorded automatically and can't be edited later.</span>
          </p>

          <Button
            onClick={() => void submit()}
            disabled={saving || rating < 1}
            className="w-full rounded-pill"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" /> Saving…
              </>
            ) : (
              "Save cook log"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MealLogSheet;
