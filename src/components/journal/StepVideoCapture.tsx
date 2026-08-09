import { useCallback, useEffect, useRef, useState } from "react";
import { Video, Square, Upload, Loader2, SwitchCamera, RotateCcw, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uuid } from "@/lib/uuid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * In-app video capture for a style-record step.
 *
 * Flow: open the camera (live preview, front/back switch) → record with a
 * visible countdown → review the clip → save or retake.
 *
 * Hard rules:
 *  - 30 second maximum, with a visible countdown and an automatic stop.
 *  - Portrait framing (9:16) requested from the camera and used for preview
 *    and playback so clips read vertically.
 *  - Bitrate ceiling of 1.0 Mbps video + 64 kbps audio, so a full 30 second
 *    clip lands around 4 MB. Anything over MAX_BYTES is refused.
 *
 * iOS Safari: MediaRecorder support varies by version, so we probe
 * `MediaRecorder.isTypeSupported`. When nothing is supported (or getUserMedia
 * is unavailable) the recorder is hidden and the device video picker is the
 * only route offered — that uses the phone's own camera app.
 */

export const MAX_SECONDS = 30;
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

type Facing = "user" | "environment";

interface Props {
  /** Folder under the member's id — keeps each step's clips together. */
  folder: string;
  onUploaded: (media: { storage_path: string; duration_seconds: number | null }) => void;
}

