import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import { useSignedMedia } from "@/hooks/useSignedMedia";
import {
  MEDIA_RULES,
  TreatmentMediaError,
  deleteTreatmentMedia,
  prepareCheckinPhoto,
  uploadTreatmentMedia,
  type TreatmentMediaRow,
} from "@/lib/treatmentMedia";

interface Props {
  userId: string;
  planId: string;
  checkinId: string | null;
  photos: TreatmentMediaRow[];
  /** Set when this week carries a milestone photo prompt. */
  milestoneId?: string | null;
  onUploaded: (row: TreatmentMediaRow) => void;
  onRemoved: (row: TreatmentMediaRow) => void;
  label?: string;
}

/** Photo capture for a check-in. Multiple allowed, resized before upload. */
const CheckinPhotos = ({
  userId,
  planId,
  checkinId,
  photos,
  milestoneId,
  onUploaded,
  onRemoved,
  label = "Add a photo",
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Rows we've just uploaded, so the tile appears immediately rather than
  // waiting on the refetch — otherwise a good upload looks like a failure.
  const [justAdded, setJustAdded] = useState<TreatmentMediaRow[]>([]);
  const shown = [...photos, ...justAdded.filter((j) => !photos.some((p) => p.id === j.id))];
  const { urls } = useSignedMedia(shown.map((p) => p.storage_path));

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!checkinId) {
      toast.error("This check-in is still opening. Try again in a moment.");
      return;
    }
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      setBusy(list.length > 1 ? `Adding ${i + 1} of ${list.length}…` : "Adding…");
      try {
        const prepared = await prepareCheckinPhoto(list[i]);
        if (prepared.size > MEDIA_RULES.photo.maxBytes) {
          toast.error("That photo is still too large after resizing. Try another one.");
          continue;
        }
        const row = await uploadTreatmentMedia({
          userId,
          planId,
          checkinId,
          milestoneId: milestoneId ?? null,
          mediaType: "photo",
          file: prepared,
          mimeType: prepared.type || "image/jpeg",
        });
        setJustAdded((prev) => [...prev, row]);
        onUploaded(row);
      } catch (e) {
        toast.error(
          e instanceof TreatmentMediaError || e instanceof Error
            ? e.message
            : "We couldn't add that photo just now.",
        );
      }
    }
    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async (row: TreatmentMediaRow) => {
    try {
      await deleteTreatmentMedia(row);
      onRemoved(row);
    } catch {
      toast.error("Couldn't remove that photo just now.");
    }
  };

  return (
    <SurfaceCard className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-[14px] font-semibold">{label}</p>
        <span className="font-body text-[12px] text-muted-foreground">Optional</span>
      </div>

      {shown.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-[10px] overflow-hidden bg-muted">
              {urls[p.storage_path] ? (
                <img
                  src={urls[p.storage_path]}
                  alt="Check-in photo"
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <div className="size-full flex items-center justify-center">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => remove(p)}
                className="absolute top-1 right-1 size-6 rounded-full bg-background/85 border border-border flex items-center justify-center"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        // iPhone photos are HEIC; some pickers grey those out when the accept
        // list is image/* alone, which reads as "it won't let me pick".
        accept="image/*,.heic,.HEIC,.heif,.HEIF"
        multiple
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />
      <button
        type="button"
        disabled={!!busy || !checkinId}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-pill border border-dashed border-border py-2.5 font-body text-[13px] flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        {busy ?? (shown.length ? "Add more photos" : "Take or choose photos")}
      </button>
      <p className="font-body text-[11px] text-muted-foreground text-center">
        You can choose more than one at a time.
      </p>
    </SurfaceCard>
  );
};

export default CheckinPhotos;
