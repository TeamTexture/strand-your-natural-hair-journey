import { useCallback, useEffect, useRef, useState } from "react";
import { Video, Square, Upload, Loader2, SwitchCamera, RotateCcw, Check, X, Camera, ZoomIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uuid } from "@/lib/uuid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/**
 * Video capture for a style-record step. Three routes, so a member is never
 * blocked by a browser that can't record in-page:
 *
 *  1. "Open phone camera" — the device's own camera app via a capture input.
 *     Full native controls: zoom, exposure, stabilisation, flash, filters.
 *  2. "Record here" — in-app recorder with front/back switch and zoom
 *     (optical/native track zoom where the camera exposes it, digital crop
 *     otherwise), a visible countdown and an automatic stop.
 *  3. "Choose video" — pick an existing clip from the library.
 *
 * Hard rules:
 *  - 30 second maximum on recorded clips (auto stop) and on picked clips.
 *  - Portrait framing (9:16) for in-app recordings, centre-cropped.
 *  - Size ceiling of MAX_BYTES; native clips are usually well under it.
 */

export const MAX_SECONDS = 30;
const VIDEO_BITS_PER_SECOND = 3_000_000;
const AUDIO_BITS_PER_SECOND = 96_000;
/** Portrait output size — every in-app clip is written at 9:16. */
const OUT_W = 720;
const OUT_H = 1280;
const MAX_BYTES = 60 * 1024 * 1024;
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