const StepVideoCapture = ({ folder, onUploaded }: Props) => {
  const { user } = useAuth();
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [facing, setFacing] = useState<Facing>("user");
  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState(MAX_SECONDS);
  const [uploading, setUploading] = useState(false);
  const [recorderAvailable, setRecorderAvailable] = useState(false);
  const [review, setReview] = useState<{ url: string; blob: Blob; mime: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const reviewRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRecorderAvailable(canRecordInApp()); }, []);

  const clearTimers = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
  };

  const stopStream = useCallback(() => {
    clearTimers();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => {
    stopStream();
    if (review?.url) URL.revokeObjectURL(review.url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Attaches a live stream to the preview element (which is always mounted
   *  while the camera is on, so the ref is never null here). */
  const attachPreview = async (stream: MediaStream) => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    el.muted = true;
    await el.play().catch(() => undefined);
  };

  const openCamera = async (next: Facing = facing) => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      toast.error("Camera isn't available here — choose a video instead.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: next,
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 9 / 16 },
          frameRate: { ideal: 24, max: 24 },
        },
        audio: true,
      });
      stopStream();
      streamRef.current = stream;
      setFacing(next);
      setCameraOn(true);
      // Wait a frame so the preview element is mounted before attaching.
      window.requestAnimationFrame(() => { void attachPreview(stream); });
    } catch (e) {
      console.error("camera open failed", e);
      toast.error("Couldn't reach the camera — check permissions or choose a video.");
    } finally {
      setStarting(false);
    }
  };

  const closeCamera = () => {
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.onstop = null;
      recRef.current.stop();
    }
    recRef.current = null;
    setRecording(false);
    setRemaining(MAX_SECONDS);
    stopStream();
    setCameraOn(false);
  };

  const flipCamera = () => {
    if (recording) return;
    void openCamera(facing === "user" ? "environment" : "user");
  };

  const upload = async (blob: Blob, mime: string, duration: number | null) => {
    if (!user) { toast.error("Please sign in"); return; }
    if (blob.size > MAX_BYTES) {
      toast.error("That video is too large. Keep it under 30 seconds.");
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
    clearTimers();
    setRecording(false);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    const mime = pickRecorderMimeType();
    if (!stream || !mime) {
      toast.error("Recording isn't supported on this device — choose a video instead.");
      return;
    }
    try {
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
        clearTimers();
        setRemaining(MAX_SECONDS);
        setRecording(false);
        if (!blob.size) {
          toast.error("Nothing was recorded — try choosing a video instead.");
          return;
        }
        stopStream();
        setCameraOn(false);
        setReview({ url: URL.createObjectURL(blob), blob, mime });
      };
      rec.start(1000);
      setRecording(true);
      setRemaining(MAX_SECONDS);
      timerRef.current = window.setInterval(() => {
        setRemaining((r) => (r > 0 ? r - 1 : 0));
      }, 1000);
      stopTimerRef.current = window.setTimeout(stop, MAX_SECONDS * 1000);
    } catch (e) {
      console.error("record start failed", e);
      toast.error("Couldn't start recording — choose a video instead.");
    }
  };

  const discardReview = () => {
    if (review) URL.revokeObjectURL(review.url);
    setReview(null);
  };

  const saveReview = async () => {
    if (!review) return;
    const duration = (await readDuration(review.blob)) ?? null;
    await upload(review.blob, review.mime, duration);
    URL.revokeObjectURL(review.url);
    setReview(null);
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const duration = await readDuration(file);
    if (duration !== null && duration > MAX_SECONDS + 1) {
      toast.error("Videos must be 30 seconds or shorter.");
      return;
    }
    await upload(file, file.type || "video/mp4", duration);
  };

  // ---- Review: watch it back, then save or retake -------------------------
  if (review) {
    return (
      <div className="space-y-2">
        <div className="rounded-[12px] overflow-hidden bg-black">
          <video
            ref={reviewRef}
            src={review.url}
            controls
            playsInline
            className="w-full aspect-[9/16] object-contain bg-black"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="goldGhost" size="sm" className="h-10" onClick={() => { discardReview(); void openCamera(); }} disabled={uploading}>
            <RotateCcw className="size-4 mr-1.5" /> Retake
          </Button>
          <Button type="button" variant="gold" size="sm" className="h-10" onClick={() => void saveReview()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Check className="size-4 mr-1.5" />}
            {uploading ? "Saving…" : "Save video"}
          </Button>
        </div>
        <button
          type="button"
          onClick={discardReview}
          disabled={uploading}
          className="w-full text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-warn py-1"
        >
          Discard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cameraOn && (
        <div className="relative rounded-[12px] overflow-hidden bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full aspect-[9/16] object-cover"
            style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
          />
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
            <span className="rounded-pill bg-background/85 px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {recording ? `${remaining}s left` : `${MAX_SECONDS}s max`}
            </span>
            <div className="flex items-center gap-1.5">
              {!recording && (
                <button
                  type="button"
                  onClick={flipCamera}
                  aria-label="Switch camera"
                  className="size-8 rounded-full bg-background/85 flex items-center justify-center"
                >
                  <SwitchCamera className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={closeCamera}
                aria-label="Close camera"
                className="size-8 rounded-full bg-background/85 flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          {recording && (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-pill bg-background/85 px-2 py-0.5 text-[11px] text-warn">
              <span className="size-2 rounded-full bg-warn animate-pulse" /> Recording
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {recorderAvailable && !cameraOn && (
          <Button
            type="button"
            variant="goldOutline"
            size="sm"
            className="h-10"
            onClick={() => void openCamera()}
            disabled={uploading || starting}
          >
            {starting ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Video className="size-4 mr-1.5" />}
            {starting ? "Opening camera…" : "Record video"}
          </Button>
        )}

        {cameraOn && (
          <Button
            type="button"
            variant={recording ? "destructive" : "gold"}
            size="sm"
            className="h-10"
            onClick={recording ? stop : startRecording}
          >
            {recording ? <Square className="size-4 mr-1.5" /> : <Video className="size-4 mr-1.5" />}
            {recording ? "Stop" : "Start recording"}
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
        Hold your phone upright. 30 seconds maximum — recording stops on its own when time is up,
        and you can watch it back before saving.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => { void onPick(e.target.files?.[0]); e.currentTarget.value = ""; }}
      />
    </div>
  );
};

export default StepVideoCapture;
