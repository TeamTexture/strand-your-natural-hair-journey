import { useEffect, useRef, useState } from "react";
import { Video, Square, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uuid } from "@/lib/uuid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * In-app video capture for a style-record step.
 *
 * Hard rules:
 *  - 60 second maximum, with a visible countdown and an automatic stop.
 *  - Bitrate ceiling of 1.0 Mbps video + 64 kbps audio at 720p/24fps, so a
 *    full 60 second clip lands around 8 MB.
 *  - Anything over MAX_BYTES is refused rather than uploaded.
 *
 * iOS Safari: MediaRecorder support is inconsistent and codec support varies by
 * iOS version. We therefore probe `MediaRecorder.isTypeSupported` for a mime
 * type we can actually store and play back; when nothing is supported (or
 * getUserMedia is unavailable, e.g. in a non-secure context or an in-app
 * webview) the recorder is hidden entirely and the device video picker
 * (`<input type="file" accept="video/*" capture>`) is the only route offered.
 * The picker uses the phone's own camera app, so it always works on iPhone.
 */

export const MAX_SECONDS = 60;
const VIDEO_BITS_PER_SECOND = 1_000_000;
const AUDIO_BITS_PER_SECOND = 64_000;
const MAX_BYTES = 25 * 1024 * 1024;
const BUCKET = "journal-videos";

/** Ordered by preference: mp4/h264 first because iOS produces and plays it. */
const CANDIDATE_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickRecorderMimeType(): string | null {
  const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return null;
  return CANDIDATE_TYPES.find((t) => MR.isTypeSupported(t)) ?? null;
}

export function canRecordInApp(): boolean {
  const hasMedia = !!navigator?.mediaDevices?.getUserMedia;
  return hasMedia && !!pickRecorderMimeType();
}

const extFor = (mime: string) => (mime.includes("mp4") ? "mp4" : "webm");

const readDuration = (file: Blob): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? Math.round(v.duration) : null;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  });

interface Props {
  /** Folder under the member's id — keeps each step's clips together. */
  folder: string;
  onUploaded: (media: { storage_path: string; duration_seconds: number | null }) => void;
}

const StepVideoCapture = ({ folder, onUploaded }: Props) => {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState(MAX_SECONDS);
  const [uploading, setUploading] = useState(false);
  const [recorderAvailable, setRecorderAvailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRecorderAvailable(canRecordInApp()); }, []);

  const cleanup = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => cleanup, []);

  const upload = async (blob: Blob, mime: string, duration: number | null) => {
    if (!user) { toast.error("Please sign in"); return; }
    if (blob.size > MAX_BYTES) {
      toast.error("That video is too large. Keep it under 60 seconds.");
      return;
    }
    setUploading(true);
    const path = `${user.id}/${folder}/${uuid()}.${extFor(mime)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: mime || "video/mp4",
      upsert: false,
    });
    setUploading(false);
    if (error) {
      console.error("video upload failed", error);
      toast.error("Couldn't upload that video");
      return;
    }
    onUploaded({ storage_path: path, duration_seconds: duration });
  };

  const stop = () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setRecording(false);
  };

  const start = async () => {
    const mime = pickRecorderMimeType();
    if (!mime) {
      toast.error("Recording isn't supported on this device — choose a video instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 24, max: 24 }, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => undefined);
      }
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        cleanup();
        setRemaining(MAX_SECONDS);
        if (!blob.size) {
          toast.error("Nothing was recorded — try choosing a video instead.");
          return;
        }
        const duration = (await readDuration(blob)) ?? null;
        await upload(blob, mime, duration);
      };
      rec.start(1000);
      setRecording(true);
      setRemaining(MAX_SECONDS);
      timerRef.current = window.setInterval(() => {
        setRemaining((r) => (r > 0 ? r - 1 : 0));
      }, 1000);
      // Hard automatic stop at the 60 second ceiling.
      stopTimerRef.current = window.setTimeout(stop, MAX_SECONDS * 1000);
    } catch (e) {
      console.error("record start failed", e);
      cleanup();
      toast.error("Couldn't reach the camera — choose a video instead.");
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const duration = await readDuration(file);
    if (duration !== null && duration > MAX_SECONDS + 1) {
      toast.error("Videos must be 60 seconds or shorter.");
      return;
    }
    await upload(file, file.type || "video/mp4", duration);
  };

  return (
    <div className="space-y-2">
      {recording && (
        <div className="relative rounded-[12px] overflow-hidden bg-secondary">
          <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover" />
          <span className="absolute top-2 right-2 rounded-pill bg-background/85 px-2 py-0.5 text-[11px] font-medium tabular-nums">
            {remaining}s left
          </span>
        </div>
      )}

      <div className={cn("grid gap-2", recorderAvailable ? "grid-cols-2" : "grid-cols-1")}>
        {recorderAvailable && (
          <Button
            type="button"
            variant={recording ? "destructive" : "goldOutline"}
            size="sm"
            className="h-10"
            onClick={recording ? stop : start}
            disabled={uploading}
          >
            {recording ? <Square className="size-4 mr-1.5" /> : <Video className="size-4 mr-1.5" />}
            {recording ? "Stop" : "Record video"}
          </Button>
        )}
        <Button
          type="button"
          variant="goldGhost"
          size="sm"
          className="h-10"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || recording}
        >
          {uploading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Upload className="size-4 mr-1.5" />}
          {uploading ? "Uploading…" : "Choose video"}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground leading-snug">
        60 seconds maximum. Recording stops on its own when time is up.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { void onPick(e.target.files?.[0]); e.currentTarget.value = ""; }}
      />
    </div>
  );
};

export default StepVideoCapture;