const extFor = (mime: string) => {
  if (mime.includes("mp4") || mime.includes("quicktime")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "mp4";
};

const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

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

interface ZoomCaps { min: number; max: number; step: number; native: boolean }

const DEFAULT_ZOOM: ZoomCaps = { min: 1, max: 4, step: 0.1, native: false };

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
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<ZoomCaps>(DEFAULT_ZOOM);

  const videoRef = useRef<HTMLVideoElement>(null);
  const reviewRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  /** Read inside the draw loop, which must not restart on every zoom change. */
  const zoomRef = useRef(1);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => { setRecorderAvailable(canRecordInApp()); }, []);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const clearTimers = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
    rafRef.current = null;
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
    canvasStreamRef.current = null;
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

  /** Reads the camera's zoom range. Falls back to a digital crop range. */
  const readZoomCaps = (stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number; step?: number } };
    if (caps.zoom && typeof caps.zoom.max === "number" && caps.zoom.max > caps.zoom.min) {
      setZoomCaps({
        min: caps.zoom.min,
        max: caps.zoom.max,
        step: caps.zoom.step && caps.zoom.step > 0 ? caps.zoom.step : (caps.zoom.max - caps.zoom.min) / 40,
        native: true,
      });
      setZoom(caps.zoom.min);
      zoomRef.current = 1; // digital crop stays neutral when the camera zooms
      return;
    }
    setZoomCaps(DEFAULT_ZOOM);
    setZoom(1);
    zoomRef.current = 1;
  };

  const applyZoom = (next: number) => {
    const clamped = Math.min(zoomCaps.max, Math.max(zoomCaps.min, next));
    setZoom(clamped);
    if (zoomCaps.native) {
      const track = streamRef.current?.getVideoTracks()[0];
      // Non-standard but widely shipped on Android Chrome.
      const constraints = { advanced: [{ zoom: clamped }] } as unknown as MediaTrackConstraints;
      void track?.applyConstraints(constraints).catch(() => undefined);
      zoomRef.current = 1;
    } else {
      zoomRef.current = clamped;
    }
  };

  const openCamera = async (next: Facing = facing) => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      toast.error("In-page camera isn't available here — use your phone camera instead.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: next,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: 9 / 16 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      });
      stopStream();
      streamRef.current = stream;
      setFacing(next);
      setCameraOn(true);
      readZoomCaps(stream);
      // Wait a frame so the preview element is mounted before attaching.
      window.requestAnimationFrame(() => { void attachPreview(stream); });
    } catch (e) {
      console.error("camera open failed", e);
      toast.error("Couldn't reach the camera — check permissions, or use your phone camera.");
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
    if (!user) { toast.error("Please sign in"); return false; }
    if (!blob.size) { toast.error("That video file is empty — try recording again."); return false; }
    if (blob.size > MAX_BYTES) {
      toast.error(`That video is ${mb(blob.size)} — too large to save. Record a shorter clip.`);
      return false;
    }
    setUploading(true);
    const path = `${user.id}/${folder}/${uuid()}.${extFor(mime)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: mime || "video/mp4",
      upsert: true,
    });
    setUploading(false);
    if (error) {
      console.error("video upload failed", error);
      toast.error(`Couldn't save that video: ${error.message}`);
      return false;
    }
    onUploaded({ storage_path: path, duration_seconds: duration });
    toast.success("Video saved to this step");
    return true;
  };

  const stop = () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    clearTimers();
    setRecording(false);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    const src = videoRef.current;
    const mime = pickRecorderMimeType();
    if (!stream || !src || !mime) {
      toast.error("Recording isn't supported here — use your phone camera instead.");
      return;
    }
    try {
      chunksRef.current = [];

      // Cameras hand us a landscape frame. We paint every frame into a 720x1280
      // portrait canvas (centre-cropped, zoomed, mirrored for the selfie camera)
      // and record THAT, so the saved file is genuinely vertical.
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const mirror = facing === "user";

      const draw = () => {
        const vw = src.videoWidth;
        const vh = src.videoHeight;
        if (vw && vh) {
          const z = zoomRef.current || 1;
          const scale = Math.max(OUT_W / vw, OUT_H / vh) * z;
          const dw = vw * scale;
          const dh = vh * scale;
          const dx = (OUT_W - dw) / 2;
          const dy = (OUT_H - dh) / 2;
          ctx.save();
          if (mirror) {
            ctx.translate(OUT_W, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(src, dx, dy, dw, dh);
          ctx.restore();
        }
        rafRef.current = window.requestAnimationFrame(draw);
      };
      draw();

      // Older Safari lacks canvas.captureStream — fall back to the raw camera.
      let recordStream = stream;
      if (typeof canvas.captureStream === "function") {
        const canvasStream = canvas.captureStream(30);
        stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
        canvasStreamRef.current = canvasStream;
        recordStream = canvasStream;
      }

      const rec = new MediaRecorder(recordStream, {
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
          toast.error("Nothing was recorded — try your phone camera instead.");
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
      toast.error("Couldn't start recording — use your phone camera instead.");
    }
  };

  const discardReview = () => {
    if (review) URL.revokeObjectURL(review.url);
    setReview(null);
  };

  const saveReview = async () => {
    if (!review) return;
    const duration = (await readDuration(review.blob)) ?? null;
    const ok = await upload(review.blob, review.mime, duration);
    if (!ok) return; // keep the clip on screen so the save can be retried
    URL.revokeObjectURL(review.url);
    setReview(null);
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const duration = await readDuration(file);
    if (duration !== null && duration > MAX_SECONDS + 1) {
      toast.error(`That clip is ${duration}s — keep it to ${MAX_SECONDS} seconds or shorter.`);
      return;
    }
    setReview({ url: URL.createObjectURL(file), blob: file, mime: file.type || "video/mp4" });
  };

  // ---- Pinch to zoom on the live preview -----------------------------------
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    pinchRef.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const start = pinchRef.current;
    if (!start || e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = dist / (start.dist || 1);
    applyZoom(start.zoom * ratio);
  };

  const onTouchEnd = () => { pinchRef.current = null; };

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
          <Button type="button" variant="goldGhost" size="sm" className="h-10" onClick={discardReview} disabled={uploading}>
            <RotateCcw className="size-4 mr-1.5" /> Discard
          </Button>
          <Button type="button" variant="gold" size="sm" className="h-10" onClick={() => void saveReview()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Check className="size-4 mr-1.5" />}
            {uploading ? "Saving…" : "Save video"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Watch it back, then save it to this step.
        </p>
      </div>
    );
  }

  const digitalZoom = !zoomCaps.native && cameraOn ? zoom : 1;

  return (
    <div className="space-y-2">
      {cameraOn && (
        <div
          className="relative rounded-[12px] overflow-hidden bg-black touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full aspect-[9/16] object-cover"
            style={{
              transform: `${facing === "user" ? "scaleX(-1)" : ""} scale(${digitalZoom})`.trim(),
              transformOrigin: "center",
            }}
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

          {/* Zoom — pinch on the preview or drag this */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-pill bg-background/85 px-3 py-1.5">
            <ZoomIn className="size-3.5 shrink-0 text-muted-foreground" />
            <Slider
              value={[zoom]}
              min={zoomCaps.min}
              max={zoomCaps.max}
              step={zoomCaps.step}
              onValueChange={(v) => applyZoom(v[0])}
              aria-label="Zoom"
              className="flex-1"
            />
            <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
              {(zoom / (zoomCaps.native ? zoomCaps.min || 1 : 1)).toFixed(1)}x
            </span>
          </div>

          {recording && (
            <span className="absolute bottom-12 left-2 inline-flex items-center gap-1.5 rounded-pill bg-background/85 px-2 py-0.5 text-[11px] text-warn">
              <span className="size-2 rounded-full bg-warn animate-pulse" /> Recording
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {!cameraOn && (
          <Button
            type="button"
            variant="goldOutline"
            size="sm"
            className="h-10"
            onClick={() => nativeRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="size-4 mr-1.5" /> Open phone camera
          </Button>
        )}

        {recorderAvailable && !cameraOn && (
          <Button
            type="button"
            variant="goldGhost"
            size="sm"
            className="h-10"
            onClick={() => void openCamera()}
            disabled={uploading || starting}
          >
            {starting ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Video className="size-4 mr-1.5" />}
            {starting ? "Opening camera…" : "Record here"}
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
        Open phone camera uses your own camera app, with its zoom, exposure and lens options — you'll
        come back here to save the clip. Recording here gives you a countdown, front/back switch and
        pinch-to-zoom. 30 seconds maximum either way.
      </p>

      {/* Native camera app: full device controls */}
      <input
        ref={nativeRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { void onPick(e.target.files?.[0]); e.currentTarget.value = ""; }}
      />
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
