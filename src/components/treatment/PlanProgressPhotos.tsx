// PROGRESS PHOTOS — retrospective, and entirely on the member's terms.
//
// Photos used to be reachable only inside a check-in, which meant a photo taken
// on a Tuesday had to wait for the cycle to close before it could be added. That
// takes control away from her for no reason. Media rows allow a null checkin_id,
// so a photo can be attached to the plan itself, any day, including one from the
// camera roll taken weeks ago. Check-in photos still show here too, so the whole
// visual record lives in one place.

import { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import { useSignedMedia } from "@/hooks/useSignedMedia";
import {
  TreatmentMediaError,
  deleteTreatmentMedia,
  prepareCheckinPhoto,
  uploadTreatmentMedia,
  type TreatmentMediaRow,
} from "@/lib/treatmentMedia";

interface Props {
  userId: string;
  planId: string;
  media: TreatmentMediaRow[];
  onChanged: () => void;
  disabled?: boolean;
}

const PlanProgressPhotos = ({ userId, planId, media, onChanged, disabled }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const photos = useMemo(
    () =>
      media
        .filter((m) => m.media_type === "photo")
        .sort((a, b) => b.captured_at.localeCompare(a.captured_at)),
    [media],
  );
  const { urls } = useSignedMedia(photos.map((p) => p.storage_path));

  const pick = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareCheckinPhoto(file);
      await uploadTreatmentMedia({
        userId,
        planId,
        checkinId: null,
        mediaType: "photo",
        file: prepared,
        mimeType: prepared.type,
      });
      onChanged();
      toast.success("Photo added to your progress");
    } catch (e) {
      toast.error(
        e instanceof TreatmentMediaError ? e.message : "That photo didn't save — try again",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: TreatmentMediaRow) => {
    setRemoving(row.id);
    try {
      await deleteTreatmentMedia(row);
      onChanged();
    } catch {
      toast.error("Couldn't remove that photo");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <SurfaceCard className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Camera className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-body text-[10px] uppercase tracking-[0.18em] text-primary">
            Progress photos
          </p>
          <p className="font-display text-[19px] leading-tight mt-0.5">
            Add a photo whenever you have one
          </p>
          <p className="font-body text-[11.5px] text-muted-foreground mt-0.5">
            You don't have to wait for a check-in — anything from your camera roll works.
          </p>
        </div>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="space-y-1">
              <div className="relative aspect-square rounded-[10px] overflow-hidden bg-secondary">
                {urls[p.storage_path] && (
                  <img
                    src={urls[p.storage_path]}
                    alt={`Progress photo from ${format(parseISO(p.captured_at), "d MMM yyyy")}`}
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => void remove(p)}
                    aria-label="Remove photo"
                    className="absolute top-1 right-1 size-6 rounded-full bg-background/85 flex items-center justify-center text-foreground"
                  >
                    {removing === p.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <X className="size-3" />
                    )}
                  </button>
                )}
              </div>
              <p className="font-body text-[9.5px] text-muted-foreground text-center">
                {format(parseISO(p.captured_at), "d MMM")}
              </p>
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-pill border border-primary/60 text-primary font-body text-[13px] font-medium py-2.5 flex items-center justify-center gap-2 hover:bg-primary/10 transition-colors disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Adding…
            </>
          ) : (
            <>
              <ImagePlus className="size-4" />
              {photos.length ? "Add another photo" : "Add a progress photo"}
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          void pick(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </SurfaceCard>
  );
};

export default PlanProgressPhotos;
