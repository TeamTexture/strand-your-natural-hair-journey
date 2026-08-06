// Picker for the Home "Current style" card image.
// Lists the member's progress photos newest first, marks the one in use, and
// always offers a route back to AUTO mode ("Use my most recent photo").

import { Check, ImageOff, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useStyleCardPhoto } from "@/hooks/useStyleCardPhoto";
import { toast } from "sonner";

const fmt = (iso: string | null) => {
  if (!iso) return "Undated";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "Undated";
  }
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional headline override, e.g. the batch-upload prompt. */
  title?: string;
  description?: string;
}

const MainPhotoPicker = ({ open, onOpenChange, title, description }: Props) => {
  const { photos, mainPhotoId, photo, isAuto, setMainPhoto } = useStyleCardPhoto();

  const choose = async (id: string | null) => {
    try {
      await setMainPhoto.mutateAsync(id);
      toast.success(id ? "Main photo updated" : "Back to your most recent photo");
      onOpenChange(false);
    } catch {
      toast.error("Could not update your main photo");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display">{title ?? "Change your main photo"}</SheetTitle>
          <SheetDescription>
            {description ??
              "Pick the progress photo you want on your Current style card, or let it follow your most recent one."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-2">
          <button
            type="button"
            onClick={() => void choose(null)}
            disabled={setMainPhoto.isPending}
            className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left"
          >
            <Sparkles className="size-4 text-primary shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Use my most recent photo</span>
              <span className="block text-xs text-muted-foreground">
                Keeps the card in step with every new progress photo
              </span>
            </span>
            {isAuto && <Check className="size-4 text-primary shrink-0" aria-label="In use" />}
          </button>

          {photos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <ImageOff className="size-6" />
              <p className="text-sm">No progress photos yet — add one to use it here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((p) => {
                const inUse = photo?.id === p.id;
                const pinned = mainPhotoId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void choose(p.id)}
                    disabled={setMainPhoto.isPending}
                    className="space-y-1.5 text-left"
                    aria-label={`Use photo from ${fmt(p.taken_on)}`}
                  >
                    <span
                      className={`relative block aspect-square overflow-hidden rounded-[14px] bg-muted ${
                        inUse ? "ring-2 ring-primary" : ""
                      }`}
                    >
                      {p.url ? (
                        <img
                          src={p.url}
                          alt={`Progress photo from ${fmt(p.taken_on)}`}
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                          <ImageOff className="size-5" />
                        </span>
                      )}
                      {inUse && (
                        <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {fmt(p.taken_on)}
                      {inUse ? (pinned ? " · In use" : " · In use (most recent)") : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <Button variant="outline" size="pill" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MainPhotoPicker;
