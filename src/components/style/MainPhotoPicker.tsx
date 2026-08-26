// Picker for the Home "Current style" card image.
// Lists the member's progress photos (Strand Summary uploads + milestone
// gallery) newest first, marks the one in use, always offers a route back to
// AUTO mode ("Use my most recent photo"), and lets the member add a new photo
// right here — drag-and-drop on desktop, camera roll / camera on mobile.

import { useRef, useState } from "react";
import { Check, ImageOff, Loader2, Sparkles, Upload } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useStyleCardPhoto } from "@/hooks/useStyleCardPhoto";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
  const { photos, mainPhotoId, photo, isAuto, setMainPhoto, refresh } = useStyleCardPhoto();
  const { user } = useAuth();
  const { upload, uploading } = usePhotoUploader("before-photos");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // A member with no progress photos gets the upload control and nothing else:
  // no "most recent" option, no empty grid, no in-use labels.
  const hasPhotos = photos.length > 0;

  const choose = async (id: string | null) => {
    try {
      await setMainPhoto.mutateAsync(id);
      toast.success(id ? "Main photo updated" : "Back to your most recent photo");
      onOpenChange(false);
    } catch {
      toast.error("Could not update your main photo");
    }
  };

  // New photos land in the Strand Summary progress set, then become the main
  // photo straight away so what the member just picked is what they see.
  const addFiles = async (files: File[]) => {
    if (!user || files.length === 0) return;
    const images = files.filter((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name));
    if (images.length === 0) {
      toast.error("Please choose an image");
      return;
    }
    let lastId: string | null = null;
    for (const file of images) {
      const path = await upload(file);
      if (!path) { toast.error("Upload failed"); continue; }
      const { data, error } = await supabase
        .from("user_before_photos")
        .insert({ user_id: user.id, storage_path: path })
        .select("id")
        .maybeSingle();
      if (error) {
        console.error(error);
        toast.error("Could not save photo");
        continue;
      }
      if (data?.id) lastId = data.id as string;
    }
    if (!lastId) return;
    await refresh();
    try {
      await setMainPhoto.mutateAsync(lastId);
      toast.success("Photo added and set as your main photo");
    } catch {
      toast.success("Photo added");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display">{title ?? "Change your main photo"}</SheetTitle>
          <SheetDescription>
            {description ??
              "Pick the progress photo you want on your Current style card, add a new one, or let it follow your most recent."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-2">
          {/* AUTO mode only means something once there is a photo to follow. */}
          {hasPhotos && (
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
          )}

          {/* Add a photo — tap to open camera roll / camera, or drop a file in. */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(Array.from(e.dataTransfer.files ?? []));
            }}
            className={`rounded-2xl border border-dashed px-4 py-4 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="pill"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="size-4" /> Upload a photo
                </>
              )}
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Take a photo, choose from your camera roll, or drag and drop an image here.
            </p>
          </div>

          {hasPhotos && (
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
