import { useRef, useState } from "react";
import { Film, Loader2, Lock, Trash2, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { useSignedMedia } from "@/hooks/useSignedMedia";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import {
  MEDIA_RULES,
  TreatmentMediaError,
  VIDEO_MAX_SECONDS,
  baseMime,
  deleteTreatmentMedia,
  describeRejection,
  readMediaDuration,
  readVideoDimensions,
  uploadTreatmentMedia,
  type TreatmentMediaRow,
} from "@/lib/treatmentMedia";

interface Props {
  userId: string;
  planId: string;
  checkinId: string | null;
  video: TreatmentMediaRow | null;
  onUploaded: (row: TreatmentMediaRow) => void;
  onRemoved: (row: TreatmentMediaRow) => void;
}

/**
 * One video per check-in — enforced in the database by a partial unique index,
 * and surfaced here so the member sees our wording rather than a raw error.
 * STRAND+ only, using the existing plus-access check.
 */
const CheckinVideo = ({ userId, planId, checkinId, video, onUploaded, onRemoved }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { hasPlus, isLoading } = usePlusAccess();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const { urls } = useSignedMedia(video ? [video.storage_path] : []);

  const resetInputs = () => {
    if (inputRef.current) inputRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const pick = async (file?: File | null) => {
    setProblem(null);
    setHint(null);
    if (!file || !checkinId) return;
    const mime = baseMime(file.type);
    const rejection = describeRejection("video", mime, file.size);
    if (rejection) {
      setProblem(rejection);
      resetInputs();
      return;
    }
    setBusy(true);
    try {
      const seconds = await readMediaDuration(file, "video");
      if (seconds && seconds > VIDEO_MAX_SECONDS + 1) {
        setProblem(
          `That clip runs ${seconds} seconds. Videos here are up to ${VIDEO_MAX_SECONDS} seconds — trim it in your camera roll and choose it again.`,
        );
        setBusy(false);
        resetInputs();
        return;
      }
      const size = await readVideoDimensions(file);
      if (size && size.width > size.height)
        setHint("That one's landscape. Held upright, it fills the timeline properly next time.");
      const row = await uploadTreatmentMedia({
        userId,
        planId,
        checkinId,
        mediaType: "video",
        file,
        mimeType: mime,
        durationSeconds: seconds,
      });
      onUploaded(row);
    } catch (e) {
      setProblem(e instanceof TreatmentMediaError ? e.message : "We couldn't add that clip just now.");
    }
    setBusy(false);
    resetInputs();
  };

  const remove = async () => {
    if (!video) return;
    try {
      await deleteTreatmentMedia(video);
      onRemoved(video);
    } catch {
      toast.error("Couldn't remove that clip just now.");
    }
  };

  if (isLoading) return null;

  if (!hasPlus) {
    return (
      <SurfaceCard tone="gold" className="space-y-2">
        <p className="font-body text-[14px] font-semibold flex items-center gap-1.5">
          <Lock className="size-3.5" /> Video check-ins
        </p>
        <p className="font-body text-[12px] text-muted-foreground leading-snug">
          A short clip shows movement and shrinkage in a way a photo can't. It comes with STRAND+.
        </p>
        <Button variant="outline" className="rounded-pill w-full" onClick={() => navigate("/plus/upgrade")}>
          See what's in STRAND+
        </Button>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="space-y-3">
      <div>
        <p className="font-body text-[14px] font-semibold">Add a short clip</p>
        <p className="font-body text-[12px] text-muted-foreground mt-0.5">
          One per check-in, up to {VIDEO_MAX_SECONDS} seconds. Record it here, or choose one from your
          camera roll. Hold your phone upright so it saves vertical.
        </p>
      </div>

      {video ? (
        <div className="space-y-2">
          {urls[video.storage_path] ? (
            <video
              src={urls[video.storage_path]}
              controls
              playsInline
              className="w-full rounded-[10px] bg-black aspect-[9/16] object-contain"
            />
          ) : (
            <div className="w-full aspect-[9/16] rounded-[10px] bg-muted flex items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          <Button variant="outline" className="rounded-pill w-full" onClick={() => void remove()}>
            <Trash2 className="size-4 mr-1.5" /> Replace this clip
          </Button>
        </div>
      ) : (
        <>
          <input
            ref={cameraRef}
            type="file"
            accept="video/*"
            capture="user"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy || !checkinId}
              onClick={() => cameraRef.current?.click()}
              className="w-full rounded-pill bg-primary text-primary-foreground py-2.5 font-body text-[13px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
              {busy ? "Adding…" : "Record a clip"}
            </button>
            <button
              type="button"
              disabled={busy || !checkinId}
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-pill border border-dashed border-border py-2.5 font-body text-[13px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Film className="size-4" /> Choose from camera roll
            </button>
          </div>
        </>
      )}

      {hint && !problem && (
        <p className="font-body text-[12px] text-muted-foreground leading-snug">{hint}</p>
      )}

      {problem ? (
        <p className="font-body text-[12px] text-muted-foreground leading-snug">{problem}</p>
      ) : (
        <p className="font-body text-[11px] text-muted-foreground">
          Up to {Math.round(MEDIA_RULES.video.maxBytes / (1024 * 1024))} MB.
        </p>
      )}
    </SurfaceCard>
  );
};

export default CheckinVideo;
